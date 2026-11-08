# Revisión de especificaciones — PR #12 — feat(f1-02a): shell PWA

- **Revisor:** `revisor-especificaciones` (agente 06)
- **Fecha:** 2026-11-07 21:02 (America/Mexico_City)
- **PR:** [#12](https://github.com/horaciomartinez-svg/hidria-ect/pull/12) — `feature/F1-02-shell-pwa` → `main`
- **Head revisado:** `5cc56ed8e42f54763da0211076b9c0cf2571a367` (1 commit, 25 archivos, +2143/−73; base `main@20b6c50`).
- **CI en `5cc56ed`:** 4/4 `success` (runs `42440590287` y `42440602900`, `Guardas de repositorio` + `Cliente`). `mergeable_state: clean`.
- **Veredicto:** **CAMBIOS SOLICITADOS.** 1 BLOQUEANTE (la sesión con claims ausentes/inválidos no falla cerrada en el cliente), 1 MAYOR (fases de M5/M7 en el registro contradicen ADR-003) y observaciones menores de datos/evidencia.

---

## 1. Alcance y método

Revisados los 25 archivos del PR (router, `registry.tsx`, layout, sesión/claims, guardas, páginas, tema, `vite.config`, `package.json`/lock y reporte) y su contraste con `docs/04` §2.1/§6/§7/§9, `docs/07` §3, **ADR-003** (plan de fases que prevalece) y ADR-005. Verificación de rutas, claims, nomenclatura y secretos; sin ejecutar el build (CI 4/4) ni modificar archivos.

La excepción de tamaño (~1,900 líneas efectivas) está documentada en el PR/reporte; no es un hallazgo de especificaciones por sí misma. F1-02b (PWA instalable) queda fuera y se difiere correctamente.

---

## 2. Lo que PASA

| Criterio | Resultado | Evidencia |
|---|---|---|
| Rutas M1–M13 + servicio | ✅ | `router.tsx` + `registry.tsx`: 13 módulos (`/kanban` M11, `/empresas` M1, `/diagnosticos` M2, `/documentos` M3, `/cat` M4, `/iih` M5, `/bhe` M6, `/muestreo` M7, `/ivoh` M8, `/reporte` M9, `/bitacora` M10, `/aula` M12, `/informes` M13) + `/login`, `/`, `/sincronizacion`, `/acerca`, `/privacidad`, 404. |
| Contratos citados, sin endpoints/datos inventados | ✅ | Cada `ModuleDef.contract` cita EF-01…EF-12, tablas/vistas de `docs/02` o §7/§9 de `docs/04`; placeholders no incluyen registros simulados. |
| Claims ADR-005 en lectura | ✅ | `claims.ts`: `organization_id` con precedencia, `tenant_id` alias, `GLOBAL_ROLES` de 6 y validación del enum; `AuthProvider` deriva claims del access token. |
| Guardas y redirección sin sesión | ✅ | `RequireAuth` redirige a `/login` conservando destino; `RequireGlobalRole` muestra 403 de UI. Smoke 13/13 del reporte verifica sin sesión `/kanban` y `/` → login, sesión válida monta shell, logout → login. |
| Nomenclatura institucional | ✅ | UI/tema usan SDFI · SRHDS · UCI (`LoginPage`, `StatePages`, `AppShell`, `index.html`); barrido de `app/**`: sin `UAT`, `UAT-CIT` ni la denominación antigua de la SRHDS. |
| Gates no encolables | ✅ | `/sincronizacion` lista EF-01…EF-07, EF-10 y EF-12 como operaciones que requieren conexión; coincide con `docs/04` §6.4 y la regla de TEAM §5. |
| Solo variables públicas | ✅ | `config.ts` lee únicamente `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`; `supabase.ts` crea el cliente solo si están configuradas y no hay `role: service_role`; el literal `service_role` aparece solo en la guarda/mensaje, no como credencial. |
| Criterios diferidos | ✅ | App instalable → F1-02b; Lighthouse → staging/F1-16; Dexie/`ops_queue` → tareas de captura offline (M4/M6/M10). Reporte §8 lo explicita. |
| Alcance y CI | ✅ | 25 archivos en `app/**`, `package.json`/`package-lock.json` raíz y el reporte; 0 en `supabase/**`, `.github/**` o `docs/**`; CI 4/4; sin secretos en el diff. |

---

## 3. Hallazgos

### B1 — BLOQUEANTE: la sesión no falla cerrada ante claims ausentes o inválidos

**Archivos:** `AppProvider.tsx` (`AuthProvider`, L54-67), `lib/auth/guards.tsx` (`RequireAuth`, L12-22), `routes/LoginPage.tsx` (L31-32), `lib/auth/claims.ts` (`readClaims`, L55-64).

- `AuthProvider` marca `status = 'authenticated'` con **cualquier** sesión (`setStatus(nextSession ? 'authenticated' : 'anonymous')`); no exige claims válidos.
- `readClaims` solo exige `sub`: devuelve `organizationId` si hay un valor no vacío (sin validar UUID) y `globalRole` puede ser `null` si falta o no está en el enum.
- `RequireAuth` solo mira `status`; por tanto, una sesión con token sin `organization_id`/`global_role` (o con un UUID inválido) monta el shell. `/`, `/sincronizacion`, `/acerca` y `/privacidad` quedan accesibles; las rutas con `RequireGlobalRole` muestran 403 de UI, pero no redirigen a login.
- `LoginPage` redirige a `/` si `status === 'authenticated'`, aunque `claims` sea inválido/null; no hay estado de “claims inválidos”.
- El smoke 13/13 del reporte (§4) usa un JWT con claims válidos o sin sesión; **no cubre** el caso “sesión válida con claims ausentes/inválidos”, que es justo el requisito de falla cerrada.

Esto contradice el criterio 2 de la revisión («claims ADR-005 … fail-closed; rutas protegidas → login») y deja una sesión sin claims mostrando el shell y la pantalla de sincronización. **Fix:** validar en `AuthProvider`/`RequireAuth` la presencia de `sub`, un `organization_id` UUID y un `globalRole` del enum; si faltan, tratar la sesión como no autenticada/inválida (login o pantalla de error, nunca shell); no redirigir desde `LoginPage` con claims inválidos; validar UUID en `readClaims`; añadir un caso de smoke/E2E con JWT sin claims y con `organization_id` inválido.

### M1 — MAYOR: fases de M5/M7 en el registro contradicen ADR-003

**Archivo:** `app/src/routes/registry.tsx` (M5 L113-120, M7 L133-140); UI `ModulePlaceholderPage` L12 y `PanelPage` L111 muestran `Fase prevista {phase}`.

- **M5 (IIH)** está marcado `phase: 'F2'`; ADR-003 §2 (que prevalece sobre `docs/07` §3 según su propia decisión) incluye **M5 IIH en Fase 1** (L29-31). El usuario ve “Fase prevista F2” en `/iih` y un badge F2, contradiciendo el plan operativo.
- **M7 mínimo** está marcado `F2`; ADR-003 incluye **M7 mínimo en Fase 1** y deja el M7 completo en Fase 2. Si se mantiene F2, la etiqueta debe decir “F2 completo” y no ocultar que el mínimo existe en F1.
- M6/M8 están en F1 y M12 en F2, coherentes con ADR-003; M13 en F3, coherente con `docs/07` §3.

**Fix:** M5 → F1; M7 → F1 mínimo/F2 completo (o ajustar la etiqueta y el reporte); corregir el reporte §2.1, que no incluye la columna de fase y por tanto no detectó la contradicción.

### Observaciones menores (no bloquean por sí solas)

| # | Archivo | Observación |
|---|---|---|
| m1 | `routes/SincronizacionPage.tsx` L38-49 | Muestra “Operaciones en cola: 0” y “Conflictos: 0” como valores estáticos; la cola Dexie no existe en F1-02a. Son placeholders, pero el criterio «sin datos simulados» exige etiquetarlos como tal (p. ej. “— / no implementado”) o derivarlos de un estado real. |
| m2 | `reports/F1/F1-02_shell_pwa.md` L9, §6 | El reporte cita base `424ca01`/CI “pendiente”; el PR declara base `20b6c50` y CI 4/4 en `5cc56ed`. Actualizar la evidencia al head/base reales. |
| m3 | `reports/F1/F1-02_shell_pwa.md` §7.3 | Dice que `profiles.global_role` se usa como etiqueta si falta el claim; el código no usa `profile.globalRole` (solo `claims.globalRole`). Aclarar/eliminar la afirmación (no debe usarse para autorizar). |
| m4 | `reports/F1/F1-02_shell_pwa.md` | Diferencias de conteo (24/25 archivos, ~1,900 vs +2,143) y smoke sin caso de claims inválidos; actualizar el reporte y añadir ese caso al smoke. |
| m5 | `lib/auth/claims.ts` L55-64 | `firstNonEmpty` no valida UUID de `organization_id`/`tenant_id`; parte del fix de B1 (un claim inválido no debe montar la sesión). |

---

## 4. Conclusión

**CAMBIOS SOLICITADOS.** El shell, las rutas M1–M13, los contratos citados, las guardas básicas, la nomenclatura, la regla de gates y la configuración sin `service_role` están bien resueltos. Pero **B1** incumple el criterio de falla cerrada de claims (el shell se monta con una sesión sin claims válidos) y **M1** muestra fases incorrectas para M5/M7 frente a ADR-003.

**Criterio de re-revisión acotada:**

- [ ] **B1:** `AuthProvider`/`RequireAuth` rechazan sesión sin `sub`/`organization_id` UUID/`globalRole` válido; `LoginPage` no redirige en ese caso; smoke con JWT sin claims y con UUID inválido → login/error.
- [ ] **M1:** M5 en F1; M7 F1 mínimo/F2 completo; actualizar `registry.tsx`, etiquetas y reporte.
- [ ] m1–m5: placeholders de cola sin valores falsos, base/CI del reporte, afirmación de `profile.globalRole`, validación UUID y conteos.
- [ ] Mantener guarda 3 (`docs/02` intacto), CI 4/4 y sin secretos.

Con B1/M1 corregidos, el PR pasa a **APROBADO**; seguridad y QA siguen pendientes. No se ejecutaron comandos Git de escritura ni merges; este reporte es el único archivo escrito.

---

# Anexo final — Re-revisión delta PR #12 (`32a1da8`, APROBADO) + ADR-008

- **Head revisado:** `32a1da808659491c0be42ac3f100544300a974b6` (2 commits, 25 archivos, +2405/−84; base `20b6c50`).
- **CI:** success (runs `42510511667`/`42510516213`; incluye `Guardas`, `Cliente` y **`Edge Functions (Deno)`**); `mergeable_state: clean`.
- **Delta `5cc56ed..32a1da8`:** 12 archivos (auth, guardas, Login, registry, AppShell, StatePages, Sincronización, `vite.config` y reporte); sin cambios de rutas/contratos ni de dependencias.
- **Veredicto vigente:** **APROBADO**. Sustituye el CAMBIOS SOLICITADOS anterior.
- **Condición documental:** el supervisor anunció un commit docs-only posterior sobre `32a1da8` (solo `reports/F1/F1-02_shell_pwa.md`). La aprobación se mantiene si el delta vs `32a1da8` es exclusivamente ese reporte.

## Verificación

| Punto | Resultado | Evidencia |
|---|---|---|
| **B1 — fail-closed de claims** | ✅ **Corregido** | `readClaims`: exige `sub` UUID, `organization_id`/`tenant_id` UUID (precedencia org, alias) y `global_role` del enum; devuelve `null` si falta cualquiera. `AuthProvider`: estados `invalid_claims`; no deja `authenticated` sin claims. `RequireAuth`: `anonymous`/`invalid_claims` → `/login` con `state.error`. `LoginPage`: solo redirige con `authenticated`; con `invalid_claims` muestra aviso `data-invalid-claims` y opción de cerrar sesión. |
| **Smoke negativo B1** | ✅ | Reporte §5: 24/24; casos 13–16: sin claims, sin `organization_id`/`global_role`, UUID inválido y rol fuera del enum → login sin shell; 6 variantes de redirect malicioso (SEC-PR12-06) + control. |
| **M1 — fases M5/M7** | ✅ **Corregido** | `registry.tsx`: M5 (IIH) → **F1**; M7 → **F1** con `phaseNote` «captura mínima en F1 · dictamen completo en F2»; M9 nota «esencial en F1 · avanzado en F3»; M6/M8 F1, M12 F2, M13 F3 sin cambios indebidos. `phaseNote` visible en placeholder y panel. |
| **Menores m1–m5** | ✅ | `/sincronizacion`: «— no implementado» con `data-placeholder`, sin ceros simulados; reporte con base `20b6c50`, head/CI reales y smoke 24/24; `SessionProfile` ya no lee `profiles.global_role`; conteos actualizados; `firstNonEmpty` eliminado. |
| **Seguridad adicional** | ✅ | `vite.config.ts`: guard build-time que rechaza `sb_secret_*`, JWT con rol distinto de `anon` y claves ilegibles; acepta `sb_publishable_*` y JWT `anon` (probado en negativo/positivo); `safeRedirect` rechaza `//`, `\`, `:`, controles y variantes `%5c`; `signOut` navega en `finally`; `RouteErrorPage` oculta detalle en producción. |
| **Regresión** | ✅ | 13 rutas M1–M13 + servicio, contratos citados sin endpoints/datos inventados; nomenclatura SDFI/SRHDS/UCI sin UAT/denominación antigua; gates EF-01…EF-07/10/12 sin cambios; 25 archivos en `app/**`+`package*`+reporte, 0 en `supabase/**`/`.github/**`/`docs/**`; sin `service_role` como credencial ni secretos. |
| **CI / alcance** | ✅ | Success con Deno incluido; `mergeable_state: clean`. |

## Observaciones no bloqueantes

1. **Commit docs-only pendiente:** actualizar §11 del reporte con el SHA/CI finales; si no llega, el reporte queda con `5cc56ed` como head revisado (no afecta al código).
2. **`LoginPage` con `invalid_claims`:** tras «Cerrar sesión», `location.state.error` puede mantenerse y el aviso seguir visible; limpiar el state al hacer logout (mejora de UX, no seguridad).
3. **`safeRedirect`:** rechaza cualquier `:` en la ruta, incluidas query strings legítimas con hora; es conservador y seguro, pero conviene documentarlo o permitir `:` solo tras `?` si se necesita.
4. **PR body:** sigue citando base `424ca01` y conteos antiguos; actualizar al mergear (el reporte ya está corregido).
5. **`Page.getInstallabilityErrors`** (ADR-008): registrar la versión de Chrome/CDP y verificar disponibilidad; si desaparece, usar manifest + SW + offline como evidencia equivalente (condición registrada en el ADR).

## ADR-008 — visto bueno del revisor

**APROBADO con condiciones**, registrado en `decisions/ADR-008-criterio-pwa-cdp.md` (estado «aceptada con condiciones»; supervisor y revisor aprobados; seguridad pendiente):

- Sustituye «Lighthouse PWA ≥ 90» por evidencia CDP (manifest sin errores, `getInstallabilityErrors` vacío, SW controlando, navegación offline, versión registrada), con `lighthouse@11.7.1 --only-categories=pwa` opcional pinneado y Lighthouse 13.x para rendimiento/a11y/SEO.
- Condiciones: registrar versión Chrome/CDP y verificar el método; fallback manifest+SW+offline si el método no está disponible; actualizar F1-16 y `docs/05` en F1-18; visto bueno de seguridad pendiente.
- No afecta al PR #12 (shell sin SW) ni cambia producto/RLS/EF.

## Conclusión

**APROBADO** para el squash de PR #12 en `32a1da8` (y en el head docs-only si este solo actualiza el reporte). B1/M1 y menores están corregidos; rutas/contratos/nomenclatura/gates/alcance/CI sin regresión. Seguridad y QA siguen pendientes. No se ejecutaron comandos Git de escritura ni merges; este anexo es el último de `PR-12_spec.md`.

---

## Constancia — head documental final `61aaa21` (APROBADO se mantiene)

- **Head final del PR:** `61aaa21df0e3e08d60d824e76d84ae43119da72e` (3 commits; base `20b6c50`; 25 archivos, +2411/−84).
- **Delta `32a1da8..61aaa21` verificado por API:** **1 archivo, +13/−7**, exclusivamente `hidria_coding_team/reports/F1/F1-02_shell_pwa.md` (§11 con SHA/CI/smoke); **código idéntico a `32a1da8`**.
- **CI en `61aaa21`:** 5/5 checks `success` (runs `42510792401`/`42510796869`: Guardas, Cliente y Edge Functions Deno); `mergeable_state: clean`.
- **Consecuencia:** el código evaluado sigue siendo `32a1da8`; el commit final solo actualiza la evidencia. **El APROBADO de este reporte se mantiene para `61aaa21`.**
- **ADR-008:** el visto bueno del revisor sigue registrado en `decisions/ADR-008-criterio-pwa-cdp.md` (aprobado con condiciones; seguridad pendiente).
- No se ejecutaron comandos Git de escritura ni merges; esta constancia cierra la revisión de especificaciones de PR #12.
