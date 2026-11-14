# F1-05 — RPC atómica `fn_register_document` (EF-08 register)

- **Agente:** `arquitecto-bd` (02), coordinado con `dev-edge-functions` (EF task-106)
- **Tarea:** `task-86` (F1-05)
- **Rama:** `feat/F1-05-register`, base `main@226d885`
- **Migración:** `supabase/migrations/20261108080000_f1_05_register_document.sql`
- **BD:** `schema_migrations = 31`; forward-only; `docs/02` intacto.
- **PR:** #49.

## RPC

`public.fn_register_document(p_user_id, p_document_id, p_diagnostic_id, p_doc_type, p_title, p_mime, p_size_bytes, p_sha256, p_exposure_level, p_idempotency_key, p_request_hash, p_extension)`:
- `SECURITY DEFINER`, `search_path=public,pg_temp`, `REVOKE` public/anon/authenticated y `GRANT EXECUTE` **solo service_role**.
- Revalida: diagnóstico/tenant, perfil del usuario, rol **coordinador/equipo/empresa** (observador/invitado 403), `doc_type`, MIME allowlist, `exposure_level`, `size_bytes` 1..100 MB, `sha256` 64 hex, `title` saneado.
- **`r2_key` server-side** `org/{org}/diag/{diag}/{document_id}.{ext}`; la extensión la valida la RPC desde `p_extension` (misma que firmó el PUT) o desde el título, y debe pertenecer al MIME. El cliente nunca propone clave ni extensión.
- `INSERT documents` (`uploaded_by`, `company_id` del diagnóstico, `upload_status='registered'`) + `fn_audit_write(action='create')` + `api_idempotency`/respuesta en la **misma transacción**.
- Idempotencia: mismo hash ⇒ `replayed:true` sin INSERT/audit; hash distinto o documento/R2 key ya registrados ⇒ `CONFLICT_STATE`.
- Respuesta `{ok,replayed,data:{document_id,sha256},audit_ref}`.

## Decisiones / límites

- Roles de register alineados con `documents_write` (coord/equipo/empresa); observador/invitado 403 (patch de docs/04 §3 al Lead).
- `sha256` es **declarado por el cliente**; HEAD valida existencia/tamaño/MIME, no hash. Limitación declarada y follow-up de verificación.
- `upload_status='registered'` añadido (default para existentes); `expires_at`/limpieza de huérfanos queda como follow-up.
- HEAD del objeto R2 lo hace la EF con credenciales server-side; la RPC no tiene credenciales R2.
- `p_extension` canónica por MIME evita que HEAD (`metadata.extension`) y RPC deriven claves distintas (`.jpeg`/`.tiff`, títulos con punto).

## Tests

- `100_f1_05_register.sql` **plan 31**: ACL service_role, roles, tenant/cross-tenant, validaciones, insert/audit, duplicado, idempotencia/replay/conflicto, `upload_status`, `.jpeg`/`.tiff`/título punteado.
- Total suite **319** (288 + 31); EF Deno **166**.
- `docs/04` register (501 → RPC/EF) se propone en #51; `docs/02` intacto.

## Contrato EF

La EF `POST /documents/register` recibe metadatos + `sha256`, valida auth/membresía/rol/tenant, verifica el objeto en R2 con HEAD (existencia/tamaño/MIME; sin credenciales cliente), llama a esta RPC con `p_extension` y devuelve exactamente `{document_id, sha256}` sin `r2_key`/bucket. Un fallo HEAD ⇒ `422 VALIDATION_FILE`; RPC `CONFLICT_STATE` ⇒ 409; errores saneados.
