# F1-19 — pgTAP en CI con Supabase local (task-13)

- **Agente:** `devops-github-cloudflare` (07)
- **Fecha:** 2026-11-08 12:44 (America/Mexico_City) · 2026-11-08T18:44Z
- **Tarea:** `task-13` — F1 · pgTAP en CI (servicio Postgres) — follow-up de F1-00,
  **bloqueante de G1** (en paralelo a `task-44` Deno, ya mergeada en #13)
- **PR:** [#14](https://github.com/horaciomartinez-svg/hidria-ect/pull/14) — rama
  `chore/F1-19-ci-pgtap` · base `main@6c1372b` (rebase final tras merge de #15)
- **Entorno:** GitHub Actions `ubuntu-latest` (Docker disponible) + Supabase CLI 3.0.0
- **Commit inicial del PR:** `c222911f45760554c3d3f7efbcb22552a62efd49`

## Resultado: EN CURSO — infraestructura VERDE, bloqueado por 2 defectos SQL preexistentes

El job ya demuestra que la ruta A de QA (`supabase/setup-cli` + `supabase start` +
`db reset` + `test db`) funciona: el stack local de Supabase arranca en el runner y aplica
las migraciones **desde archivos**. El primer run falló en la 16.ª migración por un error de
sintaxis preexistente; el análisis estático detectó además un segundo error en la suite 060.
Ambos se corrigen fuera de este PR (PR #15 del arquitecto, decisión del supervisor). Tras el
merge se rebasa/re-ejecuta este PR para el VERDE final con run id.

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

## 4. Corrección (fuera de este PR, decisión del supervisor)

- **PR #15** del `arquitecto-bd`, rama `fix/F1-01a-migration-comment` (head final `bb5a4e0`):
  **2 archivos, 2 líneas** — comentario de la migración 0030 (excepción a forward-only aprobada
  por seguridad, pendiente ADR-009 del revisor; en BD el comentario es NULL) y `)` faltante en
  el test 060 (sin excepción, no es migración aplicada). `main` base `6c1372b`.
- Este PR **no toca `supabase/migrations/**` ni `supabase/tests/**`**: mantiene el diff CI-only,
  según el write scope de task-13 y la decisión del supervisor.
- Tras mergear #15 en `main`: rebase de `chore/F1-19-ci-pgtap` sobre `main`, re-ejecución del
  job y `reports/` con el run id final.

## 5. Criterios de aceptación (task-13)

- [x] Job reproducible en CI que levanta Supabase local (setup-cli + init + start).
- [x] Aplica las migraciones desde archivos en DB limpia (`supabase start`/`db reset`).
- [ ] `supabase test db` verde con 6 suites / 113 aserciones (pendiente del merge de #15).
- [ ] Run id/URL final en evidencia (pendiente).
- [x] Falla si una suite falla (el job sale != 0; demostrado con D-1).
- [x] Sin secretos: stack local efímero, sin `secrets.*`, `config.toml` generado en el runner
      y no commiteado; PG local con claves deterministas de Supabase local.
- [x] No relaja los jobs existentes ni el ruleset.

## 6. Pendientes / siguiente paso

- [ ] Merge de **PR #15** en `main` (supervisor; pendiente visto bueno/ADR-009 del revisor para
      la parte de migración).
- [ ] Rebase de PR #14 y re-ejecución: `supabase start → db reset → test db`; confirmar
      `ok` de las 6 suites (113 aserciones) y anotar run id/URL.
- [ ] Publicar el check como `pgTAP (Supabase local)`; **no** se añade a
      `required_status_checks` (ruleset `count=0`; requiere permiso de administración del
      usuario). Documentar como no obligatorio hasta que el usuario lo añada.
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

**ROJO temporal** (infraestructura VERDE, bloqueado por 2 defectos SQL preexistentes) → se
actualizará a **VERDE** con el run id definitivo tras el merge de PR #15 y el rebase de este PR.
