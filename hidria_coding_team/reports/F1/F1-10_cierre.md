# F1-10 — Cierre M8 IVOH + EF-06

**Estado:** cerrado (código + documentación) — `main` base `46ab984`; BD=repo=**39**.
**Fecha:** 2026-11-15.

## Merges

| PR | Squash | Contenido |
|---|---|---|
| #71 | `079ed95` | ADR-015 IVOH/EF-06 (Fase 1: spec APROBADO, plan QA) |
| #72 | `ee9d580` | DB/RLS/RPC IVOH: catálogo semáforo, PK versionada, vistas `v_ivoh_score`/`v_ivoh_capture`, guards/RLS, `fn_save_ivoh_score`/`fn_validate_ivoh_r4`, gate F6, rollback SEC-PR72-01 |
| #73 | `7774f54` | EF-06 `score`/`validate-r4` con RPC real, autorización, R4/BIT-R4, versionado/CONFLICT, idempotencia |
| #74 | `46ab984` | UI `/ivoh`: captura 6 factores, autosave EF-06, total/semáforo/radial solo lectura, R4/gate/post-R4, sanitize XSS y columnas explícitas |

## Métricas

- pgTAP: **150 plan 55 + 151 plan 23 + 152 plan 14** (fronteras 4.9/7.9/8.0, vectores 7.2/8.5/4.3, BHE R3, versión/CONFLICT, rollback, R4, gate F6, ACL/RLS).
- Deno: **232/232** (8 nuevas EF-06).
- E2E UI: **69 passed + 6 skipped** (10 casos M8; sanitize/XSS y `select=` explícito).
- CI: 7/7 en #72/#73/#74; BD=repo=39; `docs/02` intacto; sin secretos.

## Contrato final

- Fórmula server-side con pesos de `ivoh_factors` (Σ=1), `round(...,1)`; UI/EF no calculan.
- Semáforo catálogo `ivoh_semaforo`: rojo <5.0 (Crítico), amarillo 5.0–7.9 (En desarrollo), verde ≥8.0 (Consolidado).
- `ivoh_evaluations` PK versionada; post-R4 inmutable; RLS SELECT-only; RPC service_role-only.
- `validate-r4` atómico: total antes del UPDATE; error ⇒ rollback; `diagnostics.ivoh_actual`.
- Gate F6: 6/6 validado_r4 de la versión vigente; `check_phase_gate` autoridad final.
- EF-07/F1-12 consume `v_ivoh_score`/`v_diagnostic_completeness`; F1-10 no emite reporte.

## Follow-ups no bloqueantes

- SEC-PR72-02..05 / SEC-PR73 OBS: sanitize de control chars en EF, normalizar mensajes RPC, `notifyMembers`, `CONFLICT_IVOH_VERSION` con `version_id`, E2E real de EF.
- Hints UI (`validated`/`complete`) son presentación; EF/RLS autoridad.
- `p8_ivoh`/gate requieren versión vigente; reevaluaciones futuras necesitan nueva versión/ADR.

## Evidencia

`reports/F1/F1-10_spec.md`, `reports/qa/F1-10_test_plan.md`, `reports/F1/F1-10_arquitecto-bd.md`, `reports/F1/F1-10_ef.md`, `reports/F1/F1-10_dev-frontend.md`, `reports/reviews/PR-72/73/74_spec.md`, `reports/security/PR-72/73/74_security.md`, `reports/qa/PR-72/73/74_qa.md`, `qa/trazabilidad.md`.
