---
id: F1-14
fase: F1
titulo: M7 mínimo — resultados de laboratorio con dictamen manual
owner: dev-frontend-pwa
estado: pendiente
prioridad: P0
deps: [F1-13]
write_scope: ["app/**", "reports/F1/F1-14_*"]
evidencia: ["reports/F1/F1-14_m7_laboratorio_minimo.md"]
---

# F1-14 — M7 mínimo: resultados de laboratorio

## Objetivo

Capturar resultados de laboratorio por parámetro y permitir el **dictamen manual** por el
rol autorizado, de modo que `v_diagnostic_completeness.p6_lab` (`lab_results.dictamen is
not null`) pueda satisfacerse. La automatización de EF-10 queda en Fase 2.

## Entregables

- UI de resultados (parámetro, valor, unidad, método, norma) y dictamen manual.
- Validación de roles (coordinador/equipo) y bloqueo si faltan transferencias de custodia
  cuando la regla lo exija.
- Pruebas de que `p6_lab = true` con dictamen y `false` sin él.

## Criterios de aceptación

- [ ] Dictamen manual registrado con auditoría y sin exponer datos de otros tenants.
- [ ] La matriz refleja `p6_lab` correctamente.
- [ ] No se adelanta EF-10 (sin automatización de cierre).
