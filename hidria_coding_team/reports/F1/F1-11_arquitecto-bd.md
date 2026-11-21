# F1-11 Fase 2 — DB/RLS/RPC Bitácora (task-172)

- **Agente:** `arquitecto-bd` (02), coordina F1-11a (UI) / F1-11b (EF-02)
- **Rama:** `feat/F1-11-db-logbook`, base `main@9d4ae51`
- **Migración:** `20261121130000_f1_11_logbook.sql`
- **BD:** `schema_migrations = 40`; forward-only; `docs/02` intacto.
- **PR:** #77.

## Migración

- `logbook_entries`: CHECK `abierta|en_revision|cerrada`, `cierre_tardio`, org/created_by/folio server-side; guard 42501 de cierre/keys; post-cierre inmutable.
- Seed `logbook_agenda`/`logbook_evidence` desde `logbook_templates` al crear ficha abierta.
- Guards de hijas (INSERT/UPDATE/DELETE, 42501 post-cierre y roles), binding `document_id` de evidencia (tenant/diagnóstico/`registered`), `logbook_change_log` append-only/service.
- RLS entries/hijas coord/equipo; observador/empresa lectura; `firma_ts` solo RPC service_role.
- `p7_bitacoras`/`bitacora_cerrada`: 8 claves cubiertas y todas las filas existentes de esas claves cerradas (V1 segunda sesión).
- RPC `fn_submit_logbook_review`, `fn_sign_logbook_participant` (nombre), `fn_close_logbook` (firmas/agenda/evidencia, 24 h exacto, razón ≥20, `cierre_tardio`, change_log/audit/bitacora_cerrada), ACL service_role.

## Tests

`160_f1_11_logbook.sql` **plan 28**: seed/folio/org, estados, submit/sign/close, 24h tardío, post-cierre 42501, RLS/ACL, evidencia ajena, SEC-PR77-01/02. Total pgTAP **545** (517 + 28); BD=repo=40.

## Coordinación

- EF-02 consume firmas del ADR; UI lee hijas y liga evidencia tras EF-08 (trigger valida tenant/diagnóstico/registered).
- `docs/02` intacto; sin `app/**`/`functions/**`.
