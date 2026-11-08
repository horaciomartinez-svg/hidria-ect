# F1-00 — RES-1 (`diagnostics_write`) y residuales de seguridad (task-18)

- **Agente:** `arquitecto-bd` (02)
- **Fecha:** 2026-11-08 13:00 (America/Mexico_City)
- **Tarea:** `task-18` — RES-1 + residuales de la re-revisión de seguridad de F1-00
- **Rama:** `fix/F1-task18-res1`, desde `main` `7ca0639`
- **Migración nueva:** `supabase/migrations/20261108030000_f1_00_res1_fixes.sql` (aplicada vía MCP)
- **Entorno:** `zucalshlfcxejpukshxl` (dev/staging sintético, ADR-004 E2); `schema_migrations = 17`
- **Alcance:** solo DB (`supabase/migrations/**`, `supabase/tests/**`, reportes F1-00). Sin tocar `supabase/functions/**`, `app/**` ni `docs/02`.

## Resultado: VERDE (DB)

RES-1 queda resuelto con **INSERT separado** para `diagnostics`: el alta se autoriza por tenant +
`global_role` (docs/01 §5: `admin_institucional`, `coordinador_srhds`, `equipo`, `empresa`) y
`company_id` del mismo tenant; `UPDATE`/`DELETE` conservan `my_diagnostic_role(id)` en
`coordinador`/`equipo`, tal como exige SEC-PR4-02. Se añadió el positivo que faltaba y se
resolvieron los residuales de vistas, `profiles_write`, requisito PG ≥ 16 y SHA del reporte.

## 1. RES-1 — `diagnostics` (M2)

| Política | Operación | Regla |
|---|---|---|
| `diagnostics_ins` (nueva) | INSERT | `is_tenant_member(organization_id)` + `global_role IN (admin_institucional, coordinador_srhds, equipo, empresa)` + `company_id` pertenece al mismo tenant |
| `diagnostics_upd` (nueva) | UPDATE | tenant + `my_diagnostic_role(id) IN (coordinador, equipo)` + `company_id` del mismo tenant |
| `diagnostics_del` (nueva) | DELETE | tenant + `my_diagnostic_role(id) IN (coordinador, equipo)` |
| `diagnostics_sel` (sin cambio) | SELECT | `is_tenant_member(organization_id)` |

`diagnostics_write` (FOR ALL) se eliminó. La comprobación de `company_id` evita insertar un
diagnóstico del tenant A apuntando a una empresa del tenant B (integridad multi-tenant).

Verificación en vivo (fixtures F1-01a + transacción con `ROLLBACK`):

| Caso | Resultado |
|---|---|
| `coordinador_srhds` INSERT diagnóstico válido (org/empresa A) | **OK**, fila insertada |
| `invitado` INSERT diagnóstico | **42501**, 0 filas |
| `coordinador_srhds` INSERT con `company_id` de otro tenant | **42501**, 0 filas |
| `diagnostics` visibles tras alta | 3 (2 seed + 1) |

## 2. Residuales

- **Vistas:** revocado `INSERT/UPDATE/DELETE` de `v_bhe_monthly`, `v_bhe_summary`,
  `v_balance_indicators`, `v_ivoh_score`, `v_diagnostic_completeness` para `authenticated` y
  `service_role`; se mantiene `SELECT`. Verificado: las 5 quedan con DML=false.
  **Guarda CI:** suite `010_f1_00_grants_views.sql` añade dos aserciones que fallan si cualquier
  vista recupera DML para `authenticated`/`service_role` (cierra SEC-PR4-01 en CI cuando esté el
  job pgTAP de task-13).
- **PG ≥ 16:** `REVOKE MAINTAIN` (F1-00) exige PG ≥ 16; el proyecto usa 17.11 y la suite 010
  añade `ok(current_setting('server_version_num')::int >= 160000)`.
- **`profiles_write.USING`:** un `coordinador_srhds` ya **no** puede UPDATE/DELETE un perfil
  `admin_institucional` (la condición de USING exige que el rol de la fila no sea admin para
  caller no-admin); el admin conserva acceso. Verificado: coordinador=0 filas, admin=1 fila.
  La no-escalada de `WITH CHECK` se mantiene.
- **SHA truncado:** corregido en `F1-00_delta_seguridad.md` (`1fb4ae45c61adc065adecc074630b7f14497d2d5`).

## 3. pgTAP

| Suite | Cambio | Plan |
|---|---|---|
| `010_f1_00_grants_views.sql` | guarda de DML de 5 vistas (authenticated/service_role) + PG≥16 | `18 → 21` |
| `050_f1_00_security_delta.sql` | positivo INSERT diagnostics, coordinador vs perfil admin, admin positivo | `11 → 14` |

- Sintaxis: **pglast 8.7 → 3/3 archivos OK** (migración + 010 + 050).
- Aserciones equivalentes ejecutadas en vivo vía MCP (§1/§2).
- La ejecución pgTAP en CI depende de task-13/PR #14 (job `supabase start`/`db reset`/`test db`);
  no se modifica CI en esta rama.

## 4. Límites y seguimiento

- No se incluyó RES-1 en `docs/01` ni se documentó un ADR EF-only: se eligió la política INSERT
  SQL, manteniendo el DDL como autoridad.
- `empresa` puede INSERTAR diagnósticos según docs/01 §5; si el diseño M2 decide restringirlo,
  se ajusta en una migración posterior.
- El job pgTAP de CI (task-13) debe ejecutar 010/050 con el plan actualizado; QA valida el conteo.
- Sin secretos ni datos reales; fixtures sintéticos con `.invalid`.
