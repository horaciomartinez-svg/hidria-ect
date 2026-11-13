# Edge Functions — Supabase (Deno)

Contratos: `docs/04-Contratos-API-y-Tablas-de-Decision-HIDRIA-MD-OHI.md`
(EF-01…EF-13).

## Convención

```
supabase/functions/
├── _shared/                 # auth, errors, r2, cors, presign (y futuros db/env…)
├── ef-08-documents/         # EF-08 implementada (presign; register en F1-05)
│   └── index.ts
├── … (una carpeta por EF)
└── tests/                   # pruebas unitarias Deno
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

Se configuran con `supabase secrets set` (nunca en el repo). Para EF-08:

| Variable                                     | Uso                                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `SUPABASE_JWT_SECRET`                        | Verificación HS256 del JWT (alternativa: verificador JWKS inyectado)                     |
| `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_URL` | PostgREST/RPC internos (`fn_diag_role`, `diagnostics`) — autoinyectadas por Supabase     |
| `R2_ACCOUNT_ID`                              | Endpoint `https://{account}.r2.cloudflarestorage.com` (fallback `CLOUDFLARE_ACCOUNT_ID`) |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`  | Firma SigV4 (nunca se devuelven al cliente)                                              |
| `R2_BUCKET_DOCS`                             | Bucket de documentos (default `hidria-docs`)                                             |
| `CORS_ALLOWED_ORIGINS`                       | Lista separada por comas (Pages del PWA + `http://localhost:5173`)                       |

Otros secretos futuros: `R2_BUCKET_REPORTS`, `PSC_*`, `NOM151_ENABLED`.

## Pruebas

`deno fmt --check supabase/functions/_shared`,
`deno lint supabase/functions/_shared`, `deno check supabase/functions/_shared`
y `deno test supabase/functions/_shared` (job `functions` del CI; la extensión a
todo `supabase/functions/**` es task-87).
