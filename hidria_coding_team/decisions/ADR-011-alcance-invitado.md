# ADR-011 — Alcance del rol `invitado` y visibilidad por membresía (Q-02/SEC-PR7-D2)

- **Estado:** Aceptado (spec/seguridad/QA; task-35 cerrada 2026-11-13, squash `a0db8a1`)
- **Fecha:** 2026-11-12
- **Tarea:** `task-35` (Q-02 de QA / SEC-PR7-D2 de seguridad, PR #7)
- **Dueño:** `arquitecto-bd`; revisión: `revisor-especificaciones`; sign-off: `seguridad-privacidad`
- **Contexto:** F1-01 cierre / antes de G1

## Contexto

`diagnostics_sel`, `profiles_sel` y `companies_sel` eran `is_tenant_member(organization_id)`.
Un `invitado` sin `project_members` podía leer **todos** los diagnósticos, empresas y perfiles
del tenant. `docs/01` §5 ya definía `diagnostics` por membresía/agregado SRHDS y
`docs/Arquitectura` L451 define al invitado externo como «un solo diagnóstico o curso, con
vigencia y registro». El rol no tiene un `role` propio en `project_members`.

## Decisión (mínimo privilegio)

| Tabla / vista | Regla |
|---|---|
| `diagnostics_sel` | claim `global_role` presente + `is_tenant_member` + (`my_diagnostic_role(id)` o agregado SRHDS admin/coord) |
| `profiles_sel` | claim presente; tenant, **excepto `invitado`**: solo `user_id = auth.uid()`; sin claim → 0 |
| `companies_sel` | claim presente + tenant + (agregado SRHDS o `EXISTS` diagnóstico del tenant con membresía) |
| `documents_sel`, `iih_assets_sel`, `samples_sel`, `water_balances_sel` | claim presente + tenant + `is_diagnostic_member(diagnostic_id)` **para todos los roles**; **sin agregado SRHDS** |
| `signatures_sel` | claim presente + tenant + membresía vía `documents.diagnostic_id`; **sin agregado SRHDS** |
| `organizations_sel` | sin cambio: `is_tenant_member(id)` (tenant propio) |
| `project_members_sel` | sin cambio: `is_diagnostic_member(diagnostic_id)` |
| `v_*` `security_invoker` | heredan las policies; no se añade acceso |

**Fail-closed (VETO-2):** todas las policies de alcance exigen `auth.jwt()->>'global_role' IS NOT NULL`
(además de `coalesce(...,'invitado')` en profiles); un JWT sin claim no ve filas, no hereda
tenant-wide.

**Representación del invitado:** `profiles.global_role='invitado'` +
`project_members.role='observador'` (no se crea un rol nuevo; el CHECK de `project_members`
no incluye `invitado`). El trigger `project_members_invitado_scope` es **BEFORE INSERT OR UPDATE**:
exige `role='observador'`, una sola membresía activa y prohíbe cambiar `user_id`/`diagnostic_id`/
`organization_id`/`role` en UPDATE; DELETE se permite para revocación.

**VETO-3:** trigger `profiles_role_guard` (BEFORE UPDATE) exige `admin_institucional` para
cambiar `profiles.global_role`; un coordinador no puede convertir `invitado` en staff. Puede
seguir actualizando `full_name` y creando perfiles no-admin (INSERT).

**Alta de diagnóstico:** trigger AFTER INSERT `diagnostics_creator_membership` crea la membresía
del creador `coordinador_srhds`/`equipo` (rol `coordinador`/`equipo`) para que pueda leer el
diagnóstico recién creado (condición de seguridad «crear → leer»). El creador no necesita esperar
a una EF de invitaciones.

## Vigencia («un solo diagnóstico/curso con vigencia»)

- No existe `expires_at` ni PK que limite membresías; **la expiración no queda implementada en
  RLS**. Este ADR decide: *una membresía activa por invitado* se enforcea por trigger; la
  **vigencia temporal** se difiere a **F1-04** (EF de invitaciones/gestión de membresías, antes de
  G1), donde se añadirá `expires_at`/job de expiración y se probará. No se declara cumplida la
  vigencia por RLS.
- Hasta F1-04, el invitado no debe usarse con datos reales fuera de dev/staging.

## Auditoría de policies tenant-wide

Revisadas las 9 policies SELECT con `is_tenant_member`: `companies`, `diagnostics`,
`documents`, `iih_assets`, `organizations`, `profiles`, `samples`, `signatures`,
`water_balances`. Para `documents`, `iih_assets`, `samples`, `signatures` y `water_balances`
**todos los roles** requieren membresía del diagnóstico (sin agregado SRHDS, decisión del
revisor); `companies`/`diagnostics` conservan el agregado admin/coord; `organizations` es el
propio tenant y `project_members` ya era por membresía. No hay otras SELECT tenant-wide en
`public` (catálogos/quiz no son tenant-wide; `v_quiz_questions` es definer sin `correcta`).

**Drift BD↔repo:** la BD de desarrollo tiene 28 migraciones (task-35:
`20261108050000` base, `…0010` B1/VETO-2/3, `…0020` intento con agregado rechazado por el
revisor, `…0030` M2 final sin agregado, `…0040` split de `documents_write`, `…0050` split de
`iih_assets_write`/`samples_write`/`water_balances_write`, `…0060` split de `companies_write`
y retiro del OR de agregado en `documents_ins/upd/del`, `…0070` helper `company_in_tenant` para
RES-1). Las 8 están en el repo; `…0020` se conserva como historia forward-only y su efecto queda
sustituido por `…0030`. `supabase db reset` debe aplicar exactamente esos 28 archivos.

## Consecuencias

- El invitado deja de ver el tenant completo; con membresía ve solo su diagnóstico/empresa y su
  propio perfil. La UI debe usar una vista `security_invoker` limitada (nombre/rol) si necesita
  el equipo del diagnóstico, **sin** ampliar `profiles_sel`.
- En `documents/iih_assets/samples/signatures/water_balances` ni siquiera admin/coord tienen
  agregado: deben ser miembros del diagnóstico. `diagnostics`/`companies` sí conservan su
  agregado SRHDS.
- Un JWT sin `global_role` no ve filas (fail-closed); un coordinador no puede cambiar
  `global_role` de un perfil (solo admin).
- Las vistas `security_invoker` heredan; `v_diagnostic_completeness` no filtra filas a invitado
  sin membresía.
- Sin cambios de columnas/tablas; solo policies y triggers. Sin datos reales.
- Tests `070` plan **68**; total suite **207** (21+9+9+15+34+51+68).

## Alternativas descartadas

- Mantener tenant-wide para invitado: viola mínimo privilegio y Q-02.
- Añadir `invitado` al CHECK de `project_members`: rompe el mapeo aprobado
  (`role='observador'`) y docs/01.
- Ampliar `profiles_sel` para que el invitado vea el equipo: expone PII; se prefiere vista
  limitada.

## Aprobaciones / sign-off

| Rol | Agente | Fecha | Veredicto |
|---|---|---|---|
| Revisor de especificaciones | `revisor-especificaciones` | 2026-11-13 | APROBADO delta final `fe5c150`; task-35 cerrada |
| Seguridad y privacidad | `seguridad-privacidad` | 2026-11-13 | APROBADO CON OBSERVACIONES, SIN VETO (VETO-1..4, B1, M2(a), RES-1); task-76 cerrada |
| QA | `qa-tester` | 2026-11-13 | VERDE `fe5c150` (207/207); task-77 cerrada |
| Supervisor | `supervisor-hidria` | 2026-11-13 | Squash #32 `a0db8a1`; task-35 cerrada |

## Referencias

- `supabase/migrations/20261108050000_f1_01a_invitado_scope.sql`
- `supabase/migrations/20261108050010_f1_01a_invitado_scope_fix.sql`
- `supabase/migrations/20261108050020_f1_01a_invitado_scope_fix2.sql` (histórico; sustituido por 0030)
- `supabase/migrations/20261108050030_f1_01a_invitado_scope_fix3.sql`
- `supabase/migrations/20261108050040_f1_01a_invitado_scope_fix4.sql` (split documents_write)
- `supabase/migrations/20261108050050_f1_01a_invitado_scope_fix5.sql` (split otros write ALL)
- `supabase/migrations/20261108050060_f1_01a_invitado_scope_fix6.sql` (companies write + documents B1)
- `supabase/migrations/20261108050070_f1_01a_invitado_scope_fix7.sql` (company_in_tenant / RES-1)
- `supabase/tests/070_f1_01a_invitado_scope.sql`
- `docs/01` §5; `docs/Arquitectura` L451; `docs/04` §2.1
- `reports/F1/F1-01a_invitado_scope.md`
