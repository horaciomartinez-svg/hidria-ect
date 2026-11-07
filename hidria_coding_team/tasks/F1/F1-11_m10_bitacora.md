---
id: F1-11
fase: F1
titulo: M10 — Bitácora y EF-02 / EF-12
owner: dev-edge-functions + dev-frontend-pwa
estado: pendiente
prioridad: P0
deps: [F1-04]
write_scope: ["supabase/functions/ef-02-*/**", "supabase/functions/ef-12-*/**", "app/**", "reports/F1/F1-11_*"]
evidencia: ["reports/F1/F1-11_m10_bitacora.md"]
---

# F1-11 — M10 Bitácora y EF-02 / EF-12

## Objetivo

8 fichas V1–V3/R1–R5 con agendas y checklists precargados, evidencias foliadas, control de
cambios, cierre ≤ 24 h (EF-02), inmutabilidad y reprogramación de hitos (EF-12).

## Entregables

- UI de fichas, agenda, participantes, hallazgos, acuerdos, fotos.
- EF-02 (cierre, cierre tardío con `cerrada_razon`, change_log) y EF-12 (semáforo).
- Eventos `logbook_closed`; E2E-08 y E2E-11.
- Pruebas LB-*.

## Criterios de aceptación

- [ ] Ficha cerrada inmutable; versión anterior preservada.
- [ ] Cierre a > 24 h exige razón válida.
- [ ] Reprogramación conserva fecha original y pinta semáforo.
- [ ] E2E-08/E2E-11 verdes.
