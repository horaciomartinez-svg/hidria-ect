---
id: F1-18
fase: F1
titulo: Sincronización documental (docs/07 §3, docs/01, docs/02, docs/04 TD-4, docs/05 API-04)
owner: lead (creador) + arquitecto-bd (revisor y supervisor como aprobadores)
estado: pendiente
prioridad: P1
deps: [F1-00]
write_scope: ["docs/**", "reports/F1/F1-18_*"]
evidencia: ["reports/F1/F1-18_docs_sync.md"]
---

# F1-18 — Sincronización documental

## Objetivo

Alinear la documentación fuente de verdad con lo decidido en `ADR-003`, `ADR-005` y
`ADR-006`, sin editar migraciones aplicadas.

## Alcance

- `docs/07` §3: Fase 1 incluye EF-05/06/09 y Realtime; Fase 2 incluye EF-10/11/12;
  addendum que referencia ADR-003.
- `docs/01`/`docs/02`: grants DML de PostgREST, `security_invoker` de las 5 vistas,
  semilla de organización con nombre vigente, default de `profiles.global_role`.
- `docs/04` TD-4: matriz 10/10 alineada a `v_diagnostic_completeness` (docs/02).
- `docs/05` API-04: límite 100 req/min (docs/04 §8).
- Nomenclatura institucional (SDFI/SRHDS/UCI) en todo el paquete.

## Criterios de aceptación

- [ ] PR de docs aprobado por especificaciones y seguridad.
- [ ] `docs/02` sigue byte-idéntico a la migración base (o se actualiza con migración nueva).
- [ ] Ninguna contradicción abierta entre docs/01/02/04/05/07 y los ADR.
