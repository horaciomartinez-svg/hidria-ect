# F1-01b — Auth EF: `_shared/auth.ts`, guardas de rol y `401 AUTH_INVALID`

- **Agente:** `dev-edge-functions` (03)
- **Fecha:** 2026-11-07 20:15 (America/Mexico_City)
- **Tarea compartida:** `task-21` — «F1 · F1-01b Auth EF: `_shared/auth.ts`, guardas de rol y 401 AUTH_INVALID»
- **Tarea base:** `hidria_coding_team/tasks/F1/F1-01_auth_claims.md` (parte EF; DB = `task-20`, cliente = F1-02)
- **Rama:** `feature/F1-01b-auth-ef` desde `origin/main` (`b4fbc83`)
- **PR:** pendiente en este commit («PR: #—») · **CI:** pendiente («CI: —»)
- **Entorno:** Windows / PowerShell 5.1 · Deno **2.9.6** (vía `npx --yes deno@2`, sin Docker)
- **Alcance respetado:** solo `supabase/functions/_shared/**` (+ este reporte). No se tocó
  `supabase/migrations/**`, `supabase/tests/**`, `app/**`, `.github/**` ni `docs/**`.

## Resultado: **VERDE**

| Criterio de aceptación | Estado | Evidencia |
|---|---|---|
| Middleware/guardas en `_shared/auth.ts` para EF-01…EF-13 | ✅ | §2, §3; catálogo de 16 endpoints ↔ 13 EF |
| Claims `organization_id` (precedencia), `tenant_id` (alias), `global_role` según ADR-005 | ✅ | §2.1; tests «ADR-005: …» |
| Roles `coordinador`/`equipo`/`empresa`/`observador`/`admin_institucional` + diagnóstico | ✅ | §2.2–§2.3; `GLOBAL_ROLES`, `DIAGNOSTIC_ROLES` |
| **`401 AUTH_INVALID`** sin claim requerido (SEC-04) y sin token/expirado/firma inválida | ✅ | §2.4; 16 tests SEC-04 |
| 403 cuando el rol no alcanza (`FORBIDDEN_ROLE` / `FORBIDDEN_NOT_MEMBER`) | ✅ | §2.5; tests de guardas |
| Pruebas de claims ausentes/incorrectos/rol insuficiente/válido | ✅ | **53/53 tests Deno en verde** (§5) |
| E3 documentado (hook sin activar → claims simulados) | ✅ | §7 |
| Sin secretos, sin `service_role` en cliente/repo, sin `.env` | ✅ | §6.3 |

---

## 1. Entregables

| Archivo | Líneas | Contenido |
|---|---|---|
| `supabase/functions/_shared/auth.ts` | 887 | Middleware de autenticación, verificación HS256, contrato de claims, guardas (`requireTenant`, `requireGlobalRole`, `requireDiagnosticRole`, `guardEndpoint`), catálogo de endpoints EF-01…EF-13, pipeline `authorizeEndpoint` y `withAuth`. |
| `supabase/functions/_shared/errors.ts` | 151 | Catálogo canónico de errores `docs/04` §8, `ApiError`, envelope `{ error: { code, message, details?, ref? } }`, `errorResponse` sin fugas. |
| `supabase/functions/_shared/tests/asserts.ts` | 82 | Aserciones locales (sin dependencias remotas ni `node_modules`) para que `deno test` corra sin red. |
| `supabase/functions/_shared/tests/auth_test.ts` | 858 | 53 pruebas: SEC-04, guardas de claims/rol, catálogo, middleware, envelope y errores. |

Total: 4 archivos nuevos, ≈1 978 líneas (incluye JSDoc de contrato y catálogo documentado).

---

## 2. Contrato de claims y autorización implementado

### 2.1 Claims del JWT (ADR-005 + F1-00)

| Claim | Tipo | ¿Requerido? | Regla aplicada | Error si falta/está mal |
|---|---|---|---|---|
| `organization_id` | uuid | **Sí** (o su alias) | **Precedencia** sobre `tenant_id`; normalizado en `AuthContext.organizationId` | `401 AUTH_INVALID` · `reason: claim_tenant_ausente` / `organization_id_invalido` |
| `tenant_id` | uuid | Solo como alias | Compatibilidad con `is_tenant_member` y RLS (F1-00) | `reason: tenant_id_invalido`; si ambos difieren ⇒ `reason: tenant_inconsistente` |
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
| `organization_id` ≠ `tenant_id` (token manipulado) | 401 | `AUTH_INVALID` | `tenant_inconsistente` |
| `global_role` ausente o fuera del catálogo | 401 | `AUTH_INVALID` | `global_role_ausente_o_invalido` |
| Perfil inexistente / tenant del perfil ≠ claim (`verifyProfile`) | 401 | `AUTH_INVALID` | `perfil_o_tenant_inconsistente` |
| Configuración incompleta de la EF (sin secreto ni verificador) | 500 | `INTERNAL_ERROR` | — (no es error del cliente) |

### 2.5 Guardas de rol (403)

| Guarda | Condición de éxito | Error |
|---|---|---|
| `requireTenant(ctx)` | claim de tenant válido | `401 AUTH_INVALID` |
| `requireGlobalRole(ctx, roles)` | `globalRole ∈ roles` | `403 FORBIDDEN_ROLE` (`details.rol_actual`, `roles_permitidos`) |
| `requireDiagnosticRole(ctx, diagId, roles, resolveRole)` | miembro + rol autorizado | `403 FORBIDDEN_NOT_MEMBER` (no miembro / recurso inexistente / id malformado) · `403 FORBIDDEN_ROLE` (miembro con rol no autorizado) |
| `guardEndpoint(ctx, endpointId, params, deps)` | política del endpoint cumplida | idem + `500 INTERNAL_ERROR` si la EF no inyecta `resolveDiagnosticId` o falta el parámetro |

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
| EF-08.presign | `POST /documents/presign` | — | autenticado + tenant (contrato aún sin `diagnostic_id`) | §4 EF-08 / Q-08 |
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
**Resultado:** `ok | 53 passed | 0 failed (50ms)` — sin permisos especiales, sin red, sin variables de entorno.

| Grupo | Casos | Qué se prueba | Trazabilidad `docs/05` |
|---|---|---|---|
| SEC-04 (token/claims) | 16 | Ausente, no-Bearer, malformado, payload no-JSON, firma, alg, expirado, nbf, sin tenant, tenant inconsistente, tenant no-uuid, sub, audiencia, emisor, `global_role` ausente/fuera de catálogo | **SEC-04**; SEC-01 parcial (tenant ajeno ⇒ 403) |
| Camino válido y claims | 7 | Contexto completo e inmutable, alias `tenant_id`, precedencia, verificador inyectado, `verifyProfile`, misconfig 500, `verifyHs256Signature` | SEC-04; ADR-005 |
| Guardas de claims | 3 | `requireTenant`, `requireGlobalRole` (permitido / 403) | SEC-01/SEC-03 base |
| Guarda de diagnóstico | 4 | Rol válido, no miembro, rol insuficiente, id malformado | DOC-03, PG-11, RPT-03 |
| Catálogo | 3 | 16 endpoints ↔ 13 EF, políticas exactas, `tenantRequired`, métodos/rutas y params | API-01/API-02 base |
| Guardas por endpoint | 9 | EF-01 (permitido/403/no miembro), EF-07/12/13 (solo coordinador), EF-03 (empresa/observador), EF-08 presign (sin resolver rol) y register (miembro/no miembro), EF-11 (invitado), recurso ajeno, parámetros faltantes | API-02, DOC-01/02/05 |
| Pipeline/middleware | 5 | `authorizeEndpoint` (éxito, 401, 403, ruta desconocida, body `diagnostic_id`), `withAuth` (401 JSON, contexto, 500 sin fugas) | API-00…04 base |
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
| 5 | `deno test tests/` | **53 passed · 0 failed** (50 ms) |

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

---

## 7. Estado de E3 (hook sin activar) y pruebas con claims simulados

| Elemento | Estado | Cómo se probó / qué falta |
|---|---|---|
| `public.custom_access_token_hook` (F1-00) | **Entregado, NO activado** (requiere `SUPABASE_ACCESS_TOKEN`, ADR-004 E3) | Las pruebas firman tokens HS256 con los claims que emitirá el hook (`organization_id`, `tenant_id`, `global_role`) y los UUID del seed sintético de `task-20`. |
| Activación del hook en Auth | Pendiente (E3, usuario) | Cuando se active, el middleware no cambia: solo verifica firma/claims. Requiere secreto `SUPABASE_JWT_SECRET` en `supabase secrets set` (inventario, §8.2). |
| Tiempo de vida/rotación del JWT | Fuera de alcance | GoTrue lo gestiona; el middleware solo valida `exp/nbf/iat`. |

**Claims simulados usados (idénticos a los reales):** `sub`, `aud: "authenticated"`, `role: "authenticated"`,
`iss`, `iat`, `exp`, `organization_id`, `tenant_id`, `global_role`.

---

## 8. Riesgos y follow-ups

| # | Elemento | Impacto | Acción propuesta |
|---|---|---|---|
| 8.1 | **El CI no ejecuta pruebas Deno** (`ci.yml` solo tiene guardas + cliente) | Las 53 pruebas corren en local, no como check obligatorio del PR | Follow-up de DevOps/QA (junto a `task-13`, que añade Postgres/pgTAP): job `denoland/setup-deno` + `deno lint/check/test`. **No** se tocó `.github/` (fuera de alcance). |
| 8.2 | **No hay `supabase/config.toml` ni `deno.json`** (B-04) y `SUPABASE_JWT_SECRET` no está en `.env.example` | Despliegue de EF y ejecución uniforme de Deno pendientes | Solicitud a DevOps: añadir `SUPABASE_JWT_SECRET` (sin valor) al inventario de secretos y crear `supabase/functions/deno.json` en la tarea de habilitadores. |
| 8.3 | **Supabase puede usar JWT asimétrico (JWKS)** en proyectos nuevos | HS256 no aplicaría | Interfaz `verify` ya inyectable: la EF pasará un verificador JWKS/goTrue cuando el proyecto lo requiera, sin cambiar guardas. |
| 8.4 | `verifyProfile` (perfil inexistente / tenant ≠ claim) requiere consulta a `profiles` | SEC-04 parcialmente cubierto hasta que exista `_shared/db.ts` | Interfaz lista y probada; se conecta en la primera EF que use DB (EF-03/EF-01). |
| 8.5 | EF-08 presign no tiene `diagnostic_id` en el contrato | Guarda de presign solo valida auth+tenant | Documentado (Q-08 de `F1-01`); la membresía se exige en `register`. |
| 8.6 | `admin_institucional` no eleva privilegios de diagnóstico | Comportamiento intencional (least privilege) | Si el negocio requiere excepción, ADR + guarda explícita. |
| 8.7 | E3 sin activar | Claims reales no verificables en staging | Comprobar en la primera sesión con staging cuando el usuario active el hook; pruebas con claims simulados ya cubiertas. |

---

## 9. Coordinación

| Agente | Interacción |
|---|---|
| `arquitecto-bd` (`task-20`/F1-01a) | Confirmado por mensaje: claims `organization_id` (precedencia) + `tenant_id` (alias) + `global_role`; helpers `current_org_id()`, `current_global_role()`, `has_global_role()`, `has_any_global_role()`, `is_tenant_member()`; `fn_diag_role`/`fn_is_diag_member` (M-06). **No se requieren helpers nuevos**: `_shared/auth.ts` consume `resolveRole` inyectable y `verifyProfile` opcional. |
| `dev-frontend-pwa` (F1-02) | Sin código compartido: el cliente solo envía su JWT; los claims los emite el hook y la EF los valida. El cliente usa `organization_id`/`tenant_id` solo para UI, nunca para autorizar. |
| `qa-tester` | Suite Deno lista para ejecutarse en CI (§8.1) y trazabilidad SEC-04 en §5. |
| `supervisor-hidria` | Merge pendiente (ruleset: PR + checks; solo supervisor mergea). |

---

## 10. Conclusión y siguiente paso

**VERDE** en la parte EF de F1-01: el middleware y las guardas de rol de EF-01…EF-13 están implementados,
probados (53/53) y alineados al contrato `docs/04`/ADR-005, con `401 AUTH_INVALID` para todo token/claim
inválido (SEC-04) y 403 canónicos por rol/membresía.

**Siguiente paso:** revisión de especificaciones + seguridad + QA del PR; al aprobar, el supervisor mergea.
Después, la ola 0 de `_shared` (`db.ts`, `env.ts`) y la primera EF (`EF-03`, `F1-06`), que inyectará
`resolveRole` contra `fn_diag_role` y `verifyProfile` contra `profiles`.

---

*Fin del reporte — `dev-edge-functions` (agente 03) · `task-21` · F1-01b.*
