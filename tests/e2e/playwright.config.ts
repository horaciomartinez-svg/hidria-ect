import { defineConfig, devices } from '@playwright/test';

/**
 * HIDRIA — configuración E2E.
 *
 * Modo normal (F1-02/F1-03b): Supabase sintético `https://test.invalid`, sesiones
 * sembradas en localStorage y peticiones abortadas. Modo **local real** (F1-03c):
 * `E2E_LOCAL_SUPABASE=1` apunta al Supabase local (`supabase start` + `db reset` +
 * fixture) y usa la anon key/JWT secret efímeros del CLI; nunca se versionan.
 *
 * Seguridad del modo local: sólo se ejecuta `empresas.local.spec.ts`, no se generan
 * trazas/vídeos/capturas (pueden contener el JWT de sesión) y el reporter es `list`
 * (sin artefacto HTML que embeba datos).
 */
const PORT = Number(process.env.E2E_PORT ?? 4173);
const BASE_URL = `http://127.0.0.1:${PORT}`;
/** Raíz del monorepo: el script npm se lanza desde la raíz (`npm run test:e2e`). */
const REPO_ROOT = process.env.E2E_REPO_ROOT ?? process.cwd();
const LOCAL_ENABLED = process.env.E2E_LOCAL_SUPABASE === '1';
const SUPABASE_URL = LOCAL_ENABLED
  ? (process.env.E2E_SUPABASE_URL ?? 'http://127.0.0.1:54321')
  : (process.env.E2E_SUPABASE_URL ?? 'https://test.invalid');
/** `none` = Chromium gestionado por Playwright (recomendado CI); `chrome` = Chrome local. */
const CHANNEL = process.env.E2E_CHANNEL ?? 'none';

function base64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

/** Clave anon sintética: `vite.config.ts` sólo exige JWT legible con `role=anon`. */
function makeAnonKey(): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64Url(JSON.stringify({
    aud: 'authenticated',
    role: 'anon',
    iss: 'supabase',
    iat: now,
    exp: now + 24 * 60 * 60,
  }));
  return `${header}.${body}.${'x'.repeat(43)}`;
}

const SUPABASE_ANON_KEY = LOCAL_ENABLED
  ? (process.env.E2E_SUPABASE_ANON_KEY ?? '')
  : makeAnonKey();

if (LOCAL_ENABLED && !SUPABASE_ANON_KEY) {
  throw new Error(
    'E2E_LOCAL_SUPABASE=1 requiere E2E_SUPABASE_ANON_KEY (supabase status -o env).',
  );
}

const artifacts = LOCAL_ENABLED
  ? { trace: 'off' as const, screenshot: 'off' as const, video: 'off' as const }
  : {
      trace: 'retain-on-failure' as const,
      screenshot: 'only-on-failure' as const,
      video: 'retain-on-failure' as const,
    };

export default defineConfig({
  testDir: './',
  // En modo local sólo corre el spec de integración: los specs de shell/empresas
  // (mock `test.invalid`) no deben ejecutarse contra la app construida con Supabase local.
  testMatch: LOCAL_ENABLED ? '**/empresas.local.spec.ts' : '**/*.spec.ts',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: LOCAL_ENABLED
    ? [['list']]
    : process.env.CI
      ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
      : [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: BASE_URL,
    ...artifacts,
  },
  projects: [
    {
      name: 'chrome',
      use: {
        ...devices['Desktop Chrome'],
        // Chromium gestionado por Playwright (CI: `playwright install chromium`) o
        // Chrome estable local con E2E_CHANNEL=chrome.
        ...(CHANNEL === 'none' ? {} : { channel: CHANNEL }),
      },
    },
  ],
  webServer: {
    command: `npm run build && npm run preview --workspace app -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    cwd: REPO_ROOT,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      VITE_SUPABASE_URL: SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
    },
  },
});
