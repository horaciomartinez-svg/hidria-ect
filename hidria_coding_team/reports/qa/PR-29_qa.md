# PR #29 — QA: CI hardening (task-50: audit, dist-scan, build-guard)

- **Agente:** `qa-tester` (05)
- **Fecha:** 2026-11-08 14:00 (America/Mexico_City)
- **Tarea:** `task-71` — QA PR #29 (task-50)
- **PR:** [#29](https://github.com/horaciomartinez-svg/hidria-ect/pull/29) — `chore/F1-19-ci-hardening` → `main`
- **Head evaluado:** `e51e99b74b6293af9aa9a1622b55b77e094676c0` · **Base:** `main` `a6cc7e6`
- **Delta final:** `f30ba5a..e51e99b` = **solo 2 reportes** F1-19 (+18/−7); scripts/allowlist/workflow idénticos. Diff total del PR: 7 archivos, +723/−2.
- **CI:** **12/12 check runs success** en `e51e99b` (runs `43345519676` PR y `43345513459` push; 6 jobs: Guardas, Cliente, Deno, **pgTAP**, **E2E** con `ubuntu-24.04`, **Seguridad**).

## Resultado: **VERDE — merge permitido**, con condiciones pre-G1

> El job nuevo endurece la CI real y **no relaja** los 5 checks existentes. Reproducidos
> localmente los tres controles: audit de producción sin high/critical bloqueantes, dist-scan
> limpio y con fixtures inyectados fallando, y build-guard-test 4/4 (anon pasa; sb_secret,
> JWT service_role e ilegible fallan). Sin secretos reales; sin red en dist-scan.
> **Condiciones no bloqueantes de seguridad:** SEC-PR29-01 (allowlist acepta `packages`
> vacío como wildcard) y SEC-PR29-02 (job aún no required) deben cerrarse antes de G1;
> SEC-PR29-03 (fixtures negativos no versionados en CI) queda como observación.

## 1. Reproducción local (sin `.env`, scripts idénticos a `3811e61`)

| Comando | Resultado |
|---|---|
| `npm ci` | exit 0 |
| `npm run build` | exit 0 (PWA 11 precache; sin `.env`) |
| `node scripts/ci/npm-audit.mjs` | **exit 0** — producción: 2 moderate, **0 high, 0 critical**; 5.6 s |
| `node scripts/ci/dist-scan.mjs` | **exit 0** — 8 archivos; 0 credenciales; 3 avisos de literal `service_role`; 1.2 s; sin red |
| `node scripts/ci/build-guard-test.mjs` | **exit 0 — 4/4 casos**: anon OK; `sb_secret_*`, JWT `service_role`, JWT ilegible fallan; 20.6 s |

### Pruebas negativas/allowlist (fixtures locales)

| Fixture | Resultado |
|---|---|
| high no allowlisted (`GHSA-AAAA-BBBB-CCCC`) | **exit 1** (bloquea) |
| high allowlisted (`GHSA-WRJC-X8RR-H8H6`, react-router) | **exit 0** (aceptado, registra GHSA) |
| **critical** allowlisted (mismo GHSA/paquete) | **exit 1** (critical nunca se acepta) |
| `dist` inyectado con `sb_secret_…` + `SUPABASE_SERVICE_ROLE_KEY="…"` + `"role":"service_role"` | **exit 1**, 3 hallazgos (sin red) |
| build-guard-test: clave anon / secret / service_role / ilegible | 4/4 OK |

## 2. Job y no regresión

- Workflow: solo **añade** `security` (`Seguridad (dependencias y bundle)`), timeout 20 min;
  los jobs `guardas`, `cliente`, `functions`, `pgtap` y `e2e` quedan intactos.
- Steps: checkout → Node 22 → `npm ci` → `npm-audit` → `npm run build` → `build-guard-test`
  → `dist-scan`. No hay `continue-on-error`; un fallo de seguridad rompe el job.
- CI: 12/12 check runs success finales (runs `43345519676` pull_request y `43345513459` push); job
  Seguridad `131623843311`/`131623822602` success; los 5 checks previos success. Tiempo de job
  ~65 s; workflow ~2 min, <5 min.
- **Hotfix de runner:** el head intermedio `8be7e3c` falló **E2E** en ambos runs por entorno
  (`ubuntu-latest` = 26.04; Playwright 1.55 no soporta Chromium allí). `f30ba5a` fija
  `runs-on: ubuntu-24.04` para E2E; `e51e99b` solo actualiza reportes. Los scripts de seguridad
  son **idénticos** a `3811e61` y `dist-scan` no usa red. No fue un defecto del candidato.

## 3. Alcance y secretos

| Comprobación | Resultado |
|---|---|
| Alcance | 6 archivos CI/scripts/reportes; **sin** `app/**`, `supabase/**`, `docs/**`, migraciones ni `.env` |
| Secretos | `scripts/ci/**` y allowlist no contienen credenciales; fixtures sintéticos (`sb_secret_` + `a…`) |
| `docs/02` | No se toca; sin cambios de BD/migraciones/policies/grants |
| Guard build-time | No se modifica `app/vite.config.ts`; el test solo lanza builds con claves sintéticas y limpia `.tmp-guard-test` |

## 4. Condiciones y observaciones (seguridad, task-70)

- **SEC-PR29-01 (MAYOR, condición):** `isAllowlisted()` acepta una entrada sin `packages`
  (`pkgs.length === 0` ⇒ wildcard para cualquier paquete). Las 2 entradas actuales sí listan
  packages, pero falta cerrar por construcción: exigir `packages` no vacío + schema + fixture
  negativo. **Antes de G1.**
- **SEC-PR29-02 (MAYOR, proceso):** el check `Seguridad (dependencias y bundle)` **no es
  required** en el ruleset; un fallo no bloquea el merge hasta que el usuario lo añada.
  **Antes de G1**, sin relajar los 5 existentes.
- **SEC-PR29-03 (MENOR):** los fixtures negativos de audit/dist-scan no están versionados en
  CI (solo se ejecutaron localmente). Añadir tests/fixtures al job/unit tests.
- SEC-PR29-04/05/06 (OBS): límites de dist-scan (texto/≤8 MB/codificaciones), falta caso
  `sb_publishable_*` en build-guard-test, allowlist de moderate con re-evaluación task-53.
- Estas condiciones no impiden el merge de #29 (seguridad: APROBADO CON OBSERVACIONES sin
  veto); quedan como gate pre-G1 y follow-ups.

## 5. Trazabilidad

- `task-50` **cerrada funcionalmente**: audit prod + dist-scan + build-guard + job CI.
  El check nuevo **no es required** todavía; se recomienda añadirlo antes de G1.
- `qa/trazabilidad.md`: evidencia de hardening CI (12/12 runs, 2 moderate prod, 0 high/critical)
  y condiciones SEC-PR29-01/02 pre-G1. Sin verdes de reglas de producto R-* (es CI, no caso
  `docs/05`).

## Dictamen

**VERDE — merge permitido.** Los tres controles funcionan con evidencia reproducida y
negativos que fallan como se espera; el job no relaja los 5 checks, es <5 min, sin secretos y
sin red en dist-scan. Condiciones pre-G1: cerrar el wildcard de allowlist (SEC-PR29-01) y
hacer required el check (SEC-PR29-02); fixtures negativos en CI (03) como follow-up. QA no
mergea; no se ejecutó git de escritura.

## Firma

QA `qa-tester`. Solo este reporte y `qa/trazabilidad.md`; sin modificar `app/**`,
`supabase/**`, `.github/**` ni `docs/**`. Sin secretos.

---

## Actualización 2026-11-13 — SEC-PR29-02 CERRADO

El usuario confirmó que el check **Seguridad (dependencias y bundle)** ya es **required** en el ruleset proteccion-main (id 26780941): **6 checks required** activos (Guardas, Cliente, Deno, pgTAP, E2E y Seguridad), con approvals 0, 
on_fast_forward/deletion y sin bypass. Condición pre-G1 **SEC-PR29-02 cumplida**; no queda acción pendiente.
