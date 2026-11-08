# Backlog HIDRIA — índice vivo

> Fuente de verdad del trabajo. Un archivo por tarea en `tasks/F0/` y `tasks/F1/`.
> El supervisor actualiza `estado` y `siguiente` al cerrar cada ciclo.
> Estados: `pendiente` · `en_progreso` · `bloqueada` · `hecha`.
> **Plan de fases vigente:** `decisions/ADR-003-plan-de-fases-operativo.md`.
> **Excepciones de Fase 0:** `decisions/ADR-004-excepciones-fase-0.md`.

## Fase 0 — Validación (gate G0 — AMARILLO-OPERATIVO con excepciones ADR-004)

| ID | Tarea | Dueño | Deps | Estado |
|---|---|---|---|---|
| F0-01 | MCP GitHub operativo y alcance del token | devops-github-cloudflare | — | hecha (VERDE) |
| F0-02 | MCP Supabase, proyecto y 3 migraciones | arquitecto-bd | — | hecha (VERDE) |
| F0-03 | `.env`, `.gitignore` y secret scanning | seguridad-privacidad | — | hecha (VERDE) |
| F0-04 | Esquema, RLS, vistas y seeds en Supabase | arquitecto-bd | F0-02 | hecha (VERDE; hallazgo grants DML → F1-00) |
| F0-05 | Banco de preguntas (`quiz_questions` / `v_quiz_questions`) | seguridad-privacidad | F0-04 | hecha (VERDE; hallazgo grants → F1-00) |
| F0-06 | Protección de `main` verificada | supervisor-hidria | F0-01 | **AMARILLO** — NO protegida; token sin Administration; acción del usuario (ADR-004 E1) |
| F0-07 | CI mínima en verde | devops-github-cloudflare | F0-08 | hecha (VERDE) |
| F0-08 | Estructura del monorepo + `.env.example` | lead (creador) | — | hecha (VERDE) |
| F0-09 | Cloudflare: R2 (`hidria-docs`, `hidria-reports`) y Pages | devops-github-cloudflare | F0-01 | hecha (VERDE; `hidria-staging.pages.dev` HTTP 200) |
| F0-10 | Auth hook `custom_access_token_hook` (función + activación) | arquitecto-bd | F0-04 | hecha (función documentada; activación pendiente por credencial, ADR-004 E3) |
| F0-11 | Equipo constituido (8 agentes + TEAM.md + backlog) | lead (creador) | — | hecha (VERDE) |
| F0-12 | **Gate G0 — cierre de Fase 0** | supervisor-hidria | F0-01…F0-11 | hecha — **G0 AMARILLO-OPERATIVO** (ADR-004 E1–E4); PR #2 mergeado squash `1da64d0` (2026-11-07) |

## Fase 1 — MVP núcleo (ADR-003)

| ID | Tarea | Dueño | Deps | Estado |
|---|---|---|---|---|
| F1-00 | Migraciones correctivas + grants DML PostgREST (`M-01…M-08`: idempotencia, auditoría, folio, RPC BHE, Realtime, RPC rol, default perfil, completitud) | arquitecto-bd | F0-12 | pendiente (P0; habilita todo F1) |
| F1-01 | Auth con custom claims y roles | arquitecto-bd + dev-edge-functions | F1-00 | pendiente |
| F1-02 | Shell PWA (router, layout, sesión, tema) | dev-frontend-pwa | F1-01 | pendiente |
| F1-03 | M1 — Registro de empresas | dev-frontend-pwa | F1-02 | pendiente |
| F1-04 | M2/M11 — Diagnósticos, gates y Kanban (EF-01) | dev-edge-functions + dev-frontend-pwa | F1-03 | pendiente |
| F1-05 | M3 — Documentos y EF-08 (presign/register) | dev-edge-functions + dev-frontend-pwa | F1-04 | pendiente |
| F1-06 | M3 — Checklist documental y EF-03 | dev-edge-functions + dev-frontend-pwa | F1-05 | pendiente |
| F1-07 | M4 — CAT y EF-04 (+ seed 47 preguntas A1-v1) | dev-edge-functions + dev-frontend-pwa + arquitecto-bd | F1-06 | pendiente |
| F1-08 | M5 — IIH y EF-09 (`kind='iih'`, XLS-01/02) | dev-edge-functions + dev-frontend-pwa | F1-04 | pendiente |
| F1-09 | M6 — BHE, EF-05 (brecha > 10 %) y EF-09 (`kind='bhe'`) | dev-edge-functions + dev-frontend-pwa | F1-08 | pendiente |
| F1-10 | M8 — IVOH y EF-06 (fórmula + semáforo) | dev-edge-functions + dev-frontend-pwa | F1-09 | pendiente |
| F1-11 | M10 — Bitácora y EF-02 (cierre ≤ 24 h) | dev-edge-functions + dev-frontend-pwa | F1-04 | pendiente |
| F1-12 | M9 — Reporte esencial y EF-07 (folio `-R1`, matriz 10/10) | dev-edge-functions + dev-frontend-pwa | F1-10, F1-11, F1-13, F1-14, F1-15 | pendiente |
| F1-13 | M7 mínimo — muestras y 3 transferencias de custodia (captura) | dev-frontend-pwa | F1-04 | pendiente |
| F1-14 | M7 mínimo — resultados de laboratorio con dictamen manual | dev-frontend-pwa | F1-13 | pendiente |
| F1-15 | M9 mínimo — cartera de alternativas validada en R4 | dev-frontend-pwa | F1-04 | pendiente |
| F1-16 | Deploy a staging (Pages + Supabase + R2) y verificación | devops-github-cloudflare + qa-tester | F1-12 | pendiente |
| F1-17 | Realtime — canales `diagnostic:{id}`, `org:{id}`, `user:{id}` (RT-01/02) | dev-frontend-pwa + arquitecto-bd | F1-04 | pendiente |
| F1-18 | Sincronización documental (docs/07 §3, docs/01/02/04/05) | revisor-especificaciones + arquitecto-bd | F1-00 | pendiente |

> **Nota ADR-003:** F1-13/F1-14/F1-15 son los **prerrequisitos mínimos** de la matriz
> 10/10 (`p4_custodia`, `p6_lab`, `p9_alternativas`) para que EF-07/E2E-07 sean alcanzables
> en Fase 1 sin adelantar EF-10 (que automatiza el dictamen en Fase 2).

## Fase 2 — Completa (G2)

| ID | Tarea | Dueño | Fase |
|---|---|---|---|
| F2-01 | EF-10 — dictamen de laboratorio y cierre de custodia | dev-edge-functions + arquitecto-bd | F2 |
| F2-02 | M7 completo — muestreo y cadena de custodia (UI completa) | dev-frontend-pwa | F2 |
| F2-03 | EF-11 + M12 — Aula MD-OHI, examen server-side e insignia OB3 | dev-edge-functions + dev-frontend-pwa | F2 |
| F2-04 | EF-12 — reprogramación de hitos y semáforo de atraso | dev-edge-functions + dev-frontend-pwa | F2 |
| F2-05 | M9 completo — reportes y Plan de Acción (Gantt) | dev-edge-functions + dev-frontend-pwa | F2 |

## Fase 3 — Piloto (G3)

| ID | Tarea | Dueño | Fase |
|---|---|---|---|
| F3-01 | EF-07 completo (matriz 10/10, M9 avanzado) | dev-edge-functions + dev-frontend-pwa | F3 |
| F3-02 | EF-13 — firma NOM-151 tras flag `NOM151_ENABLED` | dev-edge-functions + devops | F3 |
| F3-03 | M13 — tableros agregados (datos anonimizados) + CAP-01…04 | equipo | F3 |

## Convención de estados y evidencia

- Cada tarea tiene `write_scope` y `evidencia`; el dueño reporta al supervisor con la ruta
  del reporte y el PR.
- Una tarea pasa a `hecha` solo con: criterios de aceptación cumplidos, evidencia VERDE,
  PR aprobado (si tocó código) y merge del supervisor.
- Los bloqueos se documentan en `reports/incidentes/INC-<nnn>.md` y se reflejan como
  `bloqueada` con causa y acción requerida.

## Siguiente tarea

`F1-00 — Migraciones correctivas y grants` (arquitecto-bd; incluye M-05 Realtime, M-06 RPC
de rol y M-08 completitud), luego `F1-01 — Auth`. Realtime (F1-17) es Fase 1 según ADR-006.
**F0 cerrada:** PR #2 mergeado con squash (`1da64d0`, 2026-11-07) tras spec APROBADO,
seguridad sin veto, QA VERDE y CI 4/4 en `ffcbaf6`; evidencia en
`reports/F0/00-supervisor_estado.md`.
Bloqueo de usuario vigente: protección de `main` (ADR-004 E1), proyecto Supabase staging
(E2) y activación del auth hook (E3).
