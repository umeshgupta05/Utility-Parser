import { createClient } from "jsr:@supabase/supabase-js@2";

type Kind = "JOB" | "CONTEST";

type Item = {
  id: string;
  title: string;
  url: string;
  raw: unknown;
  company?: string;
  location?: string | null;
  jobType?: string | null;
  timing?: string | null;
  postedAt?: Date | null;
  deadline?: Date | null;
  site?: string;
  startTime?: Date;
  durationSec?: number;
};

type Source = {
  label: string;
  id: string;
  kind: Kind;
  prune?: boolean;
  fetchItems(): Promise<Item[]>;
};

const userAgent = Deno.env.get("UNSTOP_USER_AGENT") ?? "UtilityParser-UnstopJobAgent/0.1 (+supabase edge)";
const env = (name: string, fallback = "") => {
  const value = Deno.env.get(name);
  return value && value.trim() ? value : fallback;
};
const unstopSearchUrl = env(
  "UNSTOP_SEARCH_URL",
  "https://unstop.com/api/public/opportunity/search-result?opportunity=jobs&job_type=in_office&job_timing=full_time&roles=software-development&usertype=fresher&oppstatus=open&page=1"
);
const unstopFeaturedUrl =
  env("UNSTOP_FEATURED_URL", "https://unstop.com/api/public/opportunity/featured-opportunities");
const myCareerNetBaseUrl = env("MYCAREERNET_BASE_URL", "https://mycareernet.co");
const myCareerNetTenantAlias = env("MYCAREERNET_TENANT_ALIAS", "mycareernet");
const myCareerNetTenantConfigUrl =
  env("MYCAREERNET_TENANT_CONFIG_URL", "https://mycareernet.co/py/common/get_oauth_and_captcha_config/");
const myCareerNetContestsUrl =
  env("MYCAREERNET_CONTESTS_URL", "https://mycareernet.co/py/crpo/hackathon/candidate/api/v1/getAll/");
const myCareerNetJobsUrl = env("MYCAREERNET_JOBS_URL");
const hackerEarthChallengesUrl =
  env("HACKEREARTH_CHALLENGES_URL", "https://www.hackerearth.com/api/community/challenges/compete/");
const hackerEarthJobUrls = [
  env("HACKEREARTH_JOBS_URL", "https://www.hackerearth.com/api/community/job/opportunities/?page=1&size=25&country=IN"),
  "https://www.hackerearth.com/api/community/job/opportunities/?page=1&size=25&country=IN&location=India",
  "https://www.hackerearth.com/api/community/job/opportunities/?country=IN&page=1&size=1",
  "https://www.hackerearth.com/api/community/job/opportunities/?page=1&size=25&country=IN&currency=INR"
];

function db() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function sendEmail(to: string, subject: string, text: string, url?: string) {
  const resendApiKey = env("RESEND_API_KEY");
  if (!resendApiKey) {
    console.warn(`Email skipped for ${to}: RESEND_API_KEY is not configured.`);
    return;
  }

  const link = url ? `<p><a href="${escapeHtml(url)}" style="color:#2f5d50;font-weight:700;">Open opportunity</a></p>` : "";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env("RESEND_FROM_EMAIL", "Opportunity Departures <onboarding@resend.dev>"),
      to,
      subject,
      text: url ? `${text}\n\n${url}` : text,
      html: `
        <div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#1c2b3a;">
          <h2 style="font-family:Georgia,serif;margin:0 0 12px;">${escapeHtml(subject)}</h2>
          <p>${escapeHtml(text)}</p>
          ${link}
        </div>
      `
    })
  });
  if (!response.ok) throw new Error(`Resend returned ${response.status}: ${await response.text()}`);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseDate(value: unknown): Date | null {
  const text = asString(value);
  if (!text) return null;
  const date = new Date(text.includes("T") ? text : text.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
}

async function json(url: string, init: RequestInit = {}, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`${url} returned ${res.status} ${res.statusText}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

function findRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const root = asRecord(payload);
  for (const key of ["data", "jobs", "results", "items", "list", "hackthons", "hackathons"]) {
    const value = root[key];
    if (Array.isArray(value)) return value;
    const nested = asRecord(value);
    if (Array.isArray(nested.data)) return nested.data;
    if (Array.isArray(nested.jobs)) return nested.jobs;
  }
  return [];
}

function toJobRow(item: Item, sourceId: string) {
  return {
    id: item.id,
    source_id: sourceId,
    title: item.title,
    company: item.company ?? "Unknown company",
    location: item.location ?? null,
    job_type: item.jobType ?? null,
    timing: item.timing ?? null,
    apply_url: item.url,
    posted_at: item.postedAt?.toISOString() ?? null,
    deadline: item.deadline?.toISOString() ?? null,
    raw: item.raw
  };
}

function toContestRow(item: Item) {
  return {
    id: item.id,
    site: item.site!,
    name: item.title,
    url: item.url,
    start_time: item.startTime!.toISOString(),
    duration_sec: item.durationSec ?? 0,
    raw: item.raw
  };
}

async function logRun(sourceId: string, status: string, found = 0, inserted = 0, error?: string) {
  await db().from("scrape_run").insert({
    source_id: sourceId,
    status,
    ended_at: new Date().toISOString(),
    jobs_found: found,
    jobs_inserted: inserted,
    error_message: error ?? null
  });
}

async function notifySource(source: Source, insertedItems: Item[]) {
  if (insertedItems.length === 0) return;
  const client = db();
  const { data: preferences, error } = await client
    .from("user_source_preference")
    .select("user_id")
    .eq("source_id", source.id)
    .eq("email_enabled", true);
  if (error) throw error;

  const first = insertedItems[0];
  const subject = `New on ${source.label}`;
  const body = insertedItems.length === 1
    ? source.kind === "JOB" && first.company
      ? `${first.title} at ${first.company}`
      : first.title
    : `${insertedItems.length} new ${source.kind === "JOB" ? "jobs" : "contests"}`;

  for (const preference of preferences ?? []) {
    const user = await client.auth.admin.getUserById(preference.user_id);
    const email = user.data.user?.email;
    if (email) await sendEmail(email, subject, body, first.url);
  }
}

export async function runSource(source: Source) {
  try {
    const items = await source.fetchItems();
    const client = db();
    const rpc = source.kind === "JOB" ? "upsert_job_items" : "upsert_contest_items";
    const rows = source.kind === "JOB" ? items.map((item) => toJobRow(item, source.id)) : items.map(toContestRow);
    const { data, error } = await client.rpc(rpc, { items: rows });
    if (error) throw error;

    const inserted = Number(data?.[0]?.inserted ?? 0);
    let pruned = 0;
    if (source.prune && items.length > 0) {
      const pruneRpc = source.kind === "JOB" ? "prune_source_jobs" : "prune_source_contests";
      const { data: pruneData, error: pruneError } = await client.rpc(pruneRpc, {
        source: source.id,
        keep_ids: items.map((item) => item.id)
      });
      if (pruneError) throw pruneError;
      pruned = Number(pruneData ?? 0);
    }

    await logRun(source.id, `success:${source.id}`, items.length, inserted);
    await notifySource(source, items.slice(0, inserted));
    return response({ sourceId: source.id, found: items.length, inserted, pruned });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await logRun(source.id, `error:${source.id}`, 0, 0, message);
    return response({ sourceId: source.id, error: message }, 500);
  }
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function normalizeJob(row: unknown, sourceId: string, fallbackCompany: string): Item | null {
  const record = asRecord(row);
  const id = asString(record.id) ?? asString(record.uuid) ?? asString(record.slug) ?? asString(record.url);
  const title = asString(record.title) ?? asString(record.jobTitle) ?? asString(record.name);
  const url = asString(record.url) ?? asString(record.applyUrl) ?? asString(record.job_url) ?? asString(record.link);
  if (!id || !title || !url) return null;
  const companyRecord = asRecord(record.company ?? record.organization ?? record.organisation);
  return {
    id: `${sourceId}:${id}`,
    title,
    url: url.startsWith("http") ? url : `https://${sourceId === "mycareernet" ? "mycareernet.co" : "hackerearth.com"}${url}`,
    company: asString(record.companyName) ?? asString(record.company_name) ?? asString(companyRecord.name) ?? asString(record.company) ?? fallbackCompany,
    location: asString(record.location) ?? asString(record.city),
    jobType: asString(record.jobType) ?? asString(record.job_type) ?? asString(record.type),
    timing: asString(record.timing) ?? asString(record.employmentType) ?? asString(record.job_type),
    postedAt: parseDate(record.postedAt ?? record.posted_date ?? record.createdAt ?? record.published_at),
    deadline: parseDate(record.deadline ?? record.job_valid_till ?? record.endDate ?? record.validTill),
    raw: row
  };
}

function myCareerNetTitle(rawTitle: string) {
  const replacements: Record<string, string> = {
    "Flipkart GRiD 7.0-": "Flipkart GRiD 7.0",
    "Flipkart WiRED 9.0-": "Flipkart WiRED 9.0",
    "Vidyarthini 4.0-": "Vidyarthini 4.0",
    "Hacksplosion2026a": "Hacksplosion 2026",
    "HackVega 2.0-": "HackVega 2.0",
    "EngineeredX 2.O": "EngineeredX 2.0"
  };
  return replacements[rawTitle] ?? rawTitle.replace(/\s+-\s*$/, "").trim();
}

async function postJson(endpoint: string, body: unknown, headers: Record<string, string> = {}) {
  return json(
    endpoint,
    {
      method: "POST",
      headers: {
        Accept: "application/json,text/plain,*/*",
        "Content-Type": "application/json",
        Origin: myCareerNetBaseUrl,
        Referer: `${myCareerNetBaseUrl}/${myCareerNetTenantAlias}/contests`,
        "User-Agent": userAgent,
        ...headers
      },
      body: JSON.stringify(body)
    },
    15_000
  );
}

async function fetchMyCareerNetBearerToken() {
  const tenantConfig = asRecord(
    await postJson(
      myCareerNetTenantConfigUrl,
      { tenantAlias: myCareerNetTenantAlias, appName: "Hackathon" },
      { ignoreToken: "true" }
    )
  );
  const oauthDetails = asRecord(tenantConfig.oauthDetails);
  const integrationGuid = asString(oauthDetails.oAuthIntegrationGuid);
  const clientId = asString(oauthDetails.oAuthClientId);
  if (!integrationGuid || !clientId) throw new Error("MyCareerNet OAuth details were missing from tenant config.");

  const tokenPayload = asRecord(
    await postJson(`${myCareerNetBaseUrl}/py/oauth2/${integrationGuid}/access_token/`, { client_id: clientId }, { ignoreToken: "true" })
  );
  const accessToken = asString(tokenPayload.access_token);
  if (!accessToken) throw new Error("MyCareerNet access token response did not include access_token.");
  return accessToken;
}

async function fetchMyCareerNetContests() {
  const token = await fetchMyCareerNetBearerToken();
  const firstPage = asRecord(
    await postJson(
      myCareerNetContestsUrl,
      { pagingCriteria: { pageNumber: 1, maxResults: 100 }, search: {} },
      { Authorization: `bearer ${token}` }
    )
  );
  const totalPages = asNumber(firstPage.totalPages) ?? 1;
  const rows = [...findRows(asRecord(firstPage.data).hackthons)];

  for (let page = 2; page <= totalPages; page += 1) {
    const payload = asRecord(
      await postJson(
        myCareerNetContestsUrl,
        { pagingCriteria: { pageNumber: page, maxResults: 100 }, search: {} },
        { Authorization: `bearer ${token}` }
      )
    );
    rows.push(...findRows(asRecord(payload.data).hackthons));
  }

  return rows;
}

function normalizeMyCareerNetContest(row: unknown): Item | null {
  const record = asRecord(row);
  const slug = asString(record.slug);
  const name = asString(record.name);
  if (!slug || !name) return null;
  const timeline = (asString(record.timeLine) ?? "").toLowerCase();
  if (timeline === "ended") return null;
  const locations = Array.isArray(record.locations)
    ? record.locations.map((location) => asString(location)).filter((location): location is string => Boolean(location))
    : [];
  const category = asString(record.category) ?? "Contest";
  const mode = asString(record.mode);
  return {
    id: `mycareernet:contest:${slug}`,
    title: myCareerNetTitle(name),
    url: `${myCareerNetBaseUrl}/${myCareerNetTenantAlias}/contests/${slug}`,
    company: asString(record.company) ?? "MyCareerNet",
    location: locations.length > 0 ? locations.join(", ") : mode ?? "Online",
    jobType: `Contest: ${category}`,
    timing: timeline ? timeline[0].toUpperCase() + timeline.slice(1) : mode,
    postedAt: parseDate(record.startDateTime),
    deadline: parseDate(record.endDateTime),
    raw: { ...record, normalized_kind: "mycareernet_contest" }
  };
}

export const sources: Record<string, Source> = {
  codeforces: {
    label: "Codeforces",
    id: "codeforces",
    kind: "CONTEST",
    async fetchItems() {
      const payload = asRecord(await json("https://codeforces.com/api/contest.list", { headers: { Accept: "application/json" } }));
      const rows = Array.isArray(payload.result) ? payload.result : [];
      return rows.filter((row) => {
        const record = asRecord(row);
        return record.phase === "BEFORE" || record.phase === "CODING";
      }).map((row) => {
        const record = asRecord(row);
        const id = String(record.id);
        const startSeconds = asNumber(record.startTimeSeconds) ?? Math.floor(Date.now() / 1000);
        return {
          id: `codeforces:${id}`,
          title: asString(record.name) ?? "Codeforces Contest",
          site: "codeforces",
          url: `https://codeforces.com/contest/${id}`,
          startTime: new Date(startSeconds * 1000),
          durationSec: asNumber(record.durationSeconds) ?? 0,
          raw: row
        };
      });
    }
  },
  codechef: {
    label: "CodeChef",
    id: "codechef",
    kind: "CONTEST",
    async fetchItems() {
      const payload = asRecord(await json("https://www.codechef.com/api/list/contests/all?sort_by=START&sorting_order=asc&offset=0&mode=all", {
        headers: { Accept: "application/json", "User-Agent": userAgent }
      }));
      const rows = [...(Array.isArray(payload.present_contests) ? payload.present_contests : []), ...(Array.isArray(payload.future_contests) ? payload.future_contests : [])];
      return rows.map((row) => {
        const record = asRecord(row);
        const code = asString(record.contest_code);
        const title = asString(record.contest_name);
        const startTime = parseDate(record.contest_start_date_iso);
        if (!code || !title || !startTime) return null;
        return { id: `codechef:${code}`, title, site: "codechef", url: `https://www.codechef.com/${code}`, startTime, durationSec: Math.round((asNumber(record.contest_duration) ?? 0) * 60), raw: { site: "codechef", ...record } };
      }).filter((item): item is Item => Boolean(item));
    }
  },
  leetcode: {
    label: "LeetCode",
    id: "leetcode",
    kind: "CONTEST",
    async fetchItems() {
      const payload = asRecord(await json("https://leetcode.com/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "query contestList { allContests { title titleSlug startTime duration } }" })
      }));
      const rows = Array.isArray(asRecord(payload.data).allContests) ? asRecord(payload.data).allContests as unknown[] : [];
      const now = Date.now();
      return rows.map((row) => {
        const record = asRecord(row);
        const start = (asNumber(record.startTime) ?? 0) * 1000;
        const durationSec = asNumber(record.duration) ?? 0;
        const slug = asString(record.titleSlug) ?? asString(record.title) ?? "contest";
        return { id: `leetcode:${slug}`, title: asString(record.title) ?? "LeetCode Contest", site: "leetcode", url: `https://leetcode.com/contest/${slug}`, startTime: new Date(start), durationSec, raw: record };
      }).filter((item) => item.startTime.getTime() + item.durationSec * 1000 >= now);
    }
  },
  atcoder: {
    label: "AtCoder",
    id: "atcoder",
    kind: "CONTEST",
    async fetchItems() {
      const res = await fetch("https://atcoder.jp/contests/?lang=en", { headers: { Accept: "text/html", "User-Agent": userAgent } });
      if (!res.ok) throw new Error(`AtCoder returned ${res.status}`);
      const html = await res.text();
      const rows = [...html.matchAll(/<tr>\s*<td class="text-center">[\s\S]*?<time class='fixtime fixtime-full'>([^<]+)<\/time>[\s\S]*?<td[^>]*>[\s\S]*?<a href="([^"]+)">([^<]+)<\/a>[\s\S]*?<td class="text-center">([^<]+)<\/td>/g)];
      return rows.map((match) => {
        const startTime = new Date((match[1] ?? "").trim().replace(" ", "T"));
        const href = (match[2] ?? "").trim();
        const title = (match[3] ?? "").replaceAll("&amp;", "&").trim();
        const parts = (match[4] ?? "").split(":").map(Number);
        const durationSec = parts.length === 2 ? parts[0] * 3600 + parts[1] * 60 : parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : 0;
        return { id: `atcoder:${href.split("/").filter(Boolean).pop() ?? href}`, title, site: "atcoder", url: href.startsWith("http") ? href : `https://atcoder.jp${href}`, startTime, durationSec, raw: { site: "atcoder", href, duration: match[4] } };
      }).filter((item) => item.title && !Number.isNaN(item.startTime.getTime()) && item.startTime.getTime() + item.durationSec * 1000 >= Date.now());
    }
  },
  hackerearth_jobs: {
    label: "HackerEarth Jobs",
    id: "hackerearth_jobs",
    kind: "JOB",
    prune: true,
    async fetchItems() {
      for (const endpoint of Array.from(new Set(hackerEarthJobUrls))) {
        const rows = findRows(await json(endpoint, { headers: { Accept: "application/json,text/plain,*/*", "Accept-Language": "en-IN,en;q=0.9", Referer: "https://www.hackerearth.com/jobs/", "User-Agent": userAgent } }));
        const jobs = rows.map((row) => {
          const country = asString(asRecord(row).country);
          return country && country.toUpperCase() !== "IN" ? null : normalizeJob(row, "hackerearth_jobs", "HackerEarth");
        }).filter((job): job is Item => Boolean(job));
        console.log(`hackerearth_jobs: endpoint=${endpoint} rawRows=${rows.length} afterCountryFilter=${jobs.length}`);
        if (jobs.length > 0) return jobs;
      }
      return [];
    }
  },
  hackerearth_challenges: {
    label: "HackerEarth Challenges",
    id: "hackerearth_challenges",
    kind: "CONTEST",
    prune: true,
    async fetchItems() {
      return findRows(await json(hackerEarthChallengesUrl, { headers: { Accept: "application/json,text/plain,*/*", Referer: "https://www.hackerearth.com/challenges/", "User-Agent": userAgent } })).map((row) => {
        const record = asRecord(row);
        const slug = asString(record.slug);
        const title = asString(record.title);
        const url = asString(record.url);
        const startTime = parseDate(record.start ?? record.start_str);
        const end = parseDate(record.end ?? record.end_str);
        if (!slug || !title || !url || !startTime || (end && end.getTime() < Date.now())) return null;
        return { id: `hackerearth_challenges:${slug}`, title, site: "hackerearth_challenges", url: url.startsWith("http") ? url : `https://www.hackerearth.com${url}`, startTime, durationSec: end ? Math.max(0, Math.round((end.getTime() - startTime.getTime()) / 1000)) : 0, raw: row };
      }).filter((item): item is Item => Boolean(item));
    }
  },
  mycareernet: {
    label: "MyCareerNet",
    id: "mycareernet",
    kind: "JOB",
    async fetchItems() {
      const [jobRows, contestRows] = await Promise.all([
        myCareerNetJobsUrl ? findRows(await json(myCareerNetJobsUrl, { headers: { Accept: "application/json", "User-Agent": userAgent } })) : Promise.resolve([]),
        fetchMyCareerNetContests()
      ]);
      const jobs = jobRows.map((row) => normalizeJob(row, "mycareernet", "MyCareerNet")).filter((job): job is Item => Boolean(job));
      const contests = contestRows.map((row) => normalizeMyCareerNetContest(row)).filter((job): job is Item => Boolean(job));
      return [...jobs, ...contests];
    }
  },
  unstop_featured: {
    label: "Unstop Featured",
    id: "unstop_featured",
    kind: "CONTEST",
    async fetchItems() {
      return findRows(await json(unstopFeaturedUrl, { headers: { Accept: "application/json,text/plain,*/*", Referer: "https://unstop.com/", "User-Agent": userAgent } })).map((row) => {
        const record = asRecord(row);
        const id = asString(record.featured_id) ?? asString(record.id) ?? (record.id == null ? null : String(record.id));
        const title = asString(record.featured_title) ?? asString(record.title) ?? asString(record.name);
        const publicUrl = asString(record.public_url);
        const url = asString(record.url) ?? (publicUrl ? `https://unstop.com/${publicUrl.replace(/^\/+/, "")}` : null);
        const startTime = parseDate(record.start_date) ?? parseDate(asRecord(record.regnRequirements).start_regn_dt) ?? new Date();
        const end = parseDate(record.end_date) ?? parseDate(asRecord(record.regnRequirements).end_regn_dt);
        if (!id || !title || !url) return null;
        return { id: `unstop_featured:${id}`, title, site: "unstop_featured", url: url.startsWith("http") ? url : `https://${url.replace(/^\/+/, "")}`, startTime, durationSec: end ? Math.max(0, Math.round((end.getTime() - startTime.getTime()) / 1000)) : 0, raw: row };
      }).filter((item): item is Item => Boolean(item));
    }
  },
  unstop: {
    label: "Unstop",
    id: "unstop",
    kind: "JOB",
    async fetchItems() {
      const jobs: Item[] = [];
      let page = 1;
      let lastPage = 1;
      do {
        const url = new URL(unstopSearchUrl);
        url.searchParams.set("page", String(page));
        const payload = asRecord(await json(url.toString(), { headers: { Accept: "application/json,text/plain,*/*", Referer: "https://unstop.com/jobs", "User-Agent": userAgent } }));
        const data = asRecord(payload.data);
        const rows = Array.isArray(data.data) ? data.data : [];
        lastPage = Number(data.last_page ?? page);
        for (const raw of rows) {
          const record = asRecord(raw);
          const id = record.id == null ? null : String(record.id);
          const title = asString(record.title);
          const organisation = asRecord(record.organisation);
          const detail = asRecord(record.jobDetail);
          const applyUrl = asString(record.seo_url) ?? (asString(record.public_url) ? `https://unstop.com/${asString(record.public_url)}` : null);
          if (!id || !title || !applyUrl) continue;
          jobs.push({ id, title, company: asString(organisation.name) ?? "Unknown company", location: Array.isArray(detail.locations) ? detail.locations.map(asString).filter(Boolean).join(", ") : null, jobType: asString(detail.type), timing: asString(detail.timing), url: applyUrl, postedAt: parseDate(record.approved_date) ?? parseDate(record.updated_at), deadline: parseDate(record.end_date) ?? parseDate(asRecord(record.regnRequirements).end_regn_dt), raw });
        }
        page += 1;
      } while (page <= lastPage);
      return jobs;
    }
  }
};

export function serveSource(sourceId: string) {
  Deno.serve(() => runSource(sources[sourceId]));
}
