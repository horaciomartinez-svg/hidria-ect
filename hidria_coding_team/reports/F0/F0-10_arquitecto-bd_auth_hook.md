# F0-10 — Auth hook `custom_access_token_hook` (diseño y activación)

- **Agente:** `arquitecto-bd` (02)
- **Fecha:** 2026-11-07 18:16 (America/Mexico_City)
- **Tarea:** `tasks/F0/F0-10_auth_hook.md`
- **Rama / PR:** `chore/f0-fundacion` / PR #2
- **Entorno:** proyecto del Programa (`piloto`), ref `zucalshlfcxejpukshxl`
- **Commit de referencia:** `90c77ab`
- **Modo:** **solo lectura**. En esta ronda **no** se creó migración, **no** se aplicó DDL y
  **no** se activó el hook. El diseño se entrega como bloque SQL en este reporte.

## Resultado: AMARILLO

- El hook **no existe** en la base (0 coincidencias en `pg_proc`), como se esperaba en F0.
- El diseño está listo y la lógica se validó con eventos **sintéticos** (sin datos reales).
- La **activación no se ejecutó**: no hay `SUPABASE_ACCESS_TOKEN` en `.env` y las 3 vías de
  gestión fallaron (Management API 401, CLI sin token, dashboard sin sesión). Hueco de
  credencial registrado; no es un fallo del esquema.
- Se detectaron **dos decisiones técnicas** que el Lead debe cerrar antes de F1-01:
  1. La ubicación literal `auth.custom_access_token_hook` **no es creable** por el rol de
     migraciones (`postgres` no tiene `CREATE` sobre `auth`; el schema es de
     `supabase_admin`). El diseño implementable usa `public.custom_access_token_hook`
     (patrón oficial de Supabase).
  2. Hay **contradicción documental** entre el claim `organization_id`
     (`docs/00`/`04`/`07`) y `tenant_id` (que es el que consumen `is_tenant_member` y 14
     políticas RLS). El hook debe emitir **ambos** hasta que se normalice por ADR.

## 1. Estado actual verificado

| Comprobación | Consulta | Resultado |
|---|---|---|
| ¿Existe el hook? | `pg_proc` donde `proname ilike '%access_token%'` / `%custom_access%` / `%hook%` en `public` y `auth` | **0 funciones** |
| Funciones en `auth` | `select proname from pg_proc ... nspname='auth'` | 4: `uid`, `jwt`, `role`, `email` (ninguna de hook) |
| Funciones en `public` | conteo | 15, ninguna de hook/token |
| Trigger de provisión de perfiles | `pg_trigger` sobre `auth.users` | **0 triggers** de aplicación (no hay `handle_new_user`) |
| Filas en `profiles` | `select count(*)` | **0** (aún no hay usuarios) |
| Configuración del hook en Auth | No consultable por SQL; Management API/dashboard | **No verificada** (sin token; ver §2) |
| Tablas con `organization_id` | `information_schema.columns` | 11 |
| Políticas que usan `is_tenant_member` (`tenant_id`) | `pg_policies` | **14** |
| RLS forzada en tablas | `pg_class.relforcerowsecurity` | 0 tablas (owner `postgres` mantiene bypass: el hook `security definer` puede leer `profiles`) |

## 2. Hueco de credencial (3 vías intentadas)

No se encontró un token de gestión de Supabase en el entorno. Se intentó/documentó por tres
vías independientes, sin imprimir ningún valor de `.env`:

| # | Vía | Acción | Resultado |
|---|---|---|---|
| 1 | **`.env` / entorno** | Inventario por nombre de variable | `SUPABASE_ACCESS_TOKEN` **AUSENTE**; `SUPABASE_DB_URL` **AUSENTE**; `SUPABASE_PROJECT_REF`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD` presentes (valores no impresos) |
| 2 | **Management API** | `GET https://api.supabase.com/v1/projects/zucalshlfcxejpukshxl/config/auth` sin `Authorization` | **HTTP 401 Unauthorized** |
| 3 | **CLI** | `npx supabase projects list --output json` (CLI 3.0.0) | Error: `Access token not provided. Supply an access token by running 'supabase login' or setting the SUPABASE_ACCESS_TOKEN environment variable.` (exit 1) |
| 4 | **Dashboard** | `GET https://supabase.com/dashboard/project/zucalshlfcxejpukshxl/auth/hooks` | HTTP 200 con shell de login de Supabase; **sin sesión de navegador** no se puede leer ni cambiar la configuración |

**Conclusión:** el hook no está activado (y la función no existe). La activación queda
pendiente de que el usuario aporte un **Supabase access token** (fuera del repo) o ejecute
el paso en el dashboard. Esto cumple la condición de PARO §12.1 de `TEAM.md` solo si el
Lead decide que la activación es imprescindible en F0; el resto de F0 no depende de ello.

## 3. Diseño propuesto (NO aplicado)

### 3.1 Decisiones

| ID | Decisión | Motivo / evidencia |
|---|---|---|
| D1 | Ubicación: **`public.custom_access_token_hook`** | `auth` es owner `supabase_admin`; `has_schema_privilege('postgres','auth','CREATE') = false`. El rol de migraciones no puede crear allí. Supabase documenta el hook en `public` con URI `pg-functions://postgres/public/custom_access_token_hook` |
| D2 | `security definer` + `search_path = public, pg_temp` | El hook corre como `supabase_auth_admin`, que no tiene políticas en `profiles`; el owner `postgres` sí puede leerla (RLS sin `FORCE`). El `search_path` fijo evita secuestro de objetos |
| D3 | Claims: `organization_id` **y** `tenant_id` (mismo UUID) + `global_role` | `docs/00`/`04`/`07` exigen `organization_id`; `is_tenant_member` y 14 políticas usan `tenant_id`. Emitir ambos evita romper RLS y cumple el contrato |
| D4 | Preservar claims existentes (`sub`, `aud`, `role`, `aal`, `session_id`, etc.) | El hook solo añade; no elimina claims requeridos por Supabase Auth |
| D5 | Fallar cerrado si no hay perfil (error 403) | `profiles.organization_id` es `NOT NULL`; sin perfil no hay tenant ni rol. Evita emitir JWT sin claims (SEC-04) |
| D6 | `revoke execute` a `public/anon/authenticated`; `grant execute` solo a `supabase_auth_admin` | Evita exponer el hook por PostgREST/RPC y limita la superficie |

### 3.2 Bloque SQL — migración propuesta (idempotente, **NO aplicada**)

```sql
-- ============================================================================
-- PROPUESTA F0-10 / F1-01 — NO APLICADA EN ESTA RONDA
-- Migración sugerida: 20261108010000_custom_access_token_hook.sql
-- Requiere actualizar docs/02 (byte-identidad) en el mismo PR si se adopta.
-- ============================================================================
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_claims  jsonb;
  v_org     uuid;
  v_rol     text;
begin
  v_user_id := (event ->> 'user_id')::uuid;
  v_claims  := coalesce(event -> 'claims', '{}'::jsonb);

  select p.organization_id, p.global_role
    into v_org, v_rol
    from public.profiles p
   where p.user_id = v_user_id;

  -- Fallar cerrado: sin perfil no se emite JWT con claims de tenant
  if v_org is null or v_rol is null then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'HIDRIA: usuario sin perfil u organizacion; acceso denegado.'
      )
    );
  end if;

  -- Claim contractual (docs/00, docs/04, docs/07)
  v_claims := jsonb_set(v_claims, '{organization_id}', to_jsonb(v_org::text), true);
  -- Compatibilidad con is_tenant_member() y las 14 políticas RLS (docs/01, docs/02)
  v_claims := jsonb_set(v_claims, '{tenant_id}',       to_jsonb(v_org::text), true);
  -- Rol global del perfil
  v_claims := jsonb_set(v_claims, '{global_role}',     to_jsonb(v_rol), true);

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

-- Superficie mínima: solo Auth puede ejecutarlo
revoke all on function public.custom_access_token_hook(jsonb) from public;
revoke all on function public.custom_access_token_hook(jsonb) from anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
```

**Notas de seguridad del bloque:**
- Solo lee dos columnas de `profiles`; no usa SQL dinámico ni escribe datos.
- `security definer` es necesario porque `supabase_auth_admin` no tiene políticas en
  `profiles`; se compensa con `search_path` fijo y `revoke execute` total.
- Si se prefiere el patrón “invoker” de la documentación de Supabase, habría que conceder
  `select` sobre `profiles` a `supabase_auth_admin` **y** crear una política para ese rol;
  se descarta por mayor superficie.

### 3.3 Variante literal `auth.custom_access_token_hook` (NO viable por migración)

La tarea pedía literalmente `auth.custom_access_token_hook`. La verificación muestra que
**no puede crearse desde una migración**:

- Owner del schema `auth`: `supabase_admin`.
- `has_schema_privilege('postgres','auth','CREATE')` → **false**.
- `postgres` no es miembro de `supabase_admin`.

Variante solo de referencia (requiere que el owner del schema, `supabase_admin`, ejecute el
DDL fuera de las migraciones; **no disponible** por MCP/CLI en este entorno):

```sql
-- SOLO REFERENCIA — no ejecutable por postgres (42501 en CREATE)
create or replace function auth.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$ /* mismo cuerpo que §3.2 */ $$;

revoke all on function auth.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function auth.custom_access_token_hook(jsonb) to supabase_auth_admin;
-- URI si se usara esta variante:
-- pg-functions://postgres/auth/custom_access_token_hook
```

**Recomendación:** adoptar `public.custom_access_token_hook` y registrar la desviación en un
ADR (`decisions/`), o pedir al usuario que ejecute la variante `auth` como `supabase_admin`
si es un requisito institucional.

## 4. Prueba con evento sintético (sin datos reales)

Se validó la **lógica** del cuerpo con un `event` JSONB sintético y un perfil sintético en
una CTE (sin `INSERT`, sin tocar tablas). Resultados:

**Caso A — perfil existente:**

```json
{
  "claims_resultantes": {
    "sub": "11111111-1111-1111-1111-111111111111",
    "aud": "authenticated", "role": "authenticated", "aal": "aal1",
    "session_id": "22222222-2222-2222-2222-222222222222",
    "email": "sintetico@example.invalid", "is_anonymous": false,
    "organization_id": "33333333-3333-3333-3333-333333333333",
    "tenant_id":       "33333333-3333-3333-3333-333333333333",
    "global_role": "equipo"
  },
  "org_igual_tenant": true,
  "sub_preservado": "11111111-1111-1111-1111-111111111111"
}
```

- Los claims originales se preservan.
- `organization_id` y `tenant_id` son el mismo UUID (compatibilidad).
- `global_role` sale de `profiles.global_role` (enum válido del CHECK:
  `admin_institucional · coordinador_srhds · equipo · empresa · observador · invitado`).

**Caso B — usuario sin perfil:**

```json
{"error":{"http_code":403,"message":"HIDRIA: usuario sin perfil u organizacion; acceso denegado."}}
```

Coherente con D5: no se emite un JWT sin claims de tenant.

## 5. Activación (pasos exactos, pendiente de credencial)

### 5.1 Dashboard (vía del usuario)

1. Supabase Dashboard → proyecto `zucalshlfcxejpukshxl` → **Authentication → Hooks**.
2. **Custom Access Token** → seleccionar **Postgres function**.
3. Schema `public`, función `custom_access_token_hook` → **Enable** → Save.
4. Cerrar sesión y volver a entrar con un usuario de prueba: el JWT debe traer
   `organization_id`, `tenant_id` y `global_role`.

### 5.2 Management API (requiere `SUPABASE_ACCESS_TOKEN`)

```http
PATCH /v1/projects/zucalshlfcxejpukshxl/config/auth
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
Content-Type: application/json

{
  "hook_custom_access_token_enabled": true,
  "hook_custom_access_token_uri": "pg-functions://postgres/public/custom_access_token_hook"
}
```

Verificación (mismos campos en la respuesta):

```http
GET /v1/projects/zucalshlfcxejpukshxl/config/auth
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

Campos esperados: `hook_custom_access_token_enabled = true`,
`hook_custom_access_token_uri = "pg-functions://postgres/public/custom_access_token_hook"`.
Los nombres de campo están confirmados contra los fixtures de la API oficial
([Supabase CLI, `GET_v1_projects_*_config_auth`](https://github.com/supabase/cli)).

### 5.3 CLI / `config.toml` (requiere token y proyecto enlazado)

```toml
# supabase/config.toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
```

```powershell
npx supabase config push --project-ref zucalshlfcxejpukshxl
```

Referencias: [Auth Hooks — Supabase](https://supabase.com/docs/guides/auth/auth-hooks),
[Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook).

## 6. Verificación posterior a la activación (matriz propuesta)

| ID | Caso | Esperado | Capa |
|---|---|---|---|
| AH-01 | Usuario con perfil inicia sesión | JWT con `organization_id` == `tenant_id` y `global_role` | Auth hook |
| AH-02 | Usuario sin perfil inicia sesión | Error del hook (403) y **no** se emite JWT | Auth hook |
| AH-03 | JWT emitido antes de activar el hook (claim ausente) | `401 AUTH_INVALID` | EF/API (F1-01) |
| AH-04 | Petición con JWT manipulado sin `organization_id` | `401 AUTH_INVALID`; RLS no devuelve filas | EF/API + RLS |
| SEC-04 | JWT sin claim `organization_id` | 401 `AUTH_INVALID` (docs/05 §4.2) | Middleware de EF (no el hook) |

**Matiz importante para SEC-04:** el hook corre al **emitir** el token; no puede devolver
401 en cada llamada. Su función es impedir que se emitan JWTs sin claims (D5). El **401
`AUTH_INVALID` por llamada** debe implementarlo el middleware de las Edge Functions (y/o el
guard de sesión del cliente) en F1-01; los tokens viejos emitidos antes de la activación
siguen siendo válidos hasta expirar y también deben rechazarse por esa capa.

Prueba pgTAP propuesta (para F1-01, no creada en esta ronda): `supabase/tests/auth_hook.sql`
con `set local request.jwt.claims` para simular claims presentes/ausentes y verificar
`is_tenant_member`/RLS; la parte 401 se prueba en la suite de contrato de EF.

## 7. Hallazgos

1. **H-1 (bloqueante de activación):** no hay Supabase access token; 3 vías fallidas
   documentadas. Sin token no se puede leer ni escribir la configuración de Auth.
2. **H-2 (decisión de ubicación):** `auth.custom_access_token_hook` no es creable por
   `postgres` (evidencia de privilegios de schema). Usar `public.custom_access_token_hook`
   y URI `pg-functions://postgres/public/custom_access_token_hook`, o escalar a
   `supabase_admin` para la variante `auth`.
3. **H-3 (contradicción documental de claims):** `organization_id` vs `tenant_id`. El hook
   emite ambos; se requiere ADR para normalizar `docs/01`/`docs/02`/`docs/04`/`docs/07` y,
   si aplica, migrar `is_tenant_member`. Mientras tanto, el doble claim es la opción segura.
4. **H-4 (provisión de perfiles):** `profiles` está vacía y no hay trigger sobre
   `auth.users`. El hook falla cerrado; F1-01 debe definir cómo se crea el perfil
   (`profiles.user_id` → `auth.users`, `organization_id` NOT NULL) antes del primer login.
5. **H-5 (capa de 401):** SEC-04 no se satisface solo con el hook; requiere el guard de
   EF/API en F1-01 (ver §6).

## 8. Pendientes / siguiente paso

1. **Lead/usuario:** aportar `SUPABASE_ACCESS_TOKEN` (o ejecutar §5.1 en el dashboard) para
   activar el hook. No debe commitearse.
2. **Lead/Revisor:** decidir la ubicación (`public` recomendado) y el ADR de claims
   (`organization_id` + `tenant_id` transitorio).
3. **F1-01:** crear la migración del hook (con actualización de `docs/02`), el flujo de
   provisión de perfiles y la capa de `401 AUTH_INVALID`.
4. **QA:** incorporar AH-01…AH-04 y SEC-04 a la matriz de trazabilidad.
