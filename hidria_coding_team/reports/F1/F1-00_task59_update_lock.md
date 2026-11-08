# F1-00 — task-59: candado de UPDATE de `diagnostics` (folio inmutable + gates/estado)

- **Agente:** `arquitecto-bd` (02)
- **Fecha:** 2026-11-08 13:35 (America/Mexico_City)
- **Tarea:** `task-59` — residual B2 de PR #19/task-18, antes de M2/F1-04
- **Rama:** `fix/F1-task59-update-lock`, desde `main` `8e4e258`
- **ADR:** `hidria_coding_team/decisions/ADR-010-candado-update-diagnostics.md`
- **Migración:** `supabase/migrations/20261108040000_f1_00_task59_update_lock.sql` (aplicada vía MCP)
- **Entorno:** `zucalshlfcxejpukshxl` (dev/staging sintético, ADR-004 E2); `schema_migrations = 20`
- **Alcance:** DB/tests/decisión/docs; sin tocar `supabase/functions/**`, `app/**` ni migraciones previas.

## Resultado: VERDE (DB)

Cierra B2: el **folio es inmutable en UPDATE** y los campos de gate/estado solo los modifica la
EF con `service_role`. Un UPDATE directo autenticado recibe `42501`; las rutas EF-01/EF-07
(service_role) pueden hacer las transiciones legítimas. `docs/04` §2.5 y el reporte F1-00 quedan
actualizados.

## 1. Trigger `diagnostics_update_lock` (BEFORE UPDATE)

| Campo(s) | Regla |
|---|---|
| `folio` | **Inmutable para todos los roles**; cualquier cambio → `42501` |
| `estado`, `reporte_document_id`, `bitacora_cerrada`, `avance_pct`, `cat_estado`, `semaforo_atraso`, `ivoh_actual`, `brecha_pct`, `proximo_hito`, `reprogramacion_justificacion` | Solo `service_role`/EF (`auth.uid()` NULL); usuario autenticado → `42501` |
| `fase_actual` | Sigue cubierta por `diagnostics_phase_gate` (transiciones/gates), sin duplicar |
| Resto (p. ej. `fecha_fin`, datos descriptivos) | Sigue sujeto a `diagnostics_upd` y a los roles autorizados |

Verificación en vivo (claims sintéticos + `ROLLBACK`):

| Caso | Resultado |
|---|---|
| `coordinador_srhds` UPDATE `folio='MDOHI-FAKE-999'` | **42501**, folio sin cambio |
| `coordinador_srhds` UPDATE `estado/reporte/bitácora/avance/cat` | **42501** |
| `coordinador_srhds` UPDATE `fecha_fin` (campo no-gate) | **OK**, 1 fila |
| `service_role` UPDATE `estado='validado'` (ruta EF) | **OK**, 1 fila |
| `UPDATE fase_actual=6` desde fase 1 | **P0001** `Gate F2...` (trigger existente) |

## 2. ADR y contrato

- **ADR-010** documenta el estado previo (gate solo fase), la decisión (trigger + service_role/EF),
  alternativas descartadas (EF-only/columnas generadas) y consecuencias.
- `docs/04` §2.5: folio server-side en INSERT e inmutable en UPDATE; campos de gate solo EF.
- `docs/01` §5 no cambia: la autorización por rol de `diagnostics_upd` se mantiene; el trigger
  añade el candado de columnas.
- Ninguna EF actual se modifica; EF-01/EF-07 deben usar `service_role`. Un RPC
  `security definer` invocado por usuario autenticado **no** es ruta válida: conserva
  `auth.uid()` no nulo y el trigger lo bloquea (task-66).

## 3. pgTAP

- `050_f1_00_security_delta.sql`: **plan 34** (task-59 + task-66):
  - UPDATE `folio` → 42501; folio con `service_role` → 42501 (SEC-PR26-01);
  - UPDATE combinado estado/reporte/bitácora/avance/cat → 42501;
  - cada campo restante `semaforo_atraso`, `ivoh_actual`, `brecha_pct`, `proximo_hito`,
    `reprogramacion_justificacion` → 42501;
  - UPDATE `fecha_fin` permitido;
  - `service_role` UPDATE `estado` permitido (ruta EF).
- Total suite: **139 aserciones** (21+9+9+15+34+51); pgTAP CI (task-13) ejecuta desde archivos.
- pglast 8.7: migración y 050 OK.
- Sin datos reales; fixtures `.invalid`.

## 4. Límites / seguimiento

- `service_role` es confiable y puede cambiar los campos de gate; la EF debe validar sus gates
  antes de escribir (EF-01/EF-07).
- El `folio` no se puede corregir ni por `service_role`; si una operación futura lo requiere, debe
  abrirse un ADR nuevo.
- Sin cambios en `supabase/functions/**`, `app/**` ni migraciones previas.
