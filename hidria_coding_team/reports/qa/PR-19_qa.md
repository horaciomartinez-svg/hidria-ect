# PR #19 — QA: F1-00 RES-1 + hardening de `diagnostics` (task-18)

- **Agente:** `qa-tester` (05)
- **Fecha:** 2026-11-08 13:25 (America/Mexico_City)
- **Tarea:** `task-57` — QA PR #19 (task-18 RES-1/residuales)
- **PR:** [#19](https://github.com/horaciomartinez-svg/hidria-ect/pull/19) — `fix/F1-task18-res1` → `main`
- **Head evaluado:** `e602ecd99bf617d63f27fe9a11afa1cfbfd1c24e` · **Base:** `main` `47659869673a475aadc8bf3d467b3806f76e17ff`
- **Diff:** 7 archivos, +431/−7 — 3 migraciones nuevas (`20261108030000/010/020`), suites `010`/`050`, reportes F1-00. Sin cambios en `app/**`, `.github/**`, `docs/**` ni `supabase/functions/**`.
- **CI:** **4/4 success** en `e602ecd` (runs `42514098168` pull_request y `42514093030` push); job **pgTAP (Supabase local)** success — **6 suites / 129 tests PASS** (`Files=6, Tests=129`).

## Resultado: **VERDE** — merge permitido; residual task-59 aceptado

> **Sí es VERDE para #19**: el replay pgTAP limpio ejecuta **6/6 suites / 129 aserciones**
> (antes 113), incluye RES-1 y el hardening de INSERT, sin regresión; la base tiene **19
> migraciones** forward-only; `docs/02` intacto; alcance y secretos correctos. El residual
> de UPDATE (`estado`, `reporte_document_id`, `bitacora_cerrada`, `avance_pct`, `cat_estado`,
> **`folio`**) está **aceptado como ADR/follow-up task-59** por spec y seguridad, con
> condición explícita de incluir la inmutabilidad del folio; no bloquea #19.

## 1. Migraciones y BD

| Comprobación | Resultado |
|---|---|
| Migraciones aplicadas | **19** (`supabase_migrations.schema_migrations`: count=19, max=`20261108190421`) |
| Nuevas en este PR | `20261108030000_f1_00_res1_fixes.sql`, `20261108030010_f1_00_res1_fixes2.sql`, `20261108030020_f1_00_res1_hardening.sql` |
| Forward-only | ✓ solo se **añaden** 3 migraciones; ninguna migración previa editada; sin cambios en `docs/02` |
| Discrepancia de versión | La BD remota registra `20261108185038/190015/190421` (aplicación vía MCP) frente a los nombres de archivo; el reporte la documenta como representación distinta, sin drift de esquema |
| `docs/02` | Blob `a2394bcef6545752948055b59faf1817e6be3123` idéntico a la migración base |

## 2. Hardening implementado (verificación estática + suite)

| Control | Implementación / evidencia |
|---|---|
| `diagnostics` INSERT por tenant + rol | `diagnostics_ins`: `is_tenant_member`, `global_role in ('coordinador_srhds','equipo')`, `company_id` del mismo tenant, `fase_actual=1`; empresa/admin retirados (docs/01 §5 y ownership M2) |
| UPDATE/DELETE | `diagnostics_upd`/`diagnostics_del` con `my_diagnostic_role(id) in ('coordinador','equipo')`; UPDATE valida company del tenant |
| Folio server-side en **INSERT** | Trigger `diagnostics_initial_state` asigna `MDOHI-AAAA-NNN` con `diagnostics_folio_seq` y **sobrescribe** `MDOHI-FAKE-999`; test `010/050` lo verifica |
| Estado inicial congelado en INSERT | El trigger rechaza (42501) inyección de `fase_actual`, `estado`, `avance_pct`, `cat_estado`, `bitacora_cerrada`, `ivoh_actual`, `brecha_pct`, `reporte_document_id`, `semaforo_atraso`, `proximo_hito`, `reprogramacion_justificacion` para usuarios autenticados; fixtures `postgres` (auth.uid() null) pueden sembrar estados |
| Bypass de gate en INSERT | `fase_actual=1` en la política; INSERT fase 2/6 → 42501 (no se saltan gates) |
| Company cross-tenant | `exists` de company con la misma `organization_id`; INSERT con company de otro tenant → 42501 |
| Admin fuera del INSERT | `admin_institucional` retirado (docs/01 §5); test → 42501 |
| Empresa fuera del INSERT | Retirado hasta definir ownership en M2; test → 42501 |
| `profiles_write` | Coordinador no puede UPDATE/DELETE perfiles `admin_institucional`; admin conserva acceso; `USING`/`WITH CHECK` verificado |
| Vistas SEC-PR4-01 | `REVOKE INSERT/UPDATE/DELETE` de las 5 vistas para `authenticated`/`service_role`; guarda en `010` y tests de privilegios |
| PG ≥ 16 | Aserción `current_setting('server_version_num')::int >= 160000` en `010` |
| UPDATE a fase 6 | Gate `diagnostics_phase_gate` → `P0001` con mensaje «Gate F2…» (test en `050`) |

## 3. Suites pgTAP — planes vs aserciones y regresión

| Suite | Plan | Contenido nuevo/afectado |
|---|---:|---|
| `010_f1_00_grants_views.sql` | **21** | 3 aserciones nuevas: DML de 5 vistas para `authenticated`/`service_role` + PG ≥ 16 |
| `020_f1_00_idempotency_audit.sql` | 9 | sin cambios |
| `030_f1_00_folio_bhe_completeness.sql` | 9 | sin cambios |
| `040_f1_00_enforcement_realtime.sql` | 15 | sin cambios en este PR (ya venía de task-13) |
| `050_f1_00_security_delta.sql` | **24** | RES-1: positivos coordinador/equipo; negativos invitado/observador/admin/empresa; folio inyectado sobrescrito; estado inicial/fase 2/fase 6; cross-tenant; UPDATE gate F2; UPDATE/DELETE; perfiles admin |
| `060_f1_01a_auth_claims.sql` | 51 | sin cambios |
| **Total** | **129** | **6 suites / 129 PASS en CI** (job pgTAP success) |

El `plan()` de cada suite coincide con las aserciones contadas y la suma (21+9+9+15+24+51=129)
coincide con el resultado de CI `Files=6, Tests=129`. No hay suites editadas fuera de `010`/`050`;
la regresión de `020`/`030`/`040`/`060` quedó cubierta por el mismo replay limpio.

## 4. CI

| Dato | Valor |
|---|---|
| Run pull_request | [42514098168](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42514098168) — 4/4 success |
| Run push | [42514093030](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42514093030) — 4/4 success |
| Job pgTAP (PR) | `128833216021` success; 6 suites / **129 PASS** |
| Job pgTAP (push) | `128833201879` success |
| Guardas / Cliente / Deno | success en ambos runs (sin regresión de build ni middleware) |

## 5. Alcance, secretos y documentación

- 7 archivos: 3 migraciones + 2 suites + 2 reportes F1-00; **sin** `app/**`, `supabase/functions/**`, `.github/**`, `docs/**`.
- `.env` ausente; secret scan del árbol sin coincidencias; sin credenciales nuevas.
- `F1-00_res1_fixes.md` documenta hardening, límites y residual; `F1-00_delta_seguridad.md` corrige SHA. `task-59` queda registrada para el UPDATE residual.
- Sin verdes de reglas de producto R-*: la evidencia es BD/pgTAP, no casos E2E de `docs/05`; se anota en la matriz como evidencia F1-00 (RES-1).

## 6. Residual aceptado — task-59

`diagnostics_upd` permite a coordinador/equipo cambiar campos de estado/reporte/bitácora/
`avance_pct`/`cat_estado` y **`folio`** sin candado específico (el trigger de fase solo cubre
`fase_actual`). Aceptado por spec y seguridad **sin veto**, con **task-59** como condición
obligatoria antes de M2/F1-04: ADR + migración con candado de estado/reporte/bitácora **y folio**,
tests de intento directo (`update diagnostics set folio=...` rechazado), y corregir el reporte
para decir «folio server-side en INSERT; UPDATE residual task-59». No es blocker de #19.

## Dictamen

**VERDE — merge permitido.** RES-1 y hardening de INSERT quedan verificados por pgTAP en CI
(6/6, 129/129), BD con 19 migraciones forward-only, `docs/02` intacto, alcance/secretos
correctos y sin regresión. Residual de UPDATE (incluido folio) es **task-59 aceptada** por spec
y seguridad. QA no mergea; no se ejecutó git de escritura.

## Firma

QA `qa-tester`. Solo este reporte y `qa/trazabilidad.md`; sin modificar `app/**`,
`supabase/**`, `.github/**` ni `docs/**`. Sin secretos.
