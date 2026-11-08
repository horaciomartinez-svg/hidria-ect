# F1-02a — Shell PWA: router M1–M13, sesión, guardas y tema institucional

| Campo | Valor |
|---|---|
| **Tarea** | `task-43` — F1-02 (archivo `hidria_coding_team/tasks/F1/F1-02_shell_pwa.md`) |
| **Agente** | `dev-frontend-pwa` (04) |
| **Fecha** | 2026-11-07 20:5x (America/Mexico_City) |
| **Rama** | `feature/F1-02-shell-pwa` |
| **Base** | `origin/main` = `424ca01` (F1-01b mergeado) |
| **Alcance de esta entrega** | **F1-02a**: router, layout, sesión/guardas, tema, estados online/offline, placeholders M1–M13 |
| **Diferido a F1-02b** | PWA instalable (manifest, service worker, iconos, aviso de versión nueva). Ver §8 |
| **Conclusión** | **VERDE (parcial)** — build/typecheck/lint verdes y rutas protegidas → login verificadas en navegador real; la aceptación «app instalable» se cierra en F1-02b |

---

## 1. Resumen para el Lead

- `npm run lint` → **0** · `npm run typecheck` → **0** · `npm run build` → **0** (91 módulos, JS 473 kB / 136.8 kB gzip, CSS 17.5 kB).
- **Smoke E2E real 13/13** con Chrome headless vía CDP sobre el build de producción: sin sesión
  `/kanban` y `/` redirigen a login; con sesión se monta el panel, nav, breadcrumbs y claims;
  una ruta de módulo renderiza su contrato; **rol `invitado` recibe pantalla de acceso restringido
  y no ve el placeholder**; al limpiar la sesión vuelve a login.
- **Sin secretos en el bundle**: sólo `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (`anon`). El
  cliente **falla cerrado** si detecta una clave con rol `service_role` inyectada en entorno.
- El diff es de **~1,900 líneas / 24 archivos** (supera el umbral de ~400 del encargo). Ver §9:
  propuesta de secuencia y aviso al supervisor.

---

## 2. Entregado (F1-02a)

### 2.1 Router con rutas M1–M13 (placeholders enlazados)

Rutas canónicas definitivas (evitan enlaces rotos en E2E y navegación):

| Ruta | Módulo | Guarda de rol (claim `global_role`) | Contrato mostrado (cita `docs/04`/`docs/02`) |
|---|---|---|---|
| `/login` | Sesión Supabase Auth | pública | claims `organization_id`/`tenant_id`/`global_role` (ADR-005) |
| `/` | Panel de inicio | cualquiera autenticado | sesión/claims; sin cifras inventadas |
| `/kanban` | M11 | admin, coordinador, equipo, observador | `docs/04` §7 (canal `org:{id}`) · EF-01 |
| `/empresas` | M1 | idem | tabla `companies` · folio server-side |
| `/diagnosticos` | M2 | todos | EF-01 · EF-12 · `v_diagnostic_completeness` |
| `/documentos` | M3 | todos | EF-08 presign/register · EF-03 |
| `/cat` | M4 | todos | EF-04 submit/validate-r2 · `cat_responses` |
| `/iih` | M5 | admin, coordinador, equipo | EF-09 · `iih_assets` |
| `/bhe` | M6 | idem | EF-05 · `v_bhe_monthly` · `v_bhe_summary` |
| `/muestreo` | M7 | idem | EF-10 · `custody_transfers` |
| `/ivoh` | M8 | idem | EF-06 · `v_ivoh_score` |
| `/reporte` | M9 | todos | EF-07 · matriz 10/10 |
| `/bitacora` | M10 | todos | EF-02 · `logbook_entries` |
| `/aula` | M12 | todos | EF-11 · `v_quiz_questions` |
| `/informes` | M13 | admin, coordinador, equipo, observador | vistas analíticas (`docs/04` §9) |
| `/sincronizacion` | transversal | autenticado | `docs/04` §6 (gates no encolables) |
| `/acerca`, `/privacidad` | servicio | autenticado (login enlaza privacidad) | textos legales: `docs/06` (pendiente de publicación íntegra) |

Cada placeholder muestra el contrato que consumirá la pantalla real; **no simula datos ni reglas**.
El registro único (`routes/registry.tsx`) alimenta menú, panel, breadcrumbs y título de documento.

### 2.2 Layout autenticado

- Sidebar con grupos Operación/Diagnóstico/Programa filtrados por rol; header con breadcrumbs,
  indicador en línea/sin conexión, **selector de organización** (claim `organization_id`, no
  editable desde la UI) y **menú de sesión** (nombre, correo, rol, org, aviso de privacidad,
  cerrar sesión); pie con versión del cliente.
- Móvil: panel deslizante con `aria-expanded`/`aria-controls`, cierre con overlay y al navegar.
- Accesibilidad base: skip link, landmarks, un `h1` por pantalla, `aria-current`, foco visible
  global (`:focus-visible`), `prefers-reduced-motion`, `aria-live` en el banner offline.

### 2.3 Sesión, claims y guardas

- `lib/auth/claims.ts`: decodifica el JWT del access token y lee claims **ADR-005**
  (`organization_id` con precedencia sobre `tenant_id`, `global_role` validado contra el enum).
- `lib/auth/AuthProvider.tsx`: `getSession` + `onAuthStateChange`; perfil (`profiles`) y nombre de
  organización (`organizations`) son best-effort (RLS/red nunca rompen la sesión).
- `RequireAuth`: sin sesión → `/login` conservando destino (`state.from`) y regreso tras login.
- `RequireGlobalRole`: rol no previsto → pantalla «esta sección no corresponde a tu perfil».
- La UI **no autoriza**: RLS y EF son la autoridad (`docs/04` §2.1). El rol por diagnóstico no se
  usa en el cliente (se resuelve en servidor).

### 2.4 Tema institucional

- Tokens en Tailwind: escala `hidria` (50–900), semáforo `ok/warn/crit`, `surface/panel/line`,
  fuentes sans/mono y sombra de tarjeta. Contraste verificado sobre blanco:
  `hidria-600` ≈ 7.8:1 y `hidria-700` ≈ 10.9:1 (texto normal AA/AAA); `hidria-500` ≈ 4.15:1
  queda restringido a texto grande y elementos no textuales.
- Nomenclatura institucional correcta en UI: SDFI · SRHDS · UCI (sin siglas prohibidas).
- Sin modo oscuro (no requerido en F1-02).

### 2.5 Configuración y seguridad

- `vite.config.ts`: `envDir` apunta al `.env` de la raíz del monorepo (TEAM.md §9); alias `@`;
  `__APP_VERSION__` desde `app/package.json`. Vite sólo inyecta variables `VITE_*`.
- `lib/config.ts`: valida presencia de URL/`anon key`; **detecta una clave de servicio** en
  `VITE_SUPABASE_ANON_KEY` y detiene el cliente (pantalla de incidente, sin exponer la clave).
- `lib/supabase.ts`: `createClient` con la clave anon, PKCE, sesión persistente; `null` si falta
  configuración (el build de CI sin `.env` compila y muestra «configuración incompleta»).

---

## 3. Evidencia de comandos

Ejecutados en `C:\Proyectos\hidria-f1-02` (worktree aislado de la rama `feature/F1-02-shell-pwa`;
se usó worktree para no interferir con el árbol de trabajo compartido de otra rama):

```
npm run lint        → eslint src ................................................ EXIT 0
npm run typecheck   → tsc --noEmit .............................................. EXIT 0
npm run build       → tsc --noEmit && vite build ................................ EXIT 0
                      ✓ 91 modules transformed
                      dist/index.html                   0.81 kB │ gzip:  0.50 kB
                      dist/assets/index-DhI2Guox.css   17.51 kB │ gzip:  4.13 kB
                      dist/assets/index-jDDpt88t.js   473.13 kB │ gzip: 136.84 kB
                      ✓ built in 1.48s
```

Build **sin** variables de entorno (equivalente al job de CI): mismo resultado verde — el cliente
no exige `.env` para compilar.

Verificaciones del bundle (build de producción):
- `service_role` aparece **sólo 3 veces**, todas en la guarda de seguridad propia y su texto de
  interfaz («Se detectó una clave con rol service_role…»); **no hay credencial de servicio** ni URL
  de entorno inyectada por accidente.
- Búsqueda de `SUPABASE_SERVICE_ROLE_KEY` en `dist/`: 0 coincidencias.
- `dist/` no se versiona (`.gitignore`: `dist/`).

---

## 4. Smoke E2E real (navegador, no simulado)

Método: build de producción servido con `vite preview`; **Chrome headless por CDP**
(`--remote-debugging-port`) leyendo `document.body.innerText` y `document.title`; sesión sembrada en
`localStorage` con un JWT de smoke que porta los claims de ADR-005 (no hay usuarios con contraseña en
el seed, según ADR-007; no se añadieron contraseñas). Script fuera del repo (`%TEMP%`), no versionado.

| # | Comprobación | Resultado |
|---|---|---|
| 1 | `/kanban` sin sesión redirige a la pantalla de inicio de sesión | **OK** |
| 2 | No se monta el shell autenticado sin sesión | **OK** |
| 3 | Con sesión, `/` monta el panel (`Sesión verificada`, `Módulos disponibles`) | **OK** |
| 4 | El claim `organization_id` se muestra en el panel | **OK** |
| 5 | La navegación muestra Kanban/Empresas/Diagnósticos | **OK** |
| 6 | Breadcrumb «Inicio» presente | **OK** |
| 7 | Título de documento por ruta | **OK** |
| 8 | `/empresas` renderiza el placeholder de M1 con su contrato (`tabla companies`) | **OK** |
| 9 | `/kanban` renderiza el placeholder de M11 con `EF-01 advance-phase` | **OK** |
| 10 | `/sincronizacion` lista los gates no encolables (EF-05 incluida) | **OK** |
| 11 | Rol `invitado` en `/kanban` → pantalla de acceso restringido | **OK** |
| 12 | Rol `invitado` no ve el contenido de M11 | **OK** |
| 13 | Sin sesión, `/` vuelve a login | **OK** |

`RESUMEN: 13/13 comprobaciones OK` (exit 0).

---

## 5. Archivos

Nuevos: `app/src/lib/{config,supabase,online}.ts`,
`app/src/lib/auth/{claims.ts,AuthProvider.tsx,guards.tsx}`,
`app/src/components/layout/AppShell.tsx`, `app/src/router.tsx`,
`app/src/routes/{registry.tsx,LoginPage.tsx,PanelPage.tsx,ModulePlaceholderPage.tsx,SincronizacionPage.tsx,StatePages.tsx}`.
Modificados: `app/{package.json,vite.config.ts,tailwind.config.js,index.html}`,
`app/src/{main.tsx,App.tsx,index.css,vite-env.d.ts}`, `package.json` y `package-lock.json`
(dependencias raíz del workspace).

Dependencias nuevas (`app/package.json`): `react-router-dom@^6.30.1`,
`@supabase/supabase-js@^2.45.0` (resuelto 2.119.0), `@types/node@^22` (dev, para `vite.config.ts`).

---

## 6. Criterios de aceptación F1-02

| Criterio | Estado |
|---|---|
| `npm run build` verde | **Cumplido** (EXIT 0, también sin `.env`) |
| Rutas protegidas redirigen a login | **Cumplido y verificado** (smoke 1/2/13) |
| Sin secretos en bundle / sin `service_role` | **Cumplido** (guarda + verificación) |
| Tema institucional y accesibilidad base | **Cumplido** |
| Router M1–M13, layout, sesión, selector de organización | **Cumplido** |
| **App instalable (manifest + SW + iconos)** | **Pendiente → F1-02b** |
| Lighthouse PWA ≥ 90 | **Diferido**: requiere F1-02b y HTTPS de staging; se documentará en F1-16 |
| CI 4/4 en el PR | Pendiente de ejecución del PR (guardas + cliente) |

---

## 7. Decisiones y observaciones

1. **Router**: `react-router-dom` 6 con `createBrowserRouter` (data router). El prototipo declaraba
   RR7 y React 19 pero navegaba por estado; se implementó router real con URLs (necesario para E2E,
   deep links y PWA).
2. **`envDir` a la raíz**: se documenta que sólo `VITE_*` llega al bundle; la guarda de
   `service_role` añade defensa en profundidad si alguien cambia la variable.
3. **Claims del JWT** (ADR-005) son la fuente de rol/organización; `profiles.global_role` sólo se usa
   como etiqueta si el claim falta, nunca para autorizar navegación crítica.
4. **No se creó Dexie/cola `ops_queue`** en esta entrega: la cola pertenece a las tareas de captura
   offline (M4/M6/M10) y depende de la decisión de escritura de la cola (PostgREST vs EF `POST /sync`),
   aún abierta con Dev EF/Arquitecto. La pantalla `/sincronizacion` ya publica la regla y el estado.
5. **Privacidad**: `/privacidad` indica que el aviso se publicará **íntegro** desde `docs/06` Anexo A
   cuando lo apruebe el Comité de Transparencia; no se redactó texto legal propio.
6. **Tamaño del bundle** (473 kB / 136.8 kB gzip): dominado por `@supabase/supabase-js`; se
   optimizará con code-splitting por módulo cuando existan pantallas reales (F1-03+). No afecta al
   criterio PWA; vigilar Lighthouse de rendimiento en staging.
7. **`service_role` literal en el bundle**: es la constante de comparación de la guarda y su mensaje;
   no es una credencial. Se señala explícitamente para que la revisión de seguridad no lo confunda.

---

## 8. Pendiente: F1-02b (PWA instalable)

Alcance previsto (segundo PR, sobre `main` tras el merge de este):

- `public/manifest.webmanifest` (es-MX, `#0d5c63`, iconos 192/512/maskable, `start_url`, shortcuts).
- Iconos institucionales (SVG + PNG 192/512/180).
- Service worker con `vite-plugin-pwa` en modo `injectManifest`: precache del shell,
  `navigateFallback`, `NetworkOnly` para Supabase y URLs prefirmadas de R2 (el espejo offline será
  Dexie, no la caché HTTP), `offline.html`.
- Aviso de versión nueva (`registerType: 'prompt'`, sin `skipWaiting` con cola pendiente),
  `__APP_BUILD__` visible en `/acerca`, `navigator.storage.persist()`.
- Verificación: instalabilidad (manifest+SW) y Lighthouse PWA local; ≥ 90 formal en staging/F1-16.

---

## 9. Aviso de tamaño del diff y secuencia propuesta

El diff de este PR es de **~1,900 líneas en 24 archivos** (código de shell, no tests ni lock:
~1,700). El umbral acordado es ~400 líneas, por lo que **se avisa al supervisor**. Propuesta:

- **PR-A (este)**: shell completo F1-02a (sesión + guardas + router + layout + tema + placeholders).
  Es la unidad mínima demostrable y verificable de forma conjunta (el smoke de §4 la prueba de punta a
  punta); separarlo en dos dejaría una mitad sin posibilidad de verificación funcional.
- **PR-B**: F1-02b PWA (manifest/SW/iconos/aviso de versión), autocontenido (~250 líneas).

Si el supervisor prefiere PRs más pequeños, puedo rebanar este en dos *stacked* sin reescribir:
(a) fundación y sesión (`lib/**`, configuración, login, guardas, pantallas de estado) y (b) shell
visual (registry, layout, panel, placeholders). Queda a su decisión.

---

## 10. Siguiente paso

1. CI 4/4 del PR + revisión de especificaciones y seguridad (foco: manejo de claims, guarda de
   `service_role`, ausencia de datos simulados y de endpoints inventados).
2. Tras merge: abrir F1-02b (PWA) y luego `feature/F1-03-m1-empresas`.

*Reporte de `dev-frontend-pwa` para F1-02a.*
