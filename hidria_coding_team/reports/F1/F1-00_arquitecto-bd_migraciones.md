# F1-00 — Migraciones correctivas y grants DML (M-01…M-08)

- **Agente:** `arquitecto-bd` (02)
- **Fecha:** 2026-11-07 19:20 (America/Mexico_City)
- **Tarea:** `hidria_coding_team/tasks/F1/F1-00_migraciones_correctivas.md`
- **Rama:** `feature/F1-00-migraciones` (desde `main` `8008a64`)
- **Entorno:** proyecto `zucalshlfcxejpukshxl` usado como dev/staging con **datos sintéticos** (ADR-004 E2)
- **Commit:** `b0bbabe` (implementación); HEAD del PR `72551fa` (ver GitHub)
- **PR:** [#4](https://github.com/horaciomartinez-svg/hidria-ect/pull/4) (`feature/F1-00-migraciones` → `main`)
- **CI:** `Guardas de repositorio` ✅ y `Cliente (lint + typecheck + build)` ✅ sobre `72551fa`
- **Modo de aplicación:** MCP Supabase `apply_migration` (tool oficial) + verificación SQL. Las migraciones son **forward-only**; **no** se editó `20261031000000_base_hidria_mdohi.sql` ni `docs/02`.

## Resultado: VERDE

Se aplicaron **8 migraciones nuevas** (3 bases previas + 8 = 11 en `schema_migrations`), verificadas
contra el proyecto. Se corrigieron H-1 (grants), H-2 (fugas de vistas), H-4, H-5 y M-01…M-08.
Quedan dos pendientes de **entorno**, no de esquema: (a) la ejecución de pgTAP requiere Docker/DB
en CI (no disponible en este host; se entregaron los archivos y se ejecutaron aserciones SQL
equivalentes), y (b) la activación del auth hook y el ajuste de "Allow public access" de Realtime
dependen de credencial/consola (E3).

## 1. Migraciones aplicadas

| # | Archivo | Objetos | Aplicada |
|---|---|---|---|
| 1 | `20261108010000_f1_00_api_idempotency.sql` | M-01 tabla `api_idempotency` + índices + RLS sin políticas | ✅ |
| 2 | `20261108010100_f1_00_audit_folio.sql` | M-02 `fn_audit_write`, lock, unique `prev_hash`, CHECK ampliado, índice idempotency; M-03 `report_emissions` + trigger `-R1/-R2` | ✅ |
| 3 | `20261108010200_f1_00_bhe_rpc.sql` | M-04 `fn_bhe_monthly`/`fn_bhe_summary` + `v_bhe_summary.brecha_anual_pct` | ✅ |
| 4 | `20261108010300_f1_00_realtime.sql` | M-05 publicación `supabase_realtime` + políticas `realtime.messages` | ✅ |
| 5 | `20261108010400_f1_00_roles_completeness.sql` | M-06 `fn_diag_role`/`fn_is_diag_member`; M-08 `fn_completeness`/`fn_reporte_emitible` + vista actualizada | ✅ |
| 6 | `20261108010500_f1_00_grants_views_seed.sql` | Grants DML; `security_invoker`; M-07 default; nombre institucional | ✅ |
| 7 | `20261108010600_f1_00_enforcement_hook.sql` | H-5 custodia/F6/vigente; `custom_access_token_hook` | ✅ |
| 8 | `20261108010700_f1_00_fix_audit_hash.sql` | Corrección forward-only de `search_path` de `trg_audit_hash` (pgcrypto en `extensions`) | ✅ |

**Sello de aplicación:** `schema_migrations` tiene 11 filas (3 previas + 8 nuevas), sin editar las
3 originales. `docs/02` y la migración base siguen byte-idénticos
(SHA-256 `2a7b6f88…42cb5`, guarda de CI intacta).

### Hashes de los archivos nuevos

| Archivo | SHA-256 |
|---|---|
| `20261108010000_f1_00_api_idempotency.sql` | `81ed47f2b968691350df1e3c8f0583d8ec030068914c9be9c85b015ac9d736a8` |
| `20261108010100_f1_00_audit_folio.sql` | `20d9ba2f560231bc699ddd57c73355d338ba7522a1f52ee8175016d626603f25` |
| `20261108010200_f1_00_bhe_rpc.sql` | `5dc9ebacde5de6f9f3fc3d284ce5f7307611786eb89a5ffbab635f3ddd5a6a6e` |
| `20261108010300_f1_00_realtime.sql` | `3f10aeec9c49f1d3dd30723140d5097c244b91ad10db7d28ec787472d06fd7f4` |
| `20261108010400_f1_00_roles_completeness.sql` | `b1cdf65d8e8fe1d58f8d5ed5460f9fac2ae3416e8d7c27e374f4f9630d97c32a` |
| `20261108010500_f1_00_grants_views_seed.sql` | `ba9bf34ecffe9018bbf4af60e0002a72741a2db7015f9f15838804f97dbb2635` |
| `20261108010600_f1_00_enforcement_hook.sql` | `110365fce3268c4ecc0fc035f6b86be0f000d13ce3a447a04954e82d106e1409` |
| `20261108010700_f1_00_fix_audit_hash.sql` | `5793569c4838da4ff435480c4e94f4780ca608424c6d9c48a6ad34b4c187584e` |

## 2. Evidencia por objeto

### M-01 — `api_idempotency`

- Tabla creada con `unique (user_id, endpoint, key)`, `expires_at` (7 días) e índices
  `idx_api_idempotency_expires`/`idx_api_idempotency_user`.
- RLS habilitada, **0 políticas** (deniega `authenticated`/`anon`); solo `service_role`.
- Prueba: dos inserciones de la misma clave con `on conflict do nothing` ⇒ **1 fila**.

### M-02 — auditoría encadenada

- `fn_audit_write(uuid,text,text,text,jsonb)` security definer; `pg_advisory_xact_lock(20261108010100)`.
- `trg_audit_hash` serializado y con `search_path=public,extensions,pg_temp` (fix posterior).
- Índice único parcial `audit_log_prev_hash_uniq` (excluye `GENESIS`); índice
  `audit_log_idempotency_key_idx` sobre `meta->>'idempotency_key'`.
- CHECK de `audit_log.action` ampliado con `reject` y `error`.
- Prueba (transacción con rollback): 3 acciones (`create`, `reject`, `error`) ⇒ 3 filas,
  cadena lineal `GENESIS → hash1 → hash2 → hash3` y `fn_audit_write` devuelve hash de 64 hex.

### M-03 — folio de reporte

- `report_emissions` (diagnostic_id, revision, folio, document_id, matriz jsonb, emitido_por),
  `unique (diagnostic_id, revision)`, `folio` único; trigger `report_emission_folio` bloquea el
  diagnóstico y asigna revisión/folio; RLS select por membresía; escritura solo `service_role`.
- Prueba: dos emisiones ⇒ `MDOHI-2026-005-R1` y `MDOHI-2026-005-R2` (sin sobrescritura).

### M-04 — RPC BHE pre-R3

- `fn_bhe_monthly(balance_id)` **sin** filtro de estado; `fn_bhe_summary(balance_id)` con
  `brecha_anual_pct = 100*sum(brecha_m3)/nullif(sum(entradas_m3),0)`, `meses_sobre_umbral` y
  `balance_no_cierra`.
- `v_bhe_summary` conserva sus columnas y agrega `brecha_anual_pct` al final.
- Prueba con balance sintético `en_captura` (entrada 100 m³/mes, destino 87.4): julio
  `brecha_pct=12.6`; resumen `brecha_anual_pct=12.6`, `meses_sobre_umbral=12`,
  `balance_no_cierra=true`; 12 filas mensuales.

### M-05 — Realtime

- `supabase_realtime` publica `notifications`, `diagnostics`, `document_checklist_items`,
  `samples`, `logbook_entries` (5 tablas).
- 3 políticas en `realtime.messages` para canales privados `diagnostic:{id}`, `org:{id}`,
  `user:{id}` (SELECT, `extension='broadcast'`); resuelven membresía con `is_diagnostic_member`,
  `is_tenant_member` y `auth.uid()`.
- Prueba de predicado: con `request.jwt.claims` sintéticos y `realtime.topic()` =
  `diagnostic:<uuid>`, `is_diagnostic_member` y `is_tenant_member` devuelven `true`; el topic se
  castea a UUID válido. **Pendiente de entorno:** desactivar "Allow public access" en Realtime
  Settings (consola) para forzar canales privados; la prueba RT-01/02 completa es F1-17.

### M-06 — RPC de rol para service_role

- `fn_diag_role(user_id, diagnostic_id)` y `fn_is_diag_member(user_id, diagnostic_id)`
  (`security definer`, mismas tablas/semántica que las de `auth.uid()`).
- `revoke all from public, anon, authenticated`; `grant execute to service_role`.
- Prueba: usuario/diagnóstico inexistentes ⇒ `NULL`/`false`; `has_function_privilege` confirma
  que `authenticated` **no** puede ejecutarlas y `service_role` sí.

### M-07 + semilla

- `profiles.global_role default 'invitado'` (dentro del CHECK). Prueba: perfil insertado sin
  `global_role` ⇒ `invitado`.
- `organizations.name` actualizado a `SRHDS — Programa HIDRIA` (id de semilla), sin editar
  `docs/03` ni la migración aplicada.

### M-08 — completitud 10/10

- `v_diagnostic_completeness` actualizada: `p4_custodia` exige 3 transferencias **firmadas**
  (firma no nula/no vacía) y `p8_ivoh` exige **6/6** factores validados.
- `fn_completeness(diagnostic_id)` devuelve `orden, nombre, verificado_en, ok, reporte_emitible`
  (10 filas desde `completeness_items` + vista); `fn_reporte_emitible` devuelve el AND.
- Prueba: diagnóstico sin datos ⇒ 10 filas, `ok=false`, `reporte_emitible=false`.
- Prueba RLS: como `authenticated` del tenant A, `fn_completeness` devuelve 10 filas y
  `fn_reporte_emitible=false`.

### H-5 — enforcement

- **Custodia:** `trg_custody_gate` exige 3 transferencias con `firma` no nula y no vacía.
  Prueba: 3 transferencias con firma vacía ⇒ excepción `Dictamen bloqueado…`; tras firmar ⇒
  `lab_results` con dictamen insertado.
- **Gate F6:** `check_phase_gate` exige `count(validado_r4)=6`. Prueba: con 5/6 ⇒
  `Gate F6: el IVOH no está validado en R4 (se requieren 6/6 factores).`; con 6/6 ⇒ avance a
  fase 6 y `p8_ivoh=true`.
- **Versión vigente única:** índice único parcial `uq_ivoh_index_versions_vigente`; prueba:
  insertar una segunda fila `vigente=true` ⇒ `duplicate key … uq_ivoh_index_versions_vigente`.
- **Lock de auditoría:** `trg_audit_hash` con `pg_advisory_xact_lock`; cadena lineal probada
  con 3 inserciones (SEC-06 pendiente de prueba concurrente real).

## 3. Grants y `security_invoker`

| Comprobación | Resultado |
|---|---|
| Tablas `public` | **46** (44 base + `api_idempotency` + `report_emissions`) |
| Tablas con RLS | **46/46** |
| Vistas | **6** |
| Políticas en `public` | **105** |
| `authenticated` SELECT en relaciones | **50/52** (excluye `quiz_questions` cruda y `api_idempotency`) |
| `anon` SELECT/INSERT en tablas | **0** |
| `service_role` SELECT/INSERT | acceso de servicio en todas; **sin UPDATE/DELETE en `audit_log`** |
| `quiz_questions` cruda | `authenticated` **sin SELECT**; `service_role` **con SELECT** (14 filas) |
| `v_quiz_questions` | `authenticated` **con SELECT** (14 filas; sin `correcta`) |
| `audit_log` | `authenticated` SELECT (RLS admin), sin INSERT/UPDATE/DELETE; `service_role` INSERT, sin UPDATE/DELETE |
| `api_idempotency` | solo `service_role` (authenticated/anon denegados) |
| `security_invoker=true` | **5/6 vistas** (`v_bhe_monthly`, `v_bhe_summary`, `v_balance_indicators`, `v_ivoh_score`, `v_diagnostic_completeness`) |
| `v_quiz_questions` | sigue **definer** (`reloptions=NULL`) |
| Funciones helper RLS | `authenticated` puede ejecutar `is_tenant_member`, `my_diagnostic_role`, `is_diagnostic_member`, `is_logbook_entry_member` |
| `fn_audit_write`/`fn_bhe_*`/`fn_diag_role` | solo `service_role`; `authenticated` no puede ejecutarlas |
| `custom_access_token_hook` | solo `supabase_auth_admin`; `authenticated`/`service_role` sin EXECUTE |

**Prueba de aislamiento (fixtures sintéticos en transacción + rollback):** con claims del tenant A
(`tenant_id`, `sub` de usuario A), `authenticated` ve **1** diagnóstico, **1** organización,
**1** perfil, **1** fila en `v_diagnostic_completeness`, **1** en `v_bhe_summary` y **1** en
`v_balance_indicators` (los del tenant B quedan filtrados); `v_quiz_questions` devuelve 14 y
`audit_log` 0. Sin `security_invoker`, las 5 vistas habrían devuelto **2** (fuga).

## 4. Auth hook (ADR-005 / E3)

- `public.custom_access_token_hook(event jsonb)` (`security definer`, `search_path=public,pg_temp`)
  emite `organization_id`, `tenant_id` (mismo UUID) y `global_role` desde `profiles`; preserva el
  resto de claims; sin perfil devuelve `error.http_code=403`.
- Prueba sintética: claims resultantes
  `{"organization_id":"…","tenant_id":"…","global_role":"equipo","sub":"…"}` (mismos UUID);
  usuario sin perfil ⇒ `{"error":{"http_code":403,...}}`.
- **No activado:** falta `SUPABASE_ACCESS_TOKEN` (E3). URI previsto:
  `pg-functions://postgres/public/custom_access_token_hook`. La activación se hará por
  dashboard/Management API cuando el usuario aporte el token; no se usó `service_role` en cliente.

## 5. pgTAP

Se añadieron **4 suites** en `supabase/tests/`:

| Archivo | Cobertura |
|---|---|
| `010_f1_00_grants_views.sql` | grants, banco de preguntas crudo vs vista, `security_invoker`, helper RLS |
| `020_f1_00_idempotency_audit.sql` | M-01 unicidad, M-02 hash/cadena/acciones `reject`/`error` |
| `030_f1_00_folio_bhe_completeness.sql` | M-03 folio `-R1/-R2`, M-04 brecha mensual/ponderada, M-08 10 requisitos |
| `040_f1_00_enforcement_realtime.sql` | H-5 (F6 6/6, custodia firmada, vigente único), auth hook, Realtime |

**Limitación de ejecución:** este host no tiene Docker y `pg_prove`/`supabase test db` no están
disponibles; la CI actual (`ci.yml`) solo ejecuta guardas + cliente, sin servicio Postgres
(DevOps/QA, tarea F1-16/F0-07). Por ello, las mismas reglas se verificaron con **aserciones SQL
equivalentes** vía MCP (resultados en §2/§3) y las suites quedan listas para el runner de CI.
No se dejó la extensión `pgtap` instalada en el proyecto.

## 6. Riesgos y pendientes

1. **Realtime privado:** para que RT-02 sea efectivo hay que desactivar "Allow public access" en
   Realtime Settings (consola/Management API). Las políticas ya están creadas y la publicación
   incluye las 5 tablas. Prueba E2E/RT-01/02: F1-17.
2. **Auth hook:** activación pendiente de `SUPABASE_ACCESS_TOKEN` (E3). Sin activación, los JWT
   no llevan claims; el guard de 401 de F1-01 debe rechazar tokens sin `organization_id`.
3. **pgTAP en CI:** falta servicio Postgres en el workflow (DevOps). Las suites están entregadas.
4. **Prueba concurrente real de la cadena de auditoría:** el diseño está serializado con
   advisoria lock y unique de `prev_hash`; SEC-06 concurrente se ejecutará en CI/F1-01.
5. **Docs:** `docs/01/02/04/05/07` deben reflejar grants, `security_invoker`, `report_emissions`,
   claims y `v_diagnostic_completeness` (F1-18; no se editan en este PR por la regla de
   byte-identidad de `docs/02` con la migración base).

## 7. Reproducción (comandos clave)

```sql
-- estado de migraciones (11 filas)
select name from supabase_migrations.schema_migrations order by version;

-- grants / vistas
select has_table_privilege('authenticated','public.quiz_questions','SELECT'); -- false
select reloptions from pg_class where oid='public.v_bhe_monthly'::regclass;   -- {security_invoker=true}

-- M-04
select * from public.fn_bhe_monthly('<balance_id>');
select * from public.fn_bhe_summary('<balance_id>');

-- M-03
insert into public.report_emissions(diagnostic_id, matriz) values ('<diag>','[]');
select folio, revision from public.report_emissions where diagnostic_id='<diag>';

-- H-5 / auditoría / hook
select public.fn_audit_write('<user>','create','diagnostics','<id>','{}'::jsonb);
select public.custom_access_token_hook('{"user_id":"<user>","claims":{},"authentication_method":"password"}'::jsonb);
```

## 8. Conclusión y siguiente paso

- **F1-00 VERDE** en migraciones, grants, vistas, semilla, hook y enforcement H-5, con evidencia
  en vivo. Las migraciones son idempotentes (`if not exists`/`create or replace`/`drop policy if
  exists`) y forward-only; no se editó la base.
- Pendientes de entorno (no de esquema): ejecución pgTAP en CI, activación del hook (E3) y ajuste
  de Realtime privado (consola) antes de RT-01/02. El PR queda para spec review + seguridad + QA;
  el merge es exclusivo del supervisor.
