# Opportunity Departures

A Supabase-native opportunity board for jobs, featured opportunities, and coding contests with magic-link login, email source alerts, and contest reminders.

## Architecture

- Frontend: Vite React app in `apps/web`, deployed as a static site.
- Backend: Supabase Postgres, PostgREST, Auth, Edge Functions, `pg_cron`, and `pg_net`.
- Scrapers: one Supabase Edge Function per source under `supabase/functions`.
- Scheduler: Supabase `pg_cron` invokes Edge Functions. No always-on Node server is required.

## Supabase Project

This repo is linked to the Supabase project `wpifsnuqzbjqbadrnhtm` (`Opportunity Departures`).

Apply migrations:

```powershell
D:\Tools\supabase-cli\supabase.exe db push
```

Deploy functions:

```powershell
D:\Tools\supabase-cli\supabase.exe functions deploy unstop mycareernet hackerearth_jobs hackerearth_challenges codeforces leetcode codechef atcoder unstop_featured send-contest-reminders
```

Required Edge Function secrets:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- optional connector overrides such as `UNSTOP_USER_AGENT`, `MYCAREERNET_JOBS_URL`, etc.

Cron expects Supabase Vault secrets named:

- `project_url`
- `anon_key`

## Frontend Deployment

Deploy `apps/web` to Vercel, Netlify, or Cloudflare Pages.

Required frontend environment variables:

```bash
VITE_SUPABASE_URL=https://wpifsnuqzbjqbadrnhtm.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Build command:

```bash
pnpm --filter @unstop-agent/web build
```

Output directory:

```bash
apps/web/dist
```

## Local Web Development

Create an untracked `apps/web/.env.local`:

```bash
VITE_SUPABASE_URL=https://wpifsnuqzbjqbadrnhtm.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Then run:

```bash
pnpm install
pnpm --filter @unstop-agent/web dev
```

## Sources

- Unstop jobs use the public search API.
- Unstop Featured uses the public homepage featured endpoint.
- MyCareerNet uses the tenant-config plus anonymous bearer-token contest flow, with optional job JSON via `MYCAREERNET_JOBS_URL`.
- HackerEarth Jobs uses India-scoped public community jobs endpoints.
- HackerEarth Challenges uses the public challenges feed.
- Codeforces uses the official public API.
- LeetCode uses LeetCode GraphQL.
- CodeChef uses CodeChef's public contests JSON endpoint.
- AtCoder uses the public contests page parser.

## Legacy API

The old Fastify/Prisma API under `apps/api` is kept as reference during the migration, but production data access now goes through Supabase directly.
