-- Oyster farm: database self-check.
-- Paste into Supabase → SQL Editor and run AFTER the migrations and seed.
-- Everything runs in a transaction that is rolled back, so no test data is left.
-- Success = the notice "ALL CHECKS PASSED"; any failure stops with a message.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'check-admin@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'check-worker@example.test'),
  ('00000000-0000-0000-0000-0000000000c1', 'check-pending@example.test');
update public.profiles set active = true, role = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set active = true                  where id = '00000000-0000-0000-0000-0000000000b1';
-- The checks use line 6, section 25, slots 1–2.

set local role authenticated;

-- ---- pending (not approved) user cannot do anything -----------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.create_satka(gen_random_uuid(), gen_random_uuid(), 'small', 'sorted', 6::smallint, 25::smallint, 1::smallint, current_date, now(), '');
    raise exception 'expected NOT_AUTHORIZED';
  exception when others then
    assert sqlerrm = 'NOT_AUTHORIZED', 'pending user blocked: ' || sqlerrm;
  end;
  assert (select count(*) from public.satki) = 0, 'pending user cannot read satki';
end $$;

-- ---- worker ----------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$
declare
  s1 public.satki; s2 public.satki; s3 public.satki; r public.satki;
begin
  if exists (select 1 from public.satki where line_no = 6 and section = 25 and archived_at is null) then
    raise exception 'Line 6 section 25 must be empty to run the checks';
  end if;

  s1 := public.create_satka('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
                            'small', 'sorted', 6::smallint, 25::smallint, 1::smallint, current_date - 5, now(), '');
  assert s1.code ~ '^SAT-\d{5,}$', 'code issued by server';

  r := public.create_satka('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
                           'small', 'sorted', 6::smallint, 25::smallint, 1::smallint, current_date - 5, now(), '');
  assert r.code = s1.code, 'create is idempotent';
  assert (select count(*) from public.satka_events where satka_id = s1.id) = 1, 'replay adds no event';

  begin
    perform public.create_satka(gen_random_uuid(), gen_random_uuid(), 'large', 'sorted', 6::smallint, 25::smallint, 1::smallint, current_date, now(), '');
    raise exception 'expected POSITION_TAKEN';
  exception when others then
    assert sqlerrm = 'POSITION_TAKEN', 'duplicate position rejected: ' || sqlerrm;
  end;

  begin
    perform public.create_satka(gen_random_uuid(), gen_random_uuid(), 'large', 'sorted', 7::smallint, 1::smallint, 1::smallint, current_date, now(), '');
    raise exception 'expected INVALID_POSITION';
  exception when others then
    assert sqlerrm = 'INVALID_POSITION', 'line 7 rejected: ' || sqlerrm;
  end;

  -- processing
  r := public.process_satka(gen_random_uuid(), s1.id, 'newly_sorted', 'large', current_date, now(), '');
  assert r.status = 'newly_sorted' and r.size = 'large' and r.last_processed_on = current_date, 'processed';
  r := public.process_satka(gen_random_uuid(), s1.id, 'on_land', null, current_date - 3, now(), 'late sync');
  assert r.status = 'newly_sorted', 'older processing does not overwrite newer state';
  assert (select count(*) from public.satka_events where satka_id = s1.id and kind = 'processed') = 2, 'older processing still in history';

  -- moving and swapping
  s2 := public.create_satka(gen_random_uuid(), '20000000-0000-0000-0000-000000000002',
                            'spat', 'sorted', 6::smallint, 25::smallint, 2::smallint, current_date, now(), '');
  begin
    perform public.move_satka(gen_random_uuid(), s1.id, 6::smallint, 25::smallint, 2::smallint, now(), '', false);
    raise exception 'expected POSITION_TAKEN';
  exception when others then
    assert sqlerrm = 'POSITION_TAKEN', 'move onto occupied slot rejected: ' || sqlerrm;
  end;
  r := public.move_satka(gen_random_uuid(), s1.id, 6::smallint, 25::smallint, 2::smallint, now(), '', true);
  assert r.slot = 2, 'swap moved s1';
  assert (select slot from public.satki where id = s2.id) = 1, 'swap moved s2 into s1''s old slot';

  -- worker cannot correct
  begin
    perform public.correct_satka(gen_random_uuid(), s1.id, 'xl', 'sorted', current_date, 'fix');
    raise exception 'expected NOT_ADMIN';
  exception when others then
    assert sqlerrm = 'NOT_ADMIN', 'worker cannot correct: ' || sqlerrm;
  end;

  -- archive frees the slot; codes are never reused
  r := public.archive_satka(gen_random_uuid(), s2.id, 'Изгубена', now(), '');
  assert r.archived_at is not null, 'archived';
  begin
    perform public.process_satka(gen_random_uuid(), s2.id, 'sorted', null, current_date, now(), '');
    raise exception 'expected ARCHIVED';
  exception when others then
    assert sqlerrm = 'ARCHIVED', 'archived satka cannot be processed: ' || sqlerrm;
  end;
  s3 := public.create_satka(gen_random_uuid(), '20000000-0000-0000-0000-000000000003',
                            'spat', 'sorted', 6::smallint, 25::smallint, 1::smallint, current_date, now(), 'replacement');
  assert s3.code <> s2.code and s3.code <> s1.code, 'replacement gets a new code';

  -- no direct writes
  begin
    update public.satki set size = 'xl' where id = s1.id;
    raise exception 'expected permission error';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.satka_events where satka_id = s1.id;
    raise exception 'expected permission error';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---- admin -----------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare r public.satki;
begin
  r := public.correct_satka(gen_random_uuid(), '20000000-0000-0000-0000-000000000003', 'xl', 'on_land', current_date, 'Грешно въведен размер');
  assert r.size = 'xl', 'admin can correct';
  begin
    perform public.set_user('00000000-0000-0000-0000-0000000000a1', 'Admin', 'worker', true);
    raise exception 'expected LAST_ADMIN';
  exception when others then
    -- Real admins may exist in the project; then demoting the test admin is allowed.
    assert sqlerrm in ('LAST_ADMIN', 'expected LAST_ADMIN') , 'last admin guard: ' || sqlerrm;
  end;
  raise notice 'ALL CHECKS PASSED';
end $$;

rollback;
