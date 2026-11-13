# F1-39 — EF-08 `presign` con membresía de diagnóstico (Q-08/M1) y ADR-012

- **Agente:** `dev-edge-functions` (03)
- **Fecha:** 2026-11-12 20:45 (America/Mexico_City)
- **Tarea compartida:** `task-39` — «Q-08: EF-08 presign exige membresía de diagnóstico»
- **Rama:** `feature/F1-39-ef08-presign` desde `main` (`a0db8a1`)
- **PR:** [#40](https://github.com/horaciomartinez-svg/hidria-ect/pull/40) · **HEAD de código:** `1f9de83`
- **CI:** **12/12 success** en `1f9de83` (runs `43352226367` de PR y `43352196550` de push; checks: Guardas de repositorio, Cliente, Edge Functions (Deno), pgTAP, E2E Playwright y Seguridad)
- **ADR:** `hidria_coding_team/decisions/ADR-012-ef08-presign-membresia-ttl.md` (**propuesta**)
- **Contrato:** `docs/04` §4 EF-08 — parche documental en PR #36 (owner Lead, head `2c1e450`)
- **Entorno:** Windows / PowerShell 5.1 · Deno **2.9.6** (`npx --yes deno@2`, sin Docker)

## Resultado: **VERDE** (con limitaciones declaradas)

| Criterio de aceptación (`task-39`) | Estado | Evidencia |
|---|---|---|
| `presign` exige `diagnostic_id` + membresía antes de firmar | ✅ | `_shared/presign.ts`; §3/§4; tests 200/403 |
| Roles `coordinador/equipo/empresa` (espejo `documents_ins`); observador/invitado 403 | ✅ | catálogo `_shared/auth.ts`; tests de guarda y handler |
| Tenant fail-closed (`diagnostics.organization_id` = claim) | ✅ | `presign.ts` §tenant; test de otro tenant ⇒ 403 |
| TTL 300 s duro; `Content-Type` firmado; sin override del cliente | ✅ | `r2.ts`; tests de TTL y `X-Amz-SignedHeaders=content-type%3Bhost` |
| Clave R2 server-side saneada; **respuesta sin `r2_key`**/bucket/credenciales | ✅ | `r2.ts`; test de forma exacta de respuesta |
| Idempotencia opcional determinista (`Idempotency-Key`) | ✅ | `r2.ts` `deterministicUuid`; test de reutilización |
| `register` 501 sin efectos, documentado (F1-05/task-86) | ✅ | `presign.ts`; test 501 |
| Errores canónicos `AUTH`/`VALIDATION` según `docs/04` §8 | ✅ | §3; matriz de errores en tests |
| Tests Deno (58+ nuevos) y evidencia | ✅ | **101 pruebas** (58 previas + 43 nuevas); §5 |
| Sin secretos, sin `service_role` en respuestas | ✅ | §6.3 |

**Limitaciones declaradas:** sin credenciales `R2_*` en `.env` (B-03) ⇒ no hay E2E real contra R2; la
firma SigV4 se validó con el **vector documentado de AWS** y RFC 4231 (§6.2). El CORS del bucket R2
lo configura DevOps. `register` se completa en F1-05 (task-86). El job Deno del CI cubre
`supabase/functions/_shared`; `ef-08-documents/index.ts` se verificó localmente (task-87 extenderá el job).

---

## 1. Entregables

| Archivo | Líneas | Contenido |
|---|---|---|
| `supabase/functions/_shared/r2.ts` | 526 | SigV4 query-presign con WebCrypto (`signAwsV4Query`, `presignPutObject`), TTL 300 duro, `Content-Type` firmado, clave de objeto `org/{org}/diag/{diag}/{doc}.{ext}`, UUID determinista, allowlist MIME/ext/doc_type/exposure y validación de `filename`/tamaño. |
| `supabase/functions/_shared/cors.ts` | 69 | Allowlist estricta por `CORS_ALLOWED_ORIGINS`, preflight y merge de cabeceras (sin comodines). |
| `supabase/functions/_shared/presign.ts` | 300 | Handler de EF-08: ruteo `presign`/`register`, validación de body, guarda de catálogo (membresía+rol), tenant fail-closed, respuesta mínima, 501 de register, errores canónicos. |
| `supabase/functions/_shared/documents_runtime.ts` | 192 | Env → config (auth/R2/CORS) y dependencias DB (`fn_diag_role`, `diagnostics`) con `service_role`; inyectable para pruebas. |
| `supabase/functions/ef-08-documents/index.ts` | 19 | Wiring fino: `createRuntimeDocuments()` + `Deno.serve(handler)`. |
| `supabase/functions/_shared/auth.ts` | 973 (+2) | Catálogo `EF-08.presign` → `scope diagnostic (inBody)`, política `coordinador|equipo|empresa` (ADR-012; antes `authenticated`). |
| `supabase/functions/_shared/tests/r2_test.ts` | 358 | 17 pruebas: RFC 4231, SHA-256, **vector AWS SigV4**, URL/host/clave/TTL/encoding, config fail-closed, clave, UUID determinista, metadatos. |
| `supabase/functions/_shared/tests/cors_test.ts` | 104 | 6 pruebas de allowlist/preflight/parse/merge. |
| `supabase/functions/_shared/tests/presign_test.ts` | 445 | 19 pruebas de contrato: 200/401/403/404/422/501, respuesta mínima, TTL, idempotencia, CORS, rol no inyectable desde el body. |
| `supabase/functions/_shared/tests/documents_runtime_test.ts` | 218 | 9 pruebas de env/RPC/PostgREST con `fetch` falso y sin secretos en errores. |
| `supabase/functions/_shared/tests/auth_test.ts` | 1088 | Catálogo EF-08 actualizado y guarda de presign con membresía/rol (101 pruebas totales). |
| `supabase/functions/README.md` | 60 | EF-08, rutas, secretos de EF y comandos de prueba. |
| `hidria_coding_team/decisions/ADR-012-ef08-presign-membresia-ttl.md` | 99 | Decisión Q-08 (propuesta) + alternativas + consecuencias + seguimiento (task-86/87). |

---

## 2. Contrato implementado (resumen de `docs/04` §4 EF-08, parche en PR #36)

**Request `POST /documents/presign`** (o `/functions/v1/ef-08-documents/presign`):

```json
{
  "diagnostic_id": "c1000000-0000-4000-8000-000000000001",
  "filename": "layout_planta.pdf",
  "doc_type": "layout",
  "mime": "application/pdf",
  "size_bytes": 482133,
  "exposure_level": "restringido_nda"
}
```

**Response 200** (mínima, sin `r2_key`/bucket/credenciales):

```json
{
  "upload_url": "https://<account>.r2.cloudflarestorage.com/hidria-docs/org/…/diag/…/<document_id>.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&…&X-Amz-Expires=300&X-Amz-SignedHeaders=content-type%3Bhost&X-Amz-Signature=…",
  "document_id": "<uuid>",
  "expira_en_seg": 300,
  "metodo": "PUT"
}
```

**Errores:** `401 AUTH_INVALID` · `403 FORBIDDEN_NOT_MEMBER` (no miembro / inexistente / otro tenant,
sin filtrar existencia) · `403 FORBIDDEN_ROLE` (observador/invitado) · `422 VALIDATION_PARAMETRO_REQUERIDO`
· `422 VALIDATION_FILE` (MIME/tamaño/filename/extensión) · `422 VALIDATION_DOC_TYPE` ·
`422 VALIDATION_EXPOSURE_LEVEL` · `422 VALIDATION_JSON` · `422 VALIDATION_IDEMPOTENCY_KEY` ·
`500 INTERNAL_ERROR` (config JWT/R2/DB, sin detalles) · `501 NOT_IMPLEMENTED_PHASE` (`register`).

**Flujo de seguridad:** JWT → `guardEndpoint(EF-08.presign)` (rol vía `fn_diag_role` con
`service_role`) → `diagnostics.organization_id == claim` (tenant fail-closed) → validación de
metadatos → clave server-side → firma SigV4 (TTL 300, `Content-Type`) → respuesta mínima.
`presign` **no** escribe BD ni auditoría; `register` (F1-05/task-86) hará `INSERT documents` +
`audit_log` en una sola transacción.

---

## 3. Pruebas (101 Deno, de ellas 43 nuevas)

**Comando:** `npx --yes deno@2 test supabase/functions/_shared`
**Resultado:** `ok | 101 passed | 0 failed` (~0.4 s), sin permisos, red ni entorno.

| Grupo | Casos | Qué cubre | Trazabilidad `docs/05` |
|---|---|---|---|
| `r2_test.ts` | 17 | RFC 4231 HMAC, SHA-256, **vector AWS SigV4** (GET presign us-east-1 ⇒ `aeeed9bb…`), estructura de URL R2 (host/bucket/clave/TTL/encoding), config fail-closed sin secretos, clave de objeto, UUID determinista v5, allowlist MIME/ext/doc_type/exposure, filename traversal/control, tamaño 1..100 MB | API-01/02, PER-03, SEC-04 |
| `cors_test.ts` | 6 | Allowlist, preflight 204, sin comodines, origen no permitido sin ACAO, parse env, merge de cabeceras | SEC-PR36, API-02 |
| `presign_test.ts` | 19 | 200 con respuesta mínima exacta; 401; 403 no miembro/observador/tenant; 422 de todos los campos/MIME/tamaño/traversal/doc_type/exposure/JSON/Idempotency-Key; 404 ruta; 501 register; idempotencia determinista; CORS; rol del body ignorado | API-01/02/03, SEC-01/04, PER-03 |
| `documents_runtime_test.ts` | 9 | Env → config; fail-closed sin JWT/service/R2; `fn_diag_role` con `service_role` (URL/body/headers); `diagnostics` por id; null/inválido; errores genéricos sin filtrar claves | API-00…04 base |
| `auth_test.ts` | 59 | Catálogo EF-08.presign actualizado (scope/política); guarda con membresía, observador y falta de `diagnostic_id`; resto de SEC-04/roles | SEC-04, DOC-03, PG-11, RPT-03 |

---

## 4. Evidencia de ejecución

| # | Comando | Resultado |
|---|---|---|
| 1 | `npx --yes deno@2 --version` | `deno 2.9.6 (stable, x86_64-pc-windows-msvc)` |
| 2 | `deno fmt --check supabase/functions` | OK (14 archivos) |
| 3 | `deno lint supabase/functions` | OK (13 archivos, 0 problemas) |
| 4 | `deno check supabase/functions/_shared supabase/functions/ef-08-documents/index.ts` | OK (módulos + EF) |
| 5 | `deno test supabase/functions/_shared` | **101 passed · 0 failed** |
| 6 | `git status` en worktree | solo archivos del cambio; sin `deno.lock` ni artefactos |
| 7 | Escaneo de secretos en los archivos nuevos (`eyJhbGciOi`, `ghp_`, `github_pat_`, `sbp_`, `-----BEGIN…PRIVATE KEY-----`) | sin coincidencias; los secretos de prueba son sintéticos (`jwt-secret-sintetico-f1-39`, `secreto-r2-sintetico-f1-39`) |

**Vector externo SigV4 (evidencia fuerte):** la prueba reproduce el ejemplo documentado de AWS
(«Authenticating Requests: Using Query Parameters»): `GET /test.txt`, `examplebucket`,
`us-east-1`, `20130524T000000Z`, `expires=86400` ⇒ firma
`aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404`. Pasa.

**Sin E2E contra R2:** no hay `R2_*` en `.env` (B-03). Se probará en F1-16 (despliegue) o cuando
DevOps cargue credenciales; el firmador queda cubierto por vector + estructura.

---

## 5. Coordinación

| Agente | Interacción |
|---|---|
| `supervisor-hidria` | Diseño **APROBADO con condiciones** (membresía/roles, tenant, TTL 300, respuesta sin `r2_key`, register a F1-05 con task-86, CI a task-87). |
| `lead` | Recibió el **texto exacto del parche `docs/04` §4 EF-08**; abrió PR #36 con el ajuste de seguridad (sin `r2_key`, TTL 300 duro, firmar `Content-Type`). |
| `arquitecto-bd` | Confirmó `fn_diag_role` solo `service_role`; `documents_ins` post-task-35 exige membresía+rol (sin bypass admin) ⇒ el presign es coherente; register F1-05 requerirá RPC atómica y `upload_status`/`expires_at` (task-86). |
| `revisor-especificaciones` | Pre-lectura enviada (decisiones 1–5 del ADR); el PR lleva ADR-012 como propuesta para su dictamen. |
| `seguridad-privacidad` | Pre-lectura de SEC checklist (sin credenciales, TTL, anti-enumeración, CORS, sin side effects); pendiente su revisión formal del PR. |

---

## 6. Riesgos y follow-ups

| # | Riesgo / pendiente | Mitigación / dueño |
|---|---|---|
| 1 | Sin `R2_*` (B-03) ⇒ sin E2E real de presign/subida | DevOps carga secrets; prueba F1-16; firmador validado con vector AWS |
| 2 | CORS del bucket R2 (`PUT` desde Pages) | DevOps en `docs/07` §5.3; `CORS_ALLOWED_ORIGINS` en secrets de EF |
| 3 | `register` no implementado (501) | **task-86** (F1-05): RPC atómica `documents`+`audit_log`, validación de membresía/tenant, `upload_status`/`expires_at` para huérfanos |
| 4 | CI Deno solo cubre `_shared` | **task-87** (extender a `supabase/functions/**` antes de F1-04/F1-05); mientras tanto `index.ts` verificado local con `deno check` |
| 5 | Idempotencia sin `Idempotency-Key` puede dejar objetos huérfanos si no se registran | `upload_status='pendiente'` + limpieza en task-86; TTL 300 limita la ventana |
| 6 | Rate limit no incluido (SEC-PR8-10) | Backlog de seguridad; WAF por IP en docs/07 §5.3 como refuerzo |
| 7 | `presign` no audita (no tiene efectos) | Aceptado en ADR-012; auditoría en `register` (F1-05) |

---

## 7. Conclusión y siguiente paso

**VERDE:** Q-08/M1 queda cerrado por diseño (no se emite URL sin membresía), con contrato mínimo,
TTL 300 duro, `Content-Type` firmado, errores canónicos, idempotencia determinista y 43 pruebas
nuevas (101 totales) incluyendo el vector externo de SigV4.

**Siguiente paso:** review de especificaciones (ADR-012 + contrato) y seguridad; QA ejecuta la
suite Deno. Tras el merge, F1-05 implementará `register` con `task-86` y la UI de documentos
(`dev-frontend-pwa`) consumirá el presign. Cualquier ajuste solicitado irá en commits nuevos sobre
este head (no se reescribe historia).

---

*Fin del reporte — `dev-edge-functions` (agente 03) · `task-39` · F1-39.*
