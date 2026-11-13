# PR #29 — Revisión de Seguridad (task-50: CI hardening)

- **Agente:** `seguridad-privacidad` (08) — autoridad de **veto**
- **Fecha:** 2026-11-08 13:35 (America/Mexico_City)
- **PR:** [#29](https://github.com/horaciomartinez-svg/hidria-ect/pull/29) — `chore/F1-19-ci-hardening` → `main`
  («ci(task-50): hardening de seguridad en CI — audit, dist-scan y guard build-time»)
- **Head revisado:** `3811e61c479636811f93bd78bf125935b56c8d28`; base `main@057ad79`; 6 archivos,
  **+678/−0**; CI **6/6 `success`** (run `42516304140`, job `Seguridad (dependencias y bundle)`
  success; Guardas/Cliente/Deno/pgTAP/E2E intactos); `mergeable_state: clean`.
- **Alcance:** `.github/workflows/ci.yml` (+24), `scripts/ci/npm-audit.mjs` (+183),
  `npm-audit-allowlist.json` (+18), `scripts/ci/dist-scan.mjs` (+149),
  `scripts/ci/build-guard-test.mjs` (+115), reporte F1-19. **Sin cambios de producto, BD,
  migraciones, app ni policies/grants.**
- **Método:** revisión estática de scripts/allowlist/workflow; inspección de patrones y lógica de
  bypass; contraste con CI; `node --check`/JSON parse sobre los archivos extraídos; secret scan del
  diff. No se ejecutó el job completo localmente (CI 6/6 y evidencia del autor).

## Veredicto: **APROBADO CON OBSERVACIONES — SIN VETO**

El job añadido es un hardening real y **no relaja** los 5 checks existentes: audit de producción
con fallo en high/critical, escaneo de bundle contra claves/JWT de servicio y prueba determinista
del guard build-time con claves sintéticas. La allowlist es explícita por GHSA+paquete y **critical
nunca se acepta**. Las observaciones son de cierre del control: la allowlist admite un “wildcard”
si faltan `packages`, el job aún **no es required** en el ruleset, y las pruebas negativas de
audit/dist-scan no están versionadas en CI (solo se ejecutaron en local/reporte).

## 1. Job de CI y no regresión

| Verificación | Resultado |
|---|---|
| Job nuevo `Seguridad (dependencias y bundle)` | ✅ checkout, Node 22, `npm ci`, `npm-audit`, `npm run build`, `build-guard-test`, `dist-scan` |
| Los 5 checks existentes | ✅ Guardas, Cliente, Deno, pgTAP y E2E sin cambios; el diff **solo añade** el job |
| CI del head | ✅ 6/6 success (run `42516304140`; job Seguridad success) |
| Permisos/acciones | ✅ `actions/checkout@v4`/`setup-node@v4`; sin permisos de escritura ni secretos inyectados |
| Red | ✅ audit/npm ci usan red; `dist-scan` es local (sin red) |
| Alcance | ✅ solo CI/scripts/reportes; sin app, supabase, migraciones ni policies |

## 2. `npm audit --omit=dev` y allowlist

- `scripts/ci/npm-audit.mjs` ejecuta `npm audit --omit=dev --json`, recorre `vulnerabilities` y
  **falla en high/critical**; `critical` está **prohibido incluso con allowlist**. Los moderate se
  reportan como aviso (no bloquean) — coherente con la condición del PR.
- Allowlist `npm-audit-allowlist.json` con **GHSA + packages + razón + task**:
  `GHSA-wrjc-x8rr-h8h6` (open redirect 6.x, mitigado en `safeRedirect`) y
  `GHSA-337j-9hxr-rhxg` (SSR no aplicable), ambos task-53.
- Producción actual: **2 moderate, 0 high, 0 critical**; no hay high/critical silenciados.
- **SEC-PR29-01 (MAYOR, condición):** `isAllowlisted()` considera coincidencia si
  `pkgs.length === 0` (`entry.packages` ausente/vacío) → un futuro entry podría silenciar un GHSA
  en **cualquier** paquete. Las entradas actuales sí listan packages, pero la allowlist no queda
  “cerrada por construcción”. Exigir `packages` no vacío, validar schema y añadir fixture negativo
  (entry sin packages debe hacer fallar el script o considerarse inválida).
- **SEC-PR29-06 (OBS):** las entradas son advisories **moderate**; el script solo procesa
  high/critical. Si npm cambiara su severidad a high, la allowlist los aceptaría (intención
  documentada task-53), pero conviene registrar la severidad esperada por GHSA y la fecha de
  re-evaluación.

## 3. `dist-scan` del bundle

- Recorre `app/dist/**` (solo extensiones de texto, archivos ≤8 MB) y bloquea:
  `sb_secret_…`, `SERVICE_ROLE_KEY` con valor, JWT con payload `role=service_role`,
  y `"role":"service_role"` JSON. El literal aislado `service_role` es **aviso** (guarda/UI/
  supabase-js); una credencial utilizable sí falla.
- Evidencia CI: 8 archivos, 0 hallazgos, 3 avisos de literal; **sin red** y sobre el build real
  (`npm run build`), no sobre fuentes.
- Pruebas locales del autor: fixtures con `sb_secret_`/env/JWT → exit 1; literal solo → exit 0.
- **SEC-PR29-04 (OBS/defensa):** límites aceptados hoy: no escanea binarios (`.wasm`, etc.),
  omite archivos >8 MB y patrones de secretos codificados/concatenados; el bundle actual está
  cubierto y no se halló secreto. Añadir fixtures para concatenación/codificación si se quiere
  endurecer; no bloqueante.
- **SEC-PR29-03 (MENOR):** las pruebas negativas de `dist-scan`/`npm-audit` **no están en CI**,
  sólo en la evidencia local del reporte. El job corre los scripts en modo normal; una regresión
  de patrones podría pasar silenciosamente. Añadir fixtures negativos versionados al job/unit
  tests (incluido el wildcard de allowlist).

## 4. `build-guard-test`

- Ejecuta builds reales de Vite en `.tmp-guard-test` con claves **sintéticas**: anon → pass;
  `sb_secret_*` → fail; JWT `role=service_role` → fail; JWT ilegible → fail. Verifica el mensaje
  esperado, no sólo el exit code; si se debilita el guard, los negativos pasan y el test falla.
- No modifica `app/vite.config.ts` ni `app/dist`; limpia el directorio temporal; sin claves reales.
- **SEC-PR29-05 (OBS):** no cubre el caso `sb_publishable_*` (el guard lo acepta); añadirlo para
  completar la matriz de la condición SEC-PR12-01.

## 5. Secretos y alcance

- Secret scan del diff **0**; scripts/allowlist contienen patrones y GHSA, **no credenciales**;
  los fixtures usan claves sintéticas (`sb_secret_` + `a` repetidas, JWT `x` repetidas).
- Sin cambios de BD/migraciones/policies/grants; sin archivos de producto; `docs/02` intacto
  (no se toca en este PR).
- **SEC-PR29-02 (MAYOR, proceso):** el job nuevo **no está en el ruleset como required** (el
  propio reporte lo pide al usuario). Mientras no se añada, un fallo de Seguridad no bloquea el
  merge; los 5 checks previos siguen siendo la única puerta. Condición antes de G1: añadir
  `Seguridad (dependencias y bundle)` a required checks, sin relajar los demás.

## 6. Observaciones / condiciones

| ID | Severidad | Hallazgo | Acción |
|---|---|---|---|
| **SEC-PR29-01** | MAYOR (condición) | Allowlist acepta `packages` vacío como wildcard. | Exigir packages no vacío + schema + fixture negativo; no cerrar con wildcard. |
| **SEC-PR29-02** | MAYOR (proceso) | Job Seguridad no required en ruleset; fallaría sin bloquear. | Añadirlo a required checks antes de G1; mantener los 5 existentes. |
| **SEC-PR29-03** | MENOR | Sin fixtures negativos de audit/dist-scan en CI. | Versionar tests de fixtures (secretos inyectados, GHSA no allowlisted, wildcard). |
| **SEC-PR29-04** | OBS | Límites de dist-scan (texto, ≤8 MB, patrones; no codificaciones). | Ampliar/decodificar si se requiere; sin secreto actual. |
| **SEC-PR29-05** | OBS | Build-guard-test no cubre `sb_publishable_*`. | Añadir caso de aceptación publishable. |
| **SEC-PR29-06** | OBS | Allowlist de advisories moderate; si cambian a high serían aceptados. | Registrar severidad/fecha de re-evaluación (task-53). |

## 7. Conclusión

**APROBADO CON OBSERVACIONES, SIN VETO** para `3811e61`: el job de seguridad es útil, no relaja
los 5 checks, no contiene secretos y falla de verdad en los tres controles con fixtures
sintéticos; producción no tiene high/critical y la allowlist actual es explícita. Las condiciones
SEC-PR29-01 (wildcard) y SEC-PR29-02 (required check) deben cerrarse antes de G1; las pruebas
negativas en CI (SEC-PR29-03) y los endurecimientos opcionales SEC-PR29-04/05/06 quedan
registrados. Sin cambios de producto/BD; CI 6/6.

## Firma

`seguridad-privacidad` (08) — **APROBADO CON OBSERVACIONES** (sin veto) para
`3811e61c479636811f93bd78bf125935b56c8d28` del PR #29 (task-50). Sin secretos reales en
scripts/allowlist, sin relajación de los checks existentes; condiciones SEC-PR29-01/02 y
observaciones 03–06 registradas. Sin `git` de escritura, sin merge y sin publicar tokens/secretos.

---

## Actualización 2026-11-13 — SEC-PR29-02 CERRADO

El usuario confirmó que el check **Seguridad (dependencias y bundle)** ya es **required** en el ruleset proteccion-main (id 26780941): **6 checks required** activos (Guardas, Cliente, Deno, pgTAP, E2E y Seguridad), con approvals 0, 
on_fast_forward/deletion y sin bypass. Condición pre-G1 **SEC-PR29-02 cumplida**; no queda acción pendiente.
