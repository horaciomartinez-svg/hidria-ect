# F0-12 — Estado del supervisor y checklist G0 (preparación)

- **Agente:** supervisor-hidria
- **Fecha:** 2026-11-07 18:14 (America/Mexico_City)
- **Tarea:** `tasks/F0/F0-12_gate_g0.md` (preparación; **gate no cerrado**)
- **Rama / PR:** `chore/f0-fundacion` / #2 — <https://github.com/horaciomartinez-svg/hidria-ect/pull/2>
- **Entorno:** GitHub API + repo local `C:\Proyectos\hidria`
- **Commit:** `90c77ab95dec5f237c4cea7808efd719434db737` (HEAD del PR #2); `main` = `f6b99ce10d8f71e9b0f08e70debeea6e5f630a87`

## Resultado: AMARILLO (G0 NO cerrado)

Este documento es un **corte de preparación** del gate G0. Al momento de escribirlo
(2026-11-07 18:14) **solo existe evidencia de F0-06** en `reports/F0/`; los reportes de
F0-01…F0-05 y F0-07…F0-11 están siendo producidos por los dueños en paralelo. El gate se
cerrará cuando todos los ítems tengan evidencia propia, el PR #2 tenga las 2 aprobaciones y
el merge se ejecute. Aquí se registra el estado real, no el deseado.

## Checklist G0 — estado real

Leyenda: **VERDE** = evidencia y criterio cumplidos · **AMARILLO** = parcial o con
pendiente documentado · **PENDIENTE** = sin reporte en `reports/` a este corte ·
**ROJO** = bloquea.

| Ítem | Criterio G0 | Evidencia disponible (este corte) | Estado |
|---|---|---|---|
| F0-01 | MCP GitHub operativo y alcance documentado | Evidencia colateral en `reports/F0/F0-06_supervisor_branch_protection.md`: token válido para repo/PR/checks; **403** en `GET .../protection` y GraphQL `branchProtectionRules` → sin permiso **Administration**. Falta reporte de devops. | **AMARILLO** |
| F0-02 | MCP Supabase, proyecto y 3 migraciones aplicadas | Pre-verificado por el Lead al asignar (3 migraciones aplicadas; ref `zucalshlfcxejpukshxl`); **sin reporte propio aún**. | **PENDIENTE** |
| F0-03 | `.env` fuera de git y secret scan limpio | Parcial vía CI: job **Guardas de repositorio** en verde en el PR #2 (`.env` no trackeado, `.env.example` versionado, sin patrones de secreto en archivos trackeados, sin artefactos). Falta barrido de historial y reporte formal de seguridad. | **AMARILLO** |
| F0-04 | 44 tablas / 44 RLS / 6 vistas / seeds / triggers | Pre-verificado por el Lead (44/44 con RLS, 6 vistas, seeds); sin reporte del arquitecto aún. | **PENDIENTE** |
| F0-05 | Banco de preguntas protegido | Pre-verificado por el Lead (`authenticated` sin SELECT en `quiz_questions`; con SELECT en `v_quiz_questions`); sin reporte de seguridad aún. | **PENDIENTE** |
| F0-06 | Protección de `main` verificada | `reports/F0/F0-06_supervisor_branch_protection.md`: **`main` NO protegida**; 3 intentos documentados; token sin permiso de administración; controles compensatorios. | **AMARILLO (NO PROTEGIDA)** |
| F0-07 | CI mínima en verde | `.github/workflows/ci.yml` con 2 jobs; en el commit `90c77ab` ambos `success`: *Guardas de repositorio* y *Cliente (lint + typecheck + build)*. Verificado por REST. Faltan reportes de devops y QA. | **AMARILLO** |
| F0-08 | Monorepo y `.env.example` | Entregado en el PR #2 (65 archivos, +7279/−19; `.env.example` raíz y del equipo). Requiere verificación del revisor y merge. | **AMARILLO** |
| F0-09 | Cloudflare R2 (`hidria-docs`, `hidria-reports`) y Pages | Sin reporte aún (riesgo: credencial Cloudflare). | **PENDIENTE** |
| F0-10 | Auth hook `custom_access_token_hook` preparado | Sin reporte aún (diseño del arquitecto; sin DDL). | **PENDIENTE** |
| F0-11 | Equipo constituido (8 agentes + `TEAM.md` + backlog) | Entregado en el PR #2 (`hidria_coding_team/`); pendiente verificación del revisor y merge. | **AMARILLO** |
| F0-12 | Gate G0 cerrado | Este reporte: **no cerrado**. Requiere ítems anteriores + PR #2 mergeado. | **AMARILLO** |

Estado consolidado: **G0 = AMARILLO** (nada en ROJO; 2 bloqueos P0 abiertos: protección de
`main` y revisión/merge del PR #2).

## PR #2 — estado y decisión de merge **propuesta** (no ejecutada)

Datos verificados vía REST (2026-11-07 ~17:39):

| Campo | Valor |
|---|---|
| Estado | `open`, `merged: false`, `draft: false` |
| Base / head | `main` (`f6b99ce`) ← `chore/f0-fundacion` (`90c77ab`) |
| Mergeabilidad | `mergeable: true`, **`mergeable_state: "clean"`** |
| Cambios | `commits: 2`, `changed_files: 65`, `+7279 / −19` |
| CI | 2/2 checks `success` (*Guardas de repositorio*, *Cliente*) |
| Revisiones | `reviews: []` → **0 aprobaciones**; 0 comentarios; 0 revisores solicitados |
| Título | `chore(f0): fundación del equipo autónomo, monorepo y CI mínima` |

**Decisión propuesta: MERGE CONDICIONADO (squash), sin ejecutar todavía.** Se mergea solo
cuando se cumpla **todo** lo siguiente:

1. `reports/reviews/PR-2_spec.md` con **APROBADO** (revisor de especificaciones).
2. `reports/security/PR-2_security.md` con **APROBADO** (sin veto; secretos y RLS).
3. `reports/qa/PR-2_qa.md` con **VERDE** (CI + lo aplicable de `docs/05`).
4. HEAD del PR sin cambios respecto de `90c77ab`; si hay commit nuevo → CI re-ejecutada
   verde y revisiones sobre el nuevo SHA.
5. Confirmación explícita del Lead para ejecutar el merge (este reporte **no** autoriza
   por sí solo; el Lead pidió no mergear en esta ronda).
6. Squash con mensaje Conventional Commits y `main` al día; sin `force push`.

**Nota sobre `main` sin protección:** el merge es técnicamente posible y no está bloqueado
por GitHub (`mergeable_state: clean`). Los controles compensatorios de F0-06 (solo el
supervisor mergea, CI verde, 2 revisiones registradas en `reports/`) son la garantía real
hasta que el usuario active la protección (ver F0-06, "Acción requerida").

## Riesgos y bloqueos

| # | Riesgo | Impacto | Mitigación / dueño |
|---|---|---|---|
| R1 | `main` sin protección + token sin permiso de administración | Push directo o `--force` posible; G0 formalmente incompleto | Acción del usuario (activar protección o emitir PAT con Administration) o ADR de excepción; supervisor verifica de nuevo |
| R2 | PR #2 sin aprobaciones aún | No hay merge conforme a `TEAM.md` §6 | Revisor + seguridad + QA en curso; el supervisor no mergea hasta tenerlas |
| R3 | Reportes F0-01…F0-11 aún no consolidados | G0 no puede declararse VERDE | Cementar al recibir cada reporte; este documento se actualiza |
| R4 | Anotaciones de CI: warning "Node.js 20 deprecated" y aviso "ubuntu-latest → Ubuntu 26" | No afecta el resultado (checks en `success`); deuda menor | DevOps puede subir `actions/checkout@v5`/`setup-node@v5` en una tarea de CI posterior |
| R5 | `docs/02` ↔ migración base byte-idénticos | Verificado por la guarda de CI en el PR #2; el revisor debe confirmarlo en su revisión | Revisor de especificaciones |

## Siguiente tarea propuesta de Fase 1: **F1-01**

Una vez cerrado G0, la siguiente tarea es **F1-01 — Auth con custom claims y roles**
(ya está en `tasks/BACKLOG.md`, dueño `arquitecto-bd` + `dev-edge-functions`). Propuesta de
alcance concreto, según `TEAM.md` §4 y §6:

- **ID:** F1-01 · **Fase:** F1 · **Prioridad:** P0 (bloquea F1-02…F1-12).
- **Dueño principal:** `arquitecto-bd` (DDL/RLS/pgTAP). Apoyo: `dev-edge-functions`
  (contrato de sesión y `_shared/`), sin escribir el mismo archivo.
- **Deps:** F0-12 (G0) y F0-10 (diseño del hook, sin DDL).
- **Write scope:** `supabase/migrations/**` (migración **nueva**, forward-only y
  idempotente), `supabase/tests/**`, `supabase/seed.sql`, `reports/F1/F1-01_*`.
- **Entregables/criterios de aceptación:**
  1. Función `custom_access_token_hook(event jsonb) returns jsonb` (`security definer`,
     `set search_path = ''`, sin dependencias de `service_role` en cliente) que inyecte los
     claims `organization_id` y `global_role`.
  2. Helpers de RLS (`auth_org_id()`, `auth_global_role()`) y `GRANT EXECUTE` a
     `supabase_auth_admin`; RLS existente sigue en verde.
  3. Instrucciones de activación del hook en Auth (dashboard/`config.toml`) documentadas en
     `reports/` — la activación en el proyecto la ejecuta el dueño con evidencia.
  4. Pruebas pgTAP: claims correctos por rol/membresía, aislamiento por `organization_id`,
     sin filtración entre tenants; CI verde.
  5. Sin `service_role` en cliente; `.env.example` sin valores; guardas verdes.
  6. Reporte `reports/F1/F1-01_arquitecto-bd_auth.md` con conclusión VERDE.
- **Riesgo de tamaño:** si el diff efectivo supera ~400 líneas (regla §6 de
  `agents/01_supervisor_hidria.md`), dividir en **F1-01a** (hook + helpers + pgTAP,
  `arquitecto-bd`) y **F1-01b** (consumo de claims en sesión cliente + guardas de rutas,
  `dev-frontend-pwa`, dep F1-01a). F1-02 queda dep de F1-01b en ese caso.

## Actualizaciones propuestas a `tasks/BACKLOG.md` (no aplicadas en esta ronda)

El `write_scope` de F0-12 incluye `tasks/BACKLOG.md`, pero esta ronda del supervisor tiene
prohibido tocar archivos fuera de los dos reportes; se propone al Lead:

- F0-06 → estado `bloqueada` (causa: protección ausente + token sin administración; acción:
  usuario) o `en_progreso` con nota AMARILLO.
- F0-01 y F0-07 → `en_progreso` (evidencia parcial: token sin Administration; CI verde).
- F0-08 y F0-11 → `hecha` solo tras el merge del PR #2.
- F0-12 → `en_progreso`.
- Sección "Siguiente tarea": `F1-01` tras cerrar G0 (redacción propuesta en la sección
  anterior).

## Pendientes / siguiente paso

- [ ] Recibir y validar reportes F0-01…F0-05 y F0-07…F0-11; actualizar este checklist.
- [ ] Recibir `reports/reviews/PR-2_spec.md`, `reports/security/PR-2_security.md`,
      `reports/qa/PR-2_qa.md`.
- [ ] Resolver R1 (protección de `main`) con el usuario o ADR de excepción.
- [ ] Con todo lo anterior: merge squash de #2 (solo supervisor) y pasar este documento a
      **VERDE (G0 cerrado)**.
- [ ] Asignar F1-01 (o F1-01a/F1-01b) al arquitecto BD.
