# F1-01a — Auth con custom claims y roles (DB: helpers, seed y RLS)

- **Agente:** `arquitecto-bd` (02)
- **Fecha:** 2026-11-07 20:10 (America/Mexico_City)
- **Tarea:** `task-20` (F1-01a) — archivo `hidria_coding_team/tasks/F1/F1-01_auth_claims.md`
- **Rama:** `feature/F1-01a-auth-claims`, desde `main` `b4fbc83`
- **Entorno:** proyecto `zucalshlfcxejpukshxl` (dev/staging sintético, ADR-004 E2)
- **Migraciones nuevas:** `20261108020000_f1_01a_auth_claims.sql` y `20261108020010_f1_01a_fix_tenant_member.sql` (aplicadas vía MCP)
- **Evidencia:** este reporte; `schema_migrations = 14` (3 base + 9 F1-00 + 2 F1-01a)
- **Alcance:** solo DB (`supabase/migrations/**`, `supabase/tests/**`, este reporte). **No** se tocaron `supabase/functions/**` (task-21) ni `app/**` (F1-02).

## Resultado: VERDE (alcance DB)

Helpers de claims, seed sintético, grants y RLS quedaron aplicados y verificados. La
activación del hook sigue **pendiente de `SUPABASE_ACCESS_TOKEN` (E3)**; las pruebas usan claims
simulados con `SET LOCAL request.jwt.claims` + `SET LOCAL ROLE authenticated`, como acordó el
supervisor. El `401 AUTH_INVALID` (SEC-04) se implementa en el middleware EF (task-21); la BD
falla cerrado (null/false) sin claim.

## 1. Claims canónicos y helpers (ADR-005)

| Claim | Rol |
|---|---|
| `organization_id` | **Canónico**, con precedencia |
| `tenant_id` | Alias de compatibilidad (la BD lo acepta si falta el canónico) |
| `global_role` | Rol institucional: `admin_institucional`, `coordinador_srhds`, `equipo`, `empresa`, `observador`, `invitado` |

Funciones nuevas (invoker, `search_path=public,pg_temp`):

| Función | Comportamiento |
|---|---|
| `public.current_org_id()` | `organization_id`; si no existe o es inválido, `tenant_id`; `null` sin claim |
| `public.current_global_role()` | `global_role` del JWT; `null` sin claim |
| `public.has_global_role(text)` | `true` solo si coincide |
| `public.has_any_global_role(text[])` | `true` si está en la lista; `false` con lista vacía |
| `public.is_tenant_member(uuid)` | Reemplazada para usar `current_org_id()`; `false` sin claim |

Verificación en vivo (claims simulados):

| Claim | Resultado |
|---|---|
| `organization_id` = org semilla | `current_org_id` = org; `is_tenant_member(org)` = **true** |
| solo `tenant_id` = org semilla | `current_org_id` = org; `is_tenant_member(org)` = **true** |
| ambos distintos | gana `organization_id`; el alias distinto **no** habilita |
| sin claim | `current_org_id` = null; `current_global_role` = null; `is_tenant_member` = **false** |
| `organization_id` inválido | helper no rompe; `current_org_id` = null |

Grants: `EXECUTE` para `authenticated` y `service_role`; revocado de `public`/`anon`
(`has_function_privilege('anon',...) = false`).

## 2. Seed sintético (idempotente, solo `.invalid`)

| Objeto | Cantidad | Detalle |
|---|---|---|
| `auth.users` | 5 | IDs `a1000000-0000-4000-8000-000000000001..005`; emails `*.sintetico@example.invalid` |
| `profiles` | 5 | Los 5 `global_role` del CHECK, todos en la organización semilla |
| `companies` | 1 | Empresa sintética `b1000000-...001` |
| `diagnostics` | 2 | `c1000000-...001` (inicial) y `...002` (seguimiento), misma empresa/org |
| `project_members` | 6 | D1: coordinador, equipo, empresa, observador y admin(como coordinador); D2: coordinador |

Todo con `on conflict do nothing`; no se cargan datos reales. Los perfiles existen para que
`_shared/auth` (task-21) pueda probar carga de perfil y contraste de tenant.

## 3. RLS y aislamiento (SEC-01/SEC-02)

Con claims simulados de un usuario del seed y `SET LOCAL ROLE authenticated`:

| Consulta | Resultado |
|---|---|
| `organizations` | 1 |
| `profiles` | 5 |
| `diagnostics` | 2 |
| `companies` | 1 |
| `my_diagnostic_role('c1000000-...001')` | `coordinador` |
| `is_diagnostic_member('c1000000-...001')` | true |

Sin claim de tenant: `diagnostics = 0`, `organizations = 0`, `profiles = 0` (falla cerrado).
Con `tenant_id` como único claim: mismo aislamiento correcto. Con tenant ajeno: 0 filas.

## 4. pgTAP

Nueva suite `supabase/tests/060_f1_01a_auth_claims.sql` (`plan(29)`):

- seed: 5 usuarios, 5 perfiles (5 roles distintos), 6 membresías, 2 diagnósticos;
- helpers: precedencia `organization_id`, alias `tenant_id`, sin claim, claim inválido;
- `has_global_role`/`has_any_global_role` (incluido lista vacía);
- RLS/Aislamiento A/B, `my_diagnostic_role`, `is_diagnostic_member`;
- SEC-04: la BD devuelve null/false; el 401 es del middleware EF (task-21).

La suite no se ejecuta en este host (sin Docker/`supabase test db`; CI sin servicio Postgres;
excepción QA/task-13). Las aserciones equivalentes se ejecutaron vía MCP (resultados §1–§3).

## 5. Hook (E3) — estado de activación

`public.custom_access_token_hook(jsonb)` ya existe desde F1-00; **no está activado** porque no
hay `SUPABASE_ACCESS_TOKEN` (E3). URI previsto:
`pg-functions://postgres/public/custom_access_token_hook`. Mientras no se active, los JWT no
llevan claims; las pruebas usan claims simulados. La activación no se intentó de nuevo en esta
tarea (el hueco de credencial ya está documentado en `F0-10`/ADR-004 E3).

## 6. Coordinación y pendientes

- **Dev Edge Functions (task-21):** se envió el contrato de claims/helpers y los IDs del seed;
  `_shared/auth` debe usar `organization_id` con precedencia y emitir `401 AUTH_INVALID` sin
  claim/perfil inexistente/tenant distinto.
- **No** se incluyó RES-1/task-18 (`diagnostics_write`) ni residuales de task-18.
- **No** se tocó la rama cerrada de F1-00, `docs/02`, ni la migración base.
- Pendiente de entorno: activación del hook (usuario), pgTAP en CI (task-13), y prueba de
  integración real EF ↔ claims (task-21).

## 7. Reproducción

```sql
-- helpers (claims simulados)
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000002","organization_id":"00000000-0000-4000-8000-000000000001","global_role":"equipo"}';
select public.current_org_id(), public.current_global_role(),
       public.has_global_role('equipo'), public.is_tenant_member('00000000-0000-4000-8000-000000000001');

-- RLS (set role authenticated y el mismo claim)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000001","organization_id":"00000000-0000-4000-8000-000000000001","global_role":"coordinador_srhds"}';
select count(*) from public.diagnostics; -- 2
rollback;
```

## 8. Publicación

- **PR:** [#7](https://github.com/horaciomartinez-svg/hidria-ect/pull/7) — `feature/F1-01a-auth-claims` → `main`
- **Commit de implementación:** `ff0c657b5d9a49535fc5f94218b94fd7be813e97`
- **CI:** 4/4 `success` sobre `ff0c657` (Guardas + Cliente; runs `42436849996` / `42436872669`).
- **Base:** `main` al crear el PR `6b95be0`; mergeable sin conflictos.
- El merge corresponde al supervisor; no se ejecutó merge ni rebase.

