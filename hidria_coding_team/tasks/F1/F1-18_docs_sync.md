---
id: F1-18
fase: F1
titulo: Sincronización documental (docs/07 §3, docs/01, docs/02, docs/04 §2.3/TD-4, docs/05 API-04/BHE-05)
owner: lead (creador) + arquitecto-bd (revisor y supervisor como aprobadores)
estado: pendiente
prioridad: P1
deps: [F1-00]
write_scope: ["docs/**", "supabase/tests/**", "reports/F1/F1-18_*"]
evidencia: ["reports/F1/F1-18_docs_sync.md"]
---

# F1-18 — Sincronización documental

## Objetivo

Alinear la documentación fuente de verdad con lo decidido en `ADR-003`, `ADR-005` y
`ADR-006`, sin editar migraciones aplicadas ni romper la byte-identidad de `docs/02` con la
migración base.

## Alcance

- `docs/07` §3: Fase 1 incluye EF-05/06/09 y Realtime; Fase 2 incluye EF-10/11/12;
  addendum que referencia ADR-003.
- `docs/01`/`docs/02`: grants DML de PostgREST, `security_invoker` de las 5 vistas,
  semilla de organización con nombre vigente, default de `profiles.global_role`.
- `docs/04` TD-4: matriz 10/10 alineada a `v_diagnostic_completeness` (docs/02).
- `docs/05` API-04: límite 100 req/min (docs/04 §8).
- **M1 — `docs/05` BHE-05 (brecha con/sin reúso/circular):** alinear con `docs/02` §3.1 y
  `v_bhe_monthly` (la implementación de F1-00 sigue `docs/02`), o abrir ADR si la
  metodología exige reúso. Añadir un caso pgTAP con flujo `CIR-*` en
  `supabase/tests/030_f1_00_folio_bhe_completeness.sql` que fije la semántica (lo añade
  `arquitecto-bd`, dueño de `supabase/tests/**`).
- **M2 — estrategia de `docs/02` para migraciones posteriores:** decidir y documentar en ADR
  cómo se documentan los objetos de migraciones posteriores a la base (`api_idempotency`,
  `report_emissions`, grants, `security_invoker`, `brecha_anual_pct`, funciones) sin romper
  la guarda 3 (`docs/02` byte-idéntico a `20261031000000_base_hidria_mdohi.sql`): p. ej.
  `docs/02` = base + `docs/02b`/`docs/01`/`docs/04` para F1, o ajuste justificado de la
  guarda. Corregir la contradicción del criterio de aceptación anterior.
- **M3 — `docs/04` §2.3 (idempotencia):** documentar que M-01 persiste en la tabla
  `api_idempotency` (sustituye la descripción de `audit_log.meta->>'idempotency_key'`), con
  el comportamiento externo intacto (misma clave+payload → mismo cuerpo; distinta → 409);
  añadir §2.3 al alcance (hoy solo estaba TD-4) o ADR que lo respalde.
- **m1 — default `global_role = 'invitado'`** (ADR-005 cita `observador` como ejemplo):
  documentar la elección (más restrictiva) en ADR-005 y/o aquí.
- **B1 — nombre de la semilla:** ADR-005 §2.5 debe fijar de forma única el nombre de
  despliegue (`SRHDS — Programa HIDRIA`, sigla oficial en `docs/00:13`) o, si se mantiene el
  nombre completo, exigir una migración `M-09` forward-only con el nombre completo. Decisión
  del Lead/Revisor; sin editar la migración aplicada.
- Nomenclatura institucional (SDFI/SRHDS/UCI) en todo el paquete.

## Criterios de aceptación

- [ ] PR de docs aprobado por especificaciones y seguridad.
- [ ] `docs/02` sigue **byte-idéntico** a la migración base; los objetos de migraciones
      posteriores se documentan según la estrategia que fije el ADR M2 (p. ej. `docs/02b`,
      `docs/01`, `docs/04`), sin editar la base ni la guarda 3.
- [ ] `docs/05` BHE-05 sin contradicción con `docs/02` y caso pgTAP `CIR-*` presente.
- [ ] `docs/04` §2.3 documenta `api_idempotency`; `docs/07` §3, `docs/01/02/04/05` sin
      contradicciones abiertas con ADR-003/005/006.
- [ ] Ninguna contradicción abierta entre docs/01/02/04/05/07 y los ADR.

## Notas de asignación (revisión PR #4)

Añadidos M1/M2/M3/m1/B1 por la revisión de especificaciones del PR #4
(`reports/reviews/PR-4_spec.md`, 2026-11-07 19:32). Con estos puntos asignados/documentados,
el revisor pasa el PR #4 a **APROBADO** (re-revisión limitada a B1 + F1-18 + regresión de
`docs/02`/migración base).
