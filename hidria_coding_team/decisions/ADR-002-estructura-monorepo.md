# ADR-002 — Estructura del monorepo (Fase 0)

- **Estado:** aceptada (aprobada por `revisor-especificaciones` en la re-revisión `f01e303` de `reports/reviews/PR-2_spec.md`)
- **Fecha:** 2026-11-08
- **Autor:** Lead (creación del equipo)
- **Aprobado por:** `revisor-especificaciones` (re-revisión `f01e303`); pendiente de registro del supervisor
- **Documentos afectados:** `docs/07` §0.3

## Contexto

`docs/07` §0.3 exige la estructura `/supabase/migrations`, `/supabase/functions`,
`/app` (cliente React) y `/docs`, con CI mínima (lint + build del cliente).

## Decisión

```
.
├── docs/                      # fuente única de verdad (paquete v1.0)
├── app/                       # cliente React 18 + TS + Vite + Tailwind (PWA)
├── supabase/
│   ├── migrations/            # migraciones aplicadas (forward-only), incluida la semilla
│   ├── functions/             # Edge Functions EF-01…EF-13
│   └── tests/                 # pgTAP
├── tests/                     # unitarias/E2E del cliente (QA)
├── qa/                        # matriz de trazabilidad
├── scripts/ci/                # guardas de CI
├── hidria_coding_team/        # gobierno, backlog y evidencia del equipo autónomo
│   └── scripts/phase0_verify.ps1  # verificación local de Fase 0
└── .github/workflows/ci.yml   # CI mínima
```

- **Semillas:** la semilla de catálogos vive en la migración ya aplicada
  `supabase/migrations/20261031001000_seed_catalogos.sql` (contenido de `docs/03`); **no**
  se crea un `supabase/seed.sql` que la duplique (evita doble fuente de verdad).

- `hidria_coding_team/` se versiona en el repo para que el equipo comparta instrucciones,
  backlog y evidencia.
- `reference/` (prototipo local) **no** se versiona (`.gitignore`), pero está disponible
  localmente para el frontend.
- `service_role` jamás en `app/`; el cliente solo usa `VITE_SUPABASE_URL` y
  `VITE_SUPABASE_ANON_KEY`.

## Alternativas consideradas

- `apps/web` + `packages/*` (monorepo pnpm): sobredimensionado para un solo cliente.
- Raíz plana sin workspaces npm: dificulta scripts y CI. Se usa `package.json` raíz con
  workspaces `["app"]`.

## Consecuencias

- Positivas: estructura simple, alineada a `docs/07`, CI clara.
- Negativas: cuando aparezcan paquetes compartidos (p. ej. tipos de contrato) se evaluará
  `packages/` con ADR nuevo.

## Seguimiento

- F0-08 (creación) y F1-02 (shell) consumen esta estructura.
