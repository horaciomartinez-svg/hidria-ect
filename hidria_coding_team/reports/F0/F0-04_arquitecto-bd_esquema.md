# F0-04 — Esquema, RLS, vistas y seeds en Supabase

- **Agente:** `arquitecto-bd` (02)
- **Fecha:** 2026-11-07 18:16 (America/Mexico_City)
- **Tarea:** `tasks/F0/F0-04_esquema_rls_seeds.md`
- **Rama / PR:** `chore/f0-fundacion` / PR #2
- **Entorno:** proyecto del Programa (`piloto`), ref `zucalshlfcxejpukshxl`
- **Commit de referencia:** `90c77ab`
- **Modo:** **solo lectura** (`execute_sql` con `SELECT` de catálogo, `pg_class`, `pg_policy`,
  `pg_trigger`, `pg_proc`, `information_schema`). **Cero DDL, cero escrituras.**

## Resultado: AMARILLO

Los **5 criterios de aceptación de F0-04 están cumplidos (5/5)** y el esquema aplicado
coincide byte a byte con `docs/02` y `docs/03`. El veredicto es **AMARILLO** por dos
hallazgos que no invalidan la verificación pero **bloquean el arranque de Fase 1**:

- **H-1:** no hay privilegios DML para `anon`/`authenticated`/`service_role` en ninguna
  tabla de `public` (0/44). PostgREST y las Edge Functions no podrán leer ni escribir hasta
  una migración correctiva de `GRANT`.
- **H-2:** las 5 vistas analíticas son `SECURITY DEFINER` de facto (owner `postgres`, sin
  `security_invoker`) y no filtran tenant; en cuanto se conceda `SELECT` (modelo de lectura
  obligatorio de `docs/04` §9), filtran datos entre organizaciones.

Ambos se documentan con la corrección propuesta **sin aplicarla** (regla de esta ronda).

## 1. Evidencia ejecutada (resumen)

| # | Consulta / comprobación | Resultado |
|---|---|---|
| 1 | `pg_class` en `public`, `relkind='r'` | **44 tablas** |
| 2 | `pg_class` en `public`, `relkind='v'` | **6 vistas**, 0 materializadas |
| 3 | `pg_class.relrowsecurity` | **44 con RLS, 0 sin RLS** |
| 4 | `pg_policies` (`schemaname='public'`) | **104 políticas**; 0 tablas sin política |
| 5 | `pg_policies` con `is_tenant_member` en `qual`/`with_check` | 14 políticas de tenant |
| 6 | `information_schema.columns` con `organization_id` | 11 tablas raíz |
| 7 | `pg_trigger` no interno (`public`) | 21 triggers; 6 de enforcement + folios + `updated_at` + privacidad |
| 8 | `pg_proc` (`public`) | 15 funciones; helpers y triggers esperados presentes |
| 9 | Conteos de semillas (13 tablas) | **13/13 coinciden** con lo esperado |
| 10 | SHA-256 local de `docs/02` y `docs/03` vs migraciones | **Idénticos** |
| 11 | `has_table_privilege(...)` sobre 44 tablas + 6 vistas | **0/44 tablas** con SELECT/INSERT para `authenticated` y `service_role`; 1/6 vistas (`v_quiz_questions`) con SELECT para `authenticated` |
| 12 | `pg_class.reloptions` de las 6 vistas | `NULL` en todas (sin `security_invoker`); owner `postgres` |

## 2. RLS: 44/44

| Comprobación | Esperado | Real | Estado |
|---|---|---|---|
| Tablas base en `public` | 44 | **44** | ✅ |
| Tablas con `rowsecurity` | 44 | **44** | ✅ |
| Tablas sin RLS | 0 | **0** | ✅ |
| Tablas sin ninguna política | 0 | **0** | ✅ |
| Políticas totales | — | **104** | ✅ |
| Tablas con `FORCE ROW LEVEL SECURITY` | — | 0 (el owner `postgres` mantiene bypass de RLS; relevante para el auth hook) | informativo |

## 3. Políticas de tablas hijas con `EXISTS` (fix de Fase 0)

Las 5 tablas señaladas tienen **3 políticas cada una** (SELECT, INSERT, UPDATE; sin DELETE =
denegado por defecto). Todas resuelven el padre con `EXISTS` + `is_diagnostic_member`:

| Tabla hija | Políticas | Predicado (resumen) |
|---|---|---|
| `balance_flows` | `balance_flows_sel/ins/upd` | `EXISTS (SELECT 1 FROM water_balances p WHERE p.id = balance_flows.balance_id AND is_diagnostic_member(p.diagnostic_id))` |
| `quality_parameters` | `quality_parameters_sel/ins/upd` | ídem sobre `water_balances` |
| `custody_transfers` | `custody_transfers_sel/ins/upd` | `EXISTS (… FROM samples p WHERE p.id = custody_transfers.sample_id AND is_diagnostic_member(p.diagnostic_id))` |
| `lab_results` | `lab_results_sel/ins/upd` | ídem sobre `samples` |
| `action_plan_items` | `action_plan_items_sel/ins/upd` | `EXISTS (… FROM action_plans p WHERE p.id = action_plan_items.plan_id AND is_diagnostic_member(p.diagnostic_id))` |

**15/15 políticas** con el patrón `EXISTS` correcto (no hay políticas de tabla hija que
dependan solo de `organization_id` sin resolver el padre).

## 4. Triggers de enforcement

| Función | Trigger | Tabla | Evento | Estado |
|---|---|---|---|---|
| `check_phase_gate` | `diagnostics_phase_gate` | `diagnostics` | `BEFORE UPDATE` (`WHEN new.fase_actual IS DISTINCT FROM old.fase_actual`) | Habilitado |
| `trg_ivoh_requires_bhe` | `ivoh_requires_bhe` | `ivoh_evaluations` | `BEFORE INSERT OR UPDATE` | Habilitado |
| `trg_custody_gate` | `custody_gate` | `lab_results` | `BEFORE INSERT OR UPDATE` | Habilitado |
| `trg_logbook_immutable` | `logbook_immutable` | `logbook_entries` | `BEFORE DELETE OR UPDATE` | Habilitado |
| `trg_ivoh_version_immutable` | `ivoh_immutable` | `ivoh_index_versions` | `BEFORE DELETE OR UPDATE` | Habilitado |
| `trg_audit_hash` | `audit_hash` | `audit_log` | `BEFORE INSERT` | Habilitado |

Además están presentes los triggers de folios (`trg_iih_folio`, `trg_logbook_folio`,
`trg_photo_folio`), `set_updated_at` y el del addendum de privacidad
(`trg_privacy_extension_once`). `pgcrypto` está instalado (1.3), requisito de
`trg_audit_hash` (`digest(..., 'sha256')`).

## 5. Funciones helper

| Función | Definición verificada | Rol |
|---|---|---|
| `is_tenant_member(uuid)` | `stable`, invoker; `select p_organization_id = (auth.jwt() ->> 'tenant_id')::uuid` | Aislamiento de tenant |
| `my_diagnostic_role(uuid)` | `stable security definer`, `search_path=public`; devuelve `project_members.role` del `auth.uid()` | Rol por diagnóstico |
| `is_diagnostic_member(uuid)` | `stable security definer`; `exists` en `project_members` | Membresía |
| `is_logbook_entry_member(uuid)` | `stable security definer`; valida la ficha y su diagnóstico | Membresía de bitácora |

> **H-2 del reporte F0-10:** `is_tenant_member` consume el claim **`tenant_id`**, mientras
> `docs/00` §3, `docs/04` §2.1 y `docs/07` §0.5 nombran **`organization_id`**. El auth hook
> debe emitir **ambos** para no romper el aislamiento (detalle en F0-10).

## 6. Vistas (6) y análisis de fuga entre tenants

| Vista | Owner / opciones | Columnas | Observación |
|---|---|---|---|
| `v_bhe_monthly` | `postgres`, `reloptions=NULL` | 10 | **Definer de facto**: no aplica RLS de `water_balances`/`balance_flows`; sin filtro de tenant |
| `v_bhe_summary` | `postgres`, `reloptions=NULL` | 9 | Sobre `v_bhe_monthly`; mismo riesgo |
| `v_balance_indicators` | `postgres`, `reloptions=NULL` | 12 | Joins sobre `water_balances`; mismo riesgo |
| `v_ivoh_score` | `postgres`, `reloptions=NULL` | 4 | Sin filtro de tenant |
| `v_diagnostic_completeness` | `postgres`, `reloptions=NULL` | 11 | Recorre **todos** los `diagnostics`; sin filtro de tenant |
| `v_quiz_questions` | `postgres`, `reloptions=NULL` | `id, module_orden, pregunta, opciones` | **Segura por columnas** (no expone `correcta` ni `retroalimentacion`); es definer a propósito para que `authenticated` lea el banco sin ver la tabla cruda |

**Hecho verificado:** PostgreSQL 17.11; en las 5 vistas analíticas `reloptions` es `NULL`,
es decir **no** tienen `security_invoker=true`; su owner es `postgres`
(`rolbypassrls=true`) y las tablas base tienen RLS con `relforcerowsecurity=false`. Por
tanto, una vez que se conceda `SELECT` a `authenticated`, las vistas se evalúan como
`postgres` y **no aplican RLS**: devolverían filas de otros tenants. Hoy no hay fuga porque
`authenticated` **no tiene SELECT** sobre esas vistas (0/44 tablas y 1/6 vistas), pero el
modelo de lectura de `docs/04` §9 exige concederlo.

`v_quiz_questions` **no** debe pasar a `security_invoker`: si lo hiciera, la RLS de
`quiz_questions` (solo `admin_institucional`) la dejaría vacía para `authenticated`. Su
diseño correcto es: vista definer + lista blanca de columnas + `grant select` solo a
`authenticated`.

## 7. Semillas oficiales

| Tabla | Esperado | Real | Estado |
|---|---|---|---|
| `cat_items` | 47 | **47** | ✅ (secciones A–H: 6/7/7/8/6/6/4/3) |
| `completeness_items` | 10 | **10** | ✅ |
| `logbook_templates` | 8 | **8** | ✅ (V1, V2, V3, R1, R2, R3, R4, R5) |
| `course_modules` | 8 | **8** | ✅ |
| `ivoh_factors` | 6 | **6** | ✅ (F1 0.15 · F2 0.20 · F3 0.20 · F4 0.20 · F5 0.15 · F6 0.10; suma **1.00**) |
| `ivoh_rubrics` | 24 | **24** | ✅ (6 factores × 4 niveles) |
| `ivoh_index_versions` | 1 | **1** | ✅ |
| `balance_flow_catalog` | 22 | **22** | ✅ (5 entrada + 5 consumo_proceso + 5 consumo_general + 2 descarga + 1 pérdida + 4 circular) |
| `quality_parameters_catalog` | 19 | **19** | ✅ (10 básico · 2 patógeno · 1 metal · 1 toxicidad · 5 reúso) |
| `iih_asset_types` | 66 | **66** | ✅ (11 por etapa × 6 etapas) |
| `iih_stages` | 6 | **6** | ✅ (CAP, ALM, TRA, DIS, USO, EVA) |
| `quiz_questions` | 14 | **14** | ✅ (módulos 1–8; 2 por módulo salvo 6 y 8 con 1) |
| `organizations` | 1 | **1** | ✅ en conteo; **nombre institucional desalineado** (H-3) |

## 8. Hashes (SHA-256) — `docs/02` y `docs/03` vs migraciones

| Par | SHA-256 local | Resultado |
|---|---|---|
| `docs/02-supabase_schema_hidria_mdohi.sql` | `2a7b6f8888040990b109f580f6be50f7f03bf7d9ff7b2299d7bd50bc85442cb5` | **IDÉNTICO** a `20261031000000_base_hidria_mdohi.sql` (63229 bytes) |
| `docs/03-seed_catalogos.sql` | `b2b660e4d0785ef1d2bb47ecb7ebc0241e49b66f9dbd74990b3faa9ec18af150` | **IDÉNTICO** a `20261031001000_seed_catalogos.sql` (31059 bytes) |
| `20261108000000_privacy_addendum.sql` | `df39dc7dc3a4d9d38fb20d3db673867d48c399f2336eaccbb3573a3ca68c0236` | Tercera migración aplicada (3086 bytes); `privacy_requests` y su trigger están presentes |

## 9. Sin drift / limitaciones

- **Drift de archivos:** no hay. `docs/02` y `docs/03` son byte-idénticos a las migraciones
  aplicadas; hay exactamente 3 archivos locales y 3 filas en `schema_migrations`.
- **`npx supabase db diff`:** **no aplicable** en este entorno (sin Docker para shadow DB;
  sin `SUPABASE_ACCESS_TOKEN` ni `SUPABASE_DB_URL`). Se documenta la limitación; la
  comparación por hash y el catálogo en vivo cubren la verificación.
- **Sin escrituras:** todas las comprobaciones fueron de catálogo o `SELECT`.

## 10. Hallazgos

### H-1 — Sin privilegios DML para la API (ALTA · bloqueante F1)

- **Evidencia:** `has_table_privilege` sobre las 44 tablas: `authenticated` SELECT **0/44**,
  INSERT **0/44**; `service_role` SELECT **0/44**, INSERT **0/44**. Única excepción:
  `v_quiz_questions` con SELECT para `authenticated`. ACL típica:
  `{postgres=arwdDxtm, anon=Dxtm, authenticated=Dxtm, service_role=Dxtm}`.
- **Impacto:** PostgREST no puede servir el modelo de lectura de `docs/04` §9; las Edge
  Functions que usan `service_role` no pueden insertar en `audit_log` (`docs/04` §2.6) ni
  leer `quiz_questions` cruda (`TEAM.md` §4). También impide ejecutar las pruebas SEC-01/02
  en su forma esperada (0 filas, no “permission denied”).
- **Causa raíz:** `docs/02` no incluye una sección de `GRANT` para el esquema `public`; el
  ACL por defecto del owner `postgres` en este proyecto solo otorga
  `TRUNCATE/REFERENCES/TRIGGER/MAINTAIN`. No es drift (el DDL aplicado es idéntico a
  `docs/02`): es una **omisión del DDL** frente a `docs/04`/`TEAM.md`.
- **Recomendación (NO aplicada):** migración correctiva de privilegios explícitos, con
  mínimo privilegio y re-`revoke` sobre `quiz_questions`/`audit_log`; actualizar `docs/02`
  en el mismo PR (regla de byte-identidad) y pasar revisión de seguridad antes de F1-01.

### H-2 — Vistas analíticas sin `security_invoker` (CRÍTICA LATENTE · bloqueante F1)

- **Evidencia:** las 5 vistas analíticas son owner `postgres`, `reloptions=NULL`; las tablas
  base tienen RLS activa pero sin `FORCE`; PostgreSQL 17.11.
- **Impacto:** al conceder `SELECT` (H-1), una vista definer se evalúa con privilegios de
  `postgres` y **no aplica RLS**: fuga entre tenants en BHE, IVOH y matriz 10/10.
- **Recomendación (NO aplicada):** `alter view public.v_bhe_monthly set (security_invoker = true);`
  y equivalentes para `v_bhe_summary`, `v_balance_indicators`, `v_ivoh_score`,
  `v_diagnostic_completeness`; **no** aplicar a `v_quiz_questions` (debe seguir definer con
  lista blanca de columnas). Verificar con pgTAP/SEC antes de conceder los `GRANT`.

### H-3 — Nombre de la organización semilla desalineado (MEDIA)

- **Evidencia:** `organizations` (1 fila) = `"Secretaría de Recursos Hidráulicos y Desarrollo
  Sustentable — Programa EHR"`, `org_type='srhds'`.
- **Contradicción:** `docs/00` §1 define **SRHDS = Secretaría de Recursos Hidráulicos para el
  Desarrollo Social**; `TEAM.md` §10.4 fija la nomenclatura institucional vigente y prohíbe
  la denominación antigua (`Subsecretaría de Recursos Hídricos y Desarrollo Sustentable`).
  El seed (`docs/03` línea 8) reproduce la cadena vieja.
- **Recomendación (NO aplicada):** corregir el nombre en `docs/03` + migración de datos
  idempotente; pasa por revisión de especificaciones por ser nomenclatura institucional.

### H-4 — `profiles.global_role` con default inválido (MEDIA)

- **Evidencia:** `pg_attrdef` = `'user'::text`; CHECK real =
  `admin_institucional, coordinador_srhds, equipo, empresa, observador, invitado`
  (no incluye `user`).
- **Impacto:** cualquier `insert into profiles` que omita `global_role` falla con `23514`;
  afecta la provisión de usuarios de F1-01 y el auth hook.
- **Recomendación (NO aplicada):** migración correctiva `alter column ... set default
  'invitado'` (mínimo privilegio) o eliminar el default y exigir valor explícito; actualizar
  `docs/02`.

### H-5 — Brechas de enforcement para revisar en F1 (MEDIA · alimenta pgTAP)

1. **Cadena de custodia:** `trg_custody_gate` cuenta filas de `custody_transfers` sin exigir
   `firma IS NOT NULL`; `firma` es `text` nullable. `docs/01` §4.7 exige **3 transferencias
   firmadas**. Un dictamen pasaría con 3 filas sin firma.
2. **Gate de fase F6:** `check_phase_gate` exige `exists` **una** `ivoh_evaluations`
   `validado_r4`; `docs/04` TD-1 exige **los 6** factores validados. Un solo factor validado
   permitiría avanzar a fase 6.
3. **Versión vigente del IVOH:** no hay índice único parcial sobre
   `ivoh_index_versions(vigente)`; `trg_ivoh_version_immutable` impide desmarcar la vigente,
   por lo que la rotación a una nueva versión puede dejar **dos filas vigentes** (o requerir
   deshabilitar el trigger).
4. **Cadena de auditoría:** `trg_audit_hash` lee el último `hash` con
   `order by id desc limit 1` sin bloqueo; inserciones concurrentes pueden bifurcar la
   cadena (`prev_hash` repetido). Sugerencia: `pg_advisory_xact_lock` en el trigger o
   restricción única sobre `prev_hash`, con prueba SEC-06.

### H-6 — Desglose del catálogo BHE en `docs/01` (MENOR)

- `docs/01` §4.6 declara “5 entradas, 15 destinos, 4 flujos circulares” (=24); la semilla
  tiene 5 entradas + 13 destinos + 4 circulares = **22**, que es el conteo oficial de
  aceptación. Actualizar el desglose de `docs/01` en el próximo PR de docs; no afecta el
  criterio F0-04.

## 11. Criterios de aceptación

- [x] 44/44 tablas con RLS; 6 vistas; 3 migraciones.
- [x] Seeds con los conteos oficiales (13/13).
- [x] Triggers y funciones de enforcement presentes.
- [x] Hashes de documentos SQL == migraciones.
- [x] Sin escrituras (solo verificación).

## 12. Pendientes / siguiente paso

1. **Antes de F1-01:** migración correctiva de `GRANT`s (H-1) **y** `security_invoker` en las
   5 vistas analíticas (H-2), con actualización de `docs/02` y revisión de seguridad.
2. Correcciones de datos/documentos: H-3 (organización), H-4 (`profiles.global_role`).
3. Abrir casos pgTAP F1 para H-5: CUS-* (firma), PG-* (6/6 IVOH), IVOH-* (versión vigente
   única) y SEC-06 (cadena de auditoría concurrente).
4. Sin acciones destructivas ejecutadas; este reporte no modifica el esquema.
