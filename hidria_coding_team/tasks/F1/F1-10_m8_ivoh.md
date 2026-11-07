---
id: F1-10
fase: F1
titulo: M8 — IVOH y EF-06 (fórmula, semáforo, validación R4)
owner: dev-edge-functions + dev-frontend-pwa
estado: pendiente
prioridad: P0
deps: [F1-09]
write_scope: ["supabase/functions/ef-06-*/**", "app/**", "reports/F1/F1-10_*"]
evidencia: ["reports/F1/F1-10_m8_ivoh.md"]
---

# F1-10 — M8 IVOH y EF-06

## Objetivo

Motor IVOH: fichas por factor con evidencia, cálculo server-side
`0.15·F1+0.20·F2+0.20·F3+0.20·F4+0.15·F5+0.10·F6`, semáforo `<5` rojo / `5–7.9` amarillo /
`≥8` verde, radial y validación R4 (EF-06). Requiere BHE validado R3
(`trg_ivoh_requires_bhe`).

## Entregables

- UI de calificación por factor con evidencia sugerida y rúbrica.
- EF-06 `score` y `validate-r4` con versión inmutable.
- Gráfica radial (6 ejes) y semáforo.
- E2E-05 + pruebas IVOH-*.

## Criterios de aceptación

- [ ] Cálculo idéntico a `v_ivoh_score` (tolerancia 0.01).
- [ ] Semáforo exacto en fronteras (4.99/5.00/7.90/7.99/8.00).
- [ ] Sin BHE validado → 409; evaluación validada inmutable.
- [ ] E2E-05 verde.
