# F1-03b — UI M1 Empresas (dev-frontend-pwa)

| Campo | Valor |
|---|---|
| **Tarea** | `task-81` — F1-03b (archivo `tasks/F1/F1-03_m1_empresas.md`; F1-03a DB/RLS la lleva el arquitecto) |
| **Agente** | `dev-frontend-pwa` (04) |
| **Rama** | `feature/F1-03b-empresas-ui` |
| **Base** | `main` = `cc32fde` (F1-02b mergeada) |
| **Alcance** | Rutas `/empresas` (lista, alta, detalle, edición) con **PostgREST + RLS**, sin EF en F1-03; validaciones y a11y; E2E con fixtures sintéticos |
| **Conclusión** | **VERDE** — `lint` 0 · `typecheck` 0 · `build` 0 · E2E **17/17** (11 shell + 6 M1) en local |

---

## 1. Resumen

- **UI funcional de M1** sobre el shell existente: lista con búsqueda y filtros (giro, municipio,
  ciclo de vida), alta, detalle y edición, con estados **carga / vacío / error / sin permiso /
  offline / configuración incompleta**.
- **Contrato:** `docs/01` §4.1 y `docs/02` (`public.companies`). Consumo **PostgREST directo**
  (`GET/POST/PATCH /rest/v1/companies`), sin endpoints inventados ni EF. `organization_id` sale del
  claim de sesión; `id`/fechas los asigna el servidor.
- **Lectura = RLS:** las rutas de lista/detalle usan sólo `RequireAuth`; una `empresa` con
  membresía puede leer su empresa (la RLS decide filas), un `invitado` sin membresía verá vacío/403.
  La **escritura** sigue gateada en la UI además de RLS.
- **B2 (create→read) provisional:** hasta que F1-03a publique `companies.created_by` +
  `companies_sel` del creador, el **alta está restringida a admin/coordinación** (CTA oculto para
  `equipo`, con nota de pendiente); el E2E de alta→lectura es de UI (mock documentado). La
  verificación real de create→read irá en la suite pgTAP de F1-03a.
- **E2E Playwright (12 casos M1 / 23 totales):** lista, alta→lectura (admin), edición, búsqueda y
  filtros con sanitización, detalle, empresa con membresía, empresa ajena 0 filas, 403 de RLS,
  validación sin POST, error con reintento y offline, con fixtures sintéticos (`.invalid`).

---

## 2. Rutas y pantallas

| Ruta | Pantalla | Acceso | Notas |
|---|---|---|---|
| `/empresas` | `EmpresasListPage` | `RequireAuth` (RLS decide filas) | búsqueda + filtros; tabla accesible; CTA «Alta» sólo si el rol puede crear |
| `/empresas/nueva` | `EmpresaFormPage` (create) | **admin/coordinación** (temporal, B2/F1-03a) | formulario en 3 fieldsets; validación; alta |
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
  como asignada por coordinación. El trigger server-side (perfil del tenant, `global_role='empresa'`
  y sólo admin/coord) queda en **F1-03a**; la UI no envía UUID libre (el E2E lo verifica).
- `ciclo_vida` (enum de 6): editable sólo para `admin_institucional`/`coordinador_srhds`; para
  `equipo` se muestra deshabilitado con nota (M5). Las transiciones no se inventan en cliente.
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

- **Estado en `main@a0db8a1`:** #32 separó `companies_write` en `companies_ins/upd/del`; el SELECT
  de `companies` queda por `companies_sel` (membresía de diagnóstico/agregado SRHDS), y `equipo`
  puede insertar pero **aún no existe lectura del creador** (B2).
- **Contrato acordado con F1-03a (arquitecto):** añadirá `companies.created_by` (BEFORE INSERT,
  `auth.uid()`) y `companies_sel` permitirá al creador leer su empresa; trigger de validación de
  `contraparte_user_id` (existencia, mismo tenant, `global_role='empresa'`, sólo admin/coord);
  `ciclo_vida` sin candado adicional (documentado). La UI actual es compatible sin cambiar columnas.
- **Mientras F1-03a no esté en `main`:** el alta está limitada a admin/coordinación (B2 provisional);
  `equipo` conserva lectura (RLS) y edición si la RLS la permite; el E2E de alta→lectura usa mock de
  PostgREST y está documentado como UI-level (la prueba real será pgTAP F1-03a).
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
- `tests/e2e/empresas.spec.ts` — 6 casos E2E con fixtures sintéticos (mock de PostgREST).

## 7. Evidencia

```
npm run lint       → eslint src ..................................... EXIT 0
npm run typecheck  → tsc --noEmit && tsc -p tsconfig.sw.json --noEmit  EXIT 0
npm run build      → … vite build ................................... EXIT 0
                     PWA v2.0.0 · injectManifest · precache 11 entries (574.79 KiB)
npm run test:e2e   → 23 passed (shell 11 + M1 12) ................... EXIT 0
```

Casos E2E de M1 (fixtures sintéticos; proyecto Supabase ficticio `test.invalid`):

| # | Caso | Resultado |
|---|---|---|
| 1 | lista las empresas visibles para el tenant (admin) | OK |
| 2 | alta → lectura: crea (`POST`, `organization_id` del claim) y se ve en lista y detalle | OK (UI-level; créate→read real en pgTAP F1-03a) |
| 3 | empresa de otra organización: 0 filas ⇒ vacío, sin datos ajenos | OK |
| 4 | 403 de RLS ⇒ aviso «sin permiso», sin listar datos | OK |
| 5 | formulario vacío ⇒ resumen de errores + `aria-invalid`/`aria-required`, sin `POST` | OK |
| 6 | detalle: expediente visible y enlace de edición según rol | OK |
| 7 | `empresa` con membresía lee su empresa y no ve acciones de escritura | OK (B1) |
| 8 | edición: `PATCH` y el detalle refleja el nuevo valor | OK |
| 9 | búsqueda/filtros: consulta PostgREST con términos saneados (`"`, `\`, `:`, unicode) | OK |
| 10 | error del servidor ⇒ estado de error con reintento | OK |
| 11 | offline ⇒ aviso sin prometer persistencia | OK |
| 12 | `equipo`: lee; alta oculta con nota pendiente F1-03a; `/empresas/nueva` ⇒ prohibido | OK |

En el alta se verifica además que **no** se envía `contraparte_user_id` libre (SEC-PR35-01) y que el
formulario no expone ese campo. La autorización efectiva y el `created_by`/ownership real se
verifican en la suite pgTAP de **F1-03a**; este E2E comprueba el manejo de las respuestas de RLS y
la UI, con datos sintéticos y sin secretos.

## 8. Pendientes / coordinación

1. **F1-03a (arquitecto):** `companies.created_by` + `companies_sel` del creador (desbloquea B2 y el
   alta para `equipo`), trigger de validación de `contraparte_user_id` y política de `observador`
   según `docs/01` §5. Cuando esté en `main`: retirar la restricción temporal del alta, volver
   `COMPANY_CREATE_ROLES` a los 3 roles de escritura y sustituir el E2E mock de create→read por la
   verificación real (pgTAP) en F1-03c.
2. **F1-03c:** revisión spec (campos/RLS/a11y), seguridad (fugas, ownership, 0 filas/403) y QA
   (E2E + regresión shell).
3. CI del PR (6 checks, incluido E2E con la suite ampliada a 23 tests).
4. Sin Dexie/offline: documentado y visible en la UI; no se promete persistencia.

*Reporte de `dev-frontend-pwa` para F1-03b.*
