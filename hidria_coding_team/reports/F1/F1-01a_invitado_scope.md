# F1-01a — Alcance del rol `invitado` (Q-02/SEC-PR7-D2, task-35)

- **Agente:** `arquitecto-bd` (02)
- **Fecha:** 2026-11-12 20:15 (America/Mexico_City)
- **Tarea:** `task-35` — Q-02/QA + SEC-PR7-D2/seguridad (PR #7)
- **Rama:** `fix/F1-task35-invitado`, base `main@13caf3b`; commits nuevos sobre `a33ba45`
- **ADR:** `hidria_coding_team/decisions/ADR-011-alcance-invitado.md`
- **Migraciones (4, forward-only, aplicadas vía MCP; todas en repo):**
  - `20261108050000_f1_01a_invitado_scope.sql` — matriz base.
  - `20261108050010_f1_01a_invitado_scope_fix.sql` — B1 update trigger, VETO-2 claim, VETO-3, 5 tablas membership.
  - `20261108050020_f1_01a_invitado_scope_fix2.sql` — histórico: intento con agregado SRHDS (rechazado por revisor).
  - `20261108050030_f1_01a_invitado_scope_fix3.sql` — M2 final: sin agregado en las 5; claim requerido.
  - `20261108050040_f1_01a_invitado_scope_fix4.sql` — split de `documents_write` (FOR ALL) para que no re-abra SELECT a admin/coord sin membresía.
  - `20261108050050_f1_01a_invitado_scope_fix5.sql` — split de `iih_assets_write`/`samples_write`/`water_balances_write` por la misma razón.
- **BD:** `schema_migrations = 26`; CI aplica los 26 archivos desde `supabase/migrations/**`.
- **Alcance:** policies/triggers/tests/docs; sin datos reales, sin cambios de columnas/tablas.

## Resultado: VERDE (DB)

El `invitado` deja de tener lectura tenant-wide. La matriz vinculante del revisor queda
implementada y probada; `observador`/miembros conservan su alcance y la creación de un
diagnóstico por `equipo` ya no deja al creador sin visibilidad.

## 1. Matriz implementada (final)

| Objeto | SELECT |
|---|---|
| `diagnostics_sel` | claim `global_role` presente + tenant + (`my_diagnostic_role(id)` o agregado admin/coord) |
| `profiles_sel` | claim presente; tenant, salvo `invitado` → solo `user_id = auth.uid()`; sin claim → 0 |
| `companies_sel` | claim presente + tenant + (agregado admin/coord o `EXISTS` diagnóstico con membresía) |
| `documents_sel`, `iih_assets_sel`, `samples_sel`, `water_balances_sel` | claim presente + tenant + `is_diagnostic_member(diagnostic_id)` **para todos los roles**; **sin agregado SRHDS** |
| `signatures_sel` | claim presente + tenant + membresía vía `documents.diagnostic_id`; **sin agregado SRHDS** |
| `organizations_sel` | sin cambio (`is_tenant_member(id)`) |
| `project_members_sel` | sin cambio (`is_diagnostic_member(diagnostic_id)`) |
| Vistas `security_invoker` | heredan; sin acceso extra |

**Fail-closed (VETO-2):** todas las policies de alcance exigen `global_role` presente; JWT sin
claim → 0 filas (profiles incluido). **VETO-3:** trigger `profiles_role_guard` exige
`admin_institucional` para cambiar `global_role`; coordinador no eleva invitado a staff, pero sí
puede actualizar `full_name` y crear perfiles no-admin. **B1/VETO-1:** trigger
`project_members_invitado_scope` es **BEFORE INSERT OR UPDATE**; invitado solo `role='observador'`,
una membresía activa y sin cambios de `user_id`/`diagnostic_id`/`organization_id`/`role`; DELETE
se permite para revocación.

**Invitado:** `global_role='invitado'` + `project_members.role='observador'` (sin rol nuevo).
**Crear → leer:** `diagnostics_creator_membership` crea la membresía del creador
`coordinador_srhds`/`equipo`.

**Vigencia:** no hay `expires_at`; la expiración temporal **no** se implementa en RLS y se
difiere a **F1-04** (ADR-011); la regla de una membresía activa sí queda enforced por trigger.

## 2. Auditoría de policies tenant-wide

Revisadas las 9 SELECT con `is_tenant_member`: `companies`, `diagnostics`, `documents`,
`iih_assets`, `organizations`, `profiles`, `samples`, `signatures`, `water_balances`.
En las 5 de negocio (documents/iih/samples/signatures/water) **todos los roles** requieren
membresía; sin agregado SRHDS. `organizations` es tenant propio; `project_members` membresía.
Catálogos/quiz no son tenant-wide; `v_quiz_questions` definer sin `correcta`.

## 3. Verificación en vivo (claims sintéticos + `ROLLBACK`)

| Caso | Resultado |
|---|---|
| Invitado sin membresía: diagnostics/profiles/companies | **0 / 1 (propio) / 0** |
| Invitado sin claim `global_role` | profiles/docs/diagnostics **0** |
| Invitado con membresía D1 | diagnostics **1**, companies **1**, profiles **1**, docs/iih/samples/signatures/water **1** |
| Admin/coord sin membresía en las 5 tablas | **0** (no hay agregado) |
| Equipo crea diagnóstico → lee | **1 fila**, membership creador **1** |
| Invitado UPDATE role/diagnóstico | **42501**, rol permanece `observador` |
| Coordinador UPDATE `global_role` invitado | **42501**, rol permanece `invitado` |

## 4. pgTAP

- Suite `070_f1_01a_invitado_scope.sql` (**plan 55**): matriz por tabla (sin/con membresía,
  admin/coord sin membresía, cross-tenant, signatures de otro diagnóstico), vistas,
  crear→leer, B1/VETO-1, VETO-2 sin claim, VETO-3.
- `050` ajustada: observador ve su diagnóstico/empresa, no tenant-wide.
- Total suite: **194 aserciones** (21+9+9+15+34+51+55); pgTAP CI (task-13) ejecuta desde archivos.
- pglast 8.7: migraciones y 070 OK.
- **Drift BD↔repo resuelto:** las 6 migraciones de task-35 están en el repo; `supabase db reset`
  aplica 26 archivos (las fix son forward-only; `…0020` es historia sustituida por `…0030`).
- **Fix post-CI:** las policies `*_write` eran `FOR ALL`; su `USING` también aplicaba a SELECT y
  re-abría filas a admin/coord sin membresía. `…0040` separa `documents_write` y `…0050`
  `iih_assets_write`/`samples_write`/`water_balances_write` en INSERT/UPDATE/DELETE. El SELECT
  queda únicamente en `*_sel` (membresía estricta). Así los tests M2 admin/coord sin membresía
  dan 0.

## 5. Docs / límites

- `docs/01` §5 actualizado (todos los roles por membresía en las 5; sin agregado; profiles
  invitado solo suyo; claim obligatorio).
- `docs/04` no cambia; `docs/02` intacto; sin secretos.
- Si la UI necesita nombres del equipo de un diagnóstico, debe usar una vista
  `security_invoker` limitada (nombre/rol), **no** ampliar `profiles_sel`.
- F1-04 debe implementar `expires_at`/expiración y pruebas de vigencia; hasta entonces, no
  usar invitados con datos reales fuera de dev/staging.
