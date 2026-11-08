# F0-06 — Protección de `main` verificada

- **Agente:** supervisor-hidria
- **Fecha:** 2026-11-07 17:39 (America/Mexico_City)
- **Tarea:** `tasks/F0/F0-06_branch_protection.md`
- **Rama / PR:** `chore/f0-fundacion` / #2 — <https://github.com/horaciomartinez-svg/hidria-ect/pull/2>
- **Entorno:** GitHub API (`horaciomartinez-svg/hidria-ect`, repo público)
- **Commit:** `90c77ab95dec5f237c4cea7808efd719434db737` (HEAD de la rama del PR #2);
  `main` = `f6b99ce10d8f71e9b0f08e70debeea6e5f630a87`
- **Credencial:** `GITHUB_TOKEN` del `.env` local (valor **no** reproducido en este reporte)

## Resultado: AMARILLO

La verificación está **completa y es concluyente**: `main` **NO está protegida**. No hay
error de verificación, sino un **hueco real de configuración** que el token actual no puede
corregir (403 por falta del permiso de administración). Se documentan controles
compensatorios y la acción que requiere el usuario. El ítem G0 "protección de `main`"
**no puede marcarse VERDE** hasta que la protección exista o el usuario acepte por escrito
la excepción con controles compensatorios.

## Comandos y evidencia

Todos los comandos se ejecutaron en `C:\Proyectos\hidria` con `curl.exe` contra
`https://api.github.com`, tomando el token en memoria desde `.env` (nunca impreso).

| # | Comando / consulta | Resultado (resumen) |
|---|---|---|
| 1a | `GET /repos/horaciomartinez-svg/hidria-ect` | HTTP **200**. Repo público, `default_branch: main`, `permissions: {admin:true, maintain:true, push:true, pull:true}` (rol del usuario autenticado como OWNER). |
| 1b | `GET /repos/.../branches/main` | HTTP **200**. `"protected": false` y `"protection": {"enabled": false, "required_status_checks": {"enforcement_level": "off", "checks": []}}`. |
| 1c | `GET /repos/.../branches/main/protection` | HTTP **403** — `"Resource not accessible by personal access token"`. El endpoint de *branch protection* exige el permiso **Administration** del token; el token no lo tiene (el 403 es de permiso, no de "no configurada"). |
| 2 | `GET /repos/.../rulesets` | HTTP **200** con cuerpo `[ ]` → **0 rulesets** visibles en el repo (tampoco `includes_parents=true`). Sin reglas de organización que hereden. |
| 3 | `POST /graphql` → `repository { branchProtectionRules(first:10) { totalCount ... } }` | HTTP 200 con `errors[0].type = "FORBIDDEN"`, `path = ["repository","branchProtectionRules"]`, `message = "Resource not accessible by personal access token"`. GraphQL tampoco puede leer las reglas. |
| 4 | `GET /repos/.../branches?per_page=100` | HTTP **200**; las 3 ramas (`chore/f0-fundacion`, `fix/forward-function-references`, `main`) con `"protected": false`. |
| 5 | `GET /repos/.../pulls/2` | HTTP **200**. `state: open`, `merged: false`, `mergeable: true`, **`mergeable_state: "clean"`**, `reviews` pendientes (ver #6), `commits: 2`, `changed_files: 65`, `+7279 / -19`. |
| 6 | `GET /repos/.../pulls/2/reviews` | HTTP **200** con cuerpo `[ ]` → **0 revisiones / 0 aprobaciones**. `review_comments: 0`, `requested_reviewers: []`. |
| 7 | `GET /repos/.../commits/90c77ab/check-runs` | HTTP **200**, `total_count: 2`, ambos `conclusion: "success"`: **"Guardas de repositorio"** y **"Cliente (lint + typecheck + build)"**. |
| 8 | `GET /repos/.../commits/90c77ab/status` | HTTP 200, `state: pending`, `total_count: 0` (no se usan *commit statuses* clásicos; el CI reporta vía *check runs*). |

### Interpretación técnica del 403

- `GET /branches/main` devuelve `protected=false` **sin** requerir permiso de
  administración (dato de metadatos del repo) → es la lectura autoritativa disponible y
  demuestra que la rama **no tiene protección clásica**.
- `GET /branches/main/protection` y GraphQL `branchProtectionRules` devuelven 403 con el
  mensaje `Resource not accessible by personal access token`: el PAT es *fine-grained* y le
  falta el permiso **Administration (read)** sobre el repo. No es que la protección exista
  y esté oculta: `GET /branches/main` ya reporta `protected=false`.
- `GET /rulesets` responde 200 `[ ]`: aun con visibilidad parcial, no hay *rulesets* que
  impongan PR obligatorio, revisión o *force push*.

### Evidencia conductual (sin mergear)

El paso 2 de la tarea sugería un intento conductual de `merge_pull_request` sin
aprobaciones. **No se ejecutó intencionalmente**, porque con la protección desactivada ese
intento habría **mergeado realmente** el PR #2 (violando la regla dura del ciclo "NO
mergear PR #2 todavía" y `TEAM.md` §15.3). La evidencia conductual se sustituye por:

- `mergeable_state: "clean"` + `merged: false` → GitHub **no** está exigiendo ninguna
  condición de protección para mergear (ni revisión, ni *status checks* obligatorios).
- `GET /pulls/2/reviews` = `[]` → **0 aprobaciones** y aun así el PR está `mergeable`.
- Conclusión conductual: un merge vía API habría pasado; la protección **no existe**.

## Hallazgos

1. **`main` NO está protegida** (`protected:false`, `protection.enabled:false`,
   `enforcement_level:"off"`, 0 rulesets). `TEAM.md` §8 y §13 (G0) la exigen.
2. **El token no tiene permiso de administración**: no puede leer (ni escribir) la
   configuración de protección → el supervisor **no puede corregirlo por API**.
   Condición de PARO potencial (`TEAM.md` §12.1: credencial insuficiente, ya con 3
   intentos documentados: REST protección, REST rulesets, GraphQL).
3. **No hay *required status checks***: CI verde es hoy una **convención de equipo**, no un
   bloqueo técnico. Aun así, el PR #2 tiene los 2 checks en `success`.
4. **PR #2 listo a nivel CI**: 2/2 checks verdes, `mergeable:clean`; faltan las revisiones
   (spec + seguridad) y QA, y la decisión de merge del supervisor.
5. **Riesgo de proceso**: mientras `main` no esté protegida, cualquier colaborador (o el
   propio agente por error) puede hacer push directo o `--force`. La mitigación es
   organizativa, no técnica.

## Controles compensatorios (mientras no exista protección)

| Control | Mecanismo | Estado |
|---|---|---|
| Solo `supervisor-hidria` mergea a `main` | `TEAM.md` §6/§7/§11; instrucción del agente 01 §11 | Vigente (política) |
| CI obligatoria en la práctica | `.github/workflows/ci.yml` (`Guardas de repositorio` + `Cliente`); el supervisor no mergea sin checks verdes | Vigente (2/2 verdes en #2) |
| Cuórum de 2 aprobaciones + QA registrado en `reports/` | `reports/reviews/PR-2_spec.md`, `reports/security/PR-2_security.md`, `reports/qa/PR-2_qa.md`; checklist §7 del agente 01 | En curso |
| Prohibido `git push --force` | `TEAM.md` §11/§15; nadie lo ejecuta | Vigente (política) |
| Merge por squash + revisión post-merge | Supervisor; `main` avanza por PR | Vigente (política) |
| Verificación de branch protection en cada ciclo | Reintentar `GET /branches/main` antes de cada merge | Programado |

## Acción requerida (escalamiento al usuario / Lead)

El repo es del usuario (`OWNER`), pero el token del equipo no puede administrarlo. Se
requiere **una** de estas acciones (el usuario es el único que puede):

1. **Activar la protección en GitHub UI** — Settings → Branches → Add branch protection
   rule para `main` con: *Require a pull request before merging* (1 aprobación),
   *Dismiss stale approvals* (opcional), *Require status checks* = `Guardas de repositorio`
   y `Cliente (lint + typecheck + build)`, *Require branches to be up to date*,
   *Do not allow force pushes*, *Do not allow deletions*. (Alternativa: un *ruleset* con las
   mismas reglas; hoy hay 0.)
2. **Emitir un token con permiso de administración** (fine-grained PAT con
   `Administration: Read and write` sobre `hidria-ect`, o PAT clásico con scope `repo` +
   `admin:repo_hook`) y actualizar `GITHUB_TOKEN` en `.env`; después se re-ejecuta la
   verificación de este reporte y, si hace falta, el supervisor configura la protección.
3. **Aceptar formalmente la excepción** (`decisions/ADR-…`) con los controles
   compensatorios de la tabla anterior, con fecha de caducidad y revisión en G1.

Re-verificación (tras cualquiera de las 3 acciones), sin imprimir el token:

```powershell
$tok = ((Get-Content 'C:\Proyectos\hidria\.env' | Where-Object { $_ -match '^\s*GITHUB_TOKEN\s*=' }) -split '=',2)[1].Trim().Trim('"')
curl.exe -s -w "`nHTTP:%{http_code}`n" -H "Authorization: Bearer $tok" `
  -H "Accept: application/vnd.github+json" `
  "https://api.github.com/repos/horaciomartinez-svg/hidria-ect/branches/main"
# Esperado si queda protegida: "protected": true y protection.enabled: true
```

## Pendientes / siguiente paso

- **Pendiente P0:** activar la protección (usuario) o mantener la excepción **E1** de
  ADR-004 (aprobada por el supervisor y el revisor). F0-06 queda **AMARILLO** y G0 se cierra
  como **AMARILLO-OPERATIVO** con E1–E4.
- **Pendiente:** repetir la verificación tras la acción del usuario y anexar la salida con
  fecha.
- **Siguiente paso del supervisor:** checklist G0 en `reports/F0/00-supervisor_estado.md`
  (cerrado con excepciones) y re-verificación de protección en cada ciclo de merge.

## Actualización post-merge (2026-11-07 18:42)

- PR #2 mergeado con squash (`1da64d0`) el 2026-11-07 18:42; `main` = `1da64d0`.
- Re-verificación inmediata: `GET /branches/main` → **`protected: false`**,
  `protection.enabled: false`, `enforcement_level: "off"`; `GET /rulesets` → `[]`.
  **E1 sigue abierta** (ADR-004) y se mantienen los controles compensatorios; el usuario debe
  activar la protección o emitir un PAT con `Administration`.
- El merge de #2 se ejecutó como excepción E1 documentada, con cuórum completo
  (spec APROBADO, seguridad sin veto, QA VERDE) y CI 4/4 en `ffcbaf6`.
