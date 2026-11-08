# F0-08 — Estructura del monorepo y `.env.example`

- **Agente:** Lead (creador)
- **Fecha:** 2026-11-08
- **Tarea:** `tasks/F0/F0-08_monorepo_env.md`
- **Rama / PR:** `chore/f0-fundacion` / #2
- **Entorno:** local (Windows, Node 24.21.0, npm 11.19.0)
- **Commit:** `90c77ab` (base del PR #2)

## Resultado: VERDE

## Estructura creada (según `docs/07` §0.3)

```
app/                         React 18 + TS + Vite + Tailwind (scaffold PWA)
  src/{main.tsx,App.tsx,index.css,vite-env.d.ts}
  {package.json,tsconfig.json,vite.config.ts,tailwind.config.js,postcss.config.js,eslint.config.js}
supabase/functions/          README de convención EF-01…EF-13
supabase/tests/              README de convención pgTAP
tests/                       README de unitarias/E2E (QA)
qa/trazabilidad.md           matriz regla→caso (22 reglas base; QA la amplió a 32)
scripts/ci/guardas.sh        guardas de CI (secretos, .env, migraciones, nomenclatura)
.github/workflows/ci.yml     CI mínima (guardas + lint + typecheck + build)
.github/PULL_REQUEST_TEMPLATE.md
.env.example                 plantilla raíz sin valores reales
hidria_coding_team/          TEAM.md, 8 agentes, tasks/, reports/, decisions/, scripts/, .env.example
package.json                 workspaces ["app"]
```

## Comandos y evidencia

| # | Comando | Resultado |
|---|---|---|
| 1 | `npm install` (raíz) | 234 paquetes, exit 0 |
| 2 | `npm run lint` | `eslint src` sin hallazgos, exit 0 |
| 3 | `npm run typecheck` | `tsc --noEmit` sin diagnósticos, exit 0 |
| 4 | `npm run build` | Vite 5.4.21, 31 módulos, JS 144.78 kB (46.81 kB gzip), CSS 7.40 kB, 1.54 s, exit 0 |
| 5 | `hidria_coding_team/scripts/phase0_verify.ps1` | VERDE (exit 0) |
| 6 | `bash scripts/ci/guardas.sh` | No ejecutable en Windows (sin bash); ejecución canónica en CI (job "Guardas de repositorio", 6/6 OK) |
| 7 | CI remota (PR #2) | Run 42425963485: "Guardas de repositorio" success (3 s) + "Cliente" success (49 s) |

## Verificaciones adicionales

- `docs/02` ↔ migración base: SHA-256 `2A7B6F8888040990B109F580F6BE50F7F03BF7D9FF7B2299D7BD50BC85442CB5` (idéntico).
- `docs/03` ↔ migración de seeds: SHA-256 `B2B660E4D0785EF1D2BB47ECB7EBC0241E49B66F9DBD74990B3FAA9EC18AF150` (idéntico).
- `app/dist` generado pero ignorado por git; bundle sin `service_role`.
- `.env` no trackeado; `.gitignore` cubre `.env`, `node_modules/`, `dist/`, `reference/`, `supabase/.temp/`, `.wrangler/`, artefactos de pruebas.

## Hallazgos (traspasados a F1-02)

1. **H1:** `tsconfig.json` declara alias `@/*` sin `resolve.alias` en Vite → el primer import `@/` fallará.
2. **H2:** Vite (root `app/`) no lee el `.env` de la raíz → falta `envDir: '..'`.
3. **H4:** `hidria-500` (#0d8a92) no cumple contraste para texto normal (4.15:1).
4. Node CI 22 vs local 24: paridad a fijar (`.nvmrc`).

## Pendientes / siguiente paso

- F1-02 (dev-frontend-pwa) aplica H1/H2/H4 en su PR.
- DevOps pinea actions por SHA y añade `timeout-minutes` (F1-16).
