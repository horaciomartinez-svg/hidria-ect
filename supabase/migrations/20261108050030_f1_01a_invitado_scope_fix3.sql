-- ============================================================================
-- F1 task-35 fix3 — decisión vinculante M2 del revisor: sin agregado SRHDS
-- en documents/iih_assets/samples/signatures/water_balances.
--   * Las 5: tenant + is_diagnostic_member(diagnostic_id) (firmas vía doc).
--   * Todas las policies de alcance exigen claim `global_role` presente.
-- Forward-only. No edita migraciones aplicadas.
-- ============================================================================

drop policy if exists diagnostics_sel on public.diagnostics;
create policy diagnostics_sel on public.diagnostics
  for select to public
  using (
    public.is_tenant_member(organization_id)
    and (auth.jwt() ->> 'global_role') is not null
    and (
      public.my_diagnostic_role(id) is not null
      or (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds')
    )
  );

drop policy if exists profiles_sel on public.profiles;
create policy profiles_sel on public.profiles
  for select to public
  using (
    public.is_tenant_member(organization_id)
    and (auth.jwt() ->> 'global_role') is not null
    and (
      coalesce(auth.jwt() ->> 'global_role', 'invitado') <> 'invitado'
      or user_id = auth.uid()
    )
  );

drop policy if exists companies_sel on public.companies;
create policy companies_sel on public.companies
  for select to public
  using (
    public.is_tenant_member(organization_id)
    and (auth.jwt() ->> 'global_role') is not null
    and (
      (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds')
      or exists (
        select 1 from public.diagnostics d
        where d.company_id = companies.id
          and d.organization_id = companies.organization_id
          and public.my_diagnostic_role(d.id) is not null
      )
    )
  );

drop policy if exists documents_sel on public.documents;
create policy documents_sel on public.documents
  for select to public
  using (
    public.is_tenant_member(organization_id)
    and (auth.jwt() ->> 'global_role') is not null
    and public.is_diagnostic_member(diagnostic_id)
  );

drop policy if exists iih_assets_sel on public.iih_assets;
create policy iih_assets_sel on public.iih_assets
  for select to public
  using (
    public.is_tenant_member(organization_id)
    and (auth.jwt() ->> 'global_role') is not null
    and public.is_diagnostic_member(diagnostic_id)
  );

drop policy if exists samples_sel on public.samples;
create policy samples_sel on public.samples
  for select to public
  using (
    public.is_tenant_member(organization_id)
    and (auth.jwt() ->> 'global_role') is not null
    and public.is_diagnostic_member(diagnostic_id)
  );

drop policy if exists signatures_sel on public.signatures;
create policy signatures_sel on public.signatures
  for select to public
  using (
    public.is_tenant_member(organization_id)
    and (auth.jwt() ->> 'global_role') is not null
    and exists (
      select 1 from public.documents doc
      where doc.id = signatures.document_id
        and public.is_diagnostic_member(doc.diagnostic_id)
    )
  );

drop policy if exists water_balances_sel on public.water_balances;
create policy water_balances_sel on public.water_balances
  for select to public
  using (
    public.is_tenant_member(organization_id)
    and (auth.jwt() ->> 'global_role') is not null
    and public.is_diagnostic_member(diagnostic_id)
  );
