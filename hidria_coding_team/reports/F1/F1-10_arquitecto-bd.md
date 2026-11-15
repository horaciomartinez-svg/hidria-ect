# F1-10 Fase 2 — DB/RLS/RPC IVOH (task-157)

- **Agente:** `arquitecto-bd` (02), coordina F1-10a (UI) / F1-10b (EF-06)
- **Rama:** `feat/F1-10-db-ivoh`, base `main@079ed95`
- **Migración:** `20261108130000_f1_10_ivoh.sql`
- **BD:** `schema_migrations = 39`; forward-only; `docs/02` intacto.
- **PR:** #72.

## Migración

- **`ivoh_semaforo`**: niveles rojo/amarillo/verde con `min_total`/`max_total`, labels `Crítico`/`En desarrollo`/`Consolidado`, descripción y orden; RLS SELECT authenticated.
- **PK `ivoh_evaluations`** `(diagnostic_id,version_id,factor_code)`; índice por versión.
- **`v_ivoh_score`** `security_invoker`: filtra `version_id = diagnostics.index_version_id`; `ivoh` 1 decimal, `semaforo`/`semaforo_label` del catálogo, `serie_factores`, `por_factor`; pesos desde `ivoh_factors`.
- **`v_ivoh_capture`** `security_invoker`: `factores_guardados`, `completo`, total/semáforo NULL hasta 6/6, `por_factor`.
- **`v_diagnostic_completeness.p8_ivoh`** 6/6 validado_r4 de la versión vigente (security_invoker).
- **Guards**: authenticated solo SELECT en `ivoh_evaluations`; post-R4/keys inmutables; escritura solo RPC service_role; validación de puntaje/justificación/evidencia en RPC.
- **`fn_save_ivoh_score`** parcial 1–6, upsert borrador, audit/idempotencia `EF-06.score`; **`fn_validate_ivoh_r4`** 6/6, ficha R4, `diagnostics.ivoh_actual`, audit/idempotencia `EF-06.validate-r4`; ACL service_role.
- **Gate F6** 6/6 validado_r4 de la versión vigente (`GATE_IVOH_R4`) al entrar a fase 6.

## Tests

`150_f1_10_ivoh.sql` **plan 55**: catálogo/rangos/fronteras, PK versionada, vistas/captura, RPC parcial/exacto, replay/conflicto, ficha, `ivoh_actual`, gate F6 5/6 y sin IVOH, RLS/ACL/inmutabilidad. Total pgTAP **517** (462 + 55); BD=repo=39.

## Coordinación

- EF-06 consume las firmas y errores del ADR; UI lee `v_ivoh_capture`/`v_ivoh_score` sin calcular.
- `docs/02` intacto; sin `app/**`/`functions/**`.
