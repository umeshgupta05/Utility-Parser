-- Before enabling these schedules, store these secrets in Supabase Vault:
-- select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url');
-- select vault.create_secret('YOUR_SUPABASE_ANON_KEY', 'anon_key');

create or replace function public.invoke_edge_function(function_name text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
$$;

select cron.unschedule(jobname) from cron.job
where jobname in (
  'unstop-daytime',
  'unstop-overnight',
  'mycareernet-daytime',
  'mycareernet-overnight',
  'hackerearth-jobs-daytime',
  'hackerearth-jobs-overnight',
  'hackerearth-challenges-daytime',
  'hackerearth-challenges-overnight',
  'codeforces-contests',
  'leetcode-contests',
  'codechef-contests',
  'atcoder-contests',
  'unstop-featured-daytime',
  'unstop-featured-overnight',
  'contest-reminders'
);

-- pg_cron is UTC. These are close UTC equivalents of the previous Asia/Kolkata schedules.
select cron.schedule('unstop-daytime', '0,30 3-17 * * *', $$select public.invoke_edge_function('unstop');$$);
select cron.schedule('unstop-overnight', '30 18-23,0-1 * * *', $$select public.invoke_edge_function('unstop');$$);

select cron.schedule('mycareernet-daytime', '7,37 3-17 * * *', $$select public.invoke_edge_function('mycareernet');$$);
select cron.schedule('mycareernet-overnight', '37 18-23,0-1 * * *', $$select public.invoke_edge_function('mycareernet');$$);

select cron.schedule('hackerearth-jobs-daytime', '12,42 3-17 * * *', $$select public.invoke_edge_function('hackerearth_jobs');$$);
select cron.schedule('hackerearth-jobs-overnight', '42 18-23,0-1 * * *', $$select public.invoke_edge_function('hackerearth_jobs');$$);

select cron.schedule('hackerearth-challenges-daytime', '14,44 3-17 * * *', $$select public.invoke_edge_function('hackerearth_challenges');$$);
select cron.schedule('hackerearth-challenges-overnight', '44 18-23,0-1 * * *', $$select public.invoke_edge_function('hackerearth_challenges');$$);

select cron.schedule('codeforces-contests', '17,47 * * * *', $$select public.invoke_edge_function('codeforces');$$);
select cron.schedule('leetcode-contests', '22 * * * *', $$select public.invoke_edge_function('leetcode');$$);
select cron.schedule('codechef-contests', '27 * * * *', $$select public.invoke_edge_function('codechef');$$);
select cron.schedule('atcoder-contests', '32 * * * *', $$select public.invoke_edge_function('atcoder');$$);

select cron.schedule('unstop-featured-daytime', '2,32 3-17 * * *', $$select public.invoke_edge_function('unstop_featured');$$);
select cron.schedule('unstop-featured-overnight', '32 18-23,0-1 * * *', $$select public.invoke_edge_function('unstop_featured');$$);

select cron.schedule('contest-reminders', '* * * * *', $$select public.invoke_edge_function('send-contest-reminders');$$);
