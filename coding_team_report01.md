# HIDRIA — Reporte integrado del equipo de desarrollo autónomo

**Archivo:** `coding_team_report01.md`
*(Solicitado como «coding_team_report01,md»; se creó con la extensión Markdown correcta `.md`.)*

- **Fecha de generación:** 2026-11-07 19:07 (America/Mexico_City) · 2026-11-08 01:07 UTC
- **Autor:** Lead (creador) del equipo `hidria_coding_team`
- **Repositorio:** [`horaciomartinez-svg/hidria-ect`](https://github.com/horaciomartinez-svg/hidria-ect) (público)
- **`main`:** [`8008a64`](https://github.com/horaciomartinez-svg/hidria-ect/commit/8008a648161f36823302429bb302dd832a9ec231)
  (PR #2 → `1da64d0`; PR #3 → `8008a64`; PR #4 → **en revisión, no mergeable**)
- **Proyecto Supabase:** `zucalshlfcxejpukshxl` (us-east-1)
- **Staging desplegado:** **https://hidria-staging.pages.dev** (HTTP 200)
- **Fase actual:** Fase 0 **cerrada** (G0 AMARILLO-OPERATIVO; E1 resuelta) · **F1-00 en revisión**
  (PR #4 bloqueado por veto de seguridad + aprobación humana del ruleset)

---

## 1. Resumen ejecutivo

Se creó y puso en operación un equipo de **exactamente 8 agentes de IA** que construye la
plataforma HIDRIA (Metodología MD-OHI) de forma autónoma, con el bucle:

```
PLAN → ASSIGN → IMPLEMENT → PR → SPEC REVIEW → SECURITY REVIEW → QA → MERGE → DEPLOY STAGING → VERIFY
```

**Resultados de esta primera etapa:**

| Hito | Estado |
|---|---|
| Equipo constituido (8/8 agentes + gobierno + backlog + evidencia) | ✅ |
| Fase 0 — Validación ejecutada con evidencia | ✅ |
| Gate G0 | ✅ Cerrado como **AMARILLO-OPERATIVO** (E1 resuelta; E2–E4 abiertas) |
| PR #2 (fundación + evidencia, 95 archivos) | ✅ Mergeado `1da64d0` |
| PR #3 (cierre documental F0) | ✅ Mergeado `8008a64` |
| PR #4 (F1-00 migraciones correctivas) | ⚠️ En revisión: B1 resuelto en `ADR-005`, QA AMARILLO, **VETO de seguridad en corrección** |
| CI pre/post-merge | ✅ 4/4 y 2/2 checks en verde |
| Staging en Cloudflare Pages | ✅ `https://hidria-staging.pages.dev` |
| Fase 1 (MVP núcleo) | 🔄 `F1-00` en curso (`arquitecto-bd`, `task-9`) |

Las únicas intervenciones humanas pendientes son las acciones **E2–E4** y la **aprobación
manual de cada PR** que exige el ruleset `proteccion-main`.

---

## 2. Contexto y alcance

HIDRIA digitaliza la **MD-OHI**: alta de empresas, diagnósticos de 6 semanas (V1–V3, R1–R5),
repositorio documental, CAT, IIH, BHE, muestreo/custodia, IVOH, bitácora, Kanban, aula y
reportes. Stack congelado:

| Capa | Tecnología |
|---|---|
| Cliente | React 18 + TypeScript + Vite + Tailwind · **PWA offline-first** (SW + Dexie/IndexedDB, LWW por campo, cola con `client_op_id`; gates **nunca** offline) |
| Datos/Auth | Supabase (Postgres multi-tenant con RLS, Auth con custom claims, Edge Functions Deno EF-01…EF-13, Realtime, Vault) |
| Entrega/Storage | Cloudflare Pages (`*.pages.dev`), R2 (`hidria-docs`, `hidria-reports`), WAF |
| Enforcement | RLS primero; triggers como defensa final; EF solo para transacciones multi-tabla, gates con side effects, integraciones y cálculo server-side |

Reglas metodológicas duras: IVOH `0.15·F1+0.20·F2+0.20·F3+0.20·F4+0.15·F5+0.10·F6`
(semáforo <5 rojo / 5–7.9 amarillo / ≥8 verde); brecha BHE >10 % **bloquea** R3; reporte
solo con matriz 10/10; custodia con 3 transferencias firmadas; bitácora ≤ 24 h; folios solo
server-side.

---

## 3. Equipo constituido (8 agentes)

| # | Target | Rol | Entrega principal de esta etapa | Veredicto |
|---|---|---|---|---|
| 01 | `supervisor-hidria` | Orquesta; **único que mergea** | Verificación de `main`, G0 y merges de PR #2/#3 | AMARILLO / merges OK |
| 02 | `arquitecto-bd` | DDL, RLS, triggers, pgTAP | Esquema 44/44 RLS, seeds, auth hook (diseño) | VERDE / AMARILLO |
| 03 | `dev-edge-functions` | EF-01…EF-13 (Deno) | Mapa de contratos y readiness (750 líneas) | AMARILLO (bloqueos de entorno) |
| 04 | `dev-frontend-pwa` | React PWA M1–M13 | Plan de shell, ~75 rutas, Dexie/cola PWA | AMARILLO (scaffold sano) |
| 05 | `qa-tester` | `docs/05`, CI, trazabilidad | CI verde + matriz 22→32 reglas | VERDE Fase 0 |
| 06 | `revisor-especificaciones` | Revisión contra `docs/` (no programa) | Revisión PR #2 (B1–B4, R1–R3) | **APROBADO** |
| 07 | `devops-github-cloudflare` | CI/CD, Pages/R2/WAF | R2 + Pages desplegado | VERDE |
| 08 | `seguridad-privacidad` | Seguridad/privacidad; veta | Secret scan, banco de preguntas, PR #2 | VERDE / sin veto |

Gobierno completo en [TEAM.md](hidria_coding_team/TEAM.md); instrucciones en
[`hidria_coding_team/agents/`](hidria_coding_team/agents/). Cada agente tiene write scopes
disjuntos, DoD y prohibiciones. El **Lead (creador)** no forma parte de los 8 agentes
operativos.

**Bucle y segregación de funciones:** ningún agente aprueba su propio PR; el merge lo
ejecuta solo el supervisor, con CI verde + aprobación de especificaciones + aprobación de
seguridad + QA.

---

## 4. Artefactos entregados

```
hidria_coding_team/
├── TEAM.md                       # gobierno (misión, 8 agentes, gates, PARO, DoD)
├── agents/                       # 8 instrucciones (01_… a 08_…)
├── tasks/
│   ├── BACKLOG.md                # índice vivo
│   ├── F0/ (12 tareas)           # Fase 0 completa
│   └── F1/ (19 tareas)           # F1-00 … F1-18 (MVP)
├── reports/
│   ├── F0/ (14 reportes)         # evidencia de Fase 0
│   ├── F1/ (2 reportes)          # readiness EF y plan frontend
│   ├── qa/ reviews/ security/    # revisiones independientes
│   └── README.md                 # plantilla de evidencia
├── decisions/                    # ADR-000 … ADR-006
├── scripts/phase0_verify.ps1
└── .env.example                  # inventario de variables, sin valores
```

En la raíz: [`app/`](app/) (scaffold React 18 + TS + Vite + Tailwind),
[`supabase/functions/`](supabase/functions/), [`supabase/tests/`](supabase/tests/),
[`tests/`](tests/), [`qa/trazabilidad.md`](qa/trazabilidad.md),
[`scripts/ci/guardas.sh`](scripts/ci/guardas.sh), [`.github/workflows/ci.yml`](.github/workflows/ci.yml),
[`.env.example`](.env.example), [`package.json`](package.json).

**Métricas del paquete:** 71 archivos en `hidria_coding_team/`, 8 agentes, 12 tareas F0,
19 tareas F1, 19 reportes de evidencia, 7 ADR.

---

## 5. Fase 0 — verificaciones con evidencia

| # | Verificación | Resultado | Evidencia |
|---|---|---|---|
| 1 | MCP GitHub operativo; token fine-grained (sin `Administration`) | VERDE | [F0-01](hidria_coding_team/reports/F0/F0-01_devops_github.md) |
| 2 | MCP Supabase, proyecto correcto y **3 migraciones** aplicadas | VERDE | [F0-02](hidria_coding_team/reports/F0/F0-02_arquitecto-bd_supabase.md) |
| 3 | `.env` completo (9/9 variables) y **no versionado** | VERDE | [F0-03](hidria_coding_team/reports/F0/F0-03_seguridad_secretos.md) |
| 4 | Secret scanning (árbol e historial) | VERDE — 0 secretos | [F0-03](hidria_coding_team/reports/F0/F0-03_seguridad_secretos.md) |
| 5 | **44 tablas · 44/44 con RLS · 104 políticas · 6 vistas** | VERDE | [F0-04](hidria_coding_team/reports/F0/F0-04_arquitecto-bd_esquema.md) |
| 6 | Seeds oficiales 13/13 (CAT 47, completitud 10, bitácoras 8, aula 8, IVOH 6+24+1, flujos 22, calidad 19, IIH 66+6, quiz 14, org 1) | VERDE | [F0-04](hidria_coding_team/reports/F0/F0-04_arquitecto-bd_esquema.md) |
| 7 | Triggers de enforcement (6) y funciones helper (4) | VERDE | [F0-04](hidria_coding_team/reports/F0/F0-04_arquitecto-bd_esquema.md) |
| 8 | `docs/02`↔migración y `docs/03`↔seed byte-idénticos (SHA-256) | VERDE | [F0-04](hidria_coding_team/reports/F0/F0-04_arquitecto-bd_esquema.md) |
| 9 | Banco de preguntas protegido (`authenticated` sin `quiz_questions`; `v_quiz_questions` sin `correcta`) | VERDE — PostgREST 401/42501 | [F0-05](hidria_coding_team/reports/F0/F0-05_seguridad_quiz.md) |
| 10 | Protección de `main` | **AMARILLO — NO protegida** (3 intentos; token sin `Administration`) | [F0-06](hidria_coding_team/reports/F0/F0-06_supervisor_branch_protection.md) |
| 11 | CI mínima | VERDE — guardas (6/6) + lint/typecheck/build | [F0-07](hidria_coding_team/reports/F0/F0-07_devops_ci.md) |
| 12 | Monorepo + `.env.example` | VERDE — exit 0 en lint/typecheck/build | [F0-08](hidria_coding_team/reports/F0/F0-08_lead_monorepo.md) |
| 13 | Cloudflare: R2 `hidria-docs`/`hidria-reports` (privados) + Pages | VERDE — staging HTTP 200 | [F0-09](hidria_coding_team/reports/F0/F0-09_devops_cloudflare.md) |
| 14 | Auth hook `custom_access_token_hook` | AMARILLO — diseñado; activación pendiente de token | [F0-10](hidria_coding_team/reports/F0/F0-10_arquitecto-bd_auth_hook.md) |
| 15 | Equipo constituido y evidencia completa | VERDE | [F0-11](hidria_coding_team/reports/F0/F0-11_lead_equipo.md) |
| 16 | Gate G0 | **AMARILLO-OPERATIVO** (E1 resuelta; E2–E4 abiertas) | [00-supervisor](hidria_coding_team/reports/F0/00-supervisor_estado.md) · [F0-13](hidria_coding_team/reports/F0/F0-13_verificacion_ruleset_e1.md) |

Reporte consolidado: [00-LEAD-creacion-equipo.md](hidria_coding_team/reports/F0/00-LEAD-creacion-equipo.md).

---

## 6. Excepciones de Fase 0 y acciones del usuario (E2–E4 + aprobación de PRs)

Documentadas en [`ADR-004`](hidria_coding_team/decisions/ADR-004-excepciones-fase-0.md) tras
3 intentos por excepción.

| # | Excepción | Impacto | Acción requerida del usuario |
|---|---|---|---|
| **E1** | ~~Protección de `main`~~ **RESUELTA 2026-11-07 19:24** — ruleset `proteccion-main` activo (PR + 1 aprobación + required checks + no force push) | El merge exige **aprobación de GitHub**; con un solo colaborador (autor) no hay auto-aprobación posible | **Aprobar manualmente cada PR** (segunda identidad) **o** ajustar el ruleset (bypass admin / `required_approving_review_count: 0` / segundo colaborador) |
| **E2** | Sin proyecto Supabase `staging` separado del piloto | Se usa el proyecto disponible como **dev/staging sintético** | Provisionar proyecto staging + `SUPABASE_ACCESS_TOKEN`; **prohibido cargar datos reales** (`restringido_nda`) hasta separar staging↔piloto |
| **E3** | Auth hook no activado / JWT no verificado | `F1-01` lo entrega; activación bloqueada | Aportar `SUPABASE_ACCESS_TOKEN` o activarlo en el dashboard |
| **E4** | Acta de validación de contenido 0.6 | Pendiente | Firma de la Coordinación SDFI/UCI |

---

## 7. Revisiones y merges

### PR #2 — Fundación + evidencia F0
- **Contenido:** 95 archivos, +12367/−19, 6 commits.
- **CI pre-merge:** 4/4 `success` en `ffcbaf6` (runs 42430664587 y 42430668040).
- **Revisiones:** spec **APROBADO** ([PR-2_spec](hidria_coding_team/reports/reviews/PR-2_spec.md)),
  security **APROBADO CON OBSERVACIONES sin veto** ([PR-2_security](hidria_coding_team/reports/security/PR-2_security.md)),
  QA **VERDE Fase 0** ([PR-2_qa](hidria_coding_team/reports/qa/PR-2_qa.md)).
- **Merge:** squash [`1da64d0`](https://github.com/horaciomartinez-svg/hidria-ect/commit/1da64d00dac8fc1da32ecf94b84ba23295bd9b9b) (2026-11-08T00:42:16Z).
- **Hallazgos corregidos en el ciclo:** B1 (G1 inalcanzable), B2 (re-fase sin ADR),
  B3 (idempotencia), B4 (Realtime F1 vs F2) y R1–R3 → resueltos con
  [ADR-003](hidria_coding_team/decisions/ADR-003-plan-de-fases-operativo.md) y
  [ADR-006](hidria_coding_team/decisions/ADR-006-realtime-y-consistencias.md).

### PR #3 — Cierre documental post-merge
- 9 archivos, +186/−156, solo `hidria_coding_team/**`; CI 4/4.
- **Merge:** squash [`8008a64`](https://github.com/horaciomartinez-svg/hidria-ect/commit/8008a648161f36823302429bb302dd832a9ec231) (2026-11-08T00:46:36Z).
- Actualiza G0, ADR aprobados, `00-LEAD` y backlog.

**CI post-merge en `main`:** 2/2 checks `success`.

---

## 8. Decisiones de arquitectura registradas

| ADR | Decisión |
|---|---|
| [ADR-001](hidria_coding_team/decisions/ADR-001-stack-y-enforcement.md) | Stack congelado y modelo de enforcement (RLS + triggers + EF acotadas) |
| [ADR-002](hidria_coding_team/decisions/ADR-002-estructura-monorepo.md) | Estructura del monorepo (`app/`, `supabase/`, `tests/`, `qa/`, CI) |
| [ADR-003](hidria_coding_team/decisions/ADR-003-plan-de-fases-operativo.md) | Plan de fases operativo (F1 incluye IIH/BHE/IVOH + EF-07 esencial; custodia/lab/alternativas mínimos en F1; aula/EF-10/EF-12 en F2) |
| [ADR-004](hidria_coding_team/decisions/ADR-004-excepciones-fase-0.md) | Excepciones E1–E4 y controles compensatorios |
| [ADR-005](hidria_coding_team/decisions/ADR-005-claims-grants-y-correcciones.md) | Claims `organization_id`/`tenant_id`, grants DML, `security_invoker`, semilla, `profiles`, enforcement |
| [ADR-006](hidria_coding_team/decisions/ADR-006-realtime-y-consistencias.md) | Realtime en F1 y resolución de inconsistencias documentales (Q-01/Q-02/Q-03) |

---

## 9. Hallazgos técnicos de Fase 0 → plan de corrección F1

Detectados por arquitecto, seguridad y dev-ef; **todos asignados a `F1-00`** (migraciones
correctivas forward-only):

| ID | Hallazgo | Corrección |
|---|---|---|
| H-1 | 0/44 tablas con grants DML para `authenticated`/`service_role` (PostgREST/EF no funcionan) | Grants por tabla según RLS; `service_role` de servicio |
| H-2 | 5 vistas analíticas sin `security_invoker` (riesgo de fuga entre tenants) | `security_invoker=true`; `v_quiz_questions` sigue `definer` |
| H-3 | Semilla `organizations.name` con el nombre institucional **prohibido** | Migración que actualiza a SRHDS–Programa HIDRIA |
| H-4 | `profiles.global_role default 'user'` fuera del CHECK (INSERT falla 23514) | Default válido + provisión |
| H-5 | Enforcement incompleto (firma de custodia, gate F6 1/6, `vigente` único, lock de auditoría) | Triggers/constraints + pgTAP |
| H-6 | Claims `organization_id` vs `tenant_id` | Emitir ambos; normalizar en F1-01 |
| H-7 | `auth.custom_access_token_hook` no creable por el rol de migraciones | `public.custom_access_token_hook` + URI oficial |
| — | Faltan tabla de idempotencia, folio `-R1`, RPC BHE, Realtime publicado, RPC de rol, función de completitud | `M-01…M-08` en `F1-00` |
| — | Scaffold: alias `@/*` sin `resolve.alias`, `envDir` del `.env`, contraste de color | `F1-02` |

**Estado de `F1-00`:** en curso (`arquitecto-bd`, `task-9`, rama
`feature/F1-00-migraciones`); primer borrador creado:
`supabase/migrations/20261108010000_f1_00_api_idempotency.sql` (37 líneas, aún sin commit).

---

## 10. Estado actual y siguiente tarea

- **Fase:** F0 cerrada; **F1 — MVP núcleo** iniciada.
- **En curso:** `F1-00 — Migraciones correctivas y grants DML` (P0, `task-9`,
  `arquitecto-bd`): M-01…M-08 + grants + `security_invoker` + semilla + auth hook +
  enforcement H-5.
- **En cola:** `F1-01 — Auth con custom claims y roles` (`arquitecto-bd` +
  `dev-edge-functions`), dependiente de F1-00.
- **Después:** shell PWA (`F1-02`) → M1 (`F1-03`) → M2/M11+EF-01 (`F1-04`) → M3/EF-08
  (`F1-05`) → checklist/EF-03 (`F1-06`) → CAT/EF-04 (`F1-07`) → IIH+EF-09 (`F1-08`) →
  BHE/EF-05 (`F1-09`) → IVOH/EF-06 (`F1-10`) → bitácora/EF-02 (`F1-11`) → prerrequisitos
  de matriz (`F1-13/14/15`) → reporte esencial/EF-07 (`F1-12`) → Realtime (`F1-17`) →
  deploy staging (`F1-16`) → sincronización documental (`F1-18`).

Backlog vivo: [`tasks/BACKLOG.md`](hidria_coding_team/tasks/BACKLOG.md).

---

## 11. Riesgos y mitigaciones

| Riesgo | Nivel | Mitigación |
|---|---|---|
| **Aprobación humana obligatoria (ruleset `proteccion-main`)** | Alto | El usuario aprueba cada PR; los agentes no pueden auto-aprobar. Salidas: segunda identidad, bypass actor o `required_approving_review_count: 0` |
| **Veto de seguridad en PR #4 (SEC-PR4-01/02)** | Alto | Migración forward-only (revoke DML de `v_quiz_questions` + `WITH CHECK` en 7 políticas) + pgTAP; re-revisión de seguridad; no mergear hasta el fix |
| Sin staging separado (E2) | Alto | Datos sintéticos únicamente; prohibición de `restringido_nda` hasta separar entornos |
| Sin `SUPABASE_ACCESS_TOKEN` (E3) | Medio | Función entregada como migración; activación documentada; tests con claims simulados |
| Inconsistencias documentales (`docs/04` vs `docs/05` vs `docs/07`) | Medio | ADR-006 + `F1-18` de sincronización documental; `docs/02` prevalece |
| Sin Deno/Docker local | Medio | Implementar EF y verificar en CI; instalar Deno en el pipeline |
| Duplicación de runs CI (`push` + `pull_request`) | Bajo | Acotar `push` o usar `concurrency` (backlog DevOps) |
| R2 sin versionado por API | Bajo | Configurar por Dashboard/S3 API antes de documentos reales |

---

## 12. Indicadores de la etapa

| Indicador | Valor |
|---|---|
| Agentes constituidos | 8/8 |
| Tareas de backlog creadas | 12 (F0) + 19 (F1) = 31 |
| Reportes de evidencia | 21 (incluye revisiones de PR #4) |
| ADR | 7 (ADR-000…006) |
| Tablas / con RLS / vistas | 46 / 46 / 6 (tras F1-00) |
| Migraciones aplicadas | **11** (3 base + 8 de F1-00) |
| Seeds verificados | 13/13 conteos |
| Reglas en matriz de trazabilidad | 32 |
| PRs mergeados | 2 (`1da64d0`, `8008a64`); PR #4 en revisión (veto en corrección) |
| Checks CI | 4/4 pre-merge · 2/2 post-merge · 4/4 en PR #4 |
| Secretos encontrados | 0 |
| Condiciones de PARO | 0 |
| Acciones de usuario pendientes | 3 (E2–E4) + aprobación manual de PRs |

---

## 13. Índice de evidencia

| Área | Documento |
|---|---|
| Gobierno del equipo | [TEAM.md](hidria_coding_team/TEAM.md) |
| Reporte de creación | [00-LEAD-creacion-equipo.md](hidria_coding_team/reports/F0/00-LEAD-creacion-equipo.md) |
| Estado G0 | [00-supervisor_estado.md](hidria_coding_team/reports/F0/00-supervisor_estado.md) |
| GitHub/token | [F0-01](hidria_coding_team/reports/F0/F0-01_devops_github.md) |
| Supabase/migraciones | [F0-02](hidria_coding_team/reports/F0/F0-02_arquitecto-bd_supabase.md) |
| Esquema/RLS/seeds | [F0-04](hidria_coding_team/reports/F0/F0-04_arquitecto-bd_esquema.md) |
| Banco de preguntas | [F0-05](hidria_coding_team/reports/F0/F0-05_seguridad_quiz.md) |
| Secretos | [F0-03](hidria_coding_team/reports/F0/F0-03_seguridad_secretos.md) |
| Branch protection | [F0-06](hidria_coding_team/reports/F0/F0-06_supervisor_branch_protection.md) |
| CI | [F0-07 DevOps](hidria_coding_team/reports/F0/F0-07_devops_ci.md) · [F0-07 QA](hidria_coding_team/reports/F0/F0-07_qa_ci.md) |
| Cloudflare | [F0-09](hidria_coding_team/reports/F0/F0-09_devops_cloudflare.md) |
| Auth hook | [F0-10](hidria_coding_team/reports/F0/F0-10_arquitecto-bd_auth_hook.md) |
| Revisión de especificaciones | [PR-2_spec](hidria_coding_team/reports/reviews/PR-2_spec.md) |
| Revisión de seguridad | [PR-2_security](hidria_coding_team/reports/security/PR-2_security.md) |
| QA | [PR-2_qa](hidria_coding_team/reports/qa/PR-2_qa.md) |
| Readiness Edge Functions | [F1-01 contrato](hidria_coding_team/reports/F1/F1-01_dev-edge-functions_contrato.md) |
| Plan frontend PWA | [F1-02 plan](hidria_coding_team/reports/F1/F1-02_dev-frontend-pwa_plan.md) |
| Matriz de trazabilidad | [qa/trazabilidad.md](qa/trazabilidad.md) |
| Backlog | [tasks/BACKLOG.md](hidria_coding_team/tasks/BACKLOG.md) |

---

## 14. Bitácora (hitos)

| Fecha/hora (local) | Hito |
|---|---|
| 2026-11-07 ~17:24 | Inicio del modo creador; reconocimiento del entorno |
| 2026-11-07 ~17:35 | Estructura `hidria_coding_team`, TEAM.md, 8 agentes, backlog y scaffold creados; PR #2 abierto |
| 2026-11-07 ~17:39 | Fase 0 ejecutada; 8 agentes constituidos y trabajando |
| 2026-11-07 ~18:18 | Reportes F0 completos; revisiones emitidas (B1–B3 → correcciones) |
| 2026-11-07 ~18:42 | PR #2 mergeado (`1da64d0`); G0 cerrado AMARILLO-OPERATIVO |
| 2026-11-07 ~18:46 | PR #3 mergeado (`8008a64`); cierre documental |
| 2026-11-07 ~19:07 | F1-00 en curso; primer borrador de migración de idempotencia |
| 2026-11-07 ~19:19 | PR #4 (F1-00, 8 migraciones + suites) abierto; CI 4/4 verde |
| 2026-11-07 ~19:24 | **E1 resuelta**: ruleset `proteccion-main` activo (PR + 1 aprobación + checks + no force push) |
| 2026-11-07 ~19:36 | QA AMARILLO (excepción pgTAP) y **security review VETO** en PR #4; fix forward-only en curso |

---

## 15. Conclusión

El equipo `hidria_coding_team` está **constituido, gobernado, con evidencia y operando**.
La Fase 0 quedó cerrada con un entorno verificado (esquema 46/46 RLS tras F1-00, seeds, CI,
staging en Cloudflare) y la Fase 1 está en ejecución con `F1-00` en revisión. **E1 quedó
resuelta** (ruleset `proteccion-main`); las dependencias humanas son **E2–E4** y la
**aprobación manual de cada PR**. El veto de seguridad del PR #4 está en corrección
forward-only y no se mergeará hasta levantarlo. Fuera de eso, el equipo continúa solo hasta
una condición de PARO, conforme a [TEAM.md §12](hidria_coding_team/TEAM.md).

**Siguiente hito:** corregir SEC-PR4-01/02 (M-09/M-10), levantar el veto con re-revisión de
seguridad, cerrar `F1-00` y continuar con `F1-01` (auth/claims) y la ola de módulos del MVP.
