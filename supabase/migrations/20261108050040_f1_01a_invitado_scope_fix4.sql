-- ============================================================================
-- F1 task-35 fix4 — documents_write era FOR ALL y otorgaba SELECT a admin/coord
-- sin membresía, saltándose M2(a) aunque documents_sel ya era membership-only.
-- Split de documents_write en INSERT/UPDATE/DELETE; SELECT queda solo en
-- documents_sel (tenant + is_diagnostic_member). Forward-only.
-- ============================================================================

drop policy if exists documents_write on public.documents;

create policy documents_ins on public.documents
  for insert to public
  with check (
    public.is_tenant_member(organization_id)
    and (
      public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo','empresa')
      or (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds')
    )
  );

create policy documents_upd on public.documents
  for update to public
  using (
    public.is_tenant_member(organization_id)
    and (
      public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo','empresa')
      or (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds')
    )
  )
  with check (
    public.is_tenant_member(organization_id)
    and (
      public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo','empresa')
      or (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds')
    )
  );

create policy documents_del on public.documents
  for delete to public
  using (
    public.is_tenant_member(organization_id)
    and (
      public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo','empresa')
      or (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds')
    )
  );
