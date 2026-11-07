# HIDRIA — Plan de Pruebas

## Documento v1.0 — Ecosistema de Circularidad Tecnológica (ECT) · Metodología MD-OHI

---

# 0. Control del documento

| Campo | Valor |
|---|---|
| Documento | HIDRIA — Plan de Pruebas (ítem 4 del roadmap) |
| Versión | 1.0 |
| Fecha | 2026-11-08 |
| Dependencias | `Arquitectura HIDRIA-ECT con MD-OHI v2.0.md` (criterios de aceptación §11); `02-supabase_schema_hidria_mdohi.sql` (triggers, RLS, vistas); `04-Contratos-API-y-Tablas-de-Decision-HIDRIA-MD-OHI.md` (EF-01…EF-13, TD-1…TD-8, códigos de error §8); `03-seed_catalogos.sql` (fixtures de catálogos) |
| Audiencia | Equipo de agentes de IA / QA / desarrollo |
| Alcance | Estrategia de pruebas, trazabilidad regla→caso, casos detallados por área, datos de prueba, criterios de entrada/salida, evidencia y checklist de aceptación del piloto |

---

# 1. Objetivo y alcance

## 1.1 Objetivo

Demostrar, con evidencia reproducible, que la plataforma HIDRIA implementa las reglas metodológicas MD-OHI que la Subsecretaría validará en el piloto: **gates de fase, regla de la brecha > 10 %, cadena de custodia 3/3, matriz 10/10 del Reporte, semáforo IVOH, foliación e inmutabilidad de la bitácora, aislamiento multi-tenant y auditoría encadenada**.

## 1.2 Alcance

| Incluido | Excluido |
|---|---|
| Esquema Postgres (triggers, RLS, vistas), Edge Functions EF-01…EF-13, cliente React (PWA) con sincronización offline, eventos Realtime, importador XLSX, aula/examen | Firma NOM-151 real vía PSC (EF-13 se prueba solo con doble/mockeo, fase 3) · telemetría futura (Fase 3 de roadmap) |

## 1.3 Niveles de prueba

```
        /  E2E (Playwright)          ← 12 escenarios críticos end-to-end
       /   Contrato API (EF)         ← 1 suite por EF: happy + errores canónicos
      /    Base de datos (pgTAP)     ← triggers, RLS, vistas, folios, auditoría
     /     Unidad (Vitest + RTL)     ← helpers cliente, cola Dexie, merges
    ─────────────────────────────────
    Regla de cobertura: TODA fila de las tablas de decisión TD-1…TD-8 tiene ≥1 caso
    positivo y ≥1 caso negativo. Toda regla del §1.2 del doc 04 (mapa de
    enforcement) tiene al menos el caso de la vista/trigger correspondiente.
```

## 1.4 Entornos

| Entorno | Uso | Datos |
|---|---|---|
| `local` (Supabase CLI) | Desarrollo y pruebas unitarias/DB en cada cambio | Seed + fixtures §6 |
| `staging` (proyecto Supabase dedicado) | Contratos API, E2E, offline, rendimiento | Dataset sintético 30 empresas / 60 diagnósticos |
| `piloto` (proyecto Supabase del Programa) | Pruebas de aceptación con el equipo SDFI/UCI (Universidades y Centros de Innovación) | Datos reales del Programa Piloto |

Herramientas: **pgTAP** (SQL), **Vitest + React Testing Library** (unidad), **Playwright** (E2E, incluye modo offline y emulación de red lenta), **k6** (carga), **supabase-js** en suites de contrato.

---

# 2. Trazabilidad regla → caso de prueba

| Regla de negocio (fuente) | Casos |
|---|---|
| Gate F2: checklist layout validado R1 (TD-1#1, trigger `check_phase_gate`) | PG-01, PG-02 |
| Gate F3: CAT validado R2 (TD-1#2) | PG-03, PG-04 |
| Gate F4: IIH verificado V1 (TD-1#3) | PG-05, PG-06 |
| Gate F5: BHE validado R3 + brecha ≤ 10 % (TD-1#4, TD-3) | PG-07, PG-08, BHE-01…BHE-04 |
| Gate F6: IVOH validado R4 (TD-1#5) | PG-09, IVOH-01…IVOH-04 |
| Sin saltos de fase; rol requerido (TD-1#7/#8) | PG-10, PG-11 |
| Transiciones lista de cotejo por rol (TD-2) | DOC-01…DOC-06 |
| Envío/validación CAT completo (EF-04) | CAT-01…CAT-03 |
| Cadena de custodia 3/3 antes del dictamen (TD-5, trigger `trg_custody_gate`) | CUS-01…CUS-04 |
| IVOH requiere BHE validado; pesos inmutables (triggers, TD-6) | IVOH-02, IVOH-05 |
| Matriz 10/10 del Reporte (TD-4, `v_diagnostic_completeness`) | RPT-01…RPT-03 |
| Cierre de bitácora: firmas, agenda, evidencia, regla 24 h (TD-8, EF-02) | LB-01…LB-05 |
| Folios BIT/USO/foto; bitácora cerrada inmutable; auditoría encadenada | LB-06…LB-08, SEC-06 |
| RLS multi-tenant y por rol de diagnóstico | SEC-01…SEC-05 |
| Idempotencia (`Idempotency-Key`) | API-00 |
| Sincronización offline (cola Dexie, LWW por campos, gates no offline) | OFF-01…OFF-04 |
| Realtime (canales y payloads) | RT-01, RT-02 |
| Importador XLSX (estructura oficial) | XLS-01, XLS-02 |
| Examen del aula: calificación server-side, ≥ 80 %, badge OB3 (TD-7) | AUL-01…AUL-03 |
| Reprogramación de hito con semáforo (EF-12, TD-1 nota) | PG-12 |
| Criterios de aceptación del piloto (arquitectura §11) | CAP-01…CAP-04 |

---

# 3. Casos de prueba — Base de datos y gates de fase (suite pgTAP + contrato)

> Convención: cada caso lista **Pre** (precondición), **Pasos**, **Esperado**. En pgTAP, «lanza excepción» se afirma con `throws_ok` cuyo mensaje debe coincidir con el canónico del trigger.

## 3.1 Gates de fase (PG)

| ID | Pre | Pasos | Esperado |
|---|---|---|---|
| PG-01 | Diagnóstico fase 1; ítem checklist `layout` en `validado_r1`; ficha BIT-R1 cerrada | EF-01 `advance-phase {to_phase:2}` como rol `equipo` | 200; `fase_actual=2`; evento `phase_changed`; `audit_log` con `action='move_phase'` |
| PG-02 | Igual pero `layout` en `revisado` | EF-01 | 409 `GATE_CHECKLIST_R1`; mensaje «la lista de cotejo (layout) no está validada en R1»; sin cambio de fase; sin evento |
| PG-03 | Fase 2, `cat_estado='validado_r2'` | EF-01 a fase 3 | 200; fase 3 |
| PG-04 | Fase 2, CAT en `en_revision` | EF-01 a fase 3 | 409 `GATE_CAT_R2`; `diagnostics.fase_actual` sigue en 2 |
| PG-05 | Fase 3, todos los activos IIH `verificado_v1=true` | EF-01 a fase 4 | 200; fase 4 |
| PG-06 | Fase 3, un activo con `verificado_v1=false` | EF-01 a fase 4 | 409 `GATE_IIH_V1` |
| PG-07 | Fase 4, BHE `validado_r3`, brecha mensual ≤ 10 % los 12 meses | EF-01 a fase 5 | 200; fase 5 |
| PG-08 | Fase 4, BHE en `borrador` | EF-01 a fase 5 | 409 `GATE_BHE_R3` |
| PG-09 | Fase 5, 6 factores IVOH `validado_r4` | EF-01 a fase 6 | 200; fase 6 |
| PG-10 | Cualquier fase, `to_phase = actual+2` | EF-01 | 409 `CONFLICT_PHASE`; el trigger nunca se alcanza |
| PG-11 | Fase 1 completa pero rol `empresa` | EF-01 | 403 `FORBIDDEN_ROLE` |
| PG-12 | Hito V2 vencido, causa `empresa`, justificación 20+ caracteres | EF-12 `reprogram-milestone` | 200; hallazgo insertado en ficha V2 con fecha original y nueva; `semaforo_atraso` actualizado según TD-1 (amarillo si 1ª reprogramación) |

**PG-13 (regresión directa al trigger):** actualizar `diagnostics.fase_actual` por SQL (sin EF) en cada condición negativa PG-02/04/06/08 → `throws_ok` con el mensaje exacto de `check_phase_gate`. Garantiza que el gate no depende de la EF.

## 3.2 Balance hídrico y regla de la brecha (BHE)

| ID | Pre | Pasos | Esperado |
|---|---|---|---|
| BHE-01 | Balance `en_captura`; flujos con brecha mensual máx 8.4 %; ficha BIT-R3 cerrada | EF-05 con `r3_logbook_id` | 200; `estado='validado_r3'`; `validado_r3_logbook_id` fijado; `diagnostics.brecha_pct` = brecha anual de `v_bhe_summary` |
| BHE-02 | Igual pero un mes con brecha 12.6 % | EF-05 | 409 `GATE_BHE_BRECHA`; `details.meses=[{mes:7,12.6}]`; **el balance permanece `en_captura` y editable**; mensaje canónico «un balance que no cierra no es un dato, es una tarea pendiente» |
| BHE-03 | Balance con brecha corregida a ≤ 10 % tras BHE-02 | EF-05 | 200 (el gate es reintentable; no hay penalización de estado) |
| BHE-04 | EF-05 sin ficha R3 cerrada | EF-05 | 409 `GATE_R3_FICHA` |
| BHE-05 (vista) | Flujos cargados | Consultar `v_bhe_monthly` / `v_bhe_summary` | Totales: entradas = suma de flujos grupo entrada; brecha por mes = (entradas − destinos − reúso − pérdidas)/entradas; `v_bhe_summary.brecha_anual` ponderada por volumen (no promedio simple de porcentajes) |

## 3.3 IVOH (IVOH)

| ID | Pre | Pasos | Esperado |
|---|---|---|---|
| IVOH-01 | BHE validado R3; 6 factores con puntajes y evidencia | EF-06 `score` luego `validate-r4` con ficha R4 | Total = Σ peso×puntaje (p. ej. 6.5·0.15 + 7.0·0.20 + 8.0·0.20 + 6.0·0.20 + 7.5·0.15 + 9.0·0.10 = 7.20); `diagnostics.ivoh_actual=7.2` (redondeo 1 decimal); semáforo amarillo |
| IVOH-02 | Sin BHE validado | `INSERT ivoh_evaluations` por SQL y EF-06 | Trigger: excepción «IVOH bloqueado: no existe un Balance Hídrico Enriquecido validado en R3»; EF responde 409 `GATE_BHE_R3` |
| IVOH-03 | Puntajes {8,8,9,9,8,9} → total 8.5 | EF-06 validate-r4 | Semáforo verde según TD-6#3 |
| IVOH-04 | Puntajes {4,4,5,4,4,5} → total 4.3 | EF-06 validate-r4 | Semáforo rojo según TD-6#1 |
| IVOH-05 | Versión de índice vigente con R4 ya validado | Intento `UPDATE ivoh_factors SET peso` | Trigger `trg_ivoh_version_immutable` lanza excepción; EF respondería 409 `CONFLICT_IVOH_VERSION` |

## 3.4 Muestreo y cadena de custodia (CUS)

| ID | Pre | Pasos | Esperado |
|---|---|---|---|
| CUS-01 | Muestra con 2 custodias firmadas | EF-10 con resultados y dictámenes | 409 `GATE_CUSTODIA` (trigger: «requiere 3 transferencias firmadas»); sin filas en `lab_results` |
| CUS-02 | Muestra con 3 custodias firmadas (temperatura e integridad registradas en recepción) | EF-10 con parámetros ⊆ `params_solicitados` | 200; `lab_results` insertados; `samples.estado='resultados_recibidos'`; dictámenes propagados a `quality_parameters` del BHE vigente |
| CUS-03 | 3 custodias; resultado con parámetro no solicitado | EF-10 | 422 `VALIDATION_PARAM_NO_SOLICITADO`; rollback total |
| CUS-04 | 3 custodias; `norma_ref='NOM-001'` y laboratorio `acreditacion_ema=false` | EF-10 | 422 `VALIDATION_LAB_NO_ACREDITADO` |

## 3.5 Bitácora (LB)

| ID | Pre | Pasos | Esperado |
|---|---|---|---|
| LB-01 | Ficha V2 abierta: asistentes requeridos sin firma | EF-02 | 422 `VALIDATION_FIRMAS` |
| LB-02 | Firmas completas; agenda con ítem `no_realizado` sin resultado anotado | EF-02 | 422 `VALIDATION_AGENDA` (se explica lo no realizado, no se borra) |
| LB-03 | Todo completo; evidencia obligatoria sin `document_id` | EF-02 | 422 `VALIDATION_EVIDENCIA` |
| LB-04 | Evento hace 30 h; sin `cerrada_razon` | EF-02 | 422 `VALIDATION_RAZON` |
| LB-05 | Evento hace 30 h; `cerrada_razon` válida | EF-02 | 200; `estado='cerrada'`; `version` incrementada; fila en `logbook_change_log` con snapshot previo |
| LB-06 | Fichas V1, V1 (segunda sesión), R1…R5 creadas | Leer folios | Consecutivos por tipo: `BIT-V1-01`, `BIT-V1-02`, `BIT-R1-01`… (trigger `trg_logbook_folio`) |
| LB-07 | Ficha cerrada | Intento `UPDATE logbook_entries` / `INSERT logbook_agenda` | Trigger `trg_logbook_immutable` lanza excepción |
| LB-08 | Foto documentando activo | Insertar `photo_log` | Folio `V1-05-03` (activo `USO-03`), geo opcional, `document_id` ligado |

## 3.6 CAT (CAT)

| ID | Pre | Pasos | Esperado |
|---|---|---|---|
| CAT-01 | Respuestas parciales (3 preguntas obligatorias sin valor) | EF-04 `submit` | 422 `VALIDATION_CAT_INCOMPLETO` con los códigos `cat_items.codigo` faltantes; `cat_estado` sin cambio |
| CAT-02 | Completo con 2 respuestas `no_sé` marcadas y plan de resolución en hallazgos R2 | EF-04 `submit` → `validate-r2` | 200; `cat_estado='validado_r2'` |
| CAT-03 | Completo; respuesta `no_sé` sin plan de resolución | EF-04 `validate-r2` | 409 `GATE_R2_FICHA` (o 422 si la ficha R2 no refleja el plan, según precondición EF-04) |

## 3.7 Lista de cotejo documental (DOC)

| ID | Pre | Pasos | Esperado |
|---|---|---|---|
| DOC-01 | Ítem `no_recibido` | Rol `empresa`: EF-03 `to='recibido'` con `document_id` | 200; `estado='recibido'` |
| DOC-02 | Ítem `no_recibido`; empresa sin documento | EF-03 con `solicitud_nota` como rol `coordinador` | 200; notificación `kind='validacion'` al rol empresa |
| DOC-03 | Ítem `revisado`; rol `empresa` | EF-03 `to='validado_r1'` | 403 `FORBIDDEN_ROLE` (TD-2#5) |
| DOC-04 | Ítem `validado_r1` | Cualquier transición | 409 `CONFLICT_STATE` (validación R1 es terminal, TD-2#6) |
| DOC-05 | Ítem `revisado` con documento adjunto; rol `coordinador` | EF-03 `to='validado_r1'` | 200; `audit_log action='approve'` |
| DOC-06 | RLS: usuario de tenant B lee ítems del diagnóstico del tenant A | `SELECT document_checklist_items` vía PostgREST | 0 filas (política `is_diagnostic_member`) |

---

# 4. Casos de prueba — Reporte, seguridad, API, cliente

## 4.1 Reporte de Diagnóstico (RPT)

| ID | Pre | Pasos | Esperado |
|---|---|---|---|
| RPT-01 | Diagnóstico fase 6 con requisitos 1–9 completos, sin alternativas vinculadas | EF-07 | 409 `GATE_REPORTE_INCOMPLETO`; `details` lista «Cartera de alternativas…» como requisito fallido; sin PDF |
| RPT-02 | 10/10 en `v_diagnostic_completeness`; ficha BIT-R5 cerrada | EF-07 | 200; PDF generado en R2 (`exposure_level='restringido_nda'`); `documents` con `sha256`; folio `{folio}-R1`; `diagnostics.estado='reportado'`; leyenda «referencia NOM-151 en proceso» |
| RPT-03 | EF-07 con rol `equipo` | — | 403 `FORBIDDEN_ROLE` (solo `coordinador`) |
| RPT-04 | Diagnóstico `reportado`; EF-13 | — | 501 `NOT_IMPLEMENTED_PHASE` (fases 1–2) |

## 4.2 Seguridad y RLS (SEC)

| ID | Pre | Pasos | Esperado |
|---|---|---|---|
| SEC-01 | Usuario A miembro del diagnóstico D1; diagnóstico D2 del mismo tenant sin membresía | CRUD sobre tablas con RLS de diagnóstico (`cat_responses`, `balance_flows`, `logbook_*`…) | Acceso solo a D1; sin excepciones filtradas (0 filas, no error) |
| SEC-02 | Usuario del tenant B | `SELECT companies/diagnostics` del tenant A | 0 filas (`is_tenant_member`) |
| SEC-03 | Rol `observador` en D1 | `INSERT cat_responses` | Denegado por política (solo `coordinador`,`equipo`,`empresa`) |
| SEC-04 | JWT sin claim `organization_id` | Cualquier llamada | 401 `AUTH_INVALID` |
| SEC-05 | Usuario autenticado | `SELECT quiz_questions` (tabla cruda) y `SELECT v_quiz_questions` (vista) vía PostgREST | Tabla cruda: denegado (revoke + política solo `admin_institucional`); vista: solo `id, module_orden, pregunta, opciones` — `correcta` jamás llega al cliente |
| SEC-06 | 5 operaciones mutantes consecutivas | Inspeccionar `audit_log` | Cadena `prev_hash→hash` íntegra (verificación recalculando SHA-256 en test); `audit_log` sin UPDATE/DELETE permitidos |

## 4.3 Contratos de API (API)

Una suite automatizada por EF con la matriz: **(rol válido, happy path) · (rol inválido → 403) · (precondición rota → 409/422 canónico) · (idempotencia)**.

| ID | Alcance | Esperado |
|---|---|---|
| API-00 | Todas las EF: enviar `Idempotency-Key` repetido con mismo payload tras un 200 | Segundo response 200 con **cuerpo idéntico** y sin efectos duplicados (1 fila `audit_log`, 1 notificación). Con distinto payload y misma clave: 409 `CONFLICT_STATE` |
| API-01 | EF-01…EF-13 happy paths | Cada response cumple el contrato del §4 del doc 04 (campos, tipos, folios) |
| API-02 | Todas las EF: cuerpos con campos faltantes/tipos erróneos | 422 `VALIDATION_*` con mensaje accionable; ningún stack trace expuesto |
| API-03 | EF-05 brecha, EF-10 custodia, EF-07 matriz | Los códigos 409 son **exactamente** los del catálogo §8 del doc 04 (estabilidad de contrato para el cliente) |
| API-04 | Límite de tasa: 120 req/min desde un usuario | ≥ los últimos dentro del minuto responden 429 `RATE_LIMIT` |

## 4.4 Sincronización offline (OFF) — Playwright con contexto offline

| ID | Pre | Pasos | Esperado |
|---|---|---|---|
| OFF-01 | PWA con expediente en caché | Cortar red; editar respuestas CAT y flujos BHE; reintentar envío de gate EF-05 | Capturas guardadas en Dexie; **el botón de validación aparece deshabilitado con hint «requiere conexión»**; cero llamadas a EF |
| OFF-02 | Recuperar red con 3 operaciones encoladas | Esperar sincronización FIFO | Cada operación llega con su `Idempotency-Key`; sellos `captured_at` preservados (posteriores a `created_at` del servidor cuando la captura fue en campo) |
| OFF-03 | Mismo campo editado offline y online por usuarios distintos | Sincronizar | Merge por campos: gana el mayor `captured_at` por campo; el campo en conflicto sin resolución clara → `status='conflict'` visible en UI; nada se pisa silenciosamente |
| OFF-04 | Reintento tras timeout (EF sin respuesta pero con commit) | Reenvío con misma clave | API-00 garantiza: sin duplicados |

## 4.5 Realtime (RT)

| ID | Pre | Pasos | Esperado |
|---|---|---|---|
| RT-01 | Dos clientes suscritos a `diagnostic:{id}` | EF-01 en otro cliente | Cliente suscripto recibe `phase_changed` con el payload del §7 del doc 04 y refresca el Kanban |
| RT-02 | Cliente sin membresía en el diagnóstico | Intentar suscripción | Rechazada (RLS de Realtime); sin fuga de eventos |

## 4.6 Importador XLSX (XLS)

| ID | Pre | Pasos | Esperado |
|---|---|---|---|
| XLS-01 | Plantilla oficial BHE con 12 meses completos | EF-09 | 200; `water_balances.fuente_origen='importada_excel'`; `filas_ok=12`; queda en `en_captura` (la importación **no** valida R3) |
| XLS-02 | Archivo con hoja renombrada y columna faltante | EF-09 | 422 `VALIDATION_XLSX_ESTRUCTURA` con diff de columnas; `audit_log.meta` registra el mapeo intentado |

## 4.7 Aula (AUL)

| ID | Pre | Pasos | Esperado |
|---|---|---|---|
| AUL-01 | Intento de leer `correcta` desde el cliente | Query directo a tabla y a vista | No expuesto (SEC-05: `revoke` en tabla cruda, `v_quiz_questions` sin la columna); el cliente nunca conoce la correcta antes de calificar |
| AUL-02 | 4/5 correctas (80 %) | EF-11 | 200; `passed=true`; insignia Open Badges 3.0 JSON-LD con issuer SDFI/UCI y evidence = attempt id |
| AUL-03 | 3/5 (60 %); reintento | EF-11 dos veces | `passed=false` con retroalimentación por pregunta; segundo intento registrado en `quiz_attempts` |

## 4.8 Rendimiento y límites (PER)

| ID | Escenario | Criterio de aceptación |
|---|---|---|
| PER-01 | Kanban con 60 diagnósticos, refresh por Realtime | Render < 1.5 s en laptop media; consulta de la vista de completitud < 300 ms (p95) |
| PER-02 | `v_bhe_monthly`/`v_ivoh_score` con 60 diagnósticos × 12 meses × 40 flujos | < 200 ms (p95); si se degrada, materializar (decisión documentada) |
| PER-03 | Presign + subida de PDF 25 MB a R2 | URL emitida < 500 ms; subida completa sin proxy de la aplicación (bytes directo cliente↔R2) |
| PER-04 | 50 usuarios concurrentes en staging (k6) | p95 de lecturas < 500 ms; 0 errores 5xx; RLS sin degradación > 20 % vs. consulta del owner |

---

# 5. Casos E2E (Playwright) — escenarios críticos end-to-end

| ID | Escenario | Flujo | Esperado |
|---|---|---|---|
| E2E-01 | Alta a primer gate | Login `coordinador_srhds` → alta empresa → crear diagnóstico → Kanban muestra tarjeta en fase 1 → checklist layout validado en R1 → mover tarjeta a fase 2 | Tarjeta refleja fase 2; evento Realtime; folio `MDOHI-AAAA-NNN` visible |
| E2E-02 | CAT completo | Empresa llena 47 preguntas (guardado borrador offline incluido) → submit → R2 valida | `cat_estado='validado_r2'`; gate F3 desbloqueado |
| E2E-03 | **Brecha bloquea y se corrige** | BHE con julio 12.6 % → EF-05 → 409 con mensaje canónico → corregir flujos → revalidar → fase 5 | El tablero muestra el bloqueo; tras corrección la tarjeta avanza; la bitácora R3 queda foliada |
| E2E-04 | Custodia incompleta | Muestra con 2 firmas → intento de dictamen | Warning en expediente; sin dictamen; al firmar la 3ª, flujo continúa |
| E2E-05 | IVOH y radial | Puntajes por factor → validar R4 → radial con total y semáforo | Total coincide con `v_ivoh_score`; gráfica renderiza 6 ejes |
| E2E-06 | Reporte bloqueado 9/10 | Expediente completo salvo alternativas | Pestaña Reporte muestra matriz con 1 requisito fallido; botón emitir bloqueado con lista |
| E2E-07 | **Reporte emitido** | Completar 10/10 → EF-07 | PDF descargable por URL prefirmada; folio `-R1`; estado `reportado`; notificación a Triple Hélice |
| E2E-08 | Cierre tardío de bitácora | Ficha V1 de hace 48 h | EF-02 exige `cerrada_razon`; con razón válida cierra y versiona |
| E2E-09 | Rol empresa limitado | Login `empresa` | No ve Kanban de otras empresas; no puede validar checklist (403); sí puede subir documentos y llenar CAT |
| E2E-10 | Aula aprobada | Usuario toma examen 5/5 | 100 %; insignia OB3 visible; `badge_mdohi=true` en perfil |
| E2E-11 | Reprogramación con semáforo | Reprogramar V2 por causa empresa | Tarjeta muestra amarillo; hallazgo en bitácora conserva fecha original |
| E2E-12 | Piloto completo en plataforma | Ejecutar CAP-01 (abajo) con 3 empresas ancla | Tres diagnósticos archivados con evidencia completa |

---

# 6. Datos de prueba

| Fixture | Contenido | Origen |
|---|---|---|
| Catálogos | Giros, municipios, `quality_parameters_catalog`, `cat_items` A1-v1 (47 preguntas), rúbricas IVOH, `logbook_templates` V1–R5, `completeness_items` | `03-seed_catalogos.sql` |
| Tenant A (SRHDS) | 1 organización; usuarios con los 6 `global_role`; 4 diagnósticos en fases 1, 3, 5 y 6 (réplica del set del prototipo) | Script de fixtures de staging |
| Tenant B (aislamiento) | 1 organización, 1 diagnóstico | Script de fixtures |
| BHE feliz | 12 meses, brecha 6.9–9.1 % | Generador |
| BHE con brecha | Julio 12.6 % (exhibe TD-3) | Generador |
| Custodia | Muestras con 2 y con 3 transferencias | Fixture |
| XLSX | Plantilla oficial íntegra; 3 variantes corrompidas (hoja, columna, unidad) | Fixture |

Reglas de datos: nada de datos reales del Programa en `local`/`staging`; en `piloto`, los datos reales heredan la clasificación `restringido_nda` del expediente.

---

# 7. Criterios de entrada y salida

**Entrada (para iniciar cada nivel):** DDL aplicado en el entorno (migración limpia desde cero + aplicación idempotente sobre schema existente); seeds cargados; EF desplegadas; cliente compilado; fixtures cargados.

**Salida por nivel:**

| Nivel | Criterio |
|---|---|
| pgTAP | 100 % de casos PG/BHE/IVOH/CUS/LB/CAT/DOC/SEC en verde; `throws_ok` con mensajes canónicos |
| Contrato | Suites API-00…04 verdes para las 13 EF |
| E2E | E2E-01…12 verdes en Chromium y Firefox; 0 errores de consola |
| Offline | OFF-01…04 verdes |
| Rendimiento | PER-01…04 dentro de umbral en staging |

**Salida global (release al piloto):** todos los niveles verdes + criterios CAP del piloto + revisión de la Coordinación SRHDS firmando el checklist.

---

# 8. Evidencia y trazabilidad de ejecución

1. Cada suite corre en CI (pgTAP/contrato en cada push; E2E nightly; rendimiento semanal).
2. Captura obligatoria por caso E2E del piloto: screenshot + `requestId` (correlación con `audit_log` vía `X-Request-Id`).
3. Los casos PG/BHE/CUS/LB citados por la metodología (brecha, custodia, matriz 10/10) son candidatos a anexarse al expediente de validación del piloto como evidencia de que la plataforma aplica las reglas MD-OHI.
4. Falla en cualquier caso de la columna «gates metodológicos» (PG-01…13, BHE-01…05, CUS-01…04, RPT-01…04, IVOH-01…05) = bloqueo de release, sin excepción.

---

# 9. Checklist de aceptación del piloto (CAP) — arquitectura §11

| ID | Criterio | Verificado por |
|---|---|---|
| CAP-01 | Tres diagnósticos completados en plataforma: CAT, IIH, BHE con brecha documentada, cadenas de custodia, IVOH validado | E2E-12 + evidencia de campo |
| CAP-02 | Reporte firmado (folio `-R1`) para las tres plantas; tarjetas en «Archivado» | RPT-02 + Kanban |
| CAP-03 | Tiempos medios de validación por fase medidos en el tablero de adopción | M13 / telemetría de `audit_log` |
| CAP-04 | El equipo SDFI/UCI ejecuta sin asistencia: alta, checklist, validaciones y emisión | Sesión de aceptación firmada por la Coordinación |

---

*Fin del plan. Toda referencia de reglas apunta a `04-Contratos-API-y-Tablas-de-Decision-HIDRIA-MD-OHI.md` y al DDL; ante discrepancia manda el DDL y este plan se actualiza.*
