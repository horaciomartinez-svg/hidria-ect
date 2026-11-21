# F1-11 — Cierre M10 Bitácora + EF-02

**Estado:** cerrado (código + documentación) — base `main@2efa8cf`; BD=repo=**40**.
**Fecha:** 2026-11-21.

## Merges

| PR | Squash | Contenido |
|---|---|---|
| #76 | `9d4ae51` | ADR-016 bitácora, firmas, 24 h y EF-02 (Fase 1) |
| #77 | `5588b6e` | DB/RLS/guards/RPC: estados `abierta|en_revision|cerrada`, `cierre_tardio`, org/created_by/folio server-side, guards 42501, binding evidencia tenant/diagnóstico/registered, RPC submit/sign/close, p7 8/8 |
| #78 | `d9305b3` | EF-02 submit-review/sign/close con RPC real, firma por nombre, errores LB e idempotencia |
| #79 | `2efa8cf` | UI `/bitacora`: 8 fichas, agenda/participantes/firmas/evidencia, cierre con razón, gate y post-cierre read-only |
| #80 | pendiente | Docs contrato EF-02 + este reporte |

## Métricas

- pgTAP: `160` plan **48**, `161` plan **23**, `162` plan **12** (LB-01/02/03, borde 24 h +1/−1 s, RLS/ACL/idempotencia/audit/change_log, p7/bitacora 8/8, post-cierre 42501, cross-tenant).
- Deno: **242/242** (10 nuevas EF-02).
- E2E UI: **78 passed + 6 skipped** (9 M10).
- CI 7/7 en #77/#78/#79; BD=repo=40; `docs/02` intacto; sin secretos.

## Decisiones implementadas (ADR-016)

- TD-8: `abierta → en_revision → cerrada`; cierre solo desde `en_revision`; firmada = `firma_ts` + `cerrada_en`; firma en representación por coord/equipo.
- 24 h contra `(fecha+horario_inicio)` en `America/Mexico_City`; exacto 24 h normal; >24 h exige razón ≥20 y `cierre_tardio=true`; sin escalamiento automático en F1-11.
- Validaciones server-side: firmas por segmentos del template, agenda por `no`/resultado, evidencia por `item` y documento del tenant/diagnóstico `registered`.
- `firma_ts` solo EF-02; `created_by=auth.uid()`; org/folio/estado/version server-side; post-cierre 42501 en ficha e hijas; `logbook_change_log` append-only.
- Gate reporte: `p7_bitacoras`/`bitacora_cerrada` = 8 claves cubiertas y todas las filas de esas claves cerradas; EF-07/F1-12 posterior.

## Follow-ups no bloqueantes

1. **M10:** `photo_log`/fotos fuera de F1-11 (F1-13/M10 ampliado); evidencia solo documentos EF-08.
2. **Seguridad:** sanitize de inputs create/update y no borrar participante firmado; `created_by` mutable en UPDATE (atribución); triggers de evidencia/firma duplicados.
3. **EF-02:** notificación no filtra `template.tipo='reunion'`; `notifyMembers` a todos; respuestas fallback.
4. **UI:** E2E UI-level mockea EF/DB; E2E real M10 no aplica.
5. Endurecimientos transversales y `api_rate_limit`; follow-ups F1-05–F1-10.

## Evidencia

`decisions/ADR-016-logbook-ef02-f1-11.md`, `reports/F1/F1-11_spec.md`, `reports/qa/F1-11_test_plan.md`, `reports/F1/F1-11_arquitecto-bd.md`, `reports/F1/F1-11_ef.md`, `reports/F1/F1-11_dev-frontend.md`, `reports/reviews/PR-77/78/79_spec.md`, `reports/security/PR-77/78/79_security.md`, `reports/qa/PR-77/78/79_qa.md`, `qa/trazabilidad.md`.
