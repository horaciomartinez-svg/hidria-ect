# Edge Functions — Supabase (Deno)

Contratos: `docs/04-Contratos-API-y-Tablas-de-Decision-HIDRIA-MD-OHI.md`
(EF-01…EF-13).

## Convención

```
supabase/functions/
├── _shared/                      # auth, db, guards, r2, cors, presign, register, realtime…
├── ef-01-advance-phase/          # EF-01 (F1-04; RPC fn_advance_phase)
│   └── index.ts
├── ef-08-documents/              # EF-08 (presign + register; F1-05)
│   └── index.ts
├── ef-12-reprogram-milestone/    # EF-12 (F1-04; RPC fn_reprogram_milestone)
│   └── index.ts
├── … (una carpeta por EF)
└── _shared/tests/                # pruebas unitarias Deno
```

Reglas obligatorias (detalle en
`hidria_coding_team/agents/03_dev_edge_functions.md`):

1. `Idempotency-Key` **opcional** en `docs/04` §2.3; **obligatorio** en las
   operaciones que vienen de la cola offline. Mismo payload → mismo cuerpo;
   distinto → 409.
2. Folios **solo** server-side (`MDOHI-AAAA-NNN`, `-R1`, ARCO).
3. `audit_log` con hash encadenado en la **misma transacción**.
4. Errores canónicos de `docs/04` §8; sin stack traces ni rutas internas.
5. `service_role` y `R2_*` solo como secretos de la EF; nunca en respuestas,
   logs ni en el cliente.
6. Gates EF-01…EF-07, EF-10, EF-12: sin conexión no se validan.

## EF implementadas

### EF-01 — `ef-01-advance-phase` (ADR-014 / task-95)

- Ruta: `POST /functions/v1/ef-01-advance-phase` (contrato
  `/diagnostics/{id}/advance-phase`).
- Roles `coordinador|equipo` con membresía (sin bypass admin); tenant
  fail-closed; `estado='activo'`; `to_phase = fase_actual + 1`; desde fase 6 →
  `409 CONFLICT_PHASE` (TD-1 fila 6 es EF-07).
- Gates TD-1 replicados (filas 1–5) + ficha de respaldo; `p_gate` calculado solo
  por la EF; el trigger `diagnostics_phase_gate` es la autoridad final.
- Persistencia: RPC `fn_advance_phase` (`service_role`): UPDATE + `audit_log` +
  idempotencia atómica; responde
  `{diagnostic_id, folio, fase_actual,
  proximo_hito, avance_pct, gate}`.
- `proximo_hito` (2→R2, 3→V1, 4→R3, 5→R4, 6→R5); post-commit: notificación
  `hito` + `phase_changed`/`kanban_refresh`.

### EF-12 — `ef-12-reprogram-milestone` (ADR-014 / task-95)

- Rol `coordinador`; valida hito V1–V3/R1–R5, fechas ISO, `justificacion ≥ 20`,
  causa, ventana de 6 semanas, `fecha_original` progresiva y ficha más reciente
  cerrada (`422 VALIDATION_HITO_SIN_FICHA`).
- Persistencia: RPC `fn_reprogram_milestone` (INSERT `milestone_reprogramming` +
  hallazgo + semáforo por hito + audit en una tx); respuesta
  `{hito, fecha_nueva, semaforo_atraso, entry_id, folio_ficha, reprogramaciones}`.
  Post-commit: `kanban_refresh`.

### EF-08 — `ef-08-documents` (ADR-012 / task-39 + F1-05/task-106)

- Rutas: `POST /functions/v1/ef-08-documents/presign` (alias
  `/documents/presign`) y `…/register`.
- **`presign`**: exige `diagnostic_id` y membresía
  (`coordinador|equipo|empresa`, espejo de `documents_ins`) antes de firmar;
  tenant fail-closed; TTL 300 s; `Content-Type` firmado; respuesta mínima
  `{upload_url, document_id,
  expira_en_seg, metodo}` (sin `r2_key`, bucket ni
  credenciales); `Idempotency-Key` opcional (document_id determinista).
- **`register`** (F1-05): roles `coordinador|equipo|empresa`; body
  `{diagnostic_id, document_id, filename, doc_type, mime, size_bytes,
  exposure_level, sha256}`
  (sin `r2_key`); verifica el objeto con **HEAD a R2** usando credenciales de la
  EF (existencia/tamaño/MIME; fallo ⇒ `422
  VALIDATION_FILE`) y registra con la
  RPC atómica `fn_register_document` (INSERT `documents` + `audit_log` +
  `api_idempotency`, `r2_key` server-side). Respuesta `{document_id, sha256}`;
  `title = filename` sin extensión. Errores: 401, 403
  (`FORBIDDEN_NOT_MEMBER`/`FORBIDDEN_ROLE`), 422
  `VALIDATION_FILE`/`VALIDATION_PARAMETRO_REQUERIDO`, 409 `CONFLICT_STATE`
  (replay distinto/duplicado), 500 saneado.
- Lógica en `_shared/presign.ts` (+ `_shared/r2.ts` SigV4 presign/HEAD),
  `_shared/cors.ts`; `index.ts` solo conecta runtime
  (`_shared/documents_runtime.ts`).

### EF-03 — `ef-03-checklist` (task-114 / F1-06b)

- Ruta canónica: `POST /functions/v1/ef-03-checklist/{item_id}/transition`
  (acepta también el contrato `/checklist/{item_id}/transition` y el alias
  legacy `/ef-03-checklist/checklist/{item_id}/transition`).
- Auth/claims (`verifyProfile`, `nbf`, `p_user_id` del JWT); ítem → diagnóstico
  → tenant/membresía; roles `coordinador|equipo|empresa` (observador/invitado
  403).
- Transiciones **TD-2**: `no_recibido→recibido` (empresa con `document_id`;
  coord/equipo con `solicitud_nota`), `recibido→revisado` (coord/equipo),
  `revisado→validado_r1` (solo coordinador, `document_id` obligatorio);
  `validado_r1` es terminal. Documento validado contra diagnóstico/tenant.
- Persistencia: RPC `fn_transition_checklist_item` (`service_role`) con UPDATE +
  `audit_log` (approve/update) + `api_idempotency`; respuesta
  `{item_id, item_code, estado, document_id}`. Post-commit: notificación
  `validacion` a empresa (si aplica) y `checklist_updated`/`kanban_refresh`.
- Errores: 401, 403 `FORBIDDEN_NOT_MEMBER`/`FORBIDDEN_ROLE` (ítem inexistente y
  otro tenant comparten 403 anti-enumeración), 409 `CONFLICT_STATE`
  (TD-2/terminal), 422
  `VALIDATION_PARAMETRO_REQUERIDO`/`VALIDATION_IDEMPOTENCY_KEY`, 500 saneado.

### EF-04 — `ef-04-cat` (task-126 / F1-07b)

- Rutas: `POST /functions/v1/ef-04-cat/cat/{diagnostic_id}/submit` y
  `…/validate-r2` (contrato `/cat/{diagnostic_id}/submit|validate-r2`).
- **submit** (empresa/coordinador/equipo): valida el banco **A1-v1**
  (`cat_items`, 47): toda pregunta aplicable con `valor`/`no_se`/`na`;
  `admite_evidencia` resuelta en campo exige `document_id`;
  `cat_estado='en_captura'` → `en_revision`; incompleto ⇒
  `422 VALIDATION_CAT_INCOMPLETO` con `{faltantes, pendientes}`.
- **validate-r2** (coordinador/equipo): `cat_estado='en_revision'` + ficha
  `BIT-R2-*` **cerrada** (`409 GATE_R2_FICHA`); → `validado_r2`; post-commit:
  notificación `validacion` a empresa + `cat_validated`/`kanban_refresh`.
- Persistencia: RPC `fn_submit_cat`/`fn_validate_cat_r2` (F1-07c,
  `service_role`) con `audit_log` + `api_idempotency`; `Idempotency-Key`
  opcional.
- Errores: 401 · 403 `FORBIDDEN_NOT_MEMBER`/`FORBIDDEN_ROLE` · 409
  `CONFLICT_STATE`/`GATE_R2_FICHA` · 422 `VALIDATION_CAT_INCOMPLETO`/
  `VALIDATION_PARAMETRO_REQUERIDO`/`VALIDATION_IDEMPOTENCY_KEY` · 500 saneado.

### EF-09 — `ef-09-import` (task-135 / F1-08b)

- Ruta: `POST /functions/v1/ef-09-import/import/xlsx` (contrato `/import/xlsx`).
- Body **JSON**: `{diagnostic_id, document_id, kind:'iih', periodo_anio?}`; el
  `document_id` es el de EF-08 `register` y la EF **descarga el XLSX de R2** con
  credenciales server-side (nunca expone bucket/rutas). Roles
  `coordinador|equipo`; tenant/membresía (403 anti-enumeración).
- **Parser XLSX propio** (ZIP+deflate nativo, sin dependencias): hojas
  `1. Captación`…`6. Evacuación`, encabezados fila 7, datos desde fila 8,
  columna B = código `iih_asset_types`; límites 10 MB / 500 filas, anti zip-bomb
  y **rechazo de fórmulas/macros**. Estructura inválida ⇒
  `422 VALIDATION_XLSX_ESTRUCTURA` con diff; errores por fila `{fila, razon}`
  (1-based).
- Tx: RPC `fn_import_iih_assets` (`service_role`, F1-08c) con INSERT
  `iih_assets` (folio server-side; `verificado_v1=false`) +
  `audit_log(action='create')` + `api_idempotency`; `prioridad` se recalcula
  server-side. Respuesta
  `{kind:'iih', destino_id, filas_ok, filas_rechazadas, advertencias}`.

### EF-09 `kind='bhe'` (task-143 / F1-09)

- Mismo endpoint `POST /functions/v1/ef-09-import/import/xlsx`, body
  `{diagnostic_id, document_id, kind:'bhe', periodo_anio}` (año **obligatorio**
  2000–2100; solo XLSX OOXML). Reutiliza descarga R2/checksum/cap de F1-08.
- Plantilla BHE: hojas `1. Entradas` (fila 6), `2. Destinos del agua` (fila 6) y
  `3. Reúso y calidad` Parte A (fila 7); meses C–N; mapeo a
  `balance_flow_catalog` (`ENT-*` con Pozos 1/2 sumados en `ENT-02`, `DST-*`,
  `CIR-*`); totales O/P y hoja 4 se ignoran/recalculan; fórmula en C–N ⇒ rechazo
  (`VALIDATION_XLSX_ESTRUCTURA`/`VALIDATION_BHE_FORMULA`). Parte B calidad fuera
  de F1-09; fila «Otros destinos» no se importa (advertencia).
- RPC `fn_import_bhe` (`service_role`, F1-09c) con `p_periodo_anio`, upsert de
  `water_balances`+`balance_flows` solo en captura (nunca valida R3); respuesta
  `{kind:'bhe', destino_id, periodo_anio, filas_ok, filas_rechazadas, advertencias}`.

### EF-05 — `ef-05-balances` (task-143 / F1-09)

- Ruta: `POST /functions/v1/ef-05-balances/balances/{balance_id}/validate-r3`
  (contrato `/balances/{balance_id}/validate-r3`); body `{r3_logbook_id}`.
- Auth/claims (`verifyProfile`, `nbf`, `p_user_id` JWT), rol
  **coordinador|equipo**, tenant/membresía (403 anti-enumeración), ficha
  `BIT-R3` **cerrada** del mismo diagnóstico (`409 GATE_R3_FICHA`).
- RPC `fn_validate_bhe_r3` (`service_role`, F1-09c): brecha mensual >10 % ⇒
  `409 GATE_BHE_BRECHA` con mensaje canónico y `details.meses` 1-based; éxito ⇒
  `validado_r3`, `validado_r3_logbook_id`, `version+1`,
  `diagnostics.brecha_pct`, audit `approve`; respuesta
  `{balance_id, estado, brecha_anual_pct, brecha_max_mes_pct, meses_sobre_umbral}`.
- Post-commit: notificación a miembros y `bhe_validated` (best-effort);
  `Idempotency-Key` opcional (replay 200 sin efectos).

## Variables de entorno de las EF

Se configuran con `supabase secrets set` (nunca en el repo). Comunes a
EF-01/EF-08/EF-12:

| Variable                                     | Uso                                                                          |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| `SUPABASE_JWT_SECRET`                        | Verificación HS256 del JWT (EF-01/EF-12 además exigen `nbf` numérico)        |
| `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_URL` | PostgREST/RPC internos (`fn_diag_role`, `diagnostics`, RPC) — autoinyectadas |
| `CORS_ALLOWED_ORIGINS`                       | Lista separada por comas (Pages del PWA + `http://localhost:5173`)           |
| `R2_ACCOUNT_ID`                              | Endpoint `https://{account}.r2.cloudflarestorage.com` (solo EF-08)           |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`  | Firma SigV4 y HEAD (nunca al cliente; solo EF-08)                            |
| `R2_BUCKET_DOCS`                             | Bucket de documentos (default `hidria-docs`; solo EF-08)                     |

Otros secretos futuros: `R2_BUCKET_REPORTS`, `PSC_*`, `NOM151_ENABLED`.

## Pruebas

El job `Edge Functions (Deno)` del CI (#38) ejecuta
`deno fmt --check
supabase/functions --ignore=supabase/functions/README.md`,
`deno lint`, `deno check supabase/functions/_shared` + cada
`supabase/functions/*/index.ts`, y `deno test supabase/functions/_shared` (**223
pruebas**: 101 base + 50 F1-04 + 15 F1-05 + 16 F1-06b + 12 F1-07b + 17 F1-08b

- 7 F1-09 EF-05 + 5 F1-09 BHE). Sin red ni permisos: DB/RPC, R2 (HEAD/download)
  y broadcast se inyectan.
