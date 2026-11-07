## Tarea y evidencia

- Tarea: `tasks/F0/F0-XX_…md`
- Evidencia: `reports/F0/F0-XX_….md`
- Fase: F0 | F1 | F2 | F3

## Qué cambia

<!-- Describe el cambio en 1–3 frases. -->

## Reglas y contratos afectados

- [ ] Contrato `docs/04` (EF / TD / error canónico): …
- [ ] Regla metodológica (IVOH / brecha BHE / matriz 10/10 / custodia / bitácora / folios)
- [ ] RLS / políticas / triggers
- [ ] Textos legales `docs/06` (verbatim)
- [ ] Nada de lo anterior

## Checklist del autor

- [ ] Rama `feature/…` o `fix/…` (no `main` directa).
- [ ] Commits con Conventional Commits.
- [ ] `npm run lint`, `npm run typecheck`, `npm run build` en verde (si tocó cliente).
- [ ] `bash scripts/ci/guardas.sh` en verde.
- [ ] Sin `.env`, secretos, tokens ni `service_role` en el diff (ni en historial).
- [ ] `docs/02` y migración base siguen byte-idénticos (si tocó SQL).
- [ ] Pruebas de `docs/05` añadidas/actualizadas y trazabilidad.
- [ ] Evidencia en `reports/`.

## Revisión (no lo llena el autor)

- Spec review: `reports/reviews/PR-<n>_spec.md` — [ ] APROBADO
- Security review: `reports/security/PR-<n>_security.md` — [ ] APROBADO
- QA: `reports/qa/PR-<n>_qa.md` — [ ] VERDE
- Merge: solo `supervisor-hidria`, squash.
