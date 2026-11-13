# ADR-013 — EF-01/EF-12: RPC transaccional `service_role`-only, gates TD-1 y reprogramación de hitos

- **Estado:** propuesta (requiere aprobación de `revisor-especificaciones` y visto bueno de `seguridad-privacidad`; supervisor aprobó el diseño B el 2026-11-12)
- **Fecha:** 2026-11-12
- **Autor:** `dev-edge-functions` (task-95 / F1-04)
- **Aprobado por:** `supervisor-hidria` (diseño B aprobado con condiciones) + revisor + seguridad (pendiente formal)
- **Documentos:** `docs/04` §4 (EF-01, EF-12), §5 (TD-1), §7 (Realtime), §8 (errores); `docs/01` §5 (RLS/columnas); `docs/05` PG-01/02/09/10/11/12
- **Tareas:** `task-95` (EF-01/EF-12), `task-94` (RPC/migración, arquitecto-bd), `task-86` (register EF-08, después)

## Contexto

F1-04 implementa el primer EF real de fase con roles. Restricciones vigentes:

- `diagnostics_update_lock` (task-59, ADR-010) solo permite actualizar campos de gate/estado
  (`fase_actual`, `avance_pct`, `estado`, `proximo_hito`, `semaforo_atraso`, etc.) con
  `service_role` (`auth.uid()` NULL); un RPC `SECURITY DEFINER` invocado por un usuario
  autenticado conserva `auth.uid()` no nulo y el trigger lo bloquea.
- `diagnostics_phase_gate` (trigger BEFORE UPDATE) impone los gates F2–F6 con `P0001 Gate Fx…` y
  es la autoridad final; no conoce `to_phase = origen+1`, rol ni `estado='activo'`.
- `docs/04` §2.6 exige que `audit_log` se escriba en la **misma transacción** que el cambio de
  negocio. Con PostgREST cada llamada es una transacción independiente ⇒ UPDATE + audit no
  pueden agruparse sin RPC o conexión Postgres directa.
- `fn_diag_role` y `api_idempotency` existen (M-01/M-06) y son de `service_role`.
- Las operaciones de gate **no van offline** (docs/04 §2.3/§6): `Idempotency-Key` opcional online.

## Decisión

1. **RPC transaccionales `service_role`-only.** `fn_advance_phase(...)` y
   `fn_reprogram_milestone(...)`: `SECURITY DEFINER`, `search_path=public,pg_temp`,
   `REVOKE ALL … FROM public,anon,authenticated`, `GRANT EXECUTE … TO service_role`. En una sola
   transacción: revalidar defensa (rol/to_phase/estado/ficha), `UPDATE diagnostics`,
   `fn_audit_write`, idempotencia con `api_idempotency` (claim/replay/conflicto) y persistir
   `status_code`/`response_body`/`response_ref`. La EF las invoca con `service_role`.
2. **La EF mantiene la autoridad de contrato.** Auth/claims (`verifyProfile`, `nbf` numérico
   estricto), rol de contrato, tenant/membresía, validación de body, **replicación de gates TD-1**
   (filas 1–5) y ficha de respaldo, mapeo de errores y post-commit. `p_gate` lo calcula **solo la
   EF** (nunca el cliente); la RPC no lo usa para autorizar.
3. **EF-01 (`advance-phase`)**: roles `coordinador|equipo` con membresía, **sin bypass admin**;
   tenant fail-closed; `estado='activo'` (si no ⇒ `409 CONFLICT_STATE` con `details.estado_actual`);
   `to_phase` entero 2..6 (`422 VALIDATION_PHASE_TRANSICION` si malformado) y `= fase_actual+1`
   (si no ⇒ `409 CONFLICT_PHASE`); desde fase 6 ⇒ `409 CONFLICT_PHASE` (TD-1 fila 6 es **EF-07**:
   `estado→reportado`).
4. **Gates TD-1 (filas 1–5) replicados con mensajes canónicos** (`Gate F2…F6`) y **ficha de
   respaldo cerrada** (BIT-R1/R2/V1/R3/R4); si falta o está abierta, el mismo `GATE_*` con
   `details: { reason: "ficha", ficha_clave }`. La respuesta 200 incluye
   `gate.folio_respaldo` (folio `BIT-…`). El trigger sigue siendo la autoridad final: si aborta
   (`P0001`), la EF mapea a `GATE_*` (carrera entre pre-check y escritura).
5. **`proximo_hito`:** mapa `2→R2, 3→V1, 4→R3, 5→R4, 6→R5` (decisión del revisor; **no** `3→V2`);
   formato `"<clave> · YYYY-MM-DD"` **solo** si hay fecha canónica; no se calcula desde
   `fecha_inicio`.
6. **EF-12 (`reprogram-milestone`)**: solo `coordinador`; hito V1–V3/R1–R5; fechas ISO;
   `justificacion ≥ 20`; `causa ∈ {empresa,equipo,externa}`; `fecha_nueva ≥ fecha_original` y
   dentro de las 6 semanas desde `fecha_inicio`; **ficha más reciente** con `clave = hito` (si no
   existe ⇒ `422 VALIDATION_HITO_SIN_FICHA`). La RPC inserta el hallazgo en la ficha, actualiza
   `proximo_hito`/`semaforo_atraso`/`reprogramacion_justificacion` y audita. Semáforo: 1.ª
   reprogramación con `causa='empresa'` ⇒ `amarillo`; `≥2` reprogramaciones ⇒ `rojo` (historial
   `milestone_reprogramming`, task-94); «vencido sin cerrar» es tarea aparte.
7. **Idempotencia atómica (ADR-006, M-01).** `Idempotency-Key` opcional (los gates no van
   offline); la RPC persiste en `api_idempotency` en la misma transacción: misma clave + mismo
   `request_hash` ⇒ `200` con el cuerpo original **sin** notificación ni evento; misma clave +
   payload distinto ⇒ `409 CONFLICT_STATE`. No se usa `audit_log.meta` para deduplicar.
8. **Efectos post-commit best-effort.** EF-01: notificación `kind='hito'` a miembros + broadcast
   `phase_changed` (`diagnostic:{id}`) y `kanban_refresh` (`org:{id}`). EF-12: `kanban_refresh`
   (no define notificación en el contrato). Un fallo de Realtime/notificación **no revierte** el
   negocio ya auditado (`broadcast` devuelve `false` y se ignora).
9. **Códigos nuevos en el catálogo (`docs/04` §8):** `VALIDATION_PHASE_TRANSICION` (422),
   `VALIDATION_HITO_SIN_FICHA` (422); se reutilizan `CONFLICT_PHASE`/`CONFLICT_STATE`/`GATE_*`.
   `RATE_LIMIT` (429) sigue en el catálogo pero el objeto DB no existe: **follow-up** (no se
   implementa en F1-04).
10. **Alcance F1 (Lead):** fases **1→2 y 2→3 reales**; F4–F6 se prueban con **fixtures/contrato**
    (el gate F4 depende de M5/IIH, movido a F2-06). La fase 4 real queda para F2-06.

## Alternativas descartadas

1. **PostgREST + `service_role` con varias llamadas:** rechazada — rompe la atomicidad
   `UPDATE`+`audit_log` de `docs/04` §2.6.
2. **Conexión Postgres directa desde la EF** (driver + `SUPABASE_DB_URL`): rechazada por
   operación/dependencia; la RPC concentra la transacción en la DB (scope del arquitecto).
3. **RPC `SECURITY DEFINER` invocable por `authenticated`:** rechazada — `diagnostics_update_lock`
   la bloquea (`auth.uid()` no nulo).
4. **`p_gate` enviado por el cliente:** rechazada — el cliente podría declarar gates cumplidos.
5. **Confiar solo en el trigger:** rechazada — no valida ficha de respaldo ni produce mensajes
   de contrato antes de la escritura; la EF replica TD-1 y el trigger queda como última defensa.
6. **TTL/«vencido sin cerrar» en EF-12:** fuera de alcance (job/tarea aparte); se documenta el gap.

## Consecuencias

- `task-94` (arquitecto-bd) debe entregar las 2 RPC + tabla `milestone_reprogramming` + pgTAP;
  hasta entonces las pruebas Deno usan un cliente/RPC inyectado (contrato congelado en este ADR).
- Sin migraciones nuevas por parte del equipo EF; `docs/**` se actualiza vía Lead/revisor
  (propuesta de texto entregada al supervisor).
- 45 pruebas Deno nuevas (146 totales) cubren roles, tenant, to_phase, gates TD-1, ficha,
  ventana de 6 semanas, idempotencia replay/conflicto, errores y efectos post-commit.
- Riesgo declarado: gate F4/IIH (M5 en F2-06); rate limit follow-up; F4–F6 solo con fixtures en
  F1.

## Aprobación

| Rol | Nombre | Estado | Evidencia |
|---|---|---|---|
| Supervisor | `supervisor-hidria` | aprobado (B con condiciones) | mensaje 2026-11-12 |
| Revisor | `revisor-especificaciones` | pendiente | decisiones vinculantes enviadas por Lead |
| Seguridad | `seguridad-privacidad` | pendiente | revisión del PR |
