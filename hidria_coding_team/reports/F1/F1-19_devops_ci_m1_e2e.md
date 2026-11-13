# F1-19 — Job CI E2E real M1 (F1-03c, Supabase local)

- **Agente:** `devops-github-cloudflare` (07) — job CI; **kit E2E autoría de `qa-tester`**
  (archivos copiados del workspace de QA)
- **Fecha:** 2026-11-12 20:55 (America/Mexico_City) · 2026-11-13T02:55Z
- **Tarea:** `F1-03c`/task-82 — E2E **real** de M1 Empresas contra Supabase local
- **Rama / PR:** `ci/F1-03c-e2e-real-m1` · base `main@4f66816` · PR pendiente de crear
- **Entorno CI:** GitHub Actions `ubuntu-24.04` (Playwright 1.55 no soporta Chromium en 26.04),
  Node 22, Supabase CLI 3.0.0 + Docker del runner.

## Resultado: EN CURSO — job implementado; verde pendiente de CI

## 1. Archivos incluidos (atribución)

| Archivo | Autor | Contenido |
|---|---|---|
| `tests/e2e/support/local-supabase.ts` | QA | JWT HS256 firmado con `JWT_SECRET` efímero, sesión `sb-127-auth-token`, UUIDs del seed |
| `tests/e2e/fixtures/local-m1.sql` | QA | organizaciones/usuarios/empresas A1, A2, B1 sintéticas (`.invalid`) para M1 |
| `tests/e2e/empresas.local.spec.ts` | QA | **5 casos reales**: alta→lectura con `created_by`/`companies_sel`, edición; empresa propia/ajena/cross-tenant; invitado 0/sin alta; observador con membresía lee/no crea; tenant B solo B1 |
| `tests/e2e/playwright.config.ts` | QA | modo `E2E_LOCAL_SUPABASE=1` (usa `E2E_SUPABASE_ANON_KEY`), sin cambiar el modo mock |
| `.github/workflows/ci.yml` | DevOps | job **`E2E real M1 (Supabase local)`** (solo se añade; los 6 checks existentes intactos) |
| `reports/F1/F1-19_devops_ci_m1_e2e.md` | DevOps | este reporte |

El modo mock sigue siendo el de `E2E Playwright` (22/22 según QA; local spec se salta sin
`E2E_LOCAL_SUPABASE=1`).

## 2. Job de CI

```yaml
  m1-e2e-real:
    name: E2E real M1 (Supabase local)
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    steps:
      - Checkout / Node 22 / npm ci
      - supabase/setup-cli@v1 (version: 3.0.0)
      - supabase init
      - supabase start
      - supabase db reset                 # aplica migraciones + seed desde archivos
      - Exportar entorno local            # API_URL, ANON_KEY, JWT_SECRET, DB_URL
      - Instalar postgresql-client (psql)
      - psql "$DB_URL" -f tests/e2e/fixtures/local-m1.sql
      - npx playwright install --with-deps chromium
      - npx playwright test -c tests/e2e/playwright.config.ts tests/e2e/empresas.local.spec.ts
        env: E2E_LOCAL_SUPABASE=1, E2E_SUPABASE_URL/ANON_KEY/JWT_SECRET (efímeros)
      - upload-artifact playwright-report-m1-real (if: always())
```

- Exportación: `supabase status -o env` (variables verificadas en la documentación del CLI:
  `API_URL`, `DB_URL`, `ANON_KEY`; `JWT_SECRET` — los campos deprecados se siguen emitiendo);
  si falta alguna, el step falla con la lista de nombres disponibles.
- Los valores son **claves locales efímeras del runner**, no secretos del proyecto; no se
  commitean ni se escriben en el repo.
- `ubuntu-24.04` por la incompatibilidad conocida de Playwright 1.55 con Ubuntu 26.04.
- El job nuevo **no** se añade como required (los 6 actuales no se tocan).

## 3. Validación local (limitada)

El host no tiene Docker/Supabase CLI local; no se puede ejecutar el stack aquí. QA validó el
kit en su entorno (22/22 mock; local 5 skipped sin `E2E_LOCAL_SUPABASE=1`). La validación real
de este job es el propio run de CI (§4), que aplicará migraciones, fixture y ejecutará los
5 casos contra PostgREST+RLS reales.

## 4. Evidencia CI (se completa con run id)

| Dato | Valor |
|---|---|
| Checks esperados | **7/7** (6 existentes + `E2E real M1 (Supabase local)`; el nuevo no required) |
| Run CI | _pendiente_ |
| Job M1 real | _pendiente_ — 5 casos, artefactos en fallo |

## 5. Seguridad

- Sin secretos versionados: JWT/anon key se obtienen en runtime de `supabase status -o env` y
  viven solo en el proceso/CI (`$GITHUB_ENV`); no se imprimen valores.
- Fixture y usuarios **sintéticos** (`.invalid`); sin datos reales.
- No se tocan migraciones, `app/**` ni `supabase/functions/**`; solo se añaden tests E2E y job.

## 6. Pendientes / siguiente paso

- [ ] PR + run verde (run id en §4); si el nombre de alguna variable de `status -o env` difiere,
      ajustar el mapeo (el step ya imprime los nombres disponibles al fallar).
- [ ] QA: completar `reports/qa/PR-F1-03c_qa.md` y trazabilidad con el run real; pedir
      spec/seguridad.
- [ ] Mantener el job fuera de `required` hasta que el usuario/supervisor lo decida.

## Veredicto

**EN CURSO** — job implementado y listo para validación real en CI; sin secretos y sin tocar
los 6 checks existentes.
