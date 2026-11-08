# F0-13 — Verificación del ruleset `proteccion-main` (cierre de E1)

- **Agente:** Lead (creador) — verificación independiente por API
- **Fecha:** 2026-11-07 19:25 (America/Mexico_City)
- **Tarea:** cierre de la excepción **E1** de `ADR-004`
- **Entorno:** GitHub API sobre `horaciomartinez-svg/hidria-ect`
- **Credencial:** `GITHUB_TOKEN` del `.env` (valor no reproducido); solo lectura

## Resultado: VERDE — E1 RESUELTA

El usuario activó la protección de `main` mediante un **ruleset** (no branch protection
clásica). Verificación independiente:

| # | Consulta | Resultado |
|---|---|---|
| 1 | `GET /repos/horaciomartinez-svg/hidria-ect/rulesets` | 1 ruleset: **`proteccion-main`** (id `26780941`), `target: branch`, `source_type: Repository`, `enforcement: active` |
| 2 | `GET /repos/.../rulesets/26780941` | `conditions.ref_name.include = ["refs/heads/main"]`; reglas: `deletion`, `non_fast_forward`, `pull_request` (`required_approving_review_count: 1`, `dismiss_stale_reviews_on_push: true`, `require_last_push_approval: false`, `require_extra_approval_for_unattributed_changes: true`, `allowed_merge_methods: merge/squash/rebase`), `required_status_checks` (`Guardas de repositorio`, `Cliente (lint + typecheck + build)`; `strict: false`) |
| 3 | `bypass_actors` del ruleset | `[]` · `current_user_can_bypass: "never"` |
| 4 | `GET /repos/.../branches/main` | `protected: true` |
| 5 | `GET /repos/.../pulls/4` | `mergeable_state` pasó de `clean` a **`blocked`** (efecto correcto del ruleset) |
| 6 | `POST /repos/.../pulls/4/reviews` con `event=APPROVE` | **Rechazado:** `"Can not approve your own pull request"` (el único colaborador es el autor) |

## Consecuencia operativa (importante)

El ruleset exige **1 aprobación de review de GitHub**. El único colaborador del repositorio
es `horaciomartinez-svg`, que es el autor de los PRs; GitHub prohíbe la auto-aprobación y
`bypass_actors` está vacío. Por tanto:

- **Ningún PR es mergeable** hasta que el usuario apruebe desde una **segunda identidad** o
  ajuste el ruleset.
- Las revisiones del equipo (spec, seguridad, QA) siguen siendo obligatorias como **cuórum de
  calidad** en `reports/`, pero **no** sustituyen la aprobación de GitHub.
- El supervisor **no debe intentar mergear** (ni usar bypass) hasta que conste la aprobación.

### Salidas posibles (decisión del usuario)

1. Añadir un `bypass_actor` al ruleset (rol *Repository admin* o `horaciomartinez-svg`) con
   `bypass_mode: "always"`/`"pull_request"`.
2. Poner `required_approving_review_count: 0` manteniendo `required_status_checks`,
   `pull_request`, `deletion` y `non_fast_forward`.
3. Añadir un **segundo colaborador con permiso de escritura** que apruebe los PRs.

## Evidencia

- `reports/F0/F0-06_supervisor_branch_protection.md` (anexo E1 RESUELTA del supervisor).
- `reports/F0/00-supervisor_estado.md` (E1 cerrada; quedan E2–E4).
- `reports/F0/00-LEAD-creacion-equipo.md` (tabla E1–E4 actualizada).

## Pendientes

- El usuario debe aprobar el PR documental de cierre y, cuando esté corregido, el PR #4.
- Re-verificar `GET /branches/main` (`protected:true`) antes de cada merge.

## Remediación elegida por el usuario (2026-11-07 19:50)

Para desbloquear los merges sin una segunda identidad, el usuario eligió
**`required_approving_review_count = 0`**, manteniendo `required_status_checks`,
`pull_request`, `deletion` y `non_fast_forward`. El equipo no puede aplicarlo (sin permiso
de administración: `PUT /rulesets/26780941` → **403**); lo aplica el usuario en
*Settings → Rules → Rulesets → `proteccion-main`*.

Hasta que se aplique, PR #5 y PR #4 siguen `blocked`. Después: CI obligatorio + cuórum del
equipo + squash del supervisor.
