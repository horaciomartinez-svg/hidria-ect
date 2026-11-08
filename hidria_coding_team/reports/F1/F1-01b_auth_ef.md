# F1-01b — Auth EF: `_shared/auth.ts`, guardas de rol y `401 AUTH_INVALID`

- **Agente:** `dev-edge-functions` (03)
- **Fecha:** 2026-11-07 20:15 (America/Mexico_City) · **act. 20:40** (spec review B1/M2 y re-evidencia)
- **Tarea compartida:** `task-21` — «F1 · F1-01b Auth EF: `_shared/auth.ts`, guardas de rol y 401 AUTH_INVALID»
- **Tarea base:** `hidria_coding_team/tasks/F1/F1-01_auth_claims.md` (parte EF; DB = `task-20`, cliente = F1-02)
- **Rama:** `feature/F1-01b-auth-ef` desde `origin/main` (`b4fbc83`; mergeada en `main@424ca01` vía squash)
- **PR:** [#8](https://github.com/horaciomartinez-svg/hidria-ect/pull/8) · **head final:** `00f2ed1` · **commits:** `ad665d9` (código) · `21b2ca3` (evidencia) · `caaf071` (fixtures F1-01a) · `a49681d` (**spec review B1/M2**) · `00f2ed1` (evidencia final, solo reporte)
- **CI:** **4/4 success** en `ad665d9`, `21b2ca3`, `caaf071`, `a49681d` y `00f2ed1` (runs `42437498288`/`42437478826`, `42437655176`/`42437650326`, `42438259343`/`42438262784`, `42438884478`/`42438887996`, `42439240740`/`42439244147`); checks «Guardas de repositorio» + «Cliente (lint + typecheck + build)». **Merge squash `424ca01`** (2026-11-08); sin force-push, rama conservada en `00f2ed1`.
- **Entorno:** Windows / PowerShell 5.1 · Deno **2.9.6** (vía `npx --yes deno@2`, sin Docker)
- **Alcance respetado:** solo `supabase/functions/_shared/**` (+ este reporte). No se tocó
  `supabase/migrations/**`, `supabase/tests/**`, `app/**`, `.github/**` ni `docs/**`.

## Resultado: **VERDE**

| Criterio de aceptación | Estado | Evidencia |
|---|---|---|
| Middleware/guardas en `_shared/auth.ts` para EF-01…EF-13 | ✅ | §2, §3; catálogo de 16 endpoints ↔ 13 EF |
| Claims `organization_id` (precedencia), `tenant_id` (alias), `global_role` según ADR-005 | ✅ | §2.1; tests «ADR-005: …» |
| Roles `coordinador`/`equipo`/`empresa`/`observador`/`admin_institucional` + diagnóstico | ✅ | §2.2–§2.3; `GLOBAL_ROLES`, `DIAGNOSTIC_ROLES` |
| **`401 AUTH_INVALID`** sin claim requerido (SEC-04) y sin token/expirado/firma inválida (incluida firma base64url malformada, B1) | ✅ | §2.4; 19 tests SEC-04 |
| 403 cuando el rol no alcanza (`FORBIDDEN_ROLE` / `FORBIDDEN_NOT_MEMBER`) | ✅ | §2.5; tests de guardas |
| Pruebas de claims ausentes/incorrectos/rol insuficiente/válido | ✅ | **58/58 tests Deno en verde** (§5) |
| E3 **resuelta** (hook activo verificado en F0-14) y pruebas con claims simulados deterministas | ✅ | §7 |
| Sin secretos, sin `service_role` en cliente/repo, sin `.env` | ✅ | §6.3 |

---

## 0.1 Respuesta a la spec review (PR #8, head `a49681d`)

| Hallazgo | Severidad | Estado | Evidencia |
|---|---|---|---|
| **B1** firma base64url malformada ⇒ 500 | Bloqueante | **Corregido**: `decodeJwt` decodifica header, payload **y firma** dentro del `try`; `%%%` (y firma vacía) ⇒ `401 AUTH_INVALID` (`formato_token`), nunca 500 | §5 (2 pruebas + caso `withAuth`) y §6.1; commit `a49681d` |
| **M2** parámetros de cliente faltantes ⇒ 500 | Mayor | **Corregido**: parámetro obligatorio ausente ⇒ `422 VALIDATION_PARAMETRO_REQUERIDO` con `details.param`; solo los fallos de configuración de la EF (dependencias sin inyectar) devuelven 500 | §2.5 y §5 |
| **M1/Q-08** EF-08.presign sin membresía | Mayor | **Rastreado, no corregido** por indicación del supervisor: **task-39** (ADR + corrección de `docs/04` antes de F1-05). Hoy presign = autenticado + tenant; la membresía se exige en `register` | §3, §8.5 |
| Reporte con head/CI antiguos | Menor | Corregido en el commit documental de esta re-evidencia | §6.4 |
| Claims más estrictos que F1-01a | Menor | **Alineado**: `organization_id` con precedencia y `tenant_id` como respaldo (misma semántica que `current_org_id()`), sin rechazo por mismatch | §2.1, §2.4 |
| `GATE_R2_FICHA`/`GATE_R3_FICHA` ausentes del catálogo | Menor | **Corregido**: añadidos en `errors.ts` con HTTP 409 (códigos de los contratos EF-04/EF-05 ausentes en la tabla §8; hueco de `docs/04` para F1-18) | §2.5, §5 |
| CI sin job Deno / `verifyProfile` en primera EF | Menor | Rastreados: `task-13` (CI) y **SEC-PR8-01** (primera EF) | §8.1, §8.4 |

---

## 1. Entregables

| Archivo | Líneas | Contenido |
|---|---|---|
| `supabase/functions/_shared/auth.ts` | 971 | Middleware de autenticación, verificación HS256 (firma malformada ⇒ 401), contrato de claims, guardas (`requireTenant`, `requireGlobalRole`, `requireDiagnosticRole`, `guardEndpoint`), catálogo de endpoints EF-01…EF-13, pipeline `authorizeEndpoint` y `withAuth`. |
| `supabase/functions/_shared/errors.ts` | 175 | Catálogo canónico de errores `docs/04` §8, `ApiError`, envelope `{ error: { code, message, details?, ref? } }`, `errorResponse` sin fugas. |
| `supabase/functions/_shared/tests/asserts.ts` | 90 | Aserciones locales (sin dependencias remotas ni `node_modules`) para que `deno test` corra sin red. |
| `supabase/functions/_shared/tests/auth_test.ts` | 1052 | 58 pruebas: SEC-04, guardas de claims/rol, catálogo, middleware, envelope y errores. |
| `hidria_coding_team/reports/F1/F1-01b_auth_ef.md` | 298 | Este reporte. |

Total del PR: **5 archivos nuevos** (código 2 288 líneas + este reporte); el número exacto de inserciones lo
reporta el propio PR (`git show --stat` del HEAD).

---

## 2. Contrato de claims y autorización implementado

### 2.1 Claims del JWT (ADR-005 + F1-00)

| Claim | Tipo | ¿Requerido? | Regla aplicada | Error si falta/está mal |
|---|---|---|---|---|
| `organization_id` | uuid | **Sí** (o su alias) | **Precedencia** sobre `tenant_id`; normalizado en `AuthContext.organizationId` | `401 AUTH_INVALID` · `reason: claim_tenant_ausente` (solo si ningún claim es UUID válido) |
| `tenant_id` | uuid | Solo como alias | Compatibilidad con `is_tenant_member` y RLS (F1-00); respaldo de `organization_id` si este falta o no es UUID | — (nunca rechaza por sí solo; ver fila anterior) |
| Formato del token | — | **Sí** | 3 segmentos no vacíos; **la firma base64url se decodifica dentro del `try`** (B1) | `401 AUTH_INVALID` · `reason: formato_token` (nunca 500) |
| `global_role` | enum (6) | **Sí** | Validado contra `admin_institucional·coordinador_srhds·equipo·empresa·observador·invitado` | `401 AUTH_INVALID` · `reason: global_role_ausente_o_invalido` |
| `sub` | uuid | **Sí** | `AuthContext.userId` | `reason: sub_ausente_o_invalido` |
| `aud` | `authenticated` | Sí (default) | Configurable con `audiences` | `reason: audiencia_no_autorizada` |
| `exp` / `nbf` / `iat` | epoch | Sí / no / opcional | Tolerancia de reloj 30 s (`clockSkewSeconds`) | `reason: token_expirado` / `token_no_vigente_aun` / `iat_invalido` |
| `iss` | URL | Opcional | Se valida si la EF pasa `expectedIssuer` | `reason: emisor_no_autorizado` |

> **El rol no viaja en el cliente para diagnóstico:** `global_role` es institucional y no sustituye al rol de
> diagnóstico, que se resuelve en servidor. `_shared/auth.ts` jamás lee rol/tenant/folio del body.

### 2.2 Modelos de rol

| Modelo | Valores | Origen | Uso en guardas |
|---|---|---|---|
| `DiagnosticRole` | `coordinador`, `equipo`, `empresa`, `organismo_operador`, `observador` | `project_members.role` | `resolveRole(userId, diagnosticId)` inyectado por la EF (`my_diagnostic_role` con JWT o `fn_diag_role` con `service_role`, F1-00/M-06) |
| `GlobalRole` | 6 valores de `profiles.global_role` | claim `global_role` | `requireGlobalRole` (endpoints administrativos futuros) |

**Decisión de mínimo privilegio:** `admin_institucional` **no eleva** privilegios en las guardas de
diagnóstico; en EF-01…EF-13 solo se aplica el rol de diagnóstico del contrato `docs/04`. Así se evita que un
rol institucional amplio sustituya al rol metodológico por diagnóstico.

### 2.3 Resolución de rol por endpoint: cadena inyectable

| Pieza | Firma | Implementación en esta tarea | Implementación futura (EF) |
|---|---|---|---|
| `ResolveDiagnosticRole` | `(userId, diagnosticId) => Promise<DiagnosticRole \| null>` | Inyectada en pruebas (fakes) | RPC `fn_diag_role` (service_role) o `my_diagnostic_role` (JWT) |
| `resolveDiagnosticId` | `(scope, resourceId) => Promise<string \| null>` | Inyectada en pruebas | `logbook_entries`, `document_checklist_items`, `water_balances`, `samples`, `documents` → `diagnostic_id` |
| `verifyProfile` (opcional) | `(context) => Promise<boolean>` | Probada con `true/false` | Consulta a `profiles`: perfil inexistente o `organization_id` ≠ claim ⇒ `401` (SEC-04) |

### 2.4 Catálogo SEC-04 (token/claims) → respuesta

| Condición | HTTP | Código | `details.reason` |
|---|---|---|---|
| Sin header `Authorization` / no `Bearer` | 401 | `AUTH_INVALID` | `token_ausente` |
| JWT malformado / payload no-JSON | 401 | `AUTH_INVALID` | `formato_token` |
| Algoritmo ≠ HS256 (`none`, RS256 sin JWKS…) | 401 | `AUTH_INVALID` | `algoritmo_no_soportado` |
| Firma inválida | 401 | `AUTH_INVALID` | `firma_invalida` |
| Expirado / `nbf` futuro / `iat` inválido | 401 | `AUTH_INVALID` | `token_expirado` · `token_no_vigente_aun` · `iat_invalido` |
| Sin audiencia `authenticated` / emisor ajeno | 401 | `AUTH_INVALID` | `audiencia_no_autorizada` · `emisor_no_autorizado` |
| Sin `sub` válido | 401 | `AUTH_INVALID` | `sub_ausente_o_invalido` |
| **Sin claim de tenant** (SEC-04) | 401 | `AUTH_INVALID` | `claim_tenant_ausente` |
| `organization_id` ≠ `tenant_id` con **ambos UUID válidos** | — | — (no es error) | Precedencia `organization_id`; `tenant_id` es respaldo. **No** se rechaza por *mismatch* (SEC-PR8-11; alineado con `current_org_id()` y ADR-005 §2.9) |
| `global_role` ausente o fuera del catálogo | 401 | `AUTH_INVALID` | `global_role_ausente_o_invalido` |
| Perfil inexistente / tenant del perfil ≠ claim (`verifyProfile`) | 401 | `AUTH_INVALID` | `perfil_o_tenant_inconsistente` |
| Configuración incompleta de la EF (sin secreto ni verificador) | 500 | `INTERNAL_ERROR` | — (no es error del cliente) |

> **Nota H-14/SEC-PR8-11:** el middleware ya **no** devuelve `401` por `organization_id` ≠
> `tenant_id`; aplica precedencia/fallback como `current_org_id()` (ADR-005 §2.9). El
> aislamiento estricto de tenant se refuerza en `verifyProfile`, comparando el
> `organization_id` del **perfil** contra el claim efectivo en la primera EF con DB
> (`SEC-PR8-01`). La fila «`tenant_inconsistente`» es histórica y quedó eliminada.

### 2.5 Guardas de rol (403)

| Guarda | Condición de éxito | Error |
|---|---|---|
| `requireTenant(ctx)` | claim de tenant válido | `401 AUTH_INVALID` |
| `requireGlobalRole(ctx, roles)` | `globalRole ∈ roles` | `403 FORBIDDEN_ROLE` (`details.rol_actual`, `roles_permitidos`) |
| `requireDiagnosticRole(ctx, diagId, roles, resolveRole)` | miembro + rol autorizado | `403 FORBIDDEN_NOT_MEMBER` (no miembro / recurso inexistente / id malformado) · `403 FORBIDDEN_ROLE` (miembro con rol no autorizado) |
| `guardEndpoint(ctx, endpointId, params, deps)` | política del endpoint cumplida | idem + `422 VALIDATION_PARAMETRO_REQUERIDO` (`details.param`) si falta un parámetro del **cliente** (M2) · `500 INTERNAL_ERROR` solo si la EF no inyecta una dependencia |

> Anti-enumeración: un `id` malformado o de otro tenant se responde `403 FORBIDDEN_NOT_MEMBER`, nunca 404 con
> detalles del recurso.

---

## 3. Catálogo de endpoints (contrato `docs/04` §3/§4)

| ID | Método y ruta (base `/functions/v1`) | Alcance | Política de rol | Ref. |
|---|---|---|---|---|
| EF-01 | `POST /diagnostics/{diagnostic_id}/advance-phase` | diagnostic | `coordinador`, `equipo` | §4 EF-01 |
| EF-02 | `POST /logbook/{entry_id}/close` | logbook_entry | `coordinador`, `equipo` | §4 EF-02 |
| EF-03 | `POST /checklist/{item_id}/transition` | checklist_item | `empresa`, `coordinador`, `equipo` (TD-2 dentro de la EF) | §4 EF-03 / TD-2 |
| EF-04.submit | `POST /cat/{diagnostic_id}/submit` | diagnostic | `empresa`, `coordinador`, `equipo` | §4 EF-04 |
| EF-04.validate-r2 | `POST /cat/{diagnostic_id}/validate-r2` | diagnostic | `coordinador`, `equipo` | §4 EF-04 |
| EF-05 | `POST /balances/{balance_id}/validate-r3` | balance | `coordinador`, `equipo` | §4 EF-05 |
| EF-06.score | `POST /ivoh/{diagnostic_id}/score` | diagnostic | `coordinador`, `equipo` | §4 EF-06 |
| EF-06.validate-r4 | `POST /ivoh/{diagnostic_id}/validate-r4` | diagnostic | `coordinador`, `equipo` | §4 EF-06 |
| EF-07 | `POST /diagnostics/{diagnostic_id}/emit-report` | diagnostic | **solo `coordinador`** (RPT-03) | §4 EF-07 |
| EF-08.presign | `POST /documents/presign` | — | autenticado + tenant; **M1/Q-08 rastreado en task-39** (membresía/ADR + corrección de `docs/04` antes de F1-05; hoy se exige en `register`) | §4 EF-08 / task-39 |
| EF-08.register | `POST /documents/register` | diagnostic (`body.diagnostic_id`) | cualquier miembro | §4 EF-08 |
| EF-09 | `POST /import/xlsx` | diagnostic (`body.diagnostic_id`) | `coordinador`, `equipo` | §4 EF-09 |
| EF-10 | `POST /samples/{sample_id}/dictamen` | sample | `coordinador`, `equipo` | §4 EF-10 |
| EF-11 | `POST /quiz/submit` | — | autenticado (cualquier `global_role`) | §4 EF-11 |
| EF-12 | `POST /diagnostics/{diagnostic_id}/reprogram-milestone` | diagnostic | **solo `coordinador`** | §4 EF-12 |
| EF-13 | `POST /reports/{document_id}/sign-nom151` | document | **solo `coordinador`** | §4 EF-13 |

`matchEndpoint(method, pathOrUrl)` resuelve ruta→endpoint y parámetros, tolera el prefijo `/functions/v1`,
query string y barra final; devuelve `null` para rutas/métodos fuera del catálogo (el router de cada EF
decide el 404, no se inventan códigos fuera de `docs/04` §8).

---

## 4. API pública de `_shared/auth.ts` (integración de las EF)

| Export | Tipo | Uso en la EF |
|---|---|---|
| `authenticate(request, options)` | middleware | Extrae y valida el JWT; devuelve `AuthContext` o lanza `ApiError` 401. |
| `withAuth(handler, options)` | wrapper | Envuelve el handler; mapea `ApiError` al envelope canónico y sanitiza errores no controlados (500). |
| `authorizeEndpoint(request, { auth, deps, body })` | pipeline | Autenticación + match + guarda de rol en una llamada; `null` si la ruta no es del catálogo. |
| `guardEndpoint(ctx, endpointId, params, deps)` | guarda | Aplica la política del endpoint con las dependencias DB inyectadas. |
| `requireTenant` · `requireGlobalRole` · `requireDiagnosticRole` | guardas | Reutilizables por EF que validen body (p. ej. EF-08 register). |
| `matchEndpoint` · `getEndpoint` · `ENDPOINTS` | catálogo | Router y trazabilidad contrato↔endpoint. |
| `verifyHs256Signature` · `decodeJwt` · `base64UrlEncode/Decode` | utilidades | Verificación HS256 y pruebas; `decodeJwt` no confía sin verificar. |
| `AuthContext` · `AuthenticateOptions` · `GuardDependencies` · `EndpointId` | tipos | Contrato tipado para las EF. |

Ejemplo de integración (referencia para las tareas de EF; no forma parte de este cambio):

```ts
const response = await withAuth(async (request, ctx) => {
  const endpoint = await authorizeEndpoint(request, {
    auth: { jwtSecret: env.SUPABASE_JWT_SECRET, expectedIssuer: `${env.SUPABASE_URL}/auth/v1` },
    deps: { resolveRole: (u, d) => rpcFnDiagRole(u, d) },
  });
  // endpoint === null ⇒ 404 del router; guardas ya aplicadas
}, { jwtSecret: env.SUPABASE_JWT_SECRET });
```

---

## 5. Pruebas

**Comando:** `npx --yes deno@2 test supabase/functions/_shared/tests/`
**Resultado:** `ok | 58 passed | 0 failed (88 ms)` — sin permisos especiales, sin red, sin variables de entorno.

| Grupo | Casos | Qué se prueba | Trazabilidad `docs/05` |
|---|---|---|---|
| SEC-04 (token/claims y B1) | 19 | Ausente, no-Bearer, malformado, payload no-JSON, **firma base64url malformada/vacía (B1, incluye `withAuth` ⇒ 401)**, firma, alg, expirado, nbf, sin tenant, precedencia/respaldo de claims (ADR-005), sin claim utilizable, sub, audiencia, emisor, `global_role` ausente/fuera de catálogo | **SEC-04**; SEC-01 parcial (tenant ajeno ⇒ 403) |
| Camino válido y claims | 7 | Contexto completo e inmutable, alias `tenant_id`, precedencia, verificador inyectado, `verifyProfile`, misconfig 500, `verifyHs256Signature` | SEC-04; ADR-005 |
| Guardas de claims | 3 | `requireTenant`, `requireGlobalRole` (permitido / 403) | SEC-01/SEC-03 base |
| Guarda de diagnóstico | 4 | Rol válido, no miembro, rol insuficiente, id malformado | DOC-03, PG-11, RPT-03 |
| Catálogo | 3 | 16 endpoints ↔ 13 EF, políticas exactas, `tenantRequired`, métodos/rutas y params | API-01/API-02 base |
| Guardas por endpoint | 13 | EF-01 (permitido/403/no miembro), EF-07/12/13 (solo coordinador), **`admin_institucional` no eleva privilegios de diagnóstico**, EF-03 (empresa/observador), EF-08 presign (sin resolver rol) y register (miembro/no miembro), EF-11 (observador/admin/invitado), recurso ajeno, **parámetros faltantes ⇒ 422 (M2, ruta y body)** | API-02, DOC-01/02/05 |
| Pipeline/middleware | 6 | `authorizeEndpoint` (éxito, 401, 403, ruta desconocida, body `diagnostic_id`), `withAuth` (401 JSON, contexto, 500 sin fugas) | API-00…04 base |
| Errores/envelope | 3 | `VALIDATION_*` ⇒ 422, códigos catalogados, `ref` de auditoría, `GLOBAL_ROLES` | API-03 base |

---

## 6. Evidencia de ejecución

### 6.1 Deno (calidad de código)

| # | Comando | Resultado |
|---|---|---|
| 1 | `npx --yes deno@2 --version` | `deno 2.9.6 (stable, x86_64-pc-windows-msvc)` |
| 2 | `deno check errors.ts auth.ts tests/asserts.ts tests/auth_test.ts` | **OK** — «Check errors.ts / auth.ts / asserts.ts / auth_test.ts» sin errores |
| 3 | `deno lint errors.ts auth.ts tests/asserts.ts tests/auth_test.ts` | **OK** — «Checked 4 files», 0 problemas |
| 4 | `deno fmt --check errors.ts auth.ts tests/asserts.ts tests/auth_test.ts` | **OK** — 4 archivos formateados (sin cambios) |
| 5 | `deno test tests/` | **58 passed · 0 failed** (88 ms) |

### 6.2 Guardas de CI equivalentes (el CI no tiene job Deno; ver §8.1)

| Guarda de `scripts/ci/guardas.sh` | Verificación local | Resultado |
|---|---|---|
| Secret scanning de archivos trackeados | `Select-String` de patrones JWT/`ghp_`/`github_pat_`/`sbp_`/`PRIVATE KEY` en `supabase/functions/**` | Sin coincidencias en los archivos nuevos |
| Nomenclatura institucional prohibida | `UAT-CIT` y denominación antigua de la SRHDS en `app/`+`supabase/` | Sin coincidencias |
| `docs/02` byte-idéntico a la migración base | No se tocó ninguno de los dos archivos | Sin cambios en el diff |
| `.env` fuera de git | No se creó ni modificó `.env`; no se imprimió ningún valor | OK |
| Artefactos no versionados | Sin `node_modules/`, `dist/`, `.temp/`; se descartó un `deno.lock` accidental del runner local | OK |

### 6.3 Higiene de secretos

- No se incluyó ningún secreto real: el JWT de las pruebas se firma con un **secreto sintético** definido en el
  test (`secreto-sintetico-f1-01b-sin-valor-real`), no es una credencial del proyecto.
- `_shared/auth.ts` **no lee `Deno.env`**: la configuración (`jwtSecret`/`verify`) se inyecta, de modo que el
  módulo se prueba sin permisos y ninguna EF puede loggear el secreto por accidente.
- No se usa `service_role` en cliente ni en respuestas; el módulo solo maneja el JWT del usuario.
- No se transcribió `.env` ni se ejecutaron comandos que impriman credenciales.

> Nota: `deno test` creó un `deno.lock` local en la raíz del worktree al resolver dependencias del runner; se
> eliminó y **no** forma parte del commit (no hay `deno.json` todavía, ver §8.2).

### 6.4 CI del PR (GitHub Actions)

| # | Run / check | SHA | Resultado |
|---|---|---|---|
| 1 | Run `42437478826` (evento *push*) — «Guardas de repositorio» + «Cliente (lint + typecheck + build)» | `ad665d9` | **success** (4/4 checks) |
| 2 | Run `42437498288` (evento *pull_request*) — «Guardas de repositorio» + «Cliente (lint + typecheck + build)» | `ad665d9` | **success** (4/4 checks) |
| 3 | Runs `42437650326` (push) y `42437655176` (pull_request) | `21b2ca3` | **success** (4/4 checks) |
| 4 | Runs `42438259343` (push) y `42438262784` (pull_request) — fixtures F1-01a | `caaf071` | **success** (4/4 checks) |
| 5 | Runs `42438884478` (push) y `42438887996` (pull_request) — **spec review B1/M2** | `a49681d` | **success** (4/4 checks) |
| 6 | Commit documental de esta re-evidencia | HEAD del PR | Re-ejecuta los mismos 2 checks (resultado en el comentario de evidencia del PR) |

PR [#8](https://github.com/horaciomartinez-svg/hidria-ect/pull/8) · `mergeable_state: clean` (sin conflicto: el PR
únicamente agrega archivos nuevos y `main` avanzó a `e21a665` con el PR #7 de migraciones).

---

## 7. E3 resuelta (hook activo) y por qué las pruebas usan claims simulados

| Elemento | Estado | Cómo se probó / qué falta |
|---|---|---|
| `public.custom_access_token_hook` (F1-00) | **ACTIVO y verificado** por el Lead: `reports/F0/F0-14_activacion_auth_hook.md` (VERDE; `hook_custom_access_token_enabled=true` y URI `pg-functions://postgres/public/custom_access_token_hook`) | JWT real de un usuario de prueba: `organization_id` y `tenant_id` = `00000000-…001`, `global_role` = `coordinador_srhds`; fallo cerrado 403 sin perfil. |
| Claims simulados en esta suite | **Intencional**: la suite Deno no depende de usuarios reales ni de red | Se firma HS256 con el mismo shape de claims que emite el hook (los claims reales observados coinciden). |
| Login E2E con usuarios del seed | Pendiente **F1-02** | F0-14 §5: los usuarios del seed tienen `auth.users.instance_id = NULL`; para login hay que fijarlo o crearlos vía Admin API. |
| `SUPABASE_JWT_SECRET` para verificación HS256 | Pendiente de inventario (§8.2) | La EF inyecta el secreto; la alternativa `verify` (JWKS/goTrue) ya está soportada. |

---

## 8. Riesgos y follow-ups

| # | Elemento | Impacto | Acción propuesta |
|---|---|---|---|
| 8.1 | **El CI no ejecuta pruebas Deno** (`ci.yml` solo tiene guardas + cliente) | Las 58 pruebas corren en local, no como check obligatorio del PR | Follow-up de DevOps/QA (junto a `task-13`, que añade Postgres/pgTAP): job `denoland/setup-deno` + `deno lint/check/test`. **No** se tocó `.github/` (fuera de alcance). |
| 8.2 | **No hay `supabase/config.toml` ni `deno.json`** (B-04) y `SUPABASE_JWT_SECRET` no está en `.env.example` | Despliegue de EF y ejecución uniforme de Deno pendientes | Solicitud a DevOps: añadir `SUPABASE_JWT_SECRET` (sin valor) al inventario de secretos y crear `supabase/functions/deno.json` en la tarea de habilitadores. |
| 8.3 | **Supabase puede usar JWT asimétrico (JWKS)** en proyectos nuevos | HS256 no aplicaría | Interfaz `verify` ya inyectable: la EF pasará un verificador JWKS/goTrue cuando el proyecto lo requiera, sin cambiar guardas. |
| 8.4 | `verifyProfile` (perfil inexistente / tenant ≠ claim) requiere consulta a `profiles` | SEC-04 parcialmente cubierto hasta que exista `_shared/db.ts` | Interfaz lista y probada; se conecta en la primera EF que use DB (EF-03/EF-01). |
| 8.5 | EF-08 presign no tiene `diagnostic_id` en el contrato | Guarda de presign solo valida auth+tenant | **Rastreado en task-39** (ADR + `docs/04` antes de F1-05); mientras tanto la membresía se exige en `register`. No se corrige unilateralmente. |
| 8.6 | `admin_institucional` no eleva privilegios de diagnóstico | Comportamiento intencional (least privilege) | Si el negocio requiere excepción, ADR + guarda explícita. |
| 8.7 | E3 **resuelta** (hook activo, F0-14) | — | Pruebas con claims simulados deterministas; el login E2E con usuarios del seed requiere `instance_id` (F1-02). |

---

## 9. Coordinación

| Agente | Interacción |
|---|---|
| `arquitecto-bd` (`task-20`/F1-01a) | Confirmado por mensaje: claims `organization_id` (precedencia) + `tenant_id` (alias) + `global_role`; helpers `current_org_id()`, `current_global_role()`, `has_global_role()`, `has_any_global_role()`, `is_tenant_member()`; `fn_diag_role`/`fn_is_diag_member` (M-06). **No se requieren helpers nuevos**: `_shared/auth.ts` consume `resolveRole` inyectable y `verifyProfile` opcional. **Correspondencia del seed confirmada y corregida en las fixtures:** `001` `coordinador_srhds` · `002` `equipo` · `003` `empresa` · `004` `observador` · `005` `admin_institucional` · `006` `invitado` (`20261108020020_f1_01a_fix_roles.sql`); pruebas añadidas para «`admin_institucional` no eleva privilegios» y «EF-11 admite observador/admin/invitado». Sin cambios pendientes en F1-01a. |
| `dev-frontend-pwa` (F1-02) | Sin código compartido: el cliente solo envía su JWT; los claims los emite el hook y la EF los valida. El cliente usa `organization_id`/`tenant_id` solo para UI, nunca para autorizar. |
| `qa-tester` | Suite Deno lista para ejecutarse en CI (§8.1) y trazabilidad SEC-04 en §5. |
| `supervisor-hidria` | Rama congelada en `a49681d`; re-revisión acotada **task-40** (spec, B1/M2), **task-41** (seguridad delta) y **task-42** (QA, ejecuta la suite Deno). Merge solo supervisor. |
| `arquitecto-bd` (revisión de `caaf071`) | Corrigió que la organización semilla es `00000000-…001` (`b1000000-…001` es una empresa sintética) — fixtures ajustadas — y que **E3 ya está resuelta** (§7 actualizado). Sin cambios pendientes en F1-01a. |

---

## 10. Conclusión y siguiente paso

**VERDE** en la parte EF de F1-01: middleware y guardas de EF-01…EF-13 implementados, **58/58 pruebas Deno** y
alineados a `docs/04`/ADR-005, con `401 AUTH_INVALID` (incluida firma base64url malformada, B1) y `422` para
parámetros de cliente faltantes (M2), más los 403 canónicos por rol/membresía.

**Estado:** head congelado `a49681d` con CI 4/4; re-revisión acotada en curso (task-40/41/42). M1/Q-08 queda
rastreado en **task-39** (antes de F1-05). Siguiente paso tras el merge de #8: ola 0 de `_shared` (`db.ts`,
`env.ts`) y la primera EF (`EF-03`, `F1-06`), que inyectará `resolveRole` contra `fn_diag_role` y
`verifyProfile` contra `profiles`.

---

*Fin del reporte — `dev-edge-functions` (agente 03) · `task-21` · F1-01b.*
