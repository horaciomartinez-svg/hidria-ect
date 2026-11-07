---
id: F1-03
fase: F1
titulo: M1 — Registro de empresas
owner: dev-frontend-pwa
estado: pendiente
prioridad: P1
deps: [F1-02]
write_scope: ["app/**", "reports/F1/F1-03_*"]
evidencia: ["reports/F1/F1-03_m1_empresas.md"]
---

# F1-03 — M1 Registro de empresas

## Objetivo

Alta, edición y consulta de empresas atendidas (razón social, planta, giro, municipio,
organismo operador, contacto, ciclo de vida) con `organization_id` y RLS.

## Entregables

- Formulario con validación (RFC/ID, contacto, NDA `restringido_nda`).
- Listado con búsqueda/filtros y detalle.
- Pruebas E2E-01 (alta de empresa) y unitarias de validación.

## Criterios de aceptación

- [ ] CRUD contra Supabase con RLS (tenant).
- [ ] Datos sintéticos en staging; clasificación correcta.
- [ ] Validaciones y errores canónicos.
- [ ] E2E-01 parcial en verde.
