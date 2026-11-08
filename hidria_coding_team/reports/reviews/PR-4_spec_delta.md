# Re-revisión acotada de PR #4 — APROBADO (F1-00, head 4e2341d)

- **Revisor:** `revisor-especificaciones` (agente 06)
- **Fecha:** 2026-11-07 19:54 (America/Mexico_City)
- **PR:** [#4](https://github.com/horaciomartinez-svg/hidria-ect/pull/4) — `feature/F1-00-migraciones` → `main`
- **Head revisado:** `4e2341d41af7b2e1206fea5f61a9247c8b5d0813` (6 commits, 16 archivos, +1742/−0)
- **Base original del PR:** `8008a64` · **`main` actual:** `afffb6c` (PR #5 documental mergeado; squash `afffb6c`, 2026-11-08T01:51:32Z)
- **CI en `4e2341d`:** 4/4 `success` (runs `42435395966` y `42435399700`, `pull_request` + `push`).
- **GitHub:** `mergeable_state: clean`; required checks `strict=false` → no requiere rebase; ruleset `proteccion-main` con `required_approving_review_count = 0` (verificado por API), `required_status_checks` y `non_fast_forward` intactos, sin bypass.
- **Veredicto:** **APROBADO** (especificaciones) con **2 condiciones de seguimiento** (RES-1/task-18 antes de F1-04/M2 y QA/task-13 antes de G1). B1 está cerrado en `main`; el delta de seguridad no introduce cambios de contrato/metodología y las migraciones son forward-only e idempotentes.

---

## 1. Alcance

Re-revisión acotada al delta pendiente tras `reports/reviews/PR-4_spec.md`:

1. **B1** — comprobar que el cierre del PR #5 está en `main` (`ADR-005 §2.5`) y que el SQL de F1-00 es coherente.
2. **F1-18** — comprobar que `main` contiene M1/M2/M3/m1/B1 y el criterio de byte-identidad corregido.
3. **Delta de seguridad** — `supabase/migrations/20261108010800_f1_00_security_fix.sql` (SEC-PR4-01/02/05/06), suites `010`/`040`/`050`.
4. **m2/m5** — aserciones M-06 en `040` y actualización del reporte F1-00.
5. **Regresión** — guarda 3 (`docs/02` ↔ migración base), alcance sin `app/`/`scripts/`/`.github/`, CI y secretos.

## 2. Verificación

| Punto | Resultado | Evidencia |
|---|---|---|
| **B1 — ADR-005 §2.5 en `main`** | ✅ **CERRADO** | `main` (`afffb6c`) contiene ADR-005 §2.5: `organizations.name = «SRHDS — Programa HIDRIA»` como nombre de despliegue, nombre completo reservado a textos legales/`docs/06`, **sin `M-09`** y sin editar la migración. Coherente con `20261108010500_f1_00_grants_views_seed.sql:19-23` (ya aplicada; sin cambios en #4) y con `docs/00:13`. |
| **F1-18 en `main`** | ✅ **CORRECTO en lo sustancial** | `F1-18` en `main` incluye M1 (`docs/05` BHE-05 vs `docs/02` + caso `CIR-*`), M2 (estrategia `docs/02` sin romper guarda 3), M3 (`docs/04` §2.3), m1 (`invitado`) y B1; el criterio exige `docs/02` byte-idéntico y prohíbe editar la base/guarda. Observación menor o2. |
| **Delta SEC-PR4-01** | ✅ **CORRECTO** | `20261108010800_f1_00_security_fix.sql:17-19`: revoca INSERT/UPDATE/DELETE de `v_quiz_questions` a `authenticated` (y `service_role`), conserva SELECT; verificado en BD: SELECT=true, INSERT/UPDATE/DELETE/MAINTAIN=false; `v_quiz_questions` sin columna `correcta` (suite 010). |
| **Delta SEC-PR4-02** | ✅ **CORRECTO en lo aplicado** | `20261108010800:37-122` recrea las 7 políticas `FOR ALL` con `WITH CHECK` completo; verificado en BD: 7/7 tienen `with_check` no nulo; `profiles_write` impide que `coordinador_srhds` asigne `admin_institucional`; suite 050 cubre negativas de invitado/observador y no escalada de coordinador. **RES-1** documentada abajo. |
| **SEC-PR4-05/06** | ✅ **CORRECTO** | `revoke maintain` a roles API (`:24`) y `revoke select on all sequences` dejando `USAGE` (`:29`); BD: MAINTAIN=false en `v_quiz_questions`; requisito PG ≥16 queda como nota de task-18. |
| **Delta forward-only/idempotente** | ✅ | Migración nueva, `revoke/grant` + `drop policy if exists`/`create policy`; no edita migraciones aplicadas ni `docs/02`; **12** filas en `schema_migrations` (3 base + 9 F1), verificado en BD. |
| **m2 — M-06 en pgTAP** | ✅ | `040_f1_00_enforcement_realtime.sql:75-90` añade 6 aserciones de `fn_diag_role`/`fn_is_diag_member` (privilegios, rol miembro/no miembro); `plan(15)` coherente con las aserciones. |
| **m5 — head del reporte** | ⚠️ **PARCIAL** | `F1-00_arquitecto-bd_migraciones.md:8-13` sigue citando head `4b057b3` y CI de `4b057b3`; no cita `4e2341d`. `F1-00_delta_seguridad.md:6-10` cita head de seguridad `4b057b3` y «head previo 1fb4ae4». El contenido es correcto, pero la trazabilidad del head final debe actualizarse (o1/o6). |
| **Regresión guarda 3** | ✅ | `docs/02` y `20261031000000_base_hidria_mdohi.sql` con SHA-256 `2A7B6F8888040990B109F580F6BE50F7F03BF7D9FF7B2299D7BD50BC85442CB5` en ambos; `git diff 4b057b3..4e2341d -- docs supabase/migrations/20261031000000_base_hidria_mdohi.sql` vacío; CI guarda 3 verde. |
| **Alcance** | ✅ | Delta de 5 archivos en `4b057b3..4e2341d` (migración, suites 010/050, reportes F1-00); 0 archivos en `app/`, `scripts/`, `.github/`; sin secretos (barrido de los archivos del delta: 0 patrones JWT/tokens/claves). |
| **CI** | ✅ | 4/4 `success` en `4e2341d` (runs 42435395966/42435399700). QA mantiene **AMARILLO** por pgTAP no ejecutado (task-13), aceptado como excepción antes de G1. |

## 3. RES-1 — condición residual (no bloquea el merge de F1-00; sí F1-04/M2)

`20261108010800:48-57` recrea `diagnostics_write` así:

```sql
using (
  public.is_tenant_member(organization_id)
  and public.my_diagnostic_role(id) in ('coordinador','equipo')
)
with check (
  public.is_tenant_member(organization_id)
  and public.my_diagnostic_role(id) in ('coordinador','equipo')
);
```

En **INSERT** el diagnóstico aún no existe y no hay `project_members` para `new.id`, por lo que `my_diagnostic_role(id)` devuelve NULL y **todo INSERT de `diagnostics` queda denegado para `authenticated`** (confirmado en BD: `with_check` contiene esa condición; `diagnostics_write` no tiene rama INSERT). Esto contradice `docs/01` §5 (tabla de DML: `companies, diagnostics` → `coordinador/equipo/empresa` según módulo) y deja M2 sin creación por PostgREST. La seguridad lo clasificó como **RES-1**, sin veto, y creó **task-18** (política INSERT separada o ADR EF-only + prueba positiva) para resolverlo **antes de F1-04/M2**.

**Condición de esta aprobación:** F1-00 puede mergearse porque su alcance no ejercita la creación de diagnósticos, pero **F1-04/M2 no debe iniciarse** hasta que task-18 cierre RES-1 (y, si se opta por EF-only, exista ADR + alineación de `docs/01`). No es un hallazgo nuevo de este delta: está documentado y asignado.

## 4. Observaciones menores

| # | Archivo | Observación |
|---|---|---|
| o1 | `reports/F1/F1-00_arquitecto-bd_migraciones.md:8-13` | Sigue citando `4b057b3` y sus runs; actualizar al head final `4e2341d` (runs 42435395966/42435399700) o indicar «head de contenido vs head de delta». |
| o2 | `tasks/F1/F1-18_docs_sync.md` (B1) | El bullet B1 en `main` aún dice «ADR-005 §2.5 **debe** fijar… Decisión del Lead/Revisor»; ya está resuelto en `main`. Marcarlo como resuelto (sin M-09) para que F1-18 no lo reabra. |
| o3 | `20261108010800:37-46` + `docs/01` §5 | `companies_write` limita a `admin_institucional/coordinador_srhds/equipo`; `docs/01` §5 cita `coordinador/equipo/empresa` para `companies/diagnostics`. Verificar en task-18/F1-18 si `empresa` debe poder crear/editar su empresa; si no, documentar la restricción (ADR/docs) para no dejarla como contradicción. |
| o4 | `reports/F1/F1-00_delta_seguridad.md:6-10` | Dice que el PR «queda a la espera de la re-revisión de seguridad»; ya fue re-revisado y el veto se levantó (`PR-4_security_delta.md`). Actualizar la frase al estado final. |
| o5 | `20261108010800:24` | `revoke maintain` exige PostgreSQL ≥16 (el proyecto está en 17.11). Documentar el requisito para staging en task-18 o `docs/07`; no bloquea. |
| o6 | `reports/security/PR-4_security_delta.md` | No está en el diff de #4 (divulgación responsable hasta el fix). Si se versiona después, enlazarlo desde `F1-00_delta_seguridad.md`; no es un requisito de este merge. |

## 5. Conclusión

**APROBADO (especificaciones)** para el merge de PR #4 en `4e2341d`.

- B1 está cerrado en `main` (`afffb6c`, ADR-005 §2.5) sin M-09 y la migración 10500 no se editó; F1-18 está en `main` con M1/M2/M3/m1/B1.
- El delta de seguridad es forward-only, idempotente, no toca la base ni `docs/02`, aplica los fixes SEC-PR4-01/02/05/06 y no introduce cambios de contrato/metodología; 12 migraciones aplicadas; CI 4/4; sin secretos.
- Única condición funcional: **RES-1/task-18 antes de F1-04/M2** (no bloquea F1-00); **QA/task-13 antes de G1** (AMARILLO ya conocido).
- Observaciones o1–o6 son de trazabilidad/documentación y pueden resolverse en el PR de seguimiento; no bloquean.

Con este APROBADO + CI verde en `4e2341d`, el supervisor puede ejecutar el squash de #4 y cerrar F1-00/task-9. No se ejecutaron comandos Git de escritura ni merges; el único archivo escrito es este reporte.

---

*Anexo de `reports/reviews/PR-4_spec.md`. La revisión anterior conserva su veredicto CAMBIOS SOLICITADOS como registro histórico; el veredicto vigente para el merge es el de este documento.*
