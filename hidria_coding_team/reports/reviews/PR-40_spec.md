# Revisión de especificaciones — PR #40 — EF-08 presign (Q-08/task-39)

- **Revisor:** `revisor-especificaciones` (agente 06)
- **Fecha:** 2026-11-12 20:34 (America/Mexico_City)
- **PR:** [#40](https://github.com/horaciomartinez-svg/hidria-ect/pull/40) — `feature/F1-39-ef08-presign` → `main`
- **Head:** `af48a6763d3569e6f944f81a6aa0524938518425` (2 commits, 14 archivos, +2594/−29; base `e2a6ce9`; main actual `40785b4`, docs/04 #37).
- **CI:** 12/12 `success` (Guardas, Cliente, Deno, pgTAP ×2, Seguridad, E2E ×2); Deno **101 passed**; `mergeable_state` clean.
- **Veredicto:** **APROBADO** para squash/task-39, con tres correcciones documentales/de rebase y una observación CORS no bloqueantes. La implementación cumple el contrato de EF-08 presign y cierra Q-08.

---

## 1. Lo que PASA

| Criterio | Resultado | Evidencia |
|---|---|---|
| **`diagnostic_id` + membresía antes de firmar** | ✅ | `_shared/presign.ts` autentica, lee body y llama `guardEndpoint(... EF-08.presign, {diagnostic_id}, resolveRole)` antes de `fetchDiagnostic`/firma; `_shared/auth.ts` define scope `diagnostic_id` `inBody:true` y roles `coordinador/equipo/empresa`; no-miembro/inexistente/otro tenant ⇒ 403 `FORBIDDEN_NOT_MEMBER` sin distinguir (anti-enumeración). |
| **Roles/TTL/tenant** | ✅ | `observador`/`invitado` ⇒ `FORBIDDEN_ROLE`; `diagnostics.organization_id` se compara con el claim en `fetchDiagnostic` (tenant fail-closed); `PRESIGN_TTL_SECONDS=300`, `MAX=300`, sin override; `Content-Type` firmado. |
| **Clave R2 server-side** | ✅ | `buildDocumentObjectKey` genera `org/{org}/diag/{diag}/{document_id}.{ext}`; `document_id` server-side (UUID v4 o determinista con Idempotency-Key), nunca del cliente; `filename` saneado (sin `/`, `\`, `..`, control, >255) y extensión desde MIME allowlist; size 1–100 MB. |
| **Respuesta mínima** | ✅ | `{ upload_url, document_id, expira_en_seg:300, metodo:"PUT" }`; **no** `r2_key`, bucket ni credenciales separadas; la URL prefirmada es la única capacidad bearer. |
| **`register` 501** | ✅ | Autentica primero y responde `501 NOT_IMPLEMENTED_PHASE` sin efectos; F1-05/task-86; documentado en ADR/docs/04. |
| **Errores/catálogo** | ✅ | `AUTH_INVALID`, `FORBIDDEN_NOT_MEMBER`, `FORBIDDEN_ROLE`, `VALIDATION_*`, `INTERNAL_ERROR`; `EF-08.presign`/`register` en catálogo `auth.ts`; tests Deno de contrato. |
| **CORS** | ✅ base | Allowlist `CORS_ALLOWED_ORIGINS` sin comodines en código; preflight 204; headers CORS sólo para origen permitido; ver M4. |
| **No endpoints/EF inventados** | ✅ | Sólo `presign`/`register`; `EF-08` index wiring; `_shared` no rompe las EF existentes (Deno 101). |
| **Alcance/secretos** | ✅ | 14 archivos `supabase/functions/**`, ADR, README, reportes; sin `app/**`/`docs/**` editados; sin `R2_*` reales; fixtures sintéticos. |

## 2. Observaciones

### m1 — docs/04 dice «tope duro 900 s» y el código fija 300 s

`docs/04` (main #37) documenta presign `expira_en_seg:300` pero «tope duro 900 s»; `_shared/r2.ts` define `MAX_PRESIGN_TTL_SECONDS=300` y `clampTtl` no permite 900. No es un fallo de seguridad (el código es más estricto), pero contrato/ADR deben decir **300 duro para PUT**; el 900 corresponde a descarga/futuro, no a presign. Corregir docs/04 y ADR-012 antes de cerrar task-39.

### m2 — ADR-012 referencia el PR documental equivocado y estado propuesta

ADR-012 dice «`docs/04` … parche en PR documental #36»; el parche de docs/04 es **#37** (main `40785b4`). Además su estado sigue «propuesta» y la tabla de aprobaciones no se actualiza; al aprobar este PR debe pasar a aceptada y citar `docs/04` #37.

### m3 — El PR está sobre `e2a6ce9`, antes de #37

El contrato `docs/04` §4 ya está en main `40785b4`, pero el head/base del PR es anterior; **rebasar sobre `40785b4`** (solo docs) y confirmar que el código sigue el contrato final (diagnostic_id/300/sin r2_key/501). No edita docs el PR; el parche va aparte.

### m4 — CORS: validar el contenido de `CORS_ALLOWED_ORIGINS`

`parseAllowedOrigins` acepta cualquier cadena; si el entorno define `*` o una URL inválida, no hay guarda. El código no introduce comodín, pero conviene validar cada origen (`https://…` o `http://localhost:<puerto>`) y rechazar `*`/vacíos, con test, para que la configuración no abra CORS accidentalmente. No es una frontera de autorización (JWT/membresía lo son), pero es la política declarada.

### m5 — `register` 501 y `docs/04`

Correcto. Mantener `501` sólo mientras F1-05/task-86 no exista; no declarar EF-08 end-to-end cerrada. La respuesta `presign` no expone `r2_key`; la URL prefirmada inevitablemente contiene bucket/path, pero no se devuelve un campo separado ni credenciales.

## 3. Conclusión

**APROBADO** para squash de #40/task-39: presign exige `diagnostic_id` y membresía antes de firmar, roles espejo de `documents_ins`, tenant fail-closed, TTL 300, clave R2 server-side saneada, respuesta mínima, `register` 501 documentado, catálogo/errores y tests Deno 101/CI 12/12. Antes del cierre, aplicar m1–m3 (docs/ADR/rebase) y, si se puede, m4 (validación CORS); no bloquean la seguridad del presign. No se ejecutaron comandos Git de escritura ni merges; este reporte es el único archivo escrito.

---

## Delta final `99e948c` — APROBADO

- **Head:** `99e948c49731ab2332462d626789a23118b20e32`; base `main@40785b4` (#37/#41 docs); 14 archivos, +2610/−34; CI **12/12 success**, clean.
- **`docs/04` fuera del diff:** el contrato de #37/#41 se conserva; sin regresión de docs. El diff del delta solo toca ADR/README/comentarios de `r2.ts`.
- **ADR-012:** actualizado a PR #37/#41, TTL 300 duro y descarga futura 900; alternativas/consecuencias coherentes. **Observación m6:** el estado aún dice «propuesta» y la tabla de aprobaciones no refleja el cierre; al squash debe pasar a «aceptada» y registrar revisor/seguridad/QA.
- **Código:** `PRESIGN_TTL_SECONDS=300`, `MAX=300`, sin override; `docs/04`/`docs/01` coherentes; `README` formateado; sin cambios funcionales respecto a `af48a67`.
- **Contrato:** `diagnostic_id` + membresía/rol antes de firmar, tenant fail-closed, clave R2 server-side, respuesta mínima sin `r2_key`, `register` 501; tests Deno 101/CI; `_shared` sin regresión.
- **PR body:** aún cita base `a0db8a1`/PR #36 y «ADR propuesta»; actualizar a `99e948c`/`40785b4` y estado aceptado (m7). No bloquea el código.

**Veredicto final:** **APROBADO** para squash de #40/task-39. No quedan blockers de spec/seguridad; solo m6/m7 documentales y, opcional, validación CORS m4. No se ejecutaron comandos Git de escritura ni merges; este es el cierre del delta.
