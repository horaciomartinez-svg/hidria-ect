# HIDRIA — Equipo de Desarrollo Autónomo (hidria_coding_team)

> **Versión 1.0 · 2026-11-08 · SDFI–SRHDS, Gobierno del Estado de Tamaulipas**
> Equipo de **8 agentes de IA** que construye la plataforma HIDRIA (metodología MD-OHI)
> desde cero hasta el despliegue en **staging**, sin revisión humana paso a paso.
> El humano (usuario) interviene **únicamente** si se cumple una condición de PARO (§12).

---

## 1. Misión

Construir, probar, revisar y desplegar la plataforma **HIDRIA** —digitalización de la
Metodología de Diagnóstico para la Optimización Hídrica Industrial (MD-OHI)— con el
siguiente stack congelado:

| Capa | Tecnología |
|---|---|
| Cliente | React 18 + TypeScript + Vite + Tailwind · **PWA offline-first** (service worker + Dexie/IndexedDB, LWW por campo, cola con `client_op_id`; **jamás** encolar gates) |
| Datos / Auth | Supabase: Postgres multi-tenant (`organization_id` + RLS), Auth con custom claims, Edge Functions (Deno), Realtime, Vault |
| Entrega / Storage | Cloudflare Pages (`*.pages.dev` mientras no haya zona), R2 (`hidria-docs`, `hidria-reports`), WAF |
| Enforcement | **RLS primero**; triggers como enforcement final; Edge Functions solo para transacciones multi-tabla, gates con side effects, integraciones externas y cálculo server-side |

**Resultado esperado:** Fase 0 → Fase 1 (MVP núcleo) → Fase 2 → Fase 3 (piloto),
según `docs/07-Plan-de-Migracion-y-Despliegue-HIDRIA-MD-OHI.md`, con todas las
pruebas de `docs/05` en verde (son **gate de release**).

---

## 2. Principios rectores

1. **Autonomía con evidencia.** Ningún paso se declara hecho sin evidencia en `reports/`.
   "Funciona en mi máquina" no es evidencia; el comando, la salida y el commit sí lo son.
2. **`docs/` es la fuente única de verdad.** Código y SQL se derivan de los documentos.
   Si el código contradice un documento, gana el documento. Si el documento es ambiguo,
   se abre un ADR en `decisions/` y lo resuelve el revisor de especificaciones.
3. **Seguridad por diseño.** El repositorio es **público**: `service_role` NUNCA en el
   cliente ni en el repo; `.env` NUNCA versionado; cada PR pasa secret scan.
4. **RLS es la frontera.** Toda tabla de negocio nace con RLS + políticas por tenant y por
   membresía al diagnóstico. El cliente no es confiable.
5. **Los gates metodológicos son duros.** No se negocian por conveniencia de entrega:
   IVOH, brecha BHE, matriz 10/10, cadena de custodia, bitácora ≤ 24 h y folios
   server-side se implementan exactamente como en `docs/04` y `docs/05`.
6. **Migraciones forward-only e idempotentes.** Nunca se edita una migración aplicada;
   se agrega la migración correctiva siguiente. `docs/02` y la migración base deben ser
   **byte-idénticos** (verificado por CI).
7. **Trazabilidad.** Cada tarea, PR, revisión, decisión y despliegue tiene ID, dueño,
   evidencia y fecha. El `audit_log` de la aplicación es el mismo principio en runtime.

---

## 3. Gobierno documental (orden de lectura OBLIGATORIO)

1. `docs/Arquitectura HIDRIA-ECT con MD-OHI v2.0.md` — visión, módulos M1–M13, roadmap.
2. `docs/01-Diseño-Base-de-Datos-HIDRIA-MD-OHI.md` — modelo de datos y matriz RLS.
3. `docs/02-supabase_schema_hidria_mdohi.sql` — DDL; **fuente última de verdad del esquema**.
4. `docs/04-Contratos-API-y-Tablas-de-Decision-HIDRIA-MD-OHI.md` — EF-01…EF-13, TD-1…TD-8,
   catálogo de errores, contrato de sincronización offline.
5. `docs/05-Plan-de-Pruebas-HIDRIA-MD-OHI.md` — pgTAP, contrato, unitarias, E2E y matriz
   de trazabilidad regla→casos.
6. `docs/06-Gobernanza-y-Privacidad-HIDRIA-MD-OHI.md` — ARCO, addendum SQL, plazo de 72 h.
7. `docs/07-Plan-de-Migracion-y-Despliegue-HIDRIA-MD-OHI.md` — fases F0–F3, runbooks.
8. `docs/08-Contenido-del-Aula-y-Banco-de-Preguntas-HIDRIA-MD-OHI.md`.
9. `docs/00-Glosario-de-Siglas-HIDRIA-MD-OHI.md` — **leer primero las siglas**.

**Precedencia:** `docs/02` (DDL) > `docs/01` (modelo) > `docs/04` (contratos) >
`docs/05` (pruebas) > arquitectura (visión). Ante contradicción, el revisor de
especificaciones decide y documenta en `decisions/`.

---

## 4. Decisiones de arquitectura CONGELADAS (no se reevalúan)

Estas decisiones ya fueron tomadas por la Coordinación. Ningún agente las reabre; si un
requisito parece exigir cambiarlas, se escala como condición de PARO o se documenta un ADR
de excepción aprobado por el supervisor **y** el revisor de especificaciones.

- Cliente **React 18 + TS + Vite + Tailwind, PWA offline-first** (SW + Dexie; LWW por campo;
  cola con `client_op_id`; los gates EF-01…EF-07, EF-10, EF-12 **nunca** se encolan).
- **Supabase** Postgres multi-tenant (`organization_id` + RLS), Auth con custom claims
  (`organization_id`, `global_role`), Edge Functions Deno EF-01…EF-13, Realtime, Vault.
- **Cloudflare** Pages (`*.pages.dev` por ahora; `CLOUDFLARE_ZONE` está vacío), R2
  (buckets `hidria-docs`, `hidria-reports`), WAF.
- **Enforcement:** RLS primero; triggers `check_phase_gate`, `trg_ivoh_requires_bhe`,
  `trg_custody_gate`, `trg_logbook_immutable`, `trg_ivoh_version_immutable`,
  `trg_audit_hash`; Edge Functions solo para transacciones multi-tabla, gates con side
  effects, integraciones externas y cálculo server-side.
- **Banco de preguntas:** `quiz_questions` cruda solo con `service_role`; `authenticated`
  solo ve `v_quiz_questions`; exámenes calificados server-side (EF-11), opciones barajadas.
- **Datos reales** solo en entorno `piloto`, clasificación `restringido_nda`; local y
  staging usan datos sintéticos.
- **Textos legales** (aviso de privacidad, ARCO) **verbatim** de `docs/06`.

---

## 5. Reglas metodológicas DURAS (implementación exacta)

| Regla | Definición operativa | Enforcement |
|---|---|---|
| **IVOH** | `0.15·F1 + 0.20·F2 + 0.20·F3 + 0.20·F4 + 0.15·F5 + 0.10·F6` | EF-06 / `v_ivoh_score` / trigger `trg_ivoh_requires_bhe` |
| **Semáforo IVOH** | `< 5` rojo · `5 – 7.9` amarillo · `≥ 8` verde | EF-06, UI M8 |
| **Brecha BHE** | brecha mensual `> 10 %` **BLOQUEA** la validación R3 | EF-05 (409 canónico) + `v_bhe_monthly` |
| **Reporte** | Emisión solo con matriz de completitud **10/10** | EF-07 + `v_diagnostic_completeness` |
| **Custodia** | Dictamen de laboratorio requiere **3 transferencias firmadas** | trigger `trg_custody_gate` + EF-10 |
| **Bitácora** | Cierre dentro de **≤ 24 h**; cierre tardío exige `cerrada_razon` | EF-02 / `trg_logbook_immutable` |
| **Folios** | **Solo del lado servidor** (`MDOHI-AAAA-NNN`, `-R1`, evidencias, ARCO) | EF + secuencias; nunca el cliente |
| **Checklist** | Validación en R1, no por correo | EF-03 + TD-2 |
| **Offline** | Gates requieren conexión; el botón de validación se deshabilita con hint | Cliente + EF (409/422) |

---

## 6. Los 8 agentes

| # | Agente | Archivo | Un solo trabajo | Escribe (write scope) | NO hace |
|---|---|---|---|---|---|
| 01 | **Supervisor HIDRIA** | `agents/01_supervisor_hidria.md` | Orquestar, asignar, desbloquear, **único que mergea a `main`**; mantener `reports/` y tablero | `reports/**`, `tasks/**` (estado), merge PR | No programa features ni aprueba su propio trabajo |
| 02 | **Arquitecto BD** | `agents/02_arquitecto_bd.md` | DDL, migraciones idempotentes, RLS, triggers, pgTAP, vistas | `supabase/migrations/**`, `supabase/tests/**`, `supabase/seed.sql` | No toca cliente ni EF |
| 03 | **Dev Edge Functions** | `agents/03_dev_edge_functions.md` | EF-01…EF-13 según `docs/04`: idempotencia, folios server-side, errores canónicos, auditoría en la misma transacción | `supabase/functions/**` | No modifica esquema sin migración del arquitecto |
| 04 | **Dev Frontend PWA** | `agents/04_dev_frontend_pwa.md` | React PWA M1–M13: CAT/IIH/BHE/IVOH UI, bitácora, aula, Dexie sync, Realtime | `app/**` | No inventa endpoints ni reglas; consume contratos |
| 05 | **QA Tester** | `agents/05_qa_tester.md` | Ejecuta `docs/05`: pgTAP en CI, contrato, unitarias, E2E Playwright; mantiene matriz de trazabilidad | `tests/**`, `supabase/tests/**` (solo lectura si es del arquitecto), `qa/**`, `reports/qa/**`, `.github` (solo lectura) | No corrige producto; reporta |
| 06 | **Revisor de Especificaciones** | `agents/06_revisor_especificaciones.md` | Revisa cada PR contra `docs/04` y docs metodológicos; aprueba/rechaza **con evidencia** | `reports/reviews/**`, `decisions/**` | **No programa** |
| 07 | **DevOps GitHub/Cloudflare** | `agents/07_devops_github_cloudflare.md` | CI/CD, Pages/R2/WAF (`npx wrangler`), secretos de EF (`supabase secrets set`), runbooks `docs/07` | `.github/**`, `infra/**`, `wrangler.toml`, `scripts/**`, `reports/deploy/**` | No mergea a `main` |
| 08 | **Seguridad y Privacidad** | `agents/08_seguridad_privacidad.md` | Revisión de seguridad por PR: RLS, secret scanning, nada de `service_role` en cliente, cumplimiento `docs/06` | `reports/security/**` | **No programa**; puede **vetar** merges |

**Cuórum mínimo de revisión de un PR:** 1 aprobación del **Revisor de Especificaciones** +
1 aprobación del **Seguridad y Privacidad** + **QA verde** (CI). El **Supervisor** es el
único que ejecuta el merge; si falta cualquiera de las tres, no hay merge.

---

## 7. Bucle autónomo (sin humanos entre pasos)

```
PLAN → ASSIGN → IMPLEMENT → PR → SPEC REVIEW → SECURITY REVIEW → QA → MERGE → DEPLOY STAGING → VERIFY
  ▲                                                                                              │
  └──────────────────────────────  reports/ + decisions/  ◄──────────────────────────────────────┘
```

| Paso | Dueño | Salida |
|---|---|---|
| **PLAN** | Supervisor + Revisor | Tareas priorizadas en `tasks/` (una por archivo MD), con dependencias |
| **ASSIGN** | Supervisor | Tarea reclamada en el tablero compartido + mensaje al agente con contexto |
| **IMPLEMENT** | Devs / Arquitecto / DevOps | Rama `feature/…` o `fix/…`, commits atómicos, PR |
| **PR** | Autor | PR con plantilla `.github/PULL_REQUEST_TEMPLATE.md`, checks de CI, evidencia |
| **SPEC REVIEW** | Revisor | Aprobación o cambios solicitados, con cita a la sección del documento |
| **SECURITY REVIEW** | Seguridad | Aprobación o veto, con evidencia (RLS, secretos, `docs/06`) |
| **QA** | QA Tester | Suite aplicable en verde + trazabilidad actualizada |
| **MERGE** | Supervisor | Squash merge a `main` (o `develop` cuando exista) tras CI verde, 2 revisiones del equipo **y la aprobación humana que exige el ruleset** |
| **DEPLOY STAGING** | DevOps | Pages + Supabase staging + R2; URL y versión en `reports/` |
| **VERIFY** | QA + Supervisor | Smoke/E2E de staging; si falla, se revierte y se abre incidente |

**Regla de oro:** ningún agente puede aprobar su propio PR, ni mergear, ni saltarse QA.
El supervisor **no** programa; si detecta un defecto, abre tarea para el dueño.

---

## 8. Ramas, commits, PRs y CI

- **Ramas:** `feature/F1-07-cat-m4`, `fix/F0-06-branch-protection`, `chore/F0-fundacion`,
  `docs/…`, `test/…`. Siempre desde `main` actualizado.
- **`main` protegida (ruleset `proteccion-main`, activo desde 2026-11-07 19:24):** PR
  obligatorio, **1 aprobación de review de GitHub**, required checks
  `Guardas de repositorio` + `Cliente (lint + typecheck + build)`, sin force push, sin
  borrado. `bypass_actors: []`.
- **Merge con el ruleset vigente:** `required_approving_review_count = 0` (aplicado
  2026-11-07 19:51), **manteniendo** los required checks y la prohibición de force push. El
  merge lo autorizan el CI obligatorio + el cuórum del equipo (spec + seguridad + QA con
  evidencia en `reports/` y comentario de revisión en el PR) y lo ejecuta el supervisor
  (squash).
- **Control humano:** es por **auditoría de reportes y comentarios de revisión**, no por
  aprobación formal de GitHub (con un solo colaborador, GitHub prohíbe la auto-aprobación).
- **Si el usuario no dispone de segunda identidad:** debe ajustar el ruleset (bypass actor,
  `required_approving_review_count = 0`, o segundo colaborador). Es una acción del usuario,
  no del equipo.
- **Commits:** Conventional Commits en español/inglés estable:
  `feat(ef-07): emisión de reporte con folio -R1` · `fix(rls): política de tablas hijas` ·
  `test(pgtap): gate de fase` · `docs(07): …`. Un commit = un cambio coherente.
- **Prohibido** commitear: `.env`, claves, tokens, `node_modules/`, `dist/`, artefactos de
  build, capturas temporales, `supabase/.temp/`, `.wrangler/`.
- **CI mínima** (`.github/workflows/ci.yml`): guardas de secretos + `.env.example` sin valores +
  `docs/02` byte-idéntico a la migración base + nomenclatura prohibida + lint/typecheck/build
  del cliente. Debe estar **verde** para mergear.
- **Secret scanning:** cada PR ejecuta la guarda de secretos; además, antes de cada push el
  autor ejecuta `hidria_coding_team/scripts/phase0_verify.ps1` (local) o
  `scripts/ci/guardas.sh` (CI/Linux).

---

## 9. Entornos y secretos

| Entorno | Supabase | Cloudflare | Datos | Uso |
|---|---|---|---|---|
| `local` | CLI/Docker o proyecto de desarrollo | — | sintéticos | desarrollo y pruebas |
| `staging` | proyecto dedicado *(pendiente: requiere credencial de Supabase; ver ADR-004)* | Pages `*.pages.dev`, R2 `hidria-staging` | sintéticos (30 empresas / 60 diagnósticos) | contratos, E2E, offline |
| `piloto` | proyecto del Programa (`zucalshlfcxejpukshxl`) | Pages/R2 SDFI | **reales** `restringido_nda` | aceptación CAP-01…04 |

> **Estado F0 (ADR-004):** no existe todavía un proyecto Supabase de `staging` separado del
> `piloto`. Mientras el usuario lo provisione, el proyecto `zucalshlfcxejpukshxl` se usa
> como **dev/staging con datos sintéticos**; queda **prohibido cargar datos reales**
> (`restringido_nda`) hasta la separación staging↔piloto.

- `.env` vive solo en `C:\Proyectos\hidria\.env` (ignorado por git). Plantilla sin valores:
  `.env.example` (raíz) e inventario del equipo `hidria_coding_team/.env.example`.
- **`service_role`**: solo en `.env`, en *secrets* de Edge Functions y en CI. **Nunca** en
  el cliente, nunca en el repo, nunca en capturas.
- **Cloudflare:** usar `npx wrangler` con `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`
  del `.env`. `CLOUDFLARE_ZONE` está vacío → URLs `*.pages.dev`.
- **Supabase Edge Functions:** secretos con `supabase secrets set` (nunca en el repo).
- **R2:** `hidria-docs` (documentos) y `hidria-reports` (reportes); URLs prefirmadas.
- Si un secreto se filtra: **PARO inmediato**, revocar, rotar, reportar (§12.3).

---

## 10. Artefactos y convenciones

### 10.1 `tasks/` — backlog versionado
Un archivo Markdown por tarea: `tasks/F0/F0-04_esquema-verificado.md`. Cabecera YAML:

```yaml
id: F0-04
fase: F0
titulo: Verificar esquema, RLS y seeds en Supabase
owner: arquitecto-bd
estado: pendiente        # pendiente | en_progreso | bloqueada | hecha
prioridad: P0            # P0 (gate) | P1 | P2
deps: [F0-02, F0-03]
write_scope: ["reports/F0/F0-04_*"]
evidencia: ["reports/F0/F0-04_arquitecto-bd_esquema.md"]
```

Cuerpo: objetivo, contexto, pasos, criterios de aceptación (verificables), evidencia
esperada, riesgos. `tasks/BACKLOG.md` es el índice vivo.

### 10.2 `reports/` — evidencia
`reports/F0/F0-04_arquitecto-bd_esquema.md`, `reports/reviews/PR-<n>_spec.md`, etc.
Cada reporte incluye: tarea, agente, fecha/hora, comandos ejecutados, salida relevante
(recortada), conclusión **VERDE / AMARILLO / ROJO**, pendientes y siguiente paso.
Plantilla: `reports/README.md`.

### 10.3 `decisions/` — ADRs
`decisions/ADR-000-plantilla.md`; numeración secuencial, estado
`propuesta | aceptada | rechazada | sustituida`. Toda desviación de `docs/` exige ADR.

### 10.4 Nomenclatura institucional (obligatoria)
- **Responsable:** **SDFI** — Subsecretaría de Desarrollo y Fomento Industrial, órgano
  desconcentrado de la **SRHDS** (Secretaría de Recursos Hidráulicos para el Desarrollo
  Social), Gobierno del Estado de Tamaulipas.
- **Equipo académico:** **UCI** — Universidades y Centros de Innovación.
- **PROHIBIDO** en código, docs, UI y commits: `UAT`, `UAT-CIT`,
  `Subsecretaría de Recursos Hídricos y Desarrollo Sustentable`. (La UAT es una
  institución participante *dentro de* UCI; nunca el nombre del equipo.)

---

## 11. Comunicación y trabajo en Agent Teams

- **Tablero compartido:** las tareas activas se crean con `team_task_create` y se reclaman
  con `team_task_update` (claim con la revisión actual). El backlog en `tasks/` es la
  fuente de verdad; el tablero es el mecanismo de asignación en vivo.
- **Mensajes:** `send_message` con contexto completo (tarea, rama, PR, evidencia, qué se
  espera). Un mensaje sin criterio de aceptación no es una asignación.
- **Escritura:** cada agente escribe **solo** en su `write_scope`. Si necesita tocar el
  archivo de otro, pide cambio al dueño o al supervisor. El workspace es compartido: los
  conflictos de archivo se resuelven coordinando, no sobrescribiendo.
- **Git:** solo el autor de la tarea hace commit/push de su rama. **Solo el supervisor**
  ejecuta merges a `main`. Nadie hace `git push --force`. Ningún agente ejecuta comandos
  destructivos sobre `main` o sobre la base de datos sin tarea explícita.

---

## 12. Condiciones de PARO (las ÚNICAS que requieren humano)

El equipo se detiene por completo y reporta al usuario si ocurre cualquiera de estas:

1. **Credencial faltante o inválida tras 3 reintentos documentados** (GitHub, Supabase,
   Cloudflare). Evidencia: los 3 intentos en `reports/`.
2. **Fallo de gate metodológico irresoluble tras 3 intentos** con evidencia (p. ej., la
   regla de brecha o la matriz 10/10 no puede implementarse sin cambiar `docs/`).
3. **Sospecha de fuga de secretos** (token/clave en un commit, log o artefacto):
   detener todo, revocar/rotar el secreto, reportar. No se sigue hasta confirmación.
4. **Proyecto completo** (Fase 3 / piloto aceptado) o fin de alcance solicitado.

Fuera de estas cuatro, el equipo **resuelve solo**: ambigüedad documental → ADR; defecto →
tarea `fix/`; CI roja → se corrige antes de mergear; bloqueo técnico → el supervisor
reasigna y documenta.

---

## 13. Definición de Hecho (DoD) y gates

Un entregable está **Hecho** cuando:

- [ ] Cumple los criterios de aceptación de su tarea (verificables).
- [ ] Tiene evidencia en `reports/` con conclusión VERDE.
- [ ] CI verde en el PR (guardas + lint/typecheck/build + suites aplicables).
- [ ] Aprobado por Revisor de Especificaciones **y** Seguridad (cuando aplique).
- [ ] Trazabilidad actualizada: regla de `docs/05` → caso de prueba → resultado.
- [ ] Sin secretos, sin TODOs sin dueño, sin código muerto.
- [ ] Mergeado por el supervisor (squash) y, si aplica, desplegado a staging y verificado.

**Gates de fase:**

| Gate | Criterio de salida |
|---|---|
| **G0 — Fase 0** | Entorno validado: MCP operativos, `.env` OK, 3 migraciones, seeds, RLS 44/44, CI, monorepo, `.env.example`. **Estado real: AMARILLO-OPERATIVO**; E1 **RESUELTA** (ruleset `proteccion-main`); excepciones abiertas **E2–E4** de `ADR-004` (staging, auth hook, acta 0.6) |
| **G1 — MVP núcleo** | **ADR-003:** M1–M8 + M9 mínimo + M10–M11; EF-01…EF-09 (EF-07 esencial con folio `-R1`) + captura mínima de custodia/lab/alternativas (F1-13/F1-14/F1-15); **RT-01/02** (Realtime, F1-17); E2E-01/02/03/05/07/08, SEC-01…05, API-00…04 verdes |
| **G2 — Completa** | EF-10 (custodia/laboratorio completo), EF-11 + M12 (aula), EF-12 (reprogramación), insignia OB3, reportes completos (M9 avanzado), M7 completo |
| **G3 — Piloto** | EF-07 completo (matriz 10/10 con M9 avanzado), EF-13 tras `NOM151_ENABLED`, CAP-01…04 |

---

## 14. Estado actual y siguiente tarea

- **Fase:** F0 cerrada (G0 AMARILLO-OPERATIVO; **E1 y E3 resueltas**; E2/E4 abiertas);
  **F1-00 cerrada** (`b4fbc83`) y **F1-01 cerrada** (`e21a665` + `424ca01`); **F1-02 en curso**
  (task-43, shell PWA).
- **Tablero:** ver `tasks/BACKLOG.md`.
- **Última actualización:** 2026-11-07 20:45 — `main` = `424ca01`; **F1-01 completa**
  (auth/claims DB + middleware EF, 58 pruebas Deno); ruleset con
  `required_approving_review_count = 0` y checks obligatorios.
- **Siguiente tarea:** **F1-02** (shell PWA: router M1–M13, layout/sesión, PWA, login con
  claims ADR-005); follow-ups: `task-13` + `task-44` (pgTAP y Deno en CI) antes de G1,
  `task-18` (RES-1) antes de F1-04, `task-15` (ARCO), `task-27`/`task-28` (seed/guarda CI),
  `task-35` (alcance del rol `invitado`), `task-39` (Q-08 EF-08).

---

## 15. Prohibiciones duras (resumen ejecutivo)

1. `service_role` en cliente, repo, PR, captura o log → **PARO**.
2. `.env` o cualquier secreto versionado → **PARO**.
3. Merge a `main` sin CI verde + 2 aprobaciones → prohibido.
4. Reabrir una decisión de arquitectura congelada (§4) → prohibido.
5. Usar `UAT`, `UAT-CIT` o la denominación antigua de la SRHDS → prohibido.
6. Exponer `quiz_questions.correcta` a `authenticated` o al cliente → prohibido.
7. Encolar gates offline o validar gates sin conexión → prohibido.
8. Folios generados en el cliente → prohibido.
9. Editar una migración ya aplicada → prohibido (migración correctiva).
10. Aprobar el propio PR o auto-asignarse revisión → prohibido.

---

*Fin de TEAM.md — este documento gobierna a los 8 agentes. Cualquier cambio requiere
aprobación del Supervisor y del Revisor de Especificaciones, y queda en `decisions/`.*
