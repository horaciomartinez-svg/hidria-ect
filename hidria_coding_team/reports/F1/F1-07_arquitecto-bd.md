# F1-07c — CAT A1-v1: seed, RLS, validación y RPC EF-04 (task-127)

- **Agente:** `arquitecto-bd` (02), coordinación F1-07a (UI) / F1-07b (EF-04)
- **Rama:** `feat/F1-07c-cat-seed`, base `main@2535950`
- **Migraciones:** `20261108100000_f1_07c_cat_responses.sql`, `20261108101000_f1_07c_cat_rpc.sql`, `20261108102000_f1_07c_cat_fix.sql`
- **BD esperada:** `schema_migrations = 36`; forward-only; `docs/02` intacto.
- **PR:** #58.

## Auditoría

- El banco **A1-v1 de 47 preguntas ya existe** en `docs/03` §7 y en el seed (`cat_items` 47; 8 secciones A–H; orden 1..47). **No se crea seed nuevo ni se toca `docs/08`** (quiz del aula, 43).
- `cat_responses` tenía RLS por membresía (observador/invitado podían escribir), duplicaba políticas `cat_empresa_*`, no validaba tipo/opciones/N-A ni documento, no era inmutable y no auditaba.
- `cat_items` SELECT authenticated y administración admin eran correctos.
- Gap real ⇒ migraciones forward-only.

## Migración

1. **`100000`**
   - `cat_responses`: escritura solo `coordinador|equipo|empresa`; lectura por membresía; sin DELETE.
   - `trg_cat_response_validate`: ítem existente; `created_by=auth.uid()`; `no_se`/`na` excluyentes; `opcion_unica`/`multiple`/abierta según opciones; documento del mismo diagnóstico/tenant y `upload_status='registered'`.
   - `trg_cat_response_audit`: auditoría DB de cambios autenticados (EF-04 con service_role conserva su auditoría atómica).
2. **`101000` — RPC EF-04**
   - `fn_submit_cat(p_user_id,p_diagnostic_id,p_idempotency_key,p_request_hash)`: roles empresa/coord/equipo; `no_enviado|en_captura → en_revision`; completitud de los 47 ítems (`valor`/`no_se`/`na`; evidencia si `resuelta_en_campo`); audit `update` + idempotencia.
   - `fn_validate_cat_r2(...,p_ficha_r2_id,...)`: coord/equipo; `en_revision`; ficha R2 **cerrada** del mismo diagnóstico; si hay `no_se`, exige hallazgo en la ficha; `validado_r2`; audit `approve` + idempotencia.
   - Ambas SECURITY DEFINER, `search_path` fijo, EXECUTE solo `service_role`; respuesta `{ok,replayed,data:{diagnostic_id,cat_estado,pendientes},audit_ref}`.
3. **`102000` — VETO/robustez**
   - `cat_responses`: `diagnostic_id`/`item_id`/`created_by` **inmutables** en UPDATE (42501).
   - `multiple` no vacío y sin duplicados.
   - RPC: exige `diagnostics.estado='activo'` y `fase_actual` 1..3; `CONFLICT_STATE` con detalles.

`cat_items` no tiene `obligatoria`: regla documentada **toda pregunta aplicable es obligatoria**; no se añade columna en F1-07c.

## Tests

`120_f1_07c_cat.sql` **plan 34**:
- seed 47/8 secciones/orden;
- roles/lectura, observador/invitado sin escritura, cross-tenant;
- opciones/multiple/no_se, `na`/`no_se`, multiple vacío/duplicado, documento ajeno;
- `diagnostic_id`/`item_id`/`created_by` inmutables; UPDATE por roles;
- RPC ACL service_role, submit incompleto/faltantes, submit completo, replay/conflicto, validate sin ficha, validate completo y auditoría.
Total pgTAP **388** (354 + 34); EF Deno 194.

## Contrato y pendientes

- `docs/02` intacto; patches `docs/01`/`docs/04` (CAT/EF-04, `no_se`, ficha R2, regla de obligatoriedad) se proponen a Lead/revisor.
- `cat_items` seed no se modifica; si F2-06 exige `obligatoria`/rangos, será tarea posterior.
- La UI guarda borradores por PostgREST; submit/validate-r2 solo por EF-04/RPC.

## Coordinación

- **F1-07a:** contrato confirmado; no mueve `cat_estado` localmente.
- **F1-07b/EF-04:** consume las firmas de `101000`; `#59` integra tras merge de #58.
- **Seguridad/spec:** pendientes de re-revisión (VETO cerrado, tests RPC).
