# F1-04 — DB/RLS M2/M11 + soporte EF-01/EF-12 (`task-94`)

- **Agente:** `arquitecto-bd` (02)
- **Fecha:** 2026-11-13 03:05 (America/Mexico_City)
- **Rama:** `feat/F1-04-db-m2`, desde `main@4c48a73`
- **Tarea:** task-94 (DB/RLS); contrato EF: task-95 (`dev-edge-functions`)
- **Migración:** `supabase/migrations/20261108070000_f1_04_ef01_ef12.sql`
- **BD:** `schema_migrations = 30`; forward-only; `docs/02` intacto.
- **PR:** #44.

## Decisión

Se aprueba la **Propuesta B** (RPC transaccional) porque `docs/04` §2.6 exige `audit_log`
en la misma transacción que el cambio; con PostgREST+`service_role` cada llamada es su
propia transacción. Las RPC son `SECURITY DEFINER`, `search_path=public,pg_temp`,
`REVOKE` de `public,anon,authenticated` y `GRANT EXECUTE` **solo a `service_role`**.
La EF autentica, resuelve rol y pasa `user_id`; la RPC revalida en DB.

## Migración

### `public.milestone_reprogramming`
Historial de reprogramaciones: `diagnostic_id`, `organization_id`, `hito`
(`V1..R5`), `fecha_original`, `fecha_nueva`, `causa` (`empresa|equipo|externa`),
`justificacion` (≥20), `reprogramado_por`, `created_at`; índice
`(diagnostic_id, created_at desc)`.
RLS: **solo SELECT** por `is_diagnostic_member(diagnostic_id)`; sin DML para
`authenticated`; escritura únicamente por las RPC. `docs/02` intacto.

### `fn_advance_phase(p_user_id,p_diagnostic_id,p_to_phase,p_gate,p_idempotency_key,p_request_hash)`
- Revalida `fn_diag_role ∈ {coordinador,equipo}`, perfil del tenant,
  `estado='activo'`, `to_phase = fase_actual+1` (2..6).
- **Ficha de respaldo**: mapa DB de fase origen `1→R1, 2→R2, 3→V1, 4→R3, 5→R4`; exige
  `logbook_entries.estado='cerrada'` y toma el `folio` real. `p_gate` **no autoriza**:
  es cálculo de la EF y se usa solo para auditoría/respuesta (la RPC no confía en él).
- `proximo_hito` vinculante: **2→R2, 3→V1, 4→R3, 5→R4, 6→R5**; sin fechas
  (no se calculan desde `fecha_inicio`).
- `avance_pct = round(fase*100/6,1)`. `UPDATE` dispara `check_phase_gate`
  (autoridad final, `P0001 Gate F2..F6`); la RPC mapea a `GATE_CHECKLIST_R1`,
  `GATE_CAT_R2`, `GATE_IIH_V1`, `GATE_BHE_R3`, `GATE_IVOH_R4`.
- Fase 6 no avanza (desde 6 → `CONFLICT_PHASE`); TD-1 fila 6 (`reportado`) pasa a EF-07.
- `fn_audit_write('move_phase')` + `api_idempotency` + respuesta persistida en la
  misma transacción; replay mismo hash → `replayed:true`; hash distinto →
  `CONFLICT_STATE`.
- Errores de negocio: `FORBIDDEN_ROLE`, `CONFLICT_PHASE`, `CONFLICT_STATE`
  (`details.estado_actual`), `GATE_FICHA`, `NOT_FOUND`, `GATE_*`.

### `fn_reprogram_milestone(p_user_id,p_diagnostic_id,p_hito,p_fecha_original,p_fecha_nueva,p_justificacion,p_causa,...)`
- Solo `coordinador`; tenant/membresía; `fecha_nueva ∈ [fecha_original, fecha_inicio+42]`;
  justificación ≥20; causa válida; ficha **cerrada** más reciente con `clave=p_hito`
  (si no existe → `VALIDATION_HITO_SIN_FICHA`).
- Inserta historial + hallazgo en la ficha; actualiza `proximo_hito`
  (`"<hito> · <fecha>"`), `reprogramacion_justificacion` y `semaforo_atraso`
  (2+ → `rojo`; 1 con causa empresa → `amarillo`); audit + idempotencia.
- Errores: `FORBIDDEN_ROLE`, `VALIDATION_REPROGRAMACION`,
  `VALIDATION_HITO_SIN_FICHA`, `CONFLICT_STATE`, `NOT_FOUND`.

## Alcance F1

F1 entrega **fases 1–3 reales**; F4–F6 quedan con **fixtures/contrato** hasta
F2-06 (M5/IIH), según decisión del Lead/revisor. Los tests F2–F6 usan fixtures
sintéticas y no datos reales.

## Verificación

- Suite `090_f1_04_gates.sql` **plan 44**: ACL service_role, gates F2–F6,
  transiciones +1, rol/tenant/estado, idempotencia replay/conflicto,
  reprogramación completa, RLS historial y DML directo denegado.
- Total suite **275** (231 + 44); pglast OK; `db reset` desde archivos y CI 6/6.
- `fn_diag_role` sigue solo `service_role`; `nbf`/`verifyProfile` quedan en
  middleware EF (no DB).

## Pendiente / follow-up

- **`api_rate_limit`** (API-04) fuera de F1-04; follow-up en task-95/API.
- **Docs patch** (Lead/revisor): `docs/01` §4.2/§4.8 y `docs/04` §4, TD-1, §8;
  incluir `milestone_reprogramming`, RPC, `proximo_hito` mapa, `GATE_FICHA`,
  fila 6 a EF-07, alcance F4. **No editar `docs/02`**.
- **ADR-013** propuesto al Lead con las decisiones de esta sección.

## Evidencia de seguridad

- RPC no ejecutables por `authenticated` (ACL + test).
- `p_gate` no autoriza; ficha/folio se leen de DB.
- `diagnostics_update_lock` sigue exigiendo `service_role` para estado/avance;
  las RPC llamadas por `service_role` son el único camino de escritura de gates.
- Historial sin DML directo; RLS solo lectura por membresía.
