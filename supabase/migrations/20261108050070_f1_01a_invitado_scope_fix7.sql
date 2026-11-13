-- ============================================================================
-- F1 task-35 fix7 — RES-1: diagnostics INSERT/UPDATE necesitaba leer companies
-- en su WITH CHECK; al separar companies_write, el subquery quedó sujeto a RLS
-- y un equipo sin membresía no veía la company. Helper SECURITY DEFINER para
-- validar company↔tenant sin depender de companies_sel. Forward-only.
-- ============================================================================

create or replace function public.company_in_tenant(p_company_id uuid, p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.companies c
     where c.id = p_company_id
       and c.organization_id = p_organization_id
  );
$$;

revoke all on function public.company_in_tenant(uuid, uuid) from public, anon;
grant execute on function public.company_in_tenant(uuid, uuid) to authenticated, service_role;

drop policy if exists diagnostics_ins on public.diagnostics;
create policy diagnostics_ins on public.diagnostics
  for insert to public
  with check (
    public.is_tenant_member(organization_id)
    and (auth.jwt() ->> 'global_role') in ('coordinador_srhds','equipo')
    and fase_actual = 1
    and public.company_in_tenant(company_id, organization_id)
  );

drop policy if exists diagnostics_upd on public.diagnostics;
create policy diagnostics_upd on public.diagnostics
  for update to public
  using (
    public.is_tenant_member(organization_id)
    and public.my_diagnostic_role(id) in ('coordinador','equipo')
  )
  with check (
    public.is_tenant_member(organization_id)
    and public.my_diagnostic_role(id) in ('coordinador','equipo')
    and public.company_in_tenant(company_id, organization_id)
  );

comment on function public.company_in_tenant(uuid, uuid) is
  'F1 task-35: valida company del tenant sin RLS de companies (para diagnostics INSERT/UPDATE).';
