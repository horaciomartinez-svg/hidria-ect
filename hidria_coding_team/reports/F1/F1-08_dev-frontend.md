# F1-08a — UI M5 IIH (dev-frontend-pwa)

| Campo | Valor |
|---|---|
| **Tarea** | `task-134` — F1-08a (UI M5, IIH + EF-09) |
| **Agente** | `dev-frontend-pwa` (04) |
| **Rama** | `feature/F1-08a-iih-ui` |
| **Base** | `main` = `2052eda` (F1-07 cerrada) |
| **Alcance** | `/iih` inventario (resumen/tabla/filtros), alta/edición por rol/RLS, carga XLSX con EF-09, errores por fila, estados/a11y, E2E UI-level |
| **Conclusión** | **VERDE local** — `lint` 0 · `typecheck` 0 · `build` 0 · E2E **50 passed + 6 skipped** (8 casos M5); CI 7/7 en el PR |

---

## 1. Resumen

- **Rutas M5:** `/iih` (selector de diagnósticos visibles por RLS) y `/iih/:diagnosticId` (inventario).
  M5 sale de placeholders; el shell mantiene `/iih`.
- **Inventario:** resumen (total, verificados V1, criticidad alta, por etapa CAP/ALM/TRA/DIS/USO/EVA),
  tabla con folio/etapa/tipo/TAG-ubicación/capacidad/estado físico/ópera/criticidad/verificado, y
  filtros por texto (folio/TAG/ubicación), etapa, tipo, estado físico y verificación V1.
- **Alta/edición manual por PostgREST bajo RLS** (`iih_assets_write`: `coordinador|equipo`;
  empresa/observador sólo lectura). La UI **no** actualiza `diagnostics`/fases/gates; el **folio** lo
  asigna `trg_iih_folio` y **`organization_id`** viaja del claim de sesión (sin default en DB). Los
  campos server-side/inmutables (`folio`, `organization_id`, `diagnostic_id`, timestamps) no se envían
  en updates. Verificación V1 (`verificado_v1`) se marca en el formulario para alimentar el gate, sin
  saltarlo.
- **Carga XLSX con EF-09:** el cliente valida extensión/MIME, firma ZIP y tamaño ≤ **10 MB**; luego
  ejecuta **presign → PUT R2 → register (EF-08) → EF-09 JSON**
  `{diagnostic_id, document_id, kind:'iih'}`. La UI muestra fases (subiendo/importando), resultado
  (`filas_ok`, `filas_rechazadas` 1-based con razón, `advertencias`) y recarga el inventario.
  Estructura/columnas/límite de 500 filas/las filas las valida el servidor; la plantilla oficial
  (hojas «1. Captación»…«6. Evacuación», encabezados fila 7, datos desde fila 8, columna B con código
  de `iih_asset_types`) está documentada en la pantalla y en este reporte. `verificado_v1=false` y
  `prioridad` recalculada server-side tras importar.
- **Estados:** carga, vacío, error, sin permiso (403/RLS), offline (sin prometer captura offline;
  Dexie/F2), configuración incompleta, filas rechazadas y diff/estructura 422. A11y: fieldsets,
  labels/errores `aria`, `aria-invalid`, `aria-live` para importación, tabla con `caption`/`scope`,
  foco al primer error y nomenclatura SDFI/SRHDS/UCI.
- **Shell:** se actualizó la aserción de `tests/e2e/shell.spec.ts` porque M5 ya no es placeholder
  («Fase prevista F2»); ahora verifica que `/iih` monta la UI real (estado vacío determinista con
  mocks). M7 conserva su `phaseNote` F1 mínimo/F2 completo.

## 2. Contrato y coordinación

- **`arquitecto-bd` (F1-08c) confirmó:** alta/edición por PostgREST bajo RLS, import sólo EF-09;
  `folio` por trigger (no cliente), `organization_id` del claim y guard DB previsto (mismo tenant que
  el diagnóstico, inmutables `diagnostic_id`/`organization_id`/`folio` en UPDATE); catálogos
  `iih_stages`/`iih_asset_types` sin cambios; columnas/CHECK de `docs/02`; import transaccional vía
  RPC `fn_import_iih_assets(p_user_id,p_diagnostic_id,p_assets,p_idempotency_key,p_request_hash)`
  (service_role, filas válidas + rechazadas, audit/idempotencia) que invoca EF-09; gate V1 lo consume
  DB, la UI sólo muestra progreso/verificación.
- **`dev-edge-functions` (F1-08b, head `267b275`/PR #64 draft) confirmó:** ruta
  `POST /functions/v1/ef-09-import/import/xlsx` con **JSON** `{diagnostic_id, document_id,
  kind:'iih', periodo_anio?}`, `document_id` de EF-08 `register`, EF descarga el XLSX de R2; límites
  10 MB/500 filas, sin fórmulas/macros; errores por fila 1-based, `422 VALIDATION_XLSX_ESTRUCTURA`;
  respuesta `{kind,destino_id,filas_ok,filas_rechazadas,advertencias}`; roles coord/equipo; deja
  `verificado_v1=false`. La UI/E2E ya usan exactamente esa ruta y payload.
- **Sin `supabase/**`/`docs/**`** en este PR; RLS/trigger/RPC reales se cubren con F1-08c (pgTAP) y
  la EF con F1-08b (Deno). El contrato de import está aislado en `features/iih/api.ts` por si
  Lead/revisor ajusta algún campo.

## 3. Archivos

- `app/src/features/iih/types.ts` — catálogos/labels/estados del activo, validación, resumen y
  validación XLSX cliente (extensión/MIME/ZIP/10 MB).
- `app/src/features/iih/api.ts` — lecturas PostgREST (diagnóstico, catálogos, activos), alta/edición
  bajo RLS y flujo presign→PUT→register→EF-09.
- `app/src/features/iih/hooks.ts` — carga de diagnósticos e inventario con estados/reintento.
- `app/src/routes/iih/IihListPage.tsx` — selector de diagnóstico.
- `app/src/routes/iih/IihInventoryPage.tsx` — resumen, filtros, tabla, formulario e importación.
- `app/src/router.tsx` — rutas reales `/iih` y `/iih/:diagnosticId`; M5 fuera de placeholders.
- `tests/e2e/iih.spec.ts` — 8 casos UI-level.
- `tests/e2e/shell.spec.ts` — aserción M5 actualizada (ya no placeholder).
- Este reporte.

## 4. E2E (UI-level)

`tests/e2e/iih.spec.ts` — Supabase ficticio con PostgREST (diagnóstico/catálogos/activos), EF-08
(presign/register + PUT R2) y EF-09 (JSON) mockeados, fixtures sintéticas:

| # | Caso | Resultado |
|---|---|---|
| 1 | equipo: resumen, tabla (folios/V1) y filtros búsqueda/etapa | OK |
| 2 | equipo: alta con `organization_id` del claim y sin `folio` en el payload | OK |
| 3 | equipo: edición/verificación V1 sin campos server-side (folio/organization_id) | OK |
| 4 | observador: sólo lectura (sin alta, edición ni import) | OK |
| 5 | importación: EF-08 presign/register → EF-09 JSON y reporte por fila | OK |
| 6 | estructura XLSX inválida (422 `VALIDATION_XLSX_ESTRUCTURA`) muestra el error | OK |
| 7 | archivo no XLSX: rechazo en cliente sin llamar EF-08/EF-09 | OK |
| 8 | vacío y offline (sin prometer persistencia) | OK |

**No cubierto por este E2E:** RLS/trigger de folio/tenant y RPC de import (pgTAP F1-08c), EF-09 real
(Deno F1-08b) ni columnas/hojas reales del XLSX (la UI valida formato y muestra el diff del servidor).
El job local del CI sólo ejecuta `empresas.local.spec.ts`; M5 real requeriría EF-09/RPC desplegadas →
**no aplicable** en esta entrega.

## 5. Evidencia (local, Chrome)

```
npm run lint       → eslint src ..................................... EXIT 0
npm run typecheck  → tsc --noEmit && tsc -p tsconfig.sw.json --noEmit  EXIT 0
npm run build      → … vite build ................................... EXIT 0
                     PWA v2.0.0 · injectManifest · precache 11 entries (654.01 KiB)
npm run test:e2e   → 50 passed + 6 skipped (11 shell + 14 M1 + 2 guard + 7 M3 + 8 M4 + 8 M5) EXIT 0
```

## 6. Pendientes / coordinación

1. **EF-09 (F1-08b, PR #64 draft) y RPC F1-08c** aún sin merge: la UI muestra error controlado en la
   importación mientras no estén desplegadas; el E2E mockea el contrato confirmado. Al integrarse,
   validar el flujo real si se amplía el job local a M5.
2. **F1-08c:** guard de tenant/inmutabilidad y RPC de import; si añade/ajusta columnas o el contrato
   de import, ajustar `features/iih` (aislado).
3. **Spec/seguridad/QA** sobre el PR (CI 7/7): sin `supabase/**`/`docs/**`, sin datos reales; la UI no
   toca `fase_actual`/gates; folio/organización server-side; XLSX validado por EF-09.
4. **Diferido documentado:** adjuntos/evidencia por activo, captura offline (Dexie/F2), m²/columnas
   nuevas y E2E real local (requiere EF-09/RPC).

*Reporte de `dev-frontend-pwa` para F1-08a (task-134).*
