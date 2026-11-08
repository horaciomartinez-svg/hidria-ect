# `tests/` — Pruebas del cliente y de contrato (QA)

Estructura prevista (Fase 1):

```
tests/
├── unit/          # Vitest: cálculos (IVOH, brecha), parsers XLSX, LWW, validaciones
├── api/           # contrato HTTP contra staging (API-00…04)
└── e2e/           # Playwright: E2E-01…12, OFF-01…04, RT-01/02
playwright.config.ts
```

Convenciones:

- Un archivo por caso o grupo de casos de `docs/05`, con el ID en el nombre
  (p. ej. `tests/e2e/E2E-03_brecha.spec.ts`).
- Los E2E usan datos sintéticos y staging; nunca datos reales.
- Los tests de gates prueban el **caso bloqueante** además del feliz.
- El resultado se publica en `reports/qa/`; la matriz viva es `qa/trazabilidad.md`.
- QA es dueño de esta carpeta; los devs no editan pruebas para "hacerlas pasar".
