# PR #43 — QA: F1-03c integración final M1 Empresas (`/empresas`)

- **Agente:** `qa-tester` (05) — autor del kit E2E
- **Fecha:** 2026-11-14 13:58 (America/Mexico_City)
- **Tarea:** `task-98` (F1-03c/task-82)
- **PR:** [#43](https://github.com/horaciomartinez-svg/hidria-ect/pull/43) — `ci/F1-03c-e2e-real-m1` → `main`
- **Head:** `f2f55d6a26531f63c7b6f9a37c6f86e5018551c8` · **Base:** `main` `4c48a73`
- **Diff:** 7 archivos, +729/−17 — job CI `E2E real M1 (Supabase local)`, kit QA
  (`tests/e2e/support/local-supabase.ts`, `fixtures/local-m1.sql`, `empresas.local.spec.ts`,
  `local-guard.spec.ts`, config local), `shell.spec.ts` sincronizado y reporte DevOps.
- **CI:** **7/7 checks verdes**; 14 check-runs (PR/push). Runs `43357141249` (PR) y
  `43357135169` (push). Job real: **`131661760019`** (PR) / **`131661739212`** (push) → success.

## Resultado: **VERDE** — F1-03c cerrada; E2E real RLS verificado

> La suite real corre contra **Supabase local** (`supabase start` + `db reset` + fixture) con
> JWT HS256 firmado con el secreto efímero del CLI; valida RLS/ownership reales, no mocks.
> El modo UI-level sigue en **24 passed + 6 skipped** (los 6 locales se saltan sin
> `E2E_LOCAL_SUPABASE=1`). El 7.º job **no es required** (los 6 checks del ruleset se mantienen).

## 1. E2E real (RLS) — `empresas.local.spec.ts` (6/6)

Job: `E2E real M1 (Supabase local)` — runs `43357141249`/`43357135169`; job ids
`131661760019`/`131661739212`. Paso: `supabase start` → `db reset` → fixture
`tests/e2e/fixtures/local-m1.sql` → Playwright con `E2E_LOCAL_SUPABASE=1`.

| # | Caso real | Verificación |
|---|---|---|
| 1 | **equipo crea empresa → la lee** | POST real; `created_by` = `equipo` y `organization_id` del claim vía PostgREST; recarga lista; edición PATCH y detalle |
| 2 | **empresa dedicada `…0008`** (contraparte A1, sin membresía seed) | sólo **A1 (1 fila)**; A2/B1/seed ausentes; sin CTA; API real 0 filas A2/B1 |
| 3 | **empresa seed `…0003`** (con membresía) | sólo la empresa de su diagnóstico; A1 ausente |
| 4 | **invitado** | 0 filas, sin alta, sin acceso al detalle |
| 5 | **observador con membresía** | ve la empresa de su diagnóstico y no crea |
| 6 | **empresa tenant B** | sólo B1; A1 ausente (cross-tenant real) |

Seguridad del job: JWT sintético **exp 10 min**; `assertLocalEnv` local-only
(`127.0.0.1`/`localhost`/`[::1]`); `local-guard.spec.ts` 2 tests; sin trace/video/screenshot
ni HTML en local; claves locales efímeras enmascaradas, sin `eval`; sin datos reales.

## 2. Evidencia UI-level (mock) — separada

| Suite | Resultado |
|---|---|
| `shell.spec.ts` | 11 |
| `empresas.spec.ts` (mock PostgREST) | 11 |
| `local-guard.spec.ts` | 2 |
| **Total normal** | **24 passed + 6 skipped** (locales) |
| Local (`E2E_LOCAL_SUPABASE=1`, sólo `empresas.local.spec.ts`) | **6/6** |

La E2E UI-level **no** demuestra RLS; la evidencia RLS es la del §1 (job real). Ambas se
mantienen separadas en esta evidencia.

## 3. CI y disposición

- **7/7 checks verdes**: Guardas, Cliente, Edge Functions, pgTAP, E2E Playwright, Seguridad y
  **E2E real M1**.
- **B3:** el job real **no es required** en el ruleset; los 6 checks requeridos no cambian.
- Spec/seguridad: condiciones SEC-PR43-01..04 aplicadas (local-only, artefactos sin tokens,
  sin `eval`/masking, exp corto). Sin cambios en `app/**`, `supabase/**`, migraciones ni `docs/**`.
- `docs/02` intacto; sin secretos; `main` conserva la suite mock 24/6.

## 4. Follow-ups

- **task-99** (M1–M3): edición de empresa propia en UI, `ciclo_vida` residual y a11y real no
  cubierta por E2E; no bloquea F1-03c.
- E2E real contra R2/EF queda para F1-16/F1-05 (fuera de M1).

## Dictamen

**VERDE — merge permitido.** E2E real con Supabase local verde 6/6 (job `131661760019`/
`131661739212`), 7/7 checks, RLS/created_by/ownership/cross-tenant/invitado/observador
verificados sin mocks; UI-level 24/6 separada; sin secretos ni datos reales. **F1-03c/task-82
cerrada.** QA no mergea; sin git de escritura.

## Firma

QA `qa-tester`. Solo este reporte y `qa/trazabilidad.md`; sin modificar `app/**`,
`supabase/**`, `.github/**` ni `docs/**`. Sin secretos.
