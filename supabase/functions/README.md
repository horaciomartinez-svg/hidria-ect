# Edge Functions Ã¢â‚¬â€ Supabase (Deno)

Contratos: `docs/04-Contratos-API-y-Tablas-de-Decision-HIDRIA-MD-OHI.md`
(EF-01Ã¢â‚¬Â¦EF-13).

## ConvenciÃƒÂ³n

```
supabase/functions/
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ _shared/                      # auth, errors, db, guards, r2, cors, presign, realtimeÃ¢â‚¬Â¦
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ ef-01-advance-phase/          # EF-01 (F1-04; RPC fn_advance_phase en task-94)
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ index.ts
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ ef-08-documents/              # EF-08 (presign; register en F1-05)
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ index.ts
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ ef-12-reprogram-milestone/    # EF-12 (F1-04; RPC fn_reprogram_milestone en task-94)
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ index.ts
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ Ã¢â‚¬Â¦ (una carpeta por EF)
Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ _shared/tests/                # pruebas unitarias Deno
```

Reglas obligatorias (detalle en
`hidria_coding_team/agents/03_dev_edge_functions.md`):

1. `Idempotency-Key` **opcional** en `docs/04` Ã‚Â§2.3; **obligatorio** en las
   operaciones que vienen de la cola offline (siempre lo envÃƒÂ­an). Mismo
   payload Ã¢â€ â€™ mismo cuerpo; distinto Ã¢â€ â€™ 409.
2. Folios **solo** server-side (`MDOHI-AAAA-NNN`, `-R1`, ARCO).
3. `audit_log` con hash encadenado en la **misma transacciÃƒÂ³n**.
4. Errores canÃƒÂ³nicos de `docs/04` Ã‚Â§8; sin stack traces.
5. `service_role` solo como secreto de la EF; nunca en respuestas ni logs.
6. Gates EF-01Ã¢â‚¬Â¦EF-07, EF-10, EF-12: sin conexiÃƒÂ³n no se validan (el
   cliente deshabilita).

## EF implementadas

### EF-01 Ã¢â‚¬â€ `ef-01-advance-phase` (ADR-013 / task-95)

- Ruta: `POST /functions/v1/ef-01-advance-phase` (contrato
  `/diagnostics/{id}/advance-phase`).
- **Roles** `coordinador|equipo` **con membresÃƒÂ­a** (sin bypass admin); tenant
  fail-closed; `estado='activo'`; `to_phase = fase_actual + 1`; desde fase 6
  Ã¢â€ â€™ `409 CONFLICT_PHASE` (TD-1 fila 6 es EF-07).
- **Gates TD-1 replicados** (filas 1Ã¢â‚¬â€œ5) + **ficha de respaldo cerrada**
  (BIT-R1/R2/V1/R3/R4); `p_gate` lo calcula solo la EF; el trigger
  `diagnostics_phase_gate` es la **autoridad final** (`P0001` Ã¢â€ â€™
  `GATE_*`).
- `proximo_hito` (mapa 2Ã¢â€ â€™R2, 3Ã¢â€ â€™V1, 4Ã¢â€ â€™R3, 5Ã¢â€ â€™R4,
  6Ã¢â€ â€™R5); solo se aÃƒÂ±ade fecha si hay fecha canÃƒÂ³nica.
- Efectos post-commit (best-effort): notificaciÃƒÂ³n `hito` a miembros y
  broadcast `phase_changed` (`diagnostic:{id}`) + `kanban_refresh` (`org:{id}`).
- Persistencia: **RPC transaccional** `fn_advance_phase` (task-94,
  `service_role`-only): UPDATE + `audit_log` + idempotencia atÃƒÂ³mica
  (`api_idempotency`) en una transacciÃƒÂ³n; captura `P0001` y devuelve
  `{ok:false, code, message}` (`GATE_*`/`GATE_FICHA`), no propaga excepciÃƒÂ³n;
  `p_gate` solo se usa para auditorÃƒÂ­a/respuesta (la RPC deriva la ficha del
  mapa DB y su folio real). LÃƒÂ³gica en `_shared/advance_phase.ts`
  - `_shared/guards.ts` + `_shared/db.ts`.

### EF-12 Ã¢â‚¬â€ `ef-12-reprogram-milestone` (ADR-013 / task-95)

- Ruta: `POST /functions/v1/ef-12-reprogram-milestone` (contrato
  `/diagnostics/{id}/reprogram-milestone`).
- Rol **`coordinador`**; valida hito V1Ã¢â‚¬â€œV3/R1Ã¢â‚¬â€œR5, fechas ISO,
  `justificacion` Ã¢â€°Â¥ 20, `causa Ã¢Ë†Ë† {empresa,equipo,externa}`,
  `fecha_nueva` dentro de las 6 semanas desde `fecha_inicio` y
  `Ã¢â€°Â¥ fecha_original`; ficha mÃƒÂ¡s reciente del hito o
  `422 VALIDATION_HITO_SIN_FICHA`.
- SemÃƒÂ¡foro **por hito** (historial `milestone_reprogramming`, task-94):
  1.Ã‚Âª reprogramaciÃƒÂ³n con `causa='empresa'` Ã¢â€¡â€™ `amarillo`; `Ã¢â€°Â¥2`
  del mismo hito Ã¢â€¡â€™ `rojo`; Ã‚Â«vencido sin cerrarÃ‚Â» queda fuera (tarea
  aparte). `fecha_original` es **progresiva**: primera declarada; siguientes =
  ÃƒÂºltima `fecha_nueva` del mismo hito (`422 VALIDATION_REPROGRAMACION` si
  no). La respuesta incluye `entry_id`/`folio_ficha`/`reprogramaciones`
  (contrato `docs/04` #46).
- Persistencia: RPC `fn_reprogram_milestone` (`service_role`-only) que inserta
  hallazgo en la ficha, actualiza `proximo_hito`/`semaforo_atraso`/
  `reprogramacion_justificacion` y audita en una transacciÃƒÂ³n. Post-commit:
  `kanban_refresh`.

### EF-08 Ã¢â‚¬â€ `ef-08-documents` (ADR-012 / task-39)

- Rutas: `POST /functions/v1/ef-08-documents/presign` (alias del contrato
  `/documents/presign`) y `Ã¢â‚¬Â¦/register`.
- **`presign`**: exige `diagnostic_id` y membresÃƒÂ­a de diagnÃƒÂ³stico
  (`coordinador|equipo|empresa`, espejo de la RLS `documents_ins`) **antes de
  firmar**; tenant fail-closed; TTL **300 s**; `Content-Type` firmado; respuesta
  mÃƒÂ­nima `{ upload_url, document_id, expira_en_seg, metodo }` (sin `r2_key`,
  bucket ni credenciales); `Idempotency-Key` opcional (document_id
  determinista).
- **`register`**: diferido a **F1-05** (task-86: RPC atÃƒÂ³mica `documents` +
  `audit_log`); mientras tanto responde `501 NOT_IMPLEMENTED_PHASE` sin efectos.
- LÃƒÂ³gica en `_shared/presign.ts`, `_shared/r2.ts` (SigV4 con WebCrypto),
  `_shared/cors.ts`; `index.ts` solo conecta runtime
  (`_shared/documents_runtime.ts`).

## Variables de entorno de las EF

Se configuran con `supabase secrets set` (nunca en el repo). Comunes a
EF-01/EF-08/EF-12:

| Variable                                     | Uso                                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------------------- |
| `SUPABASE_JWT_SECRET`                        | VerificaciÃƒÂ³n HS256 del JWT (EF-01/EF-12 ademÃƒÂ¡s exigen `nbf` numÃƒÂ©rico)      |
| `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_URL` | PostgREST/RPC internos (`fn_diag_role`, `diagnostics`, RPC) Ã¢â‚¬â€ autoinyectadas |
| `CORS_ALLOWED_ORIGINS`                       | Lista separada por comas (Pages del PWA + `http://localhost:5173`)                  |
| `R2_ACCOUNT_ID`                              | Endpoint `https://{account}.r2.cloudflarestorage.com` (solo EF-08)                  |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`  | Firma SigV4 (nunca se devuelven al cliente; solo EF-08)                             |
| `R2_BUCKET_DOCS`                             | Bucket de documentos (default `hidria-docs`; solo EF-08)                            |

EF-01/EF-12 emiten el broadcast de Realtime con `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` (endpoint `/realtime/v1/api/broadcast`).

Otros secretos futuros: `R2_BUCKET_REPORTS`, `PSC_*`, `NOM152_ENABLED`.

## Pruebas

El job `Edge Functions (Deno)` del CI (#38/task-87) ejecuta
`deno fmt --check
supabase/functions --ignore=supabase/functions/README.md`,
`deno lint`, `deno check supabase/functions/_shared` + cada
`supabase/functions/*/index.ts`, y `deno test supabase/functions/_shared` (152
pruebas: 101 previas + 50 de F1-04). Sin red, sin permisos: cliente DB/RPC y
broadcast se inyectan en las pruebas.
