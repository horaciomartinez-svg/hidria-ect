# F0-12 — Estado del supervisor y checklist G0 (cierre)

- **Agente:** supervisor-hidria
- **Fecha:** 2026-11-07 18:45 (America/Mexico_City) · **actualizado 2026-11-07 19:31**
- **Tarea:** `tasks/F0/F0-12_gate_g0.md`
- **Rama / PR:** `chore/f0-fundacion` → `main` / **PR #2 MERGEADO (squash)**
- **Merge commit:** `1da64d00dac8fc1da32ecf94b84ba23295bd9b9b` (`main` = `1da64d0`, 1 padre)
- **Head revisado / mergeado:** `ffcbaf6d1f1bfdeb8da27bfdcd0d53d7a96be272`
- **Entorno:** GitHub API + repo local `C:\Proyectos\hidria`

## Resultado: AMARILLO‑OPERATIVO (G0 cerrado con excepciones **E2–E4**; **E1 resuelta** 2026-11-07 19:24)

G0 se declara **cerrado con excepciones documentadas**, no en VERDE pleno, conforme a
**ADR-004** (excepciones de Fase 0) y **ADR-006** (Realtime y consistencias). Habilita Fase 1
con **datos sintéticos únicamente**. Los pendientes **E2–E4** son acciones del usuario o de la
Coordinación y quedan abiertos como riesgos controlados (ver tabla). **E1 (protección de
`main`) quedó resuelta por el usuario el 2026-11-07 19:24** con el ruleset
`proteccion-main` (ver sección "Actualización E1").

## Registro del merge de PR #2

Checklist §7 de `agents/01_supervisor_hidria.md` verificado antes de mergear:

| Criterio | Evidencia | Estado |
|---|---|---|
| PR enlaza tarea y evidencia | Cuerpo del PR + `reports/F0/*`, `reports/reviews|security|qa/*` | ✅ |
| CI verde | `ffcbaf6`: **4/4** check runs `success` (*Guardas de repositorio* + *Cliente*) en `pull_request` y `push` (runs 42430664587 y 42430668040) | ✅ |
| Spec review APROBADO | `reports/reviews/PR-2_spec.md` — nota final **APROBADO en `ffcbaf6`**, B1–B3, B4/M1/M2, R1–R4 cerrados | ✅ |
| Security review (sin veto) | `reports/security/PR-2_security.md` — **APROBADO CON OBSERVACIONES, sin VETO**; PII/account id redactados en `ffcbaf6` (SEC-DELTA-01/02) | ✅ |
| QA VERDE | `reports/qa/PR-2_qa.md` — **VERDE (Fase 0)** | ✅ |
| Sin secretos / `.env` | Guarda de secretos de CI verde; SEC-DELTA-03/04 quedan como MENORES de seguimiento | ✅ |
| `docs/02` ↔ migración base byte-idénticos | Guarda 3 de `scripts/ci/guardas.sh` en verde (CI) | ✅ |
| Rama al día / sin conflictos | `mergeable: true`, `mergeable_state: "clean"` sobre base `f6b99ce` | ✅ |
| Conventional Commits / squash | `chore(f0): fundación del equipo autónomo, monorepo, evidencia y CI mínima`; squash con 1 padre | ✅ |
| Solo el supervisor mergea | Ejecutado por `supervisor-hidria`; sin `force push` | ✅ |

**Resultado:** PR #2 `merged: true`, `state: closed`, `merged_at 2026-11-08T00:42:16Z`,
merge commit `1da64d0`. Cuerpo del PR actualizado antes del squash (6 commits, +12367/−19,
revisiones APROBADAS, excepciones E1–E4). El `push` a `main` disparó la CI
(`.github/workflows/ci.yml`, run `42430965541`): **2/2 checks `success`** sobre `1da64d0`.

## Checklist G0 — estado final

| Ítem | Criterio | Evidencia | Estado |
|---|---|---|---|
| F0-01 | MCP GitHub operativo y alcance del token | `reports/F0/F0-01_devops_github.md` (VERDE; alcance: contents/PR/checks; sin Administration) | ✅ VERDE |
| F0-02 | MCP Supabase, proyecto y 3 migraciones | `reports/F0/F0-02_arquitecto-bd_supabase.md` (VERDE; ref `zucalshlfcxejpukshxl`; 3 migraciones) | ✅ VERDE |
| F0-03 | `.env` fuera de git y secret scan limpio | `reports/F0/F0-03_seguridad_secretos.md` (VERDE con obs. MENORES) | ✅ VERDE |
| F0-04 | 44 tablas / 44 RLS / 6 vistas / seeds / triggers | `reports/F0/F0-04_arquitecto-bd_esquema.md` (AMARILLO: 44/44 RLS y 6 vistas OK; hallazgo de grants DML → `F1-00`) | 🟡 AMARILLO |
| F0-05 | Banco de preguntas protegido | `reports/F0/F0-05_seguridad_quiz.md` (VERDE en criterios F0; hallazgo MAYOR de esquema → `F1-00`) | ✅ VERDE |
| F0-06 | Protección de `main` | `reports/F0/F0-06_supervisor_branch_protection.md` — **PROTEGIDA desde 2026-11-07 19:24**: ruleset `proteccion-main` activo (PR + 1 aprobación + required checks + no force push + sin borrado) | ✅ VERDE |
| F0-07 | CI mínima en verde | `reports/F0/F0-07_devops_ci.md` + `reports/F0/F0-07_qa_ci.md` (VERDE; CI 2 jobs) | ✅ VERDE |
| F0-08 | Monorepo y `.env.example` | `reports/F0/F0-08_lead_monorepo.md` (VERDE) | ✅ VERDE |
| F0-09 | Cloudflare R2 / Pages | `reports/F0/F0-09_devops_cloudflare.md` (VERDE; `hidria-staging.pages.dev` HTTP 200) | ✅ VERDE |
| F0-10 | Auth hook preparado / activación documentada | `reports/F0/F0-10_arquitecto-bd_auth_hook.md` (AMARILLO; función documentada, **activación pendiente** → **E3**) | 🟡 AMARILLO |
| F0-11 | Equipo constituido | `reports/F0/F0-11_lead_equipo.md` (VERDE) | ✅ VERDE |
| F0-12 | Gate G0 | Este reporte | 🟡 AMARILLO‑OPERATIVO |
| — | PR #2 revisado y mergeado (squash) | Merge `1da64d0` | ✅ |

## Excepciones E1–E4 (ADR-004) y su acción

| # | Excepción | Evidencia | Acción requerida (usuario/Coordinación) | Riesgo controlado |
|---|---|---|---|---|
| **E1** | ~~`main` sin protección~~ **RESUELTA por el usuario (2026-11-07 19:24)** con ruleset `proteccion-main` (active, `refs/heads/main`): `deletion`, `pull_request` (1 aprobación, dismiss stale), `required_status_checks` (`Guardas de repositorio` + `Cliente`), `non_fast_forward` | `reports/F0/F0-06_supervisor_branch_protection.md` (anexo E1-resuelta) | **Aprobación manual de cada PR**: el usuario debe aprobar desde una segunda identidad (GitHub prohíbe auto-aprobar; `bypass_actors: []`). No usar bypass ni cambiar el ruleset | Gate mecánico activo (PR + checks + no force push). Mientras no haya segunda identidad, el merge queda `blocked`; el supervisor no intenta mergear sin esa aprobación |
| **E2** | Sin proyecto Supabase `staging` separado del piloto | `reports/F0/F0-02_arquitecto-bd_supabase.md`, `reports/F1/F1-01_dev-edge-functions_contrato.md` | Provisionar proyecto `staging` dedicado | `zucalshlfcxejpukshxl` como dev/staging; **prohibido cargar datos reales** (`restringido_nda`) hasta la separación |
| **E3** | Auth hook sin activar / JWT no verificado | `reports/F0/F0-10_arquitecto-bd_auth_hook.md` | Activar el hook desde dashboard o aportar `SUPABASE_ACCESS_TOKEN` | Claims simulados + `SET LOCAL ROLE` en pruebas; la función se entregará en `F1-00`/`F1-01` |
| **E4** | Acta de validación 0.6 (Coordinación) | `tasks/F0/F0-12_gate_g0.md` | Firma de la Coordinación | No bloquea desarrollo sintético; sí bloquea G1/G3 |

ADR-004 y ADR-006 quedan **aprobados por el supervisor con este reporte** (el revisor ya los
aprobó en `reports/reviews/PR-2_spec.md` §"ADR"; `decisions/` no es write scope del
supervisor, el Lead/Revisor reflejarán el estado `aceptada`). ADR-002/003/005 aprobados en
la misma revisión.

## Actualización 2026-11-07 19:24 — E1 resuelta (ruleset de protección)

El usuario activó la protección de `main` con un **ruleset** (no branch protection clásica).
Verificado por el supervisor vía API REST a las 19:31:

| Regla | Parámetros |
|---|---|
| `deletion` | bloquea el borrado de `main` |
| `pull_request` | `required_approving_review_count: 1` · `dismiss_stale_reviews_on_push: true` · `require_extra_approval_for_unattributed_changes: true` · merge methods merge/squash/rebase |
| `required_status_checks` | `Guardas de repositorio` + `Cliente (lint + typecheck + build)` (strict=false) |
| `non_fast_forward` | prohíbe force push |
| `bypass_actors` | `[]` · `current_user_can_bypass: "never"` |

- `GET /branches/main` → **`protected: true`**; ruleset `proteccion-main` (id `26780941`),
  `enforcement: active`, `refs/heads/main`.
- **Efecto inmediato:** PR #4 → **`mergeable_state: "blocked"`** (antes `clean`). El único
  colaborador es `horaciomartinez-svg` (autor de los PRs) y GitHub **no permite autoaprobar**;
  con `bypass_actors: []`, **cada PR requiere la aprobación manual del usuario desde una
  segunda identidad** para poder mergearse. Las aprobaciones del equipo en `reports/` no
  satisfacen el gate mecánico.
- **Instrucción vigente:** el supervisor **no intenta mergear** hasta que conste esa
  aprobación y **no usa bypass** ni modifica el ruleset. Aplica desde ya a PR #4 (F1-00), que
  queda con CI 4/4 y las revisiones registradas a la espera de la aprobación del usuario.
- **Salidas (solo el usuario):** (1) añadir un `bypass_actor` al ruleset para el rol
  Repository admin o para `horaciomartinez-svg`; (2) poner `required_approving_review_count: 0`
  manteniendo `required_status_checks` + `non_fast_forward`; (3) añadir un segundo colaborador
  con permiso de escritura que apruebe desde otra identidad (no el autor).

## Hallazgos y deuda de seguimiento (no bloquean F1)

1. **E1 cerrada** (2026-11-07 19:24): `main` protegida por el ruleset `proteccion-main`.
   Nueva restricción operativa: el gate mecánico exige 1 review de GitHub que, con una sola
   identidad, solo puede aportar el usuario desde una segunda cuenta; hasta entonces los PRs
   quedan `blocked`. No usar bypass ni cambiar el ruleset.
2. **SEC-DELTA-03** (MENOR): CI corre en `push` a cualquier rama → doble run; no cambia
   permisos (`contents: read`). **SEC-DELTA-04** (MENOR): la guarda 4 no valida
   `.env.example` anidado; queda para DevOps.
3. **Defectos de esquema** detectados en F0 (grants DML PostgREST, idempotencia, auditoría,
   folio, Realtime `M-05`, RPC de rol `M-06`, completitud `M-08`, default de
   `profiles.global_role`, `security_invoker`) → tarea **`F1-00`** (arquitecto-bd), P0,
   habilita todo F1.
4. **Sincronización documental** (`docs/07` §3, `docs/01/02/04/05`) → tarea **`F1-18`**.

## Próximos pasos

1. **F1-00 entregada** por `arquitecto-bd`: PR #4 (head `4b057b3`, CI 4/4; 8 migraciones +
   4 suites pgTAP + reporte VERDE). Spec review, security review y QA en curso; QA ya emitió
   **AMARILLO con excepción pgTAP documentada** (`reports/qa/PR-4_qa.md`, task-13 obligatoria
   antes de G1). El PR queda **pendiente de la aprobación manual del usuario** para el squash
   merge por el ruleset.
2. Mantener **E2–E4** como pendientes de usuario y **E1** como resuelta (re-verificar el
   ruleset en cada ciclo); cada merge requiere la aprobación manual del usuario desde una
   segunda identidad.
3. Tras `F1-00`: `F1-01 — Auth con custom claims y roles`; después la ola F1 (F1-02…F1-18)
   según ADR-003/ADR-006.
4. `F1-18` actualiza la documentación a las decisiones ADR-003/005/006.

## Pendientes abiertos

- [x] **E1** — protección de `main` (resuelta por el usuario 2026-11-07 19:24, ruleset `proteccion-main`).
- [ ] **Aprobación manual de cada PR** por el usuario desde una segunda identidad (requisito del ruleset; sin bypass).
- [ ] E2 — proyecto Supabase `staging` (usuario).
- [ ] E3 — activación del auth hook (usuario; función ya entregada en F1-00 / PR #4).
- [ ] E4 — acta de validación de contenido (Coordinación).
- [ ] SEC-DELTA-03/04 (DevOps, seguimiento MENOR).
- [ ] **F1-00 (PR #4)**: lista con CI 4/4 y revisiones en curso; pendiente la aprobación del usuario para el squash merge.
