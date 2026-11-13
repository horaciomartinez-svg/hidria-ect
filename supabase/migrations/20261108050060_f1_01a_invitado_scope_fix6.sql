-- ============================================================================
-- F1 task-35 fix6 (VETO-4) — companies_write era FOR ALL y su USING daba SELECT
-- a equipo/admin/coord sin membresía. Split INSERT/UPDATE/DELETE; SELECT queda
-- solo en companies_sel (membresía o agregado admin/coord). Forward-only.
-- ============================================================================

drop policy if exists companies_write on public.companies;

create policy companies_ins on public.companies
  for insert to public
  with check (
    public.is_tenant_member(organization_id)
    and (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds','equipo')
  );

create policy companies_upd on public.companies
  for update to public
  using (
    public.is_tenant_member(organization_id)
    and (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds','equipo')
  )
  with check (
    public.is_tenant_member(organization_id)
    and (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds','equipo')
  );

create policy companies_del on public.companies
  for delete to public
  using (
    public.is_tenant_member(organization_id)
    and (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds','equipo')
  );

-- B1/spec: documents_ins/upd/del no deben conservar el OR de agregado admin/coord.
drop policy if exists documents_ins on public.documents;
create policy documents_ins on public.documents
  for insert to public
  with check (
    public.is_tenant_member(organization_id)
    and public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo','empresa')
  );

drop policy if exists documents_upd on public.documents;
create policy documents_upd on public.documents
  for update to public
  using (
    public.is_tenant_member(organization_id)
    and public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo','empresa')
  )
  with check (
    public.is_tenant_member(organization_id)
    and public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo','empresa')
  );

drop policy if exists documents_del on public.documents;
create policy documents_del on public.documents
  for delete to public
  using (
    public.is_tenant_member(organization_id)
    and public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo','empresa')
  );
