import { prisma } from "./client.js";

const sources = [
  ["unstop", "Unstop", "JOB"],
  ["mycareernet", "MyCareerNet", "JOB"],
  ["hackerearth_jobs", "HackerEarth Jobs", "JOB"],
  ["unstop_featured", "Unstop Featured", "CONTEST"],
  ["codeforces", "Codeforces", "CONTEST"],
  ["leetcode", "LeetCode", "CONTEST"],
  ["codechef", "CodeChef", "CONTEST"],
  ["atcoder", "AtCoder", "CONTEST"]
] as const;

async function columnExists(table: string, column: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("${table}")`);
  return rows.some((row) => row.name === column);
}

const statements = [
  `CREATE TABLE IF NOT EXISTS "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL DEFAULT 'unstop',
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT,
    "jobType" TEXT,
    "timing" TEXT,
    "applyUrl" TEXT NOT NULL,
    "postedAt" DATETIME,
    "deadline" DATETIME,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isNew" BOOLEAN NOT NULL DEFAULT true,
    "raw" TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "Source" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true
  )`,
  `CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL UNIQUE,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "MagicLoginToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL UNIQUE,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" DATETIME,
    CONSTRAINT "MagicLoginToken_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "UserSourcePreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "UserSourcePreference_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "Contest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "site" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isNew" BOOLEAN NOT NULL DEFAULT true,
    "raw" TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "ContestReminder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "notifyAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" DATETIME,
    CONSTRAINT "ContestReminder_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContestReminder_contestId_fkey"
      FOREIGN KEY ("contestId") REFERENCES "Contest" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "ScrapeRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "jobsFound" INTEGER NOT NULL DEFAULT 0,
    "jobsInserted" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "UserSourcePreference_userId_sourceId_key"
    ON "UserSourcePreference"("userId", "sourceId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ContestReminder_userId_contestId_key"
    ON "ContestReminder"("userId", "contestId")`,
  `CREATE INDEX IF NOT EXISTS "Job_isNew_idx" ON "Job"("isNew")`,
  `CREATE INDEX IF NOT EXISTS "Job_sourceId_idx" ON "Job"("sourceId")`,
  `CREATE INDEX IF NOT EXISTS "Job_firstSeenAt_idx" ON "Job"("firstSeenAt")`,
  `CREATE INDEX IF NOT EXISTS "Job_deadline_idx" ON "Job"("deadline")`,
  `CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email")`,
  `CREATE INDEX IF NOT EXISTS "MagicLoginToken_email_idx" ON "MagicLoginToken"("email")`,
  `CREATE INDEX IF NOT EXISTS "MagicLoginToken_expiresAt_idx" ON "MagicLoginToken"("expiresAt")`,
  `CREATE INDEX IF NOT EXISTS "UserSourcePreference_userId_idx" ON "UserSourcePreference"("userId")`,
  `CREATE INDEX IF NOT EXISTS "UserSourcePreference_sourceId_idx" ON "UserSourcePreference"("sourceId")`,
  `CREATE INDEX IF NOT EXISTS "Contest_site_idx" ON "Contest"("site")`,
  `CREATE INDEX IF NOT EXISTS "Contest_isNew_idx" ON "Contest"("isNew")`,
  `CREATE INDEX IF NOT EXISTS "Contest_startTime_idx" ON "Contest"("startTime")`,
  `CREATE INDEX IF NOT EXISTS "Contest_firstSeenAt_idx" ON "Contest"("firstSeenAt")`,
  `CREATE INDEX IF NOT EXISTS "ContestReminder_notifyAt_idx" ON "ContestReminder"("notifyAt")`,
  `CREATE INDEX IF NOT EXISTS "ContestReminder_notifiedAt_idx" ON "ContestReminder"("notifiedAt")`,
  `CREATE INDEX IF NOT EXISTS "ScrapeRun_startedAt_idx" ON "ScrapeRun"("startedAt")`
];

try {
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }

  if (!(await columnExists("Job", "sourceId"))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Job" ADD COLUMN "sourceId" TEXT NOT NULL DEFAULT 'unstop'`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Job_sourceId_idx" ON "Job"("sourceId")`);
  }

  await prisma.$executeRawUnsafe(`UPDATE "Job" SET "sourceId" = 'unstop' WHERE "sourceId" = 'sourceId'`);

  for (const [id, label, type] of sources) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Source" ("id", "label", "type", "enabled")
       VALUES (?, ?, ?, true)
       ON CONFLICT("id") DO UPDATE SET "label" = excluded."label", "type" = excluded."type"`,
      id,
      label,
      type
    );
  }

  await prisma.$executeRawUnsafe(`DELETE FROM "Source" WHERE "id" = 'kontests_other'`);

  console.log("SQLite schema is ready.");
} finally {
  await prisma.$disconnect();
}
