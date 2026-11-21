-- Durable store for league admin score corrections and point penalties.
-- Project: https://dtctorijynmcdjtzmgnk.supabase.co
--
-- ONE STEP: open the SQL editor for that project and run this whole file once:
--   https://supabase.com/dashboard/project/dtctorijynmcdjtzmgnk/sql/new
--
-- No save-key setup required. The league site /api/admin route already requires
-- a signed-in admin session before it calls skittles_admin_save_overrides.

create table if not exists public.skittles_admin_state (
  id int primary key default 1 check (id = 1),
  payload jsonb not null default '{"results":{},"penalties":[],"updatedAt":null}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.skittles_admin_state (id)
values (1)
on conflict (id) do nothing;

alter table public.skittles_admin_state enable row level security;

drop policy if exists skittles_admin_state_deny_all on public.skittles_admin_state;
create policy skittles_admin_state_deny_all on public.skittles_admin_state
  for all using (false) with check (false);

create or replace function public.skittles_admin_overrides()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select payload from public.skittles_admin_state where id = 1),
    '{"results":{},"penalties":[],"updatedAt":null}'::jsonb
  );
$$;

create or replace function public.skittles_admin_save_overrides(p_key text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  expected text := nullif(current_setting('app.league_admin_save_key', true), '');
begin
  -- Optional DB-side key. Leave unset; the site API already gates writes by login.
  if expected is not null and p_key is distinct from expected then
    return jsonb_build_object('error', 'Wrong admin save key.');
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return jsonb_build_object('error', 'Payload must be a JSON object.');
  end if;

  insert into public.skittles_admin_state (id, payload, updated_at)
  values (1, p_payload, now())
  on conflict (id) do update
    set payload = excluded.payload,
        updated_at = now();

  return jsonb_build_object('payload', p_payload);
end;
$$;

revoke all on function public.skittles_admin_overrides() from public;
revoke all on function public.skittles_admin_save_overrides(text, jsonb) from public;
grant execute on function public.skittles_admin_overrides() to anon, authenticated;
grant execute on function public.skittles_admin_save_overrides(text, jsonb) to anon, authenticated;
