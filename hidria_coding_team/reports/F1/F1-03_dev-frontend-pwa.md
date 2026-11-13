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
- **RLS es la frontera:** la UI no filtra por tenant; presenta lo que el servidor devuelve. Empresa
  ajena ⇒ 0 filas (estado vacío) y 403 ⇒ estado «sin permiso» (ver §5).
- **E2E Playwright:** alta→lectura, lista, detalle, validación sin POST, 0 filas (empresa ajena) y
  403, con fixtures sintéticos y sin datos reales. La RLS real se valida con pgTAP en F1-03a.

---

## 2. Rutas y pantallas

| Ruta | Pantalla | Rol (UI) | Notas |
|---|---|---|---|
| `/empresas` | `EmpresasListPage` | roles de M1 (admin, coordinador, equipo, observador) | búsqueda + filtros; tabla accesible; CTA «Alta» sólo para roles con escritura |
| `/empresas/nueva` | `EmpresaFormPage` (create) | escritura (`admin_institucional`, `coordinador_srhds`, `equipo`) | formulario en 3 fieldsets; validación; alta |
| `/empresas/:companyId` | `EmpresaDetailPage` | roles de M1 | expediente en `<dl>`; enlace a edición si hay permiso |
| `/empresas/:companyId/editar` | `EmpresaFormPage` (edit) | escritura | precarga desde PostgREST; guarda con `PATCH` |

El registro `M1` de `routes/registry.tsx` se mantiene; el router sirve pantallas reales para M1 y
placeholders para M2–M13 (sin cambios en las demás rutas).

## 3. Campos y validaciones (docs/01 §4.1)

- Obligatorios: `razon_social`, `nombre_planta`, `giro` (enum de 5), `calle`, `colonia_parque`,
  `cp` (5 dígitos), `municipio`, `organismo_operador`.
- Opcionales: `lat`/`lon` (rangos −90..90 / −180..180), `empleados` (entero ≥ 0), `turnos`,
  `unidad_produccion`, `contraparte_user_id` (UUID de `profiles`, asignado por coordinación).
- `ciclo_vida` (enum de 6) visible en el formulario con nota de que la etapa se acuerda con la
  empresa; las transiciones no se inventan en cliente.
- La validación de cliente **complementa** los `CHECK`/RLS del servidor; nunca los sustituye.

## 4. Accesibilidad

- `<label>` asociado en todos los campos; obligatorios anunciados con texto `sr-only`.
- Errores: resumen con `role="alert"` y foco al resumen + enlace al campo; `aria-invalid` y
  `aria-describedby` por campo; mensajes específicos.
- Tabla con `<caption>` (sr-only), `th scope="col|row"`; estados con `aria-live="polite"`.
- Botón de envío deshabilitado sin conexión con nota «Requiere conexión»; contraste con tokens
  AA (`semaforo-ok/warn/crit`, `hidria-700`).
- Marca de obligatorios visual (`*` con `aria-hidden`) más texto accesible, sin depender sólo del
  color.

## 5. RLS, tenencia y ownership

- Política vigente en `main`: `companies_write` (`FOR ALL` con `is_tenant_member(organization_id)` y
  `global_role in ('admin_institucional','coordinador_srhds','equipo')`).
- La UI: (a) no envía `organization_id` desde el formulario — se toma del claim; (b) muestra CTA de
  escritura sólo a los 3 roles de la política; (c) trata 403/42501 como «sin permiso» y 0 filas como
  «vacío»; (d) no filtra ni oculta por tenant del lado cliente.
- **Punto a coordinar con F1-03a (arquitecto):** `docs/01` §5 prevé SELECT de `companies` para
  «miembros del diagnóstico o agregado SRHDS», lo que incluiría lecturas de `observador` y, con
  ownership, de `empresa`. La política actual (FOR ALL) limita SELECT a los 3 roles de escritura.
  La UI ya degrada de forma segura (estado «sin permiso»), y se ajustará si F1-03a amplía la
  política con `companies_sel`. Se reporta en `F1-03c`/spec.

**Límites explícitos:** sin persistencia offline (no Dexie todavía; no se promete guardado local);
sin EF; `contraparte_user_id` se captura como UUID (el selector de usuarios llegará con el
directorio de `profiles` en una tarea posterior); no se inventan reglas de transición de
`ciclo_vida`.

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
npm run test:e2e   → 17 passed (shell 11 + M1 6) .................... EXIT 0
```

Casos E2E de M1 (fixtures sintéticos; proyecto Supabase ficticio `test.invalid`):

| # | Caso | Resultado |
|---|---|---|
| 1 | lista las empresas visibles para el tenant | OK |
| 2 | alta → lectura: crea (`POST`, `organization_id` del claim) y se ve en lista y detalle | OK |
| 3 | empresa de otra organización: RLS devuelve 0 filas ⇒ vacío, sin datos ajenos | OK |
| 4 | 403 de RLS ⇒ aviso «sin permiso», sin listar datos | OK |
| 5 | formulario vacío ⇒ resumen de errores + `aria-invalid`, sin `POST` | OK |
| 6 | detalle: expediente visible y enlace de edición según rol | OK |

La autorización efectiva (RLS de `companies`, tenant/rol/ownership) se verifica en la suite pgTAP
de **F1-03a**; el E2E comprueba que la UI maneja correctamente las respuestas que produce RLS.
No se usan datos reales ni secretos.

## 8. Pendientes / coordinación

1. **F1-03a (arquitecto):** integrar campos/ownership finales y valorar `companies_sel` para
   `observador`/`empresa` según `docs/01` §5; ajustar la UI si cambia la política (sólo GATING de
   botones/estado, sin cambiar el contrato de datos).
2. **F1-03c:** revisión spec (campos/RLS/a11y), seguridad (fugas, ownership, 0 filas/403) y QA
   (E2E + regresión shell).
3. CI del PR (6 checks, incluido E2E con la suite ampliada a 17 tests).
4. Sin Dexie/offline: documentado y visible en la UI; no se promete persistencia.

*Reporte de `dev-frontend-pwa` para F1-03b.*
