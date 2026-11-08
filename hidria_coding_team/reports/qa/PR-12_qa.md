# PR #12 — QA: F1-02a Shell PWA (router M1–M13, sesión, guardas y tema)

- **Agente:** `qa-tester` (05)
- **Fecha:** 2026-11-07 21:05 (America/Mexico_City) · **re-QA delta:** 2026-11-08 12:40
- **Tareas:** `task-48` (QA inicial `5cc56ed`) · `task-54` (re-QA delta `5cc56ed..32a1da8`)
- **PR:** [#12](https://github.com/horaciomartinez-svg/hidria-ect/pull/12) — `feature/F1-02-shell-pwa` → `main`
- **Head inicial evaluado:** `5cc56ed8e42f54763da0211076b9c0cf2571a367`
- **Head final de código:** `32a1da808659491c0be42ac3f100544300a974b6` · **head final PR:** `61aaa21df0e3e08d60d824e76d84ae43119da72e` (commit docs-only sobre `32a1da8`; solo reporte +13/−7)
- **Base:** `main` `20b6c509c6a5e4436b33f12eb324efefcf06bef5`
- **Diff del PR:** 25 archivos, +2411/−84 (código `app/**` + `package.json`/lock + reporte F1-02). Sin `supabase/**`, `.github/**`, `docs/**` ni `tests/**`.
- **Entorno:** Windows / PowerShell 5.1 · Node **24.21.0** / npm 11.19.0 (CI Node 22) · build sin `.env`

## Resultado histórico `5cc56ed`: AMARILLO — merge permitido con excepción E2E documentada

> **Re-QA delta `32a1da8` (task-54):** ver sección final. Dictamen final:
> **AMARILLO — merge permitido con excepción E2E documentada** (sin cambios de doctrina).
> B1 (falla cerrada de claims) y M1 (fases M5/M7) quedan **corregidos y verificados
> estáticamente**; build/lint/typecheck reproducidos; CI 5/5 (incl. Deno). El smoke 24/24
> sigue **no reproducible** (script no versionado) → H-15/task-49; sin verdes funcionales.

## 1. Build/lint/typecheck reproducidos (sin `.env`)

Se materializó el árbol del head `5cc56ed` con `git archive` (sin git de escritura) y se
verificó que **no existe `.env`** en el árbol; después:

| # | Comando | Resultado |
|---|---|---|
| 1 | `npm ci` | **exit 0** (instala workspace; sin errores de lock) |
| 2 | `npm run lint` | **exit 0** (`eslint src`) |
| 3 | `npm run typecheck` | **exit 0** (`tsc --noEmit`) |
| 4 | `npm run build` | **exit 0** — 91 módulos; `dist/index.html` 0.81 kB; CSS 17.51 kB (4.13 kB gzip); JS **473.13 kB** (136.84 kB gzip); 2.50 s |

Coincide con la evidencia del reporte (91 módulos; 473.13 kB / 136.84 kB gzip; CSS 17.51 kB)
y con el job de CI. `vite.config.ts` usa `envDir` al `.env` raíz; **el build no exige
variables** y el runtime cae en `ConfigMissingPage` si faltan (`lib/config.ts`).

## 2. Smoke E2E 13/13 — evidencia no reproducible (excepción)

El reporte describe: build servido con `vite preview`, **Chrome headless por CDP**
(`--remote-debugging-port`), lectura de `document.body.innerText`/`document.title`, sesión
sembrada en `localStorage` con un JWT de smoke con claims ADR-005; resumen **13/13 OK**.
Puntos verificados por QA:

- El **script no está en el repo**: `git grep smoke/CDP/remote-debugging` solo encuentra el
  reporte, agentes y tareas; el propio reporte declara «script fuera del repo (`%TEMP%`), no
  versionado». **No es posible reproducir el 13/13 desde el árbol del PR**.
- No hay suite E2E/Playwright en `tests/` ni job E2E en CI (el CI solo ejecuta guardas +
  cliente). Los usuarios del seed **no tienen contraseña** (ADR-007), por lo que el smoke
  usa un JWT sintético sembrado; no se añadieron credenciales.
- Por tanto: **no se declara VERDE funcional**. Se dictamina **excepción documentada** con
  follow-up obligatorio: **E2E (Playwright) versionado en CI/staging** que cubra los 13
  checks (o su equivalente E2E-01/E2E-09), con comando/salida y artefacto; no bloquea el
  merge de F1-02a, sí el gate de F1.

## 3. Criterios del PR — verificación estática

| Criterio | Evidencia/estado |
|---|---|
| Protegidas → login | `RequireAuth` (`guards.tsx`) envuelve `/` y todo el shell; sin sesión → `Navigate /login` con `state.from`; `/login` es pública. `LoginPage` solo acepta `from` que empiece por `/` y no `//` (anti-open-redirect) |
| Layout/nav/breadcrumbs/claims | `AppShell`: `<aside>` + `<nav aria-label>`, `<header>`, breadcrumbs con `aria-current`, `<main id="contenido">`, `<footer>`; sidebar por `NAV_GROUPS` filtrado por `global_role`; selector de organización desde claim `organization_id` (no editable) |
| Claims ADR-005 | `claims.ts`: `organization_id` con precedencia y `tenant_id` como alias (`firstNonEmpty`), `global_role` validado contra los 6 roles; la UI **no autoriza** (RLS/EF son la autoridad) |
| Rol `invitado` restringido | `registro`: `OPERACION`/`EQUIPO` excluyen `invitado`; `TODOS` incluye `invitado` en M2/M3/M4/M9/M10/M12. `/kanban` y módulos de operación quedan tras `RequireGlobalRole` → `ForbiddenPage`. La denegación de datos reales sigue en RLS/EF |
| Logout | `AuthProvider.signOut()` (Supabase) + `AppShell.handleSignOut` navega a `/login`; menú de sesión muestra perfil/rol/org y botón «Cerrar sesión» |
| Gates no encolables en `/sincronizacion` | Lista exacta **EF-01…EF-07, EF-10, EF-12** (coincide con `docs/04` §6/TEAM §5) y texto «no se encolan»; `docs/04` §6.4 citado; estado online/offline con `aria-live` |
| Sin datos simulados / endpoints inventados | Placeholders citan EF/vista/tabla de `docs/04`/`docs/02`; no hay mocks de cifras; `/sincronizacion` muestra «0» como estado vacío de UI, no datos |
| Tema/AA estático | Tokens Tailwind `hidria`/`semaforo`; contraste sobre blanco verificado por QA: `hidria-600` **7.7:1**, `hidria-700` **9.96:1**, `hidria-500` **4.14:1** (el 500 no se usa como texto; reservado a grande/no textual, como documenta el reporte). `text-hidria-500` no aparece en `src` |
| a11y base | Skip link (`#contenido`), landmarks header/nav/main/aside/footer, foco visible global `:focus-visible`, `prefers-reduced-motion`, `aria-live` en conectividad/estado, `aria-expanded`/`aria-controls` del panel móvil, `aria-current` en breadcrumbs/nav |
| Lighthouse PWA ≥ 90 | **Diferido correctamente** a staging/F1-16 (requiere F1-02b + HTTPS); no se declara |
| App instalable | **Diferido correctamente** a F1-02b: no hay manifest/SW/iconos en el diff (verificado por nombre) |
| Dexie/`ops_queue` | **Diferido** a capturas offline M4/M6/M10: no se añadió Dexie; `/sincronizacion` publica la regla sin simular la cola |

## 4. Seguridad y alcance

| Comprobación | Resultado |
|---|---|
| Alcance | 25 archivos: `app/**`, `package.json`/`package-lock.json`, reporte; **sin** `supabase/**`, `.github/**`, `docs/**`, `tests/**` |
| `.env`/secretos | `.env` no está en el árbol ni trackeado (solo `.env.example`); secret scan del árbol `5cc56ed` sin coincidencias; bundle local sin `SUPABASE_SERVICE_ROLE_KEY` |
| `service_role` | Solo aparece como constante/mensaje de la guarda de `lib/config.ts` y su texto de UI; **no hay credencial**. La guarda falla cerrado si detecta un JWT con `role: service_role` en `VITE_SUPABASE_ANON_KEY` |
| Cliente vs autoridad | Claims de UI no autorizan; `RequireGlobalRole` es visibilidad; RLS/EF son la autoridad (`docs/04` §2.1) |
| CI | **4/4 success en `5cc56ed`** (runs 42440590287 push / 42440602900 PR, `head_sha=5cc56ed`): Guardas + Cliente |
| `docs/02` | Blob idéntico `a2394bce…` a la migración base (sin cambios) |

## 5. Observaciones (no bloqueantes)

| ID | Observación | Severidad | Dueño |
|---|---|---|---|
| O-01 | **Smoke E2E no versionado** (`%TEMP%`) ni ejecutado en CI: el 13/13 no es reproducible por QA; crear suite Playwright versionada y job E2E en CI/staging (los 13 checks o E2E-01/E2E-09) antes de G1. | P2 (G1) | dev-frontend-pwa + devops/QA |
| O-02 | El smoke usa un JWT sembrado en `localStorage` porque el seed no tiene contraseña; el login real E2E (Supabase Auth/hook) queda pendiente (F1-02b/F1-03). | P2 (F1) | dev-frontend-pwa + QA |
| O-03 | La guarda de `service_role` solo decodifica JWT; los nuevos formatos `sb_secret_…` no se detectarían (defensa en profundidad; no son variables `VITE_*`). | P3 | dev-frontend-pwa |
| O-04 | El reporte redondea contraste (`hidria-700 ≈ 10.9:1`); QA mide **9.96:1**. La conclusión AA/AAA no cambia. | P3 (doc) | dev-frontend-pwa |
| O-05 | Diff de ~2.1k líneas/25 archivos supera el umbral de ~400; el autor lo declara y propone secuencia. Decisión de proceso (spec/supervisor), no defecto QA. | proceso | supervisor |
| O-06 | `/privacidad` es placeholder con aviso de publicación íntegra desde `docs/06`; no se inventó texto legal (correcto), pero falta el texto final antes de producción (F2/F3). | P3 (docs) | revisor + dev-frontend-pwa |

## 6. Trazabilidad

`qa/trazabilidad.md` actualizada solo con notas: R-14 (gates no encolables: la pantalla
publica la regla; Dexie/cola diferida), R-17 (claims/guardas de UI; autoridad en servidor),
evidencia F1-02a (build reproducido; smoke 13/13 **solo reporte**, no reproducido) y hueco
H-15 (E2E no versionado/CI). **Ninguna fila nueva a `verde`.**

## 7. Dictamen

**AMARILLO — merge permitido con excepción E2E documentada.** Build/lint/typecheck
reproducidos, criterios estáticos correctos, CI 4/4, alcance y secretos correctos; el smoke
13/13 no es reproducible desde el repo y no está en CI, por lo que **no se declara verde
funcional**. Condición de F1/G1: E2E Playwright versionado en CI/staging con evidencia
(comando/salida/artefacto). QA no mergea; no se ejecutó git de escritura.

## Firma

QA `qa-tester`. Solo reporte QA y matriz; sin modificar `app/**`, `supabase/**`,
`.github/**`, `docs/**` ni `tests/**`. Sin secretos impresos.

## Re-QA delta `5cc56ed..32a1da8` — head final PR `61aaa21` (task-54)

**Motivo:** spec review emitió CAMBIOS SOLICITADOS **B1** (la sesión no fallaba cerrada con
claims ausentes/inválidos), **M1** (fases M5/M7 en `registry.tsx`) y menores. El head final
de código es `32a1da8`; `61aaa21` es **solo documental** (reporte F1-02, +13/−7; código/tests
idénticos). Base `main@20b6c50`; CI **5/5** (Guardas + **Edge Functions (Deno)** + Cliente).

### Ejecución reproducida por QA (código `32a1da8`, sin `.env`)

| # | Comando | Resultado |
|---|---|---|
| 1 | `npm ci` | exit 0 |
| 2 | `npm run lint` | **exit 0** |
| 3 | `npm run typecheck` | **exit 0** |
| 4 | `npm run build` | **exit 0** — 91 módulos; `index.html` 0.81 kB; CSS **17.63 kB** (4.15 kB gzip); JS **475.01 kB** (137.39 kB gzip); 3.82 s |

Coincide con el reporte del autor (475 kB / 137.5 kB gzip; 91 módulos) y con CI. `.env` no
existe en el árbol y el build no lo requiere.

### B1 — falla cerrada de claims (corregido, verificación estática)

| Caso exigido | Implementación | Resultado esperado |
|---|---|---|
| JWT sin `sub` / `sub` no UUID | `readClaims` exige `isUuid(payload.sub)`; si no, `null` | `AuthProvider` → `invalid_claims`, sin shell |
| Sin `organization_id`/`tenant_id` o UUID inválido | `readClaims` toma el primer claim UUID; si no hay, `null` | `invalid_claims`; `RequireAuth` → `/login` con `state.error=invalid_claims` |
| `global_role` ausente/fuera del enum | `isGlobalRole` (6 roles ADR-005); si no, `null` | `invalid_claims`; no se monta el shell |
| Login con claims inválidos | `LoginPage` solo redirige si `status==='authenticated'`; con `invalid_claims` muestra aviso y «cerrar sesión» | **No** redirige a `/`; el usuario ve el error |
| `AuthProvider` | Estado explícito `invalid_claims`, `claims=null`, no `authenticated`; perfil ya no aporta `global_role` (solo presentación) | Falla cerrada |
| `RequireAuth` | `anonymous`/`invalid_claims` → `<Navigate to="/login" ... state.error>`; `Guard` no renderiza hijos | No shell |
| Error page | `RouteErrorPage` oculta detalle en producción (solo `import.meta.env.DEV`), `console.error` sin filtrar al cliente | Sin fuga de detalles |
| Guard build-time (menor SEC-PR12-01) | `vite.config.ts` con `loadEnv` falla el build si `VITE_SUPABASE_ANON_KEY` es `sb_secret_*`, JWT no-`anon` o ilegible; acepta `sb_publishable_*` | No se empaqueta clave de servicio (cierra parte de O-03) |
| Logout | `signOut()` + navegación en `finally` (aunque falle la red) | Vuelve a login |

El smoke reportado incluye **3 escenarios negativos B1** y **6 variantes de redirect
malicioso** rechazadas + control positivo (24/24). **El script sigue sin versionarse**
(`%TEMP%`), por lo que **no es reproducible por QA** → se mantiene la **excepción H-15**
(follow-up task-49 Playwright en CI/staging) y **no se declaran verdes funcionales**.

### M1 — fases ADR-003 (corregido)

| Módulo | Antes | Ahora |
|---|---|---|
| M5 `/iih` | F2 | **F1** |
| M7 `/muestreo` | F2 | **F1** + `phaseNote`: «captura mínima en F1 · dictamen completo en F2» |
| M9 `/reporte` | F1 | F1 + `phaseNote`: «esencial en F1 · avanzado en F3» |

`phaseNote` se muestra en `ModulePlaceholderPage` y `PanelPage`; el resto de módulos no
cambia de fase. Coincide con ADR-003 y con el reporte §2.1.

### Menores (verificados)

- `/sincronizacion` ya **no muestra `0`**: «— no implementado» + `data-placeholder="true"` y
  explica que Dexie/`ops_queue` llega con M4/M6/M10 (no promete persistencia offline).
- Banner offline sin promesa de persistencia; `profiles.global_role` eliminado de
  `SessionProfile` (autorización solo por claims del JWT).
- Reporte del PR actualizado: base `20b6c50`, head `5cc56ed`/corrección `32a1da8`, CI real,
  §11 con runs y smoke 24/24.
- `signOut` navega a login en `finally` aunque falle la red; `RouteErrorPage` oculta detalle
  en producción.

### Regresión / alcance

| Comprobación | Resultado |
|---|---|
| CI en `32a1da8` | **5/5 success** (run 42510516213: Guardas + Deno + Cliente; run 42510511667: Guardas + Cliente) |
| CI en `61aaa21` (docs-only) | **5/5 success** (runs 42510796869 / 42510792401; código idéntico a `32a1da8`) |
| `docs/02` | Blob idéntico `a2394bce…` a la migración base |
| Secretos | Secret scan del árbol `32a1da8` sin coincidencias; `.env` ausente; bundle sin `SUPABASE_SERVICE_ROLE_KEY` |
| Alcance | Delta = 12 archivos (`app/**` + reporte); PR = 25 archivos; **sin** `supabase/**`, `.github/**`, `docs/**`, `tests/**` |
| a11y estática | CSS de accesibilidad sin cambios (skip link, `:focus-visible`, `prefers-reduced-motion`, landmarks, `aria-live`, `aria-expanded/controls`); contraste de tokens igual (7.7 / 9.96 / 4.14); Lighthouse sigue diferido a F1-16 |
| Diferidos | PWA instalable → F1-02b; Lighthouse → F1-16; Dexie/`ops_queue` → capturas offline (correctos) |

### Dictamen final

**AMARILLO — merge permitido con excepción E2E documentada** para `61aaa21` (código
`32a1da8`). **B1 y M1 quedan corregidos y verificados estáticamente**; build/lint/typecheck
reproducidos; CI 5/5; alcance, `docs/02`, secretos y a11y sin regresiones. La única excepción
es que el **smoke 24/24 no está versionado** y no es reproducible (H-15/task-49); no se
declaran verdes funcionales de navegación/claims. Sin observaciones nuevas bloqueantes.
QA no mergea; no se ejecutó git de escritura.
