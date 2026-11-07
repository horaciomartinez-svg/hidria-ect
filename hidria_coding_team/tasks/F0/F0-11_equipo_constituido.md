---
id: F0-11
fase: F0
titulo: Equipo constituido — 8 agentes, TEAM.md y backlog
owner: lead (creador)
estado: en_progreso
prioridad: P0
deps: []
write_scope: ["hidria_coding_team/**"]
evidencia: ["reports/F0/00-LEAD-creacion-equipo.md"]
---

# F0-11 — Equipo constituido

## Objetivo

Crear y constituir el equipo autónomo `hidria_coding_team`: 8 agentes con instrucciones,
gobierno, backlog inicial, carpetas de evidencia y decisiones.

## Pasos

1. `TEAM.md` con misión, principios, decisiones congeladas, reglas duras, bucle, ramas,
   secretos, artefactos, PARO y DoD.
2. Un MD por agente (`agents/01_…` a `08_…`) con misión, alcance, write scope, flujo,
   DoD, prohibiciones y primera tarea.
3. `tasks/BACKLOG.md` + `tasks/F0/*` completo + `tasks/F1/*` primera ola.
4. `reports/README.md` (plantilla de evidencia), `reports/F0/`, `reports/F1/`.
5. `decisions/ADR-000-plantilla.md` + ADRs de stack y monorepo.
6. `.env.example` del equipo (inventario, sin valores).
7. Constituir los 8 agentes en Agent Teams y asignar la primera tarea F0 a cada uno.

## Criterios de aceptación

- [ ] 8 archivos de agente presentes y coherentes con `TEAM.md`.
- [ ] Backlog F0 completo (12 tareas) y F1 (12 primeras) con dueños y deps.
- [ ] Plantillas de reporte y ADR.
- [ ] 8 agentes constituidos y con primera tarea asignada.
- [ ] Reporte final de creación.

## Evidencia esperada

`reports/F0/00-LEAD-creacion-equipo.md` con estructura, agentes y verificaciones.
