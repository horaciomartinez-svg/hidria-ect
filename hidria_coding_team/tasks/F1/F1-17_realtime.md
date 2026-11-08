---
id: F1-17
fase: F1
titulo: Realtime — canales diagnostic/org/user (RT-01/02)
owner: dev-frontend-pwa + arquitecto-bd
estado: pendiente
prioridad: P0
deps: [F1-04]
write_scope: ["app/**", "supabase/migrations/**", "reports/F1/F1-17_*"]
evidencia: ["reports/F1/F1-17_realtime.md"]
---

# F1-17 — Realtime (Fase 1)

## Objetivo

Habilitar los canales `diagnostic:{id}`, `org:{id}` y `user:{id}` con RLS de Realtime
(RT-01/02) y publicar los eventos de `docs/04` §7 desde las EF de Fase 1.

## Entregables

- `M-05` en `F1-00`: tablas en la publicación `supabase_realtime` y políticas de canales
  privados (ningún cliente sin membresía recibe eventos).
- Suscripción en el cliente por ruta (diagnóstico/org/usuario) y refresco del Kanban.
- Eventos `phase_changed`, `checklist_updated`, `cat_validated`, `bhe_validated`,
  `logbook_closed`, `ivoh_validated` según avance F1.
- Pruebas RT-01/02 y E2E-01 con evento recibido.

## Criterios de aceptación

- [ ] RT-01: dos clientes suscritos reciben `phase_changed` con el payload de docs/04 §7.
- [ ] RT-02: cliente sin membresía no recibe eventos (RLS de Realtime).
- [ ] Sin fuga de datos entre tenants.
