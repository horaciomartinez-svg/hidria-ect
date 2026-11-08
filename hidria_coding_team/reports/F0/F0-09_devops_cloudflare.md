# F0-09 — Cloudflare: R2 (`hidria-docs`, `hidria-reports`) y Pages (`hidria-staging`)

- **Agente:** `devops-github-cloudflare` (07)
- **Fecha:** 2026-11-07 18:18 (America/Mexico_City) · 2026-11-08T00:18Z
- **Tarea:** `hidria_coding_team/tasks/F0/F0-09_cloudflare_r2_pages.md`
- **Rama / PR:** `chore/f0-fundacion` / [#2](https://github.com/horaciomartinez-svg/hidria-ect/pull/2)
- **Entorno:** Cloudflare API v4 (`api.cloudflare.com/client/v4`) + `npx wrangler` 4.158.0
- **Commit desplegado:** `90c77ab95dec5f237c4cea7808efd719434db737` (HEAD de la rama del PR)
- **Credencial:** `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` del `.env` local; valores
  **no** reproducidos en este reporte. `CLOUDFLARE_ZONE` está vacío → se usan URLs `*.pages.dev`.

## Resultado: VERDE

Cuenta y token operativos para R2 y Pages. Se crearon los buckets **`hidria-docs`** y
**`hidria-reports`** (privados, sin dominio público), el proyecto Pages **`hidria-staging`**, y
se publicó el build de `app/dist`. La URL de producción responde **HTTP 200** con el título de
HIDRIA. Quedan pendientes menores documentados (§6): versionado de R2 (no expuesto por la API
disponible), headers de seguridad y aislamiento de cuenta antes del piloto.

- Cuenta Cloudflare: `67bec4f06347f4a150e12b5b2f23f77b` (pública, no secreta) — `type: standard`
- URL de staging: **https://hidria-staging.pages.dev** (HTTP 200 verificado)
- URL del despliegue: https://d6a60970.hidria-staging.pages.dev (HTTP 200 tras propagación TLS)
- Deployment id: `d6a60970-11c0-4f5c-a93b-c50014334ab5`

## 1. Verificación de token y cuenta

Comandos ejecutados en PowerShell leyendo el `.env` en memoria; el token nunca se imprimió
(solo longitud y respuestas de la API).

| # | Consulta | HTTP | Resultado |
|---|---|---|---|
| 1 | `GET /accounts/<CLOUDFLARE_ACCOUNT_ID>` | **200** | `success=true`; cuenta `67bec4f06347f4a150e12b5b2f23f77b`, `name: "Horacio.martinez@cedconsultoria.com's Account"`, `type: standard`; el id del `.env` corresponde a la cuenta |
| 2 | `GET /user/tokens/verify` | **401** | `{"success":false,"errors":[{"code":1000,"message":"Invalid API Token"}]}` — **no es un fallo de la credencial**: es un token *account-owned* (53 chars) y ese endpoint solo verifica tokens *user-owned*. La validez se demuestra con #1 y con las llamadas R2/Pages que siguen |
| 3 | `GET /accounts/<id>/r2/buckets` (antes) | **200** | Solo `kriptonshare-ephemeral` (heredado); **no** existían `hidria-docs` ni `hidria-reports` |
| 4 | `GET /accounts/<id>/pages/projects` (antes) | **200** | `[]` — no había proyectos Pages |
| 5 | `CLOUDFLARE_ZONE` | — | Vacío (`ZONE_LEN=0`) → se opera con `*.pages.dev`; sin zona no hay WAF/DNS propio |

No se ejecutó ninguna acción sobre cuentas distintas; todas las llamadas usan el account id del
`.env` (verificado contra el nombre de la cuenta en #1).

## 2. R2 — buckets creados y privacidad

| # | Consulta | HTTP | Resultado |
|---|---|---|---|
| 1 | `PUT /accounts/<id>/r2/buckets/hidria-docs` (body `{}`) | **200** | `success=true`; `name=hidria-docs`, `creation_date=2026-11-08T00:13:20.764Z`, `location=WNAM` |
| 2 | `PUT /accounts/<id>/r2/buckets/hidria-reports` (body `{}`) | **200** | `success=true`; `name=hidria-reports`, `creation_date=2026-11-08T00:13:21.635Z`, `location=WNAM` |
| 3 | `GET /accounts/<id>/r2/buckets` (después) | **200** | `hidria-docs`, `hidria-reports`, `kriptonshare-ephemeral` |
| 4 | `GET /r2/buckets/hidria-docs/domains/managed` | **200** | `enabled: false` → **sin dominio público `r2.dev`** (bucket privado) |
| 5 | `GET /r2/buckets/hidria-docs/domains/custom` | **200** | `domains: []` → sin dominio personalizado |
| 6 | `GET /r2/buckets/hidria-reports/domains/managed` | **200** | `enabled: false` → privado |
| 7 | `GET /r2/buckets/hidria-reports/domains/custom` | **200** | `domains: []` |
| 8 | `GET /r2/buckets/hidria-reports/lifecycle` (antes) | **200** | Regla por defecto de la plataforma: `Default Multipart Abort Rule` (7 días) |
| 9 | `PUT /r2/buckets/hidria-reports/lifecycle` | **200** | body con **dos** reglas separadas → **400** `code 10040 "The JSON you provided was not well formed"` (no soportado así) |
| 10 | `PUT /r2/buckets/hidria-reports/lifecycle` (reintento) | **200** | Una sola regla con ambas transiciones: `hidria-tmp-7d`, `conditions.prefix=tmp/`, `deleteObjectsTransition` Age **7 días**, `abortMultipartUploadsTransition` Age **1 día** |
| 11 | `GET /r2/buckets/hidria-reports/lifecycle` (final) | **200** | Regla `hidria-tmp-7d` persistida con ambas transiciones |

**Versionado (pendiente):**

| # | Consulta | HTTP | Resultado |
|---|---|---|---|
| 12 | `GET /accounts/<id>/r2/buckets/hidria-docs/versioning` | **404** | `code 10015 "No route matches this url"` → la API v4 no expone versionado en esa ruta |
| 13 | `npx wrangler@latest r2 bucket --help` (4.158.0) | — | No existe subcomando `versioning` (solo `create/list/info/delete/update/sippy/notification/domain/dev-url/local-uploads/lifecycle/cors/lock`); `r2 bucket update` solo permite `storage-class` |
| 14 | `.env` | — | No hay `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`; sin credenciales S3 no se puede usar la S3 API para versionado |

→ **Versionado de `hidria-docs` no configurable con las herramientas disponibles** (API v4 y
CLI). Queda documentado como pendiente: habilitarlo en Dashboard de Cloudflare o vía S3 API
cuando se generen credenciales R2 (y guardarlas en `.env`/Vault, nunca en el repo). `docs/07`
§5.3 pide versionado en `hidria-docs`; se recomienda completarlo antes de F1-05 (EF-08).

## 3. Pages — proyecto y despliegue

| # | Consulta / comando | HTTP / exit | Resultado |
|---|---|---|---|
| 1 | `POST /accounts/<id>/pages/projects` | **200** | Proyecto `hidria-staging` (id `a1372d9a-d53f-42df-b8b2-d850674b4e8d`), `subdomain: hidria-staging.pages.dev`, `production_branch: main`, `build_config: {build_command: "npm run build", destination_dir: "app/dist", root_dir: ""}`, `created_on: 2026-11-08T00:13:34.275Z` |
| 2 | `npm run build` (local, `app/`) | **exit 0** | `app/dist`: `index.html` 663 B + CSS 7404 B + JS 144832 B (evidencia F0-07) |
| 3 | `npx --yes wrangler@latest pages deploy app/dist --project-name hidria-staging --branch main --commit-dirty=true` | **exit 0** en **54.6 s** | wrangler **4.158.0**; `Uploading… (3/3)`, `Uploaded 3 files (1.92 sec)`, `Deployment complete!` → https://d6a60970.hidria-staging.pages.dev |
| 4 | `GET /pages/projects/hidria-staging/deployments` | **200** | 1 deployment: `id=d6a60970…`, `environment=production`, `branch=main`, `stage=deploy/success`, `created_on=2026-11-08T00:14:37.818Z` |
| 5 | `GET /pages/projects/hidria-staging/deployments/d6a60970…` | **200** | `deployment_trigger.metadata: {branch: main, commit_hash: 90c77ab95dec5f237c4cea7808efd719434db737, commit_message: "chore(f0): fundacion…", commit_dirty: true}`; `stages: deploy:success` |
| 6 | `GET /pages/projects/hidria-staging` | **200** | `subdomain=hidria-staging.pages.dev`, `production_branch=main`, `latest_deployment=canonical_deployment=d6a60970` |
| 7 | `GET https://hidria-staging.pages.dev` | **200** | `content-type: text/html; charset=utf-8`, 654 B, `<title>HIDRIA · Optimización Hídrica Industrial</title>` |
| 8 | `GET https://d6a60970.hidria-staging.pages.dev` | **200** (2.º intento) | 1.er intento: error TLS `SEC_E_ILLEGAL_MESSAGE` (handshake) por certificado del alias aún sin propagar; reintento ~5 min después → **200** (curl `http_code=200` y PowerShell OK) |
| 9 | Headers del sitio | — | `server: cloudflare`, `x-content-type-options: nosniff`; **no** envía `Strict-Transport-Security` ni CSP/Referrer-Policy/Permissions-Policy (ver §6) |

**Trazabilidad del despliegue:** commit `90c77ab` (head del PR #2), rama `main` del proyecto,
entorno `production`. `commit_dirty=true` porque el árbol local tiene archivos no versionados
(los PDFs de `docs/`); el contenido desplegado proviene del build local de ese commit. En F1 el
despliegue debe hacerse desde CI con checkout limpio (mejora M-07 de F0-07).

## 4. Recursos creados (resumen)

| Recurso | Identificador | Estado |
|---|---|---|
| R2 bucket `hidria-docs` | `hidria-docs` (WNAM, `2026-11-08T00:13:20Z`) | privado (`r2.dev` deshabilitado, sin dominio custom) |
| R2 bucket `hidria-reports` | `hidria-reports` (WNAM, `2026-11-08T00:13:21Z`) | privado + lifecycle `hidria-tmp-7d` (tmp/ expira 7 d, abort multipart 1 d) |
| Pages project `hidria-staging` | `a1372d9a-d53f-42df-b8b2-d850674b4e8d` | activo, producción en `main`, URL https://hidria-staging.pages.dev |
| Pages deployment | `d6a60970-11c0-4f5c-a93b-c50014334ab5` | `deploy:success`, commit `90c77ab` |

No se creó ningún recurso adicional (no se generaron credenciales R2, no se creó dominio
público, no se tocaron otros buckets ni cuentas).

## 5. Hallazgos

1. **Token/cuenta Cloudflare operativos** para R2 y Pages; el 401 de `/user/tokens/verify` es
   esperado en tokens account-owned y **no** invalida la credencial (la cuenta y R2/Pages
   responden 200). No aplica la condición de PARO §12.1.
2. **Buckets privados**: ambos sin `r2.dev` (`enabled:false`) y sin dominios personalizados;
   coherente con `docs/07` §5.3 («sin dominio público de bucket»). La privacidad no impide
   URLs prefirmadas (EF-07/EF-08) cuando existan las claves S3.
3. **Lifecycle de `hidria-reports`** configurado con una sola regla que combina expiración de
   `tmp/` (7 días) y abort de multipart (1 día); la API rechaza el body con dos reglas separadas
   (400) — documentado para el runbook.
4. **Pages desplegado y accesible**: `hidria-staging.pages.dev` HTTP 200 con el shell del
   cliente; el alias de despliegue tardó unos minutos en tener certificado válido (error TLS
   transitorio, luego 200).
5. **Nombre de bucket staging**: `docs/07` §2 menciona un bucket `hidria-staging` para staging,
   mientras la tarea F0-09 y otras secciones usan `hidria-docs`/`hidria-reports`. Se siguió la
   tarea (nombres definitivos); la discrepancia debe resolverla el revisor (ADR) antes de F1.
6. **Cuenta personal, no institucional**: la cuenta es de la persona
   (`Horacio.martinez@cedconsultoria.com's Account`, `standard`), no una cuenta SDFI de
   staging/piloto. `docs/07` §2 exige cuentas separadas por entorno; con datos reales del
   piloto esto no es aceptable. Riesgo a resolver antes de F2/piloto.
7. **Sin headers de seguridad** en Pages (`HSTS`, CSP, Referrer-Policy, Permissions-Policy):
   solo `x-content-type-options: nosniff` (default de Pages). `docs/07` §5.2 los exige; se
   implementan con `_headers` en el output del build (`app/public/_headers`, dueño
   `dev-frontend-pwa`) o en el pipeline de deploy.
8. **Sin WAF/DNS** posible mientras `CLOUDFLARE_ZONE` esté vacío; la URL `*.pages.dev` es el
   mecanismo acordado hasta tener zona.

## 6. Pendientes / siguiente paso

- [ ] **P1 (F1):** habilitar versionado de `hidria-docs` (Dashboard o S3 API con credenciales
      R2); documentar el procedimiento y no publicar claves.
- [ ] **P1 (F1):** `_headers` con HSTS/CSP/Referrer-Policy/Permissions-Policy y verificación
      post-deploy (`curl -I`); coordinar con `dev-frontend-pwa`.
- [ ] **P1 (F1):** pipeline de deploy a Pages desde CI en lugar de `wrangler` local con
      `--commit-dirty=true` (mejora M-07 de F0-07); rama staging `develop` cuando exista
      (hoy el proyecto usa `main` como producción porque `develop` no existe).
- [ ] **P2:** decidir/ADRs: bucket staging (`hidria-staging` vs `hidria-docs`/`hidria-reports`)
      y cuenta Cloudflare por entorno antes de datos reales (F2/piloto).
- [ ] **P2:** rotación del token Cloudflare y traslado a secret store; hoy vive en `.env`.
- [ ] Documentar en `reports/deploy/` el primer despliegue de staging con URL + commit cuando
      se haga el deploy oficial post-merge (este es un despliegue de verificación de F0).

## 7. Seguridad de la evidencia

- No se imprimió ni registró el valor de `CLOUDFLARE_API_TOKEN` (solo longitud) ni se
  transcribieron secretos.
- No se generaron ni almacenaron credenciales R2 S3 en el repo ni en este reporte.
- Los recursos quedaron privados (R2 sin dominio público) y no se creó nada en cuentas ajenas.

## Veredicto

**VERDE** para F0-09: token válido para R2/Pages, buckets `hidria-docs` y `hidria-reports`
creados y privados, proyecto Pages `hidria-staging` creado y con URL `*.pages.dev` respondiendo
HTTP 200. Pendientes P1 (versionado, headers, deploy por CI y aislamiento de cuenta) quedan
registrados para F1/piloto; no impiden cerrar el criterio de aceptación de F0-09.
