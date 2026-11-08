# F0-01 — MCP GitHub operativo y alcance del token

- **Agente:** `devops-github-cloudflare` (07)
- **Fecha:** 2026-11-07 18:18 (America/Mexico_City) · 2026-11-08T00:18Z
- **Tarea:** `hidria_coding_team/tasks/F0/F0-01_mcp_github.md`
- **Rama / PR:** `chore/f0-fundacion` / [#2](https://github.com/horaciomartinez-svg/hidria-ect/pull/2)
- **Entorno:** local Windows (PowerShell 5.1) + GitHub API `api.github.com` (repo público)
- **Commit:** `90c77ab95dec5f237c4cea7808efd719434db737` (head del PR #2 y de la rama local);
  `main` = `f6b99ce10d8f71e9b0f08e70debeea6e5f630a87`
- **Credencial:** `GITHUB_TOKEN` del `.env` local. Valor **no** reproducido en este reporte.

## Resultado: VERDE

El MCP GitHub responde y opera el repositorio público `horaciomartinez-svg/hidria-ect`:
identidad, contenidos de `main`, ramas, commits, PR #2, check-runs y revisiones/comentarios se
leyeron correctamente. El token es un **PAT fine-grained** y **no** tiene el permiso de
administración (403 en endpoints de *branch protection* y *Actions settings*); la protección
de `main` se evalúa y documenta por separado en `reports/F0/F0-06_supervisor_branch_protection.md`
(AMARILLO: `main` sin protección). Esta limitación **no** afecta los criterios de F0-01,
que exigen precisamente documentar qué puede y qué no puede hacer el token.

## 1. Evidencia MCP GitHub (`mcp__github__*`)

Herramientas usadas: `get_me`, `get_file_contents` (×2), `list_branches`, `list_commits` (×2),
`pull_request_read` (`get`, `get_check_runs`, `get_status`, `get_commits`, `get_reviews`,
`get_comments`, `get_files`).

| # | Llamada MCP | Resultado (recortado) |
|---|---|---|
| 1 | `get_me` | `login: horaciomartinez-svg` · id `293212891` · tipo `User` · 8 repos públicos |
| 2 | `get_file_contents("/", ref=main)` | 4 entradas: `.gitignore`, `README.md`, `docs/`, `supabase/`. Correcto: `app/`, `.github/`, `scripts/`, `hidria_coding_team/` viven solo en la rama del PR (aún sin mergear a `main`) |
| 3 | `get_file_contents("docs", ref=main)` | 10 documentos (`00`–`08` + Arquitectura), incluidos `02-supabase_schema_hidria_mdohi.sql` y `07-Plan-de-Migracion…md` |
| 4 | `list_branches` | 3 ramas: `main` (`f6b99ce`, default), `chore/f0-fundacion` (`90c77ab`), `fix/forward-function-references` (`b356253`). Ninguna con `protected: true` |
| 5 | `list_commits(main, 5)` | Últimos: `f6b99ce` merge #1 · `b356253` fix schema · `4ab8d20` initial commit. `main` coincide con `origin/main` local |
| 6 | `list_commits(chore/f0-fundacion, 5)` | `90c77ab` `chore(f0): fundacion del equipo autonomo, monorepo y CI minima` · `91e05f8` `docs(07): …` (2 commits, igual que el PR) |
| 7 | `pull_request_read(get, #2)` | `state: open`, `draft: false`, `merged: false`, `mergeable_state: "clean"`, head `90c77ab` → base `main` `f6b99ce`, 2 commits, 65 archivos, `+7279/-19` |
| 8 | `pull_request_read(get_check_runs, #2)` | `total_count: 2` y **ambos `success`**: «Guardas de repositorio», «Cliente (lint + typecheck + build)» (run `42425963485`) |
| 9 | `pull_request_read(get_status, #2)` | `state: pending`, `total_count: 0` (no se usan *commit statuses* clásicos; el CI reporta vía *check runs*) |
| 10 | `pull_request_read(get_commits, #2)` | `91e05f8` + `90c77ab` (coincide con la rama) |
| 11 | `pull_request_read(get_reviews, #2)` | `[]` → **0 revisiones / 0 aprobaciones** (cuórum pendiente; ver F0-06 y QA) |
| 12 | `pull_request_read(get_comments, #2)` | `[]` → sin comentarios de revisión |
| 13 | `pull_request_read(get_files, #2)` | 65 archivos; incluye `.env.example`, `.github/workflows/ci.yml`, `scripts/ci/guardas.sh`, `app/**`; **no** incluye `.env` ni artefactos (`node_modules/`, `dist/`) |

## 2. Evidencia REST + git (comandos ejecutados, valores de token nunca impresos)

Token leído en memoria desde `C:\Proyectos\hidria\.env`; peticiones con
`Authorization: Bearer <token>`. `TOKEN_LEN` y el valor no se registran.

| # | Consulta | HTTP | Resultado |
|---|---|---|---|
| 1 | `GET /user` | **200** | `login=horaciomartinez-svg`, `type=User`; sin cabecera `x-oauth-scopes` → PAT **fine-grained**; expira `2027-02-05 21:55:33 UTC` |
| 2 | `GET /repos/horaciomartinez-svg/hidria-ect` | **200** | `private=false`, `visibility=public`, `default_branch=main`, `allow_forking=true`; `permissions={admin,maintain,push,triage,pull: true}` (rol del usuario dueño) |
| 3 | `GET /repos/.../branches/main` | **200** | `protected=false`, sha `f6b99ce…` |
| 4 | `GET /repos/.../branches/main/protection` | **403** | cabecera `x-accepted-github-permissions: administration=read`, cuerpo vacío → token **sin** permiso Administration (no es «protección oculta»: el punto 3 ya reporta `protected=false`) |
| 5 | `GET /repos/.../branches/main/protection/required_status_checks` | **403** | misma causa (administration=read) |
| 6 | `GET /repos/.../rulesets` | **200** | `[]` → 0 *rulesets* en el repo |
| 7 | `GET /repos/.../collaborators?per_page=10` | **200** | 1 colaborador: `horaciomartinez-svg` (`role=admin`) |
| 8 | `GET /repos/.../actions/permissions` | **403** | `x-accepted-github-permissions: administration=read` |
| 9 | `GET /repos/.../contents/README.md?ref=main` | **200** | lectura de contenidos OK (`contents=read`) |
| 10 | `GET /repos/.../contents/.github/workflows/ci.yml?ref=chore/f0-fundacion` | **200** | 909 bytes, SHA-256 `A99E6131…26CB26C`; **idéntico** al archivo local (misma rama) |
| 11 | `GET /repos/.../actions/runs?per_page=5` | **200** | 1 run: `42425963485` `CI`, `event=pull_request`, `conclusion=success`, `head_sha=90c77ab`, rama `chore/f0-fundacion` |
| 12 | `GET /repos/.../commits/90c77ab/check-runs` | **200** | `total_count=2`, ambos `success`, app `github-actions` |
| 13 | `GET https://api.github.com/repos/...` sin auth | **200** | confirma repo público |
| 14 | `git ls-remote origin main chore/f0-fundacion` | — | `main=f6b99ce…`, `chore/f0-fundacion=90c77ab…` |
| 15 | `git rev-parse HEAD` / `origin/main` | — | HEAD local `90c77ab…` = rama remota; `origin/main` `f6b99ce…` |

## 3. Alcance real del token (qué puede y qué no)

| Capacidad | Estado | Evidencia |
|---|---|---|
| Autenticarse e identidad (`/user`) | ✅ | HTTP 200 |
| Metadatos del repo (`metadata=read`) | ✅ | `/repos/...` 200 |
| Contenidos y git (`contents=read`) | ✅ | `/contents/...` 200; MCP `get_file_contents` |
| Pull requests: leer, listar revisiones, comentarios, commits, files | ✅ | MCP `pull_request_read` (7 métodos) |
| Actions: correr/leer runs, jobs, check-runs, logs | ✅ | `/actions/runs`, `/actions/jobs/:id/logs`, check-runs 200 |
| Protección de rama / *rulesets* (lectura) | ❌ | 403 `administration=read` |
| Configuración de Actions (`/actions/permissions`) | ❌ | 403 `administration=read` |
| Administrar el repo (protección, settings, secrets) | ❌ (no probado; prohibido el cambio) | El permiso Administration no está en el token |

**Notas de alcance:**

- `permissions.admin=true` en `/repos` refleja el **rol del usuario** (owner), no la capacidad
  del PAT; los 403 con `x-accepted-github-permissions: administration=read` demuestran que el
  token no puede leer ni escribir administración. No se ejecutó ningún `PUT`/`POST` de
  administración (regla de la tarea: no intentar cambiar la protección).
- **No se realizó ninguna escritura** con el token: ni merge, ni push, ni comentarios, ni
  revisiones. El alcance de escritura (contents/PR/actions) no se probó deliberadamente por las
  reglas duras del rol.
- Expiración `2027-02-05`: hay que rotarlo antes de esa fecha (aviso para el supervisor).
- El MCP GitHub está autenticado como el mismo usuario (`get_me.login` = dueño del repo).

## 4. Hallazgos

1. **MCP GitHub VERDE**: las herramientas usadas responden y el repo/rama/PR se leen bien.
2. **`main` es la rama por defecto** y coincide con `origin/main` (`f6b99ce`); la rama del PR
   (`90c77ab`) coincide con el remoto y con el HEAD local.
3. **Token suficiente para el ciclo del equipo** (leer repo/PRs/CI) pero **insuficiente para
   administración**: no puede leer ni fijar *branch protection* ni *required checks*.
4. **PR #2 sin aprobaciones** (`reviews=[]`) y aun así `mergeable_state=clean` → coherente con
   que `main` no esté protegida (F0-06 AMARILLO). El merge sigue siendo decisión del supervisor.
5. **Único colaborador = dueño** (`horaciomartinez-svg`), sin organización ni equipos: *bus
   factor* 1 y sin revisores adicionales reales; las aprobaciones del cuórum se hacen con el
   mismo token.
6. El contenido de `main` aún no tiene `app/`, `.github/`, `scripts/` ni `hidria_coding_team/`
   (se incorporan al mergear el PR #2); por eso `get_file_contents("/", main)` devuelve solo
   4 entradas. No es un defecto.
7. La guarda de secretos y el contenido del PR no muestran `.env` ni artefactos (revisión de
   archivos del PR; el secret scan formal está en F0-03/F0-07).

## 5. Riesgos y pendientes

- **P0 (ajeno a esta tarea):** `main` sin protección y token sin Administration → F0-06 sigue
  AMARILLO; el supervisor/usuario debe activar la protección o documentar excepción.
- **P2:** rotar el PAT antes de `2027-02-05`; considerar token con Administration(read) solo si
  se quiere que el supervisor configure required checks por API (hoy no puede).
- **P3:** añadir un segundo colaborador/revisor real para que las 2 aprobaciones del cuórum no
  dependan de la misma cuenta.
- No hay pendientes de F0-01: los criterios de aceptación se cumplen.

## Veredicto

**VERDE** para F0-01: MCP GitHub operativo, repo/rama/PR verificados, alcance del token
documentado y sin exposición de secretos. La carencia de permiso de administración queda
registrada como limitación (no como fallo del MCP) y se cruza con F0-06.
