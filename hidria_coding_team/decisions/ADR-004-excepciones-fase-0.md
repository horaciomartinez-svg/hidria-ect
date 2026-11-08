# ADR-004 — Excepciones de Fase 0 por credenciales y entornos

- **Estado:** aceptada (aprobada por `revisor-especificaciones` y `supervisor-hidria`; G0 cerrado AMARILLO-OPERATIVO en el merge `1da64d0`)
- **Fecha:** 2026-11-08
- **Autor:** Lead (creador del equipo)
- **Documentos afectados:** `docs/07` §2/§3 (0.1, 0.5, 0.6), `TEAM.md` §9/§13/§14,
  `tasks/F0/F0-06`, `F0-10`, `F0-12`
- **Aprobación requerida:** `supervisor-hidria` + `revisor-especificaciones`

## Contexto

La Fase 0 exige (a) `main` protegida, (b) un proyecto Supabase `staging` separado del
`piloto`, (c) Auth hook de custom claims activo y verificado, y (d) acta de validación de
contenido con la Coordinación. El entorno entregado no permite completar (a)–(c) sin
credenciales adicionales, y (d) depende de la Coordinación (humano).

## Evidencia de los 3 intentos (por excepción)

| # | Excepción | Intentos documentados | Resultado | Evidencia |
|---|---|---|---|---|
| E1 | `main` **protegida** con el ruleset `proteccion-main` (id 26780941) | (1) `GET /branches/main` → `protected:true`; (2) `GET /rulesets` → 1 ruleset `active`; (3) `GET /rulesets/26780941` → PR + checks + non-fast-forward; (4) PR #4 → `mergeable_state:"blocked"` | **RESUELTA el 2026-11-07 19:24** (acción del usuario); introduce una restricción operativa de aprobación (§E1) | `reports/F0/F0-13_verificacion_ruleset_e1.md`, `reports/F0/F0-06_supervisor_branch_protection.md` |
| E2 | Sin proyecto Supabase `staging` | (1) MCP Supabase solo expone `zucalshlfcxejpukshxl`; (2) no hay `SUPABASE_ACCESS_TOKEN` en `.env`; (3) `npx supabase projects list` no puede autenticarse | No se puede crear/consultar otro proyecto | `reports/F0/F0-02_arquitecto-bd_supabase.md`, `reports/F1/F1-01_dev-edge-functions_contrato.md` (B-02) |
| E3 | Auth hook sin activar / JWT no verificado | (1) `custom_access_token_hook` ausente en `pg_proc`; (2) sin Management API token; (3) sin dashboard/CLI autenticado | Función solo documentada, no activada | `reports/F0/F0-10_arquitecto-bd_auth_hook.md` |
| E4 | Acta de validación 0.6 | Requiere firma de la Coordinación (humano) | Pendiente | `tasks/F0/F0-12` |

### E1 — RESUELTA: ruleset `proteccion-main` (2026-11-07 19:24)

El usuario activó la protección de `main`. Verificación por API (evidencia en
`reports/F0/F0-13_verificacion_ruleset_e1.md`):

| Campo | Valor |
|---|---|
| `GET /branches/main` | `protected: true` |
| Ruleset | `proteccion-main` (id `26780941`), `enforcement: active`, target `refs/heads/main` |
| Reglas | `deletion` (no borrar), `non_fast_forward` (sin force push), `pull_request` (1 aprobación; stale reviews se descartan al push; squash/merge/rebase permitidos), `required_status_checks` = `Guardas de repositorio` y `Cliente (lint + typecheck + build)` |
| `bypass_actors` | `[]` · `current_user_can_bypass: "never"` |
| Efecto observado | PR #4 pasó de `mergeable_state:"clean"` a **`"blocked"`** |

**Restricción operativa nueva:** el único colaborador es `horaciomartinez-svg`, que es el
autor de los PRs → GitHub **prohíbe la auto-aprobación** (`POST /pulls/4/reviews` con
`event=APPROVE` → *"Can not approve your own pull request"*). Con `required_approving_review_count: 1`
y `bypass_actors: []`, **ningún PR puede mergearse hasta que el usuario apruebe desde una
segunda identidad o ajuste el ruleset**. El usuario confirmó que aprobará manualmente; el
equipo debe dejar los PRs listos (checks verdes + revisiones en `reports/`) y **no**
intentar mergear sin esa aprobación.

Salidas posibles si el usuario no dispone de segunda identidad (decisión del usuario, no del
equipo): (a) añadir un `bypass_actor` para el rol admin o para `horaciomartinez-svg`;
(b) `required_approving_review_count = 0` manteniendo checks + PR + non-fast-forward; o
(c) añadir un segundo colaborador que apruebe.

## Decisión

1. **G0 se cierra con las excepciones E2–E4 documentadas** (E1 resuelta) y controles
   compensatorios. El estado del gate es **AMARILLO-OPERATIVO**: habilita Fase 1 con datos
   **sintéticos únicamente**.
2. **Protección de `main` (E1):** **RESUELTA** con el ruleset `proteccion-main`. Se eliminan
   los controles puramente organizativos para la protección de rama; se mantiene el cuórum
   del equipo (spec + seguridad + QA) como requisito de calidad **adicional** a la aprobación
   humana que exige GitHub. La garantía técnica pasa a ser el ruleset + CI obligatoria.
3. **Entornos (E2):** hasta que el usuario provisione un proyecto `staging` dedicado, el
   proyecto `zucalshlfcxejpukshxl` se usa como **dev/staging con datos sintéticos**; queda
   **prohibido cargar datos reales** (`restringido_nda`) hasta la separación staging↔piloto.
   `TEAM.md` §9 se ajusta para reflejarlo.
4. **Auth hook (E3):** la función se entregará como migración forward-only en `F1-01` y se
   activará cuando el usuario aporte `SUPABASE_ACCESS_TOKEN` o lo haga desde el dashboard;
   entretanto, los tests SEC-04 se ejecutan con claims simulados y `SET LOCAL ROLE`.
5. **Acta 0.6 (E4):** se solicita a la Coordinación; no bloquea el desarrollo sintético.
6. **G1 no se cierra** hasta resolver E2/E3/E4 y tener las suites de `docs/05` de Fase 1 en
   verde (la excepción de pgTAP de `F1-00` obliga a `task-13` antes de G1).

## Consecuencias

- El equipo avanza a Fase 1 con datos sintéticos.
- E1 queda cerrada; las acciones de usuario pendientes son **E2** (proyecto staging), **E3**
  (activación del auth hook) y **E4** (acta 0.6).
- El reporte de creación (`reports/F0/00-LEAD-creacion-equipo.md`) registra E1–E4;
  `reports/F0/F0-06_supervisor_branch_protection.md` y `00-supervisor_estado.md` reciben el
  anexo E1-resuelta por el supervisor.
- Los merges pasan a requerir **aprobación humana** (ruleset) además del cuórum del equipo;
  el supervisor no mergea sin esa aprobación.

## Aprobación

| Rol | Nombre | Estado | Evidencia |
|---|---|---|---|
| Supervisor | `supervisor-hidria` | aprobado | `00-supervisor_estado.md` (post-merge) |
| Revisor | `revisor-especificaciones` | aprobado | re-revisión exprés `09998ef` / `ffcbaf6` |
