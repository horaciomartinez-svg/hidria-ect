# ADR-013 — RPC transaccionales para EF-01/EF-12 (F1-04)

- **Estado:** Aceptado (decisión de Lead/revisor; implementación en PR #44, task-94)
- **Fecha:** 2026-11-13
- **Tarea:** `task-94`/`task-95` (F1-04: M2/M11 + EF-01/EF-12)
- **Dueño:** `arquitecto-bd` (DB/RPC) + `dev-edge-functions` (EF); revisión `revisor-especificaciones`; sign-off `seguridad-privacidad`

## Contexto

`docs/04` §2.6 exige que la auditoría (`audit_log`) se registre en la **misma transacción** que el cambio de estado. Con PostgREST + `service_role` no es posible agrupar `UPDATE diagnostics` + `INSERT audit_log` en una transacción; además `diagnostics_update_lock` solo permite escribir campos de gate/estado cuando `auth.uid() is null` (ruta EF/`service_role`), y `check_phase_gate` es la autoridad final del gate.

## Decisión

1. **RPC transaccionales `SECURITY DEFINER`** `fn_advance_phase(...)` y `fn_reprogram_milestone(...)`, con `search_path` fijo y `EXECUTE` **solo `service_role`** (`REVOKE` de `public`/`anon`/`authenticated`). La EF autentica al usuario (JWT, `verifyProfile`, `nbf` numérico), valida rol/tenant/membresía y llama a la RPC con `p_user_id`.
2. **Atomicidad:** `UPDATE diagnostics` + `audit_log` + `api_idempotency` (y `milestone_reprogramming` en EF-12) en una sola transacción; replay mismo hash devuelve `replayed:true` sin efectos; hash distinto → `CONFLICT_STATE`.
3. **Gates:** `check_phase_gate` y `diagnostics_update_lock` siguen siendo la **autoridad final**. `p_gate` es cálculo de la EF para auditoría/respuesta, **no autoriza**; la ficha cerrada/folio se revalida en DB (`1→R1, 2→R2, 3→V1, 4→R3, 5→R4`).
4. **`proximo_hito`:** mapa fijo `2→R2, 3→V1, 4→R3, 5→R4, 6→R5`; no se calculan fechas desde `fecha_inicio`. EF-01 desde fase 6 → `CONFLICT_PHASE`.
5. **TD-1:** la fila 6 (`estado→reportado`) pertenece a **EF-07**, no a EF-01.
6. **`milestone_reprogramming`:** historial (`fecha_original`, `fecha_nueva`, causa, justificación, reprogramado_por); RLS de **solo SELECT por membresía**, sin DML authenticated; escritura solo por RPC. `fecha_original` se valida contra la última `fecha_nueva` **del mismo hito** (primera reprogramación declarada). Semáforo: 1 reprogramación del hito causa `empresa` → amarillo; **2+ del mismo hito** → rojo; vencido sin cerrar es tarea aparte.
7. **Alcance F1:** EF-01 entrega transiciones **1→2 y 2→3 reales**; **3→4+ validadas con fixtures/contrato** hasta **F2-06 (M5/IIH)**. No se declara F1 como flujo completo a F6.
8. **Rate limit:** `RATE_LIMIT` (429) documentado como follow-up (`api_rate_limit`), fuera de F1-04.
9. **Errores canónicos:** `CONFLICT_PHASE`/`CONFLICT_STATE` (409; state con `details.estado_actual`), `VALIDATION_REPROGRAMACION`/`VALIDATION_HITO_SIN_FICHA` (422), `GATE_*` (409), `RATE_LIMIT` (429).
10. **Realtime/notificaciones:** post-commit desde la EF (`phase_changed`, `kanban_refresh`, notificación `kind='hito'`); si falla el broadcast no se revierte la transacción; replay no emite.

## Consecuencias

- El cliente **no** ejecuta las RPC; solo la EF con `service_role`.
- No se expone `milestone_reprogramming` para DML; lectura por membresía.
- Sin `docs/02` ni datos reales; migración forward-only `20261108070000` (BD 30).
- Tests pgTAP de gates/roles/tenant/cross-tenant/replay/reprogramación y tests Deno de contrato EF.

## Aprobaciones / sign-off

| Rol | Agente | Fecha | Veredicto |
|---|---|---|---|
| Revisor de especificaciones | `revisor-especificaciones` | 2026-11-13 | Decisiones vinculantes F1-04 aprobadas (TD-1 fila 6→EF-07, `proximo_hito`, RPC) |
| Seguridad y privacidad | `seguridad-privacidad` | 2026-11-13 | Pendiente sign-off del delta #44 |
| Lead | `lead` | 2026-11-13 | Aprueba RPC service_role-only y alcance F1 (1→3 reales, F4–F6 fixtures) |

## Referencias

- `docs/01` §4.2.1/§5; `docs/04` §4 (EF-01, EF-12), TD-1, §8.
- `docs/02` (sin cambios); `reports/F1/F1-04_arquitecto-bd.md`; PR #44.
- `supabase/migrations/20261108070000_f1_04_rpc_ef01_ef12.sql`.
