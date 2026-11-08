# ADR-008 — Criterio de aceptación PWA: evidencia CDP en lugar de «Lighthouse PWA ≥ 90»

- **Estado:** **aceptada con condiciones** (2026-11-08; supervisor + `revisor-especificaciones` + `seguridad-privacidad`)
- **Fecha:** 2026-11-08
- **Autor:** Lead (creador)
- **Sustituye:** criterio «Lighthouse PWA ≥ 90» de `F1-02`/`docs/05`/`F1-16`
- **Documentos afectados:** `docs/05` (casos PWA), `docs/07` (criterios de aceptación), `tasks/F1/F1-16`, `reports/F1/F1-02b_pwa.md`
- **Aprobación requerida:** `revisor-especificaciones` + `seguridad-privacidad` (+ supervisor)

## 1. Contexto

El criterio de aceptación de `F1-02` y de `F1-16` incluía **«Lighthouse PWA ≥ 90»**.
**Lighthouse v12.0.0 (2024) eliminó la categoría PWA**; la versión actual (13.6) ya no la
calcula. El criterio, tal como está redactado, **no es medible** con la herramienta vigente.
No es un cambio de producto ni de seguridad: la app sigue siendo instalable/offline; lo que
cambia es **cómo se demuestra**.

## 2. Decisión

1. **Evidencia principal (gate de F1-02b/F1-16):** auditoría **CDP** ejecutada por QA/dev en
   Chrome headless versionado, con salida reproducible y versión registrada:
   - `Page.getAppManifest` sin errores y con manifest válido (name, start_url, display,
     icons 192/512/maskable, theme).
   - `Page.getInstallabilityErrors` **vacío**.
   - Service worker **controlando** la página (`navigator.serviceWorker.controller` no nulo).
   - **Navegación offline** verificada (shell precacheado y `offline.html`).
   - Registro de versión de Chrome/CDP y del `__APP_BUILD__` auditado.
2. **Medición literal opcional (no gate):** `lighthouse@11.7.1` pinneado, con
   `--only-categories=pwa`, documentando el pin y su obsolescencia. Sirve para conservar la
   métrica histórica, **no** para aprobar/rechazar.
3. **Rendimiento/accesibilidad/SEO:** Lighthouse **13.x** (categorías vigentes), con umbrales
   de `docs/05` donde existan; se reporta como evidencia complementaria.
4. **Trazabilidad:** `docs/05` se actualiza en `F1-18` (criterio PWA-01…PWA-09 con evidencia
   CDP); `F1-16` usa esta misma matriz. `F1-02b` verifica manifest/SW/offline local y deja
   Lighthouse formal a staging.

## 3. Alternativas consideradas

- **Mantener «Lighthouse PWA ≥ 90»:** rechazado; la categoría ya no existe en Lighthouse ≥12.
- **Usar solo Lighthouse 11.7.1 pinneado:** rechazado como gate; herramienta obsoleta y sin
  mantenimiento; se conserva solo como medición histórica opcional.
- **Sustituir por auditoría manual:** rechazado; CDP es automatizable, reproducible y
  verificable en CI/staging.

## 4. Consecuencias

- El criterio de aceptación PWA pasa a ser **verificable y automatizable** (CDP) sin depender
  de una categoría eliminada.
- `F1-16` y `docs/05` deben citar este ADR; `F1-18` sincroniza el texto.
- No hay cambios de producto, RLS, EF ni datos; no afecta al PR #12.
- Riesgo residual: CDP puede cambiar entre versiones de Chrome; se mitiga registrando la
  versión y manteniendo el script versionado (`tests/e2e/` o `qa/e2e/`).

## 5. Aprobación

| Rol | Nombre | Estado | Evidencia |
|---|---|---|---|
| Lead | `lead` | **redactado** | Este ADR |
| Supervisor | `supervisor-hidria` | **APROBADO** (2026-11-08) | ADR-008 + criterio CDP acordado con F1-16/F1-18; evidencia en `reports/F1/F1-02b_pwa.md` y `reports/qa/` |
| Revisor | `revisor-especificaciones` | **APROBADO con condiciones** (2026-11-08) | `reports/reviews/PR-12_spec.md` (anexo ADR-008): registrar versión Chrome/CDP y verificar disponibilidad de `Page.getInstallabilityErrors`; si no está disponible, usar manifest + SW + offline como evidencia equivalente; actualizar F1-16 y `docs/05` en F1-18 |
| Seguridad | `seguridad-privacidad` | **APROBADO con condiciones** (2026-11-08) | `reports/security/PR-12_security.md` §11: CDP versionado y reproducible (Chrome/CDP + `__APP_BUILD__` registrados), auditoría E4/E5/E7 sin respuestas Supabase/R2 ni tokens/URLs de sesión, screenshots/trazas sin PII y sin EXIF; `lighthouse@11.7.1` sólo histórico no-gate; Lighthouse 13.x complementario |

### 5.1 Condiciones de seguridad (visto bueno)

1. La evidencia CDP debe estar **versionada y ser reproducible**, registrando versión de
   Chrome/CDP y `__APP_BUILD__`.
2. Debe incluir la verificación de **caché/offline** (E4/E5/E7 del diseño F1-02b): `CacheStorage` y
   artefactos sin respuestas de Supabase/R2, sin tokens ni URLs de sesión.
3. Scripts, trazas y screenshots sin tokens/PII (sesiones sintéticas; screenshots ficticios sin
   EXIF).
4. `lighthouse@11.7.1` se conserva sólo como medición histórica **no-gate**; Lighthouse 13.x
   (performance/a11y/SEO) es complementario.
5. `docs/05` se actualiza en F1-18 y F1-16 cita este ADR; el visto bueno no sustituye las
   condiciones de seguridad de F1-02b ni el sign-off del service worker con E7/E8.
