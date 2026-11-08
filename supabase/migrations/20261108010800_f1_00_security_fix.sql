-- ============================================================================
-- F1-00 / DELTA DE SEGURIDAD (task-14) — SEC-PR4-01, SEC-PR4-02, SEC-PR4-05/06
-- Forward-only. No edita migraciones aplicadas ni docs/02.
--   SEC-PR4-01: revocar DML de la vista auto-actualizable v_quiz_questions.
--   SEC-PR4-02: recrear las 7 políticas FOR ALL con WITH CHECK que replica la
--               condición de rol del USING (incluida la restricción de
--               profiles.global_role para impedir escalada).
--   SEC-PR4-05: revocar MAINTAIN a roles de API.
--   SEC-PR4-06: dejar solo USAGE (sin SELECT) en secuencias a authenticated.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- SEC-PR4-01 — v_quiz_questions es una vista auto-actualizable (owner postgres).
-- El GRANT ... ON ALL TABLES de 20261108010500 incluyó la vista; se revoca el
-- DML y se conserva SELECT. service_role usa la tabla cruda, no la vista.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.v_quiz_questions from authenticated;
revoke insert, update, delete on public.v_quiz_questions from service_role;
grant select on public.v_quiz_questions to authenticated;

-- ---------------------------------------------------------------------------
-- SEC-PR4-05 — least privilege: MAINTAIN no es necesario para la API.
-- ---------------------------------------------------------------------------
revoke maintain on all tables in schema public from anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- SEC-PR4-06 — las secuencias solo requieren USAGE para nextval; SELECT no.
-- ---------------------------------------------------------------------------
revoke select on all sequences in schema public from authenticated;

-- ---------------------------------------------------------------------------
-- SEC-PR4-02 — WITH CHECK incompleto en las 7 políticas FOR ALL.
-- Para INSERT solo se evalúa WITH CHECK; antes el rol solo estaba en USING.
-- Se replica la condición completa del USING y, en profiles, se impide que
-- coordinador_srhds asigne global_role='admin_institucional' (escalada).
-- ---------------------------------------------------------------------------
drop policy if exists companies_write on public.companies;
create policy companies_write on public.companies for all
  using (
    public.is_tenant_member(organization_id)
    and (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds','equipo')
  )
  with check (
    public.is_tenant_member(organization_id)
    and (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds','equipo')
  );

drop policy if exists diagnostics_write on public.diagnostics;
create policy diagnostics_write on public.diagnostics for all
  using (
    public.is_tenant_member(organization_id)
    and public.my_diagnostic_role(id) in ('coordinador','equipo')
  )
  with check (
    public.is_tenant_member(organization_id)
    and public.my_diagnostic_role(id) in ('coordinador','equipo')
  );

drop policy if exists documents_write on public.documents;
create policy documents_write on public.documents for all
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

drop policy if exists iih_assets_write on public.iih_assets;
create policy iih_assets_write on public.iih_assets for all
  using (
    public.is_diagnostic_member(diagnostic_id)
    and public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo')
  )
  with check (
    public.is_diagnostic_member(diagnostic_id)
    and public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo')
  );

drop policy if exists profiles_write on public.profiles;
create policy profiles_write on public.profiles for all
  using (
    public.is_tenant_member(organization_id)
    and (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds')
  )
  with check (
    public.is_tenant_member(organization_id)
    and (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds')
    and (
      (auth.jwt() ->> 'global_role') = 'admin_institucional'
      or global_role in ('coordinador_srhds','equipo','empresa','observador','invitado')
    )
  );

drop policy if exists samples_write on public.samples;
create policy samples_write on public.samples for all
  using (
    public.is_diagnostic_member(diagnostic_id)
    and public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo')
  )
  with check (
    public.is_diagnostic_member(diagnostic_id)
    and public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo')
  );

drop policy if exists water_balances_write on public.water_balances;
create policy water_balances_write on public.water_balances for all
  using (
    public.is_diagnostic_member(diagnostic_id)
    and public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo')
  )
  with check (
    public.is_diagnostic_member(diagnostic_id)
    and public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo')
  );

comment on policy profiles_write on public.profiles is
  'F1-00/SEC-PR4-02: WITH CHECK exige rol admin/coordinador y evita que coordinador asigne global_role=admin_institucional.';
