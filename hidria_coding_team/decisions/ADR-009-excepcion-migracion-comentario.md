# ADR-009 — Excepción one-off a forward-only: corregir el comentario SQL de `20261108020030`

- **Estado:** **aceptada con condiciones** (2026-11-08; supervisor + revisor; seguridad «sin objeción»)
- **Fecha:** 2026-11-08
- **Autor:** Lead (creador), a solicitud del supervisor y del revisor
- **Alcance:** **una sola línea** de `supabase/migrations/20261108020030_f1_01a_fix_roles2.sql`
- **PR:** #15 `fix/F1-01a-migration-comment` (head `0ff8f5d`; 1 archivo, +1/−1)
- **Relacionadas:** task-13 (pgTAP+Postgres en CI), PR #14, `reports/qa/PR-4_qa.md` §1.5

## 1. Contexto

`supabase db reset` (task-13) reproduce las migraciones desde archivos. La migración
`20261108020030_f1_01a_fix_roles2.sql:32` contiene un `comment on function` cuyo texto usa
**cinco comillas simples** (`array[''']`) —número impar— y produce **`SQLSTATE 42601`**
(`syntax error at or near "]"`) al aplicar el archivo desde cero.

Estado real de la BD (verificado): la función `public.has_any_global_role(text[])` **ya tiene
el cuerpo corregido (B1)**; `obj_description(...)` es **NULL** (el comentario nunca se aplicó);
no hay cambio de esquema, función, ACL ni datos por el comentario. Además, la versión
`20261108020030` no figura en `schema_migrations` (el contenido se aplicó bajo
`20261108020053`): discrepancia de historia que task-13 cierra con el reset limpio.

Sin esta corrección **no hay reproducibilidad desde archivos** (`supabase start`/`db reset`),
y por tanto no se puede cerrar task-13/G1.

## 2. Decisión

Se autoriza **una excepción one-off** a la regla forward-only de `TEAM.md` §8, limitada
**exclusivamente** a esa línea de comentario:

- Sustituir el texto con comillas anidadas por una redacción sin comillas conflictivas
  (p. ej. «array vacío o con NULL») o eliminar la línea de comentario.
- **No** se toca ninguna otra línea, migración, versión, nombre de archivo ni `docs/02`.
- **No** se crea una migración nueva solo por el comentario: los comentarios no son contrato;
  la BD puede quedar con `obj_description` NULL.

## 3. Condiciones de aceptación

1. **Diff exactamente 1 línea** (+1/−1) y prueba de que no se modificó ninguna otra migración
   aplicada; escanear todas las migraciones por comillas impares similares antes de cerrar.
2. Evidencia de `pg_get_functiondef`/ACL sin cambios, `obj_description` NULL, `schema_migrations`
   = 16 sin fila nueva de `20261108020030`, y replay limpio (`supabase db reset` sin 42601).
3. Secret/PII scan 0; CI verde (incluye Deno).
4. **ADR-009** (este documento) aprobado por supervisor + revisor; seguridad **sin objeción**
   (no hay datos/PII/credenciales). Se registra en `decisions/`.
5. Dueño de la edición: `arquitecto-bd`; PR propio (#15); DevOps rebasa PR #14 y re-ejecuta
   `supabase start` → `db reset` → `test db`.
6. **No relajar la regla general:** cualquier otra edición de migración aplicada requiere ADR
   y aprobación equivalente.

## 4. Consecuencias

- El replay desde archivos queda limpio y task-13 puede ejecutar las 113 aserciones pgTAP.
- Se documenta el drift inocuo: BD actual sin comentario (NULL) vs. replay limpio con el
  comentario corregido; no se crea migración de comentario.
- La historia de `schema_migrations` (16 filas, `20261108020030` ausente) se documenta como
  hallazgo de task-13; el reset limpio es la fuente de verdad para CI.

## 5. Aprobación

| Rol | Nombre | Estado | Evidencia |
|---|---|---|---|
| Supervisor | `supervisor-hidria` | **APROBADO** | `reports/F1/F1-19_*`; PR #15 |
| Revisor | `revisor-especificaciones` | **APROBADO con condiciones** | verificación de la línea 32 y comillas impares; ADR-009 |
| Seguridad | `seguridad-privacidad` | **SIN OBJECIÓN** (condiciones §3) | `reports/security/` (comentario no ejecutable; sin datos) |
