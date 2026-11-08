# HIDRIA — Reporte de situación #04 del equipo autónomo

**Archivo:** `coding_team_report04.md`

- **Fecha de generación:** 2026-11-07 20:28 (America/Mexico_City) · 2026-11-08 02:28 UTC
- **Autor:** Lead (creador) del equipo `hidria_coding_team`
- **Repositorio:** [`horaciomartinez-svg/hidria-ect`](https://github.com/horaciomartinez-svg/hidria-ect) (público)
- **`main`:** [`424ca01`](https://github.com/horaciomartinez-svg/hidria-ect/commit/424ca01) (PR #7 `e21a665` + PR #8 `424ca01` mergeados)
- **Fase:** F0 cerrada (G0 AMARILLO-OPERATIVO; **E1 y E3 resueltas**) · **F1-00 cerrada** · **F1-01 cerrada**
- **PRs:** [#7 F1-01a](https://github.com/horaciomartinez-svg/hidria-ect/pull/7) ✅ · [#8 F1-01b](https://github.com/horaciomartinez-svg/hidria-ect/pull/8) ✅

> **Actualización 20:45:** **PR #7 mergeado** (`e21a665`, F1-01a) y **PR #8 mergeado**
> (`424ca01`, F1-01b) → **F1-01 completa**; `main` = `424ca01`. Quedan el PR documental #10
> con la evidencia final y el arranque de **F1-02 (Shell PWA)**. E1/E3 resueltas; solo E2/E4
> como acciones de usuario.
>
> **Actualización 20:30:** PR #7 ya tiene head **limpio** `c958c9e` (merge de `main`, CI 4/4)
> con las 3 re-revisiones finales solicitadas (task-36/37/38). PR #8: **QA VERDE** (54/54),
> **seguridad APROBADA sin veto** (condiciones), **spec CAMBIOS SOLICITADOS** por B1
> (firma base64url malformada → 500) y M2 (parámetros faltantes → 500); `dev-edge-functions`
> está aplicando el fix sobre `caaf071`. Orden de merge: **#7 → #8 → F1-02**.

---

## 1. Resumen ejecutivo

El equipo cerró la activación del **Auth hook (E3)** y la documentación asociada, y está a
punto de cerrar **F1-01 (auth/claims)**:

| Hito | Estado |
|---|---|
| **E3 — `custom_access_token_hook`** | ✅ **Activo y verificado end-to-end** (JWT con `organization_id`/`tenant_id`/`global_role`; usuario sin perfil → 403) |
| PR #9 — E3 + ADR-007 + evidencia F1-01 | ✅ squash `f83569a`; CI post-merge 2/2 |
| PR #7 — F1-01a (DB claims/RLS/seed) | 🔄 head `c958c9e` (main integrado); CI 4/4; seguridad sin veto; QA AMARILLO con excepción pgTAP; pendiente re-revisión acotada y squash |
| PR #8 — F1-01b (`_shared/auth.ts`) | 🔄 head `caaf071`; CI 4/4; **54/54 pruebas Deno**; revisiones task-32/33/34 en curso |
| Ruleset `proteccion-main` | ✅ `required_approving_review_count = 0`, required checks, `non_fast_forward`, sin bypass |
| Condiciones de PARO | 0 |

**Estado de la base:** **16 migraciones** aplicadas (3 base + 9 F1-00 + 4 F1-01a), 46 tablas,
RLS 46/46, 6 vistas, 105 políticas, seed sintético de 6 roles.

---

## 2. E3 — activación y verificación del auth hook

### Activación (Management API)

```
PATCH /v1/projects/zucalshlfcxejpukshxl/config/auth
  hook_custom_access_token_enabled: true
  hook_custom_access_token_uri: "pg-functions://postgres/public/custom_access_token_hook"
```

Verificación con `GET`: `enabled=true` y URI correcta.

### Verificación real (no simulada)

| Prueba | Resultado |
|---|---|
| Usuario real (Admin API) + `profiles` (org base, `coordinador_srhds`) → login | JWT con **`organization_id`**, **`tenant_id`** (alias) y **`global_role`** correctos |
| Usuario **sin** `profiles` → login | **HTTP 403** del hook; no se emite JWT (**fallo cerrado**) |
| Limpieza | Usuarios/perfiles temporales eliminados; sin secretos impresos |

Evidencia: [`F0-14`](hidria_coding_team/reports/F0/F0-14_activacion_auth_hook.md).

### Hallazgo colateral

Los 6 usuarios del seed tenían `auth.users.instance_id = NULL` → GoTrue no los veía. El
arquitecto lo corrige en `20261108020030_f1_01a_fix_roles2.sql` (PR #7): **16 migraciones** y
seed login-capable para F1-02.

---

## 3. Merges completados

| PR | Squash | Contenido |
|---|---|---|
| #5 | `afffb6c` | E1 resuelta (ruleset), B1 de ADR-005, F1-18, evidencia |
| #4 | `b4fbc83` | **F1-00**: migraciones, grants, `security_invoker`, Realtime, hook, enforcement H-5 y fix SEC-PR4-01/02/05/06 |
| #6 | `6b95be0` | Cierre documental F1-00 (revisiones, ADR-007, BACKLOG, report02) |
| #9 | `f83569a` | **E3 resuelta**, ADR-007, evidencia F1-01, report03 |

`main` = `f83569a`; CI post-merge 2/2 en `#9`.

---

## 4. PR #7 — F1-01a (DB auth/claims)

- **Rama / head:** `feature/F1-01a-auth-claims` / **`c958c9e`** (merge de `main@f83569a` a la
  rama; 7 commits, 6 archivos, +427/−21). **`mergeable_state: clean`** (conflicto del reporte
  F1-01 resuelto conservando la versión final: 16 migraciones, `plan 51`, `array[NULL]`,
  `instance_id`, 6 roles).
- **CI:** 4/4 `success` en `c958c9e` (runs 42438501225 / 42438497450).
- **Contenido:**
  - `20261108020000_f1_01a_auth_claims.sql`: helpers `current_org_id()` (precedencia
    `organization_id`; alias `tenant_id`), `current_global_role()`, `has_global_role`,
    `has_any_global_role`; `is_tenant_member`; seed sintético de **6 roles**; grants.
  - `20261108020010_f1_01a_fix_tenant_member.sql`: `false` sin claim.
  - `20261108020020_f1_01a_fix_roles.sql`: **fail-closed** + rol `invitado`.
  - `20261108020030_f1_01a_fix_roles2.sql`: `array[NULL]` → `false` + `instance_id` de los 6
    seed users (GoTrue login-capable).
  - `060_f1_01a_auth_claims.sql` (`plan 46`): seed, claims, fail-closed, RLS A/B, roles.
- **Revisiones:** spec con residual acotado (`array[NULL]`) → **fix aplicado** (`26d3788`);
  seguridad **VETO LEVANTADO**; QA **AMARILLO con excepción pgTAP** (`PR-7_qa.md`). Pendiente
  la re-revisión final acotada y el squash.
- **Condiciones:** `task-35` (alcance de `invitado` en policies preexistentes) antes del cierre
  de F1-01/G1.

---

## 5. PR #8 — F1-01b (`_shared/auth.ts`)

- **Rama / head:** `feature/F1-01b-auth-ef` / **`caaf071`** (3 commits, 5 archivos, +2487; solo
  `supabase/functions/_shared/**` + reporte).
- **CI:** 4/4 `success`; `mergeable_state: clean`.
- **Contenido:**
  - `_shared/auth.ts`: verificación HS256, contrato de claims ADR-005, guardas
    `requireTenant`/`requireGlobalRole`/`requireDiagnosticRole`, catálogo de **16 endpoints ↔
    EF-01…EF-13**, `401 AUTH_INVALID`/403 canónicos, `withAuth`.
  - `_shared/errors.ts`: catálogo canónico `docs/04` §8 y envelope sin stack traces.
  - **54 pruebas Deno** locales (SEC-04, roles, membresía, errores, no elevación de
    `admin_institucional`); `deno check/lint/fmt` limpios.
- **Revisiones:** task-32 spec **CAMBIOS SOLICITADOS** (B1 firma base64url malformada → 500
  en vez de `401`; M1 EF-08 presign sin membre diagnóstico → `task-39`; M2 parámetros
  faltantes → 500 en vez de 4xx); task-33 seguridad **APROBADO CON OBSERVACIONES sin veto**;
  **QA VERDE en `caaf071`** (`PR-8_qa.md`): 54/54 pruebas Deno ejecutadas + `deno
  check/lint/fmt`; excepción aceptada porque la CI aún no ejecuta Deno (job
  `denoland/setup-deno` obligatorio antes de G1, ligado a `task-13`). El dev-ef aplica el
  fix B1/M2 sobre `caaf071`.

---

## 6. ADR-007 — seed sintético

Aprobado con condiciones por supervisor, revisor y seguridad:
- Seed de F1-01a aceptado como **fixture dev/staging** (`.invalid`, UUID fijos, sin PII).
- **`task-27`**: limpieza forward-only **bloqueante de G3**, con orden/guardas, sin tocar la
  org base ni el catálogo IVOH, 0 filas/0 `.invalid` al final; **excepción expresa** a
  `docs/07` §1.1.
- **`task-28`**: guarda de CI que impida inserts de fixtures en migraciones.
- Regla futura: fixtures a `supabase/seed.sql`/CI; migraciones solo esquema/catálogos.

---

## 7. Follow-ups y riesgos

| ID | Tema | Cuándo |
|---|---|---|
| task-13 | pgTAP + Deno en CI (servicio Postgres / setup-deno) | antes de G1 |
| task-18 | RES-1 `diagnostics_write` (INSERT de diagnóstico) | antes de F1-04/M2 |
| task-27 | limpieza del seed sintético | antes de piloto/G3 |
| task-28 | guarda CI de fixtures en migraciones | antes de G3 |
| task-35 | alcance del rol `invitado` en policies preexistentes (`diagnostics_sel`/`profiles_sel`) | antes del cierre F1-01/G1 |
| E2 | proyecto Supabase staging separado | acción del usuario |
| E4 | acta de validación 0.6 | Coordinación SDFI/UCI |

**Riesgos:** seed en migración (mitigado por ADR-007 + task-27/28); `invitado` en policies
pre-existentes (task-35); Deno no en CI (task-13); staging no separado (E2, solo datos
sintéticos); acta 0.6 (E4).

---

## 8. Acciones del usuario

Solo quedan **E2** (provisionar proyecto Supabase `staging` separado) y **E4** (acta 0.6).
**E1 y E3 están resueltas.** El control humano es por auditoría de reportes; no se requiere
aprobar PRs en GitHub (ruleset `count=0` + checks obligatorios).

---

## 9. Próximos hitos

1. **PR #7:** re-revisión final acotada (spec + regresión de la integración de `main`) → squash
   → F1-01a cerrada.
2. **PR #8:** cuórum spec/seguridad (QA ya **VERDE**, 54/54) → squash → F1-01b.
3. **F1-02 — Shell PWA** (`dev-frontend-pwa`): router, layout, sesión, PWA; consume F1-01.
4. Después, la ola F1-03…F1-18 (M1→M2/M11→M3→M4→M5/M6/M8→M10→prerrequisitos de matriz→EF-07
   esencial→Realtime→deploy staging).

---

## 10. Evidencia

| Área | Documento |
|---|---|
| E3 / hook | [F0-14](hidria_coding_team/reports/F0/F0-14_activacion_auth_hook.md) |
| Ruleset E1 | [F0-13](hidria_coding_team/reports/F0/F0-13_verificacion_ruleset_e1.md) |
| ADR | [ADR-003](hidria_coding_team/decisions/ADR-003-plan-de-fases-operativo.md) · [ADR-004](hidria_coding_team/decisions/ADR-004-excepciones-fase-0.md) · [ADR-005](hidria_coding_team/decisions/ADR-005-claims-grants-y-correcciones.md) · [ADR-006](hidria_coding_team/decisions/ADR-006-realtime-y-consistencias.md) · [ADR-007](hidria_coding_team/decisions/ADR-007-seed-sintetico.md) |
| F1-01a | [F1-01_auth_claims](hidria_coding_team/reports/F1/F1-01_auth_claims.md) · [PR-7_spec](hidria_coding_team/reports/reviews/PR-7_spec.md) · [PR-7_security](hidria_coding_team/reports/security/PR-7_security.md) · [PR-7_qa](hidria_coding_team/reports/qa/PR-7_qa.md) |
| F1-01b | `reports/F1/F1-01b_auth_ef.md` (rama `feature/F1-01b-auth-ef`) |
| Gobierno | [TEAM.md](hidria_coding_team/TEAM.md) · [BACKLOG](hidria_coding_team/tasks/BACKLOG.md) |
| Reportes previos | [report01](coding_team_report01.md) · [report02](coding_team_report02.md) · [report03](coding_team_report03.md) |

---

## 11. Bitácora

| Fecha/hora | Hito |
|---|---|
| 2026-11-07 19:51 | Usuario aplica `required_approving_review_count = 0`; PR #5/#4 `clean` |
| 2026-11-07 19:55 | PR #4 mergeado (`b4fbc83`); F1-00 cerrada |
| 2026-11-07 19:58 | PR #6 mergeado (`6b95be0`); cierre documental F1-00 |
| 2026-11-07 ~20:10 | PR #8 (F1-01b) entregado (`caaf071`, 54 pruebas Deno) |
| 2026-11-07 ~20:15 | **E3 resuelta**: hook activado y verificado con JWT real (`F0-14`) |
| 2026-11-07 ~20:18 | Seguridad levanta veto de #7; spec pide residual `array[NULL]` |
| 2026-11-07 ~20:21 | PR #9 mergeado (`f83569a`); E3 documentada en `main` |
| 2026-11-07 ~20:25 | #7: `merge main` a la rama (`c958c9e`); CI 4/4; pendiente re-revisión y squash |
| 2026-11-07 ~20:29 | QA de #8: **VERDE** (`caaf071`, 54/54 pruebas Deno; excepción de CI documentada) |

---

## 12. Conclusión

**E1 y E3 están cerradas** y documentadas en `main`; F1-00 está cerrada y F1-01 (auth/claims)
está en la fase final de revisión: PR #7 (DB) con seguridad sin veto y CI verde, y PR #8 (EF
middleware) con 54 pruebas Deno y CI verde. El ruleset de `main` está activo con checks
obligatorios y sin bypass; el control humano es por auditoría de reportes. No hay condiciones
de PARO; solo quedan **E2** y **E4** como dependencias de entorno.

**Próximo hito:** re-revisión final de #7 → squash; cuórum de #8 → squash; inicio de **F1-02
(Shell PWA)**.
