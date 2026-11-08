---
id: F0-03
fase: F0
titulo: .env, .gitignore y secret scanning
owner: seguridad-privacidad
estado: pendiente
prioridad: P0
deps: []
write_scope: ["reports/F0/F0-03_*"]
evidencia: ["reports/F0/F0-03_seguridad_secretos.md"]
---

# F0-03 — `.env`, `.gitignore` y secret scanning

## Objetivo

Demostrar que el repositorio público no contiene secretos y que `.env` está fuera de git.

## Pasos

1. Confirmar que `.env` existe en `C:\Proyectos\hidria\.env` y **no** está trackeado:
   `git ls-files --error-unmatch .env` debe fallar.
2. Revisar `.gitignore`: `.env`, `.env.*`, `!.env.example`, `*.pem`, `*.key`, `*.p12`,
   `node_modules/`, `dist/`, `reference/`, `supabase/.temp/`, `.wrangler/`.
3. Secret scan del árbol trackeado: patrones de JWT `eyJ…`, `service_role`, `ghp_`,
   `github_pat_`, `sbp_`, tokens de Cloudflare, contraseñas; excluir `.env` (no trackeado).
4. Revisar el historial reciente (`git log -p` de los últimos 2 commits) por si algún
   secreto entró y salió.
5. Comprobar que `.env.example` (raíz y equipo) solo tiene nombres de variables y valores
   vacíos o públicos (URLs de ejemplo).
6. Verificar permisos de archivos sensibles (`reference/`, `.env`) si aplica.

## Criterios de aceptación

- [ ] `.env` no trackeado y en `.gitignore`.
- [ ] 0 hallazgos de secretos en archivos trackeados.
- [ ] Historial reciente limpio (o incidente documentado y secreto rotado).
- [ ] `.env.example` sin valores reales.
- [ ] Guarda de secretos reproducible (`scripts/ci/guardas.sh`).

## Evidencia esperada

`reports/F0/F0-03_seguridad_secretos.md`: comandos, salida, hallazgos (sin valores),
veredicto y recomendaciones.
