# F1-19 — CI hardening: audit de dependencias + escaneo de bundle (task-50, parte 1)

- **Agente:** `devops-github-cloudflare` (07)
- **Fecha:** 2026-11-08 13:35 (America/Mexico_City) · 2026-11-08T19:35Z
- **Tarea:** `task-50` — F1 · CI hardening (SEC-PR12-01/02/08), **bloqueante de G1**
- **Rama / PR:** `chore/F1-19-ci-hardening` · base `main@8e4e258`; merge con
  `main@057ad79` (#21 F1-02b A/2 y #26 task-59 ya mergeados; no tocan estos scripts)
- **Alcance de esta entrega:**
  1. job **`Seguridad (dependencias y bundle)`** con `npm audit --omit=dev` (falla en
     high/critical; únicos advisories de producción actuales son **moderate** de react-router
     con excepción documentada);
  2. escaneo de **`app/dist/**`** que rechaza credenciales de servicio
     (`sb_secret_*`, `SUPABASE_SERVICE_ROLE_KEY` con valor, JWT con `role=service_role`);
  3. prueba del **guard build-time** ya existente en `app/vite.config.ts` (SEC-PR12-01):
     `scripts/ci/build-guard-test.mjs` verifica con claves sintéticas que rechaza
     `sb_secret_*`/service_role/ilegibles y acepta anon pública. **No se modifica
     `app/vite.config.ts`** (el guard de F1-02a se conservó en #21; así no hay conflicto).

## Resultado: VERDE local — pendiente run de CI

Los scripts pasan en local con el árbol actual y fallan correctamente con fixtures
negativos. El job nuevo se suma a los 5 checks actuales sin relajarlos; se espera **6/6**
(Guardas, Cliente, Deno, pgTAP, E2E, **Seguridad**).

## 1. Job de CI añadido (`.github/workflows/ci.yml`)

```yaml
  security:
    name: Seguridad (dependencias y bundle)
    runs-on: ubuntu-latest
    timeout-minutes: 20
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
      - name: Auditoría de producción (npm audit --omit=dev)
        run: node scripts/ci/npm-audit.mjs
      - name: Build del cliente
        run: npm run build
      - name: Escaneo de credenciales en el bundle (dist)
        run: node scripts/ci/dist-scan.mjs
```

Los 5 jobs existentes (`guardas`, `cliente`, `functions`, `pgtap`, `e2e`) quedan **intactos**;
solo se añade `security`. Nombre estable para poder proponerlo como required cuando el usuario
lo añada al ruleset (no se toca el ruleset).

## 2. `npm audit --omit=dev` (SEC-PR12-02/08)

`scripts/ci/npm-audit.mjs`:

- Ejecuta `npm audit --omit=dev --json` (o lee un JSON de fixture para pruebas) y parsea
  `vulnerabilities`/`metadata`.
- **Falla (exit 1)** si hay paquetes **high** o **critical** de producción sin excepción
  documentada. **critical nunca se acepta**, ni con allowlist.
- Sigue la cadena `via: ["react-router"]` de npm audit para no fallar por la dependencia
  transitiva cuando el advisory allowlisted vive en la directa.
- Allowlist versionada `scripts/ci/npm-audit-allowlist.json` con GHSA + paquetes + razón +
  tarea: **GHSA-wrjc-x8rr-h8h6** y **GHSA-337j-9hxr-rhxg** de `react-router`/`react-router-dom`
  6.x (mitigado `safeRedirect` en F1-02a; major 7.18.5 se evalúa en **task-53**).

Estado actual (local, `main@057ad79` tras merge de #21/#26):

```text
[npm-audit] Producción (--omit=dev): 2 vulnerabilidades
            (critical=0, high=0, moderate=2, low=0, info=0).
[npm-audit] AVISO: 2 vulnerabilidad(es) moderate en producción (no bloquean; ver allowlist para react-router).
[npm-audit] OK: sin high/critical de producción bloqueantes (0 high aceptadas por allowlist).
```

Los 2 moderate son los GHSA de react-router documentados (no high). El **audit completo**
(incluye dev) reporta **18** (2 low, 13 moderate, 3 high: `vite`, `@playwright/test`,
`playwright`), todos de toolchain de desarrollo **no empaquetado**; se documentan aquí y quedan
fuera del gate de producción (el task los menciona como no bloqueantes; los majors se evalúan
en task-53).

### Pruebas del script (fixtures)

| Fixture | Resultado esperado | Resultado |
|---|---|---|
| high `left-pad` GHSA falsa, no allowlisted | exit 1 | **exit 1** (lista el hallazgo) |
| high `react-router` GHSA-wrjc allowlisted | exit 0 | **exit 0** (`ACEPTADO (high, allowlist)`) |
| reporte real de producción | exit 0 (solo moderate) | **exit 0** |

## 3. Escaneo de bundle `app/dist/**` (SEC-PR12-01)

`scripts/ci/dist-scan.mjs` recorre el bundle compilado y **falla** si encuentra:

- clave secreta Supabase `sb_secret_` + token largo;
- `SUPABASE_SERVICE_ROLE_KEY`/`SERVICE_ROLE_KEY` con valor;
- JWT cuyo payload decodificado declara `role: service_role`;
- `"role": "service_role"` literal (forma JSON de un JWT inyectado).

El literal aislado `service_role` se reporta como **aviso** (no falla): aparece legítimamente
en la guarda build-time de F1-02a, en el texto de UI y en el propio `supabase-js`; por sí solo
no es una credencial. Lo que bloquea es una clave/JWT de servicio utilizable.

Estado actual del build tras #21 (`npm run build` → `app/dist`, PWA `injectManifest` + `sw.js`):

```text
[dist-scan] 8 archivos de texto escaneados en app\dist.
[dist-scan] AVISO: 3 referencia(s) al literal "service_role" (guarda/UI/supabase-js, sin credencial).
[dist-scan] OK: sin claves secretas, variables service_role con valor ni JWT de servicio en el bundle.
```

### Pruebas con fixtures

| Fixture | Resultado esperado | Resultado |
|---|---|---|
| `sb_secret_` + 40 chars, `SUPABASE_SERVICE_ROLE_KEY: '…'`, JWT `role=service_role` | exit 1 (3 hallazgos) | **exit 1**, lista las 3 credenciales |
| solo literal `role === 'service_role'` (guarda) | exit 0 (aviso) | **exit 0** |

## 3.1 Prueba del guard build-time (SEC-PR12-01, sin tocar `vite.config`)

`app/vite.config.ts` ya implementa `assertPublicClientKey` desde F1-02a y **#21 lo conservó**;
`scripts/ci/build-guard-test.mjs` lo verifica de extremo a extremo lanzando builds de Vite en
directorios temporales con claves sintéticas (no toca `app/dist`):

| Caso | Clave | Esperado | Resultado |
|---|---|---|---|
| anon pública | JWT sintético `role: anon` | build OK | **OK** (exit 0) |
| clave secreta | `sb_secret_` + 40 chars | build falla | **OK** (exit 1, `sb_secret`) |
| clave de servicio | JWT sintético `role: service_role` | build falla | **OK** (exit 1, `role "anon"`) |
| JWT ilegible | `no-es-un-jwt` | build falla | **OK** (exit 1, `payload`) |

No se modifica `app/vite.config.ts` (evita el conflicto con #21): la condición SEC-PR12-01
queda cubierta por el guard existente + su prueba determinista en CI.

## 4. Validación local (árbol actual)

| # | Comando | Resultado |
|---|---|---|
| 1 | `npm ci` (tras merge #21) | exit 0 |
| 2 | `node scripts/ci/npm-audit.mjs` | **exit 0** (0 high/critical de producción; 2 moderate documentados) |
| 3 | `npm run build` | exit 0 (67 módulos; PWA `injectManifest`, `sw.js`, 11 entradas de precache 539.73 KiB) |
| 4 | `node scripts/ci/dist-scan.mjs` | **exit 0** (8 archivos; sin credenciales; 3 avisos de literal) |
| 5 | `node scripts/ci/build-guard-test.mjs` | **exit 0** (4/4 casos OK) |
| 6 | fixtures negativos (audit + dist) | **exit 1** como se espera |
| 7 | `node --check` de los 3 scripts | exit 0 |

## 5. Evidencia CI — run verde

| Dato | Valor |
|---|---|
| Run PR | [42516304140](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42516304140) (`pull_request`, head `55ff6ef`, **success**) |
| Run push | `42516279218` (`push`, mismo head, **success**) |
| Checks | **6/6**: Guardas · Cliente · Deno · pgTAP (20 migraciones/133) · E2E · **Seguridad (dependencias y bundle)** |
| Job `Seguridad` | [128839963195](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42516304140/job/128839963195) — 18 s; audit producción **0 high/critical** (2 moderate documentados), guard build-time **4/4**, bundle scan **OK** (8 archivos, sin credenciales) |

Salida CI relevante:
```text
[npm-audit] Producción (--omit=dev): 2 vulnerabilidades (critical=0, high=0, moderate=2, low=0, info=0).
[npm-audit] OK: sin high/critical de producción bloqueantes (0 high aceptadas por allowlist).
[build-guard] OK anon-publica/sb-secret/jwt-service-role/jwt-ilegible (4/4).
[dist-scan] 8 archivos escaneados; sin claves secretas/JWT de servicio (3 avisos de literal).
```

### 5.1 Hotfix de runner E2E (2026-11-12)

Al rebasar sobre `main@a6cc7e6` (head `8be7e3c`), el run
[43344792439](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/43344792439)
falló **solo** en `E2E Playwright`:

```text
Failed to install browsers
Error: ERROR: Playwright does not support chromium on ubuntu26.04-x64
```

Causa: `ubuntu-latest` migró a **Ubuntu 26.04** y **Playwright 1.55 no soporta Chromium** en esa
imagen (no es una regresión del código; los otros 5 jobs, incluido `Seguridad`, quedaron verdes).
**Fix aplicado (solo job E2E):** `runs-on: ubuntu-24.04` (imagen noble soportada por
`playwright install --with-deps`). No se tocan los demás jobs ni el guard. Este pin es el
hotfix de infraestructura que desbloquea también a los demás PRs con E2E.

**Run verde final (head `f30ba5a`):**
[43345166355](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/43345166355)
(`pull_request`, **6/6 success**: Guardas, Cliente, Deno, pgTAP, Seguridad y **E2E Playwright
✅ en ubuntu-24.04**) y push `43345158752` (**6/6 success**). Se confirma que el fallo era
únicamente del runner 26.04.

## 6. Seguridad y límites

- Sin secretos en el diff: los scripts solo contienen **patrones** de detección; la allowlist
  tiene GHSA/razones, no claves. `Guardas de repositorio` sigue verde en CI.
- El escaneo de bundle se ejecuta sobre el build real (`npm run build`), no sobre fuentes.
- El gate es de **producción** (`--omit=dev`): el audit completo de dev se documenta pero no
  bloquea (toolchain no empaquetado). No se relajan los 5 checks existentes.
- **Guard build-time**: ya existe en `app/vite.config.ts` (F1-02a, conservado en #21); no se
  modifica el archivo para evitar conflicto. La prueba `scripts/ci/build-guard-test.mjs`
  demuestra que rechaza `sb_secret_*`, JWT `service_role` e ilegibles y acepta anon pública
  (4/4 casos). La condición SEC-PR12-01 queda cubierta por guard + test en CI.

## 7. Pendientes / siguiente paso

- [x] **PR #29 publicado y verde**: **6/6 checks** en run `42516304140` (PR) y `42516279218`
      (push); job `Seguridad (dependencias y bundle)` success.
- [x] **Hotfix runner E2E**: `runs-on: ubuntu-24.04` (Playwright 1.55 vs ubuntu 26.04); run
      final `43345166355` (PR) y `43345158752` (push) **6/6**.
- [ ] Proponer `Seguridad (dependencias y bundle)` como required cuando el usuario lo añada.
- [ ] task-53: evaluar react-router 7.18.5 y retirar la allowlist si procede.

## Veredicto

**VERDE CI** — run final **43345166355** (head `f30ba5a`, **6/6**: Guardas, Cliente, Deno,
pgTAP, **Seguridad (dependencias y bundle)** y **E2E Playwright** ya en `ubuntu-24.04`); push
`43345158752` 6/6. Audit de producción sin high/critical, guard build-time 4/4, bundle sin
credenciales; 5 checks previos intactos. Pendiente solo el squash del PR #29 y, opcionalmente,
que el usuario marque el check como required. Sin secretos.
