# HIDRIA — Contratos de API y tablas de decisión para Edge Functions

## Documento de integración v1.0 — Ecosistema de Circularidad Tecnológica (ECT) · Metodología MD-OHI

---

# 0. Control del documento

| Campo | Valor |
|---|---|
| Documento | HIDRIA — Contratos de API y tablas de decisión (ítem 3 del roadmap) |
| Versión | 1.0 |
| Fecha | 2026-11-08 |
| Dependencias | `Arquitectura HIDRIA-ECT con MD-OHI v2.0.md` (decisión de stack 2026-11-08: **cliente React 18 + TS + Vite como PWA**); `01-Diseño-Base-de-Datos-HIDRIA-MD-OHI.md`; `02-supabase_schema_hidria_mdohi.sql` (fuente de verdad del esquema); `03-seed_catalogos.sql` |
| Audiencia | Equipo de agentes de IA / desarrolladores de las Edge Functions y del cliente |
| Alcance | Contratos de entrada/salida de las 13 Edge Functions, tablas de decisión de negocio, contrato de sincronización offline (PWA), eventos Realtime, catálogo de errores |

---

# 1. Alcance, principios y modelo de autoridad

## 1.1 Principio rector: RLS primero, Edge Function solo donde debe haber transacción

La mayoría de las operaciones del cliente **no pasan por Edge Functions**: el cliente React consume **PostgREST** (tablas y vistas) directamente, y la autorización la resuelve **RLS** con las funciones helper del esquema:

| Función helper (ya en el DDL) | Significado |
|---|---|
| `is_tenant_member(organization_id)` | Pertenece a la organización (tenant) |
| `is_diagnostic_member(diagnostic_id)` | Es miembro del diagnóstico (cualquier rol) |
| `my_diagnostic_role(diagnostic_id)` | Rol del usuario en ese diagnóstico: `coordinador` · `equipo` · `empresa` · `organismo_operador` · `observador` |
| `is_logbook_entry_member(entry_id)` | Miembro del diagnóstico al que pertenece la ficha de bitácora |

Las **Edge Functions existen únicamente donde se requiere una de estas cuatro cosas**:

1. **Transacción multi-tabla** que no puede expresarse como una sola sentencia (p. ej. avanzar fase + notificar + auditar).
2. **Gate de negocio con efectos colaterales** (validar R3 del BHE + escribir la referencia a la ficha de bitácora + recalcular avance).
3. **Integración externa** (Cloudflare R2 con URLs prefirmadas, importación XLSX, firma NOM-151 vía PSC, insignias Open Badges).
4. **Cálculo que no debe depender del cliente** (calificación del examen, verificación de estructura de archivos).

> **Regla de oro para el equipo de agentes:** si una operación cabe en una política RLS o en un trigger (el DDL ya contiene los gates de fase, custodia y BHE→IVOH), **no se crea Edge Function**. Las Edge Functions de este documento orquestan y añaden efectos; la autorización de fondo siempre es RLS y la excepción final siempre es un `raise exception` del trigger.

## 1.2 Mapa de enforcement (dónde vive cada regla)

| Regla de negocio | Enforcement primario | EF involucrada |
|---|---|---|
| Tenant aislado por `organization_id` | RLS (`is_tenant_member`) | — |
| Membresía y rol por diagnóstico | RLS (`my_diagnostic_role`) | todas (pre-chequeo) |
| Gate de fase F2–F6 (checklist R1, CAT R2, IIH V1, BHE R3, IVOH R4) | Trigger `check_phase_gate` | EF-01 |
| Brecha BHE > 10 % bloquea validación R3 | EF-05 (pre-chequeo + mensaje) | EF-05 |
| IVOH requiere BHE validado R3 | Trigger `trg_ivoh_requires_bhe` | EF-06 |
| Rúbricas/pesos IVOH inmutables en versión vigente | Trigger `trg_ivoh_version_immutable` | — |
| Dictamen de laboratorio requiere 3 custodias firmadas | Trigger `trg_custody_gate` | EF-10 |
| Folios BIT-Vx-nn, IIH, fotos | Triggers `trg_logbook_folio`, `trg_iih_folio`, `trg_photo_folio` | — |
| Bitácora cerrada inmutable | Trigger `trg_logbook_immutable` | EF-02 |
| Auditoría append-only encadenada por hash | Trigger `trg_audit_hash` | todas (escriben vía SQL con `service_role`) |
| Matriz 10/10 para emitir reporte | EF-07 (consulta `v_diagnostic_completeness`) | EF-07 |

---

# 2. Convenciones transversales

## 2.1 Autenticación y autorización

- Todo endpoint exige `Authorization: Bearer <supabase_jwt>`. El JWT lleva custom claims: `organization_id` y `global_role` (enum de `profiles.global_role`: `admin_institucional` | `coordinador_srhds` | `equipo` | `empresa` | `observador` | `invitado`), propagados desde `profiles` al hacer sign-in (hook `custom_access_token_hook`, configuración de proyecto, fuera del DDL).
- El rol **por diagnóstico** no viaja en el JWT (cambia por diagnóstico); la EF lo resuelve con `my_diagnostic_role(p_diagnostic_id)` en cada llamada. El cliente puede mostrar la UI según este rol, pero **la EF nunca confía en el rol que envía el cliente**.

## 2.2 Versionado y rutas

Base: `https://<ref>.supabase.co/functions/v1/`

- Convención de recursos: plural kebab-case, IDs de negocio en la ruta: `/diagnostics/{diagnostic_id}/advance-phase`.
- Versionado por compatibilidad de contrato (no por URL): los cambios breaking requieren campo nuevo o header `X-Api-Version`; se documenta en este archivo.

## 2.3 Idempotencia

- Toda operación mutante acepta header opcional **`Idempotency-Key: <uuid>`** (el cliente PWA lo genera al encolar la operación offline y lo reenvía intacto; ver §6).
- La EF guarda en `audit_log.meta->>'idempotency_key'` el procesamiento; si llega una clave ya procesada con mismo payload, responde `200` con el resultado original (sin re-ejecutar efectos).

## 2.4 Formato de respuesta y de error

Éxito: `200 OK` con el JSON del contrato. Error:

```json
{
  "error": {
    "code": "GATE_BHE_BRECHA",
    "message": "Balance no validable en R3: la brecha mensual supera 10 % en 1 mes(es). Un balance que no cierra no es un dato, es una tarea pendiente.",
    "details": { "meses": [{"mes": 7, "brecha_pct": 12.6}], "umbral_pct": 10 },
    "ref": "audit:<hash>"
  }
}
```

Códigos y HTTP status en §8. Todo error de negocio queda en `audit_log` con `action` correspondiente.

## 2.5 Folios

- Los folios **nunca se generan en el cliente**: diagnósticos (`MDOHI-AAAA-NNN`, secuencia), fichas de bitácora (`BIT-V2-01`, consecutivo por tipo vía trigger), activos IIH (`USO-01`), fotos (`V1-01`, `V1-05-03`). El cliente solo los lee.
- Folio del Reporte de Diagnóstico: `{folio_diagnostico}-R1` (asignado por EF-07 al emitir).
- El folio del diagnóstico es **inmutable en UPDATE** (trigger `diagnostics_update_lock`, ADR-010). Los campos de gate/estado (`estado`, `reporte_document_id`, `bitacora_cerrada`, `avance_pct`, `cat_estado`, semáforo, IVOH/brecha, próximo hito, reprogramación) solo los actualiza la EF con `service_role`; un UPDATE directo autenticado devuelve `42501`. Un RPC `security definer` invocado por un usuario autenticado **no** es ruta válida: conserva `auth.uid()` no nulo y el trigger lo bloquea.

## 2.6 Auditoría

Cada EF, al completar una operación mutante, inserta en `audit_log` (`action`, `entity`, `entity_id`, `meta`, `hash` encadenado) usando `service_role` **dentro de la misma transacción** que la mutación. El trigger `trg_audit_hash` valida la cadena; una escritura de auditoría fuera de la tx de negocio se considera bug crítico.

---

# 3. Catálogo de endpoints (resumen)

| ID | Método y ruta | Módulo | Rol mínimo | Transaccional | Efectos colaterales |
|---|---|---|---|---|---|
| EF-01 | `POST /diagnostics/{id}/advance-phase` | M2/M11 | coordinador, equipo | Sí | notificación, evento kanban |
| EF-02 | `POST /logbook/{entry_id}/close` | M10 | coordinador, equipo | Sí | change_log, notificación |
| EF-03 | `POST /checklist/{item_id}/transition` | M3 | coordinador, equipo, empresa | Sí | notificación solicitud |
| EF-04 | `POST /cat/{diagnostic_id}/submit` · `POST /cat/{diagnostic_id}/validate-r2` | M4 | empresa / coordinador·equipo | Sí | gate F3, notificación |
| EF-05 | `POST /balances/{balance_id}/validate-r3` | M6 | coordinador, equipo | Sí | ref. bitácora R3, avance |
| EF-06 | `POST /ivoh/{diagnostic_id}/score` · `POST /ivoh/{diagnostic_id}/validate-r4` | M8 | coordinador, equipo | Sí | gate F6, radial series |
| EF-07 | `POST /diagnostics/{id}/emit-report` | M9 | coordinador | Sí | PDF → R2, folio `-R1`, estado `reportado` |
| EF-08 | `POST /documents/presign` · `POST /documents/register` (F1-05) | M3 | presign: miembro diagnóstico (coord/equipo/empresa); register: coord/equipo/empresa (observador/invitado 403) | No/Sí | URL R2, hash SHA-256 |
| EF-09 | `POST /import/xlsx` | M5/M6 | coordinador, equipo | Sí | auditoría de mapeo |
| EF-10 | `POST /samples/{sample_id}/dictamen` | M7 | coordinador, equipo | Sí | dictámenes por parámetro |
| EF-11 | `POST /quiz/submit` | M12 | autenticado | Sí | calificación, badge OB3 |
| EF-12 | `POST /diagnostics/{id}/reprogram-milestone` | M2/M10 | coordinador | Sí | hallazgo, semáforo |
| EF-13 | `POST /reports/{document_id}/sign-nom151` | M9 (fase 3) | coordinador | Sí | sello de tiempo, evidencia |

**Lectura (sin Edge Functions):** el cliente lee directo de PostgREST — tablas con RLS y las vistas `v_bhe_monthly`, `v_bhe_summary`, `v_balance_indicators`, `v_ivoh_score`, `v_diagnostic_completeness` (modelo de lectura completo en §9). Las EF devuelven objetos compactos; el cliente refresca su caché Dexie desde las vistas tras cada mutación exitosa.

---

# 4. Contratos detallados

> En los contratos: **Pre** = precondiciones que la EF verifica antes de tocar datos (devuelven 409/403, nunca 500). **Tx** = trabajo transaccional. **Post** = efectos obligatorios tras commit. Toda respuesta incluye `"ref": "audit:<hash>"`.

## EF-01 — Avance de fase del diagnóstico (gate de fase + Kanban)

`POST /functions/v1/diagnostics/{diagnostic_id}/advance-phase`

| Campo | Valor |
|---|---|
| Propósito | Mover `diagnostics.fase_actual` de N a N+1 aplicando el gate del entregable verificable de la semana N, con todos sus efectos |
| Pre | JWT válido; `my_diagnostic_role ∈ {coordinador, equipo}`; `estado = 'activo'`; cuerpo: `{ "to_phase": 2..6 }` con `to_phase = fase_actual + 1` (sin saltos); desde fase 6 → `CONFLICT_PHASE` (la transición a `reportado` es EF-07) |
| Tx | RPC `fn_advance_phase` (`service_role`, ADR-013) revalida rol/tenant/estado/+1 y ficha cerrada del hito (`1→R1, 2→R2, 3→V1, 4→R3, 5→R4`); `UPDATE diagnostics SET fase_actual, proximo_hito, avance_pct`; `check_phase_gate`/`diagnostics_update_lock` son la autoridad final; `audit_log` + `api_idempotency` en la misma transacción |
| Post | Notificación `kind='hito'` y evento Realtime `phase_changed` los emite la EF **después del commit** (§7); replay no emite |
| Respuesta | `{ diagnostic_id, folio, fase_actual, proximo_hito, avance_pct, gate: { fase_origen, entregable, folio_respaldo } }` |
| Errores | `GATE_CHECKLIST_R1` · `GATE_CAT_R2` · `GATE_IIH_V1` · `GATE_BHE_R3` · `GATE_IVOH_R4` · `GATE_FICHA` (409) · `FORBIDDEN_ROLE` (403) · `CONFLICT_PHASE`/`CONFLICT_STATE` (409; state con `details.estado_actual`) |
| `proximo_hito` | Mapa fijo `2→R2, 3→V1, 4→R3, 5→R4, 6→R5`; **no se calculan fechas desde `fecha_inicio`**; formato `"<clave>"` o `"<clave> · YYYY-MM-DD"` solo si existe fecha canónica |
| `p_gate` | Cálculo de la EF para auditoría/respuesta; **no autoriza**; la ficha/folio se revalidan en DB |

> **Alcance F1 (F1-04):** EF-01 entrega transiciones **1→2 y 2→3 reales**; **3→4+** se validan con fixtures/contrato hasta **F2-06 (M5/IIH)**. No se declara F1 como flujo completo a F6.

## EF-02 — Revisión, firma y cierre de ficha de bitácora

`POST /functions/v1/ef-02-logbook/logbook/{entry_id}/submit-review` — `.../sign` — `.../close` (alias `/logbook/{entry_id}/...`)

| Campo | Valor |
|---|---|
| Propósito | `submit-review`: `abierta → en_revision`; `sign`: registrar `firma_ts` de un participante; `close`: `en_revision → cerrada`, sellar `cerrada_en`/`cierre_tardio` y crear `logbook_change_log` |
| Pre | Rol `coordinador|equipo`; tenant/membresía (403 anti-enumeración); `submit-review` solo desde `abierta`; `sign` en `abierta|en_revision` por nombre exacto de `logbook_participants`; `close` solo desde `en_revision` |
| Validaciones de cierre | Firmas: ≥ nº de segmentos de `logbook_templates.asistentes_requeridos` con `firma_ts`; agenda: filas `no=1..N` y `resultado` no vacío si `no_realizado|modificado`; evidencia: cada `item` de `evidence_items` con `document_id` del mismo diagnóstico/tenant y `upload_status='registered'`; 24 h: `event_ts=(fecha+horario_inicio) AT TIME ZONE 'America/Mexico_City'`; `>24 h` exige `cierre_razon ≥20` y marca `cierre_tardio` |
| Tx | RPC `fn_submit_logbook_review` / `fn_sign_logbook_participant(...,p_participante_nombre,...)` / `fn_close_logbook` `SECURITY DEFINER`/`service_role`-only, `search_path=public,pg_temp`, REVOKE public/anon/authenticated: transición, `firma_ts=now()` server-side, `estado='cerrada'`+`version+1`+`cierre_tardio`, snapshot `prev` en `logbook_change_log`, `audit_log('sign')`, idempotencia `EF-02.submit-review|sign|close`; `diagnostics.bitacora_cerrada` se recalcula (8 claves cubiertas y todas las filas de esas claves cerradas) |
| Post | `logbook_closed` + notificación `kind='validacion'` best-effort; gate de reporte `p7_bitacoras`/`bitacora_cerrada` |
| Respuesta | `submit-review`: `{entry_id,folio,clave,estado:'en_revision'}` · `sign`: `{entry_id,folio,participante,firma_ts,estado}` · `close`: `{entry_id,folio,clave,cerrada_en,version,cierre_tardio}` |
| Errores | `VALIDATION_FIRMAS`/`VALIDATION_AGENDA`/`VALIDATION_EVIDENCIA`/`VALIDATION_RAZON` (422; razón incluye `details.requiere_razon/event_ts`) · `CONFLICT_STATE` (409 estado/idempotencia/doble firma) · `FORBIDDEN_ROLE`/`FORBIDDEN_NOT_MEMBER` (403) · `INTERNAL_ERROR` (500 saneado) |
| Inmutabilidad | Post-cierre UPDATE/DELETE de la ficha y sus hijas ⇒ **42501**; `firma_ts` solo por EF-02; `created_by`/`organization_id`/`folio`/`estado`/`version` server-side |

## EF-03 — Transición de ítem de la lista de cotejo documental

`POST /functions/v1/checklist/{item_id}/transition`

| Campo | Valor |
|---|---|
| Propósito | Mover un ítem de la lista de cotejo (`document_checklist_items.estado`) |
| Cuerpo | `{ "to": "recibido" \| "revisado" \| "validado_r1", "document_id"?: uuid, "solicitud_nota"?: text }` |
| Pre | Transición permitida según **TD-2**: `empresa` `no_recibido→recibido` con `document_id`; `coordinador/equipo` solicitan con `solicitud_nota` y marcan `revisado`; **`validado_r1` solo `coordinador`**, exige `document_id` y **ficha R1** (`logbook_entries` R1 abierta/cerrada de la semana). `diagnostic_id` es **inmutable**; observador/invitado 403. |
| Tx | RPC `fn_transition_checklist_item` (`service_role`, atómica): `UPDATE document_checklist_items SET estado, document_id, solicitud_nota` + `audit_log` (`approve` si `validado_r1`, `update` si no) + `api_idempotency`; el trigger `trg_checklist_transition` es la autoridad final TD-2. `validado_r1` es terminal. |
| Post | Si `to='recibido'|'revisado'` con nota → notificación `kind='validacion'` a rol `empresa` |
| Respuesta | `{ item_id, item_code, estado, document_id }` |
| Errores | `FORBIDDEN_ROLE` (403) · `FORBIDDEN_NOT_MEMBER` (403; ítem/tenant inexistente anti-enumeración) · `CONFLICT_STATE` (409; transición no permitida, terminal, idempotencia con hash distinto) · `VALIDATION_PARAMETRO_REQUERIDO`/`VALIDATION_*` (422) · `INTERNAL_ERROR` (500 saneado) |

## EF-04 — Envío y validación del CAT

`POST /functions/v1/cat/{diagnostic_id}/submit` — `POST /functions/v1/cat/{diagnostic_id}/validate-r2`

| Campo | Valor |
|---|---|
| Propósito | `submit`: la empresa declara el cuestionario completo (`cat_estado: en_captura → en_revision`). `validate-r2`: el equipo valida en reunión R2 (`en_revision → validado_r2`, gate F3) |
| Pre (submit) | Rol `empresa|coordinador|equipo`; **toda pregunta aplicable de `cat_items` A1-v1** (47) tiene respuesta en `cat_responses` (`valor` no nulo, o `no_se`/`na` explícitos); `cat_items` no tiene columna `obligatoria`: toda pregunta aplicable es obligatoria. Preguntas con `admite_evidencia` resueltas en campo llevan `document_id` del mismo diagnóstico/tenant y registrado. |
| Pre (validate-r2) | Rol `coordinador|equipo`; existe ficha `BIT-R2-*` **cerrada** (referencia); todas las respuestas `no_se` tienen plan de resolución anotado en hallazgos de la ficha R2; `cat_estado='en_revision'`. |
| Tx | RPC `fn_submit_cat` / `fn_validate_cat_r2` (`service_role`, atómica): `UPDATE diagnostics.cat_estado` + `audit_log` (`update` en submit, `approve` en validate-r2) + `api_idempotency` en la misma transacción; replay del mismo hash ⇒ 200 sin efectos; hash distinto ⇒ 409. |
| Nota de completitud | `no_se`/`na` cuentan como respuesta para `submit`; para `validate-r2` los `no_se` exigen plan en la ficha R2 (o se rechaza con `VALIDATION_CAT_INCOMPLETO`). |
| Post | Notificación a empresa; evento `cat_validated` en validate-r2 |
| Respuesta | `{ diagnostic_id, cat_estado, pendientes: n }` |
| Errores | `VALIDATION_CAT_INCOMPLETO` (422 con lista de códigos `cat_items.codigo` faltantes) · `GATE_R2_FICHA` (409) · `CONFLICT_STATE` (409; estado/idempotencia) · `FORBIDDEN_ROLE`/`FORBIDDEN_NOT_MEMBER` (403 anti-enumeración) · `VALIDATION_PARAMETRO_REQUERIDO`/`VALIDATION_IDEMPOTENCY_KEY` (422) · `INTERNAL_ERROR` (500 saneado) |

## EF-05 — Validación del Balance Hídrico Enriquecido en R3 (regla de la brecha)

`POST /functions/v1/balances/{balance_id}/validate-r3`

| Campo | Valor |
|---|---|
| Propósito | Validar el BHE en reunión R3: verificar que el balance cierra en los 12 meses, registrar la referencia a la ficha R3 y recalcular el avance |
| Pre | Rol `coordinador|equipo`; `water_balances.estado='en_captura'`; existe ficha `BIT-R3-*` **cerrada del mismo diagnóstico**, id en el cuerpo `{ "r3_logbook_id": uuid }`; JWT/claims (`verifyProfile`, `nbf`, `p_user_id`). |
| Tx | RPC `fn_validate_bhe_r3(p_user_id,p_balance_id,p_r3_logbook_id,p_idempotency_key,p_request_hash)` `SECURITY DEFINER service_role`-only y atómica: valida 12 meses con captura y `entradas>0` (`VALIDATION_BHE_INCOMPLETO` 422, **precedencia**), brecha mensual >10 % ⇒ `GATE_BHE_BRECHA` 409 con `details.meses=[{mes,brecha_pct}]` y **sin** cambiar estado; si pasa: `estado='validado_r3'`, `validado_r3_logbook_id`, `version+1`, `diagnostics.brecha_pct` (brecha anual **ponderada** con `circular` restado), `audit_log('approve')` y `api_idempotency` (`EF-05.validate-r3`). `check_phase_gate` F5 es la autoridad final del gate. |
| Post | Notificación a miembros; evento `bhe_validated` best-effort; desbloquea IVOH (EF-06) |
| Respuesta | `{ balance_id, estado:'validado_r3', brecha_anual_pct, brecha_max_mes_pct, meses_sobre_umbral }` |
| Errores | `GATE_BHE_BRECHA` (409) — mensaje canónico «Un balance que no cierra no es un dato, es una tarea pendiente.» — · `GATE_R3_FICHA` (409) · `VALIDATION_BHE_INCOMPLETO` (422) · `CONFLICT_STATE` (409 estado/idempotencia) · `FORBIDDEN_ROLE`/`FORBIDDEN_NOT_MEMBER` (403 anti-enumeración) · `INTERNAL_ERROR` (500 saneado) |

## EF-06 — Calificación y validación del IVOH

`POST /functions/v1/ef-06-ivoh/ivoh/{diagnostic_id}/score` — `POST /functions/v1/ef-06-ivoh/ivoh/{diagnostic_id}/validate-r4` (alias `/ivoh/{diagnostic_id}/...`)

| Campo | Valor |
|---|---|
| Propósito | `score`: guardar borrador **parcial 1–6** factores (recalculable). `validate-r4`: congelar 6/6 en R4 y calcular/persistir el IVOH oficial (gate F6) |
| Cuerpo (score) | `{ "scores": [{ "factor_code": "F1".."F6", "puntaje": 0..10 (paso 0.5), "justificacion": text no vacío, "evidencia": [{tipo, ref, descripcion?}] }] }`. `tipo` allowlist `documento|activo|indicador|ficha`; `ref` no vacío; ≥1 por factor. |
| Cuerpo (validate-r4) | `{ "r4_logbook_id": uuid }` |
| Pre (score) | Rol `coordinador|equipo`; tenant/membresía (403 anti-enumeración); BHE `validado_r3`; versión **vigente** `diagnostics.index_version_id` y Σpesos=1; factor existente en `ivoh_factors`; sin evaluaciones de otra versión (`CONFLICT_IVOH_VERSION`); `ivoh_evaluations` PK `(diagnostic_id,version_id,factor_code)`. |
| Pre (validate-r4) | Ficha `BIT-R4-*` **cerrada del mismo diagnóstico**; 6/6 factores borrador con puntaje/justificación/evidencia y versión vigente; ninguna fila validada previa. |
| Tx | RPC `fn_save_ivoh_score(p_user_id,p_diagnostic_id,p_scores,p_idempotency_key,p_request_hash)` y `fn_validate_ivoh_r4(p_user_id,p_diagnostic_id,p_r4_logbook_id,p_idempotency_key,p_request_hash)` `SECURITY DEFINER`/`service_role`-only, `search_path=public,pg_temp`, REVOKE public/anon/authenticated. `score`: upsert `borrador`. `validate-r4`: total = Σ`peso×puntaje` (pesos de `ivoh_factors`, 1 decimal) **antes** de actualizar; si no hay total ⇒ rollback; luego `estado='validado_r4'`+`r4_logbook_id`, `diagnostics.ivoh_actual`, `audit_log('approve')` e idempotencia atómica (`EF-06.score`/`EF-06.validate-r4`). |
| Semáforo | Catálogo `ivoh_semaforo` (3 labels): `rojo <5.0` = **Crítico**, `5.0–7.9` = **En desarrollo**, `≥8.0` = **Consolidado**; `v_ivoh_score` expone `ivoh`, `semaforo`, `semaforo_label`, `serie_factores`, `por_factor`, `version_id` (`security_invoker`). |
| Post | Evento `ivoh_validated`/notificación best-effort; desbloquea gate F6/IVOH; **no** emite reporte (EF-07/F1-12). |
| Respuesta (score) | `{ diagnostic_id, version_id, estado:'borrador', factores_guardados }` (sin total/semáforo) |
| Respuesta (validate-r4) | `{ diagnostic_id, total, semaforo, semaforo_label, por_factor:[{factor_code,peso,puntaje,aportacion}] }` |
| Errores | `GATE_BHE_R3` (409) · `VALIDATION_IVOH_INCOMPLETO` (422) · `CONFLICT_IVOH_VERSION` (409) · `GATE_R4_FICHA` (409) · `CONFLICT_STATE` (409 idempotencia/estado) · `FORBIDDEN_ROLE`/`FORBIDDEN_NOT_MEMBER` (403) · `INTERNAL_ERROR` (500 saneado) |

## EF-07 — Emisión del Reporte de Diagnóstico (gate matriz 10/10)

`POST /functions/v1/diagnostics/{diagnostic_id}/emit-report`

| Campo | Valor |
|---|---|
| Propósito | Generar el Reporte de Diagnóstico integrando CAT, IIH, BHE, custodia, IVOH, bitácoras y plan de acción; emitir folio `{folio}-R1` |
| Pre | Rol `coordinador` únicamente; `consultar v_diagnostic_completeness` — los 10 requisitos deben estar verificados (TD-4); existe ficha `BIT-R5-*` cerrada |
| Tx | Ensamblar documento (maquetación institucional versionada) → PDF; subir a R2 (bucket `hidria-reports`, `exposure_level='restringido_nda'`); `INSERT documents` (metadatos, hash SHA-256); `UPDATE diagnostics SET estado='reportado', reporte_document_id`; folio `{folio}-R1`; `audit_log(action='sign')` |
| Post | Notificaciones `kind='firma'` a Triple Hélice; evento `report_emitted`; queda pendiente el sello NOM-151 (EF-13, fase 3) — el reporte lleva la leyenda «referencia NOM-151 en proceso» |
| Respuesta | `{ diagnostic_id, reporte: { document_id, folio, url_prefirmada_15min, emitido_en }, matriz: [{orden, nombre, ok}] }` |
| Errores | `GATE_REPORTE_INCOMPLETO` (409, lista de requisitos faltantes desde `v_diagnostic_completeness`) · `FORBIDDEN_ROLE` |

## EF-08 — Subida de documentos a R2 (URL prefirmada + registro)

`POST /functions/v1/documents/presign` — `POST /functions/v1/documents/register`

> **Estado (ADR-012 / task-39 / task-86 / task-106):** `presign` y `register` implementados en Fase 1
> (F1-05: RPC atómica `fn_register_document` + EF-08 `register`; `upload_status='registered'`).
> `sha256` es **declarado por el cliente**; el HEAD a R2 valida existencia/tamaño/MIME, no el hash
> (verificación server-side del hash es follow-up). `expires_at`/limpieza de huérfanos, follow-up.

| Campo | Valor |
|---|---|
| Propósito | Flujo en dos pasos: (1) el cliente obtiene una URL `PUT` prefirmada de R2 **solo si es miembro del diagnóstico**; (2) tras subir los bytes, registra los metadatos en `documents` y los vincula (checklist, evidencia de bitácora, informe de laboratorio). |
| Cuerpo (presign) | `{ "diagnostic_id": uuid, "filename": text, "doc_type": "layout"\|"planos_hidrosanitarios"\|"parametros_calidad"\|"informe_laboratorio"\|"reporte"\|"otro" (enum de `documents.doc_type`), "mime": text, "size_bytes": int, "exposure_level": "restringido_nda" (default) \| "anonimizado" \| "sintetico" \| "publico" }` |
| Pre (presign) | JWT válido; **miembro del diagnóstico con rol `coordinador`\|`equipo`\|`empresa`** (ADR-012: espejo de la RLS `documents_ins`; `observador`/`invitado` ⇒ `403 FORBIDDEN_ROLE`; un `admin_institucional`/`coordinador_srhds` **sin** membresía también es denegado); `diagnostics.organization_id` = claim de tenant (fail-closed); `size_bytes` entre 1 y 100 MB; `mime` en lista blanca (pdf, imágenes, xlsx, dwg, ofx); `filename` saneado (sin `/`, `\`, `..` ni caracteres de control; la extensión se deriva del `mime`); `Idempotency-Key` opcional. |
| Tx (presign) | **Sin escritura en BD**: valida, genera `document_id` y `r2_key` del lado servidor y firma la URL. Sin auditoría (no hay efectos persistentes; la auditoría se registra en `register`). No apto para la cola offline (no es una operación de datos). |
| Cuerpo (register) | `{ "diagnostic_id": uuid, "document_id": uuid, "filename": text, "doc_type": enum, "mime": text, "size_bytes": int, "exposure_level": enum, "sha256": text }` — **sin `r2_key`** (se deriva server-side). `title` se toma de `filename` saneado (sin extensión). |
| Pre (register) | JWT válido; roles **`coordinador`/`equipo`/`empresa`** (observador/invitado ⇒ 403); tenant/membresía fail-closed; **HEAD a R2 con credenciales de la EF** verifica existencia, `Content-Length` y `Content-Type`; fallo ⇒ `422 VALIDATION_FILE` sin rutas/credenciales; `Idempotency-Key` opcional. |
| Tx (register, F1-05) | Una sola transacción (RPC `fn_register_document`, `service_role`): valida `document_id`/`r2_key` derivada/`sha256`/`size_bytes`/`mime`/`doc_type`/`exposure_level`; `INSERT documents` (`upload_status='registered'`, `uploaded_by`) + `audit_log(action='create')` + `api_idempotency`; replay mismo hash ⇒ 200 sin duplicar efectos; hash distinto ⇒ 409. |
| Post | El cliente ejecuta el `PUT` a R2 con la URL de (1) y el `Content-Type` del `mime`; si el registro se vincula a checklist, el cliente invoca EF-03 (F1-06). |
| Respuesta (presign) | `{ upload_url, document_id, expira_en_seg: 300, metodo: "PUT" }`. `upload_url` es una URL S3 prefirmada de R2 (`PUT`) con vigencia **300 s** (máximo duro **300 s**, no configurable por el cliente; la descarga futura usará 900 s). La respuesta **no** incluye `r2_key`, bucket, credenciales ni rutas internas: solo la URL firmada, el `document_id` y el TTL; `register` deriva la clave server-side desde `document_id`. |
| Respuesta (register, F1-05) | `{ document_id, sha256 }` |
| Errores (presign) | `AUTH_INVALID` (401) · `FORBIDDEN_NOT_MEMBER` (403; incluye diagnóstico inexistente o de otro tenant, sin filtrar su existencia) · `FORBIDDEN_ROLE` (403) · `VALIDATION_PARAMETRO_REQUERIDO` (422) · `VALIDATION_FILE` (422; tamaño/mime/filename) · `VALIDATION_DOC_TYPE` (422) · `VALIDATION_EXPOSURE_LEVEL` (422) · `INTERNAL_ERROR` (500; configuración R2/JWT ausente, sin detalles) |
| Errores (register) | `AUTH_INVALID` (401) · `FORBIDDEN_NOT_MEMBER`/`FORBIDDEN_ROLE` (403 anti-enumeración) · `VALIDATION_PARAMETRO_REQUERIDO`/`VALIDATION_FILE`/`VALIDATION_DOC_TYPE`/`VALIDATION_EXPOSURE_LEVEL` (422) · `CONFLICT_STATE` (409; replay con hash distinto/duplicado) · `INTERNAL_ERROR` (500 saneado) |

**Convención de clave (server-side, `docs/01` §1):** `org/{organization_id}/diag/{diagnostic_id}/{document_id}.{ext}`. El cliente **nunca** propone ni recibe la clave. `document_id` es un UUID v4 aleatorio, o determinista (`sha256(user_id + payload canónico + Idempotency-Key)` con forma UUID) si el cliente envía `Idempotency-Key`, para que los reintentos reutilicen la misma clave de objeto (idempotencia sin estado).

**Ejemplo de request (presign):**

```json
{
  "diagnostic_id": "c1000000-0000-4000-8000-000000000001",
  "filename": "layout_planta.pdf",
  "doc_type": "layout",
  "mime": "application/pdf",
  "size_bytes": 482133,
  "exposure_level": "restringido_nda"
}
```

**Ejemplo de response (presign):**

```json
{
  "upload_url": "https://<account>.r2.cloudflarestorage.com/hidria-docs/org/…/diag/…/<document_id>.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=…&X-Amz-Date=…&X-Amz-Expires=300&X-Amz-SignedHeaders=host&X-Amz-Signature=…",
  "document_id": "<uuid>",
  "expira_en_seg": 300,
  "metodo": "PUT"
}
```

> El cliente **jamás** recibe credenciales de R2 ni URLs de descarga permanentes: la descarga
> pedirá `GET /documents/{id}/download` (Edge Function fuera del MVP) que emite URL prefirmada
> de lectura de 15 min (900 s) tras verificar RLS.

## EF-09 — Importación XLSX (BHE e IIH)

`POST /functions/v1/ef-09-import/import/xlsx` (alias `/import/xlsx`)

| Campo | Valor |
|---|---|
| Propósito | Importar la plantilla oficial de captura (**IIH** en F1-08; BHE en F1-09) validando estructura, mapeo celda↔campo y consistencia mínima |
| Cuerpo | **JSON**: `{ "diagnostic_id": uuid, "document_id": uuid, "kind": "iih", "periodo_anio"?: int }`. `document_id` viene de **EF-08 `register`**; el archivo ya está en R2 y la EF lo descarga server-side (sin `r2_key`/bucket en cliente). |
| Pre | Rol `coordinador|equipo`; JWT/claims (`verifyProfile`, `nbf`, `p_user_id`); tenant/membresía (403 anti-enumeración); `document_id` del mismo diagnóstico/tenant y `upload_status='registered'`; XLSX **≤10 MB / ≤500 filas**; ZIP saneado (sin zip-bomb), sin fórmulas/macros. Plantilla IIH: hojas `1. Captación`…`6. Evacuación`, encabezados fila **7** (21 columnas), datos desde fila **8**; columna B = código `iih_asset_types` → `stage_code`/`asset_type_id`. Desviación → `422 VALIDATION_XLSX_ESTRUCTURA` con `faltantes`/`sobrantes`. |
| Tx | RPC `fn_import_iih_assets(p_user_id, p_diagnostic_id, p_document_id, p_rows jsonb, p_checksum text, p_idempotency_key, p_request_hash)` `service_role`-only y atómica: `INSERT iih_assets` con **folio server-side**, `prioridad` **recalculada** (no se acepta la columna calc. del archivo), `verificado_v1=false` (no valida V1), `audit_log(action='create')` y `api_idempotency`. El mapeo/documento queda en `audit_log.meta`; **no** valida R3 (eso es EF-05). |
| Post | Notificación con resumen (filas leídas, rechazadas, advertencias) |
| Respuesta | `{ kind, destino_id, filas_ok, filas_rechazadas: [{fila, razon}], advertencias: [text] }` (fila 1-based) |
| Errores | `VALIDATION_XLSX_ESTRUCTURA`/`VALIDATION_XLSX_CONTENIDO` (422) · `FORBIDDEN_ROLE`/`FORBIDDEN_NOT_MEMBER` (403 anti-enumeración) · `CONFLICT_STATE` (409 estado/idempotencia) · `INTERNAL_ERROR` (500 saneado) |

### EF-09 `kind='bhe'` (F1-09)

`POST /functions/v1/ef-09-import/import/xlsx` con JSON `{diagnostic_id, document_id, kind:'bhe', periodo_anio}`; `periodo_anio` **obligatorio** (2000–2100) y coincidente con la plantilla/`water_balances`.

| Campo | Valor |
|---|---|
| Pre | Rol coord/equipo; tenant/membresía/403 anti-enumeración; documento `registered` del mismo diagnóstico/tenant; **solo XLSX OOXML** (`.xls` ⇒ 422 `formato_xls_no_soportado`); MIME XLSX; checksum=`documents.sha256`; plantilla BHE `1. Entradas` (fila 6), `2. Destinos del agua` (fila 6), `3. Reúso y calidad` Parte A (fila 7), 12 meses Ene–Dic; fórmulas permitidas solo en `O`/`P` hojas 1–3 y hoja 4 (ignoradas/recalculadas), fórmulas en C–N ⇒ `VALIDATION_BHE_FORMULA`; Parte B calidad fuera de F1-09. |
| Tx | RPC `fn_import_bhe(p_user_id,p_diagnostic_id,p_document_id,p_periodo_anio,p_rows jsonb,p_checksum,p_idempotency_key,p_request_hash)` `service_role`-only: creación/upsert solo en `borrador|en_captura`, `validado_r3` o periodo distinto ⇒ `CONFLICT_STATE`; reemplazo atómico de flows; staging exige ≥1 fila válida (0 válidas ⇒ 422 sin tocar balance); filas rechazadas 1-based; audit+idempotencia; **no valida R3**. |
| Respuesta | `{ kind:'bhe', destino_id: balance_id, periodo_anio, filas_ok, filas_rechazadas:[{fila,razon}], advertencias }` |
| Errores | `VALIDATION_BHE_INCOMPLETO`/`VALIDATION_XLSX_*` (422) · `CONFLICT_STATE` (409) · `FORBIDDEN_*` (403) · `INTERNAL_ERROR` (500 saneado) |

## EF-10 — Dictamen de laboratorio y cierre de cadena de custodia

`POST /functions/v1/samples/{sample_id}/dictamen`

| Campo | Valor |
|---|---|
| Propósito | Registrar resultados, dictámenes por parámetro y cerrar la muestra |
| Cuerpo | `{ "resultados": [{ "param_code", "valor", "unidad", "metodo", "dictamen" }], "informe_document_id"?: uuid }` |
| Pre | Rol `coordinador|equipo`; las 3 transferencias de `custody_transfers` firmadas (el trigger `trg_custody_gate` lo refuerza al escribir `dictamen`); parámetros ⊆ `params_solicitados` de la muestra; laboratorio con `acreditacion_ema=true` cuando `norma_ref` exige dictamen oficial |
| Tx | `INSERT lab_results`; `UPDATE samples SET estado='resultados_recibidos'`; propagar dictámenes a `quality_parameters` del BHE vigente; `audit_log(action='approve')` |
| Post | Notificación; evento `lab_results` |
| Respuesta | `{ sample_id, estado, dictamenes: [{param_code, dictamen}] }` |
| Errores | `GATE_CUSTODIA` (409, replicado del trigger) · `VALIDATION_PARAM_NO_SOLICITADO` (422) · `FORBIDDEN_ROLE` |

## EF-11 — Evaluación del examen del Aula MD-OHI

`POST /functions/v1/quiz/submit`

| Campo | Valor |
|---|---|
| Propósito | Calificar el examen del curso «Taller MD-OHI» y emitir insignia al aprobar |
| Cuerpo | `{ "answers": [{ "question_id": bigint, "opcion": 0..3 }] }` — el banco se lee solo desde `quiz_questions` (nunca se envía la correcta al cliente; el cliente solo recibe `pregunta`, `opciones` y `retroalimentación` **después** de calificar) |
| Pre | Autenticado; `answers` cubre todas las preguntas activas |
| Tx | Calificación server-side contra `quiz_questions.correcta`; `INSERT quiz_attempts (score, passed, answers)`; si `passed` (TD-7): generar insignia **Open Badges 3.0** (JSON-LD: achievement, criteria, evidence = attempt id, issuer = SDFI/UCI (Universidades y Centros de Innovación)); guardar JSON en `audit_log.meta` y notificar |
| Post | Notificación `kind='curso'` con resultado y enlace de la insignia |
| Respuesta | `{ attempt_id, score, passed, retroalimentacion: [{question_id, correcta, retroalimentacion}] }` |
| Errores | `VALIDATION_ANSWERS` (422) |

## EF-12 — Reprogramación de hito (dentro de las 6 semanas)

`POST /functions/v1/diagnostics/{diagnostic_id}/reprogram-milestone`

| Campo | Valor |
|---|---|
| Propósito | Reprogramar un hito V/R con justificación documentada, sin salir del calendario de 6 semanas |
| Cuerpo | `{ "hito": "V1"\|"V2"\|"V3"\|"R1".."R5", "fecha_original": date, "fecha_nueva": date, "justificacion": text, "causa": "empresa" \| "equipo" \| "externa" }` |
| Pre | Solo `coordinador`; `fecha_nueva ∈ [fecha_original, fecha_inicio + 6 semanas]`; `justificacion ≥ 20 caracteres`; causa válida; ficha más reciente **cerrada** con `clave=hito` (si no existe → `VALIDATION_HITO_SIN_FICHA`; EF-12 no crea fichas); primera reprogramación acepta `fecha_original` declarada; siguientes deben coincidir con la `fecha_nueva` previa del mismo hito |
| Tx | RPC `fn_reprogram_milestone` (`service_role`, ADR-013): inserta `milestone_reprogramming` + hallazgo en la ficha, actualiza `proximo_hito` (`"<hito> · <fecha>"`), `semaforo_atraso` (**1 reprogramación del hito con causa empresa → amarillo; 2+ del mismo hito → rojo**), `reprogramacion_justificacion`, `audit_log` + `api_idempotency` en la misma transacción |
| Respuesta | `{ hito, fecha_nueva, semaforo_atraso, entry_id, folio_ficha, reprogramaciones }` |
| Errores | `VALIDATION_REPROGRAMACION` (422) · `VALIDATION_HITO_SIN_FICHA` (422) · `FORBIDDEN_ROLE` (403) · `CONFLICT_STATE` (409) |

## EF-13 — Firma NOM-151 del Reporte (fase 3)

`POST /functions/v1/reports/{document_id}/sign-nom151`

| Campo | Valor |
|---|---|
| Propósito | Integrar el sello de tiempo y firma electrónica vía PSC acreditado |
| Cuerpo | `{ "psc_provider": text, "firmantes": [uuid] }` |
| Pre | Rol `coordinador`; el documento existe y pertenece a un diagnóstico `reportado`; en fases 1–2 este endpoint responde `501 NOT_IMPLEMENTED_PHASE` (la leyenda «referencia NOM-151 en proceso» ya viene en el PDF de EF-07) |
| Tx | Llamada al PSC; evidencia del sello en `signatures` + `documents` (versión); `audit_log(action='sign')` |
| Respuesta | `{ document_id, sello: { proveedor, ts, evidencia_url } }` |
| Errores | `EXT_PSC` (502) · `FORBIDDEN_ROLE` · `NOT_IMPLEMENTED_PHASE` (501) |

---

# 5. Tablas de decisión

Notación: **C** = condición, **A** = acción. Una regla por fila; la primera fila que casa gana (las tablas están ordenadas por prioridad).

## TD-1 — Avance de fase (`advance-phase`, EF-01)

| # | C: fase origen | C: entregable verificable | C: respaldo (folio) | C: rol | A: transición | A: si no |
|---|---|---|---|---|---|---|
| 1 | 1 (Arranque) | `document_checklist_items['layout'].estado = 'validado_r1'` | ficha BIT-R1 cerrada | coordinador/equipo | fase → 2 | `GATE_CHECKLIST_R1` 409 |
| 2 | 2 | `diagnostics.cat_estado = 'validado_r2'` | BIT-R2 cerrada | idem | fase → 3 | `GATE_CAT_R2` 409 |
| 3 | 3 | todos `iih_assets.verificado_v1 = true` | BIT-V1 cerrada | idem | fase → 4 | `GATE_IIH_V1` 409 |
| 4 | 4 | `water_balances.estado = 'validado_r3'` y brecha mensual ≤ 10 % en los 12 meses | BIT-R3 cerrada | idem | fase → 5 | `GATE_BHE_R3` 409 |
| 5 | 5 | los 6 `ivoh_evaluations.estado = 'validado_r4'` | BIT-R4 cerrada | idem | fase → 6 | `GATE_IVOH_R4` 409 |
| 6 | 6 | matriz 10/10 completa (TD-4) y reporte emitido | BIT-R5 cerrada | coordinador | **EF-07** (no EF-01): estado → `reportado` | `GATE_REPORTE_INCOMPLETO` 409 |
| 7 | cualquiera | — | — | empresa/organismo/observador | — | `FORBIDDEN_ROLE` 403 |
| 8 | cualquiera | `to_phase ≠ origen+1` (salto) | — | — | — | `CONFLICT_PHASE` 409 |

**Semáforo de atraso** (se recalcula en EF-01/EF-12): verde = en fecha; amarillo = hito reprogramado 1 vez por causa empresa; rojo = hito vencido sin cerrar o **2+ reprogramaciones del mismo hito**.

## TD-2 — Transiciones de la lista de cotejo (`checklist/transition`, EF-03)

| # | C: origen | C: destino | C: rol | C: extra | A |
|---|---|---|---|---|---|
| 1 | `no_recibido` | `recibido` | empresa | `document_id` adjunto | transición + nota opcional |
| 2 | `recibido` | `revisado` | coordinador/equipo | — | transición |
| 3 | `revisado` | `validado_r1` | coordinador | `document_id` no nulo; ficha R1 abierta o cerrada de la misma semana | transición + `audit approve` |
| 4 | `no_recibido` | `recibido` | coordinador/equipo | `solicitud_nota` obligatoria | transición + notificación a empresa |
| 5 | cualquiera | `validado_r1` | empresa/observador | — | `FORBIDDEN_ROLE` 403 |
| 6 | `validado_r1` | cualquiera | cualquiera | — | `CONFLICT_STATE` 409 (validación R1 es terminal) |

## TD-3 — Validación del BHE en R3 (regla de la brecha, EF-05)

| # | C: brecha mensual máxima | C: meses > 10 % | A |
|---|---|---|---|
| 1 | ≤ 10 % los 12 meses | 0 | `estado → validado_r3`; registrar ficha; actualizar `brecha_pct` anual |
| 2 | > 10 % en ≥ 1 mes | n ≥ 1 | 409 `GATE_BHE_BRECHA` con lista `{mes, brecha_pct}`; el balance **permanece editable** (corregir flujos, no forzar); mensaje canónico: «Un balance que no cierra no es un dato, es una tarea pendiente» |

## TD-4 — Matriz 10/10 de emisión del Reporte (EF-07)

Fuente: `v_diagnostic_completeness` (los 10 requisitos viven en `completeness_items` con su `verificado_en`).

| # | Requisito | Verificado en | Falla si |
|---|---|---|---|
| 1 | Lista de cotejo completa y validada R1 | R1 | falta ítem `validado_r1` |
| 2 | CAT validado R2 | R2 | `cat_estado ≠ validado_r2` |
| 3 | IIH verificado V1 | V1 | activo sin `verificado_v1` |
| 4 | BHE validado R3 (brecha ≤ 10 %) | R3 | `estado ≠ validado_r3` |
| 5 | Muestreo con dictámenes | V2/R3 | muestra sin `resultados_recibidos` o con parámetro sin dictamen requerido |
| 6 | IVOH validado R4 | R4 | factor sin `validado_r4` |
| 7 | 8 fichas de bitácora cerradas y foliadas | V1–R5 | ficha sin `cerrada_en` |
| 8 | Acuerdos de bitácora con responsable y fecha | continuas | acuerdo abierto sin `seguimiento` |
| 9 | Cartera de alternativas con al menos 1 medida por brecha mayor | R4/R5 | sin alternativas vinculadas al BHE |
| 10 | Plan de Acción con cronograma | R5 | `action_plan_items` vacío para el diagnóstico |

Emisión: solo si 10/10 `ok = true`; el cuerpo de error lista los requisitos fallidos por nombre.

## TD-5 — Dictamen de laboratorio (EF-10)

| # | C: transferencias firmadas | C: parámetros | C: acreditación EMA | A |
|---|---|---|---|---|
| 1 | 3/3 | ⊆ solicitados | conforme a `norma_ref` | registrar resultados + dictámenes; muestra → `resultados_recibidos` |
| 2 | < 3 | — | — | 409 `GATE_CUSTODIA` (replicado del trigger) |
| 3 | 3/3 | ⊄ solicitados | — | 422 `VALIDATION_PARAM_NO_SOLICITADO` |
| 4 | 3/3 | ⊆ solicitados | `norma_ref` oficial y `acreditacion_ema = false` | 422 `VALIDATION_LAB_NO_ACREDITADO` |

## TD-6 — Semáforo del IVOH (EF-06)

| # | C: total Σ peso×puntaje | A: semáforo | A: etiqueta de nivel (rúbricas) |
|---|---|---|---|
| 1 | total < 5.0 | rojo | según `ivoh_rubrics` por factor |
| 2 | 5.0 ≤ total ≤ 7.9 | amarillo | idem |
| 3 | total ≥ 8.0 | verde | idem |
| 4 | versión del índice no vigente | — | 409 `CONFLICT_IVOH_VERSION` (los pesos de una versión validada R4 son inmutables) |

## TD-7 — Aprobación del examen del Aula (EF-11)

| # | C: score | A |
|---|---|---|
| 1 | ≥ 80 | `passed = true`; insignia Open Badges 3.0; notificación |
| 2 | < 80 | `passed = false`; retroalimentación por pregunta; puede reintentar (sin límite en MVP; el intento queda en `quiz_attempts`) |

## TD-8 — Cierre de ficha de bitácora (EF-02)

| # | C: horas desde `fecha` del evento | C: `cerrada_razon` | A |
|---|---|---|---|
| 1 | ≤ 24 | opcional | cierre normal |
| 2 | > 24 | presente (≥ 20 caracteres) | cierre tardío; `cerrada_razon` queda en la ficha y en el change_log |
| 3 | > 24 | ausente | 422 `VALIDATION_RAZON` |

---

# 6. Contrato de sincronización offline (cliente PWA)

El cliente mantiene una cola en IndexedDB (Dexie) tabla `ops_queue`:

```ts
interface OpsQueueRow {
  client_op_id: string;      // uuid — Idempotency-Key enviado a la EF
  entity: string;            // p. ej. 'cat_responses', 'balance_flows'
  op: 'insert' | 'update';
  entity_id: string;         // uuid local (negative ids prohibidos; se generan uuid v4 en el cliente)
  payload: object;
  captured_at: string;       // sello de CAPTURA (momento en campo, reloj del dispositivo)
  queued_at: string;
  synced_at?: string;
  status: 'queued' | 'syncing' | 'synced' | 'conflict';
}
```

Reglas:

1. **Sellos distinguibles.** Todo registro editable lleva `captured_at` (captura en campo) además de `created_at/updated_at` del servidor. La regla metodológica «la bitácora se llena durante o inmediatamente después del evento» se verifica contra `captured_at`, no contra la sincronización.
2. **Reintentos.** Envío en orden FIFO con backoff; `Idempotency-Key = client_op_id`; una EF que recibe clave repetida responde el resultado original (§2.3).
3. **Resolución por campos (last-writer-wins por campo).** Si el servidor tiene una versión más nueva, el merge se hace **campo a campo** usando `captured_at` por campo cuando el payload lo trae (formularios largos: CAT, BHE); si un mismo campo difiere con sellos distintos → `status='conflict'` y se muestra al usuario en la UI (nunca se pisa silenciosamente).
4. **Gates no se encolan.** Las operaciones de EF-01…EF-07, EF-10, EF-12 **requieren conexión** (un gate validado offline sería indistinguible de un gate forzado). En offline el cliente guarda borrador local y deshabilita el botón de validación con el hint «requiere conexión».
5. **Lectura offline.** Kanban, expediente y bitáboras se leen de Dexie (espejo de las vistas de §9); al reconectar, el cliente refresca el espejo.

---

# 7. Eventos Realtime

Canales por tenant y por diagnóstico (suscripción solo si `is_diagnostic_member`):

| Canal | Evento | Payload mínimo | Emisor |
|---|---|---|---|
| `diagnostic:{id}` | `phase_changed` | `{ fase_actual, proximo_hito, semaforo_atraso }` | EF-01 |
| `diagnostic:{id}` | `logbook_closed` | `{ entry_id, folio, clave, cerrada_en }` | EF-02 |
| `diagnostic:{id}` | `checklist_updated` | `{ item_code, estado }` | EF-03 |
| `diagnostic:{id}` | `cat_validated` | `{ cat_estado }` | EF-04 |
| `diagnostic:{id}` | `bhe_validated` | `{ balance_id, brecha_anual_pct }` | EF-05 |
| `diagnostic:{id}` | `ivoh_validated` | `{ total, semaforo }` | EF-06 |
| `diagnostic:{id}` | `report_emitted` | `{ document_id, folio }` | EF-07 |
| `diagnostic:{id}` | `lab_results` | `{ sample_id, estado }` | EF-10 |
| `org:{organization_id}` | `kanban_refresh` | `{ diagnostic_id }` (señal genérica de relectura) | todas las EF |
| `user:{user_id}` | `notification` | fila de `notifications` | insert en `notifications` (postgres_changes) |

El cliente suscribe el Kanban a `org:{organization_id}` y cada expediente abierto a su `diagnostic:{id}`. El estado persistente siempre es Postgres; Realtime solo dispara relectura de las vistas.

---

# 8. Catálogo de códigos de error

| Código | HTTP | Significado |
|---|---|---|
| `AUTH_INVALID` | 401 | JWT ausente/expirado |
| `FORBIDDEN_ROLE` | 403 | Rol de diagnóstico insuficiente para la operación |
| `FORBIDDEN_NOT_MEMBER` | 403 | Usuario no es miembro del diagnóstico/tenant |
| `NOT_FOUND` | 404 | Recurso inexistente cuando el 404 no revela existencia (diagnóstico/tenant → `FORBIDDEN_NOT_MEMBER` 403) |
| `CONFLICT_PHASE` | 409 | Salto de fase inválido o fase ya superada |
| `CONFLICT_STATE` | 409 | Transición de estado no permitida (ver TD) |
| `CONFLICT_IVOH_VERSION` | 409 | Intento de modificar pesos/rúbricas de versión vigente |
| `GATE_CHECKLIST_R1` · `GATE_CAT_R2` · `GATE_IIH_V1` · `GATE_BHE_R3` · `GATE_IVOH_R4` | 409 | Gate de fase incumplido (mensajes canónicos del trigger; pueden llevar `details.reason='ficha'`) |
| `GATE_FICHA` | 409 | Ficha del hito faltante o no cerrada (`details.reason='ficha'`, `details.ficha_clave`) |
| `GATE_BHE_BRECHA` | 409 | Brecha mensual > 10 % (TD-3) |
| `GATE_CUSTODIA` | 409 | Menos de 3 custodias firmadas |
| `GATE_REPORTE_INCOMPLETO` | 409 | Matriz 10/10 incompleta (TD-4) |
| `VALIDATION_*` | 422 | Payload incompleto/inconsistente (firma, agenda, evidencia, CAT, razón, archivo, XLSX, parámetro, laboratorio, reprogramación, respuestas) |
| `VALIDATION_PHASE_TRANSICION` | 422 | Transición de fase inválida no cubierta por `CONFLICT_PHASE` (p. ej. origen no activo/estado inconsistente) |
| `RATE_LIMIT` | 429 | Límite por usuario (100 req/min en MVP) |
| `EXT_PSC` | 502 | Fallo del proveedor de firma NOM-151 |
| `NOT_IMPLEMENTED_PHASE` | 501 | Función de fase posterior (EF-13 en fases 1–2) |

> **RPC EF-01/EF-12 (ADR-013):** `fn_advance_phase` y `fn_reprogram_milestone` son `SECURITY DEFINER` y **solo `service_role`** puede ejecutarlas; el cliente nunca las invoca. `p_gate` es cálculo de la EF para auditoría/respuesta, **no autoriza**; `check_phase_gate`/`diagnostics_update_lock` son la autoridad final. La idempotencia (`api_idempotency`) y `audit_log` se escriben en la misma transacción: replay con el mismo hash devuelve la respuesta persistida con `replayed:true` sin efectos; hash distinto → `CONFLICT_STATE`. `RATE_LIMIT` (429) queda como follow-up (`api_rate_limit`).

---

# 9. Anexo — Modelo de lectura (PostgREST directo, sin EF)

| Vista | Uso en el cliente |
|---|---|
| `v_bhe_monthly` | Tabla mensual del BHE: entradas, destinos, reúso, pérdidas y `brecha_pct` por mes (alimenta TD-3 y la tabla de 12 meses) |
| `v_bhe_summary` | Tarjetas del BHE: totales anuales, brecha anual, % reúso, intensidad |
| `v_balance_indicators` | Indicadores base y de circularidad del diagnóstico |
| `v_ivoh_score` | Total IVOH ponderado, aportación por factor y semáforo (alimenta la gráfica radial) |
| `v_diagnostic_completeness` | Matriz 10/10 con `ok` por requisito (alimenta el gate EF-07 y la pestaña Reporte) |
| `v_quiz_questions` | Banco del examen **sin** `correcta` ni `retroalimentacion` (seguridad TD-7/SEC-05; la tabla cruda tiene `revoke` para `authenticated`) |

Estas vistas **son el contrato de lectura**: el cliente no recalcula brecha ni IVOH localmente para mostrar cifras oficiales; solo calcula en vivo para previsualización mientras el usuario edita, y la cifra que persiste siempre sale de la vista.

---

*Fin del documento. La fuente de verdad del esquema es `02-supabase_schema_hidria_mdohi.sql`; si un contrato de este documento y el DDL difieren, manda el DDL y este documento se corrige.*
