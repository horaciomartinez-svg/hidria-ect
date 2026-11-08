# F1-19 — pgTAP en CI con Supabase local (task-13)

- **Agente:** `devops-github-cloudflare` (07)
- **Fecha:** 2026-11-08 12:44 (America/Mexico_City) · 2026-11-08T18:44Z
- **Tarea:** `task-13` — F1 · pgTAP en CI (servicio Postgres) — follow-up de F1-00,
  **bloqueante de G1** (en paralelo a `task-44` Deno, ya mergeada en #13)
- **PR:** [#14](https://github.com/horaciomartinez-svg/hidria-ect/pull/14) — rama
  `chore/F1-19-ci-pgtap` · **head final `d69c7e1`** · base `main@1688ba5` (merges #15/#18)
- **Merge:** PR #14 **mergeado (squash) como `1ba8d25398c115c167e36d1db18684eb1d81e0df`**;
  `main` pasa a **`1ba8d25`** y corre con **4 checks** (Guardas, Cliente, Deno, pgTAP)
- **Entorno:** GitHub Actions `ubuntu-latest` (Docker disponible) + Supabase CLI 3.0.0
- **Commit inicial del PR:** `c222911f45760554c3d3f7efbcb22552a62efd49`
- **Actualizado:** 2026-11-08 13:01 (America/Mexico_City) — merge en `main` y post-merge verdes

## Resultado: VERDE — `supabase start` + `db reset` + **6/6 suites, 113 aserciones** (`Result: PASS`)

El job demuestra la ruta A de QA de punta a punta: el stack local de Supabase arranca en el
runner, aplica las **16 migraciones desde archivos** (`supabase start`) y las **re-aplica en
base limpia** (`supabase db reset`); `supabase test db` ejecuta las 6 suites y **113 aserciones**
con `All tests successful` / `Result: PASS`. El run final
([42512258890](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42512258890), job
[128827649988](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42512258890/job/128827649988))
queda **4/4 jobs verdes** (Guardas, Cliente, Deno y pgTAP). El job destapó **3 defectos
preexistentes** (2 de sintaxis SQL y 1 de semántica pgTAP), corregidos en PR #15 y PR #18 por
el arquitecto y ya presentes en `main`. PR #19 (task-18) añadirá una 17.ª migración: cuando
mergee, el job la aplicará sin cambios (basta re-ejecutar).

## 1. Cambio en CI (solo `.github/workflows/ci.yml`)

Se añade un 4.º job, sin tocar los existentes (`guardas`, `cliente`, `functions`):

```yaml
  pgtap:
    name: pgTAP (Supabase local)
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Supabase CLI 3.0.0
        uses: supabase/setup-cli@v1
        with:
          version: 3.0.0
      - name: Inicializar configuración local
        run: supabase init
      - name: Levantar Supabase local
        run: supabase start
      - name: Aplicar migraciones en base limpia
        run: supabase db reset
      - name: Ejecutar suites pgTAP
        run: supabase test db
```

Decisiones:

- **CLI 3.0.0 pin exacto** (última release `v3.0.0`, 2026-11-02). Config por defecto:
  Postgres **17** (`major_version = 17`), coherente con el proyecto remoto (17.11).
- `supabase init` genera `supabase/config.toml` en el runner (el repo no lo tiene); no se
  commitea. En Actions `CI=true`, `init` no es interactivo (verificado localmente con el CLI
  real; crea solo `config.toml` + `.temp/`, y no toca migraciones/tests).
- `supabase start` levanta el stack completo: roles `anon/authenticated/service_role/
  supabase_auth_admin`, `auth.users`/`auth.uid()`, `realtime.messages`/`topic()`, publicación
  `supabase_realtime`, extensiones (`pgtap`, `pgcrypto`, `uuid-ossp`, etc.) y semilla de
  catálogos por migración. Es el baseline que la ruta B (Postgres pelado) no reproduce sin shim.
- `supabase db reset` aplica las **16 migraciones** desde archivos en una DB limpia (requisito
  de `docs/05` §7); `supabase test db` ejecuta las **6 suites** de `supabase/tests/*.sql`
  (010–060; **113 aserciones**: 18+9+9+15+11+51).
- `timeout-minutes: 30` acota el primer pull de imágenes (~1,5 GB) y el arranque.

## 2. Evidencia de infraestructura (primer run, fallo esperado)

| Dato | Valor |
|---|---|
| Run PR | [42510844097](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42510844097) (`pull_request`, head `c222911`, conclusion `failure`) |
| Run push | `42510827066` (`push`, mismo head, conclusion `failure`) |
| Job pgTAP | [128823337521](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42510844097/job/128823337521) — 1 m 13 s |
| Steps | `Setup job` ✅ · `Checkout` ✅ · `Supabase CLI 3.0.0` ✅ · `Inicializar configuración local` ✅ · `Levantar Supabase local` ❌ · `db reset`/`test db` skipped |
| Otros jobs del PR | Guardas ✅ · Cliente ✅ · Edge Functions (Deno) ✅ |

### 2.1 Segundo run tras mergear #15 (head `0e36bbb`, base `7ca0639`)

| Dato | Valor |
|---|---|
| Run PR | [42511711377](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42511711377) (`pull_request`, head `0e36bbb`, conclusion `failure`) |
| Job pgTAP | [128825996527](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42511711377/job/128825996527) — 2 m 00 s |
| Steps | `Setup` ✅ · `Checkout` ✅ · `Supabase CLI 3.0.0` ✅ · `init` ✅ · **`supabase start` ✅** · **`supabase db reset` ✅** · `supabase test db` ❌ |
| Suites | 010 ✅ · 020 ✅ · 030 ✅ · **040 ❌ (2 aserciones de 15)** · 050 ✅ · 060 ✅ |
| Totales | **`Files=6, Tests=113`**; `Result: FAIL` solo por 2 aserciones de 040 |
| Otros jobs | Guardas ✅ · Cliente ✅ · Edge Functions (Deno) ✅ |
| Nota | El log muestra avisos transitorios `toomanyrequests: Rate exceeded` en pulls de Docker (sin efecto en el resultado) |

### 2.2 Run final verde (head `d69c7e1`, base `1688ba5`, tras mergear #18)

| Dato | Valor |
|---|---|
| Run PR | [42512258890](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42512258890) (`pull_request`, head `d69c7e1`, **conclusion `success`**) |
| Run push | `42512256776` (`push`, mismo head, `success`) |
| Job pgTAP | [128827649988](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42512258890/job/128827649988) — **1 m 56 s** (`18:53:46Z` → `18:55:42Z`) |
| Steps | `Setup` ✅ · `Checkout` ✅ · `Supabase CLI 3.0.0` ✅ · `init` ✅ · `start` ✅ · `db reset` ✅ · **`test db` ✅** |
| Suites | 010 ✅ · 020 ✅ · 030 ✅ · 040 ✅ · 050 ✅ · 060 ✅ |
| Totales | **`All tests successful` · `Files=6, Tests=113` · `Result: PASS`** |
| Otros jobs | Guardas ✅ · Cliente ✅ · Edge Functions (Deno) ✅ → **4/4 checks verdes** |
| Migraciones | 16 aplicadas en `supabase start` y **16 re-aplicadas en `supabase db reset`** (33 `Applying migration` en el log: 16+16+seed inicial) |

### 2.3 Merge en `main` y post-merge

| Dato | Valor |
|---|---|
| Merge PR #14 (squash) | **`1ba8d25398c115c167e36d1db18684eb1d81e0df`** → `main` = **`1ba8d25`** |
| Run post-merge de `main` | [42512504691](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42512504691) (`push`, head `1ba8d25`, **success**) |
| Checks post-merge | **4/4**: Guardas ✅ · Cliente ✅ · Edge Functions (Deno) ✅ · **pgTAP (Supabase local) ✅** |
| Job pgTAP canónico | run **42512258890** / job **128827649988**: `All tests successful · Files=6, Tests=113 · Result: PASS` |
| Nota | El commit `d1f333a` (esta evidencia final) se publicó después del merge; este PR documental lo incorpora a `main` sin tocar el workflow. |

El log muestra que el stack se descarga y arranca correctamente (PG `17.11.0.011`, studio,
storage-api, etc.), y que `supabase start` aplica las migraciones desde archivos en orden:

```
Starting database...
Initialising schema...
Seeding globals from roles.sql...
Applying migration 20261031000000_base_hidria_mdohi.sql...          OK
Applying migration 20261031001000_seed_catalogos.sql...             OK
... (15 migraciones OK) ...
Applying migration 20261108020030_f1_01a_fix_roles2.sql...
ERROR: syntax error at or near "]" (SQLSTATE 42601)
At statement: 3
comment on function public.has_any_global_role(text[]) is
  'F1-01a/B1-residual: ... array[''']; ...';
```

## 3. Defectos SQL preexistentes destapados por el job (no son del job)

| # | Archivo:línea | Defecto | Efecto |
|---|---|---|---|
| D-1 | `supabase/migrations/20261108020030_f1_01a_fix_roles2.sql:32` | `array[''']` con **3 comillas** dentro de un literal: `''` es comilla escapada y la 3.ª cierra el string antes de `]` | `42601 syntax error at or near "]"` → `supabase start`/`db reset` aborta |
| D-2 | `supabase/tests/060_f1_01a_auth_claims.sql:53` | falta el `)` de cierre de `ok(...)` antes del `;` | `syntax error at or near ";"` → la suite 060 no parsea y `supabase test db` falla |
| D-3 | `supabase/tests/040_f1_00_enforcement_realtime.sql:41,66` | `throws_ok(sql, 'P0001', 'Gate F6.*', …)` / `'Dictamen bloqueado.*'`: en pgTAP el 3.er argumento de `throws_ok` es el mensaje **exacto**; `.*` no es regex (para patrones existen `throws_like`/`throws_matching`) | 2 aserciones fallan: `caught: P0001: Gate F6: …` vs `wanted: P0001: Gate F6.*` |

D-1 y D-2 son sintaxis (los detecta el parser); D-3 es semántica de pgTAP y solo se ve al
**ejecutar** la suite (por eso el job de CI aporta valor más allá del parser). Los tres son
defectos preexistentes de los tests/migración, no del job.

No se habían visto porque las migraciones se aplicaron **por MCP**, no desde archivos, y las
suites nunca se ejecutaron en CI (excepción documentada en F1-00/QA). La DB remota **no** está
afectada por D-1: `obj_description('public.has_any_global_role(text[])'::regprocedure)` = `NULL`
(verificado por MCP), es decir, el comentario nunca se aplicó; no hay cambio de esquema/función/
datos. D-2 es solo sintaxis del test (sin efecto en la DB).

### 3.1 Análisis estático con parser PostgreSQL real (`pglast` 8.7)

Se parsearon los **22 archivos** (16 migraciones + 6 suites) con `pglast` (parser libpg_query),
que reproduce los errores de sintaxis sin necesidad de Docker:

| Resultado | Archivos |
|---|---|
| Parsean OK | 20/22 |
| Fallan | D-1 (`20261108020030…sql`, `syntax error at or near "]"`) y D-2 (`060_f1_01a_auth_claims.sql:53`, `syntax error at or near ";"`) |
| Tras aplicar los 2 fixes en copia | **22/22 OK, 0 errores** |

Esto permitió anticipar D-2 (que habría fallado después de arreglar D-1) y evitar una segunda
iteración de CI. Comando usado: `pglast.parse_sql(<archivo>)` sobre cada `.sql`.

## 4. Corrección de los defectos (fuera de este PR, decisiones del supervisor)

- **PR #15** del `arquitecto-bd`, rama `fix/F1-01a-migration-comment` (head final `bb5a4e0`):
  **2 archivos, 2 líneas** — comentario de la migración 0030 (excepción a forward-only aprobada
  por seguridad + ADR-009; en BD el comentario es NULL) y `)` faltante en el test 060.
  **Mergeado** como `main@7ca0639`; el run 42511711377 ya aplica las 16 migraciones sin error.
- **D-3 (suite 040):** decisión del supervisor = **opción B**. PR **#18** del `arquitecto-bd`
  (`fix/F1-01a-test-040`, head `05d5972`, 1 archivo, 2 líneas): mantiene `throws_ok` con
  errcode `P0001` y usa el **mensaje exacto** de los triggers (`Gate F6: …`,
  `Dictamen bloqueado: …`), conservando el check de SQLSTATE; `plan(15)` intacto.
  **Mergeado** como `main@1688ba5`; verificado en el run final (§2.2).
- Este PR **no toca `supabase/migrations/**` ni `supabase/tests/**`**: mantiene el diff CI-only,
  según el write scope de task-13 y las decisiones del supervisor.
- Tras mergear el fix de D-3: merge/rebase de `chore/F1-19-ci-pgtap` sobre `main`,
  re-ejecución del job y `reports/` con el run id final.

## 5. Criterios de aceptación (task-13)

- [x] Job reproducible en CI que levanta Supabase local (setup-cli + init + start).
- [x] Aplica las migraciones desde archivos en DB limpia (`supabase start`/`db reset`) —
  run 42511711377 (progreso) y run final 42512258890: `start` ✅ y `db reset` ✅ con las
  16 migraciones.
- [x] `supabase test db` verde con 6 suites / 113 aserciones — run 42512258890:
  **`All tests successful` · `Files=6, Tests=113` · `Result: PASS`**.
- [x] Run id/URL final en evidencia: run **42512258890** / job **128827649988** (§2.2).
- [x] Falla si una suite falla (el job sale != 0; demostrado con D-1 y con D-3).
- [x] Sin secretos: stack local efímero, sin `secrets.*`, `config.toml` generado en el runner
      y no commiteado; PG local con claves deterministas de Supabase local.
- [x] No relaja los jobs existentes ni el ruleset.

## 6. Pendientes / siguiente paso

- [x] Merge de **PR #15** en `main` (`7ca0639`): D-1 y D-2 corregidos y verificados en CI.
- [x] Merge de **PR #18** en `main` (`1688ba5`): D-3 corregido (mensaje exacto con errcode
      `P0001`; opción B del supervisor).
- [x] **PR #14 mergeado** (squash `1ba8d25`); post-merge `main` con **4/4 checks verdes**
      (run 42512504691).
- [ ] Check ya publicado como `pgTAP (Supabase local)` (4.º check del CI). Queda **opcional**
      que el usuario lo añada a `required_status_checks` (no configurable por API con el
      token actual; el ruleset `proteccion-main` ya exige Guardas/Cliente/Deno).
- [ ] QA: actualizar `qa/trazabilidad.md` (pgTAP ejecutado en CI) — fuera de mi write scope.
- [ ] BACKLOG: referencia cruzada task-13 ↔ task-44 / task-49 — Lead/supervisor.
- [ ] O-01 de QA (`migration repair` por `version` MCP distinto del prefijo de archivo) sigue
      vigente para staging; no lo toca este PR. Cuando PR #19 (task-18) mergee, el job aplicará
      la 17.ª migración sin cambios (basta re-ejecutar).

## 7. Seguridad de la evidencia

- Sin tokens ni secretos en logs/reportes; `supabase start` usa claves locales deterministas de
  Supabase local (no credenciales del proyecto remoto).
- `supabase init` crea `supabase/config.toml` y `.temp/` solo en el runner (efímero, gitignored).
- No se ejecutaron migraciones contra la DB remota; el job usa la DB local del runner.

## Veredicto

**VERDE** — run **42512258890** (head `d69c7e1`, base `1688ba5`): `supabase start` ✅,
`supabase db reset` ✅ (16 migraciones desde archivos), `supabase test db` ✅ con
**6/6 suites y 113 aserciones** (`Result: PASS`); 4/4 checks del CI verdes. El job destapó 3
defectos preexistentes (D-1, D-2 sintaxis; D-3 semántica pgTAP), corregidos en PR #15/#18 y
verificados en `main@1688ba5`. **PR #14 mergeado (squash `1ba8d25`)** y post-merge de `main`
verde con 4/4 checks (run 42512504691); **task-13 Hecha**. Queda opcional que el usuario añada
el check a `required_status_checks` (no configurable por API con el token actual).
