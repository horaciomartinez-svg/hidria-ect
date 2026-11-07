---
id: F1-08
fase: F1
titulo: M5 — IIH y EF-09 (importador XLSX)
owner: dev-edge-functions + dev-frontend-pwa
estado: pendiente
prioridad: P1
deps: [F1-04]
write_scope: ["supabase/functions/ef-09-*/**", "app/**", "reports/F1/F1-08_*"]
evidencia: ["reports/F1/F1-08_m5_iih.md"]
---

# F1-08 — M5 IIH y EF-09

## Objetivo

Inventario de Infraestructura Hidráulica (activos `USO-nn`, etapas, tipos) con captura
manual e importación XLSX validada (EF-09), auditoría de mapeo y verificación en V1.

## Entregables

- UI IIH (alta/edición/verificación) con folios de evidencia.
- EF-09 para IIH (mapeo, errores canónicos, nunca valida el gate).
- Importador con vista previa y reporte de filas rechazadas.
- Pruebas XLS-* y unitarias de parser.

## Criterios de aceptación

- [ ] Mapeo auditado en `audit_log.meta`.
- [ ] Filas inválidas no rompen la transacción completa (reporte por fila).
- [ ] Gate V1 no se salta.
