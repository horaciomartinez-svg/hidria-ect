# Matriz de trazabilidad — reglas metodológicas → casos de prueba

> Viva. La mantiene `qa-tester`. Fuente: `docs/04` (reglas/TD), `docs/05` (casos),
> `docs/06` (privacidad) y `docs/08` (aula). Sin evidencia de ejecución no hay verde.
> Estado: `pendiente` · `en_progreso` · `verde` · `rojo`.
>
> **Fase 0 (2026-11-07):** no existe producto que probar — no hay Edge Functions, no hay
> suites pgTAP, `app/` es un scaffold (landing M1–M13 sin auth/router/PWA) y no hay
> staging. Por eso **todas las reglas de producto están en `pendiente`** y la columna
> Evidencia queda vacía; no se inventan resultados. Lo único ejecutado y verde en F0 es la
> CI mínima y las guardas de repositorio (ver «Evidencia de Fase 0» y
> `reports/F0/F0-07_qa_ci.md`).

| # | Regla / contrato | Documento | Casos de prueba | Estado | Evidencia |
|---|---|---|---|---|---|
| R-01 | Gates de fase F2–F6 (`check_phase_gate`; bloquea checklist R1, CAT R2, IIH V1, BHE R3, IVOH R4) | docs/04 TD-1, §1.2, EF-01; docs/05 §2, §3.1 | PG-01…PG-13; E2E-01; E2E-03; API-01 | pendiente | — |
| R-02 | Transiciones de la lista de cotejo por rol y estado (TD-2) | docs/04 TD-2, EF-03; docs/05 §3.7 | DOC-01…DOC-06; E2E-09 | pendiente | — |
| R-03 | CAT de 47 preguntas; envío/validación R2 y gate F3 | docs/04 EF-04; docs/05 §3.6 | CAT-01…CAT-03; E2E-02 | pendiente | — |
| R-04 | Brecha BHE mensual > 10 % bloquea la validación R3; vistas `v_bhe_monthly`/`v_bhe_summary` | docs/04 TD-3, EF-05; docs/05 §3.2 | PG-07, PG-08; BHE-01…BHE-05; E2E-03 | pendiente | — |
| R-05 | IVOH requiere un BHE validado en R3 (`trg_ivoh_requires_bhe`) | docs/04 TD-6, §1.2; docs/05 §3.3 | IVOH-02 | pendiente | — |
| R-06 | Fórmula IVOH `0.15F1+0.20F2+0.20F3+0.20F4+0.15F5+0.10F6` y semáforo <5 / 5–7.9 / ≥8 | docs/04 EF-06, TD-6; docs/05 §3.3 | IVOH-01, IVOH-03, IVOH-04; E2E-05 | pendiente | — |
| R-07 | Reporte solo con matriz de completitud 10/10 (incluye 501 de EF-13 en fases 1–2) | docs/04 TD-4, EF-07; docs/05 §4.1 | RPT-01…RPT-04; E2E-06, E2E-07 | pendiente | — |
| R-08 | Folio del Reporte `{folio_diagnostico}-R1` y versión inmutable | docs/04 EF-07, §2.5; docs/05 §4.1 | RPT-02; API-01 | pendiente | — |
| R-09 | Dictamen de laboratorio solo con 3 transferencias de custodia firmadas | docs/04 TD-5, EF-10; docs/05 §3.4 | CUS-01…CUS-04; E2E-04 | pendiente | — |
| R-10 | Cierre de bitácora ≤ 24 h; cierre tardío con `cerrada_razon`; ficha cerrada inmutable y versionada | docs/04 TD-8, EF-02; docs/05 §3.5 | LB-01…LB-08; E2E-08 | pendiente | — |
| R-11 | Reprogramación de hito dentro de las 6 semanas con semáforo de atraso | docs/04 TD-1 (nota), EF-12; docs/05 §3.1 | PG-12; E2E-11 | pendiente | — |
| R-12 | Folios solo del lado servidor (diagnóstico, BIT-Vx, IIH USO, fotos, `-R1`, ARCO) | docs/04 §2.5, §1.2; docs/05 §3.5 | LB-06, LB-08, RPT-02; API-01 | pendiente | — (`UNIT-*` citado por docs/05 §1.3 sin casos definidos: ver H-1) |
| R-13 | Idempotencia con `Idempotency-Key`: misma clave+mismo payload → mismo cuerpo sin duplicar efectos | docs/04 §2.3; docs/05 §4.3 | API-00; OFF-04 | pendiente | — |
| R-14 | Los gates no se encolan offline; botón deshabilitado y cero llamadas a EF | docs/04 §6 (regla 4); docs/05 §4.4 | OFF-01 | pendiente | — |
| R-15 | Merge LWW por campo y conflicto visible en UI (nunca pisar en silencio) | docs/04 §6 (regla 3); docs/05 §4.4 | OFF-03 | pendiente | — |
| R-16 | RLS multi-tenant (`is_tenant_member`) y por membresía/rol de diagnóstico (`my_diagnostic_role`) | docs/01 §RLS; docs/04 §1.1; docs/05 §4.2 | SEC-01, SEC-02, SEC-03; DOC-06; E2E-09 | pendiente | — |
| R-17 | JWT con custom claims `organization_id`/`global_role`; sin claim → 401 `AUTH_INVALID` | docs/04 §2.1; docs/07 §3 (paso 0.5); docs/05 §4.2 | SEC-04 | pendiente | — |
| R-18 | `quiz_questions` denegada a `authenticated`; `v_quiz_questions` sin `correcta`/retroalimentación | docs/04 §9, TD-7; docs/05 §4.2 | SEC-05; AUL-01 | pendiente | — |
| R-19 | `audit_log` append-only con hash encadenado `prev_hash→hash` | docs/01; docs/04 §2.6; docs/05 §4.2 | SEC-06 | pendiente | — |
| R-20 | Aviso de privacidad y ARCO verbatim; buzón ARCO con folio `ARCO-AAAA-NNNN` y plazos | docs/06 §5, §12; docs/05 no incluye PRIV | PRIV-01…PRIV-04 | pendiente | — (casos definidos solo en docs/06 §12: ver H-2) |
| R-21 | Aula: calificación server-side, ≥ 80 %, insignia Open Badges 3.0 | docs/08; docs/04 TD-7, EF-11; docs/05 §4.7 | AUL-01…AUL-03; E2E-10 | pendiente | — |
| R-22 | Realtime por canal `diagnostic:{id}`/`org:{org}` con RLS de suscripción | docs/04 §7; docs/05 §4.5 | RT-01, RT-02 | pendiente | — |
| R-23 | Gate F4: todos los activos IIH con `verificado_v1=true` | docs/04 TD-1#3; docs/05 §3.1 | PG-05, PG-06 | pendiente | — |
| R-24 | Sin saltos de fase y rol de diagnóstico requerido | docs/04 TD-1#7/#8; docs/05 §3.1 | PG-10, PG-11 | pendiente | — |
| R-25 | Pesos y rúbricas del IVOH inmutables en la versión vigente | docs/04 TD-6, `trg_ivoh_version_immutable`; docs/05 §3.3 | IVOH-05 | pendiente | — |
| R-26 | Importador XLSX con estructura oficial; la importación no valida R3 | docs/04 EF-09; docs/05 §4.6 | XLS-01, XLS-02 | pendiente | — |
| R-27 | Contrato API por EF: happy, rol inválido (403), precondición rota (409/422) y límite de tasa (429) | docs/04 §4, §8; docs/05 §4.3 | API-01…API-04 | pendiente | — |
| R-28 | Rendimiento y límites (Kanban, vistas, presign R2, concurrencia) | docs/05 §4.8 | PER-01…PER-04 | pendiente | — |
| R-29 | Criterios de aceptación del piloto | docs/05 §9; arquitectura §11 | CAP-01…CAP-04; E2E-12 | pendiente | — |
| R-30 | Payload de los eventos Realtime del §7 (9 eventos) | docs/04 §7; docs/05 §4.5 | RT-01 (parcial, solo entrega/refresco); sin IDs por evento | pendiente | — (hueco de plan: no hay casos por payload: ver H-7) |
| R-31 | Cola offline FIFO con `Idempotency-Key = client_op_id` y sellos `captured_at` preservados | docs/04 §6 (reglas 1–2); docs/05 §4.4 | OFF-02 | pendiente | — |
| R-32 | Unitarias de cálculo (IVOH, brecha), parsers XLSX, LWW y validaciones (Vitest) | docs/05 §1.3; agente 05 §3 | `UNIT-*` (sin IDs ni casos en docs/05) | pendiente | — (hueco de plan: ver H-1) |

## Estado de ejecución por suite en Fase 0

Ninguna suite de producto es ejecutable: no hay implementación. Recuento de casos
**definidos** (solo definición, no ejecución):

| Suite / nivel | Casos definidos | Ejecutables en F0 | Bloqueo |
|---|---|---|---|
| pgTAP: PG / BHE / IVOH / CUS / LB / CAT / DOC / SEC | 50 | 0 | `supabase/tests/` solo tiene README; no hay runner pgTAP ni servicio Postgres en CI. Los triggers/RLS existen en el DDL, pero no hay casos SQL. |
| Reporte (RPT) | 4 | 0 | Sin EF-07, sin generación de PDF, sin R2. |
| Contrato API (API-00…API-04) | 5 | 0 | `supabase/functions/` solo tiene README; no hay EF desplegadas ni staging. |
| Unitarias cliente (`UNIT-*`) | 0 definidos | 0 | docs/05 cita Vitest pero no define casos; `app/` no tiene lógica de negocio. |
| E2E (E2E-01…E2E-12) | 12 | 0 | Sin auth, router, datos, UI funcional ni staging. |
| Offline (OFF-01…OFF-04) | 4 | 0 | Sin PWA/service worker/Dexie y sin EF. |
| Realtime (RT-01/02) | 2 | 0 | Sin canales ni cliente Supabase. |
| Importador XLSX (XLS-01/02) | 2 | 0 | Sin EF-09 ni UI de importación. |
| Aula (AUL-01…AUL-03) | 3 | 0 | Sin banco de preguntas expuesto ni EF-11. |
| Rendimiento (PER-01…PER-04) | 4 | 0 | Sin staging ni dataset sintético (30 empresas / 60 diagnósticos). |
| Privacidad (PRIV-01…PRIV-04) | 4 (docs/06) | 0 | Addendum ARCO aplicado en BD, pero sin buzón en cliente ni pruebas. |
| Piloto (CAP-01…CAP-04) | 4 | 0 | Requiere entorno `piloto` y 3 diagnósticos reales. |

**Total:** 90 casos definidos en `docs/05` + 4 de `docs/06` (`PRIV`) = **94 definidos, 0
ejecutables en F0**. La cobertura de la matriz es de *definición* (regla → caso); no de
*ejecución*.

## Huecos de plan detectados (para el revisor de especificaciones; QA no inventa IDs)

- **H-1.** `docs/05` §1.3 y el rol de QA (§3) citan pruebas `UNIT-*` (Vitest) pero el
  documento no define sus IDs ni casos. R-12 y R-32 quedan sin casos unitarios concretos.
- **H-2.** `PRIV-01…PRIV-04` se definen en `docs/06` §12 («agregar al plan de pruebas»)
  pero `docs/05` §2 no los incorpora; el plan de pruebas debe incluirlos.
- **H-3.** Límite de tasa contradictorio: `docs/04` §8 dice `RATE_LIMIT` a 100 req/min
  (MVP) y `docs/05` API-04 dice 120 req/min desde un usuario. Debe unificarse antes de
  API-04.
- **H-4.** `docs/05` API-00 exige `409 CONFLICT_STATE` cuando llega la misma
  `Idempotency-Key` con **distinto** payload; `docs/04` §2.3 no define ese caso. Contrato
  incompleto.
- **H-5.** `docs/05` §2 cita «RPT-01…RPT-03», pero §4.1 define RPT-04; la matriz
  referencia RPT-01…RPT-04.
- **H-6.** `docs/05` §8 (punto 1) exige pgTAP y contrato en cada push; la CI de F0 solo
  ejecuta guardas + lint/typecheck/build. Se planifica en F1 (no es defecto de F0).
- **H-7.** No hay casos por evento Realtime del §7 (solo RT-01/02 de entrega y
  aislamiento); los 9 payloads no tienen verificación dedicada.

## Evidencia de Fase 0 (no son casos de `docs/05`)

| Verificación F0 | Evidencia |
|---|---|
| CI mínima en verde (guardas + lint/typecheck/build) en PR #2 | `reports/F0/F0-07_qa_ci.md`; checks 128564175440 y 128564175630; run [42425963485](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42425963485) |
| `docs/02` byte-idéntico a la migración base | SHA-256 `2A7B6F8888040990B109F580F6BE50F7F03BF7D9FF7B2299D7BD50BC85442CB5` (local) + job «Guardas de repositorio» |
| Estructura monorepo y scaffold compilable | `reports/qa/PR-2_qa.md`; `npm run lint/typecheck/build` exit 0 |

## Reglas de actualización

- Al implementar una regla, QA agrega los casos y cambia el estado con evidencia ejecutada
  (comando, salida, entorno, fecha). Sin ejecución no hay verde.
- Un `rojo` bloquea el merge/release de la fase (gate de `docs/05`).
- Toda regla nueva de `docs/04`/`docs/06` debe aparecer aquí antes de cerrar el PR que la
  introduce.
- Los huecos H-1…H-7 se escalan al revisor de especificaciones; QA no crea casos que los
  documentos no definen ni marca resultados no ejecutados.
