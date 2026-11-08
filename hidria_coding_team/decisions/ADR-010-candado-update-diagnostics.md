# ADR-010 — Candado de UPDATE de `diagnostics` (folio inmutable y campos de gate)

- **Estado:** Aceptado
- **Fecha:** 2026-11-08
- **Tarea:** `task-59` (residual de seguridad de PR #19/task-18)
- **Dueño:** `arquitecto-bd`; revisión: `revisor-especificaciones`, sign-off: `seguridad-privacidad`
- **Contexto:** F1/M2, antes de F1-04

## Contexto

`diagnostics_phase_gate` (BEFORE UPDATE) solo valida `fase_actual`; no cubre otros
campos de gate/estado. Un `coordinador_srhds`/`equipo` podía hacer UPDATE directo
(PostgREST) de `estado`, `reporte_document_id`, `bitacora_cerrada`, `avance_pct`,
`cat_estado`, `semaforo_atraso`, `ivoh_actual`, `brecha_pct`, `proximo_hito`,
`reprogramacion_justificacion` y **`folio`**, saltándose EF-01 (advance-phase) y EF-07
(emit-report). Task-18 ya congeló el **INSERT** (estado inicial, folio server-side,
roles); el UPDATE quedó como residual B2.

## Decisión

Migración forward-only `20261108040000_f1_00_task59_update_lock.sql` con un trigger
BEFORE UPDATE `diagnostics_update_lock`:

1. **`folio` inmutable** para todos los roles: cualquier cambio → `42501`.
2. **Campos de gate/estado solo vía `service_role`/EF** (cuando `auth.uid()` es NULL):
   `estado`, `reporte_document_id`, `bitacora_cerrada`, `avance_pct`, `cat_estado`,
   `semaforo_atraso`, `ivoh_actual`, `brecha_pct`, `proximo_hito`,
   `reprogramacion_justificacion`. Un usuario autenticado que intente cambiarlos
   recibe `42501`.
3. `fase_actual` sigue validada por `diagnostics_phase_gate` (transiciones y gates);
   no se duplica.
4. Los campos no incluidos (p. ej. `fecha_fin`, datos descriptivos) siguen
   actualizables por los roles autorizados por `diagnostics_upd`.

## Rutas legítimas

- **EF-01** (`advance-phase`) y **EF-07** (`emit-report`) usan `service_role` (o RPC
  `security definer`) y pueden actualizar fase/estado/reporte/bitácora tras validar
  sus gates; `auth.uid()` es NULL en `service_role`.
- El cliente/PostgREST no puede hacer esas transiciones directas.

## Consecuencias

- Cierra B2: `folio` no cambia en UPDATE y los campos de gate no se pueden saltar por
  UPDATE directo.
- Cualquier EF futura debe ejecutarse con `service_role` (o RPC equivalente); no se
  acepta `UPDATE` directo de usuario para estos campos.
- Sin datos reales hasta que M2/F1-04 validen los flujos EF; el esquema no cambia
  (solo trigger/función).
- Tests pgTAP: `050` con folio/estado/campos combinados → 42501, UPDATE permitido
  (`fecha_fin`) → OK, y `service_role` actualizando estado → OK.

## Alternativas descartadas

- **EF-only puro con permisos revocados**: requiere rehacer grants y no protege
  `folio`/estado si otro rol con DML accede; el trigger es defensa en profundidad y
  mantiene el contrato actual de `diagnostics_upd`.
- **Columnas generadas**: no aplica a campos que la EF debe actualizar.

## Referencias

- `supabase/migrations/20261108030000…/003020` (task-18, INSERT)
- `supabase/migrations/20261108040000_f1_00_task59_update_lock.sql`
- `docs/04` §2.5, §2.6; `docs/01` §5
- `reports/F1/F1-00_task59_update_lock.md`; tests `supabase/tests/050_f1_00_security_delta.sql`
