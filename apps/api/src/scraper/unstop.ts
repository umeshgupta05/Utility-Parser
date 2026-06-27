import { prisma } from "../db/client.js";
import { config, TARGET_PAGE_URL } from "../config.js";
import { notifySource } from "../notifications/email.js";

type UnknownRecord = Record<string, unknown>;

type NormalizedJob = {
  id: string;
  sourceId: string;
  title: string;
  company: string;
  location: string | null;
  jobType: string | null;
  timing: string | null;
  applyUrl: string;
  postedAt: Date | null;
  deadline: Date | null;
  raw: string;
};

type ScrapeResult = {
  jobsFound: number;
  jobsInserted: number;
};

const MAX_RETRIES = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseDate(value: unknown): Date | null {
  const text = asString(value);
  if (!text) return null;
  const normalized = text.includes("T") ? text : text.replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildPageUrl(page: number): string {
  const url = new URL(config.unstopSearchUrl);
  url.searchParams.set("page", String(page));
  return url.toString();
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json,text/plain,*/*",
      Referer: TARGET_PAGE_URL,
      "User-Agent": config.unstopUserAgent
    }
  });

  if (!response.ok) {
    throw new Error(`Unstop API returned ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function fetchJsonWithRetry(url: string): Promise<unknown> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await fetchJson(url);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await sleep(750 * 2 ** (attempt - 1));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unstop API request failed");
}

function extractPage(payload: unknown) {
  const root = asRecord(payload);
  const page = asRecord(root.data);
  const rows = Array.isArray(page.data) ? page.data : [];
  const currentPage = Number(page.current_page ?? 1);
  const lastPage = Number(page.last_page ?? currentPage);
  return { rows, currentPage, lastPage };
}

function normalizeJob(rawValue: unknown): NormalizedJob | null {
  const raw = asRecord(rawValue);
  const id = raw.id == null ? null : String(raw.id);
  const title = asString(raw.title);
  const organisation = asRecord(raw.organisation);
  const company = asString(organisation.name) ?? "Unknown company";
  const jobDetail = asRecord(raw.jobDetail);
  const locations = Array.isArray(jobDetail.locations)
    ? jobDetail.locations.map((item) => asString(item)).filter(Boolean)
    : [];
  const fallbackLocations = Array.isArray(raw.locations)
    ? raw.locations.map((item) => asString(asRecord(item).city)).filter(Boolean)
    : [];
  const uniqueLocations = Array.from(new Set([...locations, ...fallbackLocations].filter(Boolean)));
  const applyUrl =
    asString(raw.seo_url) ??
    (asString(raw.public_url) ? `https://unstop.com/${asString(raw.public_url)}` : null);

  if (!id || !title || !applyUrl) {
    return null;
  }

  return {
    id,
    sourceId: "unstop",
    title,
    company,
    location: uniqueLocations.join(", ") || null,
    jobType: asString(jobDetail.type),
    timing: asString(jobDetail.timing),
    applyUrl,
    postedAt: parseDate(raw.approved_date) ?? parseDate(raw.updated_at),
    deadline: parseDate(raw.end_date) ?? parseDate(asRecord(raw.regnRequirements).end_regn_dt),
    raw: JSON.stringify(rawValue)
  };
}

async function fetchAllJobs(): Promise<NormalizedJob[]> {
  const jobs: NormalizedJob[] = [];
  let page = 1;
  let lastPage = 1;

  do {
    const payload = await fetchJsonWithRetry(buildPageUrl(page));
    const pageData = extractPage(payload);
    lastPage = pageData.lastPage;

    for (const row of pageData.rows) {
      const job = normalizeJob(row);
      if (job) jobs.push(job);
    }

    page = pageData.currentPage + 1;
  } while (page <= lastPage);

  return jobs;
}

export async function runScraper(): Promise<ScrapeResult> {
  const run = await prisma.scrapeRun.create({ data: { status: "running" } });
  const startedAt = Date.now();

  try {
    const jobs = await fetchAllJobs();
    let inserted = 0;
    const insertedJobs: NormalizedJob[] = [];

    for (const job of jobs) {
      const existing = await prisma.job.findUnique({
        where: { id: job.id },
        select: { id: true }
      });

      if (!existing) {
        await prisma.job.create({ data: job });
        inserted += 1;
        insertedJobs.push(job);
      } else {
        await prisma.job.update({
          where: { id: job.id },
          data: {
            title: job.title,
            company: job.company,
            location: job.location,
            jobType: job.jobType,
            timing: job.timing,
            applyUrl: job.applyUrl,
            postedAt: job.postedAt,
            deadline: job.deadline,
            raw: job.raw
          }
        });
      }
    }

    await prisma.scrapeRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        endedAt: new Date(),
        jobsFound: jobs.length,
        jobsInserted: inserted
      }
    });

    console.log(
      `Scrape complete: ${jobs.length} jobs found, ${inserted} inserted in ${Date.now() - startedAt}ms`
    );

    if (insertedJobs.length > 0) {
      await notifySource("unstop", {
        sourceId: "unstop",
        title: "New on Unstop",
        body:
          insertedJobs.length === 1
            ? `${insertedJobs[0].title} at ${insertedJobs[0].company}`
            : `${insertedJobs.length} new jobs`,
        url: insertedJobs[0].applyUrl
      });
    }

    return { jobsFound: jobs.length, jobsInserted: inserted };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown scraper error";

    await prisma.scrapeRun.update({
      where: { id: run.id },
      data: {
        status: "error",
        endedAt: new Date(),
        errorMessage: message
      }
    });

    console.error("Scrape failed:", message);
    throw error;
  }
}
