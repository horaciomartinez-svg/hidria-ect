# Matriz de trazabilidad — reglas metodológicas → casos de prueba

> Viva. La mantiene `qa-tester`. Fuente: `docs/04` (reglas/TD) y `docs/05` (casos).
> Estado: `pendiente` · `en_progreso` · `verde` · `rojo`.

| # | Regla / contrato | Documento | Casos de prueba | Estado | Evidencia |
|---|---|---|---|---|---|
| R-01 | Gate de fase S1–S6 (`check_phase_gate`) | docs/04 TD-1, EF-01 | PG-01…, E2E-01, API-01 | pendiente | — |
| R-02 | Checklist documental (4 estados) | docs/04 TD-2, EF-03 | DOC-01…, E2E-01 | pendiente | — |
| R-03 | CAT 47 preguntas, gate F3 | docs/04 EF-04 | CAT-01…, E2E-02 | pendiente | — |
| R-04 | Brecha BHE > 10 % bloquea R3 | docs/04 TD-3, EF-05 | BHE-01…, E2E-03 | pendiente | — |
| R-05 | IVOH requiere BHE validado (R3) | docs/04 TD-6, trg_ivoh_requires_bhe | IVOH-01… | pendiente | — |
| R-06 | IVOH = 0.15F1+0.20F2+0.20F3+0.20F4+0.15F5+0.10F6; semáforo <5/5–7.9/≥8 | docs/04 EF-06 | IVOH-02…, E2E-05 | pendiente | — |
| R-07 | Reporte solo con matriz 10/10 | docs/04 TD-4, EF-07 | RPT-01…, E2E-06/07 | pendiente | — |
| R-08 | Reporte folio `{folio}-R1`, versión inmutable | docs/04 EF-07 | RPT-02, API-01 | pendiente | — |
| R-09 | Custodia: 3 transferencias firmadas para dictamen | docs/04 TD-5, EF-10 | CUS-01…, E2E-04 | pendiente | — |
| R-10 | Bitácora cierra ≤ 24 h; cierre tardío con razón; inmutable | docs/04 TD-8, EF-02 | LB-01…, E2E-08 | pendiente | — |
| R-11 | Reprogramación y semáforo de atraso | docs/04 TD-1, EF-12 | E2E-11 | pendiente | — |
| R-12 | Folios solo server-side | docs/04 §3 | API-01, UNIT-* | pendiente | — |
| R-13 | Idempotencia (`Idempotency-Key`) | docs/04 §9, docs/05 API-00 | API-00, OFF-04 | pendiente | — |
| R-14 | Gates no se encolan offline | docs/04 §9 | OFF-01 | pendiente | — |
| R-15 | LWW por campo; conflicto visible | docs/04 §9 | OFF-02/03 | pendiente | — |
| R-16 | RLS multi-tenant y por membresía | docs/01 §RLS | SEC-01/02/03 | pendiente | — |
| R-17 | JWT con claims; sin claim → 401 | docs/07 §0.5 | SEC-04 | pendiente | — |
| R-18 | `quiz_questions` denegada; `v_quiz_questions` sin `correcta` | docs/04, docs/05 SEC-05 | SEC-05 | pendiente | — |
| R-19 | `audit_log` hash encadenado, append-only | docs/01, docs/05 SEC-06 | SEC-06 | pendiente | — |
| R-20 | Aviso de privacidad y ARCO verbatim; buzón y folio | docs/06 | PRIV-01…04 | pendiente | — |
| R-21 | Aula: examen server-side, opciones barajadas, OB3 | docs/08, EF-11 | AUL-*, E2E-10 | pendiente | — |
| R-22 | Realtime por diagnóstico con RLS | docs/04 §7 | RT-01/02 | pendiente | — |

## Reglas de actualización

- Al implementar una regla, QA agrega los casos y cambia el estado con evidencia.
- Un `rojo` bloquea el merge/release de la fase (gate de `docs/05`).
- Toda regla nueva de `docs/04`/`docs/06` debe aparecer aquí antes de cerrar el PR que la
  introduce.
