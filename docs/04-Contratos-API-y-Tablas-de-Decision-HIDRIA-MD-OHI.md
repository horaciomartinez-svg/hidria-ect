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
| EF-08 | `POST /documents/presign` · `POST /documents/register` | M3 | miembro diagnóstico | No/ Sí | URL R2, hash SHA-256 |
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
| Pre | JWT válido; `my_diagnostic_role ∈ {coordinador, equipo}`; `estado = 'activo'`; cuerpo: `{ "to_phase": 2..6 }` con `to_phase = fase_actual + 1` exactamente (no se permiten saltos) |
| Tx | Verificar el gate de la fase origen (tabla TD-1) replicando `check_phase_gate`; `UPDATE diagnostics SET fase_actual, proximo_hito, avance_pct = fase*100/6`; `audit_log(action='move_phase')` |
| Post | Insert `notifications` a miembros del diagnóstico (`kind='hito'`); emitir evento Realtime `phase_changed` (§7) |
| Respuesta | `{ diagnostic_id, folio, fase_actual, proximo_hito, avance_pct, gate: { fase_origen, entregable, folio_respaldo } }` |
| Errores | `GATE_CHECKLIST_R1` · `GATE_CAT_R2` · `GATE_IIH_V1` · `GATE_BHE_R3` · `GATE_IVOH_R4` (409, mensajes del trigger) · `FORBIDDEN_ROLE` (403) · `CONFLICT_PHASE` (409 si salto ≠ +1) |

## EF-02 — Cierre y firma de ficha de bitácora

`POST /functions/v1/logbook/{entry_id}/close`

| Campo | Valor |
|---|---|
| Propósito | Cerrar la ficha (`estado: abierta → cerrada`), sellar `cerrada_en`, crear la entrada de control de cambios |
| Pre | Rol `coordinador|equipo`; ficha `abierta`; participantes con `firma_ts` de los asistentes **requeridos** del template (`logbook_templates.asistentes_requeridos`); agenda completa (cada `no` con `estado` y `resultado` si fue `realizado`); evidencia obligatoria adjunta (`logbook_evidence.obligatorio → document_id not null`); si `now() - fecha > 24 h` entonces `cerrada_razon` obligatoria en el cuerpo |
| Tx | `UPDATE logbook_entries SET estado='cerrada', cerrada_en=now(), cerrada_razon, version=version+1`; `INSERT logbook_change_log(version, descripcion, responsable, prev)` con el snapshot previo; `audit_log(action='sign')` |
| Post | Notificación `kind='validacion'` a contraparte empresa si la ficha es V/R de validación; evento Realtime `logbook_closed` |
| Respuesta | `{ entry_id, folio, clave, cerrada_en, version }` |
| Errores | `VALIDATION_FIRMAS` · `VALIDATION_AGENDA` · `VALIDATION_EVIDENCIA` (422) · `VALIDATION_RAZON` (422, cierre tardío sin justificación) · `FORBIDDEN_ROLE` |

## EF-03 — Transición de ítem de la lista de cotejo documental

`POST /functions/v1/checklist/{item_id}/transition`

| Campo | Valor |
|---|---|
| Propósito | Mover un ítem de la lista de cotejo (`document_checklist_items.estado`) |
| Cuerpo | `{ "to": "recibido" \| "revisado" \| "validado_r1", "document_id"?: uuid, "solicitud_nota"?: text }` |
| Pre | Transición permitida según TD-2 (rol × origen × destino). `validado_r1` exige `document_id` adjunto y rol `coordinador|equipo` |
| Tx | `UPDATE document_checklist_items SET estado, document_id, solicitud_nota`; `audit_log(action='approve' si validado_r1, 'update' si no)` |
| Post | Si `to='recibido'|'revisado'` con nota → notificación `kind='validacion'` a rol `empresa` |
| Respuesta | `{ item_id, item_code, estado, document_id }` |
| Errores | `FORBIDDEN_ROLE` · `CONFLICT_STATE` (409, transición no permitida) |

## EF-04 — Envío y validación del CAT

`POST /functions/v1/cat/{diagnostic_id}/submit` — `POST /functions/v1/cat/{diagnostic_id}/validate-r2`

| Campo | Valor |
|---|---|
| Propósito | `submit`: la empresa declara el cuestionario completo (`cat_estado: en_captura → en_revision`). `validate-r2`: el equipo valida en reunión R2 (`en_revision → validado_r2`, gate F3) |
| Pre (submit) | Rol `empresa|coordinador|equipo`; todas las preguntas obligatorias de `cat_items` con `condicion` aplicable tienen respuesta en `cat_responses` (valor no nulo o `no_sé` explícito); preguntas con `admite_evidencia` resueltas en campo llevan evidencia |
| Pre (validate-r2) | Rol `coordinador|equipo`; existe ficha `BIT-R2-*` cerrada (referencia); todas las respuestas `no_sé` tienen plan de resolución anotado en hallazgos de la ficha R2 |
| Tx | `UPDATE diagnostics SET cat_estado`; `audit_log(action='approve')` en validate-r2 |
| Post | Notificación a empresa; evento `cat_validated` en validate-r2 |
| Respuesta | `{ diagnostic_id, cat_estado, pendientes: n }` |
| Errores | `VALIDATION_CAT_INCOMPLETO` (422 con lista de códigos `cat_items.codigo` faltantes) · `GATE_R2_FICHA` · `FORBIDDEN_ROLE` |

## EF-05 — Validación del Balance Hídrico Enriquecido en R3 (regla de la brecha)

`POST /functions/v1/balances/{balance_id}/validate-r3`

| Campo | Valor |
|---|---|
| Propósito | Validar el BHE en reunión R3: verificar que el balance cierra en los 12 meses, registrar la referencia a la ficha R3 y recalcular el avance |
| Pre | Rol `coordinador|equipo`; `water_balances.estado = 'en_captura'`; existe ficha `BIT-R3-*` cerrada cuyo id se recibe en el cuerpo `{ "r3_logbook_id": uuid }` |
| Tx | **Consultar `v_bhe_monthly`**: si algún mes tiene `brecha_pct > 10` → abortar (409, TD-3). Si pasa: `UPDATE water_balances SET estado='validado_r3', validado_r3_logbook_id, version=version+1`; actualizar `diagnostics.brecha_pct` con la brecha anual de `v_bhe_summary`; `audit_log(action='approve')` |
| Post | Notificación a miembros; evento `bhe_validated`; desbloquea la evaluación IVOH (EF-06) |
| Respuesta | `{ balance_id, estado, brecha_anual_pct, brecha_max_mes_pct, meses_sobre_umbral: 0 }` |
| Errores | `GATE_BHE_BRECHA` (409) — **mensaje canónico**: «Un balance que no cierra no es un dato, es una tarea pendiente.» · `GATE_R3_FICHA` · `FORBIDDEN_ROLE` |

## EF-06 — Calificación y validación del IVOH

`POST /functions/v1/ivoh/{diagnostic_id}/score` — `POST /functions/v1/ivoh/{diagnostic_id}/validate-r4`

| Campo | Valor |
|---|---|
| Propósito | `score`: guardar puntajes 0–10 por factor (borrador, recalculable). `validate-r4`: congelar la calificación en R4 (gate F6) |
| Cuerpo (score) | `{ "scores": [{ "factor_code": "F1".."F6", "puntaje": 0..10 (paso 0.5), "justificacion": text, "evidencia": [{tipo, ref}] }] }` |
| Pre (score) | Rol `coordinador|equipo`; BHE validado en R3 (el trigger `trg_ivoh_requires_bhe` lo refuerza); los 6 factores pertenecen a la `index_version` vigente del diagnóstico (`diagnostics.index_version_id`); puntajes con evidencia mínima 1 ítem por factor |
| Pre (validate-r4) | Ficha `BIT-R4-*` cerrada (id en cuerpo); los 6 factores tienen puntaje y justificación |
| Tx | `score`: upsert en `ivoh_evaluations` con `estado='borrador'`. `validate-r4`: `UPDATE ivoh_evaluations SET estado='validado_r4', r4_logbook_id`; total = Σ peso×puntaje según `v_ivoh_score`; `UPDATE diagnostics SET ivoh_actual`; semáforo por TD-6; `audit_log(action='approve')` |
| Post | Evento `ivoh_validated`; notificación con el total y semáforo |
| Respuesta | `{ diagnostic_id, total, semaforo, por_factor: [{factor_code, peso, puntaje, aportacion}] }` |
| Errores | `GATE_BHE_R3` (409, replicado del trigger) · `VALIDATION_IVOH_INCOMPLETO` · `FORBIDDEN_ROLE` |

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

| Campo | Valor |
|---|---|
| Propósito | Flujo dos pasos: (1) el cliente obtiene URL `PUT` prefirmada de R2; (2) tras subir los bytes, registra los metadatos en `documents` y los vincula (checklist, evidencia de bitácora, informe de laboratorio) |
| Cuerpo (presign) | `{ "filename": text, "doc_type": "layout"\|"planos_hidrosanitarios"\|"parametros_calidad"\|"informe_laboratorio"\|"reporte"\|"otro" (enum de `documents.doc_type`), "mime": text, "size_bytes": int, "exposure_level": "restringido_nda" (default) \| "anonimizado" \| "sintetico" \| "publico" }` |
| Pre | Miembro del diagnóstico que contendrá el documento (el `diagnostic_id` va en el cuerpo de `register`); `size_bytes ≤ 100 MB`; `mime` en lista blanca (pdf, imágenes, xlsx, dwg, ofx) |
| Tx (register) | `INSERT documents` (metadatos: `diagnostic_id`, `company_id`, `doc_type`, `title`, `r2_key`, `sha256`, `mime`, `size_bytes`, `exposure_level`, `uploaded_by`); `audit_log(action='create')` |
| Post | El cliente ejecuta el `PUT` a R2 con la URL de (1); si el registro se vincula a checklist, el cliente invoca EF-03 |
| Respuesta (presign) | `{ upload_url, r2_key, expira_en_seg: 900 }` · (register): `{ document_id, r2_key, sha256 }` |
| Errores | `VALIDATION_FILE` (422) · `FORBIDDEN_NOT_MEMBER` (403) |

> El cliente **jamás** recibe credenciales de R2 ni ve URLs de descarga permanentes: la descarga pide `GET /documents/{id}/download` (Edge Function fuera del MVP que emite URL prefirmada de lectura de 15 min tras verificar RLS).

## EF-09 — Importación XLSX (BHE e IIH)

`POST /functions/v1/import/xlsx`

| Campo | Valor |
|---|---|
| Propósito | Importar la plantilla oficial de captura (BHE o IIH) validando estructura, mapeo celda↔campo y consistencia mínima |
| Cuerpo | multipart: archivo + `{ "diagnostic_id": uuid, "kind": "bhe" \| "iih", "periodo_anio"?: int }` |
| Pre | Rol `coordinador|equipo`; estructura del archivo idéntica a la plantilla oficial (hojas, encabezados, unidades) — desviación → rechazo con diff de columnas |
| Tx | Parseo y mapeo validado; `INSERT water_balances (fuente_origen='importada_excel', estado='en_captura')` + `balance_flows` o `iih_assets` según kind; el mapeo usado queda en `audit_log.meta`; nunca valida R3 (eso es EF-05) |
| Post | Notificación con resumen (filas leídas, rechazadas, advertencias) |
| Respuesta | `{ kind, destino_id, filas_ok, filas_rechazadas: [{fila, razon}], advertencias: [text] }` |
| Errores | `VALIDATION_XLSX_ESTRUCTURA` (422) · `FORBIDDEN_ROLE` |

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
| Pre | Rol `coordinador`; `fecha_nueva ≤ fecha_inicio + 6 semanas`; `justificacion ≥ 20 caracteres` |
| Tx | Actualizar `proximo_hito`; insertar hallazgo en la ficha del hito vinculado («fecha original conservada: …, nueva fecha: …, causa: …»); si `causa='empresa'` → `diagnostics.semaforo_atraso` según TD-1 (regla del semáforo); `audit_log(action='update')` |
| Respuesta | `{ hito, fecha_nueva, semaforo_atraso }` |
| Errores | `VALIDATION_REPROGRAMACION` (422) · `FORBIDDEN_ROLE` |

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
| 6 | 6 | matriz 10/10 completa (TD-4) y reporte emitido | BIT-R5 cerrada | coordinador | estado → `reportado` | `GATE_REPORTE_INCOMPLETO` 409 |
| 7 | cualquiera | — | — | empresa/organismo/observador | — | `FORBIDDEN_ROLE` 403 |
| 8 | cualquiera | `to_phase ≠ origen+1` (salto) | — | — | — | `CONFLICT_PHASE` 409 |

**Semáforo de atraso** (se recalcula en EF-01/EF-12): verde = en fecha; amarillo = hito reprogramado 1 vez por causa empresa; rojo = hito vencido sin cerrar o 2+ reprogramaciones.

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
| `CONFLICT_PHASE` | 409 | Salto de fase inválido o fase ya superada |
| `CONFLICT_STATE` | 409 | Transición de estado no permitida (ver TD) |
| `CONFLICT_IVOH_VERSION` | 409 | Intento de modificar pesos/rúbricas de versión vigente |
| `GATE_CHECKLIST_R1` · `GATE_CAT_R2` · `GATE_IIH_V1` · `GATE_BHE_R3` · `GATE_IVOH_R4` | 409 | Gate de fase incumplido (mensajes canónicos del trigger) |
| `GATE_BHE_BRECHA` | 409 | Brecha mensual > 10 % (TD-3) |
| `GATE_CUSTODIA` | 409 | Menos de 3 custodias firmadas |
| `GATE_REPORTE_INCOMPLETO` | 409 | Matriz 10/10 incompleta (TD-4) |
| `VALIDATION_*` | 422 | Payload incompleto/inconsistente (firma, agenda, evidencia, CAT, razón, archivo, XLSX, parámetro, laboratorio, reprogramación, respuestas) |
| `RATE_LIMIT` | 429 | Límite por usuario (100 req/min en MVP) |
| `EXT_PSC` | 502 | Fallo del proveedor de firma NOM-151 |
| `NOT_IMPLEMENTED_PHASE` | 501 | Función de fase posterior (EF-13 en fases 1–2) |

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
