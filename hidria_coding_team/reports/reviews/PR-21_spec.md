# Revisión de especificaciones — PR #21 — feat(f1-02b) A/2: PWA instalable

- **Revisor:** `revisor-especificaciones` (agente 06)
- **Fecha:** 2026-11-08 13:12 (America/Mexico_City)
- **PR:** [#21](https://github.com/horaciomartinez-svg/hidria-ect/pull/21) — `feature/F1-02b-pwa` → `main`
- **Head revisado:** `4b41f7e7c2462b3edd0b8451c2c9e5a0cc5772c2` (1 commit, 20 archivos, +7173/−2252; base `main@4765986`).
- **CI en `4b41f7e`:** Guardas/Cliente/Deno + **pgTAP** `success`; `mergeable_state: clean`.
- **Veredicto:** **CAMBIOS SOLICITADOS.** 1 BLOQUEANTE/MAYOR (la comprobación de mismo origen del `SKIP_WAITING` es por prefijo, no por origen exacto), 1 MAYOR documental (la corrección de fases M5/M7 que el reporte dice aplicada no está en este PR) y observaciones menores de script/cache/estado.

---

## 1. Alcance y verificación

Revisados los 20 archivos: manifest, iconos, `offline.html`, `sw.ts`, `register.ts`, `vite.config`, `tsconfig.sw.json`, `index.html`, `main.tsx`, `config.ts`, `package.json`, reportes y lockfile. Contraste con ADR-008, sign-off de seguridad (política de caché), F1-02a y `docs/04`/`docs/06`; sin ejecutar build (CI 6/6) ni modificar archivos.

## 2. Lo que PASA

| Criterio | Resultado | Evidencia |
|---|---|---|
| **Manifest instalable** | ✅ | `manifest.webmanifest`: `id`, `name`, `short_name`, `lang es-MX`, `start_url /?source=pwa`, `scope /`, `display standalone`, `theme_color #0d5c63`, `background_color`, iconos 192/512/512-maskable y shortcuts; `index.html` enlaza manifest y apple-touch-icon. |
| **Nomenclatura institucional** | ✅ | Manifest/offline/UI: SDFI · SRHDS · Tamaulipas; sin `UAT`, `UAT-CIT` ni denominación antigua (barrido de todos los archivos del PR). |
| **Offline estático** | ✅ | `offline.html` autocontenido, es-MX, sin datos de usuario ni llamadas; explica que la captura offline llega con M4/M6/M10. |
| **Política de caché** | ✅ | `sw.ts`: `injectManifest`, precache de shell público; default passthrough; `NetworkOnly` para `*.supabase.co` y `*.r2.dev`/`*.r2.cloudflarestorage.com`; sin handler genérico; no lee `localStorage`/IndexedDB ni transporta tokens. |
| **Precache** | ✅ | Build declarado: 11 entradas, ~539.51 KiB; incluye shell/assets/iconos/manifest/offline; `cleanupOutdatedCaches`; `globIgnores` screenshots/map. |
| **Actualización prompt** | ✅ en lo esencial | `registerType:'prompt'`, `immediate:true`, `injectRegister:false`; no `skipWaiting` automático; mensaje exige exactamente `{type:'SKIP_WAITING'}` sin payload; `devOptions.enabled:false`. |
| **Versionado** | ⚠️ parcial | `__APP_VERSION__` y `__APP_BUILD__` definidos en `vite.config`/`config.ts`; la UI de `/acerca` y el nombre de caché que describe el diseño quedan para B/2 (ver m3). |
| **Alcance/CI/secretos** | ✅ | 20 archivos en `app/**`, reports y lock raíz; 0 en `supabase/**`, `.github/**`, `docs/**`; CI 6/6; sin secretos; guard build-time de clave pública conservado. |

## 3. Hallazgos

### B1 — BLOQUEANTE/MAYOR: `SKIP_WAITING` no comprueba origen exacto

**Archivo:** `app/src/pwa/sw.ts` L48-57.

```ts
const sourceUrl = source && 'url' in source ? source.url : '';
if (!sourceUrl.startsWith(self.location.origin)) return;
```

El sign-off exige «cliente del **mismo origen**». `startsWith(origin)` acepta URLs cuyo origen **empieza** por el origen legítimo (p. ej. `https://hidria.pages.dev.evil.example`). Aunque los clientes de un SW son normalmente same-origin, la comprobación no implementa literalmente la condición de seguridad y es la clase de defecto que el test debe fijar. **Fix:** `new URL(sourceUrl).origin === self.location.origin` (con try/catch para URL inválida) y test de mensaje desde un `source` no exacto. No exige payload ni cambios de manifest.

### M1 — MAYOR: la corrección de fases M5/M7 no está en este PR, pero el reporte dice que sí

`reports/F1/F1-02b_diseno_pwa.md` §13.2 afirma que en **este PR** se aplicó `registry.tsx`: **M5 (IIH) → F2** y **M7 → F1** con `phaseNote` F1 mínimo/F2 completo. Pero:

- El diff de #21 **no incluye** `app/src/routes/registry.tsx` (20 archivos listados).
- `main@4765986` mantiene `M5 phase: F1` y `M7 phase: F1` (con `phaseNote`), que es lo aprobado en F1-02a, no la decisión híbrida posterior.

No es un defecto de instalabilidad, pero es una **contradicción documental/alcance**: o se incluye la corrección en A/2, o se difiere explícitamente a B/2 (#22) y se corrige el reporte. No debe quedar como «aplicada en este PR» si no está en el diff.

### Observaciones menores

| # | Archivo | Observación |
|---|---|---|
| m1 | `app/package.json` L12 | `pwa:audit` apunta a `scripts/pwa-audit.mjs`, que **no existe** en este PR. El reporte §13.1 dice que se implementa; B/2 lo traerá. Quitar el script hasta B/2 o dejar claro que no es ejecutable todavía. |
| m2 | `sw.ts` L21 + diseño D8 | El diseño promete caché `hidria-shell-<vX.Y.Z>-<build>`, pero `precacheAndRoute(self.__WB_MANIFEST)` no recibe `cacheName`; `__APP_BUILD__`/`APP_BUILD` no se usan en el SW. `cleanupOutdatedCaches` cubre la limpieza, pero el nombre de caché versionado no está implementado (B/2/§acerca). |
| m3 | `offline.html` L105 | `onclick="location.reload()"` inline; si F1-16 añade CSP `script-src 'self'`, el botón fallará. Usar listener externo o documentar la excepción CSP. |
| m4 | `F1-02b_diseno_pwa.md` L8 | El documento se autodeclara «DISEÑO — sin rama, sin commits, sin PR» aunque ya está versionado en #21; actualizar el estado y separar A/2/B/2. |
| m5 | `register.ts` L253 del diseño vs código | El diseño menciona `onRegisteredSW`; el código no lo pasa. No funcional, pero corregir la afirmación. |
| m6 | `register.ts` L43/L51 | El ack de «offline listo» usa `localStorage` (clave sin PII); el SW no lo usa, pero conviene aclarar que es estado de UI, no almacenamiento del SW/tokens. |

## 4. Conclusión

**CAMBIOS SOLICITADOS.** El núcleo A/2 está bien encaminado: manifest/iconos/offline, precache de shell, `NetworkOnly` Supabase/R2, prompt sin `skipWaiting` automático, SW fuera de dev, alcance y CI 6/6. Corregir **B1** (origen exacto) y **M1** (fases/reporte) y aclarar m1–m6; con ello pasa a **APROBADO**. La parte B/2 (#22: UI, instalación, CDP) no se revisa aún.

**Criterio de re-revisión acotada:** cambio en `sw.ts` para origen exacto + test; decisión/ajuste de fases (código o reporte); aclaraciones de script/caché/estado; guarda 3, CI y sin secretos. No se ejecutaron comandos Git de escritura ni merges; este reporte es el único archivo escrito.
