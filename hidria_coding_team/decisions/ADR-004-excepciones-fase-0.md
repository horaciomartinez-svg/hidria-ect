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
| E1 | `main` sin protección | (1) `GET /branches/main/protection`; (2) `GET /rulesets`; (3) GraphQL `branchProtectionRules`; (4) `PUT /protection` | 403 / `[]` / FORBIDDEN / 403; `protected=false`, `protection.enabled=false` | `reports/F0/F0-06_supervisor_branch_protection.md` |
| E2 | Sin proyecto Supabase `staging` | (1) MCP Supabase solo expone `zucalshlfcxejpukshxl`; (2) no hay `SUPABASE_ACCESS_TOKEN` en `.env`; (3) `npx supabase projects list` no puede autenticarse | No se puede crear/consultar otro proyecto | `reports/F0/F0-02_arquitecto-bd_supabase.md`, `reports/F1/F1-01_dev-edge-functions_contrato.md` (B-02) |
| E3 | Auth hook sin activar / JWT no verificado | (1) `custom_access_token_hook` ausente en `pg_proc`; (2) sin Management API token; (3) sin dashboard/CLI autenticado | Función solo documentada, no activada | `reports/F0/F0-10_arquitecto-bd_auth_hook.md` |
| E4 | Acta de validación 0.6 | Requiere firma de la Coordinación (humano) | Pendiente | `tasks/F0/F0-12` |

## Decisión

1. **G0 se cierra con excepciones E1–E4 documentadas** y controles compensatorios, no en
   VERDE pleno. El estado del gate es **AMARILLO-OPERATIVO**: habilita Fase 1 con datos
   **sintéticos únicamente**.
2. **Branch protection (E1):** controles compensatorios vigentes (solo el supervisor
   mergea, CI obligatoria, 2 revisiones + QA registradas, squash, prohibición de force
   push); re-verificación en cada ciclo. **Acción del usuario:** activar la protección en
   GitHub UI o emitir un PAT con `Administration: read & write`. Mientras no exista, la
   garantía es organizativa.
3. **Entornos (E2):** hasta que el usuario provisione un proyecto `staging` dedicado, el
   proyecto `zucalshlfcxejpukshxl` se usa como **dev/staging con datos sintéticos**; queda
   **prohibido cargar datos reales** (`restringido_nda`) hasta la separación staging↔piloto.
   `TEAM.md` §9 se ajusta para reflejarlo.
4. **Auth hook (E3):** la función se entregará como migración forward-only en `F1-01` y se
   activará cuando el usuario aporte `SUPABASE_ACCESS_TOKEN` o lo haga desde el dashboard;
   entretanto, los tests SEC-04 se ejecutan con claims simulados y `SET LOCAL ROLE`.
5. **Acta 0.6 (E4):** se solicita a la Coordinación; no bloquea el desarrollo sintético.
6. **G1 no se cierra** hasta completar E1/E3 y las suites de `docs/05` de Fase 1.

## Consecuencias

- El equipo avanza a Fase 1 con datos sintéticos y controles compensatorios.
- El reporte de creación (`reports/F0/00-LEAD-creacion-equipo.md`) registra E1–E4 y la
  acción requerida del usuario; `reports/F0/00-supervisor_estado.md` se actualizará al
  cierre de G0 (PR de seguimiento tras el merge).
- Las acciones de usuario quedan como pendientes abiertos en el reporte de creación y en la
  tarea `F0-12`; no se crean tareas nuevas de producto para ellas.

## Aprobación

| Rol | Nombre | Estado | Evidencia |
|---|---|---|---|
| Supervisor | `supervisor-hidria` | aprobado | `00-supervisor_estado.md` (post-merge) |
| Revisor | `revisor-especificaciones` | aprobado | re-revisión exprés `09998ef` / `ffcbaf6` |
