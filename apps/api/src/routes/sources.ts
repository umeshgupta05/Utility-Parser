import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";

export async function registerSourceRoutes(app: FastifyInstance) {
  app.get("/api/sources", async () => {
    const sources = await prisma.source.findMany({
      orderBy: [{ type: "asc" }, { label: "asc" }]
    });

    const [jobCounts, contestCounts] = await Promise.all([
      prisma.job.groupBy({
        by: ["sourceId"],
        where: { isNew: true },
        _count: { _all: true }
      }),
      prisma.contest.groupBy({
        by: ["site"],
        where: { isNew: true },
        _count: { _all: true }
      })
    ]);
    const runs = await prisma.scrapeRun.findMany({
      orderBy: { startedAt: "desc" }
    });

    const newCounts = new Map<string, number>();
    for (const row of jobCounts) newCounts.set(row.sourceId, row._count._all);
    for (const row of contestCounts) {
      newCounts.set(row.site, row._count._all);
    }

    const latestRuns = new Map<string, (typeof runs)[number]>();
    for (const run of runs) {
      const [, taggedSource] = run.status.split(":");
      const sourceId = taggedSource ?? (run.status === "success" || run.status === "error" || run.status === "running" ? "unstop" : null);
      if (sourceId && !latestRuns.has(sourceId)) latestRuns.set(sourceId, run);
    }

    return {
      data: sources.map((source) => ({
        ...source,
        newCount: newCounts.get(source.id) ?? 0,
        lastRun: latestRuns.get(source.id) ?? null
      }))
    };
  });
}
