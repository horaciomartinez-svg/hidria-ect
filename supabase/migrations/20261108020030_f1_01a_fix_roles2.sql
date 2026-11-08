-- ============================================================================
-- F1-01a — Residual spec: has_any_global_role(array[NULL]) y E3 instance_id
-- Forward-only. No edita migraciones aplicadas ni docs/02.
--   * B1 residual: array[NULL] / array[''] / array[] => false (nunca NULL).
--   * E3: los 6 usuarios sintéticos deben tener instance_id de GoTrue para
--     que `auth.admin/users` los vea y el login de dev funcione.
-- ============================================================================

create or replace function public.has_any_global_role(p_roles text[])
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    public.current_global_role() is not null
    and exists (
      select 1
        from unnest(coalesce(p_roles, array[]::text[])) as u(role)
       where u.role is not null
         and u.role <> ''
         and u.role = public.current_global_role()
    ),
    false
  );
$$;

revoke all on function public.has_any_global_role(text[]) from public, anon;
grant execute on function public.has_any_global_role(text[]) to authenticated, service_role;

comment on function public.has_any_global_role(text[]) is
  'F1-01a/B1-residual: false sin claim, array vacío, array[NULL] o array[''']; true solo si algún rol no nulo/no vacío coincide.';

-- E3: GoTrue filtra por instance_id; los seeds se insertaron con NULL.
-- Decisión de endurecimiento: se mantiene `email_confirmed_at` para permitir
-- el login de desarrollo de F1-02 (usuarios *.example.invalid, sin password,
-- solo dev/staging). Se puede anular en la tarea de limpieza de seed (task-27).
update auth.users
   set instance_id = '00000000-0000-0000-0000-000000000000'
 where id in (
   'a1000000-0000-4000-8000-000000000001',
   'a1000000-0000-4000-8000-000000000002',
   'a1000000-0000-4000-8000-000000000003',
   'a1000000-0000-4000-8000-000000000004',
   'a1000000-0000-4000-8000-000000000005',
   'a1000000-0000-4000-8000-000000000006'
 );
