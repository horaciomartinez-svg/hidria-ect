# F1-02 · Plan de shell PWA y rutas M1–M13 — Dev Frontend PWA

| Campo | Valor |
|---|---|
| **Tarea** | `task-8` — «F1 · Dev Frontend: plan de shell PWA y rutas» (backlog: `tasks/F1/F1-02_shell_pwa.md`) |
| **Agente** | `dev-frontend-pwa` (04) |
| **Fecha** | 2026-11-07 18:0x (America/Mexico_City) |
| **Rama observada** | `chore/f0-fundacion` @ `90c77ab` (solo lectura; no se hizo checkout, commit ni push) |
| **Alcance de esta ronda** | **Sin cambios de código.** Verificación del scaffold + plan (rutas, Dexie, sync, PWA, a11y) + riesgos/ADRs |
| **Write scope usado** | `hidria_coding_team/reports/F1/F1-02_dev-frontend-pwa_plan.md` (único archivo escrito) |
| **Conclusión** | **AMARILLO** — scaffold sano y verde en CI local, pero **faltan 4 piezas de fundación** y hay **2 huecos de contrato/servidor** que bloquean OFF-02/OFF-03 si no se resuelven por ADR antes de M4/M6 |

---

## 0. Resumen ejecutivo (para el Lead)

1. **Scaffold `app/`: VERDE funcional.** `lint`, `typecheck` y `build` pasan en la raíz del monorepo
   (exit 0 los tres). Bundle 144.78 kB (46.81 kB gzip), 31 módulos, **sin `service_role`**.
2. **Hallazgos del scaffold (ninguno rojo):**
   - **H1 (importante):** `app/tsconfig.json` declara el alias `@/*` → `src/*`, pero
     `app/vite.config.ts` **no** define `resolve.alias`. Hoy no falla porque nada importa `@/`;
     el primer import `@/...` rompe `npm run build`. Se corrige en F1-02 (1 línea).
   - **H2 (importante):** Vite corre con root `app/`, así que carga `app/.env`, **no** el `.env` de la
     raíz donde viven `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. F1-02 debe fijar
     `envDir: '..'` (o crear `app/.env` desde la plantilla) antes de la primera llamada real.
   - **H3 (esperado):** no hay router, ni Dexie, ni `@supabase/supabase-js`, ni `public/` (manifest,
     iconos, SW), ni service worker, ni variables de entorno en runtime, ni tokens semánticos de
     tema (semáforo/line/panel). Todo eso **es** F1-02.
   - **H4 (a11y):** `hidria-500` (#0d8a92) sobre blanco da **4.15:1**: no apto para texto normal
     (AA exige 4.5:1). `hidria-600` (#0d5c63) da ≈7.8:1 (AA/AAA). Regla de tema: texto → 600/700;
     500 solo texto grande o elementos no textuales.
3. **Dos huecos de contrato que requieren ADR (bloquean offline de captura, no el shell):**
   - **G1:** `docs/04` §6 exige `captured_at` por registro **y por campo** para LWW; el DDL
     (`docs/02`) **no tiene ninguna columna `captured_at` ni mapa de sellos por campo** (verificado
     por búsqueda exhaustiva). Sin cambio de esquema, OFF-02/OFF-03 no son implementables.
   - **G2:** no existe EF genérica de escritura. Las tablas encolables (`cat_responses`,
     `balance_flows`, `iih_assets`, …) sólo se pueden escribir por PostgREST directo (las políticas
     RLS lo permiten), y PostgREST **no** honra `Idempotency-Key`; además la escritura directa **no
     escribe `audit_log`** (no hay triggers de auditoría de negocio, solo `trg_audit_hash`), lo que
     contradice `docs/Arquitectura` §11.11 («toda captura … queda en el audit log»).
     Decisión: EF `POST /sync` (Dev EF + Arquitecto) **o** aceptar PostgREST + tabla `sync_ops`
     idempotente y triggers de auditoría. No lo puede decidir el frontend solo.
4. **Nomenclatura:** la cola se llama **`ops_queue`** en el documento normativo (`docs/04` §6), no
   `outbox`. El plan usa `ops_queue` y el término «outbox» solo como sinónimo descriptivo.
5. **Primer entregable F1-02 propuesto:** router + layout + guards + tema + manifest/SW/aviso de
   versión + `lib/db.ts` (esquema Dexie v1 con `ops_queue` y allowlist de gates) + estados
   offline/online + base de accesibilidad, con placeholders M1–M13 y **sin lógica de negocio**.

---

## 1. Evidencia: verificación del scaffold (paso 1)

### 1.1 Comandos ejecutados desde la raíz `C:\Proyectos\hidria`

| # | Comando | Salida relevante | Exit |
|---|---|---|---|
| 1 | `node -v` / `npm -v` | `v24.21.0` / `11.19.0` | 0 |
| 2 | `npm run lint` | `@hidria/app@0.1.0 lint → eslint src`, sin warnings/errores | **0** |
| 3 | `npm run typecheck` | `@hidria/app@0.1.0 typecheck → tsc --noEmit`, sin diagnósticos | **0** |
| 4 | `npm run build` | `tsc --noEmit && vite build` → `✓ 31 modules transformed` · `dist/index.html 0.65 kB` · `dist/assets/index-B96rn2yy.css 7.40 kB (gzip 2.15 kB)` · `dist/assets/index-DMFXj2JN.js 144.78 kB (gzip 46.81 kB)` · `✓ built in 1.53s` | **0** |
| 5 | `git status --porcelain app` | vacío (árbol de `app/` limpio) | 0 |
| 6 | `git ls-files app` | 11 archivos versionados; **`app/dist` no está trackeado** (ignorado por `dist/` en `.gitignore`) | 0 |
| 7 | Búsqueda `service_role\|SERVICE_ROLE\|serviceRole` en `app/dist` | **0 coincidencias** | — |
| 8 | `Test-Path app\public`, `app\.env` | `False`, `False` | — |
| 9 | `node_modules`: `react` ✓, `dexie` ✗, `react-router-dom` ✗, `@supabase/supabase-js` ✗ | — | — |

Conclusión del scaffold: **VERDE** (reproducible, rápido, sin secretos, `dist/` fuera de git).
CI (`.github/workflows/ci.yml`) corre exactamente `npm ci` + lint + typecheck + build en Node 22:
local (Node 24) y CI están alineados por `engines.node >= 20`.

### 1.2 Inventario revisado y observaciones

| Archivo | Estado | Observación |
|---|---|---|
| `app/package.json` | OK | React 18.3 + TS 5.6 + Vite 5.4 + Tailwind 3.4; falta `react-router-dom`, `dexie`, `@supabase/supabase-js` (+ eventualmente `vite-plugin-pwa`, `zod`, `@tanstack/react-query`) |
| `app/vite.config.ts` | **H1** | `port 5173 strictPort`, `outDir dist`, `sourcemap false`; sin `resolve.alias` para `@/*`; sin `envDir` (**H2**) |
| `app/tsconfig.json` | OK | `strict`, `noUnusedLocals/Parameters`, `jsx react-jsx`, `paths @/*` (sin uso aún) |
| `app/tailwind.config.js` | **H3/H4** | solo 6 tonos `hidria.*`; sin tokens semánticos (`ok/warn/crit/line/panel`), sin `darkMode`; `content` correcto |
| `app/src/App.tsx` | OK (placeholder) | lista M1–M13 estática, texto institucional correcto (SDFI · SRHDS); **sin router** |
| `app/src/main.tsx` | OK | `StrictMode` + `createRoot`; sin providers |
| `app/src/index.css` | OK | `@tailwind` + `color-scheme: light`; sin design tokens |
| `app/src/vite-env.d.ts` | OK | tipa `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (solo anon) |
| `app/index.html` | OK | `lang="es-MX"`, viewport, `theme-color #0d5c63` = `hidria-600`; falta `manifest`, `apple-touch-icon`, iconos |
| `app/eslint.config.js` | OK | flat config `tseslint.recommended`; sin `react-hooks` (recomendable añadirlo en F1-02) |
| `.github/workflows/ci.yml` | OK | guardas + cliente; coherente con DoD |
| `.env.example` (raíz) | OK | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` sin valores; `service_role` documentado como solo EF/CI |

---

## 2. Inspección del prototipo `reference/` (paso 2)

`reference/` está **gitignored** (`.gitignore`: `reference/`) — confirma que es guía visual local, no fuente de reglas.

### 2.1 Stack del prototipo vs stack congelado

| Aspecto | `reference/` | HIDRIA (congelado) | Acción |
|---|---|---|---|
| React | `^19.2.0` | **React 18** | No copiar `package.json`; portar JSX a React 18 |
| Router | depende de `react-router@7` **pero no lo usa**: navegación por `useState` (`Vista`) | Router real con URL (necesario para E2E y deep links) | Implementar router de verdad |
| UI | 60+ componentes Radix/shadcn (~30 paquetes `@radix-ui/*`), `recharts`, `react-hook-form`+`zod`, `sonner`, `date-fns`, `lucide-react`, `cmdk` | Tailwind + React 18 | Adoptar **subconjunto**; ver ADR-propuesto 010 |
| Tema | tokens HSL semánticos (`--aqua/--line/--panel/--ok/--warn/--crit`) + modo oscuro + fuentes Inter/Space Grotesk/JetBrains Mono | `hidria-*` claro | Portar tokens semánticos y contrastar (H4) |
| Datos | `src/data/demo.ts` (26 kB, mocks) | Contratos reales `docs/04` | Mocks **solo** para storybook/dev; staging sin mocks (DoD agente 04 §6) |
| Pantallas | Login, Kanban, Empresas, Expediente (9 pestañas), Aula | M1–M13 | Reutilizar estructura visual y jerarquía, **no** lógica |

### 2.2 Pantallas del prototipo → valor para el plan

- `Login.tsx`: patrón de selección de perfil de demostración → **no** se replica (roles vienen de JWT/`profiles`), pero se reutiliza el layout de marca y el copy institucional.
- `Kanban.tsx`: tarjeta-diagnóstico con folio, semáforo, avance, completitud `x/10`, brecha, próximo hito, WIP por columna → **base directa de M11** (ruta `/kanban`).
- `Empresas.tsx` + `TabDatos.tsx`: alta con giro/municipio/organismo/coordenadas → **base de M1**.
- `Expediente.tsx`: 9 pestañas (Resumen · Documentos · CAT · IIH · Balance · Muestreo · IVOH · Bitácora · Reporte) → **base del layout de expediente M2** con rutas hijas.
- `TabCierre.tsx`: bitácora y matriz de reporte → **base de M9/M10**.
- `Aula.tsx`: curso/examen → **base de M12** (F2).

### 2.3 Lo que el prototipo NO puede aportar (y hay que construir desde `docs/`)

- Nada de offline, Dexie, cola, conflictos, service worker, manifest (el prototipo es online y con mocks).
- Nada de gates reales: los botones no consultan `v_diagnostic_completeness` ni EFs.
- Roles de demostración (`coordinador|equipo|empresa`) ≠ `global_role` (6 valores) + rol por diagnóstico.

---

## 3. Plan de rutas M1–M13 (paso 2 — entregable principal)

### 3.1 Convenciones

- **Router:** `createBrowserRouter` (data router) con `RouterProvider`; rutas anidadas por layout.
- **Formato de ruta:** recursos en **kebab-case español** y `:ids` en inglés (`docs/04` §2.2 usa recursos plurales en inglés en la API; la UI usa español institucional). Los `id` son UUID reales, **nunca** ids negativos (`docs/04` §6).
- **Guardas (3 niveles):**
  1. `<RequireAuth>` → sesión Supabase; sin sesión → `/login?next=<ruta>`.
  2. `<RequireGlobalRole roles={[…]}>` → claim `global_role` (`admin_institucional|coordinador_srhds|equipo|empresa|observador|invitado`, `docs/04` §2.1 / `docs/02` `profiles.global_role`).
  3. `<RequireDiagnosticRole roles={[…]}>` → rol **por diagnóstico**; la UI lo lee de `project_members` (función `my_diagnostic_role`), pero **el servidor no confía en el cliente** (`docs/04` §2.1).
- **Canal Realtime** por ruta: `/kanban` + `/panel` → `org:{organization_id}` (`kanban_refresh`); expediente abierto → `diagnostic:{id}`; campana → `user:{user_id}` (`docs/04` §7).
- **Estado por ruta (obligatorio en cada pantalla, DoD agente 04 §6):** carga · vacío · error canónico · offline · conflicto.

### 3.2 Tabla de rutas

> «Contrato» = EF de `docs/04` §3/§4, vista de §9 o tabla con RLS de `docs/02`. **No hay endpoints inventados.**
> Rol: `G` = `global_role`; `D` = rol de diagnóstico (`project_members.role`).

#### Shell y transversales

| # | Ruta | Pantalla | Rol | Contrato / datos | Fase |
|---|---|---|---|---|---|
| S1 | `/login` | Inicio de sesión (Supabase Auth) + aviso de privacidad | público | Auth SDK (`custom_access_token_hook` es config de proyecto, fuera de DDL: `docs/04` §2.1; F1-01) | F1 |
| S2 | `/auth/reset` | Recuperación de contraseña | público | Auth SDK | F1 |
| S3 | `/` | Redirección por rol: `admin_institucional`→`/panel`; `coordinador_srhds`/`equipo`→`/kanban`; `empresa`→`/mis-diagnosticos`; `observador`→`/panel` | G | — | F1 |
| S4 | `/panel` | Tablero de inicio (hitos próximos, mis pendientes, avisos) | G (todos) | `notifications` (RLS `notif_own`), `diagnostics`, `v_diagnostic_completeness` | F1 |
| S5 | `/mis-diagnosticos` | Lista de diagnósticos donde soy miembro | G empresa/observador | `project_members` + `diagnostics` | F1 |
| S6 | `/notificaciones` | Bandeja de notificaciones (`kind` hito/validacion/acuerdo/atraso/firma/curso) | G | `notifications` + Realtime `user:{id}` | F1 |
| S7 | `/offline` | Shell offline (mensaje, cola pendiente, última sincronización) | público | Dexie local | F1 |
| S8 | `/sincronizacion` | **Centro de cola y conflictos**: pendientes, rechazadas, conflictos por campo, reintentar/descartar | G | Dexie `ops_queue`, `sync_conflicts` | F1 |
| S9 | `/proteccion-datos/aviso` | Aviso de privacidad **verbatim** | público | Texto literal de `docs/06` Anexo A (§4) — **no reformular** | F1 |
| S10 | `/proteccion-datos/arco` | Solicitud ARCO (formulario + folio `ARCO-AAAA-NNNN`) | público | `privacy_requests` (`docs/06` §12) — **hueco**: RLS `privacy_tenant` exige `is_tenant_member`; un titular externo no puede insertar → requiere EF/política pública (ADR-015) | F1.5 |
| S11 | `/acerca` | Versión de app/SW, build, entornos, licencia, créditos institucionales | público | `__APP_VERSION__` + `__BUILD_SHA__` | F1 |
| S12 | `*` | 404 con navegación segura | público | — | F1 |

#### M1 · Registro de empresas (`docs/Arquitectura` §5.1)

| # | Ruta | Pantalla | Rol | Contrato / datos | Fase |
|---|---|---|---|---|---|
| M1.1 | `/empresas` | Directorio con filtros (giro, municipio, organismo, ciclo de vida) y semáforo de vigencia | G `admin_institucional`,`coordinador_srhds`,`equipo`,`observador` | `companies` (RLS `companies_write`; lectura por org) | F1 |
| M1.2 | `/empresas/nueva` | Alta (razón social, planta, giro, domicilio, **municipio obligatorio**, organismo operador, lat/lon, empleados, turnos, unidad de producción) | G admin/coordinador | `companies` (insert directo PostgREST) | F1 |
| M1.3 | `/empresas/:companyId` | Expediente maestro con pestañas: Datos · Diagnósticos · Documentos · Contactos · Reconocimientos | G admin/coordinador/equipo/observador; empresa sólo su propia company | `companies`, `diagnostics`, `documents` | F1 |
| M1.4 | `/empresas/:companyId/editar` | Edición + transición de ciclo de vida (`prospecto→convenio_firmado→activa→diagnostico_vigente→plan_accion→ehr`) | G admin/coordinador | `companies.ciclo_vida` (validación de servidor; NOM-151 vía `signatures` en fase 3) | F1 |
| M1.5 | `/empresas/:companyId/diagnosticos/nuevo` | Crear diagnóstico (tipo, fechas 6 semanas, equipo) → folio `MDOHI-AAAA-NNN` **server-side** | G coordinador | `diagnostics` (folio por default de columna/secuencia, `docs/04` §2.5), `project_members` | F1 |

#### M2 · Diagnósticos y gates (`§5.2`)

| # | Ruta | Pantalla | Rol | Contrato / datos | Fase |
|---|---|---|---|---|---|
| M2.1 | `/diagnosticos` | Tabla expedientes (folio, empresa, fase, estado, semáforo, IVOH, brecha, avance) | G admin/coordinador/equipo/observador | `diagnostics` | F1 |
| M2.2 | `/diagnosticos/:diagnosticId` | **Layout de expediente** (header con folio·fase·semáforo·completitud `x/10`·IVOH; barra de 6 semanas; tabs) | D `coordinador`,`equipo`,`empresa`,`organismo_operador`,`observador` | `diagnostics`, `v_diagnostic_completeness` | F1 |
| M2.3 | `…/resumen` (index) | Resumen: gates de la fase, próximo hito, equipo, avance P/R/X, brecha/IVOH vigentes | idem | `diagnostics`, `v_bhe_summary`, `v_ivoh_score`, `logbook_entries` | F1 |
| M2.4 | `…/equipo` | Equipo Triple Hélice y roles por diagnóstico | D coordinador | `project_members`, `profiles` | F1 |
| M2.5 | `…/gates` | Checklist del entregable verificable de la fase + **botón «Avanzar de fase»** (gate duro) | D `coordinador`,`equipo` | **EF-01** `advance-phase` (nunca encolable) + `v_diagnostic_completeness` | F1 |
| M2.6 | `…/reprogramar` | Reprogramación de hito V/R con causa y justificación ≥ 20 caracteres | D coordinador | **EF-12** `reprogram-milestone` (nunca encolable) | F1 |
| M2.7 | `/diagnosticos/:diagnosticId/historial` | Historial/auditoría visible por entidad | G admin/coordinador; observador lectura | `audit_log` (RLS `audit_read`) | F2 |

#### M3 · Repositorio documental (`§5.3`)

| # | Ruta | Pantalla | Rol | Contrato / datos | Fase |
|---|---|---|---|---|---|
| M3.1 | `…/documentos` | Repositorio con versiones, hash, nivel de exposición, marca de agua | D todos (empresa carga; equipo revisa) | `documents` | F1 |
| M3.2 | `…/documentos/cotejo` | Lista de cotejo (7 tipos: layout, planos, parámetros, IIH, balance básico, concesión, permiso, recibos, lab previos) con `No recibido→Recibido→Revisado→Validado R1` | empresa: `no_recibido→recibido`; coordinador/equipo: resto | **EF-03** `checklist/transition` (nunca encolable) + `document_checklist_items` | F1 |
| M3.3 | `…/documentos/subir` | Carga: `presign` → `PUT` directo a R2 → `register` | miembro del diagnóstico | **EF-08** `documents/presign`+`register` (requiere red; no encolable) | F1 |
| M3.4 | `…/documentos/:documentId` | Detalle + descarga con URL prefirmada 15 min | miembro | `GET /documents/{id}/download` (fuera del MVP, `docs/04` §4 EF-08 nota) | F2 |

#### M4 · CAT digital (`§5.4`)

| # | Ruta | Pantalla | Rol | Contrato / datos | Fase |
|---|---|---|---|---|---|
| M4.1 | `…/cat` | Formulario JSON-driven por `cat_items` A–H, guardado parcial, progreso por sección, «No sé» trazable | D empresa (responde), equipo (acompaña) | `cat_items` (plantilla), `cat_responses` (escritura directa RLS `cat_empresa_write/_update`; **offline sí**), `diagnostics.cat_estado` | F1 |
| M4.2 | `…/cat/revision` | Revisión y aclaraciones (R2), evidencias por pregunta | D equipo | `cat_responses.document_id`, EF-08 | F1 |
| M4.3 | `…/cat/envio` | **Enviar** (`en_captura→en_revision`) y **Validar R2** (`→validado_r2`, gate F3) | empresa envía; coordinador/equipo valida | **EF-04** `cat/submit` · `cat/validate-r2` (**gates: nunca encolar**) | F1 |

#### M5 · IIH (`§5.5`)

| # | Ruta | Pantalla | Rol | Contrato / datos | Fase |
|---|---|---|---|---|---|
| M5.1 | `…/iih` | Tabla de activos por etapa (CAP/ALM/TRA/DIS/USO/EVA), 20 columnas en 6 bloques, resumen F5 | D equipo | `iih_assets` (folio por trigger), `iih_stages`, `iih_asset_types` | F2 |
| M5.2 | `…/iih/nuevo` · `…/iih/:assetId` | Alta/edición con mínimos obligatorios por fila y prioridad calculada | D equipo | `iih_assets` (escritura directa; uuid de cliente para idempotencia) | F2 |
| M5.3 | `…/iih/campo` | **Modo campo V1** offline: verificación foliada + fotos + notas georreferenciadas | D equipo | `iih_assets.verificado_v1`, `photo_log` (folio por trigger) | F2 |
| M5.4 | `…/iih/importar` | Importador XLSX oficial | D coordinador/equipo | **EF-09** `import/xlsx` (requiere red) | F2 |
| M5.5 | `…/iih/resumen` | Resumen y lectura orientativa F5 | D todos | vista de resumen (a confirmar con Arquitecto; `docs/02` no la lista) | F2 |

#### M6 · BHE (`§5.6`)

| # | Ruta | Pantalla | Rol | Contrato / datos | Fase |
|---|---|---|---|---|---|
| M6.1 | `…/bhe` | Cabecera: periodo (año de corte, mes inicio), unidad m³, días de operación, producción mensual | D equipo | `water_balances` | F1 |
| M6.2 | `…/bhe/entradas` | Hoja 1: 12 meses × hasta 6 fuentes + fuente del dato/comentario | D equipo | `balance_flows` (`catalog_code` grupo `entrada`), `balance_flow_catalog` | F1 |
| M6.3 | `…/bhe/destinos` | Hoja 2: consumos, descargas, pérdidas, agua incorporada + método de estimación | D equipo | `balance_flows` | F1 |
| M6.4 | `…/bhe/reuso-calidad` | Hoja 3: 4 flujos circulares + 13 parámetros vs límites + dictamen | D equipo | `quality_parameters`, `quality_parameters_catalog`, `lab_results` | F1/F2 |
| M6.5 | `…/bhe/balance` | Hoja 4 **tablero**: balance mensual, brecha m³/%, semáforo >10 %, indicadores base | D todos | vistas `v_bhe_monthly`, `v_bhe_summary`, `v_balance_indicators` (**cifra oficial siempre de la vista**, `docs/04` §9) | F1 |
| M6.6 | `…/bhe/validar` | **Validar R3** (brecha >10 % ⇒ 409 `GATE_BHE_BRECHA`, mensaje canónico) | D coordinador/equipo | **EF-05** `balances/{id}/validate-r3` (**gate**) | F1 |
| M6.7 | `…/bhe/importar` · `…/bhe/exportar` | Interoperabilidad XLSX oficial | D coordinador/equipo | **EF-09** (import); export vía EF futura o cliente (ADR) | F2 |

#### M7 · Muestreo y custodia (`§5.7`)

| # | Ruta | Pantalla | Rol | Contrato / datos | Fase |
|---|---|---|---|---|---|
| M7.1 | `…/muestreo` | Campaña: puntos, paquete de parámetros, plan por punto | D equipo | `samples` | F2 |
| M7.2 | `…/muestreo/:sampleId` | Ficha de muestra + **3 transferencias firmadas** + temperatura/integridad | D equipo, laboratorio (invitado) | `custody_transfers` (escritura directa), `samples` | F2 |
| M7.3 | `…/muestreo/:sampleId/dictamen` | Resultados + dictamen por parámetro/global (bloqueado sin 3 firmas) | D coordinador/equipo | **EF-10** `samples/{id}/dictamen` (**gate**) + `lab_results` | F2 |
| M7.4 | `…/muestreo/campo` | Modo campo offline (códigos, fotos de rotulado, lecturas) | D equipo | `samples`, `field_measurements` (**no existe en DDL**: ver G3) | F2 |

#### M8 · IVOH (`§5.8`)

| # | Ruta | Pantalla | Rol | Contrato / datos | Fase |
|---|---|---|---|---|---|
| M8.1 | `…/ivoh` | Fichas F1–F6: puntaje 0–10 (paso 0.5), nivel de rúbrica, justificación, evidencia vinculada + «evidencia sugerida» de M3–M7 | D equipo | `ivoh_evaluations`, `ivoh_factors`, `ivoh_rubrics`, `ivoh_index_versions` | F1 |
| M8.2 | `…/ivoh/radial` | Radial 6 ejes + total + semáforo (rojo <5 · amarillo 5–7.9 · verde ≥8) | D todos | vista `v_ivoh_score` (oficial) | F1 |
| M8.3 | `…/ivoh/validar` | **Guardar borrador** (`score`) y **Validar R4** (congela) | D coordinador/equipo | **EF-06** `ivoh/{id}/score` · `validate-r4` (**gate**; `trg_ivoh_requires_bhe`) | F1 |

#### M9 · Reporte y Plan de Acción (`§5.9`)

| # | Ruta | Pantalla | Rol | Contrato / datos | Fase |
|---|---|---|---|---|---|
| M9.1 | `…/reporte` | **Matriz 10/10** con `ok` por requisito y enlaces al módulo/ficha que lo acredita | D todos; emisión solo coordinador | vista `v_diagnostic_completeness`, `completeness_items` | F1 |
| M9.2 | `…/reporte/emitir` | **Generar Reporte** (botón habilitado solo 10/10) → PDF en R2 + folio `-R1` | D coordinador | **EF-07** `diagnostics/{id}/emit-report` (**gate**) | F1 |
| M9.3 | `…/alternativas` | Cartera por jerarquía circular (1 Reducir…5 Repensar) con ahorro m³/año, CAPEX/OPEX, retorno, prioridad | D equipo | `alternatives` (escritura directa) | F1 |
| M9.4 | `…/plan-accion` | Plan de Acción Gantt/Kanban/calendario | D equipo | `action_plans`, `action_plan_items` (escritura directa) | F1/F3 |
| M9.5 | `…/reporte/:documentId` | Vista del PDF emitido + descarga prefirmada + (fase 3) sello NOM-151 | D todos (lectura) | `documents`, **EF-13** (fase 3, 501 en F1–F2) | F1/F3 |

#### M10 · Bitácora (`§5.10`)

| # | Ruta | Pantalla | Rol | Contrato / datos | Fase |
|---|---|---|---|---|---|
| M10.1 | `…/bitacora` | Las 8 fichas (V1–V3, R1–R5): folio `BIT-…-NN`, estado, cierre ≤ 24 h, control de avance P/R/X | D todos (firma según ficha) | `logbook_entries`, `logbook_templates` | F1 |
| M10.2 | `…/bitacora/:clave` | Ficha: identificación · participantes · agenda · hallazgos · acuerdos · evidencia · firmas | D equipo captura; empresa revisa; coordinador valida | `logbook_*` (hijas), `photo_log` | F1 |
| M10.3 | `…/bitacora/:clave/cerrar` | **Cerrar ficha** (valida firmas/agenda/evidencia; `cerrada_razon` si > 24 h) | D coordinador/equipo | **EF-02** `logbook/{id}/close` (**gate**) + `trg_logbook_immutable` | F1 |
| M10.4 | `…/bitacora/campo` | Modo campo offline de las visitas V1–V3 | D equipo | Dexie (fichas abiertas), `photo_log` | F1/F2 |
| M10.5 | `…/bitacora/:clave/cambios` | Control de cambios (versión anterior preservada) | D coordinador/equipo | `logbook_change_log` | F1 |

#### M11 · Kanban (`§5.11`)

| # | Ruta | Pantalla | Rol | Contrato / datos | Fase |
|---|---|---|---|---|---|
| M11.1 | `/kanban` | 8 columnas: «Convenio/NDA» · S1…S6 · «Archivado/En seguimiento»; tarjeta-diagnóstico con semáforo/avance/completitud/brecha/IVOH/próximo hito; WIP configurable | G coordinador/equipo/admin; empresa ve solo sus tarjetas | `diagnostics` + `v_diagnostic_completeness` + `v_bhe_summary` + Realtime `org:{id}` (`kanban_refresh`) | F1 |
| M11.2 | `/kanban?vista=gantt` | Gantt de 6 semanas (hitos V/R sobre ruta crítica) | idem | `diagnostics` + `logbook_entries` (fechas) | F2 |
| M11.3 | `/kanban?vista=calendario` | Calendario de visitas/reuniones de todos los diagnósticos | idem | idem | F2 |
| M11.4 | `/kanban?vista=tabla` | Tabla comparativa (empresa, fase, IVOH, brecha, atraso) | idem | idem | F1 |
| M11.5 | `/kanban?vista=reevaluaciones` | Reevaluaciones anuales por ciclo | idem | `diagnostics.tipo='reevaluacion'` | F3 |
| M11.6 | (acción) | Mover tarjeta = **EF-01** (nunca DnD «libre»): el gate del servidor decide; la UI deshabilita con hint si gate/offline | D coordinador/equipo | **EF-01** | F1 |

#### M12 · Aula MD-OHI (`§5.12`, `docs/08`)

| # | Ruta | Pantalla | Rol | Contrato / datos | Fase |
|---|---|---|---|---|---|
| M12.1 | `/aula` | Curso «Taller MD-OHI» (8 módulos, materiales R2 `hidria-docs/aula/…`) | G todos | `course_modules` | F2 |
| M12.2 | `/aula/modulo/:orden` | Unidad: video/materiales + ejercicio corto + autoevaluación (`v_quiz_questions`, sin `correcta`) | G todos | vista `v_quiz_questions` (`module_orden` 1–8), `course_modules.materiales` | F2 |
| M12.3 | `/aula/examen` | Examen final (pool `module_orden=0`, 10 de 24, 30 min, sin materiales) | G todos | vista `v_quiz_questions`; **calificación solo EF-11** | F2 |
| M12.4 | `/aula/resultado` | Resultado + retroalimentación por reactivo (recibida **después** de calificar) | G todos | **EF-11** `quiz/submit` (nunca encolable) + `quiz_attempts` | F2 |
| M12.5 | `/aula/insignia` | Insignia Open Badges 3.0 (issuer SDFI/UCI) verificable/portable | G todos | `profiles.badge_mdohi`, JSON-LD en `audit_log.meta` (`docs/08` §6) | F2 |
| M12.6 | `/admin/aula` | Banco de preguntas y cohortes (solo `service_role`/admin; **el cliente jamás ve `correcta`**) | G admin_institucional | `quiz_questions` (**revoke** a `authenticated`), `course_modules` | F2 |

#### M13 · Informes e indicadores (`§5.13`)

| # | Ruta | Pantalla | Rol | Contrato / datos | Fase |
|---|---|---|---|---|---|
| M13.1 | `/informes` | Tablero SRHDS/estatal: diagnósticos por fase y semáforo, distribución IVOH, brecha promedio, % balance validado, cumplimiento NOM, cartera por jerarquía, cobertura formativa | G coordinador/admin/observador (agregado **anonimizado**) | vistas `v_*` + agregados; sin EF propia | F3 |
| M13.2 | `/informes/exportar` | Informes ejecutivos PDF/Excel (datos agregados) | G coordinador/admin | a definir con Dev EF (no hay EF en `docs/04`) | F3 |
| M13.3 | `/publico/impacto` | Contadores públicos (landing) | público | agregados anonimizados | F3 |

**Recuento:** 12 rutas de shell + 5 M1 + 7 M2 + 4 M3 + 3 M4 + 5 M5 + 7 M6 + 4 M7 + 3 M8 + 5 M9 + 5 M10 + 6 M11 + 6 M12 + 3 M13 ≈ **75 rutas**.
Para **F1-02** sólo se crean el árbol de rutas con `placeholders` (componente `<EnConstruccion modulo="M4" fase="F1"/>`), layouts, guards y las rutas S1–S9, S11, S12, M2.2 (layout), M11.1 (shell vacío).

### 3.3 Árbol de carpetas propuesto (objetivo del agente 04 §5, ajustado)

```
app/src/
├── main.tsx                 # providers: Auth, DB, Query, PWA update, ErrorBoundary
├── App.tsx                  # RouterProvider
├── router.tsx               # createBrowserRouter + guards + lazy()
├── routes/
│   ├── login/  auth/  panel/  empresas/  diagnosticos/
│   ├── expediente/          # layout M2 + subrutas por módulo
│   ├── kanban/  aula/  informes/  sincronizacion/  legal/  sistema/
├── components/
│   ├── layout/ (AppShell, Sidebar, Header, Breadcrumbs, OrgSelector, SessionMenu)
│   ├── gates/ (GateButton, GateStatus, CompletenessMatrix, Semaforo)
│   ├── offline/ (OfflineBanner, QueueBadge, ConflictCenter, UpdateBanner)
│   ├── forms/ (Field, NumberWithUnit, EvidencePicker, SignDialog)
│   └── ui/ (Button, Card, Dialog, Tabs, Table, Badge, Toast…)
├── features/<modulo>/ (hooks + queries + mutations)
├── lib/
│   ├── supabase.ts          # cliente ANON
│   ├── db.ts                # Dexie (espejo + ops_queue + conflictos)
│   ├── sync/ (flusher, lww, conflicts, gates, clock)
│   ├── api/ (ef.ts con Idempotency-Key, errors.ts catálogo §8)
│   ├── realtime/ (channels)
│   └── a11y/ (focus, announce)
├── pwa/ (registerSW, updatePrompt, manifest link)
├── types/ (contract.ts generado, db.ts, errors.ts)
└── styles/ (tokens.css, tailwind preset)
app/public/ (manifest.webmanifest, icons/*, offline.html, robots.txt)
```

---

## 4. Modelo Dexie, cola `ops_queue` y política de gates (paso 3)

### 4.1 Principio: Dexie es el **modelo de lectura** offline; el SW **no** cachea la API

- Réplica selectiva de las tablas/vistas de `docs/04` §9 y de las tablas de captura.
- El service worker **no** guarda respuestas de `*.supabase.co` (ni PostgREST ni Functions ni Realtime):
  el espejo es Dexie (así evitamos datos rancios con RLS y «dos verdades»). El SW sólo precachea
  estáticos y el shell.
- **Nunca** se persisten bytes de documentos `restringido_nda` (sólo metadatos y `r2_key`); las
  URLs prefirmadas (15 min) **no** se cachean.

### 4.2 Esquema Dexie v1 (F1-02) — mínimo para el shell

```ts
// app/src/lib/db.ts  (propuesta; NO implementado en esta ronda)
export interface OpsQueueRow {
  client_op_id: string;          // uuid v4 === Idempotency-Key   (docs/04 §6)
  entity: string;                // p.ej. 'cat_responses' | 'balance_flows' | 'iih_assets'
  op: 'insert' | 'update' | 'upsert';
  entity_id: string;             // uuid local (uuid v4) o clave natural serializada
  payload: Record<string, unknown>;
  captured_at: string;           // sello de CAPTURA (reloj del dispositivo)  docs/04 §6.1
  field_captured_at: Record<string, string>;  // sellos POR CAMPO (LWW)  docs/04 §6.3
  queued_at: string;
  synced_at?: string;
  status: 'queued' | 'syncing' | 'synced' | 'conflict' | 'rejected';
  attempts: number;
  next_attempt_at?: string;
  last_error?: { code: string; message: string; http?: number; ref?: string };
  gate: false;                   // tipado: SIEMPRE false (los gates no se encolan)
}
```

Dexie **v1** (shell): `meta` (clave/valor: `organization_id` activo, `last_sync_at`, `schema_ver`),
`ops_queue`, `sync_conflicts`, `profiles`, `project_members`, `organizations`, `companies`,
`diagnostics`, `notifications`, `completeness` (cache de `v_diagnostic_completeness`),
`logbook_templates`, `cat_items` (plantilla offline para M4).
Dexie **v2+** (una migración forward-only por tarea de módulo):

| Versión | Tablas añadidas | Tarea |
|---|---|---|
| v2 | `documents`, `document_checklist_items` | F1-03/F1-05 |
| v3 | `cat_responses`, `cat_items` (completa) | F1-04 |
| v4 | `water_balances`, `balance_flow_catalog`, `balance_flows`, `quality_parameters_catalog`, `quality_parameters`, `v_bhe_monthly`, `v_bhe_summary`, `v_balance_indicators` | F1-09 |
| v5 | `ivoh_index_versions`, `ivoh_factors`, `ivoh_rubrics`, `ivoh_evaluations`, `v_ivoh_score` | F1-10 |
| v6 | `logbook_templates`, `logbook_entries`, `logbook_agenda`, `logbook_findings`, `logbook_agreements`, `logbook_evidence`, `logbook_participants`, `photo_log` | F1-11 |
| v7 | `iih_stages`, `iih_asset_types`, `iih_assets` | F2 (M5) |
| v8 | `samples`, `custody_transfers`, `lab_results` | F2 (M7) |
| v9 | `alternatives`, `action_plans`, `action_plan_items`, `v_diagnostic_completeness` | F1-12 |
| v10 | `course_modules`, `v_quiz_questions`, `quiz_attempts` (solo lectura) | F2 (M12) |

Reglas de esquema:
- In **todas** las filas espejo: `organization_id` (aislamiento), `_synced_at`, `_dirty: 0|1`, y
  `_base` (copia del último valor confirmado por servidor) para calcular el diff del LWW.
- Índices por consulta real: `diagnostics[organization_id+fase_actual]`, `[estado]`,
  `cat_responses[diagnostic_id]`, `balance_flows[balance_id]`, `ops_queue[status+next_attempt_at]`.
- Upsert local **siempre** en una transacción `rw` que toca `[espejo, ops_queue]` (evita perder el
  cambio si el navegador se cierra entre ambos).
- **Purga por sesión:** al `signOut` (o cambio de `organization_id`) → `db.delete()` y
  `caches.delete()`; no dejar datos de una empresa en un dispositivo compartido.

### 4.3 LWW por campo (diseño, pendiente de G1)

Algoritmo al recibir el estado del servidor para una fila con `_dirty=1`:

```
for campo in union(local.payload, servidor):
  ts_local  = local.field_captured_at[campo] ?? local.captured_at
  ts_server = servidor_field_ts[campo] ?? servidor.updated_at
  si local_valor == servidor_valor         → sin conflicto
  si ts_local > ts_server                  → gana local   (queda en cola)
  si ts_local < ts_server                  → gana servidor (se descarta local; se avisa)
  si ts_local == ts_server o falta un sello → **conflicto** (no se pisa)
```

- Conflicto ⇒ `ops_queue.status='conflict'` **y** fila en `sync_conflicts`
  (`{entity, entity_id, campo, valor_local, ts_local, valor_servidor, ts_servidor, resuelto:null}`)
  visible en `/sincronizacion` (badge en header). **Nunca** se resuelve en silencio (regla dura
  agente 04 §4.2; `docs/05` OFF-03).
- **Sin `field_ts` en el servidor** (hueco G1) el merge por campo se degrada a LWW por fila: **no
  cumple OFF-03**. Por eso G1 es bloqueante para M4/M6, no para el shell.

### 4.4 Cola: envío, reintentos e idempotencia

```
flush():
  lock  = navigator.locks.request('hidria-sync')          // una sola pestaña sincroniza
  filas = ops_queue.where('status').anyOf('queued','syncing')
                    .sortBy('queued_at')                  // FIFO  (docs/04 §6.2)
  para cada fila (1 en vuelo por entidad):
     req  = EF/postgrest + headers { 'Idempotency-Key': client_op_id }
     ok(2xx)  → status='synced', synced_at=now, refrescar espejo desde vistas
     409/422  → status='rejected' + last_error={code,message,ref}; NO reintentar a ciegas
                (mostrar error canónico en la UI; el usuario corrige el dato)
     401      → pausar cola, refrescar sesión; si falla, pedir login (no borrar la cola)
     429/5xx/red → attempts++, backoff exp. con jitter (1s,2s,4s…máx 5 min), next_attempt_at
  limpiar filas 'synced' > 7 días (conservar para evidencia/auditoría local)
```

- **Disparadores del flush:** `online` event, `visibilitychange→visible`, `focus`, intervalo de 60 s con
  conexión, tras cada mutación exitosa, y botón «Sincronizar ahora». `BroadcastChannel('hidria-queue')`
  para que todas las pestañas actualicen el contador.
- **Background Sync API**: opcional (Chromium). No es el mecanismo principal (Safari no lo soporta);
  se registra como mejora y siempre hay fallback en primer plano.
- **Clock skew** (riesgo metodológico real): se estima el desfase contra la cabecera `Date` del
  servidor; si `|skew| > 5 min` se muestra advertencia persistente («el reloj del dispositivo no
  coincide con el servidor; los sellos `captured_at` pueden no ser válidos») y se **bloquea** el
  cierre de bitácora offline. `captured_at` **nunca** se reemplaza por hora del servidor
  (`docs/04` §6.1; agente 04 §4.3). La regla «cierre ≤ 24 h» se mide contra `fecha` del evento
  (EF-02 / TD-8), así que el desfase impacta directamente en un gate.

### 4.5 Política de **gates no encolables** (regla dura)

Conjunto inmutable (tipado `GATES` y `GateButton`):

| EF | Operación | Motivo |
|---|---|---|
| EF-01 | `advance-phase` | gate de fase (un gate offline sería indistinguible de un gate forzado) |
| EF-02 | `logbook/{id}/close` | cierre ≤ 24 h + inmutabilidad |
| EF-03 | `checklist/{id}/transition` | validación R1 terminal |
| EF-04 | `cat/submit` · `cat/validate-r2` | gate F3 |
| EF-05 | `balances/{id}/validate-r3` | regla de brecha |
| EF-06 | `ivoh/{id}/score`(validación) · `validate-r4` | gate F6 |
| EF-07 | `emit-report` | matriz 10/10 |
| EF-10 | `samples/{id}/dictamen` | cadena de custodia |
| EF-12 | `reprogram-milestone` | semáforo/hallazgo |
| (extra) | EF-08 `presign/register`, EF-09 `import/xlsx`, EF-11 `quiz/submit`, EF-13 | requieren red (no gate, pero no encolables) |

Implementación (defensa en profundidad, para que QA pueda verificar):
1. **Tipo**: `enqueue()` sólo acepta `entity ∈ QUEUEABLE_TABLES`; las operaciones de EF van por
   `callEf()` que **no** conoce la cola.
2. **Runtime**: `assertOnline()` lanza `OfflineGateError` y registra un `console.warn` en dev;
   en prod muestra toast «requiere conexión».
3. **UI**: `GateButton` recibe `requiresNetwork` (default `true`) y, si `!online`, aplica
   `disabled` + `aria-disabled="true"` + hint visible (`role="note"`), **sin** llamar a ninguna EF.
   Además `data-gate-blocked="true"` para E2E (OFF-01).
4. **Métrica**: contador `gate_blocked_offline` en `meta` para evidencia (no telemetría externa).

---

## 5. Plan PWA y accesibilidad (paso 4)

### 5.1 Manifest (`app/public/manifest.webmanifest`)

| Campo | Valor |
|---|---|
| `name` | `HIDRIA — Optimización Hídrica Industrial` |
| `short_name` | `HIDRIA` |
| `description` | `Plataforma MD-OHI del Programa Empresas Hídricamente Responsables (SDFI–SRHDS, Gobierno de Tamaulipas)` |
| `lang` / `dir` | `es-MX` / `ltr` |
| `id` | `/` |
| `start_url` | `/?source=pwa` |
| `scope` | `/` |
| `display` | `standalone` (con `display_override: ["window-controls-overlay","standalone"]`) |
| `orientation` | `any` (tableta/móvil en campo) |
| `theme_color` | `#0d5c63` (= `hidria-600`, coincide con `<meta name="theme-color">`) |
| `background_color` | `#f8fafc` |
| `categories` | `["business","productivity","education"]` |
| `icons` | `192x192`, `512x512`, `512x512` **maskable** (`purpose:"maskable"`), `apple-touch-icon 180x180`, `favicon.svg` |
| `shortcuts` | `Tablero` → `/kanban`; `Aula` → `/aula`; `Sincronización` → `/sincronizacion` |
| `screenshots` | 2 (móvil/escritorio) — opcional para richer install UI |

### 5.2 Service worker y estrategia de caché

Decisión propuesta: **`vite-plugin-pwa`** (Workbox) en modo `injectManifest` para poder escribir
lógica propia (aviso de versión y bloqueo de `skipWaiting`), `registerType: 'prompt'`.

| Recurso | Estrategia | Notas |
|---|---|---|
| Shell (`index.html`, JS/CSS con hash, manifest, iconos, `offline.html`) | **Precache** | `navigateFallback: '/offline'` |
| Navegación SPA | `NetworkFirst` (timeout 3 s) → shell cacheado → `/offline` | Nunca cachear HTML de rutas protegidas si hay `organization_id` en caché de otro usuario (se limpia al signOut) |
| Estáticos propios (iconos, fuentes self-hosted) | `StaleWhileRevalidate` | |
| `*.supabase.co/rest/**`, `/functions/**`, `/realtime/**` | **NetworkOnly** (bypass) | El espejo es Dexie (§4.1) |
| URLs R2 prefirmadas | **NetworkOnly** | 15 min TTL + `restringido_nda` ⇒ jamás en caché |
| `audio/video` del aula (R2) | `RangeRequests` + NetworkFirst, opcional | F2; nunca precachear |

Reglas de actualización (**regla dura**):
- Nunca `skipWaiting()` automático con `ops_queue` pendiente > 0 o formulario sucio: se muestra
  banner «Hay una versión nueva de HIDRIA» con **Actualizar** (recarga controlada: flush → limpiar
  caches → `skipWaiting` → `reload`) y **Después** (recordatorio persistente).
- `CACHE_VERSION = APP_VERSION + BUILD_SHA`; al activar, se borran cachés de versiones previas.
- `__APP_VERSION__` (package.json) y `__BUILD_SHA__` (`GITHUB_SHA`, `'dev'` en local) inyectados por
  `vite define`; se muestran en `/acerca` y en el pie del login. Sin datos sensibles.
- `navigator.storage.persist()` se solicita tras la primera captura offline; `estimate()` alimenta
  el indicador de espacio en `/sincronizacion`.

### 5.3 Instalación y estados PWA

- `beforeinstallprompt` capturado → botón «Instalar HIDRIA» en el menú de sesión; en iOS se muestra
  instrucción manual (Compartir → Añadir a pantalla de inicio).
- Detección `display-mode: standalone` → ocultar CTA.
- Banners de estado: **offline** (aria-live polite, «Sin conexión — tus cambios se guardan en este
  dispositivo»), **cola pendiente** (`n pendientes`), **conflictos** (`n conflictos`), **actualización**.
- Lighthouse PWA ≥ 90 (criterio F1-02): HTTPS, manifest válido con iconos 192/512 + maskable,
  `start_url` responde offline, SW controla la página, `theme-color`, sin errores de consola.

### 5.4 Accesibilidad (WCAG 2.2 AA) — base para todas las pantallas

- **Tokens y contraste:** texto normal con `hidria-600` (#0d5c63 ≈ 7.8:1) o más oscuro; `hidria-500`
  (#0d8a92 ≈ 4.15:1) **sólo** texto grande (≥ 24 px o ≥ 18.66 px bold) o elementos no textuales
  (bordes/foco). Añadir tokens semánticos `ok/warn/crit/line/panel` y verificar cada par.
  El semáforo **nunca** se comunica sólo por color: icono/patrón + texto (`Verde · En tiempo`).
- **Estructura:** un `<h1>` por ruta, landmarks (`header/nav/main/aside/footer`), enlace «saltar al
  contenido», `document.title` por ruta (React Router `handle.title`), breadcrumbs con
  `aria-current="page"`.
- **Teclado:** todo operable sin ratón; `:focus-visible` con anillo de 2 px y offset (nunca
  `outline:none` sin sustituto); Kanban navegable con flechas + menú «Mover a fase…» (el DnD es una
  mejora, no el único camino, y el movimiento siempre dispara EF-01); trampa de foco en diálogos
  (Radix lo resuelve si se adopta).
- **Formularios:** `label` asociado, `aria-describedby` para ayuda/errores, resumen de errores al
  inicio del formulario con foco, mensajes con el **código canónico** de `docs/04` §8
  (p.ej. «Balance no validable en R3: la brecha mensual supera 10 %…»), unidades visibles (m³/mes).
- **Estado asíncrono:** `aria-live="polite"` para cola/sincronización; `role="status"` para
  «guardado localmente»; `aria-busy` durante envío; **no** usar sólo `disabled` en gates (no es
  focusable): `aria-disabled` + explicación accesible.
- **Móvil/campo:** objetivos táctiles ≥ 44×44 px, sin scroll horizontal a 320 px (Kanban con
  contenedor desplazable y acceso por teclado), `prefers-reduced-motion`, zoom 200 % sin pérdida de
  contenido, tablas del BHE con `<caption>` y encabezados `th scope`.
- **Texto legal:** la ruta `/proteccion-datos/aviso` renderiza el texto **verbatim** de `docs/06`
  Anexo A (§4.2/§5); se versiona con la fecha del aviso y se enlaza desde login y pie.

---

## 6. Riesgos y decisiones abiertas para `decisions/` (paso 5)

> Todas se proponen como ADR (plantilla `decisions/ADR-000-plantilla.md`); ninguna reabre decisiones
> congeladas de `TEAM.md` §4. **Propongo** la opción recomendada; decide el Revisor de
> Especificaciones (y Arquitecto/Dev EF donde toca servidor).

| ADR propuesto | Decisión | Opciones | Recomendación | Bloquea |
|---|---|---|---|---|
| **ADR-003** Router | Librería de enrutado | react-router-dom v6 (data router) · TanStack Router · wouter | **react-router-dom 6.30.x** (React 18, nested routes, `lazy`, data APIs; el prototipo ya declara RR7 pero no lo usa) | F1-02 |
| **ADR-004** Estado de servidor | Patrón de datos | Dexie como única fuente (`useLiveQuery`) · TanStack Query + Dexie · Zustand + fetch manual | **Dexie-first**: la UI lee siempre de Dexie; TanStack Query **sólo** para mutaciones/refresco de espejo (evita doble caché y estados divergentes) | F1-02 |
| **ADR-005** Tipos de contrato | Cómo tipar `docs/04` | `supabase gen types typescript` (artefacto CI) · interfaces a mano · zod para todo | **Tipos generados** desde el esquema + `zod` sólo en bordes de respuesta EF/errores canónicos (no en filas de BD) | F1-02 (tipos base) |
| **ADR-006** `captured_at` y LWW por campo (**G1**) | Dónde viven los sellos | (a) columnas `captured_at`+`field_ts jsonb` en tablas editables · (b) tabla genérica `sync_ops` · (c) sólo cliente (rechazada: no cumple OFF-03) | **(a)+(b)**: migración del Arquitecto; el frontend consume `field_ts` | M4/M6 (OFF-02/03) — **no** F1-02 |
| **ADR-007** Camino de escritura de la cola (**G2**) | Cómo se aplican las ops | PostgREST upsert directo (RLS) · EF `POST /sync` nueva | **EF `POST /sync`** (transaccional, idempotente por `client_op_id`, escribe `audit_log`); fallback documentado: PostgREST + `sync_ops` + triggers de auditoría | M4/M6 — **no** F1-02 |
| **ADR-008** Nombre de la cola | `ops_queue` vs `outbox` | — | **`ops_queue`** (normativo en `docs/04` §6); «outbox» sólo como término descriptivo en prosa | F1-02 |
| **ADR-009** Filas hijas con PK `bigint identity` | `logbook_findings/agreements/evidence`, `photo_log`, `quiz_attempts` no aceptan uuid de cliente ⇒ no se pueden insertar offline de forma idempotente | (a) restringir offline a tablas uuid/clave natural en F1 · (b) añadir `client_op_id uuid` a esas tablas | **(b)** a mediano plazo; **(a)** como alcance F1 (bitácora capturada online salvo campos de `logbook_entries`) | M10 offline (F1/F2) |
| **ADR-010** UI kit | Radix/shadcn (60+ componentes del prototipo) vs componentes propios | Adoptar subconjunto Radix (dialog, tabs, tooltip, select, toast, checkbox/radio) · Tailwind puro · otra lib | **Subconjunto Radix (~7 paquetes)** + componentes propios; vigilar peso del bundle (Lighthouse ≥ 90) | F1-02 |
| **ADR-011** Gráficas | Radial IVOH (6 ejes) y BHE 12 meses | `recharts` (ya en el prototipo) · SVG propio · `chart.js` | **SVG propio** para el radial (accesible, imprimible en PDF, sin dependencia); librería sólo si se necesitan más tipos | M8 (F1) |
| **ADR-012** Persistencia local y privacidad | IndexedDB no cifra; sesión en `localStorage` (SDK) | Política de minimización + purga · cifrado de campo en cliente · no persistir nada | **Minimización + purga al signOut + sin bytes de documentos**; requiere visto bueno de `seguridad-privacidad` y nota de DPIA (`docs/06` §11.3) | F1-02 (esquema) |
| **ADR-013** Claims de sesión | `organization_id`/`global_role` en JWT vía `custom_access_token_hook` (F1-01, fuera del DDL) | Consumir claims · leer `profiles` en cada guard | **Claims**, con *fallback* provisional a `profiles` (RLS) mientras F1-01 no esté desplegado; los guards nunca autorizan por sí solos | F1-02 |
| **ADR-014** Hooks de prueba E2E | Selectores estables para QA (`docs/05` E2E/OFF) | `data-testid` catalogados · roles ARIA | **`data-testid` + `data-gate-blocked`, `data-offline-banner`, `data-queue-count`, `data-conflict-count`** documentados en `qa/` | F1-02 (para QA) |
| **ADR-015** ARCO público (`S10`) | `privacy_requests` exige `is_tenant_member`; el titular externo no puede insertar | EF pública/`anon` · política RLS para `anon` con rate-limit · buzón fuera de la app | **EF dedicada (Dev EF)** con folio `ARCO-AAAA-NNNN` server-side | Legal F1.5 |
| **ADR-016** Realtime autorizado | `docs/04` §7 exige suscripción sólo a miembros; `docs/02` no define políticas de `realtime.messages` | Políticas Realtime propias · filtrar en cliente | **Políticas Realtime** (Arquitecto) — sin ellas RT-02 no es verificable | M11 F1 |

### 6.1 Riesgos (probabilidad × impacto) y mitigación

| # | Riesgo | P×I | Mitigación |
|---|---|---|---|
| R1 | **G1/G2** sin resolver ⇒ M4/M6 offline «verde en demo, rojo en auditoría» (OFF-02/03) | A×A | ADR-006/007 antes de F1-04/F1-09; en el ínterin, captura online y borrador local sin sync |
| R2 | Alcance M1–M13 en F1 realista sólo para M1–M4, M6, M8, M10–M12 (G1 de `TEAM.md` §13) — M5/M7/M9-completo/M13 son F2/F3 | A×M | El plan de rutas marca fase por ruta; F1-02 sólo shell |
| R3 | Copiar el prototipo React 19/Radix arrastra incompatibilidades y peso | M×M | ADR-003/010; portar JSX a React 18, subconjunto Radix, medir bundle en CI |
| R4 | **Reloj del dispositivo** altera `captured_at` y la regla ≤ 24 h | M×A | Detección de skew (§4.4) + cierre de bitácora siempre online (EF-02) + aviso en UI |
| R5 | Datos de una empresa quedan en dispositivo compartido | M×A | Purga al signOut/cambio de org, sin bytes de documentos, aviso de privacidad, ADR-012 |
| R6 | Realtime sin políticas ⇒ suscripción falla silenciosamente y el Kanban parece «no actualizar» | M×M | ADR-016; refresco por `focus`/`visibilitychange` como respaldo |
| R7 | `hidria-500` usado como color de texto (a11y fallida) | A×M | Regla de tokens §5.4 + auditoría Lighthouse/axe en F1-02 |
| R8 | Fechas/periodos: `water_balances` (año de corte, mes inicio) mal alineados con producción | M×M | Validación de coherencia declarada en UI + `VALIDATION_*` del servidor; no calcular en cliente (sólo previsualización) |
| R9 | El cliente «recalcula» brecha/IVOH para mostrar y difiere de la vista | M×A | Regla §4.1: cifra oficial siempre de `v_*`; el cálculo local se etiqueta «previsualización» |
| R10 | `quiz_questions.correcta` se filtra por consulta ingenua | B×A | Sólo `v_quiz_questions`; jamás `select('*')` en tabla cruda; prueba SEC-05/AUL-01 |

### 6.2 Huecos detectados en `docs/02` que afectan al frontend (para Arquitecto / Dev EF)

| ID | Hueco | Impacto frontend |
|---|---|---|
| G3 | No existen en el DDL: `field_measurements`, `logbook_progress`, `diagnostic_team` (equivale a `project_members`), `ivoh_scores` (sólo vista `v_ivoh_score`), `course_enrollments/cohorts`, `badges` (sólo `profiles.badge_mdohi`), `gantt`/`cards` de la v1.0 | M7 campo, control de avance M10, aulas/insignias M12 y cohortes **no** tienen dónde persistir; ajustar rutas y alcance |
| G4 | Sin columna `captured_at`/`field_ts` en **ninguna** tabla (búsqueda exhaustiva) | G1 (ADR-006) |
| G5 | Sin tabla de idempotencia ni índice único sobre `audit_log.meta->>'idempotency_key'` | Reintentos sin garantía dura (OFF-04) |
| G6 | Sin políticas Realtime (`realtime.messages`) | R6 (ADR-016) |
| G7 | `documents.doc_type` ≠ valores citados por EF-08 (`docs/04` §4: `layout|planos_hidrosanitarios|parametros_calidad|informe_laboratorio|reporte|otro` vs DDL con 13 valores incl. `balance_basico`, `concesion`, `permiso_descarga`, `recibos`, `lab_previo`, `plan_accion`, `bitacora_firmada`) | El cliente debe usar **el enum del DDL** (precedencia `docs/02` > `docs/04`, `TEAM.md` §3); reportar a Revisor |
| G8 | `iih_stages`/`iih_asset_types` con PK `bigint` y folios por trigger; `logbook_entries.folio` por trigger | El cliente **nunca** genera folios (`docs/04` §2.5) — coherente, pero obliga a crear online y refrescar la fila |

---

## 7. Primer entregable de F1-02 (propuesta concreta, sin código en esta ronda)

**Objetivo F1-02:** base técnica del cliente, sin lógica de negocio.

| Entregable | Archivos previstos | Criterio de aceptación |
|---|---|---|
| E1 · Router + guards | `router.tsx`, `routes/**`, `components/layout/**` | `/kanban` sin sesión → `/login?next=`; deep link restaurado tras login; 404; títulos por ruta |
| E2 · Layout + tema | `AppShell`, `Sidebar`, `Header`, `Breadcrumbs`, `OrgSelector`, `SessionMenu`; tokens semánticos en Tailwind + `styles/tokens.css` | tokens aplicados; contraste verificado; responsive 320–1440 px |
| E3 · PWA | `public/manifest.webmanifest`, iconos, `pwa/registerSW.ts`, `pwa/updatePrompt.tsx`, SW (Workbox) | instalable (Lighthouse PWA ≥ 90 en local/staging), banner de actualización, navegación offline al shell |
| E4 · Dexie v1 + `ops_queue` | `lib/db.ts`, `lib/sync/{flusher,lww,conflicts,gates,clock}.ts`, `routes/sincronizacion/**` | esquema v1 con `ops_queue`; `enqueue` rechaza gates en tipo y runtime; UI de cola/conflictos con datos simulados |
| E5 · Estados de red | `components/offline/**`, `hooks/useOnline`, `useQueueStatus` | banner offline/cola/conflicto; `data-offline-banner`, `data-queue-count` para QA |
| E6 · Cliente Supabase + env | `lib/supabase.ts`, `vite.config.ts` (`envDir`, `alias`), `app/.env.example` | sin `service_role`; build verifica ausencia del literal; tipado `VITE_*` |
| E7 · Accesibilidad base | skip link, landmarks, `:focus-visible`, `aria-live`, reglas en `eslint` (`jsx-a11y` opcional) | axe sin violaciones críticas en rutas del shell |
| E8 · Tipos y errores | `types/contract.ts`, `types/errors.ts` (catálogo `docs/04` §8) | `ErrorCanonico` con `code/message/details/ref`; mapeo HTTP de §8 |

**Fuera de alcance de F1-02 (para no romper el gate G1):** sync real con servidor, LWW por campo,
pantallas de módulos con datos, importadores XLSX, PDF/folios.

**Fixes obligatorios incluidos en F1-02:** H1 (`resolve.alias`), H2 (`envDir: '..'` o `app/.env`),
H4 (tokens de contraste).

**Riesgo del PR F1-02:** instala 3–6 dependencias nuevas (`react-router-dom`, `dexie`,
`@supabase/supabase-js`, `vite-plugin-pwa`, `zod`, `@tanstack/react-query` si ADR-004 lo aprueba).
Requiere aprobación del Revisor (ADR-003/004/005/010) antes de implementar, para no rehacer el router.

---

## 8. Trazabilidad con `docs/05` (para QA)

| Caso | Elemento del plan que lo habilita |
|---|---|
| **OFF-01** | §4.5 (gate no encolable), `GateButton` deshabilitado con hint, `data-gate-blocked`, «cero llamadas a EF» (spy de red) |
| **OFF-02** | §4.4 FIFO, `Idempotency-Key = client_op_id`, `captured_at` preservado; requiere ADR-006/007 |
| **OFF-03** | §4.3 LWW por campo + `sync_conflicts` + `/sincronizacion` (visible, no silencioso); requiere ADR-006 |
| **OFF-04** | §4.4 reintento con misma clave; requiere que el servidor deduplique (ADR-007) |
| **E2E-01** | Rutas M1.5, M3.2, M2.5 (EF-01) + Kanban M11.1 con Realtime |
| **E2E-02** | M4.1/M4.3 (EF-04) con guardado offline |
| **E2E-05** | M8.1/M8.2/M8.3 (EF-06, `v_ivoh_score`) |
| **E2E-07** | M9.1/M9.2 (EF-07, `v_diagnostic_completeness`) |
| **E2E-08** | M10.3 (EF-02, TD-8, `cerrada_razon`) |
| **RT-01/RT-02** | §3.1 canales + ADR-016 (políticas Realtime) |
| **PER-01** | M11.1: virtualizar columnas/tarjetas; renders < 1.5 s con 60 diagnósticos |

---

## 9. Pendientes / siguiente paso

1. **Lead:** confirmar veredicto AMARILLO del scaffold y **prioridad de ADR-003…005, 010, 013, 014**
   (necesarios antes de escribir el PR de F1-02). ADR-006/007/009/015/016 van a Arquitecto/Dev EF.
2. **Revisor de Especificaciones:** resolver G7 (`doc_type`) y confirmar que el nombre normativo de la
   cola es `ops_queue` (ADR-008).
3. **Arquitecto BD:** G1/G3/G5/G6 — `captured_at`/`field_ts`, tablas faltantes, idempotencia,
   políticas Realtime; y `privacy_requests` para ARCO.
4. **Dev EF:** decisión G2 (EF `POST /sync`) y contrato de respuesta para replay/rechazo.
5. **QA:** adoptar el catálogo de `data-testid` (ADR-014) para que los E2E/OFF se escriban contra
   selectores estables desde el primer PR de F1-02.
6. **Este agente:** al aprobarse F1-02 y con ADR-003/004/005 aceptadas, abrir rama
   `feature/F1-02-shell-pwa` desde `main` actualizado e implementar E1–E8 **sin** tocar
   `supabase/**`, `.github/**` ni `tests/**`.

---

## 10. Declaración de cumplimiento de reglas duras

- No se modificó `app/**` ni ningún otro archivo del repositorio: **sólo** se escribió este reporte.
- No se ejecutó `git commit`, `push`, `merge`, `checkout`, `reset` ni ninguna operación de escritura
  en git (verificación: `git status --porcelain app` vacío; rama actual sin cambios).
- No se imprimió ningún secreto: `.env` no se leyó; la búsqueda de `service_role` en `dist` es la
  verificación exigida (0 coincidencias).
- No se inventaron endpoints: todas las rutas citan EF-01…EF-13, vistas de `docs/04` §9 o tablas de
  `docs/02`; los huecos se reportan como huecos (G1–G8), no como contratos.

*Fin del reporte — `dev-frontend-pwa`, F1-02 (plan).*
