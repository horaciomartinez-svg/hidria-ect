# PR #4 — Re-revisión de seguridad DELTA (F1-00, task-17)

- **Agente:** `seguridad-privacidad` (08) — autoridad de **veto**
- **Fecha:** 2026-11-07 19:48 (America/Mexico_City)
- **PR:** [#4](https://github.com/horaciomartinez-svg/hidria-ect/pull/4) — `feature/F1-00-migraciones` → `main`
- **Head re-revisado:** `4e2341d41af7b2e1206fea5f61a9247c8b5d0813` · **Base:** `main@8008a648161f36823302429bb302dd832a9ec231`
- **Delta** (`4b057b3..4e2341d`): 6 commits, 16 archivos, +1742/−0 — migración nueva
  `supabase/migrations/20261108010800_f1_00_security_fix.sql` (**aplicada** vía MCP →
  **12 migraciones**), tests `010`/`040` actualizados + nueva `050_f1_00_security_delta.sql`,
  y `hidria_coding_team/reports/F1/F1-00_delta_seguridad.md`.
- **CI del head `4e2341d`:** **4/4 checks `success`** (runs `42435395966` y `42435399700`).
- **Hallazgo previo:** `reports/security/PR-4_security.md` (VETO por SEC-PR4-01 y SEC-PR4-02).
- **Método:** MCP Supabase **solo lectura** + fixtures sintéticos en transacciones con
  `ROLLBACK`; MCP GitHub para CI. Sin `git` de escritura, sin merge.

## Veredicto: **VETO LEVANTADO** (seguridad) — con 1 condición funcional residual (no de seguridad)

Los dos hallazgos **BLOQUEANTES** quedaron corregidos en la BD aplicada y en el SQL del PR,
verificados de forma independiente y con pruebas negativas **y positivas**. **No se detectó
ninguna exposición nueva** ni regresión de los controles de seguridad (grants, RLS, vistas,
auditoría, hook, Realtime). La aprobación de seguridad para el merge queda emitida.

> **Condición funcional residual (no es causal de veto de seguridad):** la política
> `diagnostics_write` quedó **demasiado restrictiva**: ningún rol `authenticated` puede
> INSERTAR un diagnóstico (verificado `coordinador_srhds` → 42501), porque el `WITH CHECK`
> evalúa `my_diagnostic_role(id)` sobre una fila que aún no existe. Si la creación de
> diagnósticos (M2/F1-04) se hace por PostgREST directo —como indica la matriz de `docs/01`
> §5— está rota; si se decide que sea solo por EF con `service_role`, debe documentarse en
> ADR y ajustarse `docs/01`. Corregir antes de F1-04/M2 (ver §4).

## 1. SEC-PR4-01 — DML de `authenticated` en `v_quiz_questions`: **CORREGIDO** ✅

| Verificación | Evidencia (BD real) | Resultado |
|---|---|---|
| SELECT sigue permitido | `has_table_privilege('authenticated','public.v_quiz_questions','SELECT')` = **true**; `SELECT count(*)` como `authenticated` = **14** | ✅ (lectura segura intacta) |
| INSERT/UPDATE/DELETE revocados | `has_table_privilege(...'INSERT'/'UPDATE'/'DELETE')` = **false/false/false** | ✅ |
| ACL de la vista | `v_quiz_questions`: `{postgres=arwdDxtm, authenticated=r, service_role=r}` (sin `a/w/d`) | ✅ |
| `UPDATE` real como `authenticated` | `SET LOCAL ROLE authenticated` + claims sintéticos → **42501 permission denied for view v_quiz_questions** | ✅ |
| `DELETE` real como `authenticated` | idem → **42501 permission denied for view v_quiz_questions** | ✅ |
| `correcta` no expuesta | `information_schema.columns` de la vista: **0** columnas `correcta`; `service_role` conserva DML sobre la tabla cruda (`INSERT/UPDATE/DELETE` = true) | ✅ |
| Aserción de regresión | `supabase/tests/010…: plan(18)` añade INSERT/UPDATE/DELETE=false, ausencia de `correcta` y `throws_ok` UPDATE/DELETE → 42501 | ✅ (archivo; ejecución en CI pendiente, task-13) |

Causa corregida con `revoke insert, update, delete on public.v_quiz_questions from
authenticated` y `from service_role` (least privilege; `service_role` usa la tabla cruda),
manteniendo `grant select` (migración 10800, l. 17–19). La vista sigue `definer` (justificado
para servir 4 columnas desde la tabla revocada).

## 2. SEC-PR4-02 — `WITH CHECK` en las 7 políticas `FOR ALL`: **CORREGIDO** ✅

`pg_policies` confirma `WITH CHECK` presente y equivalente al `USING` en
`companies_write`, `diagnostics_write`, `documents_write`, `iih_assets_write`,
`samples_write`, `water_balances_write`; `profiles_write` añade además la condición de
no-escalada (`admin_institucional` solo lo concede un admin; `coordinador_srhds` no).

### Pruebas negativas (una transacción, `SET LOCAL ROLE authenticated`, las 7 denegadas = OK)

Harness `DO` con captura de `insufficient_privilege` (si una INSERT hubiera pasado, abortaba
con `FALLO…`); resultado final: `negativas_7_tablas_ok`. Detalle:

| Rol sintético | Tabla | Resultado |
|---|---|---|
| `invitado` | `companies` | **42501** ✅ |
| `invitado` | `diagnostics` | **42501** ✅ |
| `invitado` | `profiles` con `global_role='admin_institucional'` | **42501** ✅ |
| `observador` | `documents` | **42501** ✅ |
| `observador` | `iih_assets` | **42501** ✅ |
| `observador` | `samples` | **42501** ✅ |
| `observador` | `water_balances` | **42501** ✅ |
| `coordinador_srhds` | `profiles` con `global_role='admin_institucional'` | **42501** ✅ (no escalada) |

### Pruebas positivas (sin regresión en el resto de la corrección)

| Rol | Operación | Resultado |
|---|---|---|
| `coordinador_srhds` | INSERT `companies` | **OK** (2 filas: fixture + insertada) ✅ |
| `coordinador_srhds` | INSERT `profiles` con rol no-admin (`equipo`) | **OK** ✅ |
| `equipo` (miembro) | INSERT `documents` / `samples` / `water_balances` / `iih_assets` | **OK** (1 fila cada una) ✅ |
| `equipo` (miembro) | UPDATE `diagnostics` (campo `proximo_hito`) | **1 fila** ✅ (sin regresión en UPDATE) |

## 3. SEC-PR4-05/06 (least privilege) y regresión: **CORREGIDO / SIN REGRESIÓN** ✅

| Verificación | Resultado |
|---|---|
| `MAINTAIN` en `authenticated`/`service_role` (`organizations`, `audit_log`) | **false** ✅ |
| Secuencias `public` (14): ACL | `authenticated=U` (USAGE) **sin `r`/`w`** en las 14; `anon` sin privilegios ✅ |
| `service_role` en `audit_log` | `INSERT` **true**; `UPDATE`/`DELETE`/`TRUNCATE` **false** (append-only) ✅ |
| `anon` | **0** relaciones con DML y **0** funciones ejecutables ✅ |
| Vistas `security_invoker` | **5/6** (las 5 analíticas); `v_quiz_questions` sigue `definer` ✅ |
| Aislamiento A/B (claims sintéticos, rollback) | tenant A ve **1** org / **1** empresa / **1** diagnóstico / **1** fila de `v_diagnostic_completeness`, **14** preguntas y **0** `audit_log`; filas del tenant B filtradas ✅ |
| Hook (`custom_access_token_hook`) | intacto: `security definer`, `search_path=public,pg_temp`, EXECUTE solo `supabase_auth_admin` (ni `authenticated` ni `service_role`) ✅ |
| Realtime | **5** tablas publicadas + **3** políticas de canales privados ✅ |
| Estructura | 46 tablas / **46 RLS** / **105 políticas** / 11 `using(true)` (solo catálogos) / triggers H-5 y índices (`audit_log_prev_hash_uniq`, `uq_ivoh_index_versions_vigente`, `report_emissions_folio_key`) presentes ✅ |
| Funciones privilegiadas | `fn_audit_write`, `fn_bhe_monthly/summary`, `fn_diag_role`, `fn_is_diag_member`: EXECUTE **false** para `authenticated`; true para `service_role` ✅ |

## 4. Estado aplicado vs SQL del PR (coincidencia) y forward-only

- `schema_migrations` = **12 filas** (3 base + 8 F1-00 + **1 delta de seguridad**), con
  `name = 20261108010800_f1_00_security_fix` y versión aplicada `20261108013932` ✅.
- **Migraciones previas no editadas:** `git diff --name-status 4b057b3..4e2341d` solo muestra
  `A` nueva migración + `M` tests `010`/`040` + `A` test `050` + reportes; **ninguna** de las
  8 migraciones anteriores ni `docs/02` ni la migración base ✅.
- `docs/02` ↔ migración base: SHA-256 **idénticos** (`2A7B6F88…42CB5`) ✅.
- Secret scan del delta (`6` archivos): **0** patrones de secreto; sin `service_role` en
  cliente/bundle (sin cambios en `app/`) ✅.
- PostgreSQL **17.11** (soporta `MAINTAIN`; nota de portabilidad en §5).

## 5. Condiciones residuales (ninguna es veto de seguridad)

| ID | Severidad | Condición | Dueño / momento |
|---|---|---|---|
| **RES-1** | MAYOR **funcional** (no seguridad) | `diagnostics_write` INSERT denegado para todos los roles `authenticated` (verificado `coordinador_srhds` → 42501) por `WITH CHECK = my_diagnostic_role(id)` sobre una fila nueva (NULL). Si M2 crea diagnósticos por PostgREST directo (matriz `docs/01` §5) está roto; el test `050` no incluye un positivo de creación de diagnóstico. **Corregir con política separada** para INSERT (tenant + `global_role` autorizado; `USING` de diagnóstico para UPDATE/DELETE) **o** documentar EF-only vía ADR y alinear `docs/01`. | `arquitecto-bd` + `revisor-especificaciones`, antes de F1-04/M2 |
| **SEC-PR4-03** | MAYOR privacidad (latente) | `privacy_requests` sigue con DML para `authenticated` y política `privacy_tenant` (`is_tenant_member`): PII ARCO legible/insertable por cualquier miembro del tenant. 0 filas reales y sin UI. | `task-15` (ADR + migración antes del buzón ARCO) |
| **SEC-PR4-04** | MAYOR entorno | Realtime: desactivar “Allow public access” antes de RT-01/02. | F1-17 |
| **SEC-PR4-07** | MENOR proceso | Las suites pgTAP (incluidas las nuevas aserciones de seguridad) no se ejecutan aún en CI; la regresión no está protegida automáticamente. | `task-13`, antes de G1 |
| **SEC-PR4-08** | MENOR | Gates `check_phase_gate`/`trg_custody_gate` son invoker sin `search_path` fijo. | F1-01/ADR |
| **SEC-PR4-11** | MENOR (nuevo) | Las otras 5 vistas conservan DML (`authenticated=arwd`) aunque no son actualizables (inertes). Para evitar que una futura vista simple repita SEC-PR4-01, revocar DML de todas las vistas a roles de API y/o guarda en CI. | `arquitecto-bd` (próxima migración) |
| **SEC-PR4-12** | MENOR (nuevo) | `revoke maintain` requiere PostgreSQL ≥ 16; el proyecto actual es 17.11. Si el futuro staging fuese < 16 la migración fallaría: añadir guarda por `server_version_num` o documentar el mínimo. | DevOps/F1-00 staging |
| **SEC-PR4-13** | MENOR (nuevo) | `profiles_write.USING` sigue permitiendo a `coordinador_srhds` UPDATE/DELETE de perfiles `admin_institucional` (la no-escalada solo impide **conceder** admin). Evaluar restricción adicional en F1-01/ADR. | `arquitecto-bd`/F1-01 |
| **SEC-PR4-14** | NOTA documental | El reporte `F1-00_delta_seguridad.md` cita el head previo con SHA truncado incorrecto (`1fb4ae4c…` vs `1fb4ae45…`); sin impacto. | `arquitecto-bd` (doc) |

## 6. Conclusión

- **SEC-PR4-01 y SEC-PR4-02 corregidos** y verificados en vivo (negativas y positivas);
  SEC-PR4-05/06 atendidos; regresión de aislamiento, grants, vistas, auditoría, hook y
  Realtime **sin hallazgos nuevos de seguridad**; estado aplicado = SQL del PR; forward-only
  respetado; 0 secretos.
- **VETO LEVANTADO** para el head `4e2341d41af7b2e1206fea5f61a9247c8b5d0813`. La aprobación
  de seguridad queda emitida; el merge sigue requiriendo la aprobación del usuario (ruleset
  `proteccion-main`, revisión de especificaciones y CI verde ya 4/4).
- Recomendación: resolver **RES-1** (creación de diagnósticos) en tarea inmediata antes de
  implementar M2/F1-04; no debe considerarse F1-00 “cerrado funcionalmente” sin ese ajuste.

## Firma

`seguridad-privacidad` (08) — **VETO LEVANTADO** (seguridad) para el head
`4e2341d41af7b2e1206fea5f61a9247c8b5d0813` del PR #4, con las condiciones residuales de §5.
Sin fuga de secretos (0 patrones; no procede rotación) y sin cambios persistentes en la BD
(fixtures con `ROLLBACK`; las secuencias avanzaron de forma no transaccional, proyecto de
desarrollo con datos sintéticos). Sin `git` de escritura y sin merge.
