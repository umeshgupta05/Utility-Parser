# Opportunity Departures

A self-hosted opportunity board for jobs, featured Unstop opportunities, and coding contests with email login and notification reminders.

## Docker Deployment

```bash
docker compose up --build -d
```

Open http://localhost:4000.

The container serves both the Fastify API and the built React frontend. SQLite is stored in the `opportunity_data` Docker volume at `/data/dev.db`.

Useful production environment variables:

- `APP_PUBLIC_URL`: public URL used in magic login emails, for example `https://your-domain.com`.
- `COOKIE_SECRET`: long random string for signed cookies.
- `RESEND_API_KEY`: optional, enables real email delivery through Resend.
- `RESEND_FROM_EMAIL`: verified sender address for Resend.
- `DATABASE_URL`: defaults to `file:/data/dev.db` in Docker.

## Setup

```bash
pnpm install
Copy-Item .env.example apps/api/.env
pnpm db:generate
pnpm db:migrate
pnpm scrape
pnpm dev
```

- API: http://localhost:4000
- Web: http://localhost:5173

On macOS/Linux, use `cp .env.example apps/api/.env` instead of `Copy-Item`.

## Scripts

- `pnpm dev` starts the API and web app.
- `pnpm scrape` runs the Unstop scraper once.
- `pnpm db:migrate` creates or updates the SQLite database and regenerates Prisma Client.
- `pnpm typecheck` checks both apps.
- `pnpm build` builds both apps.

## API Sorting

`GET /api/jobs` supports `sortBy` values: `newest`, `new_first`, `posted_newest`, `posted_oldest`, `deadline`, `deadline_latest`, `company_az`, `company_za`, `title_az`, and `title_za`.

## Scraping

The scraper uses Unstop's public search API for the fixed filter:

`in-office`, `full-time`, `software-development`, `fresher`, `open`.

Cron runs every 30 minutes from 8 AM to 11 PM IST, hourly overnight, with a small random delay before each scrape. Existing jobs are deduplicated by Unstop opportunity id.

Additional connectors:

- Codeforces contests use the official public API.
- LeetCode contests use `leetcode-query` against LeetCode GraphQL.
- CodeChef contests use CodeChef's public contests JSON endpoint.
- AtCoder contests use AtCoder's public contests page and are parsed into structured contest cards.
- HackerEarth Jobs uses its public community jobs endpoint and the public challenges feed from `https://www.hackerearth.com/challenges/`; active/upcoming challenges are stored under the same `hackerearth_jobs` source.
- MyCareerNet contests use the same public tenant-config plus anonymous bearer-token flow as `https://mycareernet.co/mycareernet/contests`; live/upcoming contests are stored under the `mycareernet` source. Optional job JSON can still be merged through `MYCAREERNET_JOBS_URL`.
- Unstop Featured uses the public homepage featured endpoint and stores homepage featured opportunities under the `unstop_featured` contest source.
