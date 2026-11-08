# PR #28 — Revisión de Seguridad (task-66: contrato ADR-010 y tests de gates)

- **Agente:** `seguridad-privacidad` (08) — autoridad de **veto**
- **Fecha:** 2026-11-08 13:25 (America/Mexico_City)
- **PR:** [#28](https://github.com/horaciomartinez-svg/hidria-ect/pull/28) — `chore/F1-task66-contract-align` → `main`
  («docs(f1): alinear ADR-010 y tests de gates restantes (task-66)»)
- **Head revisado:** `434089fa862da040a0c16a0b6cfc9b637d5db1c0`; base `main@057ad79`; 1 commit,
  **6 archivos, +128/−14**; CI **5/5 `success`**, **pgTAP 139/139**; clean. Autor: `arquitecto-bd`.
- **Sin migraciones nuevas**; `schema_migrations = 20`; trigger `diagnostics_update_lock` ya
  desplegado desde PR #26. Alcance: docs/01, docs/04, ADR-010, tests 050 y reportes.
- **Método:** revisión estática de docs/ADR/tests; contraste con el código real del trigger
  (`auth.uid() IS NULL`), CI y `docs/02`; secret scan. No hay cambios de producto/BD.

## Veredicto: **APROBADO CON OBSERVACIONES — SIN VETO**

Este PR **cierra las condiciones de seguridad de PR-26** sin tocar código ejecutable: el contrato
ADR-010/docs ahora refleja que la ruta válida es **`service_role`/EF** y que un **RPC `security
definer` invocado por autenticado no es válido** (conserva `auth.uid()` no nulo y el trigger lo
bloquea); añade tests versionados de folio con `service_role` y de los cinco campos de gate
restantes con autenticado, sin debilitar los positivos ni el gate de `fase_actual`. No hay
migraciones, políticas, grants ni cambios de hook/Realtime/audit; `docs/02` intacto y sin secretos.

## 1. Contrato alineado (SEC-PR26-02)

- **ADR-010** corregido: EF-01/EF-07 usan `service_role`; `auth.uid()` es NULL en ese rol; un RPC
  `security definer` invocado por `authenticated` **no** es ruta operativa en F1 (el trigger lo
  bloquea). Se elimina la promesa anterior de «RPC equivalente».
- **`docs/04` §2.5** y **`docs/01` §5** añaden la misma restricción por columna: folio inmutable,
  campos de gate/estado solo `service_role`/EF; RPC definer autenticado no válido.
- No se documentan detalles explotables (nombres de columnas ya públicos en el DDL); no hay
  secretos/PII.

## 2. Tests versionados (SEC-PR26-01/04)

`050_f1_00_security_delta.sql`: **plan 34** (28 + 6):

| Caso | Resultado | Evidencia |
|---|---|---|
| `service_role` UPDATE `folio='MDOHI-FAKE-999'` | **42501** | folio inmutable también para EF |
| `semaforo_atraso='rojo'` autenticado | **42501** | campo de gate |
| `ivoh_actual=5.0` autenticado | **42501** | campo de gate |
| `brecha_pct=10.0` autenticado | **42501** | campo de gate |
| `proximo_hito='2026-04-01'` autenticado | **42501** | campo de gate |
| `reprogramacion_justificacion='cambio'` autenticado | **42501** | campo de gate |

Se conservan los casos previos: folio autenticado 42501, combinado estado/reporte/bitácora/
avance/cat 42501, `fecha_fin` permitido, `service_role` actualizando `estado` OK y `fase_actual`
con gate F2/P0001. **No se debilitan positivos ni el gate.** CI **pgTAP 139/139**.

## 3. Sin cambios de seguridad ejecutables

| Verificación | Resultado |
|---|---|
| Migraciones nuevas | **0**; `schema_migrations=20`; trigger de PR #26 ya aplicado |
| Políticas/RLS/grants | Sin cambios en el diff |
| Hook de claims / Realtime / audit | Sin cambios |
| `docs/02` y migración base | **byte-idénticos** (SHA-256 `2A7B6F88…42CB5`) |
| Secretos/PII | secret scan **0**; fixtures sintéticos; sin credenciales |
| Alcance | 6 archivos: `docs/01`, `docs/04`, ADR-010, reporte task-59, reporte task-66, test 050; sin `app/**`, `supabase/functions/**`, migraciones ni CI |

## 4. Observaciones (no bloqueantes)

| ID | Severidad | Hallazgo | Acción |
|---|---|---|---|
| **SEC-PR28-01** | OBS (precisión documental) | ADR/docs dicen «solo `service_role`/EF»; el trigger acepta `auth.uid() IS NULL`, que también cubre `postgres`/roles de servicio/fixtures. Son roles confiables y no hay bypass para `authenticated`, pero la frase es más estricta que el código. | Aclarar en ADR/docs «roles de servicio/EF (auth.uid null)» o mantener la intención operativa; sin impacto de seguridad. |
| **SEC-PR28-02** | OBS (proceso) | La tabla de sign-off de ADR-010 registra la revisión de seguridad de **task-64** (PR #26), no la de **task-68** (este PR). | Añadir/registrar la aprobación de task-68 tras el merge o en el acta; no es un problema técnico. |
| **SEC-PR28-03** | OBS (cobertura) | Los tests de los cinco campos usan un coordinador; el trigger es independiente del rol autenticado, pero no se repiten para `equipo`/admin. | Cobertura suficiente por el diseño del trigger y el CI 139/139; opcional añadir variantes en M2. |
| **SEC-PR28-04** | OBS (ya conocida) | `service_role` puede cambiar campos de gate sin validación del trigger; la EF es responsable de sus gates. | Se mantiene la condición de no usar con datos reales hasta M2/F1-04; ya documentado en ADR-010/task-59. |

No hay hallazgos nuevos de bypass, escalada, folio mutable ni cross-tenant; no cambian políticas ni
privilegios.

## 5. Conclusión

**APROBADO CON OBSERVACIONES, SIN VETO** para `434089f` (PR #28): cierra las condiciones
SEC-PR26-01/02/04 con contrato alineado y tests versionados, sin cambios ejecutables, sin
migraciones nuevas, `docs/02` intacto y CI 5/5/pgTAP 139/139. Las observaciones son de precisión
documental/sign-off y cobertura opcional, no bloquean el merge ni M2. Queda vigente la condición
de no usar con datos reales hasta M2/F1-04 y la validación de gates por la EF.

## Firma

`seguridad-privacidad` (08) — **APROBADO CON OBSERVACIONES** (sin veto) para
`434089fa862da040a0c16a0b6cfc9b637d5db1c0` del PR #28 (task-66). Sin cambios de BD/migraciones,
sin alteración de `docs/02`, sin secretos; observaciones SEC-PR28-01/02/03/04 registradas. Sin
`git` de escritura, sin merge y sin publicar tokens/secretos.
