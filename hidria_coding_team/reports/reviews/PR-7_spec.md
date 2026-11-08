# Revisión de especificaciones — PR #7 — feat(f1-01a): auth claims, helpers y seed sintético

- **Revisor:** `revisor-especificaciones` (agente 06)
- **Fecha:** 2026-11-07 20:12 (America/Mexico_City)
- **PR:** [#7](https://github.com/horaciomartinez-svg/hidria-ect/pull/7) — `feature/F1-01a-auth-claims` → `main`
- **Head revisado:** `44891b333b3eb65a0d04d69b4484c7614ba03377` (head final; 2 commits, 4 archivos, +391/−0). El supervisor había citado `ff0c657`; el delta `ff0c657..44891b3` es **solo 1 archivo, +9/−0** en `reports/F1/F1-01_auth_claims.md` §8 (publicación); **no** toca migraciones, tests, `docs/02` ni código — no altera el análisis.
- **Base:** `main` `6b95be062736bd62d65c9e8fa48419d7aece078e`.
- **CI en `44891b3`:** 4/4 `success` (runs `42436975870` y `42436979634`, `pull_request` + `push`). `mergeable_state: clean` (ruleset `proteccion-main`, `required_approving_review_count=0`).
- **Veredicto:** **CAMBIOS SOLICITADOS.** 1 BLOQUEANTE (`has_global_role`/`has_any_global_role` fallan abiertos sin claim), 1 MAYOR (seed sintético dentro de migración forward-only; aplicaría a piloto) y 1 MAYOR/MENOR de cobertura (falta `invitado` en el seed/test) + observaciones menores.

---

## 1. Alcance y método

Revisados: `supabase/migrations/20261108020000_f1_01a_auth_claims.sql`, `20261108020010_f1_01a_fix_tenant_member.sql`, `supabase/tests/060_f1_01a_auth_claims.sql`, `reports/F1/F1-01_auth_claims.md` y el diff completo del PR. Verificación de solo lectura con MCP Supabase, `git` local y hashes; contraste con `docs/01` (roles), `docs/02` (DDL base), `docs/04` §2.1 (claims) y `docs/07` §1.3/§4 (datos y seeds).

El head final `44891b3` añade solo la sección §8 al reporte; las migraciones/test son las de `ff0c657`. CI 4/4 sobre el head final.

---

## 2. Verificación que PASA

| Criterio | Resultado | Evidencia |
|---|---|---|
| Migraciones forward-only; no editan base ni `docs/02` | ✅ | 2 migraciones nuevas; `git diff` sin `docs/02`/base; hashes `docs/02` y base = `2A7B6F88…42CB5` en ambos. |
| `schema_migrations` = 14 (3 base + 9 F1-00 + 2 F1-01a) | ✅ | MCP: 14 filas; nombres correctos, incluidas `20261108020000_f1_01a_auth_claims` y `…0010_fix_tenant_member`. |
| `current_org_id()`: `organization_id` con precedencia sobre `tenant_id`, null sin claim | ✅ | Código (`coalesce` con validación UUID); DB sin claim = `NULL`; test 060 casos de precedencia y alias. |
| `current_global_role()` null sin claim | ✅ | DB sin claim = `NULL`; test 060. |
| `is_tenant_member(uuid)` redefinida; `false` sin claim (fix forward-only) | ✅ | Migración `…0010`; DB sin claim = `false`; con `tenant_id` alias = true; con claim ajeno = 0 filas. |
| Grants de los helpers | ✅ | DB: `authenticated` EXECUTE=true; `anon` EXECUTE=false; revocados de `public`; `service_role` incluido. |
| Seed sintético 5/5/6/2/1 | ✅ | MCP: `auth.users`=5, `profiles`=5, `project_members`=6, `diagnostics`=2, `companies`=1; emails `.sintetico@example.invalid`; `on conflict do nothing`. |
| RLS existente no se debilita | ✅ | `is_tenant_member` acepta `organization_id`/`tenant_id`; con claim ajeno 0 filas; `profiles_sel`/`diagnostics_sel` usan `is_tenant_member`; test 060 (SEC-01/02). |
| Alcance del PR | ✅ | 4 archivos: 2 migraciones, 1 test, 1 reporte; **0** en `app/`, `supabase/functions/`, `scripts/`, `.github/`; sin secretos en el diff. |
| pgTAP 060 | ⚠️ Definida, no ejecutada | `plan(29)` coherente; sin runner Postgres (task-13); excepción ya aceptada por QA. |
| CI | ✅ | 4/4 `success` en `44891b3`. |

---

## 3. Hallazgos

| # | Severidad | Archivo / ubicación | Documento (sección) | Qué se espera | Qué hay |
|---|---|---|---|---|---|
| **B1** | **BLOQUEANTE** | `20261108020000_f1_01a_auth_claims.sql` §1 (`has_global_role`, `has_any_global_role`) | ADR-005 claims; criterio 1 de task-23 («sin claim → null/false, falla cerrado»); `docs/04` §2.1 | Sin claim, los helpers deben devolver **false** (o null) siempre, incluso con argumento null o cadena vacía | `has_global_role(p_role)` implementa `coalesce(current_global_role(),'') = coalesce(p_role,'')`; sin claim devuelve **true** para `p_role = NULL` y para `p_role = ''`. `has_any_global_role(array[''])` también devuelve **true** sin claim. DB confirmada: `has_global_role(NULL) = true`, `has_global_role('') = true`, `has_any_global_role(array['']) = true`. Es un fail-open en helpers de autorización. |
| **M1** | MAYOR | `20261108020000…sql` §2 (bloque `insert into auth.users/profiles/companies/diagnostics/project_members`) | `docs/07` §1.3/§4 (datos reales solo piloto; seeds en `supabase/seed.sql`); ADR-004 E2 (proyecto dev/staging sintético) | El seed sintético debe ser de entorno (seed.sql/CI) y no viajar en una migración forward-only que también se aplicará a staging/piloto | El seed de 5 usuarios de `auth.users`, 5 perfiles (incluido `admin_institucional`), empresa, 2 diagnósticos y 6 membresías está dentro de la **migración**; aplicará a cualquier entorno que ejecute las migraciones, incluido piloto. El comentario dice «solo dev/staging» pero no hay guarda de entorno. Riesgo: datos sintéticos y un perfil admin ficticio en piloto; contradice el lugar de seeds de docs/07 §4. |
| **M2** | MAYOR | `20261108020000` §2 (seed de `profiles`); `tests/060` (aserciones de roles) | `docs/01:73` (`global_role` CHECK: 6 valores) | Cobertura de todos los roles del CHECK, o justificación explícita de por qué se omiten | El seed/test cubren **5** roles (`coordinador_srhds, equipo, empresa, observador, admin_institucional`) y el reporte afirma «los 5 `global_role` del CHECK»; el CHECK tiene **6** (`…, invitado`). Falta `invitado` (el rol por defecto de F1-00/M-07), así que el seed no prueba ese rol. |
| m1 | MENOR | `reports/F1/F1-01_auth_claims.md` cabecera/§8 | Trazabilidad; TEAM §10.2 | Citar el head final y la base reales | El reporte cita base `b4fbc83` (el PR es contra `6b95be0`), commit `ff0c657` y CI sobre `ff0c657`; el head final es `44891b3`. El contenido es correcto, pero la trazabilidad del merge queda desactualizada. |
| m2 | MENOR | `tests/060` | Criterio 1 (falla cerrado); suite 060 | Probar explícitamente `has_global_role(NULL/'' )` y `has_any_global_role(array[''])` sin claim | No hay aserciones de esos casos; la suite solo prueba `has_global_role('equipo')`/`('admin')` con claim. Añadir junto al fix de B1. |
| m3 | MENOR | `reports/F1/F1-01_auth_claims.md` §2 | `docs/01:73` | No afirmar «5 roles del CHECK» | Dice «Los 5 `global_role` del CHECK», pero el CHECK tiene 6 (M2). |
| m4 | MENOR | migración §2 (seed auth) | `docs/07` §1.3/§4 | Seed idempotente y de entorno | `on conflict (id) do nothing` es idempotente; si en un entorno ya existiera un usuario con el mismo email y distinto id, el insert fallaría por UNIQUE(email); es un borde aceptable en staging limpio, pero debe documentarse junto con M1. |

> **Nota:** `060` no se ejecuta en CI (task-13); este dictamen no valida resultados de pgTAP, solo su contenido. Las comprobaciones de §2 se hicieron vía MCP en vivo.

---

## 4. Evidencia de B1

`20261108020000_f1_01a_auth_claims.sql` §1:

```sql
create or replace function public.has_global_role(p_role text)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(public.current_global_role(), '') = coalesce(p_role, '');
$$;

create or replace function public.has_any_global_role(p_roles text[])
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(public.current_global_role(), '') = any(coalesce(p_roles, array[]::text[]));
$$;
```

Sin claim (`current_global_role() = NULL`):

```sql
select public.has_global_role(NULL);                 -- true  (debería false)
select public.has_global_role('');                   -- true  (debería false)
select public.has_any_global_role(array['']::text[]); -- true (debería false)
-- con claim NULL, has_global_role('equipo') = false (caso normal OK)
```

**Corrección esperada:** en una migración forward-only nueva (no editar la aplicada):

```sql
select public.current_global_role() is not null
   and public.current_global_role() = p_role;
-- y para el array:
select public.current_global_role() is not null
   and public.current_global_role() = any(coalesce(p_roles, array[]::text[]));
```

Añadir a `060` los casos sin claim con `NULL`/`''`/`array['']` y, si el seed se mantiene, cubrir `invitado` (M2).

---

## 5. Conclusión y criterio de re-revisión

**CAMBIOS SOLICITADOS.** La implementación principal (helpers de claims, `current_org_id` con precedencia, `is_tenant_member` false sin claim, grants, seed sintético, RLS) está bien construida y verificada, y el delta `ff0c657..44891b3` es documental; pero **B1** incumple el criterio explícito de falla cerrada y debe corregirse antes del merge con una migración forward-only + tests. M1/M2 pueden resolverse en el mismo PR o con una decisión/ADR para el seed (entorno y rol `invitado`).

**Criterio de re-revisión (limitado):**

- [ ] **B1:** nueva migración forward-only con `has_global_role`/`has_any_global_role` que devuelvan `false` sin claim para `NULL`, `''` y arrays con `''`; aserciones pgTAP en `060`; re-ejecutar CI y documentar en el reporte F1-01a.
- [ ] **M1:** mover el seed sintético a `supabase/seed.sql`/CI o añadir guarda de entorno + ADR; garantizar que no se aplica a piloto (o documentar la limpieza antes de piloto).
- [ ] **M2:** añadir `invitado` al seed/test o documentar por qué se omiten 6.º rol; corregir la frase del reporte.
- [ ] **m1/m3:** actualizar el reporte al head final `44891b3`/base `6b95be0` y a los 6 roles del CHECK.
- [ ] Mantener `docs/02` ↔ base byte-idénticos, CI verde y sin secretos.

Tras B1 (y, si se aceptan como bloqueantes, M1/M2), el veredicto pasa a **APROBADO** con re-revisión limitada a esos puntos + regresión de guarda 3; no requiere repetir el análisis completo. No se ejecutaron comandos Git de escritura ni merges; el único archivo escrito es este reporte (más el visto bueno de ADR-007 indicado abajo). Las verificaciones SQL fueron de solo lectura sobre `zucalshlfcxejpukshxl`.

---

## Anexo — ADR-007 (seed sintético): visto bueno del revisor

- **ADR:** `decisions/ADR-007-seed-sintetico.md` (estado actualizado a *aceptada con condiciones*; fila del revisor marcada APROBADO con condiciones; seguridad pendiente).
- **Visto bueno:** **SÍ**, con estas condiciones (ya reflejadas en el ADR/`task-27`):
  1. **B1/M2 en el mismo ciclo de PR #7** (el propio ADR §4 lo exige): sin el fix fail-open y sin `invitado`, el seed no debe considerarse aceptado en su forma actual.
  2. **`task-27` bloqueante de G3**: la limpieza forward-only debe ejecutarse antes del primer uso con datos reales; su migración debe llevar guardas de los UUID fijos y verificación de que no quedan `*.invalid`, y documentar la **excepción a `docs/07` §1.1** («no hay migraciones destructivas en el camino al piloto») — el ADR debe citarla expresamente, no solo el delete.
  3. **Regla futura** (fixtures a `supabase/seed.sql`/CI, no a migraciones) es correcta y queda registrada; CI aún no aplica seeds (task-13), así que la frase «CI/dev aplica el seed» del ADR debe entenderse como dev/staging local, no como CI actual.
  4. **Composición final del seed**: si M2 añade `invitado`, el ADR debe decir 6 usuarios/perfiles (o el número final), no 5.
  5. **Seguridad** debe dar su visto bueno (perfil `admin_institucional` sintético y datos `.invalid`).
- **Efecto sobre M1:** la observación M1 de esta revisión queda **resuelta por ADR-007 + task-27**, siempre que se cumplan las condiciones 1–5; ya no exijo mover el seed antes del merge, pero el ADR debe quedar en `main` con el visto bueno de seguridad antes de G3.

---

## Anexo — Re-revisión delta F1-01a (`4197602` / head final `b67abf3`)

- **Head final revisado:** `b67abf3ef05657cf5d8a63921123a1d7a94a6040` (el supervisor citó `4197602`; el commit `b67abf3` es solo `reports/F1/F1-01_auth_claims.md`, +4/−3, sin migraciones/tests/código). Base `main@6b95be0`; CI 4/4 success; `mergeable_state: clean`.
- **Contenido del delta:** `supabase/migrations/20261108020020_f1_01a_fix_roles.sql` (B1 + M2), suite `060` ampliada a `plan(46)`, reporte actualizado; **15** migraciones en `schema_migrations`; seed 6 usuarios / 6 perfiles / 6 roles (`admin_institucional, coordinador_srhds, empresa, equipo, invitado, observador`); sin PII (`.invalid`).

### Estado de los puntos

| Punto | Resultado | Evidencia |
|---|---|---|
| **B1 — `has_global_role` fail-closed** | ✅ Corregido | `has_global_role(NULL)=false` y `('' )=false`, sin claim y con claim (`equipo`); `has_any_global_role(array[]/[''])=false`; código `current_global_role() is not null and p_role is not null and p_role <> '' and ...`; 060 tiene los casos correspondientes. |
| **B1 — `has_any_global_role(array[NULL])`** | ❌ **Residual** | Con claim `equipo`, `has_any_global_role(array[NULL]::text[])` devuelve **`null`**, no `false`: `current_global_role() = any(array[NULL])` es NULL y el `AND` final propaga NULL. Sin claim devuelve false (por el primer término). La tarea pedía explícitamente `array[NULL]` **sin claim y con claim**, y la suite 060 **no contiene ningún caso `array[NULL]`**. |
| **M2 — `invitado`** | ✅ Correcto | Seed idempotente del 6.º usuario/perfil (`invitado.sintetico@example.invalid`); BD: 6/6/6 roles; 060 comprueba `current_global_role/has_global_role/has_any` para `invitado`; sin accesos indebidos ni PII. |
| **M1 — ADR-007** | ✅ Aceptado con condiciones | ADR-007 en el árbol (`aceptada con condiciones`, fila del revisor aprobada; seguridad pendiente); `task-27` bloqueante de G3. No se mueve el seed antes del merge, conforme a lo acordado. |
| **Regresión** | ✅ | 15 migraciones; `docs/02`/base con SHA-256 idéntico; 5 archivos del PR (3 migraciones, 1 test, 1 reporte), 0 en `app/`/`functions/`/`scripts/`/`.github/`; CI 4/4; sin secretos. |

### Evidencia del residual B1

```sql
-- con claim global_role=equipo
select public.has_any_global_role(array[NULL]::text[]);
-- resultado: NULL (se esperaba false)
select public.has_any_global_role(array['equipo',NULL]::text[]);
-- resultado: true (correcto: coincide 'equipo')
```

**Fix esperado (forward-only):** `coalesce(public.current_global_role() = any(p_roles), false)` o `exists (select 1 from unnest(p_roles) r where r is not null and r <> '' and r = current_global_role())`; añadir a 060 `is(..., false)` para `array[NULL]` sin claim y con claim. No editar la migración aplicada.

### Veredicto del delta

**CAMBIOS SOLICITADOS** (un solo residual acotado, B1-array[NULL]). El resto del delta está correcto: B1 en los casos NULL/''/array[]/[''], M2 `invitado`, ADR-007/M1 y regresión. Con la corrección anterior + CI 4/4 + guarda 3, el PR pasa a **APROBADO**; la re-revisión se limita a esa migración y a los nuevos casos de 060. Observación menor: §8 del reporte cita `4197602` y sus runs, no el head final `b67abf3` (+4/−3 documental); actualizar al commitear para trazabilidad (no bloquea).

No se ejecutaron comandos Git de escritura ni merges; el anexo queda en el working tree. Las comprobaciones SQL fueron de solo lectura sobre `zucalshlfcxejpukshxl`.
