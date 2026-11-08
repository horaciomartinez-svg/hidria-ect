# F0-03 — `.env`, `.gitignore` y secret scanning

- **Agente:** `seguridad-privacidad` (08)
- **Fecha:** 2026-11-07 18:16 (America/Mexico_City)
- **Tarea:** `hidria_coding_team/tasks/F0/F0-03_env_secretos.md` · tablero `task-4`
- **Rama / PR:** `chore/f0-fundacion` / #2 — head `90c77ab95dec5f237c4cea7808efd719434db737`
- **Entorno:** local Windows (PowerShell 5.1, sin bash/Docker) + MCP GitHub (solo lectura)
- **Repositorio auditado:** `horaciomartinez-svg/hidria-ect` (**público**)
- **Alcance:** árbol trackeado, historial git completo (5 commits), plantillas `.env.example`,
  workflow de CI, `app/dist` local, lockfile, configuración git local y permisos de `.env`.

## Resultado: VERDE (con observaciones MENORES)

Los cinco criterios de aceptación de F0-03 se cumplen: `.env` no está versionado ni aparece
en el historial, el árbol trackeado y el historial **no contienen secretos** (0 hallazgos),
`.env.example` (raíz y equipo) no tiene valores reales y la guarda de secretos existe y está
verde en CI. Los hallazgos son de endurecimiento (MENOR) y no requieren PARO ni rotación.

| Criterio de aceptación F0-03 | Evidencia | Estado |
|---|---|---|
| `.env` no trackeado y en `.gitignore` | §2.1–§2.2 | ✅ |
| 0 hallazgos de secretos en archivos trackeados | §2.3 | ✅ |
| Historial reciente limpio | §2.4 | ✅ |
| `.env.example` sin valores reales | §2.5 | ✅ |
| Guarda de secretos reproducible (`scripts/ci/guardas.sh`) | §2.6 | ✅ |

> **No aplica protocolo de fuga (PARO 3):** no se detectó ningún secreto en el repositorio
> ni en su historial. No se ejecutó rotación ni revocación de credenciales.

## 1. Comandos y evidencia

### 1.1 `.env` fuera de git

| # | Comando | Resultado |
|---|---|---|
| 1 | `git ls-files --error-unmatch -- .env` | **exit 1** — `error: pathspec '.env' did not match any file(s) known to git` |
| 2 | `git check-ignore -v .env` | **exit 0** — `.gitignore:4:.env` → `.env` |
| 3 | `Test-Path .env` | `True` (el archivo existe localmente; contenido **no se imprimió**) |
| 4 | `git rev-list --all --objects \| Select-String '\.env'` | solo `14b4f45… .env.example` y `9ed4f55… hidria_coding_team/.env.example` — **ningún objeto `.env`** |
| 5 | `git log --all --oneline -- .env` | **sin salida** (`.env` nunca fue versionado) |
| 6 | `git ls-files \| Measure-Object -Line` | **77 archivos trackeados** |

### 1.2 `.gitignore`

`.gitignore` (45 líneas) cubre lo exigido por F0-03 y TEAM.md §8:

` .env ` (l. 4), ` .env.* ` (l. 5), ` !.env.example ` (l. 6), ` *.pem ` (l. 7), ` *.key `
(l. 8), ` *.p12 ` (l. 9), ` node_modules/ ` (l. 14), ` dist/ ` (l. 15), ` build/ ` (l. 16),
` coverage/ ` (l. 17), ` reference/ ` (l. 25), ` supabase/.temp/ ` (l. 30), ` .wrangler/ `
(l. 31), `.playwright/`, `playwright-report/`, `test-results/`, `*.tsbuildinfo` (l. 32–35).

- `git check-ignore -v hidria_coding_team/.env.example` → **exit 1** (no ignorado): la
  negación `!.env.example` funciona también en subdirectorios y ambas plantillas están
  trackeadas. ✅
- Artefactos: `git ls-files` no contiene `node_modules/`, `dist/`, `coverage/`, `.temp/` ni
  `.wrangler/` (0 coincidencias). ✅

### 1.3 Secret scan del árbol trackeado

Se ejecutó `git grep` sobre **los 77 archivos trackeados** con los patrones:

`eyJ` + `hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9` · JWT genérico `eyJ…` · `ghp_` · `github_pat_` ·
`sbp_` · `-----BEGIN … PRIVATE KEY-----` · `AKIA…` · `xox[baprs]-…` · `sk-…` ·
`"role":"service_role"` · `(SUPABASE_ANON_KEY|SERVICE_ROLE_KEY|GITHUB_TOKEN|CLOUDFLARE_API_TOKEN)=valor`.

| Patrón | Coincidencias |
|---|---|
| JWT Supabase / JWT genérico | 0 (la única aparición literal del header está en `scripts/ci/guardas.sh:29`, dentro del propio patrón de la guarda; no es un token) |
| `ghp_` / `github_pat_` / `sbp_` / `AKIA` / `xox…` / `sk-…` | 0 |
| Claves privadas PEM | 0 |
| Asignaciones `VAR=valor` de secretos | 0 (solo nombres de variables vacíos en `.env.example`) |
| `"role":"service_role"` (JWT real) | 0 |

`service_role` aparece **solo como palabra en documentación/plantillas** (p. ej.
`.env.example:16-17`, `docs/02`, `TEAM.md`, `agents/08`) — nunca como valor, token ni
credencial. ✅

### 1.4 Historial git (reciente y completo)

| # | Comando | Resultado |
|---|---|---|
| 7 | `git log -p -3` filtrado por patrones | 1 coincidencia: el literal `PATRONES='…'` añadido en `scripts/ci/guardas.sh` (no es secreto) |
| 8 | `git grep -E <patrones> HEAD~2 HEAD~1 HEAD` | `HEAD~2`: 0 · `HEAD~1`: 0 · `HEAD`: solo `guardas.sh:29` (literal del patrón) |
| 9 | `git log -p --all` filtrado por patrones | 0 secretos en los 5 commits del historial completo |

Commit auditado: `90c77ab` (head del PR #2). Los 2 commits del PR
(`90c77ab`, `91e05f8`) y los 3 anteriores están limpios. ✅

### 1.5 `.env.example` (raíz y equipo)

**Raíz (`.env.example`, 39 líneas, trackeado).** Todas las variables sensibles tienen valor
vacío (`GITHUB_TOKEN=`, `SUPABASE_URL=`, `SUPABASE_ANON_KEY=`,
`SUPABASE_SERVICE_ROLE_KEY=`, `SUPABASE_DB_PASSWORD=`, `CLOUDFLARE_API_TOKEN=`,
`R2_ACCESS_KEY_ID=`, `R2_SECRET_ACCESS_KEY=`, `VITE_*=`, …). Los únicos valores no vacíos
son públicos por diseño: `GITHUB_REPO=horaciomartinez-svg/hidria-ect`,
`R2_BUCKET_DOCS=hidria-docs`, `R2_BUCKET_REPORTS=hidria-reports`, `NOM151_ENABLED=false`.
✅

**Equipo (`hidria_coding_team/.env.example`, 46 líneas, trackeado).** Inventario de variables
y ubicación de cada secreto; **ningún valor real**. ✅

### 1.6 Workflow de CI (`.github/workflows/ci.yml`)

| Aspecto | Verificación | Estado |
|---|---|---|
| Permisos mínimos | `permissions: contents: read` (nivel workflow, aplica a ambos jobs) | ✅ |
| Sin secretos en el workflow | `git grep 'secrets\.'` en `.github/**` → **0 coincidencias**; no hay `env:` con credenciales, ni `echo` de variables | ✅ |
| Sin secretos en logs | El workflow no referencia `secrets.*`; la salida de `bash scripts/ci/guardas.sh` en verde solo emite `[OK]` | ✅ (ver hallazgo M-2) |
| Único workflow | `.github/workflows/` solo contiene `ci.yml` | ✅ |
| Checks del PR #2 | 2/2 `conclusion: success` — «Guardas de repositorio» (3 s) y «Cliente (lint+typecheck+build)» (49 s), run `42425963485` | ✅ |

> Limitación declarada: el host no tiene `bash`, por lo que `bash scripts/ci/guardas.sh` no
> se ejecutó localmente; su ejecución canónica es el job de CI (verde) y sus 6 guardas se
> replicaron manualmente con `git`/PowerShell (§1.1–§1.5, §1.7).

### 1.7 `app/dist` (existe localmente, **no trackeado**)

`app/dist` contiene `index.html`, `assets/index-*.css`, `assets/index-*.js` (build de Vite)
y **0 archivos `.map`** (`vite.config.ts` usa `sourcemap: false`).

| Búsqueda | Resultado |
|---|---|
| `service_role` en `app/dist/**` | **0 coincidencias** |
| `ghp_` / `github_pat_` / `sbp_` / claves PEM en `app/dist/**` | **0 coincidencias** |
| JWT (`eyJhbGci…`) en `app/dist/**` | **0** (el build local se generó sin `VITE_*`, no hay claves embebidas) |
| `git ls-files -- app/dist` | 0 archivos (ignorado por `dist/`) |

### 1.8 Lockfile, configuración git y remoto

| # | Comprobación | Resultado |
|---|---|---|
| 10 | `git grep -E '_authToken\|npm_[A-Za-z0-9]{20,}\|://usuario:clave@' -- package-lock.json` | 0 coincidencias |
| 11 | hosts `resolved` en `package-lock.json` | solo `registry.npmjs.org` |
| 12 | claves locales de `.git/config` | sin `http.extraheader`, sin `url.*.insteadOf`, sin credenciales |
| 13 | `git config --get remote.origin.url` | `https://github.com/horaciomartinez-svg/hidria-ect.git` (sin usuario/clave embebidos) |

### 1.9 `.env` local (solo metadatos; **sin valores**)

- Existe en `C:\Proyectos\hidria\.env` (ignorado por git) y contiene las 9 variables
  requeridas por `phase0_verify.ps1` (`GITHUB_TOKEN`, `GITHUB_REPO`, `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD`,
  `SUPABASE_PROJECT_REF`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) y
  `CLOUDFLARE_ZONE` vacía. **No se imprimió ningún valor.**
- Comprobación de rol de las claves JWT (solo claim `role`, sin publicar la clave):
  `SUPABASE_ANON_KEY` → `anon` ✅; `SUPABASE_SERVICE_ROLE_KEY` → `service_role` ✅ (la clave
  server-side vive **solo** en `.env` local, como exige TEAM.md §9).
- `GITHUB_TOKEN` es un *fine-grained PAT* (`github_pat_…`), no un `ghp_`. Correcto.
- Nota: `.env` no contiene `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `NOM151_ENABLED`;
  son necesarias para F0-09 (DevOps) — no es un hallazgo de seguridad de F0-03.

## 2. Hallazgos (todos MENOR — no bloquean F0 ni el PR #2)

| ID | Severidad | Hallazgo | Acción recomendada (dueño) |
|---|---|---|---|
| **SEC-F0-03-01** | MENOR | `.env` hereda ACL permisiva de `C:\Proyectos` (`BUILTIN\Usuarios:(RX)` y `NT AUTHORITY\Usuarios autentificados:(M)`): cualquier usuario/proceso local puede leerlo y modificarlo. Contiene `service_role` y el PAT de GitHub. | Restringir a la cuenta del usuario: `icacls .env /inheritance:r` con solo el usuario propietario (usuario/DevOps, acción local; **no** la ejecuté). |
| **SEC-F0-03-02** | MENOR | `scripts/ci/guardas.sh` §2 **excluye** `.env.example` del secret scan (`:(exclude).env.example`) y §4 solo valida `.env.example` **raíz**: un secreto colocado en `hidria_coding_team/.env.example` no lo detectaría ninguna de las dos guardas (y el escaneo de historial no existe). | Quitar la exclusión de `.env.example` (sus valores ya se validan aparte) y extender §4 a `hidria_coding_team/.env.example`; opcional: `gitleaks`/`trufflehog` sobre historial (DevOps, F0-07). |
| **SEC-F0-03-03** | MENOR | Si la guarda §2 fallara, imprime las líneas coincidentes (`git grep … \| head -20`) en los logs **públicos** de Actions: publicaría el propio secreto detectado. | Imprimir solo `archivo:línea` y el patrón, nunca el contenido de la línea (DevOps). |
| **SEC-F0-03-04** | MENOR | Endurecimiento de supply chain: `actions/checkout@v4` y `actions/setup-node@v4` fijadas por *tag* (no SHA), `persist-credentials` por defecto (`true`) y sin `timeout-minutes`. | Fijar actions por SHA, `persist-credentials: false` y `timeout-minutes` (DevOps; coincide con QA F0-07 H-01…H-06). |
| **SEC-F0-03-05** | MENOR | `hidria_coding_team/.env.example` usa comentarios **en línea** tras `=` en 8 variables (`VITE_SUPABASE_URL=  # …`, etc.). Copiarlo a `.env` produce valores contaminados con la descripción y, además, impide validarlo con la guarda §4. | Mover los comentarios a líneas propias o dejar los valores vacíos sin texto tras `=` (Lead/DevOps). |
| **SEC-F0-03-06** | MENOR (higiene) | `reference/` (79 archivos locales, gitignored) hereda la misma ACL permisiva que `.env`; scan de secretos: 0 coincidencias. Sin impacto en el repo público. | Mantener `reference/` fuera de git (ya ignorado); aplicar ACL restrictiva si contiene material de cliente. |

## 3. Conclusión

- **Repositorio público limpio de secretos:** 0 hallazgos en 77 archivos trackeados y en los
  5 commits del historial. `.env` existe solo en local, ignorado y nunca versionado.
- **Plantillas sin valores reales** (raíz y equipo). CI con permisos mínimos
  (`contents: read`), sin referencias a `secrets.*` y verde en el PR #2 (2/2 checks).
- **`app/dist`** no contiene `service_role`, JWTs ni claves; no está trackeado ni genera
  sourcemaps.
- **Sin condiciones de PARO:** no hay secreto expuesto, por lo que no procede rotación.
- Los 6 hallazgos son MENOR y se recomiendan como tareas de endurecimiento (F0-07/F1).

## 4. Pendientes / siguiente paso

- [ ] DevOps: aplicar SEC-F0-03-02, -03, -04 (guardas y workflow) en una rama propia.
- [ ] Lead/DevOps: corregir SEC-F0-03-05 (plantilla del equipo).
- [ ] Usuario/DevOps: restringir ACL de `.env` y `reference/` (SEC-F0-03-01, -06) — acción local.
- [ ] Mantener la regla: cualquier cambio de CI/plantillas vuelve a pasar por esta revisión de
  seguridad antes del merge (gate de seguridad del PR).
- [ ] Próxima revisión: re-ejecutar este scan cuando se agreguen Edge Functions y el
  `supabase/secrets` de F1 (verificar que ningún secreto llegue a `app/` ni al bundle).
