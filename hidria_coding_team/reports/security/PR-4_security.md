# PR #4 — Revisión de Seguridad y Privacidad (F1-00)

- **Agente:** `seguridad-privacidad` (08) — autoridad de **veto**
- **Fecha:** 2026-11-07 19:35 (America/Mexico_City)
- **PR:** [#4](https://github.com/horaciomartinez-svg/hidria-ect/pull/4) — `feature/F1-00-migraciones` → `main`
  («feat(f1-00): migraciones correctivas, grants DML y enforcement»)
- **Head revisado:** `4b057b3c3bd756316b86b6d88b73aff0af939b17` · **Base:** `main` `8008a648161f36823302429bb302dd832a9ec231`
- **Diff:** 13 archivos, +1333/−0 (8 migraciones `2026110801*_f1_00_*.sql`, 4 suites pgTAP, 1 reporte)
- **CI:** run `42433977733` (push) y `42433979462` (PR) — **4/4 checks `success`**
- **Estado de la BD:** las **8 migraciones ya están aplicadas** en `zucalshlfcxejpukshxl`
  (`schema_migrations` = 11 filas), por lo que esta revisión contrasta el SQL del PR con el
  **estado real** y verifica que no se introdujeron concesiones inseguras.
- **Método:** MCP GitHub (diff), MCP Supabase **solo lectura** + fixtures sintéticos en
  transacciones con `ROLLBACK`. Ningún DDL/DML persistente; sin `git` de escritura.
- **Tarea:** tablero `task-11` · write scope: solo este reporte.

## Veredicto: **VETO** — 2 hallazgos BLOQUEANTES

> **Causales de veto (`agents/08_seguridad_privacidad.md` §4): «RLS/privilegios
> incorrectos».**
>
> 1. **SEC-PR4-01 — Escritura de `authenticated` sobre el banco de preguntas vía
>    `v_quiz_questions`:** la vista es auto-actualizable y `authenticated` conserva
>    `INSERT/UPDATE/DELETE` (ACL `arwdm`); verificado: UPDATE=1 fila y DELETE=1 fila sobre
>    `quiz_questions` con rol `authenticated`, pese a que la tabla cruda está denegada
>    (42501). Rompe la regla dura «`quiz_questions` cruda solo `service_role`»
>    (`TEAM.md` §4/§15.6) y permite manipular/borrar el banco de exámenes desde el cliente.
> 2. **SEC-PR4-02 — `WITH CHECK` incompleto en 7 políticas `FOR ALL`:** el `GRANT` de este
>    PR activa políticas cuyo control de rol está solo en `USING`; para `INSERT` solo se
>    evalúa `WITH CHECK`. Verificado: un usuario `authenticated` con `global_role='invitado'`
>    puede INSERTAR `diagnostics`, `companies` y **su propio `profiles` con
>    `global_role='admin_institucional'`** (escalada de privilegio en cuanto se active el
>    auth hook de F1-01). Afecta a `companies`, `diagnostics`, `documents`, `iih_assets`,
>    `profiles`, `samples`, `water_balances`.
>
> El veredicto **no** se debe a fuga de secretos (0 hallazgos), ni a `service_role` en el
> cliente, ni a datos reales: la base es de desarrollo con datos sintéticos (`auth.users=0`,
> `profiles=0`, 1 organización semilla, 14 preguntas semilla, 0 ARCO). El VETO es por
> **control de acceso incorrecto** en el esquema que este PR consolida/aprueba. El merge se
> detiene hasta corregir y re-revisar el delta (condiciones en §5).

## 1. Alcance y límites

| Ítem | Estado |
|---|---|
| Diff completo (8 migraciones + 4 pgTAP + reporte) | Revisado localmente en `4b057b3` (= head del PR) |
| Estado real de la BD vs SQL del PR | Contrastado (migraciones, grants, vistas, políticas, funciones, índice, hook, semilla) |
| Aislamiento multi-tenant con JWT sintético A/B | Verificado (§3.3) |
| Prueba HTTP PostgREST con JWT de usuario | **No ejecutada**: `auth.users=0` y F1-00 es solo lectura; se usó `SET LOCAL ROLE authenticated` + `request.jwt.claims` (misma capa de privilegios/RLS que PostgREST) |
| pgTAP de las 4 suites | **No ejecutadas** (host sin Docker/`supabase test db`, CI sin servicio Postgres); se replicaron las aserciones vía MCP. Excepción de QA documentada (follow-up `task-13`) |
| “Allow public access” de Realtime | **No verificable por MCP** (ajuste de consola/Management API; E3) |
| Efectos colaterales de fixtures | Todo en transacciones con `ROLLBACK`; las **secuencias** (`diagnostics_folio_seq`, `privacy_folio_seq`) avanzaron de forma no transaccional (comportamiento normal de PostgreSQL). No persisten filas ni cambios; proyecto de desarrollo con datos sintéticos |

## 2. Estado aplicado vs SQL del PR (coincide)

| Verificación | Evidencia SQL | Resultado |
|---|---|---|
| Migraciones aplicadas | `supabase_migrations.schema_migrations` | **11 filas** = 3 base + **8 F1-00**, nombres = archivos del PR ✅ |
| Tablas / RLS / vistas / políticas | consultas a `pg_class`/`pg_policies` | **46 tablas / 46 con RLS / 6 vistas / 105 políticas public / 3 políticas realtime** ✅ |
| `docs/02` ↔ migración base | SHA-256 local | **idénticos** (`2A7B6F88…42CB5`); el PR no toca `docs/02` ni la migración base ✅ |
| `security_invoker=true` | `pg_class.reloptions` | **5/6**: `v_bhe_monthly`, `v_bhe_summary`, `v_balance_indicators`, `v_ivoh_score`, `v_diagnostic_completeness` ✅; `v_quiz_questions` = `NULL` (definer, justificado) ✅ |
| Realtime | `pg_publication_tables` / `pg_policies` | **5 tablas** publicadas (`notifications`, `diagnostics`, `document_checklist_items`, `samples`, `logbook_entries`) + **3 políticas** `hidria_rt_*` (diagnostic/org/user) ✅ |
| Hook | `pg_proc` + ACL | `public.custom_access_token_hook(jsonb)` existe, `security definer`, `search_path=public,pg_temp`; EXECUTE solo `supabase_auth_admin` ✅ (no activado: E3) |
| Default y semilla | `information_schema.columns` / `organizations` | `profiles.global_role default 'invitado'` (dentro del CHECK) ✅; `organizations.name = 'SRHDS — Programa HIDRIA'`, 0 nombres prohibidos ✅ |
| Índices H-5/M-01/M-03 | `pg_indexes`/`pg_constraint` | `audit_log_prev_hash_uniq`, `audit_log_idempotency_key_idx`, `uq_ivoh_index_versions_vigente`, `report_emissions_folio_key`, `api_idempotency_user_endpoint_key_key` presentes ✅ |
| Triggers H-5/M-02/M-03 | `pg_trigger` | `audit_hash`, `diagnostics_phase_gate`, `custody_gate`, `report_emission_folio`, `ivoh_immutable`, `logbook_immutable` adjuntos a sus tablas ✅ |

## 3. Checklist del foco (con evidencia)

### 3.1 Grants PostgREST por tabla

| Comprobación | Resultado |
|---|---|
| `authenticated` SELECT en `quiz_questions` cruda | **false** (42501 al consultar/actualizar la tabla) ✅ |
| `authenticated` SELECT/INSERT/UPDATE/DELETE en `api_idempotency` | **false** (42501 al SELECT) ✅; ACL solo `postgres` + `service_role` |
| `authenticated` SELECT en `v_quiz_questions` | **true** (14 filas, sin `correcta`) ✅ — pero ver **SEC-PR4-01** por DML |
| `anon` | **0 tablas** con SELECT/INSERT/UPDATE/DELETE; **0 funciones** ejecutables; sin acceso a `organizations`/vistas ✅ |
| `service_role` | INSERT en **46/46** tablas; `audit_log` = `INSERT+SELECT` **sin UPDATE/DELETE/TRUNCATE** ✅; SELECT en `quiz_questions` (14) ✅ |
| `authenticated` DML | **42/46 tablas** (excluye `quiz_questions`, `api_idempotency`, `audit_log`, `report_emissions`) ✅; además conserva DML sobre **las 6 vistas** por el `GRANT … ON ALL TABLES` → **SEC-PR4-01** |
| `authenticated` SELECT en relaciones | **50/52** (excluye tabla del banco y `api_idempotency`) — coincide con la verificación del supervisor ✅ |

### 3.2 `security_invoker` y justificación de la vista definer

- Las 5 vistas analíticas son `security_invoker=true`: con RLS de las tablas base, un
  `authenticated` del tenant A ve **1** fila en `v_bhe_monthly`, `v_bhe_summary`,
  `v_balance_indicators` y `v_diagnostic_completeness` (la fila del tenant B queda filtrada);
  `entradas_m3` del tenant A = 100 (no 200) ✅.
- `v_quiz_questions` sigue **sin** `security_invoker` (definer, owner `postgres`) porque la
  tabla cruda está revocada para `authenticated`; es la única forma de servir las 4 columnas
  seguras. **Justificación aceptada** para lectura… pero su **auto-actualizabilidad** es el
  defecto SEC-PR4-01 (ver §4).
- `v_diagnostic_completeness` **no es actualizable** (probado: `0A000 cannot update column`);
  las otras vistas tampoco. **Solo `v_quiz_questions` es auto-actualizable**, lo que acota el
  defecto pero no lo elimina.

### 3.3 Aislamiento multi-tenant (JWT sintético A vs B, rollback)

Fixtures sintéticos: orgs A/B, usuarios A/B, perfiles, empresas, diagnósticos, membresías,
balances y flujos. Claims del tenant A (`sub`, `tenant_id`, `organization_id`, `global_role='equipo'`):

| Consulta | Tenant A ve | Esperado |
|---|---|---|
| `organizations` / `diagnostics` / `companies` / `profiles` / `project_members` | **1 / 1 / 1 / 1 / 1** | 1 (fila B filtrada) ✅ |
| `v_diagnostic_completeness` / `v_bhe_monthly` / `v_bhe_summary` / `v_balance_indicators` | **1 / 1 / 1 / 1** | 1 (fila B filtrada) ✅ |
| `v_quiz_questions` | **14** | 14 (banco común) ✅ |
| `audit_log` | **0** | 0 (política solo admin/SRHDS) ✅ |
| `privacy_requests` | 0 (sin datos) | — (ver SEC-PR4-03) |

Además, `UPDATE` de un diagnóstico del tenant B desde el tenant A devolvió **0 filas** ✅.

### 3.4 M-02 / M-03 — auditoría, folios y funciones privilegiadas

- **Auditoría (M-02):** como `service_role`, dos llamadas a `fn_audit_write` producen
  **2 filas**, `hash` de **64 hex**, `prev_hash` distintos (2) y cadena lineal (`GENESIS→…`);
  `trg_audit_hash` contiene `pg_advisory_xact_lock` y `search_path=public, extensions, pg_temp`
  (fix aplicado) ✅. `audit_log` servicio: INSERT+SELECT, **sin UPDATE/DELETE/TRUNCATE** ✅.
- **Folio (M-03):** dos emisiones sintéticas → `…-R1` y `…-R2` (sin sobrescritura); el trigger
  `report_emission_folio` asigna revisión/folio e ignora lo que envíe el cliente;
  `authenticated` no puede INSERTAR/UPDATEAR/DELETEAR `report_emissions` (solo SELECT) ✅.
- **Funciones:** `authenticated` **no** puede ejecutar `fn_audit_write`, `fn_bhe_monthly`,
  `fn_bhe_summary`, `fn_diag_role`, `fn_is_diag_member` ni `custom_access_token_hook`
  (`42501` verificado en `fn_bhe_monthly` y `has_function_privilege=false`) ✅; `service_role`
  sí las ejecuta (verificado `fn_audit_write`, `fn_diag_role`, `fn_is_diag_member`) ✅.
  Las únicas `SECURITY DEFINER` ejecutables por `authenticated` son los helpers de RLS
  (`is_tenant_member`, `my_diagnostic_role`, `is_diagnostic_member`,
  `is_logbook_entry_member`), necesarios para evaluar políticas ✅.

### 3.5 M-05 — Realtime

- 5 tablas publicadas y 3 políticas de canales privados (`diagnostic:{uuid}`, `org:{uuid}`,
  `user:{uuid}`) con `realtime.topic()` y `pg_input_is_valid` (sin casts que rompan) ✅.
- `realtime.messages` tiene RLS habilitada ✅.
- **Riesgo residual (MAYOR, entorno):** el ajuste “Allow public access” de Realtime debe
  desactivarse en consola/Management API antes de RT-01/02 (F1-17). No verificable por MCP;
  mientras esté activo, las políticas de canales privados no son la única frontera. No bloquea
  el merge de migraciones si se acepta como condición documentada (ya prevista en el PR y en
  `ADR-006`), pero debe cerrarse antes de usar Realtime en producto.

### 3.6 Hook de claims (ADR-005 / E3)

- `custom_access_token_hook` devuelve `claims.organization_id` y `claims.tenant_id` con el
  **mismo UUID** y `global_role` desde `profiles` (prueba sintética: `equipo`), preservando el
  resto de claims ✅.
- **No activado** (falta `SUPABASE_ACCESS_TOKEN`, E3): hoy los JWT no llevan claims → RLS
  deniega por defecto (falla cerrada). **Condición:** F1-01 debe rechazar tokens sin
  `organization_id` (SEC-04) y la activación del hook debe ir acompañada de la corrección de
  SEC-PR4-02 (la escalada de `profiles` se materializa con el hook activo).

### 3.7 Enforcement H-5 (probado negativa y positivamente, rollback)

| Regla | Prueba | Resultado |
|---|---|---|
| Custodia: dictamen solo con 3 transferencias **firmadas** | 3 transferencias con firma vacía → INSERT `lab_results.dictamen` | **P0001** «Dictamen bloqueado…» ✅ |
| Custodia (positivo) | 3 firmas válidas → INSERT dictamen | aceptado ✅ |
| Gate F6: 6/6 factores IVOH validados en R4 | 5/6 → `UPDATE diagnostics.fase_actual=6` | **P0001** «Gate F6:… 6/6 factores» ✅ |
| Gate F6 (positivo) | 6/6 → `UPDATE fase_actual=6` | fase **6** ✅ |
| Vigente único de `ivoh_index_versions` | INSERT segunda fila `vigente=true` | **23505** `uq_ivoh_index_versions_vigente` ✅ |

## 4. Hallazgos por severidad

### BLOQUEANTES

#### **SEC-PR4-01 — `authenticated` puede UPDATE/DELETE el banco de preguntas vía `v_quiz_questions`**

- **Evidencia (BD real):** ACL de la vista =
  `{postgres=arwdDxtm/postgres, authenticated=arwdm/postgres, service_role=arwdm/postgres}`;
  `has_table_privilege('authenticated','public.v_quiz_questions','UPDATE'|'DELETE')` = **true**;
  `pg_relation_is_updatable`/prueba directa: con `SET LOCAL ROLE authenticated` +
  claims de tenant A:
  - `UPDATE public.v_quiz_questions … RETURNING id` → **1 fila**;
  - `DELETE FROM public.v_quiz_questions … RETURNING id` → **1 fila**;
  - `UPDATE public.quiz_questions …` (tabla cruda) → **42501 permission denied** (contraste);
  - `INSERT INTO public.v_quiz_questions (…sin `correcta`)` → **23502 NOT NULL** (sin vía de INSERT, pero UPDATE/DELETE sí).
- **Causa:** `20261108010500_f1_00_grants_views_seed.sql:49`
  (`grant select, insert, update, delete on all tables in schema public to authenticated`)
  incluye **vistas**, y la vista `v_quiz_questions` es auto-actualizable (owner `postgres`,
  `security_invoker` ausente por diseño). La migración revoca la tabla cruda
  (`:53`) pero **no revoca el DML de la vista** (solo añade `grant select` en `:54`).
- **Impacto:** cualquier usuario autenticado (cualquier rol/tenant) puede **modificar o
  borrar preguntas/opciones** del banco de exámenes desde PostgREST
  (`PATCH/DELETE /rest/v1/v_quiz_questions`), afectando la integridad de la certificación
  del aula (M12/EF-11). No expone `correcta` (la vista no la incluye) — el riesgo es de
  integridad/autorización, no de divulgación de respuestas.
- **Corrección esperada (forward-only; no editar la migración aplicada):** nueva migración
  que haga `revoke insert, update, delete on public.v_quiz_questions from authenticated`
  (mantener `select`), y verificación `has_table_privilege(...)=false` + `UPDATE/DELETE`
  → 42501. Añadir aserción de regresión a `supabase/tests/010_f1_00_grants_views.sql`
  (hoy solo comprueba SELECT).

#### **SEC-PR4-02 — `WITH CHECK` incompleto en políticas `FOR ALL`: INSERT evade el rol requerido (escalada de privilegio)**

- **Evidencia:** políticas `FOR ALL` con control de rol **solo en `USING`** y
  `WITH CHECK` limitado a membresía (`pg_policies`): `companies_write`,
  `diagnostics_write`, `documents_write`, `iih_assets_write`, `profiles_write`,
  `samples_write`, `water_balances_write` (definidas en
  `docs/02-supabase_schema_hidria_mdohi.sql:971,976,981,987,1078,1083,1088`; **no modificadas
  por este PR**).
  Para `INSERT` PostgreSQL evalúa únicamente `WITH CHECK`, por lo que el rol exigido en
  `USING` no se aplica.
- **Prueba real (rollback), usuario `authenticated` con `global_role='invitado'`:**
  - INSERT de `diagnostics` → **aceptado** (folio `MDOHI-2026-023`, fase 1).
  - INSERT de `companies` → **aceptado** (1 fila).
  - INSERT de **`profiles`** con `global_role='admin_institucional'` → **aceptado**
    (devuelve `admin_institucional`); el usuario no tenía perfil previo.
- **Impacto:** (a) cualquier miembro del tenant, incluso `invitado`/`observador`, puede crear
  empresas/diagnósticos/documentos/activos/balances/muestras que no le corresponden por rol
  (`docs/01` §5 exige `coordinador`/`equipo`/`empresa` según módulo) → integridad y
  trazabilidad; (b) **escalada de privilegio**: el `INSERT` de `profiles` permite fijar
  `global_role='admin_institucional'`; en cuanto se active el auth hook (F1-01), el JWT de ese
  usuario saldrá con rol admin → control institucional total. El PR **activa** estas políticas
  al conceder DML (antes `authenticated` no tenía privilegios).
- **Corrección esperada (forward-only):** nueva migración que recree las 7 políticas con
  `WITH CHECK` incluyendo la misma condición de rol que `USING` (o retire el DML de las
  tablas afectadas hasta corregirlas). Pruebas pgTAP: `invitado`/`observador`/`empresa` no
  pueden INSERTAR en esas tablas; re-revisión de seguridad del delta.

### MAYORES (condiciones, no veto adicional)

#### SEC-PR4-03 — Activación de `privacy_requests` con DML y PII para cualquier miembro del tenant (privacidad)
- Con los grants, `authenticated` tiene `arwdm` (DML completo) sobre `privacy_requests` y la
  política `privacy_tenant` (`docs/06` §12/`:265-267`) es `FOR ALL USING is_tenant_member`.
  Verificado con fixture sintético: un usuario `equipo` del tenant A **lee** la solicitud ARCO
  (nombre y contacto del titular sintético) y puede **INSERTAR** una (`folio ARCO-2026-0003`).
  Hoy `privacy_requests` tiene **0 filas** y no hay UI de ARCO, por lo que el riesgo es
  latente; cuando se habilite el buzón ARCO debe restringirse a la Unidad de Transparencia /
  rol autorizado mediante ADR y migración (no basta `is_tenant_member`). Dueño: Lead +
  `revisor-especificaciones` + `arquitecto-bd` (F1-18/F2).
- Nota: la política proviene del addendum normativo `docs/06`; el PR solo la **activa**.

#### SEC-PR4-04 — Realtime: “Allow public access” pendiente con 5 tablas publicadas
- Ver §3.5: políticas y publicación correctas, pero el ajuste de consola debe desactivarse
  antes de RT-01/02 (F1-17). Condición de entorno documentada en el PR; no bloquea las
  migraciones, sí el uso de Realtime. Verificar también que `anon` no reciba `postgres_changes`
  una vez activado el cliente.

### MENORES / observaciones

| ID | Hallazgo | Acción |
|---|---|---|
| **SEC-PR4-05** | Privilegio **MAINTAIN** no revocado (`Dm`→`m`) en ACL de `authenticated`/`service_role` sobre tablas (la migración revoca truncate/references/trigger, no maintain). PostgREST no expone VACUUM/ANALYZE/LOCK, por lo que no hay vector práctico. | Revocar `maintain` a roles de API en la migración correctiva (least privilege). |
| **SEC-PR4-06** | `authenticated` recibe `USAGE, SELECT` sobre las 14 secuencias de `public`; `SELECT` no es necesario para INSERT (basta `USAGE`) y permitiría `last_value` si existiera acceso SQL. PostgREST no expone secuencias. | Conceder solo `USAGE` en la migración correctiva. |
| **SEC-PR4-07** | Las 4 suites pgTAP (incluidas aserciones de grants/RLS) **no se ejecutan** en CI: la regresión de seguridad de este PR no está protegida automáticamente. | `task-13` (job Postgres+pgtap) antes de G1; excepción de QA ya documentada. |
| **SEC-PR4-08** | `check_phase_gate()` y `trg_custody_gate()` son **invoker** y sin `search_path` fijo: evalúan las tablas hijas con la visibilidad/RLS del rol que actualiza. Con las políticas actuales (miembros ven todo el diagnóstico) no se encontró bypass; conviene `SECURITY DEFINER + search_path` o justificar/documentar y probar en F1-01. | Decisión en F1-01/ADR; prueba negativa de gate con rol restringido. |
| **SEC-PR4-09** | `fn_completeness(diag_ajeno)` devuelve 10 filas con `ok=false` (no filtra datos: nombres de catálogo y booleanos). Comportamiento aceptado (sin fuga), solo se documenta. | — |
| **SEC-PR4-10** | `mergeable_state` observado vía MCP = **`blocked`** (el brief del supervisor decía `clean`); CI 4/4 verde. Probablemente revisiones requeridas/branch protection; **no es un hallazgo de seguridad**, se reporta para el supervisor. | Confirmar estado real antes del merge. |

## 5. Condiciones para levantar el VETO

1. **Migración forward-only correctiva** (en este PR o delta inmediato; **no** editar las 8
   migraciones aplicadas, `TEAM.md` §2.6):
   a. `revoke insert, update, delete on public.v_quiz_questions from authenticated;`
      (mantener SELECT; opcional revocar DML de la vista a `service_role`, que usa la tabla).
   b. Recrear las 7 políticas `FOR ALL` de SEC-PR4-02 con `WITH CHECK` que incluya la misma
      condición de rol que `USING` (o retirar temporalmente el DML de esas tablas).
   c. (Recomendado) revocar `MAINTAIN` a roles de API y ajustar `SELECT` de secuencias.
2. **Pruebas de regresión** añadidas a `supabase/tests/` (o aserciones equivalentes en el
   reporte) y verificación en vivo:
   - `authenticated`: UPDATE/DELETE en `v_quiz_questions` → **42501**;
   - `invitado`/`observador`: INSERT en `companies`, `diagnostics`, `documents`, `iih_assets`,
     `profiles`, `samples`, `water_balances` → **0 filas / RLS deniega**;
   - repetir la prueba de aislamiento A/B sin regresión.
3. **Re-revisión de seguridad** del delta (solo hallazgos + regresión; no hace falta repetir
   todo el PR).
4. Condiciones no bloqueantes ya aceptadas como seguimiento: activación del hook (E3) con el
   guard SEC-04 de F1-01, “Allow public access” de Realtime antes de F1-17, y pgTAP en CI
   (`task-13`).

## 6. Evidencia principal (comandos/consultas)

| # | Comando/consulta | Resultado (resumen) |
|---|---|---|
| 1 | `git diff --stat origin/main..HEAD` / `--name-status` | 13 archivos, +1333; 8 migraciones + 4 pgTAP + reporte; sin cambios en `app/**`, `docs/**`, migraciones base |
| 2 | `git grep` patrones de secretos en HEAD (120 archivos) y en el diff | **0 secretos**; solo el literal del patrón en `scripts/ci/guardas.sh:29`; `service_role` 0 en `app/` |
| 3 | `select … from supabase_migrations.schema_migrations` | 11 filas (3 + 8) con nombres = archivos |
| 4 | `select has_table_privilege('authenticated', …, 'SELECT'/'UPDATE'/'DELETE')` | `quiz_questions`=false; `v_quiz_questions` UPDATE/DELETE=**true**; `api_idempotency`=false |
| 5 | ACL `pg_class.relacl` | `v_quiz_questions`: `authenticated=arwdm`; `quiz_questions`: solo `service_role=arwdm`; `audit_log`: `authenticated=rm`, `service_role=arm`; `privacy_requests`: `authenticated=arwdm` |
| 6 | `SET LOCAL ROLE authenticated` + update/delete en `v_quiz_questions` | **1 fila** afectada en cada uno (rollback) |
| 7 | `SET LOCAL ROLE authenticated` + INSERT `profiles`/`companies`/`diagnostics` con `global_role='invitado'` | aceptados: `admin_institucional`, 1 empresa, 1 diagnóstico (rollback) |
| 8 | Aislamiento A/B (§3.3) | 1 fila por relación/vista del tenant A; 0 del B; quiz 14 |
| 9 | `fn_audit_write` ×2 como `service_role` | 2 filas, hash 64 hex, `prev_hash` distintos, acciones `create`/`reject` |
| 10 | `report_emissions` ×2 como `service_role` | folios `…-R1` y `…-R2`, sin sobrescritura |
| 11 | Gate custodia vacío/firmado; Gate F6 5/6 y 6/6; vigente duplicado | P0001 / OK; P0001 / fase 6; 23505 |
| 12 | `pg_policies` `FOR ALL` | 7 políticas con rol solo en `USING` (SEC-PR4-02) |
| 13 | Hook con fixture + ACL | claims `organization_id=tenant_id`, `global_role=equipo`; EXECUTE solo `supabase_auth_admin` |
| 14 | `pg_publication_tables`/`pg_policies` realtime | 5 tablas + 3 políticas `hidria_rt_*` |
| 15 | CI GitHub | 4/4 checks `success` (runs `42433977733`, `42433979462`) |

## 7. Conclusión

- La **coincidencia** entre el SQL del PR y el estado aplicado es buena (migraciones, grants,
  `security_invoker`, hook, semilla, índices, triggers, Realtime) y **no hay secretos** en el
  diff ni en el árbol; el aislamiento multi-tenant y el enforcement H-5 funcionan en las
  pruebas negativas/positivas.
- Pero el PR **activa** un modelo de acceso con dos defectos BLOQUEANTES (DML del banco de
  preguntas vía vista auto-actualizable; `WITH CHECK` que permite INSERT fuera de rol y
  escalada de `profiles` a `admin_institucional`). Por eso el veredicto es **VETO**.
- El merge se reanuda cuando se cumplan §5.1–§5.3 y esta revisión re-verifique el delta.

## Firma

`seguridad-privacidad` (08) — **VETO** al merge del PR #4 en el head
`4b057b3c3bd756316b86b6d88b73aff0af939b17`. Sin este cierre no hay aprobación de seguridad
(cuórum de `TEAM.md` §6 incompleto). No se ejecutaron acciones de rotación (no hubo fuga de
secretos) y no se modificó la base de datos.

---

## Actualización 2026-11-07 19:48 — **VETO LEVANTADO** (delta correctivo)

Re-revisión del delta (`4b057b3..4e2341d`, migración `20261108010800_f1_00_security_fix`
aplicada; tests `010`/`040`/`050`; head `4e2341d41af7b2e1206fea5f61a9247c8b5d0813`, CI 4/4):
los BLOQUEANTES **SEC-PR4-01** y **SEC-PR4-02** están corregidos y verificados en vivo
(negativas y positivas), sin exposición nueva ni regresión de los controles de seguridad.

Evidencia y condiciones residuales (RES-1 funcional de `diagnostics` INSERT; SEC-PR4-03/04/07/08
y menores SEC-PR4-11…14) en **`reports/security/PR-4_security_delta.md`**. Este reporte
conserva el veredicto histórico del head `4b057b3`; el veredicto vigente para el merge es
**VETO LEVANTADO** del delta.
