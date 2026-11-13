# F1-19 — Follow-ups de CI hardening (SEC-PR29-01/03, SEC-PR29-05/06)

- **Agente:** `devops-github-cloudflare` (07)
- **Fecha:** 2026-11-12 19:40 (America/Mexico_City) · 2026-11-13T01:40Z
- **Contexto:** follow-ups no bloqueantes de la revisión de seguridad del **PR #29** (task-50),
  que quedó **mergeado** en `main@13caf3b`; task-50 cerrada. Este PR cierra las condiciones
  SEC-PR29-01/03 y dos observaciones baratas (SEC-PR29-05/06).
- **Rama / PR:** `ci/F1-19-ci-hardening-followups` · base `main@13caf3b` · PR pendiente de crear
- **Alcance:** solo `scripts/ci/**` + `.github/workflows/ci.yml` + evidencia. Sin producto, BD,
  migraciones, `app/**` ni secrets.

## Resultado: VERDE local — pendiente run de CI

## 1. SEC-PR29-01 — allowlist cerrada por construcción (sin wildcard)

`scripts/ci/npm-audit.mjs`:

- **Valida el schema** de `npm-audit-allowlist.json` al cargar: cada entrada exige
  `ghsa` con formato `GHSA-xxxx-xxxx-xxxx`, `packages` **no vacío** (array de strings),
  `reason` y `task`. Una allowlist inválida hace fallar el job con **exit 2** (no se ignora).
- Se elimina el comportamiento previo que aceptaba `pkgs.length === 0` como comodín: ahora
  una entrada sin `packages` **no** puede silenciar un GHSA en cualquier paquete.
- Se añade soporte `NPM_AUDIT_ALLOWLIST=<ruta>` (solo pruebas/CI) para probar una allowlist
  inválida con el fixture versionado.
- La allowlist real añade `expected_severity` y `re_evaluate_by` (SEC-PR29-06) para registrar
  severidad esperada y fecha de revisión (task-53).

## 2. SEC-PR29-03 — fixtures negativos versionados + self-test en CI

`scripts/ci/fixtures/` (versionados, sintéticos, sin secretos reales):

| Fixture | Propósito |
|---|---|
| `npm-audit/high-blocking.json` | high con GHSA **no** allowlisted → debe bloquear (exit 1) |
| `npm-audit/high-allowlisted.json` | high con GHSA de react-router allowlisted → acepta (exit 0) |
| `npm-audit/critical-allowlisted.json` | **critical** aunque el GHSA esté allowlisted → bloquea (exit 1) |
| `npm-audit/allowlist-wildcard.json` | entry con `packages: []` → allowlist inválida (exit 2) |
| `bundle-bad/app.js` | `sb_secret_*`, `SERVICE_ROLE_KEY` con valor y JWT `role=service_role` → exit 1 |
| `bundle-ok/app.js` | solo literal `service_role` (guarda/UI) → exit 0 con aviso |

`scripts/ci/hardening-selftest.mjs` ejecuta los 6 casos y verifica exit codes; se añade como
step **`Self-test de fixtures negativos/positivos`** al job `Seguridad (dependencias y bundle)`.
Así una regresión de patrones/lógica de allowlist falla el pipeline en vez de pasar en silencio.

Los fixtures contienen JWT y secretos **falsos** a propósito; por eso `scripts/ci/guardas.sh`
excluye `scripts/ci/fixtures/**` del secret scan (comentado en el script) y así no se produce
un falso positivo de la guarda. El resto del árbol sigue escaneado igual.

## 3. SEC-PR29-05 — caso `sb_publishable_*` en el guard build-time

`scripts/ci/build-guard-test.mjs` añade el caso de aceptación con clave
`sb_publishable_…` (el guard de `vite.config.ts` la acepta); matriz ahora **5/5**
(anon, publishable, sb_secret, JWT service_role, JWT ilegible).

## 4. SEC-PR29-06 — severidad esperada/re-evaluación en allowlist

Cada entrada registra `expected_severity: "moderate"` y `re_evaluate_by: "2026-12-15"` con
`task: task-53`; si npm eleva la severidad a high, la entrada sigue siendo una excepción
consciente y con fecha de revisión (no silenciosa).

## 5. Validación local

| # | Comando | Resultado |
|---|---|---|
| 1 | `node scripts/ci/hardening-selftest.mjs` | **exit 0 — 6/6 casos OK** |
| 2 | `node scripts/ci/build-guard-test.mjs` | **exit 0 — 5/5 casos OK** |
| 3 | `node scripts/ci/npm-audit.mjs` | exit 0 (0 high/critical producción; 2 moderate documentados) |
| 4 | `node scripts/ci/dist-scan.mjs` | exit 0 (8 archivos; sin credenciales; 3 avisos de literal) |
| 5 | `node --check` de los scripts | exit 0 |

## 6. Evidencia CI — run verde

| Dato | Valor |
|---|---|
| Run PR | [43346535511](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/43346535511) (`pull_request`, head `aa06d91`, **success**) |
| Run push | `43346510763` (`push`, mismo head, **success**) |
| Checks | **6/6**: Guardas · Cliente · Deno · pgTAP · E2E · **Seguridad (dependencias y bundle)** |
| Job `Seguridad` | success — incluye `npm-audit`, build, `build-guard-test` (5/5), `dist-scan` y **`hardening-selftest` (6/6 fixtures)**; `Guardas` verde con fixtures excluidos del secret scan |

## 7. Seguridad y límites

- Fixtures **sintéticos** (`sb_secret_` + `a` repetidas, JWT `x` repetidas); no son
  credenciales. Sin `.env` ni valores reales.
- SEC-PR29-02 (job `Seguridad` como **required**) sigue siendo acción del usuario en el
  ruleset; el job ya está en `main` y se recomienda añadirlo antes de G1.
- SEC-PR29-04 (límites de dist-scan: texto/≤8 MB/codificaciones) se mantiene documentado como
  endurecimiento opcional; sin secreto actual.

## 8. Pendientes / siguiente paso

- [x] **PR #34 abierto y verde**: 6/6 en run `43346535511` (PR) y `43346510763` (push).
- [ ] Actualizar `qa/trazabilidad.md`/reporte QA de #29 si el supervisor lo pide (fuera de
      este PR; QA no hace git).
- [ ] Usuario: añadir `Seguridad (dependencias y bundle)` a required checks antes de G1.
- [ ] task-53: react-router 7.18.5 y revisión de allowlist (fecha registrada).

## Veredicto

**VERDE CI** — run `43346535511` (6/6; job `Seguridad` con self-test de fixtures 6/6 y guard
build-time 5/5). SEC-PR29-01 cerrada (schema estricto, sin wildcard), SEC-PR29-03 cerrada
(fixtures versionados + self-test en CI), SEC-PR29-05/06 cubiertas. Sin secretos ni cambios de
producto. Pendiente squash del supervisor; SEC-PR29-02 (required check) sigue siendo acción del
usuario.
