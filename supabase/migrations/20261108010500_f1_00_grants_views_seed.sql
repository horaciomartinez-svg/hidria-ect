-- ============================================================================
-- F1-00 — Grants DML de PostgREST + security_invoker + correcciones de datos
--   * H-1: privilegios explícitos (0/44 antes de esta migración)
--   * H-2: security_invoker=true en las 5 vistas analíticas (evita fuga)
--   * M-07: default válido de profiles.global_role
--   * Semilla: nombre institucional vigente de organizations
-- Forward-only e idempotente. No edita la migración base ni docs/02.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- M-07  profiles.global_role: default dentro del CHECK.
-- ---------------------------------------------------------------------------
alter table public.profiles alter column global_role set default 'invitado';

-- ---------------------------------------------------------------------------
-- Semilla institucional: SRHDS — Programa HIDRIA (ADR-005 §2.5).
-- Sin editar docs/03 ni la migración aplicada; actualización idempotente.
-- ---------------------------------------------------------------------------
update public.organizations
   set name = 'SRHDS — Programa HIDRIA',
       updated_at = now()
 where id = '00000000-0000-4000-8000-000000000001'
   and name is distinct from 'SRHDS — Programa HIDRIA';

-- ---------------------------------------------------------------------------
-- H-2  Vistas analíticas con seguridad del invocador. v_quiz_questions NO se
--      toca: debe seguir siendo definer con lista blanca de columnas.
-- ---------------------------------------------------------------------------
alter view public.v_bhe_monthly            set (security_invoker = true);
alter view public.v_bhe_summary            set (security_invoker = true);
alter view public.v_balance_indicators     set (security_invoker = true);
alter view public.v_ivoh_score             set (security_invoker = true);
alter view public.v_diagnostic_completeness set (security_invoker = true);

-- ---------------------------------------------------------------------------
-- H-1  Grants de PostgREST. Modelo: RLS decide filas; el GRANT decide si el
--      rol puede intentar la operación. `anon` no recibe tablas (la API exige
--      JWT); `authenticated` recibe DML y RLS lo restringe; `service_role`
--      recibe acceso de servicio.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

-- anon: sin tablas/secuencias/funciones de negocio
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- authenticated: superficie DML sujeta a RLS
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Excepciones de seguridad (reglas duras TEAM §4/§15)
revoke all on public.quiz_questions from authenticated;
grant select on public.v_quiz_questions to authenticated;

revoke all on public.api_idempotency from authenticated;
revoke all on public.api_idempotency from anon;

revoke insert, update, delete, truncate on public.audit_log from authenticated;
grant select on public.audit_log to authenticated;

revoke insert, update, delete, truncate on public.report_emissions from authenticated;
grant select on public.report_emissions to authenticated;

-- service_role: acceso de servicio (EF). Tras el grant se recorta lo peligroso.
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Append-only de auditoría: service_role solo SELECT/INSERT (sin UPDATE/DELETE)
revoke update, delete on public.audit_log from service_role;

-- Limpieza de privilegios implícitos del proyecto (Dxtm heredado)
revoke truncate, references, trigger on all tables in schema public
  from anon, authenticated, service_role;

-- Funciones helper que evalúan las políticas RLS: authenticated debe poder
-- ejecutarlas (sin EXECUTE, toda política que las use falla).
revoke all on all functions in schema public from public;
grant execute on function public.is_tenant_member(uuid)          to authenticated;
grant execute on function public.my_diagnostic_role(uuid)        to authenticated;
grant execute on function public.is_diagnostic_member(uuid)      to authenticated;
grant execute on function public.is_logbook_entry_member(uuid)   to authenticated;
grant execute on function public.fn_completeness(uuid)           to authenticated;
grant execute on function public.fn_reporte_emitible(uuid)       to authenticated;
