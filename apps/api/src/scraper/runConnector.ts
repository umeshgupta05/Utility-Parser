import type { Connector, NormalizedItem } from "./connectors/types.js";
import { prisma } from "../db/client.js";
import { notifySource } from "../notifications/email.js";

type ConnectorRunResult = {
  sourceId: string;
  jobsFound: number;
  jobsInserted: number;
};

function firstNotificationBody(item: NormalizedItem, kind: Connector["kind"]) {
  if (kind === "CONTEST" && item.startTime) {
    return `${item.title} starts ${new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
      Math.round((item.startTime.getTime() - Date.now()) / 3_600_000),
      "hour"
    )}`;
  }

  return item.company ? `${item.title} at ${item.company}` : item.title;
}

async function upsertJob(sourceId: string, item: NormalizedItem) {
  const existing = await prisma.job.findUnique({ where: { id: item.id }, select: { id: true } });
  const data = {
    id: item.id,
    sourceId,
    title: item.title,
    company: item.company ?? "Unknown company",
    location: item.location ?? null,
    jobType: item.jobType ?? null,
    timing: item.timing ?? null,
    applyUrl: item.url,
    postedAt: item.postedAt ?? null,
    deadline: item.deadline ?? null,
    raw: JSON.stringify(item.raw)
  };

  if (!existing) {
    await prisma.job.create({ data });
    return true;
  }

  await prisma.job.update({ where: { id: item.id }, data });
  return false;
}

async function upsertContest(item: NormalizedItem) {
  if (!item.site || !item.startTime) {
    return false;
  }

  const existing = await prisma.contest.findUnique({ where: { id: item.id }, select: { id: true } });
  const data = {
    id: item.id,
    site: item.site,
    name: item.title,
    url: item.url,
    startTime: item.startTime,
    durationSec: item.durationSec ?? 0,
    raw: JSON.stringify(item.raw)
  };

  if (!existing) {
    await prisma.contest.create({ data });
    return true;
  }

  await prisma.contest.update({ where: { id: item.id }, data });
  return false;
}

async function pruneMissingItems(connector: Connector, items: NormalizedItem[]) {
  if (!connector.pruneMissing) return 0;
  if (items.length === 0) return 0;

  const existingCount =
    connector.kind === "JOB"
      ? await prisma.job.count({ where: { sourceId: connector.sourceId } })
      : await prisma.contest.count({ where: { site: connector.sourceId } });

  if (existingCount > 5 && items.length < existingCount * 0.3) {
    console.warn(
      `${connector.sourceId}: skipping prune - only ${items.length} of ${existingCount} existing rows returned, likely a partial fetch`
    );
    return 0;
  }

  const ids = items.map((item) => item.id);

  if (connector.kind === "JOB") {
    const result = await prisma.job.deleteMany({
      where: {
        sourceId: connector.sourceId,
        id: { notIn: ids }
      }
    });
    return result.count;
  }

  const result = await prisma.contest.deleteMany({
    where: {
      site: connector.sourceId,
      id: { notIn: ids }
    }
  });
  return result.count;
}

export async function runConnector(connector: Connector): Promise<ConnectorRunResult> {
  const source = await prisma.source.findUnique({ where: { id: connector.sourceId } });
  if (source && !source.enabled) {
    return { sourceId: connector.sourceId, jobsFound: 0, jobsInserted: 0 };
  }

  const run = await prisma.scrapeRun.create({ data: { status: `running:${connector.sourceId}` } });

  try {
    const items = await connector.fetchItems();
    const prunedCount = await pruneMissingItems(connector, items);
    const insertedItems: NormalizedItem[] = [];

    for (const item of items) {
      const inserted =
        connector.kind === "JOB"
          ? await upsertJob(connector.sourceId, item)
          : await upsertContest(item);
      if (inserted) insertedItems.push(item);
    }

    await prisma.scrapeRun.update({
      where: { id: run.id },
      data: {
        status: `success:${connector.sourceId}`,
        endedAt: new Date(),
        jobsFound: items.length,
        jobsInserted: insertedItems.length
      }
    });

    if (insertedItems.length > 0) {
      const first = insertedItems[0];
      await notifySource(connector.sourceId, {
        sourceId: connector.sourceId,
        title: `New on ${connector.label}`,
        body:
          insertedItems.length === 1
            ? firstNotificationBody(first, connector.kind)
            : `${insertedItems.length} new ${connector.kind === "JOB" ? "jobs" : "contests"}`,
        url: first.url
      });
    }

    console.log(
      `${connector.sourceId}: ${items.length} found, ${insertedItems.length} inserted, ${prunedCount} pruned`
    );

    return {
      sourceId: connector.sourceId,
      jobsFound: items.length,
      jobsInserted: insertedItems.length
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connector error";
    await prisma.scrapeRun.update({
      where: { id: run.id },
      data: {
        status: `error:${connector.sourceId}`,
        endedAt: new Date(),
        errorMessage: message
      }
    });
    console.error(`${connector.sourceId} failed:`, message);
    return { sourceId: connector.sourceId, jobsFound: 0, jobsInserted: 0 };
  }
}
