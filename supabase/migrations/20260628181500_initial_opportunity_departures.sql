create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

create table if not exists public.job (
  id text primary key,
  source_id text not null default 'unstop',
  title text not null,
  company text not null,
  location text,
  job_type text,
  timing text,
  apply_url text not null,
  posted_at timestamptz,
  deadline timestamptz,
  first_seen_at timestamptz not null default now(),
  is_new boolean not null default true,
  raw jsonb not null
);

create index if not exists job_is_new_idx on public.job (is_new);
create index if not exists job_source_id_idx on public.job (source_id);
create index if not exists job_first_seen_at_idx on public.job (first_seen_at);
create index if not exists job_deadline_idx on public.job (deadline);

create table if not exists public.contest (
  id text primary key,
  site text not null,
  name text not null,
  url text not null,
  start_time timestamptz not null,
  duration_sec integer not null,
  first_seen_at timestamptz not null default now(),
  is_new boolean not null default true,
  raw jsonb not null
);

create index if not exists contest_site_idx on public.contest (site);
create index if not exists contest_is_new_idx on public.contest (is_new);
create index if not exists contest_start_time_idx on public.contest (start_time);

create table if not exists public.source (
  id text primary key,
  label text not null,
  type text not null,
  enabled boolean not null default true
);

create table if not exists public.user_source_preference (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id text not null references public.source(id) on delete cascade,
  visible boolean not null default true,
  email_enabled boolean not null default false,
  unique (user_id, source_id)
);

create index if not exists user_source_preference_user_id_idx on public.user_source_preference (user_id);
create index if not exists user_source_preference_source_id_idx on public.user_source_preference (source_id);

create table if not exists public.contest_reminder (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contest_id text not null references public.contest(id) on delete cascade,
  notify_at timestamptz not null,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  unique (user_id, contest_id)
);

create index if not exists contest_reminder_notify_at_idx on public.contest_reminder (notify_at);
create index if not exists contest_reminder_notified_at_idx on public.contest_reminder (notified_at);

create table if not exists public.scrape_run (
  id bigint generated always as identity primary key,
  source_id text not null,
  status text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  jobs_found integer not null default 0,
  jobs_inserted integer not null default 0,
  error_message text
);

create index if not exists scrape_run_started_at_idx on public.scrape_run (started_at);
create index if not exists scrape_run_source_started_idx on public.scrape_run (source_id, started_at desc);

insert into public.source (id, label, type, enabled) values
  ('unstop', 'Unstop', 'JOB', true),
  ('mycareernet', 'MyCareerNet', 'JOB', true),
  ('hackerearth_jobs', 'HackerEarth Jobs', 'JOB', true),
  ('hackerearth_challenges', 'HackerEarth Challenges', 'CONTEST', true),
  ('unstop_featured', 'Unstop Featured', 'CONTEST', true),
  ('codeforces', 'Codeforces', 'CONTEST', true),
  ('leetcode', 'LeetCode', 'CONTEST', true),
  ('codechef', 'CodeChef', 'CONTEST', true),
  ('atcoder', 'AtCoder', 'CONTEST', true)
on conflict (id) do update set
  label = excluded.label,
  type = excluded.type,
  enabled = excluded.enabled;

alter table public.job enable row level security;
alter table public.contest enable row level security;
alter table public.source enable row level security;
alter table public.user_source_preference enable row level security;
alter table public.contest_reminder enable row level security;
alter table public.scrape_run enable row level security;

drop policy if exists "public read jobs" on public.job;
create policy "public read jobs" on public.job for select using (true);
drop policy if exists "public update job seen" on public.job;
create policy "public update job seen" on public.job for update using (true) with check (true);

drop policy if exists "public read contests" on public.contest;
create policy "public read contests" on public.contest for select using (true);
drop policy if exists "public update contest seen" on public.contest;
create policy "public update contest seen" on public.contest for update using (true) with check (true);

drop policy if exists "public read sources" on public.source;
create policy "public read sources" on public.source for select using (true);
drop policy if exists "public read scrape runs" on public.scrape_run;
create policy "public read scrape runs" on public.scrape_run for select using (true);

drop policy if exists "select own preferences" on public.user_source_preference;
create policy "select own preferences" on public.user_source_preference for select using (auth.uid() = user_id);
drop policy if exists "insert own preferences" on public.user_source_preference;
create policy "insert own preferences" on public.user_source_preference for insert with check (auth.uid() = user_id);
drop policy if exists "update own preferences" on public.user_source_preference;
create policy "update own preferences" on public.user_source_preference for update using (auth.uid() = user_id);

drop policy if exists "select own reminders" on public.contest_reminder;
create policy "select own reminders" on public.contest_reminder for select using (auth.uid() = user_id);
drop policy if exists "insert own reminders" on public.contest_reminder;
create policy "insert own reminders" on public.contest_reminder for insert with check (auth.uid() = user_id);
drop policy if exists "delete own reminders" on public.contest_reminder;
create policy "delete own reminders" on public.contest_reminder for delete using (auth.uid() = user_id);

create or replace function public.upsert_job_items(items jsonb)
returns table(found integer, inserted integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  row_count integer;
  inserted_count integer;
begin
  create temporary table tmp_job_items on commit drop as
  select *
  from jsonb_to_recordset(items) as x(
    id text,
    source_id text,
    title text,
    company text,
    location text,
    job_type text,
    timing text,
    apply_url text,
    posted_at timestamptz,
    deadline timestamptz,
    raw jsonb
  );

  select count(*) into row_count from tmp_job_items;

  insert into public.job (id, source_id, title, company, location, job_type, timing, apply_url, posted_at, deadline, raw)
  select id, source_id, title, company, location, job_type, timing, apply_url, posted_at, deadline, raw
  from tmp_job_items
  on conflict (id) do nothing;

  get diagnostics inserted_count = row_count;

  update public.job target
  set source_id = source.source_id,
      title = source.title,
      company = source.company,
      location = source.location,
      job_type = source.job_type,
      timing = source.timing,
      apply_url = source.apply_url,
      posted_at = source.posted_at,
      deadline = source.deadline,
      raw = source.raw
  from tmp_job_items source
  where target.id = source.id;

  return query select row_count, inserted_count;
end;
$$;

create or replace function public.upsert_contest_items(items jsonb)
returns table(found integer, inserted integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  row_count integer;
  inserted_count integer;
begin
  create temporary table tmp_contest_items on commit drop as
  select *
  from jsonb_to_recordset(items) as x(
    id text,
    site text,
    name text,
    url text,
    start_time timestamptz,
    duration_sec integer,
    raw jsonb
  );

  select count(*) into row_count from tmp_contest_items;

  insert into public.contest (id, site, name, url, start_time, duration_sec, raw)
  select id, site, name, url, start_time, duration_sec, raw
  from tmp_contest_items
  on conflict (id) do nothing;

  get diagnostics inserted_count = row_count;

  update public.contest target
  set site = source.site,
      name = source.name,
      url = source.url,
      start_time = source.start_time,
      duration_sec = source.duration_sec,
      raw = source.raw
  from tmp_contest_items source
  where target.id = source.id;

  return query select row_count, inserted_count;
end;
$$;

create or replace function public.prune_source_jobs(source text, keep_ids text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_count integer;
  deleted_count integer;
begin
  if coalesce(array_length(keep_ids, 1), 0) = 0 then
    return 0;
  end if;

  select count(*) into existing_count from public.job where source_id = source;
  if existing_count > 5 and array_length(keep_ids, 1) < existing_count * 0.3 then
    raise warning '%: skipping prune - only % of % existing rows returned, likely a partial fetch', source, array_length(keep_ids, 1), existing_count;
    return 0;
  end if;

  delete from public.job where source_id = source and id <> all(keep_ids);
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

create or replace function public.prune_source_contests(source text, keep_ids text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_count integer;
  deleted_count integer;
begin
  if coalesce(array_length(keep_ids, 1), 0) = 0 then
    return 0;
  end if;

  select count(*) into existing_count from public.contest where site = source;
  if existing_count > 5 and array_length(keep_ids, 1) < existing_count * 0.3 then
    raise warning '%: skipping prune - only % of % existing rows returned, likely a partial fetch', source, array_length(keep_ids, 1), existing_count;
    return 0;
  end if;

  delete from public.contest where site = source and id <> all(keep_ids);
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

create or replace view public.source_with_status as
select
  s.id,
  s.label,
  s.type,
  s.enabled,
  coalesce(case when s.type = 'JOB' then jc.new_count else cc.new_count end, 0)::integer as new_count,
  to_jsonb(sr.*) as last_run
from public.source s
left join (
  select source_id, count(*)::integer as new_count from public.job where is_new group by source_id
) jc on jc.source_id = s.id
left join (
  select site, count(*)::integer as new_count from public.contest where is_new group by site
) cc on cc.site = s.id
left join lateral (
  select * from public.scrape_run r
  where r.source_id = s.id
     or (s.id = 'unstop' and r.source_id = 'unstop')
  order by r.started_at desc
  limit 1
) sr on true;

grant usage on schema public to anon, authenticated;
grant select on public.job, public.contest, public.source, public.scrape_run, public.source_with_status to anon, authenticated;
grant select, insert, update on public.user_source_preference to authenticated;
grant select, insert, delete on public.contest_reminder to authenticated;
grant update (is_new) on public.job, public.contest to anon, authenticated;
grant execute on function public.upsert_job_items(jsonb), public.upsert_contest_items(jsonb), public.prune_source_jobs(text, text[]), public.prune_source_contests(text, text[]) to service_role;
