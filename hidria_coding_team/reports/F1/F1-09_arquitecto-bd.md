# F1-09 Fase 2 — DB/RLS/RPC BHE (task-142)

- **Agente:** `arquitecto-bd` (02), coordina F1-09b (EF) / F1-09a (UI)
- **Rama:** `feat/F1-09-db-bhe`, base `main@3af51ae`
- **Migración:** `20261108120000_f1_09_bhe.sql`
- **BD:** `schema_migrations = 38`; forward-only; `docs/02` intacto.
- **PR:** #67.

## Auditoría

- `water_balances`/`balance_flows` existían con CHECK/FK, RLS por membresía y folio no aplica. Faltaban: guards de tenant/inmutabilidad, roles de flows, trigger de captura, vistas de captura y RPC de cierre/import.
- `v_bhe_monthly`/`v_bhe_summary` filtraban `validado_r3` y no restaban `circular`; `check_phase_gate` F5 solo validaba estado. Migración forward-only.

## Migración

- **Vistas** `v_bhe_monthly_capture`/`v_bhe_capture_summary` (`security_invoker=true`, SELECT authenticated, 12 filas `generate_series`, `tiene_captura`/`flujos_count`, brecha ponderada con `circular` restado, `meses_con_captura`/`captura_completa`/`tiene_datos`); `v_bhe_monthly`/`v_bhe_summary` recreadas con `security_invoker`, fórmula corregida y columnas de captura.
- **Guards** `water_balances` (org server-side desde diagnóstico, diagnostic/org inmutables, cierre R3 solo service_role, post-R3 42501) y `balance_flows` (solo coord/equipo, parent no validado, claves inmutables); trigger `borrador→en_captura`.
- **`fn_validate_bhe_r3`** service_role: rol/tenant/diagnóstico activo, `en_captura`, ficha R3 cerrada, precedencia `VALIDATION_BHE_INCOMPLETO` (422) → `GATE_BHE_BRECHA` (409, sin cambiar estado), cierre con version+1/`diagnostics.brecha_pct`/audit/idempotencia `EF-05.validate-r3`.
- **`fn_import_bhe`** service_role: documento registrado XLSX/checksum/`p_periodo_anio`, staging y rechazo total sin ≥1 fila válida, upsert/reemplazo solo captura, filas 1-based, audit/idempotencia, no valida R3.
- **Gate F5**: estado+12 meses+brecha ≤10 solo al entrar a F5 (no re-evalúa en F5→F6); F6 IVOH intacto.

## Tests

`140_f1_09_bhe.sql` **plan 28**: 12 filas, brecha ponderada/circular, ACL, brecha >10, incompleto, ficha, validación/doble validación, gate F5, RLS roles/org server-side, inmutabilidad, import (filas, replay, doc ajeno/MIME/checksum, 0 filas sin tocar balance). `090` actualizado para gate F5 con 12 meses. Total pgTAP **459** (431 + 28); BD=repo=38.

## Coordinación

- EF-05/EF-09-bhe (#68) alineadas a firmas D10/D18; `EF-05.validate-r3` como endpoint de idempotencia.
- UI (#69) lee `v_bhe_monthly_capture`/`v_bhe_capture_summary` en captura y `v_bhe_summary` post-R3; org server-side.
- `docs/02` intacto; sin `app/**`/`functions/**`.
