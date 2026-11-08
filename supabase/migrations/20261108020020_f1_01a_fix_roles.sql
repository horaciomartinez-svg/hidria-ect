-- ============================================================================
-- F1-01a — Delta spec: cerrar fail-open de helpers de rol + rol invitado (task-26)
-- Forward-only. No edita migraciones aplicadas ni docs/02.
--   * has_global_role(NULL|'') => false (antes true sin claim)
--   * has_any_global_role(array[]|array['']) => false
--   * alta idempotente del 6.º global_role: invitado
-- ============================================================================

create or replace function public.has_global_role(p_role text)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.current_global_role() is not null
     and p_role is not null
     and p_role <> ''
     and public.current_global_role() = p_role;
$$;

create or replace function public.has_any_global_role(p_roles text[])
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.current_global_role() is not null
     and coalesce(array_length(p_roles, 1), 0) > 0
     and public.current_global_role() = any(p_roles);
$$;

revoke all on function public.has_global_role(text) from public, anon;
revoke all on function public.has_any_global_role(text[]) from public, anon;
grant execute on function public.has_global_role(text) to authenticated, service_role;
grant execute on function public.has_any_global_role(text[]) to authenticated, service_role;

comment on function public.has_global_role(text) is
  'F1-01a/B1: false sin claim o con rol NULL/''; true solo si coincide exactamente.';
comment on function public.has_any_global_role(text[]) is
  'F1-01a/B1: false sin claim, array vacío o solo cadenas vacías.';

-- M2: sexto global_role (invitado), idempotente. `on conflict do nothing`
-- cubre tanto el UNIQUE(id) como el UNIQUE(email) de auth.users.
insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
values ('a1000000-0000-4000-8000-000000000006','authenticated','authenticated',
        'invitado.sintetico@example.invalid', now(), now(), now())
on conflict do nothing;

insert into public.profiles (user_id, organization_id, full_name, email, global_role)
select u.id, '00000000-0000-4000-8000-000000000001',
       'Invitado Sintético', 'invitado.sintetico@example.invalid', 'invitado'
  from auth.users u
 where u.email = 'invitado.sintetico@example.invalid'
on conflict (user_id) do nothing;

comment on table public.profiles is
  'F1-01a: seed sintético de 6 perfiles (todos los global_role, incluido invitado) para staging; emails .invalid.';
