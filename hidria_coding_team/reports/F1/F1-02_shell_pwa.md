# F1-02a — Shell PWA: router M1–M13, sesión, guardas y tema institucional

| Campo | Valor |
|---|---|
| **Tarea** | `task-43` — F1-02 (archivo `hidria_coding_team/tasks/F1/F1-02_shell_pwa.md`) |
| **Agente** | `dev-frontend-pwa` (04) |
| **Rama** | `feature/F1-02-shell-pwa` |
| **Base** | `main` = `20b6c50` |
| **Head revisado por spec/seguridad** | `5cc56ed` (conclusiones: `reports/reviews/PR-12_spec.md`, `reports/security/PR-12_security.md`) |
| **Corrección de revisión** | commits nuevos encima de `5cc56ed` (B1 · M1 · m1–m5 · SEC-PR12-01/05/06/07); SHA y CI finales en **§11** |
| **Alcance** | **F1-02a**: router, layout, sesión/guardas, tema, estados online/offline, placeholders M1–M13 |
| **Diferido** | PWA instalable → F1-02b; Lighthouse → staging/F1-16; Dexie/`ops_queue` → M4/M6/M10 |
| **Conclusión** | **VERDE (correcciones aplicadas)** — lint/typecheck/build verdes, falla cerrada de claims verificada en navegador y build-time guard de clave pública probada en negativo |

---

## 1. Resumen para el Lead

- `npm run lint` → **0** · `npm run typecheck` → **0** · `npm run build` → **0** (91 módulos,
  JS ≈ 475 kB / 137.5 kB gzip, CSS 17.6 kB / 4.15 kB). El build **sin `.env`** (equivalente a CI)
  también pasa.
- **Smoke E2E real 24/24** con Chrome headless vía CDP sobre el build de producción: rutas
  protegidas → login; shell con sesión y claims; placeholders con su contrato; rol `invitado` →
  acceso restringido; **falla cerrada de claims (B1) en 3 escenarios negativos**; **redirect
  malicioso rechazado (SEC-PR12-06) en 6 variantes** + control positivo; logout → login.
- **Sin secretos en el bundle**: sólo clave pública `anon`. Además **guard build-time** en
  `vite.config.ts` (SEC-PR12-01) que **rompe el build** si la clave es `sb_secret_*`, tiene rol
  distinto de `anon` o no es un JWT legible; probado con claves sintéticas (2 fallos esperados,
  2 pasos esperados).
- El diff del PR (head revisado) es de **25 archivos, +2,143/−73**; la corrección añade commits
  encima (sin reescribir historia). Ver §10 para el estado del tamaño/secuencia.

---

## 2. Entregado (F1-02a)

### 2.1 Router con rutas M1–M13 y fase según ADR-003

Rutas canónicas definitivas (evitan enlaces rotos en E2E y navegación). La columna **Fase**
sigue el **plan operativo de ADR-003 §2**, que prevalece sobre `docs/07` §3 donde difiere:

| Ruta | Módulo | Fase (ADR-003) | Guarda de rol (claim `global_role`) | Contrato mostrado (cita `docs/04`/`docs/02`) |
|---|---|---|---|---|
| `/login` | Sesión Supabase Auth | — | pública | claims `organization_id`/`tenant_id`/`global_role` (ADR-005) |
| `/` | Panel de inicio | — | cualquiera autenticado | sesión/claims; sin cifras inventadas |
| `/kanban` | M11 | F1 | admin, coordinador, equipo, observador | `docs/04` §7 (canal `org:{id}`) · EF-01 |
| `/empresas` | M1 | F1 | idem | tabla `companies` · folio server-side |
| `/diagnosticos` | M2 | F1 | todos | EF-01 · EF-12 · `v_diagnostic_completeness` |
| `/documentos` | M3 | F1 | todos | EF-08 presign/register · EF-03 |
| `/cat` | M4 | F1 | todos | EF-04 submit/validate-r2 · `cat_responses` |
| `/iih` | M5 | **F1** | admin, coordinador, equipo | EF-09 · `iih_assets` |
| `/bhe` | M6 | F1 | idem | EF-05 · `v_bhe_monthly` · `v_bhe_summary` |
| `/muestreo` | M7 | **F1** (captura mínima; completo F2) | idem | EF-10 · `custody_transfers` |
| `/ivoh` | M8 | F1 | idem | EF-06 · `v_ivoh_score` |
| `/reporte` | M9 | F1 (esencial; avanzado F3) | todos | EF-07 · matriz 10/10 |
| `/bitacora` | M10 | F1 | todos | EF-02 · `logbook_entries` |
| `/aula` | M12 | F2 | todos | EF-11 · `v_quiz_questions` |
| `/informes` | M13 | F3 | admin, coordinador, equipo, observador | vistas analíticas (`docs/04` §9) |
| `/sincronizacion` | transversal | — | autenticado | `docs/04` §6 (gates no encolables) |
| `/acerca`, `/privacidad` | servicio | — | autenticado | textos legales `docs/06` (ver §8.4) |

Después de la corrección, M5 es **F1** y M7 muestra la nota «captura mínima en F1 · dictamen
completo en F2» (badge F1); M9 muestra «esencial en F1 · avanzado en F3». Cada placeholder muestra
el contrato que consumirá la pantalla real; **no simula datos ni reglas**.

### 2.2 Layout, sesión y guardas

- Sidebar por grupos (Operación/Diagnóstico/Programa) filtrada por rol; header con breadcrumbs,
  estado en línea/sin conexión, **selector de organización** (claim `organization_id`, no editable)
  y menú de sesión (nombre, correo, rol, org, aviso de privacidad, cierre de sesión); móvil con panel
  deslizante accesible.
- `lib/auth/claims.ts`: lee claims del access token con **falla cerrada (B1)**: exige `sub` UUID,
  `organization_id`/`tenant_id` **UUID** y `global_role` del enum; si algo falta o es inválido
  devuelve `null`.
- `AuthProvider`: estados `unconfigured | loading | anonymous | invalid_claims | authenticated`.
  Con sesión sin claims válidos **no se monta el shell** (`invalid_claims`); `RequireAuth` redirige
  a login con explicación; `LoginPage` **no** redirige si los claims son inválidos y muestra aviso
  con opción de cerrar sesión.
- `RequireGlobalRole`: rol no previsto → pantalla de acceso restringido (UI; la autoridad es RLS/EF).
- `signOut` (SEC-PR12-05): la navegación a login ocurre en `finally`, aunque `signOut()` rechace.

### 2.3 Tema institucional y accesibilidad

Tokens `hidria` (50–900), semáforo `ok/warn/crit`, `surface/panel/line`, sombra de tarjeta;
contraste sobre blanco: `hidria-600` ≈ 7.8:1 y `hidria-700` ≈ 10.9:1 (texto normal AA/AAA);
`hidria-500` ≈ 4.15:1 restringido a texto grande/elementos no textuales. Skip link, landmarks,
`aria-current`, foco visible global, `aria-live` en banner y avisos, `prefers-reduced-motion`,
nomenclatura SDFI · SRHDS · UCI.

### 2.4 Configuración y seguridad

- `vite.config.ts`: `envDir` al `.env` de la raíz (TEAM.md §9), alias `@`, `__APP_VERSION__` y
  **guard build-time de clave pública (SEC-PR12-01)**: rechaza `sb_secret_*`, JWT con rol ≠ `anon`
  y claves no legibles; acepta `sb_publishable_*` y JWT `anon`. Falla el build (incluido CI).
- `lib/config.ts`: guarda runtime adicional (falla cerrado si detecta rol `service_role`) y
  `isSupabaseMissingEnv` para la pantalla de configuración incompleta.
- `lib/supabase.ts`: cliente con clave anon (`null` si falta configuración; el build de CI sin
  `.env` compila y muestra «configuración incompleta»).

---

## 3. Correcciones de la revisión (PR #12)

### 3.1 B1 (bloqueante) — falla cerrada de claims: corregido

| Antes | Ahora |
|---|---|
| `AuthProvider` marcaba `authenticated` con cualquier sesión | Valida claims al aplicar la sesión; si fallan → `invalid_claims` (nunca shell) |
| `RequireAuth` sólo miraba el status | `anonymous` **e** `invalid_claims` → `/login` con `state.error` |
| `LoginPage` redirigía con claims inválidos | Sólo redirige con `status === 'authenticated'`; con `invalid_claims` muestra aviso `data-invalid-claims` y botón «Cerrar sesión» |
| `readClaims` sólo exigía `sub` | Exige `sub` UUID, `organization_id`/`tenant_id` **UUID** y `global_role` del enum; devuelve `null` si no |

Verificado con 3 escenarios negativos en navegador real (§5, casos 13–16): sesión sin
`organization_id`/`global_role`, `organization_id` no-UUID y `global_role` fuera del enum →
pantalla de login, sin shell.

### 3.2 M1 (mayor) — fases M5/M7 contra ADR-003: corregido

`registry.tsx`: **M5 → F1**; **M7 → F1** con `phaseNote` «captura mínima en F1 · dictamen completo
en F2»; M9 con nota «esencial en F1 · avanzado en F3». La nota se muestra en el placeholder y en la
tarjeta del panel (`phaseNote`), sin cambiar la ruta. Cuadro completo en §2.1.

### 3.3 Menores de spec

| # | Corrección |
|---|---|
| m1 | `/sincronizacion`: «cola» y «conflictos» ya **no muestran `0`**; muestran «— no implementado» con `data-placeholder="true"` y explican que la cola Dexie llega con M4/M6/M10 |
| m2 | Este reporte cita base `20b6c50`, head revisado `5cc56ed` y CI real (§4) |
| m3 | Eliminado `profiles.global_role` de `SessionProfile` (código muerto): el perfil sólo aporta nombre y organización para presentación; la autorización usa **sólo** los claims del JWT |
| m4 | Conteos actualizados (25 archivos, +2,143/−73 en el head revisado) y smoke ampliado con claims inválidos |
| m5 | `firstNonEmpty` eliminado; validación UUID en `readClaims` (parte del fix B1) |

### 3.4 Condiciones de seguridad aplicables

| ID | Aplicado |
|---|---|
| SEC-PR12-01 (parte app) | Guard **build-time** en `vite.config.ts` (§2.4) con `loadEnv`; probado con claves sintéticas (§4). El escaneo de `dist/**` y `npm audit` en CI van en **task-50** (DevOps) |
| SEC-PR12-05 | `signOut` navega a login en `finally` aunque el SDK rechace |
| SEC-PR12-06 | `safeRedirect` rechaza `//`, `\`, esquemas (`:`), caracteres de control y variantes percent-encoded (`%5c`); prueba de redirect malicioso en §5 (6 variantes + control positivo) |
| SEC-PR12-07 | `RouteErrorPage` muestra mensaje genérico; el detalle real sólo se muestra en desarrollo (`import.meta.env.DEV`) y se registra en consola |
| Menores UI | Banner offline y `/sincronizacion` ya **no prometen persistencia offline** (dicen que la captura offline se habilita con M4/M6/M10) |

**Diferido por indicación del supervisor:** `/privacidad` pública con texto íntegro de `docs/06`
(→ **task-51**), upgrade mayor `react-router-dom@7.18.5` (→ **task-51**), escaneo `dist/**` +
`npm audit` en CI (→ **task-50**).

---

## 4. Evidencia de comandos

Ejecutados en `C:\Proyectos\hidria-f1-02` (worktree aislado de la rama):

```
npm run lint        → eslint src ................................................ EXIT 0
npm run typecheck   → tsc --noEmit .............................................. EXIT 0
npm run build       → tsc --noEmit && vite build ................................ EXIT 0
                      ✓ 91 modules transformed
                      dist/index.html                   0.81 kB │ gzip:  0.51 kB
                      dist/assets/index-*.css          17.63 kB │ gzip:  4.15 kB
                      dist/assets/index-*.js          475.18 kB │ gzip: 137.53 kB
                      ✓ built in 1.45s
```

Build **sin** variables de entorno (equivalente a CI): también EXIT 0.

**Guard build-time de clave pública (SEC-PR12-01), con claves sintéticas:**

| Clave inyectada en `VITE_SUPABASE_ANON_KEY` | Resultado |
|---|---|
| JWT con `role: "service_role"` | **Falla el build** — `[HIDRIA] VITE_SUPABASE_ANON_KEY debe tener role "anon" (encontrado: service_role)…` |
| `sb_secret_abcdef1234567890` | **Falla el build** — `[HIDRIA] … parece una clave secreta (sb_secret_*)…` |
| `sb_publishable_smoke1234567890` | Build **OK** (clave pública aceptada) |
| JWT con `role: "anon"` | Build **OK** |

**Bundle (build de producción):** `SUPABASE_SERVICE_ROLE_KEY` → 0 coincidencias; el literal
`service_role` aparece sólo en la guarda de runtime y su mensaje (no es credencial); la clave de
servicio inyectada en entorno **no llega a empaquetarse** porque el build se aborta antes.

---

## 5. Smoke E2E real (navegador, no simulado)

Método: build de producción servido con `vite preview`; **Chrome headless por CDP**
(`--remote-debugging-port`) leyendo `document.body.innerText`, `document.title`, `location.href` y
`history.state`; sesión sembrada en `localStorage` con JWT de smoke que porta claims ADR-005 (no hay
usuarios con contraseña en el seed, ADR-007; no se añadieron contraseñas). Script fuera del repo
(`%TEMP%`), no versionado.

| # | Comprobación | Resultado |
|---|---|---|
| 1–2 | `/kanban` sin sesión → login; no se monta el shell | OK |
| 3–7 | Con sesión: panel, claim `organization_id`, nav, breadcrumb, título | OK |
| 8–9 | Placeholders M1 y M11 con su contrato | OK |
| 10 | `/sincronizacion` publica gates no encolables | OK |
| 11–12 | Rol `invitado` → acceso restringido; sin contenido de M11 | OK |
| 13 | **B1** sesión sin `organization_id`/`global_role` → login, sin shell | OK |
| 14 | **B1** aviso `data-invalid-claims` visible | OK |
| 15 | **B1** `organization_id` no-UUID → login, sin shell | OK |
| 16 | **B1** `global_role` fuera del enum → login, sin shell | OK |
| 17–22 | **SEC-PR12-06** 6 variantes de `state.from` malicioso (`\\evil.com`, `/\evil.com`, `//evil.com`, `https://evil.com`, `/%5cevil.com`, `javascript:…`) → permanece en el origen (`http://localhost:4173/`) | OK |
| 23 | **SEC-PR12-06** control positivo: `from:'/empresas'` → `http://localhost:4173/empresas` | OK |
| 24 | Logout → `/` vuelve a login | OK |

`RESUMEN: 24/24 comprobaciones OK` (exit 0).

---

## 6. Archivos

Nuevos: `app/src/lib/{config,supabase,online}.ts`,
`app/src/lib/auth/{claims.ts,AuthProvider.tsx,guards.tsx}`,
`app/src/components/layout/AppShell.tsx`, `app/src/router.tsx`,
`app/src/routes/{registry.tsx,LoginPage.tsx,PanelPage.tsx,ModulePlaceholderPage.tsx,SincronizacionPage.tsx,StatePages.tsx}`.
Modificados: `app/{package.json,vite.config.ts,tailwind.config.js,index.html}`,
`app/src/{main.tsx,App.tsx,index.css,vite-env.d.ts}`, `package.json` y `package-lock.json`.

Dependencias: `react-router-dom@6.30.6` (resuelto), `@supabase/supabase-js@2.119.0`,
`@types/node@^22` (dev, para `vite.config.ts`).

Corrección de revisión: `vite.config.ts` (guard build-time), `lib/auth/{claims,AuthProvider,guards}`,
`routes/{LoginPage,registry,ModulePlaceholderPage,PanelPage,SincronizacionPage,StatePages}`,
`components/layout/AppShell.tsx` y este reporte.

---

## 7. Criterios de aceptación F1-02

| Criterio | Estado |
|---|---|
| `npm run build` verde | **Cumplido** (también sin `.env`) |
| Rutas protegidas redirigen a login | **Cumplido y verificado** (smoke 1, 2, 13–16, 24) |
| Sin secretos en bundle / sin `service_role` | **Cumplido** (guard build-time + verificación) |
| Tema institucional y accesibilidad base | **Cumplido** |
| Router M1–M13, layout, sesión, selector de organización | **Cumplido** |
| **App instalable (manifest + SW + iconos)** | **Pendiente → F1-02b** (diseño aprobado; artefactos pre-generados en `C:\Proyectos\hidria-f1-02b-design`) |
| Lighthouse PWA ≥ 90 | **Diferido**: medición en staging/F1-16 con decisión documentada (Lighthouse ≥ 12 eliminó la categoría PWA) |
| CI 4/4 en el PR | Ver §11 (nuevo head) |

---

## 8. Decisiones y observaciones

1. **Router**: `react-router-dom` 6 con `createBrowserRouter`; URLs reales (necesario para E2E,
   deep links y PWA).
2. **`envDir` a la raíz**: sólo `VITE_*` llega al bundle; la guarda build-time (nueva) impide que
   una clave de servicio se empaquete.
3. **Claims del JWT** (ADR-005) son la única fuente de rol/organización; `profiles` sólo aporta
   nombre/organización de presentación (ya no se lee `profiles.global_role`).
4. **`/privacidad`** sigue bajo sesión en esta entrega; la ruta pública con el texto íntegro de
   `docs/06` se hará en **task-51** (indicación del supervisor). El texto actual no inventa ni
   resume el aviso legal.
5. **`react-router-dom@6.30.6`**: `npm audit --omit=dev` reporta 2 moderadas
   (open-redirect CWE-601 GHSA-wrjc-x8rr-h8h6 y SSR hydration GHSA-337j-9hxr-rhxg). La segunda no
   aplica (cliente sin SSR); la primera se mitiga con el `safeRedirect` endurecido y su prueba
   (§3.4/§5). El **upgrade mayor a 7.18.5** se evalúa en **task-51** (fuera de esta corrección, por
   indicación del supervisor).
6. **`service_role` literal en el bundle**: es la constante de comparación de la guarda de runtime y
   su mensaje; no es una credencial. Se señala para que la revisión de seguridad no lo confunda.
7. **Dexie/`ops_queue` no se incluyó**: la cola pertenece a las tareas de captura offline
   (M4/M6/M10) y depende de la decisión de escritura (PostgREST vs EF `POST /sync`); la pantalla
   `/sincronizacion` publica la regla y no simula valores.

---

## 9. Pendiente: F1-02b (PWA instalable)

Diseño aprobado por supervisor y **sign-off condicionado de seguridad-privacidad**; artefactos
pre-generados fuera del repo (`C:\Proyectos\hidria-f1-02b-design`): iconos 192/512/maskable/180,
fuente SVG, `manifest.webmanifest`, `offline.html`, borrador de `sw.ts` y `tsconfig.sw.json`.
Condiciones de seguridad a incorporar: `NetworkOnly` para `*.supabase.co` **y** R2; no hay handler
genérico de caché; denylist ampliada (`/sw.js`, `/screenshots/`, `/assets/`, manifest, icons,
`offline.html`); mensaje `SKIP_WAITING` validado por origen del cliente y sin payload; **la caché
HTTP del navegador no la controla el SW** → exigir `Cache-Control: no-store/private` en
Supabase/EF/R2 sensible o `fetch(..., {cache:'no-store'})` en descargas (coordinación con Dev EF/
DevOps); sin localStorage/IndexedDB en el SW; texto de `offline.html` sin prometer persistencia.
Lighthouse: evidencia CDP (E1–E5) como principal y, si el Revisor pide el literal,
`lighthouse@11.7.1 --only-categories=pwa` pinneado; Lighthouse actual para perf/a11y/SEO.

---

## 10. Tamaño del diff y secuencia

Head revisado: **25 archivos, +2,143/−73** (excepción de tamaño aceptada por el supervisor como
unidad: router+layout+sesión sólo son verificables juntos con el smoke). La corrección de revisión
añade commits nuevos encima (no reescribe historia) y mantiene el alcance: B1, M1, menores y
condiciones de seguridad aplicables. F1-02b va en PR de secuencia aparte.

---

## 11. Estado de la corrección (SHA y CI)

- **Head final del PR:** `61aaa21` (`61aaa21df0e3e08d60d824e76d84ae43119da72e`), 3 commits sobre
  `5cc56ed` sin reescribir historia: corrección (`32a1da8`) + cierre documental del reporte
  (`61aaa21`).
- **Delta de corrección de código:** 12 archivos, +500/−249 (sólo `app/**` y este reporte). El
  último commit es **sólo** `reports/F1/F1-02_shell_pwa.md` (+13/−7); el código revisado por
  spec/seguridad/QA es el de `32a1da8`.
- **CI en `32a1da8`:** **5/5 job runs verdes** — run `42510516213` (Guardas de repositorio + Edge
  Functions (Deno) + Cliente lint/typecheck/build) y run `42510511667` (Guardas + Cliente).
  **CI en `61aaa21`:** **5/5 verdes** — runs `42510796869` y `42510792401`.
- **Merge:** squash `6c1372b95cbc1e3fafe9f4383b751c8814586106` en `main`.
- **Evidencia local:** lint/typecheck/build **0** (también sin `.env`); build-time guard de clave
  pública probado en negativo; **smoke E2E CDP 24/24** sobre el build de producción (3 escenarios
  negativos de B1, 6 variantes de redirect malicioso rechazadas + control positivo, shell/guardas,
  logout).
- **Re-revisión acotada:** **task-52** spec (B1+M1+m1–m5), **task-53** delta de seguridad
  (SEC-PR12-01/05/06/07), **task-54** re-QA delta; veredictos favorables con ese código.

*Reporte de `dev-frontend-pwa` para F1-02a (corrección de revisión de PR #12).*
