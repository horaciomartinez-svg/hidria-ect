# F1-19 — CI hardening: audit de dependencias + escaneo de bundle (task-50, parte 1)

- **Agente:** `devops-github-cloudflare` (07)
- **Fecha:** 2026-11-08 13:35 (America/Mexico_City) · 2026-11-08T19:35Z
- **Tarea:** `task-50` — F1 · CI hardening (SEC-PR12-01/02/08), **bloqueante de G1**
- **Rama / PR:** `chore/F1-19-ci-hardening` · base `main@8e4e258` (docs #24/#25 ya en
  `main@cc812fc`; no tocan CI)
- **Alcance de esta entrega (parte 1, sin `app/vite.config.ts`):**
  1. job **`Seguridad (dependencias y bundle)`** con `npm audit --omit=dev` (falla en
     high/critical; únicos advisories de producción actuales son **moderate** de react-router
     con excepción documentada);
  2. escaneo de **`app/dist/**`** que rechaza credenciales de servicio
     (`sb_secret_*`, `SUPABASE_SERVICE_ROLE_KEY` con valor, JWT con `role=service_role`).
- **Parte 2 diferida:** guard **build-time** en `app/vite.config.ts` (F1-02b/#21 lo modifica;
  se hará después del merge de #21, coordinado con `dev-frontend-pwa`).

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

Estado actual (local, `main@8e4e258` + merge docs):

```text
[npm-audit] Producción (--omit=dev): 2 vulnerabilidades
            (critical=0, high=0, moderate=2, low=0, info=0).
[npm-audit] AVISO: 2 vulnerabilidad(es) moderate en producción (no bloquean; ver allowlist para react-router).
[npm-audit] OK: sin high/critical de producción bloqueantes (0 high aceptadas por allowlist).
```

Los 2 moderate son los GHSA de react-router documentados (no high). El **audit completo**
(incluye dev) reporta 13 (10 moderate, 3 high: `vite`, `@playwright/test`, `playwright`), todos
de toolchain de desarrollo **no empaquetado**; se documentan aquí y quedan fuera del gate de
producción (el task los menciona como no bloqueantes; los majors se evalúan en task-53).

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

Estado actual del build (`npm run build` → `app/dist`):

```text
[dist-scan] 3 archivos de texto escaneados en app\dist.
[dist-scan] AVISO: 3 referencia(s) al literal "service_role" (guarda/UI/supabase-js, sin credencial).
[dist-scan] OK: sin claves secretas, variables service_role con valor ni JWT de servicio en el bundle.
```

### Pruebas con fixtures

| Fixture | Resultado esperado | Resultado |
|---|---|---|
| `sb_secret_` + 40 chars, `SUPABASE_SERVICE_ROLE_KEY: '…'`, JWT `role=service_role` | exit 1 (3 hallazgos) | **exit 1**, lista las 3 credenciales |
| solo literal `role === 'service_role'` (guarda) | exit 0 (aviso) | **exit 0** |

## 4. Validación local (árbol actual)

| # | Comando | Resultado |
|---|---|---|
| 1 | `npm ci` | exit 0 |
| 2 | `node scripts/ci/npm-audit.mjs` | **exit 0** (0 high/critical de producción; 2 moderate documentados) |
| 3 | `npm run build` | exit 0 (91 módulos; JS 475.01 kB / 137.39 kB gzip) |
| 4 | `node scripts/ci/dist-scan.mjs` | **exit 0** (sin credenciales; 3 avisos de literal) |
| 5 | fixtures negativos (audit + dist) | **exit 1** como se espera |
| 6 | `node --check` de ambos scripts | exit 0 |

## 5. Evidencia CI (se completa con run id)

| Dato | Valor |
|---|---|
| Job nuevo | `Seguridad (dependencias y bundle)` |
| Checks esperados | **6/6** — 5 existentes + `Seguridad` |
| Run CI | _pendiente_ |
| Artefactos | ninguno (job de validación) |

## 6. Seguridad y límites

- Sin secretos en el diff: los scripts solo contienen **patrones** de detección; la allowlist
  tiene GHSA/razones, no claves. `Guardas de repositorio` sigue verde en CI.
- El escaneo de bundle se ejecuta sobre el build real (`npm run build`), no sobre fuentes.
- El gate es de **producción** (`--omit=dev`): el audit completo de dev se documenta pero no
  bloquea (toolchain no empaquetado). No se relajan los 5 checks existentes.
- La parte 2 (guard build-time en `vite.config`) se hará tras el merge de #21 para evitar
  conflicto; comportamiento objetivo: rechazar `sb_secret_*`, JWT no-`anon`/`service_role` e
  ilegibles, con test de clave sintética. Ya existe la guarda de F1-02a en `main`; #21 la
  modifica.

## 7. Pendientes / siguiente paso

- [ ] Publicar PR y verificar **6/6 checks** verdes (run id en §5).
- [ ] Tras el merge de **#21**: segunda parte de task-50 (`app/vite.config.ts` build-time guard)
      en PR/commit aparte, coordinado con `dev-frontend-pwa`.
- [ ] Proponer `Seguridad (dependencias y bundle)` como required cuando el usuario lo añada.
- [ ] task-53: evaluar react-router 7.18.5 y retirar la allowlist si procede.

## Veredicto

**VERDE local** — job de hardening implementado y probado con fixtures; pendiente el run de CI
para el VERDE definitivo. Sin secretos ni relajación de los checks existentes.
