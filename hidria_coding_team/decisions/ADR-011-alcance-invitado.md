# ADR-011 — Alcance del rol `invitado` y visibilidad por membresía (Q-02/SEC-PR7-D2)

- **Estado:** Aceptado (dirección de revisor/seguridad); pendiente sign-off final del delta
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
| `diagnostics_sel` | `is_tenant_member(organization_id)` **+** (`my_diagnostic_role(id) IS NOT NULL` **o** `global_role IN ('admin_institucional','coordinador_srhds')`) |
| `profiles_sel` | tenant, **excepto `invitado`**: solo `user_id = auth.uid()` (claim JWT, `IS DISTINCT FROM 'invitado'`) |
| `companies_sel` | tenant **+** (agregado SRHDS **o** `EXISTS` diagnóstico del tenant con membresía) |
| `documents_sel`, `iih_assets_sel`, `samples_sel`, `water_balances_sel` | tenant; **invitado solo si `is_diagnostic_member(diagnostic_id)`** |
| `signatures_sel` | tenant; **invitado solo si el `document_id` pertenece a un diagnóstico del que es miembro** |
| `organizations_sel` | sin cambio: `is_tenant_member(id)` (tenant propio) |
| `project_members_sel` | sin cambio: `is_diagnostic_member(diagnostic_id)` |
| `v_*` `security_invoker` | heredan las policies; no se añade acceso |

**Representación del invitado:** `profiles.global_role='invitado'` +
`project_members.role='observador'` (no se crea un rol nuevo; el CHECK de `project_members`
no incluye `invitado`). Un trigger BEFORE INSERT exige esa combinación y **una sola membresía
activa** para el invitado; una segunda membresía o un `role` distinto → `42501`.

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
`water_balances`. Se restringen para `invitado` las 6 primeras (ver tabla); `organizations`
es el propio tenant y `project_members` ya era por membresía. No hay otras SELECT tenant-wide
en `public` (catálogos/quiz no son tenant-wide; `v_quiz_questions` es definer sin `correcta`).

## Consecuencias

- El invitado deja de ver el tenant completo; con membresía ve solo su diagnóstico/empresa y su
  propio perfil. La UI debe usar una vista `security_invoker` limitada (nombre/rol) si necesita
  el equipo del diagnóstico, **sin** ampliar `profiles_sel`.
- Observador/coordinador/equipo/empresa/admin conservan el alcance de `docs/01` §5.
- Las vistas `security_invoker` heredan; `v_diagnostic_completeness` no filtra filas a invitado
  sin membresía.
- Sin cambios de columnas/tablas; solo policies y triggers. Sin datos reales.

## Alternativas descartadas

- Mantener tenant-wide para invitado: viola mínimo privilegio y Q-02.
- Añadir `invitado` al CHECK de `project_members`: rompe el mapeo aprobado
  (`role='observador'`) y docs/01.
- Ampliar `profiles_sel` para que el invitado vea el equipo: expone PII; se prefiere vista
  limitada.

## Aprobaciones / sign-off

| Rol | Agente | Fecha | Veredicto |
|---|---|---|---|
| Revisor de especificaciones | `revisor-especificaciones` | 2026-11-12 | Matriz vinculante aprobada; pendiente revisión del delta |
| Seguridad y privacidad | `seguridad-privacidad` | 2026-11-12 | Dirección aprobada con condiciones; pendiente sign-off del delta |
| Supervisor | `supervisor-hidria` | 2026-11-12 | Autoriza implementación; merge solo supervisor |

## Referencias

- `supabase/migrations/20261108050000_f1_01a_invitado_scope.sql`
- `supabase/tests/070_f1_01a_invitado_scope.sql`
- `docs/01` §5; `docs/Arquitectura` L451; `docs/04` §2.1
- `reports/F1/F1-01a_invitado_scope.md`
