# ADR-012 — EF-08 `presign`: membresía de diagnóstico obligatoria, TTL 300 s y contrato de respuesta

- **Estado:** propuesta (requiere aprobación de `revisor-especificaciones` y visto bueno de `seguridad-privacidad`)
- **Fecha:** 2026-11-12 · **act. 2026-11-12**: contrato `docs/04` §4 ya en `main` (PR #37) con corrección de TTL (PR #41); **este PR no modifica `docs/`**
- **Autor:** `dev-edge-functions` (task-39)
- **Aprobado por:** `supervisor-hidria` (diseño aprobado con condiciones) + `revisor-especificaciones` + `seguridad-privacidad`
- **Documentos afectados:** `docs/04` §4 EF-08 (contrato en `main` vía PR #37; TTL corregido en PR #41; owner Lead), `docs/01` §1 (convención R2 y vigencia ≤ 5 min), `docs/06` §8.2 (descarga 15 min)
- **Tareas:** `task-39` (este ADR + presign), `task-86` (register atómico, F1-05), `task-87` (CI Deno sobre `supabase/functions/**`, ya en `main` #38)

## Contexto

La spec review de PR #8 (`reports/reviews/PR-8_spec.md`, hallazgo **M1/Q-08**) detectó que
`EF-08.presign` exigía solo autenticación + tenant, mientras `docs/04` §4 (Pre) exige «miembro
del diagnóstico». El flujo real sube bytes a R2 **antes** de `register`, por lo que existía una
ventana en la que cualquier usuario autenticado del tenant podía obtener una URL `PUT` sin ser
miembro del diagnóstico. Además:

- `docs/01` §1 fija la convención de clave `org/{organization_id}/diag/{diagnostic_id}/{document_id}.{ext}`
  y una vigencia de URL prefirmada **≤ 5 minutos**; `docs/04` decía `expira_en_seg: 900`.
- `task-35` (posterior a PR #8) alineó `documents_ins` a `is_tenant_member` +
  `my_diagnostic_role ∈ {coordinador, equipo, empresa}`, **sin** bypass para
  `admin_institucional`/`coordinador_srhds` sin membresía (verificado por `arquitecto-bd`).
- La respuesta de presign no debe revelar rutas internas ni credenciales (condición de seguridad
  del contrato `docs/04` §4, PR #37): se elimina `r2_key` de la respuesta y `register` la deriva
  server-side desde `document_id`.

## Decisión

1. **`presign` exige `diagnostic_id` (uuid) en el cuerpo y membresía verificada ANTES de firmar.**
   Roles de diagnóstico autorizados: `coordinador`, `equipo`, `empresa` — **espejo exacto** de la
   RLS `documents_ins` vigente (task-35). `observador`/`invitado` ⇒ `403 FORBIDDEN_ROLE`; no
   miembro o diagnóstico inexistente/de otro tenant ⇒ `403 FORBIDDEN_NOT_MEMBER` (anti-enumeración,
   sin distinguir existencia).
2. **Tenant fail-closed:** `diagnostics.organization_id` debe coincidir con el claim de tenant del
   usuario; si no, 403. La comprobación de membresía se hace con `fn_diag_role(user_id, diagnostic_id)`
   vía `service_role` (M-06); la RPC no se expone al cliente.
3. **TTL 300 s para la URL `PUT`**, tope duro 300 s, sin override del cliente (docs/01 §1). La
   descarga futura (`GET /documents/{id}/download`, fuera del MVP) mantiene 900 s (15 min) tras RLS.
4. **Clave de objeto server-side** según `docs/01` §1. El `filename` se sanea (sin `/`, `\`, `..`,
   caracteres de control; máximo 255) y la extensión se deriva del `mime` en allowlist
   (pdf, png/jpeg/webp/tiff/heic, xlsx/xls, dwg, ofx). `size_bytes` ∈ [1, 100 MB].
   **La respuesta NO incluye `r2_key`, bucket ni rutas internas**: solo
   `{ upload_url, document_id, expira_en_seg: 300, metodo: "PUT" }`. `register` (F1-05) deriva la
   clave desde `document_id` + `diagnostic_id` + `mime` (server-side).
5. **`Content-Type` firmado:** `X-Amz-SignedHeaders=content-type;host`; el cliente debe enviar en el
   `PUT` exactamente el MIME declarado (evita subir otro tipo de contenido con una URL válida).
6. **Idempotencia opcional sin estado:** si el cliente envía `Idempotency-Key` (UUID), el
   `document_id` es determinista (`sha256(user_id | endpoint | key | payload canónico)` con forma
   UUID v5); reintentos reutilizan la misma clave de objeto. `presign` **no escribe BD ni auditoría**
   (sin efectos persistentes); la auditoría (`action='create'`) se registra en `register`.
7. **`register` diferido a F1-05 (task-86):** requiere una RPC forward-only que inserte
   `documents` + `fn_audit_write` en una sola transacción, validando membresía/tenant igual que
   presign (aunque la EF use `service_role` y haga bypass de RLS, la validación es explícita).
   Mientras no exista, `register` responde `501 NOT_IMPLEMENTED_PHASE` **sin efectos** (se autentica
   primero para no revelar nada a anónimos).
8. **Errores canónicos:** `401 AUTH_INVALID`; `403 FORBIDDEN_NOT_MEMBER`/`FORBIDDEN_ROLE`;
   `422 VALIDATION_PARAMETRO_REQUERIDO`/`VALIDATION_FILE`/`VALIDATION_DOC_TYPE`/
   `VALIDATION_EXPOSURE_LEVEL`/`VALIDATION_JSON`/`VALIDATION_IDEMPOTENCY_KEY` (familia
   `VALIDATION_*` = 422 de `docs/04` §8); `500 INTERNAL_ERROR` solo por configuración de la EF
   (JWT/R2/DB), sin detalles ni secretos.
9. **CORS con allowlist** (`CORS_ALLOWED_ORIGINS`): origen no permitido ⇒ respuesta sin
   `Access-Control-Allow-Origin` (fail-closed en navegador). Sin comodines. El CORS del bucket R2 lo
   configura DevOps (docs/07 §5.3).

## Alternativas consideradas

1. **Mantener auth+tenant con mitigaciones** (claves namespaced, TTL corto, validación en
   `register`): rechazada — persiste la ventana de URL para no-miembros, que es exactamente el
   hallazgo M1/Q-08.
2. **Copiar el bypass de `admin_institucional`/`coordinador_srhds`** de la versión anterior de
   `documents_ins`: descartada — task-35 eliminó ese bypass; exigir membresía es coherente con la
   RLS vigente y con mínimo privilegio.
3. **Devolver `r2_key` en la respuesta:** descartada por condición de seguridad en el contrato de
   `docs/04` §4 (PR #37/#41: no exponer rutas internas; la URL firmada es capacidad bearer).
   `register` la deriva server-side desde `document_id`.
4. **TTL 900 s (contrato previo):** descartada — `docs/01` §1 (≤ 5 min) y `docs/04` §4 (PR #41)
   fijan **máximo duro 300 s** para la subida; la descarga futura mantiene 900 s (15 min).

## Consecuencias

- **Positivas:** cierra Q-08/M1 por diseño (no hay URL sin membresía); contrato de respuesta mínimo
  sin rutas internas; TTL corto limita la ventana de una URL filtrada; las pruebas cubren roles,
  tenant, MIME, filename y errores.
- **Negativas / riesgos:** e2E real contra R2 pendiente de credenciales `R2_*` (B-03); `presign`
  no audita (no tiene efectos; se documenta); un admin sin membresía no puede subir documentos
  (necesita membresía — intencional); los reintentos con `Idempotency-Key` reutilizan objeto, pero
  un cliente sin la cabecera puede generar objetos huérfanos si no completa `register` (mitigación
  futura: `upload_status='pendiente'` + limpieza, task-86).
- **Impacto en pruebas (`docs/05`) y trazabilidad:** API-01/API-02/API-03 (contratos y errores),
  PER-03 (presign < 500 ms), SEC-04 (401), SEC-01 (no miembro), RPT-04 no aplica. Suites nuevas:
  `_shared/tests/r2_test.ts`, `cors_test.ts`, `presign_test.ts`, `documents_runtime_test.ts` y
  catálogo en `auth_test.ts` (total 101 pruebas Deno).

## Seguimiento

- Tareas creadas: `task-86` (register atómico + `upload_status`/`expires_at`, F1-05),
  `task-87` (CI Deno sobre `supabase/functions/**`; ya en `main` #38).
- Documentos: `docs/04` §4 EF-08 **ya actualizado en `main`** (PR #37 + corrección TTL PR #41;
  owner Lead; este PR de código no edita `docs/`); `docs/01` §1 (aclarar que la respuesta no expone
  la clave), `docs/07` §5.1 (secretos EF: `SUPABASE_JWT_SECRET`, `R2_ACCOUNT_ID`,
  `R2_BUCKET_DOCS`, `CORS_ALLOWED_ORIGINS`).
- Dependencias de despliegue (DevOps): secrets de EF + CORS del bucket R2 + bucket `hidria-docs`.
