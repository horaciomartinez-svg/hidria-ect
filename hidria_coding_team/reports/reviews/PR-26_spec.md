# Revisión de especificaciones — PR #26 — candado de UPDATE de `diagnostics` (task-59)

- **Revisor:** `revisor-especificaciones` (agente 06)
- **Fecha:** 2026-11-08 13:36 (America/Mexico_City)
- **PR:** [#26](https://github.com/horaciomartinez-svg/hidria-ect/pull/26) — `fix/F1-task59-update-lock` → `main`
- **Head revisado:** `5d84a20a9b62477e422a92240f6ccd54b5f0a7ac` (1 commit, 6 archivos, +223/−13; base `main@8e4e258`).
- **CI en `5d84a20`:** 10/10 `success` (Guardas, Cliente, Deno, pgTAP ×2, E2E Playwright ×2); pgTAP 6/6 suites, **133** aserciones; `schema_migrations`=20; `mergeable_state: clean`.
- **Veredicto:** **APROBADO** (task-59), con **condiciones documentales/de cobertura** no bloqueantes: corregir la afirmación «RPC security definer» de ADR-010 (el trigger actual solo permite `service_role`) y añadir tests de folio/service_role y campos de gate restantes; no afectan al candado principal.

---

## 1. Alcance y verificación

Revisados: `20261108040000_f1_00_task59_update_lock.sql`, `050_f1_00_security_delta.sql`, `ADR-010-candado-update-diagnostics.md`, `docs/04` §2.5, `F1-00_task59_update_lock.md` y `F1-00_res1_fixes.md`; contraste con `docs/01` §5, el trigger/phase gate en BD y el residual B2 de PR #19. Sin cambios en `supabase/functions/**`, `app/**`, migraciones previas ni `docs/02`.

## 2. Lo que PASA

| Criterio | Resultado | Evidencia |
|---|---|---|
| **Folio inmutable en UPDATE** | ✅ | `trg_diagnostics_update_lock` L18-21: `new.folio is distinct from old.folio` → `42501`, para cualquier rol (incluido service_role); test 050 con `MDOHI-FAKE-999` → 42501. |
| **Campos de gate/estado solo service_role/EF** | ✅ | L26-41 bloquea a `auth.uid() is not null` los 10 campos; test combinado estado/reporte/bitácora/avance/cat → 42501; `service_role` actualiza `estado` → OK. |
| **`fase_actual` por phase gate** | ✅ | El trigger no duplica la fase; sigue `diagnostics_phase_gate`; test 1→6 → P0001 `Gate F2`. |
| **Campos no-gate** | ✅ | `fecha_fin` actualizable por coordinador; test `lives_ok`. |
| **Forward-only / base / docs/02** | ✅ | Migración nueva; no se editaron migraciones aplicadas, base ni `docs/02`; 20 migraciones; docs/04 sí se actualiza (permitido). |
| **Docs/04 §2.5** | ✅ | Documenta folio inmutable, campos de gate solo EF/service_role y UPDATE directo → 42501; coherente con docs/01 §5 (los roles de `diagnostics_upd` no cambian; el trigger limita columnas). |
| **ADR-010 / reporte** | ⚠️ con condición | Decisión y alternativas documentadas; el reporte F1-00 corregido a «folio server-side en INSERT; UPDATE cerrado por task-59». Ver M1. |
| **Tests/planes** | ✅ | `050` plan 28 (+4), total 133; CI pgTAP verde. |
| **Alcance/sin secretos** | ✅ | 6 archivos: migración, tests, docs/04, ADR, reportes; sin funciones/app; sin secretos. |

## 3. Hallazgos

### M1 — MAYOR: ADR-010 afirma «RPC security definer» cuando el trigger solo permite `service_role`

`ADR-010` §2 y `F1-00_task59_update_lock.md` §2 dicen que EF-01/EF-07 pueden usar **`service_role` o RPC security definer** y que `auth.uid()` es NULL en service_role. El trigger usa exactamente `auth.uid() is not null` para bloquear. Una función `SECURITY DEFINER` invocada por un usuario autenticado **conserva** el `auth.uid()` del usuario (el `current_user` cambia, no el claim), por lo que el trigger **también bloquearía esa RPC**. `docs/04` §2.5 es correcto al decir solo `service_role`; la contradicción está en ADR/reporte.

**No es blocker del candado actual** (las EF usan service_role y no hay RPC de UPDATE), pero debe corregirse antes de M2/F1-04: o se elimina la mención RPC y se declara EF-only con `service_role`, o se implementa un mecanismo explícito (p. ej. función auditada/rol de confianza) y se prueba. No dejar una ruta documentada que el trigger rechaza.

### m1 — Cobertura de tests incompleta para dos invariantes declaradas

- **Folio inmutable «para todos los roles»:** el test 050 solo prueba coordinador; no prueba `service_role` (aunque el código bloquea antes de mirar `auth.uid()`, debe fijarse con test).
- **Campos de gate restantes:** el test combinado cubre estado/reporte/bitácora/avance/cat, pero no `semaforo_atraso`, `ivoh_actual`, `brecha_pct`, `proximo_hito` ni `reprogramacion_justificacion` por separado; el trigger los bloquea, pero un test evita regresiones.
- **`service_role`**: solo se prueba `estado`; añadir un caso folio y otro de campo de gate para confirmar la ruta EF.

### m2 — ADR-010 sin tabla de aprobación/evidencia de sign-off

El ADR se marca «Aceptado» y cita sign-off de seguridad, pero no incluye la tabla de aprobación (supervisor/revisor/seguridad) que usan ADR-007/008/009. Es trazabilidad, no producto; añadirla antes de M2/F1-04.

### m3 — `docs/01` §5 no explicita la restricción por columna

`docs/01` sigue diciendo que `diagnostics` DML es coordinador/equipo/empresa; el trigger limita columnas de gate a `service_role`. No hay contradicción de roles (los no-gate siguen permitidos), pero conviene una nota en F1-18/docs/01 para que la matriz no induzca a pensar que un UPDATE directo puede cambiar `estado/reporte/...`; docs/04 ya lo documenta.

## 4. Conclusión

**APROBADO** para el squash de PR #26: el residual B2/folio queda cerrado con trigger, tests, ADR, docs/04 y CI 133/133; no se toca base/`docs/02` ni migraciones previas. Condiciones no bloqueantes antes de M2/F1-04: corregir la mención RPC del ADR/reporte (o implementar el mecanismo), añadir los tests de folio/service_role y campos de gate restantes, y completar la tabla de aprobación del ADR. No se ejecutaron comandos Git de escritura ni merges; este reporte es el único archivo escrito.
