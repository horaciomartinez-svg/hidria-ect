# E2E Playwright — shell HIDRIA (F1-02a / task-49 / H-15)

Suite **versionada** que sustituye al smoke que vivía fuera del repo (`%TEMP%`). Cubre el
shell F1-02a sin Supabase real: el cliente apunta a `https://test.invalid`, las peticiones
de red se abortan (las rutas `/auth/v1/**` se responden para permitir logout) y la sesión se
siembra en `localStorage` con un JWT sintético con los claims ADR-005.

## Ejecución local

```powershell
# 1) Dependencia (la añade DevOps al package.json raíz; mientras: instalación no-save)
npm install --no-save @playwright/test@1.55.0

# 2) Navegador gestionado por Playwright (recomendado; el config usa Chromium por defecto)
npx playwright install --with-deps chromium

# 3) Suite
npx playwright test -c tests/e2e/playwright.config.ts

# Alternativa con Chrome estable del host:
$env:E2E_CHANNEL='chrome'; npx playwright test -c tests/e2e/playwright.config.ts
```

`webServer` compila `app/` (`npm run build`) y sirve el build de producción con
`vite preview` en `127.0.0.1:4173`; inyecta un URL/anon-key sintéticos para pasar el guard
build-time de `vite.config.ts`. No se necesita `.env`, ni Supabase real, ni Docker. Los
artefactos de fallo (trace, screenshot, video) se generan en `tests/e2e/test-results/`.

## Casos cubiertos (11)

| # | Caso | Evidencia |
|---|---|---|
| 1 | Sin sesión, `/kanban` → `/login` | `shell.spec.ts` |
| 2 | Sin sesión, `/` → `/login` | |
| 3 | Con sesión válida (`equipo`) monta panel, nav, breadcrumbs y claims (rol/org) | |
| 4 | M5 `/iih` muestra fase **F1** (ADR-003) | |
| 5 | Rol `invitado` restringido en `/kanban` (no monta placeholder; página de acceso restringido) | |
| 6 | Logout → `/login` | |
| 7 | `/sincronizacion` lista gates **EF-01…07, EF-10, EF-12** y no simula cola (`— no implementado`) | |
| 8 | B1: JWT **sin claims** de org/rol → no shell, redirección + aviso | |
| 9 | B1: `organization_id` con **UUID inválido** → no shell | |
| 10 | B1: `global_role` **fuera del enum** → no shell | |
| 11 | B1: `/login` **no redirige** a `/` con claims inválidos | |

Los flujos completos **E2E-01/E2E-09** de `docs/05` se añadirán cuando existan las pantallas
reales (M2/M4/M6…); estos 11 casos cubren el shell y los negativos B1 de la revisión de #12.

## Integración CI (pendiente de DevOps)

`package.json` raíz:

```json
"scripts": { "test:e2e": "playwright test -c tests/e2e/playwright.config.ts" },
"devDependencies": { "@playwright/test": "^1.55.0" }
```

Job (nombre de check estable **`E2E Playwright`**, se propondrá como required):

```yaml
e2e:
  name: E2E Playwright
  runs-on: ubuntu-latest
  needs: [guardas, cliente]
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: 22, cache: npm }
    - run: npm ci
    - run: npx playwright install --with-deps chromium
    - run: npx playwright test -c tests/e2e/playwright.config.ts
    - uses: actions/upload-artifact@v4
      if: always()
      with:
        name: playwright-report
        path: |
          tests/e2e/playwright-report
          tests/e2e/test-results
        retention-days: 7
```

Sin secretos: no hay usuarios reales ni contraseñas; no se versiona `.env`. El JWT de prueba
se genera en runtime (`support/session.ts`) y sólo porta claims; la firma no se valida en el
cliente (la autorización real es RLS/EF).
