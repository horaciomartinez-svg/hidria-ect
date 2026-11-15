# F1-08c — DB/RLS M5 IIH + soporte EF-09 (task-136)

- **Agente:** `arquitecto-bd` (02), coordinación F1-08a (UI) / F1-08b (EF-09)
- **Rama:** `feat/F1-08c-iih`, base `main@2052eda`
- **Migración:** `20261108110000_f1_08c_iih.sql`
- **BD:** `schema_migrations = 37`; forward-only; `docs/02` intacto.
- **PR:** #62.

## Auditoría

- `iih_assets` ya tenía columnas/CHECK/FK, folio server-side (`trg_iih_folio`) y RLS por rol/membresía: SELECT miembros del diagnóstico; INSERT/UPDATE/DELETE solo `coordinador|equipo`.
- Gaps: sin guard de tenant/diagnóstico, sin inmutabilidad de claves, sin auditoría DB y sin import atómico XLSX para EF-09.
- No hay columna `m²` en docs/02; `capacidad`/`capacidad_unidad` son la referencia. No se añaden columnas.

## Migración

- **`trg_iih_assets_guard`**: `organization_id` debe coincidir con `diagnostics.organization_id`; `diagnostic_id`/`organization_id`/`folio` inmutables en UPDATE; `asset_type_id` debe corresponder a `stage_code`.
- **`trg_iih_assets_audit`**: audit DB de INSERT/UPDATE autenticados; EF-09 conserva su auditoría atómica.
- **`fn_import_iih_assets(p_user_id,p_diagnostic_id,p_document_id,p_rows jsonb,p_checksum text,p_idempotency_key,p_request_hash)`**:
  SECURITY DEFINER service_role-only; valida tenant/rol, documento del mismo diagnóstico/tenant, `upload_status='registered'` y MIME XLSX/XLS, checksum contra `documents.sha256`; filas con `asset_code` (o `asset_type_id` fallback), `stage_code`/tipo, enums/rangos; inserta con folio server-side y **prioridad calculada desde criticidad**; devuelve `filas_ok`/`filas_rechazadas[{fila,razon}]`; audit `create` + idempotencia; `verificado_v1=false`.
- Sin columnas nuevas; el documento/mapeo queda en `audit_log.meta`.

## Tests

`130_f1_08c_iih.sql` **plan 24**:
- catálogos, RLS roles, organización/tenant, inmutabilidad y folio;
- import válido/rechazado, idempotencia/replay;
- documento ajeno/otro tenant, MIME no XLSX, documento no registrado, checksum distinto y 0 filas insertadas en cada rechazo;
- auditoría DB.
Total pgTAP **412** (388 + 24); BD=repo=37.

## Contrato/coordinación

- EF-09 propone JSON con `document_id` de EF-08 (no multipart); la EF descarga el XLSX con credenciales server-side y llama a la RPC. Aprobado por arquitecto; patch docs/04 a Lead/revisor.
- `p_rows` usa `asset_code` y no `prioridad`; la RPC calcula prioridad server-side.
- UI: CRUD manual por PostgREST; import solo EF-09; no cambia `fase_actual`.
- `docs/02` intacto; sin `app/**`/`functions/**`.
