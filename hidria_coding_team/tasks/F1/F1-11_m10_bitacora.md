---
id: F1-11
fase: F1
titulo: M10 — Bitácora y EF-02 (cierre ≤ 24 h)
owner: dev-edge-functions + dev-frontend-pwa
estado: pendiente
prioridad: P0
deps: [F1-04]
write_scope: ["supabase/functions/ef-02-*/**", "app/**", "reports/F1/F1-11_*"]
evidencia: ["reports/F1/F1-11_m10_bitacora.md"]
---

# F1-11 — M10 Bitácora y EF-02

## Objetivo

8 fichas V1–V3/R1–R5 con agendas y checklists precargados, evidencias foliadas, control de
cambios, cierre ≤ 24 h (EF-02) e inmutabilidad. La reprogramación de hitos (EF-12) es Fase 2
(ADR-003).

## Entregables

- UI de fichas, agenda, participantes, hallazgos, acuerdos, fotos.
- EF-02 (cierre, cierre tardío con `cerrada_razon`, change_log).
- Evento `logbook_closed`; E2E-08.
- Pruebas LB-*.

## Criterios de aceptación

- [ ] Ficha cerrada inmutable; versión anterior preservada.
- [ ] Cierre a > 24 h exige razón válida.
- [ ] E2E-08 verde.
