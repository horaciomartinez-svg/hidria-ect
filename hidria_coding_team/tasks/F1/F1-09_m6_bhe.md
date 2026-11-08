---
id: F1-09
fase: F1
titulo: M6 — BHE, EF-05 (brecha > 10 %) y EF-09 (kind='bhe')
owner: dev-edge-functions + dev-frontend-pwa
estado: pendiente
prioridad: P0
deps: [F1-08]
write_scope: ["supabase/functions/ef-05-*/**", "supabase/functions/ef-09-*/**", "app/**", "reports/F1/F1-09_*"]
evidencia: ["reports/F1/F1-09_m6_bhe.md"]
---

# F1-09 — M6 BHE y EF-05

## Objetivo

Balance Hídrico Enriquecido de 12 meses (flujos, calidad, indicadores, brecha) con
validación R3 (EF-05). Regla dura: brecha mensual **> 10 %** bloquea la validación con
409 canónico; no es advertencia.

## Entregables

- UI de captura/importación BHE y tablero mensual (`v_bhe_monthly`).
- EF-09 `kind='bhe'` (importación XLSX del BHE, XLS-01/02; nunca valida R3).
- EF-05 con pre-chequeo, mensaje canónico y bloqueo.
- Referencia a bitácora R3 y avance de fase.
- E2E-03 (bloquea y se corrige) + pruebas BHE-*.

## Criterios de aceptación

- [ ] Brecha > 10 % → 409 y fase no avanza; corregida → revalidación exitosa.
- [ ] Diciembre/cierre anual y unidades correctas.
- [ ] Auditoría y evento `bhe_validated`.
- [ ] E2E-03 verde.
