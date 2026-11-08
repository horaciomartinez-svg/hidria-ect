# F1-19 — E2E Playwright en CI (task-49 / H-15)

- **Agente:** `devops-github-cloudflare` (07) — job CI y dependencia; **suite E2E autoría de
  `qa-tester`** (archivos versionados desde el workspace de QA)
- **Fecha:** 2026-11-08 13:15 (America/Mexico_City) · 2026-11-08T19:15Z
- **Tarea:** `task-49` — F1 · E2E Playwright versionado en CI (**bloquea G1**)
- **Rama / PR:** `chore/F1-19-ci-e2e` · base `main@4765986` · PR pendiente de crear
- **Entorno local:** Windows / Node 24.21.0 · Playwright 1.55.0 · Chromium gestionado
- **Entorno CI:** GitHub Actions `ubuntu-latest` · Node 22 · Chromium 1.55.0 + deps

## Resultado: VERDE local (11/11) — pendiente run de CI para H-15

La suite versionada `tests/e2e/` (11 casos) pasa en el worktree limpio con
**`11 passed (1.4m)`** usando Chromium gestionado por Playwright, sin `.env`, sin Supabase
real y sin secretos. El job `E2E Playwright` se añade a CI; se espera **5/5 checks**
(Guardas, Cliente, Deno, pgTAP, E2E). H-15 se cierra con el run id verde (§5).

## 1. Archivos del PR (atribución)

| Archivo | Autor | Contenido |
|---|---|---|
| `tests/e2e/playwright.config.ts` | **qa-tester** | config: `webServer` build+`vite preview` en `127.0.0.1:4173`, Chromium, trace/screenshot/video de fallos, reporte HTML en CI |
| `tests/e2e/shell.spec.ts` | **qa-tester** | 11 casos del shell F1-02a (protegidas→login, shell/claims, M5 F1, invitado restringido, logout, gates no encolables, B1 ×3 + LoginPage) |
| `tests/e2e/support/session.ts` | **qa-tester** | sesión/JWT sintéticos (claims ADR-005), anon key sintética para el build |
| `tests/e2e/README.md` | **qa-tester** | instrucciones locales, mapa de casos y snippet de job |
| `hidria_coding_team/reports/qa/F1-02_e2e.md` | **qa-tester** | evidencia local 11/11 (Chrome y Chromium), diseño seguro |
| `qa/trazabilidad.md` | **qa-tester** | actualización H-15/F1-02a (se incluye la versión de QA; QA la ajusta con el run id) |
| `package.json` + `package-lock.json` | **devops** | `@playwright/test@^1.55.0` en devDependencies; script `test:e2e` |
| `.github/workflows/ci.yml` | **devops** | job `E2E Playwright` (solo se añade; los 4 jobs existentes intactos) |
| `reports/F1/F1-19_devops_e2e_ci.md` | **devops** | este reporte |

## 2. Dependencia y script (paquete raíz)

```jsonc
"scripts": {
  // …existentes…
  "test:e2e": "playwright test -c tests/e2e/playwright.config.ts"
},
"devDependencies": {
  "@playwright/test": "^1.55.0",
  "@types/node": "^22.20.5"
}
```

Instalación reproducida: `npm install --save-dev @playwright/test@1.55.0` (lock actualizado;
`added 251 packages`). `npm install` reporta 13 advisories (10 moderate / 3 high) del
toolchain preexistente — se tratan en `task-50` (npm audit), no los introduce este cambio.

## 3. Job de CI (`.github/workflows/ci.yml`)

```yaml
  e2e:
    name: E2E Playwright
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Node 22
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: package-lock.json
      - name: Instalar dependencias
        run: npm ci
      - name: Instalar Chromium + dependencias del sistema
        run: npx playwright install --with-deps chromium
      - name: Ejecutar suite E2E
        run: npx playwright test -c tests/e2e/playwright.config.ts
        env:
          CI: true
          E2E_CHANNEL: none
      - name: Subir artefactos (trace/screenshot/video)
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: |
            tests/e2e/playwright-report
            tests/e2e/test-results
          retention-days: 7
          if-no-files-found: warn
```

Notas: `-c tests/e2e/playwright.config.ts` es obligatorio (no hay config en raíz);
`E2E_CHANNEL=none` fuerza Chromium gestionado (el proyecto `chrome` omite `channel`);
`CI=true` activa retries=1 y reporter HTML; artefactos con `if: always()`; el job falla si
algún E2E falla. No se modifica ningún job existente ni el ruleset.

## 4. Validación local (worktree limpio sobre `main@4765986`)

| # | Comando | Resultado |
|---|---|---|
| 1 | `npm install --save-dev @playwright/test@1.55.0` | exit 0 (lock actualizado) |
| 2 | `npx playwright install chromium` | OK (Chromium 1.55.0) |
| 3 | `E2E_CHANNEL=none npm run test:e2e` | **exit 0 — `11 passed (1.4m)`** (90.4 s total) |

Salida (resumen): los 11 casos `ok` en `tests/e2e/shell.spec.ts` — rutas protegidas (×2),
shell/claims, M5 F1, invitado restringido, logout, gates no encolables, B1 sin claims,
UUID inválido, rol fuera de enum y LoginPage sin redirect. QA ya había reportado 11/11 con
Chrome y Chromium (`npx playwright test -c tests/e2e/playwright.config.ts`, 33.9 s / 1.4 m).

## 5. Evidencia CI (pendiente de completar con run id)

| Dato | Valor |
|---|---|
| Run CI del PR | _pendiente_ |
| Job `E2E Playwright` | _pendiente_ (esperado: `11 passed`) |
| Checks esperados | **5/5** — Guardas, Cliente, Edge Functions (Deno), pgTAP, E2E Playwright |
| Artefactos | `playwright-report` + `test-results` (trace/screenshot/video de fallos) |

## 6. Seguridad de la evidencia

- Sin secretos: Supabase ficticio (`https://test.invalid`), JWT y anon key **sintéticos**
  generados en runtime; no se versiona `.env` ni credenciales.
- `service_role`/`sb_secret_*` no aparecen en la suite (búsqueda en `tests/e2e/**`).
- Los tests no llaman a Supabase real: abortan las peticiones y siembran la sesión en
  `localStorage`; la autorización real (RLS/EF) no se prueba aquí.
- Artefactos de CI con retención 7 días; sin datos reales.

## 7. Pendientes / siguiente paso

- [ ] Abrir PR y verificar **5/5 checks** en verde (run id en §5).
- [ ] Avisar a `qa-tester` con run id/URL para cerrar **H-15** y actualizar
      `qa/trazabilidad.md` (la versión incluida es la de QA; QA añade el run id).
- [ ] Proponer `E2E Playwright` como required check cuando el usuario lo añada (ruleset
      `proteccion-main` hoy exige Guardas/Cliente/Deno; pgTAP/E2E quedan como checks verdes
      no obligatorios hasta que el usuario los agregue).
- [ ] task-50: `npm audit`/build-time secret guard (advisories reportados por npm arriba).

## Veredicto

**VERDE local** (11/11) — pendiente el run de CI para el VERDE definitivo y el cierre de
H-15/task-49 por QA. El job no toca los 4 checks existentes y no usa secretos.
