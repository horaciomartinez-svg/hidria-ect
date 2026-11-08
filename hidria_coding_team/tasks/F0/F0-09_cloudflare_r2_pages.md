---
id: F0-09
fase: F0
titulo: Cloudflare — R2 (hidria-docs, hidria-reports) y Pages
owner: devops-github-cloudflare
estado: pendiente
prioridad: P0
deps: [F0-01]
write_scope: ["infra/**", "reports/F0/F0-09_*"]
evidencia: ["reports/F0/F0-09_devops_cloudflare.md"]
---

# F0-09 — Cloudflare: R2 y Pages

## Objetivo

Verificar la cuenta/token de Cloudflare y dejar listos los recursos de Fase 0: buckets R2
`hidria-docs` y `hidria-reports`, y proyecto de Pages de staging. `CLOUDFLARE_ZONE` está
vacío: se usa `*.pages.dev`.

## Pasos

1. Verificar token y cuenta (`/user/tokens/verify`, `/accounts/<id>`); **no** imprimir el
   token. Confirmar que `CLOUDFLARE_ACCOUNT_ID` del `.env` corresponde a la cuenta.
2. Listar R2 buckets; crear `hidria-docs` y `hidria-reports` si no existen, con:
   - acceso privado (sin dominio público),
   - versionado habilitado en `hidria-docs`,
   - ciclo de vida/expiración de objetos temporales en `hidria-reports`.
3. Listar Pages projects; crear `hidria-staging` (build de `app/`, salida `dist`).
4. Documentar URL `*.pages.dev` y comando `npx wrangler pages deploy`.
5. Verificar que no se creó nada en una cuenta distinta; anotar account id (público, no secreto).
6. No publicar credenciales R2 en el repo; si se generan, registrarlas en el gestor de
   secretos/.env (nunca en el reporte).

## Criterios de aceptación

- [ ] Token válido para R2 y Pages.
- [ ] Buckets `hidria-docs` y `hidria-reports` existen (privados, versionado donde aplica).
- [ ] Proyecto Pages `hidria-staging` existe y la URL responde.
- [ ] Sin secretos en el reporte.

## Evidencia esperada

`reports/F0/F0-09_devops_cloudflare.md` con recursos, comandos y veredicto.
