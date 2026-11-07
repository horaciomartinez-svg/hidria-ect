# `reports/` — Evidencia de trabajo

Cada verificación o entrega deja un reporte Markdown. Sin reporte no hay "hecho".

## Convención de nombres

```
reports/F0/F0-04_arquitecto-bd_esquema.md
reports/F1/F1-09_dev-edge-functions_bhe.md
reports/qa/F1-09_qa_bhe.md
reports/reviews/PR-12_spec.md
reports/security/PR-12_security.md
reports/deploy/staging-2026-11-12-<sha>.md
reports/incidentes/INC-001.md
reports/F0/00-supervisor_estado.md
```

## Plantilla

```markdown
# <ID> — <Título>

- **Agente:** <id>
- **Fecha:** AAAA-MM-DD HH:MM (America/Mexico_City)
- **Tarea:** `tasks/F0/F0-04_…md`
- **Rama / PR:** `feature/…` / #<n>
- **Entorno:** local | staging | piloto
- **Commit:** <sha>

## Resultado: VERDE | AMARILLO | ROJO

## Comandos y evidencia

| # | Comando / consulta | Resultado (resumen) |
|---|---|---|
| 1 | `…` | … |

## Hallazgos

1. …

## Pendientes / siguiente paso

- …
```

## Reglas

- **Nunca** incluir valores de secretos, tokens, contraseñas ni claves (ni parciales).
- Recortar salidas largas; conservar lo que prueba el resultado.
- Un reporte por tarea y entorno; los reejecutados se agregan con fecha.
- VERDE exige todos los criterios de aceptación; AMARILLO = cumple con pendientes menores
  documentados; ROJO = bloquea y se abre tarea/incidente.
- Los reportes de revisión (spec/security/QA) son **independientes** del autor del cambio.
