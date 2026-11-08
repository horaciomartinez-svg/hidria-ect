---
id: F1-15
fase: F1
titulo: M9 mínimo — cartera de alternativas validada en R4
owner: dev-frontend-pwa
estado: pendiente
prioridad: P0
deps: [F1-04]
write_scope: ["app/**", "reports/F1/F1-15_*"]
evidencia: ["reports/F1/F1-15_m9_alternativas.md"]
---

# F1-15 — M9 mínimo: cartera de alternativas

## Objetivo

Capturar y validar en R4 la **cartera de alternativas** (`alternatives.validado_r4`) para
que `v_diagnostic_completeness.p9_alternativas` pueda satisfacerse. El Plan de Acción
avanzado (Gantt) y el reporte completo quedan en Fase 2/3.

## Entregables

- UI de alternativas (descripción, impacto, costo estimado, prioridad) y validación R4.
- Bloqueo de validación a roles autorizados; trazabilidad a la ficha R4.
- Pruebas de matriz `p9_alternativas`.

## Criterios de aceptación

- [ ] Alternativa validada en R4 → `p9_alternativas = true`.
- [ ] Sin validación → `false` y el reporte sigue bloqueado.
- [ ] Auditoría y RLS correctas.
