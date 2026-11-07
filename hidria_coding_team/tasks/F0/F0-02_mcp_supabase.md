---
id: F0-02
fase: F0
titulo: MCP Supabase, proyecto correcto y 3 migraciones
owner: arquitecto-bd
estado: pendiente
prioridad: P0
deps: []
write_scope: ["reports/F0/F0-02_*"]
evidencia: ["reports/F0/F0-02_arquitecto-bd_supabase.md"]
---

# F0-02 — MCP Supabase, proyecto correcto y 3 migraciones

## Objetivo

Comprobar que el MCP de Supabase está conectado al proyecto correcto
(`zucalshlfcxejpukshxl`, us-east-1) y que las **3 migraciones ya están aplicadas**.
**No se reaplica nada.**

## Pasos

1. `mcp__supabase__list_migrations` → deben aparecer exactamente 3, en el orden:
   `20261031000000_base_hidria_mdohi`, `20261031001000_seed_catalogos`,
   `20261108000000_privacy_addendum` (con sus versiones de aplicación).
2. `get_project_url` / `get_publishable_keys` para confirmar proyecto; **no** imprimir
   claves completas.
3. `list_tables` (schemas `public`, `auth`, `storage`) y comparar con `docs/01`.
4. Verificar `supabase_migrations.schema_migrations` (3 filas) y que no hay migraciones
   pendientes (CLI `npx supabase migration list` si es posible con DB URL).
5. Verificar región/proyecto en `.env` (`SUPABASE_PROJECT_REF` = `zucalshlfcxejpukshxl`).

## Criterios de aceptación

- [ ] 3 migraciones aplicadas, ninguna pendiente ni duplicada.
- [ ] Proyecto correcto (ref y región); no es un proyecto vacío.
- [ ] Inventario de tablas coincide con `docs/01`/`docs/02` (44 tablas).
- [ ] Sin acciones de escritura (solo lectura).

## Evidencia esperada

`reports/F0/F0-02_arquitecto-bd_supabase.md` con la lista de migraciones, conteo de tablas,
ref del proyecto y veredicto.
