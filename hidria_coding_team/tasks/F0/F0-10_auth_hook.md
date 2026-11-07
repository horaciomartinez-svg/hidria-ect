---
id: F0-10
fase: F0
titulo: Auth hook custom_access_token_hook (función + activación)
owner: arquitecto-bd
estado: pendiente
prioridad: P0
deps: [F0-04]
write_scope: ["supabase/migrations/**", "reports/F0/F0-10_*"]
evidencia: ["reports/F0/F0-10_arquitecto-bd_auth_hook.md"]
---

# F0-10 — Auth hook `custom_access_token_hook`

## Objetivo

Preparar los custom claims del JWT (`organization_id`, `global_role` desde `profiles`,
según `docs/07` §0.5 y `docs/01`) y documentar su activación en Supabase Auth.

## Pasos

1. Confirmar el estado actual: `custom_access_token_hook` **no existe** en la base
   (verificado en Fase 0: 0 coincidencias en `pg_proc`).
2. Escribir la función SQL en una migración **nueva** (no editar la base aplicada):
   `auth.custom_access_token_hook(event jsonb) returns jsonb`, `security definer`,
   leyendo `profiles`/`project_members` y agregando `organization_id` y `global_role`.
3. Probar la función con un `event` de ejemplo (sin datos reales) y verificar que no
   eleva privilegios ni filtra datos.
4. Documentar la activación: Supabase Dashboard → Authentication → Hooks, o Management API
   (`PATCH /v1/projects/{ref}/config/auth`). **No** hay access token de Supabase en `.env`:
   registrar como bloqueo (3 intentos: dashboard, Management API, CLI) y dejarlo como tarea
   para el usuario si exige PARO.
5. Verificar que el JWT resultante tendría claims (prueba local/simulada con `jsonb`).
6. Añadir prueba pgTAP/matriz de trazabilidad de la regla "JWT sin claim → 401".

## Criterios de aceptación

- [ ] Migración idempotente con la función (sin aplicarla a producción si no está aprobada).
- [ ] Prueba de la función con evento sintético en verde.
- [ ] Guía de activación y estado real (configurado / pendiente por credencial).
- [ ] Sin secretos en la evidencia.

## Evidencia esperada

`reports/F0/F0-10_arquitecto-bd_auth_hook.md` + PR de migración.
