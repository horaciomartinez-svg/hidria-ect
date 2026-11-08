---
id: F0-04
fase: F0
titulo: Esquema, RLS, vistas y seeds en Supabase
owner: arquitecto-bd
estado: pendiente
prioridad: P0
deps: [F0-02]
write_scope: ["reports/F0/F0-04_*"]
evidencia: ["reports/F0/F0-04_arquitecto-bd_esquema.md"]
---

# F0-04 — Esquema, RLS, vistas y seeds en Supabase

## Objetivo

Verificar con evidencia que la base ya aplicada cumple `docs/01`/`docs/02`: 44 tablas,
RLS en las 44, 6 vistas, seeds oficiales presentes y sin drift.

## Pasos

1. Conteo de tablas base y vistas en `public`; comparar con 44 y 6.
2. RLS: `relrowsecurity` en las 44 tablas; listar cualquier tabla sin RLS (debe ser 0).
3. Verificar tablas hijas con políticas `EXISTS` (balance_flows, quality_parameters,
   custody_transfers, lab_results, action_plan_items) — el fix de Fase 0.
4. Conteos de seeds: `cat_items`=47, `completeness_items`=10, `logbook_templates`=8,
   `course_modules`=8, `ivoh_factors`=6, `ivoh_rubrics`=24, `ivoh_index_versions`=1,
   `balance_flow_catalog`=22, `quality_parameters_catalog`=19, `iih_asset_types`=66,
   `iih_stages`=6, `quiz_questions`=14, `organizations`=1 (semilla).
5. Verificar hashes: `docs/02-…sql` == `supabase/migrations/20261031000000_…sql`;
   `docs/03` == migración de seeds (SHA-256).
6. Triggers de enforcement presentes: `check_phase_gate`, `trg_ivoh_requires_bhe`,
   `trg_custody_gate`, `trg_logbook_immutable`, `trg_ivoh_version_immutable`,
   `trg_audit_hash` (consultar `pg_trigger`).
7. Vistas y funciones: `v_diagnostic_completeness`, `v_ivoh_score`, `v_bhe_monthly`,
   `v_bhe_summary`, `v_balance_indicators`, `v_quiz_questions`; funciones `is_tenant_member`,
   `my_diagnostic_role`, `is_diagnostic_member`, `is_logbook_entry_member`.
8. Comprobar ausencia de drift ejecutando `npx supabase db diff` (si hay DB URL) o
   documentando por qué no aplica.

## Criterios de aceptación

- [ ] 44/44 tablas con RLS; 6 vistas; 3 migraciones.
- [ ] Seeds con los conteos oficiales.
- [ ] Triggers y funciones de enforcement presentes.
- [ ] Hashes de documentos SQL == migraciones.
- [ ] Sin escrituras (solo verificación).

## Evidencia esperada

`reports/F0/F0-04_arquitecto-bd_esquema.md` con tablas de resultados y veredicto.
