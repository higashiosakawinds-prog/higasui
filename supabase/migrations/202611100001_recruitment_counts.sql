begin;

-- 個人のプロフィールを公開せず、決められたパートの人数だけを返す。
-- 既存テーブル・RLSポリシー・団員データは変更しない。
create or replace function public.recruitment_member_counts()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with part_keys as (
    select part_id, ordinal
    from unnest(array[
      'piccolo','flute','oboe','bassoon','clarinet','bassclarinet',
      'ssaxophone','asaxophone','tsaxophone','bsaxophone',
      'horn','trumpet','trombone','euphonium','tuba','percussion','contrabass','piano'
    ]::text[]) with ordinality as items(part_id, ordinal)
  ), eligible as (
    select p.part::text as part_id
    from public.profiles as p
    where p.category::text in ('regular', 'regular_student')
  ), counts as (
    select k.part_id, k.ordinal, count(e.part_id)::integer as current_count
    from part_keys as k
    left join eligible as e on e.part_id = k.part_id
    group by k.part_id, k.ordinal
  )
  select jsonb_build_object(
    'version', 1,
    'available', not exists (
      select 1 from eligible as e
      where e.part_id is not null
        and e.part_id not in ('', 'staff', 'other', 'undecided')
        and not exists (select 1 from part_keys as k where k.part_id = e.part_id)
    ),
    'asOf', statement_timestamp(),
    'parts', (select jsonb_agg(jsonb_build_object('partId', part_id, 'currentCount', current_count) order by ordinal) from counts)
  );
$function$;

revoke all on function public.recruitment_member_counts() from public;
grant execute on function public.recruitment_member_counts() to anon, authenticated;
comment on function public.recruitment_member_counts() is '募集プレビュー専用。正団員・学生正団員のパート別人数のみを返す。個人の識別情報は返さない。';
notify pgrst, 'reload schema';

commit;
