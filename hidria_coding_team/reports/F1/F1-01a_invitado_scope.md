# F1-01a — Alcance del rol `invitado` (Q-02/SEC-PR7-D2, task-35)

- **Agente:** `arquitecto-bd` (02)
- **Fecha:** 2026-11-12 19:55 (America/Mexico_City)
- **Tarea:** `task-35` — Q-02/QA + SEC-PR7-D2/seguridad (PR #7)
- **Rama:** `fix/F1-task35-invitado`, desde `main` `a6cc7e6`
- **ADR:** `hidria_coding_team/decisions/ADR-011-alcance-invitado.md`
- **Migración:** `supabase/migrations/20261108050000_f1_01a_invitado_scope.sql` (aplicada vía MCP)
- **Entorno:** `zucalshlfcxejpukshxl` (dev/staging sintético, ADR-004 E2); `schema_migrations = 21`
- **Alcance:** policies/triggers/tests/docs; sin datos reales, sin cambios de columnas/tablas.

## Resultado: VERDE (DB)

El `invitado` deja de tener lectura tenant-wide. La matriz vinculante del revisor queda
implementada y probada; `observador`/miembros conservan su alcance y la creación de un
diagnóstico por `equipo` ya no deja al creador sin visibilidad.

## 1. Matriz implementada

| Objeto | SELECT |
|---|---|
| `diagnostics_sel` | tenant + (`my_diagnostic_role(id)` o `global_role IN (admin_institucional, coordinador_srhds)`) |
| `profiles_sel` | tenant, salvo `invitado` → solo `user_id = auth.uid()` (claim JWT, `IS DISTINCT FROM`) |
| `companies_sel` | tenant + (agregado SRHDS o `EXISTS` diagnóstico del tenant con membresía) |
| `documents_sel`, `iih_assets_sel`, `samples_sel`, `water_balances_sel` | tenant; invitado solo `is_diagnostic_member(diagnostic_id)` |
| `signatures_sel` | tenant; invitado solo si el `document_id` pertenece a un diagnóstico con membresía |
| `organizations_sel` | sin cambio (`is_tenant_member(id)`) |
| `project_members_sel` | sin cambio (`is_diagnostic_member(diagnostic_id)`) |
| Vistas `security_invoker` | heredan; sin acceso extra |

**Invitado:** `profiles.global_role='invitado'` + `project_members.role='observador'`
(sin rol nuevo). Trigger `project_members_invitado_scope`: una sola membresía activa y solo
`role='observador'`; segunda membresía/rol distinto → `42501`.

**Crear → leer:** trigger `diagnostics_creator_membership` (AFTER INSERT) crea la membresía
del creador `coordinador_srhds`/`equipo` con el rol `coordinador`/`equipo`, para que pueda leer
su diagnóstico recién creado.

**Vigencia:** no hay `expires_at`; la expiración temporal **no** se implementa en RLS. Se
difiere a **F1-04** (EF de invitaciones/gestión de membresías, antes de G1) y se documenta en
ADR-011; la regla de una membresía activa sí queda enforced por trigger.

## 2. Auditoría de policies tenant-wide

Revisadas las 9 SELECT con `is_tenant_member`: `companies`, `diagnostics`, `documents`,
`iih_assets`, `organizations`, `profiles`, `samples`, `signatures`, `water_balances`.
Se restringen para `invitado` las 6 con datos de diagnóstico/negocio; `organizations` es el
tenant propio y `project_members` ya era por membresía. Catálogos/quiz no son tenant-wide;
`v_quiz_questions` sigue definer sin `correcta`.

## 3. Verificación en vivo (claims sintéticos + `ROLLBACK`)

| Caso | Resultado |
|---|---|
| Invitado sin membresía: diagnostics/profiles/companies | **0 / 1 (propio) / 0** |
| Invitado sin membresía: `v_diagnostic_completeness` | **0** |
| Invitado con membresía D1 (`role=observador`) | diagnostics **1**, companies **1**, profiles **1** |
| Observador con membresía D1 | diagnostics **1** |
| Coordinador/admin agregado SRHDS | diagnostics **2**, companies **2** para coord |
| Equipo sin membresía | diagnostics **0** |
| Equipo crea diagnóstico → lee | **1 fila**, membership del creador **1** |
| Invitado segunda membresía / rol distinto | **42501** |
| Cross-tenant | 0 filas del tenant B |

## 4. pgTAP

- Nueva suite `070_f1_01a_invitado_scope.sql` (**plan 21**): matriz completa
  invitado sin/con membresía, observador, admin/coord, equipo/empresa, cross-tenant,
  vistas, crear→leer y restricciones de membresía del invitado.
- `050` ajustada: observador ahora ve **1** diagnóstico/empresa de su membresía (antes 3),
  coherente con `diagnostics_sel`/`companies_sel`.
- Total suite: **160 aserciones** (21+9+9+15+34+51+21); pgTAP CI (task-13) ejecuta desde archivos.
- pglast 8.7: migración y 070 OK.

## 5. Docs / límites

- `docs/01` §5 actualizado (profiles invitado solo suyo; companies/diagnostics membresía o
  agregado; note invited para documentos/iih/samples/signatures/water).
- `docs/04` no cambia; `docs/02` intacto; sin secretos.
- Si la UI necesita nombres del equipo de un diagnóstico, debe usar una vista
  `security_invoker` limitada (nombre/rol), **no** ampliar `profiles_sel`.
- F1-04 debe implementar `expires_at`/expiración y pruebas de vigencia; hasta entonces, no
  usar invitados con datos reales fuera de dev/staging.
