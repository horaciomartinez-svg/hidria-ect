---
id: F1-04
fase: F1
titulo: M2/M11 — Diagnósticos, gates de fase y Kanban (EF-01)
owner: dev-edge-functions + dev-frontend-pwa
estado: pendiente
prioridad: P0
deps: [F1-03]
write_scope: ["supabase/functions/ef-01-*/**", "app/**", "reports/F1/F1-04_*"]
evidencia: ["reports/F1/F1-04_m2_m11.md"]
---

# F1-04 — M2/M11 Diagnósticos y Kanban

## Objetivo

Crear y operar diagnósticos con fases S1–S6, gate `check_phase_gate`, semáforo de atraso y
Kanban por fase (M11), más EF-01 (`advance-phase`) e idempotencia.

## Entregables

- EF-01 completa (contrato `docs/04` §EF-01, TD-1, errores).
- UI de expediente y Kanban con tarjeta (fase, semana, semáforo, próximo hito, avance).
- Evento Realtime `phase_changed`.
- E2E-01 completo; pruebas de gate bloqueante.

## Criterios de aceptación

- [ ] Gate de fase aplicado en servidor (no saltable).
- [ ] EF-01 con `Idempotency-Key` y auditoría transaccional.
- [ ] Kanban refleja fase y semáforo; Realtime recibido.
- [ ] E2E-01 verde.
