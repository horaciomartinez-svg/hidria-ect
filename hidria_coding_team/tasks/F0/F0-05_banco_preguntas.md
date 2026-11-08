---
id: F0-05
fase: F0
titulo: Banco de preguntas — quiz_questions denegada y v_quiz_questions operativa
owner: seguridad-privacidad
estado: pendiente
prioridad: P0
deps: [F0-04]
write_scope: ["reports/F0/F0-05_*"]
evidencia: ["reports/F0/F0-05_seguridad_quiz.md"]
---

# F0-05 — Banco de preguntas

## Objetivo

Verificar la regla dura: `quiz_questions` cruda solo con `service_role`;
`authenticated` solo ve `v_quiz_questions`; la columna `correcta` jamás llega al cliente.

## Pasos

1. `has_table_privilege('authenticated','public.quiz_questions','select')` → debe ser
   `false`. `has_table_privilege('authenticated','public.v_quiz_questions','select')` →
   `true`.
2. Revisar privilegios de `anon` y `authenticated` sobre ambas; revisar `REVOKE` en
   `docs/02`.
3. Definición de `v_quiz_questions`: columnas expuestas exactamente
   `id, module_orden, pregunta, opciones` (sin `correcta`, sin `peso`, sin metadatos
   internos). `security_invoker`/`security definer` y propietario.
4. Probar con PostgREST (si hay anon key) `GET /rest/v1/quiz_questions?select=correcta`
   con JWT de prueba → debe fallar (403/permiso denegado); `GET /rest/v1/v_quiz_questions`
   → 200 y sin `correcta`.
5. Verificar que la calificación es server-side (EF-11 prevista) y que el cliente no
   recibe respuestas correctas.
6. Documentar el número de preguntas (14 semilla; el contenido del aula se amplía en F2).

## Criterios de aceptación

- [ ] `authenticated` sin SELECT sobre `quiz_questions`.
- [ ] `v_quiz_questions` accesible y sin `correcta`.
- [ ] Prueba negativa vía PostgREST documentada.
- [ ] Sin cambios de permisos (solo verificación).

## Evidencia esperada

`reports/F0/F0-05_seguridad_quiz.md`.
