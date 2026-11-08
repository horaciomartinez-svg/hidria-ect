import { defineConfig, devices } from '@playwright/test';

/**
 * HIDRIA — configuración E2E (F1-02 shell / H-15, task-49).
 *
 * - Suite versionada en `tests/e2e/`; se ejecuta contra el **build de producción**
 *   servido por `vite preview` (no contra el dev server con HMR).
 * - Supabase es un destino sintético (`https://test.invalid`): el shell se prueba con
 *   sesiones JWT sembradas en `localStorage` (claims ADR-005). Las llamadas a
 *   `/rest/v1` y `/auth/v1` se abortan en los tests; no hay secretos ni usuarios reales.
 * - El build necesita `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (anon JWT sintético);
 *   se inyectan por `webServer.env` y el guard build-time de `vite.config.ts` los valida.
 */
const PORT = Number(process.env.E2E_PORT ?? 4173);
const BASE_URL = `http://127.0.0.1:${PORT}`;
/** Raíz del monorepo: el script npm se lanza desde la raíz (`npm run test:e2e`). */
const REPO_ROOT = process.env.E2E_REPO_ROOT ?? process.cwd();
const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? 'https://test.invalid';
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

export default defineConfig({
  testDir: './',
  testMatch: '**/*.spec.ts',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
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
      VITE_SUPABASE_ANON_KEY: makeAnonKey(),
    },
  },
});
