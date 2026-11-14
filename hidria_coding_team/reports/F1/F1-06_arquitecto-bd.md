# F1-06c — DB/RLS M3 checklist (`document_checklist_items`)

- **Agente:** `arquitecto-bd` (02)
- **Tarea:** `task-115` (F1-06c), coordinación F1-06a UI / F1-06b EF-03
- **Rama:** `feat/F1-06c-checklist`, base `main@e495c8f`
- **Migración:** `supabase/migrations/20261108090000_f1_06c_checklist.sql`
- **BD:** `schema_migrations = 32`; forward-only; `docs/02` intacto.
- **Reporte:** este documento.

## Auditoría inicial

| Elemento | Estado real | Gap |
|---|---|---|
| Columnas `diagnostic_id`, `item_code`, `estado`, `document_id`, `solicitud_nota` | presentes | — |
| `estado` CHECK `no_recibido/recibido/revisado/validado_r1` | presente | — |
| `item_code` CHECK (10 códigos) | presente | — |
| FK `document_id → documents`, `diagnostic_id → diagnostics`, UNIQUE `(diagnostic_id,item_code)` | presentes | no valida que el documento sea del **mismo diagnóstico/tenant** ni su `upload_status` |
| RLS SELECT/INSERT/UPDATE | `is_diagnostic_member(diagnostic_id)` | cualquier miembro (observador/invitado) podía escribir; `checklist_write FOR ALL` además abría DELETE |
| Transiciones TD-2 | no había trigger | no se validaba origen→destino, rol, documento ni `validado_r1` terminal |
| Auditoría | no había trigger | EF-03 debía auditarla; updates directos no dejaban rastro |
| DELETE | `checklist_write` lo permitía por membresía | no está en el contrato |

Conclusión: **sí había gaps** de autorización/transición/ligadura/auditoría; se justifica migración forward-only.

## Migración

1. **Se retira `checklist_write` (FOR ALL)**; quedan SELECT/INSERT/UPDATE por membresía y **sin política DELETE** (los grants no bastan: RLS deniega).
2. **`trg_checklist_transition`** (BEFORE INSERT/UPDATE, SECURITY DEFINER):
   - INSERT: solo `coordinador|equipo`; estado inicial `no_recibido`.
   - UPDATE con cambio de estado: TD-2:
     * `no_recibido→recibido`: `empresa` con `document_id`; `coordinador/equipo` con `solicitud_nota`.
     * `recibido→revisado`: `coordinador|equipo`.
     * `revisado→validado_r1`: `coordinador` + `document_id`.
     * `validado_r1→*`: `CONFLICT_STATE` (`P0001`).
     * cualquier otra: `CONFLICT_STATE`.
   - UPDATE sin cambio de estado: solo `coordinador|equipo`.
   - `document_id` no nulo ⇒ debe existir, pertenecer al mismo `diagnostic_id`/tenant y `upload_status='registered'`.
   - `service_role` (EF-03) conserva la validación de su contrato y no se bloquea por rol de usuario.
3. **`trg_checklist_audit`** (AFTER INSERT/UPDATE): para cambios de usuario autenticado escribe `audit_log` con estado anterior/nuevo, documento y diagnóstico. La EF-03 con `service_role` conserva su auditoría atómica (no se duplica desde DB).

## Tests

`110_f1_06c_checklist.sql` **plan 17**:
- creación solo coord/equipo; observador rechazado;
- empresa recibe con/sin documento; coord recibe con/sin nota; equipo/empresa revisan/validan según TD-2;
- `validado_r1` terminal; documento de otro diagnóstico rechazado;
- RLS lectura por membresía / admin sin membresía 0; DELETE denegado;
- auditoría DB presente.
Total suite **336** (319 + 17); BD=repo=32.

## Contrato/patches propuestos (a Lead/revisor)

- `docs/01` §4.5/§6 (checklist): documentar trigger TD-2, `document_id` del mismo diagnóstico y auditoría DB.
- `docs/04` EF-03: la EF sigue siendo autoridad de contrato; el trigger DB es defensa final; `service_role` conserva su auditoría; no se añade RPC nueva porque el trigger cubre la transición y la EF puede actualizar directamente con service_role.
- `docs/02` intacto (snapshot F1-18).

## Coordinación

- **F1-06a (UI):** los estados/roles visibles son los de TD-2; no hay cambios de columnas.
- **F1-06b (EF-03):** puede usar `service_role` y auditar en su transacción; el trigger DB revalida TD-2/ligadura. No requiere RPC nueva para este alcance.
- **Revisor/seguridad:** validar que la matriz TD-2 y el bloqueo de DELETE son el alcance esperado.
