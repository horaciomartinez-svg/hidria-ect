# Revisión de especificaciones — PR #28 — task-66: contrato ADR-010/RPC y tests de gates restantes

- **Revisor:** `revisor-especificaciones` (agente 06)
- **Fecha:** 2026-11-08 13:44 (America/Mexico_City)
- **PR:** [#28](https://github.com/horaciomartinez-svg/hidria-ect/pull/28) — `chore/F1-task66-contract-align` → `main`
- **Head revisado:** `434089fa862da040a0c16a0b6cfc9b637d5db1c0` (1 commit, 6 archivos, +128/−14; base `main@057ad79`).
- **CI en `434089f`:** 10/10 `success` (Guardas, Cliente, Deno, pgTAP ×2, E2E ×2); pgTAP 6/6 suites, **139** aserciones; `schema_migrations`=20; `mergeable_state: clean`.
- **Veredicto:** **APROBADO.** Cierra las 3 condiciones no bloqueantes de PR #26/task-59 sin cambios de producto ni migraciones.

---

## 1. Alcance y verificación

Revisados: `ADR-010`, `docs/01` §5, `docs/04` §2.5, `F1-00_task59_update_lock.md` corregido, `F1-00_task66_contract_align.md` y `050_f1_00_security_delta.sql`; contraste con el trigger `diagnostics_update_lock`, `docs/04`/`docs/01`, ADR-010 y el residual B2. Sin migraciones nuevas ni cambios en `supabase/functions/**`, `app/**`, `docs/02` o CI.

## 2. Condiciones de PR-26 — cumplidas

| Condición | Resultado | Evidencia |
|---|---|---|
| **1. Contrato ADR/reporte/docs04** | ✅ | ADR-010 §Rutas legítimas: solo `service_role`/EF; **RPC SECURITY DEFINER autenticado no es ruta válida** (conserva `auth.uid()` no nulo y el trigger lo bloquea); `docs/04` §2.5 y `F1-00_task59_update_lock.md` alineados; sin prometer RPC definer. |
| **2. Tests folio/service_role + gates restantes** | ✅ | `050` plan **34** (+6): `service_role` UPDATE folio → 42501; `semaforo_atraso`, `ivoh_actual`, `brecha_pct`, `proximo_hito`, `reprogramacion_justificacion` autenticados → 42501; se mantienen folio autenticado, combinado estado/reporte/bitácora/avance/cat, `fecha_fin` permitido y `service_role` estado permitido. |
| **3. Tabla de aprobación ADR + nota docs/01 §5** | ✅ | ADR-010 §Aprobaciones/sign-off con filas de revisor, seguridad y supervisor; `docs/01` §5 añade nota de restricción por columna (`folio` inmutable; gate/estado solo `service_role`/EF; RPC definer autenticado no basta). |

## 3. Coherencia y regresión

| Punto | Resultado |
|---|---|
| **ADR-010 ↔ docs/04 ↔ docs/01 ↔ trigger** | ✅ Coherentes: `auth.uid() is null` ⇒ `service_role`/EF; RPC SECURITY DEFINER autenticado bloqueado; docs/01 §5 y docs/04 §2.5 lo explicitan. |
| **Trigger** | ✅ Sin cambios: `diagnostics_update_lock` de task-59; BD 20 migraciones, sin migración nueva. |
| **Forward-only / docs/02** | ✅ Solo docs/tests/reportes; no se edita base ni `docs/02`; docs/01 y docs/04 son documentación fuente permitida. |
| **Tests/planes** | ✅ `050` plan 34; total 139; CI pgTAP verde; los positivos y negativos previos se mantienen. |
| **Alcance** | ✅ 6 archivos: docs/01, docs/04, ADR-010, dos reportes y test 050; sin producto ni CI; sin secretos. |
| **CI** | ✅ 10/10 en `434089f`. |

## 4. Observaciones menores (no bloquean)

1. **ADR-010**: la tabla de sign-off referencia task-63/64 y supervisor; correcto. La condición task-66 queda cerrada; conviene que `docs/01` §5 cite explícitamente `task-66` además de task-59+66 (ya lo hace).
2. **`docs/04` §2.5**: la frase es larga pero precisa; no requiere cambio funcional.
3. **RPC futura**: si algún día se necesita un RPC para estas transiciones, deberá ejecutarse sin JWT/`service_role` y probarse explícitamente; queda documentado, no prometido.
4. **`service_role`** sigue siendo confiable y puede cambiar gate/estado sin validación del trigger; la EF valida sus gates (SEC-PR26-04), ya documentado y sin datos reales hasta M2/F1-04.

## 5. Conclusión

**APROBADO.** Las 3 condiciones de PR-26 están cerradas: contrato real `auth.uid() is null`/solo `service_role`/EF, tests de folio con `service_role` y de los 5 campos de gate restantes, tabla de sign-off y nota docs/01 §5; documentación alineada, plan 34 y 139/139 en CI, sin migraciones ni secretos. El supervisor puede hacer squash de #28; task-66 queda cerrada y no hay blockers residuales para M2/F1-04 por este contrato.

No se ejecutaron comandos Git de escritura ni merges; este reporte es el único archivo escrito.
