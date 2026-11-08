# F1 — task-66: alineación del contrato ADR-010/RPC y tests de gates restantes

- **Agente:** `arquitecto-bd` (02)
- **Fecha:** 2026-11-08 13:45 (America/Mexico_City)
- **Tarea:** `task-66` — condiciones no bloqueantes de PR #26 (task-59), antes de M2/F1-04
- **Rama:** `chore/F1-task66-contract-align`, desde `main` `057ad79`
- **ADR:** `hidria_coding_team/decisions/ADR-010-candado-update-diagnostics.md`
- **Migraciones:** ninguna nueva (el trigger de task-59 ya está desplegado); `schema_migrations = 20`
- **Alcance:** ADR/docs/tests/reportes. Sin tocar `supabase/functions/**`, `app/**` ni migraciones.

## Resultado: VERDE

Se alinea el contrato al comportamiento real del trigger y se cierran las condiciones
SEC-PR26-01/02/04 con tests versionados.

## 1. Contrato `auth.uid() is null` (SEC-PR26-02)

- El trigger `diagnostics_update_lock` permite los campos de gate/estado **solo cuando
  `auth.uid()` es NULL** (`service_role`/EF).
- Un **RPC `security definer` invocado por un usuario autenticado conserva `auth.uid()`
  no nulo** y, por tanto, el trigger lo bloquea; no es una ruta operativa en F1.
- ADR-010, `docs/04` §2.5 y el reporte task-59 se corrigen para decir «solo
  `service_role`/EF» (sin prometer RPC definer como alternativa).
- `docs/01` §5 recibe la nota de restricción por columna (F1-18).

## 2. Tests añadidos (SEC-PR26-01/04)

`050_f1_00_security_delta.sql`: **plan 34** (antes 28; +6 aserciones):

| Caso | Resultado esperado |
|---|---|
| `service_role` UPDATE `folio='MDOHI-FAKE-999'` | **42501** (folio inmutable para todos) |
| UPDATE `semaforo_atraso='rojo'` autenticado | **42501** |
| UPDATE `ivoh_actual=5.0` autenticado | **42501** |
| UPDATE `brecha_pct=10.0` autenticado | **42501** |
| UPDATE `proximo_hito='2026-04-01'` autenticado | **42501** |
| UPDATE `reprogramacion_justificacion='cambio'` autenticado | **42501** |

Se mantienen: folio autenticado 42501, combinado estado/reporte/bitácora/avance/cat 42501,
`fecha_fin` permitido y `service_role` estado permitido.

Total suite: **139 aserciones** (21+9+9+15+34+51); pglast 8.7 OK; pgTAP en CI.

## 3. Trazabilidad / aprobaciones

ADR-010 añade tabla de aprobación/sign-off (spec task-63, seguridad task-64, supervisor) y
la referencia a task-66. `docs/01` §5 y `docs/04` §2.5 quedan alineados.

## 4. Límites

- `service_role` puede cambiar los campos de gate sin que el trigger valide los gates
  internos; la EF es responsable de sus gates (SEC-PR26-04). Sin datos reales hasta
  M2/F1-04.
- Ninguna EF legítima muta `folio`; si una operación futura lo necesitara, debe abrir un
  ADR nuevo.
