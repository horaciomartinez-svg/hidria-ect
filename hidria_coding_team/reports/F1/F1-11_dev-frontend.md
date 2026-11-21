# F1-11a — UI M10 Bitácora (dev-frontend-pwa)

| Campo | Valor |
|---|---|
| **Tarea** | `task-174` — F1-11a (UI M10, Bitácora + EF-02) |
| **Agente** | `dev-frontend-pwa` (04) |
| **Rama** | `feature/F1-11a-bitacora-ui` |
| **Base** | `main` = `9d4ae51` (ADR-016 integrado); ADR-016 `6b05860` |
| **Alcance** | `/bitacora` + `/bitacora/:entryId`: 8 fichas, alta mínima, agenda/participantes/evidencia, submit/sign/close EF-02, gate 8/8, post-cierre read-only, a11y/offline, E2E UI-level |
| **Conclusión** | **VERDE local** — `lint` 0 · `typecheck` 0 · `build` 0 · E2E **78 passed + 6 skipped** (9 casos M10); CI 7/7 en el PR |

---

## 1. Resumen

- **Rutas M10:** `/bitacora` (diagnósticos visibles por RLS y sus 8 claves V1,V2,V3,R1–R5, con
  estado/folio/fecha, gate 8/8 y prerrequisito de reporte) y `/bitacora/:entryId` (detalle).
- **Alta mínima:** desde la lista se crean fichas faltantes con `clave`, `fecha`, `horario_inicio`,
  `responsable_sesion`, `modalidad` y `lugar` por INSERT directo bajo RLS; `organization_id`, folio,
  `estado` y `version` son server-side. La UI no crea vía EF ni envía campos de gate.
- **Detalle:** cabecera con estado/folio/fecha/modalidad/lugar/responsable; edición de datos de la
  ficha por RLS hasta cierre (sin campos de gate); agenda (resultado/estado/responsable), participantes
  (alta/eliminación), firmas por participante vía EF-02, hallazgos, acuerdos, evidencia documental,
  control de cambios (solo lectura cuando existe) y gate 8/8.
- **EF-02:** `submit-review` (abierta→en_revision), `sign` por nombre exacto del participante y
  `close` (solo desde en_revision). La UI muestra `VALIDATION_FIRMAS/AGENDA/EVIDENCIA/RAZON`,
  `CONFLICT_STATE` y 403 con alertas accesibles; **no** calcula el plazo de 24 h ni escribe
  `estado`/`cerrada_*`/`version`/folio. El cierre tardío ofrece `cierre_razon` (≥20 caracteres,
  validado por servidor) y muestra `cierre_tardio` al volver.
- **Evidencia:** cada fila de `logbook_evidence` se rellena con **EF-08** (`presign→PUT→register`) y se
  liga por UPDATE de `document_id` bajo RLS; el cierre exige los `document_id` de las filas
  obligatorias. `photo_log`/LB-08 queda fuera de F1-11 (ADR D12).
- **Gate/reporte:** se leen `diagnostics.bitacora_cerrada` y `v_diagnostic_completeness.p7_bitacoras`;
  se muestra 8/8 y “prerrequisito de reporte” sin calcular el gate en cliente.
- **B1/B2 de spec (#79):** cierre_tardio se proyecta en ENTRY_COLUMNS y se muestra como badge post-cierre; el alta **no** envía created_by/organization_id (los fija el trigger/guard de #77, server-side) y el E2E lo verifica. SEC-PR79-01: la evidencia se liga con EF-08 egister + UPDATE RLS; el trigger/RPC de #77 debe exigir documento del mismo org/diagnóstico y upload_status='registered' (la UI no puede garantizarlo sola).\n- **Roles:** coordinador/equipo escriben hasta cierre; empresa/observador solo lectura y sin acciones;
  post-cierre todo read-only. Estados carga/vacío/error/403/offline/config.
- **A11y:** fieldset/labels por sección, `aria-label` en agenda/participantes/evidencia, `aria-live`
  para guardado/acciones, foco en errores, texto saneado y nomenclatura SDFI/SRHDS/UCI.

## 2. Contrato y coordinación

- **ADR-016** (`6b05860`, base `e6ab1c8`): D1–D13 (TD-8, 24 h ≥20 caracteres, validaciones de cierre,
  RPC/EF-02, inmutabilidad 42501, alta/seed de fichas e hijas, firma por nombre, gate por claves).
- **`dev-edge-functions` (F1-11b, PR #78 draft, head `92df6a4`):** rutas
  `ef-02-logbook/logbook/{entry_id}/submit-review|sign|close`, bodies/respuestas y errores
  confirmados provisionalmente (`sign` `{participante}`, `close` `{cierre_razon?}`, sin precheck 24 h);
  la UI y el E2E ya usan esas rutas/bodies.
- **DB/RPC (F1-11c):** migración de estados `en_revision`, guards 42501, seed de hijas, RPC y gate p7;
  pendiente de merge. La UI consume el contrato y el E2E mockea RLS/RPC hasta entonces.
- **Sin `supabase/**`/`docs/**`** en este PR; SW/manifest intactos.

## 3. Archivos

- `app/src/features/logbook/types.ts` — claves/estados/modalidades/agenda, tipos de fichas e hijas,
  helpers de gate 8/8, fechas y saneado; sin cálculo de 24 h.
- `app/src/features/logbook/api.ts` — lecturas (diagnóstico/templates/entries/hijas/completeness),
  alta/edición por RLS, EF-02 submit/sign/close y EF-08 para evidencia.
- `app/src/features/logbook/hooks.ts` — listado y detalle con estados/reintento.
- `app/src/routes/bitacora/BitacoraListPage.tsx` — 8 claves, gate y alta mínima.
- `app/src/routes/bitacora/BitacoraEntryPage.tsx` — detalle, agenda, firmas, evidencia, hallazgos,
  acuerdos, submit/close y post-cierre read-only.
- `app/src/router.tsx` — rutas `/bitacora` y `/bitacora/:entryId`; M10 fuera de placeholders.
- `tests/e2e/bitacora.spec.ts` — 9 casos UI-level.
- Este reporte.

## 4. E2E (UI-level)

`tests/e2e/bitacora.spec.ts` — Supabase ficticio (diagnóstico, templates, entries/hijas,
completeness), EF-02 y EF-08 mockeados:

| # | Caso | Resultado |
|---|---|---|
| 1 | lista: 8 claves, gate y alta mínima (sin org/folio en payload) | OK |
| 2 | detalle: agenda, participantes, evidencia y gate visibles | OK |
| 3 | submit-review → en_revision; close con razón → cerrada/read-only | OK |
| 4 | firma de participante vía EF-02 (`{participante}`) | OK |
| 5 | cierre rechazado por `VALIDATION_RAZON`: mensaje y ficha editable | OK |
| 6 | edición de agenda y alta de participante por RLS | OK |
| 7 | evidencia: EF-08 y liga documento a la fila | OK |
| 8 | observador: solo lectura (sin submit/firmar/cerrar) | OK |
| 9 | vacío y offline (sin prometer persistencia) | OK |

**No cubierto por este E2E:** RLS/guards/RPC/EF reales (pgTAP/Deno F1-11b/c), 24 h exacta y gate p7
(pgTAP), ni E2E real local. El job local del CI sólo ejecuta `empresas.local.spec.ts`; M10 real se
documenta como **no aplicable** en esta entrega.

## 5. Evidencia (local, Chrome)

```
npm run lint       → eslint src ..................................... EXIT 0
npm run typecheck  → tsc --noEmit && tsc -p tsconfig.sw.json --noEmit  EXIT 0
npm run build      → … vite build ................................... EXIT 0
                     PWA v2.0.0 · injectManifest · precache 11 entries (761.32 KiB)
npm run test:e2e   → 78 passed + 6 skipped (11 shell + 14 M1 + 2 guard + 7 M3 + 8 M4 + 8 M5 + 9 M6 + 10 M8 + 9 M10) EXIT 0
```

## 6. Pendientes / coordinación

1. **F1-11b (EF-02, PR #78 draft) y F1-11c (DB/RPC/guards/gate):** aún no en `main`; la UI muestra
   errores controlados y el E2E los mockea. Al mergear, validar el flujo real si se amplía el job local.
2. **Gate 8/8 (B13):** `p7_bitacoras` se actualiza a “8 claves cubiertas, todas las filas de esas
   claves cerradas”; la UI ya lee `p7_bitacoras`/`bitacora_cerrada` y no calcula el gate.
3. **Spec/seguridad/QA** sobre el PR (CI 7/7): sin `supabase/**`/`docs/**`, sin datos reales; la UI no
   escribe estado/cierre/firma directa (sólo EF-02), no calcula 24 h y muestra errores saneados.
4. **Diferido documentado:** `photo_log`/LB-08 fuera de F1-11; precheck 24 h no existe (la UI ofrece
   razón y reacciona al 422); captura offline (Dexie/F2); E2E real local.

*Reporte de `dev-frontend-pwa` para F1-11a (task-174).*
