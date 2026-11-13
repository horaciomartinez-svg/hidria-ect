# F1-03b — UI M1 Empresas (dev-frontend-pwa)

| Campo | Valor |
|---|---|
| **Tarea** | `task-81` — F1-03b (archivo `tasks/F1/F1-03_m1_empresas.md`; F1-03a DB/RLS la lleva el arquitecto) |
| **Agente** | `dev-frontend-pwa` (04) |
| **Rama** | `feature/F1-03b-empresas-ui` |
| **Base** | `main` = `40785b4` (F1-03a #36 mergeada: `companies.created_by` + `companies_sel` del creador; #38/#39 incluidos) |
| **Alcance** | Rutas `/empresas` (lista, alta, detalle, edición) con **PostgREST + RLS**, sin EF en F1-03; validaciones y a11y; E2E con fixtures sintéticos |
| **Conclusión** | **VERDE** — `lint` 0 · `typecheck` 0 · `build` 0 · E2E **22/22** (11 shell + 11 M1) en local; CI 6/6 |

---

## 1. Resumen

- **UI funcional de M1** sobre el shell existente: lista con búsqueda y filtros (giro, municipio,
  ciclo de vida), alta, detalle y edición, con estados **carga / vacío / error / sin permiso /
  offline / configuración incompleta**.
- **Contrato:** `docs/01` §4.1 y `docs/02` (`public.companies`). Consumo **PostgREST directo**
  (`GET/POST/PATCH /rest/v1/companies`), sin endpoints inventados ni EF. `organization_id` sale del
  claim de sesión; `id`/fechas y `created_by` los asigna el servidor.
- **Lectura = RLS:** las rutas de lista/detalle usan sólo `RequireAuth`; una `empresa` con
  membresía/contraparte lee su empresa y un `invitado` sin membresía verá vacío/403. La **escritura**
  se gatea en la UI además de RLS.
- **B2 (create→read) cerrado con F1-03a (#36, `main@077d4f3`):** `companies.created_by` (BEFORE
  INSERT, inmutable) + `companies_sel` incluyen al creador, así que el alta vuelve a los 3 roles de
  escritura (admin/coord/equipo) y `insert().select('*')` devuelve la fila al equipo creador.
- **Evidencia separada:** la RLS **real** de create→read, empresa propia/ajena y contraparte la
  verifica la suite pgTAP `080_f1_03_companies.sql` de F1-03a (**24 aserciones**, total 231); el
  E2E de #35 es **UI-level** con proyecto Supabase ficticio/mock (no proclama RLS real).
- **E2E Playwright (11 casos M1 / 22 totales):** lista, alta→lectura, edición, búsqueda y filtros con
  sanitización, detalle, empresa con membresía, empresa ajena 0 filas, 403 de RLS, validación sin
  POST, error con reintento y offline, con fixtures sintéticos (`.invalid`).

---

## 2. Rutas y pantallas

| Ruta | Pantalla | Acceso | Notas |
|---|---|---|---|
| `/empresas` | `EmpresasListPage` | `RequireAuth` (RLS decide filas) | búsqueda + filtros; tabla accesible; CTA «Alta» para los 3 roles de escritura |
| `/empresas/nueva` | `EmpresaFormPage` (create) | admin/coordinación/equipo | formulario en 3 fieldsets; validación; alta |
| `/empresas/:companyId` | `EmpresaDetailPage` | `RequireAuth` (RLS decide) | expediente en `<dl>`; enlace a edición si hay permiso |
| `/empresas/:companyId/editar` | `EmpresaFormPage` (edit) | admin/coordinación/equipo (RLS decide la fila) | precarga desde PostgREST; guarda con `PATCH` |

El registro `M1` de `routes/registry.tsx` usa `TODOS` para la lectura (la RLS es la autoridad); el
router sirve pantallas reales para M1 y placeholders para M2–M13 (sin cambios en las demás rutas).

## 3. Campos y validaciones (docs/01 §4.1)

- Obligatorios: `razon_social`, `nombre_planta`, `giro` (enum de 5), `calle`, `colonia_parque`,
  `cp` (5 dígitos), `municipio`, `organismo_operador`; se marcan con `required`/`aria-required`.
- Opcionales: `lat`/`lon` (rangos −90..90 / −180..180), `empleados` (entero ≥ 0), `turnos`,
  `unidad_produccion`.
- `contraparte_user_id` (**ownership**): **no se captura** en el formulario (SEC-PR35-01); se informa
  como asignada por coordinación. F1-03a aporta el trigger server-side (perfil existente, mismo
  tenant, `global_role='empresa'`, sólo admin/coord; inválido/ajeno → 42501); la UI no envía UUID
  libre (el E2E lo verifica).
- `ciclo_vida` (enum de 6): editable sólo para `admin_institucional`/`coordinador_srhds` (regla
  **UI-only**; F1-03a no añade candado DB); para `equipo` se muestra deshabilitado con nota (M5).
  Las transiciones no se inventan en cliente.
- La validación de cliente **complementa** los `CHECK`/RLS del servidor; nunca los sustituye.

## 4. Accesibilidad

- `<label>` asociado en todos los campos; obligatorios con `required`/`aria-required` y texto
  `sr-only`; hints enlazados por `aria-describedby`.
- Errores: resumen con `role="alert"` y foco al resumen + enlace al campo; `aria-invalid` y
  `aria-describedby` por campo; mensajes específicos.
- Tabla con `<caption>` (sr-only), `th scope="col|row"`; estados con `aria-live="polite"`.
- Botón de envío deshabilitado sin conexión con nota «Requiere conexión»; contraste con tokens
  AA (`semaforo-ok/warn/crit`, `hidria-700`).
- Marca de obligatorios visual (`*` con `aria-hidden`) más texto accesible, sin depender sólo del
  color.

## 5. RLS, tenencia y ownership

- **RLS final en `main@40785b4` (F1-03a #36):** #32 separó `companies_write` en
  `companies_ins/upd/del`; el SELECT usa `companies_sel` = admin/coord agregado, membresía de
  diagnóstico, **creador (`created_by`)** o **empresa con `contraparte_user_id = auth.uid()`**;
  `companies_upd` permite a la empresa editar su ficha; `company_in_tenant` exige mismo tenant
  (cross-tenant → 42501) y `created_by` es inmutable (BEFORE INSERT `auth.uid()`).
- **B2 (create→read) cerrado:** `insert().select('*')` devuelve la fila al equipo creador; el alta
  está disponible para admin/coordinación/equipo (UI) y RLS la autoriza.
- **SEC-PR35-01:** el campo `contraparte_user_id` se retiró del formulario (la UI no fija ownership);
  el trigger `companies_ownership` de F1-03a valida perfil existente, mismo tenant y
  `global_role='empresa'`, y limita la asignación a admin/coord.
- **Ciclo de vida:** F1-03a no añade candado DB (decisión documentada); el gate de UI (sólo
  admin/coord) es **UI-only**.
- La UI: (a) no envía `organization_id` desde el formulario — se toma del claim; (b) no filtra ni
  oculta por tenant; (c) trata 403/42501 como «sin permiso» y 0 filas como «vacío»; (d) no permite
  asignar ownership desde el cliente.

**Límites explícitos:** sin persistencia offline (no Dexie todavía; no se promete guardado local);
sin EF; selector de usuarios para contraparte en tarea posterior; no se inventan reglas de
transición de `ciclo_vida`.

## 6. Archivos

- `app/src/features/empresas/{types.ts,validation.ts,api.ts,hooks.ts}` — modelo, validación, capa
  PostgREST (mapeo de errores PostgREST → estados UI) y hooks con estados.
- `app/src/routes/empresas/{EmpresasListPage.tsx,EmpresaFormPage.tsx,EmpresaDetailPage.tsx,shared.tsx}`.
- `app/src/router.tsx` — rutas reales de M1 (las demás siguen como placeholder).
- `tests/e2e/empresas.spec.ts` — 11 casos E2E con fixtures sintéticos (mock de PostgREST).

## 7. Evidencia

```
npm run lint       → eslint src ..................................... EXIT 0
npm run typecheck  → tsc --noEmit && tsc -p tsconfig.sw.json --noEmit  EXIT 0
npm run build      → … vite build ................................... EXIT 0
                     PWA v2.0.0 · injectManifest · precache 11 entries (576.37 KiB)
npm run test:e2e   → 22 passed (shell 11 + M1 11) ................... EXIT 0
```

**RLS real (F1-03a #36):** suite pgTAP `supabase/tests/080_f1_03_companies.sql` — **24 aserciones**
(agregado, empresa propia/ajena, observador/invitado, **create→read**, contraparte válida/inválida/
cross-tenant, helper cross-tenant, update propio/ajeno, admin/coord); total **231** en la suite. Esa
es la prueba de la autorización real de create→read y ownership; el E2E siguiente es **UI-level**.

Casos E2E de M1 (fixtures sintéticos; proyecto Supabase ficticio `test.invalid`, **no** ejercen RLS):

| # | Caso | Resultado |
|---|---|---|
| 1 | lista las empresas visibles para el tenant (equipo) y CTA de alta | OK |
| 2 | alta → lectura: crea (`POST`, `organization_id` del claim) y se ve en lista y detalle | OK (UI-level; RLS real en pgTAP `080`) |
| 3 | empresa de otra organización: 0 filas ⇒ vacío, sin datos ajenos | OK |
| 4 | 403 de RLS ⇒ aviso «sin permiso», sin listar datos | OK |
| 5 | formulario vacío ⇒ resumen de errores + `aria-invalid`/`aria-required`, sin `POST` | OK |
| 6 | detalle: expediente visible y enlace de edición según rol | OK |
| 7 | `empresa` con membresía lee su empresa y no ve acciones de escritura | OK (B1) |
| 8 | edición: `PATCH` y el detalle refleja el nuevo valor | OK |
| 9 | búsqueda/filtros: consulta PostgREST con términos saneados (`"`, `\`, `:`, unicode) | OK |
| 10 | error del servidor ⇒ estado de error con reintento | OK |
| 11 | offline ⇒ aviso sin prometer persistencia | OK |

En el alta se verifica además que **no** se envía `contraparte_user_id` libre (SEC-PR35-01) y que el
formulario no expone ese campo.

## 8. Pendientes / coordinación

1. **F1-03c:** revisión spec (campos/RLS/a11y), seguridad (fugas, ownership, 0 filas/403) y QA
   (E2E + regresión shell), citando pgTAP `080` como evidencia de RLS real.
2. CI del PR (6 checks, incluido E2E con la suite de 22 tests).
3. Sin Dexie/offline: documentado y visible en la UI; no se promete persistencia.
4. Si el revisor exige E2E **real** contra RLS (Supabase local + seeds), se monta un job de
   integración como tarea aparte (no en #35).

*Reporte de `dev-frontend-pwa` para F1-03b.*
