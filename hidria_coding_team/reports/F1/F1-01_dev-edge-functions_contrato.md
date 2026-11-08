# F1-01 (readiness EF) — Mapa de contratos EF-01…EF-13 y readiness de implementación

- **Agente:** `dev-edge-functions` (03)
- **Fecha:** 2026-11-07 18:20 (America/Mexico_City)
- **Tarea compartida:** `task-7` — «F1 · Dev EF: mapa de contratos y readiness»
- **Tarea/evidencia:** `reports/F1/F1-01_dev-edge-functions_contrato.md`
- **Rama / PR:** `chore/f0-fundacion` @ `90c77ab` · sin PR (este round es **sin código**)
- **Entorno:** local Windows / PowerShell 5.1 · Supabase `zucalshlfcxejpukshxl` (no se ejecutó DDL ni se consultó datos)
- **Alcance del round:** solo lectura + análisis. **No se escribió código, no se crearon migraciones, no se ejecutó `git commit/push/merge/checkout`, no se imprimió ningún secreto.**

> **Nota de nomenclatura:** el ID `F1-01` de este archivo es el primer entregable del **agente 03** en Fase 1
> (readiness de Edge Functions), no la tarea de backlog `tasks/F1/F1-01_auth_claims.md`. Este reporte es
> insumo directo de esa tarea (auth/claims) y de `F1-04…F1-12`.

---

## 0. Veredicto

| Dimensión | Resultado | Sustento |
|---|---|---|
| **Mapa de contratos EF-01…EF-13** | **VERDE** | 13/13 EFs mapeadas con método/ruta, módulo, rol, gate, errores canónicos, evento Realtime y folio server-side (§2). |
| **Objetos de BD para implementar** | **AMARILLO → ROJO si no se migran 8 objetos P0** | 8 solicitudes P0 (`M-01…M-08`) y 11 P1/P2 (§3). Sin `M-01…M-04` ninguna EF puede cumplir DoD (idempotencia, auditoría encadenada concurrente, folio `-R1`, cálculo BHE pre-R3). |
| **Habilitadores de entorno** | **ROJO (bloqueantes)** | `B-01` Deno no instalado y sin Docker → no hay runtime local ni `supabase functions serve`; `B-02` no hay `SUPABASE_ACCESS_TOKEN` → no hay `supabase secrets set` / `functions deploy`; `B-03` no hay credenciales R2 en `.env` → EF-07/EF-08/EF-10 bloqueadas; `B-04` no existe `supabase/config.toml` ni `deno.json` → sin política `verify_jwt` ni pin de runtime. |
| **Plan `_shared/`** | **VERDE (diseño)** | 14 módulos, contrato interno y orden de implementación (§4, §5). |
| **`supabase/functions/README.md`** | **AMARILLO** | 18 omisiones/inconsistencias detectadas con propuesta concreta (§6). |
| **Veredicto global** | **AMARILLO** | Contrato listo; implementación **no debe iniciar** hasta cerrar `B-01`, `B-02`, `B-03` y las migraciones `M-01`, `M-02`, `M-03`, `M-04` (+ `M-07` para fixtures de F1-01). **No se declara PARO**: §12.1 aplica a los dueños de credenciales (DevOps `F0-01/F0-03/F0-09`, Arquitecto `F0-02/F0-10`) tras 3 intentos documentados. |

**Las 3 primeras EF recomendadas (detalle y justificación en §5.3):** `EF-03` (checklist/transition) →
`EF-02` (logbook/close) → `EF-01` (advance-phase). Cierra el camino crítico `E2E-01` a fase 2 sin depender
de R2, PDF ni proveedor externo, y ejercita todos los primitivos de `_shared`.

---

## 1. Fuentes leídas y método

| # | Documento | Secciones | Uso en este reporte |
|---|---|---|---|
| 1 | `hidria_coding_team/TEAM.md` | completo (§4 decisiones congeladas, §5 reglas duras, §8–§9, §12 PARO, §15 prohibiciones) | Restricciones de diseño y criterios de paro |
| 2 | `agents/03_dev_edge_functions.md` | completo | DoD por EF, estructura `_shared`, contrato técnico obligatorio |
| 3 | `docs/04-Contratos-API-y-Tablas-de-Decision…md` | **completo** (§1–§9) | Fuente de contratos, TD-1…TD-8, §7 Realtime, §8 errores, §9 modelo de lectura |
| 4 | `docs/01-Diseño-Base-de-Datos…md` | completo (§1–§6) | Tablas, vistas, triggers y reglas de folios |
| 5 | `docs/02-supabase_schema_hidria_mdohi.sql` | completo (1207 líneas; foco en §1–§5) | **DDL real**: columnas, CHECKs, triggers, RLS (gana ante ambigüedad, TEAM §3) |
| 6 | `docs/05-Plan-de-Pruebas…md` | §2, §3.1–§3.7, **§4.3 (API-00…04)**, §4.4–§4.8, §5 (E2E), §8 | Casos de contrato y trazabilidad |
| 7 | `docs/07-Plan-de-Migracion…md` | §4 (migraciones), §5.1 (EF), §5.3 (Cloudflare/WAF), §5.4 (secretos), §9 (monitoreo) | Runbook de despliegue y secretos |
| 8 | `docs/06-Gobernanza-y-Privacidad…md` | §5 (ARCO), §8 (seguridad), §9 (72 h), §10 (retención), §12 (addendum) | PII en idempotencia, retención, ARCO |
| 9 | `docs/Arquitectura HIDRIA-ECT con MD-OHI v2.0.md` | §5.9 (M9), §5.10 (M10), §7 | Estructura del reporte (11 bloques, anexos A–F) y versión nunca sobrescrita |
| 10 | `docs/03-seed_catalogos.sql` | §5 (completeness), §6 (logbook_templates), §7 (cat_items) | Valores sembrados que la EF debe asumir |
| 11 | `supabase/migrations/20261108000000_privacy_addendum.sql` | completo | Folio ARCO server-side ya existente |
| 12 | `supabase/functions/README.md`, `hidria_coding_team/.env.example`, `scripts/ci/guardas.sh`, `.github/workflows/ci.yml`, `decisions/ADR-001/002`, `tasks/BACKLOG.md`, `tasks/F1/*` | completos | Revisión de README, inventario de secretos, CI, orden de tareas |

### 1.1 Comandos ejecutados (evidencia, sin secretos)

| # | Comando | Resultado |
|---|---|---|
| 1 | `Get-ChildItem docs, supabase -Recurse` | 3 migraciones aplicadas; `supabase/functions/` solo `README.md`; **sin** `config.toml` |
| 2 | `npx --no-install supabase --version` | `3.0.0` (CLI disponible vía npx; Docker no disponible en la máquina) |
| 3 | `Get-Command deno` / `deno --version` | **Deno no instalado** (`CommandNotFoundException`) |
| 4 | `Get-Content .env` → solo nombres de variables (`-match '^[A-Za-z_]+='` → `$1`) | Sin `SUPABASE_ACCESS_TOKEN`, sin `R2_*`, sin `PSC_*`, sin `NOM151_ENABLED` |
| 5 | `grep` sobre `docs/02` y `supabase/migrations` (`publication|realtime|idempot|rate_limit|obligatoria|documents.folio`) | **0 coincidencias** → no hay tabla de idempotencia, ni publicación Realtime, ni límite de tasa, ni folio de reporte |
| 6 | `grep`/conteo de objetos sobre `docs/02` + addendum | **44 tablas** (43 base + `privacy_requests`), **6 vistas**, **34 `create policy`** explícitas + políticas generadas en bucles `do $$`, **14 funciones**, **9 triggers** explícitos + triggers generados por bucle (`updated_at`); RLS habilitada en **44/44** tablas (1 `organizations` + 8 del bucle tenant + 6 del bucle expediente + 7 hijas de bitácora + 11 catálogos + 10 explícitas + 1 del addendum) |
| 7 | Lectura de `02` líneas clave (folios, gates, auditoría, RLS) | Hallazgos `H-01…H-18` (§3.1) |

> **Higiene de secretos:** no se leyó ni se transcribió ningún valor del `.env`; solo se listaron nombres de
> variables para verificar la ausencia de las credenciales que bloquean EF. Ningún reporte o log de este
> round contiene material sensible.

---

## 2. Mapa exacto de contratos EF-01…EF-13

### 2.1 Identidad, ruta, rol y gate (fuente: `docs/04` §3 y §4)

Base: `https://<ref>.supabase.co/functions/v1/` · recursos en plural kebab-case · IDs de negocio en la ruta.
Todas exigen `Authorization: Bearer <supabase_jwt>`; **el rol por diagnóstico nunca viaja en el JWT**: la EF lo
resuelve con `my_diagnostic_role(diagnostic_id)` (o su equivalente server-side, ver `M-06`).

| EF | Método y ruta | Módulo · Fase | Rol autorizado (por diagnóstico salvo nota) | Gate / regla | Tarea F1/F2 |
|---|---|---|---|---|---|
| **EF-01** | `POST /diagnostics/{diagnostic_id}/advance-phase` | M2/M11 · F1 | `coordinador`, `equipo` | `check_phase_gate` + TD-1 (entregable **y** ficha de respaldo cerrada); `to_phase = fase_actual+1` | F1-04 |
| **EF-02** | `POST /logbook/{entry_id}/close` | M10 · F1 | `coordinador`, `equipo` | TD-8 (≤24 h; `cerrada_razon` ≥20 chars si tardío) + firmas de asistentes requeridos + agenda completa + evidencia obligatoria | F1-11 |
| **EF-03** | `POST /checklist/{item_id}/transition` | M3 · F1 | según TD-2: `empresa` (1), `coordinador`/`equipo` (2), `coordinador` (3), `coordinador`/`equipo` con nota (4) | TD-2; `validado_r1` terminal | F1-06 |
| **EF-04** | `POST /cat/{diagnostic_id}/submit` · `POST /cat/{diagnostic_id}/validate-r2` | M4 · F1 | `submit`: `empresa`, `coordinador`, `equipo` · `validate-r2`: `coordinador`, `equipo` | Gate F3 (CAT `validado_r2`) + ficha `BIT-R2` cerrada y plan de «No sé» | F1-07 |
| **EF-05** | `POST /balances/{balance_id}/validate-r3` | M6 · F1 | `coordinador`, `equipo` | TD-3: brecha mensual ≤ 10 % en 12 meses; ficha `BIT-R3` cerrada (`r3_logbook_id`) | F1-09 |
| **EF-06** | `POST /ivoh/{diagnostic_id}/score` · `POST /ivoh/{diagnostic_id}/validate-r4` | M8 · F1 | `coordinador`, `equipo` | `trg_ivoh_requires_bhe` (BHE `validado_r3`) + TD-6 (semáforo) + ficha `BIT-R4` cerrada + 6 factores | F1-10 |
| **EF-07** | `POST /diagnostics/{diagnostic_id}/emit-report` | M9 · F1 esencial | **solo `coordinador`** | TD-4 matriz **10/10** (`v_diagnostic_completeness`) + ficha `BIT-R5` cerrada | F1-12 |
| **EF-08** | `POST /documents/presign` · `POST /documents/register` | M3 · F1 | miembro del diagnóstico (cualquier rol) | `size_bytes ≤ 100 MB`; `mime` en lista blanca; exposición default `restringido_nda` | F1-05 |
| **EF-09** | `POST /import/xlsx` | M5/M6 · F1/F2 | `coordinador`, `equipo` | Estructura idéntica a plantilla oficial; **nunca** valida R3 | F1-08 |
| **EF-10** | `POST /samples/{sample_id}/dictamen` | M7 · F2 | `coordinador`, `equipo` | TD-5 + `trg_custody_gate` (3 transferencias firmadas) | F2-01 |
| **EF-11** | `POST /quiz/submit` | M12 · F2 | **autenticado** (cualquier `global_role`) | TD-7: `score ≥ 80` ⇒ `passed` + insignia OB3 | F1-14/F2 |
| **EF-12** | `POST /diagnostics/{diagnostic_id}/reprogram-milestone` | M2/M10 · F2 | **solo `coordinador`** | TD-1 semáforo; `fecha_nueva ≤ fecha_inicio + 6 semanas`; justificación ≥20 chars | F1-11b |
| **EF-13** | `POST /reports/{document_id}/sign-nom151` | M9 · F3 | **solo `coordinador`** | `NOM151_ENABLED`; fases 1–2 ⇒ `501 NOT_IMPLEMENTED_PHASE` | F3-01 |

**No son Edge Functions (por diseño):** toda lectura oficial (`v_bhe_monthly`, `v_bhe_summary`,
`v_balance_indicators`, `v_ivoh_score`, `v_diagnostic_completeness`, `v_quiz_questions`) va por PostgREST con
RLS; `GET /documents/{id}/download` y el buzón ARCO (`privacy_requests`) quedan **fuera** de EF-01…EF-13
(este último ya tiene folio server-side por secuencia, ver §2.5).

### 2.2 Efectos, evento, folio, errores e idempotencia

| EF | Escrituras (tablas) | Transaccional | Evento Realtime (§7) | Folio server-side | Errores canónicos (§8) |
|---|---|---|---|---|---|
| EF-01 | `diagnostics` (`fase_actual`, `proximo_hito`, `avance_pct`), `notifications`, `audit_log` | Sí | `diagnostic:{id}.phase_changed` + `org:{org}.kanban_refresh` | solo lee `diagnostics.folio` | `GATE_CHECKLIST_R1`·`GATE_CAT_R2`·`GATE_IIH_V1`·`GATE_BHE_R3`·`GATE_IVOH_R4` (409) · `CONFLICT_PHASE` (409) · `FORBIDDEN_ROLE`/`FORBIDDEN_NOT_MEMBER` (403) · `AUTH_INVALID` (401) |
| EF-02 | `logbook_entries` (cierre, `version+1`), `logbook_change_log`, `notifications`, `audit_log` | Sí | `logbook_closed` | `BIT-{clave}-{nn}` (trigger; solo se devuelve) | `VALIDATION_FIRMAS`·`VALIDATION_AGENDA`·`VALIDATION_EVIDENCIA`·`VALIDATION_RAZON` (422) · `CONFLICT_STATE` (409) · `FORBIDDEN_ROLE` (403) |
| EF-03 | `document_checklist_items`, `notifications`, `audit_log` | Sí | `checklist_updated` | — | `FORBIDDEN_ROLE` (403) · `CONFLICT_STATE` (409) |
| EF-04 | `diagnostics.cat_estado`, `notifications`, `audit_log` | Sí | `cat_validated` (solo validate-r2) | — | `VALIDATION_CAT_INCOMPLETO` (422, con `codigo` faltantes) · `GATE_R2_FICHA` (409) · `FORBIDDEN_ROLE` |
| EF-05 | `water_balances` (`validado_r3`, `validado_r3_logbook_id`, `version+1`), `diagnostics.brecha_pct`, `notifications`, `audit_log` | Sí | `bhe_validated` | — | `GATE_BHE_BRECHA` (409 + `details.meses[{mes,brecha_pct}]`, `umbral_pct`) · `GATE_R3_FICHA` (409) · `FORBIDDEN_ROLE` |
| EF-06 | `ivoh_evaluations`, `diagnostics.ivoh_actual`, `notifications`, `audit_log` | Sí | `ivoh_validated` | — | `GATE_BHE_R3` (409) · `CONFLICT_IVOH_VERSION` (409) · `VALIDATION_IVOH_INCOMPLETO` (422) · `FORBIDDEN_ROLE` |
| EF-07 | `documents`, `diagnostics` (`estado='reportado'`, `reporte_document_id`), R2, `notifications`, `audit_log` | Sí (+ R2) | `report_emitted` | **`{folio_diagnostico}-R1`** | `GATE_REPORTE_INCOMPLETO` (409 + lista de requisitos) · `FORBIDDEN_ROLE` |
| EF-08 | `documents` (registro), R2 (`PUT` prefirmado), `audit_log` | presign: No · register: Sí | — | — (`r2_key` = `org/…/diag/…/{document_id}.{ext}`) | `VALIDATION_FILE` (422) · `FORBIDDEN_NOT_MEMBER` (403) |
| EF-09 | `water_balances` (`fuente_origen='importada_excel'`), `balance_flows` \| `iih_assets`, `audit_log` (mapeo en `meta`) | Sí | `org:{org}.kanban_refresh` | IIH: trigger `trg_iih_folio` | `VALIDATION_XLSX_ESTRUCTURA` (422, con diff de columnas) · `FORBIDDEN_ROLE` |
| EF-10 | `lab_results`, `samples.estado`, `quality_parameters`, `notifications`, `audit_log` | Sí | `lab_results` | `samples.codigo` `{folio}-Mnn` (**falta generador**, `M-12`) | `GATE_CUSTODIA` (409) · `VALIDATION_PARAM_NO_SOLICITADO` (422) · `VALIDATION_LAB_NO_ACREDITADO` (422) · `FORBIDDEN_ROLE` |
| EF-11 | `quiz_attempts`, `profiles.badge_mdohi`, `notifications`, `audit_log` (JSON-LD OB3 en `meta`) | Sí | `user:{id}.notification` | — | `VALIDATION_ANSWERS` (422) |
| EF-12 | `diagnostics.proximo_hito`/`semaforo_atraso`, `logbook_findings`, `audit_log` | Sí | `org:{org}.kanban_refresh` | — | `VALIDATION_REPROGRAMACION` (422) · `FORBIDDEN_ROLE` |
| EF-13 | `signatures`, `documents` (versión), `audit_log` | Sí | — | `documents.folio_nom151` (folio del PSC) | `EXT_PSC` (502) · `NOT_IMPLEMENTED_PHASE` (501) · `FORBIDDEN_ROLE` |

### 2.3 Fichas por EF (contrato campo por campo)

> Formato: **Pre** = precondiciones (409/403/422, nunca 500) · **Tx** = trabajo transaccional ·
> **Post** = efectos tras commit · **Resp** = JSON exacto del contrato. Citas: `docs/04` §4.

#### EF-01 — Avance de fase
| Bloque | Especificación |
|---|---|
| Pre | JWT válido; `my_diagnostic_role ∈ {coordinador, equipo}`; `diagnostics.estado='activo'`; body `{ "to_phase": 2..6 }` con `to_phase = fase_actual + 1` exacto; gate de la fase origen (TD-1) **incluido el folio de respaldo** (ficha `BIT-{R1..R4}` cerrada) |
| Tx | Gate (replicando `check_phase_gate` con sus mensajes) → `UPDATE diagnostics SET fase_actual, proximo_hito, avance_pct = fase*100/6` → `audit_log(action='move_phase')` |
| Post | `INSERT notifications` a miembros (`kind='hito'`) → evento `phase_changed` |
| Resp | `{ diagnostic_id, folio, fase_actual, proximo_hito, avance_pct, gate: { fase_origen, entregable, folio_respaldo } }` |
| Errores | 409 gates (mensajes del trigger) · `CONFLICT_PHASE` (salto ≠ +1) · 403 rol · 401 auth |
| Brechas F1 | (a) el trigger **no** valida el salto ni el estado destino (defensa en profundidad, `M-18`); (b) la fila TD-1#6 (fase 6 ⇒ `estado='reportado'`) es inalcanzable vía `advance-phase` (Q-09); (c) la ficha de respaldo exige EF-02 operativo para E2E-01 (Q-14) |

#### EF-02 — Cierre de bitácora
| Bloque | Especificación |
|---|---|
| Pre | Rol `coordinador|equipo`; ficha `abierta`; `firma_ts` de **asistentes requeridos** del template; agenda completa (todo `no` con `estado`, y `resultado` si `realizado`); evidencia obligatoria con `document_id`; si `now() - fecha > 24 h` ⇒ `cerrada_razon` ≥20 chars |
| Tx | `UPDATE logbook_entries SET estado='cerrada', cerrada_en=now(), cerrada_razon, version=version+1` → `INSERT logbook_change_log(version, descripcion, responsable, prev)` con snapshot previo → `audit_log(action='sign')` |
| Post | Notificación `kind='validacion'` a contraparte empresa si la ficha es V/R de validación → evento `logbook_closed` |
| Resp | `{ entry_id, folio, clave, cerrada_en, version }` |
| Errores | `VALIDATION_FIRMAS`·`VALIDATION_AGENDA`·`VALIDATION_EVIDENCIA`·`VALIDATION_RAZON` (422) · `CONFLICT_STATE` si ya cerrada · 403 |
| Brechas F1 | (a) `logbook_templates.asistentes_requeridos` es **texto libre** `'A · B · C'` → validación no determinista (`M-10`, Q-10); (b) `logbook_evidence.item`/`evidence_items` también texto libre; (c) tras el cierre, `trg_logbook_immutable` bloquea todo `UPDATE` de la ficha, pero **no** las tablas hijas (LB-07 pide bloquearlas, `M-09`); (d) el «control de cambios» posterior no tiene camino sancionado implementable hoy (Q-13) |

#### EF-03 — Transición de lista de cotejo
| Bloque | Especificación |
|---|---|
| Pre | Body `{ "to": "recibido"|"revisado"|"validado_r1", "document_id"?: uuid, "solicitud_nota"?: text }`; transición permitida según **TD-2** (rol × origen × destino); `validado_r1` exige `document_id` y rol `coordinador`/`equipo` |
| Tx | `UPDATE document_checklist_items SET estado, document_id, solicitud_nota` → `audit_log(action='approve' si validado_r1; 'update' si no)` |
| Post | Si `to ∈ {recibido, revisado}` con nota → notificación `kind='validacion'` al rol `empresa` → evento `checklist_updated` |
| Resp | `{ item_id, item_code, estado, document_id }` |
| Errores | `FORBIDDEN_ROLE` (403) · `CONFLICT_STATE` (409: transición no permitida; `validado_r1` es terminal) |
| Brechas F1 | (a) TD-2#1 exige `document_id` adjunto para `empresa → recibido`, pero RLS no impide que la empresa lo deje nulo: la EF es el único gate (correcto, pero requiere prueba negativa explícita API-02); (b) TD-2#3 exige «ficha R1 abierta o cerrada de la misma semana» → criterio ambiguo (semana del diagnóstico vs. semana calendario), Q-15 |

#### EF-04 — CAT (submit / validate-r2)
| Bloque | Especificación |
|---|---|
| Pre submit | Rol `empresa|coordinador|equipo`; todas las preguntas **obligatorias** de `cat_items` con `condicion` aplicable tienen respuesta (`valor` no nulo **o** `no_se=true`); preguntas `admite_evidencia` resueltas en campo llevan `document_id` |
| Pre validate-r2 | Rol `coordinador|equipo`; ficha `BIT-R2-*` **cerrada** y existe plan de resolución de cada `no_se` en `logbook_findings` de esa ficha |
| Tx | `UPDATE diagnostics SET cat_estado` (`en_revision` / `validado_r2`) → `audit_log(action='approve' en validate-r2)` |
| Post | Notificación a `empresa`; `cat_validated` en validate-r2 |
| Resp | `{ diagnostic_id, cat_estado, pendientes: n }` |
| Errores | `VALIDATION_CAT_INCOMPLETO` (422 + lista de `cat_items.codigo` faltantes) · `GATE_R2_FICHA` (409) · 403 |
| Brechas F1 | (a) `cat_items` **no tiene** columna `obligatoria` y `condicion` (jsonb) no tiene semántica documentada → no se puede decidir «obligatoria aplicable» (`M-11`, Q-16); (b) el seed A1-v1 está en `03` pero `F1-07` lo declara entregable (¿se re-siembra o ya está? confirmar 47/47) |

#### EF-05 — Validación BHE en R3 (regla de la brecha)
| Bloque | Especificación |
|---|---|
| Pre | Rol `coordinador|equipo`; `water_balances.estado='en_captura'`; body `{ "r3_logbook_id": uuid }` con ficha `BIT-R3` cerrada del diagnóstico |
| Tx | Calcular brecha mensual y anual; **si algún mes `brecha_pct > 10` ⇒ abortar (409 TD-3) sin tocar estado**; si pasa: `UPDATE water_balances SET estado='validado_r3', validado_r3_logbook_id, version+1`; `UPDATE diagnostics.brecha_pct` (brecha anual); `audit_log(action='approve')` |
| Post | Notificación a miembros; `bhe_validated`; desbloquea IVOH |
| Resp | `{ balance_id, estado, brecha_anual_pct, brecha_max_mes_pct, meses_sobre_umbral: 0 }` |
| Errores | `GATE_BHE_BRECHA` (409; mensaje canónico «Un balance que no cierra no es un dato, es una tarea pendiente.») · `GATE_R3_FICHA` (409) · 403 |
| Brechas F1 | (a) **`v_bhe_monthly` solo contiene balances `validado_r3`** (línea 660 del DDL) ⇒ es inutilizable para el pre-chequeo de un balance `en_captura` (`M-04`); (b) `v_bhe_summary.brecha_pct_promedio = avg(brecha_pct)` contradice BHE-05 («ponderada por volumen, no promedio simple») ⇒ `brecha_anual_pct` incorrecto (`M-04`, Q-04); (c) `validado_r3_logbook_id` sin FK (`M-16`) |

#### EF-06 — IVOH (score / validate-r4)
| Bloque | Especificación |
|---|---|
| Pre score | Rol `coordinador|equipo`; BHE `validado_r3` (trigger); los 6 factores pertenecen a `diagnostics.index_version_id`; puntaje 0–10 paso 0.5; **≥1 evidencia por factor**; justificación |
| Pre validate-r4 | Ficha `BIT-R4` cerrada (id en body); 6 factores con puntaje y justificación |
| Tx | `score`: upsert `ivoh_evaluations (estado='borrador')`. `validate-r4`: `estado='validado_r4'`, `r4_logbook_id`; total = Σ `ivoh_factors.peso × puntaje` (1 decimal); `UPDATE diagnostics.ivoh_actual`; semáforo TD-6; `audit_log('approve')` |
| Post | `ivoh_validated` + notificación con total y semáforo |
| Resp | `{ diagnostic_id, total, semaforo, por_factor: [{factor_code, peso, puntaje, aportacion}] }` |
| Errores | `GATE_BHE_R3` (409; replicado del trigger) · `VALIDATION_IVOH_INCOMPLETO` (422) · `CONFLICT_IVOH_VERSION` (409) · 403 |
| Brechas F1 | (a) `v_ivoh_score` no exige `count(*)=6` → publica totales parciales como oficiales (`M-14`); (b) el body admite `evidencia` como `[{tipo, ref}]` pero no hay catálogo de tipos → validación mínima por EF; (c) `validado_r4` de un factor es reversible por `UPDATE`; la inmutabilidad es solo de la versión del índice (Q-17) |

#### EF-07 — Emisión del Reporte (matriz 10/10)
| Bloque | Especificación |
|---|---|
| Pre | **Solo `coordinador`**; `v_diagnostic_completeness` con los 10 requisitos `ok`; ficha `BIT-R5` cerrada |
| Tx | Ensamblar documento (plantilla institucional versionada: 11 bloques + anexos A–F, arquitectura §5.9) → PDF → subir a R2 `hidria-reports` (`exposure_level='restringido_nda'`) → `INSERT documents` (metadatos + `sha256`) → `UPDATE diagnostics SET estado='reportado', reporte_document_id` → folio `{folio}-R1` → `audit_log('sign')` |
| Post | Notificaciones `kind='firma'` a Triple Hélice; `report_emitted`; queda pendiente NOM-151 (leyenda «referencia NOM-151 en proceso») |
| Resp | `{ diagnostic_id, reporte: { document_id, folio, url_prefirmada_15min, emitido_en }, matriz: [{orden, nombre, ok}] }` |
| Errores | `GATE_REPORTE_INCOMPLETO` (409 + lista de requisitos desde la vista/completeness) · 403 |
| Brechas F1 | (a) **no existe dónde persistir el folio** `{folio}-R1` ni la revisión `-R2` (`M-03`; F1-12 exige «nunca sobrescribe»); (b) TD-4 (docs/04) ≠ `completeness_items` (seed) ≠ `v_diagnostic_completeness` (DDL) ⇒ **tres listas de 10 requisitos distintas** (Q-03, `M-08`); (c) la vista no expone `orden/nombre` ni `reporte_emitible` ⇒ el `details` del 409 exige join/mapa frágil (`M-08`); (d) no hay fuente de plantilla PDF en el repo (decisión `D-05`); (e) presupuesto de payload/memoria de EF para generar PDF (riesgo `R-10`) |

#### EF-08 — Documentos (presign / register)
| Bloque | Especificación |
|---|---|
| Pre | Miembro del diagnóstico; `size_bytes ≤ 100 MB`; `mime` en lista blanca (pdf, imágenes, xlsx, dwg, ofx); `doc_type` del enum de `documents` |
| Body presign | `{ filename, doc_type, mime, size_bytes, exposure_level }` |
| Body register | (no especificado por `docs/04`) — necesita `diagnostic_id`, `company_id?`, `title`, `r2_key`, `sha256`, `mime`, `size_bytes`, `exposure_level`, `doc_type` |
| Tx register | `INSERT documents(...)` → `audit_log('create')` |
| Post | Cliente hace `PUT` a R2; si se vincula a checklist, cliente invoca EF-03 |
| Resp | presign `{ upload_url, r2_key, expira_en_seg: 900 }` · register `{ document_id, r2_key, sha256 }` |
| Errores | `VALIDATION_FILE` (422) · `FORBIDDEN_NOT_MEMBER` (403) |
| Brechas F1 | (a) contrato de `register` **incompleto** (no dice cómo llega `sha256`: cliente vs EF; verificar bytes de 100 MB en la EF es inviable) → Q-08; (b) **no hay estado de subida** en `documents` ⇒ presign puede dejar huérfanos o filas fantasma (`M-10`); (c) vigencia 900 s vs `docs/01` §1 «≤ 5 minutos» vs descarga 15 min ⇒ Q-07; (d) faltan credenciales R2 (`B-03`) |

#### EF-09 — Importación XLSX
| Bloque | Especificación |
|---|---|
| Pre | Rol `coordinador|equipo`; estructura idéntica a plantilla oficial (hojas, encabezados, unidades); desviación ⇒ diff de columnas |
| Body | multipart: archivo + `{ diagnostic_id, kind: "bhe"|"iih", periodo_anio? }` |
| Tx | Parseo/mapeo validado → `INSERT water_balances (fuente_origen='importada_excel', estado='en_captura')` + `balance_flows` **o** `iih_assets`; mapeo en `audit_log.meta`; **nunca** valida R3 |
| Post | Notificación con resumen (filas leídas/rechazadas/advertencias) |
| Resp | `{ kind, destino_id, filas_ok, filas_rechazadas: [{fila, razon}], advertencias: [text] }` |
| Errores | `VALIDATION_XLSX_ESTRUCTURA` (422) · 403 |
| Brechas F1 | (a) `unique (diagnostic_id, version)` en `water_balances`: la EF debe decidir versión al importar si ya hay balance validado (contrato silencioso, Q-12); (b) `iih_assets.folio` generado por `count(*)+1` ⇒ colisión bajo concurrencia y reutilización tras borrado (`M-13`); (c) límite de payload de EF vs. XLSX grande (`R-14`); (d) parseo XLSX en Deno: dependencia externa a fijar (`D-06`) |

#### EF-10 — Dictamen de laboratorio (F2)
| Bloque | Especificación |
|---|---|
| Pre | Rol `coordinador|equipo`; 3/3 `custody_transfers` firmadas; parámetros ⊆ `samples.params_solicitados`; `acreditacion_ema=true` cuando `norma_ref` exige dictamen oficial |
| Tx | `INSERT lab_results` → `UPDATE samples SET estado='resultados_recibidos'` → propagar `dictamen` a `quality_parameters` del BHE vigente → `audit_log('approve')` |
| Post | Notificación; `lab_results` |
| Resp | `{ sample_id, estado, dictamenes: [{param_code, dictamen}] }` |
| Errores | `GATE_CUSTODIA` (409) · `VALIDATION_PARAM_NO_SOLICITADO` (422) · `VALIDATION_LAB_NO_ACREDITADO` (422) · 403 |
| Brechas | (a) `samples.codigo` sin generador server-side (`M-12`); (b) `quality_parameters.lab_result_id` sin FK (`M-16`); (c) el trigger de custodia cuenta filas, no verifica contenido de `firma` (suficiente en MVP, documentar) |

#### EF-11 — Examen del Aula (F2)
| Bloque | Especificación |
|---|---|
| Pre | Autenticado; `answers` cubre **todas las preguntas activas**; calificación server-side contra `quiz_questions.correcta` |
| Tx | `INSERT quiz_attempts (score, passed, answers)`; si `passed` ⇒ insignia **Open Badges 3.0** (JSON-LD: achievement, criteria, evidence=attempt id, issuer SDFI/UCI) guardada en `audit_log.meta` + notificación + `profiles.badge_mdohi=true` |
| Post | `user:{id}.notification` |
| Resp | `{ attempt_id, score, passed, retroalimentacion: [{question_id, correcta, retroalimentacion}] }` |
| Errores | `VALIDATION_ANSWERS` (422) |
| Brechas | (a) `quiz_questions` no tiene `activo` ⇒ «preguntas activas» indefinido (Q-18); (b) «opciones barajadas» (agents/03 §3) no figura en `docs/04` y rompe el índice `opcion 0..3` salvo mapeo por EF (Q-18); (c) `profiles.badge_mdohi=true` no está en el contrato de EF-11 aunque E2E-10 lo exige; (d) insignia persistente: solo `audit_log.meta` (ver `M-17`) |

#### EF-12 — Reprogramación de hito (F2)
| Bloque | Especificación |
|---|---|
| Pre | Solo `coordinador`; `fecha_nueva ≤ fecha_inicio + 6 semanas`; `justificacion ≥ 20` chars; `causa ∈ {empresa, equipo, externa}` |
| Tx | Actualizar `proximo_hito` → insertar hallazgo en la ficha del hito vinculado («fecha original conservada: …, nueva fecha: …, causa: …») → si `causa='empresa'`, `diagnostics.semaforo_atraso` según TD-1 → `audit_log('update')` |
| Resp | `{ hito, fecha_nueva, semaforo_atraso }` |
| Errores | `VALIDATION_REPROGRAMACION` (422) · 403 |
| Brechas | (a) «ficha del hito vinculado» no es identificable: puede haber N fichas con la misma `clave` y la ficha puede no existir aún (Q-11); (b) el semáforo «2+ reprogramaciones» necesita histórico, hoy no hay tabla (`M-18b`); (c) `proximo_hito` es texto libre sin estructura hito+fecha |

#### EF-13 — Firma NOM-151 (F3)
| Bloque | Especificación |
|---|---|
| Pre | Solo `coordinador`; documento existente de diagnóstico `reportado`; fases 1–2 ⇒ `501 NOT_IMPLEMENTED_PHASE` (flag `NOM151_ENABLED=false`) |
| Tx | Llamada al PSC → evidencia en `signatures` + nueva versión de `documents` → `audit_log('sign')` |
| Resp | `{ document_id, sello: { proveedor, ts, evidencia_url } }` |
| Errores | `EXT_PSC` (502) · `NOT_IMPLEMENTED_PHASE` (501) · 403 |
| Brechas | (a) `PSC_*` no está en `.env` ni en inventario (`B-03`); (b) timeout/reintento del PSC no está especificado (`R-11`); (c) 501 debe validarse **antes** de cualquier efecto y con `Idempotency-Key` válido (API-00 aplica a EF-13 aunque siempre devuelva 501) |

### 2.4 Resolución de rol y autorización (algoritmo obligatorio para las 13 EF)

1. Extraer `Authorization: Bearer`; si falta, mal formado o expirado ⇒ `401 AUTH_INVALID` (SEC-04).
2. Verificar firma del JWT y obtener `sub`, `tenant_id`/`organization_id`, `global_role` (claim **no** confiable para roles de diagnóstico, sí para `global_role` institucional porque lo emite el hook: `M-07`).
3. Cargar `profiles` del `sub`; si no existe ⇒ `401 AUTH_INVALID`; si `organization_id` del perfil ≠ tenant del token ⇒ `401` (token manipulado) — nunca 500.
4. Resolver el rol en el diagnóstico vía RPC server-side (`M-06`); si `NULL` ⇒ `403 FORBIDDEN_NOT_MEMBER`.
5. Contrastar con la matriz de §2.1; si el rol no está autorizado ⇒ `403 FORBIDDEN_ROLE`.
6. **Nunca** aceptar `rol`, `user_id`, `organization_id`, `folio` ni `estado` provistos por el cliente en el body (TEAM §15.8).

> **Hallazgo crítico `H-01`:** `my_diagnostic_role`/`is_diagnostic_member` usan `auth.uid()` (DDL líneas 607–623).
> Una EF que use el cliente `service_role` **no propaga el JWT**, por lo que `auth.uid()` es `NULL` y ambas
> funciones devuelven `NULL/false`. La EF debe resolver membresía por consulta directa filtrada por `sub`
> **o** por el RPC `M-06`. Este punto no está previsto en ningún documento y bloquea F1-01.

> **Hallazgo `H-02` (claims):** el DDL usa `tenant_id` (`is_tenant_member`, línea 946) y `docs/01` §1 dice
> «`tenant_id` y `global_role`», pero `docs/04` §2.1 exige claims `organization_id` y `global_role`.
> `F0-10` debe emitir el claim que la RLS necesita (`tenant_id`) y, si se quiere respetar `docs/04`, también
> `organization_id` como alias. La EF aceptará ambos con precedencia a `tenant_id` (Q-06).

### 2.5 Catálogo canónico de errores y folios

#### 2.5.1 Códigos (copia normativa de `docs/04` §8) y forma de emisión

| Código | HTTP | Cuándo lo emite la EF | `details` mínimo |
|---|---|---|---|
| `AUTH_INVALID` | 401 | JWT ausente/expirado/sin claim de tenant/perfil inexistente | — |
| `FORBIDDEN_ROLE` | 403 | Rol de diagnóstico insuficiente | `{ rol_actual, roles_permitidos }` |
| `FORBIDDEN_NOT_MEMBER` | 403 | Sin membresía al diagnóstico/tenant | `{ diagnostic_id }` |
| `CONFLICT_PHASE` | 409 | Salto ≠ +1, fase ya superada | `{ fase_actual, to_phase }` |
| `CONFLICT_STATE` | 409 | Transición no permitida (TD) **e** idempotencia con payload distinto | `{ estado_actual, intento }` |
| `CONFLICT_IVOH_VERSION` | 409 | Intentar modificar pesos/rúbricas de versión vigente | `{ version_id }` |
| `GATE_CHECKLIST_R1` | 409 | Gate F2 incumplido | `{ fase_origen: 1, entregable }` |
| `GATE_CAT_R2` | 409 | Gate F3 incumplido | `{ fase_origen: 2 }` |
| `GATE_IIH_V1` | 409 | Gate F4 incumplido | `{ activos_sin_verificar }` |
| `GATE_BHE_R3` | 409 | Gate F5/IVOH incumplido | `{ balance_id }` |
| `GATE_IVOH_R4` | 409 | Gate F6 incumplido | `{ factores_faltantes }` |
| `GATE_BHE_BRECHA` | 409 | Brecha mensual > 10 % (TD-3) | `{ meses: [{mes, brecha_pct}], umbral_pct: 10 }` |
| `GATE_CUSTODIA` | 409 | < 3 custodia firmadas | `{ sample_id, firmadas }` |
| `GATE_REPORTE_INCOMPLETO` | 409 | Matriz 10/10 incompleta (TD-4) | `{ requisitos: [{orden, nombre}] }` |
| `VALIDATION_*` | 422 | Payload incompleto/inconsistente (firmas, agenda, evidencia, CAT, razón, archivo, XLSX, parámetro, laboratorio, reprogramación, respuestas) | campo + motivo accionable |
| `RATE_LIMIT` | 429 | > límite por usuario | `{ limite, ventana_seg: 60, retry_after_seg }` |
| `EXT_PSC` | 502 | Fallo del PSC NOM-151 | `{ proveedor }` |
| `NOT_IMPLEMENTED_PHASE` | 501 | Función de fase posterior (EF-13) | `{ fase_requerida: 3 }` |

Forma del envelope (cita `docs/04` §2.4): `error.code`, `error.message`, `error.details`, `error.ref = "audit:<hash>"`.
Reglas: **ningún stack trace, mensaje de Postgres ni nombre de tabla/columna interna**; el `ref` es el hash de la
fila de `audit_log` escrita en la misma transacción (incluidos los rechazos de negocio, `docs/04` §2.4).

#### 2.5.2 Mapeo mensaje de trigger → código HTTP (obligatorio en `_shared/errors.ts`)

| Excepción del DDL (texto literal) | Línea | Código EF |
|---|---|---|
| `Gate F2: la lista de cotejo (layout) no está validada en R1.` | 848 | `GATE_CHECKLIST_R1` (409) |
| `Gate F3: el CAT no está validado en R2.` | 852 | `GATE_CAT_R2` (409) |
| `Gate F4: el IIH tiene activos sin verificar en V1.` | 857 | `GATE_IIH_V1` (409) |
| `Gate F5: el balance hídrico no está validado en R3.` | 863 | `GATE_BHE_R3` (409) |
| `Gate F6: el IVOH no está validado en R4.` | 869 | `GATE_IVOH_R4` (409) |
| `IVOH bloqueado: no existe un Balance Hídrico Enriquecido validado en R3.` | 885 | `GATE_BHE_R3` (409) |
| `Dictamen bloqueado: la muestra % requiere 3 transferencias firmadas de custodia.` | 900 | `GATE_CUSTODIA` (409) |
| `Ficha % cerrada: inmutable. Use control de cambios (logbook_change_log).` | 814 | `CONFLICT_STATE` (409) |
| `La versión % del IVOH está vigente y aprobada: inmutable.` | 830 | `CONFLICT_IVOH_VERSION` (409) |

> **Hallazgo `H-03`:** los mensajes del trigger numeran la **fase destino** (`Gate F4`), mientras `docs/04` §8
> nombra el **entregable** (`GATE_IIH_V1`). El mapeo anterior es obligatorio y debe probarse en pgTAP
> (`PG-13`) sin `like` laxo. Además, `docs/05` PG-02 cita el mensaje del gate F2 en minúscula inicial
> («la lista de cotejo…») y el DDL lo emite con «La…»: el `throws_ok` debe comparar exactamente el DDL (Q-03b).

#### 2.5.3 Inventario de folios server-side (estado real)

| Folio | Formato | Generador actual | Estado para EF |
|---|---|---|---|
| Diagnóstico | `MDOHI-AAAA-NNN` | `diagnostics.folio` default con `diagnostics_folio_seq` (DDL 78–84) | ✅ listo (solo lectura en EF-01/07) |
| Reporte | `{folio_diagnostico}-R1` (y `-R2…`) | **no existe** columna/secuencia | ❌ `M-03` (bloquea EF-07) |
| Bitácora | `BIT-{clave}-{nn}` | `trg_logbook_folio` (DDL 775–787) — `count(*)+1` | ⚠️ existe, con carrera/reutilización (`M-13`) |
| Activo IIH | `CAP-01…EVA-nn` | `trg_iih_folio` (DDL 753–772) — `count(*)+1` | ⚠️ ídem (`M-13`) |
| Foto | `V1-01`, `V1-05-03` | `trg_photo_folio` (DDL 790–807) | ⚠️ ídem (`M-13`) |
| Evidencia de bitácora | `logbook_evidence.folio` | **sin generador** (columna nullable, DDL 552) | ❌ `M-12` (riesgo: folio puesto por el cliente) |
| Muestra | `{folio}-Mnn` | **sin default ni trigger** (`samples.codigo`, DDL 343) | ❌ `M-12` (EF-10/F2) |
| ARCO | `ARCO-AAAA-NNNN` | `privacy_folio_seq` (addendum 5–10) | ✅ listo (fuera de EF; cliente+RLS) |
| NOM-151 | folio del PSC | `documents.folio_nom151` (DDL 136) | ⏳ F3 (`EF-13`) |

**Regla de implementación:** la EF **nunca** compone un folio en TS. Si no hay generador en BD, se pide
migración (`M-03`, `M-12`); si lo hay, la EF solo lo lee del `RETURNING` y lo devuelve.

### 2.6 Idempotencia: contrato, conflicto documental y diseño propuesto

- `docs/04` §2.3: header **opcional** `Idempotency-Key`; clave procesada + mismo payload ⇒ `200` con el
  cuerpo original; clave + payload distinto ⇒ `409 CONFLICT_STATE`; registro en `audit_log.meta->>'idempotency_key'`.
- `agents/03` §4.1 y `supabase/functions/README.md` regla 1: header **obligatorio**.
  ⇒ **Q-01** (recomendación: obligatorio en las operaciones mutantes de negocio —EF-01…EF-12— y opcional solo
  en `EF-08/presign`, que no muta datos).
- **No existe** tabla ni índice de idempotencia (verificado por `grep` en `docs/02` y migraciones) ⇒ `M-01`.
  Guardar solo en `audit_log.meta` no permite un `lookup` barato ni garantiza unicidad bajo concurrencia
  (dos reintentos simultáneos ejecutarían efectos dobles, violando API-00/OFF-04).
- **Algoritmo propuesto (a implementar en `_shared/idempotency.ts`, no en este round):**
  1. Exigir `Idempotency-Key` UUID válido; si falta o no es UUID ⇒ `422 VALIDATION_*`.
  2. Calcular `request_hash = sha256(endpoint + método + body canónico)` (claves ordenadas, sin espacios).
  3. En la **misma transacción**: `INSERT` en `api_idempotency (user_id, endpoint, key, request_hash)`
     con `ON CONFLICT DO NOTHING`; si insertó ⇒ es la primera ejecución, continuar.
  4. Si no insertó: leer la fila. `request_hash` igual ⇒ devolver `status_code`/`response_body` guardados
     (`200`, sin auditoría nueva, sin notificación nueva). Distinto ⇒ `409 CONFLICT_STATE`.
  5. Al confirmar la transacción, guardar en la fila el `status_code`, el `response_body` y el `ref` de
     auditoría, y liberar la fila como «completada».
  6. Retención: `expires_at` (propuesta 7 días para gates; ≥24 h mínimo por OFF-02/OFF-04) + job de limpieza;
     la fila no debe almacenar PII más allá del cuerpo de respuesta (revisión con Seguridad, `docs/06` §10).

---

## 3. Objetos de BD que faltan — solicitudes de migración para `arquitecto-bd`

> **Nada de esto se creó ni se aplicó.** Son **solicitudes** para que el Arquitecto BD las convierta en
> migraciones forward-only idempotentes (`supabase/migrations/**`) con su pgTAP, conforme a TEAM §2.6 y
> agents/02. Las que afectan contrato/documentación requieren ADR del Revisor (§9).

### 3.1 Hallazgos del DDL que originan las solicitudes

| # | Hallazgo | Evidencia (DDL/ruta) | Impacto |
|---|---|---|---|
| H-01 | `my_diagnostic_role`/`is_diagnostic_member` dependen de `auth.uid()` | L607–633 | Inutilizables desde EF con `service_role` ⇒ `M-06` |
| H-02 | Claim de tenant: `tenant_id` (DDL) vs `organization_id` (docs/04) | L946; docs/04 L64 | `F1-01`/`M-07` y Q-06 |
| H-03 | Mensajes de trigger numeran fase destino; códigos numeran entregable | L848–869 vs docs/04 L464 | Mapa de errores `_shared` (§2.5.2) |
| H-04 | `profiles.global_role default 'user'` no pertenece al CHECK | L45–46 | Todo `INSERT` de perfil sin `global_role` falla con 23514 ⇒ `M-07` (bloquea fixtures F1-01) |
| H-05 | No hay tabla de idempotencia | grep 0 | `M-01` |
| H-06 | `audit_log` sin `reject/error` en `action`; cadena sin bloqueo de concurrencia | L166–173, L909–920 | `M-02` (SEC-06/R-11) |
| H-07 | `documents` sin `folio` ni revisión; no hay secuencia de reporte | L119–141 | `M-03` (EF-07) |
| H-08 | Vistas BHE filtran `estado='validado_r3'` y usan `avg(brecha_pct)` | L640–676 | `M-04` (EF-05; BHE-05) |
| H-09 | `v_diagnostic_completeness`: 10 columnas sin `orden/nombre/reporte_emitible`; 3 listas TD-4 distintas | L725–746; seed L196–207; docs/04 L355–366; arquitectura L243–254 | `M-08` + Q-03 (EF-07) |
| H-10 | `trg_logbook_immutable` solo cubre `logbook_entries` | L810–823 | LB-07 exige hijas ⇒ `M-09` |
| H-11 | `asistentes_requeridos`/`evidence_items` en texto libre | L483–485; seed L212–259 | EF-02 no determinista ⇒ `M-10` |
| H-12 | `cat_items` sin `obligatoria`; `condicion` sin semántica | L206–219 | EF-04 (Q-16) ⇒ `M-11` |
| H-13 | `samples.codigo` y `logbook_evidence.folio` sin generador | L339–357, L547–554 | Folios client-side ⇒ viola TEAM §15.8 ⇒ `M-12` |
| H-14 | Folios IIH/BIT/foto por `count(*)+1` | L753–807 | Carreras y reutilización ⇒ `M-13` |
| H-15 | `v_ivoh_score` publica totales parciales | L708–722 | `M-14` |
| H-16 | FKs declaradas en docs/01 ausentes en DDL | L101, 295, 423, 334 | `M-16` |
| H-17 | Sin publicación Realtime ni políticas de `realtime.messages` | grep 0 | `M-05` (Realtime §7 lo exige; RT-02 seguridad) |
| H-18 | Sin límite de tasa server-side (120/100 req/min) | grep 0 | `M-15` (API-04) |

### 3.2 Solicitudes P0 (bloquean el DoD de cualquier EF)

| ID | Tipo de objeto | Objeto propuesto | Motivo (EF/tarea) | Criterio de aceptación |
|---|---|---|---|---|
| **M-01** | tabla + índice único | `public.api_idempotency (id bigint identity pk, user_id uuid not null, endpoint text not null, key text not null, request_hash text not null, status_code smallint, response_body jsonb, response_ref text, created_at timestamptz default now(), completed_at timestamptz, expires_at timestamptz not null default now()+interval '7 days', unique (user_id, endpoint, key))`; índice `(expires_at)` para limpieza; RLS **sin** políticas para `authenticated`/`anon` (solo `service_role` del EF y lectura `admin_institucional` si se aprueba) | Todas las EF (API-00, API-02, OFF-02, OFF-04). `docs/04` §2.3 solo prevé `audit_log.meta`, insuficiente para unicidad concurrente | pgTAP: dos inserciones concurrentes con misma clave ⇒ una fila; replay idéntico ⇒ mismo cuerpo; hash distinto ⇒ 409 |
| **M-02** | función `security definer` + índice + extensión de CHECK | (a) `public.fn_audit_write(p_user uuid, p_action text, p_entity text, p_entity_id text, p_meta jsonb) returns text` que toma `pg_advisory_xact_lock` antes de leer el último hash y devuelve `hash`; (b) `create unique index on public.audit_log(prev_hash) where prev_hash <> 'GENESIS'` como guarda; (c) ampliar `audit_log_action_check` con `reject` y `error` (los rechazos de negocio también se auditan, docs/04 §2.4); (d) índice parcial `((meta->>'idempotency_key'))` para forense | Auditoría en la **misma transacción** (agents/03 §4.4) y SEC-06 (cadena íntegra con 5+ operaciones concurrentes). Hoy `trg_audit_hash` lee el último hash sin serialización ⇒ bifurcación de cadena | pgTAP: N inserciones concurrentes ⇒ cadena lineal verificable; `fn_audit_write` devuelve hash que la EF expone como `ref`; rollback de negocio ⇒ no queda auditoría |
| **M-03** | columnas + secuencia o tabla | Opción A: `documents.folio text unique`, `documents.report_revision smallint default 1`, `documents.report_diagnostic_id uuid`, y `public.report_folio_seq` (por diagnóstico) con trigger que compone `{diagnostic.folio}-R{revision}`; Opción B (preferida): `public.report_emissions (id uuid pk, diagnostic_id uuid fk, folio text unique, revision smallint, document_id uuid fk documents, matriz jsonb not null, emitido_por uuid, emitido_en timestamptz, unique (diagnostic_id, revision))` + trigger de folio | EF-07: el folio `{folio}-R1` no tiene dónde persistirse; `F1-12` exige que toda corrección genere **nueva versión** (arquitectura §5.9) y RPT-02 exige `folio` y `sha256` | pgTAP: emisión 1 ⇒ `MDOHI-AAAA-NNN-R1`; emisión 2 ⇒ `-R2`; nunca dos filas con el mismo folio; `documents.parent_document_id` enlaza versiones |
| **M-04** | funciones (RPC) de cálculo | `public.fn_bhe_monthly(p_balance_id uuid) returns table(mes, entradas_m3, destinos_m3, descargas_m3, perdidas_m3, circular_m3, brecha_m3, brecha_pct)` **sin** filtro de estado, y `public.fn_bhe_summary(p_balance_id uuid)` con `brecha_anual_pct = 100*sum(brecha_m3)/nullif(sum(entradas_m3),0)` (ponderada por volumen) + decisión sobre `v_bhe_summary.brecha_pct_promedio` | EF-05 necesita la brecha de un balance `en_captura`; las vistas la ocultan (H-08). BHE-05 exige brecha anual ponderada, no `avg` | pgTAP: balance `en_captura` con julio 12.6 % ⇒ `fn_bhe_monthly` devuelve `brecha_pct=12.6` y `fn_bhe_summary.brecha_anual_pct` coincide con suma de m³; BHE-01/BHE-02/BHE-05 repetibles |
| **M-05** | publicación Realtime + políticas | `alter publication supabase_realtime add table public.notifications`; (opcional según ADR) `diagnostics`, `document_checklist_items`, `sample`…; políticas RLS en `realtime.messages` para `SELECT` de topics `diagnostic:<uuid>`, `org:<uuid>`, `user:<uuid>` resolviendo membresía con `M-06` (canales **privados**, nunca públicos) | `docs/04` §7 exige publicar `phase_changed`… y RT-02 exige rechazar suscripción sin membresía; hoy no hay publicación ni autorización de canales | Prueba RT-01/RT-02: miembro recibe `phase_changed`; no-miembro no puede suscribirse al topic del diagnóstico |
| **M-06** | función `security definer` | `public.fn_diag_role(p_user_id uuid, p_diagnostic_id uuid) returns text` y `public.fn_is_diag_member(p_user_id uuid, p_diagnostic_id uuid) returns boolean` (misma semántica que las de `auth.uid()` pero parametrizadas), `revoke execute from anon, authenticated` y `grant execute to service_role` | H-01: toda EF necesita resolver rol con `service_role`; reimplementar en TS duplicaría la regla y abriría divergencia con RLS | pgTAP: para usuario X y diagnóstico D devuelve exactamente lo mismo que `my_diagnostic_role`/`is_diagnostic_member` con el JWT de X; `authenticated` no puede ejecutarla |
| **M-07** | fix de schema (forward-only) | `alter table public.profiles alter column global_role set default 'invitado'`; si `F0-10` emite `organization_id`, documentar el claim alias (o corregir `docs/04` §2.1) | H-02, H-04: `F1-01` necesita crear perfiles y el hook debe emitir el claim que la RLS usa | pgTAP: `INSERT` de perfil sin `global_role` ⇒ `'invitado'`; JWT del hook contiene `tenant_id` (y `organization_id` si se aprueba) |
| **M-08** | vista/función + alineación documental | `public.fn_completeness(p_diagnostic_id uuid) returns table(orden smallint, nombre text, verificado_en text, ok boolean)` alimentada por `completeness_items` + `reporte_emitible boolean`; alinear `docs/04` TD-4 con seed/DDL (ADR Q-03) | EF-07 exige `matriz: [{orden, nombre, ok}]` y `details.requisitos`; la vista actual no expone `orden/nombre` y su mapa difiere de TD-4 | Prueba RPT-01: se listan los requisitos fallidos por nombre; 10/10 ⇒ `reporte_emitible=true` |

### 3.3 Solicitudes P1 (necesarias para completar F1 con calidad, o para F2)

| ID | Objeto propuesto | Motivo | Nota |
|---|---|---|---|
| **M-09** | Extender `trg_logbook_immutable` a hijas (`logbook_participants`, `logbook_agenda`, `logbook_findings`, `logbook_agreements`, `logbook_evidence`, `photo_log`): bloquear INSERT/UPDATE/DELETE cuando la ficha está `cerrada`; añadir camino sancionado `public.fn_logbook_amend(...)` que escriba en `logbook_change_log` y abra nueva versión | LB-07 espera que insertar agenda tras el cierre lance excepción; docs/01 §6.5 promete «corrección solo por control de cambios» y hoy no existe vía | Coordinar con Q-13 |
| **M-10** | (a) `logbook_templates.asistentes_requeridos` y `evidence_items` normalizados a `jsonb` con `[{codigo, rol, obligatorio}]` (mantener texto para UI); (b) `logbook_participants.rol_requerido text`; (c) `logbook_evidence.item_code text` | EF-02 no puede validar firmas/evidencia contra texto libre `'Dirección de la empresa · responsable de planta · …'` | Alternativa mínima si no se migra: ADR que fije la regla de matching (Q-10) |
| **M-11** | `cat_items.obligatoria boolean not null default true` + documentar semántica de `condicion` (`depends_on`, `contains`, `equals`) | EF-04 exige «preguntas obligatorias con condición aplicable»; hoy no es decidible | Requiere ADR (Q-16) |
| **M-12** | (a) `samples.codigo` con default/trigger `{diagnostic.folio}-M{nn}` (secuencia por diagnóstico); (b) trigger `trg_logbook_evidence_folio` para `logbook_evidence.folio` (`{clave}-E{nn}`) | Folios server-side (TEAM §5); H-13 | Necesario para EF-10 (F2) y para no aceptar folios del cliente |
| **M-13** | `public.folio_counters (scope_key text pk, next_val int not null)` + `fn_next_folio(scope_key text) returns int` con `insert ... on conflict do update set next_val = next_val + 1 returning`; migrar `trg_iih_folio`, `trg_logbook_folio`, `trg_photo_folio` | `count(*)+1` colisiona bajo concurrencia (23505) y reutiliza folios tras borrado | EF-09 importa IIH ⇒ puede disparar la colisión |
| **M-14** | `v_ivoh_score` con `having count(*) = 6` (o `fn_ivoh_score(p_diagnostic_id)` con guarda) | Publicar un total con 2 factores validados es un dato falso en UI y en `diagnostics.ivoh_actual` | EF-06 debe validar 6/6 antes de escribir `ivoh_actual` |
| **M-15** | `public.api_rate_limit (user_id uuid, window_start timestamptz, counter int, pk (user_id, window_start))` + función `fn_rate_consume(p_user uuid, p_limit int) returns int` (upsert atómico) + job de limpieza | API-04 exige `429 RATE_LIMIT` por usuario; no hay almacén de estado | ADR por 120 vs 100 (Q-02); alternativa parcial: WAF Cloudflare por IP (`docs/07` §5.3) no cumple «por usuario» |
| **M-16** | FKs faltantes: `diagnostics.reporte_document_id → documents(id)`, `water_balances.validado_r3_logbook_id → logbook_entries(id)`, `ivoh_evaluations.r4_logbook_id → logbook_entries(id)`, `quality_parameters.lab_result_id → lab_results(sample_id, param_code)` (o columna compuesta) | Integridad referencial prometida por docs/01 y usada por EF-05/06/07/10 | Evaluar `on delete set null` |
| **M-17** | (F2) `public.badge_assertions (id uuid pk, user_id, attempt_id, jsonld jsonb, issued_at, revoked_at)` + `quiz_questions.activo boolean default true` + trigger `profiles.badge_mdohi` al insertar insignia | Insignia verificable (docs/06 §10) y E2E-10; hoy solo `audit_log.meta` | No bloquea F1 |
| **M-18** | (a) `check_phase_gate`: validar `new.fase_actual > old.fase_actual + 1` ⇒ excepción; (b) transición de `estado` (`reportado`/`archivado`) validada; (c) tabla `milestone_history (diagnostic_id, hito, fecha_original, fecha_nueva, causa, reprogramado_por, ts)` para el semáforo «2+ reprogramaciones» (TD-1 nota) | Defensa en profundidad (TEAM §4) y EF-12 sin histórico de reprogramaciones | ADR (Q-09/Q-11) |
| **M-19** | (P2) `notifications.dedupe_key text` + `unique (user_id, dedupe_key)` | Defensa contra duplicados si falla la idempotencia | Opcional |

### 3.4 Lo que **ya existe** y no debe pedirse

`diagnostics.folio` (secuencia), folios BIT/IIH/foto (triggers), `audit_log` + `trg_audit_hash` (base),
`notifications`, RLS por tenant/membresía, `privacy_requests` + `privacy_folio_seq` (ARCO), triggers
`check_phase_gate`, `trg_ivoh_requires_bhe`, `trg_custody_gate`, `trg_logbook_immutable`,
`trg_ivoh_version_immutable`, vistas de lectura `docs/04` §9 y `v_quiz_questions` con `revoke` de la tabla cruda.

> **Recordatorio de alcance:** el agente 03 **no** escribe `supabase/migrations/**` (TEAM §6, agents/03 §0).
> Estas 19 solicitudes se remiten al `arquitecto-bd` vía Lead; su priorización definitiva la decide el
> Supervisor.

---

## 4. Plan de `_shared/`

### 4.1 Módulos (14), responsabilidad y contrato interno

| Módulo | Responsabilidad | API interna (descripción, sin código) | Depende de | Pruebas | Tarea |
|---|---|---|---|---|---|
| `env.ts` | Leer y validar variables del runtime; fallar rápido (fail-fast) si falta una crítica; nunca loggear valores | `loadEnv()` → objeto tipado: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_DOCS`, `R2_BUCKET_REPORTS`, `NOM151_ENABLED`, `PSC_*` | — | unit: variable ausente ⇒ error de arranque con nombre de variable (sin valor) | F1-01 |
| `http.ts` | Router por método+path relativo; parseo JSON con límite; `X-Request-Id`; preflight `OPTIONS`; métodos no permitidos | `route({POST: handler})`, `readJson(req, schema)`, `requestId` | errors, cors, logger | unit: 405/415, body inválido | F1-01 |
| `cors.ts` | Allowlist de orígenes (Pages staging/prod, `localhost` de desarrollo), headers y `max-age`; exponer `X-Request-Id` | `preflight(req)`, `withCors(res)` | env | unit: origen no permitido ⇒ sin `Access-Control-Allow-Origin` | F1-01 |
| `errors.ts` | Catálogo §8 (17 códigos), `ApiError`, envelope `{error:{code,message,details,ref}}`, mapeo trigger→código (§2.5.2), sanitización | `fail(code, http, details)`, `fromPgError(err)`, `attachRef(hash)` | — | unit: cada código y mapeo; ningún mensaje interno | F1-01 |
| `auth.ts` | Verificar JWT (preferente `auth.getUser` contra el proyecto; alternativa JWKS/HS256), extraer `sub`/tenant/`global_role`, resolver membresía (`M-06`), guardas de rol | `authenticate(req)`, `requireRole(ctx, ['coordinador','equipo'])`, `requireMember(ctx, diagnosticId)`, `resolveDiagRole(ctx, id)` | db, errors, env | unit: token ausente/expirado/sin claim; rol inválido 403; **nunca** rol del body | F1-01 |
| `db.ts` | Conexión Postgres para transacciones reales + cliente REST `service_role` para casos puntuales; `withTx`; reintentos `40001/40P01`; timeouts | `sql` (pooler, `prepare:false`), `withTx(cb)`, `rpc(name,args)`, `serviceClient` | env | integración: rollback total ante fallo intermedio; concurrencia | F1-01 |
| `idempotency.ts` | Claim/replay/409 (§2.6), hash canónico de request, TTL, interacción con auditoría | `claim(ctx, endpoint, key, payload)`, `complete(tx, status, body, ref)`, `replay(row)` | db, errors | unit+integración: API-00 completo | F1-01 |
| `audit.ts` | Escribir auditoría en la **misma** transacción (vía `fn_audit_write`), mapear `action`, devolver `ref`; `request_id` en `meta` | `audit(tx, {action, entity, entityId, meta})` → hash | db, errors | unit: acción obligatoria; rollback ⇒ sin fila; cadena continua | F1-01 |
| `folios.ts` | Leer folios generados por BD y solicitar el folio de reporte (`M-03`); validar formato al devolver; **nunca** componer folios secuenciales en TS | `reportFolio(tx, diagnosticId)`, `readFolio(entityId)`, `assertFormat(folio, tipo)` | db, errors | unit: formato `MDOHI-AAAA-NNN`, `-R1…`; rechazo de folio inyectado por cliente | F1-04 (EF-01) / F1-12 (EF-07) |
| `realtime.ts` | Publicar eventos §7 **después del commit** vía API de Realtime (broadcast privado) o `postgres_changes`; payload mínimo; best-effort con log y notificación de respaldo | `emit(topic, event, payload)`; topics `diagnostic:{uuid}`, `org:{uuid}` | auth/env/logger | integración: RT-01/RT-02 | F1-04 |
| `rate-limit.ts` | Consumir cuota por usuario (`M-15`) y devolver 429 con `Retry-After` | `consume(ctx)`; límite desde env o constante | db, errors | integración: API-04 | F1-04 |
| `validate.ts` | Validadores de body por EF (sin dependencias pesadas), tipos de error `VALIDATION_*` accionables | `parseBody(req, spec)`; esquemas por endpoint | errors | unit: API-02 (campos faltantes/tipos) | F1-01 |
| `logger.ts` | Log estructurado JSON sin PII ni secretos; `request_id`, `idempotency_key`, `endpoint`, `user_id` (seudonimizado si aplica), latencia, código de error | `log.info/warn/error(event, fields)` | env | unit: redacción de claves sensibles | F1-01 |
| `notifications.ts` | Insertar filas `notifications` (en la tx de negocio para atomicidad — decisión `D-02`), mapear `kind` y destinatarios por membresía | `notify(tx, {users, kind, payload})` | db | integración: API-00 exige 1 sola notificación en replay | F1-04 |
| `guards.ts` | Replicar en servidor los gates TD-1/TD-2/TD-3/TD-4/TD-8 como **pre-chequeo** con los mismos mensajes, para responder 409 antes de tocar datos y como defensa en profundidad frente al trigger | `checkChecklistR1(diag)`, `checkCatR2`, `checkIihV1`, `checkBheR3`, `checkIvohR4`, `checkFichaCerrada(diag, clave)`, `checkCompleteness(diag)` | db, errors | integración: PG-01…PG-13 | F1-04/F1-07/F1-12 |
| `tests/` | Pruebas Deno por módulo + helpers de contrato (JWT de fixture, cliente HTTP, fixtures de tenant A/B) | `deno test` | todo | API-00…04 base | F1-01+ |

> Módulos adicionales al listado de `agents/03` §5: `env`, `http`, `validate`, `logger`, `rate-limit`,
> `guards`, `notifications`. Se justifican en §6 (omisiones del README/estructura).

### 4.2 Pipeline obligatorio de cada EF (orden fijo)

1. `env` + `cors` preflight → 2. `auth.authenticate` (401) → 3. `http` + `validate` del body (422) →
4. `rate-limit.consume` (429) → 5. `idempotency.claim` (replay 200 / 409) → 6. resolución de rol y membresía
(403) → 7. `guards` de precondiciones/gate (409) → 8. **`db.withTx`**: mutación de negocio + `audit.audit`
(obligatoria) + `notifications.notify` + `idempotency.complete` → 9. tras commit: `realtime.emit` (best-effort)
→ 10. respuesta con `ref: audit:<hash>` y `X-Request-Id`.

Reglas duras del pipeline: si el paso 8 falla ⇒ rollback total y **sin** evento; si el paso 9 falla ⇒ la
respuesta sigue siendo 200 (el estado persistente ya está en Postgres y hay notificación) pero se registra un
`warn` y se reintenta una vez; ningún paso devuelve 500 por error de negocio.

### 4.3 Estrategia transaccional (decisión pendiente `D-01`, recomendada)

`supabase-js`/PostgREST **no permite** varias sentencias en una transacción. `docs/04` exige «una sola
transacción» (multi-tabla + auditoría) en EF-01/02/03/04/05/06/07/09/10/11/12/13. Alternativas:

| Opción | Descripción | Pros | Contras | Recomendación |
|---|---|---|---|---|
| A. Driver Postgres directo (`postgres.js` sobre `SUPABASE_DB_URL` inyectada por el runtime, pooler, `prepare:false`) | La EF abre `BEGIN`, ejecuta mutaciones + auditoría + idempotencia y `COMMIT` | Transacción real; lógica en la EF (rol del agente 03); un solo sitio para el pipeline | Requiere gestionar pool/conexiones, timeouts y usuarios; cuidado con PgBouncer transaction mode | **Recomendada** |
| B. Un RPC `security definer` por EF (migración del Arquitecto) que haga todo | Transacción trivialmente correcta | Duplica la propiedad de la lógica en BD: choca con TEAM §6 (03 = EF, 02 = esquema) y con el propio contrato de errores/folios | Solo para helpers atómicos (idempotencia, folios, auditoría) | Complementaria |

⇒ `_shared/db.ts` implementa A y usa B solo para primitivas (`fn_audit_write`, `fn_next_folio`, claim de
idempotencia), manteniendo una sola fuente de verdad por regla.

---

## 5. Orden de implementación alineado a `F1-01…F1-12`

### 5.1 Dependencias entre las 13 EF

| EF | Depende funcionalmente de | Bloqueadores propios | Tarea F1 |
|---|---|---|---|
| EF-03 | `_shared` core, `documents` para `document_id` (fixture SQL basta) | `M-01`, `M-02`, `M-07` | F1-06 |
| EF-02 | `_shared` core; plantillas sembradas | `M-01`, `M-02`, `M-10`, `M-09` | F1-11 |
| EF-01 | EF-02 (ficha de respaldo), EF-03 (gate F2); `guards` | `M-01`, `M-02`, `M-05`, `M-07`, `M-18` | F1-04 |
| EF-08 | `_shared` core + R2 | `B-03`, `M-10` (estado de subida) | F1-05 |
| EF-04 | EF-03/EF-02 para el camino completo | `M-01`, `M-02`, `M-11` | F1-07 |
| EF-09 | EF-03/EF-08 (evidencia) para camino completo | `M-13`, límite de payload | F1-08 |
| EF-05 | EF-02 (ficha R3) | `M-04` (imprescindible) | F1-09 |
| EF-06 | EF-05 | `M-14` | F1-10 |
| EF-12 | EF-02 (ficha del hito) | `M-18` | F1-11 |
| EF-07 | EF-06, EF-02 (R5), matriz | `M-03`, `M-08`, `B-03`, decisión PDF | F1-12 |
| EF-10 | — | `M-12`, `M-16` | F2 |
| EF-11 | — | `M-17` (insignia) | F1-14/F2 |
| EF-13 | EF-07 | `NOM151_ENABLED`, `PSC_*`, `M-03` | F3 |

### 5.2 Oleadas recomendadas (orden de trabajo real del agente 03)

| Ola | Contenido | Salida verificable | Tarea |
|---|---|---|---|
| **0** | `_shared` core: `env/http/cors/errors/auth/db/logger/validate` + 401/403 + resolución de rol (`M-06`) + pruebas unitarias y de contrato base | Suite `deno test` verde en CI; `AUTH_INVALID`/`FORBIDDEN_*` probados (SEC-04, API-02) | F1-01 |
| **1** | `idempotency` + `audit` (`M-01`, `M-02`) y su contrato en una EF «pequeña»: **EF-03** | API-00 en verde sobre EF-03; `audit_log` encadenado (SEC-06) | F1-06 |
| **2** | `notifications` + `realtime` (`M-05`) + **EF-02** | LB-01…LB-08, E2E-08 | F1-11 |
| **3** | `guards` + `folios` + `rate-limit` + **EF-01** | PG-01…PG-12, E2E-01 (con paso de cierre R1), RT-01/RT-02, API-04 | F1-04 |
| **4** | `storage/r2` + **EF-08** | PER-03, API-01/02 de EF-08 | F1-05 |
| **5** | **EF-04** | CAT-01…CAT-03, E2E-02 | F1-07 |
| **6** | XLSX + **EF-09** | XLS-01/02 | F1-08 |
| **7** | **EF-05** | BHE-01…BHE-05, E2E-03 | F1-09 |
| **8** | **EF-06** | IVOH-01…IVOH-05, E2E-05 | F1-10 |
| **9** | **EF-12** | PG-12, E2E-11 | F1-11 |
| **10** | PDF + **EF-07** | RPT-01…RPT-04, E2E-06/07 | F1-12 |
| F2/F3 | EF-10, EF-11, EF-13 | CUS-*, AUL-*, RPT-04 | F2-01/F3 |

### 5.3 Las 3 primeras EF recomendadas (y por qué no EF-08 ni EF-07)

1. **EF-03 — `POST /checklist/{item_id}/transition` (F1-06).** Es la EF con menor superficie: una tabla, una
   tabla de decisión cerrada (TD-2), sin folio, sin R2, sin gate con side effects. Permite **endurecer todo
   `_shared`** (auth, errores, idempotencia, auditoría) con riesgo mínimo y desbloquea el gate F2 de EF-01
   (`layout = validado_r1`).
2. **EF-02 — `POST /logbook/{entry_id}/close` (F1-11).** Introduce los casos de negocio «caros» antes de los
   gates: cierre ≤24 h, inmutabilidad + `logbook_change_log`, notificación y evento; su precondición
   (firmas/agenda/evidencia) obliga a fijar `M-10` con el Arquitecto y a decidir `D-02`. Es además el
   **folio de respaldo** que exige TD-1#1 para moverse a fase 2.
3. **EF-01 — `POST /diagnostics/{diagnostic_id}/advance-phase` (F1-04).** La EF vertebral (M2/M11, Kanban):
   ejercita `guards` (TD-1), `folios` (lectura), `realtime`, `rate-limit` y `notifications` en una sola
   operación, y es el escenario `E2E-01`. Se implementa **después** de EF-02/EF-03 porque su precondición
   de ficha cerrada no es satisfacible sin ellas.

**Por qué no empezar por EF-08 (contra `agents/03` §10, que la coloca como segunda entrega):** EF-08 depende
de credenciales R2 que **no existen** en `.env` (`B-03`) y de `M-10` (estado de subida); arrancarla primero
convertiría la primera EF en un bloqueo por infraestructura y dejaría `_shared` sin probar. **Por qué no
EF-07:** requiere `M-03` (folio), `M-08` (matriz) y generar PDF (riesgo `R-10`); es la última del camino,
coherente con `F1-12` (deps `F1-10`, `F1-11`). Si el Lead decide priorizar M3 (documentos) para el E2E del
cliente, EF-08 pasa a ser la primera **en cuanto `B-03` se resuelva**, sin cambiar este plan.

> **Impacto en el tablero:** el orden recomendado ejecuta EF-03 (tarea F1-06) y EF-02 (F1-11) antes de la
> tarea F1-04 (EF-01). Se sugiere al Lead ajustar el orden de las tareas F1-04/F1-06/F1-11 (o declararlas
> en paralelo dentro de la misma ola) sin reescribir sus contenidos.

---

## 6. Revisión de `supabase/functions/README.md` — mejoras y omisiones

Archivo actual: 33 líneas. Conserva la convención y las 6 reglas, pero es **insuficiente como contrato de
implementación**. Propuesta de cambios (el archivo es del agente 03, se actualizará en el PR de `F1-01`):

| # | Severidad | Omisión / riesgo | Propuesta concreta |
|---|---|---|---|
| 1 | **Alta** | `Idempotency-Key` «obligatorio» contradice `docs/04` §2.3 («opcional») | Fijar: obligatorio en operaciones mutantes de negocio; opcional en `presign`; remitir a ADR Q-01 |
| 2 | **Alta** | No menciona `SUPABASE_ACCESS_TOKEN` ni que sin él no hay `secrets set`/`deploy` | Sección «Despliegue» con requisitos: token de acceso, proyecto enlazado, `config.toml`, y advertencia de no imprimir valores |
| 3 | **Alta** | No existe `supabase/config.toml` ⇒ sin política `verify_jwt` por función ni configuración de runtime | Añadir `config.toml` con `[functions.<name>]` y justificar `verify_jwt` (default `true` es aceptable porque la EF verifica el JWT; documentar excepciones) |
| 4 | **Alta** | No existe `deno.json` ni pin de versión de Deno/runtime | Añadir `deno.json` (import map, lint, fmt) y declarar la versión de runtime de EF usada en staging |
| 5 | **Alta** | No indica cómo trabajar **sin Docker** (no hay `functions serve` local) ni que Deno no está instalado | Sección «Desarrollo local»: instalar Deno, `deno check/lint/test`, y que `serve` requiere Docker (no disponible): validar por despliegue a proyecto de desarrollo + suite de contrato HTTP |
| 6 | **Alta** | CI no compila ni prueba `supabase/functions/**` (solo cliente) | Solicitar a DevOps (`F0-07`) job `functions` con `denoland/setup-deno` + `deno lint` + `deno check` + `deno test` |
| 7 | **Media** | No dice que las EF resuelven rol **server-side** ni el problema `auth.uid()` con `service_role` (`M-06`) | Documentar el algoritmo de §2.4 y la prohibición de aceptar rol del cliente |
| 8 | **Media** | Nombres de secretos inconsistentes entre README, `docs/07` §5.1 y `.env.example` | Tabla única canónica: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_DOCS=hidria-docs`, `R2_BUCKET_REPORTS=hidria-reports`, `NOM151_ENABLED`, `PSC_*` |
| 9 | **Media** | No fija el envelope de error ni el `ref: audit:<hash>` | Incluir ejemplo normativo (cita `docs/04` §2.4) y la regla «sin stack traces ni mensajes de Postgres» |
| 10 | **Media** | No menciona `X-Request-Id` ni su correlación con `audit_log` que exige `docs/05` §8.2 | Regla: toda respuesta incluye `X-Request-Id`; se guarda en `audit_log.meta.request_id` |
| 11 | **Media** | No define CORS (orígenes, headers, preflight, `Access-Control-Expose-Headers`) | Documentar allowlist (Pages staging/prod + `http://localhost:*` de desarrollo) y preflight |
| 12 | **Media** | No fija límites de payload ni la estrategia para archivos grandes | Documentar límite del runtime y por qué los bytes van directo a R2 (EF-08) y que el XLSX de EF-09 debe quedar por debajo del límite |
| 13 | **Media** | Rate limit: README no menciona el 429; `docs/04` §8 dice 100/min y `docs/05`/agents 120/min | Fijar tras ADR Q-02 y documentar `Retry-After` |
| 14 | **Media** | No hay sección de observabilidad/redacción de logs | Regla: logs JSON sin PII ni secretos; nunca loggear bodies completos de EF-02/EF-08 |
| 15 | **Media** | `tests/` se cita pero no se detalla su forma (¿unit Deno? ¿contract HTTP contra staging?) | Separar `tests/unit` (Deno) de `tests/contract` (HTTP, requiere entorno) y nombrar la suite API-00…04 |
| 16 | **Baja** | No dice el nivel mínimo de tarea del que depende (F1-01) ni el estado real | Reemplazar «Fase 0: esta carpeta está lista para la primera EF» por «bloqueada hasta `B-01/B-02/B-03`» para no inducir a error |
| 17 | **Baja** | No fija política de dependencias (pdf, xlsx, aws4fetch/postgres) | Regla: dependencias por import map con versión exacta y `deno.lock`, auditadas por Seguridad |
| 18 | **Baja** | No menciona `X-Api-Version` (mecanismo de compatibilidad de `docs/04` §2.2) ni `Retry-After` | Añadir ambos como obligatorios en respuestas/rechazos |

---

## 7. Nota de riesgos

| ID | Riesgo | Prob. | Impacto | Mitigación / dueño | Condición de escalamiento |
|---|---|---|---|---|---|
| **R-01** | **Deno runtime**: no está instalado y no hay Docker ⇒ sin ejecución local de `deno check/test` ni `supabase functions serve` | Alta | Alto (bloquea todo el desarrollo EF) | Instalar Deno (winget) + job Deno en CI (DevOps F0-07). Alternativa: validar solo por despliegue a proyecto dev | Si en 3 intentos no hay runtime ni CI Deno ⇒ PARO §12.1 (dueño F0-07) |
| **R-02** | **`supabase secrets set`**: `.env` no tiene `SUPABASE_ACCESS_TOKEN`; sin token no se configuran secretos ni se despliega | Alta | Alto | DevOps/Arquitecto obtienen token de acceso (cuenta Supabase del Programa) y documentan `supabase link`. **Nunca** imprimir el token | 3 intentos documentados ⇒ PARO §12.1 (F0-01/F0-03) |
| **R-03** | **Credenciales R2**: no existen `R2_*` en `.env` ni en el inventario ⇒ EF-07/08/10 inimplementables y sin pruebas reales de presign | Alta | Alto (bloquea F1-05, F1-12) | DevOps F0-09 crea buckets y entrega credenciales a `.env` + `supabase secrets set`; plantilla `.env.example` debe añadir `R2_ACCOUNT_ID` (falta) | Si F0-09 no cierra antes de la ola 4 ⇒ mover EF-08 al final y reportar a Lead |
| **R-04** | **Idempotencia sin tabla**: `audit_log.meta` no garantiza unicidad concurrente ⇒ efectos dobles (rompe API-00, OFF-04 y el folio `-R1`) | Media | Alto | `M-01` (Arquitecto) + algoritmo §2.6; prueba de concurrencia en pgTAP/contrato | Sin `M-01` no se acepta PR de EF mutante |
| **R-05** | **Rate limit**: 120 (docs/05, agents) vs 100 (docs/04 §8) req/min, sin almacén de estado | Media | Medio | ADR Q-02 + `M-15`; opción interina: WAF Cloudflare por IP (no cumple «por usuario») | Si el ADR no se resuelve, API-04 no es verificable |
| **R-06** | **Brecha/views**: `v_bhe_monthly` oculta balances no validados y `v_bhe_summary` promedia porcentajes (contradice BHE-05) ⇒ EF-05 no puede cumplir TD-3/BHE-05 | Alta | Alto (gate metodológico) | `M-04` + ADR Q-04/Q-05; pgTAP BHE-05 con caso ponderado | Si el Arquitecto no migra RPC ⇒ EF-05 duplicaría cálculo (prohibido por TEAM §2) |
| **R-07** | **Matriz 10/10 con tres definiciones** (TD-4 docs/04 ≠ seed ≠ vista ≠ arquitectura) | Alta | Alto (gate de emisión del reporte) | ADR Q-03; `M-08`; EF-07 implementa la vista/seed con `completeness_items` y `docs/04` se corrige | Sin ADR, RPT-01/RPT-02 son ambiguos ⇒ no se cierra F1-12 |
| **R-08** | **Claims `tenant_id` vs `organization_id`**: hook de F0-10 puede emitir uno y romper RLS o la validación de EF | Media | Alto (transversal) | `M-07`: emitir `tenant_id` (RLS) y alias; `_shared/auth` acepta ambos (Q-06) | SEC-04 fallando ⇒ PARO técnico de F1-01 |
| **R-09** | **Realtime**: sin publicación ni políticas `realtime.messages`, los eventos §7 no se pueden emitir sin canales públicos (fuga) | Media | Medio | `M-05`; ADR Q-19 (broadcast vs `postgres_changes`); RT-02 como prueba de seguridad | Si no hay canales privados ⇒ eventos solo vía notifications (degradación documentada) |
| **R-10** | **PDF de EF-07**: generación/maquetación dentro de EF (memoria/tiempo), sin plantilla institucional en el repo | Media | Alto | Decisión D-05 (plantilla mínima versionada HTML→PDF o librería) + prueba PER con 25 MB; evaluar generación asíncrona | Si el PDF excede límites del runtime ⇒ re-diseño con ADR (no “compensar” el gate) |
| **R-11** | **Auditoría concurrente**: `trg_audit_hash` sin lock ⇒ cadena bifurcada; los `action` permitidos no cubren rechazos | Media | Alto (SEC-06, evidencia legal) | `M-02` (advisory lock + unique prev_hash + enum) | Si SEC-06 falla en staging ⇒ incidente y bloqueo de release |
| **R-12** | **Folios IIH/BIT/foto** por `count(*)+1`: colisión 23505 bajo concurrencia (EF-09 importa en bloque) | Media | Medio | `M-13` (contadores atómicos) y manejo canónico de 23505 en `_shared/errors` | Si aparece 23505 en staging ⇒ tarea `fix/` P0 |
| **R-13** | **Idempotencia y PII**: reutilizar cuerpos de respuesta durante 7 días almacena datos del expediente `restringido_nda` | Media | Medio (privacidad) | Retención corta + revisión de Seguridad (`docs/06` §10); no guardar cuerpos con PII más allá del mínimo | Veto de Seguridad si no hay política de retención |
| **R-14** | **Payload XLSX/PDF vs límite del runtime de EF** (100 MB en contrato de documentos; el límite de EF es menor) | Media | Medio | EF-08 nunca transporta bytes (R2 directo); EF-09 valida tamaño y devuelve 422 accionable | Si la plantilla oficial excede el límite ⇒ ADR de troceado |
| **R-15** | **EF-13**: flag `NOM151_ENABLED` y `PSC_*` ausentes; 501 debe ser idempotente y auditable | Baja (F3) | Medio | DevOps/Arquitecto configuran flag en `false` y secretos vacíos; EF-13 valida flag **antes** de cualquier efecto | F3 |
| **R-16** | **Dependencias Deno** (`pdf`, `xlsx`, `postgres`, `aws4fetch`): versiones no fijadas, supply chain | Media | Medio | Import map con versión exacta; revisión de Seguridad por dependencia; `deno.lock` | Veto de Seguridad |

---

## 8. Checklist de implementación

### 8.1 Habilitadores (antes de la primera línea de EF)

- [ ] `B-01` Deno instalado localmente + job Deno (`lint`, `check`, `test`) en CI — dueño DevOps/03
- [ ] `B-02` `SUPABASE_ACCESS_TOKEN` disponible para `supabase secrets set`/`functions deploy` (sin exponerlo) — DevOps F0-01/F0-03
- [ ] `B-03` Credenciales R2 (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) en `.env` y en secrets de EF; buckets `hidria-docs`/`hidria-reports` creados — DevOps F0-09
- [ ] `B-04` `supabase/config.toml` + `deno.json` + política `verify_jwt` por función + pin de runtime — 03
- [ ] `M-01` tabla de idempotencia aplicada + pgTAP — Arquitecto
- [ ] `M-02` `fn_audit_write` con lock + enum `action` + índice de cadena — Arquitecto
- [ ] `M-03` folio de reporte y revisión (`-R1`, `-R2`) — Arquitecto
- [ ] `M-04` RPC de cálculo BHE pre-R3 con brecha anual ponderada — Arquitecto
- [ ] `M-05` publicación Realtime + políticas de topics privados — Arquitecto
- [ ] `M-06` RPC de rol/membresía para `service_role` — Arquitecto
- [ ] `M-07` fix default `profiles.global_role` + claim del hook (F0-10) — Arquitecto
- [ ] `M-08` `fn_completeness` + alineación TD-4 (ADR Q-03) — Arquitecto + Revisor
- [ ] ADR Q-01 (idempotencia obligatoria), Q-02 (120 vs 100), Q-03 (matriz), Q-04/Q-05 (brecha/views) **aceptados**
- [ ] Decisión D-01 (driver Postgres directo) aprobada por Supervisor + Revisor
- [ ] `_shared/env.ts` con el inventario canónico de variables (§6 #8) y `.env.example` actualizado (sin valores)

### 8.2 DoD común por EF (todas)

- [ ] Contrato de `docs/04` campo por campo (request/response/errores), sin campos extra ni faltantes
- [ ] `Idempotency-Key` probado: mismo payload ⇒ mismo cuerpo 200 sin duplicar `audit_log`/`notifications`; payload distinto ⇒ 409 `CONFLICT_STATE`
- [ ] `audit_log` escrito **en la misma transacción** con `fn_audit_write`; `ref: audit:<hash>` en éxito y en error de negocio
- [ ] Gate replicado en `guards` **y** verificado que el trigger sigue actuando ante un bypass (prueba SQL directa)
- [ ] Folio: nunca compuesto en TS; probado que un `folio` enviado por el cliente se ignora
- [ ] Errores canónicos exactos, `details` útiles, sin stack traces ni mensajes de Postgres
- [ ] `X-Request-Id` devuelto y persistido en `audit_log.meta.request_id`
- [ ] CORS correcto; `OPTIONS` responde 204; origen no permitido rechazado
- [ ] Pruebas Deno unitarias + casos API-00…04 documentados en `qa/trazabilidad.md`
- [ ] Evidencia en `reports/F1/` con conclusión VERDE y PR aprobado por Revisor + Seguridad

### 8.3 Checklist específico por EF (primera ola)

**EF-03 (F1-06)**
- [ ] TD-2 completo: 6 filas (incluye `FORBIDDEN_ROLE` fila 5 y `CONFLICT_STATE` fila 6)
- [ ] `validado_r1` terminal (doble intento ⇒ 409, sin auditoría duplicada)
- [ ] `document_id` obligatorio para `empresa → recibido` (422 accionable si falta)
- [ ] Notificación solo si hay nota (`recibido`/`revisado`) y solo a `empresa`
- [ ] Evento `checklist_updated` con `{item_code, estado}` tras commit
- [ ] DOC-01…DOC-06 verdes

**EF-02 (F1-11)**
- [ ] TD-8: normal / tardío con razón / tardío sin razón (422 `VALIDATION_RAZON`)
- [ ] Firmas de asistentes requeridos, agenda completa y evidencia obligatoria (422 respectivos)
- [ ] `version+1` y `logbook_change_log` con snapshot previo en la misma transacción
- [ ] Ficha ya cerrada ⇒ `CONFLICT_STATE` (no se intenta `UPDATE` para no chocar con el trigger)
- [ ] Evento `logbook_closed` + notificación a empresa en fichas V/R de validación
- [ ] LB-01…LB-08 y E2E-08 verdes

**EF-01 (F1-04)**
- [ ] TD-1 filas 1–5 con gate + ficha de respaldo; fila 8 salto ⇒ `CONFLICT_PHASE` sin llegar al trigger
- [ ] Mensajes del trigger mapeados a `GATE_*` (§2.5.2) y probados (PG-02/04/06/08/10/11)
- [ ] `avance_pct = fase*100/6`, `proximo_hito` actualizado, `estado` respetado (`activo`)
- [ ] `audit_log(action='move_phase')`; notificación `kind='hito'`; evento `phase_changed`
- [ ] 429 por límite de tasa (API-04) y `Retry-After`
- [ ] PG-01…PG-13 y E2E-01 (con paso explícito de cierre de ficha R1) verdes

### 8.4 Trazabilidad EF → casos de `docs/05`

| EF | Casos |
|---|---|
| EF-01 | PG-01…PG-13, API-00/01/02/04, E2E-01, RT-01/RT-02 |
| EF-02 | LB-01…LB-08, API-00/01/02, E2E-08 |
| EF-03 | DOC-01…DOC-06, API-00/01/02 |
| EF-04 | CAT-01…CAT-03, API-01/02, E2E-02 |
| EF-05 | BHE-01…BHE-05, API-00/01/02/03, E2E-03 |
| EF-06 | IVOH-01…IVOH-05, API-01/02, E2E-05 |
| EF-07 | RPT-01…RPT-04, API-00/01/02/03, E2E-06/07 |
| EF-08 | API-01/02, PER-03 |
| EF-09 | XLS-01/02, API-01/02 |
| EF-10 | CUS-01…CUS-04, API-01/02/03, E2E-04 |
| EF-11 | AUL-01…AUL-03, SEC-05, E2E-10 |
| EF-12 | PG-12, E2E-11 |
| EF-13 | RPT-04, API-01/02 |

---

## 9. Preguntas y ADR propuestos para el `revisor-especificaciones`

> Formato: contradicción exacta → propuesta. Ninguna se resuelve por conveniencia de entrega (TEAM §4).

| ID | Contradicción documental | Propuesta (ADR) |
|---|---|---|
| **Q-01** | `Idempotency-Key` **obligatorio** (agents/03 §4.1, README) vs **opcional** (docs/04 §2.3 L76) | Obligatorio en operaciones mutantes de negocio (EF-01…EF-12 y EF-13); opcional solo en `presign` (no muta). Actualizar docs/04 §2.3 |
| **Q-02** | Rate limit **120 req/min** (docs/05 API-04, agents/03 §4.9) vs **100 req/min** (docs/04 §8 L469) | Adoptar 120/min (docs/05 es gate de release) y corregir docs/04 §8 |
| **Q-03** | **Matriz 10/10**: docs/04 TD-4 (L355–366: acuerdos y plan de acción) ≠ `completeness_items` seed (L196–207: custodia, lab, fotos) ≠ `v_diagnostic_completeness` (DDL L725–746, coincide con seed) ≠ arquitectura §5.9 L243–254 (coincide con seed) | Adoptar seed+DDL+arquitectura (7 de 10 idénticos; 2 renglones de TD-4 no existen en ningún otro documento); corregir docs/04 TD-4 y añadir `reporte_emitible` a la vista (`M-08`) |
| **Q-03b** | `docs/05` PG-02 cita el mensaje del gate F2 con minúscula inicial; el DDL lo emite con mayúscula | pgTAP compara el texto exacto del DDL; corregir el texto citado en docs/05 |
| **Q-04** | Brecha anual: `v_bhe_summary.brecha_pct_promedio = avg(brecha_pct)` (DDL L673) vs BHE-05 «ponderada por volumen (no promedio simple)» (docs/05 L116) y `EF-05` devuelve `brecha_anual_pct` | Migrar a brecha anual ponderada: `100*sum(brecha_m3)/sum(entradas_m3)` (`M-04`); conservar el promedio como campo aparte si la UI lo necesita |
| **Q-05** | EF-05 pre-valida un balance `en_captura`, pero `v_bhe_monthly` solo expone `validado_r3` (DDL L660); BHE-05 consulta la vista «con flujos cargados» sin exigir estado | RPC `fn_bhe_monthly`/`fn_bhe_summary` por `balance_id` sin filtro de estado (`M-04`); las vistas siguen siendo el modelo de lectura oficial post-R3 |
| **Q-06** | Claims: `tenant_id` (DDL L946, docs/01 §1) vs `organization_id` (docs/04 §2.1 L64) | El hook (F0-10) emite `tenant_id` **y** `organization_id` (alias); `_shared/auth` acepta ambos con precedencia a `tenant_id` |
| **Q-07** | Vigencia de URL prefirmada: `≤ 5 min` subida (docs/01 §1 L18) vs `expira_en_seg: 900` (docs/04 EF-08) vs descarga 15 min (docs/04 L242, docs/06 §8.2) | Unificar **15 min** para subida y descarga (900 s) y corregir docs/01 §1; si Seguridad exige 5 min, cambiar el contrato de EF-08 |
| **Q-08** | Contrato de `docs/04` EF-08 `register` no especifica campos ni el origen del `sha256`; verificar 100 MB en la EF es inviable | Definir body de `register` (document_id, diagnostic_id, company_id?, title, doc_type, r2_key, sha256, mime, size_bytes, exposure_level) y que el `sha256` lo calcula el cliente y la EF lo contrasta con metadatos/HEAD de R2; ADR + actualización de docs/04 |
| **Q-09** | TD-1#6 propone «fase 6 ⇒ estado `reportado`» pero `advance-phase` exige `to_phase = fase_actual+1 ≤ 6` | Eliminar la fila 6 de TD-1 (la emisión la hace EF-07); si se conserva, definir una transición explícita `estado` distinta de `advance-phase` |
| **Q-10** | EF-02 exige firmas de «asistentes requeridos» y evidencia obligatoria, pero `logbook_templates.asistentes_requeridos` y `evidence_items` son texto libre (DDL L483–485; seed L212–259) | Normalizar a `jsonb` con códigos/roles (`M-10`); mientras no se migre, ADR que fije la regla de matching (por número y palabras clave de rol) |
| **Q-11** | EF-12 «insertar hallazgo en la ficha del hito vinculado»: puede haber N fichas con la misma `clave` o ninguna; no hay tabla de hitos ni histórico de reprogramaciones | `M-18` (tabla `milestone_history` + `diagnostics.proximo_hito` estructurado); EF-12 inserta el hallazgo en la ficha **abierta** de la clave o falla 422 accionable si no existe |
| **Q-12** | EF-09 no define qué versión de `water_balances` crear si ya existe una `validado_r3` (`unique (diagnostic_id, version)`) | Regla: si existe balance validado, la importación crea `version+1` en `en_captura` y no toca el validado; documentarlo en docs/04 EF-09 |
| **Q-13** | docs/01 §6.5 promete corrección de fichas cerradas «vía `logbook_change_log` que crea nueva versión», pero `trg_logbook_immutable` bloquea todo `UPDATE` sin excepción (DDL L810–823) y LB-07 exige bloquear también las hijas | `M-09`: bloquear hijas + `fn_logbook_amend` como único camino sancionado; actualizar docs/01 §6.5 |
| **Q-14** | E2E-01 (docs/05 L251) avanza a fase 2 sin cerrar la ficha `BIT-R1`, pero TD-1#1 exige ficha R1 cerrada como respaldo | Añadir el paso «cerrar ficha R1» a E2E-01 (EF-02) o retirar el requisito de ficha en TD-1#1; recomendado lo primero (TD-1 es gate metodológico) |
| **Q-15** | TD-2#3 exige «ficha R1 abierta o cerrada **de la misma semana**» sin definir semana (¿del diagnóstico, calendario, o `logbook_templates.semana`?) | Definir contra `logbook_entries.fecha` y `logbook_templates.semana` del diagnóstico |
| **Q-16** | EF-04 exige «preguntas obligatorias» y «condición aplicable», pero `cat_items` no tiene `obligatoria` y `condicion` no tiene semántica documentada (DDL L206–219) | `M-11` + ADR con el formato de `condicion` (`depends_on`, `contains`, `equals`) |
| **Q-17** | Tras `validate-r4`, `ivoh_evaluations` admite `UPDATE` (solo el índice es inmutable); el trigger `trg_ivoh_requires_bhe` no impide rebajar un factor validado | Definir si el R4 es congelante para los 6 factores (trigger adicional) o si las correcciones van por nueva versión del índice |
| **Q-18** | EF-11: `quiz_questions` sin `activo` (¿cuáles son «las activas»?), «opciones barajadas» (agents/03 §3) no figura en docs/04 y rompe el índice `opcion 0..3`; `profiles.badge_mdohi=true` (E2E-10) no está en el contrato | `M-17` + contrato EF-11 con `pregunta_id`, orden de opciones por intento (persistido en `quiz_attempts.answers`) y actualización explícita de `badge_mdohi` |
| **Q-19** | `docs/04` §7 exige eventos por canal `diagnostic:{id}` pero no define el mecanismo (¿Broadcast del servidor o `postgres_changes`?) ni la autorización de canal; RT-02 exige rechazo por RLS | Decidir: Broadcast privado desde EF + políticas sobre `realtime.messages` (`M-05`) — recomendado; alternativa: `postgres_changes` sobre `diagnostics` y derivar payload en el cliente, con pérdida de payload exacto §7 |

---

## 10. Decisiones técnicas propuestas (no documentales; requieren visto bueno del Lead)

| ID | Decisión | Justificación |
|---|---|---|
| **D-01** | Acceso a Postgres por driver directo (`supabase_db_url`) con `withTx`; RPC solo para primitivas | Es la única forma de cumplir «una sola transacción» con multi-tabla + auditoría (§4.3) |
| **D-02** | `notifications` se insertan **dentro** de la transacción de negocio; `realtime` se emite **después** del commit (best-effort) | Atomicidad de la notificación y API-00 («1 notificación»); el evento es solo señal de relectura |
| **D-03** | Idempotencia en tabla propia (`M-01`), no en `audit_log.meta` | Unicidad concurrente y replay barato; `audit_log` queda forense |
| **D-04** | Los rechazos de negocio también escriben `audit_log` (`action='reject'`) y devuelven `ref` | `docs/04` §2.4 lo exige; habilita `AUDIT` de intentos y el `ref` en errores |
| **D-05** | PDF de EF-07 con plantilla mínima versionada (11 bloques + anexos A–F, arquitectura §5.9) renderizada por librería Deno, con hash y matriz snapshot persistida | No hay plantilla institucional en el repo; permite emitir “esencial” en F1 y versionar la maquetación en F3 |
| **D-06** | Dependencias Deno por import map con versión exacta y `deno.lock` | Reproducibilidad y control de supply chain (`R-16`) |

---

## 11. Evidencia, pendientes y siguiente paso

### 11.1 Evidencia de este round

- Lectura completa de `docs/04` (490 líneas), `docs/01` (326), `docs/02` (1207), `docs/05` §2–§5, `docs/07` §4–§5/§9, `docs/06` §5/§8–§12, arquitectura §5.9–§5.10, seed §5–§7, addendum de privacidad.
- Verificaciones de entorno: Supabase CLI `3.0.0` (vía `npx`), **Deno ausente**, `config.toml` ausente, `.env` sin `SUPABASE_ACCESS_TOKEN`/`R2_*`/`PSC_*`/`NOM151_ENABLED` (solo nombres de variables; **ningún valor leído ni transcrito**).
- `grep` negativo de idempotencia / publicación Realtime / rate limit / `documents.folio` / `cat_items.obligatoria` en DDL y migraciones ⇒ sustenta `M-01`, `M-05`, `M-12`, `M-15`, `M-11`.
- **No se creó** ningún archivo de código, migración ni configuración; **no** se ejecutaron comandos Git de escritura; **no** se aplicó DDL ni se consultaron datos del proyecto.
- Único archivo escrito por este agente en el round: este reporte.

### 11.2 Pendientes (en orden)

1. **Lead** decide el orden de las tareas F1-04/F1-06/F1-11 (§5.3) y traslada `M-01…M-19` al `arquitecto-bd` con prioridad P0/P1.
2. **Arquitecto BD** agenda `M-01`, `M-02`, `M-03`, `M-04` (+ `M-07` para fixtures de F1-01) como primera migración correctiva con pgTAP; `M-05`, `M-06`, `M-08` en la siguiente.
3. **DevOps** resuelve `B-01` (Deno/CI), `B-02` (access token) y `B-03` (R2) y actualiza `.env.example`/README de secretos.
4. **Revisor** abre ADR Q-01, Q-02, Q-03, Q-04/Q-05, Q-06, Q-07, Q-09, Q-14 (los que bloquean contratos) antes de la primera EF.
5. **QA** añade el paso «cerrar ficha R1» a E2E-01 y prepara el esqueleto de la suite API-00…04.
6. **Agente 03**, al cerrar los habilitadores: actualizar `supabase/functions/README.md` con §6 (en el PR de `F1-01`) e implementar la ola 0 (`_shared` core).

### 11.3 Riesgo residual declarado

Sin `M-01…M-04` y sin `B-01/B-02/B-03`, cualquier EF que se implemente incumpliría el DoD de agents/03 §6
(idempotencia, auditoría transaccional, folio server-side, errores canónicos verificables). La recomendación
formal es **no abrir PR de EF** hasta que esos siete elementos estén cerrados; el contrato ya está listo.

---

*Fin del reporte — `dev-edge-functions` (agente 03) · `task-7` · F1 readiness, sin cambios de código.*
