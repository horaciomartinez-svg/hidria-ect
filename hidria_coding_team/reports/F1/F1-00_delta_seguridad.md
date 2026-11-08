# F1-00 — Delta de seguridad (task-14): SEC-PR4-01 / SEC-PR4-02 / SEC-PR4-05/06

- **Agente:** `arquitecto-bd` (02)
- **Fecha:** 2026-11-07 19:50 (America/Mexico_City)
- **Tarea:** `task-14` — delta correctivo del VETO de seguridad (`reports/security/PR-4_security.md`)
- **PR:** [#4](https://github.com/horaciomartinez-svg/hidria-ect/pull/4) — `feature/F1-00-migraciones` → `main`
- **Base:** `main` `8008a64`
- **Head revisado por seguridad:** `4b057b3c3bd756316b86b6d88b73aff0af939b17`
- **Head previo del delta (m2/m5):** `1fb4ae4c61adc065adecc074630b7f14497d2d5`
- **Migración nueva:** `supabase/migrations/20261108010800_f1_00_security_fix.sql` (aplicada vía MCP)
- **Modo:** forward-only; no se editaron las 8 migraciones aplicadas ni `docs/02`; sin datos reales.

## Resultado: VERDE (delta)

Los dos bloqueantes del VETO quedaron corregidos con **una migración nueva** y verificados en
vivo con `SET LOCAL ROLE authenticated` + fixtures sintéticos en transacciones con `ROLLBACK`.
El PR queda a la espera de la **re-revisión de seguridad del delta** y de CI sobre el nuevo head.

## 1. SEC-PR4-01 — DML de `authenticated` en `v_quiz_questions`

**Causa:** `grant select, insert, update, delete on all tables` incluyó la vista auto-actualizable;
la tabla cruda se revocó, pero no el DML de la vista.

**Corrección aplicada:**
```sql
revoke insert, update, delete on public.v_quiz_questions from authenticated;
revoke insert, update, delete on public.v_quiz_questions from service_role; -- opcional, least privilege
grant select on public.v_quiz_questions to authenticated;                     -- se conserva
```

**Verificación en vivo:**

| Prueba | Resultado |
|---|---|
| `has_table_privilege('authenticated','v_quiz_questions','SELECT')` | **true** |
| `... 'INSERT' / 'UPDATE' / 'DELETE'` | **false / false / false** |
| `SET LOCAL ROLE authenticated` + `UPDATE v_quiz_questions …` | **42501 permission denied** |
| `SET LOCAL ROLE authenticated` + `DELETE FROM v_quiz_questions …` | **42501 permission denied** |
| `SELECT count(*) FROM v_quiz_questions` como authenticated | **14** (lectura segura, sin `correcta`) |

## 2. SEC-PR4-02 — `WITH CHECK` incompleto en 7 políticas `FOR ALL`

**Causa:** el rol se validaba solo en `USING`; para `INSERT` PostgreSQL evalúa únicamente
`WITH CHECK`, que solo comprobaba membresía/tenant. Un `invitado` podía crear empresas,
diagnósticos y un perfil con `global_role='admin_institucional'`.

**Corrección aplicada:** se recrearon con `drop policy if exists` + `create policy … for all`
las 7 políticas, replicando la condición completa del `USING` en el `WITH CHECK`:
`companies_write`, `diagnostics_write`, `documents_write`, `iih_assets_write`,
`profiles_write`, `samples_write`, `water_balances_write`.

En `profiles_write` se añadió además la restricción de no escalada:
```sql
with check (
  public.is_tenant_member(organization_id)
  and (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds')
  and (
    (auth.jwt() ->> 'global_role') = 'admin_institucional'
    or global_role in ('coordinador_srhds','equipo','empresa','observador','invitado')
  )
)
```
Esto impide que un `coordinador_srhds` cree/actualice un perfil con
`global_role='admin_institucional'`; un `admin_institucional` sí puede hacerlo.

**Verificación en vivo (SET ROLE authenticated + claims sintéticos; rollback):**

| Caso (rol del llamante) | Operación | Resultado |
|---|---|---|
| `invitado` | INSERT `companies` | **42501** |
| `invitado` | INSERT `diagnostics` | **42501** |
| `invitado` | INSERT `profiles` con `global_role='admin_institucional'` | **42501** |
| `observador` | INSERT `documents` | **42501** |
| `observador` | INSERT `iih_assets` | **42501** |
| `observador` | INSERT `samples` | **42501** |
| `observador` | INSERT `water_balances` | **42501** |
| `coordinador_srhds` | INSERT `profiles` con `global_role='admin_institucional'` | **42501** |
| `coordinador_srhds` | INSERT `profiles` con `global_role='equipo'` | **OK** (positivo) |
| `coordinador_srhds` | INSERT `companies` | **OK** (positivo) |
| Aislamiento A/B (observador tenant A) | SELECT `diagnostics` / `companies` | **1 / 1** (fila B filtrada) |

## 3. Recomendados SEC-PR4-05/06 (misma migración)

| Cambio | Verificación |
|---|---|
| `revoke maintain on all tables in schema public from anon, authenticated, service_role` | `has_table_privilege('authenticated','public.organizations','MAINTAIN')` = **false** |
| `revoke select on all sequences in schema public from authenticated` | `has_sequence_privilege(...,'USAGE')` = **true**; `... 'SELECT'` = **false** |

## 4. pgTAP de regresión

| Archivo | Cambio |
|---|---|
| `supabase/tests/010_f1_00_grants_views.sql` | `plan(18)`; añade INSERT/UPDATE/DELETE=false, ausencia de `correcta` y `throws_ok` UPDATE/DELETE de la vista como `authenticated` → 42501 |
| `supabase/tests/050_f1_00_security_delta.sql` | **nueva**; `plan(11)`: invitado/observador no INSERTAN en las 7 tablas, coordinador no eleva a admin, coordinador sí crea perfil no-admin, aislamiento A/B = 1/1 |

Las suites siguen sin ejecutarse en este host (sin Docker/`supabase test db`; CI sin servicio
Postgres; excepción QA/task-13). Las aserciones equivalentes se ejecutaron en vivo (tablas
anteriores).

## 5. Condiciones y notas

- **SEC-PR4-03 (`privacy_requests`):** no se modifica en este delta; cualquier miembro del
  tenant puede leer/insertar ARCO con la política normativa actual de `docs/06`. Queda como
  **condición** para Lead/Revisor/Arquitecto (ADR + migración) antes de habilitar el buzón
  ARCO; no es bloqueante del merge de F1-00.
- **SEC-PR4-08 (`check_phase_gate`/`trg_custody_gate` sin `search_path` fijo):** se revisará
  en F1-01/ADR (no se tocó en este delta).
- **B1 (nombre de semilla):** no se modifica; se resuelve en el PR documental del Lead
  (ADR-005/Revisor). No se creó M-09 de semilla.
- **SEC-PR4-04 (Realtime “Allow public access”):** sigue como condición de entorno para
  F1-17; sin cambios.
- No se editó ninguna migración aplicada; `docs/02` y la migración base siguen byte-idénticos.

## 6. Reproducción

```sql
-- SEC-PR4-01
select has_table_privilege('authenticated','public.v_quiz_questions','UPDATE'); -- false
begin;
set local role authenticated;
set local request.jwt.claims='{"sub":"<uuid>","tenant_id":"<uuid>","role":"authenticated","global_role":"invitado"}';
update public.v_quiz_questions set pregunta=pregunta where true; -- 42501
rollback;

-- SEC-PR4-02: ver §2; las 7 políticas muestran cual = with_check en pg_policies.
select tablename, policyname, qual, with_check from pg_policies
where schemaname='public' and policyname in ('companies_write','diagnostics_write',
 'documents_write','iih_assets_write','profiles_write','samples_write','water_balances_write');
```

*Sin secretos, sin datos reales, sin merge. El merge y la re-revisión corresponden al
supervisor y a seguridad.*
