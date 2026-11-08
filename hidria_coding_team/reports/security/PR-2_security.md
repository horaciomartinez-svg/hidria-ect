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
`90c77ab95dec5f237c4cea7808efd719434db737` del PR #2. **Vigente también para el head
`09998ef`** tras la confirmación del delta (siguiente sección).

---

## Confirmación delta `90c77ab..09998ef`

- **Fecha:** 2026-11-07 18:33 (America/Mexico_City)
- **Head confirmado:** `09998ef829b8e707fcd93af29656e6dadf65b2f5` — PR #2 con 4 commits,
  95 archivos, +12157/−19, `mergeable_state: clean`
- **Delta revisado:** `90c77ab..09998ef` — **46 archivos, +4985/−107**
- **Veredicto:** **APROBADO CON OBSERVACIONES vigente para `09998ef` — SIN VETO.**
  No hay hallazgos BLOQUEANTES ni MAYORES nuevos ligados al delta (solo higiene MENOR).

### 1. Qué contiene el delta (verificado, coincide con lo declarado)

- **42 archivos `hidria_coding_team/**`**: `TEAM.md`, `agents/03` y `agents/04`,
  `ADR-002` (corregido) y **ADR-003/004/005/006** (nuevos), 19 reportes F0/F1/qa/reviews/
  security, 7 tareas F1 (`F1-00`, `F1-13`…`F1-18`) y correcciones de `BACKLOG`/`F1-08/09/11/12`.
- 1 `qa/trazabilidad.md` (32 reglas), 1 `docs/07` (idempotencia/pgTAP),
  1 `supabase/functions/README.md` (idempotencia opcional) y **1**
  `.github/workflows/ci.yml` (añade `push: branches: ['**']`).
- **Sin `app/**`, sin `supabase/migrations/**`, sin SQL, sin cambios de RLS**, sin `.env`,
  sin `.gitignore`, sin `package*.json` (verificado con `git diff --name-only`). El único
  `.env*` tocado es `hidria_coding_team/.env.example` (se elimina el project ref real del
  comentario; no se añaden valores).

### 2. Controles de seguridad re-ejecutados en `09998ef`

| Control | Resultado |
|---|---|
| Secret scan del árbol trackeado completo (107 archivos) | **0 secretos**; única aparición del header JWT = literal del patrón en `scripts/ci/guardas.sh:29` |
| Secret scan del delta (líneas añadidas) y de los 2 commits nuevos | **0 secretos** (solo texto de mis reportes citando los patrones) |
| `.env` trackeado / en historial | **ninguno** |
| Asignaciones de credenciales con valor en archivos nuevos | **0** |
| CI del head `09998ef` | **4/4 checks `success`** (runs `42430281698` por push y `42430284012` por PR) |

### 3. Hallazgos nuevos del delta (MENORES; no bloquean)

| ID | Severidad | Hallazgo | Acción |
|---|---|---|---|
| **SEC-DELTA-01** | MENOR (privacidad) | **PII en repo público:** `reports/F0/F0-09_devops_cloudflare.md:32` y `:119` publican el nombre/correo del titular de la cuenta Cloudflare. No es secreto, no requiere rotación ni PARO. | Redactar a `<titular de la cuenta>` en el commit de cierre **antes del squash** para que `main` no lo herede; si se mergea sin corregir, tarea inmediata post-merge. |
| **SEC-DELTA-02** | MENOR | `CLOUDFLARE_ACCOUNT_ID` (32 hex) publicado en `reports/F0/00-LEAD-creacion-equipo.md:7` y `reports/F0/F0-09_devops_cloudflare.md:20,32` (el propio reporte lo declara «pública, no secreta»). Es identificador, no credencial. | Redactar por higiene (`<CLOUDFLARE_ACCOUNT_ID>`) junto con SEC-DELTA-01; no urgente. |
| **SEC-DELTA-03** | MENOR | `.github/workflows/ci.yml` ahora corre en `push` a **cualquier** rama: no cambian permisos (`contents: read`) ni hay secretos, pero amplía la superficie de SEC-PR2-02 (si la guarda detecta un secreto, imprime la línea en logs **públicos** de un push de rama). | Mantener el cambio; priorizar el *masking* de SEC-PR2-02 antes de F1. |
| **SEC-DELTA-04** | MENOR (seguimiento) | SEC-PR2-04 **parcial**: se eliminó el project ref real del comentario de `hidria_coding_team/.env.example`, pero quedan 8 variables con comentario en línea tras `=` y la plantilla sigue sin validarse por la guarda 4. | Igual que SEC-PR2-04 (DevOps/Lead). |

### 4. Decisiones del delta con impacto de seguridad (posición de 08)

- **ADR-005 (claims, grants y vista):** alineado con mis hallazgos SEC-F0-05-01/02.
  **Visto bueno de seguridad como propuesta, condicionado** a que `F1-00`: (a) conceda por
  tabla solo lo que RLS autoriza y **nunca** `SELECT` de `quiz_questions` cruda a
  `authenticated`; (b) `anon` quede sin acceso a tablas de negocio (solo catálogos públicos
  si aplica); (c) las 5 vistas analíticas pasen a `security_invoker = true` (H-2) y
  `v_quiz_questions` siga `definer`; (d) incluya pgTAP SEC-01/02/03 de grants/vistas. Sujeto
  a re-revisión del PR que lo implemente.
- **ADR-004 (excepciones E1–E4):** aceptable como excepción temporal **solo** con el guardrail
  declarado: proyecto `zucalshlfcxejpukshxl` como dev/staging con datos **sintéticos** y
  prohibición de cargar datos reales (`restringido_nda`) hasta separar staging↔piloto
  (`docs/06` §8.2). Hoy la base no tiene usuarios ni datos reales (`auth.users=0`,
  `profiles=0`, `quiz_attempts=0`) → no hay incumplimiento actual. Riesgo residual E1
  (`main` sin protección) ya reportado en F0-06.
- **ADR-006 (Realtime en F1):** sin objeción documental; `M-05` (publicación + políticas de
  canales) deberá pasar revisión de seguridad y privacidad antes de implementarse.
- **ADR-003 (plan de fases):** sin impacto de seguridad propio.

### 5. Vigencia

El veredicto **APROBADO CON OBSERVACIONES** del head `90c77ab` **sigue vigente para
`09998ef`**, sin VETO. Recomendación: corregir SEC-DELTA-01/02 (redacción de PII/IDs) en un
commit de la misma rama antes del squash; el resto de observaciones MENORES continúa como
seguimiento (F0-07/F1). No se requiere repetir la revisión completa: basta verificar que la
redacción no altere el resto del delta.
