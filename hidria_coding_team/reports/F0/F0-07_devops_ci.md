# F0-07 — CI mínima en verde (guardas + lint + typecheck + build)

- **Agente:** `devops-github-cloudflare` (07)
- **Fecha:** 2026-11-07 18:18 (America/Mexico_City) · 2026-11-08T00:18Z
- **Tarea:** `hidria_coding_team/tasks/F0/F0-07_ci_minima.md`
- **Rama / PR:** `chore/f0-fundacion` / [#2](https://github.com/horaciomartinez-svg/hidria-ect/pull/2)
- **Entorno:** local Windows (PowerShell 5.1, sin `bash`/WSL/Docker) + GitHub Actions `ubuntu-latest`
- **Commit evaluado:** `90c77ab95dec5f237c4cea7808efd719434db737` (head del PR #2;
  `main` = `f6b99ce…`)

## Resultado: VERDE

El workflow `.github/workflows/ci.yml` dispara en `pull_request` hacia `main` y en `push` a
`main`, usa `permissions: contents: read`, ejecuta las guardas del repositorio y
`npm ci` + `lint` + `typecheck` + `build`, y **los 2 checks del PR #2 están en `success`**
(run [42425963485](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42425963485),
52 s en total). La ejecución local reproduce lint/typecheck/build en verde. Se documentan
**mejoras concretas de endurecimiento** que no bloquean F0-07 y pasan al backlog F1.

> Solapamiento deliberado: la validación independiente de QA está en
> `reports/F0/F0-07_qa_ci.md` (hallazgos H-01…H-09); este reporte es la revisión del dueño
> de CI/CD y añade evidencia de la API de Actions, warnings reales del run y mejoras.

## 1. Evidencia de la API de Actions / check-runs del PR #2

| # | Consulta | HTTP | Resultado |
|---|---|---|---|
| 1 | MCP `pull_request_read(get_check_runs, #2)` | — | `total_count=2`, ambos `completed/success` |
| 2 | `GET /actions/runs?per_page=5` | **200** | 1 run: `42425963485` · `name=CI` · `event=pull_request` · `status=completed` · `conclusion=success` · `attempt=1` · `head_sha=90c77ab` · rama `chore/f0-fundacion` |
| 3 | `GET /actions/runs/42425963485` | **200** | creado `23:35:45Z` → actualizado `23:36:37Z` (**52 s**), `run_started_at=23:35:45Z`, workflow `.github/workflows/ci.yml` |
| 4 | `GET /actions/runs/42425963485/jobs` | **200** | 2 jobs, ambos `success` (detalle abajo) |
| 5 | `GET /actions/workflows` | **200** | 1 workflow activo: `CI` (`.github/workflows/ci.yml`) |
| 6 | `GET /commits/90c77ab/check-runs` | **200** | 2 check-runs `success`, app `github-actions` |
| 7 | MCP `pull_request_read(get_status, #2)` | — | `state: pending`, `total_count: 0` (no hay *commit statuses* clásicos; el bloqueo debe basarse en *check runs*, no en el status combinado) |
| 8 | `GET /actions/jobs/128564175440/logs` | **200** | guardas: 6/6 `[OK]` + `RESULTADO: VERDE (todas las guardas pasaron)` |
| 9 | `GET /actions/jobs/128564175630/logs` | **200** | `eslint src`, `tsc --noEmit`, `vite v5.4.21 building for production… ✓ built in 1.10s` |
| 10 | `GET /repos/.../contents/.github/workflows/ci.yml?ref=chore/f0-fundacion` | **200** | 909 bytes, SHA-256 `A99E6131…26CB26C` = archivo local; lo evaluado es exactamente lo mergeable |

### Jobs y duración

| Job | Job id | steps | Duración | URL |
|---|---|---|---|---|
| Guardas de repositorio | `128564175440` | checkout → `bash scripts/ci/guardas.sh` (todo success) | **3 s** (23:35:47→23:35:50Z) | [job](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42425963485/job/128564175440) |
| Cliente (lint + typecheck + build) | `128564175630` | checkout → setup-node 22 (cache npm) → `npm ci` → lint → typecheck → build (todo success) | **49 s** (23:35:47→23:36:36Z) | [job](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42425963485/job/128564175630) |

## 2. Revisión del workflow (`.github/workflows/ci.yml`, 44 líneas)

| Criterio F0-07 | Estado | Detalle |
|---|---|---|
| Dispara en `pull_request` hacia `main` | ✅ | `on.pull_request.branches: [main]` |
| Dispara en `push` a `main` | ✅ | `on.push.branches: [main]` |
| Permisos mínimos | ✅ | `permissions: contents: read` (workflow-level); no usa `secrets.*` |
| Job `guardas` | ✅ | `bash scripts/ci/guardas.sh`; 6 guardas (`.env`, secret scan, `docs/02`↔migración, `.env.example`, nomenclatura, artefactos) |
| Job `cliente` | ✅ | `npm ci` en raíz (workspaces npm → `app`), `npm run lint`, `typecheck`, `build` |
| Sin secretos en logs | ✅ | el workflow no referencia `secrets.*`; la guarda de secretos pasó |
| Reproducible desde clon limpio | ✅ | el runner Ubuntu hizo `actions/checkout@v4` + `npm ci` con `package-lock.json` (lockfileVersion 3) y terminó verde |
| Concurrencia | ✅ | `concurrency: ci-${{ github.ref }}`, `cancel-in-progress: true` |
| Nombres estables para *required checks* | ✅ | «Guardas de repositorio» y «Cliente (lint + typecheck + build)» coinciden con los check-runs reportados |

No hay `timeout-minutes`, ni `persist-credentials: false`, ni actions fijadas por SHA (ver §4).

## 3. Contraste con la ejecución local (`C:\Proyectos\hidria`)

Entorno local: **Node v24.21.0**, **npm 11.19.0**, `package-lock.json` `lockfileVersion: 3`.
Ejecutado con `cmd /c npm run …` midiendo con reloj (`Stopwatch`); salida completa en log temporal.

| # | Comando | Exit | Tiempo | Salida relevante |
|---|---|---|---|---|
| 1 | `npm run lint` | **0** | **8.3 s** | `eslint src` sin errores |
| 2 | `npm run typecheck` | **0** | **7.4 s** | `tsc --noEmit` sin errores |
| 3 | `npm run build` | **0** | **11.1 s** | `vite build`: `index.html` 0.65 kB · CSS 7.40 kB (2.15 kB gzip) · JS **144.78 kB (46.81 kB gzip)** · `✓ built in 1.24s` |
| 4 | `bash scripts/ci/guardas.sh` | **no ejecutable** | — | **Limitación del host:** no hay `bash` (ni WSL); el script es `bash` y está pensado para `ubuntu-latest` |
| 5 | Replicación local de las 6 guardas en PowerShell | **0** | ~2 s | **6/6 OK**: `.env` no trackeado, `.env.example` versionado, secret scan sin coincidencias, `docs/02`↔migración byte-idénticos (SHA-256 `2A7B6F88…42CB5`), nomenclatura prohibida ausente, artefactos no versionados (`77` archivos trackeados) |

`app/dist` generado: `index.html` (663 B), `assets/index-B96rn2yy.css` (7404 B),
`assets/index-DMFXj2JN.js` (144832 B) — se usó para el despliegue de F0-09.

**Honestidad de método:** no se re-ejecutó `npm ci` en local (ya existía `node_modules` y el
workspace es compartido); la instalación desde cero la prueba el job de CI en un runner limpio.
La ejecución canónica de las guardas es la de CI; la réplica en PowerShell solo contrasta el
mismo commit.

## 4. Warnings reales del run (de los logs) y mejoras concretas

### Warnings observados (no fallan el job)

| Warning | Origen | Acción sugerida |
|---|---|---|
| `##[warning] Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on Node.js 24: actions/checkout@v4, actions/setup-node@v4` | ambos jobs | Migrar a los majors de actions que ya corren en Node 24 (o fijar por SHA un commit que use Node 24) |
| `npm warn deprecated eslint@9.39.5: This version is no longer supported` | job `cliente` (`npm ci`) | Revisar upgrade de ESLint (major) en F1; el `package-lock` resuelve `^9.13.0` → `9.39.5` |
| `[DEP0040] punycode is deprecated` y `[DEP0169] url.parse() … security implications` | toolchain/npm/transitivas | Seguimiento en F1; no controlable desde nuestro código en F0 |

### Mejoras CI/CD (priorizadas)

| # | Mejora | Motivo | Prioridad | Dueño |
|---|---|---|---|---|
| M-01 | Fijar actions por **SHA completo** (o al menos majors con Node 24) y añadir `persist-credentials: false` al checkout | Supply-chain y eliminar warning Node 20 deprecado | P2 (F1) | DevOps |
| M-02 | Añadir `timeout-minutes` (p. ej. 10) a ambos jobs | Evitar jobs colgados consumiendo minutos | P3 | DevOps |
| M-03 | `cache-dependency-path: package-lock.json` explícito y Node **24** en CI (o `.nvmrc` + CI 22 local 22) | Paridad CI/local: hoy CI Node 22 vs local 24.21.0 (`engines >=20`) | P3 | DevOps |
| M-04 | Cuando exista protección de `main` (F0-06 hoy AMARILLO), marcar **required status checks** exactamente `Guardas de repositorio` y `Cliente (lint + typecheck + build)`, *strict/up-to-date*, PR + 1 aprobación, sin force push | El CI verde hoy es convención, no bloqueo técnico; el token actual no puede configurarlo (ver F0-01) | **P0 (F0-06)** | Supervisor/usuario |
| M-05 | Añadir un equivalente `scripts/ci/guardas.ps1` (mismas 6 guardas) o documentar que en Windows se usa la réplica | `bash` no existe en el host de desarrollo; hoy `npm run guardas` y el checklist del PR no se pueden ejecutar en local | P2 | DevOps |
| M-06 | Ampliar guardas: validar también `hidria_coding_team/.env.example` (con comentarios inline), patrones nuevos (`sb_secret_…`), historial con gitleaks, y artefactos `.playwright/`, `playwright-report/`, `test-results/`, `build/`, `*.tsbuildinfo` | Cierra los huecos H-01/H-03/H-04/H-05 de QA | P2 (F1) | DevOps + Seguridad |
| M-07 | Añadir `workflow_dispatch` y un workflow de **deploy staging** (Pages) disparado por `push` a `develop` (cuando exista) o manual, dependiente de CI | Hoy el deploy a Pages es manual (`wrangler`, ver F0-09); falta pipeline de despliegue de `docs/07` §5.5 | P1 (F1) | DevOps |
| M-08 | Añadir job pgTAP/unitarias/contrato (servicio Postgres) | `docs/05` §8 y H-07; no hay suites todavía en F0 | P2 (F1) | DevOps + QA |
| M-09 | Opcional: `npm audit --audit-level=high` / dependency review en PR | Detección temprana de dependencias vulnerables | P3 (F1) | DevOps |

## 5. Hallazgos

1. **CI mínima operativa y verde** en el PR #2; 2/2 checks en `success`; sin secretos en logs.
2. **La API de Actions/check-runs es legible con el token actual** (runs, jobs, steps, logs,
   check-runs), suficiente para operar el ciclo y auditar PRs.
3. **`get_status` da `pending` con 0 statuses**: no usar el *combined status* para gates;
   los gates deben ser *check runs* por nombre (y así lo hace el PR #2).
4. **No se puede exigir CI por configuración**: `main` sin protección ni required checks
   (F0-06); el token no puede fijarlos (F0-01). Queda como acción P0 del supervisor/usuario.
5. **Paridad de entorno:** CI Node 22 vs local Node 24; funciona (lockfile v3, engines >=20)
   pero conviene fijar una versión.
6. **Guardas no ejecutables en Windows** (`bash` ausente) pese a que `TEAM.md` §8 y el
   checklist del PR las piden antes de cada push; se compensó con réplica PowerShell, pero la
   mejora M-05 es real.
7. Warnings de deprecación de Node 20 en actions y de ESLint 9.39.5; ninguno afecta el
   resultado de F0-07.

## 6. Pendientes / siguiente paso

- [ ] (F0-06, P0) Protección de `main` + required checks — dueño: supervisor/usuario.
- [ ] (F1) M-01/M-02/M-03/M-06/M-07/M-08 en el backlog de DevOps.
- [ ] (F1) Revisar upgrade de ESLint por el warning de versión no soportada.
- [ ] (F1) Workflow de deploy a Pages (hoy manual, ver `F0-09_devops_cloudflare.md`).

## Veredicto

**VERDE** para F0-07: workflow correcto en lo esencial, CI verde en el PR #2 y build local
reproducido. Las mejoras M-01…M-09 son endurecimiento/plan F1 y no bloquean G0; la única
acción P0 asociada es habilitar *required checks* cuando exista protección de `main` (F0-06).
