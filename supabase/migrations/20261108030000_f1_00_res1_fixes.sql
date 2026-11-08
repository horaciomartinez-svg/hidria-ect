-- ============================================================================
-- F1 task-18 — RES-1 (INSERT de diagnostics) + residuales de seguridad
-- Forward-only. No edita migraciones aplicadas.
--   * diagnostics: INSERT separado por tenant + global_role autorizado;
--     UPDATE/DELETE siguen usando my_diagnostic_role(id) (SEC-PR4-02).
--   * profiles: coordinador no puede UPDATE/DELETE perfiles admin.
--   * vistas: revocar DML inerte de las 5 vistas auto-actualizables restantes.
--   * Requisito PG >= 16 para REVOKE MAINTAIN ya se cumple (17.11); se guarda
--     en 010 y se documenta en el reporte.
-- ============================================================================

-- RES-1: separar INSERT de diagnostics. Sin my_diagnostic_role(id) en INSERT
-- (la fila aún no existe); se autoriza por tenant + global_role de docs/01 §5.
drop policy if exists diagnostics_write on public.diagnostics;
drop policy if exists diagnostics_ins on public.diagnostics;
drop policy if exists diagnostics_upd on public.diagnostics;
drop policy if exists diagnostics_del on public.diagnostics;

create policy diagnostics_ins on public.diagnostics
  for insert to public
  with check (
    public.is_tenant_member(organization_id)
    and (auth.jwt() ->> 'global_role') in
        ('admin_institucional','coordinador_srhds','equipo','empresa')
    and exists (
      select 1 from public.companies c
       where c.id = company_id
         and c.organization_id = diagnostics.organization_id
    )
  );

create policy diagnostics_upd on public.diagnostics
  for update to public
  using (
    public.is_tenant_member(organization_id)
    and public.my_diagnostic_role(id) in ('coordinador','equipo')
  )
  with check (
    public.is_tenant_member(organization_id)
    and public.my_diagnostic_role(id) in ('coordinador','equipo')
    and exists (
      select 1 from public.companies c
       where c.id = company_id
         and c.organization_id = diagnostics.organization_id
    )
  );

create policy diagnostics_del on public.diagnostics
  for delete to public
  using (
    public.is_tenant_member(organization_id)
    and public.my_diagnostic_role(id) in ('coordinador','equipo')
  );

-- Residual: profiles_write permitía a coordinador_srhds UPDATE/DELETE de un
-- perfil admin_institucional (la no-escalada solo impedía conceder admin).
drop policy if exists profiles_write on public.profiles;
create policy profiles_write on public.profiles
  for all to public
  using (
    public.is_tenant_member(organization_id)
    and (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds')
    and (
      (auth.jwt() ->> 'global_role') = 'admin_institucional'
      or global_role <> 'admin_institucional'
    )
  )
  with check (
    public.is_tenant_member(organization_id)
    and (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds')
    and (
      (auth.jwt() ->> 'global_role') = 'admin_institucional'
      or global_role in ('coordinador_srhds','equipo','empresa','observador','invitado')
    )
  );

-- Residual SEC-PR4-01: las 5 vistas restantes tenían DML inerte (auto-actualizable).
-- Se mantiene SELECT; se revoca INSERT/UPDATE/DELETE para los roles de API.
revoke insert, update, delete on table
  public.v_bhe_monthly,
  public.v_bhe_summary,
  public.v_balance_indicators,
  public.v_ivoh_score,
  public.v_diagnostic_completeness
from authenticated, service_role;

comment on policy diagnostics_ins on public.diagnostics is
  'F1 task-18/RES-1: INSERT por tenant + global_role (docs/01 §5) y company del mismo tenant.';
comment on policy diagnostics_upd on public.diagnostics is
  'F1 task-18/RES-1: UPDATE sigue exigiendo my_diagnostic_role(id) coordinador/equipo.';
comment on policy diagnostics_del on public.diagnostics is
  'F1 task-18/RES-1: DELETE sigue exigiendo my_diagnostic_role(id) coordinador/equipo.';
comment on policy profiles_write on public.profiles is
  'F1 task-18: coordinador no puede UPDATE/DELETE perfiles admin; admin conserva acceso.';
