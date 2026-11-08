# F0-02 — MCP Supabase, proyecto correcto y 3 migraciones

- **Agente:** `arquitecto-bd` (02)
- **Fecha:** 2026-11-07 18:16 (America/Mexico_City)
- **Tarea:** `tasks/F0/F0-02_mcp_supabase.md`
- **Rama / PR:** `chore/f0-fundacion` / PR #2
- **Entorno:** proyecto del Programa (`piloto`), ref `zucalshlfcxejpukshxl`
- **Commit de referencia:** `90c77ab` (`chore(f0): fundacion del equipo autonomo, monorepo y CI minima`)
- **Modo:** **solo lectura** vía MCP Supabase (`list_migrations`, `get_project_url`, `get_publishable_keys`, `list_tables`, `execute_sql`). **Cero DDL, cero escrituras.**

## Resultado: VERDE

El MCP de Supabase está conectado al proyecto correcto y las **3 migraciones** están
aplicadas, sin duplicados ni archivos locales sobrantes. Inventario: **44 tablas** y
**6 vistas** en `public`. La única limitación es que la **región** no es expuesta por el
MCP y no pudo confirmarse por Management API (hueco de credencial documentado en F0-10).

## 1. Evidencia ejecutada

| # | Comando / consulta | Resultado (resumen) |
|---|---|---|
| 1 | `mcp__supabase__list_migrations` | 3 migraciones, en orden: `20261031000000_base_hidria_mdohi`, `20261031001000_seed_catalogos`, `20261108000000_privacy_addendum` |
| 2 | `mcp__supabase__get_project_url` | `https://zucalshlfcxejpukshxl.supabase.co` (ref correcta) |
| 3 | `.env` — inventario por nombre (sin imprimir valores) | `SUPABASE_PROJECT_REF` **presente y == `zucalshlfcxejpukshxl`**; `SUPABASE_URL` presente y su host contiene el ref; `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD` presentes; `SUPABASE_ACCESS_TOKEN` y `SUPABASE_DB_URL` **ausentes** |
| 4 | `mcp__supabase__get_publishable_keys` | 2 claves publicables activas: 1 legacy `anon` y 1 `publishable` default. **Valores no transcritos** |
| 5 | `select count(*) from supabase_migrations.schema_migrations` | **3 filas**; sin versiones duplicadas; `created_by` = cuenta de dashboard del owner (dato omitido) |
| 6 | `select count(*) from pg_class ... relkind='r'/'v'` en `public` | **44 tablas**, **6 vistas**, 0 vistas materializadas |
| 7 | `mcp__supabase__list_tables` (`public`, `auth`, `storage`) | `public` = 44 tablas, todas con `rls_enabled=true` (detalle en F0-04) |
| 8 | `npx supabase --version` / `npx supabase projects list` | CLI 3.0.0; el comando falla con `Access token not provided. Supply an access token ... or setting SUPABASE_ACCESS_TOKEN` |
| 9 | SHA-256 de archivos locales vs migraciones | `docs/02` == `20261031000000_base_hidria_mdohi.sql`; `docs/03` == `20261031001000_seed_catalogos.sql` (detalle en F0-04) |

### Migraciones aplicadas

| # | `version` en `schema_migrations` (aplicación) | `name` (archivo) | Estado |
|---|---|---|---|
| 1 | `20261107230707` | `20261031000000_base_hidria_mdohi` | Aplicada |
| 2 | `20261107230711` | `20261031001000_seed_catalogos` | Aplicada |
| 3 | `20261107230713` | `20261108000000_privacy_addendum` | Aplicada |

> Nota de interpretación: la columna `version` guarda el **timestamp de aplicación**
> (`20261107…`), mientras que `name` conserva el **prefijo de fecha del archivo**
> (`20261031…`). No es un duplicado ni una migración pendiente; es el comportamiento del
> CLI/dashboard al registrar el archivo. `schema_migrations` no tiene columna
> `inserted_at` (columnas reales: `version`, `statements`, `name`, `created_by`,
> `idempotency_key`, `rollback`).

### Proyecto y archivos locales

| Comprobación | Resultado |
|---|---|
| `SUPABASE_PROJECT_REF` == `zucalshlfcxejpukshxl` | **Sí** (comparado en memoria; valor no impreso) |
| `SUPABASE_URL` apunta al ref | **Sí** (host comparado; valor no impreso) |
| 3 archivos en `supabase/migrations/` | **Sí** (63229, 31059 y 3086 bytes) |
| Archivos locales sin migración aplicada | **Ninguno** |
| Migración aplicada sin archivo local | **Ninguna** |

## 2. Inventario de `public` (44 tablas · 6 vistas)

**Tablas (44):** `action_plan_items, action_plans, alternatives, audit_log,
balance_flow_catalog, balance_flows, cat_items, cat_responses, companies,
completeness_items, course_modules, custody_transfers, diagnostics,
document_checklist_items, documents, iih_asset_types, iih_assets, iih_stages,
ivoh_evaluations, ivoh_factors, ivoh_index_versions, ivoh_rubrics, lab_results,
logbook_agenda, logbook_agreements, logbook_change_log, logbook_entries,
logbook_evidence, logbook_findings, logbook_participants, logbook_templates,
notifications, organizations, photo_log, privacy_requests, profiles, project_members,
quality_parameters, quality_parameters_catalog, quiz_attempts, quiz_questions, samples,
signatures, water_balances`.

**Vistas (6):** `v_balance_indicators, v_bhe_monthly, v_bhe_summary,
v_diagnostic_completeness, v_ivoh_score, v_quiz_questions`.

El inventario coincide con `docs/01` (modelo) y `docs/02` (DDL), incluida
`privacy_requests` del addendum de privacidad (`docs/06` §12). La tabla
`supabase_migrations.schema_migrations` tiene exactamente **3 filas**.

## 3. Limitaciones documentadas

1. **Región del proyecto:** el MCP no expone la región. La verificación `us-east-1`
   requiere Management API (`GET /v1/projects/{ref}`) y no hay `SUPABASE_ACCESS_TOKEN`
   (3 intentos documentados en F0-10). El ref sí está confirmado.
2. **Migraciones pendientes vía CLI:** `npx supabase migration list` / `db diff` no son
   ejecutables en este entorno: no hay `SUPABASE_ACCESS_TOKEN` ni `SUPABASE_DB_URL`, y no
   hay Docker para la shadow DB. La equivalencia 3 archivos locales = 3 aplicados es la
   evidencia disponible; no se detectan pendientes.
3. **Sin acciones de escritura:** todas las consultas fueron `SELECT` de catálogo/MCP
   read-only. No se reaplicó ninguna migración.

## 4. Hallazgos

1. **V-1 (informativo):** el `version` de aplicación (`202611072307xx`) no coincide con el
   prefijo del archivo (`20261031000000`); es esperado por el método de aplicación. No hay
   migraciones duplicadas.
2. **V-2 (pendiente menor):** región no verificable por MCP; requiere token de Management
   API (ver F0-10). No afecta la validez del ref ni del esquema.
3. **V-3 (informativo):** el CLI está instalado (3.0.0) pero sin credencial de gestión;
   útil únicamente como evidencia del hueco de credencial.

## 5. Pendientes / siguiente paso

- Ningún pendiente bloqueante para F0-02.
- Si el Lead requiere la región y el estado de migraciones pendientes por CLI, hace falta
  que el usuario aporte un **Supabase access token** (Management API) fuera del repo; el
  procedimiento es el de F0-10.
- Siguiente: F0-04 (esquema/RLS/seeds) y F0-10 (auth hook), ya ejecutados en esta ronda.

---

*Evidencia generada solo con consultas de lectura. Sin DDL y sin valores de secretos.*
