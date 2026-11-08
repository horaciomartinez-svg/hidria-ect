-- ============================================================================
-- F1 task-59 — Candado de UPDATE de diagnostics (residual B2/seguridad)
-- Forward-only. No edita migraciones aplicadas.
--   * folio: inmutable en UPDATE para todos los roles.
--   * estado/reporte/bitácora/avance/cat/semáforo/IVOH/brecha/proximo_hito/
--     reprogramación: solo service_role (EF-01/EF-07) puede cambiarlos;
--     authenticated no puede saltarse los gates por UPDATE directo.
--   * fase_actual sigue cubierta por diagnostics_phase_gate (no se duplica).
-- ============================================================================

create or replace function public.trg_diagnostics_update_lock()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- El folio es identidad server-side: nunca cambia por UPDATE.
  if new.folio is distinct from old.folio then
    raise exception 'diagnostics: el folio es inmutable (server-side).'
      using errcode = '42501';
  end if;

  -- Los campos de gate/estado solo los modifica la EF con service_role.
  -- auth.uid() es NULL en service_role y en fixtures postgres; los usuarios
  -- autenticados quedan bloqueados.
  if auth.uid() is not null then
    if new.estado is distinct from old.estado
       or new.reporte_document_id is distinct from old.reporte_document_id
       or new.bitacora_cerrada is distinct from old.bitacora_cerrada
       or new.avance_pct is distinct from old.avance_pct
       or new.cat_estado is distinct from old.cat_estado
       or new.semaforo_atraso is distinct from old.semaforo_atraso
       or new.ivoh_actual is distinct from old.ivoh_actual
       or new.brecha_pct is distinct from old.brecha_pct
       or new.proximo_hito is distinct from old.proximo_hito
       or new.reprogramacion_justificacion is distinct from old.reprogramacion_justificacion
    then
      raise exception 'diagnostics: estado/reporte/bitácora/avance/cat solo se actualizan vía EF (service_role).'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists diagnostics_update_lock on public.diagnostics;
create trigger diagnostics_update_lock
  before update on public.diagnostics
  for each row execute function public.trg_diagnostics_update_lock();

comment on function public.trg_diagnostics_update_lock() is
  'F1 task-59: folio inmutable en UPDATE; campos de gate/estado solo vía service_role/EF (ADR-010).';
