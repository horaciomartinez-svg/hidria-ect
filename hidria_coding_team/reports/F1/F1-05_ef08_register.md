# F1-05 — EF-08 `register` (documentos R2): HEAD, RPC atómica y contrato

- **Agente:** `dev-edge-functions` (03)
- **Fecha:** 2026-11-14
- **Tarea compartida:** `task-106` (EF) · RPC/migración: `task-86` (`arquitecto-bd`)
- **Rama:** `feat/F1-05-register` (PR **#49**), base RPC `ad2dd24` + merge `main@226d885` (#48)
- **Contrato:** `docs/04` §4 EF-08 (presign + register) y §8 errores; roles confirmados en #48
- **Entorno:** Windows / PowerShell 5.1 · Deno **2.9.6** (`npx --yes deno@2`, sin Docker)

## Resultado: **VERDE** (con limitaciones declaradas)

| Criterio de `task-106` | Estado | Evidencia |
|---|---|---|
| Eliminar el `501` y servir `register` real | ✅ | `_shared/presign.ts` `handleRegister`; tests de contrato |
| Auth/claims/`verifyProfile` + membresía/tenant | ✅ | `authenticate` + `verifyProfile` en runtime; tests 401/403 |
| Roles `coordinador|equipo|empresa`; observador/invitado 403 | ✅ | catálogo `EF-08.register`; test de guarda |
| Validación de metadatos (reusa `validateUploadMetadata`) | ✅ | tests 422 (mime, tamaño, filename/traversal, doc_type, exposure) |
| **HEAD a R2 con credenciales de la EF** (existencia/tamaño/MIME) | ✅ | `_shared/r2.ts` `headObject` (SigV4 cabeceras, WebCrypto) + tests |
| Sin credenciales/bucket/rutas al cliente | ✅ | respuesta exacta `{document_id, sha256}`; tests `assertNotIncludes` |
| RPC atómica `fn_register_document` (`documents`+`audit_log`+`api_idempotency`, `r2_key` server-side) | ✅ | firma de `arquitecto-bd` (`ad2dd24`); RPC inyectada y testeada con fake |
| Errores del contrato (401/403/422/409/500 saneado) | ✅ | matriz de tests; mensajes de la RPC preservados |
| `sha256` declarado por el cliente con limitación documentada | ✅ | §5 limitaciones |
| Tests Deno (sin red) y CI | ✅ | **166 pruebas** (15 nuevas F1-05); `fmt/lint/check` verdes |

**Limitaciones declaradas:** (1) `sha256` se **persiste como declarado** por el cliente: `HEAD`
valida existencia/tamaño/MIME, no el hash (verificación server-side = follow-up con descarga/job);
(2) el **replay idempotente** exige que el objeto siga existiendo en R2 (el HEAD previo se ejecuta
siempre); (3) `upload_status='registered'` ya lo fija la RPC (`42097f6`); `expires_at` y la limpieza
de objetos huérfanos quedan en follow-up; (4) el contrato `docs/04` aún no documenta el cuerpo de
`register` ni `title = filename` (propuesta enviada al Lead/revisor); (5) `R2_*` reales no están en
`.env` (B-03): el HEAD se prueba con `fetch` inyectado y vector SigV4 estructural, no contra R2.

---

## 1. Entregables

| Archivo | Líneas | Contenido |
|---|---|---|
| `_shared/presign.ts` | +~330 | `handleRegister`: auth/`verifyProfile`, guarda de rol, tenant, validación de body (`document_id`, `sha256`, metadatos), `title`, clave server-side, HEAD, idempotencia (`request_hash`), RPC y respuesta `{document_id, sha256}`. |
| `_shared/r2.ts` | +~140 | `signAwsV4Headers` y `headObject` (SigV4 con cabeceras, WebCrypto, `HEAD`, 404⇒`exists:false`, errores saneados). |
| `_shared/documents_runtime.ts` | +~45 | `verifyProfile` (SEC-PR8-01) y `registerDocument` (RPC `fn_register_document`) sobre el cliente `service_role`. |
| `_shared/auth.ts` | +9/−1 | `EF-08.register` → política `coordinador|equipo|empresa` (espejo de `documents_write`). |
| `_shared/tests/register_test.ts` | ~300 | 11 pruebas de contrato de `register` (200/401/403/409/422/500, HEAD, RPC, replay, sin `r2_key`). |
| `_shared/tests/r2_head_test.ts` | ~130 | 4 pruebas de SigV4 HEAD y `headObject` (firma, URL, 404, errores saneados). |
| `_shared/tests/{auth,presign}_test.ts` | ± | Política/roles de `register` y retirada del test de 501. |
| `supabase/functions/README.md` | reescrito | EF-01/EF-12/EF-08 actualizados; `register` ya no es 501; 166 pruebas. |

## 2. Contrato implementado (`POST /documents/register`)

**Body:** `{ diagnostic_id, document_id, filename, doc_type, mime, size_bytes, exposure_level, sha256 }`
(sin `r2_key`). `Idempotency-Key` opcional (UUID).

**Flujo:** JWT+`verifyProfile` → guarda `coord/equipo/empresa` + membresía → tenant fail-closed →
validación de metadatos/`document_id`/`sha256` → **HEAD** del objeto con `r2_key` derivada
server-side (`org/{org}/diag/{diag}/{document_id}.{ext}`) → RPC atómica → `200 {document_id, sha256}`.

**Errores:** `401 AUTH_INVALID` · `403 FORBIDDEN_NOT_MEMBER` (no miembro/otro tenant, sin filtrar
existencia) · `403 FORBIDDEN_ROLE` (observador/invitado) · `422 VALIDATION_FILE` (metadatos/`sha256`
malformado, objeto inexistente, tamaño/MIME distintos) · `422 VALIDATION_PARAMETRO_REQUERIDO` ·
`422 VALIDATION_DOC_TYPE`/`VALIDATION_EXPOSURE_LEVEL` · `409 CONFLICT_STATE` (replay con payload
distinto o documento ya registrado) · `500 INTERNAL_ERROR` (config/R2/RPC, sin detalles).

## 3. Pruebas (166 Deno; 15 nuevas)

| Grupo | Casos | Qué cubre |
|---|---|---|
| `register_test` | 11 | 200 con HEAD/RPC/respuesta exacta sin `r2_key`; replay; 401 sin token/`verifyProfile`; 403 observador/no miembro/tenant; 422 de `document_id`/`sha256`/metadatos; HEAD ausente/tamaño/MIME; 500 saneado; 409/422 de la RPC; `Idempotency-Key` inválida; CORS/404. |
| `r2_head_test` | 4 | SigV4 cabeceras determinista/estructura; HEAD 200 (existencia/tamaño/MIME, URL path-style, credenciales fuera de URL); 404 ⇒ `exists:false`; 403/red ⇒ `INTERNAL_ERROR` saneado. |
| `auth_test` | +1 | Política `EF-08.register` coord/equipo/empresa; empresa permitida; observador ⇒ `FORBIDDEN_ROLE`. |
| `presign_test` | ajuste | `register` sin token ⇒ 401 (501 eliminado). |

**Comandos (local):**

| Comando | Resultado |
|---|---|
| `deno fmt --check supabase/functions --ignore=supabase/functions/README.md` | OK (30 archivos) |
| `deno lint supabase/functions` | OK (30 archivos) |
| `deno check supabase/functions/_shared supabase/functions/ef-08-documents/index.ts` | OK (31 archivos) |
| `deno test supabase/functions/_shared` | **166 passed · 0 failed** |

Sin red/permisos: JWT sintético; HEAD de R2 y RPC inyectados. Sin datos reales ni `R2_*`.

## 4. Coordinación

| Agente | Interacción |
|---|---|
| `arquitecto-bd` (task-86) | RPC `fn_register_document` firma final + migración `20261108080000` + pgTAP 24; rama/PR #49. Decisiones: roles coord/equipo/empresa, `sha256` declarado, sin `upload_status`/`expires_at`, `r2_key` server-side. |
| `supervisor-hidria` | task-106 (EF) bloqueada por task-86; orden RPC→EF; CI 7/7 y ready para spec/seguridad/QA. |
| `lead` | Decisiones vinculantes (roles, `sha256`, `title=filename`, no migración extra, mismos códigos); merge `main@226d885` (#48). |
| `seguridad-privacidad` | Revisión pendiente: credenciales solo server-side, anti-enumeración, respuesta mínima. |

## 5. Limitaciones y follow-ups

| # | Riesgo / pendiente | Mitigación / dueño |
|---|---|---|
| 1 | `sha256` no verificado server-side | Declarado por cliente; verificación posterior (descarga/job) — follow-up |
| 2 | Replay idempotente requiere objeto en R2 | HEAD previo; documentado; alternativa: cache de replay en RPC |
| 3 | Objetos huérfanos (subida sin register) | `upload_status='registered'` ya en la RPC (`42097f6`); `expires_at` + limpieza = follow-up |
| 4 | `docs/04` sin cuerpo de `register`/`title` | Propuesta de parche al Lead/revisor (no se edita `docs/**`) |
| 5 | Sin E2E real de R2 (`R2_*` ausentes, B-03) | HEAD probado con `fetch` inyectado + SigV4; E2E en F1-16 con secretos |
| 6 | Rate limit (API-04) | Follow-up (sin objeto DB) |

## 6. Trazabilidad

`API-01/02/03` (contrato/errores), `PER-03` (subida directa), `SEC-01/04` (auth/claims, roles,
anti-enumeración, sin credenciales cliente), `DOC-*` (documentos M3), `M3` (F1-05).

## 7. Conclusión y siguiente paso

**VERDE con limitaciones declaradas:** `register` ya no responde 501; implementa el flujo completo
(HEAD con credenciales de la EF + RPC atómica de task-86) con roles alineados a `documents_write`,
respuesta mínima sin `r2_key`, errores canónicos e idempotencia, y 15 pruebas nuevas (166 totales).

Siguiente: push del commit sobre `feat/F1-05-register` (orden RPC→EF), CI 7/7, marcar PR #49
**ready** y pasar a spec/seguridad/QA.
