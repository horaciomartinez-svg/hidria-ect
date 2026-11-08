# HIDRIA — Reporte de creación del equipo autónomo y ejecución de Fase 0

- **Autor:** Lead (creador) — `hidria_coding_team`
- **Fecha:** 2026-11-08 (America/Mexico_City)
- **Repositorio:** `horaciomartinez-svg/hidria-ect` (público) · rama `chore/f0-fundacion` / PR **#2**
- **Proyecto Supabase:** `zucalshlfcxejpukshxl` (us-east-1)
- **Entorno Cloudflare:** cuenta `67bec4f06347f4a150e12b5b2f23f77b` · Pages **https://hidria-staging.pages.dev** (HTTP 200)
- **Resultado:** **equipo constituido (8/8) · Fase 0 ejecutada · G0 AMARILLO-OPERATIVO**
  (con excepciones de credenciales documentadas y 3 acciones del usuario)

---

## 1. Estructura creada

```
hidria_coding_team/
├── TEAM.md                     # gobierno del equipo (misión, 8 agentes, bucle, PARO, DoD, gates)
├── agents/
│   ├── 01_supervisor_hidria.md
│   ├── 02_arquitecto_bd.md
│   ├── 03_dev_edge_functions.md
│   ├── 04_dev_frontend_pwa.md
│   ├── 05_qa_tester.md
│   ├── 06_revisor_especificaciones.md
│   ├── 07_devops_github_cloudflare.md
│   └── 08_seguridad_privacidad.md
├── tasks/
│   ├── BACKLOG.md              # índice vivo
│   ├── _TEMPLATE.md
│   ├── F0/  (12 tareas: F0-01 … F0-12)
│   └── F1/  (17 tareas: F1-00 … F1-16, primera ola MVP)
├── reports/
│   ├── README.md + plantilla
│   ├── F0/  (evidencia Fase 0, incluido este reporte)
│   ├── F1/  (readiness Fase 1)
│   ├── qa/ · reviews/ · security/ · deploy/ · incidentes/
├── decisions/
│   ├── ADR-000-plantilla.md
│   ├── ADR-001-stack-y-enforcement.md
│   ├── ADR-002-estructura-monorepo.md
│   ├── ADR-003-plan-de-fases-operativo.md
│   ├── ADR-004-excepciones-fase-0.md
│   └── ADR-005-claims-grants-y-correcciones.md
├── scripts/phase0_verify.ps1
└── .env.example                # inventario de variables, sin valores reales
```

Además, en la raíz del repo: `app/` (scaffold React 18 + TS + Vite + Tailwind),
`supabase/functions/`, `supabase/tests/`, `tests/`, `qa/trazabilidad.md`,
`scripts/ci/guardas.sh`, `.github/workflows/ci.yml`, `.github/PULL_REQUEST_TEMPLATE.md`,
`package.json` (workspaces), `.env.example` y `.gitignore` ampliado.

## 2. Agentes constituidos (EXACTAMENTE 8)

| # | Agente (target) | Rol | Primera tarea F0 | Reporte | Veredicto |
|---|---|---|---|---|---|
| 01 | `supervisor-hidria` | Orquesta; **único que mergea** | F0-06 + preparación G0 | `reports/F0/F0-06_…`, `00-supervisor_estado.md` | AMARILLO |
| 02 | `arquitecto-bd` | DDL, RLS, triggers, pgTAP | F0-02 / F0-04 / F0-10 | `reports/F0/F0-02_…`, `F0-04_…`, `F0-10_…` | VERDE / AMARILLO / AMARILLO |
| 03 | `dev-edge-functions` | EF-01…EF-13 (Deno) | F1-01 readiness | `reports/F1/F1-01_…contrato.md` | AMARILLO |
| 04 | `dev-frontend-pwa` | React PWA M1–M13 | F1-02 plan | `reports/F1/F1-02_…plan.md` | AMARILLO (sano) |
| 05 | `qa-tester` | `docs/05`, CI, trazabilidad | F0-07 + matriz | `reports/F0/F0-07_qa_ci.md`, `reports/qa/PR-2_qa.md` | VERDE |
| 06 | `revisor-especificaciones` | Revisa PRs (no programa) | Revisión PR #2 + backlog | `reports/reviews/PR-2_spec.md` | CAMBIOS SOLICITADOS → en corrección |
| 07 | `devops-github-cloudflare` | CI/CD, Pages/R2/WAF | F0-01 / F0-07 / F0-09 | `reports/F0/F0-01_…`, `F0-07_…`, `F0-09_…` | VERDE |
| 08 | `seguridad-privacidad` | Seguridad/privacidad; **veta** | F0-03 / F0-05 + PR #2 | `reports/F0/F0-03_…`, `F0-05_…`, `reports/security/PR-2_security.md` | VERDE / APROBADO CON OBSERVACIONES |

Tablero compartido: `task-1`…`task-8` asignadas y completadas; write scopes disjuntos.
Ningún agente mergeó, hizo push ni aplicó DDL en Fase 0.

## 3. Verificación de Fase 0 (con evidencia)

| # | Verificación | Resultado | Evidencia |
|---|---|---|---|
| 1 | MCP GitHub operativo (46 herramientas) y alcance del token | VERDE | `F0-01_devops_github.md` |
| 2 | MCP Supabase conectado al proyecto correcto y **3 migraciones** aplicadas | VERDE | `F0-02_arquitecto-bd_supabase.md` |
| 3 | `.env` completo (9/9 variables) y **no versionado** | VERDE | `F0-03_seguridad_secretos.md` |
| 4 | Secret scanning (árbol e historial) | VERDE — 0 secretos en 77 archivos y 5 commits | `F0-03_…` |
| 5 | Esquema: **44 tablas, 44/44 con RLS, 104 políticas, 6 vistas** | VERDE | `F0-04_…` |
| 6 | Seeds oficiales: CAT 47, completitud 10, bitácoras 8, aula 8, IVOH 6+24+1, flujos 22, calidad 19, IIH 66+6, quiz 14, org 1 | VERDE (13/13 conteos) | `F0-04_…` |
| 7 | Triggers de enforcement (6) y funciones helper (4) | VERDE | `F0-04_…` |
| 8 | `docs/02` ↔ migración base y `docs/03` ↔ seed **byte-idénticos** | VERDE (SHA-256) | `F0-04_…` |
| 9 | Banco de preguntas: `authenticated` sin `quiz_questions`; `v_quiz_questions` sin `correcta` (PostgREST 401/42501) | VERDE | `F0-05_…` |
| 10 | Protección de `main` | **AMARILLO — NO protegida**; token sin `Administration` (403); 3 intentos | `F0-06_…` |
| 11 | CI mínima en verde | VERDE — run 42425963485: guardas (6/6) + build | `F0-07_…` |
| 12 | Estructura del monorepo + `.env.example` | VERDE — lint/typecheck/build exit 0 | `F0-08_lead_monorepo.md` |
| 13 | Cloudflare: cuenta/token válidos, **R2 `hidria-docs` + `hidria-reports`** (privados), **Pages `hidria-staging`** desplegado | VERDE — https://hidria-staging.pages.dev HTTP 200 | `F0-09_…` |
| 14 | Auth hook `custom_access_token_hook` | **AMARILLO** — no existe; diseño documentado; activación requiere `SUPABASE_ACCESS_TOKEN` | `F0-10_…` |
| 15 | Equipo constituido (8 agentes, backlogs, ADRs, reportes) | VERDE | `F0-11_lead_equipo.md` |
| 16 | Dataset sintético | No aplica aún (F1/F2 lo genera) | — |

## 4. Hallazgos y resolución

### Bloqueantes del PR #2 detectados por el revisor (corregidos en este PR)

- **B1 — G1 inalcanzable:** E2E-07 exige matriz 10/10, que depende de custodia/lab/
  alternativas. **Resuelto con `ADR-003`**: se añaden los prerrequisitos mínimos
  (`F1-13` custodia, `F1-14` laboratorio, `F1-15` alternativas) y EF-07 esencial sigue en
  Fase 1.
- **B2 — Re-fase sin ADR:** **Resuelto con `ADR-003`** y alineación de `TEAM.md` §13,
  `agents/03`, `agents/04` y `BACKLOG.md` a un único plan.
- **B3 — Idempotencia obligatoria vs opcional:** **Resuelto**: header opcional según
  `docs/04` §2.3, obligatorio solo para la cola offline; corregidos `agents/03` y
  `supabase/functions/README.md`.

### Hallazgos de Fase 0 que pasan a F1 (registrados)

- **H-1:** 0/44 tablas con grants DML para `authenticated`/`service_role` → PostgREST/EF no
  funcionan (`F1-00`).
- **H-2:** 5 vistas analíticas sin `security_invoker` → riesgo de fuga entre tenants al
  conceder SELECT (`F1-00`).
- **H-3:** semilla `organizations.name` con el nombre institucional prohibido → migración
  correctiva (`F1-00`).
- **H-4:** `profiles.global_role default 'user'` fuera del CHECK → insert de perfil falla
  23514 (`F1-00`).
- **H-5:** brechas de enforcement (firma de custodia, gate F6 6/6, `vigente` único, lock de
  auditoría) → `F1-00`.
- **H-6/H-7:** claims `organization_id` vs `tenant_id`; hook creable solo en `public` →
  `ADR-005` + `F1-01`.
- **Scaffold:** alias `@/*` sin `resolve.alias`, `envDir` del `.env`, contraste de color →
  `F1-02`.

### Excepciones de credenciales (ADR-004, con 3 intentos documentados)

| # | Excepción | Impacto | Acción requerida del usuario |
|---|---|---|---|
| E1 | `main` **sin protección** (token sin `Administration`) | Merge depende de política + CI, no de control técnico | Activar protección en GitHub UI (PR + 1 aprobación + required checks + no force push) **o** emitir PAT con `Administration: read & write` |
| E2 | Sin proyecto Supabase `staging` separado | Se usa el proyecto disponible como dev/staging **sintético** | Provisionar proyecto staging + `SUPABASE_ACCESS_TOKEN` |
| E3 | Auth hook no activado / JWT no verificado | `F1-01` lo entrega y lo activa | Aportar `SUPABASE_ACCESS_TOKEN` o activarlo en dashboard |
| E4 | Acta de validación 0.6 | Pendiente de firma | Coordinación SDFI/UCI |

## 5. PR #2 — estado de revisión

- **Contenido:** 65 archivos, +7279/−19; scaffold + gobierno + CI + docs/07.
- **CI:** 2/2 checks `success` (run 42425963485).
- **Security review:** **APROBADO CON OBSERVACIONES, SIN VETO** (`reports/security/PR-2_security.md`).
- **QA:** **VERDE (Fase 0)** (`reports/qa/PR-2_qa.md`); 32 reglas en `qa/trazabilidad.md`.
- **Spec review:** CAMBIOS SOLICITADOS (B1–B3) → corregidos con ADR-003/005 y alineación de
  backlog; pendiente **re-revisión** y merge por `supervisor-hidria` (squash).

## 6. Gate G0

**AMARILLO-OPERATIVO.** Las 12 tareas F0 tienen evidencia; el estado no es VERDE pleno por
las excepciones E1–E4 (credenciales/acta). Se autoriza **Fase 1 con datos sintéticos
únicamente**; los datos reales (`restringido_nda`) quedan prohibidos hasta que exista
staging separado de piloto.

## 7. Siguiente tarea asignada

1. **`F1-00` — Migraciones correctivas y grants DML** (`arquitecto-bd`, P0): M-01…M-04,
   M-07, grants, `security_invoker`, semilla, auth hook `public.*`, enforcement H-5.
2. **`F1-01` — Auth con custom claims y roles** (`arquitecto-bd` + `dev-edge-functions`),
   dependiente de F1-00.
3. Después, la ola F1 en orden: F1-02 shell → F1-03 M1 → F1-04 M2/M11 → F1-05/F1-06 M3 →
   F1-07 M4 → F1-08/F1-09/F1-10 M5/M6/M8 → F1-11 M10 → F1-13/F1-14/F1-15 prerrequisitos →
   F1-12 EF-07 esencial → F1-16 deploy staging.

## 8. Cómo sigue trabajando el equipo (sin humanos entre pasos)

`PLAN → ASSIGN → IMPLEMENT → PR → SPEC REVIEW → SECURITY REVIEW → QA → MERGE →
DEPLOY STAGING → VERIFY`, con:
- backlog versionado (`tasks/`) y tablero compartido;
- evidencia obligatoria en `reports/`;
- dos revisiones independientes (spec + seguridad) y QA verde antes de merge;
- **solo** `supervisor-hidria` mergea (squash);
- PARO únicamente ante las 4 condiciones de `TEAM.md` §12.

## 9. Índice de evidencia

| Área | Reporte |
|---|---|
| Creación del equipo | `F0/00-LEAD-creacion-equipo.md` (este), `F0-11_lead_equipo.md` |
| Monorepo | `F0-08_lead_monorepo.md` |
| GitHub/token | `F0/F0-01_devops_github.md` |
| Supabase/migraciones | `F0/F0-02_arquitecto-bd_supabase.md` |
| Esquema/RLS/seeds | `F0/F0-04_arquitecto-bd_esquema.md` |
| Banco de preguntas | `F0/F0-05_seguridad_quiz.md` |
| Secretos | `F0/F0-03_seguridad_secretos.md` |
| Branch protection | `F0/F0-06_supervisor_branch_protection.md` |
| CI | `F0/F0-07_devops_ci.md`, `F0/F0-07_qa_ci.md` |
| Cloudflare | `F0/F0-09_devops_cloudflare.md` |
| Auth hook | `F0/F0-10_arquitecto-bd_auth_hook.md` |
| Revisión spec | `reviews/PR-2_spec.md` |
| Revisión seguridad | `security/PR-2_security.md` |
| QA | `qa/PR-2_qa.md` |
| Readiness EF / Frontend | `F1/F1-01_…contrato.md`, `F1/F1-02_…plan.md` |
| Estado G0 | `F0/00-supervisor_estado.md` |
