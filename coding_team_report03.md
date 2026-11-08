# HIDRIA — Reporte de situación #03 del equipo autónomo

**Archivo:** `coding_team_report03.md`

- **Fecha de generación:** 2026-11-08 02:08 UTC · 2026-11-07 20:08 (America/Mexico_City)
- **Autor:** Lead (creador) del equipo `hidria_coding_team`
- **Repositorio:** [`horaciomartinez-svg/hidria-ect`](https://github.com/horaciomartinez-svg/hidria-ect) (público)
- **`main`:** [`6b95be0`](https://github.com/horaciomartinez-svg/hidria-ect/commit/6b95be062736bd62d65c9e8fa48419d7aece078e)
- **Fase:** F0 cerrada (G0 AMARILLO-OPERATIVO, **E1 y E3 resueltas**) · **F1-00 cerrada** · **F1-01 en curso**
- **PRs abiertos:** [#7 F1-01a](https://github.com/horaciomartinez-svg/hidria-ect/pull/7) (`b67abf3`, en revisión) · [#8 F1-01b](https://github.com/horaciomartinez-svg/hidria-ect/pull/8) (`21b2ca3`, en revisión)

> Los commits se referencian por SHA corto; las horas locales son de America/Mexico_City y
> los timestamps de GitHub se muestran en UTC.

---

## 1. Resumen ejecutivo

El equipo completó el cierre de **Fase 0** y de **F1-00**, y ya está en **F1-01 (auth con
custom claims y roles)**, dividida en dos tareas paralelas sin solape de archivos:

| Hito | Estado |
|---|---|
| E1 — protección de `main` con ruleset `proteccion-main` | ✅ **Resuelta y verificada** (`required_approving_review_count = 0`, required checks, no force push, sin bypass) |
| PR #5 — E1 + B1 + evidencia | ✅ squash `afffb6c` |
| PR #4 — **F1-00**: migraciones correctivas, grants, enforcement y fix de seguridad | ✅ squash `b4fbc83` |
| PR #6 — cierre documental F1-00 | ✅ squash `6b95be0` |
| **PR #7 — F1-01a** (helpers de claims, seed, RLS) | 🔄 **en revisión** (head `b67abf3`, CI 4/4; seguridad sin veto; residual spec `array[NULL]`) |
| **PR #8 — F1-01b** (`_shared/auth.ts`, guardas, `401 AUTH_INVALID`) | 🔄 **en revisión** (head `21b2ca3`, CI 4/4; 53 pruebas Deno) |
| **E3 — activación del `custom_access_token_hook`** | ✅ **Resuelta y verificada end-to-end** (`F0-14`; JWT con claims; fallo cerrado 403) |
| Veto de seguridad de PR #4 | ✅ **Levantado** (task-17) |
| Spec review de PR #4 | ✅ **APROBADO** (`PR-4_spec_delta.md`) |
| Condiciones de PARO | 0 |

El control humano ya no está en la aprobación formal de GitHub (el ruleset lo permite con
`count = 0`): es por **auditoría de reportes y comentarios de revisión**, con CI obligatorio.

---

## 2. Ruleset `proteccion-main` (E1 resuelta)

Verificado por API (id `26780941`):

| Campo | Valor |
|---|---|
| `enforcement` | `active` · `target: refs/heads/main` |
| Aprobaciones | **`required_approving_review_count = 0`** (aplicado por el usuario el 2026-11-07 19:50/51) |
| Required checks | `Guardas de repositorio` + `Cliente (lint + typecheck + build)` |
| Force push / borrado | Bloqueados (`non_fast_forward`, `deletion`) |
| `bypass_actors` | `[]` (sin bypass) |
| `protected` | `true` |

**Modelo de merge:** CI verde + cuórum del equipo (spec + seguridad + QA con evidencia en
`reports/` y comentario en el PR) → squash por `supervisor-hidria`. La aprobación formal de
GitHub no es necesaria; no se usa bypass.

Evidencia: [`F0-13`](hidria_coding_team/reports/F0/F0-13_verificacion_ruleset_e1.md),
[`F0-06`](hidria_coding_team/reports/F0/F0-06_supervisor_branch_protection.md),
[`ADR-004`](hidria_coding_team/decisions/ADR-004-excepciones-fase-0.md).

---

## 3. Merges completados

| PR | Squash | Contenido | Revisión |
|---|---|---|---|
| [#5](https://github.com/horaciomartinez-svg/hidria-ect/pull/5) | `afffb6c` | E1 resuelta, B1 de `ADR-005`, TEAM/ADR, F1-18, evidencia | spec **APROBADO**; security "no aplica"; CI 4/4 |
| [#4](https://github.com/horaciomartinez-svg/hidria-ect/pull/4) | `b4fbc83` | **F1-00**: 9 migraciones forward-only, grants DML, `security_invoker`, Realtime, hook `public.*`, enforcement H-5, **fix SEC-PR4-01/02/05/06** | spec **APROBADO** (`PR-4_spec_delta.md`); security **sin veto** (`PR-4_security_delta.md`); QA **AMARILLO** (excepción pgTAP) |
| [#6](https://github.com/horaciomartinez-svg/hidria-ect/pull/6) | `6b95be0` | Cierre documental: reportes de revisión/seguridad/QA, `a740ac9`, BACKLOG, TEAM §14, `coding_team_report02.md` | solo documentación; CI 4/4; post-merge 2/2 |

**`main` = `6b95be0`**, con **12 migraciones** (3 base + 9 F1-00) y 5 suites pgTAP.

### F1-00 — resultado técnico

- `schema_migrations = 12`; 46 tablas / RLS 46/46 / 6 vistas / 105 políticas.
- `authenticated` con RLS y sin `quiz_questions` cruda; `service_role` administra el banco;
  `audit_log` append-only; 5 vistas `security_invoker`; Realtime 5 tablas + 3 políticas.
- Fix de seguridad: `v_quiz_questions` conserva SELECT y revoca DML; 7 políticas `FOR ALL`
  con `WITH CHECK` completo (incluye no-escalada de `profiles.global_role`); `MAINTAIN`
  revocado; secuencias solo `USAGE`.
- `docs/02` y migración base **byte-idénticos** (guarda 3 verde).

**Condiciones residuales (no bloquean F1-01):**
- **RES-1 / task-18** — `diagnostics_write` sin INSERT de diagnóstico (`my_diagnostic_role`
  sobre fila nueva); corregir antes de **F1-04/M2** (política INSERT por tenant/rol o ADR
  EF-only + `docs/01`).
- **task-13** — pgTAP en CI con Postgres, antes de **G1**.
- **task-15** — `privacy_requests`/PII ARCO restringido, antes del buzón ARCO.
- Menores o1–o6 (heads históricos, `companies_write`, PG≥16, enlaces) → seguimiento
  documental.

---

## 4. Ciclo actual — F1-01 (auth/claims)

### PR #7 — F1-01a (DB)

- **Rama / head:** `feature/F1-01a-auth-claims` / **`b67abf3`** (base `main@6b95be0`; fix `4197602` + reporte).
- **Diff:** 5 archivos, +484/−0: 3 migraciones (incluye `20261108020020_f1_01a_fix_roles`), suite pgTAP `060` (`plan 46`) y reporte.
- **CI:** 4/4 `success`; `mergeable_state: clean`.
- **Estado de revisión:** spec con un **residual bloqueante acotado** (`has_any_global_role(array[NULL])` → `NULL` con claim; falta caso en `060`); **seguridad: VETO LEVANTADO**; QA pendiente (task-31). El arquitecto prepara `20261108020030…` con el fix y el `instance_id` de los usuarios seed.
- **Contenido:**
  - Helpers `current_org_id()` (`organization_id` con precedencia; `tenant_id` alias),
    `current_global_role()`, `has_global_role(text)`, `has_any_global_role(text[])`;
    `is_tenant_member(uuid)` acepta ambos claims y devuelve `false` sin claim.
  - Seed sintético idempotente: 5 `auth.users`, 5 `profiles` (todos los `global_role`),
    1 empresa, 2 diagnósticos, 6 `project_members`; emails `.invalid`, sin datos reales.
  - pgTAP `060` (`plan 29`): seed, precedencia/alias de claims, sin claim, claim inválido,
    roles, RLS A/B, `my_diagnostic_role`, `is_diagnostic_member`.
  - `schema_migrations = 14` (12 + 2 de F1-01a).
- **Revisiones en curso:** `task-23` spec, `task-24` seguridad, `task-25` QA.
- **Límites documentados:** hook `custom_access_token_hook` **YA ACTIVO** (E3 resuelta,
  `F0-14`); el seed tiene `auth.users.instance_id = NULL` (GoTrue no los ve; pendiente de fix
  para login de F1-02) y `401 AUTH_INVALID` se implementa en el middleware EF (F1-01b).

### F1-01b — EF auth (PR #8, en revisión)

- **Rama / head:** `feature/F1-01b-auth-ef` / **`21b2ca3`** (5 archivos, +2433; solo
  `supabase/functions/_shared/**` + reporte).
- `_shared/auth.ts`: verificación HS256, claims ADR-005, guardas de tenant/rol/diagnóstico,
  catálogo de 16 endpoints ↔ EF-01…EF-13, `401 AUTH_INVALID`/403 canónicos.
- 53 pruebas Deno locales (no ejecutadas en CI; job Deno junto a task-13), `deno check/lint/fmt`
  limpios. Revisiones task-32/33/34 en curso.

---

## 5. Cola y próximos hitos

1. **PR #7:** fix residual `has_any_global_role(array[NULL]) → false` + `instance_id` de los
   seed users; después re-revisión acotada (spec + seguridad delta + QA) y **squash**.
2. **PR #8 (F1-01b):** revisión spec/seguridad/QA; QA debe dictaminar la excepción de las 53
   pruebas Deno (no corren en CI; job Deno junto a task-13) y **squash**.
3. **F1-02 — Shell PWA** (`dev-frontend-pwa`): router, layout, sesión, PWA; consume F1-01.
4. Después, la ola F1-03…F1-18 según `ADR-003`/`ADR-006` (M1→M2/M11→M3→M4→M5/M6/M8→M10→
   prerrequisitos de matriz→EF-07 esencial→Realtime→deploy staging).
5. Follow-ups: **task-13** (pgTAP/Deno en CI) antes de G1, **task-18** antes de F1-04/M2,
   **task-15** antes del buzón ARCO, **task-27** (limpieza del seed, G3) y **task-28** (guarda
   CI de fixtures).

---

## 6. Riesgos actualizados

| Riesgo | Nivel | Estado / mitigación |
|---|---|---|
| Hook sin activar (E3) | ~~Medio~~ **Resuelto** | Hook activo por Management API; JWT con claims verificado (`F0-14`); fallo cerrado 403 |
| Seed `instance_id` NULL | Bajo | Los 6 usuarios seed no son visibles por GoTrue; fix en `20261108020030…` para login de F1-02 |
| Sin proyecto Supabase staging separado (E2) | Alto | Solo datos sintéticos; prohibido `restringido_nda` hasta separar entornos |
| Acta de validación 0.6 (E4) | Medio | Pendiente de la Coordinación SDFI/UCI |
| RES-1 `diagnostics_write` | Medio | `task-18` antes de F1-04/M2 |
| pgTAP no ejecutado en CI | Medio | `task-13` antes de G1; QA dictamina AMARILLO con excepción |
| `privacy_requests` (PII ARCO) | Medio | `task-15` antes del buzón ARCO |
| Duplicación de runs CI (`push` + PR) | Bajo | Acotar `push` o `concurrency` (DevOps) |

---

## 7. Acciones del usuario

Ninguna bloqueante para el flujo actual (el ruleset con `count = 0` desbloqueó los merges).
Siguen abiertas las acciones de entorno:

1. **E2** — provisionar proyecto Supabase `staging` separado del piloto.
2. **E4** — acta de validación de contenido 0.6 con la Coordinación.

**Control humano:** por auditoría de reportes/comentarios; no se requiere aprobar cada PR en
GitHub.

---

## 8. Índice de evidencia

| Área | Documento |
|---|---|
| Gobierno | [TEAM.md](hidria_coding_team/TEAM.md) |
| Ruleset E1 | [F0-13](hidria_coding_team/reports/F0/F0-13_verificacion_ruleset_e1.md) · [F0-06](hidria_coding_team/reports/F0/F0-06_supervisor_branch_protection.md) |
| Hook E3 | [F0-14](hidria_coding_team/reports/F0/F0-14_activacion_auth_hook.md) |
| ADR | [ADR-003](hidria_coding_team/decisions/ADR-003-plan-de-fases-operativo.md) · [ADR-004](hidria_coding_team/decisions/ADR-004-excepciones-fase-0.md) · [ADR-005](hidria_coding_team/decisions/ADR-005-claims-grants-y-correcciones.md) · [ADR-006](hidria_coding_team/decisions/ADR-006-realtime-y-consistencias.md) · [ADR-007](hidria_coding_team/decisions/ADR-007-seed-sintetico.md) |
| PR #7 revisiones | [PR-7_spec](hidria_coding_team/reports/reviews/PR-7_spec.md) · [PR-7_security](hidria_coding_team/reports/security/PR-7_security.md) · [PR-7_qa](hidria_coding_team/reports/qa/PR-7_qa.md) |
| F1-00 DB | [F1-00 migraciones](hidria_coding_team/reports/F1/F1-00_arquitecto-bd_migraciones.md) |
| F1-00 seguridad | [PR-4_security](hidria_coding_team/reports/security/PR-4_security.md) · [PR-4_security_delta](hidria_coding_team/reports/security/PR-4_security_delta.md) |
| F1-00 revisiones | [PR-4_spec_delta](hidria_coding_team/reports/reviews/PR-4_spec_delta.md) · [PR-4_qa](hidria_coding_team/reports/qa/PR-4_qa.md) |
| F1-01a | [F1-01_auth_claims](hidria_coding_team/reports/F1/F1-01_auth_claims.md) |
| Estado del supervisor | [F1/00-supervisor_estado](hidria_coding_team/reports/F1/00-supervisor_estado.md) |
| Backlog | [tasks/BACKLOG.md](hidria_coding_team/tasks/BACKLOG.md) |
| Trazabilidad | [qa/trazabilidad.md](qa/trazabilidad.md) |
| Reportes previos | [coding_team_report01.md](coding_team_report01.md) · [coding_team_report02.md](coding_team_report02.md) |

---

## 9. Bitácora (desde el reporte #02)

| Fecha/hora | Hito |
|---|---|
| 2026-11-07 19:51 | Usuario aplica `required_approving_review_count = 0`; PRs #5/#4 pasan a `clean` |
| 2026-11-07 19:52 | **PR #5 mergeado** (`afffb6c`) |
| 2026-11-07 19:54 | Spec re-review de PR #4 **APROBADA** (`PR-4_spec_delta.md`) |
| 2026-11-07 19:55 | **PR #4 mergeado** (`b4fbc83`); **F1-00 cerrada** |
| 2026-11-07 19:58 | **PR #6 mergeado** (`6b95be0`); cierre documental F1-00 |
| 2026-11-07 ~20:00 | **F1-01** dividida y en marcha: task-20 (DB) + task-21 (EF) |
| 2026-11-07 ~20:03 | **PR #7 (F1-01a)** abierto; CI 4/4; head final `44891b3` |
| 2026-11-07 ~20:08 | Revisiones task-23/24/25 de #7 en curso; F1-01b en progreso |
| 2026-11-07 ~20:10 | **PR #8 (F1-01b)** entregado (`21b2ca3`, CI 4/4); revisiones task-32/33/34 |
| 2026-11-07 ~20:15 | **E3 resuelta**: hook activado por Management API y verificado con JWT real (`F0-14`) |
| 2026-11-07 ~20:18 | Seguridad levanta veto de #7 (`b67abf3`); spec pide residual `array[NULL]` |

---

## 10. Conclusión

El equipo cerró F0 y F1-00 con el esquema corregido, endurecido y verificado, y está
construyendo el **MVP núcleo** (F1-01: auth/claims). **E1 y E3 están resueltas** (ruleset y
auth hook activo con JWT verificado); el ruleset de `main` tiene checks obligatorios y sin
bypass, y el control humano es por auditoría de reportes. No hay condiciones de PARO ni
acciones de usuario que bloqueen el avance; solo quedan **E2** (staging) y **E4** (acta 0.6).

**Próximo hito:** fix residual de #7 → squash; cuórum de #8 → squash; F1-02 (shell PWA).
