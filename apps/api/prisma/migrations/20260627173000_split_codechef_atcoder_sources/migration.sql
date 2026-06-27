INSERT INTO "Source" ("id", "label", "type", "enabled") VALUES
    ('codechef', 'CodeChef', 'CONTEST', true),
    ('atcoder', 'AtCoder', 'CONTEST', true)
ON CONFLICT("id") DO UPDATE SET
    "label" = excluded."label",
    "type" = excluded."type";

DELETE FROM "SourcePreference" WHERE "sourceId" = 'kontests_other';
DELETE FROM "Source" WHERE "id" = 'kontests_other';
