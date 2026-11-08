# F0-05 — Banco de preguntas: `quiz_questions` denegada y `v_quiz_questions` operativa

- **Agente:** `seguridad-privacidad` (08)
- **Fecha:** 2026-11-07 18:16 (America/Mexico_City)
- **Tarea:** `hidria_coding_team/tasks/F0/F0-05_banco_preguntas.md` · tablero `task-4`
- **Entorno:** proyecto Supabase **piloto** `zucalshlfcxejpukshxl` (solo lectura, MCP Supabase)
  + PostgREST con claves del `.env` local (sin imprimirlas)
- **Fuente de verdad:** `docs/02` §5.4a, `docs/04`, `docs/05` SEC-05, `docs/08` §7,
  `TEAM.md` §4 (decisión congelada del banco)
- **Alcance:** privilegios `anon`/`authenticated`/`service_role` sobre tabla y vista,
  definición de la vista, RLS, prueba negativa PostgREST y número de preguntas.

## Resultado: VERDE en los criterios de F0-05 — con hallazgo MAYOR externo (esquema)

La regla dura **se cumple**: `authenticated` no puede leer `quiz_questions` (ni la columna
`correcta`), `authenticated` sí lee `v_quiz_questions`, la vista expone exactamente
`id, module_orden, pregunta, opciones` y ninguna otra vista expone la tabla cruda. `anon` no
tiene acceso. La prueba negativa vía PostgREST falla como debe.

Se registra además un hallazgo **MAYOR de índole operativa, no de exposición**
(SEC-F0-05-01): en este proyecto Supabase los roles de API **no tienen privilegios DML** en
`public` (comportamiento *secure-by-default* del proyecto). Consecuencia: `service_role` —el
canal documentado para administrar y calificar el banco (`docs/08` §7, EF-11)— **no puede leer
`quiz_questions`**. No hay fuga de `correcta`; el fallo es de disponibilidad y debe resolverlo
`arquitecto-bd` en F0-04/F1 con una migración correctiva.

| Criterio de aceptación F0-05 | Evidencia | Estado |
|---|---|---|
| `authenticated` sin SELECT sobre `quiz_questions` | §1.1, §1.5 | ✅ |
| `v_quiz_questions` accesible y sin `correcta` | §1.1, §1.3, §1.5 | ✅ |
| Prueba negativa vía PostgREST documentada | §1.6 | ✅ |
| Sin cambios de permisos (solo verificación) | §1.1–§1.7 (0 DDL/DML ejecutados) | ✅ |

## 1. Comandos y evidencia

### 1.1 Privilegios efectivos (MCP Supabase, solo lectura)

```sql
select has_table_privilege('authenticated','public.quiz_questions','select'),
       has_table_privilege('authenticated','public.v_quiz_questions','select'),
       has_table_privilege('anon','public.quiz_questions','select'),
       has_table_privilege('anon','public.v_quiz_questions','select'),
       has_table_privilege('service_role','public.quiz_questions','select'),
       has_column_privilege('authenticated','public.quiz_questions','correcta','select'),
       has_column_privilege('anon','public.quiz_questions','correcta','select');
```

| Rol | `quiz_questions` SELECT | `v_quiz_questions` SELECT | `quiz_questions.correcta` SELECT |
|---|---|---|---|
| `authenticated` | **false** ✅ | **true** ✅ | **false** ✅ |
| `anon` | **false** ✅ | **false** ✅ | **false** ✅ |
| `service_role` | **false** ⚠️ (SEC-F0-05-01) | false ⚠️ | false ⚠️ |

`information_schema.column_privileges`: `authenticated` solo tiene `SELECT` en las 4 columnas
de la vista (`id`, `module_orden`, `pregunta`, `opciones`); sobre `quiz_questions` únicamente
tiene `REFERENCES` (no `SELECT`) en todas las columnas, incluida `correcta`. ✅

### 1.2 `REVOKE` en el DDL y grants del proyecto

- `docs/02` §5.4a (`supabase/migrations/20261031000000_base_hidria_mdohi.sql:1133`):
  `revoke select on public.quiz_questions from authenticated;` — **aplicado** en la base.
- `grant select on public.v_quiz_questions to authenticated;` (l. 1142) — **aplicado**.
- Sin embargo, el ACL real de la tabla es:
  `{postgres=arwdDxtm/postgres, anon=Dxtm/postgres, authenticated=Dxtm/postgres,
  service_role=Dxtm/postgres}` — donde `Dxtm` = `TRUNCATE, REFERENCES, TRIGGER, MAINTAIN`.
  **Ningún rol de API tiene SELECT/INSERT/UPDATE/DELETE sobre la tabla** (el `REVOKE` no fue
  la causa: el proyecto nace sin esos privilegios; ver hallazgo SEC-F0-05-01).
- `pg_default_acl` del rol `postgres` en `public` para tablas:
  `{postgres=arwdDxtm/postgres, anon=Dxtm/postgres, authenticated=Dxtm/postgres,
  service_role=Dxtm/postgres}` → confirma el *secure-by-default* del proyecto.

### 1.3 Definición de `v_quiz_questions`

| Propiedad | Valor |
|---|---|
| Propietario | `postgres` |
| `reloptions` | `null` → **sin `security_invoker`**: la vista se ejecuta con privilegios del propietario (semántica *security definer*), que sí tiene `SELECT` sobre la tabla. Es lo que permite servir la vista a `authenticated` sin darle acceso a la tabla cruda. ✅ |
| `relrowsecurity` de la vista | `false` (las vistas no tienen RLS; el control es por `GRANT` + columnas de la vista + privilegios del propietario) |
| `pg_get_viewdef` | `SELECT id, module_orden, pregunta, opciones FROM quiz_questions;` |
| Columnas (`information_schema.columns`) | exactamente 4: `id` (bigint), `module_orden` (smallint), `pregunta` (text), `opciones` (jsonb). **Sin `correcta`, sin `retroalimentacion`, sin metadatos internos.** ✅ |

`pg_depend`: la **única** vista que referencia `public.quiz_questions` es
`public.v_quiz_questions` (no hay otra vía de exposición). ✅

RLS de la tabla cruda: `relrowsecurity = true`; política única
`quiz_questions_adm` (`FOR ALL`, roles `{public}`, `using/with check` =
`auth.jwt() ->> 'global_role' = 'admin_institucional'`). Hoy es defensa en profundidad
irrelevante porque `authenticated` no tiene `SELECT`; ver SEC-F0-05-02 para el momento de
corregir los grants.

### 1.4 Contenido del banco

| Métrica | Valor |
|---|---|
| Preguntas | **14** (semilla F0) |
| Módulos (`module_orden`) | 8 (1–8) |
| `opciones` con texto `correcta` embebido | 0 |
| `quiz_attempts` existentes | 0 · `auth.users` = 0 · `profiles` = 0 |

Cumple lo esperado en F0 (`docs/05` SEC-05; el contenido del aula se amplía en F2 y el pool de
examen `module_orden = 0` de `docs/08` §5 aún no está cargado — no es objetivo de F0).

### 1.5 Pruebas de rol dentro de la base (SET LOCAL ROLE, transacción revertida)

| # | Prueba | Resultado |
|---|---|---|
| 1 | `begin; set local role authenticated; select count(*) from public.quiz_questions; rollback;` | **ERROR 42501** `permission denied for table quiz_questions` ✅ (la tabla cruda está denegada) |
| 2 | `… authenticated; select count(*) from public.v_quiz_questions; …` | **14 filas visibles** ✅ (la vista funciona para `authenticated`) |
| 3 | `… authenticated; select correcta from public.v_quiz_questions; …` | **ERROR 42703** `column "correcta" does not exist` ✅ (no se puede pedir la respuesta) |
| 4 | `… anon; select count(*) from public.v_quiz_questions; …` | **ERROR 42501** `permission denied for view v_quiz_questions` ✅ (sin acceso anónimo) |
| 5 | `… service_role; select count(*) from public.quiz_questions; …` | **ERROR 42501** `permission denied for table quiz_questions` ⚠️ (SEC-F0-05-01) |

### 1.6 Prueba negativa vía PostgREST (claves del `.env`, **sin imprimirlas**)

Cliente HTTP con `apikey` + `Authorization: Bearer` desde PowerShell (TLS 1.2). Los valores
de `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` **no se imprimieron ni se registraron**;
solo se capturó código HTTP y cuerpo del error.

| # | Petición | Rol | HTTP | Respuesta (resumen) |
|---|---|---|---|---|
| 1 | `GET /rest/v1/quiz_questions?select=correcta` | `anon` | **401** | `{"code":"42501","message":"permission denied for table quiz_questions","hint":"Grant … TO anon"}` ✅ **debe fallar** |
| 2 | `GET /rest/v1/v_quiz_questions?select=id,module_orden,pregunta,opciones` | `anon` | **401** | `permission denied for view v_quiz_questions` ✅ (no hay lectura anónima) |
| 3 | `GET /rest/v1/quiz_questions?select=correcta` | `service_role` | **403** | `permission denied for table quiz_questions` ⚠️ (SEC-F0-05-01) |
| 4 | `GET /rest/v1/v_quiz_questions?select=id,module_orden,pregunta,opciones` | `service_role` | **403** | `permission denied for view v_quiz_questions` ⚠️ (SEC-F0-05-01) |

**Limitación declarada:** el criterio «`GET /rest/v1/v_quiz_questions` → 200 sin `correcta`»
requiere un **JWT de usuario autenticado**; el proyecto no tiene usuarios (`auth.users = 0`) y
F0 es solo lectura, por lo que no se creó ninguno. La equivalencia se demostró en la base con
`SET LOCAL ROLE authenticated` (§1.5, pruebas 2 y 3), que es evidencia más fuerte que
PostgREST (misma capa de privilegios + RLS). La prueba HTTP con JWT sintético queda para QA en
F1 (caso SEC-05) con usuario de staging.

### 1.7 Calificación server-side (EF-11) — estado

`docs/04`/`docs/08` prevén calificación **server-side** en EF-11: el cliente recibe la vista
sin `correcta`/`retroalimentacion` y el servidor recibe la respuesta para calificar. EF-11 no
existe aún en F0 (`supabase/functions/` solo README) — comportamiento esperado. Cuando se
implemente, debe usar los privilegios de servidor; hoy SEC-F0-05-01 impediría leer el banco
con `service_role` (ver hallazgo).

## 2. Hallazgos

| ID | Severidad | Hallazgo | Acción requerida |
|---|---|---|---|
| **SEC-F0-05-01** | **MAYOR** (operativo; **no** exposición) | Los roles de API no tienen privilegios DML en `public` (proyecto *secure-by-default*): `service_role` no puede leer/escribir `quiz_questions` (`42501`), ni leer la vista. Contradice `docs/08` §7 («Canal: exclusivamente `service_role`») y bloqueará la administración del banco y la calificación EF-11; también impedirá INSERT en `quiz_attempts` y el resto de tablas de negocio (afecta a todo F1). | `arquitecto-bd` (F0-04/F1): migración correctiva **posterior** que otorgue privilegios explícitos por tabla (DML completo a `service_role`; a `authenticated` solo lo que la RLS autorice). Sin cambios de DDL en F0; este PR no toca migraciones. |
| **SEC-F0-05-02** | MENOR | La política `quiz_questions_adm` aplica a `{public}` y permite `SELECT/INSERT/UPDATE/DELETE` a cualquier JWT con `global_role = 'admin_institucional'`. Hoy no es explotable (no hay `GRANT` para `authenticated`), pero **al corregir SEC-F0-05-01** un `GRANT SELECT` accidental a `authenticated` convertiría la política en una vía para leer `correcta` con un JWT de cliente. | Al corregir grants: **no** otorgar `SELECT` sobre `quiz_questions` a `authenticated` (solo a `service_role`, server-side); si la política se conserva, restringirla a `to service_role` o documentar por qué no aplica al cliente. |
| **SEC-F0-05-03** | MENOR (documental) | `docs/08` §7 cita el `revoke select` como «doc 06 §12»; en realidad está en `docs/02` §5.4a (el addendum de `docs/06` §12 no incluye el banco). Además el documento no advierte que el canal `service_role` requiere privilegios explícitos en proyectos Supabase nuevos. | `revisor-especificaciones` / `arquitecto-bd`: corregir la cita y anotar el requisito de `GRANT` al documentar el fix de SEC-F0-05-01. |

### Observaciones (no hallazgos)

- `anon` no puede leer la vista: coherente con «`authenticated` solo ve `v_quiz_questions`».
  Si en el futuro se quisiera aula pública, sería un cambio de modelo de amenaza y exigiría
  revisión de seguridad explícita.
- `opciones` se expone como `jsonb` con las alternativas (sin posición de la correcta
  indicada); el orden de opciones debe barajarse en cliente/servidor según `docs/08`
  (AUL-*, F2) — sin implicación de seguridad en F0.
- No se ejecutó DDL/DML: todas las consultas fueron `SELECT` y las pruebas de rol se
  revirtieron con `ROLLBACK`. ✅

## 3. Conclusión

- **Criterios de F0-05: cumplidos** (VERDE): tabla cruda denegada a `authenticated`,
  `correcta` inaccesible, vista operativa con exactamente 4 columnas, `anon` sin acceso,
  prueba negativa PostgREST 401/42501 documentada.
- **Hallazgo MAYOR registrado** (SEC-F0-05-01): ausencia de grants DML para roles de API en
  todo el esquema — falla *cerrado* (sin fuga), pero rompe la administración del banco, la
  calificación server-side y el resto del acceso a datos de F1. No es un hallazgo del diff del
  PR #2 (el PR no toca migraciones); se escala a `arquitecto-bd` y al Lead para F0-04/F1.
- **Sin condiciones de PARO:** no se expuso `correcta` ni ningún secreto.

## 4. Pendientes / siguiente paso

- [ ] Lead → `arquitecto-bd`: incluir SEC-F0-05-01 (grants explícitos) en la verificación
  F0-04 y en la primera migración de F1; **no** dar `SELECT` de la tabla cruda a
  `authenticated` (SEC-F0-05-02).
- [ ] QA (F1): caso SEC-05 vía PostgREST con usuario sintético de staging: 403 en tabla cruda,
  200 en vista y ausencia de `correcta` en el JSON; actualizar `qa/trazabilidad.md` R-18.
- [ ] Al implementar EF-11: calificación server-side con `service_role` y opciones barajadas;
  re-revisión de seguridad antes del merge.
- [ ] Re-ejecutar este reporte si cambia cualquier `GRANT`, política o definición de la vista.
