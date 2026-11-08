# PR #26 — QA: candado de UPDATE de `diagnostics` + folio inmutable (task-59)

- **Agente:** `qa-tester` (05)
- **Fecha:** 2026-11-08 13:55 (America/Mexico_City)
- **Tarea:** `task-65` — QA PR #26 (task-59)
- **PR:** [#26](https://github.com/horaciomartinez-svg/hidria-ect/pull/26) — `fix/F1-task59-update-lock` → `main`
- **Head evaluado:** `5d84a20a9b62477e422a92240f6ccd54b5f0a7ac` · **Base:** `main` `8e4e258`
- **Diff:** 6 archivos, +223/−13 — migración `20261108040000`, suite `050`, `docs/04` §2.5, ADR-010 y reportes F1-00.
- **CI:** **10/10 check runs success** en `5d84a20` (runs `42515152096` pull_request y `42515136929` push; 5 jobs cada uno: Guardas, Cliente, Deno, **pgTAP**, **E2E Playwright**); job pgTAP success (**6 suites / 133 PASS**, `Files=6, Tests=133`).

## Resultado: **VERDE** — merge permitido; task-59 cerrada

> El residual B2 de PR #19 queda cerrado: **folio inmutable en UPDATE** y campos de
> gate/estado bloqueados para `authenticated`, solo `service_role`/EF; `fase_actual`
> sigue por `diagnostics_phase_gate`; INSERT RES-1 intacto. Suites **133/133**, docs/02
> intacto, 20 migraciones forward-only, alcance/secretos correctos.

## 1. Cambio verificado

Migración `supabase/migrations/20261108040000_f1_00_task59_update_lock.sql`:

- **Trigger `diagnostics_update_lock` (BEFORE UPDATE)**:
  - `new.folio is distinct from old.folio` → **42501** para **todos** los roles.
  - Si `auth.uid() is not null`, bloquea cambios de `estado`, `reporte_document_id`,
    `bitacora_cerrada`, `avance_pct`, `cat_estado`, `semaforo_atraso`, `ivoh_actual`,
    `brecha_pct`, `proximo_hito`, `reprogramacion_justificacion` → **42501**.
  - `service_role`/fixtures (`auth.uid()` NULL) pueden actualizar esos campos; las EF
    (`EF-01 advance-phase`, `EF-07 emit-report`) operan con `service_role`/RPC.
  - `fase_actual` **no se duplica**: sigue validada por `diagnostics_phase_gate`
    (`P0001`, Gate F2).
  - Campos no-gate (`fecha_fin`) siguen permitidos por `diagnostics_upd`.
- `docs/04` §2.5 documenta folio inmutable y campos de gate solo vía EF.
- `reports/F1/F1-00_res1_fixes.md` corregido: «folio server-side **en INSERT**; UPDATE
  cerrado por task-59», con referencia al test y `schema_migrations=20`.
- `ADR-010-candado-update-diagnostics.md` documenta la decisión y el residual de
  `docs/01` §5; `reports/F1/F1-00_task59_update_lock.md` es la evidencia del autor.

## 2. Suite pgTAP — plan vs aserciones

| Suite | Plan | Cambio |
|---|---:|---|
| `010_f1_00_grants_views.sql` | 21 | sin cambios |
| `020_f1_00_idempotency_audit.sql` | 9 | sin cambios |
| `030_f1_00_folio_bhe_completeness.sql` | 9 | sin cambios |
| `040_f1_00_enforcement_realtime.sql` | 15 | sin cambios |
| `050_f1_00_security_delta.sql` | **28** | +4: folio UPDATE → 42501; estado/reporte/bitácora/avance/cat combinados → 42501; `fecha_fin` → OK; `service_role` estado → OK |
| `060_f1_01a_auth_claims.sql` | 51 | sin cambios |
| **Total** | **133** | `21+9+9+15+28+51`; CI **6/6 suites, 133/133 PASS** |

La suite `050` conserva los casos de RES-1 (positivos coordinador/equipo, estado inicial
inyectado → 42501, folio inyectado sobrescrito, empresa/admin/invitado/observador,
cross-tenant, UPDATE fase 6 → gate F2/P0001, UPDATE/DELETE y perfiles admin) y añade los
4 casos del candado. No hay regresión de `010`–`060`: el replay limpio de CI pasa.

## 3. BD, migraciones y alcance

| Comprobación | Resultado |
|---|---|
| Migraciones | **20** (`schema_migrations`: count=20, max `20261108192524`) |
| Forward-only | ✓ solo se **añade** `20261108040000`; ninguna migración previa editada |
| `docs/02` | Blob `a2394bce…` idéntico a la base |
| Alcance | 6 archivos: migración, suite 050, `docs/04` §2.5, ADR-010 y 2 reportes F1-00; **sin** `app/**`, `supabase/functions/**`, `.github/**`, `docs/02` |
| Secretos | Secret scan del árbol sin coincidencias; `.env` no incluido |
| CI | 10/10 check runs success (5 jobs × pull_request/push), pgTAP **133/133** |

## 4. Trazabilidad

- **task-59 cerrada**: B2 de PR #19 resuelto (folio inmutable en UPDATE + candado de
  estado/gate); residuales de `docs/01` §5 anotados en ADR-010.
- `qa/trazabilidad.md`: evidencia F1-00 RES-1 actualizada a **20 migraciones / 133
  aserciones**, task-59 como cerrada. **No** se marca ninguna regla de producto R-* en
  verde: sigue siendo evidencia de capa BD (no ejecución de casos `docs/05`).
- Sin verdes funcionales de UI/EF; la ruta legítima EF-01/EF-07 queda para M2/EF.

## 5. Condiciones no bloqueantes — task-66 (antes de M2/F1-04)

Spec (task-63) y seguridad (task-64) aprobaron sin veto y trazaron las siguientes
condiciones **no bloqueantes** en **task-66**; no cambian el dictamen de #26:

1. **Contrato RPC/EF vs trigger:** ADR-010/reporte mencionan «RPC security definer»; el
   trigger discrimina por `auth.uid() is null`, por lo que un RPC `SECURITY DEFINER`
   invocado por `authenticated` conservaría `auth.uid()` y sería bloqueado. Alinear la
   documentación a «solo `service_role`/EF» o implementar/probar un mecanismo RPC explícito.
2. **Tests faltantes:** folio con `service_role` (invariante «folio inmutable para todos»)
   y campos de gate restantes (`semaforo_atraso`, `ivoh_actual`, `brecha_pct`,
   `proximo_hito`, `reprogramacion_justificacion`) además del combinado; mantener plan ≥28.
3. **Trazabilidad ADR-010:** tabla de aprobación/sign-off (revisor/seguridad/supervisor) y
   nota en `docs/01` §5/F1-18; `docs/04` §2.5 alineado con «solo service_role».
4. **SEC-PR26-01/04:** confirmar/documentar folio inmutable también para `service_role`
   (opción implementada) y que `service_role` puede cambiar gate fields sin validación en
   el trigger (responsabilidad de la EF; sin datos reales hasta M2).

## Dictamen

**VERDE — merge permitido.** Candado de UPDATE y folio inmutable verificados por pgTAP en
CI (6 suites / 133/133), 20 migraciones forward-only, `docs/02` intacto, alcance/secretos
correctos y sin regresión. Task-59 queda cerrada; el residual de `docs/01` §5 está
documentado en ADR-010. QA no mergea; no se ejecutó git de escritura.

## Firma

QA `qa-tester`. Solo este reporte y `qa/trazabilidad.md`; sin modificar `app/**`,
`supabase/**`, `.github/**` ni `docs/**`. Sin secretos.
