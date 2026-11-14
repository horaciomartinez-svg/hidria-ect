# PR #36 — QA: F1-03a DB/RLS M1 Empresas (task-80)

- **Agente:** `qa-tester` (05)
- **Fecha:** 2026-11-08 14:50 (America/Mexico_City)
- **Tarea:** `task-90` — QA PR #36 (F1-03a)
- **PR:** [#36](https://github.com/horaciomartinez-svg/hidria-ect/pull/36) — `feat/F1-03a-companies` → `main`
- **Head evaluado:** `1fdc77be3996b5a4a40b989834713b5f586c41e4` · **Base:** `main` `a0db8a1` (#32)
- **Diff:** 4 archivos, +339/−1 — migración `20261108060000`, suite `080`, `docs/01` §4.1/§5 y reporte F1-03.
- **CI:** **12/12 check runs success** (runs `43351421413` PR y `43351415061` push; 6 jobs). pgTAP **231/231**; `db reset` desde archivos.
- **BD:** `schema_migrations` = **29** (BD=repo); migración aplicada vía MCP; sin drift.

## Resultado: **VERDE** — merge permitido; F1-03a lista

> `companies.created_by` server-side, `companies_sel` con creador/ownership, `companies_upd`
> para empresa propia, `contraparte_user_id` validado por trigger y `company_in_tenant` con
> tenant del llamante. Suite `080` **plan 24**; total **231/231**; `docs/02` intacto;
> forward-only 29; alcance/seguridad correctos.

## 1. Cambio verificado

Migración `20261108060000_f1_03_companies.sql`:

| Elemento | Implementación |
|---|---|
| `created_by` | Columna nueva FK `profiles(user_id)`; trigger BEFORE INSERT/UPDATE fija `auth.uid()` en INSERT y lo declara **inmutable** en UPDATE (42501 si cambia) |
| `companies_sel` | tenant + `global_role` presente + (admin/coord **agregado**, membresía de diagnóstico, `created_by = auth.uid()`, o `empresa` con `contraparte_user_id = auth.uid()`) |
| `companies_upd` | empresa edita **su propia** ficha (contraparte); admin/coord/equipo conservan tenant; `companies_del` sin cambio (empresa no borra) |
| `contraparte_user_id` | **SEC-PR35-01**: trigger exige perfil existente, **mismo tenant** y `global_role='empresa'`; solo admin/coord puede asignarlo/cambiarlo |
| `company_in_tenant` | **SEC-PR32-06**: solo responde `true` si `p_organization_id = current_org_id()`; cross-tenant false |
| `ciclo_vida` | sin candado adicional (decisión documentada; la UI lo limita a admin/coord en #35) |
| `docs/02` | intacto |

## 2. Suite `080` y total

`080_f1_03_companies.sql` **plan 24**:

- agregado admin/coord (2 empresas del tenant; empresa de otro tenant 0);
- **equipo crea empresa → la lee** (`created_by = auth.uid()`, `companies_sel` del creador) y coordinador ve 3 tras el alta;
- creador sin membresía puede leer su fila; **empresa** ve solo la suya por `contraparte`;
- observador con membresía ve la empresa de su diagnóstico; invitado 0;
- contraparte válida (perfil empresa mismo tenant) OK; no-empresa/otro tenant → 42501; admin asigna; empresa no cambia contraparte;
- `company_in_tenant` mismo tenant true, cross-tenant false;
- empresa actualiza su ficha; no actualiza empresa ajena;
- `created_by` no manipulable; `ciclo_vida` actualizable por coordinador (sin candado, documentado).

Total: **21+9+9+15+34+51+68+24 = 231**; CI `Files=8, Tests=231` (pgTAP success). Sin regresión 010–070.

## 3. Contract, docs y alcance

- `docs/01` §4.1/§5 actualizado: ownership/creador, `companies_sel`/`upd`, contraparte; coherente con la UI de #35 (tipos/campos) y con `docs/02`.
- `docs/02` blob `a2394bce…` intacto; forward-only: solo se añade `20261108060000`; no edita migraciones previas.
- 4 archivos migración/tests/docs/reportes; sin `app/**`/`supabase/functions/**`/`.github/**`; `db reset` desde archivos verde; sin secretos/datos reales.
- El head está rebasado sobre `a0db8a1`; la diferencia de `docs/04` respecto a `origin/main` proviene de #37 (documental), no de este PR.

## 4. Observaciones no bloqueantes

- **B2 de #35:** #36 aporta el `created_by`/lectura que faltaba; al mergear ambos, #35 debe habilitar el alta para `equipo` y sustituir el E2E mock de create→read por E2E real (F1-03c/task-82). Hasta entonces, #35 mantiene alta admin/coord (más restrictiva, no bypass).
- `ciclo_vida` sin candado de transición (decisión documentada; UI limita admin/coord en #35).
- `contraparte_user_id` validado server-side; el selector de usuarios es tarea posterior.

## Dictamen

**VERDE — merge permitido.** `created_by`, `companies_sel`/`upd`, contraparte y `company_in_tenant` verificados por pgTAP **231/231**, BD=repo **29**, `docs/02` intacto, sin regresión ni secretos. F1-03a lista; el cierre funcional B2 de la UI se completa al mergear #35+#36 (F1-03c). QA no mergea; no se ejecutó git de escritura.

## Firma

QA `qa-tester`. Solo este reporte y `qa/trazabilidad.md`; sin modificar `app/**`,
`supabase/**`, `.github/**` ni `docs/**`. Sin secretos.
