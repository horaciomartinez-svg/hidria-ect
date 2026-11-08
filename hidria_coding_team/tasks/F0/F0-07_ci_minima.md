---
id: F0-07
fase: F0
titulo: CI mínima en verde (guardas + lint + typecheck + build)
owner: devops-github-cloudflare
estado: pendiente
prioridad: P0
deps: [F0-08]
write_scope: [".github/workflows/**", "scripts/ci/**", "reports/F0/F0-07_*"]
evidencia: ["reports/F0/F0-07_devops_ci.md"]
---

# F0-07 — CI mínima en verde

## Objetivo

Dejar un pipeline reproducible que valide el repositorio en cada PR: guardas de secretos,
`.env.example` sin valores, integridad `docs/02`↔migración, nomenclatura prohibida y
lint/typecheck/build del cliente.

## Pasos

1. Revisar `.github/workflows/ci.yml` del scaffold (Lead) y completar lo que falte.
2. Job `guardas`: ejecutar `bash scripts/ci/guardas.sh`:
   - `.env` no trackeado;
   - secret scan de archivos trackeados;
   - `sha256(docs/02) == sha256(migración base)`;
   - `.env.example` sin valores reales;
   - prohibición de `UAT-CIT`, `Subsecretaría de Recursos Hídricos y Desarrollo Sustentable`;
   - `supabase/.temp/` y `node_modules/` no trackeados.
3. Job `cliente`: `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build` en `app/`.
4. Push a la rama del PR; verificar checks con `mcp__github__pull_request_read`
   (`get_check_runs`) y que el workflow quede verde.
5. Documentar tiempos y cualquier *warning*.

## Criterios de aceptación

- [ ] Workflow dispara en `pull_request` hacia `main` (y `push` a `main`).
- [ ] Guardas y build en verde en el PR de Fase 0.
- [ ] Sin secretos en logs; `permissions` mínimos (contents: read).
- [ ] Reproducible desde un clon limpio.

## Evidencia esperada

`reports/F0/F0-07_devops_ci.md` con URL del run/check, conclusión y tiempos.
