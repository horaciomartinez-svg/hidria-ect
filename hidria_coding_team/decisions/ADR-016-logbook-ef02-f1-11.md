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

## Evidencia
`docs/01` §4.10, `docs/04` EF-02/TD-8, `docs/05` LB-01…08, `docs/02` tablas/triggers, `main@e6ab1c8`.
