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
  idempotencia atómica; responde `{diagnostic_id, folio, fase_actual,
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
- **`presign`**: exige `diagnostic_id` y membresía (`coordinador|equipo|empresa`,
  espejo de `documents_ins`) antes de firmar; tenant fail-closed; TTL 300 s;
  `Content-Type` firmado; respuesta mínima `{upload_url, document_id,
  expira_en_seg, metodo}` (sin `r2_key`, bucket ni credenciales);
  `Idempotency-Key` opcional (document_id determinista).
- **`register`** (F1-05): roles `coordinador|equipo|empresa`; body
  `{diagnostic_id, document_id, filename, doc_type, mime, size_bytes,
  exposure_level, sha256}` (sin `r2_key`); verifica el objeto con **HEAD a R2**
  usando credenciales de la EF (existencia/tamaño/MIME; fallo ⇒ `422
  VALIDATION_FILE`) y registra con la RPC atómica `fn_register_document`
  (INSERT `documents` + `audit_log` + `api_idempotency`, `r2_key` server-side).
  Respuesta `{document_id, sha256}`; `title = filename` sin extensión.
  Errores: 401, 403 (`FORBIDDEN_NOT_MEMBER`/`FORBIDDEN_ROLE`), 422
  `VALIDATION_FILE`/`VALIDATION_PARAMETRO_REQUERIDO`, 409 `CONFLICT_STATE`
  (replay distinto/duplicado), 500 saneado.
- Lógica en `_shared/presign.ts` (+ `_shared/r2.ts` SigV4 presign/HEAD),
  `_shared/cors.ts`; `index.ts` solo conecta runtime
  (`_shared/documents_runtime.ts`).

## Variables de entorno de las EF

Se configuran con `supabase secrets set` (nunca en el repo). Comunes a
EF-01/EF-08/EF-12:

| Variable                                     | Uso                                                                        |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| `SUPABASE_JWT_SECRET`                        | Verificación HS256 del JWT (EF-01/EF-12 además exigen `nbf` numérico)      |
| `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_URL` | PostgREST/RPC internos (`fn_diag_role`, `diagnostics`, RPC) — autoinyectadas |
| `CORS_ALLOWED_ORIGINS`                       | Lista separada por comas (Pages del PWA + `http://localhost:5173`)         |
| `R2_ACCOUNT_ID`                              | Endpoint `https://{account}.r2.cloudflarestorage.com` (solo EF-08)         |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`  | Firma SigV4 y HEAD (nunca al cliente; solo EF-08)                          |
| `R2_BUCKET_DOCS`                             | Bucket de documentos (default `hidria-docs`; solo EF-08)                   |

Otros secretos futuros: `R2_BUCKET_REPORTS`, `PSC_*`, `NOM151_ENABLED`.

## Pruebas

El job `Edge Functions (Deno)` del CI (#38) ejecuta `deno fmt --check
supabase/functions --ignore=supabase/functions/README.md`, `deno lint`,
`deno check supabase/functions/_shared` + cada `supabase/functions/*/index.ts`,
y `deno test supabase/functions/_shared` (**166 pruebas**: 101 base +
50 F1-04 + 15 F1-05). Sin red ni permisos: DB/RPC, HEAD de R2 y broadcast se
inyectan en las pruebas.
