# HIDRIA — Reporte de situación #02 del equipo autónomo

**Archivo:** `coding_team_report02.md`

- **Fecha de generación:** 2026-11-07 19:40 (America/Mexico_City) · 2026-11-08 01:40 UTC
- **Autor:** Lead (creador) del equipo `hidria_coding_team`
- **Repositorio:** [`horaciomartinez-svg/hidria-ect`](https://github.com/horaciomartinez-svg/hidria-ect) (público)
- **`main`:** [`b4fbc83`](https://github.com/horaciomartinez-svg/hidria-ect/commit/b4fbc83) (PR #4 mergeado; antes PR #5 → `afffb6c`)
- **PRs:** [#5 documental](https://github.com/horaciomartinez-svg/hidria-ect/pull/5) ✅ mergeado · [#4 F1-00](https://github.com/horaciomartinez-svg/hidria-ect/pull/4) ✅ mergeado

> **Actualización 19:55:** el usuario aplicó **`required_approving_review_count = 0`** en el
> ruleset (verificado por API: `enforcement: active`, `protected:true`, checks y
> `non_fast_forward` intactos). Se mergearon **PR #5** (`afffb6c`, cierre documental E1/B1) y
> **PR #4** (`b4fbc83`, **F1-00 cerrada**), tras levantar el veto de seguridad y con spec
> re-review APROBADA. Ver §3 y §5.
- **Fase:** F0 cerrada (G0 AMARILLO-OPERATIVO, **E1 resuelta**) · **F1-00 en revisión**
  (PR #4 listo para spec re-review y squash; seguridad ya aprobada)

---

## 1. Resumen ejecutivo

La excepción **E1** (protección de `main`) quedó **resuelta por el usuario** con el ruleset
**`proteccion-main`**, verificado por API el 2026-11-07 19:24. La evidencia se actualizó en
`F0-06`, `00-supervisor_estado`, `ADR-004`, `TEAM.md`, el reporte de creación y el reporte
`coding_team_report01.md`, y se publicó en un PR documental (#5).

Sin embargo, el ruleset introduce una **restricción operativa nueva**: exige **1 aprobación
de GitHub** y el único colaborador del repo es el **autor** de los PRs, por lo que GitHub
**prohíbe la auto-aprobación**. Mientras no se apruebe desde una segunda identidad o se ajuste
el ruleset, **ningún PR puede mergearse**. Es la acción que se requiere del usuario ahora.

En paralelo, el PR #4 (F1-00) recibió:
- **Spec review:** CAMBIOS SOLICITADOS (B1 documental, resuelto en #5 vía `ADR-005`; M1–M3
  asignados a `F1-18`).
- **QA:** AMARILLO con excepción pgTAP documentada (`task-13` obligatoria antes de G1).
- **Security review:** **VETO** por 2 bloqueantes (SEC-PR4-01 y SEC-PR4-02), en corrección
  forward-only (`task-14`, migración `20261108010800` en curso).

---

## 2. Verificación de E1 (ruleset `proteccion-main`)

| # | Consulta | Resultado |
|---|---|---|
| 1 | `GET /repos/.../rulesets` | 1 ruleset: **`proteccion-main`** (id `26780941`), `target: branch`, `source_type: Repository`, `enforcement: active` |
| 2 | `GET /repos/.../rulesets/26780941` | `conditions.ref_name.include = ["refs/heads/main"]`; reglas: `deletion`, `non_fast_forward`, `pull_request` (`required_approving_review_count: 1`, `dismiss_stale_reviews_on_push: true`, `require_last_push_approval: false`, `require_extra_approval_for_unattributed_changes: true`, métodos merge/squash/rebase), `required_status_checks` = «Guardas de repositorio» + «Cliente (lint + typecheck + build)» |
| 3 | `bypass_actors` | `[]` · `current_user_can_bypass: "never"` |
| 4 | `GET /repos/.../branches/main` | `protected: true` |
| 5 | `GET /repos/.../pulls/4` | `mergeable_state` pasó de `clean` a **`blocked`** (efecto correcto del ruleset) |
| 6 | `POST /repos/.../pulls/4/reviews` (`APPROVE`) | Rechazado: **"Can not approve your own pull request"** |

**Evidencia:**
[`F0-13_verificacion_ruleset_e1.md`](hidria_coding_team/reports/F0/F0-13_verificacion_ruleset_e1.md)
(nuevo) y anexo E1-RESUELTA en
[`F0-06`](hidria_coding_team/reports/F0/F0-06_supervisor_branch_protection.md).

---

## 3. Restricción operativa del ruleset (acción del usuario)

El ruleset exige **1 aprobación de review de GitHub**. El único colaborador es
`horaciomartinez-svg`, que es el **autor** de los PRs; `bypass_actors` está vacío y
`current_user_can_bypass` es `never`. Consecuencia:

- **Ningún PR es mergeable** hasta que el usuario apruebe desde otra identidad o ajuste el
  ruleset.
- Las revisiones del equipo (spec, seguridad, QA en `reports/`) siguen siendo **cuórum de
  calidad obligatorio**, pero **no sustituyen** la aprobación de GitHub.
- El supervisor **no intenta mergear** ni usa bypass mientras no exista aprobación.

### Salidas posibles (decisión del usuario)

1. **Aprobar desde una segunda identidad** (cuenta colaboradora con permiso de escritura).
   *(Recomendada si ya existe.)*
2. Añadir un **`bypass_actor`** al ruleset (rol *Repository admin* o
   `horaciomartinez-svg`, `bypass_mode: always`/`pull_request`).
3. Poner **`required_approving_review_count: 0`**, manteniendo `required_status_checks`,
   PR obligatorio, `deletion` y `non_fast_forward`.
4. Añadir un **segundo colaborador** que apruebe los PRs.

---

## 4. PR #5 — cierre de E1 + B1 + evidencia (listo para aprobación)

- **URL:** https://github.com/horaciomartinez-svg/hidria-ect/pull/5
- **Rama / head:** `docs/e1-resuelta` / `18ef0df` (2 commits; el segundo incorpora `PR-5_spec.md`)
- **Contenido:** 13 archivos, +1112/−78, solo documentación; **0** cambios en `app/`,
  `supabase/`, `scripts/`, `.github/`, `docs/02` ni migraciones.
- **CI:** 4/4 `success` en `ba67aa8`; el commit del reporte de re-revisión (`18ef0df`) vuelve
  a ejecutar guardas + cliente (solo añade `PR-5_spec.md`).
- **Spec review:** **APROBADO** — [`PR-5_spec.md`](hidria_coding_team/reports/reviews/PR-5_spec.md):
  B1 cerrado, F1-18 correcto, E1 verificada, TEAM/ADR-004 coherentes, guarda 3 verde.
- **Alcance:**
  - `F0-13_verificacion_ruleset_e1.md` (nuevo).
  - `ADR-004`: E1 **RESUELTA** + nueva restricción operativa + excepciones E2–E4.
  - `ADR-005`: **cierra B1** — `organizations.name = «SRHDS — Programa HIDRIA»` como nombre
    de despliegue; nombre completo reservado a textos legales/`docs/06`; sin `M-09`.
  - `TEAM.md` §7/§8/§13/§14: ruleset real, aprobación humana y no auto-aprobación.
  - `F0-06` y `00-supervisor_estado`: anexo E1-RESUELTA y G0 con E1 cerrada.
  - `F1-18`: ampliado con M1/M2/M3/m1/B1.
  - `PR-4_spec.md`, `PR-4_qa.md`, `qa/trazabilidad.md`, `00-LEAD-creacion-equipo.md`,
    `coding_team_report01.md`.
- **Estado:** `mergeable_state: blocked` **solo por la aprobación pendiente**; CI verde.
- **Revisión:** spec **APROBADO** (`PR-5_spec.md`); el supervisor lo verificó (documental,
  sin secretos/PII) y security review de #5: **no aplica** justificada (no toca
  código/esquema). Queda **solo la aprobación del usuario** (ruleset).

---

## 5. PR #4 — F1-00 migraciones correctivas (VETO LEVANTADO)

> **Actualización:** el **VETO de seguridad fue levantado** el 2026-11-07 19:49 (task-17,
> `reports/security/PR-4_security_delta.md`) sobre el head `4e2341d`: SEC-PR4-01 y
> SEC-PR4-02 corregidos y verificados, sin regresión. Queda pendiente la **re-revisión spec
> acotada** tras el merge de #5 y el squash por el supervisor. Condición residual **RES-1**
> (`diagnostics_write` demasiado restrictiva) asignada a `task-18` antes de F1-04/M2.

- **URL:** https://github.com/horaciomartinez-svg/hidria-ect/pull/4
- **Rama / head:** `feature/F1-00-migraciones` / `1fb4ae4` (5 commits, 13 archivos)
- **CI:** 4/4 `success`.
- **Contenido:** 8 migraciones forward-only (M-01…M-08) + suites pgTAP + reporte.
  En la BD: **11 migraciones** aplicadas (3 base + 8), **46 tablas/46 RLS**, 6 vistas,
  105 políticas; `authenticated` con RLS y sin `quiz_questions` cruda; `service_role`
  administra el banco; Realtime 5 tablas + 3 políticas; hook y default correctos.
  `docs/02` y migración base **byte-idénticos**.

### Revisiones

| Revisión | Veredicto | Detalle |
|---|---|---|
| Spec (`reports/reviews/PR-4_spec.md`) | **CAMBIOS SOLICITADOS** | B1 (nombre institucional) → resuelto en #5 vía ADR-005; M1–M3 asignados a F1-18. Re-revisión acotada tras #5. |
| QA (`reports/qa/PR-4_qa.md`) | **AMARILLO** | Excepción pgTAP documentada (0/39 aserciones ejecutadas; host sin Docker y CI sin Postgres). `task-13` es obligatoria antes de G1. |
| Security (`reports/security/PR-4_security.md`) | **VETO** | **SEC-PR4-01:** `authenticated` puede INSERT/UPDATE/DELETE a través de `v_quiz_questions` (vista auto-actualizable). **SEC-PR4-02:** `WITH CHECK` incompleto en 7 políticas `FOR ALL` (permite escalada de rol, p. ej. `profiles.global_role`). Mayor: `privacy_requests` (PII ARCO) accesible a `authenticated` (`task-15`). |

### Corrección en curso (task-14)

El arquitecto prepara una **migración forward-only nueva**
(`supabase/migrations/20261108010800_f1_00_security_fix.sql`, en el workspace, **sin commit
todavía**; 125 líneas) que:
1. revoca INSERT/UPDATE/DELETE de `v_quiz_questions` a `authenticated` (deja SELECT);
2. recrea las 7 políticas `FOR ALL` con `WITH CHECK` que replica la condición de rol del
   `USING` (incluida la restricción de `profiles.global_role`);
3. añade least-privilege (`MAINTAIN`, secuencias) y pruebas de regresión.

Cuando el nuevo head esté pusheado: CI → **re-revisión de seguridad del delta** → re-revisión
acotada de spec (tras el merge de #5) → aprobación del usuario → squash por el supervisor.

> **Divulgación responsable:** `PR-4_security.md` **no** se publicó en el PR documental
> porque describe explotaciones aún no corregidas; se versionará junto con el fix del veto.

---

## 6. Riesgos actualizados

| Riesgo | Nivel | Estado / mitigación |
|---|---|---|
| **Aprobación humana bloqueada** (ruleset + una sola identidad) | ~~Alto~~ **Resuelto** | El usuario aplicó `required_approving_review_count = 0` (19:51); el merge lo autorizan CI + cuórum del equipo. PR #5/#4 en `clean` |
| **Veto de seguridad PR #4** (SEC-PR4-01/02) | ~~Alto~~ **Resuelto** | task-17: veto levantado en `4e2341d`; pendiente spec re-review y squash |
| **RES-1** `diagnostics_write` restrictiva (INSERT de diagnóstico denegado) | Medio | `task-18` (arquitecto + revisor) antes de F1-04/M2 |
| `privacy_requests` con PII accesible a `authenticated` | Medio | `task-15`: restringir a Unidad de Transparencia antes del buzón ARCO |
| Sin proyecto Supabase staging separado (E2) | Alto | Solo datos sintéticos; prohibido `restringido_nda` hasta separar entornos |
| Auth hook sin activar (E3) | Medio | Función entregada; activación pendiente de `SUPABASE_ACCESS_TOKEN` |
| Acta 0.6 pendiente (E4) | Medio | Coordinación SDFI/UCI |
| pgTAP no ejecutado en CI | Medio | `task-13` (servicio Postgres en CI) obligatoria antes de G1 |
| Inconsistencias documentales (`docs/04`/`05` vs `docs/02`) | Medio | `F1-18` + ADR-006; `docs/02` prevalece |

---

## 7. Acciones requeridas del usuario

1. **Desbloquear la aprobación de PRs** (elegir una salida de §3). Sin esto no hay merges.
2. **Aprobar PR #5** (`docs/e1-resuelta`, head `ba67aa8`, CI 4/4) para cerrar E1/B1 en `main`.
3. Cuando el PR #4 tenga el fix de seguridad y CI verde, **aprobarlo**; el supervisor hará el
   squash.
4. Pendientes de entorno: **E2** (proyecto staging + `SUPABASE_ACCESS_TOKEN`), **E3**
   (activar `custom_access_token_hook`), **E4** (acta 0.6).

---

## 8. Siguiente secuencia (sin humanos entre pasos, salvo aprobaciones)

```
[usuario] desbloquea aprobación + aprueba #5
   → supervisor squash #5
   → arquitecto push fix seguridad (nuevo head #4) + pgTAP
   → CI verde → seguridad re-revisión delta (levanta VETO)
   → revisor re-revisión acotada #4 (B1 + guarda 3 + regresión)
   → [usuario] aprueba #4
   → supervisor squash #4 → F1-00 cerrada
   → F1-01 (auth/claims) + task-13 (pgTAP en CI) + task-15 (ARCO/PII)
```

---

## 9. Índice de evidencia

| Área | Documento |
|---|---|
| Verificación ruleset E1 | [F0-13](hidria_coding_team/reports/F0/F0-13_verificacion_ruleset_e1.md) |
| Branch protection (anexo E1) | [F0-06](hidria_coding_team/reports/F0/F0-06_supervisor_branch_protection.md) |
| Estado G0 | [00-supervisor_estado](hidria_coding_team/reports/F0/00-supervisor_estado.md) |
| ADR E1 | [ADR-004](hidria_coding_team/decisions/ADR-004-excepciones-fase-0.md) |
| ADR claims/grants/B1 | [ADR-005](hidria_coding_team/decisions/ADR-005-claims-grants-y-correcciones.md) |
| Gobierno | [TEAM.md](hidria_coding_team/TEAM.md) |
| Spec review #4 | [PR-4_spec](hidria_coding_team/reports/reviews/PR-4_spec.md) |
| QA #4 | [PR-4_qa](hidria_coding_team/reports/qa/PR-4_qa.md) |
| Security #4 (no publicado aún) | `reports/security/PR-4_security.md` (local; se versiona tras el fix) |
| F1-00 | [F1-00_arquitecto-bd_migraciones](hidria_coding_team/reports/F1/F1-00_arquitecto-bd_migraciones.md) |
| Backlog | [tasks/BACKLOG.md](hidria_coding_team/tasks/BACKLOG.md) |
| Reporte anterior | [coding_team_report01.md](coding_team_report01.md) |

---

## 10. Bitácora (desde el reporte #01)

| Fecha/hora (local) | Hito |
|---|---|
| 2026-11-07 ~19:07 | F1-00 en curso; primer borrador de migración |
| 2026-11-07 ~19:19 | PR #4 abierto; CI 4/4 |
| 2026-11-07 ~19:24 | **E1 resuelta**: ruleset `proteccion-main` activo |
| 2026-11-07 ~19:25 | Verificación por API + self-approval rechazada; evidencia F0-13 |
| 2026-11-07 ~19:35 | Spec review #4: cambios solicitados (B1 + M1–M3) |
| 2026-11-07 ~19:36 | QA #4: AMARILLO (excepción pgTAP); Security #4: **VETO** |
| 2026-11-07 ~19:38 | PR #5 (`docs/e1-resuelta`) abierto con E1 + B1 + evidencia |
| 2026-11-07 ~19:40 | PR #5 verificado por supervisor, CI 4/4; fix de seguridad `20261108010800` en preparación |
| 2026-11-07 ~19:43 | Spec re-review de PR #5: **APROBADO**; reporte `PR-5_spec.md` añadido al PR (head `18ef0df`) |
| 2026-11-07 ~19:49 | Seguridad: **VETO LEVANTADO** de PR #4 (task-17) sobre `4e2341d`; RES-1 → `task-18` |
| 2026-11-07 ~19:51 | Usuario aplica **`required_approving_review_count = 0`**; PR #5 y #4 pasan a `clean` |
| 2026-11-07 ~19:52 | **PR #5 mergeado** (`afffb6c`); E1/B1/documentación en `main` |
| 2026-11-07 ~19:54 | Spec re-review acotada de PR #4: **APROBADO** (`PR-4_spec_delta.md`) |
| 2026-11-07 ~19:55 | **PR #4 mergeado** (`b4fbc83`); **F1-00 cerrada** |

---

## 11. Conclusión

E1 está **técnicamente resuelta** y documentada con evidencia verificable. El bloqueo actual
no es de ingeniería sino de **mecánica de aprobación del ruleset**: se necesita que el
usuario apruebe (o ajuste el ruleset) para poder mergear. En paralelo, el equipo está
cerrando el **veto de seguridad** del PR #4 con una migración forward-only y pruebas de
regresión, sin tocar la migración base ni `docs/02`.

**Estado operativo:** F1-00 **cerrada** (`b4fbc83`); el equipo continúa con `F1-01`
(auth/claims) y los follow-ups `task-18` (RES-1, antes de F1-04/M2) y `task-13` (pgTAP en CI,
antes de G1). El control humano es por auditoría de reportes; los merges ya no requieren
aprobación formal de GitHub (ruleset con `required_approving_review_count = 0` y checks
obligatorios).
