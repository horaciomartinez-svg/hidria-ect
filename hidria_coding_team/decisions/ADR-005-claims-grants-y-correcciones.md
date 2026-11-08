# ADR-005 — Claims del JWT, grants de PostgREST y correcciones de esquema para F1

- **Estado:** aceptada con condiciones (aprobada por `revisor-especificaciones`; visto bueno condicionado de `seguridad-privacidad`; condiciones se ejecutan en `F1-00`)
- **Fecha:** 2026-11-08
- **Autor:** Lead, a partir de `F0-02/F0-04/F0-10` (arquitecto-bd), `F1-01` (dev-edge-functions)
  y `F0-05/PR-2` (seguridad-privacidad)
- **Documentos afectados:** `docs/01`, `docs/02`, `docs/04` §2.3/§2.6, `docs/06`, `TEAM.md` §4
- **Aprobación requerida:** `supervisor-hidria` + `revisor-especificaciones` (+ visto bueno de
  `seguridad-privacidad` por RLS/datos personales)

## 1. Contexto (hallazgos verificados en Fase 0)

| # | Hallazgo | Evidencia |
|---|---|---|
| H-1 | **0/44 tablas** de `public` tienen grants DML para `authenticated`/`service_role` (solo `Dxtm`); PostgREST y las EF no funcionan y `service_role` no puede leer `quiz_questions` (42501) | `F0-04_arquitecto-bd_esquema.md`, `F0-05_seguridad_quiz.md` |
| H-2 | Las **5 vistas analíticas** (`v_bhe_monthly`, `v_bhe_summary`, `v_balance_indicators`, `v_ivoh_score`, `v_diagnostic_completeness`) son `definer` sin `security_invoker` → al conceder `SELECT` filtrarían entre tenants | `F0-04` |
| H-3 | La semilla de `organizations` usa el nombre institucional **prohibido** («Secretaría de Recursos Hidráulicos y Desarrollo Sustentable») | `F0-04`; consulta a `organizations` |
| H-4 | `profiles.global_role` tiene `default 'user'`, valor **fuera del CHECK** → cualquier INSERT de perfil falla (23514) | `F1-01` (dev-edge-functions) |
| H-5 | Brechas de enforcement: custodia no exige firma no nula; gate F6 exige 1/6 evaluaciones IVOH; sin único parcial de `ivoh_index_versions.vigente`; `trg_audit_hash` sin lock (bifurcación en concurrencia) | `F0-04` |
| H-6 | Contradicción de claims: `docs/00/04/07` dicen `organization_id`; `is_tenant_member` y 14 políticas RLS usan `tenant_id` | `F0-10` |
| H-7 | `auth.custom_access_token_hook` **no es creable** por el rol de migraciones (postgres sin `CREATE` sobre `auth`) | `F0-10` |

## 2. Decisiones

1. **Claims:** el nombre canónico es **`organization_id`** (documentos). El hook emitirá
   **ambos** (`organization_id` y `tenant_id`) mientras las funciones RLS existentes usan
   `tenant_id`; la normalización completa (renombrar en RLS o alias) se hará en `F1-01` con
   migración + pgTAP, sin romper políticas vigentes.
2. **Auth hook:** se implementará como `public.custom_access_token_hook` (la ubicación `auth.`
   no es creable) con URI `pg-functions://postgres/public/custom_access_token_hook`; la
   **activación** queda pendiente de `SUPABASE_ACCESS_TOKEN` (ADR-004 E3).
3. **Grants DML:** migración correctiva que concede a `anon`/`authenticated` exactamente lo
   que RLS permite (por tabla) y a `service_role` el acceso de servicio; **sin** `SELECT` de
   `quiz_questions` cruda a `authenticated` (solo `v_quiz_questions`).
4. **Vistas:** las 5 vistas analíticas pasan a `security_invoker = true` (respetan RLS);
   `v_quiz_questions` sigue `definer` (expone columnas seguras desde una tabla revocada).
5. **Semilla:** migración correctiva que actualiza `organizations.name` a
   «Secretaría de Recursos Hidráulicos para el Desarrollo Social — Programa HIDRIA» (sin
   editar la migración aplicada).
6. **`profiles.global_role`:** default corregido a un valor válido (`observador`) o sin
   default + provisión explícita en el trigger de alta.
7. **Enforcement:** cerrar H-5 en las migraciones de `F1-00` con pruebas pgTAP.
8. Todo se implementa en **`F1-00`** (migraciones correctivas) y se valida en `F1-01`.

## 3. Consecuencias

- Se desbloquea PostgREST/EF para Fase 1 sin abrir fuga entre tenants (vistas
  `security_invoker`) ni exponer el banco de preguntas.
- `docs/01`/`docs/02` deberán actualizarse para reflejar los grants y `security_invoker`
  (PR de docs posterior); las migraciones aplicadas no se editan.
- `F1-00` es prerequisito de `F1-01` y de toda la ola F1.

## 4. Aprobación

| Rol | Nombre | Estado | Evidencia |
|---|---|---|---|
| Supervisor | `supervisor-hidria` | aprobado | merge de PR #2 (`1da64d0`) |
| Revisor | `revisor-especificaciones` | aprobado | re-revisión exprés `09998ef` |
| Seguridad | `seguridad-privacidad` | aprobado con condiciones | `PR-2_security.md` §4 y confirmación delta |
