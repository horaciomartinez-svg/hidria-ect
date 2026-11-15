# F1-09a — UI M6 BHE (dev-frontend-pwa)

| Campo | Valor |
|---|---|
| **Tarea** | `task-144` — F1-09a (UI M6, BHE + EF-05 + EF-09 `kind='bhe'`) |
| **Agente** | `dev-frontend-pwa` (04) |
| **Rama** | `feature/F1-09a-bhe-ui` |
| **Base** | `main` = `3af51ae` (ADR-014 integrado) |
| **Alcance** | `/bhe` + `/bhe/:diagnosticId`: captura mensual 12 meses, brecha de solo lectura, validar R3 por EF-05, import XLSX BHE por EF-09, estados/a11y, E2E UI-level |
| **Conclusión** | **VERDE local** — `lint` 0 · `typecheck` 0 · `build` 0 · E2E **59 passed + 6 skipped** (9 casos M6); CI 7/7 en el PR |

---

## 1. Resumen

- **Rutas M6:** `/bhe` (selector de diagnósticos visibles por RLS, con fase/estado/versión y brecha
  leída de `v_bhe_capture_summary`) y `/bhe/:diagnosticId` (captura/detalle). M6 sale de placeholders.
- **Captura mensual:** matriz de 12 meses × flujos de `balance_flow_catalog` agrupada por
  `entrada`/`consumo_proceso`/`consumo_general`/`descarga`/`perdida`/`circular`, con volumen m³
  editable, guardado por celda al salir (PostgREST bajo RLS), estado de guardado accesible y recarga
  del contexto (el trigger `borrador→en_captura` se refleja al recargar). Matriz con inputs
  etiquetados (`aria-label` flujo+mes), `fieldset`/`legend` por grupo y `caption`.
- **Brecha/totales sólo lectura:** la tabla de totales y la brecha salen de
  `v_bhe_monthly_capture`/`v_bhe_capture_summary` (o `v_bhe_monthly`/`v_bhe_summary` post-R3). La UI
  **no calcula la brecha ni decide el gate**; muestra `brecha_anual_pct` ponderada, `brecha_max_mes_pct`,
  `meses_sobre_umbral`, `meses_con_captura`, `captura_completa`, `tiene_datos` y un semáforo de
  presentación sobre el valor ya calculado.
- **Validar R3 (EF-05):** sólo coordinador/equipo, cuando el balance no está validado. Exige
  `r3_logbook_id` (UUID de ficha BIT-R3 cerrada); llama a
  `POST /functions/v1/ef-05-balances/balances/{balance_id}/validate-r3` con `Idempotency-Key`.
  Muestra `GATE_BHE_BRECHA` con el **mensaje canónico** y la tabla de `details.meses` 1-based;
  `GATE_R3_FICHA`/422 `VALIDATION_BHE_INCOMPLETO`/403 con alertas accesibles; al 200 muestra brecha
  anual/máx, estado `validado_r3`, gate F5 cumplido y deja el balance en solo lectura. Nunca actualiza
  `estado`/`validado_r3_logbook_id`/`version` desde el cliente.
- **Gate F5 visible:** se muestra con `diagnostics.fase_actual` y el estado del balance; bloqueado
  hasta `validado_r3` (la autoridad final es `check_phase_gate`/EF-01). No se inventa endpoint.
- **Alta de balance:** cuando no existe, formulario para coord/equipo con `periodo_anio` (2000–2100) y
  `mes_inicio` (1–12); el payload enviado es sólo `diagnostic_id/periodo_anio/mes_inicio` y el servidor
  fija `organization_id`, `version` y `estado='borrador'`.
- **Importar BHE (EF-09):** flujo **presign → PUT R2 → register EF-08 → EF-09 JSON**
  `{diagnostic_id, document_id, kind:'bhe', periodo_anio}`; `periodo_anio` obligatorio y validado en
  UI; sólo `.xlsx` OOXML, ≤ 10 MB, firma ZIP; estados subiendo/importando; respuesta con
  `periodo_anio`/`destino_id`/`filas_ok`/`filas_rechazadas` 1-based saneadas/`advertencias`; recarga el
  balance. La importación no valida R3.
- **Roles/estados:** captura/validación coord/equipo; empresa/observador sólo lectura (celdas y
  acciones deshabilitadas); post-R3 todo lectura. Estados carga, vacío, error, 403/RLS, offline (sin
  prometer captura offline; Dexie/F2) y configuración incompleta.
- **Versionado:** la UI lee/edita la fila vigente `max(version)` (`order by version desc limit 1`);
  histórico fuera de F1; `validado_r3_logbook_id` se muestra como referencia de solo lectura.
- **A11y:** fieldsets/legends, labels y `aria-label` en celdas, `aria-invalid` donde aplica,
  `aria-live` para guardado/importación, tablas con `caption`/`scope`, foco en errores y nomenclatura
  SDFI/SRHDS/UCI.

## 2. Contrato y coordinación

- **ADR-014** (`2f61507`, integrado en `main@3af51ae`), D1–D18: autoridad de brecha en RPC/trigger,
  `v_bhe_monthly_capture`/`v_bhe_capture_summary` (12 filas, `tiene_captura`/`flujos_count`,
  `meses_con_captura`/`captura_completa`/`tiene_datos`), `brecha_anual_pct` ponderada, precedencia
  422 `VALIDATION_BHE_INCOMPLETO` → 409 `GATE_BHE_BRECHA`, post-R3 inmutable, EF-09 sólo XLSX con
  `periodo_anio` obligatorio y `fn_import_bhe` con `p_periodo_anio`.
- **`dev-edge-functions` (F1-09b, PR #68 draft, head `ac69e5e`):** ruta final EF-05
  `POST /functions/v1/ef-05-balances/balances/{id}/validate-r3` (la UI ya apunta ahí), body
  `{r3_logbook_id}`, respuesta/errores confirmados; EF-09 BHE JSON con `periodo_anio` obligatorio y
  respuesta con `periodo_anio`; `bhe_validated` best-effort (la UI recarga tras OK, no depende de
  Realtime).
- **`arquitecto-bd` (F1-09c):** vistas/guards/RPC pendientes de merge; la UI consume las vistas de
  captura cuando existan y, mientras tanto, el E2E las mockea. Sin `supabase/**`/`docs/**` en este PR.

## 3. Archivos

- `app/src/features/bhe/types.ts` — estados/grupos/meses, catálogo/flujo/balance/vistas, helpers de
  formato y `sanitizeText`; sin cálculo de brecha.
- `app/src/features/bhe/api.ts` — lecturas PostgREST (diagnóstico, catálogo, balance vigente, flows,
  vistas capture/validadas), alta, upsert de flujos, EF-05 y flujo EF-08→EF-09.
- `app/src/features/bhe/hooks.ts` — carga de listado y contexto con estados/reintento.
- `app/src/routes/bhe/BheListPage.tsx` — selector de diagnósticos y estado/brecha.
- `app/src/routes/bhe/BheDetailPage.tsx` — gate F5, resumen, alta, captura, validación R3 e import.
- `app/src/router.tsx` — rutas `/bhe` y `/bhe/:diagnosticId`; M6 fuera de placeholders.
- `tests/e2e/bhe.spec.ts` — 9 casos UI-level.
- Este reporte.

## 4. E2E (UI-level)

`tests/e2e/bhe.spec.ts` — Supabase ficticio con PostgREST (diagnóstico, catálogo, balance/flows,
`v_bhe_monthly_capture`/`v_bhe_capture_summary`, vistas validadas), EF-08, EF-09 BHE y EF-05
mockeados (preflight CORS, R2 sintético):

| # | Caso | Resultado |
|---|---|---|
| 1 | detalle: resumen (12/12, 8.2 %, semáforo), totales 12 meses y 6 grupos | OK |
| 2 | alta: sólo `diagnostic_id/periodo_anio/mes_inicio`, sin estado/version/org | OK |
| 3 | captura: guardar celda flujo×mes y recargar estado `en_captura` | OK |
| 4 | validar R3: EF-05 con `r3_logbook_id`, `validado_r3` y gate desbloqueado | OK |
| 5 | brecha >10 %: 409 canónico + `details.meses` y balance editable | OK |
| 6 | captura incompleta: aviso 8/12 + 422 `VALIDATION_BHE_INCOMPLETO` sin validar | OK |
| 7 | import BHE: EF-08→EF-09 JSON (`periodo_anio`/`document_id`) y rechazos saneados | OK |
| 8 | observador: solo lectura (sin validar/importar y celdas deshabilitadas) | OK |
| 9 | vacío y offline (sin prometer persistencia) | OK |

**No cubierto por este E2E:** vistas/guards/RPC reales (pgTAP F1-09c), EF-05/EF-09 reales (Deno
F1-09b), plantilla XLSX real y E2E real local (requiere F1-09c/F1-09b en `main`). El job local del CI
sólo ejecuta `empresas.local.spec.ts`; M6 real se documenta como **no aplicable** en esta entrega.

## 5. Evidencia (local, Chrome)

```
npm run lint       → eslint src ..................................... EXIT 0
npm run typecheck  → tsc --noEmit && tsc -p tsconfig.sw.json --noEmit  EXIT 0
npm run build      → … vite build ................................... EXIT 0
                     PWA v2.0.0 · injectManifest · precache 11 entries (690.95 KiB)
npm run test:e2e   → 59 passed + 6 skipped (11 shell + 14 M1 + 2 guard + 7 M3 + 8 M4 + 8 M5 + 9 M6) EXIT 0
```

## 6. Pendientes / coordinación

1. **F1-09c (task-142):** crear `v_bhe_monthly_capture`/`v_bhe_capture_summary`, guards/RPC y ACL;
   la UI ya consume el contrato y el E2E las mockea. Al mergear, validar el flujo real si el job local
   se amplía a M6.
2. **F1-09b (PR #68 draft):** EF-05/EF-09-bhe; la ruta EF-05 ya es la final (`ef-05-balances/...`).
   Cualquier delta de contrato se ajusta en `features/bhe/api.ts`.
3. **Spec/seguridad/QA** sobre el PR (CI 7/7): sin `supabase/**`/`docs/**`, sin datos reales; la UI no
   calcula brecha ni actualiza estado/ficha/version; folio/claves server-side; XLSX validado por EF-09.
4. **Diferido documentado:** adjuntos/evidencia por flujo, captura offline (Dexie/F2), histórico de
   versiones (fuera de F1) y E2E real local (requiere F1-09b/c).

*Reporte de `dev-frontend-pwa` para F1-09a (task-144).*
