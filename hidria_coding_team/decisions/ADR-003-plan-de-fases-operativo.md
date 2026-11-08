# ADR-003 — Plan de fases operativo del build (resolución de B1/B2 del PR #2)

- **Estado:** propuesta (pendiente de aprobación de `supervisor-hidria` y `revisor-especificaciones`)
- **Fecha:** 2026-11-08
- **Autor:** Lead (creador del equipo), a partir de la instrucción de la Coordinación
  (misión de creación del 2026-11-08) y de los hallazgos B1/B2 de
  `reports/reviews/PR-2_spec.md`
- **Documentos afectados:** `docs/07` §3, `TEAM.md` §13, `agents/03`, `agents/04`,
  `tasks/BACKLOG.md`, `tasks/F1/*`
- **Aprobación requerida:** `supervisor-hidria` + `revisor-especificaciones`

## 1. Contexto

`docs/07` §3 define Fase 1 = EF-01/02/03/04/07/08/11 + M1–M4, M10–M12 y Fase 2 =
EF-05/06/09/10/12 + M5/M6/M7. La misión de la Coordinación (2026-11-08) fija una Fase 1
distinta: incluye **IIH, BHE (EF-05) e IVOH (EF-06)** y deja el **aula (EF-11/M12)** para
Fase 2. Además, `docs/07` §3 pone E2E-07 en Fase 1 pero EF-07 exige matriz 10/10, y la
vista `v_diagnostic_completeness` (`docs/02:725-746`) requiere custodia `p4`, laboratorio
`p6` y alternativas `p9`, cuyos instrumentos se ubicaban en Fase 2. Esa combinación hace
**inalcanzable G1** tal como estaba escrito (hallazgo B1) y produjo tres planes
incompatibles (hallazgo B2).

## 2. Decisión

Se adopta el siguiente **plan operativo** (la instrucción de la Coordinación prevalece
sobre `docs/07` §3 en lo que aquí se indica; el resto de `docs/07` sigue vigente):

### Fase 1 — MVP núcleo (G1)

- **Módulos:** M1, M2, M3, M4, **M5 (IIH)**, **M6 (BHE)**, **M7 mínimo** (captura de
  muestras y transferencias de custodia), **M8 (IVOH)**, M9 mínimo (cartera de
  alternativas + reporte esencial), M10, M11.
- **EF:** EF-01, EF-02, EF-03, EF-04, EF-05, EF-06, EF-07 (esencial: PDF, folio `-R1`,
  matriz 10/10), EF-08, EF-09 (importación XLSX de **IIH y BHE**, `kind='iih'|'bhe'`).
- **Prerrequisitos de la matriz 10/10** (nuevas tareas F1-13/F1-14/F1-15, captura mínima
  sin automatización completa): 3 transferencias de custodia, resultados de laboratorio
  con dictamen manual, y cartera de alternativas validada en R4. **EF-10 (dictamen
  automatizado) y M7 completo siguen en Fase 2.**
- **Criterio de salida G1:** E2E-01, E2E-02, E2E-03, E2E-05, **E2E-07**, E2E-08 verdes;
  SEC-01…SEC-05; **RT-01/02** (Realtime, `F1-17`); API-00…04 de las EF de Fase 1.

### Fase 2 — Completa (G2)

- EF-10 (custodia/dictamen completo), EF-11 (aula) + M12, EF-12 (reprogramación),
  insignia OB3, reportes completos (M9 avanzado), M7 completo.

### Fase 3 — Piloto (G3)

- EF-07 completo (matriz 10/10 con M9 avanzado), EF-13 NOM-151 tras `NOM151_ENABLED`,
  CAP-01…CAP-04.

## 3. Justificación

1. **La instrucción de la Coordinación es la fuente más reciente** y nombra explícitamente
   IIH/BHE/IVOH en Fase 1 (el piloto necesita el folio `-R1`, CAP-02).
2. **E2E-07 se vuelve alcanzable** sin adelantar EF-10: la matriz solo exige que existan
   los datos (3 transferencias, dictamen no nulo, alternativa validada), no la
   automatización completa. Las tareas F1-13/F1-14/F1-15 los capturan con los roles
   autorizados y RLS; EF-10 automatiza en Fase 2.
3. **Aula en Fase 2** coincide con la instrucción de la Coordinación y evita duplicar
   EF-11/M12 en G1 y G2.
4. No se modifica ningún contrato ni regla metodológica: solo se re-secuencia el trabajo.

## 4. Consecuencias

- `TEAM.md` §13, `agents/03`, `agents/04`, `tasks/BACKLOG.md` y `tasks/F1/*` se alinean a
  este ADR (una sola versión del plan).
- `docs/07` §3 queda **parcialmente superado** por este ADR en la composición de Fase 1/2;
  se registra aquí para trazabilidad y se recomendará su actualización en un PR de docs
  posterior (no se edita `docs/07` en el PR #2 salvo la precisión de idempotencia ya
  incluida).
- Se crean las tareas `F1-13`, `F1-14`, `F1-15` (prerrequisitos de matriz) y `F1-16`
  (deploy staging).
- `F1-12` (EF-07) depende de `F1-10`, `F1-11`, `F1-13`, `F1-14`, `F1-15`.

## 5. Aprobación

| Rol | Nombre | Estado | Evidencia |
|---|---|---|---|
| Supervisor | `supervisor-hidria` | pendiente | — |
| Revisor | `revisor-especificaciones` | pendiente | re-revisión de PR #2 |
