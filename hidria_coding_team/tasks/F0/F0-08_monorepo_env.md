---
id: F0-08
fase: F0
titulo: Estructura del monorepo y .env.example
owner: lead (creador)
estado: en_progreso
prioridad: P0
deps: []
write_scope: ["app/**", "supabase/functions/**", "supabase/tests/**", "scripts/**", ".env.example", "README.md"]
evidencia: ["reports/F0/F0-08_lead_monorepo.md"]
---

# F0-08 — Estructura del monorepo y `.env.example`

## Objetivo

Crear la estructura mínima que `docs/07` §0.3 exige: `app/` (cliente React), `supabase/`
(migraciones, functions, tests), `docs/`, CI y `.env.example` sin valores reales.

## Pasos

1. `app/`: React 18 + TS + Vite + Tailwind; `npm run lint`, `typecheck`, `build` funcionan.
2. `supabase/functions/`: estructura `_shared/` + una carpeta por EF (se llena en Fase 1).
3. `supabase/tests/`: espacio pgTAP (se llena en Fase 1).
4. `scripts/ci/guardas.sh` y `scripts/phase0-verify.ps1`.
5. `.github/workflows/ci.yml` + `.github/PULL_REQUEST_TEMPLATE.md`.
6. `.env.example` (raíz) e inventario `hidria_coding_team/.env.example`: solo nombres,
   sin valores reales.
7. Actualizar `README.md` con la estructura y la existencia del equipo autónomo.
8. Verificar localmente lint/typecheck/build y guardas antes del PR.

## Criterios de aceptación

- [ ] `app/` compila y pasa lint/typecheck.
- [ ] `.env.example` sin valores reales (solo nombres y valores públicos de ejemplo).
- [ ] `supabase/functions/` y `supabase/tests/` existen con README de convención.
- [ ] `README.md` refleja la estructura real.
- [ ] Guardas reproducibles.

## Evidencia esperada

`reports/F0/F0-08_lead_monorepo.md` + PR `chore/f0-fundacion`.
