# F1-03c follow-ups — Edición de empresa propia, `ciclo_vida` y a11y (dev-frontend-pwa)

| Campo | Valor |
|---|---|
| **Tarea** | `task-99` — Follow-ups F1-03c (M1/M2/M3) |
| **Agente** | `dev-frontend-pwa` (04) |
| **Rama** | `feature/F1-03c-followups` |
| **Base** | `main` = `226d885` (mergeado en la rama; `main` ha avanzado sólo con docs/ADR-012) |
| **Alcance** | (M1) edición de la **empresa propia** para rol `empresa` en `/empresas`; (M2) residual `ciclo_vida` UI-only documentado; (M3) revisión manual de a11y con fixes; E2E UI-level + real |
| **Conclusión** | **VERDE local** — `lint` 0 · `typecheck` 0 · `build` 0 · E2E mock **27 passed + 6 skipped**; CI 7/7 en el PR (incluye job E2E real) |

---

## 1. Resumen

- **M1:** el rol `empresa` ya puede **editar su propia ficha** desde el detalle (`/empresas/:id`) y el
  formulario (`/empresas/:id/editar`), reutilizando la RLS de F1-03a (#36, `companies_upd`). La
  acción sólo se muestra si la empresa es su contraparte (`contraparte_user_id = claims.sub`); los
  roles institucionales con escritura mantienen el comportamiento anterior. Un `empresa` que entra
  por URL a una ficha ajena recibe un estado «sin permiso» en la UI (RLS sigue siendo la autoridad).
- **M2:** `ciclo_vida` se mantiene como **regla UI-only** (editable en formulario sólo por
  `admin_institucional`/`coordinador_srhds`); la DB **no** lo canda por decisión de F1-03a
  (#36/docs/01 §5). Se documenta como **residual aceptado**, coordinado con `arquitecto-bd`; no se
  toca `supabase/**` en este PR.
- **M3:** revisión manual de a11y (teclado/foco/landmarks/zoom) con **3 fixes**: foco y anuncio al
  cambiar de ruta SPA, foco al campo desde el resumen de errores, y desbordamiento del header a
  texto 200 %. Se declara explícitamente que el E2E real cubre RLS, **no** a11y, y que la pasada con
  NVDA/VoiceOver queda pendiente (QA/staging), junto con la actualización de `qa/trazabilidad.md` por QA.

## 2. M1 — Edición de la empresa propia (rol `empresa`)

Cambios:

| Archivo | Cambio |
|---|---|
| `app/src/features/empresas/types.ts` | `COMPANY_EDIT_ROLES` (3 roles de escritura + `empresa`) y helper `canEditCompany(role, userId, company)` (institucionales cualquiera; `empresa` sólo si es contraparte) |
| `app/src/router.tsx` | ruta `/empresas/:companyId/editar` con `RequireGlobalRole roles={COMPANY_EDIT_ROLES}` (además de RLS) |
| `app/src/routes/empresas/EmpresaDetailPage.tsx` | acción «Editar empresa» (`data-testid="empresa-editar"`) visible con `canEditCompany`; ya no depende sólo de `COMPANY_WRITE_ROLES` |
| `app/src/routes/empresas/EmpresaFormPage.tsx` | guardas separadas de alta (3 roles) y edición (`canWrite` o contraparte propia); precarga y envío existentes; mensaje específico «Tu rol no permite editar esta empresa» para ficha ajena; `ciclo_vida` sigue deshabilitado para `empresa`/`equipo` |
| `app/src/components/layout/AppShell.tsx` | a11y de navegación SPA (ver §4) |

Comportamiento por rol (UI; RLS decide filas y updates):

| Rol | Detalle | Editar | Alta |
|---|---|---|---|
| admin / coordinador / equipo | sí (según RLS) | «Editar empresa» | sí (3 roles) |
| `empresa` | sólo su ficha (contraparte) o por membresía de diagnóstico | **sólo si es contraparte** | no |
| observador | por membresía de diagnóstico | no | no |
| invitado | 0 filas | no | no |

**E2E (UI-level, mock):** +3 casos en `tests/e2e/empresas.spec.ts`:
1. `empresa` contraparte edita su ficha (PATCH real simulado) y el detalle refleja el cambio.
2. `empresa` no contraparte: sin acción de edición y el formulario la rechaza aunque entre por URL.
3. a11y (foco/tabulación/resumen/landmarks/320 px/200 %).

**E2E real (Supabase local):** `tests/e2e/empresas.local.spec.ts` actualizado — la contraparte
dedicada (`…0008`) abre la edición de A1, cambia `turnos` y verifica el detalle; el seed `…0003`
sigue viendo «Empresa Sintética A» por membresía pero **sin** acción de edición. La RLS de update de
`empresa` ya está cubierta por pgTAP `080` de F1-03a; el job local valida el flujo de UI.

## 3. M2 — `ciclo_vida` UI-only (residual aceptado)

- F1-03a (#36) decidió **no** añadir candado DB para `ciclo_vida` (docs/01 §5/ADR-011); la columna
  es actualizable por quienes tengan `companies_upd` (admin/coord/equipo; `empresa` su ficha).
- La UI mantiene la regla de producto: **sólo admin/coordinación** ven el selector habilitado; los
  demás lo ven deshabilitado con nota. Esto es **UX, no control de seguridad**.
- **Residual aceptado y documentado**; coordinado con `arquitecto-bd`, que **confirmó la opción A**
  (task-99 M2): no se añade trigger/pgTAP; si M2-06 lo exige, se planifica como tarea DB aparte de
  su scope. La regla UI-only **no** es control de seguridad y así debe reflejarse en spec/seguridad.
- Sin cambios en `supabase/**` ni `docs/**`.

## 4. M3 — Revisión manual de a11y (estados reales vs mock)

**Cobertura declarada:** E2E real = RLS funcional; **no** cubre a11y. La a11y de M1 se revisó con
E2E mock (Chrome) + revisión manual de teclado/foco/zoom/landmarks. NVDA/VoiceOver **no** disponibles
en este entorno → pasada con lector de pantalla **pendiente** (QA/staging), declarada en
`qa/trazabilidad.md` por QA.

Corregido en este PR:

1. **Foco y anuncio al cambiar de ruta SPA:** `AppShell` enfoca `<main id="contenido">` en cada
   cambio de `pathname` y anuncia «Contenido actualizado» en una región `aria-live="polite"`
   (`data-route-announcer`). Verificado: tras navegar por el menú, `document.activeElement.id === 'contenido'`.
2. **Resumen de errores navegable:** los enlaces del resumen ahora mueven el **foco** al campo
   (`field.focus()`), no sólo hacen scroll; verificado con teclado (clic en enlace → campo enfocado).
3. **Desbordamiento a texto 200 %:** los controles del header desbordaban la página 17 px a 640 px
   con `root font-size: 200 %`; se corrigió con `flex-wrap`, `min-w-0` y `truncate` en header/menú.
   Ahora overflow de página **≤ 1 px** en formulario y lista.

Verificado además (correcto, sin cambios): labels `htmlFor`, requeridos con `aria-required`/texto
sr-only, errores `role=alert`+`aria-invalid`/`aria-describedby`, tabla con `caption`/`scope`,
landmarks (`main`, `banner`, `contentinfo`, `nav`) y `aria-current` del módulo activo, foco visible
global (outline 2 px), 320 px sin scroll horizontal de página, orden de tabulación natural del
formulario.

**Limitaciones explícitas:** contraste revisado por tokens/estáticos (no herramienta de contraste en
vivo); lector de pantalla real pendiente; zoom 400 % y 320 px @ 200 % no probados exhaustivamente →
QA decide si ampliar suite/atribución.

## 5. Archivos

- `app/src/features/empresas/types.ts` — `COMPANY_EDIT_ROLES`, `canEditCompany`.
- `app/src/router.tsx` — guarda de edición con `COMPANY_EDIT_ROLES`.
- `app/src/routes/empresas/EmpresaDetailPage.tsx` — acción de edición según ownership.
- `app/src/routes/empresas/EmpresaFormPage.tsx` — edición propia, rechazo de ficha ajena, foco del resumen de errores.
- `app/src/components/layout/AppShell.tsx` — foco/anuncio de ruta y header responsive a zoom.
- `tests/e2e/empresas.spec.ts` — +3 casos (edición propia, rechazo, a11y).
- `tests/e2e/empresas.local.spec.ts` — edición real de la contraparte y expectativa actualizada.
- Este reporte.

## 6. Evidencia (local, Chrome)

```
npm run lint       → eslint src ..................................... EXIT 0
npm run typecheck  → tsc --noEmit && tsc -p tsconfig.sw.json --noEmit  EXIT 0
npm run build      → … vite build ................................... EXIT 0
                     PWA v2.0.0 · injectManifest · precache 11 entries (577.30 KiB)
npm run test:e2e   → 27 passed + 6 skipped (11 shell, 14 M1 mock, 2 guard) EXIT 0
```

Los 6 tests del spec local (E2E real) se ejecutan en el job CI `E2E real M1 (Supabase local)`
(7 checks: Guardas, Cliente, Deno, pgTAP, E2E, Seguridad + E2E real M1). **CI 7/7 verde** en el head
`05b4a16` (runs `43638655118` PR y `43638659622` push). No se ejecutó localmente (sin
Docker/CLI Supabase), igual que en F1-03c.

## 7. Pendientes / coordinación

1. **QA (M3):** actualizar `reports/qa/F1-03c_a11y.md` y `qa/trazabilidad.md` con esta revisión
   manual (mock+manual, no lector de pantalla) y programar la pasada NVDA/VoiceOver; re-ejecutar
   suite mock 27/6 y CI 7/7 sobre el head del PR.
2. **`arquitecto-bd` (M2):** confirmado **opción A** (residual documentado); no se añade
   pgTAP/trigger en task-99. Si M2-06 lo exige, tarea DB aparte.
3. **Spec/seguridad/QA:** revisión del PR (sin cambios en `supabase/**`/`docs/**`; edición propia
   sólo si contraparte en UI, RLS autoridad; sin datos reales).
4. **No reabre #43/F1-03c**; los cambios de `tests/e2e/empresas.local.spec.ts` mantienen el job real
   verde (expectativas actualizadas al nuevo comportamiento).

*Reporte de `dev-frontend-pwa` para task-99 (F1-03c follow-ups).*
