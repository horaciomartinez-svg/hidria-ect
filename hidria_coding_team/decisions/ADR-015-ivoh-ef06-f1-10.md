# ADR-015 — F1-10: M8 IVOH (fórmula, semáforo, R4 y gate F6)

**Estado:** aceptado (Lead, 2026-11-15) — base `main@46f7ce7`.
**Ámbito:** F1-10 (M8 IVOH + EF-06). Decisiones vinculantes de Fase 1; no implementa código.

## Contexto

El IVOH es el índice de valor de la metodología MD-OHI. La fórmula y el semáforo no pueden calcularse en cliente; el cierre R4 es un gate metodológico (F6) y el resultado alimenta el reporte (EF-07/F1-12). Ya existen `ivoh_index_versions`, `ivoh_factors`, `ivoh_rubrics`, `ivoh_evaluations`, `v_ivoh_score`, triggers `trg_ivoh_requires_bhe`/`trg_ivoh_version_immutable` y el gate F6 en `check_phase_gate`, pero faltan RPC de captura/cierre, catálogo explícito de semáforo, guards de inmutabilidad post-R4 y contrato EF-06.

## Decisiones

### D1 — Fórmula y autoridad server-side
- `IVOH = 0.15·F1 + 0.20·F2 + 0.20·F3 + 0.20·F4 + 0.15·F5 + 0.10·F6`, con pesos de `ivoh_factors` de la **versión de índice vigente** del diagnóstico (`diagnostics.index_version_id`).
- El cálculo canónico vive en **`v_ivoh_score`** (y en la RPC de cierre), nunca en UI ni EF.
- `v_ivoh_score` se recrea con **`security_invoker=true`**, expone `ivoh` (1 decimal), `semaforo` y `semaforo_label` leídos del catálogo `ivoh_semaforo`, `serie_factores` y `por_factor`.
- La UI **solo lee**; no calcula total, semáforo ni niveles.

### D2 — Semáforo como catálogo
- Nueva tabla **`ivoh_semaforo`**: `nivel` (`rojo|amarillo|verde`), `min_total`, `max_total`, `label` (Incipiente/Básico/Consolidado/Referente u homólogo aprobado), `descripcion`, `orden`.
- Seed: rojo `<5.0`, amarillo `5.0–7.9`, verde `≥8.0`. La vista/RPC/EF leen `label` del catálogo; el texto no se hardcodea en cliente.
- `semaforo` se calcula con `round(total,1)` y comparación de rangos; el límite superior de amarillo es `<8.0`.

### D3 — Versionado e inmutabilidad de `ivoh_evaluations`
- Cada fila referencia `version_id` = `ivoh_index_versions` vigente; `factor_code` F1..F6; PK actual `(diagnostic_id,factor_code)`.
- **`ivoh_evaluations` versionado por `version_id`**: una evaluación pertenece a una versión del índice; si cambia la versión vigente, la captura debe rechazarse con `CONFLICT_IVOH_VERSION` (no se mezclan pesos).
- `puntaje` 0–10 en pasos de 0.5; `justificacion` obligatoria; `evidencia` array con ≥1 elemento por factor.
- **Post-R4 inmutable**: una vez `estado='validado_r4'`, cualquier UPDATE/DELETE autenticado o service_role ⇒ 42501. Una reevaluación futura requiere nueva versión/ADR; no se mutan filas validadas.
- `factor_code`/`diagnostic_id`/`version_id` inmutables en UPDATE; `r4_logbook_id` solo lo fija la RPC.

### D4 — RPC de captura y cierre (service_role-only)
- `fn_save_ivoh_score(p_user_id,p_diagnostic_id,p_scores jsonb,p_idempotency_key,p_request_hash)`:
  - valida rol coord/equipo, tenant/membresía, BHE `validado_r3`, versión vigente, exactamente 6 factores sin duplicados, `puntaje` 0–10 paso 0.5, justificación y evidencia ≥1.
  - upsert en `ivoh_evaluations` con `estado='borrador'`/`version_id` actual; audit `update`; idempotencia `EF-06.score`.
- `fn_validate_ivoh_r4(p_user_id,p_diagnostic_id,p_r4_logbook_id,p_idempotency_key,p_request_hash)`:
  - valida rol, tenant, BHE R3, ficha `BIT-R4-*` cerrada del mismo diagnóstico, 6 factores borrador con justificación/evidencia y versión vigente.
  - total/semáforo desde `v_ivoh_score`; actualiza las 6 filas a `validado_r4`+`r4_logbook_id`; `diagnostics.ivoh_actual` = total; audit `approve`; idempotencia `EF-06.validate-r4`.
  - responde `{diagnostic_id,total,semaforo,semaforo_label,por_factor:[{factor_code,peso,puntaje,aportacion}]}`.
  - errores: `GATE_BHE_R3` 409, `VALIDATION_IVOH_INCOMPLETO` 422, `CONFLICT_IVOH_VERSION` 409, `GATE_R4_FICHA`/`GATE_FICHA` 409, `FORBIDDEN_*` 403, `CONFLICT_STATE` 409, 500 saneado.
- Ambas RPC: `SECURITY DEFINER`, `search_path=public,pg_temp`, `REVOKE` public/anon/authenticated, `GRANT EXECUTE service_role`.

### D5 — RLS/guards
- `ivoh_evaluations`: SELECT por membresía; **sin INSERT/UPDATE/DELETE para authenticated** (captura/cierre solo por RPC service_role). Guard trigger rechaza escrituras directas autenticadas y post-R4.
- `ivoh_factors`/`ivoh_rubrics`/`ivoh_index_versions`: lectura autenticada; administración `admin_institucional`; `trg_ivoh_version_immutable` vigente.
- `trg_ivoh_requires_bhe` se conserva (INSERT/UPDATE exige BHE validado R3).
- Gate F6 (`check_phase_gate`): exige **6/6 filas `validado_r4` de la versión vigente** del diagnóstico al entrar a fase 6; `GATE_IVOH_R4` 409 si falla. Es la autoridad final.

### D6 — EF-06
- `POST /functions/v1/ivoh/{diagnostic_id}/score`: body `{scores:[{factor_code,puntaje,justificacion,evidencia}]}`; auth/claims, roles, tenant/anti-enumeración; llama RPC; errores catálogo; idempotencia.
- `POST /functions/v1/ivoh/{diagnostic_id}/validate-r4`: body `{r4_logbook_id}`; llama RPC; post-commit `ivoh_validated` (best-effort) y notificación.
- La EF no calcula IVOH/semáforo; no tiene `service_role` en cliente; sin secretos.

### D7 — UI M8
- `/ivoh` (y detalle por diagnóstico): captura de 6 factores (puntaje 0–10 paso 0.5, justificación, evidencia), borrador editable hasta R4; vista de total/semáforo/serie **solo lectura** desde `v_ivoh_score`; acción “Validar R4” coord/equipo con ficha BIT-R4; gate F6 visible; post-R4 read-only.
- No UPDATE directo de `ivoh_evaluations` ni de `diagnostics.ivoh_actual`; sin cálculo cliente; a11y/offline/E2E.

### D8 — Relación con EF-07/F1-12
- F1-10 no emite reporte: deja `diagnostics.ivoh_actual` y las 6 evaluaciones validadas; EF-07/F1-12 consume `v_ivoh_score`/`v_diagnostic_completeness` y el gate F6.

### D9 — Pruebas
- pgTAP: fórmula/redondeo (IVOH-01 = 7.2), semáforos rojo/amarillo/verde (IVOH-03/04), BHE R3 bloquea (IVOH-02), versión vigente/inmutable (IVOH-05), 6/6, inmutabilidad post-R4, ACL service_role, RLS/roles/tenant, idempotencia, gate F6/PG-09/10.
- Deno: EF-06 score/validate-r4, errores, idempotencia, roles/tenant.
- E2E UI: captura, score read-only, R4, gate, post-R4.

## Evidencia
`docs/01` §4.8, `docs/04` EF-06/TD-6, `docs/05` IVOH-01…05/PG-09/10, `docs/02` triggers/vista existentes, `main@46f7ce7`.
