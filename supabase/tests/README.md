# Pruebas pgTAP

Plan de pruebas: `docs/05-Plan-de-Pruebas-HIDRIA-MD-OHI.md`.

## Niveles de base de datos

- `PG-*` — gates de fase (`check_phase_gate`).
- `BHE-*` — balance hídrico y regla de la brecha (> 10 %).
- `IVOH-*` — fórmula, semáforo y `trg_ivoh_requires_bhe`.
- `CUS-*` — cadena de custodia (3 transferencias).
- `LB-*` — bitácora (cierre ≤ 24 h, inmutabilidad, versionado).
- `CAT-*` — CAT (47 preguntas, gate F3).
- `DOC-*` — checklist documental (transiciones TD-2).
- `SEC-*` — RLS y aislamiento multi-tenant (SEC-01…06).

## Nota de entorno (Fase 0)

Este equipo **no tiene Docker** habilitado en el host de desarrollo. En Fase 0 la
verificación de esquema/RLS se hace contra el proyecto Supabase con consultas de solo
lectura y evidencia en `reports/F0/`. La ejecución de pgTAP se habilitará en CI con un
servicio Postgres (tarea de DevOps/QA en F1).

Los archivos de prueba viven aquí y se ejecutan con `supabase test db` cuando el entorno
local/CI esté disponible.
