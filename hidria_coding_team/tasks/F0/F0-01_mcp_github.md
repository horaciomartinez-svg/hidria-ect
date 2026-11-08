---
id: F0-01
fase: F0
titulo: MCP GitHub operativo y alcance del token
owner: devops-github-cloudflare
estado: pendiente
prioridad: P0
deps: []
write_scope: ["reports/F0/F0-01_*"]
evidencia: ["reports/F0/F0-01_devops_github.md"]
---

# F0-01 — MCP GitHub operativo y alcance del token

## Objetivo

Verificar que las herramientas `mcp__github__*` responden y que el token permite operar el
repositorio `horaciomartinez-svg/hidria-ect` (público) sin exponerlo.

## Pasos

1. `mcp__github__get_me` (usuario autenticado).
2. `mcp__github__get_file_contents` de `/` y `docs/` en `main`.
3. `mcp__github__list_branches` y `list_commits` (últimos 5).
4. Verificar vía API REST (con el token del `.env`, **sin imprimirlo**): repo público,
   `default_branch=main`, permisos. Comprobar `x-oauth-scopes` si existe.
5. Anotar limitaciones del token (p. ej., si no puede leer `branches/main/protection`).

## Criterios de aceptación

- [ ] Las 46 herramientas GitHub listadas responden (las usadas en el check).
- [ ] `main` es la rama por defecto; último commit coincide con `origin/main`.
- [ ] Se documenta qué puede y qué **no** puede hacer el token (administración/protección).
- [ ] Ningún valor del token aparece en el reporte.

## Evidencia esperada

`reports/F0/F0-01_devops_github.md`: comandos/llamadas, salida recortada, veredicto,
limitaciones y riesgos.
