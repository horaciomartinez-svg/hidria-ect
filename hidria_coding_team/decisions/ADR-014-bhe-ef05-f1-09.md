# ADR-014 — F1-09: BHE, EF-05 y reutilización de EF-09 `kind='bhe'`

**Estado:** aceptado (Lead, 2026-11-15) — base `main@43263ba`.
**Ámbito:** F1-09 (M6 BHE), decisiones vinculantes de Phase 1. No implementa código.

## Contexto

F1-09 debe cerrar el Módulo 6 (Balance Hídrico Enriquecido): captura mensual de flujos, validación en R3 con la regla de la brecha > 10 %, gate F5 y reutilización del importador XLSX ya construido en F1-08 (`EF-09`, `kind='iih'`). La metodología MD-OHI exige que un balance que no cierra bloquee la validación R3 y, por tanto, el avance a F5; el mensaje canónico es «Un balance que no cierra no es un dato, es una tarea pendiente».

## Decisiones

### D1 — Autoridad de la brecha > 10 %
- **La evaluación y el bloqueo viven en la base de datos, dentro de una RPC `SECURITY DEFINER` `service_role`-only** invocada por EF-05: `fn_validate_bhe_r3(p_user_id, p_balance_id, p_r3_logbook_id, p_idempotency_key, p_request_hash)`.
- La RPC consulta **`v_bhe_monthly_capture`/`v_bhe_capture_summary`**; si **algún mes** tiene `brecha_pct > 10`, retorna `GATE_BHE_BRECHA` (409) con `details.meses` y **no** modifica `water_balances.estado` (sigue `en_captura`, editable). Si pasa, actualiza `estado='validado_r3'`, `validado_r3_logbook_id`, `version`, `diagnostics.brecha_pct` y `audit_log(action='approve')` en la misma transacción.
- **El trigger `check_phase_gate` es la autoridad final del gate F5** (BHE `validado_r3` + brecha ≤ 10 %). EF-01 no puede saltarlo.
- **La UI no evalúa ni decide la brecha**: solo lee `v_bhe_monthly`/`v_bhe_summary` y muestra el resultado; los errores de EF-05 se presentan con el mensaje canónico.
- **La EF no es autoridad**: EF-05 valida rol/tenant/ficha y llama a la RPC; su pre-chequeo solo construye respuesta/errores, nunca escribe el estado por su cuenta.

### D2 — Semántica de captura del BHE
- Captura **mensual** (12 meses consecutivos, `periodo_anio`/`mes_inicio`), por flujo del catálogo `balance_flow_catalog` y mes.
- Editable mientras `water_balances.estado in ('borrador','en_captura')`; **inmutable y no editable tras `validado_r3`** (la RPC/trigger rechaza cambios con 409/42501; RLS no habilita UPDATE post-validación).
- **Bitácora de cambios**: `audit_log` append-only por cada alta/edición de `water_balances`/`balance_flows` (trigger de auditoría; EF-09 con `service_role` conserva auditoría atómica con `audit_log`).
- Folio/claves server-side; `diagnostic_id`/`organization_id` inmutables; `organization_id` debe ser el tenant del diagnóstico.

### D3 — Alcance de EF-05
EF-05 cubre **la validación R3 completa**, que incluye:
1. Verificar rol `coordinador|equipo`, membresía/tenant y `estado='en_captura'`.
2. Exigir ficha `BIT-R3-*` **cerrada** del mismo diagnóstico (`GATE_R3_FICHA`).
3. **Calcular/evaluar la brecha mensual** y bloquear si > 10 % (`GATE_BHE_BRECHA`).
4. **Cerrar el periodo**: `estado='validado_r3'`, `validado_r3_logbook_id`, `version+1`, `diagnostics.brecha_pct`.
5. Auditoría `approve`, notificación y evento `bhe_validated` post-commit.
No incluye IVOH (EF-06) ni emisión de reporte (EF-07).

### D4 — Reutilización de EF-09 `kind='bhe'`
- **No se duplica** el parser XLSX, la descarga R2 SigV4, el cap anti zip-bomb, checksum, MIME allowlist, límites ni idempotencia de F1-08.
- EF-09 se extiende con rama `kind='bhe'`: misma entrada JSON `{diagnostic_id, document_id, kind:'bhe', periodo_anio?}`, mismo pipeline R2/checksum/parser; cambia el mapeo de plantilla BHE y la RPC de persistencia (`fn_import_bhe(...)`), que inserta/actualiza `water_balances` + `balance_flows` solo en captura (`borrador`/`en_captura`).
- Plantilla BHE: 12 meses completos; estructura/hojas/encabezados y unidades deben coincidir con la plantilla oficial (docs/01 §4.6, docs/05 XLS-01/02). Desviación ⇒ `422 VALIDATION_XLSX_ESTRUCTURA` con diff.
- La importación **no valida R3**: deja el balance `en_captura`; la validación R3 es EF-05.

### D5 — Contrato y errores
- EF-05: `POST /functions/v1/balances/{balance_id}/validate-r3`, cuerpo `{ "r3_logbook_id": uuid }`.
- Respuesta: `{ balance_id, estado, brecha_anual_pct, brecha_max_mes_pct, meses_sobre_umbral: 0 }`.
- Errores canónicos: `GATE_BHE_BRECHA` (409, mensaje «Un balance que no cierra no es un dato, es una tarea pendiente.»), `GATE_R3_FICHA` (409), `FORBIDDEN_ROLE`/`FORBIDDEN_NOT_MEMBER` (403 anti-enumeración), `CONFLICT_STATE` (409), `VALIDATION_*` (422), `INTERNAL_ERROR` (500 saneado).
- Idempotencia `Idempotency-Key` con `api_idempotency`; replay 200 sin efectos; hash distinto 409.

### D6 — Roles
- Captura/edición de BHE: `coordinador|equipo` (RLS + guard). `empresa` lectura/validación por flujo de firma según docs/01 §5; observador/invitado sin escritura.
- EF-05: `coordinador|equipo`.
- EF-09 `bhe`: `coordinador|equipo`.
- UI: lectura para miembros; acciones solo si el rol lo permite; la UI no es autorización.

## Consecuencias

- F1-09 se implementa en orden DB/RPC → EF-05/EF-09-bhe → UI → docs.
- Pruebas obligatorias: pgTAP de RLS/inmutabilidad 42501/ACL `{postgres,service_role}`/idempotencia/brecha >10 % bloquea/gate F5; Deno de EF-05 y EF-09-bhe; casos BHE-01…05 y PG-07/08.
- Riesgo residual: la UI podría mostrar brecha stale; se mitiga leyendo vistas server-side y refrescando tras EF-05.

## Adenda 2026-11-15 — resolución de bloqueantes del arquitecto (B1–B6)

Tras revisar `v_bhe_monthly`/`v_bhe_summary` y `check_phase_gate` en la BD, se corrigen las decisiones anteriores:

### D7 — Cálculo de brecha en captura (B1)
- Se crea **`v_bhe_monthly_capture`** (misma fórmula que `v_bhe_monthly`, **sin** filtro `estado='validado_r3'`) con **`security_invoker=true`** para que RLS de `water_balances`/`balance_flows`/`balance_flow_catalog` aplique. (Nombre final acordado con arquitecto/UI; sustituye a `v_bhe_monthly_draft` en borradores previos.)
- `v_bhe_monthly`/`v_bhe_summary` se recrean con **`security_invoker=true`** y conservan el filtro `validado_r3` para tablero/cierre. La UI de captura lee `v_bhe_monthly_capture`; la UI de cierre/validado lee `v_bhe_summary`.
- `fn_validate_bhe_r3` calcula la brecha desde **`v_bhe_monthly_capture`** antes de validar. Si `entradas_m3 = 0` o hay menos de 12 meses con datos, **no se puede validar** (`GATE_BHE_BRECHA`/`VALIDATION_BHE_INCOMPLETO`): un balance vacío no cierra.
- `brecha_pct` se define como `100*(entradas - (consumo_proceso+consumo_general+descarga+perdida))/entradas`, redondeada a 2; `NULL` si `entradas=0` y se trata como no válido.

### D8 — Guards de cierre e inmutabilidad (B2)
- Trigger `trg_water_balances_guard`:
  - INSERT/UPDATE: `organization_id` = tenant del diagnóstico, `diagnostic_id`/`organization_id` inmutables.
  - UPDATE autenticado (`auth.uid() IS NOT NULL`): **prohibido** cambiar `estado`, `validado_r3_logbook_id`, `version` (42501); solo la RPC `service_role` cierra.
  - Si `OLD.estado='validado_r3'`: **cualquier UPDATE autenticado** ⇒ 42501 (post-R3 inmutable). La RPC tampoco re-valida un balance ya validado (`CONFLICT_STATE`).
- Trigger `trg_balance_flows_guard`:
  - Escritura solo `coordinador|equipo` (usa `fn_diag_role`); observador/invitado/empresa sin INSERT/UPDATE/DELETE.
  - Si el balance padre está `validado_r3` ⇒ 42501/409 (inmutable post-R3).
  - `balance_id`/`catalog_code`/`mes` inmutables en UPDATE; `volumen_m3 >= 0`; audit DB de cambios autenticados.
- RLS: `water_balances_upd` y `balance_flows_*` se ajustan para no permitir escritura de gate fields ni escritura de flows fuera de captura; el cierre solo por RPC.

### D9 — Gate F5 (B3)
- `check_phase_gate` se extiende (forward-only) para F5: exige `water_balances.estado='validado_r3'`, **12 meses completos** y **brecha mensual ≤ 10 %** (consulta `v_bhe_summary`/`v_bhe_monthly` validada). Si falla ⇒ `GATE_BHE_R3`/`GATE_BHE_BRECHA` según causa.
- La autoridad final sigue siendo el trigger; la RPC garantiza el mismo invariante al cerrar y la inmutabilidad post-R3 evita que se altere después.

### D10 — RPC y contrato (B4–B6)
- `fn_validate_bhe_r3(p_user_id,p_balance_id,p_r3_logbook_id,p_idempotency_key,p_request_hash)`:
  - rol coord/equipo, tenant/membresía, `estado='en_captura'`, ficha `BIT-R3-*` cerrada del mismo diagnóstico, 12 meses, brecha ≤10.
  - brecha >10 ⇒ `GATE_BHE_BRECHA` 409 con `details.meses[{mes,brecha_pct}]` y **sin** cambiar estado.
  - éxito: `estado='validado_r3'`, `validado_r3_logbook_id`, `version+1`, `diagnostics.brecha_pct`, `audit_log('approve')`, `api_idempotency` atómicos; doble validación ⇒ `CONFLICT_STATE`.
- `fn_import_bhe(p_user_id,p_diagnostic_id,p_document_id,p_rows jsonb,p_checksum text,p_idempotency_key,p_request_hash)`:
  - documento mismo diagnóstico/tenant/`registered`, MIME XLSX/XLS, checksum=`documents.sha256`.
  - upsert **una fila** `water_balances` por diagnóstico (o versión de captura) + `balance_flows` de 12 meses; solo si estado `borrador|en_captura`; si `validado_r3` ⇒ `CONFLICT_STATE`.
  - `p_rows` con `catalog_code`, `mes` 1..12, `volumen_m3>=0`; filas inválidas a `filas_rechazadas[{fila,razon}]` 1-based; no aborta el lote; audit+idempotencia; **no valida R3**.
- Errores adicionales: `VALIDATION_BHE_INCOMPLETO` (422), `GATE_BHE_R3` (409), `GATE_R3_FICHA` (409), `GATE_BHE_BRECHA` (409).

### D11 — Pruebas ampliadas
- pgTAP: ACL RPC `{postgres,service_role}`; brecha >10 bloquea; corregida ≤10 reintenta; `entradas=0`/12 meses incompletos rechazados; doble validación; update directo de gate fields 42501; flows observador/invitado 42501; post-R3 42501; gate F5 con brecha >10 sintética; cross-tenant.
- Deno: EF-05 (mensaje canónico/errores/ficha), EF-09-bhe (R2/checksum/MIME/parser/zip-bomb/filas/import no valida R3).


- `docs/04` EF-05/EF-09, `docs/01` §4.6, `docs/05` BHE-01…05/PG-07/08, `docs/02` triggers `check_phase_gate`/`v_bhe_*`.
- F1-08: `#62` `b22e3b2`, `#64` `7ad315b` (parser/EF-09 reutilizable).

## Adenda 2 — hallazgos de arquitecto/EF/UI (B7–B10)

### D12 — Plantilla BHE y fórmulas
- La plantilla real contiene **fórmulas** en totales (`O`/`P` hojas 1–3) y hoja 4; el parser **no rechaza todo `<f>`**.
- Permitir fórmulas **solo** en celdas de totales/resumen conocidas; ignorarlas y **recalcular server-side**. Fórmula en celda mensual (C–N hojas 1–3) o fuera de allowlist ⇒ `VALIDATION_XLSX_ESTRUCTURA`/`VALIDATION_BHE_FORMULA`.
- Macros/`vbaProject.bin`, DOCTYPE, referencias externas siempre rechazados.
- `periodo_anio` **obligatorio** para BHE. Mapeo: hoja 1 Entradas, hoja 2 Destinos, hoja 3 Parte A Reúso/Recirculación; 12 columnas Ene–Dic.
- **Parte B calidad fuera de F1-09** (residual documentado a IVOH/F1-10); no hace fallar el import.
- `destino_id=balance_id`, `fuente_origen='importada_excel'`, `estado='en_captura'`, **nunca valida R3**.

### D13 — Ciclo de vida
- Una fila por `(diagnostic_id, version)`; `version` server-side (1 captura; incrementa al validar).
- Alta manual coord/equipo: `estado` forzado `borrador`, `organization_id`/`diagnostic_id`/`version`/ficha server-side.
- Primer flujo insertado por coord/equipo ⇒ trigger `borrador→en_captura`.
- Import upsert solo en `borrador|en_captura`; `validado_r3` ⇒ `CONFLICT_STATE`.
- Post-R3: cualquier UPDATE autenticado de balance o flows ⇒ 42501.

### D14 — Brecha anual canónica
- `brecha_anual_pct = round(100*Σbrecha_m3 / nullif(Σentradas_m3,0), 2)` (ponderada).
- `v_bhe_capture_summary` y `v_bhe_summary` exponen `brecha_anual_pct` y `brecha_max_mes_pct`; `brecha_pct_promedio` queda **no canónico**.
- EF-05/gate usan el máximo mensual y el ponderado; nunca promedio simple.

### D15 — Vistas/ACL
- `v_bhe_monthly_capture`, `v_bhe_capture_summary` con `security_invoker=true` + grants SELECT a authenticated; RLS subyacente.
- `v_bhe_monthly`/`v_bhe_summary` recreadas `security_invoker=true` y filtro `validado_r3` para tablero/cierre.
- UI lee vistas; no calcula brecha.

### D16 — Vista de captura con 12 filas y semántica de vacío (B11)
- `v_bhe_monthly_capture` y `v_bhe_capture_summary` usan `generate_series(1,12)` + LEFT JOIN de flujos: **siempre 12 filas**.
- Columnas: `mes` 1..12, `entradas_m3`, `destinos_m3`, `descargas_m3`, `perdidas_m3`, `circular_m3`, `brecha_m3`, `brecha_pct` (NULL si `entradas=0`), `flujos_count`, `tiene_captura` boolean.
- Mes sin flujos: `brecha_m3=0`, `brecha_pct=NULL`, `tiene_captura=false`, `flujos_count=0`; la UI pinta “sin captura”, no calcula.
- La RPC exige 12 meses con captura (`tiene_captura=true` en todos) y `entradas>0`; si no ⇒ `VALIDATION_BHE_INCOMPLETO`/`GATE_BHE_BRECHA`.
- `v_bhe_capture_summary`: `brecha_anual_pct` ponderada, `brecha_max_mes_pct`, `meses_sobre_umbral`, `meses_con_captura`.


