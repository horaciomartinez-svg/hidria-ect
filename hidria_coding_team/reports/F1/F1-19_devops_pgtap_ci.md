# F1-19 — pgTAP en CI con Supabase local (task-13)

- **Agente:** `devops-github-cloudflare` (07)
- **Fecha:** 2026-11-08 12:44 (America/Mexico_City) · 2026-11-08T18:44Z
- **Tarea:** `task-13` — F1 · pgTAP en CI (servicio Postgres) — follow-up de F1-00,
  **bloqueante de G1** (en paralelo a `task-44` Deno, ya mergeada en #13)
- **PR:** [#14](https://github.com/horaciomartinez-svg/hidria-ect/pull/14) — rama
  `chore/F1-19-ci-pgtap` · base `main@6c1372b` (rebase final tras merge de #15)
- **Entorno:** GitHub Actions `ubuntu-latest` (Docker disponible) + Supabase CLI 3.0.0
- **Commit inicial del PR:** `c222911f45760554c3d3f7efbcb22552a62efd49`

## Resultado: EN CURSO — infraestructura VERDE (start + db reset OK), 5/6 suites y 113 tests; fallan 2 aserciones por semántica pgTAP

El job demuestra que la ruta A de QA funciona de punta a punta: el stack local de Supabase
arranca en el runner, aplica las **16 migraciones desde archivos** (`supabase start`) y las
re-aplica en base limpia (`supabase db reset`); `supabase test db` ejecuta las 6 suites y
**113 aserciones**. El primer run falló por 2 defectos de sintaxis preexistentes (corregidos
en PR #15, ya en `main`); el segundo run (tras el merge) pasa `start` y `db reset` y deja
**5/6 suites verdes**. Solo fallan 2 aserciones de la suite 040 por un **tercer defecto de
test preexistente**: uso de `throws_ok` como si su tercer argumento fuese regex (pgTAP lo
compara exacto). Se corrige fuera de este PR (PR de test pendiente del arquitecto/QA); después
se rebasa/re-ejecuta para el VERDE final con run id.

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
- **D-3 (suite 040):** decisión del supervisor = **opción B**: PR `fix/F1-01a-test-040`
  (arquitecto) con 2 líneas que mantienen `throws_ok` con errcode `P0001` y usan el **mensaje
  exacto**; conserva el check de SQLSTATE. Pendiente de publicar/mergear al cierre de este
  reporte.
- Este PR **no toca `supabase/migrations/**` ni `supabase/tests/**`**: mantiene el diff CI-only,
  según el write scope de task-13 y las decisiones del supervisor.
- Tras mergear el fix de D-3: merge/rebase de `chore/F1-19-ci-pgtap` sobre `main`,
  re-ejecución del job y `reports/` con el run id final.

## 5. Criterios de aceptación (task-13)

- [x] Job reproducible en CI que levanta Supabase local (setup-cli + init + start).
- [x] Aplica las migraciones desde archivos en DB limpia (`supabase start`/`db reset`) —
  run 42511711377: `start` ✅ y `db reset` ✅ con las 16 migraciones.
- [ ] `supabase test db` verde con 6 suites / 113 aserciones: **5/6 suites y 113 tests
  ejecutados**; pendiente el fix de D-3 (2 aserciones) y la re-ejecución.
- [ ] Run id/URL final en evidencia (run de progreso: 42511711377; final pendiente).
- [x] Falla si una suite falla (el job sale != 0; demostrado con D-1 y con D-3).
- [x] Sin secretos: stack local efímero, sin `secrets.*`, `config.toml` generado en el runner
      y no commiteado; PG local con claves deterministas de Supabase local.
- [x] No relaja los jobs existentes ni el ruleset.

## 6. Pendientes / siguiente paso

- [x] Merge de **PR #15** en `main` (`7ca0639`): D-1 y D-2 corregidos y verificados en CI.
- [ ] Merge del PR `fix/F1-01a-test-040` (D-3, mensaje exacto con errcode `P0001`; decisión
      del supervisor = opción B).
- [ ] Merge/rebase de PR #14 y re-ejecución: `supabase start → db reset → test db`; confirmar
      6/6 suites y 113 aserciones, y anotar run id/URL final.
- [ ] Publicar el check como `pgTAP (Supabase local)`; **no** se añade a
      `required_status_checks` por API (requiere permiso de administración del usuario; el
      ruleset `proteccion-main` ya exige Guardas/Cliente/Deno). Documentar como no obligatorio
      hasta que el usuario lo añada.
- [ ] QA: actualizar `qa/trazabilidad.md` (pgTAP ejecutado en CI) — fuera de mi write scope.
- [ ] BACKLOG: referencia cruzada task-13 ↔ task-44 / task-49 — Lead/supervisor.
- [ ] O-01 de QA (`migration repair` por `version` MCP distinto del prefijo de archivo) sigue
      vigente para staging; no lo toca este PR.

## 7. Seguridad de la evidencia

- Sin tokens ni secretos en logs/reportes; `supabase start` usa claves locales deterministas de
  Supabase local (no credenciales del proyecto remoto).
- `supabase init` crea `supabase/config.toml` y `.temp/` solo en el runner (efímero, gitignored).
- No se ejecutaron migraciones contra la DB remota; el job usa la DB local del runner.

## Veredicto

**EN CURSO** — infraestructura **VERDE** (`start` + `db reset` + 16 migraciones desde archivos),
5/6 suites y 113 tests ejecutados; solo 2 aserciones de la suite 040 fallan por D-3 (semántica
`throws_ok`). Se actualizará a **VERDE** con el run id definitivo tras mergear el fix de D-3 y
re-ejecutar este PR (esperado: 6/6 suites, 113 aserciones).
