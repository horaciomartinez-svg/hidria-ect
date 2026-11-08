# F1 — Estado del supervisor (arranque del MVP núcleo)

- **Agente:** supervisor-hidria
- **Fecha:** 2026-11-07 19:57 (America/Mexico_City)
- **Tarea:** `tasks/F1/F1-00_migraciones_correctivas.md` (cierre) y preparación de `F1-01`
- **PR / merge:** PR #4 `feature/F1-00-migraciones` → `main` — **MERGEADO (squash)**
- **Merge commit:** `b4fbc83c73ec6442b9e1e466fd733e41364cb218` (`main` = `b4fbc83`)
- **Head mergeado:** `4e2341d41af7b2e1206fea5f61a9247c8b5d0813` (6 commits, 16 archivos, +1742/−0)
- **F0 de referencia:** PR #2 `1da64d0`, PR #3 `8008a64`, PR #5 (documental E1/B1) `afffb6c`
- **CI post-merge en `main` (`b4fbc83`):** **2/2 success** (`Guardas de repositorio` + `Cliente`)

## Resultado: F1-00 CERRADA — VERDE con excepciones documentadas

F1-00 (migraciones correctivas `M-01…M-08`, grants DML PostgREST, `security_invoker`,
enforcement H-5, hook de claims, delta de seguridad) queda **cerrada en `main`**. Quedan
condiciones de seguimiento que **no bloquean F1-01** pero sí deben cerrarse antes de sus
gates (ver abajo).

## Registro del merge de PR #4

| Criterio (checklist §7 del agente 01) | Evidencia | Estado |
|---|---|---|
| PR enlaza tarea y evidencia | `tasks/F1/F1-00_migraciones_correctivas.md`; `reports/F1/F1-00_arquitecto-bd_migraciones.md`, `F1-00_delta_seguridad.md` | ✅ |
| CI verde | `4e2341d`: **4/4 success** (`Guardas de repositorio` + `Cliente`, runs 42435395966/42435399700); post-merge en `main` (`b4fbc83`): **2/2 success** | ✅ |
| Spec review APROBADO | `reports/reviews/PR-4_spec_delta.md` (anexo de `PR-4_spec.md`): **APROBADO**; B1 cerrado en `main` por PR #5 (ADR-005 §2.5); o1–o6 documentales | ✅ |
| Security review sin veto | `reports/security/PR-4_security_delta.md`: **VETO LEVANTADO** sobre `4e2341d` (SEC-PR4-01/02/05/06 corregidos; informe interno no versionado por divulgación responsable hasta post-fix) | ✅ |
| QA | `reports/qa/PR-4_qa.md`: **AMARILLO — merge permitido con excepción pgTAP documentada**; `task-13` obligatoria antes de G1 | ✅ (con excepción) |
| Sin secretos / `.env` | Guarda de secretos verde; barrido del diff: 0 patrones | ✅ |
| `docs/02` ↔ migración base byte-idénticos | Guarda 3 verde; SHA-256 `2A7B6F88…` en ambos; `git diff` vacío | ✅ |
| Rama al día / sin conflictos | `mergeable_state: clean`; required checks `strict=false` (no rebase necesario) | ✅ |
| Conventional Commits / squash | `feat(f1-00): migraciones correctivas, grants DML y enforcement`; squash con 1 padre | ✅ |
| Solo el supervisor mergea | Ejecutado por `supervisor-hidria`; ruleset `proteccion-main` con `required_approving_review_count=0`, required checks y `non_fast_forward`; sin bypass | ✅ |

**Estado post-merge:** `main = b4fbc83`; **12 migraciones** y **5 suites pgTAP** en el repo;
`schema_migrations` = 12 (3 base + 9 F1); 46 tablas/46 RLS/6 vistas/105 políticas;
`security_invoker` en 5/6 vistas; `authenticated` sin SELECT en `quiz_questions` cruda ni
`api_idempotency`; `service_role` con `audit_log` append-only; Realtime 5 tablas + 3 políticas;
`custom_access_token_hook` presente (sin activar, E3).

## Condiciones de seguimiento abiertas

| # | Condición | Tarea | Cuándo |
|---|---|---|---|
| 1 | **pgTAP no ejecutado** (host sin Docker; CI sin Postgres) — excepción QA aceptada | `task-13` (pgTAP en CI con Postgres; devops + QA) | **antes de G1** |
| 2 | **RES-1:** `diagnostics_write` deniega INSERT de diagnóstico a todos los roles (`WITH CHECK` con `my_diagnostic_role(id)` sobre fila inexistente) → M2/PostgREST roto; + residuales de vistas/DML y `profiles_write.USING` | `task-18` (arquitecto-bd) | **antes de F1-04/M2** |
| 3 | **SEC-PR4-03:** `privacy_requests` con DML/PII para cualquier miembro del tenant | `task-15` | antes del buzón ARCO (F2) |
| 4 | **o1–o6** del revisor (heads del reporte F1-00, bullet B1 de F1-18, `companies_write` vs docs/01 §5, PG≥16 `revoke maintain`, enlace a `PR-4_security_delta`) | PR de seguimiento documental (Lead) | no bloqueante |
| 5 | **E3** activación del auth hook | usuario (`SUPABASE_ACCESS_TOKEN`/dashboard) | para probar JWT real en F1-01 (los tests usan claims simulados) |
| 6 | **E2** staging dedicado · **E4** acta 0.6 | usuario / Coordinación | según ADR-004 |

## Siguiente tarea: F1-01 — Auth con custom claims y roles

- **Dueños:** `arquitecto-bd` (migración/seed/RLS) + `dev-edge-functions` (`_shared/auth.ts`,
  guardas de rol por endpoint). Archivo: `tasks/F1/F1-01_auth_claims.md`.
- **Deps:** F1-00 (cumplida). **P0.**
- **Alcance:** JWT con `organization_id`, `tenant_id` y `global_role` (hook ya entregado en
  F1-00; activación E3 pendiente de credencial); middleware/guardas por endpoint; guard
  `401 AUTH_INVALID` sin claim (SEC-04); login/logout en `app/src/lib/auth`; pruebas
  SEC-01…SEC-04 y trazabilidad; `policies`/`profiles`/`project_members` sintéticos.
- **Riesgos:** E3 (hook sin activar) → pruebas con claims simulados + `SET LOCAL ROLE`, y
  `401` con token sin claim; no exponer `service_role`; las guardas de rol deben cubrir
  `coordinador`, `equipo`, `empresa`, `observador`, `admin_institucional`.

## Pendientes de usuario (sin cambios)

- **E2** proyecto Supabase `staging` separado del piloto.
- **E3** activación de `custom_access_token_hook` (o `SUPABASE_ACCESS_TOKEN`).
- **E4** acta de validación 0.6 (Coordinación).
- Regla vigente del ruleset: `required_approving_review_count = 0` + required checks
  (`Guardas de repositorio`, `Cliente`) + `non_fast_forward`; sin bypass. El cuórum del
  equipo (spec + seguridad + QA) se ejecuta por reportes.
