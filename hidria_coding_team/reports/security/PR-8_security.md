# PR #8 — Revisión de Seguridad (F1-01b: auth EF, JWT y guardas)

- **Agente:** `seguridad-privacidad` (08) — autoridad de **veto**
- **Fecha:** 2026-11-07 20:25 (America/Mexico_City)
- **PR:** [#8](https://github.com/horaciomartinez-svg/hidria-ect/pull/8) — `feature/F1-01b-auth-ef` → `main`
  («feat(f1-01b): auth EF — middleware `_shared/auth.ts`, guardas de rol y 401 AUTH_INVALID»)
- **Head revisado:** `caaf071b9a124dd89a938467b94071b36611ee77` (3 commits, 5 archivos, +2487/−0;
  base del PR `main@6b95be06…`; `main` real al revisar `f83569a`; el PR solo agrega archivos nuevos
  → `mergeable_state: clean`). CI **4/4 `success`** en `caaf071` (runs `42438259343`/`42438262784`).
  **Delta posterior revisado (§9):** `a49681d9e6a098fb5137fcc845b1ffa78f0ab99c` (fix B1/M2;
  CI 4/4; clean).
- **Delta desde el código revisado inicialmente:** `21b2ca3..caaf071` = **2 archivos, +71/−31**,
  solo `tests/auth_test.ts` (fixtures del seed F1-01a: 005 admin, 006 invitado; +2 pruebas) y el
  reporte. **`auth.ts` y `errors.ts` son byte-idénticos** a `21b2ca3` (SHA-256 `24D3E218…` /
  `41AC09FE…`): el análisis de seguridad del código sigue vigente.
- **Alcance:** solo `supabase/functions/_shared/**` + reporte; **sin** migraciones, `supabase/tests`,
  `app/**`, `.github/**` ni `docs/**` (verificado con `git diff`). Sin cambios de DB.
- **Método:** revisión estática línea a línea de `auth.ts` (964 l) + `errors.ts` (165 l) + tests;
  ejecución local de la suite Deno 2.9.6 (`npx --yes deno@2 test`) y de casos límite propios;
  MCP GitHub para CI. Sin `git` de escritura, sin deploy, sin secretos.

## Veredicto: **APROBADO CON OBSERVACIONES — SIN VETO**

No se encontró ningún **BLOQUEANTE**: no hay bypass de autenticación ni de autorización,
no hay secretos ni `service_role` en cliente/repo, el algoritmo se restringe a HS256 con
verificación HMAC real, los claims y el rol de diagnóstico se resuelven como exige ADR-005, y
los errores no filtran stack/token. Las observaciones son de endurecimiento y de integración
(el primer EF debe cablear `verifyProfile`/`expectedIssuer`), más el follow-up de CI Deno y la
decisión de contrato de EF-08. El merge puede proceder con estas condiciones rastreadas.

## 1. Verificación JWT (superficie crítica)

| Caso | Resultado | Evidencia |
|---|---|---|
| Token ausente / header no-Bearer | **401 AUTH_INVALID** | tests SEC-04; código `extractBearerToken`/`authenticate` |
| JWT malformado / payload no-JSON / header o payload no-objeto | **401** | tests; `decodeJwt` + `isPlainObject` |
| Firma HMAC-SHA256 inválida (otro secreto) | **401** | test «firma inválida»; `crypto.subtle.verify` |
| `alg: none` | **401** (rechazado antes de verificar) | test; reproducción propia ✅ |
| `alg: RS256` / cualquier ≠ HS256 | **401** (`algoritmo_no_soportado`) | código + reproducción propia ✅ |
| Token expirado (`exp`) | **401** | test |
| `nbf` numérico futuro | **401** | test + reproducción propia ✅ |
| `nbf` string (`"9999999999"`) | **aceptado** (no se valida tipo) → **SEC-PR8-05 (MENOR)** | reproducción propia |
| `exp` string | **401** | reproducción propia ✅ |
| Sin `aud` / `aud` ≠ `authenticated` | **401** | código + reproducción propia; test aud anon |
| `aud` array que incluye `authenticated` | aceptado | reproducción propia ✅ |
| `iss` distinto del esperado (con `expectedIssuer`) | **401** | test |
| `iss` ausente y **sin** `expectedIssuer` | aceptado por diseño → **SEC-PR8-06 (MENOR/condición)** | código (opción opcional) |
| `exp` requerido | sí; sin `exp` ⇒ 401 | `assertClaimTimes` |
| `iat` no numérico | 401 | `assertClaimTimes` |
| Reloj | tolerancia 30 s configurable | `clockSkewSeconds` |
| Secreto vacío / EF sin secreto ni verificador | **500 INTERNAL_ERROR** (misconfig, no error del cliente) | test |
| Secreto | **inyectado** (`jwtSecret`/`verify`); `auth.ts` **no lee `Deno.env`** | grep + revisión |

- Verificación de firma con WebCrypto HMAC-SHA-256 (`importKey`+`verify`), no comparación manual:
  correcta y sin canal temporal explícito. Solo `alg === "HS256"`; se rechaza `none`/RS256/ES256
  sin ambigüedad de algoritmo. `signingInput` usa los segmentos originales codificados. ✅

## 2. Claims, tenant y roles

| Verificación | Resultado |
|---|---|
| `organization_id` canónico con **precedencia**; `tenant_id` alias | ✅ `buildAuthContext`; tests ADR-005 y reproducción propia |
| Ambos claims presentes y **distintos** ⇒ 401 `tenant_inconsistente` | ✅ test |
| `organization_id`/`tenant_id` malformados ⇒ 401 | ✅ test + código |
| Sin claim de tenant ⇒ **401 SEC-04** | ✅ test |
| `sub` obligatorio y UUID | ✅ test (ausente/inválido) |
| `global_role` obligatorio y en catálogo de **6** roles | ✅ test (ausente/fuera de catálogo); lista ADR-005 completa |
| Rol de diagnóstico **siempre resuelto en servidor** (`resolveRole` inyectable; `my_diagnostic_role` o `fn_diag_role` con `service_role`) | ✅ revisión: el módulo no lee rol/tenant/folio del body; `requireDiagnosticRole`/`guardEndpoint` solo usan el resolver inyectado |
| `admin_institucional` **no eleva** privilegios de diagnóstico | ✅ test añadido en `caaf071` (admin con rol diagnóstico `empresa` ⇒ 403 en EF-01) |
| Claims congelados en contexto; `accessToken` disponible para la EF | ✅ tests `Object.isFrozen` |

## 3. Guardas por endpoint y catálogo (`docs/04`)

Catálogo de **16 endpoints ↔ 13 EF**; contraste con la tabla de roles de `docs/04`
(l. 111–123): EF-01/02 coord·equipo; EF-03 coord·equipo·empresa; EF-04 submit empresa /
validate coord·equipo; EF-05/06 coord·equipo; EF-07 solo coordinador; EF-09/10 coord·equipo;
EF-11 autenticado; EF-12/13 solo coordinador — **coincide**. ✅

- `guardEndpoint` exige tenant, valida UUID del recurso (anti-enumeración: malformado ⇒
  `403 FORBIDDEN_NOT_MEMBER`), resuelve el diagnóstico del recurso (ruta o body) y aplica el rol
  resuelto en servidor; `any_member` solo verifica membresía; `authenticated` solo auth+tenant.
- Rutas: tolera `/functions/v1`, query, barra final; método POST; ruta fuera del catálogo ⇒
  `null` para que el router decida 404 (no se inventan códigos). ✅
- **Excepción de contrato EF-08 presign:** el catálogo lo deja en `authenticated` + tenant (sin
  membresía), mientras `docs/04` §EF-08 «Pre» dice «miembro del diagnóstico» (el `diagnostic_id`
  no viaja en el cuerpo de presign; Q-08). Es una **condición de integración (SEC-PR8-02)**:
  al implementar EF-08, el `r2_key` debe generarse con prefijo de tenant/usuario y `register`
  debe exigir membresía y validar que la clave coincida; o resolver Q-08 en spec/ADR.

## 4. Errores y fugas de información

| Verificación | Resultado |
|---|---|
| Envelope canónico `{ error: { code, message, details?, ref? } }` | ✅ `errors.ts`; `ref` opcional para `audit:<hash>` |
| Catálogo de códigos/HTTP de `docs/04` §8 | ✅ (incluye 401/403/409/422 prefijo/429/501/502/500) |
| Errores no controlados ⇒ **500 genérico**, sin stack ni mensaje interno | ✅ test `withAuth` |
| Token/secreto/claims en respuestas de error | No (mensajes canónicos; `details.reason`/roles no sensibles) ✅ |
| `AUTH_INVALID` por token malformado **con firma base64 inválida** | **HTTP 500** en lugar de 401 → **SEC-PR8-04 (MENOR)**: `base64UrlDecode(encodedSignature)` está fuera del `try` de `decodeJwt`; `withAuth` lo degrada a 500. Sin bypass; reproduce con token `header.payload.@@@` |
| Mensajes `INTERNAL_ERROR` personalizados (`auth: falta el secreto…`, `falta el parámetro…`) | se devuelven al cliente → **SEC-PR8-07 (MENOR)**: preferible mensaje genérico y detalle solo en log interno |
| `ref` de auditoría | la EF lo inyecta; el módulo no inventa hashes ni PII ✅ |
| Logs | `auth.ts`/`errors.ts` no importan/loguean; sin PII en logs ✅ |

## 5. Secretos, `service_role` y alcance

- **`auth.ts` no lee `Deno.env`** (solo comentarios): el secreto/verificador se inyecta desde la
  EF, lo que permite probar sin permisos y evita el log accidental del secreto. ✅
- **No hay `service_role`** en el código ni claves/valores; el rol de diagnóstico con
  `service_role` es una **inyección** documentada para las EF (`fn_diag_role`), no una clave en
  cliente. ✅
- **JWT de prueba** firmado con secreto sintético
  (`secreto-sintetico-f1-01b-sin-valor-real`), no es credencial del proyecto. ✅
- **Secret scan del diff**: 0 patrones (JWT/`ghp_`/`github_pat_`/`sbp_`/PEM); sin `.env`;
  sin tokens. ✅
- Alcance: 5 archivos nuevos (auth, errors, asserts, auth_test, reporte); **0** cambios en
  migraciones/`supabase/tests`/`app`/`.github`/`docs`. CI 4/4. ✅

## 6. Pruebas Deno (ejecución independiente)

- `npx --yes deno@2 --version` → **Deno 2.9.6**; suite de `caaf071` ejecutada en local:
  **`ok | 54 passed | 0 failed`** (reproducido; el reporte dice 54/54 tras `caaf071`).
- Cobertura revisada: 16 casos SEC-04, claims válidos/alias/precedencia, `verifyProfile`,
  verificador inyectado, misconfig 500, guardas de claims/diagnóstico, catálogo, guardas por
  endpoint (incl. admin sin elevación), pipeline/middleware, errores/envelope y `ref`.
- **Gaps de prueba (SEC-PR8-09):** no hay casos para firma base64 inválida, `nbf` string,
  `alg RS256/ES256` (solo `none`), límites de `exp`/skew, `iss` ausente sin `expectedIssuer` y
  `array` de audiencias; añadir en el follow-up.
- **El CI no ejecuta Deno** (solo guardas + cliente): la suite corre en local, no como check
  obligatorio → **SEC-PR8-03 (MAYOR de proceso, condición)**: job Deno en CI antes de la primera
  EF (`task-13`/F1-19); el propio reporte lo declara (§8.1).

## 7. Hallazgos

### BLOQUEANTES

**Ninguno.** No se halló bypass de autenticación/autorización, ni secretos/`service_role` en
cliente/repo, ni fuga de token/stack, ni endpoints sin guarda en el catálogo.

### MAYORES — condiciones de integración/entorno (no veto)

| ID | Hallazgo | Acción requerida |
|---|---|---|
| **SEC-PR8-01** | `verifyProfile` es **opcional** y aún no se conecta a `profiles`: un JWT válido de un perfil eliminado o con `organization_id` distinto del claim seguiría aceptándose hasta su `exp` (SEC-04 parcial). | Cablear `verifyProfile` en la primera EF con DB (EF-01/EF-03, F1-06) y prueba de integración; mientras no exista, documentar el hueco (el reporte §8.4 ya lo declara). |
| **SEC-PR8-02** | **EF-08 presign** está en política `authenticated`+tenant (sin membresía), mientras `docs/04` «Pre» exige miembro del diagnóstico; el `diagnostic_id` no está en el cuerpo de presign (Q-08). | Al implementar EF-08: generar `r2_key` con prefijo del tenant/usuario desde el contexto verificado (nunca clave libre del cliente), exigir membresía y validar la clave en `register`; o resolver Q-08 en spec/ADR. |
| **SEC-PR8-03** | El **CI no ejecuta la suite Deno**: 54 pruebas críticas de autenticación no son check obligatorio; cualquier regresión futura pasaría desapercibida. | Job `denoland/setup-deno` + `deno lint/check/test` (con `task-13`/F9-19) antes de la primera EF; el reporte ya lo tiene como follow-up. |

### MENORES — endurecimiento

| ID | Hallazgo | Acción |
|---|---|---|
| **SEC-PR8-04** | Token con **firma base64 inválida** ⇒ `InvalidCharacterError` no capturado ⇒ `withAuth` responde **500 INTERNAL_ERROR** en lugar de 401 AUTH_INVALID (reproducido). No hay bypass ni fuga. | Envolver `base64UrlDecode(encodedSignature)` en el `try` de `decodeJwt` (mismo tratamiento que header/payload) y añadir test. |
| **SEC-PR8-05** | `nbf` **no numérico** (p. ej. `"9999999999"`) se ignora → token aceptado; `exp`/`iat` sí validan tipo. Requiere token firmado por el emisor; no permite forjar. | Validar `typeof nbf === "number"` cuando esté presente (401 `token_no_vigente_aun`/`nbf_invalido`) + test. |
| **SEC-PR8-06** | `expectedIssuer` es opcional: sin él no se valida `iss`. El ejemplo de integración sí lo pasa. | La EF debe inyectar siempre `expectedIssuer` desde `SUPABASE_URL`; añadir comprobación en la plantilla/primera EF. |
| **SEC-PR8-07** | Mensajes de `INTERNAL_ERROR` personalizados (falta de secreto, parámetro de ruta ausente) se devuelven al cliente. | Mensaje genérico para 500; detalle solo en log interno (sin PII). |
| **SEC-PR8-08** | Respuestas 401 sin `WWW-Authenticate` ni `Cache-Control: no-store`; hardening de caché/proxy. | Añadir headers en `errorResponse` (no-store en auth/403) y/o en la EF. |
| **SEC-PR8-09** | Faltan pruebas de los casos límite de §6; `guardEndpoint` con parámetro de cuerpo ausente devuelve 500 (hoy testeado como tal) aunque el contrato de validación prefiere 422. | Añadir casos; alinear 422 en validación de body de cada EF. |
| **SEC-PR8-10** | Rate limit API-04 (100 req/min) no está en el módulo. | Se implementa en EF/WAF (Cloudflare) como ya prevé `docs/07`; verificar en el primer EF. |

### Observaciones (sin acción)

- El token de acceso y los claims completos viajan en `AuthContext` para uso de la EF: **nunca
  deben loguearse ni devolverse**; el módulo no lo hace.
- `forbiddenRole` devuelve `rol_actual`/`roles_permitidos`: información no sensible y útil al
  cliente; aceptable.
- HS256 legacy: si el proyecto adopta JWT asimétrico (JWKS), la interfaz `verify` ya permite
  inyectar un verificador; el reporte lo declara (8.3).
- E3: hook no activo → pruebas con claims simulados idénticos a los reales (el hook y los
  helpers fail-closed se revisaron en PR #7); sin impacto en este PR.

## 8. Conclusión y condiciones

- **Auth de EF correctamente diseñado e implementado** para el alcance: verificación HS256 real,
  `none`/algoritmos alternos rechazados, `exp`/`nbf`/`iat` y `aud`/`iss` contemplados, claims
  ADR-005 con precedencia e inconsistencia rechazada, rol de diagnóstico server-side,
  `admin_institucional` sin elevación, errores canónicos sin stack/token, sin secretos ni
  `service_role` en cliente/repo, 54/54 pruebas Deno en local y CI 4/4.
- **APROBADO CON OBSERVACIONES (sin veto)**. Condiciones para el merge/primeras EF (todas ya
  declaradas en el reporte del autor o en este informe):
  1. Cablear `verifyProfile` y `expectedIssuer` en la primera EF (SEC-PR8-01/06).
  2. Resolver EF-08 presign (Q-08) con claves namespaced por tenant y membresía en `register`
     (SEC-PR8-02).
  3. Añadir job Deno al CI antes de la primera EF (SEC-PR8-03; `task-13`/F1-19).
  4. Corregir 401 de firma base64 inválida y validar `nbf` no numérico, con tests (SEC-PR8-04/05);
     y las mejoras SEC-PR8-07/08.
- Sin fuga de secretos, sin datos personales y sin cambios de BD; no se ejecutó deploy ni merge.

## 9. Re-revisión delta `caaf071..a49681d` — **APROBADO CON OBSERVACIONES se mantiene**

- **Head:** `a49681d9e6a098fb5137fcc845b1ffa78f0ab99c` (4 commits; delta de seguridad = **3 archivos,
  +135/−53**: `auth.ts` (+45/−38), `errors.ts` (+10), `tests/auth_test.ts` (+95/−15); CI **4/4
  `success`** en `a49681d` (runs `42438884478`/`42438887996`); `mergeable_state: clean`). Alcance
  respetado: `supabase/functions/_shared/**` + reporte; sin migraciones/`docs`/`app`.
- **Deno local sobre `a49681d`:** `npx --yes deno@2 test …` → **58/58 passed** (reproducido).

### 9.1 SEC-PR8-04 (B1) — **CORREGIDO** ✅

- `decodeJwt` decodifica la firma **dentro del `try`** (y valida segmentos no vacíos); una firma
  base64url malformada (`%%%`) o vacía lanza `DOMException` y se mapea a **401 AUTH_INVALID**
  (`formato_token`), nunca 500. Re-simplementado `catch` que re-lanza `ApiError` y convierte
  cualquier otra excepción en `authInvalid`.
- **Reproducción propia:** `authenticate` → `AUTH_INVALID/401`; `withAuth` → **HTTP 401**
  con envelope canónico, handler no ejecutado, sin `ref` ni stack. Tests nuevos B1 (ambos casos)
  en verde. Sin fuga de detalles internos.

### 9.2 SEC-PR8-09 (M2) — **CORREGIDO** (parámetros del cliente) ✅

- `guardEndpoint`: parámetro de recurso **faltante/vacío** ahora lanza
  `VALIDATION_PARAMETRO_REQUERIDO` (**422**, `details: { param }`), no 500. Los fallos de
  **configuración** de la EF (dependencia `resolveDiagnosticId`/`resolveRole` sin inyectar)
  siguen siendo 500 INTERNAL_ERROR, que es lo correcto.
- `authorizeEndpoint` EF-08 register sin `body.diagnostic_id` → **422** (test nuevo).
- Tests M2 en verde; mensaje incluye solo el nombre del parámetro (no datos sensibles).

### 9.3 Sin regresión de seguridad

| Verificación | Resultado |
|---|---|
| HS256 / `alg:none` / `alg:RS256` / firma inválida / exp / nbf numérico / aud / sub / claims ADR-005 / roles / guardas / admin sin elevación / errores sin stack | ✅ suite completa **58/58** |
| Claims con `organization_id` inválido y `tenant_id` válido | aceptado con **fallback** a `tenant_id` (alineado con `current_org_id` de F1-01a); sin claims utilizables → 401 ✅ |
| `Deno.env` / `service_role` / `console` en código | **0** (solo comentarios); secreto inyectado ✅ |
| Secret scan del delta | **0** patrones ✅ |
| Alcance del delta | 3 archivos `_shared/**`; sin migraciones/`docs`/`app`/`.github` ✅ |

### 9.4 Observaciones del delta (no bloquean; condiciones rastreadas)

| ID | Severidad | Hallazgo | Acción |
|---|---|---|---|
| **SEC-PR8-11** | MENOR (defensa en profundidad / contrato) | El delta **elimina el 401 por `organization_id` ≠ `tenant_id`**: ahora se aplica precedencia (`organization_id` > `tenant_id`) y respaldo si el canónico no es UUID, alineado con `current_org_id()` de la BD/ADR-005. **No hay ruta de falsificación** (JWT firmado; el hook emite ambos iguales), pero se pierde el rechazo explícito de claims inconsistentes. | Documentar en ADR/contrato (ADR-005) y, cuando se cablee `verifyProfile` (SEC-PR8-01), **comparar profile.organization_id con el tenant canónico**; opcionalmente alertar/loguear si ambos claims difieren. Mantener test de precedencia (ya añadido). |
| **SEC-PR8-05** | MENOR (previo) | `nbf` **no numérico** se sigue ignorando (reproducido: `nbf:"9999999999"` → aceptado). No permite forjar (token firmado). | Validar tipo de `nbf` cuando exista + test (junto con los menores del reporte original). |
| **SEC-PR8-02 / Q-08** | MAYOR (rastreado) | El catálogo mantiene `EF-08.presign` en `authenticated`+tenant; el delta **solo actualiza el comentario** para referir `M1/Q-08 → task-39`. No se “arregló” unilateralmente. | **task-39** antes de F1-05 (ADR/spec + claves R2 namespaced + membresía en register). |
| **SEC-PR8-01/03/10** | Condiciones previas | `verifyProfile` → primera EF; job Deno en CI → task-13; rate limit API-04 → EF/WAF. | Rastreadas; no cambian el veredicto. |
| **Doc** | MENOR | El reporte del autor (`F1-01b_auth_ef.md`) sigue citando `caaf071`/54 pruebas; el supervisor ya avisó de un 5.º commit **documental** (solo reporte) sobre `a49681d`. | Confirmar en el delta documental que el único cambio es el reporte; sin re-revisión de seguridad del código. |
| **errors.ts** | OBS | Se agregan `GATE_R2_FICHA`/`GATE_R3_FICHA` (409) documentados como hueco de `docs/04` §8 para F1-18. | Sin impacto de seguridad; mantener nota de sincronización documental. |

### 9.5 Conclusión del delta

**La aprobación de seguridad se mantiene: APROBADO CON OBSERVACIONES, SIN VETO** para
`a49681d`: B1 y M2 corregidos y verificados (firma inválida → 401 sin fugas; parámetros del
cliente → 422; config de EF → 500), sin regresión de HS256/claims/roles/errores, 58/58 pruebas
Deno en local, sin secretos y CI 4/4. Residuales: SEC-PR8-11 (claims inconsistentes: precedencia,
documentar/verifyProfile), SEC-PR8-05 (`nbf` tipo), SEC-PR8-01/02/03/10 ya rastreados. El merge
corresponde a `supervisor-hidria` con spec/QA y CI verde.

### 9.6 Confirmación del head final `00f2ed1` (delta solo documental)

- **Head final PR #8:** `00f2ed1fdd9b01e318d7711fe2012cb9574f43ee`; delta `a49681d..00f2ed1` =
  **1 archivo, +55/−38**, exclusivamente `reports/F1/F1-01b_auth_ef.md` (reporte al head final,
  58/58 pruebas, E3 resuelta citando F0-14). **Sin cambios en `auth.ts`, `errors.ts` ni tests.**
  CI **4/4 `success`** en `00f2ed1` (runs `42439240740`/`42439244147`); `mergeable_state: clean`;
  secret scan del delta **0**.
- El código de seguridad evaluado sigue siendo el de **`a49681d`** (idéntico en este head); el
  delta es exclusivamente documental. **M1/Q-08 sigue en `task-39`** y no se alteró el catálogo
  de EF-08.
- **El veredicto APROBADO CON OBSERVACIONES SIN VETO de §9 se mantiene para `00f2ed1`**;
  condiciones residuales sin cambios (§9.4: SEC-PR8-11, SEC-PR8-05, SEC-PR8-01/02/03/10).

## Firma

`seguridad-privacidad` (08) — **APROBADO CON OBSERVACIONES** (sin veto) para el PR #8 en el head
final `00f2ed1fdd9b01e318d7711fe2012cb9574f43ee`: código evaluado `caaf071`/`a49681d` (delta
`caaf071..a49681d` corrige B1/M2 sin regresión de seguridad) y delta `a49681d..00f2ed1` solo
documental. Aprobación de seguridad emitida; el merge corresponde a `supervisor-hidria` con
CI verde (4/4), spec aprobado y las condiciones de §7–§9 rastreadas (SEC-PR8-11, SEC-PR8-05,
SEC-PR8-01, SEC-PR8-02/Q-08→task-39, SEC-PR8-03, SEC-PR8-10). Sin `git` de escritura, sin merge
y sin publicar secretos.
