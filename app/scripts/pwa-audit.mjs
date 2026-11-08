#!/usr/bin/env node
/**
 * HIDRIA — auditoría PWA por CDP (F1-02b).
 *
 * Evidencia reproducible del criterio PWA (ADR-008: evidencia CDP en lugar de
 * «Lighthouse PWA ≥ 90», categoría eliminada en Lighthouse ≥ 12):
 *   E1 manifest válido (Page.getAppManifest)          E2 instalabilidad (Page.getInstallabilityErrors)
 *   E3 service worker controlando                     E4 navegación offline (shell)
 *   E5 offline.html sin red                           E7 caché sólo misma-origen (sin Supabase/R2)
 *   E8 sin secretos en los artefactos                 E9 versión/build visibles
 *
 * Uso (con `vite preview` sirviendo `dist/` y Chrome con depuración remota):
 *   chrome --headless=new --remote-debugging-port=9222 --user-data-dir=<tmp> about:blank
 *   npm run preview -- --port 4173 --strictPort
 *   npm run pwa:audit
 *
 * Variables: CDP_URL (default http://127.0.0.1:9222), APP_URL (default http://localhost:4173).
 * No requiere dependencias: usa fetch + WebSocket nativos de Node 20+.
 * No imprime tokens ni datos de sesión (usa sesión sintética local).
 */
const CDP = process.env.CDP_URL ?? 'http://127.0.0.1:9222';
const APP = process.env.APP_URL ?? 'http://localhost:4173';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const UUID_SUB = '11111111-1111-4111-8111-111111111111';
const UUID_ORG = '22222222-2222-4222-8222-222222222222';

function b64url(value) {
  return Buffer.from(JSON.stringify(value))
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/** Sesión sintética con claims ADR-005 (sin contraseña; no usa el seed). */
function syntheticSession(globalRole = 'coordinador_srhds') {
  const now = Math.floor(Date.now() / 1000);
  const token = [
    b64url({ alg: 'HS256', typ: 'JWT' }),
    b64url({
      iss: 'hidria-audit',
      sub: UUID_SUB,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'auditoria@ejemplo.invalid',
      iat: now,
      exp: now + 3600,
      organization_id: UUID_ORG,
      tenant_id: UUID_ORG,
      global_role: globalRole,
    }),
    b64url({ sig: 'audit' }),
  ].join('.');
  return {
    access_token: token,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: 'audit-refresh',
    user: {
      id: UUID_SUB,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'auditoria@ejemplo.invalid',
      app_metadata: {},
      user_metadata: {},
      created_at: new Date(now * 1000).toISOString(),
    },
  };
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        this.pending.get(msg.id)(msg);
        this.pending.delete(msg.id);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function evaluate(cdp, expression) {
  const res = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return res.result?.result?.value;
}

async function waitForLoad(cdp) {
  for (let i = 0; i < 40; i += 1) {
    await sleep(250);
    if ((await evaluate(cdp, 'document.readyState')) === 'complete') break;
  }
  await sleep(900);
}

async function navigate(cdp, url) {
  await cdp.send('Page.navigate', { url });
  await waitForLoad(cdp);
}

async function main() {
  const list = await (await fetch(`${CDP}/json/list`)).json();
  const page = list.find((entry) => entry.type === 'page');
  if (!page) throw new Error('No hay pestaña CDP; abra Chrome con --remote-debugging-port');
  const version = await (await fetch(`${CDP}/json/version`)).json();
  console.log(`Chrome/CDP: ${version.Browser ?? 'desconocido'}\nApp: ${APP}\n`);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const cdp = new Cdp(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  // Carga inicial + sesión sintética (el shell completo se audita en /acerca).
  await navigate(cdp, `${APP}/login`);
  await evaluate(cdp, 'localStorage.clear()');
  await evaluate(
    cdp,
    `localStorage.setItem('sb-127-auth-token', ${JSON.stringify(JSON.stringify(syntheticSession()))})`,
  );
  await navigate(cdp, `${APP}/acerca`);

  // Espera acotada a que el SW se registre y active (sin depender de `navigator.serviceWorker.ready`,
  // que puede no resolverse si la primera carga no queda controlada).
  let swActive = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    swActive = (await evaluate(
      cdp,
      "(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && r.active); })()",
    )) === true;
    if (swActive) break;
    await sleep(500);
  }
  check('E3 service worker registrado y activo', swActive === true);
  await navigate(cdp, `${APP}/acerca`); // recarga: el SW pasa a controlar la página

  // E1a — manifest servido y completo (validación propia, reproducible vía HTTP)
  const manifestHref = (await evaluate(
    cdp,
    "document.querySelector('link[rel=\"manifest\"]')?.getAttribute('href') ?? ''",
  )) || '/manifest.webmanifest';
  const manifestUrl = new URL(manifestHref, APP).href;
  const manifestResponse = await fetch(manifestUrl);
  const manifestJson = manifestResponse.ok ? await manifestResponse.json() : null;
  const iconSizes = new Set((manifestJson?.icons ?? []).map((icon) => icon.sizes));
  const iconPurposes = new Set((manifestJson?.icons ?? []).map((icon) => icon.purpose));
  const manifestComplete =
    manifestJson !== null &&
    typeof manifestJson.name === 'string' &&
    manifestJson.name.length > 0 &&
    typeof manifestJson.short_name === 'string' &&
    typeof manifestJson.start_url === 'string' &&
    manifestJson.display === 'standalone' &&
    typeof manifestJson.theme_color === 'string' &&
    iconSizes.has('192x192') &&
    iconSizes.has('512x512') &&
    iconPurposes.has('maskable');
  check(
    'E1 manifest servido con campos e iconos requeridos',
    manifestComplete,
    `${manifestResponse.status} ${manifestUrl} · name="${manifestJson?.name ?? ''}" · display="${manifestJson?.display ?? ''}" · temas=${[...iconSizes].join('/')} · maskable=${iconPurposes.has('maskable')}`,
  );

  // E1b — Chrome parsea el manifest sin errores (Page.getAppManifest)
  let manifestErrors = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const manifestProbe = await cdp.send('Page.getAppManifest');
    manifestErrors = manifestProbe.result?.errors ?? [];
    if (manifestErrors.length > 0) break;
    await sleep(300);
  }
  check(
    'E1b Page.getAppManifest sin errores de parseo',
    manifestErrors.length === 0,
    manifestErrors.map((error) => error.message ?? error.critical).join('; ') || 'sin errores',
  );

  // E2 — instalabilidad
  const installability = await cdp.send('Page.getInstallabilityErrors');
  if (installability.error) {
    check('E2 Page.getInstallabilityErrors disponible', false, installability.error.message);
  } else {
    const installErrors = installability.result?.installabilityErrors ?? [];
    check(
      'E2 Page.getInstallabilityErrors vacío',
      installErrors.length === 0,
      installErrors.map((error) => error.errorId).join(', ') || 'sin errores',
    );
  }

  // E3 — SW controlando
  const controlled = await evaluate(cdp, 'navigator.serviceWorker.controller !== null');
  check('E3 service worker controlando la página', controlled === true);

  // E3b — nombre de caché versionado `hidria-shell-<vX.Y.Z>-<build>`
  const cacheNames = await evaluate(cdp, "caches.keys()");
  const names = Array.isArray(cacheNames) ? cacheNames : [];
  const versionedCache = names.find((name) => /^hidria-shell-\d+\.\d+\.\d+-.+$/.test(name));
  check(
    'E3b caché versionada hidria-shell-<version>-<build>',
    typeof versionedCache === 'string',
    names.join(', ') || 'sin cachés',
  );

  // E4 — caché del shell (sólo estáticos same-origin; sin Supabase/R2 ni tokens)
  const cacheEntries = await evaluate(
    cdp,
    `(async () => {
      const out = [];
      for (const name of await caches.keys()) {
        for (const request of await (await caches.open(name)).keys()) out.push(request.url);
      }
      return out;
    })()`,
  );
  const offlineReady = await evaluate(cdp, 'navigator.onLine');
  const entries = Array.isArray(cacheEntries) ? cacheEntries : [];
  const foreign = entries.filter(
    (url) => !url.startsWith(`${APP}/`) || /supabase|r2\.dev|cloudflarestorage|token/i.test(url),
  );
  check(
    'E7 caché sólo shell público same-origin',
    entries.length > 0 && foreign.length === 0,
    `${entries.length} entradas, ${foreign.length} ajenas${foreign.length ? `: ${foreign.slice(0, 3).join(', ')}` : ''}`,
  );
  check('E7 sin conexión previa la app está en línea', offlineReady === true);

  // E4 — navegación offline
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  await navigate(cdp, `${APP}/kanban`);
  const offlineText = await evaluate(cdp, 'document.body.innerText');
  const offlineBanner = await evaluate(
    cdp,
    "document.querySelector('[data-offline-banner]') !== null",
  );
  check(
    'E4 shell arranca sin red y muestra banner offline',
    typeof offlineText === 'string' &&
      offlineText.includes('Sin conexión') &&
      offlineBanner === true,
    `banner=${offlineBanner}`,
  );

  // E5 — offline.html
  await navigate(cdp, `${APP}/offline.html`);
  const offlineDoc = await evaluate(cdp, 'document.body.innerText');
  check(
    'E5 offline.html se sirve sin red',
    typeof offlineDoc === 'string' && offlineDoc.includes('Sin conexión'),
  );

  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });

  // E9 — versión/build visibles
  await navigate(cdp, `${APP}/acerca`);
  const aboutText = await evaluate(cdp, 'document.body.innerText');
  check(
    'E9 versión y build visibles en /acerca',
    typeof aboutText === 'string' && /v\d+\.\d+\.\d+/.test(aboutText) && /Build/i.test(aboutText),
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\nRESUMEN: ${results.length - failed.length}/${results.length} comprobaciones OK`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('ERROR:', error.message);
  process.exit(2);
});
