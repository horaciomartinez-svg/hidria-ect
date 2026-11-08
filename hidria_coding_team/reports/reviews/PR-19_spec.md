# Revisión de especificaciones — PR #19 — fix(f1-00): RES-1 diagnostics y residuales de seguridad

- **Revisor:** `revisor-especificaciones` (agente 06)
- **Fecha:** 2026-11-08 13:04 (America/Mexico_City)
- **PR:** [#19](https://github.com/horaciomartinez-svg/hidria-ect/pull/19) — `fix/F1-task18-res1` → `main`
- **Head revisado:** `c5a3b238681de5bb125c9e3eee30544f58f364a9` (1 commit, 5 archivos, +227/−5; base `main@1688ba5`).
- **CI en `c5a3b23`:** 6/6 `success` (runs `42512261299`/`42512275238`: Guardas, Cliente y Edge Functions Deno); `mergeable_state: clean`.
- **Base de datos:** `schema_migrations` = **17**; migración nueva aplicada vía MCP.
- **Veredicto:** **CAMBIOS SOLICITADOS.** 1 BLOQUEANTE (el nuevo INSERT de `diagnostics` permite saltarse el gate de fase), 1 MAYOR (`admin_institucional` incluido contra `docs/01` §5) y observaciones de cobertura/versión.

---

## 1. Alcance y verificación

Revisados: `supabase/migrations/20261108030000_f1_00_res1_fixes.sql`, `supabase/tests/010_f1_00_grants_views.sql`, `supabase/tests/050_f1_00_security_delta.sql`, `reports/F1/F1-00_res1_fixes.md` y `F1-00_delta_seguridad.md`; contraste con `docs/01` §5, `docs/02` (trigger `diagnostics_phase_gate`), `docs/04`/ADR-003 y la BD. Sin cambios en `supabase/functions/**`, `app/**`, `docs/**` ni migraciones previas.

## 2. Lo que PASA

| Criterio | Resultado | Evidencia |
|---|---|---|
| Políticas separadas | ✅ | BD: `diagnostics_sel`, `diagnostics_ins`, `diagnostics_upd`, `diagnostics_del`; `diagnostics_write` ya no existe. INSERT usa tenant + `global_role` + company del mismo tenant (`diagnostics_ins`, migración L19-30); UPDATE/DELETE siguen con `my_diagnostic_role(id)` (`L32-53`). |
| `invitado`/`observador` sin INSERT | ✅ | `diagnostics_ins` no incluye esos roles; suite 050 prueba invitado 42501. |
| Company de otro tenant | ✅ (verificado en vivo) | `EXISTS companies c ... c.organization_id = diagnostics.organization_id`; reporte §1. No hay test pgTAP de ese caso (m2). |
| Gates en UPDATE | ✅ | `docs/02` L875-877: trigger `diagnostics_phase_gate` BEFORE UPDATE cuando cambia `fase_actual`; `diagnostics_upd` no lo elude. |
| `profiles_write.USING` sin escalada | ✅ | Migración L57-75: coordinador no puede UPDATE/DELETE `admin_institucional`; suite 050 (0/1 filas) y admin positivo. |
| DML de 5 vistas revocado | ✅ | Migración L79-85; BD: `authenticated`/`service_role` sin INSERT/UPDATE/DELETE en las 5; guarda `010` L56-82. |
| PG ≥ 16 / SHA | ✅ | `010` L84-85 valida `server_version_num`; SHA corregido en `F1-00_delta_seguridad.md` (`1fb4ae45…`). |
| Forward-only / base / `docs/02` | ✅ | Solo migración nueva; no se editó la base ni `docs/02`; 17 migraciones. |
| Suites y alcance | ✅ | `010` plan 21 y `050` plan 14 coinciden con sus aserciones; 5 archivos, sin secretos. |
| CI | ✅ | 6/6 en `c5a3b23`. |

## 3. Hallazgos

### B1 — BLOQUEANTE: `diagnostics_ins` permite saltarse los gates de fase

**Archivo:** `20261108030000_f1_00_res1_fixes.sql` L19-30; **contrato:** `docs/02` L875-877 (`diagnostics_phase_gate` es **BEFORE UPDATE**, no INSERT); `docs/04` M2 (fase inicial/gates).

`diagnostics_ins` autoriza INSERT por tenant/rol/company, pero **no restringe `fase_actual`** (ni otros campos de gate). El trigger `check_phase_gate` solo se ejecuta en UPDATE cuando `fase_actual` cambia; no hay trigger de INSERT. Por tanto, un usuario autorizado puede crear un diagnóstico directamente en fase avanzada.

**Verificado en vivo (transacción con ROLLBACK):** con claim `coordinador_srhds`, org/empresa del seed:

```sql
insert into public.diagnostics (..., fase_actual)
values (..., 6);   -- éxito: inserted_fase6 = 1
```

Eso permite saltarse los gates de F2→F6 al alta, contradiciendo el objetivo de RES-1 «sin saltarse gates». El positivo de `050` L86-92 solo inserta con el default (fase 1), por lo que no detecta el bypass.

**Fix esperado:** añadir a `diagnostics_ins` `and fase_actual = 1` (y, si aplica, restringir otros campos de gate/estado a los valores iniciales), o un trigger `BEFORE INSERT` que impida `fase_actual <> 1`. Añadir test negativo: coordinador inserta con `fase_actual=2`/`6` ⇒ 42501; positivo con default ⇒ OK; y prueba de company de otro tenant.

### M1 — MAYOR: `admin_institucional` no figura en `docs/01` §5 para `diagnostics`

`docs/01` §5 (L306-312) dice para `companies, diagnostics`: DML «coordinador/equipo/empresa según módulo». La migración L24 incluye además `admin_institucional`, y el reporte lo presenta como «docs/01 §5». Es una divergencia de contrato/least privilege: o se retira `admin_institucional` del INSERT, o se actualiza `docs/01` con un ADR que justifique la excepción. No lo dejo pasar como si docs/01 lo autorizara.

### m2 — Cobertura de tests incompleta

`050` no prueba: INSERT con `fase_actual` avanzada (B1), company de otro tenant (solo verificado en vivo), ni UPDATE/DELETE de `diagnostics` con `my_diagnostic_role`. Añadir esos casos en la misma suite (plan actualizado) evita que el bug reaparezca cuando task-13 ejecute pgTAP.

### m3 — Versión aplicada vs. archivo

BD: 17 filas, última versión `20261108185038`; no figura `20261108030000` (el contenido se aplicó vía MCP). Es la misma clase de discrepancia que ADR-009 documentó; no bloquea, pero task-13/replay limpio debe ser la fuente de verdad y el reporte debería citar la versión real aplicada o la estrategia de alineación.

### m4 — pgTAP aún no en CI

La validación de `010`/`050` es local/MCP; el job pgTAP de task-13/PR #14 es el que debe ejecutar los planes 21/14. No es un defecto de este PR, pero el cierre de task-18 depende de ese job.

## 4. Conclusión

**CAMBIOS SOLICITADOS.** RES-1 queda funcionalmente resuelto para INSERT/UPDATE/DELETE, y los residuales de vistas/`profiles_write`/PG/SHA están bien aplicados; pero **B1** deja una vía real para saltarse los gates de fase al crear un diagnóstico, y **M1** incluye un rol que `docs/01` §5 no autoriza. Con el `fase_actual = 1` (o trigger insert) + tests negativos y la decisión sobre `admin_institucional`, el PR pasa a **APROBADO**.

**Criterio de re-revisión acotada:** migración nueva con el candado de insert, tests 010/050 actualizados (incluido `fase_actual` avanzada y company ajena), reporte con versión aplicada real; guarda 3/CI/sin secretos. No se ejecutaron comandos Git de escritura ni merges; este reporte es el único archivo escrito.

---

## Actualización de contexto (2026-11-08)

- **m4 resuelto:** PR #14/task-13 mergeado (`main` = `1ba8d25`); pgTAP ya corre en CI (6 suites, 113 aserciones) y ejecutará los planes 21/14 de este PR.
- **m3 aclarado:** la diferencia `20261108185038` (BD) vs. prefijo de archivo es el drift conocido de MCP, documentado en task-13; no requiere migración de alineación. El replay limpio desde archivos es la fuente de verdad.
- **B1/M1/m2 siguen pendientes:** `fase_actual` sin candado en INSERT, rol `admin_institucional` contra docs/01 §5 y tests negativos de cobertura. Veredicto **CAMBIOS SOLICITADOS** vigente; se re-revisará solo el delta del nuevo head.

---

## Alcance ampliado por seguridad (task-58) — nueva re-revisión

Seguridad detectó 3 bloqueantes adicionales sobre `c5a3b23`; el arquitecto los incluirá en el mismo ciclo. La re-revisión acotada del nuevo head cubrirá, además de B1/M1:

1. **Estado inicial completo en INSERT** (no solo `fase_actual`): bloquear/forzar todos los campos de gate/estado iniciales; no permitir crear un diagnóstico pre-validado.
2. **Folio server-side:** el INSERT no debe aceptar un folio del cliente (p. ej. `MDOHI-FAKE-999`); debe asignarse/sobrescribirse por secuencia/trigger y verificarse contra `docs/01`/`docs/02`.
3. **`empresa` y ownership:** `empresa` no puede insertar diagnósticos para otra empresa del mismo tenant; o se valida ownership, o se retira `empresa` del INSERT hasta M2.
4. Test de folio/estado y residual de `diagnostics_upd` como ADR/follow-up.

Se mantienen las comprobaciones correctas previas: invitado/observador 42501, cross-tenant 42501, `profiles_write`, DML de vistas, quiz ACL, forward-only y `docs/02`. Veredicto actual: **CAMBIOS SOLICITADOS**; pendiente el nuevo head.

---

## Re-revisión del head `3d64063` (y merge `b6bd53b`)

- **Código revisado:** `3d6406391cca1feffb38a7f133b356f6e5b33c5a` (2 commits, 7 archivos, +429/−7; base `1688ba5`).
- **Head final del PR:** `b6bd53b876692942a23ddfaa66451ca07095e6c2` (merge de `main@4765986`; el merge solo trae `ci.yml`, `040`, ADR-009, BACKLOG y reports de main; **no cambia** las migraciones/tests de #19).
- **CI:** Guardas/Cliente/Deno `success`; **pgTAP en ejecución** al cierre de esta revisión. La aprobación final requiere pgTAP verde.
- **BD:** 19 migraciones; las nuevas se aplicaron como `20261108185038`, `20261108190015`, `20261108190421` (drift MCP documentado; replay desde archivos en task-13).

### Lo que quedó corregido

| Punto | Resultado | Evidencia |
|---|---|---|
| **B1 — estado inicial / fase** | ✅ | `20261108030010`: `diagnostics_ins` exige `fase_actual=1` y retira admin. `20261108030020`: trigger `diagnostics_initial_state` rechaza estado/avance/cat/bitácora/IVOH/brecha/reporte/semáforo/hito inyectados (auth.uid no nulo); pruebas 050 con fase 2/6 y estado inyectado ⇒ 42501. |
| **Folio en INSERT** | ✅ | Trigger BEFORE INSERT asigna `MDOHI-AAAA-NNN` con `diagnostics_folio_seq`; test con `MDOHI-FAKE-999` verifica sobrescritura; regex 3 dígitos. |
| **M1 admin** | ✅ | `admin_institucional` fuera de `diagnostics_ins`; test 050 ⇒ 42501. |
| **Empresa** | ✅ (retirada) | `empresa` fuera del INSERT hasta ownership M2; test 050 ⇒ 42501; docs/01 se alineará en M2. |
| **Candado de fase/estado** | ✅ | Trigger + policy; UPDATE fase 6 sin IVOH ⇒ P0001; tests 050. |
| **Company cross-tenant** | ✅ | Policy; test 050 ⇒ 42501. |
| **Tests/planes** | ✅ | `010` plan 21; `050` plan 24; 129 aserciones previstas. |
| **Residuales previos** | ✅ | Vistas DML, `profiles_write`, PG≥16, SHA, forward-only y alcance se mantienen. |

### B2 — BLOQUEANTE: el folio no es inmutable en UPDATE

La protección del folio está **solo en el trigger BEFORE INSERT**. `diagnostics_upd` permite a coordinador/equipo actualizar la fila sin restringir columnas; no hay trigger BEFORE UPDATE para `folio`.

**Verificado en vivo (transacción con ROLLBACK):** como `coordinador_srhds`, actualicé el folio del diagnóstico semilla:

```sql
update public.diagnostics set folio='MDOHI-FAKE-999'
 where id='c1000000-0000-4000-8000-000000000001';
-- select devuelve: MDOHI-FAKE-999
```

Esto contradice el objetivo «folio server-side» y `docs/01` (folio asignado por secuencia), y el reporte §1 afirma «Folio SIEMPRE server-side». El residual listado para task-59 (`estado`, `reporte_document_id`, `bitacora_cerrada`) **no incluye folio**, así que no queda cubierto por el follow-up declarado.

**Fix esperado:** trigger `BEFORE UPDATE` que preserve `new.folio := old.folio` (o rechace el cambio con 42501), test 050 de UPDATE de folio, y mantener el resto del estado/reporte/bitácora en task-59 con ADR explícito.

### Observaciones

- **m1:** el residual `diagnostics_upd` de estado/reporte/bitácora está documentado en task-59; aceptable como follow-up **solo con ADR** y antes de M2/F1-04. No incluye folio (B2).
- **m2:** `schema_migrations` 19 con versiones MCP distintas de los prefijos; documentado en el reporte; no bloquea.
- **m3:** el trigger consume un valor de secuencia antes de rechazar un INSERT inválido; puede dejar huecos de folio. Es cosmético; documentar o mover la asignación después de la validación si se exige secuencia sin huecos.
- **m4:** `auth.uid()` null (postgres/service_role) permite sembrar estados avanzados; es intencional para fixtures, pero debe quedar fuera de la API pública; correcto.
- **m5:** pgTAP aún en ejecución; el veredicto se mantiene **CAMBIOS** por B2 aunque el job termine verde.

### Veredicto

**CAMBIOS SOLICITADOS.** B1, M1, empresa, estado inicial y folio en INSERT están corregidos y cubiertos por tests; pero **B2** deja el folio modificable por UPDATE, incumpliendo «folio server-side». Con el trigger de inmutabilidad + test, y CI/pgTAP verde, el PR pasa a **APROBADO** con re-revisión limitada a ese delta.

---

## Re-revisión final `e602ecd` — APROBADO con B2 en task-59

- **Head final:** `e602ecd99bf617d63f27fe9a11afa1cfbfd1c24e` (4 commits, 7 archivos, +431/−7; base `4765986`).
- **Delta `b6bd53b..e602ecd`:** solo `supabase/tests/050_f1_00_security_delta.sql` (+11/−9): CTEs de UPDATE/DELETE movidos a top level, UUIDs sintéticos válidos y mensaje del gate esperado F2 (el salto 1→6 lo bloquea F2 antes que F6); `plan(24)` intacto.
- **CI:** ambos runs con Guardas/Cliente/Deno y **pgTAP `success`**; `mergeable_state: clean`.
- **BD:** 19 migraciones; sin cambios de políticas/trigger en este delta.

### B2 — decisión final: **no-blocker de #19**, condición de task-59

Acepto la clasificación de seguridad: el folio modificable por UPDATE es **residual del esquema previo**, no lo introduce el hardening de INSERT de #19. Por tanto:

- **No es blocker de #19** con la trazabilidad **task-59**.
- **Condición obligatoria:** task-59 debe cubrir explícitamente **folio inmutable en UPDATE** además de estado/reporte/bitácora, con ADR/candado o EF-only **antes de M2/F1-04**, sin datos reales; el reporte `F1-00_res1_fixes.md` debe corregir «Folio SIEMPRE server-side» a «server-side en INSERT; UPDATE residual task-59» y añadir el test correspondiente en task-59.
- Si task-59 se limita a estado/gates y deja folio fuera, vuelve a ser blocker de spec.

### Comprobaciones finales

| Punto | Resultado |
|---|---|
| Estado inicial completo en INSERT | ✅ trigger + tests fase 2/6/estado inyectado 42501. |
| Folio en INSERT | ✅ secuencia/trigger; fake sobrescrito; regex `MDOHI-AAAA-NNN`; test. |
| `admin_institucional` fuera | ✅ policy + test 42501. |
| `empresa` fuera hasta ownership M2 | ✅ policy + test 42501; docs/01 a alinear en M2. |
| Company cross-tenant | ✅ policy + test 42501. |
| UPDATE fase gate | ✅ P0001 F2 en test; trigger real. |
| Suites | ✅ `010` 21 / `050` 24; pgTAP verde en CI. |
| Residuales previos | ✅ vistas DML, profiles_write, PG≥16, SHA, guarda 3, sin secretos. |
| B2 folio UPDATE | ⏳ task-59 con condición anterior. |

**Veredicto final:** **APROBADO** para el squash de #19, con B2/task-59 como condición de seguimiento no bloqueante. No se ejecutaron comandos Git de escritura ni merges; este es el cierre del reporte.
