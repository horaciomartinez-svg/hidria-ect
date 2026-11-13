#!/usr/bin/env node
/**
 * HIDRIA — auditoría PWA por CDP (F1-02b / F1-16). Evidencia reproducible del criterio PWA
 * (ADR-008: CDP en lugar de «Lighthouse PWA ≥ 90», categoría eliminada en Lighthouse ≥ 12).
 *
 * Mapa de comprobaciones (coherente con la cabecera y con el reporte):
 *   E1  manifest servido con campos/iconos requeridos + E1b Page.getAppManifest sin errores
 *   E2  Page.getInstallabilityErrors vacío (si el método no existe: fallback ADR-008)
 *   E3  service worker registrado/activo y controlando + E3b caché versionada
 *   E4  navegación offline con el shell precacheado
 *   E5  offline.html servido sin red
 *   E6  aviso de versión nueva — **manual/QA (task-49)**: requiere dos builds y estado del SW;
 *       no se automatiza aquí (se documenta en la matriz PWA-05)
 *   E7  caché sólo shell público same-origin (sin Supabase/R2 ni tokens)
 *   E8  escaneo de secretos en los artefactos de `dist/` (sb_secret_*, service_role, JWT de servicio)
 *   E9  versión y build visibles en /acerca
 *   E10 offline.html accesible y sin datos (lang, landmark, sin handlers inline, sin tokens)
 *
 * Seguridad (SEC-PR22-01): `APP_URL`/`CDP_URL` deben ser **locales** (localhost/127.0.0.1/[::1]);
 * el script lanza su **propio Chrome con perfil temporal** y lo elimina al terminar. Usa una sesión
 * sintética (`auditoria@ejemplo.invalid`) sembrada en localStorage; no captura pantallas ni PII.
 * No requiere dependencias: fetch + WebSocket nativos de Node 20+.
 *
 * Uso: `npm run preview -- --port 4173 --strictPort` (en `app/`) y `npm run pwa:audit`.
 * Variables: APP_URL, CDP_URL (opcional; si falta se lanza Chrome), AUDIT_SUPABASE_URL
 * (para derivar la storageKey local de supabase-js), CHROME_PATH (ruta del navegador).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** SEC-PR22-01: sólo orígenes locales (http/https). */
function assertLocalUrl(name, raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`[HIDRIA] ${name} no es una URL válida: "${raw}"`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`[HIDRIA] ${name} debe usar http(s): "${raw}"`);
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(
      `[HIDRIA] ${name} debe apuntar a un host local (localhost/127.0.0.1/[::1]); ` +
        `se recibió "${url.hostname}". La auditoría nunca debe ejecutarse contra staging/producción.`,
    );
  }
  return url;
}

const APP_RAW = process.env.APP_URL ?? 'http://localhost:4173';
const APP = assertLocalUrl('APP_URL', APP_RAW).origin;
const CDP_EXPLICIT = process.env.CDP_URL ? assertLocalUrl('CDP_URL', process.env.CDP_URL) : null;

// La storageKey de supabase-js deriva del hostname de VITE_SUPABASE_URL (`sb-<ref>-auth-token`).
// En local se usa `http://127.0.0.1:54321` → `sb-127-auth-token`; no es la clave del proyecto real.
const AUDIT_SUPABASE_URL = assertLocalUrl(
  'AUDIT_SUPABASE_URL',
  process.env.AUDIT_SUPABASE_URL ?? 'http://127.0.0.1:54321',
);
const STORAGE_KEY = `sb-${AUDIT_SUPABASE_URL.hostname.split('.')[0]}-auth-token`;

const DIST_DIR = fileURLToPath(new URL('../dist', import.meta.url));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const note = (message) => console.log(`NOTA ${message}`);
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

/** Sesión sintética con claims ADR-005 (sin contraseña; no usa el seed ni datos reales). */
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

/* ------------------------------------------------------------------------- */
/* E8 — escaneo de secretos en los artefactos de dist/                        */
/* ------------------------------------------------------------------------- */

/** Decodifica el payload de un JWT (sin verificar firma) para detectar rol de servicio. */
function jwtPayload(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(part, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

function scanDistForSecrets() {
  if (!existsSync(DIST_DIR)) {
    return { ok: false, detail: `no existe ${DIST_DIR} (ejecutar npm run build antes)` };
  }
  const findings = [];
  const files = listFiles(DIST_DIR).filter((file) => /\.(js|mjs|html|webmanifest|json)$/i.test(file));
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    if (/sb_secret_[A-Za-z0-9_-]{8,}/.test(text)) findings.push(`${file}: sb_secret_*`);
    if (/SUPABASE_SERVICE_ROLE_KEY\s*=\s*[^\s"'`]+/.test(text)) {
      findings.push(`${file}: asignación SUPABASE_SERVICE_ROLE_KEY`);
    }
    for (const match of text.matchAll(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g)) {
      if (jwtPayload(match[0])?.role === 'service_role') findings.push(`${file}: JWT role=service_role`);
    }
  }
  return {
    ok: findings.length === 0,
    detail: findings.length === 0 ? `${files.length} artefactos revisados` : findings.slice(0, 3).join('; '),
  };
}

/* ------------------------------------------------------------------------- */
/* Chrome temporal (perfil propio; se elimina al terminar)                    */
/* ------------------------------------------------------------------------- */

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

async function launchTempChrome() {
  const executable = chromePath();
  if (!executable) {
    throw new Error('[HIDRIA] No se encontró Chrome/Edge; defina CHROME_PATH o CDP_URL local.');
  }
  const profileDir = mkdtempSync(join(tmpdir(), 'hidria-pwa-audit-'));
  const child = spawn(
    executable,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=0',
      `--user-data-dir=${profileDir}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const portFile = join(profileDir, 'DevToolsActivePort');
  let port = null;
  for (let i = 0; i < 80; i += 1) {
    await sleep(250);
    if (existsSync(portFile)) {
      port = Number(readFileSync(portFile, 'utf8').split('\n')[0].trim());
      if (Number.isInteger(port) && port > 0) break;
    }
    if (child.exitCode !== null) break;
  }
  if (!port) {
    child.kill();
    rmSync(profileDir, { recursive: true, force: true });
    throw new Error('[HIDRIA] Chrome temporal no expuso DevToolsActivePort.');
  }
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() {
      try {
        if (process.platform === 'win32' && child.pid) {
          // Chrome crea procesos hijos (crashpad, renderers) que retienen el perfil.
          spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        } else {
          child.kill();
        }
      } catch {
        /* ya terminado */
      }
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (child.exitCode !== null) break;
        await sleep(200);
      }
      for (let attempt = 0; attempt < 10; attempt += 1) {
        try {
          rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
          return;
        } catch {
          await sleep(400);
        }
      }
      console.warn(`[HIDRIA] No se pudo eliminar el perfil temporal de Chrome: ${profileDir}`);
    },
  };
}

/* ------------------------------------------------------------------------- */
/* CDP                                                                        */
/* ------------------------------------------------------------------------- */

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

async function runAudit(cdp) {
  // Carga inicial + sesión sintética local (documentada: storageKey derivada del host sintético).
  await navigate(cdp, `${APP}/login`);
  await evaluate(cdp, 'localStorage.clear()');
  await evaluate(
    cdp,
    `localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(syntheticSession()))})`,
  );
  await navigate(cdp, `${APP}/acerca`);

  // Espera acotada a que el SW se registre y active.
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
  const manifestHref =
    (await evaluate(
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
    `${manifestResponse.status} ${manifestUrl} · display="${manifestJson?.display ?? ''}" · temas=${[...iconSizes].join('/')} · maskable=${iconPurposes.has('maskable')}`,
  );

  // E1b — Chrome parsea el manifest sin errores
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

  // E2 — instalabilidad (si el método no existe: fallback ADR-008 tras E4/E5)
  let installabilitySupported = true;
  const installability = await cdp.send('Page.getInstallabilityErrors');
  if (installability.error) {
    installabilitySupported = false;
    note(
      `E2: Page.getInstallabilityErrors no disponible (${installability.error.message}); ` +
        'se usará el fallback ADR-008 (manifest + SW + offline).',
    );
  } else {
    const installErrors = installability.result?.installabilityErrors ?? [];
    check(
      'E2 Page.getInstallabilityErrors vacío',
      installErrors.length === 0,
      installErrors.map((error) => error.errorId).join(', ') || 'sin errores',
    );
  }

  // E3 — SW controlando
  const controlled = (await evaluate(cdp, 'navigator.serviceWorker.controller !== null')) === true;
  check('E3 service worker controlando la página', controlled);

  // E3b — nombre de caché versionado `hidria-shell-<vX.Y.Z>-<build>`
  const cacheNames = await evaluate(cdp, 'caches.keys()');
  const names = Array.isArray(cacheNames) ? cacheNames : [];
  const versionedCache = names.find((name) => /^hidria-shell-\d+\.\d+\.\d+-.+$/.test(name));
  check(
    'E3b caché versionada hidria-shell-<version>-<build>',
    typeof versionedCache === 'string',
    names.join(', ') || 'sin cachés',
  );

  // E7 — caché del shell: sólo estáticos same-origin (sin Supabase/R2/tokens)
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
  const entries = Array.isArray(cacheEntries) ? cacheEntries : [];
  const foreign = entries.filter(
    (url) => !url.startsWith(`${APP}/`) || /supabase|r2\.dev|cloudflarestorage|token/i.test(url),
  );
  check(
    'E7 caché sólo shell público same-origin',
    entries.length > 0 && foreign.length === 0,
    `${entries.length} entradas, ${foreign.length} ajenas${foreign.length ? `: ${foreign.slice(0, 3).join(', ')}` : ''}`,
  );

  // E10 — offline.html accesible y sin datos (se valida antes de cortar la red)
  const offlineHtml = await (await fetch(`${APP}/offline.html`)).text();
  const offlineA11y =
    /<html[^>]*lang="es-MX"/.test(offlineHtml) &&
    /role="main"/.test(offlineHtml) &&
    !/\son(click|load|submit)=/i.test(offlineHtml) &&
    /Sin conexi/.test(offlineHtml) &&
    !/supabase|access_token|localStorage/i.test(offlineHtml);
  check(
    'E10 offline.html accesible, es-MX y sin datos/handlers inline',
    offlineA11y,
    `${offlineHtml.length} bytes`,
  );

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
  const offlineShellOk =
    typeof offlineText === 'string' &&
    offlineText.includes('Sin conexión') &&
    offlineBanner === true;
  check(
    'E4 shell arranca sin red y muestra banner offline',
    offlineShellOk,
    `banner=${offlineBanner}`,
  );

  // E5 — offline.html se sirve sin red
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

  // E2 fallback (ADR-008) cuando getInstallabilityErrors no está disponible
  if (!installabilitySupported) {
    check(
      'E2 fallback ADR-008 (manifest + SW controlando + shell offline)',
      manifestComplete && controlled && offlineShellOk,
      'Page.getInstallabilityErrors no disponible en este Chrome/CDP',
    );
  }

  // E9 — versión/build visibles
  await navigate(cdp, `${APP}/acerca`);
  const aboutText = await evaluate(cdp, 'document.body.innerText');
  check(
    'E9 versión y build visibles en /acerca',
    typeof aboutText === 'string' && /v\d+\.\d+\.\d+/.test(aboutText) && /Build/i.test(aboutText),
  );
}

async function main() {
  // E8 — secretos en artefactos (antes de abrir navegador)
  const secretScan = scanDistForSecrets();
  check('E8 sin secretos en artefactos de dist/', secretScan.ok, secretScan.detail);

  // SEC-PR22-01: Chrome temporal con perfil propio (o CDP local explícito)
  let tempChrome = null;
  let cdpUrl = CDP_EXPLICIT?.origin ?? null;
  if (!cdpUrl) {
    tempChrome = await launchTempChrome();
    cdpUrl = tempChrome.url;
  }

  try {
    const version = await (await fetch(`${cdpUrl}/json/version`)).json();
    console.log(`Chrome/CDP: ${version.Browser ?? 'desconocido'} (${cdpUrl})`);
    console.log(`App: ${APP}\nPerfil: ${tempChrome ? 'temporal (se elimina al terminar)' : 'CDP local existente'}\n`);

    const list = await (await fetch(`${cdpUrl}/json/list`)).json();
    const page = list.find((entry) => entry.type === 'page');
    if (!page) throw new Error('No hay pestaña CDP disponible en el navegador de auditoría');

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    const cdp = new Cdp(ws);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    await runAudit(cdp);

    // E6 no se automatiza: requiere dos builds y estado del SW → manual/QA (task-49, PWA-05).
    note('E6 aviso de versión nueva: verificación manual/QA (task-49); no se automatiza en este script.');
  } finally {
    await tempChrome?.stop();
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\nRESUMEN: ${results.length - failed.length}/${results.length} comprobaciones OK`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('ERROR:', error.message);
  process.exit(2);
});
