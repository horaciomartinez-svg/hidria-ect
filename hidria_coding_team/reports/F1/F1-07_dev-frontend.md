# F1-07a — UI M4 CAT (dev-frontend-pwa)

| Campo | Valor |
|---|---|
| **Tarea** | `task-125` — F1-07a (UI M4, banco A1-v1; EF-04) |
| **Agente** | `dev-frontend-pwa` (04) |
| **Rama** | `feature/F1-07a-cat-ui` |
| **Base** | `main` = `2535950` (F1-06 cerrada; EF-03 en `main`) |
| **Alcance** | Ruta `/cat` + `/cat/:diagnosticId`: 47 preguntas A1-v1 por secciones A–H, borrador, submit/validate-r2 por EF-04, gate R2 visible, estados/a11y, E2E UI-level |
| **Conclusión** | **VERDE local** — `lint` 0 · `typecheck` 0 · `build` 0 · E2E **41 passed + 6 skipped** (7 casos M4); CI 7/7 en el PR |

---

## 1. Resumen

- **Fuente del banco:** `docs/03` §7 (`cat_items`, **A1-v1, 47 preguntas**, secciones A–H; ya en la
  migración `20261031001000_seed_catalogos.sql`). **No** se usa `docs/08` (aula/quiz); no se inventan
  preguntas ni se toca `docs/**`.
- **Rutas M4:** `/cat` (selector de diagnósticos visibles por RLS, con empresa/folio/`cat_estado` y
  rol) y `/cat/:diagnosticId` (captura). El registro M4 del shell ya apuntaba a `/cat`; no se cambió
  el contrato de navegación.
- **Captura:** las 47 preguntas se renderizan agrupadas por sección, respetando `tipo`
  (`abierta`/`breve`/`opcion_unica`/`multiple`), opciones del seed, `ayuda` y el indicador
  `admite_evidencia`; soporte de `condicion` (`{"depends_on":"B1","contains":"pozo"}`) si el banco la
  trae (seed actual `null` → sin condicionales). Cada pregunta admite valor, **«No sé»** (canalizado a
  R2) o **«No aplica»**, mutuamente excluyentes.
- **Guardado del borrador:** PostgREST sobre `cat_responses` (insert/update bajo RLS
  `cat_responses_ins/upd` para `coordinador|equipo|empresa`; confirmado por `arquitecto-bd`),
  **`created_by` lo fija server-side el trigger (`auth.uid()`, F1-07c) y la UI no lo envía**
  (SEC-PR61-01), y **sin tocar `diagnostics.cat_estado`**. Guardado por pregunta (blur/opciones) con
  indicador accesible «Guardando…/Guardado/Error».
- **Submit / gate R2:** **EF-04** (`docs/04` §EF-04). `submit` visible para empresa/coord/equipo
  cuando el CAT no está en revisión/validado; `validate-r2` visible sólo a coordinador/equipo y sólo
  con `cat_estado='en_revision'`. Gate **F3** visible y bloqueado hasta `validado_r2` (TD-1 #2), con
  nota de ficha BIT-R2 y `no sé` sin plan. Errores del contrato con alertas accesibles
  (`VALIDATION_CAT_INCOMPLETO` con códigos faltantes, `GATE_R2_FICHA`, `FORBIDDEN_ROLE`).
- **Validaciones de cliente (pista; EF-04/trigger son la autoridad):** obligatorias aplicables salvo
  `no_se`/`na`; submit local bloqueado con lista de códigos faltantes y foco en el primer campo; los
  rangos finos y la validación de tipos/opciones quedan en EF-04/trigger (el seed no trae columnas de
  rango/obligatoriedad). El servidor rechaza cualquier intento aunque el cliente se equivoque.
- **Estados:** carga, vacío (sin diagnósticos / diagnóstico inexistente), error, sin permiso (403/RLS),
  offline (sin prometer borrador offline; Dexie llega con M4/M6/M10) y configuración incompleta.
  No se modificó el SW ni el shell offline-first.
- **A11y:** `fieldset`/`legend` por sección, labels por pregunta con `aria-describedby` de ayuda/error,
  requeridos con texto accesible, `aria-invalid` en faltantes, progreso `role=status`/`aria-live`,
  estado de guardado `aria-live`, botones con texto y foco al primer error del submit.
- **Nomenclatura:** SDFI/SRHDS/UCI y «CAT — Cuestionario de Análisis Técnico» (sin siglas prohibidas).

## 2. Contrato y coordinación

- **`arquitecto-bd` (F1-07c) confirmó:** borrador por PostgREST y sólo submit/validate por EF-04;
  `cat_responses_ins/upd` para coord/equipo/empresa, observador/invitado sólo lectura; trigger
  `created_by=auth.uid()` inmutable y `updated_at`; **no** hay transición automática de `cat_estado` al
  guardar; seed 47 ya existente y **sin `condicion`** (la UI no inventa condicionales); evidencia por
  pregunta no bloquea si `resuelta_en_campo=false` (no se expone en F1-07a).
- **SEC-PR61-01 (seguridad, aplicado):** el INSERT del borrador **no incluye `created_by`**; la UI no
  puede fijar ownership (el trigger/`auth.uid` gana). El E2E verifica que ningún payload lo envía; el
  rechazo del spoof en DB queda cubierto por el pgTAP de F1-07c (trigger).
- **`dev-edge-functions` (F1-07b) confirmó** (head `117e7a7`, PR #59 draft hasta RPC):
  `POST /functions/v1/ef-04-cat/cat/{diagnostic_id}/submit` y `…/validate-r2`; `submit` con body
  `{}` (la EF valida contra DB), `Idempotency-Key` opcional (la UI envía UUID);
  **`validate-r2` exige `{r2_logbook_id: uuid}`** (ficha BIT-R2 cerrada) → la UI añade un campo
  UUID obligatorio y deshabilita «Validar CAT en R2» hasta que sea válido; respuesta
  `{diagnostic_id, cat_estado, pendientes}`; envelope `{error:{code,message,details?,ref?}}` con
  `VALIDATION_CAT_INCOMPLETO` y **`details.faltantes: string[]`** (la UI los muestra si el servidor
  rechaza); `GATE_R2_FICHA` 409. Submit `empresa|coordinador|equipo`, validate
  `coordinador|equipo` (la UI oculta validate a `empresa`).
- **Sin `supabase/**`/`docs/**`** en este PR; RLS/trigger reales se cubren con F1-07c (pgTAP) y la EF
  con F1-07b (Deno).

## 3. Archivos

- `app/src/features/cat/types.ts` — banco/secciones/tipos, condiciones, progreso y roles.
- `app/src/features/cat/api.ts` — lecturas PostgREST (`cat_items`, `diagnostics`,
  `project_members`, `cat_responses`), borrador insert/update bajo RLS y EF-04 submit/validate.
- `app/src/features/cat/hooks.ts` — carga de diagnósticos y del CAT con estados/reintento.
- `app/src/routes/cat/CatListPage.tsx` — selector de diagnósticos y `cat_estado`.
- `app/src/routes/cat/CatFormPage.tsx` — captura por secciones, progreso, gate R2, guardado, submit y
  validate-r2 con a11y.
- `app/src/router.tsx` — rutas reales `/cat` y `/cat/:diagnosticId`; M4 fuera de placeholders.
- `tests/e2e/cat.spec.ts` — 7 casos UI-level.
- Este reporte.

## 4. E2E (UI-level)

`tests/e2e/cat.spec.ts` — proyecto Supabase ficticio con 47 `cat_items` generados con la forma del
seed (secciones A6/B7/C7/D8/E6/F6/G4/H3), `cat_responses`, `diagnostics`, `project_members` y EF-04
mockeados (con preflight CORS):

| # | Caso | Resultado |
|---|---|---|
| 1 | empresa: lista diagnóstico, abre el CAT, renderiza **47** preguntas en A–H | OK |
| 2 | guardado de borrador por PostgREST (1/47) sin cambiar `cat_estado` | OK |
| 2b | **SEC-PR61-01:** el borrador **no envía `created_by`** (lo fija el trigger/server) | OK |
| 3 | submit bloqueado por faltantes (lista 47 códigos) **sin** llamar EF-04 | OK |
| 4 | submit completo → EF-04 y estado `en_revision`; gate R2 pendiente; empresa no ve validate | OK |
| 5 | coordinador: validate-r2 (con `r2_logbook_id`) → `validado_r2`, gate desbloqueado | OK |
| 6 | EF-04 403 → alerta y estado sin cambio | OK |
| 7 | vacío y offline (sin prometer persistencia) | OK |

**No cubierto por este E2E:** RLS/trigger reales de `cat_responses` (pgTAP F1-07c), EF-04 real
(Deno F1-07b) y el guardado offline (Dexie, F2). El E2E local del job CI sólo ejecuta
`empresas.local.spec.ts`; M4 real requeriría EF-04 desplegada y se documenta como **no aplicable** en
esta entrega.

## 5. Evidencia (local, Chrome)

```
npm run lint       → eslint src ..................................... EXIT 0
npm run typecheck  → tsc --noEmit && tsc -p tsconfig.sw.json --noEmit  EXIT 0
npm run build      → … vite build ................................... EXIT 0
                     PWA v2.0.0 · injectManifest · precache 11 entries (618.18 KiB)
npm run test:e2e   → 42 passed + 6 skipped (11 shell + 14 M1 + 2 guard + 7 M3 + 8 M4) EXIT 0
```

## 6. Pendientes / coordinación

1. **EF-04 (F1-07b):** contrato confirmado (head `117e7a7`, PR #59); la EF/RPC aún no está desplegada
   en `main`. Mientras tanto la UI falla de forma controlada y el E2E la mockea; cuando esté en
   `main`, validar el flujo real (si el job local se amplía a M4) y ajustar si cambia el contrato.
2. **F1-07c:** trigger/RLS de `cat_responses` y roles; si añade `condicion`/metadatos de rango, la UI
   ya soporta `condicion` y mostrará la validación fina desde EF-04/trigger.
3. **Spec/seguridad/QA** sobre el PR (CI 7/7): sin `supabase/**`/`docs/**`, sin datos reales; banco
   47 según `docs/03` (no `docs/08`); nomenclatura SDFI/SRHDS/UCI.
4. **Diferido documentado:** evidencia por pregunta (`document_id`/`resuelta_en_campo`), borrador
   offline (Dexie) y Realtime de `cat_estado`; no se promete offline en esta pantalla.

*Reporte de `dev-frontend-pwa` para F1-07a (task-125).*
