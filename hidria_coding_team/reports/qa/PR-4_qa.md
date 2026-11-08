# PR #4 — QA: F1-00 migraciones correctivas, grants y enforcement

- **Agente:** `qa-tester` (05)
- **Fecha:** 2026-11-07 19:40 (America/Mexico_City)
- **Tarea:** `task-12` — F1 · QA PR #4 (F1-00 migraciones y pgTAP)
- **PR:** [#4](https://github.com/horaciomartinez-svg/hidria-ect/pull/4) — `feature/F1-00-migraciones` → `main`
- **Head evaluado:** `4b057b3c3bd756316b86b6d88b73aff0af939b17` · **Base:** `main` `8008a648161f36823302429bb302dd832a9ec231`
- **Diff:** 13 archivos, +1333 / −0: 8 migraciones `2026110801*_f1_00_*.sql`, 4 suites pgTAP, 1 reporte. Sin cambios en `docs/02`, migración base ni `app/**`.
- **Entorno:** local Windows (PowerShell) + proyecto Supabase `zucalshlfcxejpukshxl` (consulta **solo lectura**) + GitHub Actions

## Resultado: AMARILLO — merge permitido con excepción documentada

> **No es ROJO** (no hay defecto de esquema demostrado; el objeto del PR —las migraciones—
> está aplicado y verificado en vivo, y el CI está verde).
> **No es VERDE pleno** (las 4 suites pgTAP **no se ejecutaron**; no puedo certificar que
> pasen ni declarar verde funcional). Es un **VERDE CONDICIONADO / AMARILLO** con excepción
> documentada: el merge se permite, y **task-13 (pgTAP en CI con Postgres) es obligatoria
> antes de G1**.

## 1. Respuesta explícita a las preguntas del supervisor

### 1.1 ¿Las suites cubren las reglas de `docs/05` aplicables a F1-00 y son ejecutables tal cual en un runner con Postgres+pgtap?

- **Cobertura:** cubren la **capa de base de datos** de F1-00 (grants, banco de preguntas,
  `security_invoker`, idempotencia, auditoría, folio, BHE por RPC, completitud,
  enforcement H-5, hook, Realtime). **Es cobertura parcial de `docs/05`**, no completa: el
  detalle y los huecos están en §3. Nadie debe leer esta entrega como "SEC-01…SEC-06,
  PG-01…PG-13, BHE-01…04, CUS-01…04, RPT-01…04, RT-01/02 verdes": no lo están.
- **Ejecutabilidad "tal cual": NO en un Postgres genérico + pgtap.** Las suites y las
  migraciones dependen del *baseline* Supabase: roles `anon`/`authenticated`/`service_role`/
  `supabase_auth_admin`, esquema `auth` con `auth.users` y `auth.uid()`, esquema `realtime`
  con `realtime.messages`/`realtime.topic()`, publicación `supabase_realtime`, esquemas
  `extensions` (pgcrypto/uuid-ossp) y la semilla de catálogos. En Postgres limpio fallan
  incluso al aplicar las migraciones (grants a roles inexistentes, `auth.uid()` en
  políticas, `alter publication supabase_realtime`). **Sí son ejecutables bajo
  `supabase test db`** (stack local de Supabase, que crea ese baseline) — esa es la ruta
  recomendada para task-13 (ver §4).

### 1.2 ¿La equivalencia "aserciones SQL vía MCP" es evidencia suficiente para VERDE Fase 1 de F1-00 con excepción documentada (merge permitido), o bloqueante?

**No es bloqueante para el merge**, pero **no alcanza para un VERDE pleno**. Dictamen:
**AMARILLO con excepción documentada — merge permitido**, por estas razones:

1. El artefacto funcional de F1-00 son las **migraciones**, y su efecto real (46 tablas/46
   RLS/6 vistas/105 políticas, grants, `security_invoker`, Realtime, hook, default, semilla)
   fue verificado contra el proyecto con aserciones SQL —QA lo contrastó de forma
   independiente y coincide (§2)—. El riesgo de "esquema equivocado" está cubierto.
2. El CI del head está **4/4 success**; las suites son archivos de prueba que **no se
   ejecutan en el pipeline actual**, por lo que su no ejecución no puede romper el runtime
   ni el CI.
3. Es deuda de **pruebas**, no de producto; está **rastreada** en task-13, con criterio de
   cierre antes de G1.

**Condiciones del merge (explícitas):**
- [ ] Registrar la excepción en el PR y en `reports/F1/F1-00_arquitecto-bd_migraciones.md`
      (ya está declarada; el supervisor debe citarla en el merge).
- [ ] **task-13** ejecuta las 4 suites en CI con Postgres y publica run id **antes de G1**;
      si fallan, el arquitecto las corrige (QA no edita suites ajenas).
- [ ] `qa/trazabilidad.md` **no** cambia filas a `verde` hasta esa ejecución (hoy: notas de
      evidencia SQL, estado `pendiente`).
- [ ] Spec review + security review aprobadas (fuera de QA).

Si task-13 no puede ejecutar las suites antes de G1, el AMARILLO se convertiría en ROJO de
fase (**no** de este PR).

### 1.3 Matriz de trazabilidad

Actualizada solo en lo aplicable: 8 filas con nota de evidencia SQL parcial (R-04, R-07,
R-08, R-09, R-13, R-16, R-18, R-19, R-22, R-17), nueva sección «Suites F1-00 — definidas,
no ejecutadas» (39 aserciones, 0 ejecutadas) y huecos H-8/H-9. **Ninguna fila pasa a
`verde`.** Detalle en `qa/trazabilidad.md`.

## 2. Verificación independiente (MCP Supabase, solo lectura)

Contraste propio contra el proyecto (no copia del reporte del arquitecto):

| Comprobación | Resultado |
|---|---|
| `schema_migrations` | **11 filas** (3 base + 8 F1-00), nombres con prefijo de archivo; versiones = timestamp de aplicación MCP (ver observación O-01) |
| Tablas / con RLS / vistas / políticas | **46 / 46 / 6 / 105** |
| `security_invoker` | **5/6** vistas (`v_bhe_monthly`, `v_bhe_summary`, `v_balance_indicators`, `v_ivoh_score`, `v_diagnostic_completeness`); `v_quiz_questions` sigue **definer** (`reloptions=NULL`) |
| Grants | `authenticated`: `quiz_questions`=false, `v_quiz_questions`=true, `api_idempotency`=false, `organizations`=true (RLS decide filas); `anon` `organizations`=false; `service_role` `audit_log` INSERT=true / UPDATE=**false** |
| Helpers | `authenticated` EXECUTE en `is_tenant_member`; **sin** EXECUTE en `fn_audit_write` ni en `custom_access_token_hook` |
| Realtime | 5 tablas publicadas (`diagnostics`, `document_checklist_items`, `logbook_entries`, `notifications`, `samples`); 3 políticas `hidria_rt_*` en `realtime.messages` |
| Hook / default / semilla | `custom_access_token_hook(event jsonb)` con `search_path=public, pg_temp`; `profiles.global_role` default `'invitado'`; `organizations.name = 'SRHDS — Programa HIDRIA'`; 1 versión IVOH vigente |
| Funciones F1-00 | 8 presentes: `fn_audit_write`, `fn_bhe_monthly`, `fn_bhe_summary`, `fn_completeness`, `fn_reporte_emitible`, `fn_diag_role`, `fn_is_diag_member`, `custom_access_token_hook` |
| Constraints/índices | `api_idempotency_user_endpoint_key_key`, `audit_log_prev_hash_uniq`, `audit_log_action_check` con `reject`/`error`, `report_emissions_folio_key`, `uq_ivoh_index_versions_vigente`; trigger `trg_audit_hash` con `search_path=public, extensions, pg_temp` |
| `v_quiz_questions` | columnas `id, module_orden, pregunta, opciones` — **sin `correcta`** |
| `fn_completeness` sin diagnóstico | 10 filas, `reporte_emitible=false` (semilla `completeness_items`=10) |

Hash de las 8 migraciones: coincide **8/8** con la tabla del reporte del arquitecto
(p. ej. M-01 `81ed47f2…36a8`, M-02 `20d9ba2f…3f25`). `docs/02` sigue con SHA-256
`2A7B6F88…42CB5`, sin edición. El delta `8008a64..4b057b3` no toca `app/**`, `docs/**` ni
la migración base: solo añade los 13 archivos de F1-00.

## 3. Cobertura de las 4 suites (39 aserciones) y huecos

Conteo estático `plan(n)` = número de aserciones: **12+9+9+9 = 39**. Archivos hasheados:
`010 0bd636dd…`, `020 3d3dc357…`, `030 a9e58458…`, `040 163d4018…`.

| Suite | Aserciones | Qué prueba | Relación `docs/05` | Cobertura |
|---|---|---|---|---|
| `010_f1_00_grants_views.sql` | 12 | privilegios por rol, `quiz_questions` vs `v_quiz_questions`, `security_invoker` exacto, EXECUTE del helper RLS | SEC-05 (parcial: privilegios, **no** columnas ni exposición), SEC-01/02/03 (no) | parcial |
| `020_f1_00_idempotency_audit.sql` | 9 | M-01 unicidad `(user,endpoint,key)`, M-02 hash de 64 hex, GENESIS, cadena por `prev_hash`, acciones `reject`/`error`, append-only | API-00 (solo tabla), SEC-06 (estructura; **no** recalcula SHA-256 ni concurrencia) | parcial |
| `030_f1_00_folio_bhe_completeness.sql` | 9 | folio `-R1/-R2` server-side, `fn_bhe_monthly`/`fn_bhe_summary` (brecha 12.6 %, ponderada, 12 meses), `fn_completeness` 10 filas / `reporte_emitible=false` | BHE-05 (RPC, no la vista), RPT-01/RPT-02 (completitud y folio; no EF ni PDF) | parcial |
| `040_f1_00_enforcement_realtime.sql` | 9 | `trg_custody_gate` 3 firmas, gate F6 6/6, único vigente IVOH, hook de claims, 3 políticas + publicación Realtime | CUS-01 (trigger, no EF-10), PG-09/F6, RT-02 (solo existencia de políticas, **no** predicado/denegación) | parcial |

**Huecos de cobertura (no defectos de este PR; parte son F1-01…F1-18):** aislamiento por
filas SEC-01/02/03 (no hay fixtures JWT ni `SET ROLE`), SEC-05 columnas/`correcta`,
SEC-06 recálculo de hash y concurrencia, BHE-01…BHE-04 (EF-05), salida de vistas BHE,
RPT-03/04, CUS-02…CUS-04, gates PG-01…PG-08 y PG-10…PG-13, CAT/DOC/LB/IIH/AUL/XLS/PRIV/PER/CAP.
El PR no afirma que esos casos estén verdes; QA deja constancia para que la matriz no se
sobreinterprete. Ver H-8 en `qa/trazabilidad.md` (las suites no tienen IDs propios en
`docs/05`; deben mapearse al ejecutarse).

## 4. Ejecutabilidad — requisitos para task-13

Las suites son coherentes con el esquema (tablas/columnas/triggers/funciones verificados) y
`plan()` coincide. Pero **no corren "tal cual" en un `services: postgres` pelado**:

| Dependencia | ¿La crea un Postgres limpio? | Solución en runner |
|---|---|---|
| Roles `anon`, `authenticated`, `service_role`, `supabase_auth_admin` | no | Supabase local **o** shim de roles |
| Esquema `auth` + `auth.users` + `auth.uid()` | no | Supabase local **o** shim `auth` |
| Esquema `realtime` + `realtime.messages` + `realtime.topic()` + publicación `supabase_realtime` | no | Supabase local **o** shim Realtime |
| Esquemas `extensions` (pgcrypto/uuid-ossp) | no | Supabase local **o** crear extensiones |
| Extensión `pgtap` | no | `create extension pgtap` en el runner |
| Semilla de catálogos (A1, `completeness_items`, `ENT-01`) | sí, al aplicar migraciones en orden | aplicar 11 migraciones |

**Ruta recomendada (A):** `supabase/setup-cli` + `supabase start` + `supabase db reset`
(aplica las 11 migraciones desde archivos en DB limpia) + `supabase test db` en
`ubuntu-latest` (los runners tienen Docker). Es la única que reproduce el baseline real.
**Ruta B (contenedor Postgres + `psql`):** solo viable si se añade un bootstrap previo
(roles, `auth.uid()` stub, `realtime` stub, publicación, extensiones); sin él, las
migraciones fallan. **No** es aceptable un `services: postgres` sin shim.

**Riesgo operativo asociado (O-01, P2):** las 8 migraciones se aplicaron por MCP con
`version` = timestamp de aplicación, distinto del prefijo del archivo. Un
`supabase db push`/`migration up` en staging las verá como *pendientes*. Son idempotentes,
pero antes de F1-16 hay que reconciliar (`supabase migration repair`) o desplegar sobre DB
limpia. No bloquea F1-00; **sí** debe resolverse antes del despliegue a staging.

**Riesgos de ejecución a vigilar cuando task-13 las corra** (no son defectos demostrados):
fixtures con UUID fijos e inserción directa en `auth.users`; `is()` comparando `reloptions`
exacto; `throws_ok` con mensaje regex; dependencia de la semilla A1; el test de auditoría
inserta directo en `audit_log` confiando en el orden BEFORE-trigger/CHECK; no se prueba el
`SET ROLE` (el runner conecta como superusuario, así que RLS no se ejerce igual que
`authenticated`).

## 5. CI del head `4b057b3`

| Run | Evento | Checks | Resultado |
|---|---|---|---|
| [42433979462](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42433979462) | `pull_request` | Guardas success (5 s) · Cliente success (13 s) | **2/2** |
| [42433977733](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42433977733) | `push` | Guardas success (4 s) · Cliente success (17 s) | **2/2** |

Ambos con `head_sha=4b057b3…`. Al momento de la consulta el PR figura
`mergeable_state=blocked` (pendiente de las aprobaciones requeridas — no es un fallo de
CI/QA; el supervisor lo había visto `clean` antes de crear las revisiones).

## 6. Observaciones (no bloqueantes)

| ID | Observación | Severidad | Dueño |
|---|---|---|---|
| O-01 | Historial de migraciones MCP ≠ prefijos de archivo; reconciliar antes de staging (`db push` las verá pendientes). | P2 | arquitecto-bd + devops |
| O-02 | Suites nunca ejecutadas (excepción documentada); task-13 obligatoria antes de G1. | P2 (gate G1) | devops + QA |
| O-03 | Cobertura pgTAP parcial: falta RLS por filas (SEC-01/02/03), `correcta` de vista (SEC-05), recálculo de hash (SEC-06), vistas BHE, casos felices de completitud, predicados Realtime. | P2 | QA (task-13) + arquitecto |
| O-04 | Hook de auth **no activo** (E3, sin `SUPABASE_ACCESS_TOKEN`) y "Allow public access" de Realtime pendiente de consola; documentado y con tarea (F1-17). | P2 (entorno) | devops |
| O-05 | `v_quiz_questions` es definer a propósito; correcto, pero sólo hay evidencia SQL (no pgTAP de columnas). | P3 | QA |
| O-06 | Las suites asumen conexión como superusuario: RLS no se ejerce con JWT real; al ejecutarlas deben añadirse casos `SET LOCAL role authenticated` + `request.jwt.claims`. | P2 | QA (task-13) |

## 7. Checklist QA de la tarea (`agents/05_qa_tester.md` §5)

| Criterio | Estado |
|---|---|
| Suites aplicables ejecutadas y verdes | **NO** — 0/39 aserciones ejecutadas (excepción documentada) |
| Sin regresiones | ✓ CI 4/4; no hay suites previas que regresen |
| Matriz actualizada | ✓ notas de evidencia F1-00; sin verdes |
| Gates metodológicos probados (bloqueante + feliz) | parcial (solo DB: custodia, F6, completitud/folio); sin EF |
| SEC-05 | parcial (privilegios y columnas verificadas por SQL; pgTAP no ejecutado) |
| API-00 | no (sin EF; solo tabla) |
| OFF-01 | no (sin PWA) |

## 8. Conclusión y siguiente paso

- **Dictamen: AMARILLO — merge permitido con excepción documentada.** Sin veto de QA.
- **Condición gate:** task-13 (pgTAP en CI con Postgres) ejecuta las 4 suites en verde y
  publica run id **antes de G1**; mientras tanto, la cobertura funcional sigue en 0/94 y la
  matriz no tiene verdes nuevos.
- Si task-13 no puede ejecutarlas o fallan y no se corrigen, F1-00 no puede cerrar G1
  (QA elevará a ROJO de fase).
- QA no hace commit/push/merge. Este reporte y la actualización de `qa/trazabilidad.md`
  quedan en el working tree sobre `4b057b3` para el commit de seguimiento/squash.

## Firma

QA `qa-tester`. Sin modificación de producto, migraciones, `app/**` ni `.github/**`; solo
reporte QA y matriz de trazabilidad. Sin secretos impresos; consultas Supabase de solo
lectura.
