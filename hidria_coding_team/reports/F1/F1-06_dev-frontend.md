# F1-06a — UI M3 Checklist documental (dev-frontend-pwa)

| Campo | Valor |
|---|---|
| **Tarea** | `task-113` — F1-06a (UI M3, EF-03/EF-08) |
| **Agente** | `dev-frontend-pwa` (04) |
| **Rama** | `feature/F1-06a-checklist-ui` |
| **Base** | `main` = `e495c8f` (EF-08 presign+register en `main`) |
| **Alcance** | Ruta `/checklist`: estados TD-2, transiciones por rol (UI como pista; RLS/EF-03 autoridad), carga de documento vía EF-08, estados/a11y, E2E UI-level |
| **Conclusión** | **VERDE local** — `lint` 0 · `typecheck` 0 · `build` 0 · E2E **34 passed + 6 skipped** (7 casos M3); CI 7/7 en el PR |

---

## 1. Resumen

- **Ruta M3 `/checklist`** (el path anterior `/documentos` redirige): lista de cotejo agrupada por
  diagnóstico con sus estados `no_recibido → recibido → revisado → validado_r1`, contexto de empresa
  y folio, documento adjunto y nota de solicitud.
- **Transiciones visibles según rol de diagnóstico** (`project_members.role`) con TD-2: `empresa`
  adjunta documento en `no_recibido`; `coordinador`/`equipo` solicitan documento (nota obligatoria) y
  marcan revisado; **sólo `coordinador` valida en R1** y con `document_id` adjunto (decisión del Lead:
  prevalece TD-2 sobre `docs/04`); `observador`/no miembro: sólo lectura. La UI **no es autorización**:
  las transiciones se envían por **EF-03** y RLS/trigger TD-2 deciden.
- **Carga de documento** con **EF-08 ya en `main`**: validación de archivo en cliente (MIME permitido,
  1 B–100 MB), SHA-256 en el navegador, `presign` → `PUT` a R2 → `register` → EF-03 `recibido` con
  `document_id`.
- **Estados** de pantalla: carga, vacío, error (con reintento), **sin permiso** (403/RLS), offline
  (sin prometer persistencia) y configuración incompleta. No se tocó el shell PWA/offline-first.
- **E2E UI-level (7 casos M3)** con PostgREST/EF mockeados (sin datos reales): estados/acciones por
  rol, nota de solicitud, flujo completo de carga, validación R1, error EF-08 y 403 de EF-03,
  vacío/offline. La RLS/TD-2 reales quedan cubiertas por **F1-06b (Deno)** y **F1-06c (pgTAP/trigger)**.

## 2. Contrato y coordinación

- **EF-08 (`main`)**: `POST /functions/v1/ef-08-documents/presign` y `…/register`, envelope
  `{error:{code,message,details?,ref?}}`; respuesta presign `{upload_url, document_id,
  expira_en_seg:300, metodo:"PUT"}` y register `{document_id, sha256}`; sin `r2_key` en cliente.
- **EF-03 (F1-06b, confirmado por `dev-edge-functions`)**: función `ef-03-checklist`, endpoint
  `POST /functions/v1/ef-03-checklist/checklist/{item_id}/transition`; cuerpo `{to,
  document_id?, solicitud_nota?}`; respuesta `{item_id, item_code, estado, document_id}`; errores 401
  `AUTH_INVALID`, 403 `FORBIDDEN_ROLE`/`FORBIDDEN_NOT_MEMBER`, 409 `CONFLICT_STATE`
  (`details.estado_actual`), 404 `NOT_FOUND`, 422 `VALIDATION_*`; `Idempotency-Key` opcional (la UI
  envía UUID por transición).
- **F1-06c (confirmado por `arquitecto-bd`)**: `document_checklist_items_sel` por
  `is_diagnostic_member`; se retiró `checklist_write` FOR ALL y hay trigger de transición TD-2 con
  ligadura `document_id`→mismo diagnóstico/tenant + `upload_status='registered'`; `validado_r1`
  terminal. **La UI no escribe el checklist por PostgREST** (sólo EF-03).
- **TD-2 vs docs/04:** para `validado_r1` prevalece TD-2 = sólo `coordinador` con documento. La UI y
  el E2E lo aplican; EF-03/trigger lo exigen. Se reporta a spec para el patch de `docs/04`.

## 3. Implementación (UI)

- `app/src/routes/checklist/ChecklistPage.tsx`: pantalla M3 con agrupación por diagnóstico, badges de
  estado, indicador de documento, nota de solicitud, acciones por rol y formulario inline de nota;
  mensajes `role=status`/`role=alert`; estados de carga/vacío/error/forbidden/offline/config.
- `app/src/features/checklist/types.ts`: estados/etiquetas, códigos de ítem, mapeo `item_code`→
  `doc_type`, MIME permitidos, límites de tamaño y **TD-2** (`availableTransitions(role, item)`).
- `app/src/features/checklist/api.ts`: lectura PostgREST (ítems + rol propio en `project_members`);
  EF-08 presign/PUT/register con SHA-256; EF-03 transition; mapeo de errores por código; flujo
  `uploadAndMarkReceived`.
- `app/src/features/checklist/hooks.ts`: hook de carga con estados y reintento.
- `app/src/routes/registry.tsx`: M3 → `/checklist`, título «Checklist documental» (nav/breadcrumbs).
- `app/src/router.tsx`: ruta real M3, `/documentos` → redirect, M3 fuera de placeholders.
- A11y: labels en file input y nota, botones con texto, `aria-live` para cargas/avisos, `role=alert`
  en errores, foco al abrir el formulario de nota, estado del ítem también en texto accesible
  (sr-only), acciones deshabilitadas con `title` explicativo cuando falta documento.

**Fuera de alcance (documentado):** evento Realtime `checklist_updated` (no implementado en esta
entrega; F1-06 lo incluye como entregable de M3 y se difiere a seguimiento), descarga de documentos
(EF-08 F1-05 no expone URL de descarga), cola offline de captura (Dexie M4/M6/M10) y selector de
`exposure_level` (se envía `restringido_nda` por defecto del contrato).

## 4. E2E (UI-level)

`tests/e2e/checklist.spec.ts` — Supabase ficticio (`test.invalid`) con PostgREST y EF mockeados
(incluye preflight CORS y PUT a `r2.test.invalid`), fixtures sintéticas:

| # | Caso | Resultado |
|---|---|---|
| 1 | equipo: estados y sólo transiciones de su rol (sin «Validar en R1», sin adjuntar) | OK |
| 2 | staff: «Solicitar documento» → nota obligatoria → EF-03 con `solicitud_nota` | OK |
| 3 | empresa: presign → PUT → register → EF-03 `recibido` con `document_id` (y SHA-256 hex) | OK |
| 4 | coordinador: «Validar en R1» con documento → EF-03 `validado_r1` | OK |
| 5 | error EF-08 (403) → alerta, sin encadenar register/EF-03 | OK |
| 6 | EF-03 rechaza validación (403) → alerta y estado sin cambio (autoridad server-side) | OK |
| 7 | vacío y offline (sin prometer persistencia) | OK |

La UI **no** hace UPDATE del checklist por PostgREST (el mock responde 405 si se intenta; verificado en
el flujo). La autorización real no se declara cubierta por este E2E: la cubren F1-06b (Deno) y F1-06c
(pgTAP/trigger).

## 5. Evidencia (local, Chrome)

```
npm run lint       → eslint src ..................................... EXIT 0
npm run typecheck  → tsc --noEmit && tsc -p tsconfig.sw.json --noEmit  EXIT 0
npm run build      → … vite build ................................... EXIT 0
                     PWA v2.0.0 · injectManifest · precache 11 entries (594.30 KiB)
npm run test:e2e   → 34 passed + 6 skipped (11 shell + 14 M1 + 2 guard + 7 M3) EXIT 0
```

## 6. Pendientes / coordinación

1. **EF-03 (F1-06b)** aún sin desplegar en `main`: la UI muestra error controlado si se intenta una
   transición antes del merge; E2E mockea el contrato confirmado. Al mergear, validar en el job local
   si se amplía el E2E real (hoy el job local sólo corre `empresas.local.spec.ts`; M3 real requeriría
   EFs/R2 en local → no aplica en esta entrega).
2. **F1-06c**: trigger TD-2/RLS en revisión; si cambia roles/estados, ajustar `availableTransitions`
   y E2E (sin cambiar columnas).
3. **Realtime `checklist_updated`** diferido (seguimiento F1-06/M3), documentado.
4. **Spec/seguridad/QA** sobre el PR (CI 7/7): sin `supabase/**`/`docs/**`, sin datos reales; TD-2
   aplicado a la UI y al E2E; `validado_r1` sólo coordinador.
5. No rompe shell offline-first: no se modificaron SW/manifest; la pantalla declara que requiere
   conexión y no promete persistencia offline.

*Reporte de `dev-frontend-pwa` para F1-06a (task-113).*
