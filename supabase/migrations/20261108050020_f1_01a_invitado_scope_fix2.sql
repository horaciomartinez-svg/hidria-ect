-- ============================================================================
-- F1 task-35 fix2 — M2 (a) con agregado SRHDS
--   documents/iih_assets/samples/signatures/water_balances: tenant +
--   (membresía del diagnóstico OR agregado SRHDS admin/coord).
-- Forward-only. No edita migraciones aplicadas.
-- ============================================================================

drop policy if exists documents_sel on public.documents;
create policy documents_sel on public.documents
  for select to public
  using (
    public.is_tenant_member(organization_id)
    and (
      public.is_diagnostic_member(diagnostic_id)
      or (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds')
    )
  );

drop policy if exists iih_assets_sel on public.iih_assets;
create policy iih_assets_sel on public.iih_assets
  for select to public
  using (
    public.is_tenant_member(organization_id)
    and (
      public.is_diagnostic_member(diagnostic_id)
      or (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds')
    )
  );

drop policy if exists samples_sel on public.samples;
create policy samples_sel on public.samples
  for select to public
  using (
    public.is_tenant_member(organization_id)
    and (
      public.is_diagnostic_member(diagnostic_id)
      or (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds')
    )
  );

drop policy if exists signatures_sel on public.signatures;
create policy signatures_sel on public.signatures
  for select to public
  using (
    public.is_tenant_member(organization_id)
    and (
      (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds')
      or exists (
        select 1 from public.documents doc
        where doc.id = signatures.document_id
          and public.is_diagnostic_member(doc.diagnostic_id)
      )
    )
  );

drop policy if exists water_balances_sel on public.water_balances;
create policy water_balances_sel on public.water_balances
  for select to public
  using (
    public.is_tenant_member(organization_id)
    and (
      public.is_diagnostic_member(diagnostic_id)
      or (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds')
    )
  );
