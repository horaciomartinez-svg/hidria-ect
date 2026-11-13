# PR #28 — QA: task-66 (contrato ADR-010/RPC + tests de gates restantes)

- **Agente:** `qa-tester` (05)
- **Fecha:** 2026-11-08 14:00 (America/Mexico_City)
- **Tarea:** `task-69` — QA PR #28 (task-66)
- **PR:** [#28](https://github.com/horaciomartinez-svg/hidria-ect/pull/28) — `chore/F1-task66-contract-align` → `main`
- **Head evaluado:** `434089fa862da040a0c16a0b6cfc9b637d5db1c0` · **Base:** `main` `057ad79`
- **Diff:** 6 archivos, +128/−14 — `docs/01` §5, `docs/04` §2.5, ADR-010, reportes F1-00 y suite `050`. **Sin migraciones nuevas** (`schema_migrations`=20).
- **CI:** **10/10 check runs success** en `434089f` (runs `42516247234` pull_request y `42516233947` push; Guardas, Cliente, Deno, **pgTAP**, **E2E**); pgTAP **6 suites / 139 PASS** (`Files=6, Tests=139`).

## Resultado: **VERDE** — merge permitido; task-66 cerrada

> Se cumplen las condiciones no bloqueantes de PR #26/task-59: contrato del trigger
> alineado (`auth.uid() is null` ⇒ solo `service_role`/EF; RPC `security definer`
> autenticado **no** es ruta válida), tests versionados de folio con `service_role` y de
> los 5 campos de gate restantes, sign-off en ADR-010 y notas en `docs/01` §5/`docs/04`
> §2.5. Suites **139/139**, sin migraciones nuevas, `docs/02` intacto, alcance/secretos
> correctos.

## 1. Condiciones task-66 verificadas

| Condición | Evidencia |
|---|---|
| **Contrato RPC/EF vs trigger (SEC-PR26-02)** | ADR-010, `docs/04` §2.5 y reporte task-59 corregidos: solo `service_role`/EF; un RPC `security definer` autenticado conserva `auth.uid()` no nulo y el trigger lo bloquea; no se documenta como alternativa operativa |
| **Tests faltantes (SEC-PR26-01/04)** | `050` +6: folio con `service_role` → 42501; `semaforo_atraso`, `ivoh_actual`, `brecha_pct`, `proximo_hito`, `reprogramacion_justificacion` autenticados → 42501 cada uno; se conservan folio autenticado/combinado/`fecha_fin`/`service_role` estado |
| **Trazabilidad/sign-off ADR-010** | ADR-010 añade tabla de aprobación (revisor/spec `task-63`, seguridad `task-64`, supervisor) y referencia task-66; `docs/01` §5 nota de restricción por columna (F1-18); `docs/04` §2.5 alineado |
| **SEC-PR26-01** | Folio inmutable **también para `service_role`** (el trigger compara `folio` antes de `auth.uid()`); test versionado |
| **SEC-PR26-04** | `service_role` puede actualizar gate fields sin validación de gates en el trigger (responsabilidad de la EF); documentado; sin datos reales hasta M2/F1-04 |

## 2. Suite `050` — plan vs aserciones

| Caso nuevo | Esperado |
|---|---|
| `service_role` UPDATE `folio='MDOHI-FAKE-999'` | 42501 |
| UPDATE `semaforo_atraso='rojo'` autenticado | 42501 |
| UPDATE `ivoh_actual=5.0` autenticado | 42501 |
| UPDATE `brecha_pct=10.0` autenticado | 42501 |
| UPDATE `proximo_hito='2026-04-01'` autenticado | 42501 |
| UPDATE `reprogramacion_justificacion='cambio'` autenticado | 42501 |

`plan(34)`; total **21+9+9+15+34+51 = 139**, coincide con CI (`Files=6, Tests=139`).
Sin regresión 010–060: replay limpio de CI verde. Se mantienen los positivos de RES-1,
`fecha_fin` permitido, `service_role` estado permitido y `UPDATE fase_actual=6` → gate
F2/P0001.

## 3. BD, alcance y secretos

| Comprobación | Resultado |
|---|---|
| Migraciones | **20** (`schema_migrations`, sin nuevas; forward-only; ninguna previa editada) |
| `docs/02` | Blob `a2394bce…` idéntico a la base |
| Alcance | 6 archivos: `docs/01`, `docs/04`, ADR-010, 2 reportes F1-00, suite `050`; **sin** `app/**`, `supabase/functions/**`, `.github/**`, migraciones ni `docs/02` |
| Secretos | Secret scan del árbol sin coincidencias; `.env` ausente |

## 4. Trazabilidad

- **task-66 cerrada**: condiciones de PR #26 atendidas y verificadas.
- `qa/trazabilidad.md`: evidencia F1-00 task-59/66 actualizada a **20 migraciones / 139
  aserciones**; task-66 cerrada; notas pre-M2 (EF responsable de gates internos, sin datos
  reales hasta M2/F1-04).
- Sin verdes de reglas de producto R-*: sigue siendo evidencia de capa BD, no de casos
  `docs/05` ni de flujos EF/UI.

## Dictamen

**VERDE — merge permitido.** Condiciones task-66 cumplidas: contrato alineado, tests de
folio/service_role y gates restantes versionados, sign-off ADR-010 y docs coherentes;
suites **139/139** en CI, 20 migraciones, `docs/02` intacto, alcance/secretos correctos.
QA no mergea; no se ejecutó git de escritura.

## Firma

QA `qa-tester`. Solo este reporte y `qa/trazabilidad.md`; sin modificar `app/**`,
`supabase/**`, `.github/**` ni `docs/**`. Sin secretos.
