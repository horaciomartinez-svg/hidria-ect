# PR #7 — QA: F1-01a helpers de claims, seed sintético y RLS de auth (DB)

- **Agente:** `qa-tester` (05)
- **Fecha:** 2026-11-07 20:15 (America/Mexico_City)
- **Tarea:** `task-25` — F1 · QA PR #7 (F1-01a auth claims DB)
- **PR:** [#7](https://github.com/horaciomartinez-svg/hidria-ect/pull/7) — `feature/F1-01a-auth-claims` → `main`
- **Head evaluado (inicial):** `44891b333b3eb65a0d04d69b4484c7614ba03377`
- **Head QA anterior:** `b67abf3ef05657cf5d8a63921123a1d7a94a6040` — ver «Re-QA delta»
- **Head final QA:** `c958c9e9f9422814e4b9cf6b1907cb2b65168bec` (merge de `main@f83569a`; residual `20261108020030`) — ver «Re-QA final `c958c9e`» al final
- **Base:** `main` `f83569a9ef5f8bfaad522a71a1ca92058a75affa` · merge-base con la rama: `b4fbc83`
- **Diff del PR (base..head):** 6 archivos, +427/−21 — 4 migraciones, 1 suite pgTAP y 1 reporte. Sin cambios en `app/**`, `.github/**`, `supabase/functions/**`, `docs/02` ni migración base.
- **Deltas:** `44891b3..b67abf3` (fix B1/M2 `20261108020020`, suite 46); `b67abf3..c958c9e` (residual `20261108020030` + main `f83569a` mergeado; suite 51).
- **Entorno:** local Windows (PowerShell) + proyecto Supabase `zucalshlfcxejpukshxl` (consultas de solo lectura) + GitHub Actions

## Resultado: AMARILLO — merge permitido con excepción pgTAP documentada

> **Actualización head final `c958c9e`:** el residual Q-01 quedó corregido en
> `20261108020030` (`has_any_global_role(array[NULL])` → **false**, con y sin claim; sin
> regresión en `array['']`/`array[]`/NULL) y los 6 seed users tienen `instance_id` de GoTrue.
> La suite `060` pasó a **`plan(51)`** (51/51 aserciones estáticas). Sigue **AMARILLO**:
> la suite no se ejecutó (0/51) y task-13 sigue siendo gate antes de G1. Ver «Re-QA final
> `c958c9e`» al final: sustituye los conteos históricos.
>
> **No es ROJO**: no hay defecto de esquema/servicio demostrado; migraciones aplicadas y
> verificadas en vivo, CI 4/4 y regresión limpia.
> **No es VERDE pleno**: la suite `060` **no se ejecutó** (0/51). Es el mismo tipo de
> excepción que F1-00: se permite el merge, pero **task-13 (pgTAP en CI con Postgres) es
> obligatoria antes de G1** y la matriz no cambia a verde.
> **No bloqueante.** El `401 AUTH_INVALID` no se valida aquí (es middleware EF, task-21); E3
> (activación del hook) queda documentado; el seed sigue en migración por ADR-007/task-27.

## 1. Respuestas explícitas

### 1.1 Cobertura de la suite `060` (plan y huecos)

`plan(29)` = **29 aserciones** (verificado estáticamente: 29 sentencias `is/ok/...`).
Cobertura DB de F1-01a: **buena en lo esencial, incompleta en bordes**.

| Bloque | Aserciones | Qué cubre | ¿Ejecutada? |
|---|---|---|---|
| Seed | 5 | 5 `auth.users`, 5 `profiles`, 5 roles distintos, 6 membresías, 2 diagnósticos | ❌ |
| Claims canónicos | 5 | `current_org_id` con `organization_id`, `current_global_role`, `has_global_role` true/false, `is_tenant_member` true | ❌ |
| Alias `tenant_id` | 2 | `current_org_id` y `is_tenant_member` con alias | ❌ |
| Precedencia | 2 | `organization_id` gana; alias distinto no habilita | ❌ |
| Sin claim | 3 | `current_org_id` NULL, `current_global_role` NULL, `is_tenant_member` false | ❌ |
| Claim inválido | 1 | `organization_id` no-UUID → `current_org_id` NULL | ❌ |
| RLS con `SET ROLE` | 6 | orgs=1, profiles=5, diagnostics=2, companies=1, `my_diagnostic_role`, `is_diagnostic_member` | ❌ |
| RLS sin claim / alias / ajeno | 4 | 0 filas sin claim, alias aísla, UUID ajeno 0 filas | ❌ |
| `has_any_global_role` | 1 | solo lista vacía = false | ❌ |
| **Total** | **29** | | **0/29** |

**Huecos de la suite (para task-13, no defectos bloqueantes):**
1. **Grants no asertados** en la suite (no hay `has_function_privilege`); QA los verificó por
   SQL (§2). Deben añadirse a `060`.
2. `has_any_global_role` **positivo** no se prueba (solo lista vacía); QA lo verificó por SQL.
3. **Bordes nulos**: `has_global_role(NULL)` devuelve **true** sin claim (hallazgo QA O-03);
   `is_tenant_member(NULL)` false; no están cubiertos en la suite.
4. **Fallback de claim inválido**: se prueba `organization_id` inválido, pero no
   `tenant_id` inválido ni el caso "org inválida + tenant válido" (la función cae al alias).
5. **Aislamiento real A/B**: no hay un tenant B **poblado**; el caso "ajeno" usa un UUID sin
   filas. No demuestra filtrado de filas de otro tenant (SEC-01/02 parcial).
6. **Idempotencia del seed** no se prueba (no se re-ejecuta la migración); por construcción
   usa `on conflict do nothing`.
7. **`service_role`/`PUBLIC`** no se asertan en pgTAP (sí verificados por QA vía SQL).
8. No prueba el hook (E3, fuera de alcance) ni `401 AUTH_INVALID` (EF, task-21).

### 1.2 ¿La evidencia en vivo (MCP, claims simulados) basta para VERDE F1-01a con excepción, o es bloqueante?

**No es bloqueante para el merge; no alcanza para VERDE pleno.** Dictamen **AMARILLO con
excepción documentada**, igual que F1-00:

- El objeto del PR es DB (helpers/seed/RLS); su efecto se verificó **en vivo** con claims
  simulados (`SET LOCAL request.jwt.claims` + `SET LOCAL ROLE authenticated`): QA lo
  contrastó de forma independiente y coincide (§2).
- CI 4/4 en `44891b3`; la suite no se ejecuta en el pipeline, así que su no ejecución no
  rompe runtime ni CI.
- Es deuda de pruebas rastreada en **task-13**, con cierre obligatorio antes de G1.

**Condiciones del merge:** (a) citar la excepción; (b) task-13 ejecuta `060` en CI con
Postgres y publica run id antes de G1; si falla, el arquitecto la corrige; (c) matriz sin
verdes hasta entonces; (d) spec + security reviews fuera de QA.

### 1.3 `401 AUTH_INVALID`

Fuera de alcance: corresponde al middleware EF (task-21). Aquí solo se valida que la **BD
falla cerrado**: sin claim → `current_org_id` NULL, `is_tenant_member` false y RLS 0 filas
(verificado por SQL). El reporte del PR lo declara correctamente.

### 1.4 Trazabilidad

`qa/trazabilidad.md` actualizada solo en lo aplicable: R-16 y R-17 con nota de evidencia SQL
de F1-01a, suite `060` añadida a «Suites F1 (definidas, no ejecutadas)» (68 aserciones, 0
ejecutadas), huecos H-10/H-11 y Evidencia F1-01a. **Ninguna fila nueva a `verde`.**

### 1.5 Regresión

| Comprobación | Resultado |
|---|---|
| CI en `44891b3` | **4/4 success** (runs 42436975870 push y 42436979634 PR; `head_sha=44891b3`) |
| `mergeable_state` | `clean` |
| `docs/02` byte-idéntico a la migración base | **Sí**: mismo blob `a2394bce…` en `44891b3` para ambos archivos |
| Migración base / `docs/02` editados | No (`git diff` del PR solo 4 archivos) |
| Diff sin secretos | Sí: secret scan sobre el árbol `44891b3` sin coincidencias; job «Guardas» verde |
| Archivos fuera de alcance | No: solo `supabase/migrations/**`, `supabase/tests/**` y el reporte |
| Forward-only / idempotente | Sí: 2 migraciones nuevas con `create or replace`/`on conflict do nothing`; no edita aplicadas |

## 2. Verificación independiente (MCP Supabase, solo lectura)

| Comprobación | Resultado |
|---|---|
| `schema_migrations` | **14** filas (3 base + 9 F1-00 + 2 F1-01a), nombres con prefijo de archivo |
| Helpers F1-01a | 5 presentes: `current_org_id()`, `current_global_role()`, `has_global_role(text)`, `has_any_global_role(text[])`, `is_tenant_member(uuid)` |
| Naturaleza | **invoker** (`prosecdef=false`) y `search_path=public, pg_temp` en los 5 |
| `organization_id` canónico | `current_org_id()` = org; `has_global_role('coordinador_srhds')`=true; `has_global_role('equipo')`=false; `is_tenant_member(org)`=true |
| Alias `tenant_id` | `current_org_id()` = org; `is_tenant_member(org)`=true |
| Precedencia (ambos distintos) | gana `organization_id`; `is_tenant_member` del alias ajeno = false |
| Sin claim | `current_org_id`=NULL, `current_global_role`=NULL, `is_tenant_member`=false; RLS: orgs=0, profiles=0, diagnostics=0 |
| Claim inválido | `organization_id`="no-es-uuid" → `current_org_id`=NULL; `is_tenant_member`=false |
| `has_any_global_role` | `['equipo','coordinador_srhds']`=true; lista vacía=false |
| Grants | `authenticated` y `service_role` EXECUTE=true; `anon`=false; `proacl` sin entrada `PUBLIC` (solo postgres/authenticated/service_role) |
| Seed | 5 `auth.users`, 5 `profiles` (5 roles), 1 company, 2 diagnostics, 6 `project_members`; emails `.invalid` |
| RLS con `SET ROLE authenticated` | orgs=1, profiles=5, diagnostics=2, companies=1; `my_diagnostic_role`=coordinador; `is_diagnostic_member`=true |
| Borde | `has_global_role(NULL)`=**true** sin claim (ver O-03); `has_any_global_role(NULL)`=false; `is_tenant_member(NULL)`=false |

Consultas ejecutadas como transacciones de solo lectura (`SET LOCAL` + `ROLLBACK`) sobre el
proyecto; sin escrituras persistentes.

## 3. Ejecutabilidad de `060` (misma limitación que F1-00)

La suite **no corre en un Postgres+pgtap genérico**: necesita el baseline Supabase (roles
`anon`/`authenticated`/`service_role`, `auth.users`/`auth.jwt()`, semilla de catálogos) y la
extensión `pgtap`. Bajo `supabase test db` (stack local) sí es ejecutable; esa es la ruta de
**task-13** (`supabase start` + `supabase db reset` + `supabase test db`), no un
`services: postgres` pelado. Además, `060` usa `SET LOCAL ROLE authenticated` y
`request.jwt.claims`, lo que requiere las roles/extensión de Supabase.

## 4. Observaciones (no bloqueantes)

| ID | Observación | Severidad | Dueño |
|---|---|---|---|
| O-01 | **Seed dentro de migración forward-only**: cualquier entorno que aplique migraciones (staging y, en release, `piloto`) recibiría 5 cuentas `auth.users`/`profiles` sintéticas. Mover a `supabase/seed.sql` o gatear por entorno **antes de F1-16/piloto**. En dev/staging sintético es aceptable. | P2 | arquitecto-bd + devops |
| O-02 | Versiones MCP ≠ prefijos de archivo (14 filas con timestamp de aplicación); `supabase db push` en staging las verá pendientes. Reconciliar antes de F1-16 (ya rastreado desde F1-00). | P2 | arquitecto-bd + devops |
| O-03 | `has_global_role(NULL)` devuelve **true** si no hay claim (`coalesce(null,'')=coalesce(null,'')`). No es explotable con las políticas actuales (siempre llaman con literal), pero es fail-open en borde; añadir `p_role is not null` y caso en `060`. | P3 | arquitecto-bd |
| O-04 | Huecos de la suite (grants, `has_any` positivo, nulos, fallback `tenant_id` inválido, tenant B poblado, idempotencia seed); completarlos en task-13 sin tocar producto. | P2 (G1) | QA + arquitecto |
| O-05 | Hook sin activar (E3, falta `SUPABASE_ACCESS_TOKEN`); `401 AUTH_INVALID` es task-21. Documentado en el PR y en `docs/07`; no se valida aquí. | P2 (entorno) | devops/arquitecto |
| O-06 | `060` usa UUID fijos y asume el seed; válido en CI/local con `db reset`, pero cualquier ejecución contra una BD ya modificada requerirá transacción + rollback (la suite ya lo hace). | P3 | QA |

## 5. CI del head `44891b3`

| Run | Evento | Checks | Resultado |
|---|---|---|---|
| [42436975870](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42436975870) | `push` | Guardas success · Cliente success | **2/2** |
| [42436979634](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42436979634) | `pull_request` | Guardas success · Cliente success | **2/2** |

Ambos con `head_sha=44891b333b3eb65a0d04d69b4484c7614ba03377`; `mergeable_state=clean`.

## 6. Checklist QA (`agents/05_qa_tester.md` §5)

| Criterio | Estado |
|---|---|
| Suites aplicables ejecutadas y verdes | **NO** — 0/29 (`060` definida, no ejecutada) |
| Sin regresiones | ✓ CI 4/4; F1-00 no regresiona (helpers con alias `tenant_id`) |
| Matriz actualizada | ✓ notas SQL F1-01a; sin verdes |
| Gates metodológicos | N/A en F1-01a (solo auth DB) |
| SEC-04 (`401`) | N/A — task-21 (EF); BD falla cerrado |
| SEC-01/02 (aislamiento) | parcial — SQL A/sin claim/ajeno; tenant B poblado no probado; suite no ejecutada |

## 7. Conclusión y siguiente paso

- **Dictamen: AMARILLO — merge permitido con excepción pgTAP documentada.** Sin veto de QA.
- **Condición gate:** task-13 ejecuta `060` (y las suites previas) en verde antes de G1;
  mientras tanto la matriz no cambia a verde.
- Recomendaciones no bloqueantes: O-01 (seed fuera de migración antes de piloto), O-03
  (borde `has_global_role(NULL)`), O-04 (completar aserciones de `060`).
- QA no hace commit/push/merge. Este reporte y `qa/trazabilidad.md` quedan en el working
  tree sobre `44891b3` para el commit de seguimiento/squash.

## Firma

QA `qa-tester`. Sin modificación de producto, migraciones, `app/**`, `.github/**` ni
`supabase/functions/**`; solo reporte QA y matriz. Sin secretos impresos; consultas Supabase
de solo lectura.

## Re-QA delta `44891b3..b67abf3` (2026-11-07 20:30, America/Mexico_City)

**Motivo:** PR #7 pasó por CAMBIOS SOLICITADOS (B1 fail-open + M2 falta de `invitado`) y
avanzó a **`b67abf3ef05657cf5d8a63921123a1d7a94a6040`**. `4197602` era el fix; `b67abf3` es
solo el commit documental de §8 (+4/−3). Base `main@6b95be0`.

### Delta verificado

| Pieza | Cambio |
|---|---|
| `20261108020020_f1_01a_fix_roles.sql` (+57) | **B1:** `has_global_role` exige claim no nulo, `p_role` no nulo/no vacío y coincidencia exacta; `has_any_global_role` exige claim, array no vacío y coincidencia. **M2:** alta idempotente del 6.º rol `invitado` (`auth.users` + `profiles`, `on conflict do nothing`). Forward-only: **no** edita `20261108020000` ni `20261108020010` (verificado). |
| `060_f1_01a_auth_claims.sql` | `plan(29)` → **`plan(46)`**; +45/−18 líneas. |
| Reporte F1-01 | §1–§4, §8 actualizados (15 migraciones, seed 6, B1/M2, CI de `4197602`). |

### Cobertura B1/M2 de la suite 060 (46 aserciones, plan=46 verificado)

| Caso exigido | ¿En suite? | Resultado real (QA, SQL) |
|---|---|---|
| `has_global_role(NULL)` sin claim | ✓ | false |
| `has_global_role('')` sin claim | ✓ | false |
| `has_any_global_role(array[''])` sin claim | ✓ | false |
| `has_any_global_role(array[])` sin claim | ✓ | false |
| claim vacío (`global_role=''`/`organization_id=''`) | ✓ (5 aserciones) | `current_*` null; helpers false |
| con claim `equipo`: roles válidos true / `NULL`,`''`, `array['']` false | ✓ (6 aserciones) | true/false correctos |
| **con claim + `has_any_global_role(array[NULL])`** | **✗ (no cubierto)** | **NULL**, no `false` — ver Q-01 |
| M2 `invitado`: rol y helpers true | ✓ (3 aserciones) | true |
| M2 conteos seed 6 users/profiles/roles | ✓ (3 aserciones) | 6/6/6 |

El resto de las 46 aserciones (precedencia/alias/sin claim, RLS A/ajena, `my_diagnostic_role`,
`is_diagnostic_member`, `has_any` vacío) se mantiene del head anterior. **Huecos que siguen:**
grants no asertados en pgTAP, tenant B **poblado** no probado, `service_role`/`PUBLIC`, y
`array[NULL]` (Q-01). El `plan()` coincide con el número real: **46 = 46**.

### Verificación independiente en vivo (MCP, solo lectura)

- `schema_migrations` = **15** (3 base + 9 F1-00 + 3 F1-01a); migraciones previas sin editar.
- Sin claim: `has_global_role(NULL|'')`=false; `has_any(array['']|array[]|NULL)`=false.
- Con claim `equipo`: helpers de rol correctos; **`has_any(array[NULL]::text[])` = NULL** (Q-01).
- Seed: **6** `auth.users` y **6** `profiles`; roles = `admin_institucional, coordinador_srhds,
  empresa, equipo, invitado, observador`; **6/6 emails `@example.invalid`**; **6/6 sin password
  y 0 identities** → cuentas sintéticas sin login; `invitado` con **0 membresías**.
- Grants de los helpers: `authenticated` y `service_role` sí; `anon`/`PUBLIC` no.
- M2 acceso: como `invitado` del tenant semilla, `my_diagnostic_role`=NULL e
  `is_diagnostic_member`=false, pero las políticas **preexistentes** `diagnostics_sel` y
  `profiles_sel` (`is_tenant_member`) le dejan leer 2 diagnósticos y 6 perfiles del tenant
  — ver Q-02.

### Hallazgos del delta (no bloqueantes)

| ID | Hallazgo | Severidad | Dueño |
|---|---|---|---|
| Q-01 | `has_any_global_role(array[NULL])` **con claim** devuelve **NULL**, no `false` (sin claim sí es false por cortocircuito). En RLS `NULL` deniega, así que **no hay bypass**, pero no cumple el contrato booleano estricto y la suite no lo cubre. Añadir `coalesce(..., false)`/filtro de nulos y aserción en `060` (task-13 o micro-fix task-26). | P3 | arquitecto-bd + QA |
| Q-02 | El seed `invitado` no tiene membresías ni rol de diagnóstico, pero la política **preexistente** tenant-level (`diagnostics_sel`/`profiles_sel` = `is_tenant_member`) le permite **leer** los 2 diagnósticos y 6 perfiles del tenant. No lo introduce #7 (políticas sin cambios), pero M2 pide "sin accesos indebidos": confirmar con `docs/01`/security si `invitado` debe ser solo tenant-read. | P2 (confirmar) | security + revisor |
| Q-03 | La suite no aserta grants (`has_function_privilege`) ni el no-acceso del invitado; completar en task-13. | P3 | QA |

### Regresión (head `b67abf3`)

| Comprobación | Resultado |
|---|---|
| CI | **4/4 success** en `b67abf3` (run 42437706108 `push` + 42437709939 `pull_request`, `head_sha=b67abf3`); `mergeable_state=blocked` solo por re-revisiones pendientes |
| `docs/02` byte-idéntico a la migración base | **Sí**: mismo blob `a2394bce…` en `b67abf3` |
| Secretos | Secret scan del árbol `b67abf3` sin coincidencias; guardas CI verdes |
| Archivos fuera de alcance | No: PR = 5 archivos (`supabase/migrations/**` x3, `supabase/tests/**`, reporte) |
| Forward-only | Sí: migración nueva; `20261108020000`/`20261108020010` y base sin editar; 15 filas en `schema_migrations` |

### Dictamen final

**AMARILLO — merge permitido con excepción pgTAP documentada** para `b67abf3`. B1 y M2
quedan **resueltos en lo esencial** y verificados en vivo; Q-01 (NULL de borde) y Q-02
(lectura tenant de `invitado`, preexistente) **no bloquean** el merge, pero deben quedar como
condiciones: (a) Q-01 se corrige/cubre en task-13 o micro-fix; (b) Q-02 lo confirman
security/docs; (c) task-13 ejecuta `060` (46 aserciones) y las previas antes de G1. Si
spec/security exigen `array[NULL]=false` estricto, es un CAMBIO SOLICITADO, no un veto de QA.
Sin git de escritura; el reporte y `qa/trazabilidad.md` quedan en working tree.

## Re-QA final `c958c9e` (2026-11-07 20:55, America/Mexico_City)

**Motivo:** head limpio tras merge de `main@f83569a` en la rama (`c958c9e9f9422814e4b9cf6b1907cb2b65168bec`);
CI 4/4 y `mergeable_state=clean`. PR final: **6 archivos, +427/−21**, base `f83569a`.

### Delta verificado

| Pieza | Cambio |
|---|---|
| `20261108020030_f1_01a_fix_roles2.sql` (+47) | **Q-01 resuelto:** `has_any_global_role` usa `unnest` + filtro de nulos/vacíos y `coalesce(..., false)` ⇒ `array[NULL]`, `array['']`, `array[]`, `array['',NULL]` devuelven **false**; `array['equipo',NULL]` es true si hay claim `equipo`. **E3:** fija `instance_id='00000000-0000-0000-0000-000000000000'` en los 6 `auth.users` sintéticos (GoTrue los ve). Forward-only: no edita `20261108020000/010/020` (verificado). |
| `060_f1_01a_auth_claims.sql` | `plan(46)` → **`plan(51)`**: +1 aserción `instance_id`, +2 sin claim (`array[NULL]`, `array['equipo',NULL]`), +2 con claim `equipo` (`array[NULL]`, `array['equipo',NULL]`). |
| Reporte F1-01 | Actualizado (16 migraciones, 51 aserciones, `instance_id`, CI final). |
| Merge de `main@f83569a` | Resuelve el conflicto de `reports/F1/F1-01_auth_claims.md`; no toca código fuera de F1-01a. |

### Verificación independiente (MCP, solo lectura)

- `schema_migrations` = **16** (3 base + 9 F1-00 + 4 F1-01a); migraciones previas **sin editar** (diff vacío de 20000/010/020).
- Sin claim: `array[NULL]`, `array['',NULL]`, `array['']`, `array[]`, `NULL` ⇒ **false**.
- Con claim `equipo`: `array[NULL]`=false; `array['',NULL]`=false; `array['equipo',NULL]`=**true**; `array['']`/`array[]`=false; `NULL`=false; `has_global_role(NULL)`=false. **Q-01 cerrado.**
- Seed: **6** `auth.users` con `instance_id` de ceros (**6/6, 0 NULL**), 6 `profiles`, 6 roles distintos (`admin_institucional, coordinador_srhds, empresa, equipo, invitado, observador`), 6 membresías, 2 diagnósticos; emails `.invalid`; helper `has_any_global_role` invoker con `search_path=public, pg_temp`.
- Suite: `plan(51)` = **51 aserciones estáticas**; incluye `instance_id` y los 4 casos `array[NULL]` con/sin claim.

### Regresión

| Comprobación | Resultado |
|---|---|
| CI en `c958c9e` | **4/4 success** — runs [42438497450](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42438497450) (push) y [42438501225](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42438501225) (PR), `head_sha=c958c9e`; Guardas + Cliente |
| `docs/02` byte-idéntico a la migración base | **Sí**: mismo blob `a2394bce…` en `c958c9e` |
| Secretos | Secret scan del árbol `c958c9e` sin coincidencias; guardas CI verdes |
| Alcance | 6 archivos: 4 migraciones + suite `060` + reporte; sin `app/**`, `.github/**`, `functions/**`, `docs/02` ni migración base |
| Forward-only | Nueva migración `20030`; 20000/010/020 sin editar; 16 filas en `schema_migrations` |

### Dictamen final

**AMARILLO — merge permitido con excepción pgTAP documentada** para `c958c9e`. Q-01
(`array[NULL]`) queda **cerrado y verificado** en BD y en la suite; `instance_id` de los 6
seed users presente (6/6); 16 migraciones; CI 4/4; guarda 3 intacta. La única excepción sigue
siendo que la suite `060` (51 aserciones) **no se ejecutó** (sin runner pgTAP; task-13 la
debe ejecutar en CI antes de G1). Persiste la observación Q-02 (lectura tenant del `invitado`
por política preexistente) y M1/ADR-007/task-27 (seed en migración). **No es bloqueante**;
merge permitido con la excepción citada. Sin git de escritura; reporte y matriz quedan en
working tree.
