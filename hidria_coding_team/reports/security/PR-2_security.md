# PR #2 — Revisión de Seguridad y Privacidad

- **Agente:** `seguridad-privacidad` (08) — autoridad de **veto**
- **Fecha:** 2026-11-07 18:16 (America/Mexico_City)
- **PR:** [#2](https://github.com/horaciomartinez-svg/hidria-ect/pull/2) — «chore(f0): fundación del equipo autónomo, monorepo y CI mínima», `chore/f0-fundacion` → `main`
- **Head revisado:** `90c77ab95dec5f237c4cea7808efd719434db737` · **Base:** `main` `f6b99ce10d8f71e9b0f08e70debeea6e5f630a87`
- **Diff:** 65 archivos, +7279 / −19, 2 commits · `mergeable_state: clean`
- **CI:** run `42425963485` — **2/2 checks verdes** («Guardas de repositorio» 3 s, «Cliente (lint+typecheck+build)» 49 s)
- **Revisiones previas de este PR:** ninguna (la lista de reviews de GitHub está vacía); esta es la primera aprobación registrada.
- **Entorno:** local Windows (PowerShell 5.1, sin bash/Docker) + MCP GitHub y MCP Supabase (solo lectura)
- **Alcance:** diff completo del head, árbol trackeado, historial git, CI/workflow, plantillas, `app/dist` local y estado del proyecto Supabase en lo que toca al PR.

## Veredicto: **APROBADO CON OBSERVACIONES** — sin VETO

No existe ningún hallazgo **BLOQUEANTE** en el diff: no hay secretos versionados, `.env` no
está trackeado, `.env.example` no contiene valores, no hay `service_role` en el cliente ni en
el bundle, los textos legales de `docs/06` no se modifican, no hay datos personales ni datos
reales, y CI corre con permisos mínimos sin secretos. El merge puede ejecutarlo
`supervisor-hidria` (squash) una vez que se complete el cuórum (aprobación de
`revisor-especificaciones`; QA ya emitió VERDE). Las 5 observaciones son **MENOR** y se
resuelven en tareas de seguimiento; no condicionan este merge.

> Veto: **no se ejerce**. Ninguna de las causales de veto de `agents/08` §4 está presente.
> Se registran además 2 riesgos residuales **externos al diff** (§5) que el Lead debe
> encaminar: privilegios DML del esquema (F0-04/F1) y ausencia de protección de `main`
> (F0-06, ya reportada como AMARILLO).

## 1. Checklist de seguridad aplicado al PR #2 (`agents/08_seguridad_privacidad.md` §3)

| Bloque | Ítem | Resultado | Evidencia |
|---|---|---|---|
| 3.1 Secretos | `.env` no versionado; `.env.example` sin valores | ✅ | §2.1, §2.2 |
| 3.1 | Sin `service_role`, claves R2, tokens GitHub/Cloudflare en código, tests, docs, logs o historial del PR | ✅ | §2.1, §2.3 |
| 3.1 | Guarda de secretos de CI verde; diff completo revisado (altas/modificaciones; no hay borrados ni renombrados) | ✅ | §2.3, §2.4 |
| 3.1 | `service_role` solo en `.env`/secrets/CI; nunca en `VITE_*` ni en el bundle | ✅ | §2.2, §2.5 |
| 3.2 RLS / multi-tenancy | Tablas nuevas con RLS y políticas; tablas hijas con `EXISTS`; sin `using (true)` sin justificación; pruebas SEC | **N/A en el diff** (el PR no toca `supabase/migrations/**` ni SQL) — ver §5.1 | §2.6 |
| 3.3 Datos personales / privacidad | Textos legales **verbatim** de `docs/06`; aviso en login/perfil; ARCO | Sin cambios de `docs/06`; **gap de planificación** (SEC-PR2-05) | §3 |
| 3.3 | Sin datos reales; staging sintético; sin telemetría ni terceros; sin PII en logs | ✅ (el PR no introduce datos ni telemetría) | §2.6 |
| 3.4 Banco de preguntas | `correcta` no accesible a `authenticated`/cliente; `v_quiz_questions` solo 4 columnas; examen server-side | **N/A en el diff**; verificado en base → `reports/F0/F0-05_seguridad_quiz.md` | §5.1 |
| 3.5 Infraestructura | Headers/WAF/R2 (aún no hay despliegue), secretos por entorno | N/A en F0 (F0-09); CI con permisos mínimos ✅ | §2.4 |

## 2. Comandos y evidencia

### 2.1 Secretos en el diff, el árbol y el historial (0 hallazgos reales)

| # | Comprobación | Resultado |
|---|---|---|
| 1 | `git ls-files --error-unmatch -- .env` | **exit 1** — `.env` no está versionado |
| 2 | `git check-ignore -v .env` | `.gitignore:4:.env` |
| 3 | `git rev-list --all --objects \| Select-String '\.env'` | solo los 2 `.env.example`; **ningún objeto `.env`** |
| 4 | `git log --all --oneline -- .env` | sin salida |
| 5 | `git grep` patrones (`eyJhbGci…`, JWT, `ghp_`, `github_pat_`, `sbp_`, PEM, `AKIA`, `xox…`, `sk-…`, `"role":"service_role"`) sobre 77 archivos trackeados | 0 tokens reales; única aparición del header JWT = literal del patrón en `scripts/ci/guardas.sh:29` |
| 6 | `git log -p -3` y `git log -p --all` filtrados por los mismos patrones | 0 secretos en los 5 commits del historial |
| 7 | Diff del PR (`git diff f6b99ce..90c77ab`) filtrado por patrones | 0 secretos; solo el literal del patrón y una línea de plantilla sin valor |
| 8 | `package-lock.json`: `_authToken`, `npm_…`, `://usuario:clave@` | 0 coincidencias; `resolved` solo de `registry.npmjs.org` |
| 9 | `.git/config` local: `extraheader`/`url.*.insteadOf`/credenciales en remoto | 0; remoto HTTPS sin credenciales embebidas |

### 2.2 Cliente (`app/**`) y bundle local (`app/dist/**`)

- `app/` (11 archivos, 4 de ellos en `app/src/`): sin cliente Supabase todavía; `vite-env.d.ts:4-5` solo declara
  `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (públicas por diseño). **0** referencias a
  `service_role`, `GITHUB_TOKEN`, `CLOUDFLARE_*` o `R2_*`.
- `app/vite.config.ts:11-14`: `sourcemap: false`.
- `app/dist/**` (build local, **no trackeado**; `git ls-files -- app/dist` = 0): 3 archivos,
  0 archivos `.map`, **0** coincidencias de `service_role`, `ghp_`, `github_pat_`, `sbp_`,
  PEM ni JWT. No hay claves embebidas.
- `app/package.json`: dependencias estándar (React 18, Vite 5, Tailwind 3, ESLint/TS);
  ninguna que requiera secretos.

### 2.3 Plantillas `.env.example`

| Archivo | Resultado |
|---|---|
| `.env.example:1-39` (raíz) | Todas las variables sensibles **vacías**; únicos valores públicos: repo GitHub, nombres de buckets R2, `NOM151_ENABLED=false`. ✅ |
| `hidria_coding_team/.env.example:1-46` | Inventario de variables, **sin valores reales**. ✅ (higiene en SEC-PR2-04) |

### 2.4 Workflow de CI (`.github/workflows/ci.yml`) y guardas

| Aspecto | Resultado |
|---|---|
| Permisos | `permissions: contents: read` (l. 9-10), aplica a los 2 jobs. ✅ |
| Uso de secretos | `git grep 'secrets\.' -- .github/**` = 0; no hay `env:` con credenciales ni `echo` de variables. ✅ |
| Riesgo de fuga en logs | El workflow no imprime secretos; ver SEC-PR2-02 para el caso de fallo de la guarda. |
| Único workflow | `.github/workflows/` solo contiene `ci.yml`. ✅ |
| Checks del PR | 2/2 `success` (run `42425963485`, head `90c77ab`). ✅ |
| Pinning | Actions por *tag* (`@v4`), no por SHA; `persist-credentials` por defecto; sin `timeout-minutes` → SEC-PR2-03. |

### 2.5 Historial del PR y borrados/renombrados

- 2 commits (`90c77ab`, `91e05f8`), 65 archivos: **62 altas** y **3 modificaciones**
  (`.gitignore`, `README.md`, `docs/07`), **0 borrados y 0 renombrados**; no hay archivos
  eliminados que pudieran ocultar una filtración.
- `docs/02` y la migración base **no** se tocan en este PR (integridad `docs/02`↔migración
  verificada por CI, guarda 3, verde).

### 2.6 Datos personales / datos reales

- El PR no añade formularios, capturas, seeds, fixtures ni telemetría: no incorpora datos
  personales ni datos reales de empresas.
- `app/src/App.tsx` es una *landing* de fundación; no hay login, ni PWA, ni Dexie, ni
  almacenamiento en IndexedDB todavía (F1). Sin exposición de PII en logs.
- Textos legales: `docs/06` no se modifica (no hay paráfrasis, alteración ni «mejora» del
  aviso de privacidad ni del procedimiento ARCO). ✅

## 3. Hallazgos

### BLOQUEANTES

**Ninguno.** No hay secreto expuesto, ni RLS ausente/incorrecta introducida por el PR, ni
`service_role` en el cliente, ni texto legal alterado, ni datos reales en staging.

### MAYORES

**Ninguno en el diff del PR.** Los dos riesgos MAYORES detectados son externos al diff y se
documentan en §5 como residuales (no bloquean el merge de este PR de fundación).

### MENORES (seguimiento; no condicionan el merge)

| ID | Archivo:línea | Hallazgo | Acción requerida |
|---|---|---|---|
| **SEC-PR2-01** | `scripts/ci/guardas.sh:30`, `:51-56` | Cobertura incompleta del secret scan: excluye `.env.example` (`:(exclude).env.example`) y la guarda 4 solo valida `.env.example` **raíz**; `hidria_coding_team/.env.example` no se valida con la comprobación `VAR=valor`. No se escanea historial. | Quitar la exclusión, extender la guarda 4 a la plantilla del equipo y añadir escaneo de historial (gitleaks/trufflehog o `git log -p` con patrones) — DevOps, F0-07. |
| **SEC-PR2-02** | `scripts/ci/guardas.sh:31-32` | En caso de fallo, la guarda imprime las líneas coincidentes (`git grep … \| head -20`) en logs **públicos** de Actions: podría publicar el secreto detectado. | Imprimir solo `archivo:línea` y el patrón, nunca el contenido — DevOps. |
| **SEC-PR2-03** | `.github/workflows/ci.yml:22`, `:32-36` | Endurecimiento de supply chain: `actions/checkout@v4` y `actions/setup-node@v4` sin fijar por SHA; `persist-credentials` por defecto (`true`); sin `timeout-minutes`. Con `contents: read` y sin secretos el impacto es bajo. | Fijar por SHA, `persist-credentials: false`, `timeout-minutes` (coincide con QA F0-07 H-01…H-06) — DevOps. |
| **SEC-PR2-04** | `hidria_coding_team/.env.example:11-24` | 8 variables usan comentario **en línea** tras `=` (`VITE_SUPABASE_URL=  # …`). Copiar la plantilla a `.env` produce valores contaminados con la descripción y, además, impide validarla con la guarda 4. | Mover comentarios a líneas propias / dejar `=` sin texto — Lead/DevOps. |
| **SEC-PR2-05** | `hidria_coding_team/tasks/F1/F1-01_auth_claims.md` (pantalla login), `qa/trazabilidad.md:27` (R-20) | **Privacidad — gap de planificación:** el PR añade el backlog F1 y la matriz R-20 (`PRIV-01…04`, aviso de privacidad y ARCO verbatim) pero **ninguna tarea F1** cubre el aviso de privacidad visible en login/perfil, el addendum ARCO de `docs/06` §12 ni los casos PRIV-01…04. `docs/06` §4.2 lo exige antes de publicar la plataforma. | Crear tarea F1 (o ampliar F1-01/F1-02) para: aviso verbatim versionado, buzón ARCO con folio `ARCO-AAAA-NNNN` y plazos, y pruebas PRIV-01…04 — Lead + `revisor-especificaciones`; seguimiento de esta revisión. |

### Observaciones (no hallazgos de seguridad)

- El cuerpo del PR cita `reports/F0/00-LEAD-creacion-equipo.md`, que **no existe** en el head
  del PR (`git ls-files` no lo lista). No es un riesgo de seguridad; lo atiende el revisor de
  especificaciones.
- `qa/trazabilidad.md` aparece modificado en el *working tree* local por QA (32 reglas) pero
  **no** en el head `90c77ab` (22 reglas). La revisión se hizo contra el head, no contra el
  working tree.

## 4. Veredicto formal

**APROBADO CON OBSERVACIONES.** Habilitado para el merge por `supervisor-hidria` (squash)
cuando se cumpla el cuórum de `TEAM.md` §6: aprobación de `revisor-especificaciones` + esta
aprobación de seguridad + CI verde (ya verde) + QA (ya VERDE). Las observaciones SEC-PR2-01…05
no son condiciones de merge: se ejecutan como tareas de seguimiento (F0-07 / F1) y no afectan
la seguridad actual del repositorio público.

## 5. Riesgos residuales externos al diff (escalados al Lead; no bloquean PR #2)

### 5.1 Ausencia de privilegios DML para roles de API en el esquema `public` (MAYOR)

Detectado verificando F0-05 contra `zucalshlfcxejpukshxl` (detalle en
`reports/F0/F0-05_seguridad_quiz.md`, SEC-F0-05-01): los roles `anon`, `authenticated` y
`service_role` solo tienen `TRUNCATE/REFERENCES/TRIGGER/MAINTAIN` sobre las tablas de
`public`; ninguna tabla de negocio es accesible por PostgREST (falla cerrado, sin fuga) y
`service_role` no puede administrar `quiz_questions` ni calificar (EF-11). El PR #2 no toca
migraciones; debe resolverlo `arquitecto-bd` en F0-04/F1 con una migración correctiva, sin
otorgar `SELECT` de la tabla cruda del banco a `authenticated`.

### 5.2 `main` sin protección (MAYOR de control de proceso)

Según `reports/F0/F0-06_supervisor_branch_protection.md` (AMARILLO), `main` no tiene
protección clásica, ni rulesets, ni *required status checks* con el token actual. El merge de
este PR depende de la disciplina del equipo (CI verde + 2 aprobaciones), no de un control
técnico. Riesgo de proceso, no del diff; ya escalado por `supervisor-hidria` al usuario.

## 6. Limitaciones de esta revisión

- Host sin `bash`: `scripts/ci/guardas.sh` no se ejecutó localmente; su ejecución canónica
  está en CI (job verde) y sus comprobaciones se replicaron con `git`/PowerShell.
- La seguridad del **esquema/RLS** (44 tablas) no es parte del diff de este PR; se revisa en
  F0-04/F0-05. Aquí solo se cruzó el estado del banco de preguntas por ser regla dura.
- No se creó ni usó un usuario autenticado (F0 solo lectura, `auth.users = 0`): la prueba
  PostgREST con JWT de usuario queda para QA/F1 (SEC-05).

## Firma

`seguridad-privacidad` (08) — **APROBADO CON OBSERVACIONES**, sin veto, para el head
`90c77ab95dec5f237c4cea7808efd719434db737` del PR #2.
