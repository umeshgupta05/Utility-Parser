CREATE TABLE "MagicLoginToken" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tokenHash" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "userId" TEXT,
  "expiresAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "usedAt" DATETIME,
  CONSTRAINT "MagicLoginToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MagicLoginToken_tokenHash_key" ON "MagicLoginToken"("tokenHash");
CREATE INDEX "MagicLoginToken_email_idx" ON "MagicLoginToken"("email");
CREATE INDEX "MagicLoginToken_expiresAt_idx" ON "MagicLoginToken"("expiresAt");
