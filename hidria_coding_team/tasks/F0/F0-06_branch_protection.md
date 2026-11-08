---
id: F0-06
fase: F0
titulo: Protección de main verificada (PR + aprobación + no force push)
owner: supervisor-hidria
estado: pendiente
prioridad: P0
deps: [F0-01]
write_scope: ["reports/F0/F0-06_*"]
evidencia: ["reports/F0/F0-06_supervisor_branch_protection.md"]
---

# F0-06 — Protección de `main` verificada

## Objetivo

Confirmar con evidencia que `main` exige PR + 1 aprobación y prohíbe force push. Si no
está configurada, documentarlo y corregirlo (o escalar como PARO por credencial).

## Pasos

1. Intentar leer por API REST `GET /repos/horaciomartinez-svg/hidria-ect/branches/main/protection`
   y `GET /repos/.../rulesets`. Registrar el código HTTP (403 = token sin permiso de
   administración; 404 = no protegida).
2. Verificación **conductual** (evidencia fuerte): sobre el PR de Fase 0 (rama ya creada),
   intentar `merge_pull_request` **sin** aprobaciones. Si el merge es rechazado con
   "review required", la protección existe. **No** mergear realmente: si el merge no está
   bloqueado, cancelar y reportar el hueco (no dejar el merge hecho).
3. Comprobar que `main` no acepta force push: revisar reglas; no ejecutar push real.
4. Si falta protección y el token no puede configurarla, documentar como bloqueo con 3
   intentos (REST, rulesets, GraphQL) y evaluar PARO (condición 1) o mitigación temporal:
   política de equipo (solo el supervisor mergea) + tarea para el usuario de activar la
   protección con permisos de administración.
5. Verificar la plantilla de PR y los required checks de CI cuando existan.

## Criterios de aceptación

- [ ] Código HTTP y respuesta de los 3 intentos documentados.
- [ ] Evidencia conductual del PR (merge bloqueado o no).
- [ ] Estado final claro: PROTEGIDA / NO PROTEGIDA + acción.
- [ ] Si no se pudo configurar: PARO documentado con los 3 intentos.

## Evidencia esperada

`reports/F0/F0-06_supervisor_branch_protection.md`.
