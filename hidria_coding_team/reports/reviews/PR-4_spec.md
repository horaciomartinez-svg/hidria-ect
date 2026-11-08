# Revisión de especificaciones — PR #4 — feat(f1-00): migraciones correctivas, grants DML y enforcement

- **Revisor:** `revisor-especificaciones` (agente 06)
- **Fecha:** 2026-11-07 19:32 (America/Mexico_City)
- **PR:** [#4](https://github.com/horaciomartinez-svg/hidria-ect/pull/4) — `feature/F1-00-migraciones` → `main`
- **Autora:** `arquitecto-bd`
- **Head revisado:** `4b057b3c3bd756316b86b6d88b73aff0af939b17` · **Base:** `main` `8008a648161f36823302429bb302dd832a9ec231`
- **Diff:** 13 archivos, **+1333/−0** (8 migraciones nuevas, 4 suites pgTAP, 1 reporte F1-00; sin cambios en `docs/**` ni en la migración base)
- **CI en `4b057b3`:** **4/4 check runs `success`** (runs `42433979462` y `42433977733`, `pull_request` + `push`).
- **Estado GitHub observado:** `mergeable_state: blocked` en la consulta MCP del revisor (el supervisor reportó `clean`; no hay reviews registradas). Ver §6, observación O-1: verificar protección/requisitos antes del merge.
- **Veredicto:** **CAMBIOS SOLICITADOS.** 1 BLOQUEANTE **documental** (B1: nombre de la semilla vs ADR-005) y 3 MAYORES de sincronización documental/contrato (M1–M3); el resto son MENORES. La implementación de esquema está bien construida, es forward-only/idempotente y coincide con el estado real de la base verificado por el revisor.

> **Nota histórica:** este informe refleja el estado del head `4b057b3`. B1 se cerró en
> `main` con `ADR-005` §2.5 (PR #5, `afffb6c`), M1–M3 quedaron asignados a `F1-18` y el
> **veredicto vigente para el merge es APROBADO** en
> [`PR-4_spec_delta.md`](PR-4_spec_delta.md) (head `4e2341d`; squash `b4fbc83`).

---

## 1. Alcance y método

Revisados completos: los 8 archivos `supabase/migrations/2026110801*_f1_00_*.sql`, las 4 suites `supabase/tests/010…040`, `hidria_coding_team/reports/F1/F1-00_arquitecto-bd_migraciones.md`, `tasks/F1/F1-00_migraciones_correctivas.md`, `tasks/F1/F1-18_docs_sync.md`, `decisions/ADR-003/004/005/006`, `docs/02` (DDL base y vistas), `docs/04` (EF-05/EF-07, TD-1/TD-3/TD-4, §2.3, §2.5, §8), `docs/05` (BHE-05, API-04, §7), `docs/00`, `TEAM.md` §2.6/§10.3 y `scripts/ci/guardas.sh` (guarda 3).

Verificación independiente (solo lectura) con MCP Supabase y git local:

- `schema_migrations`: **11 filas** = 3 base + 8 nuevas, en el orden esperado.
- `public`: **46 tablas**, **46/46 con RLS**, **6 vistas**, **105 políticas**; `realtime.messages`: **3 políticas**; publicación `supabase_realtime` con **5 tablas**.
- `security_invoker=true` en `v_bhe_monthly`, `v_bhe_summary`, `v_balance_indicators`, `v_ivoh_score`, `v_diagnostic_completeness`; `v_quiz_questions` sigue `definer` (`reloptions = NULL`).
- `profiles.global_role` default `'invitado'`; `organizations.name = 'SRHDS — Programa HIDRIA'`.
- Funciones nuevas: `custom_access_token_hook`, `fn_audit_write`, `fn_bhe_monthly`/`fn_bhe_summary`, `fn_diag_role`/`fn_is_diag_member`, `fn_completeness`/`fn_reporte_emitible` (8 presentes).
- `authenticated`: sin SELECT en `quiz_questions` cruda (has_table_privilege false), sin SELECT en `api_idempotency`, con SELECT en `v_quiz_questions`; ejecuta `fn_completeness` pero **no** `fn_diag_role`; `anon` sin acceso a tablas de negocio; `service_role` con INSERT y sin UPDATE en `audit_log`.
- `docs/02` y migración base: **SHA-256 `2A7B6F8888040990B109F580F6BE50F7F03BF7D9FF7B2299D7BD50BC85442CB5` en ambos**; `git diff origin/main...HEAD -- docs supabase/migrations/20261031000000_base_hidria_mdohi.sql` → **vacío**; guarda 3 de CI en verde.
- Barrido de secretos sobre los 13 archivos del PR: 0 patrones (JWT/tokens/claves privadas). No hay `.env` ni artefactos nuevos.

**Idempotencia/forward-only:** revisadas las 8 migraciones: `create table if not exists`, `create or replace`, `drop … if exists`, `create index if not exists`, `alter publication` guardado con `pg_publication_tables`, `update organizations` con `is distinct from`, `alter view … set (security_invoker=true)`, `create policy` precedido de `drop policy if exists`, `alter table … drop constraint if exists` + `add constraint`. No se edita ninguna migración aplicada.

---

## 2. Hallazgos

| # | Severidad | Archivo:línea | Documento (sección) | Qué se espera | Qué hay |
|---|---|---|---|---|---|
| **B1** | **BLOQUEANTE** (documental) | `supabase/migrations/20261108010500_f1_00_grants_views_seed.sql:19-23` · `decisions/ADR-005-claims-grants-y-correcciones.md:37-39` · `tasks/F1/F1-00_migraciones_correctivas.md:39-40` | ADR-005 §2.5 (semilla) | `organizations.name` = «Secretaría de Recursos Hidráulicos para el Desarrollo Social — Programa HIDRIA» | La migración (y la tarea F1-00) usan la forma abreviada **`SRHDS — Programa HIDRIA`**. `SRHDS` es la sigla oficial (`docs/00:13`), pero **ADR-005 fija el nombre completo**; no hay ADR que autorice la forma abreviada. Desviación sin ADR → bloqueante según la consigna del supervisor. |
| **M1** | MAYOR | `supabase/migrations/20261108010200_f1_00_bhe_rpc.sql:35-40` · `docs/05:116` · `docs/02:650-656` | docs/05 BHE-05; docs/02 §3.1; docs/04 TD-3/EF-05; Arquitectura §5.9 | Una sola fórmula de brecha; el RPC pre-R3 debe coincidir con la vista que aplica el gate R3 | `fn_bhe_monthly` calcula `entradas − (consumo_proceso + consumo_general + descarga + perdida)` (sin `circular`), igual que `v_bhe_monthly` de `docs/02`; **docs/05 BHE-05 dice `(entradas − destinos − reúso − pérdidas)/entradas`**. La contradicción es previa al PR (docs/02 vs docs/05), pero el nuevo RPC la consolida y el fixture de la suite no incluye flujos `circular` que la distingan. Resolver en F1-18 (corregir docs/05 o ADR si la metodología exige reúso) y añadir caso pgTAP con `CIR-*`. |
| **M2** | MAYOR | `tasks/F1/F1-18_docs_sync.md:24-33` · `scripts/ci/guardas.sh:38-48` · `TEAM.md:44-45` · `reports/F1/F1-00_arquitecto-bd_migraciones.md:211-213` | TEAM §2.6; guarda 3; docs/02 como fuente | Que la deuda documental asignada a F1-18 sea ejecutable: documentar los objetos nuevos (`api_idempotency`, `report_emissions`, grants, `security_invoker`, `brecha_anual_pct`, funciones) sin romper la byte-identidad `docs/02` ↔ migración base | F1-18 lista `docs/01`/`docs/02` (grants, `security_invoker`, semilla, default) pero su criterio dice «`docs/02` sigue byte-idéntico a la migración base **(o se actualiza con migración nueva)**» (`F1-18:33`), mientras la guarda 3 compara `docs/02` con `20261031000000_base_hidria_mdohi.sql` (intocable). Actualizar `docs/02` con los objetos F1-00 haría fallar la guarda; dejarlo sin actualizar deja la fuente de verdad incompleta. **Falta una decisión/ADR** sobre cómo documentar migraciones posteriores (p. ej. docs/02 = base + `docs/02b`/`docs/01`/`docs/04` para F1, o ajustar la guarda a la sección base). No requiere cambios en las migraciones de este PR, pero sí corregir F1-18 antes de ejecutarla. |
| **M3** | MAYOR | `supabase/migrations/20261108010000_f1_00_api_idempotency.sql:8-20` · `docs/04:74-77` · `tasks/F1/F1-18_docs_sync.md:24-27` | docs/04 §2.3 (idempotencia) | Mantener el contrato o registrar la nueva persistencia con ADR/actualización documental | `docs/04` §2.3 dice que la EF guarda el procesamiento en `audit_log.meta->>'idempotency_key'`; la migración crea la tabla `api_idempotency` (decisión propuesta en `reports/F1/F1-01_…contrato.md` D-03 y autorizada por la tarea F1-00, pero **sin ADR** y con `docs/04` sin actualizar; F1-18 solo contempla `docs/04` TD-4). El comportamiento externo (misma clave+mismo payload → mismo cuerpo; distinta → 409) se conserva, por lo que no es un fallo funcional, pero queda una desviación documental sin ADR. |
| m1 | MENOR | `20261108010500_f1_00_grants_views_seed.sql:13` · `ADR-005:40-41` | ADR-005 §2.6; docs/01 `profiles.global_role` | Default válido dentro del CHECK | ADR-005 cita `observador` como ejemplo; la migración usa `invitado` (valor válido y más restrictivo). Correcto funcionalmente y coherente con menor privilegio; documentar la elección en ADR-005/F1-18. |
| m2 | MENOR | `supabase/tests/010…040` · `F1-00:52` · `reports/F1/F1-00_…md:186-199` | F1-00 criterios «M-06/M-08 probadas»; docs/05 §7 | Cobertura pgTAP de M-06/M-08 | Las suites cubren M-01/M-02 (020), M-03/M-04/M-08 (030), H-5/hook/Realtime (040) y grants/views (010); **no hay aserciones de `fn_diag_role`/`fn_is_diag_member` (M-06)**, que el reporte dice probadas solo vía MCP. Añadir a 020/040 o dejar la excepción documentada. |
| m3 | MENOR | `reports/F1/F1-00_…md:195-199` · `.github/workflows/ci.yml:16-44` · `task-13` | docs/05 §7; F1-00 criterio pgTAP | Suites ejecutables en CI | Las 4 suites **no se ejecutaron** (sin Docker/`supabase test db`; CI sin servicio Postgres). El reporte lo declara y existe `task-13`/QA para el follow-up; no es defecto del esquema, pero el VERDE de F1-00 queda con excepción explícita. |
| m4 | MENOR | `20261108010500_f1_00_grants_views_seed.sql:50` | TEAM §15 (folios server-side); least privilege | Secuencias no utilizables por el cliente | `grant usage, select on all sequences in schema public to authenticated`; innecesario si ningún folio se compone en cliente y ningún flujo PostgREST usa secuencias. Revisar/retirar salvo que F1-01 documente la necesidad (seguridad lo evaluará también). |
| m5 | MENOR | `reports/F1/F1-00_…md:8,10` | Evidencia; commit final | El reporte debe citar el head final revisado | El reporte dice «Commit: b0bbabe / HEAD 72551fa / CI sobre 72551fa»; el head final del PR es `4b057b3` (CI 4/4 sobre `4b057b3`). Actualizar el reporte en el PR de seguimiento. |
| m6 | MENOR | `reports/F1/F1-00_…md:39-44` | docs/07 §4; CI/CD | Migraciones reconciliadas con CLI/staging | Las 8 migraciones se aplicaron con MCP `apply_migration` (versiones = timestamp de aplicación); `supabase db push` las verá como pendientes. Son idempotentes (revisado), pero conviene reconciliar la tabla o aplicar con CLI en staging antes de F1-16; el reporte ya lo advierte. |

> **O-1 (observación de entorno, no hallazgo de especificaciones):** la consulta MCP `pull_request_read get` devuelve `mergeable_state: blocked` con 0 reviews y CI 4/4 `success`, mientras el supervisor reportó `clean`. Verificar si la protección de `main` (E1) ya exige revisión/estado obligatorio: si es así, el merge puede requerir la acción del usuario o un revisor distinto de la cuenta autora. No afecta al contenido de este PR.

---

## 3. Evidencia de los hallazgos

### B1 — Nombre de la semilla

`20261108010500_f1_00_grants_views_seed.sql:19-23`:

```sql
update public.organizations
   set name = 'SRHDS — Programa HIDRIA',
       updated_at = now()
 where id = '00000000-0000-4000-8000-000000000001'
   and name is distinct from 'SRHDS — Programa HIDRIA';
```

`decisions/ADR-005-claims-grants-y-correcciones.md:37-39`:

```text
5. **Semilla:** migración correctiva que actualiza `organizations.name` a
   «Secretaría de Recursos Hidráulicos para el Desarrollo Social — Programa HIDRIA» (sin
   editar la migración aplicada).
```

`tasks/F1/F1-00_migraciones_correctivas.md:39-40` usa la forma abreviada, en conflicto con ADR-005; `docs/00:13` define `SRHDS` como sigla de la Secretaría, por lo que la abreviatura es institucionalmente legible, pero **ADR-005 no la autoriza**.

**Resolución recomendada (sin cambios de esquema):** actualizar ADR-005 §2.5 (y, si se quiere, la tarea F1-00) para fijar `SRHDS — Programa HIDRIA` como **nombre de despliegue** de la organización, dejando el nombre completo para documentación. Si se prefiere mantener ADR-005, el arquitecto debe añadir una migración forward-only (`M-09`) que fije el nombre completo y re-ejecutar la verificación; no se debe editar la migración aplicada.

### M1 — Fórmula de brecha

`20261108010200_f1_00_bhe_rpc.sql:35-40` (RPC):

```sql
(coalesce(sum(bf.volumen_m3) filter (where fc.grupo = 'entrada'), 0)
 - coalesce(sum(bf.volumen_m3) filter (where fc.grupo in ('consumo_proceso','consumo_general','descarga','perdida')), 0))::numeric as brecha_m3,
```

`docs/02:650-656` (`v_bhe_monthly` base) usa la misma fórmula (sin `circular`). `docs/05:116` (BHE-05) dice:

```text
brecha por mes = (entradas − destinos − reúso − pérdidas)/entradas
```

La implementación replica la **fuente de verdad del esquema** (`docs/02`, precedencia TEAM §3), por lo que **no es un defecto del PR**; es una contradicción documental previa que F1-18 debe resolver. El fixture de `030_f1_00_folio_bhe_completeness.sql` usa solo `ENT-01`/`DST-01` (sin `circular`), por lo que no distingue ambas definiciones. Añadir un caso con un flujo `CIR-*` y decidir en F1-18 si BHE-05 se corrige a la fórmula del DDL o si se requiere un ADR metodológico (y, en su caso, migración de la vista/RPC).

### M2/M3 — Deuda documental y byte-identidad de `docs/02`

`F1-18:33`:

```text
- [ ] `docs/02` sigue byte-idéntico a la migración base (o se actualiza con migración nueva).
```

`scripts/ci/guardas.sh:38-48` compara SHA-256 de `docs/02` con `20261031000000_base_hidria_mdohi.sql`; `TEAM.md:44-45` exige que sean byte-idénticos. Cualquier edición de `docs/02` para documentar `api_idempotency`, `report_emissions`, grants o `security_invoker` rompería la guarda. El PR no edita `docs/**` (correcto), pero la tarea F1-18, tal como está, no puede cumplir ambos criterios. **Corrección esperada:** decidir en ADR (p. ej. `docs/02` = base; los objetos F1-00 se documentan en `docs/01`/`docs/04`/`docs/02b`; o la guarda compara solo la sección base) y reflejarlo en F1-18.

`docs/04:74-77` (§2.3) describe la persistencia de idempotencia en `audit_log.meta`; M-01 usa `api_idempotency`. F1-18 solo menciona `docs/04` TD-4 (`F1-18:26`), no §2.3. Añadir §2.3 a F1-18 (o ADR-006) para que el contrato de idempotencia quede documentado junto con la tabla.

### m2 — Cobertura M-06

`reports/F1/F1-00_…md:107-113` dice que M-06 se probó vía MCP (`fn_diag_role`/`fn_is_diag_member`), pero las suites pgTAP no contienen aserciones de esas funciones (`010`–`040`). F1-00:52 exige «M-06/M-08 probadas»; M-08 sí está en 030, M-06 no. Añadir 2–3 aserciones (`has_function_privilege` para `authenticated=false`/`service_role=true`, `fn_diag_role` NULL y `fn_is_diag_member` false/true) en la suite 020 o 040.

---

## 4. Alineación con ADR y documentos

| Referencia | Resultado |
|---|---|
| **ADR-005** claims (`organization_id`/`tenant_id`/`global_role`) | ✅ El hook emite ambos UUID y `global_role`; verificado en el SQL y en BD. |
| **ADR-005** grants / `quiz_questions` / `security_invoker` | ✅ 46/46 RLS; `authenticated` sin SELECT en `quiz_questions` cruda y `api_idempotency`; 5 vistas `security_invoker`; `v_quiz_questions` definer. |
| **ADR-005** semilla | ⚠️ Nombre abreviado vs texto completo → **B1**. |
| **ADR-005** default `global_role` | ✅ `invitado` dentro del CHECK; elección más restrictiva que el ejemplo `observador` → m1. |
| **ADR-006** Realtime F1 | ✅ Publicación 5 tablas + 3 políticas de canales privados; RT-01/02 quedan en F1-17 y el ajuste «Allow public access» es de consola (documentado). |
| **docs/04 TD-2/TD-4** | ✅ Folio `{folio}-R1/-R2` server-side (trigger) y `fn_completeness` = AND de los 10 requisitos de `v_diagnostic_completeness`; TD-4 se alineará a la vista en F1-18 (ADR-006 Q-03). |
| **docs/04 §2.5 / EF-07** | ✅ `report_emissions` asigna folio/revisión en servidor; no hay folio compuesto por cliente. |
| **docs/04 §2.3** | ⚠️ Persistencia en tabla propia (`api_idempotency`) vs `audit_log.meta` → M3 (documental). |
| **docs/04 §8 errores** | N/A en este PR (no hay EF); el catálogo no se modifica. |
| **docs/05 §7 / pgTAP** | ⚠️ Suites entregadas, no ejecutadas; excepción documentada y follow-up `task-13` → m3. |
| **docs/02 byte-identidad / guarda 3** | ✅ `docs/02` y migración base intactas (SHA-256 idéntico; CI verde). |
| **Nomenclatura SDFI/SRHDS/UCI** | ✅ Sin siglas prohibidas ni la denominación antigua en el diff; `SRHDS` es sigla oficial. |
| **Sin secretos / `.env`** | ✅ Barrido del diff: 0 patrones. |

---

## 5. Conclusión y criterio de re-revisión

**CAMBIOS SOLICITADOS.** La implementación de esquema está bien construida y verificada: 8 migraciones forward-only e idempotentes, sin editar la base ni `docs/02`; 11 migraciones aplicadas; 46/46 tablas con RLS; 6 vistas; 105 políticas; 5/6 vistas con `security_invoker`; Realtime 5 tablas + 3 políticas; grants/`quiz_questions` correctos; hook de claims presente; default `invitado`; semilla actualizada; CI 4/4 y sin secretos. El bloqueante es **documental** y no exige rehacer las migraciones.

**Para devolver al arquitecto / Lead en ≤1 ciclo:**

- [ ] **B1:** fijar una decisión única sobre el nombre de `organizations`:
  - (a) **recomendado**: Lead/Revisor actualizan **ADR-005 §2.5** para autorizar `SRHDS — Programa HIDRIA` como nombre de despliegue (sin migración nueva), o
  - (b) el arquitecto añade una migración forward-only `M-09` que fije el nombre completo de ADR-005; no editar la migración aplicada. Re-ejecutar guarda 3/CI.
- [ ] **M1:** en `F1-18`, resolver `docs/05` BHE-05 vs `docs/02` (brecha con/sin `circular`) y añadir un caso pgTAP con flujo `CIR-*` que fije la semántica; si la metodología exige reúso, ADR + migración de la vista/RPC.
- [ ] **M2:** decidir y documentar en ADR/F1-18 cómo se documentan los objetos de migraciones posteriores sin romper la byte-identidad `docs/02` ↔ migración base (p. ej. `docs/02b`/`docs/01`/`docs/04`, o ajuste de la guarda); corregir la contradicción de `F1-18:33`.
- [ ] **M3:** añadir `docs/04` §2.3 al alcance de F1-18 (tabla `api_idempotency` vs `audit_log.meta`) o ADR que lo respalde.
- [ ] **m1:** documentar en ADR-005/F1-18 la elección `invitado` (o cambiarla si se exige `observador`).
- [ ] **m2:** añadir a las suites pgTAP las aserciones de M-06.
- [ ] **m3/m6:** mantener la excepción de ejecución pgTAP y la reconciliación de versiones MCP↔CLI como follow-ups explícitos (`task-13`, F1-16/F0-07).
- [ ] **m4:** revisar los grants de secuencias a `authenticated` con seguridad (least privilege).
- [ ] **m5:** actualizar el reporte F1-00 al head final `4b057b3` en el commit de corrección.
- [ ] **O-1:** confirmar por qué `mergeable_state` está `blocked` (protección/required review) antes del squash; CI 4/4 está verde.

Con B1 resuelto (ADR o M-09) y M1–M3 asignados/documentados, el veredicto pasa a **APROBADO**. La re-revisión se limita a B1 (ADR/migración), los cambios de F1-18 y la regresión de `docs/02`/migración base; no es necesario repetir la auditoría SQL completa.

---

*Fin de la revisión. No se ejecutaron comandos Git de escritura, no se aplicó DDL, no se mergeó y el único archivo escrito es este reporte. Las verificaciones SQL se hicieron en modo lectura sobre el proyecto `zucalshlfcxejpukshxl`.*
