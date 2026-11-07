# Backlog HIDRIA — índice vivo

> Fuente de verdad del trabajo. Un archivo por tarea en `tasks/F0/` y `tasks/F1/`.
> El supervisor actualiza `estado` y `siguiente` al cerrar cada ciclo.
> Estados: `pendiente` · `en_progreso` · `bloqueada` · `hecha`.

## Fase 0 — Validación (gate G0)

| ID | Tarea | Dueño | Deps | Estado |
|---|---|---|---|---|
| F0-01 | MCP GitHub operativo y alcance del token | devops-github-cloudflare | — | pendiente |
| F0-02 | MCP Supabase, proyecto y 3 migraciones | arquitecto-bd | — | pendiente |
| F0-03 | `.env`, `.gitignore` y secret scanning | seguridad-privacidad | — | pendiente |
| F0-04 | Esquema, RLS, vistas y seeds en Supabase | arquitecto-bd | F0-02 | pendiente |
| F0-05 | Banco de preguntas (`quiz_questions` / `v_quiz_questions`) | seguridad-privacidad | F0-04 | pendiente |
| F0-06 | Protección de `main` verificada | supervisor-hidria | F0-01 | pendiente |
| F0-07 | CI mínima en verde | devops-github-cloudflare | F0-08 | pendiente |
| F0-08 | Estructura del monorepo + `.env.example` | lead (creador) | — | en_progreso |
| F0-09 | Cloudflare: R2 (`hidria-docs`, `hidria-reports`) y Pages | devops-github-cloudflare | F0-01 | pendiente |
| F0-10 | Auth hook `custom_access_token_hook` (función + activación) | arquitecto-bd | F0-04 | pendiente |
| F0-11 | Equipo constituido (8 agentes + TEAM.md + backlog) | lead (creador) | — | en_progreso |
| F0-12 | **Gate G0 — cierre de Fase 0** | supervisor-hidria | F0-01…F0-11 | pendiente |

## Fase 1 — MVP núcleo (archivos creados para la primera ola)

| ID | Tarea | Dueño | Deps | Estado |
|---|---|---|---|---|
| F1-01 | Auth con custom claims y roles | arquitecto-bd + dev-edge-functions | F0-12 | pendiente |
| F1-02 | Shell PWA (router, layout, sesión, tema) | dev-frontend-pwa | F1-01 | pendiente |
| F1-03 | M1 — Registro de empresas | dev-frontend-pwa | F1-02 | pendiente |
| F1-04 | M2/M11 — Diagnósticos, gates y Kanban (EF-01) | dev-edge-functions + dev-frontend-pwa | F1-03 | pendiente |
| F1-05 | M3 — Documentos y EF-08 (presign/register) | dev-edge-functions + dev-frontend-pwa | F1-04 | pendiente |
| F1-06 | M3 — Checklist documental y EF-03 | dev-edge-functions + dev-frontend-pwa | F1-05 | pendiente |
| F1-07 | M4 — CAT y EF-04 (+ seed 47 preguntas A1-v1) | dev-edge-functions + dev-frontend-pwa | F1-06 | pendiente |
| F1-08 | M5 — IIH y EF-09 (importador XLSX) | dev-edge-functions + dev-frontend-pwa | F1-04 | pendiente |
| F1-09 | M6 — BHE y EF-05 (brecha > 10 %) | dev-edge-functions + dev-frontend-pwa | F1-08 | pendiente |
| F1-10 | M8 — IVOH y EF-06 (fórmula + semáforo) | dev-edge-functions + dev-frontend-pwa | F1-09 | pendiente |
| F1-11 | M10 — Bitácora y EF-02 / EF-12 | dev-edge-functions + dev-frontend-pwa | F1-04 | pendiente |
| F1-12 | M9 — Reporte esencial y EF-07 (folio `-R1`, 10/10) | dev-edge-functions + dev-frontend-pwa | F1-10, F1-11 | pendiente |

### Planificadas (archivo se crea al asignar)

| ID | Tarea | Dueño | Fase |
|---|---|---|---|
| F1-13 | Sincronización offline (Dexie, cola, LWW) | dev-frontend-pwa | F1 |
| F1-14 | M12 — Aula y EF-11 (calificación server-side) | dev-edge-functions + dev-frontend-pwa | F1/F2 |
| F1-15 | Realtime (canales `diagnostic:{id}`, `org:{id}`, `user:{id}`) | dev-frontend-pwa | F1 |
| F1-16 | Deploy a staging (Pages + Supabase + R2) y verificación | devops-github-cloudflare + qa-tester | F1 |
| F2-01… | Custodia/laboratorios (EF-10), reportes completos, insignia OB3 | equipo | F2 |
| F3-01… | EF-07 completo, EF-13 NOM-151, CAP-01…04 | equipo | F3 |

## Convención de estados y evidencia

- Cada tarea tiene `write_scope` y `evidencia`; el dueño reporta al supervisor con la ruta
  del reporte y el PR.
- Una tarea pasa a `hecha` solo con: criterios de aceptación cumplidos, evidencia VERDE,
  PR aprobado (si tocó código) y merge del supervisor.
- Los bloqueos se documentan en `reports/incidentes/INC-<nnn>.md` y se reflejan como
  `bloqueada` con causa y acción requerida.

## Siguiente tarea

`F0-12 — Gate G0` (supervisor), tras completar F0-01…F0-11.
Primera tarea de Fase 1 en cola: `F1-01 — Auth con custom claims y roles`.
