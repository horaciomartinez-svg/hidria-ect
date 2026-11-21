# ADR-016 — F1-11: M10 Bitácora + EF-02 (cierre, firmas, 24 h y gate de reporte)

**Estado:** aceptado (Lead, 2026-11-21) — base `main@e6ab1c8`.
**Ámbito:** F1-11 (M10 + EF-02). Decisiones vinculantes; no implementa código.

## Contexto

Existen `logbook_templates` (8 fichas), `logbook_entries` con folio server-side (`trg_logbook_folio`) y trigger de inmutabilidad (`trg_logbook_immutable`), hijas `logbook_participants/agenda/findings/agreements/evidence/change_log`, RLS por membresía y `trg_logbook_folio`. Faltan: estados `en_revision`, guardas post-cierre en hijas, RPC/EF-02, regla 24 h server-side, inmutabilidad 42501, gate de reporte y UI M10.

## Decisiones

### D1 — Estados y TD-8
- `logbook_entries.estado`: **`abierta → en_revision → cerrada`**. CHECK migrado a los tres estados.
- `abierta → en_revision`: acción explícita `submit-review` de EF-02 (coord/equipo); la ficha sigue editable en `abierta` y `en_revision`, salvo campos de cierre.
- `en_revision → cerrada`: solo `close` de EF-02; **no** se cierra desde `abierta` (evita saltarse la revisión). Cierre = rama terminal inmutable.
- “Firmada” no es un estado separado: se representa por `logbook_participants.firma_ts` de los asistentes requeridos + `cerrada_en`; una ficha cerrada no admite cambios (42501).
- Quién firma: cada participante registrado firma su propia fila (`fn_sign_logbook_participant`, coord/equipo); el cierre exige que los asistentes requeridos estén firmados. La firma electrónica NOM-151 es fase 3 (EF-13), fuera de F1-11.

### D2 — Regla ≤24 h (TD-8)
- **Timestamp del evento:** `(fecha + horario_inicio)` interpretado en `America/Mexico_City` y convertido a `timestamptz`; se compara contra `now()` server-side.
- **≤24 h:** cierre normal; `cerrada_razon` opcional.
- **>24 h:** cierre **bloqueado** con `VALIDATION_RAZON` (422) si `cerrada_razon` falta o tiene <10 caracteres. Con razón válida se permite, marca `cierre_tardio=true`, y la auditoría/`logbook_change_log` lo registran.
- **Al vencer:** no se cambia automáticamente el semáforo ni se escala en F1-11; el cierre tardío queda visible (`cierre_tardio`, razón, audit). Escalamiento/job y semáforo de atraso son follow-up F1-13 (no bloqueante de F1-11).
- Caso límite: exactamente 24 h se considera normal (`now() <= event_ts + interval '24 hours'`); el bloqueo aplica con `>`.

### D3 — Validaciones de cierre (server-side, RPC)
- **Firmas:** contar los segmentos de `logbook_templates.asistentes_requeridos` separados por `·`; exigir al menos ese número de `logbook_participants` con `firma_ts not null`. Sin firmas suficientes ⇒ `VALIDATION_FIRMAS` 422.
- **Agenda:** deben existir al menos tantas filas `logbook_agenda` como `agenda_items` del template, cubriendo `no=1..N`; cada fila con `estado='no_realizado'` o `'modificado'` exige `resultado` no vacío. Incumplimiento ⇒ `VALIDATION_AGENDA` 422.
- **Evidencia:** al menos tantas `logbook_evidence` como `evidence_items` del template; toda fila con `obligatorio=true` exige `document_id` (y documento del tenant/diagnóstico). Incumplimiento ⇒ `VALIDATION_EVIDENCIA` 422.
- **Rol/tenant:** coordinador/equipo con membresía en el diagnóstico; ficha del tenant; no cross-tenant; 403 anti-enumeración.
- **Precedencia:** `FORBIDDEN_*` → `CONFLICT_STATE` (estado incorrecto) → `VALIDATION_FIRMAS` → `VALIDATION_AGENDA` → `VALIDATION_EVIDENCIA` → `VALIDATION_RAZON` (24 h).

### D4 — RPC y EF-02
- `fn_submit_logbook_review(p_user_id,p_entry_id,p_idempotency_key,p_request_hash)`: `abierta→en_revision`, audit `update`, idempotencia `EF-02.submit-review`.
- `fn_sign_logbook_participant(p_user_id,p_entry_id,p_participante,p_idempotency_key,p_request_hash)`: set `firma_ts=now()` si `abierta|en_revision`, audit `update`, idempotencia `EF-02.sign`.
- `fn_close_logbook(p_user_id,p_entry_id,p_cierre_razon,p_idempotency_key,p_request_hash)`: valida D3, calcula `cierre_tardio`, `UPDATE estado/cerrada_en/razon/version+1/cierre_tardio`, inserta `logbook_change_log` con snapshot previo, audit `sign`, actualiza `diagnostics.bitacora_cerrada` (true si las 8 fichas V1,V2,V3,R1..R5 están cerradas), idempotencia `EF-02.close`.
- Rutas EF-02: `POST /functions/v1/ef-02-logbook/logbook/{entry_id}/submit-review|sign|close` (alias `/logbook/{id}/...`).
- Todas las RPC: `SECURITY DEFINER`, `search_path=public,pg_temp`, `REVOKE` public/anon/authenticated, `GRANT EXECUTE service_role`.

### D5 — Gate de reporte (F1-12)
- `v_diagnostic_completeness.p7_bitacoras` exige 8 fichas cerradas (ya existente) y `diagnostics.bitacora_cerrada=true` se fija server-side cuando 8/8 están cerradas.
- EF-07/F1-12 exige `p7_bitacoras`/`bitacora_cerrada` antes de emitir; no se añade fase nueva. La bitácora cerrada es prerrequisito de reporte, no gate de fase F2–F6.
- `bitacora_cerrada` nunca se envía desde cliente; UPDATE directo autenticado ⇒ 42501.

### D6 — Inmutabilidad y append-only
- `logbook_entries` cerrada: UPDATE/DELETE ⇒ **42501** (cambiar `trg_logbook_immutable` para errcode 42501); folio/org/diagnóstico/clave inmutables en UPDATE.
- Escrituras autenticadas sobre `estado`, `cerrada_en`, `cerrada_razon`, `version`, `folio`, `cierre_tardio` bloqueadas (solo RPC service_role).
- Hijas (`participants/agenda/findings/agreements/evidence`) cerrada ⇒ INSERT/UPDATE/DELETE 42501 vía triggers; `logbook_change_log` solo INSERT (append-only) y sin UPDATE/DELETE para authenticated.
- `organization_id` de la ficha se fija desde el diagnóstico en INSERT (server-side) y se valida; folio sigue server-side.
- `logbook_change_log` guarda snapshot JSONB previo, versión y responsable; nunca se actualiza.

### D7 — UI M10
- `/bitacora` (selector por diagnóstico) y `/bitacora/:entryId`: 8 fichas con estado/folio/fecha; agenda, participantes/firmas, hallazgos, acuerdos y evidencia (documento vía EF-08); botones `Enviar a revisión`, `Firmar participante`, `Cerrar ficha`; aviso 24 h con `cerrada_razon`; post-cierre read-only; a11y/offline/E2E.
- La UI no calcula 24 h ni decide el cierre; muestra el resultado del servidor.

### D8 — Pruebas
- pgTAP `160`: LB-01…05, regla 24 h límite (exactamente 24 h vs 24 h + 1 s), estados, firmas, agenda, evidencia, 42501 post-cierre, RLS/ACL/idempotencia/audit, `bitacora_cerrada` 8/8, gate reporte.
- Deno EF-02: submit/sign/close, roles/tenant/errores/idempotencia.
- E2E UI M10: edición, firma, en_revision, cierre/razón, post-cierre read-only, a11y/offline.

## Adenda 2026-11-21 — cierres B1–B8 del arquitecto

### D9 — Migración mínima y firma por nombre
- `ALTER TABLE logbook_entries` CHECK `estado` → `abierta|en_revision|cerrada`; añadir `cierre_tardio boolean not null default false`.
- `logbook_participants` PK actual `(entry_id,nombre)`: la firma se identifica por **`p_participante_nombre text`** (nombre exacto, PK de la fila), no por un id inexistente. `fn_sign_logbook_participant(...,p_participante_nombre,...)` valida que la fila exista en la entry y fija `firma_ts=now()`; nombres duplicados imposibles por PK. Documentar en docs/04.
- Se mantiene `logbook_entries.folio` server-side (`trg_logbook_folio`) y `organization_id` se fija desde `diagnostics.organization_id` en INSERT, validando tenant.

### D10 — RLS/guards detallados
- **entries:** SELECT por membresía; INSERT/UPDATE solo `coordinador|equipo` (`fn_diag_role`); gate fields (`estado`, `cerrada_en`, `cerrada_razon`, `version`, `cierre_tardio`) solo RPC service_role; folio/org/diagnóstico/clave inmutables.
- **hijas** (`participants`,`agenda`,`findings`,`agreements`,`evidence`): SELECT membresía; INSERT/UPDATE/DELETE solo coord/equipo y **solo si la entry no está cerrada**; guard 42501 si `estado='cerrada'`.
- **change_log:** SELECT membresía; INSERT solo por RPC service_role (o trigger de cierre); **sin UPDATE/DELETE** (append-only) y sin INSERT authenticated.
- `trg_logbook_immutable` cambia a **errcode 42501**; se añade guard `trg_logbook_child_immutable`/función para hijas.
- `logbook_change_log.prev` guarda el snapshot de la entry antes del cierre; `descripcion='cierre de ficha'`, `responsable=p_user_id`, `version` nueva.

### D11 — Matching exacto y 24 h
- Agenda: por `no` 1..N contra el orden de `agenda_items` del template; `estado='no_realizado'|'modificado'` ⇒ `resultado` no vacío. Evidencia: por `item` (texto exacto del `evidence_items`); `obligatorio=true` ⇒ `document_id` no nulo y documento del mismo diagnóstico/tenant.
- Firmas requeridas: `string_to_array(asistentes_requeridos, '·')` depurado; se exige `count(distinct nombre)` con `firma_ts` ≥ número de segmentos; no se aceptan firmas de otro tenant/diagnóstico.
- 24 h: `event_ts = ((fecha + horario_inicio) AT TIME ZONE 'America/Mexico_City')`; `now() <= event_ts + interval '24 hours'` normal; `>` exige razón ≥10 y `cierre_tardio=true`; DST se resuelve con `AT TIME ZONE` de la zona IANA.
- `bitacora_cerrada=true` solo cuando existen 8 entries `V1,V2,V3,R1,R2,R3,R4,R5` cerradas del diagnóstico; no se acepta desde cliente.

### D12 — Alta de fichas, poblado inicial y contrato UI
- **Alta:** las 8 fichas se crean desde la UI con INSERT directo bajo RLS (coord/equipo), aportando `clave`, `fecha`, `horario_inicio`, `responsable_sesion`, `modalidad`, `lugar`; `organization_id` se fija server-side desde el diagnóstico, folio por `trg_logbook_folio`, `estado='abierta'`, `version=1`. No se crea EF de alta (cabe en RLS+trigger).
- **Poblado inicial:** trigger `trg_logbook_seed_children` (BEFORE/AFTER INSERT en entries) siembra `logbook_agenda` (una fila por `agenda_items`, `no` 1..N, `estado='realizado'` inicial) y `logbook_evidence` (una fila por `evidence_items`, `obligatorio=true`, `document_id=null`), para que la UI solo edite/complete. Participantes los agrega coord/equipo (RLS); firmas por nombre.
- **Firma:** la UI muestra “Firmar” por participante; coord/equipo registra la firma con `fn_sign_logbook_participant` (representa la firma del acta; no hay cuentas para asistentes externos). `firma_ts` es server-side.
- **24 h en UI:** no se calcula en cliente. La UI muestra el campo `cierre_razon` opcional y el aviso “cierre tardío requiere justificación”; el servidor responde 422 `VALIDATION_RAZON`/200 y la UI solo refleja el resultado. No hay endpoint de precheck en F1-11.
- **Fotos:** `photo_log`/fotos quedan fuera de F1-11 (follow-up F1-13/M10 ampliado); la evidencia de bitácora se cubre con `documents` vía EF-08.
- **Gate de reporte:** la UI lee `diagnostics.bitacora_cerrada` y `v_diagnostic_completeness.p7_bitacoras`; muestra 8/8 y el aviso de prerrequisito de reporte.
- **RLS hijas:** edición directa por coord/equipo hasta `cerrada` (RLS + guards); observador/empresa solo lectura; cierre/firma/revisión solo EF-02.

### D13 — Cierres EF/DB y gate de reporte
- **Catálogo EF-02:** añadir endpoints `EF-02.submit-review`, `EF-02.sign`, `EF-02.close` en `_shared/auth.ts` con roles `coordinador|equipo`; las tres comparten auth/claims/tenant/anti-enumeración.
- **Identidad de firma:** `logbook_participants` PK `(entry_id,nombre)`; `fn_sign_logbook_participant(...,p_participante_nombre text,...)` valida nombre exacto; coord/equipo registran la firma en representación del asistente (acta; sin cuentas externas). `firma_ts` server-side; no se firma por otro diagnóstico/entry.
- **`p7_bitacoras`/`bitacora_cerrada`:** exige **una ficha cerrada por cada clave requerida** `V1,V2,V3,R1,R2,R3,R4,R5` (8 claves distintas); sesiones extra (p. ej. segunda V1) no cuentan como requisito ni lo bloquean si están abiertas. `bitacora_cerrada=true` cuando las 8 claves requeridas tienen al menos una entry cerrada; se recalcula server-side tras cada cierre.
- **Notificación:** tras `close`, notificación `kind='validacion'` best-effort a miembros de la organización del diagnóstico (empresa/contraparte) si el template es tipo `reunion`; error de notificación no revierte el cierre. Evento `logbook_closed`.
- **Respuesta close:** `{entry_id,folio,clave,cerrada_en,version,cierre_tardio}`.
- **No hay precheck 24 h**; la UI ofrece razón opcional y reacciona a 422/200 del servidor.

## Evidencia
`docs/01` §4.10, `docs/04` EF-02/TD-8, `docs/05` LB-01…08, `docs/02` tablas/triggers, `main@e6ab1c8`.
