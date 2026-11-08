---
id: F1-07
fase: F1
titulo: M4 — CAT 47 preguntas y EF-04 (submit + validate-r2)
owner: dev-edge-functions + dev-frontend-pwa + arquitecto-bd
estado: pendiente
prioridad: P0
deps: [F1-06]
write_scope: ["supabase/functions/ef-04-*/**", "app/**", "supabase/migrations/**", "reports/F1/F1-07_*"]
evidencia: ["reports/F1/F1-07_m4_cat.md"]
---

# F1-07 — M4 CAT y EF-04

## Objetivo

Cuestionario de Análisis Técnico de 47 preguntas (secciones A–H) con borrador offline,
envío y validación R2 (EF-04), gate F3 y notificaciones.

## Entregables

- Seed A1-v1 con las 47 preguntas oficiales (validado contra el Instructivo Anexo A).
- EF-04 `submit` y `validate-r2` con estados y errores canónicos.
- UI por secciones, autoguardado local, indicador de avance, envío.
- Evento `cat_validated`; E2E-02.

## Criterios de aceptación

- [ ] 47/47 preguntas y secciones correctas.
- [ ] Borrador offline y envío idempotente.
- [ ] Gate F3 solo con CAT validado en R2.
- [ ] E2E-02 verde.
