CREATE TABLE "UserSourcePreference" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "visible" BOOLEAN NOT NULL DEFAULT true,
  "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "UserSourcePreference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ContestReminder" (
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
);

CREATE UNIQUE INDEX "UserSourcePreference_userId_sourceId_key"
  ON "UserSourcePreference"("userId", "sourceId");
CREATE INDEX "UserSourcePreference_userId_idx" ON "UserSourcePreference"("userId");
CREATE INDEX "UserSourcePreference_sourceId_idx" ON "UserSourcePreference"("sourceId");
CREATE UNIQUE INDEX "ContestReminder_userId_contestId_key"
  ON "ContestReminder"("userId", "contestId");
CREATE INDEX "ContestReminder_notifyAt_idx" ON "ContestReminder"("notifyAt");
CREATE INDEX "ContestReminder_notifiedAt_idx" ON "ContestReminder"("notifiedAt");
