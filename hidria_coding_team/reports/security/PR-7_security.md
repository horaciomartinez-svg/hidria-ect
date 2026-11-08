# PR #7 — Revisión de Seguridad (F1-01a: claims, RLS y seed)

- **Agente:** `seguridad-privacidad` (08) — autoridad de **veto**
- **Fecha:** 2026-11-07 20:10 (America/Mexico_City)
- **PR:** [#7](https://github.com/horaciomartinez-svg/hidria-ect/pull/7) — `feature/F1-01a-auth-claims` → `main`
  («feat(f1-01a): helpers de claims, seed sintético y RLS de auth»)
- **Head revisado:** `44891b333b3eb65a0d04d69b4484c7614ba03377` · **Base:** `main@6b95be062736bd62d65c9e8fa48419d7aece078e`
  (el brief inicial citaba `ff0c657`; el delta `ff0c657..44891b3` es **1 archivo, +9/−0**, solo
  `reports/F1/F1-01_auth_claims.md` §8 Publicación — sin cambios en migraciones, helpers,
  grants, seed ni RLS).
- **Contenido del PR:** 4 archivos, +391/−0 — `20261108020000_f1_01a_auth_claims.sql` (+141),
  `20261108020010_f1_01a_fix_tenant_member.sql` (+21), `supabase/tests/060_f1_01a_auth_claims.sql`
  (+95), `reports/F1/F1-01_auth_claims.md` (+134). Solo DB: no toca `app/**` ni
  `supabase/functions/**`.
- **Estado:** ambas migraciones **ya aplicadas** en `zucalshlfcxejpukshxl`
  (`schema_migrations` = **14**: 3 base + 9 F1-00 + 2 F1-01a). CI **4/4 `success`** en
  `44891b3` (runs `42436975870`/`42436979634`); `mergeable_state: clean`.
- **Método:** MCP Supabase **solo lectura** + claims simulados (`SET LOCAL request.jwt.claims`
  + `SET LOCAL ROLE authenticated`) y fixtures con `ROLLBACK`; MCP GitHub para CI. Sin `git`
  de escritura, sin merge.

## Veredicto vigente: **VETO LEVANTADO** en el head `4197602` (delta task-30) — ver §8

> El análisis de §3/§6 conserva el histórico del **VETO provisional** sobre `44891b3`.

> **Causal (`agents/08` §4 — control de autorización fail-open):**
> **SEC-PR7-01** — los helpers de autorización `has_global_role(text)` y
> `has_any_global_role(text[])` devuelven **`true` sin claim de rol** cuando se les pasa
> `NULL`, cadena vacía o `array['']`:
> `has_global_role(NULL)=true`, `has_global_role('')=true`,
> `has_any_global_role(array[''])=true`. Es una primitiva de autorización que **no falla
> cerrado**; cualquier futura política/EF que la use con un argumento nulo/vacío (p. ej.
> rol tomado de un request) concedería acceso sin rol. Hoy **no hay llamadores en RLS/EF**
> (las políticas usan `auth.jwt()` directo; task-21 aún no consume los helpers), por lo que no
> existe explotación actual — pero es el mismo defecto que el spec review marcó como **B1** y
> debe corregirse antes del merge.
>
> El resto de controles de F1-01a (invoker, `search_path`, grants, precedencia de claims,
> falla cerrada de `current_org_id`/`is_tenant_member`, regresión de RLS A/B y de las 7
> políticas, seed sintético, forward-only y ausencia de secretos) está **verificado y
> correcto** (§2). M2 (seed `invitado`) y M1 (seed dentro de migración) quedan como
> condiciones del nuevo head/task-27, no como causal adicional de veto.

## 1. Alcance y límites

| Ítem | Estado |
|---|---|
| Diff completo (4 archivos) y estado aplicado (14 migraciones) | Revisado/contrastado |
| Helpers + comportamiento con claims simulados (válidos, alias, precedencia, nulos, vacíos, inválidos) | Verificado en vivo (§2.1, §3.1) |
| Grants y ejecución por rol | Verificado (`anon` → 42501; `authenticated`/`service_role` OK) |
| Regresión RLS F1-00: aislamiento A/B + 7 políticas con `WITH CHECK` | Verificado con seed y claims sintéticos |
| Seed sintético (5 users, 5 profiles, company, 2 diagnostics, 6 members) | Verificado; sin PII; 0 passwords |
| pgTAP 060 | Revisado en archivo (`plan(29)`); **no ejecutado** (sin Postgres/CI; task-13) |
| `docs/02`/migración base | Intactos (SHA-256 idénticos `2A7B6F88…42CB5`) |
| PR #7 en GitHub | **CAMBIOS SOLICITADOS** por spec review (B1 + M2) → este veto queda a la espera del nuevo head |

## 2. Lo verificado correctamente (sin hallazgos)

### 2.1 Helpers de claims — definición y comportamiento

| Función | Definición aplicada (coincide con el SQL del PR) | Resultado |
|---|---|---|
| `current_org_id()` | `language sql`, `stable`, **invoker** (`prosecdef=false`), `search_path=public,pg_temp`; `organization_id` validada con `pg_input_is_valid` con **precedencia** y `tenant_id` como alias; `null` sin claim o claims inválidos | ✅ |
| `current_global_role()` | invoker, `search_path` fijo; `nullif(claim,'')` → `null` sin claim | ✅ |
| `has_global_role(text)` | invoker, `search_path` fijo | ✅ con rol válido; **fail-open con NULL/'' sin claim → §3.1** |
| `has_any_global_role(text[])` | invoker, `search_path` fijo | ✅ con listas válidas; **fail-open con `array['']` sin claim → §3.1** |
| `is_tenant_member(uuid)` | invoker, `search_path` fijo; `p is not null AND current_org_id() is not null AND p = current_org_id()` | ✅ **false** sin claim; ✅ con `organization_id`; ✅ con alias `tenant_id`; ✅ precedencia canónica |

Comportamiento probado con `SET LOCAL ROLE authenticated` (claims simulados):

| Caso | Resultado |
|---|---|
| Sin claim de tenant | `current_org_id=null`; `is_tenant_member(org)=false`; RLS `organizations=0`, `diagnostics=0` ✅ (falla cerrado) |
| Solo `organization_id` | org correcta; `is_tenant_member(org)=true`; RLS 1 org / 5 profiles / 2 diagnostics / 1 company; `my_diagnostic_role(D1)='coordinador'`; `is_diagnostic_member(D1)=true` ✅ |
| Solo `tenant_id` (legacy) | org correcta; RLS 5 profiles / 2 diagnostics ✅ (compatibilidad) |
| Ambos claims con valores distintos | gana **`organization_id`**; `is_tenant_member(tenant_id distinto)=false`; RLS 2 diagnostics ✅ |
| `organization_id` inválido + `tenant_id` válido | fallback a `tenant_id`; helper no rompe; RLS 2 diagnostics ✅ (sin cruce de tenant) |
| Ambos claims inválidos | `current_org_id=null`; `is_tenant_member=false`; RLS 0 filas, **sin error de cast** ✅ |
| Tenant ajeno con `global_role='admin_institucional'` | RLS 0 filas (el rol global no salta el tenant) ✅ |

### 2.2 Grants

| Verificación | Resultado |
|---|---|
| ACL de las 5 funciones | `{postgres=X, authenticated=X, service_role=X}` — **sin `PUBLIC`/`anon`** ✅ |
| `has_function_privilege('anon', …)` | **false** en las 5; llamada real como `anon` → **42501** ✅ |
| `authenticated` / `service_role` | EXECUTE **true** (necesario para RLS y EF) ✅ |
| `has_schema_privilege` | `authenticated`/`anon` **CREATE=false** en `public` (no pueden shadowear objetos de `search_path`) ✅ |
| `service_role` en cliente/repo | No aparece en `app/` ni en el diff ✅ |

### 2.3 Regresión de RLS F1-00 (la redefinición de `is_tenant_member` no debilita nada)

- Aislamiento A/B con claims del seed: tenant propio = **1 org / 5 profiles / 2 diagnostics /
  1 company**; tenant ajeno = **0**; sin claim = **0**; alias `tenant_id` = mismo aislamiento.
- Las **7 políticas `WITH CHECK`** de F1-00 siguen activas (`pg_policies`: 105 políticas, 46
  tablas con RLS; las 7 con `with_check` no nulo). Pruebas independientes con claims
  sintéticos:
  - **Negativas (todas 42501):** `invitado`→`companies`/`diagnostics`/`profiles` admin;
    `observador`→`documents`/`iih_assets`/`samples`/`water_balances`;
    `coordinador_srhds`→`profiles` `admin_institucional`. Harness `DO` con captura:
    `negativas_7_tablas_ok`.
  - **Positivas:** `coordinador_srhds` crea company y profile no-admin ✅; `equipo` inserta
    documents/samples/water_balances/iih_assets y actualiza `diagnostics` (1 fila) ✅.
- `my_diagnostic_role`/`is_diagnostic_member` intactas (definer, `search_path=public`).
- `custom_access_token_hook` y demás funciones sensibles sin cambios (EXECUTE sigue solo
  `supabase_auth_admin`; `fn_audit_write`/`fn_bhe_*`/`fn_diag_role` no ejecutables por
  `authenticated`).

### 2.4 Seed sintético

| Verificación | Resultado |
|---|---|
| `auth.users` | **5** (IDs `a1000000-…0001..0005`), emails `*.sintetico@example.invalid` / `*.sintetica@example.invalid` ✅ |
| Credenciales | **0** con `encrypted_password`; **0** con teléfono; **0** con metadata; `email_confirmed_at` set; no SSO; no baneados → no hay login por contraseña (y `.invalid` no entrega correo) ✅ |
| `profiles` | **5**, con 5 roles (`admin_institucional`, `coordinador_srhds`, `empresa`, `equipo`, `observador`); emails `.invalid`; nombres sintéticos; **0 PII real** ✅ |
| Company / diagnostics / members | 1 `companies`; 2 `diagnostics` con `index_version_id` válido (versión IVOH 1 vigente); 6 `project_members` ✅ |
| Idempotencia | Las 6 sentencias usan `on conflict … do nothing` (PK/`user_id`/`(diagnostic_id,user_id)`) — reaplicables sin duplicar ✅ (no reejecutadas para no mutar el proyecto) |
| Accesos indebidos | El rol `admin_institucional` sintético no puede autenticarse (sin password, `.invalid`) ni altera RLS (el aislamiento se probó con claims simulados) ✅ |

### 2.5 Forward-only, alcance y secretos

- Diff real del PR (`b4fbc83..44891b3`): **4 archivos** (`A`), solo `supabase/migrations/`,
  `supabase/tests/` y el reporte; **sin** `app/**`, `supabase/functions/**`, `docs/**`.
- `docs/02` ↔ migración base: SHA-256 **idénticos** (`2A7B6F88…42CB5`); las migraciones
  previas no se editaron (solo 2 archivos nuevos). ✅
- Secret scan del delta: **0** patrones (sin JWT/tokens/claves); los únicos correos del diff
  son sintéticos `*.example.invalid`. ✅
- CI 4/4 en `44891b3`; `mergeable_state: clean`. ✅

## 3. Hallazgos

### BLOQUEANTE

#### **SEC-PR7-01 — Fail-open en `has_global_role` / `has_any_global_role` (sin claim, argumento nulo/vacío)**

- **Evidencia en vivo** (`SET LOCAL ROLE authenticated`; `request.jwt.claims = {"sub": …}` sin
  `global_role`):

| Llamada | Resultado | Esperado (fail-closed) |
|---|---|---|
| `has_global_role(NULL)` | **true** ❌ | false |
| `has_global_role('')` | **true** ❌ | false |
| `has_any_global_role(array[''])` | **true** ❌ | false |
| `has_any_global_role(NULL)` | false ✅ | false |
| `has_any_global_role(array[]::text[])` | false ✅ | false |
| `has_any_global_role(array['admin_institucional'])` | false ✅ | false |

- **Causa:** `coalesce(current_global_role(),'') = coalesce(p_role,'')` hace que `'' = ''`
  cuando no hay claim o el claim está vacío; análogamente `= any(array[''])`.
- **Impacto:** primitiva de autorización que **no falla cerrado**. Cualquier política/EF futura
  que llame `has_global_role(valor)`/`has_any_global_role(lista)` con `NULL`, `''` o
  `array['']` (p. ej. rol proveniente de un request o de un campo opcional) **concedería
  acceso sin rol**. Hoy no hay llamadores en RLS/EF (task-21 pendiente), por lo que no hay
  explotación actual, pero el helper es la base del enforcement de claims de F1-01.
- **Corrección esperada (forward-only, task-26):**
  `has_global_role(p) := p is not null and p <> '' and current_global_role() = p` y
  `has_any_global_role(a) := current_global_role() is not null and a is not null and
  current_global_role() = any(a)` (o equivalente con `array_position`), conservando
  invoker/`search_path`/grants y el comportamiento con claims válidos.
  Añadir a `060` las aserciones: sin claim → `has_global_role(NULL)=false`,
  `has_global_role('')=false`, `has_any_global_role(array[''])=false`,
  `has_any_global_role(NULL)=false`; con claim válido → los verdaderos siguen verdaderos.

### Condiciones del nuevo head (no causales adicionales de veto)

| ID | Severidad | Hallazgo | Acción |
|---|---|---|---|
| **SEC-PR7-02** | MENOR | **M2 — seed sin rol `invitado`:** el seed cubre 5 de los 6 valores del CHECK (`admin_institucional`, `coordinador_srhds`, `equipo`, `empresa`, `observador`); no hay profile `invitado` ni membresía de prueba para ese rol. | Incluir en task-26 un profile sintético `invitado` (y, si aplica, membresía) con email `.invalid`, sin PII ni accesos indebidos; añadir aserción en `060`. |
| **SEC-PR7-03** | MENOR (entorno/higiene) | **M1 — seed dentro de migración:** inserta 5 filas en `auth.users` (con `email_confirmed_at`) + profiles/company/diagnostics/members en el proyecto compartido dev/staging (`zucalshlfcxejpukshxl`, que `docs/07` prevé como piloto). No hay credenciales (0 passwords, `.invalid`), pero el seed viaja a todo entorno que aplique migraciones. | **task-27** (decisión Lead): mover a `supabase/seed.sql`/seed gated por entorno o ADR que lo justifique; documentar purga/limpieza de los `auth.users` sintéticos antes de datos reales en piloto (ADR-004 E2). |
| **SEC-PR7-04** | MENOR | Dependencias de versión: `pg_input_is_valid` (helpers) y `revoke maintain` (F1-00) requieren **PostgreSQL ≥ 16**; el proyecto actual es **17.11**. | Documentar el mínimo en `docs/07`/ADR-004 o añadir guarda por `server_version_num` para staging (task-18/DevOps). |
| **SEC-PR7-05** | NOTA | El reporte del autor §8 cita head `ff0c657` y runs `42436849996/42436872669`; el head actual es `44891b3` (runs `42436975870/42436979634`). El delta es solo documental; sin impacto de seguridad. | Actualizar en el commit del nuevo head. |

### Observaciones (correctas, sin acción)

- `has_global_role` con claim válido y argumento no vacío funciona (`equipo`→true; lista
  `['equipo','admin']`→true) y con argumento nulo/vacío con claim válido devuelve false ✅.
- `has_any_global_role(array[NULL])` devuelve `NULL` (RLS lo trata como false); recomendable
  convertirlo a `false` exacto en el fix (fail-closed literal).
- La política de 5 roles sembrados es coherente con el criterio del task original («5
  profiles de los 5 roles»); el hueco `invitado` se documenta como M2.

## 4. Condiciones para levantar el VETO

1. **Nuevo head** de task-26 con migración forward-only que corrija SEC-PR7-01
   (fail-closed) y añada `invitado` al seed (M2) + aserciones en `060`; sin editar las
   migraciones aplicadas ni `docs/02`.
2. **Re-revisión de seguridad del delta** (solo hallazgos + regresión):
   - helpers con claims nulos/vacíos/`array['']`/`array[NULL]` → **false**; con claims válidos
     y alias `tenant_id` → comportamiento actual;
   - sin regresión de grants (anon/PUBLIC sin EXECUTE; authenticated/service_role con EXECUTE),
     invoker/`search_path`, RLS A/B, 7 políticas (negativas y positivas), `is_tenant_member`
     false sin claim;
   - seed `invitado` sin PII ni accesos indebidos; idempotencia; resto del seed intacto;
   - forward-only (`schema_migrations` = 15 tras la nueva), `docs/02` byte-idéntico, diff sin
     secretos, CI 4/4.
3. **M1/task-27** rastreado (ADR o `supabase/seed.sql` gated) — no bloquea #7 si queda
   formalmente en el backlog; sí debe cerrarse antes de datos reales en piloto.

## 5. Evidencia principal

| # | Comando/consulta | Resultado |
|---|---|---|
| 1 | `git diff --stat b4fbc83..44891b3` / `--name-status` | 4 archivos, +391; solo migrations/tests/report |
| 2 | `pg_proc` (5 helpers) | invoker, `search_path=public,pg_temp`, ACL `{postgres,authenticated,service_role}` |
| 3 | `has_function_privilege` + llamada como `anon` | anon false / **42501** |
| 4 | Claims simulados: solo `organization_id`, solo `tenant_id`, ambos distintos, inválidos, tenant ajeno | precedencia correcta; alias correcto; inválidos → null/false; ajeno → 0 filas |
| 5 | `has_global_role`/`has_any` sin claim | `NULL/''/array['']` → **true** (SEC-PR7-01); resto false |
| 6 | RLS A/B con seed + `SET LOCAL ROLE authenticated` | 1/5/2/1 vs 0; sin claim 0; alias 0 |
| 7 | 7 políticas F1-00 (negativas y positivas) | negativas 42501 (7/7); positivas OK |
| 8 | Seed | 5 users / 5 profiles / 1 company / 2 diagnostics / 6 members; 0 passwords; 0 PII no-`.invalid` |
| 9 | `schema_migrations` | **14** (3+9+2) con los 2 nombres nuevos |
| 10 | Hash `docs/02` ↔ base; secret scan delta | idénticos; **0** patrones |
| 11 | CI GitHub | **4/4 success** en `44891b3` |

## 6. Conclusión

- La **arquitectura de claims de F1-01a es correcta** (precedencia, alias, falla cerrada de
  `current_org_id`/`is_tenant_member`, invoker + `search_path`, grants, regresión de RLS y
  seed sintético sin PII) y el estado aplicado coincide con el SQL del PR.
- **Un defecto de autorización impide aprobar en este head:** `has_global_role`/
  `has_any_global_role` son **fail-open** con `NULL`/`''`/`array['']` sin claim. Se emite
  **VETO provisional**, alineado con B1 del spec review, hasta el nuevo head de task-26.
- M2 (`invitado`) y M1 (`seed` en migración/task-27) quedan como condiciones del nuevo head;
  ninguna es una nueva exposición de datos.

## 7. ADR-007 (seed sintético, M1) — visto bueno de seguridad **CONDICIONADO**

Revisado `hidria_coding_team/decisions/ADR-007-seed-sintetico.md` (estado *propuesta*; supervisor
ya aprobó). La decisión es **correcta en su dirección** y sus garantías declaradas se
verificaron en la BD: seed solo sintético (`*.sintetico@example.invalid` / `*.sintetica`,
UUID fijos), **0** usuarios con password, **0** con teléfono/metadata, sin PII real, sin
secretos; el `admin_institucional` sintético no puede autenticarse (sin password, dominio
`.invalid`) y no accede a datos reales porque no existen; retirada obligatoria antes de
piloto/G3 vía `task-27`; fixtures futuros a `supabase/seed.sql`/CI.

**Visto bueno de seguridad CONDICIONADO** al ADR-007, con estas condiciones (a registrar en el
ADR §5 y en `task-27`):

1. **Limpieza forward-only (task-27) con alcance y guardas explícitas:** debe definir orden y
   verificación — `project_members` (o por `ON DELETE CASCADE` de `diagnostics`), luego
   `diagnostics`, `companies`, `profiles`, `auth.users`; **no** tocar la organización base
   `00000000-0000-4000-8000-000000000001` ni el catálogo `ivoh_index_versions`
   `…0000a1`. Debe **abortar** si un UUID fijo no coincide con el email sintético esperado
   (protección contra colisión con datos reales) o si existen dependientes inesperados, en
   lugar de borrar en cascada datos ajenos; y verificar tras ejecutar: **0** filas de
   `auth.users`/`profiles`/`companies`/`diagnostics`/`project_members` del seed y **0** correos
   `*.invalid`. Evidencia en `reports/` y paso explícito del runbook `docs/07` §5.
2. **Enforcement de la regla “fixtures fuera de migraciones”:** añadir guarda de CI
   (`scripts/ci/guardas.sh` o job) que falle si `supabase/migrations/**` inserta en
   `auth.users` o tablas de negocio (sí permitido: catálogos/maestros de `docs/03`), y/o
   checklist obligatorio de revisión. Así la regla del ADR §2.3 no depende de memoria.
3. **Endurecimiento de futuros seeds (no bloqueante):** no fijar `email_confirmed_at` en los
   usuarios sintéticos (o marcarlos `banned_until`) mientras no se necesite login real; usar
   solo dominios reservados `.invalid`; nunca promover el `admin_institucional` sintético a una
   organización con datos reales.
4. **Trazabilidad del ADR:** registrar en §5 «Seguridad: APROBADO CON CONDICIONES
   (2026-11-07 20:20, ver `reports/security/PR-7_security.md`)», completar la aprobación del
   revisor y pasar el ADR a *aceptada*. El archivo está **untracked** hoy: debe commitearse con
   el nuevo head/PR documental.

> Este visto bueno **no levanta el VETO de PR #7**: SEC-PR7-01 (fail-open) y M2 (`invitado`)
> siguen pendientes del nuevo head de task-26; el ADR-007 queda aprobado condicionado y
> rastreado por `task-27` (bloqueante de G3).

## 8. Re-revisión delta `44891b3..4197602` — **VETO LEVANTADO** (seguridad)

- **Head:** `41976020da7f4735fc58b7c00de667ae7fa508f1` · **Base:** `main@6b95be0` · 3 commits,
  5 archivos, +484/−0 · delta `44891b3..4197602` = **3 archivos, +116/−23**: migración nueva
  `20261108020020_f1_01a_fix_roles.sql` (+57), `060_f1_01a_auth_claims.sql` (+45/−…, plan 46),
  reporte del autor. **CI 4/4 success** en `4197602` (runs `42437594209`/`42437598913`);
  `mergeable_state: clean`. Migración aplicada → **`schema_migrations` = 15** (3 base + 9 F1-00
  + 3 F1-01a). Sin cambios en `app/**`, `supabase/functions/**` ni `docs/**`.
- **Método:** MCP Supabase solo lectura + claims simulados/`SET LOCAL ROLE authenticated` y
  fixtures con `ROLLBACK`; MCP GitHub para CI.

### 8.1 SEC-PR7-01 (fail-open): **CORREGIDO** ✅

Definición aplicada (`create or replace`, invoker, `search_path=public,pg_temp`, grants
solo `authenticated`/`service_role` — ACL `{postgres,authenticated,service_role}`, `anon`
false, `PUBLIC` fuera):

| Caso (claims simulados) | Pruebas | Resultado |
|---|---|---|
| **Sin claim** | `has_global_role(NULL)` / `('')` | **false / false** ✅ |
| **Sin claim** | `has_any_global_role(NULL)` / `array[]` / `array['']` / `array[NULL]` | **false / false / false / false** ✅ |
| **Claim vacío** (`organization_id=''`, `global_role=''`) | `current_org_id` / `current_global_role` / `has_global_role(NULL|'')` / `has_any(array[''])` | **null / null / false / false** ✅ |
| **Claim válido** (`equipo`) | `has_global_role('equipo')` / `has_any(['equipo'])` / `has_any(['equipo',NULL])` | **true / true / true** ✅ |
| **Claim válido** | `has_global_role(NULL|''|' ')` / `has_any([''])` / `has_any(['admin','empresa'])` | **false / false / false** ✅ |
| **Alias `tenant_id`** | `current_org_id` = org; `is_tenant_member(org)` = true; RLS 1 org / 6 profiles / 2 diags / 1 company | ✅ sin regresión |

> **Residual menor SEC-PR7-D1:** con claim válido, `has_any_global_role(array[NULL])` devuelve
> **NULL**, no `false` (`coalesce(array_length(...))` + `= any` con NULL). No hay bypass
> (RLS/`IF` tratan NULL como false y el caso exigido —sin claim— sí da `false`), pero conviene
> `coalesce(..., false)` y una aserción con `array[NULL]` bajo claim válido; lo dejo como
> condición para `task-21`/`task-13`.

### 8.2 M2 — seed `invitado`: **CORREGIDO** ✅

- `auth.users` = **6** (IDs `a1000000-…0001..0006`), emails `*.sintetico@example.invalid` /
  `*.sintetica`; **6** `profiles` con los **6** `global_role` del CHECK, incluido `invitado`
  (`invitado.sintetico@example.invalid`, "Invitado Sintético"); **0** perfiles con email no
  `.invalid`; **0** usuarios sintéticos con `encrypted_password`; sin teléfono/metadata.
- El usuario `invitado` sintético **no tiene membresías** (`project_members = 0`), no tiene
  password ni dominio resoluble → **no puede autenticarse**; el `admin_institucional` sintético
  sigue igual (sin login y sin datos reales). El seed no abre accesos por sí mismo (los roles
  RLS se derivan de claims firmados, no del profile).
- Comportamiento con claims `invitado` + org semilla: `has_global_role('invitado')=true`,
  `is_tenant_member=true`, `my_diagnostic_role=null`, `is_diagnostic_member=false` ✅.
- **Observación SEC-PR7-D2 (no introducida por este PR):** si un `invitado` llegara a
  autenticarse, las políticas de lectura existentes de F0 (`diagnostics_sel`,
  `profiles_sel` con `is_tenant_member`) le permitirían leer el ámbito del tenant, aunque
  `docs/01` §5 describe lectura por membresía/agregado. Revisar el alcance de `invitado` en
  F1-01/ADR de RLS; el seed aquí no añade membresías ni datos reales.

### 8.3 Regresión (sin hallazgos) y controles de F1-00

| Verificación | Resultado |
|---|---|
| A/B con claims válidos (tenant propio / ajeno) | 1 org / 6 profiles / 2 diags / 1 company vs **0** ✅ |
| Sin claim | `current_org_id=null`, `is_tenant_member=false`, RLS **0** filas ✅ |
| Tenant ajeno con `global_role='admin_institucional'` | RLS **0** filas ✅ |
| 7 políticas con `WITH CHECK` (negativas invitado/observador/coordinador-admin) | **42501** en las 7 (`negativas_7_tablas_ok`) ✅ |
| `v_quiz_questions` | SELECT **14** filas; `UPDATE` como `authenticated` → **42501**; `anon` SELECT false ✅ |
| Grants helpers | `anon` EXECUTE **false**; `authenticated`/`service_role` **true**; invoker y `search_path` intactos ✅ |
| Estructura RLS | 46 tablas / 46 con RLS / **105** políticas / 7 `with_check` ✅ |
| Forward-only | 15 migraciones; delta solo 3 archivos; migraciones previas y `docs/02` **no editados** (SHA-256 `2A7B6F88…42CB5` idéntico) ✅ |
| Secretos / alcance | Secret scan del delta **0**; sin `app/**`, `functions/**` ni `docs/**` ✅ |

### 8.4 Condiciones residuales (no bloquean el merge de seguridad)

| ID | Severidad | Condición | Dueño |
|---|---|---|---|
| **SEC-PR7-D1** | **RESUELTO** en `20030` | `has_any_global_role(array[NULL])` con claim válido → **false** (y `array['equipo',NULL]` con claim `equipo` → true); verificado en §8.6. | `arquitecto-bd` (cerrado) |
| **SEC-PR7-D2** | OBSERVACIÓN | Alcance de lectura del rol `invitado` en políticas de F0 (tenant-wide vs membresía/agregado de `docs/01`); el seed no añade membresías ni login. | F1-01/ADR RLS |
| **M1 / task-27** | MAYOR (entorno, ya rastreada) | Limpieza forward-only del seed antes de piloto/G3, con las condiciones de `ADR-007` (no tocar org base/catálogo IVOH; abortar ante UUID/email inesperados; evidencia 0 filas). | Lead/arquitecto-bd, bloqueante G3 |
| **task-28** | MENOR (proceso) | Guarda CI de “fixtures fuera de migraciones” (ADR-007 §2.3). | DevOps/QA |
| **task-13** | MENOR (proceso) | Suite `060` (plan **51**) revisada pero **no ejecutada** en CI; sigue la excepción pgTAP documentada. | DevOps/QA, antes de G1 |

### 8.5 Confirmación del head final `b67abf3` (delta solo documental)

- Head final PR #7: `b67abf3ef05657cf5d8a63921123a1d7a94a6040`; delta `4197602..b67abf3` =
  **1 archivo, +4/−3**, solo `reports/F1/F1-01_auth_claims.md` §8 (commit de implementación
  inicial `ff0c657`, fix B1/M2 `4197602`, CI 4/4 sobre `4197602`). **Sin cambios en
  migraciones, helpers, grants, seed, RLS ni `docs/02`.**
- CI sobre `b67abf3`: **4/4 `success`** (runs `42437706108`/`42437709939`); `mergeable_state:
  clean`. Secret scan del delta: 0.
- **El veredicto VETO LEVANTADO de §8 se mantiene para `b67abf3`**: el código de seguridad
  revisado es idéntico a `4197602`; el delta es exclusivamente documental.

### 8.6 Re-revisión FINAL — head limpio `c958c9e` (merge `main@f83569a`) — **VETO LEVANTADO se mantiene**

- **Head:** `c958c9e9f9422814e4b9cf6b1907cb2b65168bec` (merge commit; base `main@f83569a`;
  3 commits visibles en el PR; CI **4/4 `success`** en `c958c9e`, runs `42438497450`/
  `42438501225`; `mergeable_state: clean`). Delta de seguridad desde `b67abf3`: **nueva
  migración `20261108020030_f1_01a_fix_roles2.sql` (+47)**, `060` ampliado (`plan 51`) y merge
  documental del reporte F1-01 (sin cambios de SQL). **Ninguna migración previa editada.**
- **SEC-PR7-D1 (residual) — RESUELTO y verificado en la BD aplicada (`schema_migrations = 16`,
  última `20261108020030`):**
  - Sin claim: `has_any_global_role(NULL|array[]|array['']|array[NULL]|array['equipo',NULL])`
    → **false** en todos ✅.
  - Con claim `equipo`: `['equipo']` → **true**, `['equipo',NULL]` → **true**, `array[NULL]` →
    **false**, `array['']` → **false**, `array[]` → **false**, `NULL` → **false**; y
    `has_global_role('equipo')`=true / `has_global_role(NULL)`=false ✅. La nueva implementación
    usa `unnest` + `role is not null/<> ''` + `coalesce(..., false)` (nunca NULL).
- **Seed / `instance_id` (E3):** los **6/6** `auth.users` sintéticos tienen
  `instance_id = 00000000-0000-0000-0000-000000000000` (visibles para GoTrue); **0 identities,
  0 passwords, 0 teléfonos/metadata**, 6 profiles con 6 roles (1 `invitado`, **0 membresías**),
  0 emails no-`.invalid`; sin PII real. Los usuarios sintéticos siguen sin ruta de login
  (sin password/identity y dominio `.invalid`) y no abren accesos por sí mismos; **siguen siendo
  solo dev/staging** y la limpieza obligatoria antes de piloto/G3 sigue en **task-27**
  (condición `ADR-007`).
- **Regresión (BD aplicada):** tenant propio con claims `coordinador_srhds` → 1 org / **6**
  profiles / 2 diagnostics / 1 company / `v_quiz_questions` **14** / `v_diagnostic_completeness`
  **2**; tenant ajeno (admin_institucional) → **0/0/0**; sin claim → RLS **0**, `is_tenant_member`
  false; **7 políticas** `WITH CHECK` negativas con invitado/observador/coordinador-admin →
  **42501** (7/7); `UPDATE` de `v_quiz_questions` como authenticated → **42501**; 105 políticas,
  46 tablas con RLS; grants helpers: `anon` EXECUTE **false**, `authenticated`/`service_role`
  **true**.
- **Forward-only / higiene:** 16 migraciones; solo el archivo nuevo `20030` en el delta de
  migraciones (las previas no se editaron); `docs/02` y migración base byte-idénticos
  (SHA-256 `2A7B6F88…42CB5`); secret scan del delta **0**; CI 4/4.
- **Conclusión:** **VETO LEVANTADO se mantiene** para `c958c9e`; no hay hallazgos nuevos de
  seguridad. Residuales vigentes: SEC-PR7-D2 (observación de alcance de `invitado`, task-35),
  M1/task-27 (limpieza de seed antes de piloto/G3), task-28 (guarda CI), task-13 (060 en CI);
  nota dev-only del `instance_id` (no añadir passwords/identities ni usar estos usuarios con
  datos reales).

## Firma

`seguridad-privacidad` (08) — **VETO LEVANTADO** (seguridad) para los heads
`41976020da7f4735fc58b7c00de667ae7fa508f1`, `b67abf3ef05657cf5d8a63921123a1d7a94a6040` y
`c958c9e9f9422814e4b9cf6b1907cb2b65168bec` del PR #7 (el segundo y el tercero son deltas
documental/residual, §8.5/§8.6): SEC-PR7-01 corregido y verificado (fail-closed sin claim y con
argumentos nulos/vacíos), M2 `invitado` sin PII ni accesos indebidos, `instance_id` de los seeds
sin rutas de login, sin regresión de grants/RLS/aislamiento/quiz, forward-only y sin secretos.
El **VETO provisional** sobre `44891b3` queda como histórico en §3/§6. Condiciones residuales en
§8.4/§8.6 (SEC-PR7-D2, M1/task-27, task-28, task-13). Aprobación de seguridad emitida; el merge
lo ejecuta `supervisor-hidria` con el cuórum de reportes y CI verde (ruleset `proteccion-main`
con required checks y `non_fast_forward`). Sin fuga de secretos, sin datos reales y sin cambios
persistentes en la BD (fixtures con `ROLLBACK`; solo secuencias no transaccionales en el
proyecto de desarrollo). Sin `git` de escritura y sin merge.
