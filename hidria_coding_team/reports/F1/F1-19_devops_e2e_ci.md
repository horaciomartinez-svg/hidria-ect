# F1-19 — E2E Playwright en CI (task-49 / H-15)

- **Agente:** `devops-github-cloudflare` (07) — job CI y dependencia; **suite E2E autoría de
  `qa-tester`** (archivos versionados desde el workspace de QA)
- **Fecha:** 2026-11-08 13:15 (America/Mexico_City) · 2026-11-08T19:15Z · **actualizado 13:28**
- **Tarea:** `task-49` — F1 · E2E Playwright versionado en CI (**bloquea G1**)
- **Rama / PR:** `chore/F1-19-ci-e2e` · base `main@4765986` · **PR #23 mergeado (squash
  `cf7faa5d7ba52bd056c299bf11ad568836488cf1`)**; `main` = **`cf7faa5`**
- **Runs verdes:** PR `42514177112` (5/5, E2E job `128833457125`, `11 passed`) y post-merge
  `42514381567` (5/5, E2E job `128834097587`)
- **Entorno local:** Windows / Node 24.21.0 · Playwright 1.55.0 · Chromium gestionado
- **Entorno CI:** GitHub Actions `ubuntu-latest` · Node 22 · Chromium 1.55.0 + deps

## Resultado: VERDE local + CI (11/11) — H-15 RESUELTO

La suite versionada `tests/e2e/` (11 casos) pasa en local (**`11 passed (1.4m)`**) y en CI
(PR `42514177112`: **`11 passed (7.4s)`**, 5/5 checks; post-merge `42514381567`: 5/5). El job
`E2E Playwright` quedó estable con artefactos; H-15/task-49 cerrado por QA en
`qa/trazabilidad.md` y `reports/qa/F1-02_e2e.md`. Los 4 checks previos quedaron intactos.

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

## 5. Evidencia CI — run verde y merge

| Dato | Valor |
|---|---|
| Run CI del PR | [42514177112](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42514177112) (`pull_request`, head `01e844d`, **success**) |
| Job `E2E Playwright` | [128833457125](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42514177112/job/128833457125) — **1 m 02 s**; `Running 11 tests` → **`11 passed (7.4s)`**; todos los steps success |
| Run push del mismo head | `42514158085` (`push`) — **success**, 5/5 |
| Checks del PR | **5/5**: Guardas · Cliente · Edge Functions (Deno) · pgTAP · **E2E Playwright** |
| Artefacto | `playwright-report` id **13630053837** (200.606 B, retención 7 días) — incluye trace/screenshot/video de fallos |
| Merge | **PR #23 squash `cf7faa5d7ba52bd056c299bf11ad568836488cf1`** → `main` = **`cf7faa5`** |
| Run post-merge | [42514381567](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42514381567) (`push`, head `cf7faa5`) — **success**, 5/5; E2E job `128834097587`, artefacto `13630457311` |

El check `E2E Playwright` es estable; se recomienda añadirlo a `required_status_checks` cuando
el usuario lo haga (hoy el ruleset exige Guardas/Cliente/Deno; pgTAP y E2E quedan como checks
verdes no obligatorios, sin configurarse por API con el token actual).

## 6. Seguridad de la evidencia

- Sin secretos: Supabase ficticio (`https://test.invalid`), JWT y anon key **sintéticos**
  generados en runtime; no se versiona `.env` ni credenciales.
- `service_role`/`sb_secret_*` no aparecen en la suite (búsqueda en `tests/e2e/**`).
- Los tests no llaman a Supabase real: abortan las peticiones y siembran la sesión en
  `localStorage`; la autorización real (RLS/EF) no se prueba aquí.
- Artefactos de CI con retención 7 días; sin datos reales.

## 7. Hotfix de runner (2026-11-12)

`ubuntu-latest` migró a **Ubuntu 26.04**; **Playwright 1.55 no soporta Chromium en
`ubuntu26.04-x64`** (`ERROR: Playwright does not support chromium on ubuntu26.04-x64`). El
fallo apareció al rebasar PR #29 sobre `main@a6cc7e6` (run
[43344792439](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/43344792439)):
solo E2E falló; los otros 5 jobs quedaron verdes, así que **no es una regresión del código**.

**Fix:** el job `E2E Playwright` se fija a `runs-on: ubuntu-24.04` (noble, soportada por
`playwright install --with-deps`); los demás jobs siguen en `ubuntu-latest`. Es un hotfix de
infraestructura que desbloquea todos los PRs con E2E hasta que Playwright soporte 26.04 o se
actualice la versión. **Run verde final (head `f30ba5a`):**
[43345166355](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/43345166355)
**6/6** (E2E en ubuntu-24.04 ✅) y push `43345158752` 6/6.

## 8. Pendientes / siguiente paso

- [x] **PR #23 abierto y verde**: 5/5 checks en los runs `42514177112` (PR) y `42514158085`
      (push); merge squash `cf7faa5` y post-merge `42514381567` verde.
- [x] Avisar a `qa-tester` con run id/URL; **H-15 cerrado** y `qa/trazabilidad.md` actualizada
      (PR documental #24).
- [ ] Proponer `E2E Playwright` como required check cuando el usuario lo añada (no
      configurable por API con el token actual).
- [ ] task-50 (CI hardening): `npm audit --omit=dev`, build-time secret guard y `dist/**` scan
      (los advisories de `npm install` de este PR son del toolchain preexistente).

## Veredicto

**VERDE** — run PR **42514177112** (5/5; E2E job `128833457125`, **11 passed**, artefacto
`13630053837`) y post-merge **42514381567** (5/5; E2E job `128834097587`, artefacto
`13630457311`). **PR #23 mergeado** (squash `cf7faa5`); **H-15/task-49 cerrado por QA**.
Sin secretos; los 4 checks existentes se mantuvieron.
