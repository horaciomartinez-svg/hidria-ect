---
id: F1-06
fase: F1
titulo: M3 — Checklist documental y EF-03
owner: dev-edge-functions + dev-frontend-pwa
estado: pendiente
prioridad: P0
deps: [F1-05]
write_scope: ["supabase/functions/ef-03-*/**", "app/**", "reports/F1/F1-06_*"]
evidencia: ["reports/F1/F1-06_m3_checklist.md"]
---

# F1-06 — M3 Checklist documental y EF-03

## Objetivo

Lista de cotejo fija (`No recibido → Recibido → Revisado → Validado en R1`) con EF-03
(`POST /checklist/{item_id}/transition`), TD-2, permisos por rol y bloqueo del gate M2.

## Entregables

- EF-03 completa con transiciones válidas y errores canónicos.
- UI de checklist con estados, evidencia y solicitud de faltantes.
- Evento Realtime `checklist_updated`.
- Pruebas de transición inválida y E2E-01.

## Criterios de aceptación

- [ ] Solo roles autorizados validan (empresa no valida: E2E-09).
- [ ] Gate 1→2 bloqueado hasta checklist completo + minuta R1.
- [ ] Transiciones inválidas → 409/422 canónico.
