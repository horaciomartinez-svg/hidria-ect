---
id: F0-12
fase: F0
titulo: Gate G0 — cierre de Fase 0
owner: supervisor-hidria
estado: pendiente
prioridad: P0
deps: [F0-01, F0-02, F0-03, F0-04, F0-05, F0-06, F0-07, F0-08, F0-09, F0-10, F0-11]
write_scope: ["reports/F0/00-supervisor_estado.md", "tasks/BACKLOG.md"]
evidencia: ["reports/F0/00-supervisor_estado.md"]
---

# F0-12 — Gate G0 (cierre de Fase 0)

## Objetivo

Verificar el checklist G0, consolidar la evidencia y declarar Fase 0 cerrada (o bloqueada).
Es la puerta de entrada a Fase 1.

## Checklist G0

- [ ] MCP GitHub operativo y alcance documentado (F0-01).
- [ ] MCP Supabase correcto y 3 migraciones aplicadas (F0-02).
- [ ] `.env` fuera de git y secret scan limpio (F0-03).
- [ ] 44 tablas/44 RLS/6 vistas, seeds y triggers verificados (F0-04).
- [ ] Banco de preguntas protegido (F0-05).
- [ ] Protección de `main` verificada (F0-06) — o PARO documentado.
- [ ] CI mínima verde en el PR de Fase 0 (F0-07).
- [ ] Monorepo y `.env.example` (F0-08).
- [ ] Cloudflare R2/Pages (F0-09) — si falla por credencial, PARO o tarea al usuario.
- [ ] Auth hook preparado y activación documentada (F0-10).
- [ ] Equipo constituido (F0-11).
- [ ] PR `chore/f0-fundacion` revisado (spec + security), CI verde y mergeado con squash.
- [ ] `reports/F0/00-supervisor_estado.md` con veredicto **VERDE (G0 cerrado)**.

## Pasos

1. Recolectar los reportes F0-01…F0-11; verificar que cada uno tenga evidencia y conclusión.
2. Revisar el checklist y marcar VERDE/AMARILLO/ROJO por ítem.
3. Si hay ROJO en un ítem P0: decidir corrección (nueva tarea) o PARO según `TEAM.md` §12.
4. Mergear el PR tras las 2 aprobaciones y CI verde (squash).
5. Actualizar `tasks/BACKLOG.md` (F0 hecha) y `TEAM.md` §14 (siguiente tarea).
6. Asignar `F1-01`.

## Criterios de aceptación

- [ ] Todos los ítems G0 con evidencia o PARO documentado.
- [ ] PR de Fase 0 mergeado.
- [ ] Backlog actualizado y `F1-01` asignada.
