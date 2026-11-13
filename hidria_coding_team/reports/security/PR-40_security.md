# PR #40 — Revisión de Seguridad (EF-08 presign / Q-08)

- **Agente:** `seguridad-privacidad` (08) — autoridad de **veto**
- **Fecha:** 2026-11-13 02:35 (America/Mexico_City)
- **PR:** [#40](https://github.com/horaciomartinez-svg/hidria-ect/pull/40) — `feature/F1-39-ef08-presign` → `main`
- **Head:** `af48a6763d3569e6f944f81a6aa0524938518425`; base `e2a6ce9`; 14 archivos
  **+2594/−29**; job **Deno verde**; resto de CI en curso. Autor: `dev-edge-functions`.
- **Alcance revisado:** `_shared/r2.ts`, `_shared/presign.ts`, `_shared/cors.ts`,
  `_shared/documents_runtime.ts`, `_shared/auth.ts`, `ef-08-documents/index.ts`, tests Deno,
  ADR-012, `docs/04` §4 y reporte F1-39.
- **Método:** revisión estática de handler/runtime/firma/validaciones/docs; contraste ADR-012 y
  contrato de `docs/04` en `main`; secret scan 0. No ejecuté Deno localmente (job Deno verde).

## Veredicto: **VETO**

El **código** del presign está bien orientado y no encontré un bypass de autorización en la
implementación revisada; pero el PR **modifica `docs/04` §4 y reemplaza el contrato seguro de
`main` por la versión antigua**: vuelve a documentar `r2_key` en la respuesta, TTL **900**,
**sin `diagnostic_id` en el cuerpo de presign** y sin el `register` 501. Eso contradice ADR-012,
el código de este mismo PR y las condiciones de PR #36; si se mergea, el contrato público vuelve
a exponer rutas internas y a omitir la membresía antes de firmar. Es un **VETO de contrato** hasta
restaurar `docs/04` (o retirar su edición de este PR).

## 1. Bloqueante — `docs/04` §4 regresó al contrato inseguro

Diff de `docs/04` en el PR:

- **Cuerpo (presign)** queda **sin `diagnostic_id`**; dice que el ID va en el cuerpo de `register`.
- **Respuesta (presign)** documenta **`{ upload_url, r2_key, expira_en_seg: 900 }`** y
  `register: { document_id, r2_key, sha256 }`.
- **TTL 900 s** (no 300), sin roles/anti-enumeración ni `register` 501.
- Elimina la nota de `register` diferido/501 y la respuesta mínima sin rutas internas.

En `main`/ADR-012 el contrato seguro es:

```json
{ "upload_url": "...", "document_id": "<uuid>", "expira_en_seg": 300, "metodo": "PUT" }
```

con `diagnostic_id` obligatorio en el cuerpo de presign y **sin** `r2_key`/bucket/rutas. El código
de este PR **sí** cumple ese contrato (`presign.ts` responde solo 4 campos; tests verifican
`assertNotIncludes(body, "r2_key")`), pero el documento que se mergearía dice lo contrario.
`docs/04` ya había sido corregido en `main` (#37); este PR no debe reintroducir la versión
antigua.

**Condición:** restaurar la sección EF-08 de `docs/04` al texto seguro de `main`/ADR-012, o
**retirar `docs/04` del PR** y dejar el parche al Lead/revisor. Verificar que el ejemplo y la
tabla no contienen `r2_key`, `expira_en_seg: 900`, ni omiten `diagnostic_id`.

## 2. Código — sin bypass encontrado, con observaciones

| Control | Resultado |
|---|---|
| Membresía/rol **antes de firmar** | ✅ `guardEndpoint` con `EF-08.presign` (diagnostic, roles coord/equipo/empresa); `fn_diag_role` vía service_role; observador/invitado → 403; no miembro/inexistente → 403 |
| Tenant fail-closed | ✅ `fetchDiagnostic` con service_role y `organization_id === context.organizationId`; null/otro tenant → 403 |
| Coherencia `documents_ins` post-#32 | ✅ roles espejo; admin/coord **sin** membresía denegados |
| Clave R2 server-side | ✅ `org/{org}/diag/{diag}/{document_id}.{ext}`, IDs UUID validados, extensión desde MIME allowlist; `filename` sin `/`, `\`, `..`, control; `size_bytes` 1–100 MB |
| Respuesta | ✅ solo `upload_url`, `document_id`, `expira_en_seg:300`, `metodo`; **sin `r2_key`/bucket/credenciales** |
| `Content-Type` firmado | ✅ `X-Amz-SignedHeaders=content-type;host`; MIME validado antes |
| TTL | ✅ `PRESIGN_TTL_SECONDS=300`, `MAX_PRESIGN_TTL_SECONDS=300`, `clampTtl` sin override cliente |
| SigV4/WebCrypto | ✅ HMAC/SHA-256, RFC3986, canonical request; tests Deno vector; **no loguea secretos** (access key ID en URL es estándar SigV4) |
| Idempotencia | ✅ `Idempotency-Key` UUID → UUID determinista con user+payload; sin estado; opcional |
| `register` 501 | ✅ autentica primero y responde 501 sin escrituras/auditoría |
| CORS | ✅ allowlist exacta (`CORS_ALLOWED_ORIGINS`), sin `*`, sin credenciales; origen no permitido sin ACAO |
| Errores | ✅ envelope canónico, sin stack/Postgres; `INTERNAL_ERROR` para configuración |
| Secretos en repo | ✅ secret scan 0; `R2_*`/service_role no en respuestas |

**Observaciones no bloqueantes del código:**
- **SEC-PR40-01 (OBS/TTL):** `MAX_PRESIGN_TTL_SECONDS=300` está más restringido que el “tope 900”
  del task/contrato previo; ADR-012/documento seguro fijan 300 duro. Alinear doc/código y
  decidir si el tope es 300 o 900; **sin override cliente** en cualquier caso.
- **SEC-PR40-02 (OBS):** `size_bytes` es declarativo; el PUT no está limitado por Content-Length y
  el presign no verifica el objeto. `register` (F1-05) debe hacer HEAD/validar tamaño real y
  limpiar huérfanos; documentado en ADR.
- **SEC-PR40-03 (OBS):** `Idempotency-Key` opcional: sin ella, reintentos generan objetos
  huérfanos hasta `register`/limpieza (riesgo aceptado en ADR; mantener task-86).
- **SEC-PR40-04 (OBS):** `matchDocumentsRoute` acepta cualquier path que termine en `/presign` o
  `/register`; no es bypass (auth/rol se aplican), pero conviene restringir a las rutas del
  contrato si el gateway no lo hace.
- **`R2_ACCESS_KEY_ID`** aparece en `X-Amz-Credential` de la URL (diseño SigV4; no es el secret).
  No debe loguearse la URL completa.

## 3. Condiciones para levantar el VETO

1. **Restaurar `docs/04` §4 EF-08** al contrato seguro de `main`/ADR-012: `diagnostic_id` en
   presign, respuesta `{upload_url, document_id, expira_en_seg:300, metodo}`, sin `r2_key`, TTL
   300 duro, roles/anti-enumeración y `register` 501; o retirar `docs/04` del PR.
2. Alinear la declaración de TTL (300 vs 900) doc/ADR/código y dejar explícito que el cliente no
   puede override.
3. Mantener los tests Deno (roles/no miembro/tenant/MIME/filename/TTL/idempotencia/501/CORS) y
   añadir una comprobación de contrato (que la respuesta no tenga `r2_key`).
4. CI completo 6/6 (Deno ya verde); sin `R2_*`/secretos.

## 4. Conclusión

**VETO** para `af48a67`: la implementación de código es, en lo revisado, coherente con Q-08 y las
condiciones de PR #36, pero **`docs/04` §4 fue reemplazado por el contrato antiguo** que expone
`r2_key`, TTL 900 y omite `diagnostic_id`/501. Hasta restaurar el contrato seguro (o retirar esa
edición), no autorizo el merge. Sin secretos en el diff; Deno verde.

## 5. Delta final — head `99e948c`: VETO LEVANTADO

- **Head rebasado:** `99e948c49731ab2332462d626789a23118b20e32`, base `40785b4`; 14 archivos
  **+2610/−34** (solo `supabase/functions/**`, ADR-012 y reporte). **`docs/04` NO está en el
  diff**: el contrato seguro de `main` (#37/#41) se conserva. CI **6/6** (incluye Deno extendido).
- **Contrato:** `docs/04` §4 en `main` exige `diagnostic_id`, respuesta
  `{upload_url, document_id, expira_en_seg:300, metodo}`, sin `r2_key`, TTL 300 duro y `register`
  501; el head no lo modifica. ADR-012 actualizado: TTL **máximo duro 300 s** (descarga futura
  900 s) y referencia a PR #41.
- **Código:** sin cambios de seguridad respecto al head revisado; `PRESIGN_TTL_SECONDS=300`,
  `MAX_PRESIGN_TTL_SECONDS=300`, `clampTtl` sin override; `Content-Type` firmado; respuesta sin
  `r2_key`; test Deno `presign 200: respuesta mínima sin r2_key, TTL 300 y Content-Type firmado`
  (incluye `X-Amz-Expires=300`). Roles/membresía, tenant, clave server-side, CORS, 501 y SigV4 se
  mantienen; Deno verde.
- **Secretos:** secret scan 0; sin `R2_*`/service_role en respuestas; sin doc viejo reintroducido.
- **Condiciones previas cerradas:** (1) `docs/04` restaurado (no está en el PR); (2) TTL 300
  alineado doc/ADR/código; (3) tests y contrato sin `r2_key`; (4) CI 6/6.
- **Observaciones no bloqueantes vigentes:** `size_bytes` declarativo (register/HEAD F1-05),
  `Idempotency-Key` opcional/huérfanos, `matchDocumentsRoute` acepta cualquier path terminado en
  `/presign` (no bypass) y el access key ID en la URL SigV4 (público por diseño). No afectan al
  merge.

**Veredicto final:** **APROBADO CON OBSERVACIONES, SIN VETO** para `99e948c`. El VETO anterior
queda **levantado** al eliminarse la regresión de `docs/04`, alinearse TTL 300 en ADR/código,
mantenerse el contrato sin `r2_key` y estar CI 6/6/Deno verde. Con spec+QA+CI procede el squash y
cierre de task-39.

## 6. Head final documental — `eb5f62e` (aprobación extendida)

- **Head final:** `eb5f62e42b9a0bc1899c5de1710e5f14ce70e171`, hijo de `99e948c`; delta
  `99e948c..eb5f62e` = **solo** `hidria_coding_team/reports/F1/F1-39_ef08_presign.md` (+17/−9).
  **Sin cambios de código, ADR, tests, `docs/` ni `supabase/functions/**`**; `docs/04` del base
  `40785b4` (#37/#41) se conserva. CI **12/12** en `eb5f62e` (runs `43353866750`/`43353874625`,
  incluido Deno extendido).
- La aprobación de `99e948c` **se extiende** a `eb5f62e`: el delta es documental y no altera los
  controles revisados (membresía/rol/tenant antes de firmar, clave server-side, `Content-Type`
  firmado, TTL 300, respuesta sin `r2_key`, CORS, `register` 501, tests).
- Observaciones no bloqueantes vigentes y registradas para F1-05/F1-16: sin E2E real contra R2
  (B-03, falta `R2_*`), CORS de bucket a cargo de DevOps, `register` atómico en F1-05 (task-86),
  rate limit en backlog (SEC-PR8-10).
- PR **mergeado** en `main@4f66816`; task-39 cerrada. Se conserva este reporte como evidencia del
  VETO inicial, su levantamiento y la aprobación final.

## Firma

`seguridad-privacidad` (08) — **APROBADO CON OBSERVACIONES, SIN VETO** para
`eb5f62e42b9a0bc1899c5de1710e5f14ce70e171` (PR #40, EF-08 presign), extendiendo la aprobación de
`99e948c` por delta documental. VETO anterior levantado; sin cambios de seguridad no revisados,
sin `docs/04` regresionado, sin secretos. Sin `git` de escritura, sin merge y sin publicar
secretos.
