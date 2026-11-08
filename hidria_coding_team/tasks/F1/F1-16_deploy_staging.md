---
id: F1-16
fase: F1
titulo: Deploy a staging (Pages + Supabase + R2) y verificación
owner: devops-github-cloudflare + qa-tester
estado: pendiente
prioridad: P1
deps: [F1-12]
write_scope: [".github/workflows/**", "infra/**", "reports/deploy/**", "reports/qa/F1-16_*"]
evidencia: ["reports/deploy/staging-<fecha>-<sha>.md", "reports/qa/F1-16_deploy.md"]
---

# F1-16 — Deploy a staging y verificación

## Objetivo

Desplegar el MVP de Fase 1 a staging de forma reproducible (Pages + migraciones Supabase +
R2), con URL, versión y smoke de QA. Sustituye el deploy manual de Fase 0.

## Entregables

- Workflow de deploy (Pages `hidria-staging`, build de `app/`) disparado por CI.
- Aplicación de migraciones pendientes a staging (nunca reaplicar las ya aplicadas).
- Configuración de secretos de EF (`supabase secrets set`) cuando existan.
- Smoke/E2E de staging (E2E-01…E2E-07 aplicables) y URL publicada.

## Criterios de aceptación

- [ ] URL `https://hidria-staging.pages.dev` con la versión del commit desplegado.
- [ ] Migraciones al día y sin drift.
- [ ] Smoke de QA verde; rollback documentado.
- [ ] Sin secretos en logs; `service_role` fuera del cliente.
