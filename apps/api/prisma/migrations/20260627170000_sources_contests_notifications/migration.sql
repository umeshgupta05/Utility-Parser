-- Add source ownership to existing jobs.
ALTER TABLE "Job" ADD COLUMN "sourceId" TEXT NOT NULL DEFAULT 'unstop';

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Contest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "site" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isNew" BOOLEAN NOT NULL DEFAULT true,
    "raw" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "NotificationSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SourcePreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "SourcePreference_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "NotificationSubscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Job_sourceId_idx" ON "Job"("sourceId");

-- CreateIndex
CREATE INDEX "Contest_site_idx" ON "Contest"("site");

-- CreateIndex
CREATE INDEX "Contest_isNew_idx" ON "Contest"("isNew");

-- CreateIndex
CREATE INDEX "Contest_startTime_idx" ON "Contest"("startTime");

-- CreateIndex
CREATE INDEX "Contest_firstSeenAt_idx" ON "Contest"("firstSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSubscription_endpoint_key" ON "NotificationSubscription"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "SourcePreference_subscriptionId_sourceId_key" ON "SourcePreference"("subscriptionId", "sourceId");

-- CreateIndex
CREATE INDEX "SourcePreference_sourceId_idx" ON "SourcePreference"("sourceId");

-- Seed sources used by the connector registry.
INSERT INTO "Source" ("id", "label", "type", "enabled") VALUES
    ('unstop', 'Unstop Jobs', 'job', true),
    ('mycareernet', 'MyCareerNet', 'job', true),
    ('hackerearth_jobs', 'HackerEarth Jobs', 'job', true),
    ('codeforces', 'Codeforces', 'contest', true),
    ('leetcode', 'LeetCode', 'contest', true),
    ('kontests_other', 'Other Contest Platforms', 'contest', true);
