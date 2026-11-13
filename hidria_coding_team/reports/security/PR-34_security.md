# PR #34 — Revisión de Seguridad (follow-ups SEC-PR29-01/03/05/06)

- **Agente:** `seguridad-privacidad` (08) — autoridad de **veto**
- **Fecha:** 2026-11-13 01:45 (America/Mexico_City)
- **PR:** [#34](https://github.com/horaciomartinez-svg/hidria-ect/pull/34) — `ci/F1-19-ci-hardening-followups` → `main`
- **Head revisado:** `c624ecac66f3c629b4780b2a3b3867a788efb0f4` (código en `aa06d91` + commit
  documental); base `main@82d77ad`; 13 archivos, **+372/−9**; CI **6/6 `success`** (run
  `43346535511`; último run `43346849743` también 6/6: Guardas, Cliente, Deno, pgTAP, E2E y
  **Seguridad**); clean. Autor: `devops-github-cloudflare`.
- **Alcance:** `scripts/ci/**` (npm-audit, fixtures, hardening-selftest, guardas, build-guard-test),
  `.github/workflows/ci.yml` (+2), reporte. **Sin producto, BD, migraciones, app ni policies.**
- **Método:** revisión estática del schema/allowlist/fixtures/self-test/workflow; CI; secret scan
  del diff. No se ejecutó el self-test localmente (la extracción temporal con `git archive` falló
  por el pipe de PowerShell; CI 6/6 lo ejecuta en el job).

## Veredicto: **APROBADO CON OBSERVACIONES — SIN VETO**

SEC-PR29-01 y SEC-PR29-03 quedan **resueltos en su parte principal**: la allowlist ya no acepta
`packages` vacío como wildcard, valida GHSA/packages/reason/task y **critical nunca se acepta**;
hay fixtures negativos/positivos versionados y un self-test que los ejecuta en CI sin red, con
`bundle-bad` → exit 1 y `bundle-ok` → exit 0. El job no debilita los 6 checks existentes y los
fixtures son sintéticos, sin secretos/PII reales. Las observaciones son de blindaje de la guarda
de secretos y del contrato de allowlist.

## 1. Allowlist estricta (SEC-PR29-01)

`scripts/ci/npm-audit.mjs`:

- `loadAllowlist()` valida schema: `allowlist` array; `ghsa` con regex
  `^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$`; `packages` **array no vacío de strings**;
  `reason` y `task` no vacíos. Allowlist inválida → **exit 2** (no se ignora).
- `isAllowlisted()` ya **no** tiene la rama `pkgs.length === 0`; exige `entry.packages.some(p =>
  packageNames.includes(p))`. Una entrada sin paquetes no puede silenciar un GHSA en cualquier
  dependencia.
- **Critical**: el bucle comprueba `severity === 'critical'` y lo agrega a `blocking` **antes**
  de consultar la allowlist; critical nunca se acepta. `high` solo se acepta con GHSA+paquete
  allowlisted; high sin entrada falla.
- Allowlist real: GHSA react-router 6.x con `expected_severity: moderate` y
  `re_evaluate_by: 2026-12-15` (task-53); no hay high/critical de producción silenciados.

Fixtures (sintéticos, versionados):

| Fixture | Esperado | Código |
|---|---|---|
| `high-blocking.json` (left-pad high, GHSA no allowlisted) | exit 1 | `blocking` |
| `high-allowlisted.json` (react-router high + GHSA real) | exit 0 | `isAllowlisted` |
| `critical-allowlisted.json` (critical + GHSA real allowlisted) | exit 1 | rama critical |
| `allowlist-wildcard.json` (`packages: []`) | exit 2 | schema |
| `bundle-bad/app.js` (`sb_secret_*`, `SERVICE_ROLE_KEY`, JWT service_role) | exit 1 | dist-scan |
| `bundle-ok/app.js` (solo literal `service_role`) | exit 0 + aviso | dist-scan |

`hardening-selftest.mjs` ejecuta los 6 y compara exit; es un step del job
`Seguridad (dependencias y bundle)` en CI. Sin red: npm-audit usa el fixture JSON y dist-scan
escanea el directorio fixture.

## 2. Sin regresión de checks ni de producto

| Verificación | Resultado |
|---|---|
| Workflow | Solo añade el step `Self-test de fixtures negativos/positivos`; los 6 jobs/checks existentes no cambian |
| CI | 6/6 success (run `43346535511`; `43346849743`); job Seguridad incluye self-test |
| Build guard | Añade caso `sb_publishable_*` aceptado (5/5), mantiene negativos `sb_secret_*`/JWT service_role/ilegible |
| Producto/BD | Sin cambios de app, supabase, migraciones ni policies |
| Secretos/PII | Fixtures sintéticos (`sb_secret_` + `a` repetidas, JWT `x` repetidas, `.invalid`); sin secretos reales |
| Alcance | `scripts/ci/**`, workflow y reporte; sin `app/**` ni `supabase/**` |

## 3. Observaciones

| ID | Severidad | Hallazgo | Acción |
|---|---|---|---|
| **SEC-PR34-01** | MENOR (defensa en profundidad) | `guardas.sh` excluye **todo** `scripts/ci/fixtures/**` del secret scan para evitar falsos positivos de los fixtures. Un secreto real añadido a esa carpeta pasaría la guarda principal. Hoy los fixtures son sintéticos y están revisados, pero la exclusión es amplia. | Excluir solo las rutas sintéticas conocidas/patrones, o añadir una comprobación en el self-test de que todo secreto de fixtures coincide con el prefijo sintético; no bloquea (no hay secreto real). |
| **SEC-PR34-02** | OBS (contrato) | El schema rechaza `packages: []`/strings vacíos, pero **no rechaza explícitamente un literal `"*"`/glob**; la coincidencia es `includes`, así que un `"*"` **no** silencia nada (falla cerrado), pero el contrato “sin wildcard” no está validado por schema. | Añadir rechazo explícito de `*`/patrones y fixture; no hay bypass actual. |
| **SEC-PR29-02** | MAYOR (arrastrada de #29) | El job `Seguridad` sigue **no required** en el ruleset; un fallo no bloquea merge hasta que el usuario lo añada. | Acción del usuario; mantenida como condición pre-G1. |
| **SEC-PR34-03** | OBS | `NPM_AUDIT_ALLOWLIST` permite apuntar a otra allowlist (usado por fixtures); en CI no se inyecta desde el PR, pero un entorno local podría usarlo para relajar. | Documentar que solo es para fixtures; no usar en el job real. |

El diff contiene cadenas `sb_secret_...`/JWT **falsas** en fixtures; el secret scan las marca como
sintéticas (y Guardas las excluye). No hay credenciales reales ni PII.

## 4. Conclusión

**APROBADO CON OBSERVACIONES, SIN VETO** para `c624eca` (PR #34): SEC-PR29-01/03 resueltos,
fixtures negativos/positivos ejecutados en CI, allowlist estricta sin wildcard efectivo, critical
nunca aceptado, build-guard 5/5 y sin debilitar los checks. SEC-PR34-01 (exclusión amplia de
fixtures en Guardas) y SEC-PR34-02 (rechazo explícito de `*`) son endurecimientos no bloqueantes;
SEC-PR29-02 (check required) sigue siendo acción del usuario. Con QA+CI procede el squash.

## Firma

`seguridad-privacidad` (08) — **APROBADO CON OBSERVACIONES** (sin veto) para
`c624ecac66f3c629b4780b2a3b3867a788efb0f4` del PR #34 (follow-ups task-50). Sin secretos reales
ni PII; sin cambios de producto/BD; observaciones SEC-PR34-01/02/03 y SEC-PR29-02 registradas. Sin
`git` de escritura, sin merge y sin publicar tokens/secretos.

---

## Actualización 2026-11-13 — SEC-PR29-02 CERRADO

El usuario confirmó que el check **Seguridad (dependencias y bundle)** ya es **required** en el ruleset proteccion-main (id 26780941): **6 checks required** activos (Guardas, Cliente, Deno, pgTAP, E2E y Seguridad), con approvals 0, 
on_fast_forward/deletion y sin bypass. Condición pre-G1 **SEC-PR29-02 cumplida**; no queda acción pendiente.
