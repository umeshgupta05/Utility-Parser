update public.source
set type = 'MIXED'
where id = 'mycareernet';

create or replace view public.source_with_status as
select
  s.id,
  s.label,
  s.type,
  s.enabled,
  case
    when s.type = 'JOB' then coalesce(jc.new_count, 0)
    when s.type = 'CONTEST' then coalesce(cc.new_count, 0)
    else coalesce(jc.new_count, 0) + coalesce(cc.new_count, 0)
  end::integer as new_count,
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
  order by r.started_at desc
  limit 1
) sr on true;
