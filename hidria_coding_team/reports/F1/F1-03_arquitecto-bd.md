# F1-03a — DB/RLS M1 Empresas (`companies`)

- **Agente:** `arquitecto-bd` (02)
- **Fecha:** 2026-11-13 03:00 (America/Mexico_City)
- **Tarea:** `task-80` — F1-03a DB/RLS M1 Empresas
- **Rama:** `feat/F1-03a-companies`, desde `main` `a0db8a1`
- **Migración:** `supabase/migrations/20261108060000_f1_03_companies.sql` (aplicada vía MCP)
- **BD:** `schema_migrations = 29` (28 de main + esta)
- **Alcance:** `companies` (columnas/RLS/trigger), tests, docs/01 y reporte. Sin EF; `docs/02` intacto.

## Resultado: VERDE (DB)

Auditoría y cierre de gaps de M1:
- `created_by` server-side + SELECT del creador (B2 create→read).
- `contraparte_user_id` validado y limitado a admin/coord (SEC-PR35-01).
- `company_in_tenant` valida el tenant del llamante (SEC-PR32-06).
- `companies_sel/upd/del` separadas y `companies_sel` con creador/empresa propia.
- `ciclo_vida` sin candado adicional (decisión documentada).

## 1. Auditoría `companies` (docs/01 §4.1 / docs/02)

| Campo | Estado |
|---|---|
| `razon_social`, `nombre_planta`, `giro` (5), `calle`, `colonia_parque`, `cp`, `municipio`, `organismo_operador`, `lat/lon`, `empleados`, `turnos`, `unidad_produccion`, `contraparte_user_id`, `ciclo_vida` | presentes en docs/02; sin cambios |
| `created_by` | **gap**: no existía; se añade `uuid FK profiles`, server-side, inmutable |
| `contraparte_user_id` | existía sin validación; se valida perfil/tenant/rol y quién asigna |
| `companies_write` FOR ALL | ya separada por #32 (`companies_ins/upd/del`); SELECT solo por `companies_sel` |
| `companies_sel` | **gap B2/ownership**: no incluía creador ni empresa con contraparte; corregido |
| `ciclo_vida` | sin candado adicional (decisión: editable por roles de escritura; M2 podrá regular transiciones) |

`docs/02` no se toca; `docs/01` §4.1/§5 actualizado con `created_by` y ownership.

## 2. RLS implementada

| Policy | Regla |
|---|---|
| `companies_sel` | claim `global_role` presente + tenant + (admin/coord **o** diagnóstico con membresía **o** `created_by = auth.uid()` **o** `global_role='empresa' AND contraparte_user_id=auth.uid()`) |
| `companies_ins` | tenant + admin/coord/equipo (sin cambio de #32); `created_by` lo fija el trigger |
| `companies_upd` | tenant + admin/coord/equipo **o** empresa con `contraparte_user_id=auth.uid()`; trigger valida contraparte/created_by |
| `companies_del` | tenant + admin/coord/equipo (sin cambio); empresa no borra |
| `company_in_tenant(uuid,uuid)` | SECURITY DEFINER; exige `p_organization_id = current_org_id()` + company del tenant; cross-tenant **false** (SEC-PR32-06) |

Trigger `companies_ownership` (BEFORE INSERT/UPDATE):
- `created_by = auth.uid()` en alta; inmutable en UPDATE.
- `contraparte_user_id`: si se asigna/cambia, solo admin/coord y perfil existente, del mismo tenant, `global_role='empresa'`; si no → 42501 (SEC-PR35-01).

## 3. Verificación en vivo / pgTAP

Nueva suite `080_f1_03_companies.sql` (**plan 24**):
- agregado admin/coord; empresa propia 1 / ajena 0; observador con membresía 1; invitado 0;
- **B2 create→read**: equipo crea empresa, `created_by` = equipo, la lee (1 fila);
- contraparte válida OK; no-empresa/otro tenant → 42501; equipo no asigna; invitado no crea;
- empresa edita su ficha, no la ajena ni la contraparte; admin asigna contraparte; coordinador actualiza `ciclo_vida`;
- `company_in_tenant` same tenant true / cross-tenant false.

Total suite: **231 aserciones** (207 + 24); pglast OK; `db reset` desde archivos y CI 6/6.

## 4. Contrato con F1-03b (UI)

- `GET/POST/PATCH /rest/v1/companies` sigue igual; `organization_id` del claim; `id`/fechas server-side.
- `insert().select('*')` devuelve la fila al creador (`created_by`).
- `contraparte_user_id` sigue UUID/FK; inválido/ajeno → 42501; solo admin/coord asignan.
- `ciclo_vida` editable por roles de escritura; sin transiciones inventadas.
- `created_by` es de solo lectura; la UI no lo envía.

## 5. Límites

- Sin EF; sin cambios en `docs/02`; sin datos reales.
- Si M2 exige transiciones de `ciclo_vida` o selector de contraparte, será tarea posterior.
- `companies_del` no se abre a empresa (decisión de mínimo privilegio).
