# F1-00 — RES-1 (`diagnostics_write`) y residuales de seguridad (task-18)

- **Agente:** `arquitecto-bd` (02)
- **Fecha:** 2026-11-08 13:35 (America/Mexico_City)
- **Tarea:** `task-18` — RES-1 + residuales de la re-revisión de seguridad de F1-00
- **Rama:** `fix/F1-task18-res1`, desde `main` `7ca0639`; head del PR #19 (actualizar en GitHub)
- **Migraciones nuevas:**
  - `20261108030000_f1_00_res1_fixes.sql`
  - `20261108030010_f1_00_res1_fixes2.sql` (candado fase 1 y retiro de admin)
  - `20261108030020_f1_00_res1_hardening.sql` (estado inicial + folio server-side + retiro de empresa)
  - `20261108030030_f1_00_res1_folio_immutable.sql` — no aplicada (B2 pasó a task-59)
  - `20261108040000_f1_00_task59_update_lock.sql` (task-59: folio inmutable en UPDATE + candado de gate/estado)
  - Aplicadas vía MCP (la 003030 no se aplicó; ver task-59).
- **Entorno:** `zucalshlfcxejpukshxl` (dev/staging sintético, ADR-004 E2); `schema_migrations = 20`.
- **Alcance:** solo DB (`supabase/migrations/**`, `supabase/tests/**`, reportes F1-00). Sin tocar `supabase/functions/**`, `app/**`, `docs/02` ni docs/01.

## Resultado: VERDE (DB)

RES-1 resuelto con **INSERT separado** y endurecido: roles `coordinador_srhds`/`equipo`, tenant,
`company_id` del mismo tenant, `fase_actual=1` y **trigger BEFORE INSERT** que fija el folio
server-side en INSERT y rechaza cualquier estado inicial inyectado. `admin_institucional` y `empresa`
quedan fuera del INSERT (M1 y falta de ownership M2, respectivamente). `UPDATE`/`DELETE` siguen
con `my_diagnostic_role(id)`; el residual de campos de estado en UPDATE queda cerrado por
**task-59** (ADR-010, trigger `diagnostics_update_lock`; folio inmutable y gate/estado solo vía
EF/`service_role`).
Residuales de vistas, `profiles_write`, PG≥16 y SHA corregidos.

## 1. RES-1 — `diagnostics` (M2)

| Política | Operación | Regla |
|---|---|---|
| `diagnostics_ins` | INSERT | `is_tenant_member(organization_id)` + `global_role IN (coordinador_srhds, equipo)` + `company_id` del mismo tenant + `fase_actual=1` |
| `diagnostics_upd` | UPDATE | tenant + `my_diagnostic_role(id) IN (coordinador, equipo)` + company del tenant |
| `diagnostics_del` | DELETE | tenant + `my_diagnostic_role(id) IN (coordinador, equipo)` |
| `diagnostics_sel` | SELECT | `is_tenant_member(organization_id)` |

`diagnostics_write` (FOR ALL) se eliminó.

### Trigger `diagnostics_initial_state` (BEFORE INSERT)

- Asigna **folio server-side en INSERT** con `diagnostics_folio_seq` y formato `MDOHI-AAAA-NNN`;
  cualquier folio del cliente (`MDOHI-FAKE-999`) se sobrescribe. En **UPDATE** el folio es
  inmutable por `diagnostics_update_lock` (task-59, ADR-010); test específico en `050`.
- Para `auth.uid() != null` (API autenticada) **rechaza** (42501) si el INSERT intenta inyectar:
  `fase_actual != 1`, `estado != 'activo'`, `avance_pct != 0`, `cat_estado != 'no_enviado'`,
  `bitacora_cerrada != false`, `ivoh_actual`/`brecha_pct`/`reporte_document_id` no nulos,
  `semaforo_atraso != 'verde'`, `proximo_hito`/`reprogramacion_justificacion` no nulos.
- Los fixtures de test insertados como `postgres` (`auth.uid()` null) pueden sembrar estados
  avanzados; la API autenticada no.

Verificación en vivo (claims sintéticos + `ROLLBACK`):

| Caso | Resultado |
|---|---|
| `coordinador_srhds` INSERT fase 1 | **OK** |
| `equipo` INSERT fase 1 | **OK** |
| INSERT fase 2 / fase 6 | **42501**, 0 filas |
| INSERT con `estado='reportado'`, `avance=100`, etc. | **42501**, 0 filas |
| INSERT con `folio='MDOHI-FAKE-999'` | **OK**, folio sobrescrito `MDOHI-2026-NNN` |
| INSERT `company_id` de otro tenant | **42501**, 0 filas |
| `empresa` (mismo tenant, sin ownership M2) | **42501** |
| `admin_institucional` | **42501** |
| `invitado`/`observador` | **42501** |
| UPDATE a fase 6 sin IVOH | **P0001** `Gate F6...` (trigger) |

## 2. Residuales

- **Vistas:** DML revocado en las 5 vistas para `authenticated` y `service_role`; guarda en `010`
  (2 aserciones) para que CI falle si reaparece DML.
- **PG ≥ 16:** `REVOKE MAINTAIN` requiere PG≥16; se añade aserción de versión (17.11 actual).
- **`profiles_write.USING`:** coordinador no puede UPDATE/DELETE perfiles `admin_institucional`;
  admin conserva acceso. Verificado 0/1 filas.
- **SHA truncado:** `F1-00_delta_seguridad.md` corregido (`1fb4ae45c61adc065adecc074630b7f14497d2d5`).
- **Residual B2 (resuelto en task-59):** `diagnostics_upd` permitía a coordinador/equipo cambiar
  `estado`, `reporte_document_id`, `bitacora_cerrada`, `avance_pct`, `cat_estado` y `folio` sin
  candado específico. Cerrado con `diagnostics_update_lock` (ADR-010): folio inmutable en UPDATE
  y campos de gate/estado solo vía `service_role`/EF; test específico en `050`.

## 3. pgTAP y CI

| Suite | Cambio | Plan |
|---|---|---|
| `010_f1_00_grants_views.sql` | DML de 5 vistas + PG≥16 | `18 → 21` |
| `050_f1_00_security_delta.sql` | positivos coordinador/equipo, folio, estado inyectado, empresa/admin/cross-tenant, UPDATE/DELETE, perfiles, folio inmutable (task-59) | `11 → 28` |

- pglast 8.7: migraciones/tests modificados OK.
- Total previsto de la suite: **133 aserciones** (21+9+9+15+28+51); el job pgTAP de CI
  (task-13/PR #14, ya mergeado) aplica las migraciones desde archivos y ejecuta las 6 suites.
- Aserciones equivalentes ejecutadas vía MCP (§1/§2).

### Nota `schema_migrations` (discrepancia esperada)

La BD remota tiene **19 filas**. MCP registra la **versión de aplicación** (timestamp), no el
nombre del archivo:
- `20261108030000` → `20261108185038`
- `20261108030010` → `20261108190015`
- `20261108030020` → `20261108190421`

El CI/task-13 aplica desde archivos y usa los nombres `20261108030000/…010/…020`. Las 3
migraciones son necesarias por el ciclo de revisión (RES-1, candado fase 1, hardening de estado
inicial/folio); no hay drift de esquema, solo distinta representación de versión.

## 4. Límites y seguimiento

- `empresa` queda fuera del INSERT hasta que M2 defina ownership (`companies.contraparte_user_id`
  o equivalente); se alineará docs/01 §5 en esa tarea.
- `admin_institucional` retirado por M1 (docs/01 §5).
- Residual `diagnostics_upd` → task-59, documentado, no implementado aquí.
- Sin secretos ni datos reales; fixtures `.invalid`.
