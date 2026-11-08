# ADR-006 — Realtime en Fase 1 y resolución de inconsistencias documentales (B4/M1/M2)

- **Estado:** aceptada (aprobada por `revisor-especificaciones` y `supervisor-hidria`; R1/R2/R3 resueltas en `8d23a1a`) 
- **Fecha:** 2026-11-08
- **Autor:** Lead, a partir de la re-revisión `f01e303` (`reports/reviews/PR-2_spec.md`)
- **Documentos afectados:** `docs/05` API-04, `docs/04` TD-4, `docs/07` §3 1.3, `TEAM.md` §13,
  `tasks/BACKLOG.md`, `tasks/F1/*`
- **Aprobación requerida:** `supervisor-hidria` + `revisor-especificaciones` (+ seguridad para grants)

## 1. Contexto

La re-revisión del PR #2 en `f01e303` cerró B1–B3 pero detectó:
- **B4:** `docs/07` §3 Fase 1.3 exige Realtime (RT-01/02) y E2E-01 depende de un evento
  Realtime; sin embargo el backlog movió Realtime a F2-06 y F1-00 no incluye `M-05`
  (publicación + políticas de canales). La BD tiene `supabase_realtime` con 0 tablas.
- **M1:** `M-05`, `M-06` y `M-08` son P0 según `reports/F1/F1-01_…contrato.md` pero no
  estaban asignadas.
- **M2:** contradicciones entre `docs/04` y `docs/05` (idempotencia, rate limit, matriz).

## 2. Decisiones

1. **Realtime es Fase 1.** Se crea `F1-17 — Realtime (canales diagnostic/org/user)` con
   dependencia `F1-04`; se elimina `F2-06`. `M-05` (añadir tablas a `supabase_realtime` +
   políticas de canales privados) entra en `F1-00`.
2. **`M-06` y `M-08` entran en `F1-00`:** RPC de rol para `service_role` (las EF no tienen
   `auth.uid()`) y función de completitud alineada a la vista. Sin ellas F1-01 y F1-12 no
   son implementables.
3. **Idempotencia (Q-01):** `Idempotency-Key` **opcional** en operaciones online y
   **obligatorio** en las que provienen de la cola offline (`docs/04` §2.3). Se corrige la
   recomendación contraria del informe F1-01.
4. **Rate limit (Q-02):** **100 req/min** (precedencia `docs/04` §8); `docs/05` API-04
   (120) se corrige en la tarea de sincronización documental `F1-18`.
5. **Matriz 10/10 (Q-03):** la definición operativa es la de `docs/02`
   (`v_diagnostic_completeness`, 10 requisitos); `docs/04` TD-4 se alineará a ella en
   `F1-18`. La semilla y la arquitectura son consistentes con la vista.
6. **Sincronización documental:** `F1-18` actualiza `docs/07` §3, `docs/01`, `docs/02`,
   `docs/04` TD-4 y `docs/05` API-04 a las decisiones ADR-003/005/006 (con revisión de
   especificaciones; las migraciones aplicadas no se editan).
7. **Cierre G0:** `reports/F0/00-supervisor_estado.md` se actualizará **después del merge**
   (PR de seguimiento) con E1–E4; mientras tanto `ADR-004` no afirma que ya esté actualizado.

## 3. Consecuencias

- G1 incluye Realtime (RT-01/02) y E2E-01 es alcanzable.
- `F1-00` crece: M-01, M-02, M-03, M-04, M-05, M-06, M-07, M-08 + grants + `security_invoker`
  + semilla + enforcement H-5.
- Una sola verdad documental tras `F1-18`; sin cambios de contrato en Fase 1.

## 4. Aprobación

| Rol | Nombre | Estado | Evidencia |
|---|---|---|---|
| Supervisor | `supervisor-hidria` | aprobado | merge de PR #2 (`1da64d0`) |
| Revisor | `revisor-especificaciones` | aprobado | re-revisión exprés `09998ef` / `8d23a1a` |
