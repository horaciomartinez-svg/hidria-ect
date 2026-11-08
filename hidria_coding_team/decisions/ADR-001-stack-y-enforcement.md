# ADR-001 — Stack y modelo de enforcement (decisión congelada)

- **Estado:** aceptada (decisión de la Coordinación, previa al equipo)
- **Fecha:** 2026-11-08
- **Autor:** Coordinación HIDRIA (SDFI–SRHDS)
- **Aprobado por:** Coordinación
- **Documentos afectados:** `docs/Arquitectura HIDRIA-ECT con MD-OHI v2.0.md` §4–§6,
  `docs/01`, `docs/02`, `docs/04`, `docs/07`

## Contexto

La v1.0 usaba Flutter + Drift para el cliente. El rediseño v2.0 debe entregar una PWA
offline-first con una sola base de código y con el mismo esquema Supabase.

## Decisión

1. Cliente **React 18 + TypeScript + Vite + Tailwind**, PWA con service worker +
   Dexie/IndexedDB, LWW por campo, cola con `client_op_id`; **gates nunca offline**.
2. **Supabase** (Postgres multi-tenant con RLS, Auth con custom claims, Edge Functions
   Deno, Realtime, Vault).
3. **Cloudflare** Pages (`*.pages.dev` mientras `CLOUDFLARE_ZONE` esté vacío), R2
   (`hidria-docs`, `hidria-reports`), WAF.
4. **Enforcement:** RLS primero; triggers como defensa final (`check_phase_gate`,
   `trg_ivoh_requires_bhe`, `trg_custody_gate`, `trg_logbook_immutable`,
   `trg_ivoh_version_immutable`, `trg_audit_hash`); Edge Functions solo para transacciones
   multi-tabla, gates con side effects, integraciones externas y cálculo server-side.

## Alternativas consideradas

- Flutter + Drift (v1.0): descartada por doble stack y porque el prototipo React ya está
  verificado.
- Lógica de negocio solo en cliente: descartada (el cliente no es confiable).
- Solo RLS sin triggers: descartada (defensa en profundidad).

## Consecuencias

- Positivas: una codebase, offline-first, enforcement en servidor.
- Riesgos: complejidad de sincronización offline y de RLS por membresía; mitigación con
  `docs/04` §9 y suites OFF/SEC.
- Ningún agente reabre esta decisión (`TEAM.md` §4).

## Seguimiento

- Implementación por fases en `docs/07`; trazabilidad en `docs/05`.
