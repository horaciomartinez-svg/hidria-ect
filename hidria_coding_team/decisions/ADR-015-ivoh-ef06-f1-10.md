# ADR-015 — F1-10: M8 IVOH (fórmula, semáforo, R4 y gate F6)

**Estado:** aceptado (Lead, 2026-11-15) — base `main@46f7ce7`.
**Ámbito:** F1-10 (M8 IVOH + EF-06). Decisiones vinculantes de Fase 1; no implementa código.

## Contexto

El IVOH es el índice de valor de la metodología MD-OHI. La fórmula y el semáforo no pueden calcularse en cliente; el cierre R4 es un gate metodológico (F6) y el resultado alimenta el reporte (EF-07/F1-12). Ya existen `ivoh_index_versions`, `ivoh_factors`, `ivoh_rubrics`, `ivoh_evaluations`, `v_ivoh_score`, triggers `trg_ivoh_requires_bhe`/`trg_ivoh_version_immutable` y el gate F6 en `check_phase_gate`, pero faltan RPC de captura/cierre, catálogo explícito de semáforo, guards de inmutabilidad post-R4 y contrato EF-06.

## Decisiones

### D1 — Fórmula y autoridad server-side
- `IVOH = Σ peso×puntaje` con los **pesos de `ivoh_factors` de la versión vigente** (v1: 0.15/0.20/0.20/0.20/0.15/0.10); los valores v1 son datos, **no** constantes en código; la suma de pesos debe ser 1.0.
- El cálculo canónico vive en **`v_ivoh_score`** (y en la RPC de cierre), nunca en UI ni EF.
- `v_ivoh_score` se recrea con **`security_invoker=true`**, expone `ivoh` (1 decimal), `semaforo` y `semaforo_label` leídos del catálogo `ivoh_semaforo`, `serie_factores` y `por_factor`.
- La UI **solo lee**; no calcula total, semáforo ni niveles.

### D2 — Semáforo como catálogo
- Nueva tabla **`ivoh_semaforo`**: `nivel` (`rojo|amarillo|verde`), `min_total`, `max_total`, `label`, `descripcion`, `orden`.
- Seed con **3 labels globales**: rojo=`Crítico`, amarillo=`En desarrollo`, verde=`Consolidado`; `ivoh_rubrics` conserva sus 4 niveles por factor (Incipiente/Básico/Consolidado/Referente) y **no** define el nivel global.
- `semaforo` se calcula con `round(total,1)` y comparación de rangos; el límite superior de amarillo es `<8.0`.

### D3 — Versionado e inmutabilidad de `ivoh_evaluations`
> **Superseded por D10 en el versionado de PK:** la PK final es `(diagnostic_id,version_id,factor_code)`; esta sección se conserva para semántica de inmutabilidad.
- Cada fila referencia `version_id` = `ivoh_index_versions` vigente; `factor_code` F1..F6; PK actual `(diagnostic_id,factor_code)`.
- **`ivoh_evaluations` versionado por `version_id`**: una evaluación pertenece a una versión del índice; si cambia la versión vigente, la captura debe rechazarse con `CONFLICT_IVOH_VERSION` (no se mezclan pesos).
- `puntaje` 0–10 en pasos de 0.5; `justificacion` obligatoria; `evidencia` array con ≥1 elemento por factor.
- **Post-R4 inmutable**: una vez `estado='validado_r4'`, cualquier UPDATE/DELETE autenticado o service_role ⇒ 42501. Una reevaluación futura requiere nueva versión/ADR; no se mutan filas validadas.
- `factor_code`/`diagnostic_id`/`version_id` inmutables en UPDATE; `r4_logbook_id` solo lo fija la RPC.

### D4 — RPC de captura y cierre (service_role-only)
> **Superseded parcial por D15:** `fn_save_ivoh_score` acepta **borrador parcial 1–6**; `fn_validate_ivoh_r4` exige 6. El resto de esta sección se mantiene.
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

## Adenda 2026-11-15 — cierres B1–B7 del arquitecto

### D10 — Versionado real de `ivoh_evaluations` (B1)
- Migración forward-only: **PK pasa a `(diagnostic_id, version_id, factor_code)`** (drop/recreate PK y unique), backfill `version_id = diagnostics.index_version_id` para filas existentes.
- Cada evaluación pertenece a una versión de índice; se conservan filas históricas; la captura/R4 operan solo sobre la versión vigente del diagnóstico.
- `factor_code`/`diagnostic_id`/`version_id` inmutables en UPDATE; no se mezclan versiones.

### D11 — `v_ivoh_score` canónica (B2/B5/B6)
- Recrear `security_invoker=true`, con `version_id`, filtrando `e.version_id = d.index_version_id` (versión vigente).
- Columnas: `diagnostic_id`, `version_id`, `ivoh`, `semaforo`, `semaforo_label`, `serie_factores`, `por_factor` (jsonb con `{factor_code,peso,puntaje,aportacion}`).
- Fórmula/pesos **desde `ivoh_factors`** de la versión vigente (no hardcode); suma de pesos = 1.0; `ivoh = round(sum(peso*puntaje),1)`.
- `GRANT SELECT TO authenticated`; RLS base.
- Semáforo con `ivoh_semaforo` (rangos inclusivos: rojo `<5.0`, amarillo `>=5.0 AND <8.0`, verde `>=8.0`) y `label` del catálogo.

### D12 — RLS/guards de `ivoh_evaluations` (B3/B7)
- `authenticated`: **solo SELECT** por membresía; sin INSERT/UPDATE/DELETE (policies de escritura eliminadas; escritura solo RPC service_role).
- Guard trigger: post-R4 (`OLD.estado='validado_r4'`) cualquier UPDATE/DELETE ⇒ 42501; claves inmutables; `r4_logbook_id` solo RPC; autenticado no puede insertar/actualizar.
- `puntaje` 0–10 **paso 0.5**, `justificacion` no vacía y `evidencia` array ≥1 se validan en RPC + guard/CHECK donde aplique; tests negativos.

### D13 — Gate F6 (B4)
- `check_phase_gate` F6: exige **6 factores distintos** con `estado='validado_r4'` y `version_id = diagnostics.index_version_id`; si falta ⇒ `GATE_IVOH_R4` 409.
- La versión vieja no cuenta; la autoridad final sigue siendo el trigger.

### D14 — Catálogo/seed (B5)
- `ivoh_semaforo(nivel PK, min_total, max_total, label, descripcion, orden)` con seed rojo/amarillo/verde; `semaforo_label` en vista/RPC sale de aquí.
- `ivoh_index_versions` vigente única; `trg_ivoh_version_immutable` se mantiene.

### D15 — Contrato UI/EF y versionado (cierres UI/EF)
- **`fn_save_ivoh_score` acepta borrador parcial 1–6 factores** (sin duplicados), upsert por factor; **`fn_validate_ivoh_r4` exige exactamente 6** con justificación/evidencia. La UI puede autoguardar por factor vía EF-06 `score`.
- **Respuesta `score`:** `{diagnostic_id, version_id, estado:'borrador', factores_guardados, total:null, semaforo:null}` (el total solo se publica al validar; UI muestra “pendiente/—”).
- **Versión vigente:** la UI lee solo `diagnostics.index_version_id`; históricas no se muestran en F1-10. Si la versión cambia entre carga y guardado ⇒ `CONFLICT_IVOH_VERSION` 409; no se mezclan filas.
- **Evidencia:** `[{tipo:'documento'|'activo'|'indicador'|'ficha', ref:text}]`; `tipo` debe estar en la allowlist, `ref` no vacío, ≥1 elemento por factor; validación en RPC/guard y UI.
- **`validate-r4` response:** `{diagnostic_id,total,semaforo,semaforo_label,por_factor:[{factor_code,peso,puntaje,aportacion}]}`; `score` no calcula total.
- **UI radial:** lee `serie_factores`/`por_factor` de `v_ivoh_score`; SVG propio, sin cálculo ni dependencia nueva. Gate F6 desde `diagnostics.fase_actual`.
- **Post-R4:** el guard permite únicamente la transición atómica de la RPC `borrador→validado_r4` (service_role); después **ningún** UPDATE/DELETE (incluido service_role). Histórico read-only.
- **Errores EF-06:** `GATE_BHE_R3` 409 · `VALIDATION_IVOH_INCOMPLETO` 422 · `CONFLICT_IVOH_VERSION` 409 · `GATE_R4_FICHA` 409 · `CONFLICT_STATE` 409 · `FORBIDDEN_ROLE`/`FORBIDDEN_NOT_MEMBER` 403 · 401 · 500 saneado. Idempotencia `EF-06.score`/`EF-06.validate-r4`.
- Ruta: `POST /functions/v1/ef-06-ivoh/ivoh/{diagnostic_id}/score|validate-r4` (alias `/ivoh/{id}/...`).

### D16 — Vista de borrador y completitud (B11/B8)
- Se crea **`v_ivoh_capture`** `security_invoker=true`: por diagnóstico/versión vigente, `factores_guardados`, `completo` (6/6), `total`/`semaforo`/`semaforo_label` calculados server-side desde `ivoh_factors` (NULL si faltan factores), `por_factor`, `serie_factores`.
- La UI puede mostrar el total/semáforo de borrador **solo lectura** desde `v_ivoh_capture`; el valor oficial sigue siendo el de `v_ivoh_score` post-R4 y `diagnostics.ivoh_actual`.
- `fn_save_ivoh_score` responde `{diagnostic_id,version_id,estado,factores_guardados}` **sin total/semáforo**; la UI lee el borrador desde `v_ivoh_capture` (solo lectura) y no publica nada en `diagnostics`.
- **`v_diagnostic_completeness.p8_ivoh`** exige 6/6 validado_r4 de la versión vigente (alineado con gate F6).
- Evidencia: `[{tipo,ref,descripcion?}]`, allowlist `documento|activo|indicador|ficha`; `ref` no vacío; ≥1 por factor.

## Evidencia
`docs/01` §4.8, `docs/04` EF-06/TD-6, `docs/05` IVOH-01…05/PG-09/10, `docs/02` triggers/vista existentes, `main@46f7ce7`.
