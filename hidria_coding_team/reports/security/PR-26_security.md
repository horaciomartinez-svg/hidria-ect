# PR #26 — Revisión de Seguridad (task-59: candado de UPDATE de `diagnostics`)

- **Agente:** `seguridad-privacidad` (08) — autoridad de **veto**
- **Fecha:** 2026-11-08 13:20 (America/Mexico_City)
- **PR:** [#26](https://github.com/horaciomartinez-svg/hidria-ect/pull/26) — `fix/F1-task59-update-lock` → `main`
  («feat(f1-00): candado de UPDATE de diagnostics y folio inmutable (task-59)»)
- **Head revisado:** `5d84a20a9b62477e422a92240f6ccd54b5f0a7ac`; base `main@8e4e258`; 1 commit,
  **6 archivos, +223/−13**; CI **5/5 `success`** (Cliente, Guardas, Deno, **pgTAP 133/133**, E2E;
  runs `42515136929`/`42515152096`); `mergeable_state: clean`. Autor: `arquitecto-bd`.
- **Migración aplicada** vía MCP: `20261108040000_f1_00_task59_update_lock`; **`schema_migrations = 20`**.
  Forward-only; no edita 30000/010/020 ni `docs/02` (hash intacto).
- **Método:** revisión estática del trigger/ADR/tests/docs; MCP con `SET LOCAL ROLE authenticated`/
  `service_role` + claims sintéticos + ROLLBACK; regresión contra PR #19; CI. Sin cambios de BD
  adicionales ni git de escritura.

## Veredicto: **APROBADO CON OBSERVACIONES — SIN VETO**

El candado cierra el residual B2 sin introducir un bypass: **folio inmutable en UPDATE** para todos
los roles, campos de gate/estado bloqueados para usuarios autenticados (`42501`), `service_role`
puede ejecutar las transiciones de EF, `fase_actual` sigue pasando por `diagnostics_phase_gate`, y
el INSERT de RES-1/estado inicial/folio server-side/cross-tenant no cambia. Las observaciones son
de **claridad de contrato** (folio también inmutable para `service_role`; condición de bypass basada
en `auth.uid()` y no en `current_user`; residual documental de `docs/01` §5) y no son un bypass
explotable.

## 1. Trigger `diagnostics_update_lock` — folio y campos de gate

La migración `20261108040000` crea (BEFORE UPDATE, función `SECURITY INVOKER`, `search_path` fijo):

1. **`folio` inmutable:** cualquier `NEW.folio IS DISTINCT FROM OLD.folio` → **42501**, para
   **todos** los roles (incluido `service_role`). La identidad server-side del folio no se puede
   alterar por UPDATE.
2. **Campos de gate/estado:** si `auth.uid() IS NOT NULL`, cualquier cambio de
   `estado`, `reporte_document_id`, `bitacora_cerrada`, `avance_pct`, `cat_estado`,
   `semaforo_atraso`, `ivoh_actual`, `brecha_pct`, `proximo_hito` o
   `reprogramacion_justificacion` → **42501**.
3. Los campos no listados (`fecha_fin`, descriptivos) siguen actualizables por los roles que permite
   `diagnostics_upd`.
4. `fase_actual` **no** se duplica: la sigue validando `diagnostics_phase_gate` (BEFORE UPDATE), con
   sus gates F2–F6.

**Verificación en vivo (MCP, ROLLBACK):**

| Caso | Resultado |
|---|---|
| coordinador UPDATE `folio='MDOHI-FAKE-999'` | **42501** folio inmutable |
| coordinador UPDATE `estado='reportado'` | **42501** |
| coordinador UPDATE combinado de estado/reporte/bitácora/avance/cat | **42501** |
| coordinador UPDATE `fecha_fin='2026-03-01'` | **OK** (campo no-gate) |
| `service_role` UPDATE `estado='validado'` | **OK** (ruta EF-01/EF-07) |
| `service_role` UPDATE `folio` | **42501** (folio inmutable también para EF) |
| admin_institucional (miembro de proyecto con rol coord) UPDATE `estado` | **42501** (bloqueado por el trigger) |
| `authenticated` con claims sin `sub` UPDATE estado | **0 filas** (RLS `diagnostics_upd` no resuelve rol; no hay bypass) |
| UPDATE `fase_actual=6` desde fase 1 | **P0001 Gate F2** (sin regresión) |

- `authenticated` **no** es miembro de `service_role` (`pg_has_role(...)=false`); `anon` no tiene
  UPDATE; `authenticated`/`service_role` sí tienen el grant que ya existía.
- El trigger corre después de RLS: un usuario sin acceso ni siquiera llega al trigger (0 filas);
  no se convierte en un oráculo.

## 2. Sin regresión de RES-1 / INSERT / cross-tenant

- El trigger de UPDATE no toca el `trg_diagnostics_initial_state` (BEFORE INSERT) de PR #19, que
  sigue fijando **folio server-side** y bloqueando estados iniciales inyectados.
- Las políticas `diagnostics_ins/upd/del/sel` no se modifican en este PR; `diagnostics_ins` sigue
  con coordinador/equipo, tenant, company del tenant y fase 1; `empresa`/admin/invitado/observador
  en INSERT siguen en 42501 (PR #19).
- Aislamiento A/B: observador/tenant ajeno sigue viendo 0 filas de otro tenant (MCP; 0/0 en el
  tenant ajeno).
- `docs/02` y la migración base **byte-idénticos** (SHA-256 `2A7B6F88…42CB5`); solo
  `docs/04` §2.5 añade una línea de contrato y ADR-010 documenta las rutas EF.

## 3. Rutas legítimas de EF (ADR-010)

`ADR-010-candado-update-diagnostics.md` documenta: EF-01 (`advance-phase`) y EF-07 (`emit-report`)
usan `service_role` (o RPC equivalente) y actualizan fase/estado/reporte/bitácora tras validar sus
gates; el cliente/PostgREST no puede hacerlo directo. `fase_actual` sigue con el gate existente.
La implementación es coherente para la ruta **service_role**; ver SEC-PR26-02 para el matiz
`auth.uid()`/RPC.

## 4. Tests, CI y regresión

- `050_f1_00_security_delta.sql`: **plan 28** (antes 24; +4): folio inmutable, bloqueo combinado
  de estado/reporte/bitácora/avance/cat, `fecha_fin` permitido, `service_role` estado permitido.
- CI **5/5 success**, **pgTAP 133/133** (runs 42515136929/42515152096); sin regresión de suites.
- No hay cambios de políticas/grants/hook/Realtime/audit en el diff; el trigger es adicional.
- `docs/02` y base sin cambios; `schema_migrations=20`; migración forward-only.
- Secret scan **0**; sin credenciales/PII en SQL/reporte; alcance 6 archivos (migración, tests,
  docs/04, ADR-010, reportes).

## 5. Observaciones (no bloqueantes de seguridad)

| ID | Severidad | Hallazgo | Acción |
|---|---|---|---|
| **SEC-PR26-01** | OBS (contrato) | El **folio es inmutable también para `service_role`** (el trigger comprueba folio antes del bypass de EF). La descripción de la tarea decía «service_role/EF puede» (referido a los campos de gate); ADR-010/docs/04 dicen inmutable para todos. Es la opción **más segura**, pero si alguna EF futura necesitara corregir folio, no podría. | Confirmar que ninguna EF/operación legítima muta `folio`; si se requiere, ADR/trigger explícito. No es un bypass. |
| **SEC-PR26-02** | OBS (defensa en profundidad) | El bypass se decide por `auth.uid() IS NULL`, no por `current_user='service_role'`: también permite a `postgres`/roles de servicio/BD y fixtures. En producción esos roles son confiables; un **RPC `SECURITY DEFINER` invocado por un autenticado** conservaría `auth.uid()` no nulo y el trigger lo bloquearía, aunque ADR-010 lo menciona como «RPC equivalente». | Alinear ADR/código: o EF con `service_role`, o un chequeo explícito de rol/RPC con `current_user`/`pg_has_role` (con excepción de fixtures). No hay bypass para `authenticated` (verificado 0 filas/42501). |
| **SEC-PR26-03** | OBS (docs) | `docs/01` §5 todavía menciona `empresa` en el alta de `diagnostics`; PR #19 ya la retiró del INSERT hasta M2. No es de este PR, pero sigue pendiente de alineación documental. | M2/task-58; sin cambio de seguridad. |
| **SEC-PR26-04** | OBS (proceso) | `service_role`/EF puede cambiar estado/reporte/bitácora sin que el trigger valide los gates de EF-01/EF-07 (la validación es responsabilidad de la EF). Es la ruta prevista y no hay datos reales hasta M2/F1-04. | Verificar en la primera EF que usa la ruta service_role; no usar con datos reales hasta M2. |

No hay hallazgos nuevos de escalada/cross-tenant ni bypass de folio/gates por `authenticated`.

## 6. Conclusión

**APROBADO CON OBSERVACIONES, SIN VETO** para `5d84a20` (PR #26): el candado de UPDATE cierra el
residual task-59 (folio inmutable, campos de gate bloqueados para autenticados, `service_role` para
EF, `fase_actual` por gate), sin regresión de RES-1/INSERT/estado inicial/cross-tenant ni de
políticas/grants; CI 5/5 y pgTAP 133/133; `docs/02` intacto y sin secretos. Condiciones de
seguimiento: aclarar folio/service_role y la condición `auth.uid()`/RPC en ADR-010, alinear
`docs/01` §5 en M2 y validar la ruta service_role en la primera EF; no bloquean este merge.

## Firma

`seguridad-privacidad` (08) — **APROBADO CON OBSERVACIONES** (sin veto) para
`5d84a20a9b62477e422a92240f6ccd54b5f0a7ac` del PR #26. Sin fuga de secretos/datos reales, sin
cambios de BD no migrados (`schema_migrations=20`), sin alteración de `docs/02`; observaciones
SEC-PR26-01/02 y condiciones de M2/EF registradas. Sin `git` de escritura, sin merge y sin publicar
tokens/secretos.
