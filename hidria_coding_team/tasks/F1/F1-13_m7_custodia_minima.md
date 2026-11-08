---
id: F1-13
fase: F1
titulo: M7 mínimo — muestras y 3 transferencias de custodia (captura)
owner: dev-frontend-pwa
estado: pendiente
prioridad: P0
deps: [F1-04]
write_scope: ["app/**", "reports/F1/F1-13_*"]
evidencia: ["reports/F1/F1-13_m7_custodia_minima.md"]
---

# F1-13 — M7 mínimo: muestras y 3 transferencias

## Objetivo

Permitir la captura de muestras y de las **3 transferencias de custodia** con los roles
autorizados, para que `v_diagnostic_completeness.p4_custodia` pueda satisfacerse y EF-07
(matriz 10/10) sea alcanzable en Fase 1. **No** incluye EF-10 ni el dictamen automatizado
(eso es Fase 2).

## Entregables

- UI de muestras (alta, punto de muestreo, fecha, responsable) y de transferencias
  (origen, destino, firma/registro), con RLS por membresía.
- Validación de que solo los roles autorizados firman/registran.
- Pruebas de que el conteo de 3 transferencias se refleja en la matriz y en la UI.
- Evento/registro de auditoría de cada mutación.

## Criterios de aceptación

- [ ] 3 transferencias registradas → `p4_custodia = true`.
- [ ] Roles no autorizados no pueden firmar (RLS/EF).
- [ ] No se expone `service_role`; datos sintéticos en staging.
