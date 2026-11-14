# Revisión de especificaciones — PR #36 — F1-03a DB/RLS M1 Empresas

- **Revisor:** `revisor-especificaciones` (agente 06)
- **Fecha:** 2026-11-12 20:25 (America/Mexico_City)
- **PR:** [#36](https://github.com/horaciomartinez-svg/hidria-ect/pull/36) — `feat/F1-03a-companies` → `main`
- **Head:** `1fdc77be3996b5a4a40b989834713b5f586c41e4` (2 commits, 4 archivos, +338/−1; base `main@a0db8a1`).
- **CI:** 12/12 `success` (Guardas, Cliente, Deno, pgTAP ×2, Seguridad, E2E ×2); pgTAP **231/231**; `mergeable_state: clean`.
- **BD:** **29 migraciones** en `supabase_migrations`; `db reset` desde archivos en CI; sin editar base/`docs/02`.
- **Veredicto:** **APROBADO** para squash/task-80, con dos observaciones no bloqueantes de contrato/pruebas (ciclo de vida y test de inmutabilidad de `created_by`).

---

## 1. Lo que PASA

| Criterio | Resultado | Evidencia |
|---|---|---|
| **B2 create→read** | ✅ | `companies.created_by` server-side (trigger `companies_ownership` BEFORE INSERT, `auth.uid()`), inmutable en UPDATE; `companies_sel` incluye `created_by = auth.uid()`; test 080: equipo crea, `created_by` = creador y lee 1 fila. |
| **`companies_sel`** | ✅ | tenant + claim `global_role` + (admin/coord agregado, diagnóstico con membresía, creador, o `empresa` con `contraparte_user_id=auth.uid()`); test propias/ajenas/cross-tenant/invitado/observador. |
| **`companies_upd`** | ✅ | admin/coord/equipo o `empresa` con contraparte propia; trigger impide cambiar `created_by` y que no-admin/coord asigne contraparte; test empresa edita su ficha/no la ajena/no contraparte. |
| **`companies_del`** | ✅ | Sin cambio: admin/coord/equipo; empresa no borra. |
| **SEC-PR35-01 `contraparte_user_id`** | ✅ | Trigger valida perfil existente, **mismo tenant**, `global_role='empresa'`; solo admin/coord asigna/cambia; tests válida, no-empresa, otro tenant, empresa no cambia. |
| **SEC-PR32-06 `company_in_tenant`** | ✅ | Exige `p_organization_id = current_org_id()` + company del tenant; cross-tenant → false; test. `diagnostics_ins/upd` usan el helper. |
| **SEC-PR32-07 ownership** | ✅ | `created_by`/contraparte y `companies_upd` propia; sin bypass global. |
| **M1 docs/01** | ✅ | §4.1 añade `created_by` y valida `contraparte`; §5 documenta SELECT/UPDATE/ownership y `ciclo_vida` sin candado adicional. |
| **Forward-only/BD** | ✅ | Nueva migración; no edita previas; `docs/02` intacto; 29/29 con `db reset`. |
| **Alcance/secretos** | ✅ | 4 archivos: migración, tests, docs/01, reporte; sin `functions/**`/`app/**`; fixtures sintéticos; sin secretos. |

## 2. Observaciones no bloqueantes

### m1 — `ciclo_vida`: UI restrictiva vs API directa

`080` prueba que un **coordinador** actualiza `ciclo_vida`; el reporte decide «sin candado adicional» y M2 regulará transiciones. Sin embargo, `companies_upd` permite a `empresa` propia (y a `equipo`) actualizar la ficha, y **ningún trigger limita `ciclo_vida`**; un PATCH directo por PostgREST podría cambiarlo, mientras la UI de #35 lo deshabilita para esos roles. Decidir explícitamente: o se permite en API (y la UI debe alinearse), o se añade candado de columnas/trigger para `ciclo_vida` (solo admin/coord) con test. No bloquea DB/task-80, pero #35 y M2 no deben quedar contradictorios.

### m2 — Falta test explícito de inmutabilidad de `created_by`

El trigger lo bloquea (`new.created_by is distinct from old.created_by` → 42501), pero `080` no veo un caso `UPDATE companies SET created_by=...` con 42501. Añadirlo (junto con created_by no spoofable en INSERT) cierra la evidencia SEC-PR32-07/B2.

### m3 — `docs/07` no se toca

La tarea pide coherencia docs/01/07; el PR actualiza docs/01 §4.1/§5 (suficiente para M1), pero conviene una nota en docs/07 M1 o en el reporte de que `created_by`/contraparte/ciclo no cambian el contrato de pantalla; no es blocker.

## 3. Conclusión

**APROBADO.** B2 create→read, SEC-PR35-01, SEC-PR32-06/07, ownership, tests 080/231, 29/29 y `db reset` están verificados; no hay regresión de tenant ni de roles. Con las observaciones m1–m3 (sin cambios de código obligatorios para task-80, salvo decidir ciclo y añadir el test de inmutabilidad) el PR puede squash; el consumidor #35 debe alinear `empresa` propia y `ciclo_vida` con este contrato. No se ejecutaron comandos Git de escritura ni merges; este reporte es el único archivo escrito.
