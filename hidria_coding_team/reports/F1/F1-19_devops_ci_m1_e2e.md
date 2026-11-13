# F1-19 — Job CI E2E real M1 (F1-03c, Supabase local)

- **Agente:** `devops-github-cloudflare` (07) — job CI; **kit E2E autoría de `qa-tester` +
  ajustes de `dev-frontend-pwa`** (handoff en `.handoff/f1-03c-e2e/`)
- **Fecha:** 2026-11-12 21:05 (America/Mexico_City) · 2026-11-13T03:05Z
- **Tarea:** `F1-03c`/task-82 — E2E **real** de M1 Empresas contra Supabase local
- **Rama / PR:** `ci/F1-03c-e2e-real-m1` · base `main@4c48a73` · PR [#43](https://github.com/horaciomartinez-svg/hidria-ect/pull/43)
- **Entorno CI:** GitHub Actions `ubuntu-24.04` (Playwright 1.55 no soporta Chromium en 26.04),
  Node 22, Supabase CLI 3.0.0 + Docker del runner.

## Resultado: EN CURSO — job implementado con condiciones de seguridad; verde pendiente de CI

## 1. Archivos incluidos (atribución)

| Archivo | Autor | Contenido |
|---|---|---|
| `tests/e2e/support/local-supabase.ts` | QA/dev-frontend | JWT HS256 con `JWT_SECRET` efímero (exp **10 min**), sesión `sb-127-auth-token`, guard **local-only** (`127.0.0.1`/`localhost`/`[::1]`), UUIDs del seed + `empresaDedicadaA1` (`…0008`) |
| `tests/e2e/fixtures/local-m1.sql` | QA/dev-frontend | org B, usuarios A/B y **contraparte dedicada `…0008` sin `project_members`**; empresas A1 (contraparte `…0008`), A2 y B1 sintéticas |
| `tests/e2e/empresas.local.spec.ts` | QA/dev-frontend | **6 casos reales**: equipo alta→lectura/edición; contraparte A1 ve sólo A1; seed `…0003` ve sólo su empresa (1); invitado 0/sin alta; observador membresía; tenant B sólo B1 |
| `tests/e2e/local-guard.spec.ts` | dev-frontend | 2 pruebas del guard local-only (corren también en suite normal) |
| `tests/e2e/playwright.config.ts` | QA/dev-frontend | modo local: sólo `empresas.local.spec.ts`, **sin trace/video/screenshot**, reporter `list`; modo mock intacto |
| `.github/workflows/ci.yml` | DevOps | job **`E2E real M1 (Supabase local)`** (solo se añade; los 6 checks existentes intactos) |
| `reports/F1/F1-19_devops_ci_m1_e2e.md` | DevOps | este reporte |

El modo mock (`E2E Playwright`) sigue igual: **24 passed + 6 skipped** (local spec omitido sin
`E2E_LOCAL_SUPABASE=1`); `--list` local = **6 tests**.

## 2. Job de CI (job `m1-e2e-real`, nombre `E2E real M1 (Supabase local)`)

`ubuntu-24.04`, `timeout-minutes: 30`:

1. `npm ci`; `supabase/setup-cli@v1` 3.0.0; `supabase init`.
2. `supabase start` con **log silenciado** (puede incluir claves locales efímeras); `supabase db reset`.
3. **Claves efímeras sin `eval`:** `supabase status -o env > "$RUNNER_TEMP/supabase.env"`;
   `grep`/`cut` para `ANON_KEY`, `JWT_SECRET`, `DB_URL`; `::add-mask::` de las 3; se escriben a
   `$GITHUB_ENV` (`E2E_SUPABASE_ANON_KEY`, `E2E_SUPABASE_JWT_SECRET`, `E2E_SUPABASE_URL=http://127.0.0.1:54321`, `DB_URL`).
4. `postgresql-client` + `psql "$DB_URL" -f tests/e2e/fixtures/local-m1.sql`.
5. `npx playwright install --with-deps chromium`.
6. `E2E_LOCAL_SUPABASE=1 npx playwright test -c tests/e2e/playwright.config.ts tests/e2e/empresas.local.spec.ts`
   (`CI=true`, `E2E_CHANNEL=none`). **Sin `upload-artifact`**: trace/video/screenshot off y no se
   publican `playwright-report`/`test-results` del job local.
7. `if: always()`: `supabase stop --no-backup || true`.

## 3. Condiciones de seguridad cubiertas

| Condición | Implementación |
|---|---|
| **SEC-PR43-01** local-only | `isLocalSupabaseUrl`/`assertLocalEnv` acepta sólo `127.0.0.1`/`localhost`/`[::1]`; test negativo en `local-guard.spec.ts` y en el spec local |
| **SEC-PR43-02** sin artefactos con JWT | En modo local: `trace/screenshot/video = off`, reporter `list`, **sin artifact upload** en el job M1 |
| **SEC-PR43-03** masking/sin `eval` | Parseo con `grep`/`cut`, `::add-mask::` para `ANON_KEY`/`JWT_SECRET`/`DB_URL`; `supabase start` con log silenciado |
| **SEC-PR43-04** exp corto | JWT local `exp = now + 10 min` (`LOCAL_JWT_TTL_SECONDS`), sin refresh |
| Sin secretos reales | Claves efímeras del CLI local; fixture `.invalid`; nada versionado ni pasado a `app/**` |

## 4. Validación local (sin Docker; el stack real lo valida CI)

- `--list` modo normal: **30 tests** (24 mock + 6 local saltados); `--list` con
  `E2E_LOCAL_SUPABASE=1`: **6 tests** de `empresas.local.spec.ts`.
- `local-guard.spec.ts` en modo normal: **2 passed**.
- `npm ci` OK tras merge de `main@4c48a73`.

## 5. Evidencia CI (se completa con run id)

| Dato | Valor |
|---|---|
| PR | [#43](https://github.com/horaciomartinez-svg/hidria-ect/pull/43) |
| Checks esperados | **7/7** (6 existentes + `E2E real M1 (Supabase local)`; el nuevo **no required**) |
| Run CI | _pendiente_ |
| Job M1 real | _pendiente_ — 6 casos reales, sin artefactos |

## 6. Pendientes / siguiente paso

- [ ] Push e2e verde 7/7 (run id en §5); si `supabase status -o env` usa otros nombres, el step
      imprime los disponibles y se ajusta el mapeo.
- [ ] QA: dictamen con run id (`reports/qa/PR-F1-03c_qa.md`) e integración en trazabilidad.
- [ ] B3: el 7.º job queda **no required** documentado (decisión del usuario/supervisor); los
      M1–M3 de F1-03c son follow-ups task-99, no parte de este PR CI.

## Veredicto

**EN CURSO** — job implementado con handoff final (6 casos locales, B1 con contraparte dedicada
`…0008`) y condiciones SEC-PR43-01..04; pendiente run real 7/7. Sin tocar los 6 checks existentes.
