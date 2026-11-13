# Edge Functions — Supabase (Deno)

Contratos: `docs/04-Contratos-API-y-Tablas-de-Decision-HIDRIA-MD-OHI.md`
(EF-01…EF-13).

## Convención

```
supabase/functions/
├── _shared/                      # auth, errors, db, guards, r2, cors, presign, realtime…
├── ef-01-advance-phase/          # EF-01 (F1-04; RPC fn_advance_phase en task-94)
│   └── index.ts
├── ef-08-documents/              # EF-08 (presign; register en F1-05)
│   └── index.ts
├── ef-12-reprogram-milestone/    # EF-12 (F1-04; RPC fn_reprogram_milestone en task-94)
│   └── index.ts
├── … (una carpeta por EF)
└── _shared/tests/                # pruebas unitarias Deno
```

Reglas obligatorias (detalle en
`hidria_coding_team/agents/03_dev_edge_functions.md`):

1. `Idempotency-Key` **opcional** en `docs/04` §2.3; **obligatorio** en las
   operaciones que vienen de la cola offline (siempre lo envían). Mismo payload
   → mismo cuerpo; distinto → 409.
2. Folios **solo** server-side (`MDOHI-AAAA-NNN`, `-R1`, ARCO).
3. `audit_log` con hash encadenado en la **misma transacción**.
4. Errores canónicos de `docs/04` §8; sin stack traces.
5. `service_role` solo como secreto de la EF; nunca en respuestas ni logs.
6. Gates EF-01…EF-07, EF-10, EF-12: sin conexión no se validan (el cliente
   deshabilita).

## EF implementadas

### EF-01 — `ef-01-advance-phase` (ADR-013 / task-95)

- Ruta: `POST /functions/v1/ef-01-advance-phase` (contrato
  `/diagnostics/{id}/advance-phase`).
- **Roles** `coordinador|equipo` **con membresía** (sin bypass admin); tenant
  fail-closed; `estado='activo'`; `to_phase = fase_actual + 1`; desde fase 6 →
  `409 CONFLICT_PHASE` (TD-1 fila 6 es EF-07).
- **Gates TD-1 replicados** (filas 1–5) + **ficha de respaldo cerrada**
  (BIT-R1/R2/V1/R3/R4); `p_gate` lo calcula solo la EF; el trigger
  `diagnostics_phase_gate` es la **autoridad final** (`P0001` → `GATE_*`).
- `proximo_hito` (mapa 2→R2, 3→V1, 4→R3, 5→R4, 6→R5); solo se añade fecha si hay
  fecha canónica.
- Efectos post-commit (best-effort): notificación `hito` a miembros y broadcast
  `phase_changed` (`diagnostic:{id}`) + `kanban_refresh` (`org:{id}`).
- Persistencia: **RPC transaccional** `fn_advance_phase` (task-94,
  `service_role`-only): UPDATE + `audit_log` + idempotencia atómica
  (`api_idempotency`) en una transacción. Lógica en `_shared/advance_phase.ts`
  - `_shared/guards.ts` + `_shared/db.ts`.

### EF-12 — `ef-12-reprogram-milestone` (ADR-013 / task-95)

- Ruta: `POST /functions/v1/ef-12-reprogram-milestone` (contrato
  `/diagnostics/{id}/reprogram-milestone`).
- Rol **`coordinador`**; valida hito V1–V3/R1–R5, fechas ISO, `justificacion` ≥
  20, `causa ∈ {empresa,equipo,externa}`, `fecha_nueva` dentro de las 6 semanas
  desde `fecha_inicio` y `≥ fecha_original`; ficha más reciente del hito o
  `422 VALIDATION_HITO_SIN_FICHA`.
- Semáforo (historial `milestone_reprogramming`, task-94): 1.ª reprogramación
  con `causa='empresa'` ⇒ `amarillo`; `≥2` ⇒ `rojo`; «vencido sin cerrar» queda
  fuera (tarea aparte).
- Persistencia: RPC `fn_reprogram_milestone` (`service_role`-only) que inserta
  hallazgo en la ficha, actualiza `proximo_hito`/`semaforo_atraso`/
  `reprogramacion_justificacion` y audita en una transacción. Post-commit:
  `kanban_refresh`.

### EF-08 — `ef-08-documents` (ADR-012 / task-39)

- Rutas: `POST /functions/v1/ef-08-documents/presign` (alias del contrato
  `/documents/presign`) y `…/register`.
- **`presign`**: exige `diagnostic_id` y membresía de diagnóstico
  (`coordinador|equipo|empresa`, espejo de la RLS `documents_ins`) **antes de
  firmar**; tenant fail-closed; TTL **300 s**; `Content-Type` firmado; respuesta
  mínima `{ upload_url, document_id, expira_en_seg, metodo }` (sin `r2_key`,
  bucket ni credenciales); `Idempotency-Key` opcional (document_id
  determinista).
- **`register`**: diferido a **F1-05** (task-86: RPC atómica `documents` +
  `audit_log`); mientras tanto responde `501 NOT_IMPLEMENTED_PHASE` sin efectos.
- Lógica en `_shared/presign.ts`, `_shared/r2.ts` (SigV4 con WebCrypto),
  `_shared/cors.ts`; `index.ts` solo conecta runtime
  (`_shared/documents_runtime.ts`).

## Variables de entorno de las EF

Se configuran con `supabase secrets set` (nunca en el repo). Comunes a
EF-01/EF-08/EF-12:

| Variable                                     | Uso                                                                          |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| `SUPABASE_JWT_SECRET`                        | Verificación HS256 del JWT (EF-01/EF-12 además exigen `nbf` numérico)        |
| `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_URL` | PostgREST/RPC internos (`fn_diag_role`, `diagnostics`, RPC) — autoinyectadas |
| `CORS_ALLOWED_ORIGINS`                       | Lista separada por comas (Pages del PWA + `http://localhost:5173`)           |
| `R2_ACCOUNT_ID`                              | Endpoint `https://{account}.r2.cloudflarestorage.com` (solo EF-08)           |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`  | Firma SigV4 (nunca se devuelven al cliente; solo EF-08)                      |
| `R2_BUCKET_DOCS`                             | Bucket de documentos (default `hidria-docs`; solo EF-08)                     |

EF-01/EF-12 emiten el broadcast de Realtime con `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` (endpoint `/realtime/v1/api/broadcast`).

Otros secretos futuros: `R2_BUCKET_REPORTS`, `PSC_*`, `NOM151_ENABLED`.

## Pruebas

El job `Edge Functions (Deno)` del CI (#38/task-87) ejecuta
`deno fmt --check
supabase/functions --ignore=supabase/functions/README.md`,
`deno lint`, `deno check supabase/functions/_shared` + cada
`supabase/functions/*/index.ts`, y `deno test supabase/functions/_shared` (146
pruebas: 101 previas + 45 de F1-04). Sin red, sin permisos: cliente DB/RPC y
broadcast se inyectan en las pruebas.
