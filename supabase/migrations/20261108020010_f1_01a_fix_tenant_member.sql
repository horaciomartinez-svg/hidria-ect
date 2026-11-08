-- ============================================================================
-- F1-01a — Corrección forward-only de is_tenant_member para JWT sin claim
-- El helper debía devolver false (no null) cuando no hay claim de tenant.
-- ============================================================================

create or replace function public.is_tenant_member(p_organization_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select p_organization_id is not null
     and public.current_org_id() is not null
     and p_organization_id = public.current_org_id();
$$;

revoke all on function public.is_tenant_member(uuid) from public, anon;
grant execute on function public.is_tenant_member(uuid) to authenticated, service_role;

comment on function public.is_tenant_member(uuid) is
  'F1-01a/ADR-005: true solo si organization_id (o tenant_id) del JWT coincide; false sin claim.';
