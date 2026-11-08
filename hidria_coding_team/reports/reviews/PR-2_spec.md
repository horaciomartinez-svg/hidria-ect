# Revisión de especificaciones — PR #2 — chore(f0): fundación del equipo autónomo, monorepo y CI mínima

- **Revisor:** `revisor-especificaciones` (agente 06)
- **Fecha:** 2026-11-07 18:16 (America/Mexico_City)
- **PR:** #2 `chore/f0-fundacion` → `main` (https://github.com/horaciomartinez-svg/hidria-ect/pull/2)
- **Commit revisado:** `90c77ab95dec5f237c4cea7808efd719434db737` (head)
- **Base:** `f6b99ce10d8f71e9b0f08e70debeea6e5f630a87` (`main`)
- **Diff revisado:** 65 archivos, **+7279 / −19** (`git diff --stat origin/main...HEAD`; coincide con el PR)
- **CI:** run `42425963485` — jobs **«Guardas de repositorio»** y **«Cliente (lint + typecheck + build)»** en `success` (verificado con `mcp__github__pull_request_read get_check_runs`).
- **Veredicto:** **CAMBIOS SOLICITADOS — NO MERGEABLE**. Hay **3 hallazgos BLOQUEANTES**; conforme al agente 06 §4 («BLOQUEANTE: contradice un documento o una regla dura → rechazo»), el PR no puede aprobarse ni mergearse hasta corregirlos y re-revisar.

---

## 1. Alcance y método

Leídos completos: `docs/00` (glosario), `docs/01` (modelo, en lo relativo a `profiles`/claims), `docs/02` (DDL y vistas), `docs/04` (contratos EF-01…EF-13, TD-1…TD-8, §8 errores, §9 modelo de lectura), `docs/05` (plan de pruebas, API y XLS), `docs/07` (fases, entornos, migraciones, CI/CD), `hidria_coding_team/TEAM.md`, los 8 archivos `agents/01…08`, `tasks/BACKLOG.md`, las 12 tareas `tasks/F0/*`, las 12 tareas `tasks/F1/*`, los ADR-000…002, `qa/trazabilidad.md`, `.github/workflows/ci.yml`, `scripts/ci/guardas.sh`, `.env.example` (raíz y equipo), `.gitignore`, `README.md`, `supabase/functions/README.md`, `supabase/tests/README.md`, `tests/README.md`, `hidria_coding_team/scripts/phase0_verify.ps1` y el scaffold `app/`.

Contrastado con: `git diff origin/main...HEAD`, `git ls-files`, hashes SHA-256 y MCP GitHub/Supabase (solo lectura):

- `list_migrations`: 3 migraciones (`20261031000000_base_hidria_mdohi`, `20261031001000_seed_catalogos`, `20261108000000_privacy_addendum`).
- `get_project_url`: `https://zucalshlfcxejpukshxl.supabase.co`.
- SQL de conteo (`information_schema`/`pg_class`): **44 tablas base, 44 con RLS, 6 vistas** (coincide con la evidencia del PR).
- `docs/02` y migración base: SHA-256 `2A7B6F8888040990B109F580F6BE50F7F03BF7D9FF7B2299D7BD50BC85442CB5` en ambos (coincide con el PR).
- `git ls-files --error-unmatch .env` → falla: `.env` **no** está versionado.

No se ejecutó `git commit/push/merge/checkout`, no se modificó ningún archivo del PR y no se aprobó formalmente nada. Este reporte es el único archivo escrito.

---

## 2. Verificaciones que PASAN (para no re-revisarlas)

| Criterio                                                                                              | Evidencia                                                                                                                                    | Resultado |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Estructura de `docs/07` §3 (Fase 0, actividad 0.3): `/supabase/migrations`, `/supabase/functions`, `/app`, `/docs` + CI mínima (lint + build) | `supabase/migrations/` (3 archivos), `supabase/functions/README.md`, `supabase/tests/README.md`, `app/` completo, `docs/` intacto, `.github/workflows/ci.yml` jobs `guardas` y `cliente` | ✅ PASS |
| CI mínima en verde                                                                                    | Checks del PR en `success` (run 42425963485)                                                                                                   | ✅ PASS |
| El PR **no** altera contratos ni reglas metodológicas                                                  | `git diff --name-only origin/main...HEAD -- docs` → solo `docs/07`; `docs/01/02/04/05/06/08` sin cambios; migraciones y seeds intactas; ningún `.sql` tocado | ✅ PASS |
| `.env` fuera de git y `.gitignore` ampliado                                                            | `.gitignore:4-9` (`.env`, `.env.*`, `!.env.example`, `*.pem`, `*.key`), `:14-35` (`node_modules/`, `dist/`, `reference/`, `supabase/.temp/`, `.wrangler/`, `.playwright/`); `.env` no trackeado | ✅ PASS |
| `.env.example` **raíz** sin valores reales                                                             | Solo nombres vacíos, valores públicos de ejemplo (`GITHUB_REPO`, buckets `hidria-docs`/`hidria-reports`, `NOM151_ENABLED=false`). Ver hallazgo M6 para el inventario del equipo | ✅ PASS |
| Nomenclatura SDFI/SRHDS/UCI en el producto                                                             | `git grep 'UAT\|UAT-CIT\|Subsecretaría de Recursos Hídricos y Desarrollo Sustentable' -- app supabase` → 0 coincidencias; las menciones a siglas prohibidas solo aparecen en textos de **prohibición** (TEAM.md §10.4/§15, agentes 04/06, `F0-07`) y en el registro histórico de `docs/00`; `app/src/App.tsx` rotula «SDFI · SRHDS · Gobierno del Estado de Tamaulipas» | ✅ PASS |
| `TEAM.md` + 8 archivos de agente presentes, con roles, PARO y DoD                                        | 8 archivos en `agents/`; `TEAM.md` §6 (tabla de 8 agentes), §9 (secretos), §12 (4 condiciones de PARO), §13 (DoD/gates). Coherencia parcial: ver B2, M9, M10, M14 | ⚠️ PARCIAL |
| Backlog F0 completo (12 tareas, dueños, deps) y cubre G0                                               | `BACKLOG.md:11-22`; `F0-12` con deps F0-01…F0-11 y checklist G0 (`F0-12:22-34`); `F0-12` cierra con evidencia `reports/F0/00-supervisor_estado.md` | ✅ PASS (salvo M7/M8) |
| Mapeo EF↔módulo en F1 para lo esencial                                                                 | CAT=EF-04 → F1-07 ✅; EF-05 brecha → F1-09 ✅; EF-06 IVOH → F1-10 ✅; EF-07 esencial folio `-R1` + matriz 10/10 → F1-12 ✅; EF-01 → F1-04, EF-02/EF-12 → F1-11, EF-03 → F1-06, EF-08 → F1-05 ✅ | ⚠️ PARCIAL (EF-09 solo IIH: M4; ver hallazgos) |

---

## 3. Hallazgos

| #  | Severidad   | Archivo:línea                                    | Documento (sección)                                        | Qué se espera                                                                                  | Qué hay (extracto)                                                                                                                                                                                                 |
| -- | ----------- | ------------------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B1 | **BLOQUEANTE** | `TEAM.md:286-287`; `docs/07:63-64,74`; `docs/02:725-746`; `docs/04:353-368` | docs/02 (DDL: `v_diagnostic_completeness`); docs/04 TD-4; docs/07 §3 Fase 1.2/2.1 | Un gate verificable: E2E-07 («Reporte emitido») solo es posible con matriz 10/10; el DDL exige `p4_custodia` (3 transferencias), `p6_lab` (dictamen) y `p9_alternativas` (`validado_r4`). Esos entregables son EF-10/M7 y alternativas | `TEAM.md:286` pone **E2E-07** y EF-07 esencial en **G1**, pero `TEAM.md:287` deja «Custodia/laboratorios … EF-10» en **G2**; el backlog no tiene tarea F1 (ni de ninguna fase) para custodia/dictamen ni para `alternatives`. **G1 es inalcanzable tal como está escrito.** |
| B2 | **BLOQUEANTE** | `TEAM.md:286`; `BACKLOG.md:28-50`; `agents/03:38-44`; `agents/04:40-48`; `docs/07:63-64,74-75` | docs/07 §3 Fase 1/2; TEAM.md §1/§13; agente 06 §3.4 | Fase 1 = EF-01/02/03/04/07/08/11 + M1/M2/M3/M4/M10/M11/M12; Fase 2 = EF-05/06/09/10/12 + M5/M6/M7. Toda desviación exige ADR aprobado. | Re-fasing **sin ADR** y en tres versiones distintas: TEAM.md G1 incluye EF-05…EF-09 + M6/M8 (y duplica EF-11/M12 en G1 y G2); `agents/03` pone EF-05/EF-06 en F1 y **EF-11 en F2**; `agents/04` pone M5 en F2, M6 en «F1/F2», M12 en F2; el backlog F1 incluye M5/M6/M8/EF-12 (`F1-08/09/10/11`) y **difiere M12/EF-11** a `F1-14` «planificada F1/F2». |
| B3 | **BLOQUEANTE** | `agents/03:50-53`; `supabase/functions/README.md:19`; `docs/04:74-77` | docs/04 §2.3 (idempotencia) vs §6.3 y §8 | El contrato dice **header opcional**: «Toda operación mutante acepta header opcional `Idempotency-Key`». Obligatorio solo en la cola offline, donde el cliente lo envía siempre (§6.2). | El instructivo de las 13 EF y la convención de `supabase/functions/` lo declaran **obligatorio** («header `Idempotency-Key` obligatorio»). Implementado así, llamadas online sin header romperían `docs/04` §2.3 y no existe código de error en §8 para ese caso. |
| M4 | MAYOR       | `BACKLOG.md:35`; `tasks/F1/F1-08:19-24`; `docs/04:244-256`; `docs/05:225` | docs/04 EF-09; docs/05 XLS-01/XLS-02 | EF-09 importa **BHE e IIH** (`kind: "bhe" \| "iih"`); XLS-01 prueba la plantilla BHE. | `F1-08` y el backlog solo cubren **IIH**: «EF-09 para IIH»; ninguna tarea implementa `kind='bhe'` ni cubre XLS-01/XLS-02. |
| M5 | MAYOR       | `TEAM.md:286`; `docs/07:63-64`; `BACKLOG.md:39,46-47` | docs/07 §3 Fase 1.1/1.2; TEAM.md G1 | EF-11 y M12 forman parte de Fase 1 y de G1: tarea con dueño, deps y criterios en la primera ola. | M12/EF-11 solo aparece como `F1-14 — Aula y EF-11` en «Planificadas (archivo se crea al asignar)», con fase «F1/F2»; no hay tarea, dueño ni deps en la ola F1, pero G1 exige EF-11/M12. |
| M6 | MAYOR       | `TEAM.md:180`; `hidria_coding_team/.env.example:11,16`; `docs/07:32-39,51`; `tasks/F0/F0-02:5-8` | docs/07 §2 (un proyecto por entorno, sin compartir base) y §3 Fase 0.1; TEAM.md §9 | Entornos separados (`staging` sintético ≠ `piloto` real) y `.env.example` sin valores reales. | El único proyecto validado es `zucalshlfcxejpukshxl`, que TEAM.md §9 define como **piloto**; el inventario del equipo lo documenta (`SUPABASE_PROJECT_REF= # zucalshlfcxejpukshxl`) y etiqueta el `VITE_SUPABASE_URL` como «(staging)». No hay tarea que cree un proyecto Supabase de staging. Riesgo de clasificación de datos (`restringido_nda` solo en piloto). |
| M7 | MAYOR       | `tasks/F0/F0-12:30-31`; `tasks/F0/F0-10:30-33`; `docs/07:55-56` | docs/07 §3 Fase 0, actividades 0.5 y 0.6 | 0.5: «JWT con claims verificado (test SEC-04 inverso)»; 0.6: «Seeds verificados contra documentos oficiales; **acta de validación con la Coordinación**». | G0 se cierra con «Auth hook **preparado** y activación **documentada**» y F0-10 admite «configurado / **pendiente por credencial**». No hay tarea ni evidencia para el **acta de validación** de contenido (0.6). G0 podría declararse VERDE sin la evidencia que exige docs/07. |
| M8 | MAYOR       | Cuerpo del PR («Refs: … `reports/F0/00-LEAD-creacion-equipo.md`»); `tasks/F0/F0-08:10`; `tasks/F0/F0-11:10`; `reports/` del PR | TEAM.md §10.2 y §13 (DoD: evidencia en `reports/`); F0-12 checklist | Evidencia versionada por tarea. | El PR solo incorpora `hidria_coding_team/reports/README.md` (`git ls-files hidria_coding_team/reports`); **no existen** `reports/F0/00-LEAD-creacion-equipo.md`, `reports/F0/F0-08_lead_monorepo.md` ni `reports/F0/F0-11_*.md` que el PR y las tareas citan como evidencia. El enlace del cuerpo del PR está roto. |
| M9 | MAYOR       | `tasks/F0/F0-03:9`; `agents/08:10-12,99-103`; `TEAM.md:120,122` | TEAM.md §6 (write scopes); agente 08 ficha y §7 | Seguridad y Privacidad **no programa** y escribe solo en `reports/security/**`; las guardas de CI son de DevOps (`scripts/**`, F0-07). | `F0-03` asigna a `seguridad-privacidad` el `write_scope` `scripts/ci/guardas.sh` (código/configuración), en contradicción con su propia ficha («NO escribe … configuración») y con TEAM.md §6; además el título incluye `.gitignore` pero `.gitignore` no está en el write scope. |
| M10 | MAYOR      | `decisions/ADR-002-estructura-monorepo.md:3-6`   | TEAM.md §10.3 (ADR: `propuesta \| aceptada \| …`); agente 06 §4 | Un ADR nace `propuesta`; la aprobación del revisor se registra **después** de la revisión, citando el reporte. | ADR-002 está «aceptada» y declara «**Aprobado por:** supervisor-hidria (gate G0) y **revisor-especificaciones**» cuando el PR aún no tenía revisión de especificaciones (esta es la primera) y G0 no está cerrado. Atribuye una aprobación que no existía; debe pasar a `propuesta` hasta el dictamen (o corregirse la trazabilidad de la aprobación). |
| m11 | MENOR      | `agents/03:71`; `docs/04:469`; `docs/05:203`    | docs/04 §8; docs/05 API-04; TEAM.md §3 (precedencia) | Un único límite, resuelto por precedencia (`docs/04` > `docs/05`) o ADR. | `docs/04` §8 dice «100 req/min en MVP»; `docs/05` API-04 dice «120 req/min»; el instructivo de EF fija **120** sin citar la contradicción ni el ADR. |
| m12 | MENOR      | `qa/trazabilidad.md:12,20-24`                    | docs/04 §2.3, §6, §8; docs/05 §2 (XLS-01/02)               | Citas correctas y matriz completa (docs/05 §2 incluye «Importador XLSX → XLS-01, XLS-02»). | R-05 cita «TD-6» para «IVOH requiere BHE» (TD-6 es el semáforo; la regla está en §1.2/EF-06 pre); R-13/R-14/R-15 citan §9 (anexo de lectura) en vez de §2.3/§6; R-17 cita «docs/07 §0.5» (es la actividad, no la sección); **faltan XLS-01/XLS-02**. |
| m13 | MENOR      | `ADR-002:24,29`; `tasks/F0/F0-08:25`; `docs/07:41,94-96` | docs/07 §4 (los seeds son migración `20261031001000_seed_catalogos.sql`); docs/07 §2 | Una sola fuente de seeds (migración ya aplicada); rutas exactas. | ADR-002 dice `supabase/seed.sql # (a crear en F1) contenido de docs/03`, lo que duplicaría la semilla ya aplicada (docs/07 §4); cita `scripts/phase0_verify.ps1` y `F0-08` cita `scripts/phase0-verify.ps1`, pero el archivo real es `hidria_coding_team/scripts/phase0_verify.ps1`. |
| m14 | MENOR      | `TEAM.md:119,121`; `agents/05:10`; `agents/07:10`; `BACKLOG.md:34` vs `tasks/F1/F1-07:5`; `tasks/F0/F0-08:9`; `tasks/F0/F0-03:9` | TEAM.md §6/§11; agente 01 §6 (write scopes disjuntos) | Write scopes de TEAM.md, agentes y tareas coincidentes y disjuntos entre tareas paralelas. | QA añade `reports/qa/**` y DevOps `reports/deploy/**` (no listados en TEAM.md §6); `F1-07` en BACKLOG omite a `arquitecto-bd` aunque el archivo lo incluye y su scope incluye `supabase/migrations/**`; `F0-08` omite `.github/**`, `hidria_coding_team/.env.example`, `package.json` y `docs/07` (todos cambiados en el PR); `app/**` es tan amplio que todas las tareas F1 en paralelo se solapan (`F1-08` y `F1-11`, ambas con dep `F1-04`). |
| m15 | MENOR      | `.github/workflows/ci.yml:3-7`; `docs/07:159,100-101`; `docs/05:284` | docs/07 §5.5 (push a rama → lint + build + pgTAP en CLI); docs/05 §7 (entrada: migración limpia + aplicación idempotente) | Pipeline también en push a rama (o justificar que el PR basta) y redacción de idempotencia completa. | El workflow solo dispara en `pull_request` hacia `main` y `push` a `main`; la edición de `docs/07` dice que los archivos «pueden reaplicarse sin error en una base **donde ya fueron aplicados**», mientras docs/05 §7 exige también la aplicación limpia desde cero. No hay pgTAP en CI (aceptable en F0 por `supabase/tests/README.md`, pero debe quedar como deuda F1). |

---

## 4. Evidencia (extractos y citas)

### B1 — G1 exige E2E-07, pero 10/10 depende de EF-10/M7

`TEAM.md:286-287` (texto añadido):

```text
| **G1 — MVP núcleo** | EF-01…EF-04, EF-05…EF-09 (esencial), EF-11 + M1–M4, M6, M8, M10–M12 + E2E-01/02/05/07/08 verdes |
| **G2 — Completa** | Custodia/laboratorios, reportes completos, aula/EF-11, insignia OB3, EF-10/EF-12 |
```

`docs/02:725-746` (DDL, fuente de verdad del esquema):

```sql
-- 3.5 Matriz de completitud (gate de emisión del Reporte, 10/10)
create or replace view public.v_diagnostic_completeness as
select
  ...
  (exists (
    select 1 from public.samples s
    where s.diagnostic_id = d.id
      and (select count(*) from public.custody_transfers ct where ct.sample_id = s.id) = 3
  )) as p4_custodia,
  ...
  (exists (select 1 from public.lab_results lr
     join public.samples s on s.id = lr.sample_id
    where s.diagnostic_id = d.id and lr.dictamen is not null)) as p6_lab,
  ...
  (exists (select 1 from public.alternatives a where a.diagnostic_id = d.id and a.validado_r4)) as p9_alternativas,
```

`docs/04:353-368` (TD-4) exige 10/10 para emitir; `docs/07:74` confirma que **EF-10 (custodia)** y EF-05/06/09/12 son Fase 2, mientras `docs/07:64` pone E2E-07 en las evidencias de Fase 1. El PR repite esa contradicción y la convierte en criterio de G1. `F1-12` (deps `F1-10, F1-11`) no incluye ninguna tarea de custodia/dictamen/alternativas; `BACKLOG.md:49` deja EF-10 para F2. **Resultado: E2E-07 no puede pasar antes de G2.**

**Corrección esperada:** ADR que resuelva la contradicción de `docs/` (p. ej., mover EF-10/M7 y la captura de alternativas a G1, o retirar E2E-07/EF-07 de los criterios de G1 y de Fase 1 y reflejarlo en TEAM.md §13, `docs/07` §3 y el backlog), más la tarea F1 correspondiente si se mantiene la emisión en el MVP.

### B2 — Re-fasing sin ADR: tres planes incompatibles

`docs/07:63-64` (Fase 1):

```text
| 1.1 | Desplegar EF del MVP: **EF-01, EF-02, EF-03, EF-04, EF-07, EF-08, EF-11** ...
| 1.2 | Cliente PWA: módulos M1, M2, M3, M4, M10, M11, M12 ...
```

`docs/07:74-75` (Fase 2):

```text
| 2.1 | EF restantes del diagnóstico técnico: **EF-05 (BHE/R3), EF-06 (IVOH), EF-09 (XLSX), EF-10 (custodia), EF-12 (reprogramación)** |
| 2.2 | Módulos M5 IIH, M6 BHE (importador Excel), M7 muestreo/custodia en cliente |
```

Contra esto, el PR introduce tres versiones incompatibles:

- `TEAM.md:286`: G1 = EF-01…EF-04, **EF-05…EF-09**, EF-11 + M1–M4, **M6, M8**, M10–M12; y G2 vuelve a incluir «aula/EF-11».
- `agents/03:38-44`: EF-05 y EF-06 en «F1»; **EF-11 en «F2»**; EF-09 «F1/F2».
- `agents/04:40-48`: M5 «F2», M6 «F1/F2», M12 «F2»; M8 «F1».
- `BACKLOG.md:35-39`: F1 incluye M5/IIH (EF-09), M6/BHE (EF-05), M8/IVOH (EF-06) y EF-12 (en `F1-11`) —y **M12/EF-11 solo como `F1-14` «planificada F1/F2»**.

No hay ADR que documente la re-secuenciación ni actualización de `docs/07`. El agente 06 §3.4 es explícito: «Si el PR desvía `docs/`, existe ADR en `decisions/` aprobado; si no, rechazo». **Corrección esperada:** un ADR de re-fase (o alinear TEAM.md, agentes y backlog exactamente a `docs/07` §3) y corregir la doble asignación EF-11/M12 en G1/G2.

### B3 — Idempotencia obligatoria vs contrato opcional

`docs/04:74-77`:

```text
## 2.3 Idempotencia
- Toda operación mutante acepta header opcional **`Idempotency-Key: <uuid>`** (el cliente PWA
  lo genera al encolar la operación offline y lo reenvía intacto; ver §6).
```

`agents/03:50-53`:

```text
1. **Idempotencia:** header `Idempotency-Key` obligatorio; misma clave + mismo payload →
   mismo cuerpo 200 y **sin efectos duplicados**; misma clave + payload distinto →
   `409 CONFLICT_STATE`. ...
```

`supabase/functions/README.md:19`:

```text
1. `Idempotency-Key` obligatorio; mismo payload → mismo cuerpo; distinto → 409.
```

**Corrección esperada:** redactar «opcional en el contrato; el cliente PWA lo envía siempre al sincronizar (§6)» y probar API-00 como contrato, **o** abrir ADR que cambie `docs/04` §2.3 y añada el código de error correspondiente a §8.

### M6 — Entorno `staging`/`piloto`

`TEAM.md:180`:

```text
| `piloto` | proyecto del Programa (`zucalshlfcxejpukshxl`) | Pages/R2 SDFI | **reales** `restringido_nda` | aceptación CAP-01…04 |
```

`hidria_coding_team/.env.example:11,16`:

```text
VITE_SUPABASE_URL=                 # URL pública del proyecto Supabase (staging)
...
SUPABASE_PROJECT_REF=              # zucalshlfcxejpukshxl
```

`docs/07:39`:

```text
**Aislamiento entre entornos:** un proyecto Supabase por entorno (nunca compartir base entre staging y piloto); ...
```

`docs/07:51` (Fase 0.1): «Crear proyectos Supabase `staging` y `piloto`». El PR valida únicamente `zucalshlfcxejpukshxl` (`F0-02:5-8`, MCP `get_project_url`) y no crea/inventaría el proyecto de staging. **Corrección esperada:** aclarar el mapa de entornos (¿cuál es staging real?), crear la tarea/proyecto de staging o ADR justificativo; rotular el inventario del equipo por entorno y sin el ref real (principio «solo nombres» que el propio archivo declara y que la guarda #4 no verifica para `.env.example` anidado).

### M7 — G0 vs docs/07 Fase 0 (0.5 y 0.6)

`docs/07:55-56`:

```text
| 0.5 | Configurar Auth hook `custom_access_token_hook` (claims `organization_id`, `global_role` desde `profiles`) | JWT con claims verificado (test SEC-04 inverso) |
| 0.6 | Migración de contenido: **plantillas oficiales → catálogos** (...) | Seeds verificados contra documentos oficiales; acta de validación con la Coordinación |
```

`F0-12:30-31`:

```text
- [ ] Auth hook preparado y activación documentada (F0-10).
```

`F0-10:30-33`:

```text
3. Probar la función con un `event` de ejemplo ...
4. Documentar la activación: ... **No** hay access token de Supabase en `.env`: registrar como bloqueo ... y dejarlo como tarea para el usuario si exige PARO.
```

**Corrección esperada:** G0 debe exigir «JWT con claims verificado» (o declarar PARO §12.1 si falta credencial tras 3 intentos) y una evidencia para 0.6 (aunque sea «acta pendiente firmada por Coordinación» como entregable humano explícito).

### M8 — Evidencia faltante

`git ls-files hidria_coding_team/reports` → solo `hidria_coding_team/reports/README.md`. Ni `reports/F0/00-LEAD-creacion-equipo.md` (citado en el cuerpo del PR y en `F0-11:10`) ni `reports/F0/F0-08_lead_monorepo.md` (`F0-08:10`) ni `reports/F0/F0-11_*` existen en el PR. TEAM.md §13 (DoD) exige evidencia en `reports/` con conclusión VERDE. **Corrección esperada:** versionar esas evidencias (o retirar la referencia y abrir tarea de evidencia); G0 no debe cerrarse sin ellas.

### M9 — F0-03 asigna código a Seguridad y Privacidad

`F0-03:9`:

```yaml
write_scope: ["reports/F0/F0-03_*", "scripts/ci/guardas.sh"]
```

`agents/08:10-12` (ficha):

```text
| Escribe en | `reports/security/**`, `decisions/**` (ADRs de seguridad/privacidad) |
| NO escribe | Código, SQL, configuración, `app/**`, `supabase/**`, `.github/**` |
```

`TEAM.md:120,122` limita el write scope de Seguridad a `reports/security/**` y prohíbe programar. **Corrección esperada:** F0-03 solo verifica en lectura; cualquier ajuste de `scripts/ci/guardas.sh` va a F0-07 (DevOps) o a una tarea del dueño del script; añadir `.gitignore` al scope si F0-03 realmente lo toca.

### M10 — ADR-002 declara aprobación previa

`decisions/ADR-002-estructura-monorepo.md:3-6`:

```text
- **Estado:** aceptada
- **Fecha:** 2026-11-08
- **Autor:** Lead (creación del equipo)
- **Aprobado por:** supervisor-hidria (gate G0) y revisor-especificaciones
```

La revisión de especificaciones es este reporte (primera); G0 no está cerrado. **Corrección esperada:** estado `propuesta` hasta que existan las aprobaciones, y entonces citar `reports/reviews/PR-2_spec.md` y el cierre de G0.

### m11–m15 — Evidencia breve

- **m11:** `agents/03:71` «Rate limit: 120 req/min» vs `docs/04:469` «100 req/min en MVP»; `docs/05:203` (API-04) usa 120. Resolver por precedencia/ADR y dejar un solo valor.
- **m12:** `qa/trazabilidad.md:12` R-05 «docs/04 TD-6» (debería ser §1.2 / EF-06 pre); `:20-22` R-13/R-14/R-15 «docs/04 §9» (debería ser §2.3 y §6); `:24` R-17 «docs/07 §0.5»; no hay filas XLS-01/02 (`docs/05:78`) ni fila de rate limit.
- **m13:** `ADR-002:24` «`seed.sql` (a crear en F1)» frente a `docs/07:94-96` (la semilla es la migración `20261031001000_seed_catalogos.sql`); rutas `scripts/phase0_verify.ps1` (real: `hidria_coding_team/scripts/phase0_verify.ps1`).
- **m14:** write scopes de TEAM.md §6 vs fichas de agentes 05/07; `BACKLOG.md:34` (F1-07 sin `arquitecto-bd`) vs `F1-07:5`; `F0-08:9` omite `.github/**`, `hidria_coding_team/.env.example`, `package.json`, `docs/07`; `app/**` solapado en tareas paralelas.
- **m15:** `ci.yml:3-7` solo PR→`main` y push→`main`; `docs/07:159` espera pipeline en push a rama (pgTAP en CLI); `docs/07:100-101` acota la idempotencia a «una base donde ya fueron aplicados», mientras `docs/05:284` exige además la aplicación limpia desde cero.

---

## 5. Conclusión

**No aprobado. Cambios solicitados.** El PR cumple la estructura de `docs/07` §3 Fase 0.3, no altera contratos ni reglas metodológicas, deja `.env` fuera de git, mantiene la nomenclatura del producto y tiene CI verde; el esquema verificado por MCP coincide (44/44 RLS, 6 vistas, 3 migraciones, hashes `2A7B6F88…`). Pero **no es mergeable** por tres BLOQUEANTES:

1. **G1 inalcanzable** (B1): E2E-07 exige 10/10, y 10/10 exige custodia/dictamen (`p4/p6`, EF-10/M7) y alternativas (`p9`), que el propio plan deja en G2 y que no tienen tarea.
2. **Re-fase sin ADR** (B2): TEAM.md, los agentes 03/04 y el backlog dan tres planes distintos frente a `docs/07` §3; EF-11/M12 se duplican en G1/G2 y no tienen tarea F1.
3. **Idempotencia obligatoria** (B3): contradice `docs/04` §2.3 (header opcional), que es el contrato que las EF deben implementar.

**Criterio de re-revisión (solo estos puntos + regresión de contrato):**

- [ ] ADR (o corrección de TEAM.md/agentes/backlog) que haga G1 verificable y alinee la Fase 1 con `docs/07` §3; resolver custodia/dictamen/alternativas y la doble asignación EF-11/M12.
- [ ] Tarea(s) F1 con dueño/deps/criterios para EF-11/M12 y para EF-09 `kind='bhe'` (XLS-01/02), o ADR que las reubique de fase.
- [ ] Idempotencia alineada a `docs/04` §2.3 (o ADR + cambio de contrato y código de error).
- [ ] Resolver MAYORES: entorno staging/piloto y `.env.example` del equipo; evidencia F0-08/F0-11 y acta/claims de G0; write scope de F0-03; estado de ADR-002.
- [ ] MENORES: rate limit 100/120, citas y XLS en `qa/trazabilidad.md`, `seed.sql`, write scopes, disparadores de CI y redacción de idempotencia en `docs/07`.

Mientras existan B1–B3 **no procede squash merge ni cierre de G0**. Si el Lead prefiere el mapeo literal del agente 06 §4 («BLOQUEANTE ⇒ rechazo»), este mismo informe puede registrarse como **RECHAZADO**; en cualquier caso el resultado operativo es el mismo: **no mergeable hasta corrección**.

---

*Fin de la revisión. No se ejecutaron cambios en el PR, no se aprobó formalmente y no se modificó código.*
