# PR #19 — Revisión de Seguridad (task-18: RES-1 diagnostics + residuales)

- **Agente:** `seguridad-privacidad` (08) — autoridad de **veto**
- **Fecha:** 2026-11-08 13:10 (America/Mexico_City)
- **PR:** [#19](https://github.com/horaciomartinez-svg/hidria-ect/pull/19) — `fix/F1-task18-res1` → `main`
  («fix(f1-00): RES-1 insert diagnostics y residuales de seguridad (task-18)»)
- **Head revisado (final):** `e602ecd99bf617d63f27fe9a11afa1cfbfd1c24e`; base `main@4765986`;
  4 commits, **7 archivos, +431/−7**; autor `arquitecto-bd`. El código de seguridad es el de
  `3d64063`; el commit final `e602ecd` solo corrige tests de `050` (CTE/UUID/gate) y fusiona
  `main` (sin cambios en migraciones ni en la lógica de seguridad).
- **Migraciones aplicadas** (vía MCP): `20261108030000_f1_00_res1_fixes`,
  `20261108030010_f1_00_res1_fixes2`, `20261108030020_f1_00_res1_hardening`; **`schema_migrations = 19`**
  (la 30000 ya existía; 010/020 son nuevas y forward-only; la 30000 **no se editó**).
- **CI:** **4/4 `success`** en `e602ecd`, incluido **pgTAP (Supabase local)** (runs
  `42514093030`/`42514098168`; Guardas, Cliente, Edge Functions Deno y pgTAP). `mergeable_state:
  clean`.
- **Método:** revisión estática del SQL/tests; MCP con `SET LOCAL ROLE authenticated` + claims
  sintéticos + ROLLBACK; comparación con `docs/01` §5, `docs/02` y ADR-005; hash de `docs/02`;
  secret scan. No se modificó la BD ni se hizo git de escritura.

## Veredicto: **APROBADO CON OBSERVACIONES — SIN VETO**

El **VETO provisional** emitido sobre `c5a3b23` queda **levantado** en `3d64063`/`e602ecd`: se
corrigieron el candado del estado inicial, el **folio server-side**, la retirada de `empresa`
(ownership M2 pendiente) y la retirada de `admin_institucional` (M1), y los controles de
regresión se mantienen. No hay hallazgos nuevos bloqueantes. Las condiciones restantes son el
residual conocido de `diagnostics_upd` (task-59, aceptado como follow-up), la alineación
documental de `docs/01` §5 para `empresa`/M2, y el uso de la BD solo con fixtures sintéticos
hasta cerrar task-59. **pgTAP ya está verde** (4/4).

## 1. B1 — Candado de estado inicial en INSERT: **CORREGIDO** ✅

La migración `20261108030020` crea `trg_diagnostics_initial_state` (BEFORE INSERT, función con
`search_path` fijo) que:

1. **Fija el folio server-side** siempre (ver §2).
2. Para la API autenticada (`auth.uid() is not null`) **rechaza con 42501** si el INSERT intenta
   inyectar cualquier estado no inicial: `fase_actual != 1`, `estado != 'activo'`,
   `avance_pct != 0`, `cat_estado != 'no_enviado'`, `bitacora_cerrada != false`,
   `ivoh_actual`/`brecha_pct`/`reporte_document_id` no nulos, `semaforo_atraso != 'verde'`,
   `proximo_hito`/`reprogramacion_justificacion` no nulos.
3. La política `diagnostics_ins` exige además `fase_actual = 1`, tenant, `company_id` del mismo
   tenant y `global_role` ∈ {`coordinador_srhds`, `equipo`}.

**Verificación en vivo (claims sintéticos, ROLLBACK):**

| Caso | Resultado |
|---|---|
| coordinador INSERT fase 1 | ✅ OK |
| equipo INSERT fase 1 | ✅ OK |
| coordinador INSERT fase 6 + estado `reportado` + avance 100 + cat validado + bitácora true | **42501**, rechazado por trigger |
| INSERT fase 2 / fase 6 | **42501**, rechazado por trigger/política |
| INSERT con `company_id` de **otro tenant** | **42501** |
| `empresa` / `admin_institucional` / `invitado` / `observador` INSERT | **42501** |
| UPDATE a fase 6 sin IVOH | **P0001** del trigger `diagnostics_phase_gate` (sin regresión) |

> Los fixtures ejecutados como `postgres` (`auth.uid()` null) pueden sembrar estados avanzados;
> es el comportamiento esperado para pruebas/seed y no otorga acceso a la API autenticada. La
> API (`authenticated`) queda cerrada. No hay privilegio para `anon` en `diagnostics`.

## 2. Folio server-side: **CORREGIDO** ✅

`trg_diagnostics_initial_state` **sobrescribe siempre** `folio` con
`MDOHI-<AAAA>-<NNN>` usando `public.diagnostics_folio_seq`; un folio inyectado por el cliente no
se conserva. Verificación: INSERT con `folio='MDOHI-FAKE-999'` → fila insertada con
`folio='MDOHI-2026-063'` (secuencia), `fase_actual=1`, `estado='activo'`, `avance_pct=0`,
`cat_estado='no_enviado'`, `bitacora_cerrada=false`. Cumple `docs/04` §2.5 (los folios no se
generan en el cliente) y el test de `050` (`folio ~ '^MDOHI-[0-9]{4}-[0-9]{3}$'` y
`<> 'MDOHI-FAKE-999'`).

## 3. `empresa` y `admin_institucional` en INSERT: **CORREGIDO** ✅

- `empresa` queda **fuera** de `diagnostics_ins` hasta que M2 defina ownership
  (`companies.contraparte_user_id` o equivalente); verificado 42501.
- `admin_institucional` queda **fuera** de `diagnostics_ins` (M1; `docs/01` §5 solo autoriza
  coordinador/equipo/empresa para el alta). Verificado 42501.
- `coordinador_srhds` y `equipo` conservan el INSERT en fase 1; `invitado`/`observador` quedan en
  42501. La política final es la de `30020` (roles coordinador/equipo), no la intermedia `30010`.

## 4. Residuales de seguridad previos (regresión)

| Verificación | Resultado |
|---|---|
| 5 vistas (`v_bhe_monthly`, `v_bhe_summary`, `v_balance_indicators`, `v_ivoh_score`, `v_diagnostic_completeness`): INSERT/UPDATE/DELETE para `authenticated` y `service_role` | **false** en las 5; SELECT **true**; `security_invoker=true` |
| `v_quiz_questions` / ACL de quiz | SELECT=true, DML=false; `security_invoker=false` (vista definer intencional, sin columna `correcta`) |
| `profiles_write` coordinador→perfil admin / admin→admin | **0 / 1 filas** |
| PG ≥ 16 para `REVOKE MAINTAIN` | aserción en `010` (17.11 actual) |
| `diagnostics_upd`/`diagnostics_del` | siguen con `my_diagnostic_role(id)`; UPDATE valida company del tenant |
| Aislamiento A/B | observador del tenant A no ve filas del B; sin cambio |
| Hook de claims, Realtime, audit | sin cambios en el diff; `supabase_realtime` y trigger de auditoría intactos |
| `docs/02` y migración base | **byte-idénticos** (SHA-256 `2A7B6F88…42CB5`) |
| Forward-only | `30000` **sin cambios** desde `c5a3b23`; `30010`/`30020` nuevas; no se editó base/`docs/02` |
| Secretos/PII | secret scan del diff **0**; fixtures `.invalid`; sin credenciales |

## 5. Tests y CI

- `010_f1_00_grants_views.sql`: **plan 21** (+3 guardas de vistas y PG≥16).
- `050_f1_00_security_delta.sql`: **plan 24** (antes 14): positivos coordinador/equipo, folio
  inyectado sobrescrito, estado inicial inyectado/fase 2/fase 6 rechazados, cross-tenant 42501,
  UPDATE a fase 6 bloqueado por gate, `profiles_write` 0/1, empresa/admin fuera, DELETE con
  `my_diagnostic_role`. Reporte del autor: **129 aserciones** en 6 suites.
- **CI:** **4/4 success en `e602ecd`**, incluido **pgTAP (Supabase local)** (runs
  `42514093030`/`42514098168`; Guardas, Cliente, Deno y pgTAP). El commit `e602ecd` corrigió los
  defectos de la suite que habían hecho fallar el check: CTE con DML no top-level en `050:140`
  (ahora `with … select is(...)`), UUIDs inválidos (`ahah…`/`ajaj…`/`agag…` sustituidos por
  `a0a0…`/`a2a2…`/`a1a1…`) y expectativa del gate F2 (fixture fase 1 → F2) en lugar de F6; además
  fusionó `main` sin cambios de código. **pgTAP verde y `plan(24)` correcto.**

## 6. Condiciones y observaciones (no bloqueantes de seguridad)

| ID | Severidad | Hallazgo | Acción |
|---|---|---|---|
| **SEC-PR19-C1** | **RESUELTO** | pgTAP falló en `3d64063` por defectos de la suite (CTE no top-level, UUIDs inválidos, expectativa F2); `e602ecd` los corrigió y el CI quedó **4/4 success** con pgTAP verde. | Sin acción adicional; conservar runs `42514093030`/`42514098168`. |
| **SEC-PR19-C2** | OBS (documentación) | `docs/01` §5 todavía menciona `empresa` para el alta de `diagnostics`; la política la retira hasta M2 (ownership). Es más restrictiva, no un bypass. | Alinear `docs/01` §5 en M2/task-58; no requiere cambio de seguridad. |
| **SEC-PR19-C3 / task-59** | MAYOR (aceptado como follow-up) | `diagnostics_upd` permite a coordinador/equipo cambiar `estado`, `reporte_document_id`, `bitacora_cerrada`, etc.; el trigger solo cubre `fase_actual`. No introducido por #19 (ya existía), documentado por el autor. | ADR + candado de estados/gates en UPDATE o EF-only, con tests pgTAP, **antes de M2/F1-04**; no usar con datos reales hasta cerrarlo. |
| **SEC-PR19-C4** | OBS (menor) | `created_at`/`updated_at`/`id` no se fuerzan en el trigger de INSERT (el folio sí); no afecta a gates/RLS y el `id` es único. | Valorar forzar timestamps/ID server-side en un endurecimiento posterior; no bloqueante. |

No hay hallazgos nuevos de escalada/cross-tenant; los roles no autorizados quedan en 42501 y el
`empresa`/`admin` se retiraron del alta. El único bypass de gates restante es el **UPDATE de
campos de estado** (`diagnostics_upd`), aceptado como **task-59** y fuera del alcance de este PR
según la decisión del supervisor; se mantiene la condición de no usar con datos reales hasta
cerrarlo.

## 7. Conclusión

**APROBADO CON OBSERVACIONES, SIN VETO** para el código de `3d64063` y el head final
`e602ecd` (PR #19): RES-1 queda resuelto con INSERT restringido, estado inicial completo, folio
server-side, sin `empresa`/`admin` y sin cross-tenant; los residuales de vistas, `profiles_write`,
PG≥16 y quiz se mantienen; la migración es forward-only (30000 intacta, 010/020 nuevas;
`schema_migrations=19`); `docs/02` byte-idéntico y sin secretos. Condiciones: task-59 antes de
M2/F1-04 y alineación documental de `docs/01` §5 en M2. **pgTAP verde en CI (4/4)**; el VETO
provisional sobre `c5a3b23` queda como histórico y este head lo levanta.

## Firma

`seguridad-privacidad` (08) — **APROBADO CON OBSERVACIONES** (sin veto) para
`e602ecd99bf617d63f27fe9a11afa1cfbfd1c24e` del PR #19 (código de seguridad `3d64063`; delta final
solo tests/merge). Sin fuga de secretos/datos reales, sin cambios de BD no migrados, sin alteración
de `docs/02`; CI **4/4** con pgTAP verde; condiciones task-59/docs/01 registradas. Sin `git` de
escritura, sin merge y sin publicar tokens/secretos.
