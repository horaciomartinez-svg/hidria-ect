---
id: F1-00
fase: F1
titulo: Migraciones correctivas y grants DML de PostgREST
owner: arquitecto-bd
estado: pendiente
prioridad: P0
deps: [F0-12]
write_scope: ["supabase/migrations/**", "supabase/tests/**", "reports/F1/F1-00_*"]
evidencia: ["reports/F1/F1-00_arquitecto-bd_migraciones.md"]
---

# F1-00 — Migraciones correctivas y grants DML

## Objetivo

Corregir los defectos de esquema detectados en Fase 0 (auditoría de `arquitecto-bd`,
`dev-edge-functions` y `seguridad-privacidad`) mediante **migraciones forward-only nuevas**,
y habilitar el acceso de PostgREST con grants explícitos.

## Alcance (mínimo P0)

- `M-01` tabla `api_idempotency` (unique `user_id+endpoint+key`, RLS solo `service_role`).
- `M-02` `fn_audit_write` con `pg_advisory_xact_lock`, unique `prev_hash` y enum ampliado.
- `M-03` secuencia/persistencia de folio de reporte `{folio}-R1/-R2`.
- `M-04` RPC `fn_bhe_monthly`/`fn_bhe_summary` para balance `en_captura` y brecha anual
  ponderada (sin romper `v_bhe_monthly`/`v_bhe_summary`).
- `M-05` **Realtime:** añadir a la publicación `supabase_realtime` las tablas necesarias y
  políticas de canales privados (`diagnostic:{id}`, `org:{id}`, `user:{id}`).
- `M-06` **RPC de rol para `service_role`:** `my_diagnostic_role` usa `auth.uid()` y devuelve
  NULL desde una EF; exponer una RPC que reciba `user_id` explícito.
- `M-07` corregir `profiles.global_role default 'user'` (fuera del CHECK).
- `M-08` **función de completitud** alineada a `v_diagnostic_completeness` (TD-4, 10 requisitos).
- **Grants DML:** `grant select/insert/update/delete` a `anon`/`authenticated` según RLS y
  `service_role` en `public`; **sin** dar SELECT de `quiz_questions` cruda a
  `authenticated` (solo `v_quiz_questions`).
- **`security_invoker = true`** en `v_bhe_monthly`, `v_bhe_summary`, `v_balance_indicators`,
  `v_ivoh_score`, `v_diagnostic_completeness` (evitar fuga entre tenants al conceder SELECT).
- **Semilla:** actualizar `organizations.name` al nombre institucional vigente
  (`SRHDS — Programa HIDRIA`), sin editar la migración aplicada.
- **Auth hook:** `public.custom_access_token_hook` (claims `organization_id` + `tenant_id` +
  `global_role`) según ADR-005; activación pendiente de credencial.
- **Enforcement H-5:** firma no nula en custodia, gate F6 6/6, único parcial de
  `ivoh_index_versions.vigente`, lock de `trg_audit_hash`.

## Criterios de aceptación

- [ ] Migraciones idempotentes, forward-only, aplicadas en staging y verificadas.
- [ ] `authenticated` puede operar las tablas con RLS (PostgREST) sin filtraciones.
- [ ] `service_role` puede administrar `quiz_questions` sin exponerla a `authenticated`.
- [ ] Realtime (`M-05`): RT-01/02 verificables (tablas publicadas + políticas de canal).
- [ ] `M-06`/`M-08` probadas: RPC de rol y completitud alineada a la vista.
- [ ] pgTAP de las reglas afectadas (idempotencia, auditoría, folio, completitud, grants,
      `security_invoker`, enforcement, Realtime).
- [ ] Evidencia y PR aprobados por revisor y seguridad.
