# F0-07 — QA: CI mínima en verde (guardas + lint + typecheck + build)

- **Agente:** `qa-tester` (05)
- **Fecha:** 2026-11-07 18:15 (America/Mexico_City)
- **Tarea:** `hidria_coding_team/tasks/F0/F0-07_ci_minima.md` — validación QA de la implementación de `devops-github-cloudflare` (`task-3`, `task-5`)
- **Rama / PR:** `chore/f0-fundacion` / [#2](https://github.com/horaciomartinez-svg/hidria-ect/pull/2) · head `90c77ab` · base `main` `f6b99ce`
- **Entorno:** local Windows (PowerShell; **sin bash ni Docker**) + GitHub Actions `ubuntu-latest`
- **Commit evaluado:** `90c77ab95dec5f237c4cea7808efd719434db737`

## Resultado: VERDE

> Veredicto **acotado a F0-07**: el workflow dispara, las guardas cubren lo exigido por la
> tarea, la CI está verde en el PR #2 y `lint`/`typecheck`/`build` se reproducen en local.
> No cubre suites de producto: todavía no existen (ver `reports/qa/PR-2_qa.md`).
> Hallazgos H-01…H-09 son endurecimiento/plan de F1, **no bloquean** los criterios de F0-07.

## 1. Checks de CI del PR #2 (MCP GitHub)

Consulta `pull_request_read(method: get_check_runs, pullNumber: 2)`:

| Check | status / conclusion | job id | Duración | URL |
|---|---|---|---|---|
| Guardas de repositorio | completed / **success** | 128564175440 | 3 s (23:35:47→23:35:50Z) | [job](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42425963485/job/128564175440) |
| Cliente (lint + typecheck + build) | completed / **success** | 128564175630 | 49 s (23:35:47→23:36:36Z) | [job](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42425963485/job/128564175630) |

Run [42425963485](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42425963485):
`event=pull_request`, `conclusion=success`, `head_sha=90c77ab95dec5f237c4cea7808efd719434db737`
(= head del PR #2), `path=.github/workflows/ci.yml`, run_number 1, 52 s en total
(23:35:45→23:36:37Z). **2/2 checks verdes.**

## 2. Revisión del workflow `.github/workflows/ci.yml`

| Criterio F0-07 | Estado | Evidencia |
|---|---|---|
| Dispara en `pull_request` hacia `main` | ✓ | `on.pull_request.branches: [main]` (líneas 3–6) |
| Dispara en `push` a `main` | ✓ | `on.push.branches: [main]` |
| `permissions` mínimos | ✓ | `permissions: contents: read` (línea 9) |
| Job `guardas` ejecuta `bash scripts/ci/guardas.sh` | ✓ | job «Guardas de repositorio», verde en 3 s |
| Job `cliente`: `npm ci` + lint + typecheck + build | ✓ | job «Cliente», verde en 49 s |
| Sin secretos en logs | ✓ | el workflow **no referencia `secrets.*`**; la guarda de secretos del job `guardas` pasó |
| Reproducible desde clon limpio | ✓ | el run 1 hizo `actions/checkout@v4` + `npm ci` (lockfile raíz, workspaces `app`) y terminó verde |
| Nombres de job estables para *required checks* | ✓ | «Guardas de repositorio» y «Cliente (lint + typecheck + build)» coinciden con los checks reportados (la protección de `main` se verifica en F0-06, fuera de este reporte) |
| Concurrencia | ✓ | `concurrency: ci-${{ github.ref }}`, `cancel-in-progress: true` |

Observaciones de endurecimiento (no bloqueantes): `actions/checkout@v4` y
`actions/setup-node@v4` fijados por tag, no por SHA; sin `timeout-minutes`; sin
`persist-credentials: false`; `node-version: 22` en CI frente a Node 24.21.0 local
(engines `>=20`); sin cache de `node_modules` más allá de `cache: npm`.

## 3. Ejecución local (contraste)

Ejecutado en `C:\Proyectos\hidria` (raíz del monorepo, workspaces npm):

| # | Comando | Resultado | Salida relevante |
|---|---|---|---|
| 1 | `npm run lint` | **exit 0** | `eslint src` sin errores ni warnings |
| 2 | `npm run typecheck` | **exit 0** | `tsc --noEmit` sin errores |
| 3 | `npm run build` | **exit 0** | `vite 5.4.21`: 31 módulos; `index-DMFXj2JN.js` 144.78 kB (46.81 kB gzip); CSS 7.40 kB; 2.02 s |

Coincide con la evidencia declarada en el PR (31 módulos, 144.78 kB JS). Nota de honestidad:
`npm ci` no se re-ejecutó en local (ya existía `node_modules`); la reproducibilidad desde
clon limpio la prueba el run de CI, que hizo `npm ci` en Ubuntu y quedó verde. `npm ls --depth=0`
resuelve `@hidria/app@0.1.0` sin errores de árbol.

## 4. Guardas: replicación local de `scripts/ci/guardas.sh`

**Limitación de entorno:** el host no tiene `bash` (contexto: Windows sin bash/Docker), por
lo que `bash scripts/ci/guardas.sh` no se pudo ejecutar tal cual. La ejecución canónica
ocurrió en CI (job verde, 3 s). Para contrastar, se replicaron las 6 comprobaciones con
`git` + PowerShell sobre el mismo commit `90c77ab`:

| # | Guarda (script) | Replicación local | Resultado |
|---|---|---|---|
| 1 | `.env` fuera de git | `git ls-files --error-unmatch .env` → exit 1; `.env` local existe y está ignorado (`.gitignore:4`) | ✓ |
| 2 | Secret scan de archivos trackeados | `git grep -I -n -E '<mismos patrones>'` → sin coincidencias (exit 1) | ✓ |
| 3 | Integridad `docs/02` ↔ migración base | SHA-256 de ambos = `2A7B6F8888040990B109F580F6BE50F7F03BF7D9FF7B2299D7BD50BC85442CB5` | ✓ |
| 4 | `.env.example` sin valores reales | ninguna variable `TOKEN/KEY/PASSWORD/SECRET/SERVICE` con valor no vacío (solo buckets `hidria-docs`/`hidria-reports` y flags públicos) | ✓ |
| 5 | Nomenclatura prohibida en `app/` y `supabase/` | `git grep` de `UAT-CIT` y de la denominación antigua de la SRHDS → sin coincidencias | ✓ |
| 6 | Artefactos no versionados | `git ls-files` sin `node_modules/`, `dist/`, `coverage/`, `.temp/`, `.wrangler/`; `app/dist`, `supabase/.temp/` y `reference/` ignorados/no trackeados | ✓ |

Comprobaciones adicionales de QA: `service_role` ausente en `app/src` y en el bundle
(`app/dist/assets/*.js`); `dist` no trackeado; `ci.yml` sin `secrets.*`.

**Resultado replicado: 6/6 OK** — consistente con el job de CI verde.

## 5. Huecos detectados (no bloqueantes para F0-07; van a F1)

| ID | Hallazgo | Severidad | Dueño sugerido |
|---|---|---|---|
| H-01 | El secret scan solo cubre patrones conocidos: JWT HS256, `ghp_`, `github_pat_`, `sbp_`, claves PEM. **No** cubre los nuevos formatos de Supabase (`sb_secret_…`), tokens Cloudflare/R2 sin prefijo fijo, ni claves genéricas; no escanea historial completo (solo árbol trackeado); no usa gitleaks/trufflehog. | P2 | devops + seguridad |
| H-02 | La guarda de nomenclatura solo busca `UAT-CIT` y la denominación antigua en `app/` y `supabase/`. `TEAM.md` §10.4 prohíbe también `UAT` aislado y en *docs/commits*: una guarda ingenua daría falsos positivos porque `UAT` aparece legítimamente en `docs/00` y en `TEAM.md`; hace falta alcance + allowlist. | P2 | devops + revisor |
| H-03 | `.env.example` solo se valida en la raíz. `hidria_coding_team/.env.example` (trackeado) no se valida; además usa `VAR=   # comentario` inline, que un `awk` ingenuo marcaría como valor (si se añade, ajustar el parser). | P2 | devops |
| H-04 | La comprobación de artefactos no cubre `.playwright/`, `playwright-report/`, `test-results/`, `build/`, `*.tsbuildinfo`, aunque `.gitignore` ya los ignora. | P2 | devops |
| H-05 | La guarda de `.env` solo comprueba el nombre raíz `.env`; un `.env.local`/`.env.*` forzado con `git add -f` no se detecta por esa guarda (el secret scan podría no verlo si no coincide con sus patrones). | P3 | devops |
| H-06 | Supply-chain: actions por tag (`@v4`), sin `timeout-minutes`, sin `persist-credentials: false`; sin `npm audit`/dependency review. | P3 | devops |
| H-07 | No hay job pgTAP/unitarias/contrato, pese a `docs/05` §8 (punto 1: «pgTAP/contrato en cada push»). **Esperado en F0** (no hay suites); se habilita en F1. | P2 (F1) | devops + QA |
| H-08 | Paridad de entorno: CI Node 22 vs local Node 24.21.0 (engines `>=20`). Funciona, pero conviene fijar una sola versión. | P3 | devops |
| H-09 | `TEAM.md` §8 remite a `scripts/phase0-verify.ps1`, que no existe; el script real es `hidria_coding_team/scripts/phase0_verify.ps1` y la única guarda en `scripts/` es `scripts/ci/guardas.sh`. Documento y repo desalineados. | P3 | revisor + devops |

No se detectaron secretos, `.env` versionado, artefactos de build versionados ni
divergencia `docs/02`↔migración en el commit evaluado.

## 6. Pendientes / siguiente paso

- [ ] F1: añadir job pgTAP (servicio Postgres), Vitest y contrato de API por EF (H-07).
- [ ] F1: ampliar secret scan (nuevos formatos Supabase, tokens Cloudflare/R2, historial,
      gitleaks/trufflehog) y fijar actions por SHA (H-01, H-06).
- [ ] F1: ampliar nomenclatura a docs/tests/commits con allowlist (H-02).
- [ ] F1: validar también `hidria_coding_team/.env.example` y cerrar huecos de artefactos
      (H-03, H-04, H-05).
- [ ] Revisor de especificaciones: alinear `TEAM.md` §8 con el script real (H-09) y resolver
      las inconsistencias documentales listadas en `qa/trazabilidad.md` (H-1…H-7 de la
      matriz).
- [ ] F0-06 (supervisor): confirmar que los dos jobs son *required status checks* de `main`.

## Firma

QA `qa-tester`. No se modificó producto (`app/**`, `.github/**` intactos); solo
`qa/trazabilidad.md` y reportes de QA. **QA no mergea**: el merge lo ejecuta
`supervisor-hidria` tras spec review + security review + CI verde.
