-- ============================================================================
-- F1 task-18 — Hardening de INSERT de diagnostics (revisión de seguridad)
-- Forward-only. No edita migraciones aplicadas.
--   * BEFORE INSERT: folio server-side (secuencia) y candado del estado inicial
--     para usuarios autenticados. Los fixtures de test (postgres, auth.uid()
--     null) pueden sembrar estados avanzados; la API autenticada no.
--   * diagnostics_ins: retirar empresa (hasta que M2 defina ownership) y admin
--     (docs/01 §5 solo autoriza coordinador/equipo/empresa; empresa queda fuera
--     temporalmente por falta de vínculo usuario-empresa).
--   * Residual diagnostics_upd (estado/reporte/bitácora) se documenta como
--     task-59; no se implementa aquí.
-- ============================================================================

create or replace function public.trg_diagnostics_initial_state()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Folio SIEMPRE server-side: se sobrescribe cualquier valor del cliente.
  new.folio := 'MDOHI-' || to_char(now(), 'YYYY') || '-' ||
               lpad(nextval('public.diagnostics_folio_seq')::text, 3, '0');

  -- La API autenticada no puede inyectar estado de fases avanzadas.
  if auth.uid() is not null then
    if new.fase_actual is distinct from 1
       or new.estado is distinct from 'activo'
       or new.avance_pct is distinct from 0
       or new.cat_estado is distinct from 'no_enviado'
       or new.bitacora_cerrada is distinct from false
       or new.ivoh_actual is not null
       or new.brecha_pct is not null
       or new.reporte_document_id is not null
       or new.semaforo_atraso is distinct from 'verde'
       or new.proximo_hito is not null
       or new.reprogramacion_justificacion is not null
    then
      raise exception 'diagnostics: el INSERT debe iniciar en estado inicial (fase 1, activo, avance 0, cat no_enviado, bitacora false, sin IVOH/brecha/reporte)' 
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists diagnostics_initial_state on public.diagnostics;
create trigger diagnostics_initial_state
  before insert on public.diagnostics
  for each row execute function public.trg_diagnostics_initial_state();

drop policy if exists diagnostics_ins on public.diagnostics;
create policy diagnostics_ins on public.diagnostics
  for insert to public
  with check (
    public.is_tenant_member(organization_id)
    and (auth.jwt() ->> 'global_role') in ('coordinador_srhds','equipo')
    and fase_actual = 1
    and exists (
      select 1 from public.companies c
       where c.id = company_id
         and c.organization_id = diagnostics.organization_id
    )
  );

comment on function public.trg_diagnostics_initial_state() is
  'F1 task-18: folio server-side y candado del estado inicial en INSERT (API autenticada).';
comment on policy diagnostics_ins on public.diagnostics is
  'F1 task-18: INSERT solo coordinador/equipo (empresa pendiente M2 por ownership), tenant/company y fase 1.';
