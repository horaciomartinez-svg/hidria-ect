# Revisión de especificaciones — PR #8 — feat(f1-01b): auth EF y middleware `_shared/auth.ts`

- **Revisor:** `revisor-especificaciones` (agente 06)
- **Fecha:** 2026-11-07 20:26 (America/Mexico_City)
- **PR:** [#8](https://github.com/horaciomartinez-svg/hidria-ect/pull/8) — `feature/F1-01b-auth-ef` → `main`
- **Head revisado:** `caaf071b9a124dd89a938467b94071b36611ee77` (3 commits, 5 archivos, +2487/−0; base del PR `6b95be0`; `main` actual `f83569a`; `mergeable_state: clean`).
- **CI en `caaf071`:** 4/4 `success` (runs `42438259343` y `42438262784`, `Guardas de repositorio` + `Cliente`).
- **Delta `21b2ca3..caaf071`:** solo `tests/auth_test.ts` (+52/−13) y el reporte (+19/−18); **`auth.ts`/`errors.ts` sin cambios**. Las fixtures se alinean al seed F1-01a (005 admin, 006 invitado) y se añaden pruebas de no-escalada de `admin_institucional` y EF-11 (observador/admin/invitado).
- **Veredicto:** **CAMBIOS SOLICITADOS.** 1 BLOQUEANTE (JWT con firma base64url malformada ⇒ 500 en vez de `401 AUTH_INVALID`), 2 MAYORES (EF-08 presign diverge de `docs/04` §4 EF-08; parámetros faltantes del cliente ⇒ 500) y observaciones menores.

---

## 1. Alcance y método

Revisados en `caaf071`: `supabase/functions/_shared/auth.ts`, `_shared/errors.ts`, `_shared/tests/asserts.ts`, `_shared/tests/auth_test.ts` y `reports/F1/F1-01b_auth_ef.md`; contraste con `docs/04` §2.1/§3/§4/§8, ADR-005 y F1-01a. `auth.ts`/`errors.ts` son idénticos a `21b2ca3` (el delta final solo toca tests/reporte). Prueba de comportamiento del parser Deno ejecutada en local (Deno 2.9.6, solo lectura, importando el `auth.ts` revisado); no se modificó código.

---

## 2. Lo que PASA

| Criterio | Resultado | Evidencia |
|---|---|---|
| Claims ADR-005: `organization_id` con precedencia, `tenant_id` alias, `global_role` 6 roles | ✅ en lo esencial | `buildAuthContext` normaliza `organization_id ?? tenant_id`, valida UUID, `sub` y `global_role` contra `GLOBAL_ROLES` (6); tests «ADR-005»; `GLOBAL_ROLES` incluye `invitado`. |
| `401 AUTH_INVALID` por token/claim ausente, expirado, `nbf`, firma/alg, `sub`, `aud`, `global_role`, tenant | ✅ para los casos cubiertos | 16 tests SEC-04; envelope canónico; ver B1 para un caso malformado no cubierto. |
| `403 FORBIDDEN_ROLE` / `FORBIDDEN_NOT_MEMBER` | ✅ | `requireGlobalRole`, `requireDiagnosticRole`; no miembro/recurso ajeno/id malformado; tests. |
| Catálogo 16 endpoints ↔ EF-01…EF-13 | ✅ en cantidad/rutas | `ENDPOINTS` con 16 IDs; rutas y métodos coinciden con `docs/04` §3/§4; sin endpoints inventados. |
| Política de rol por endpoint | ⚠️ **una divergencia** | EF-01/02/03/04/05/06/07/09/10/11/12/13 alineadas a `docs/04` §4 (EF-04 submit `empresa/coordinador/equipo` coincide con Pre de §4); **EF-08.presign** no (ver M1). |
| Rol de diagnóstico siempre servidor-side | ✅ | `resolveRole` inyectable; no se lee rol/tenant/folio del body; `admin_institucional` no eleva. |
| Errores canónicos/envelope sin stack | ✅ en general | `errors.ts`: `AUTH_INVALID` 401, `FORBIDDEN_*` 403, envelope `{error:{code,message,details?,ref?}}`, `ref` opcional; `withAuth` degrada desconocidos a 500 genérico; tests. |
| Sin `service_role`/secretos en cliente/repo | ✅ | `auth.ts` no lee `Deno.env`; no hay claves; solo comentarios de `service_role`; tests con secreto sintético. |
| Alcance | ✅ | 5 archivos: `_shared/auth.ts`, `_shared/errors.ts`, `_shared/tests/*` y reporte; 0 en `supabase/migrations/`, `supabase/tests/`, `app/`, `.github/`, `docs/`. |
| CI y regresión | ✅ | 4/4 en `caaf071`; sin tocar `docs/02`/base; sin secretos en el diff. |
| Tests Deno | ⚠️ 54/54 locales | Reporte §5; **el CI no ejecuta Deno** (riesgo 8.1 declarado; task-13). No bloquea por sí mismo, pero no es check obligatorio. |
| Riesgos declarados | ✅ rastreados en reporte | CI sin Deno (8.1), `config.toml`/`deno.json` (8.2), JWT asimétrico (8.3), `verifyProfile` (8.4), Q-08 presign (8.5), E3 (8.7). M1/Q-08 requiere además tarea/ADR (ver M1). |

---

## 3. Hallazgos

### B1 — BLOQUEANTE: firma base64url malformada ⇒ 500, no 401

**Archivo:** `supabase/functions/_shared/auth.ts`, `decodeJwt` (L167-194).

El `try/catch` cubre `header` y `payload`, pero **no** la decodificación de la firma:

```ts
try {
  header = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedHeader)));
  claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload)));
} catch {
  throw authInvalid({ reason: "formato_token" });
}
...
signature: base64UrlDecode(encodedSignature),   // fuera del try
```

Un JWT con header/payload válidos y un segmento de firma con caracteres no base64url (p. ej. `...%%%`) lanza `DOMException` en `base64UrlDecode`; `authenticate` no lo convierte y `withAuth` lo degrada a **500 `INTERNAL_ERROR`**, no a `401 AUTH_INVALID`. Prueba local (Deno 2.9.6, importando el archivo revisado):

```text
THREW DOMException 5 undefined Failed to decode base64
```

Esto contradice `docs/04` §2.4/§8 y el propio reporte §2.4 («JWT malformado ⇒ 401 AUTH_INVALID») y la matriz de pruebas (solo prueba `a.b.c`, que falla antes por header/payload). **Fix:** decodificar la firma dentro del `try` (o capturar `DOMException` y lanzar `authInvalid({reason:"formato_token"})`) y añadir un test con header/payload válidos + firma `%%%`, incluyendo `withAuth` → 401.

### M1 — MAYOR: EF-08.presign diverge de `docs/04` §4 EF-08

**Archivo:** `auth.ts` catálogo, `EF-08.presign` (política `{kind:"authenticated"}`, `scope:null`, `tenantRequired:true`); `docs/04` §4 EF-08 (Pre): «Miembro del diagnóstico que contendrá el documento (el `diagnostic_id` va en el cuerpo de `register`)»; tabla §3 L118: EF-08 = «miembro diagnóstico».

El catálogo da por válido que **cualquier autenticado del tenant** obtenga una URL prefirmada de subida sin comprobar membresía; solo `register` exige membresía. El código lo comenta como Q-08 y el reporte lo declara en §8.5, pero **no hay ADR, corrección de `docs/04` ni tarea compartida que rastree Q-08** (la búsqueda en `tasks/`/`docs/` no encuentra Q-08). La tarea exige «política exacta de `docs/04` … sin contratos divergentes». La subida R2 ocurre antes de `register`, por lo que la ventana de URL sin membresía es real. **Acción:** añadir `diagnostic_id` al cuerpo de presign y validar membresía, o un ADR que acepte explícitamente presign auth+tenant y lo documente en `docs/04`/F1-05; registrar Q-08 en una tarea si se mantiene.

### M2 — MAYOR: parámetro faltante del cliente ⇒ 500 `INTERNAL_ERROR`

**Archivo:** `auth.ts`, `guardEndpoint` (rama `resourceId === undefined` / `scope.inBody`).

Si el cliente omite `diagnostic_id` en `EF-08.register`/`EF-09` (body) o el parámetro de ruta, `guardEndpoint` lanza `ApiError("INTERNAL_ERROR")` (500); el test `guardEndpoint: falta el parámetro de ruta ⇒ 500` lo fija. Un error de payload/entrada del cliente no es un error interno del servidor: `docs/04` §8 reserva 500 para fallos no controlados y espera 422/403 para validación/membresía. **Acción:** distinguir la falta de dependencia inyectada (500) de un parámetro ausente del request (422 `VALIDATION_*` o 403 `FORBIDDEN_NOT_MEMBER`), y actualizar test.

### Observaciones menores

| # | Archivo | Observación |
|---|---|---|
| m1 | `auth.ts` `buildAuthContext` | Si `organization_id` es inválido y `tenant_id` válido ⇒ 401; si ambos difieren ⇒ 401 `tenant_inconsistente`; la BD (`current_org_id`) usa precedencia/fallback. Es más estricto (no fail-open), pero conviene documentarlo/alinearlo con ADR-005/F1-01a. |
| m2 | `reports/F1/F1-01b_auth_ef.md` §6.4 y PR | El reporte/PR citan CI y head de código `ad665d9`/`21b2ca3`; el head final es `caaf071`. Actualizar la evidencia al head final y sus runs (`42438259343`/`42438262784`). |
| m3 | `errors.ts` vs `docs/04` | `docs/04` §4 EF-04/EF-05 mencionan `GATE_R2_FICHA`/`GATE_R3_FICHA`, ausentes de §8 y de `HTTP_STATUS_BY_ERROR_CODE`; si una EF los lanza, `statusForErrorCode` devuelve 500. Es una inconsistencia documental preexistente; alinear en F1-18 o añadirlos al catálogo. |
| m4 | CI | Sin job Deno (riesgo 8.1); las 54 pruebas no son check obligatorio. No bloquea por la excepción acordada, pero debe quedar una tarea de DevOps/QA además de task-13. |
| m5 | `verifyProfile` | Pendiente de `_shared/db.ts` (riesgo 8.4); SEC-04 queda parcialmente cubierto en perfil/tenant hasta la primera EF con DB. Rastreado, no bloquea. |
| m6 | Q-08 | No aparece en `tasks/`/`docs/`; solo en el reporte §8.5 y comentario del código. Si M1 se acepta como riesgo, crear tarea/ADR con dueño y criterio de cierre. |

---

## 4. Conclusión

**CAMBIOS SOLICITADOS.** La estructura del middleware, el modelo de claims, las guardas y el envelope canónico están bien construidos y los 54 tests locales (reporte) cubren la mayoría de SEC-04/roles. Pero **B1** es un fallo real de la ruta de error (500 en lugar de 401) que contradice el contrato y no está probado; **M1** mantiene una divergencia de política EF-08 no rastreada fuera del reporte; **M2** devuelve 500 ante entrada de cliente faltante.

**Criterio de re-revisión acotada:**

- [ ] **B1:** decodificar la firma dentro del `try`/capturar `DOMException` → `AUTH_INVALID`; test con firma base64url inválida y `withAuth` 401.
- [ ] **M1:** resolver EF-08 presign (diagnostic_id + membresía, o ADR/docs que acepte auth+tenant y tarea Q-08) antes de F1-05; no dejar solo el reporte.
- [ ] **M2:** 4xx canónico para parámetros faltantes del cliente; 500 solo para dependencia/configuración interna; test actualizado.
- [ ] m1–m6: actualizar head/CI del reporte, documentar Q-08, alinear claims con F1-01a y, si aplica, `GATE_R2_FICHA`/`GATE_R3_FICHA`.

Con B1/M2 corregidos y M1 resuelto o aceptado por ADR/tarea, el PR pasa a **APROBADO**; seguridad y QA siguen pendientes. No se ejecutaron comandos Git de escritura ni merges; este reporte es el único archivo escrito. Las comprobaciones fueron de solo lectura (Deno local y archivos del PR).

---

# Anexo final — Re-revisión delta PR #8 (`a49681d`, APROBADO)

- **Head de código revisado:** `a49681d9e6a098fb5137fcc845b1ffa78f0ab99c` (4 commits, 5 archivos, +2569; base `6b95be0`; `main` `e21a665`; `mergeable_state: clean`).
- **CI:** 4/4 `success` en `a49681d` (runs `42438884478` y `42438887996`).
- **Delta `caaf071..a49681d`:** `auth.ts` (+45/−38), `errors.ts` (+10), `tests/auth_test.ts` (+80/−15); **sin cambios de alcance/catálogo**.
- **Veredicto vigente:** **APROBADO** (sustituye el CAMBIOS SOLICITADOS anterior para el merge).
- **Condición documental:** el supervisor anunció un 5.º commit que solo actualiza `reports/F1/F1-01b_auth_ef.md` (head/CI, E3/F0-14, 58/58). La aprobación se mantiene si el diff de ese commit es **exclusivamente el reporte**; si no llega, el reporte queda con datos viejos (observación no bloqueante, código igual).

## Verificación

| Punto | Resultado | Evidencia |
|---|---|---|
| **B1** firma base64url malformada → 401 | ✅ **Corregido** | `decodeJwt` decodifica header/payload/**firma** dentro del `try`, re-lanza `ApiError` y convierte `DOMException` en `authInvalid({reason:"formato_token"})`; casos vacío/`%%%`; tests `BLOQUEANTE B1` y `withAuth` 401. |
| **M2** parámetros de cliente faltantes → 4xx | ✅ **Corregido** | `guardEndpoint` lanza `VALIDATION_PARAMETRO_REQUERIDO` (422 por prefijo `VALIDATION_*`) con `details.param`; el 500 queda solo para `resolveDiagnosticId`/configuración; tests EF-01 y EF-08 register sin `body.diagnostic_id`. |
| **Sin regresión de catálogo** | ✅ | 16 endpoints/13 EF sin cambios; EF-08.presign conserva su política y el comentario apunta a **task-39** (M1/Q-08 no se arregló unilateralmente). |
| **Claims ADR-005** | ✅ Mejorado | Ahora usa el primer UUID válido de `[organization_id, tenant_id]` (precedencia + respaldo), sin rechazar ambos si difieren; alineado con `current_org_id()` de F1-01a; tests actualizados. |
| **Errores** | ✅ Mejorado | `errors.ts` añade `GATE_R2_FICHA`/`GATE_R3_FICHA` (409) que `docs/04` §4 referencia; envelope/ref sin cambios; sin stack. |
| **Sin `Deno.env`/secretos** | ✅ | `auth.ts`/`errors.ts` solo reciben `jwtSecret`/`verify` inyectados; comentarios de `service_role`; sin claves. |
| **Pruebas** | ✅ 58/58 locales | Suite Deno ejecutada sobre estos archivos: **58 passed, 0 failed**; incluye B1 (2), M2 (2), claims, no-escalada admin y catálogo. |
| **Alcance/CI** | ✅ | 5 archivos en `_shared/**` + reporte; 0 en migraciones/tests/app/.github/docs; CI 4/4; sin secretos. |
| **M1/Q-08** | ⏳ task-39 | El código mantiene presign auth+tenant y comenta la decisión pendiente; el reporte deberá actualizarse a `task-39` en el commit documental. No bloquea #8; sí debe resolverse antes de F1-05. |

## Observaciones menores

1. **Reporte aún con datos viejos en `a49681d`:** sigue diciendo 54/54, CI sobre `ad665d9`/`21b2ca3` y `guardEndpoint` con 500 por parámetro faltante; el 5.º commit documental debe actualizar a 58/58, `a49681d` y M2 corregido. No bloquea el código.
2. PR body sigue con «53 pruebas» y heads antiguos; actualizar junto con el reporte (el supervisor lo hará en el commit documental).
3. `verifyProfile` (riesgo 8.4) y CI sin Deno (8.1) siguen rastreados; no bloquean por excepción acordada.
4. M1/Q-08: mantener `task-39` como decisión/ADR antes de F1-05; no cerrar por el comentario del código.

## Conclusión

**APROBADO** para el squash de PR #8 sobre `a49681d` (y sobre el head documental si este solo añade el reporte). B1 y M2 están corregidos con tests; catálogo/claims/errores sin regresión; M1 queda en task-39. No se ejecutaron comandos Git de escritura ni merges; este anexo es el último de `PR-8_spec.md`.

---

## Constancia — head documental final `00f2ed1` (APROBADO se mantiene)

- **Head final del PR:** `00f2ed1fdd9b01e318d7711fe2012cb9574f43ee` (5.º commit; base original `6b95be0`; CI 4/4 `success` runs `42439240740` y `42439244147`; `mergeable_state: clean`).
- **Delta `a49681d..00f2ed1` verificado por API:** **1 archivo, +55/−38**, exclusivamente `hidria_coding_team/reports/F1/F1-01b_auth_ef.md`; **sin cambios** en `auth.ts`, `errors.ts`, tests ni otros archivos.
- **Consecuencia:** el código evaluado sigue siendo `a49681d`; el 5.º commit solo actualiza la evidencia (head/CI, E3 resuelta citando F0-14, 58/58 pruebas, respuesta a las re-revisiones). **El APROBADO de este reporte se mantiene para `00f2ed1`.**
- **M1/Q-08:** sigue rastreado en **task-39** (decisión/ADR antes de F1-05); no se arregló unilateralmente.
- No se ejecutaron comandos Git de escritura ni merges; esta constancia cierra la revisión de especificaciones de PR #8.
