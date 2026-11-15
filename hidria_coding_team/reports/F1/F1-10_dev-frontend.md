# F1-10a — UI M8 IVOH (dev-frontend-pwa)

| Campo | Valor |
|---|---|
| **Tarea** | `task-159` — F1-10a (UI M8, IVOH + EF-06) |
| **Agente** | `dev-frontend-pwa` (04) |
| **Rama** | `feature/F1-10a-ivoh-ui` |
| **Base** | `main` = `079ed95` (ADR-015 integrado; squash de #71) |
| **Alcance** | `/ivoh` + `/ivoh/:diagnosticId`: captura 6 factores, autosave parcial EF-06, total/semáforo/serie solo lectura, validar R4, gate F6, radial SVG, a11y/offline, E2E UI-level |
| **Conclusión** | **VERDE local** — `lint` 0 · `typecheck` 0 · `build` 0 · E2E **67 passed + 6 skipped** (8 casos M8); CI 7/7 en el PR |

---

## 1. Resumen

- **Rutas M8:** `/ivoh` (selector de diagnósticos visibles por RLS, con fase, versión de índice e
  IVOH oficial) y `/ivoh/:diagnosticId` (captura/detalle). M8 sale de placeholders.
- **Captura de 6 factores F1–F6:** nombre y peso desde `ivoh_factors` de la versión vigente
  (`diagnostics.index_version_id`), rúbrica/etiqueta desde `ivoh_rubrics`, puntaje 0–10 en pasos de
  0.5, justificación obligatoria y evidencia `[{tipo,ref,descripcion?}]` con allowlist
  `documento|activo|indicador|ficha` y ≥1 por factor.
- **Autosave parcial 1–6 vía EF-06 `score`**: al completar puntaje/justificación/evidencia de un factor
  se guarda el subconjunto; “Guardar factor” da feedback/errores accesibles. La respuesta de `score` no
  publica total; la UI recarga el borrador y no calcula.
- **Total/semáforo/serie/radial solo lectura:** el borrador se lee de `v_ivoh_capture`
  (`factores_guardados`, `completo`, `total`/`ivoh`, `semaforo`, `semaforo_label`, `por_factor`,
  `serie_factores`); post-R4 se lee `v_ivoh_score`. La UI **no calcula** el IVOH ni el semáforo; los
  labels salen de la vista/catálogo `ivoh_semaforo` (con descripción accesible).
- **Radial de 6 ejes:** SVG propio (sin dependencias nuevas) con `serie_factores`/`por_factor` de
  `v_ivoh_score`; se habilita al validar R4; `role="img"` con `title`/`desc` y resumen textual.
- **Validar R4 (EF-06):** sólo coord/equipo, con `r4_logbook_id` (UUID de ficha BIT-R4 cerrada);
  `POST /functions/v1/ef-06-ivoh/ivoh/{diagnostic_id}/validate-r4` con `Idempotency-Key`. Muestra
  `GATE_BHE_R3`, `VALIDATION_IVOH_INCOMPLETO`, `CONFLICT_IVOH_VERSION`, `GATE_R4_FICHA`,
  `CONFLICT_STATE` y 403 con alertas accesibles; éxito muestra total/semáforo/label, radial, estado
  validado y gate F6 cumplido. Post-R4 todo read-only.
- **Gate F6 visible:** se muestra con `diagnostics.fase_actual` e `ivoh_actual`; bloqueado hasta R4 con
  los 6 factores de la versión vigente (autoridad final `check_phase_gate`/EF-01).
- **Versión:** sólo la vigente (`diagnostics.index_version_id`); histórico fuera de F1-10; si EF-06
  responde `CONFLICT_IVOH_VERSION` se muestra el error y no se mezclan versiones.
- **Roles/estados:** captura/validación coord/equipo; empresa/observador sólo lectura; carga, vacío,
  error, 403/RLS, offline (sin prometer captura offline; Dexie/F2) y configuración incompleta.
- **A11y:** `fieldset`/`legend` por factor, labels, `aria-label` en evidencia, `aria-invalid`,
  `aria-live` de guardado/validación, radial con `role="img"`/`title`/`desc`, foco y nomenclatura
  SDFI/SRHDS/UCI.
- **OBS de seguridad #74 (aplicadas):** mensajes de error/`notice`/label y `razon` se muestran con
  `sanitizeText` (sin control chars, longitud acotada, HTML escapado por React); justificación,
  `ref` y `descripcion` de evidencia se sanean antes del payload EF-06; las vistas se consultan con
  **columnas explícitas** (sin `select('*')`); `validated`/`complete`/`factorsStored` son pistas de
  presentación y la autoridad sigue siendo EF-06/RLS/RPC.

## 2. Contrato y coordinación

- **ADR-015** (`cfe7147`, integrado en `main@079ed95`): D1–D16 — fórmula/semáforo server-side, catálogo
  `ivoh_semaforo`, PK versionada `(diagnostic_id,version_id,factor_code)`, RLS sin escritura
  autenticada, RPC `fn_save_ivoh_score` (parcial 1–6) / `fn_validate_ivoh_r4` (6/6), EF-06, gate F6,
  `v_ivoh_capture` de borrador, `v_ivoh_score` post-R4 con label/por_factor/serie.
- **`dev-edge-functions` (F1-10b):** ruta final
  `POST /functions/v1/ef-06-ivoh/ivoh/{diagnostic_id}/score|validate-r4`; `score` parcial con
  respuesta `{diagnostic_id,version_id,estado:'borrador',factores_guardados,total:null,semaforo:null}`;
  `validate-r4` 6/6 con `total/semaforo/semaforo_label/por_factor`; evidencia allowlist; idempotencia;
  `ivoh_validated` best-effort (la UI recarga tras OK). Sin `supabase/**`/`docs/**` en este PR.
- **`arquitecto-bd` (F1-10c):** RLS sin escritura autenticada, PK versionada, `v_ivoh_capture` y
  guard de inmutabilidad post-R4; la UI/E2E los mockean hasta su merge.

## 3. Archivos

- `app/src/features/ivoh/types.ts` — factores/evidencia/rúbricas/semáforo, validaciones, formato y
  helpers de serie; sin cálculo de IVOH.
- `app/src/features/ivoh/api.ts` — lecturas (diagnóstico/versión/factores/rúbricas/semáforo/
  evaluaciones/vistas), EF-06 `score`/`validate-r4` y mapeo de errores.
- `app/src/features/ivoh/hooks.ts` — listado y contexto con estados/reintento.
- `app/src/routes/ivoh/IvohListPage.tsx` — selector de diagnósticos.
- `app/src/routes/ivoh/IvohDetailPage.tsx` — gate F6, resumen, radial, captura/autosave y validación R4.
- `app/src/router.tsx` — rutas `/ivoh` y `/ivoh/:diagnosticId`; M8 fuera de placeholders.
- `tests/e2e/ivoh.spec.ts` — 8 casos UI-level.
- Este reporte.

## 4. E2E (UI-level)

`tests/e2e/ivoh.spec.ts` — Supabase ficticio con PostgREST (diagnóstico, versión, factores, rúbricas,
semáforo, evaluaciones, `v_ivoh_capture`/`v_ivoh_score`) y EF-06 `score`/`validate-r4` mockeados:

| # | Caso | Resultado |
|---|---|---|
| 1 | detalle: 6 factores con pesos/rúbricas y total de borrador solo lectura | OK |
| 2 | autosave parcial por factor vía EF-06 `score` (sin cálculo cliente) | OK |
| 3 | evidencia obligatoria: sin evidencia no llama EF-06 | OK |
| 4 | validar R4: `r4_logbook_id`, total/semáforo oficiales y radial | OK |
| 5 | R4 bloqueado sin BHE R3 (409 accesible, sin cambio de estado) | OK |
| 6 | `CONFLICT_IVOH_VERSION` al guardar factor (error visible) | OK |
| 7 | observador: solo lectura (sin validar y factores deshabilitados) | OK |
| 8 | vacío y offline (sin prometer persistencia) | OK |

**No cubierto por este E2E:** RLS/RPC/vistas reales (pgTAP F1-10c), EF-06 real (Deno F1-10b), fronteras
de semáforo y fórmula (pgTAP). El job local del CI sólo ejecuta `empresas.local.spec.ts`; M8 real se
documenta como **no aplicable** en esta entrega.

## 5. Evidencia (local, Chrome)

```
npm run lint       → eslint src ..................................... EXIT 0
npm run typecheck  → tsc --noEmit && tsc -p tsconfig.sw.json --noEmit  EXIT 0
npm run build      → … vite build ................................... EXIT 0
                     PWA v2.0.0 · injectManifest · precache 11 entries (719.67 KiB)
npm run test:e2e   → 67 passed + 6 skipped (11 shell + 14 M1 + 2 guard + 7 M3 + 8 M4 + 8 M5 + 9 M6 + 8 M8) EXIT 0
```

## 6. Pendientes / coordinación

1. **F1-10b (EF-06):** PR/head pendiente; la UI ya apunta a la ruta final y maneja el contrato ADR.
2. **F1-10c (DB/RLS/RPC/vistas):** `v_ivoh_capture`/`v_ivoh_score`, PK versionada, guards y catálogo;
   el E2E las mockea. Al mergear, validar el flujo real si el job local se amplía a M8.
3. **Spec/seguridad/QA** sobre el PR (CI 7/7): sin `supabase/**`/`docs/**`, sin datos reales; la UI no
   calcula IVOH/semáforo ni actualiza `ivoh_evaluations`/`diagnostics.ivoh_actual`.
4. **Diferido documentado:** histórico de versiones (fuera de F1-10), captura offline (Dexie/F2),
   adjuntos/evidencia con archivo (sólo refs en F1) y E2E real local (requiere F1-10b/c).

*Reporte de `dev-frontend-pwa` para F1-10a (task-159).*
