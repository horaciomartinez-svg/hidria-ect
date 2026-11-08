# Revisión de especificaciones — PR #5 — docs(f0): E1 resuelta, B1 de ADR-005 y evidencia de revisión del PR #4

- **Revisor:** `revisor-especificaciones` (agente 06)
- **Fecha:** 2026-11-07 19:41 (America/Mexico_City)
- **PR:** [#5](https://github.com/horaciomartinez-svg/hidria-ect/pull/5) — `docs/e1-resuelta` → `main`
- **Head revisado:** `ba67aa84f585b2cd0ceccd2f53e83bfd8f9ce1ae` · **Base:** `main` `8008a648161f36823302429bb302dd832a9ec231`
- **Diff:** 12 archivos, **+1038/−78**, solo documentación (sin `app/`, `supabase/`, `scripts/`, `.github/`, `docs/02` ni migraciones; tampoco `docs/00/01/03/04/05/06/07/08`).
- **CI en `ba67aa8`:** **4/4 check runs `success`** (runs `42435154149` y `42435132975`, `pull_request` + `push`).
- **Estado GitHub:** `mergeable_state: blocked` — efecto del ruleset `proteccion-main` (`required_approving_review_count: 1`); no es un fallo de CI.
- **Veredicto:** **APROBADO.** B1 queda cerrado en ADR-005 §2.5; F1-18 recoge M1/M2/M3/m1/B1; E1 está verificada y documentada; TEAM/ADR-004 coherentes; sin regresión en `docs/02`/migración base ni cambios de código. Quedan **observaciones MENORES** de consistencia documental (no bloquean).

---

## 1. Alcance y método

Revisión acotada a los cinco puntos pedidos por el supervisor (B1, F1-18, E1, TEAM/ADR-004, regresión de `docs/02`/migración base) sobre el diff completo de 12 archivos. Verificación independiente: GitHub MCP/API, `git` local y comprobación de hashes; lectura de ADR-005/ADR-004/TEAM/F0-13/00-LEAD desde el commit `ba67aa8` y de F1-18/F0-06/00-supervisor/QA desde el workspace (coincidentes con el PR).

Evidencia externa verificada (API pública de GitHub, no solo el reporte del supervisor):

- `GET /repos/.../rulesets/26780941`: **`proteccion-main`**, `enforcement: active`, `conditions.ref_name.include: ["refs/heads/main"]`, reglas `deletion`, `pull_request` (`required_approving_review_count: 1`, `dismiss_stale_reviews_on_push: true`, métodos merge/squash/rebase), `required_status_checks` = `Guardas de repositorio` + `Cliente (lint + typecheck + build)`, `non_fast_forward`.
- `GET /repos/.../branches/main`: **`protected: true`** (la protección clásica sigue `enabled:false`; el ruleset es la regla efectiva, como explica F0-13).
- `GET /pulls/5`: **`mergeable_state: blocked`** con head `ba67aa8`; coherente con el ruleset y con la aprobación humana obligatoria.
- `docs/02` y `20261031000000_base_hidria_mdohi.sql`: **SHA-256 `2A7B6F8888040990B109F580F6BE50F7F03BF7D9FF7B2299D7BD50BC85442CB5` en ambos**, sin cambios en el commit del PR.

---

## 2. Verificación de los puntos solicitados

| Punto | Resultado | Evidencia |
|---|---|---|
| **(1) B1 — nombre institucional en ADR-005 §2.5** | ✅ **RESUELTO** | `ADR-005` §2.5: `organizations.name = «SRHDS — Programa HIDRIA»` como **nombre de despliegue**; nombre completo reservado a textos legales/`docs/06`; «sin editar la migración aplicada». Coincide con la migración `20261108010500_f1_00_grants_views_seed.sql:19-23` (aplicada y sin cambios en este PR) y con `docs/00:13` (sigla oficial). **No se crea `M-09`** ni se toca esquema. La cabecera de ADR-005 registra «Re-revisión PR #4: B1 resuelto… sin M-09». |
| **(2) F1-18 ampliado** | ✅ **CORRECTO en lo sustancial** | `F1-18` incluye M1 (`docs/05` BHE-05 vs `docs/02` §3.1 + caso pgTAP `CIR-*`; `write_scope` con `supabase/tests/**`), M2 (estrategia `docs/02` para migraciones posteriores sin romper guarda 3), M3 (`docs/04` §2.3 `api_idempotency` vs `audit_log.meta`), m1 (`invitado`), B1 (nombre de semilla) y corrige el criterio contradictorio: ahora exige `docs/02` byte-idéntico y documentar objetos F1-00 según la estrategia M2, sin editar la base ni la guarda 3. Observaciones menores en §4. |
| **(3) E1 en F0-06/estado** | ✅ **CORRECTO** | `F0-06` anexo «E1 RESUELTA» con ruleset, `protected:true`, PR #4 `blocked` y la prueba de auto-aprobación rechazada documentada en F0-13; `00-supervisor_estado` pasa a «AMARILLO-OPERATIVO con E1 resuelta; E2–E4 abiertas», con tabla E1–E4 actualizada y acciones de usuario. Yo verifiqué por API pública ruleset (`26780941`, `active`, reglas), `branches/main → protected:true` y PR #5 `blocked`; la prueba POST de auto-aprobación no se re-ejecutó (requiere token) y se acepta la evidencia de F0-13. |
| **(4) TEAM.md/ADR-004** | ✅ **COHERENTES** | `TEAM` §7 (merge con 2 revisiones del equipo + aprobación humana del ruleset), §8 (ruleset `proteccion-main`, required checks, `bypass_actors: []`, prohibición de auto-aprobación, salidas del usuario) y §13 (G0 AMARILLO-OPERATIVO con E1 resuelta y E2–E4 abiertas). `ADR-004` documenta E1 resuelta con evidencia API, nueva restricción operativa y salidas; ya no incluye E1 entre las excepciones abiertas. |
| **(5) Regresión `docs/02`/migración base y alcance** | ✅ **SIN REGRESIÓN** | El commit solo toca `coding_team_report01.md`, `TEAM.md`, ADR-004/005, reportes F0, `reports/{qa,reviews}`, `F1-18` y `qa/trazabilidad.md`. **0** archivos en `app/`, `supabase/`, `scripts/`, `.github/`, `docs/02` ni migraciones. Hashes de `docs/02` y base idénticos; guarda 3 en verde en CI. |

---

## 3. Observaciones MENORES (no bloquean)

| # | Archivo (sección) | Observación |
|---|---|---|
| o1 | `decisions/ADR-005` §3 «Consecuencias» | Dice que los objetos de F1-00 se documentan en `docs/01` + «una sección adenda de `docs/02` **sin modificar el archivo base**». Añadir una sección a `docs/02` sí modifica el archivo y rompería la byte-identidad/guarda 3; la frase es contradictoria. F1-18 M2 todavía dice «decidir y documentar en ADR» la estrategia. **Aclarar en F1-18**: p. ej. `docs/02` = base congelada + `docs/01`/`docs/04`/`docs/02b`, o ajuste justificado de la guarda. |
| o2 | `decisions/ADR-005` cabecera y tabla §4 | La tabla de aprobación cita «re-revisión exprés `09998ef`»; debería citar la re-revisión de B1 (PR #4 / esta PR-5) para trazabilidad. El estado «aceptada con condiciones» no es uno de los valores de la plantilla ADR-000 (`propuesta | aceptada | rechazada | sustituida`); usar `aceptada` y dejar las condiciones en la tabla/follow-up. |
| o3 | `tasks/F1/F1-18_docs_sync.md` §Alcance (B1) y nota final | El bullet B1 aún dice «ADR-005 §2.5 **debe** fijar… Decisión del Lead/Revisor», cuando ADR-005 ya lo fijó en este mismo PR; marcarlo como **resuelto por ADR-005 §2.5** (sin M-09). Además, la nota final dice «el revisor pasa el PR #4 a **APROBADO**»: conviene precisar que es aprobación **de especificaciones**, y que el merge de #4 sigue bloqueado por el **VETO de seguridad** (SEC-PR4-01/02) y el ruleset. |
| o4 | `reports/F0/00-LEAD-creacion-equipo.md` §1–§3 y §5/§7 | Quedan datos históricos sin etiquetar: árbol con «F1 17 tareas (F1-00…F1-16)» y «ADR-000…005» (hoy 19 tareas y ADR-006); F0-06 «NO protegida» junto a E1 resuelta; tabla de agentes con el veredicto del revisor de PR #2. §5/§7 citan el fix de seguridad como «M-09/M-10», mientras task-14 lo nombra SEC-PR4-01/02. Marcar el corte histórico o actualizar cifras; no afecta a B1/E1. |
| o5 | `reports/F0/00-LEAD-creacion-equipo.md:§5` | Referencia `reports/security/PR-4_security.md`, que **no se versiona** en este PR por divulgación responsable (decisión correcta). Añadir «reporte interno no versionado aún» para que el enlace no parezca roto en `main`. |
| o6 | `coding_team_report01.md` §5/§9 | Contiene afirmaciones desactualizadas: F1-00 «primer borrador … 37 líneas, aún sin commit» (hoy 8 migraciones committed/applied) y F0-04 «44 tablas/104 políticas» (post-F1-00: 46/105). Al ser un reporte de corte, marcar las secciones como históricas o actualizarlas; no bloquea. |
| o7 | `coding_team_report01.md` ubicación | Está en la raíz del repo, fuera de `hidria_coding_team/reports/`; si el usuario lo pidió así, correcto, pero `TEAM` §10.2 establece la convención de `reports/`. Aclarar en el propio archivo o mover en un follow-up (cosmético). |
| o8 | `tasks/F1/F1-18` M2 | La tarea aún no decide la estrategia M2; es correcto que sea trabajo de F1-18, pero conviene que la decisión (ADR) se registre antes de tocar `docs/02`, para no chocar con la guarda 3. Ya está asignado; sin acción en este PR. |

Ninguna observación contradice B1/E1 ni requiere cambios de esquema; las decisiones M1/M2/M3 siguen asignadas a F1-18.

---

## 4. Seguridad y alcance documental

- El PR no toca código, esquema, CI ni secretos; la revisión de seguridad **no aplica** con justificación (no hay superficie nueva). `PR-4_security.md` **no** se incluye por divulgación responsable: correcto; se versionará tras el fix forward-only de task-14.
- Barrido de los archivos accesibles del PR: sin JWT/tokens/claves/account id ni emails; placeholders `<ACCOUNT_ID>`/`<titular de la cuenta>` se mantienen. No hay PII nueva.
- `PR-4_spec.md` incluido es el reporte histórico con «CAMBIOS SOLICITADOS» (B1/M1–M3). No se reescribe; la resolución de B1 queda registrada en ADR-005 y en esta re-revisión. Recomendación: que el PR de cierre añada una línea de enlace a `PR-5_spec.md` en `PR-4_spec.md` (o que el squash incluya este reporte) para que el lector de `main` no vea un B1 «abierto» ya resuelto.
- `PR-4_qa.md` (AMARILLO con excepción pgTAP) y `qa/trazabilidad.md` (0/39 ejecutadas, task-13) son coherentes con el dictamen de QA; no hay filas declaradas verdes sin ejecución.

---

## 5. Conclusión

**APROBADO** en el head `ba67aa8`. B1 queda cerrado sin `M-09` (ADR-005 §2.5), F1-18 recoge M1/M2/M3/m1/B1 con el criterio de `docs/02` corregido, E1 está resuelta y verificada por API (ruleset `proteccion-main`; `protected:true`; PR `blocked`), TEAM/ADR-004 son coherentes y no hay regresión en `docs/02`/migración base ni cambios de código/migraciones/CI. Las observaciones o1–o8 son de consistencia documental y pueden resolverse en F1-18 o en el commit de cierre; **ninguna bloquea la aprobación de especificaciones de PR #5**.

**Condiciones operativas (no de contenido):**
1. El PR #5 requiere la **aprobación manual del usuario** en GitHub por el ruleset (`required_approving_review_count: 1`; el autor no puede autoaprobar). El supervisor no debe intentar mergear ni usar bypass.
2. Este reporte (`PR-5_spec.md`) queda en el working tree; el Lead debe commitearlo en PR #5 (nuevo head/CI) o en el PR de seguimiento antes del squash, para que `main` tenga el veredicto.
3. PR #4 sigue con **VETO de seguridad** (SEC-PR4-01/02) y head posterior `1fb4ae4`; la aprobación de especificaciones de PR #4 queda pendiente de la re-revisión acotada tras el merge del documental y del delta de seguridad, según lo acordado.

No se ejecutaron comandos Git de escritura, no se mergeó y el único archivo escrito es este reporte. Las verificaciones de ruleset/branch/PR se hicieron por API de solo lectura.
