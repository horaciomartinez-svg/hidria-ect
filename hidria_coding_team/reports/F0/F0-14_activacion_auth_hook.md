# F0-14 — Activación y verificación del `custom_access_token_hook` (cierre de E3)

- **Agente:** Lead (creador) — ejecución asistida por la credencial aportada por el usuario
- **Fecha:** 2026-11-07 20:30 (America/Mexico_City)
- **Tarea:** cierre de la excepción **E3** de `ADR-004` / `F0-10`
- **Entorno:** proyecto Supabase `zucalshlfcxejpukshxl` (dev/staging sintético)
- **Credencial:** `SUPABASE_ACCESS_TOKEN` del `.env` (Management API; valor **no** reproducido)
- **Resultado: VERDE — E3 RESUELTA**

## 1. Activación por Management API

Se consultó `GET /v1/projects/{ref}/config/auth` (estado inicial:
`hook_custom_access_token_enabled: false`, `hook_custom_access_token_uri: null`) y se aplicó:

```
PATCH /v1/projects/zucalshlfcxejpukshxl/config/auth
{
  "hook_custom_access_token_enabled": true,
  "hook_custom_access_token_uri": "pg-functions://postgres/public/custom_access_token_hook"
}
```

Verificación posterior (`GET` del mismo endpoint):

| Campo | Valor |
|---|---|
| `hook_custom_access_token_enabled` | **`true`** |
| `hook_custom_access_token_uri` | `pg-functions://postgres/public/custom_access_token_hook` |

La función ya existía en `public` (entregada en F1-00) con `SECURITY DEFINER`,
`search_path = public, pg_temp`, `EXECUTE` solo para `supabase_auth_admin` y fallo cerrado
(403) si el usuario no tiene perfil/organización.

## 2. Verificación end-to-end de claims (usuario real)

Para probar el hook con un JWT real (no simulado):

1. Se creó un usuario temporal vía **Admin API** (`POST /auth/v1/admin/users`) con email
   `e3.verify.<aleatorio>@example.invalid` y contraseña aleatoria.
2. Se insertó un `profiles` temporal (`organization_id = 00000000-…-0001`,
   `global_role = 'coordinador_srhds'`).
3. Se inició sesión con `POST /auth/v1/token?grant_type=password`.

Claims del JWT emitido (payload decodificado; el token **no** se reproduce):

| Claim | Valor observado |
|---|---|
| `sub` | id del usuario temporal |
| `role` / `aud` | `authenticated` / `authenticated` |
| `organization_id` | `00000000-0000-4000-8000-000000000001` |
| `tenant_id` | `00000000-0000-4000-8000-000000000001` (alias) |
| `global_role` | `coordinador_srhds` |

**Conclusión:** el hook está activo y **añade los tres claims** (`organization_id`,
`tenant_id`, `global_role`) al JWT de sesión, con `organization_id` como canónico y
`tenant_id` como alias (ADR-005).

## 3. Verificación de fallo cerrado

Se repitió el flujo con un usuario **sin** fila en `profiles`:

- `POST /auth/v1/token?grant_type=password` → **HTTP 403** (error del hook: usuario sin
  perfil/organización; acceso denegado).
- No se emitió JWT. **Fallo cerrado verificado.**

## 4. Limpieza

Los usuarios y perfiles temporales de la prueba se eliminaron al finalizar
(`DELETE /auth/v1/admin/users/{id}` y `DELETE /rest/v1/profiles?user_id=eq.{id}`). Sin datos
reales, sin secretos impresos.

## 5. Hallazgo colateral (no bloqueante de E3)

Los 6 usuarios del **seed sintético de F1-01a** tienen `auth.users.instance_id = NULL`; por
eso GoTrue no los lista (`GET /auth/v1/admin/users` → 0) ni permite login con ellos. No afecta
a E3 (la verificación se hizo con un usuario real creado por Admin API ni a las pruebas de
RLS, que usan claims simulados + `SET LOCAL ROLE`), pero si en el futuro se quieren pruebas de
**login** con los usuarios de seed, hay que fijar
`instance_id = '00000000-0000-0000-0000-000000000000'` (o crearlos vía Admin API). Se registra
para `F1-01a`/task-26 y para F1-02 (login).

## 6. Evidencia y estado

- `GET/PATCH /config/auth` → hook `true` + URI `pg-functions://postgres/public/custom_access_token_hook`.
- JWT real con claims `organization_id`, `tenant_id`, `global_role`.
- Usuario sin perfil → 403 (fallo cerrado).
- `reports/F0/F0-10_arquitecto-bd_auth_hook.md` queda como diseño previo; este reporte es la
  **activación y verificación**.

**E3: RESUELTA.** Las excepciones de `ADR-004` quedan **E2** (staging separado) y **E4**
(acta 0.6).
