import { config } from "../../config.js";
import type { Connector, NormalizedItem } from "./types.js";
import { asNumber, asRecord, asString, fetchJsonWithTimeout, parseDate } from "./helpers.js";

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

function normalizeJob(row: unknown, sourceId: string, fallbackCompany: string): NormalizedItem | null {
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
    company:
      asString(record.companyName) ??
      asString(record.company_name) ??
      asString(companyRecord.name) ??
      asString(record.company) ??
      fallbackCompany,
    location: asString(record.location) ?? asString(record.city),
    jobType: asString(record.jobType) ?? asString(record.job_type) ?? asString(record.type),
    timing: asString(record.timing) ?? asString(record.employmentType) ?? asString(record.job_type),
    postedAt: parseDate(record.postedAt ?? record.posted_date ?? record.createdAt ?? record.published_at),
    deadline: parseDate(record.deadline ?? record.job_valid_till ?? record.endDate ?? record.validTill),
    raw: row
  };
}

function challengeStatus(start: Date | null, end: Date | null) {
  const now = Date.now();
  if (start && start.getTime() > now) return "Upcoming";
  if (end && end.getTime() >= now) return "Live";
  return "Ended";
}

function normalizeHackerEarthChallenge(row: unknown): NormalizedItem | null {
  const record = asRecord(row);
  const slug = asString(record.slug);
  const title = asString(record.title);
  const url = asString(record.url);
  if (!slug || !title || !url) return null;

  const start = parseDate(record.start ?? record.start_str);
  const end = parseDate(record.end ?? record.end_str);
  if (end && end.getTime() < Date.now()) return null;

  const type = asString(record.type) ?? "Challenge";
  const status = challengeStatus(start, end);

  return {
    id: `hackerearth_jobs:challenge:${slug}`,
    title,
    url: url.startsWith("http") ? url : `https://www.hackerearth.com${url}`,
    company: asString(record.company_name) ?? "HackerEarth",
    location: "Online",
    jobType: `Challenge: ${type}`,
    timing: status,
    postedAt: start,
    deadline: end,
    raw: {
      ...record,
      normalized_kind: "hackerearth_challenge",
      normalized_status: status
    }
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

function normalizeMyCareerNetContest(row: unknown): NormalizedItem | null {
  const record = asRecord(row);
  const slug = asString(record.slug);
  const name = asString(record.name);
  if (!slug || !name) return null;

  const timeline = (asString(record.timeLine) ?? "").toLowerCase();
  if (timeline === "ended") return null;

  const locations = Array.isArray(record.locations)
    ? record.locations.map((location) => asString(location)).filter((location): location is string => Boolean(location))
    : [];
  const skills = Array.isArray(record.skills)
    ? record.skills.map((skill) => asString(skill)).filter((skill): skill is string => Boolean(skill))
    : [];

  const category = asString(record.category) ?? "Contest";
  const designation = asString(record.designation);
  const mode = asString(record.mode);
  const url = `${config.myCareerNetBaseUrl}/${config.myCareerNetTenantAlias}/contests/${slug}`;

  return {
    id: `mycareernet:contest:${slug}`,
    title: myCareerNetTitle(name),
    url,
    company: asString(record.company) ?? "MyCareerNet",
    location: locations.length > 0 ? locations.join(", ") : mode ?? "Online",
    jobType: `Contest: ${category}`,
    timing: timeline ? timeline[0].toUpperCase() + timeline.slice(1) : mode,
    postedAt: parseDate(record.startDateTime),
    deadline: parseDate(record.endDateTime),
    raw: {
      ...record,
      normalized_kind: "mycareernet_contest",
      normalized_designation: designation,
      normalized_skills: skills
    }
  };
}

function jsonJobConnector(sourceId: string, label: string, endpoint: string, fallbackCompany: string): Connector {
  return {
    sourceId,
    label,
    kind: "JOB",
    async fetchItems() {
      if (!endpoint) {
        console.warn(`${label} connector skipped: configure ${sourceId.toUpperCase()} endpoint env var after DevTools discovery.`);
        return [];
      }

      const payload = await fetchJsonWithTimeout(endpoint, {
        headers: {
          Accept: "application/json,text/plain,*/*",
          "User-Agent": config.unstopUserAgent
        }
      });
      return findRows(payload)
        .map((row) => normalizeJob(row, sourceId, fallbackCompany))
        .filter((job): job is NormalizedItem => Boolean(job));
    }
  };
}

async function fetchRows(endpoint: string, label: string) {
  if (!endpoint) {
    console.warn(`${label} connector skipped: endpoint env var is empty.`);
    return [];
  }

  const payload = await fetchJsonWithTimeout(endpoint, {
    headers: {
      Accept: "application/json,text/plain,*/*",
      "User-Agent": config.unstopUserAgent
    }
  });
  return findRows(payload);
}

async function postJson(endpoint: string, body: unknown, headers: Record<string, string> = {}) {
  return fetchJsonWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        Accept: "application/json,text/plain,*/*",
        "Content-Type": "application/json",
        Origin: config.myCareerNetBaseUrl,
        Referer: `${config.myCareerNetBaseUrl}/${config.myCareerNetTenantAlias}/contests`,
        "User-Agent": config.unstopUserAgent,
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
      config.myCareerNetTenantConfigUrl,
      {
        tenantAlias: config.myCareerNetTenantAlias,
        appName: "Hackathon"
      },
      { ignoreToken: "true" }
    )
  );
  const oauthDetails = asRecord(tenantConfig.oauthDetails);
  const integrationGuid = asString(oauthDetails.oAuthIntegrationGuid);
  const clientId = asString(oauthDetails.oAuthClientId);
  if (!integrationGuid || !clientId) {
    throw new Error("MyCareerNet OAuth details were missing from tenant config.");
  }

  const tokenUrl = `${config.myCareerNetBaseUrl}/py/oauth2/${integrationGuid}/access_token/`;
  const tokenPayload = asRecord(await postJson(tokenUrl, { client_id: clientId }, { ignoreToken: "true" }));
  const accessToken = asString(tokenPayload.access_token);
  if (!accessToken) {
    throw new Error("MyCareerNet access token response did not include access_token.");
  }
  return accessToken;
}

async function fetchMyCareerNetContests() {
  const token = await fetchMyCareerNetBearerToken();
  const firstPage = asRecord(
    await postJson(
      config.myCareerNetContestsUrl,
      { pagingCriteria: { pageNumber: 1, maxResults: 100 }, search: {} },
      { Authorization: `bearer ${token}` }
    )
  );
  const totalPages = asNumber(firstPage.totalPages) ?? 1;
  const firstRows = findRows(asRecord(firstPage.data).hackthons);
  const rows = [...firstRows];

  for (let page = 2; page <= totalPages; page += 1) {
    const payload = asRecord(
      await postJson(
        config.myCareerNetContestsUrl,
        { pagingCriteria: { pageNumber: page, maxResults: 100 }, search: {} },
        { Authorization: `bearer ${token}` }
      )
    );
    rows.push(...findRows(asRecord(payload.data).hackthons));
  }

  return rows;
}

export const myCareerNetConnector = jsonJobConnector(
  "mycareernet",
  "MyCareerNet",
  config.myCareerNetJobsUrl,
  "MyCareerNet"
);

myCareerNetConnector.fetchItems = async () => {
  const [configuredJobRows, contestRows] = await Promise.all([
    config.myCareerNetJobsUrl ? fetchRows(config.myCareerNetJobsUrl, "MyCareerNet Jobs") : Promise.resolve([]),
    fetchMyCareerNetContests()
  ]);

  const jobs = configuredJobRows
    .map((row) => normalizeJob(row, "mycareernet", "MyCareerNet"))
    .filter((job): job is NormalizedItem => Boolean(job));

  const contests = contestRows
    .map((row) => normalizeMyCareerNetContest(row))
    .filter((job): job is NormalizedItem => Boolean(job));

  return [...jobs, ...contests];
};

export const hackerEarthJobsConnector = jsonJobConnector(
  "hackerearth_jobs",
  "HackerEarth Jobs",
  config.hackerEarthJobsUrl,
  "HackerEarth"
);

hackerEarthJobsConnector.fetchItems = async () => {
  const [jobRows, challengeRows] = await Promise.all([
    fetchRows(config.hackerEarthJobsUrl, "HackerEarth Jobs"),
    fetchRows(config.hackerEarthChallengesUrl, "HackerEarth Challenges")
  ]);

  const jobs = jobRows
    .map((row) => normalizeJob(row, "hackerearth_jobs", "HackerEarth"))
    .filter((job): job is NormalizedItem => Boolean(job));

  const challenges = challengeRows
    .map((row) => normalizeHackerEarthChallenge(row))
    .filter((job): job is NormalizedItem => Boolean(job));

  return [...jobs, ...challenges];
};
