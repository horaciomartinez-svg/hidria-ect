---
id: F1-01
fase: F1
titulo: Auth con custom claims, roles y perfiles
owner: arquitecto-bd + dev-edge-functions
estado: pendiente
prioridad: P0
deps: [F0-12]
write_scope: ["supabase/migrations/**", "supabase/functions/_shared/**", "app/src/lib/auth/**", "reports/F1/F1-01_*"]
evidencia: ["reports/F1/F1-01_auth_claims.md"]
---

# F1-01 — Auth con custom claims y roles

## Objetivo

Sesión con JWT que incluye `organization_id` y `global_role`; roles `coordinador`,
`equipo`, `empresa`, `observador`, `admin_institucional` aplicados en RLS y EF. JWT sin
claim → `401 AUTH_INVALID` (SEC-04).

## Entregables

- Función `auth.custom_access_token_hook` activa (posible bloqueo por credencial de
  Management API: documentar).
- Migración/seed de `profiles` y `project_members` sintéticos para staging.
- Middleware de auth en `_shared/auth.ts` y guardas de rol por endpoint.
- Pantalla de login/logout en `app/` y manejo de sesión.
- Pruebas SEC-01…SEC-04 y trazabilidad.

## Criterios de aceptación

- [ ] JWT con claims verificados (inspección de token de staging).
- [ ] Roles aplicados en RLS y EF; sin rol elevado desde el cliente.
- [ ] `401 AUTH_INVALID` sin claim.
- [ ] E2E de login en verde.
