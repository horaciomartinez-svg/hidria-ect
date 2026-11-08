-- ============================================================================
-- F1 task-18 — Revisión spec: cerrar bypass de gates en INSERT de diagnostics
-- Forward-only. No edita migraciones aplicadas.
--   * diagnostics_ins: exigir fase_actual = 1 (diagnostics_phase_gate solo
--     es BEFORE UPDATE; un INSERT con fase 6 se saltaba los gates).
--   * diagnostics_ins: quitar admin_institucional; docs/01 §5 solo autoriza
--     coordinador/equipo/empresa para el alta.
-- ============================================================================

drop policy if exists diagnostics_ins on public.diagnostics;

create policy diagnostics_ins on public.diagnostics
  for insert to public
  with check (
    public.is_tenant_member(organization_id)
    and (auth.jwt() ->> 'global_role') in ('coordinador_srhds','equipo','empresa')
    and fase_actual = 1
    and exists (
      select 1 from public.companies c
       where c.id = company_id
         and c.organization_id = diagnostics.organization_id
    )
  );

comment on policy diagnostics_ins on public.diagnostics is
  'F1 task-18/RES-1: INSERT por tenant + global_role coordinador/equipo/empresa (docs/01 §5), company del mismo tenant y fase_actual=1 (no saltar gates).';
