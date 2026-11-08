---
id: F1-12
fase: F1
titulo: M9 — Reporte esencial y EF-07 (matriz 10/10, folio -R1)
owner: dev-edge-functions + dev-frontend-pwa
estado: pendiente
prioridad: P0
deps: [F1-10, F1-11, F1-13, F1-14, F1-15]
write_scope: ["supabase/functions/ef-07-*/**", "app/**", "reports/F1/F1-12_*"]
evidencia: ["reports/F1/F1-12_m9_reporte.md"]
---

# F1-12 — M9 Reporte esencial y EF-07

## Objetivo

Emisión del Reporte de Diagnóstico **en versión esencial** para el piloto: matriz de
completitud 10/10 (`v_diagnostic_completeness`), PDF a R2, folio `{folio_diagnostico}-R1`,
estado `reportado` y notificación a la Triple Hélice. Requiere los prerrequisitos mínimos
de la matriz (F1-13 custodia, F1-14 laboratorio, F1-15 alternativas). Las capacidades
avanzadas de M9 (Gantt detallado, redacción asistida completa) quedan para Fase 3.

## Entregables

- UI de pestaña Reporte con matriz 10/10 y lista de faltantes.
- EF-07: gate, generación de PDF, folio server-side, versión.
- E2E-06 (bloqueado 9/10) y E2E-07 (emitido).
- Pruebas RPT-*.

## Criterios de aceptación

- [ ] 9/10 → emisión bloqueada con lista de requisitos.
- [ ] 10/10 → PDF descargable por URL prefirmada, folio `-R1`, estado `reportado`.
- [ ] Corrección posterior genera nueva versión (nunca sobrescribe).
- [ ] E2E-06/E2E-07 verdes.
