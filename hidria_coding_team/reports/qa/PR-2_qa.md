# PR #2 — QA: `chore/f0-fundacion` → `main`

- **Agente:** `qa-tester` (05)
- **Fecha:** 2026-11-07 18:20 (America/Mexico_City)
- **PR:** [#2](https://github.com/horaciomartinez-svg/hidria-ect/pull/2) — «chore(f0): fundación del equipo autónomo, monorepo y CI mínima»
- **Head evaluado:** `90c77ab95dec5f237c4cea7808efd719434db737` · **Base:** `main` `f6b99ce10d8f71e9b0f08e70debeea6e5f630a87`
- **Diff:** 65 archivos, +7279 / −19, 2 commits · `mergeable_state=clean` (consulta MCP al momento de QA)
- **Entorno:** local Windows (PowerShell 5.1; sin bash/Docker) + GitHub Actions `ubuntu-latest`
- **Tarea:** `task-5` — F0 · QA: CI y matriz de trazabilidad

## Resultado: VERDE (Fase 0)

> **Qué significa:** el PR de Fase 0 (scaffold + gobierno del equipo + CI mínima) cumple
> los criterios de QA aplicables **a su fase**: CI verde, guardas verdes, estructura
> correcta, sin secretos versionados y matriz de trazabilidad revisada.
>
> **Qué NO significa:** no hay veredicto funcional. No existe producto que probar
> (0 suites ejecutables, 0 Edge Functions, 0 pruebas pgTAP, `app/` solo landing). Declarar
> «gates metodológicos en verde» sería improcedente y no se hace. La cobertura funcional
> queda como gate de F1+.
>
> QA aprueba el merge **condicionado** a que `revisor-especificaciones` y
> `seguridad-privacidad` aprueben. **QA no mergea**; el merge lo ejecuta `supervisor-hidria`.

## 1. Alcance revisado

| Área | Contenido del PR | Evaluación QA |
|---|---|---|
| CI | `.github/workflows/ci.yml` (2 jobs), `scripts/ci/guardas.sh`, plantilla de PR | Revisada y ejecutada (CI + replicación local) — §3 |
| Gobierno | `hidria_coding_team/TEAM.md`, 8 instrucciones de agente, backlog F0/F1, plantillas de reportes/ADR, `.env.example` del equipo | Estructura completa y coherente; sin secretos — §4 |
| Cliente | `app/` scaffold React 18 + TS + Vite + Tailwind; `package.json` raíz con workspaces; `package-lock.json` | `lint/typecheck/build` verdes — §3 |
| Datos | `docs/02` y migración base byte-idénticos (sin cambios de esquema en este PR) | Hash verificado — §4 |
| Pruebas | `tests/README.md` y `supabase/tests/README.md` (solo convenciones) | Correcto para F0; **no hay suites** — §2 |
| Legales / marcas | `.env.example` sin valores; nomenclatura SDFI/SRHDS/UCI | Sin hallazgos — §4 |
| Trazabilidad | `qa/trazabilidad.md` (22 reglas en el head del PR) | Revisada contra `docs/05`; ampliada por QA en el working tree — §5 |
| Docs | `docs/07` precisión de idempotencia + fix de forward references | Solo lectura; sin contradicción relevante para QA |

No se revisan aquí con profundidad los criterios de *spec review* ni de *security review*:
son responsabilidad de `revisor-especificaciones` y `seguridad-privacidad`
(`reports/reviews/PR-2_spec.md`, `reports/security/PR-2_security.md`).

## 2. Suites aplicables al PR (mapa honesto)

`docs/05` define ~90 casos (más 4 PRIV en `docs/06`); **ninguno es ejecutable en F0**:

| Nivel | Casos definidos | Aplicables a este PR | Resultado |
|---|---|---|---|
| pgTAP (PG/BHE/IVOH/CUS/LB/CAT/DOC/SEC) | 50 | 0 | **N/A** — `supabase/tests/` solo README, sin runner pgTAP |
| Reporte (RPT-01…04) | 4 | 0 | **N/A** — sin EF-07/PDF/R2 |
| Contrato API (API-00…04) | 5 | 0 | **N/A** — `supabase/functions/` solo README |
| Unitarias (`UNIT-*`) | 0 definidos | 0 | **N/A** — `docs/05` no define casos (hueco H-1 de la matriz) |
| E2E-01…12 | 12 | 0 | **N/A** — sin auth/router/datos/UI |
| Offline OFF-01…04 | 4 | 0 | **N/A** — sin PWA/SW/Dexie |
| Realtime RT-01/02 | 2 | 0 | **N/A** — sin canales |
| XLS-01/02 | 2 | 0 | **N/A** — sin EF-09 |
| Aula AUL-01…03 | 3 | 0 | **N/A** — sin EF-11/banco |
| Rendimiento PER-01…04 | 4 | 0 | **N/A** — sin staging/dataset |
| Privacidad PRIV-01…04 (`docs/06`) | 4 | 0 | **N/A** — sin buzón ARCO en cliente |
| Piloto CAP-01…04 | 4 | 0 | **N/A** — sin entorno piloto |
| **CI + guardas + build** | — | **sí** | **VERDE** (§3) |

**Conclusión de cobertura:** 0/94 casos de producto ejecutables. La validación de este PR
es de **infraestructura y estructura**, no de gates metodológicos.

## 3. Evidencia ejecutada

### 3.1 CI del PR (MCP GitHub)

| Check | Resultado | Duración | Job |
|---|---|---|---|
| Guardas de repositorio | **success** | 3 s | [128564175440](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42425963485/job/128564175440) |
| Cliente (lint + typecheck + build) | **success** | 49 s | [128564175630](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42425963485/job/128564175630) |

Run [42425963485](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42425963485):
`pull_request`, `conclusion=success`, `head_sha=90c77ab…` = head del PR, 2/2 checks verdes.

### 3.2 Local (mismo commit)

| Comando | Resultado | Salida |
|---|---|---|
| `npm run lint` | exit 0 | ESLint sin errores/warnings |
| `npm run typecheck` | exit 0 | `tsc --noEmit` limpio |
| `npm run build` | exit 0 | Vite 5.4.21, 31 módulos, 144.78 kB JS (46.81 kB gzip), 2.02 s |
| replicación de `scripts/ci/guardas.sh` (6 guardas) | 6/6 OK | ver `reports/F0/F0-07_qa_ci.md` §4 |
| `hidria_coding_team/scripts/phase0_verify.ps1` | **VERDE** (exit 0) | `.env` fuera de git, variables presentes (solo longitud), `.gitignore`, hash `docs/02`, `.env.example` |

> Limitación declarada: el host no tiene `bash`, así que `bash scripts/ci/guardas.sh` no se
> ejecutó localmente; sus 6 comprobaciones se replicaron con `git`/PowerShell y la
> ejecución canónica está en el job de CI (verde).

### 3.3 Estructura y seguridad de repositorio

- `.env` existe en local, **no trackeado** y en `.gitignore` (`.gitignore:4`).
- `.env.example` raíz: todas las variables sensibles vacías; solo valores públicos (buckets,
  flag `NOM151_ENABLED=false`, repo GitHub). Sin `service_role` en `app/src` ni en el bundle.
- Sin `git ls-files` de `.env`, `node_modules/`, `dist/`, `coverage/`, `.temp/`, `.wrangler/`.
- `supabase/.temp/` y `reference/` ignorados; `app/dist` generado por build e ignorado.
- Nomenclatura prohibida (`UAT-CIT`, denominación antigua de la SRHDS) ausente de `app/` y
  `supabase/`.
- `docs/02` == migración base: SHA-256 `2A7B6F8888040990B109F580F6BE50F7F03BF7D9FF7B2299D7BD50BC85442CB5`.
- `ci.yml` no referencia `secrets.*` → no hay superficie de fuga en logs de CI.

## 4. Matriz de trazabilidad: revisión vs `docs/05`

- El PR incluye `qa/trazabilidad.md` con **22 reglas**. Contraste con `docs/05` §2–§9:
  - Cobertura correcta en gates genéricos, CAT, BHE, IVOH, RPT, custodia, bitácora,
    folios, idempotencia, offline, RLS, aula, Realtime.
  - **Faltaban** reglas/casos: gate F4 (IIH `verificado_v1`, PG-05/06), «sin saltos de fase y
    rol requerido» (PG-10/11), inmutabilidad de pesos IVOH (IVOH-05), importador XLSX
    (XLS-01/02), contrato API-01…04, rendimiento PER-01…04, aceptación CAP-01…04,
    eventos Realtime por payload, cola FIFO/`captured_at` (OFF-02) y unitarias `UNIT-*`.
  - Algunas filas citaban casos equivocados (p. ej. R-05/R-06: IVOH-02 es el caso del
    trigger, no el de la fórmula). Corregido.
- **Acción QA:** `qa/trazabilidad.md` actualizada en el **working tree** a 32 reglas
  (R-01…R-32), con estado de ejecución por suite (94 casos definidos, 0 ejecutables) y
  huecos de plan H-1…H-7. **Este cambio no está en el head `90c77ab` del PR #2** (el PR se
  abrió antes); requiere commit en rama propia (p. ej. `test/f0-trazabilidad` o la rama de
  la tarea que el supervisor determine) antes de considerarse mergeado. QA no hace
  commit/push por regla dura.
- **No se inventaron resultados:** todas las filas de producto quedan `pendiente`, sin
  evidencia, porque no hay artefacto que ejecutar.

## 5. Defectos y observaciones

### Defectos bloqueantes
Ninguno. No se encontró secreto versionado, `.env` en git, artefacto de build trackeado,
divergencia `docs/02`↔migración ni fallo de CI.

### Observaciones (no bloquean F0; plan F1)
1. **CI endurecimiento (F0-07 H-01…H-06):** secret scan con patrones limitados (sin
   `sb_secret_…` ni tokens Cloudflare/R2, sin historial); nomenclatura solo en
   `app/`/`supabase/` (TEAM §10.4 exige docs/commits y `UAT` aislado con allowlist);
   `.env.example` del equipo sin validar; artefactos de test/`.tsbuildinfo` fuera de la
   guarda; actions por tag, sin `timeout`, sin `persist-credentials: false`; Node CI 22 vs
   local 24. Detalle: `reports/F0/F0-07_qa_ci.md` §5.
2. **Sin job de pruebas de producto en CI** (pgTAP/unitarias/contrato): esperado en F0,
   pero `docs/05` §8 (punto 1) ya lo exige; planificar en F1.
3. **Inconsistencias documentales para el revisor** (no son defectos del PR):
   - `docs/04` §8: `RATE_LIMIT` 100 req/min vs `docs/05` API-04: 120 req/min (H-3 matriz).
   - `docs/05` API-00 exige 409 con misma `Idempotency-Key` y distinto payload; `docs/04`
     §2.3 no lo define (H-4).
   - `docs/05` §2 cita RPT-01…RPT-03 pero §4.1 define RPT-04 (H-5).
   - `docs/05` cita `UNIT-*` sin definir IDs/casos (H-1).
   - `PRIV-01…04` solo en `docs/06` §12; `docs/05` §2 no los incorpora (H-2).
   - `TEAM.md` §8 remite a `scripts/phase0-verify.ps1` inexistente; el real es
     `hidria_coding_team/scripts/phase0_verify.ps1` (H-09).
4. **Riesgo de proceso:** el PR #2 incluye `qa/trazabilidad.md` y este veredicto lo
   actualiza después; si se mergea sin subir la actualización, `main` quedará con la
   matriz de 22 reglas hasta el PR de seguimiento. QA lo reporta, no lo corrige por su
   cuenta (no hace commits).

## 6. Checklist de aprobación QA (`agents/05_qa_tester.md` §5)

| Criterio | Estado | Nota |
|---|---|---|
| Suites aplicables ejecutadas y en verde | ✓ (aplicables = CI/guardas/build) | 0 suites de producto existen aún |
| Sin regresiones en suites previamente verdes | ✓ | No había suites previas; CI base verde |
| Matriz de trazabilidad actualizada | ✓ en working tree | 32 reglas + estado por suite; pendiente commit (§4) |
| Gates metodológicos probados (bloqueante + feliz) | **N/A** | Sin producto; no evaluable hasta F1 |
| SEC-05 (`quiz_questions`) | **N/A** | Sin API/UI; se verifica en F1 |
| API-00 (idempotencia) | **N/A** | Sin EF; se verifica en F1 |
| OFF-01 (gate offline) | **N/A** | Sin PWA; se verifica en F1 |

Cumplidos los criterios evaluables → **VERDE de Fase 0**.

## 7. Lo que queda para F1 (no se puede aprobar sin esto)

- [ ] Job pgTAP en CI con servicio Postgres y suites PG/BHE/IVOH/CUS/LB/CAT/DOC/SEC
      (50 casos) — con `throws_ok` de mensajes canónicos.
- [ ] Suites de contrato API-00…04 contra staging para las 13 EF.
- [ ] Vitest para cálculos (IVOH, brecha), parsers XLSX y LWW; `docs/05` debe definir los
      casos `UNIT-*`.
- [ ] Playwright E2E-01…12, OFF-01…04 y RT-01/02 en staging (nightly).
- [ ] Despliegue a staging + smoke de QA (folios, gates, RLS) y evidencia en `reports/`.
- [ ] Endurecer guardas de CI (H-01…H-06) y resolver inconsistencias documentales
      (H-3…H-5) antes de implementar los contratos afectados.
- [ ] Convertir filas de `qa/trazabilidad.md` a `verde` **solo** con evidencia de ejecución
      (comando, salida, entorno, fecha). Prohibido declarar verde funcional sin suite.

## Firma

QA `qa-tester` — veredicto **VERDE (Fase 0)** para el PR #2 en el commit `90c77ab`.
Sin cambios en `app/**` ni `.github/**`; solo `qa/trazabilidad.md` (working tree) y
reportes de QA. Pendiente: aprobaciones de spec/security y merge por `supervisor-hidria`.

## Confirmación delta `09998ef` (2026-11-07 18:42, America/Mexico_City)

**Motivo:** el veredicto anterior se emitió sobre `90c77ab`; el PR #2 avanzó a
`09998ef829b8e707fcd93af29656e6dadf65b2f5` (4 commits, 95 archivos vs base, +12157/−19,
`mergeable_state=clean`). Se verifica el delta y el CI del nuevo head.

### Delta `90c77ab..09998ef` (46 archivos, +4985/−107)

| Área | Cambio verificado |
|---|---|
| `.github/workflows/ci.yml` | `push.branches` pasa de `[main]` a `['**']` (CI también en push de cualquier rama). `pull_request` hacia `main`, `permissions: contents: read` y jobs sin cambios. |
| `docs/07` | Aclara que la aplicación limpia desde cero se validará con pgTAP en CI (job de Fase 1, `docs/05` §7); sin cambio de contrato. |
| `qa/trazabilidad.md` | 22 → **32 reglas** (+96/−24). La versión en `09998ef` **coincide exactamente con el working tree de QA** (`git diff` vacío): la nota de §4 sobre «pendiente de commit» **queda resuelta**, ya está versionada. |
| `supabase/functions/README.md` | Aclara `Idempotency-Key` opcional según `docs/04` §2.3 y obligatorio en operaciones de cola offline; no cambia contrato. |
| Gobierno | `TEAM.md`, agentes 03/04, `ADR-002` modificado y `ADR-003…006` nuevos, backlog y tareas F0/F1, 14 reportes F0 + reportes F1/review/security/QA. |
| **Producto** | **Sin cambios en `app/**` ni en `supabase/migrations/**`** (`git diff --name-only 90c77ab..09998ef -- app supabase/migrations` → vacío). |
| Esquema | `docs/02` y migración base **sin cambios** y byte-idénticos: SHA-256 `2A7B6F8888040990B109F580F6BE50F7F03BF7D9FF7B2299D7BD50BC85442CB5`. |

### CI en `09998ef` (MCP GitHub `get_check_runs`, PR #2)

| Run | Evento | Checks | Resultado |
|---|---|---|---|
| [42430281698](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42430281698) | `push` | Guardas + Cliente | **2/2 success** (guardas 4 s; cliente 18 s) |
| [42430284012](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42430284012) | `pull_request` | Guardas + Cliente | **2/2 success** (guardas 3 s; cliente 16 s) |

Ambos runs con `head_sha=09998ef829b8e707fcd93af29656e6dadf65b2f5` (= head actual del PR).

### Re-ejecución local en HEAD `09998ef`

| Comando / guarda | Resultado |
|---|---|
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 (Vite 5.4.21, 31 módulos, 144.78 kB JS) |
| Secret scan de archivos trackeados | sin coincidencias |
| `.env` trackeado / artefactos versionados | no / ninguno |
| `docs/02` ↔ migración base | SHA-256 idéntico |

### Veredicto

**VERDE (Fase 0) SIGUE VIGENTE para `09998ef`.** El delta es documental/config, no toca
código de producto ni migraciones, el CI está verde en el nuevo head y no introduce
secretos ni artefactos. No hay regresión ni motivo para reabrir el veredicto. Persisten sin
cambios las observaciones H-01…H-09 de `reports/F0/F0-07_qa_ci.md` y los huecos
documentales H-1…H-7 de `qa/trazabilidad.md`; la cobertura funcional sigue siendo **0/94
casos ejecutables** (todo F1+). Sigue siendo un VERDE de Fase 0, no funcional, y el merge
continúa condicionado a spec review + security review; QA no mergea.

**Observación nueva (no bloqueante):** con `push.branches: ['**']` cada push a la rama del
PR dispara **dos** runs (`push` + `pull_request`), ambos verdes pero duplicando minutos de
CI; puede acotarse `push` a `main`/`develop` o compartir `concurrency` entre ambos eventos.

**Estado de este anexo:** añadido en el working tree sobre `09998ef`; QA no hace
commit/push (regla dura). Queda para el commit del PR de seguimiento o el squash del
supervisor.
