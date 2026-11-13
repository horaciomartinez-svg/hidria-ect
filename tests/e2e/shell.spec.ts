import { test, expect, type Page } from '@playwright/test';
import {
  AUTH_STORAGE_KEY,
  CLAIMS_EQUIPO,
  CLAIMS_INVITADO,
  ORG_ID,
  USER_EQUIPO,
  sessionFor,
} from './support/session';

/**
 * HIDRIA — E2E del shell F1-02a (task-49 / H-15).
 *
 * Cubre el smoke que antes vivía fuera del repo (13/13) + los negativos B1 de la
 * revisión de spec, ejecutables en CI sin Supabase real ni secretos:
 *  - rutas protegidas → /login (sin sesión y con claims inválidos);
 *  - con sesión válida monta panel/nav/breadcrumbs/claims;
 *  - rol `invitado` restringido (no ve el placeholder de un módulo de operación);
 *  - logout → /login;
 *  - `/sincronizacion` publica los gates no encolables;
 *  - B1: sin claims / UUID inválido / role fuera del enum ⇒ no shell.
 *
 * Los flujos completos E2E-01/E2E-09 de docs/05 llegarán con las pantallas reales
 * (M2/M4/M6…); esta suite no simula datos ni llama a Supabase.
 */

test.beforeEach(async ({ page }) => {
  // El proyecto Supabase es ficticio: cualquier llamada de red se aborta y el shell
  // funciona sólo con los claims del token sembrado. Las rutas de Auth se responden
  // (logout 200) para que `signOut()` resuelva y el shell navegue a /login.
  await page.route('**test.invalid/**', (route) => route.abort());
  await page.route('**/auth/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
});

async function seedSession(page: Page, claims: Record<string, unknown>) {
  const session = sessionFor(claims);
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: AUTH_STORAGE_KEY, value: JSON.stringify(session) },
  );
}

const loginHeading = (page: Page) => page.getByRole('heading', { name: 'Iniciar sesión' });
const shellNav = (page: Page) => page.getByRole('navigation', { name: 'Módulos de la plataforma' });
const sessionPanel = (page: Page) => page.getByRole('heading', { name: 'Sesión verificada' });

test.describe('rutas protegidas y sesión', () => {
  test('sin sesión, /kanban redirige a /login', async ({ page }) => {
    await page.goto('/kanban');
    await expect(page).toHaveURL(/\/login$/);
    await expect(loginHeading(page)).toBeVisible();
    await expect(shellNav(page)).toHaveCount(0);
  });

  test('sin sesión, / redirige a /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(loginHeading(page)).toBeVisible();
  });

  test('con sesión válida monta panel, nav, breadcrumbs y claims', async ({ page }) => {
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto('/');

    await expect(page).toHaveURL(/\/$/);
    await expect(shellNav(page)).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Ruta de navegación' }))
      .toContainText('Inicio');
    await expect(page.getByRole('heading', { name: /^Hola,/ })).toBeVisible();
    await expect(sessionPanel(page)).toBeVisible();
    // El menú de sesión está colapsado; se comprueban los valores del panel visible.
    await expect(page.locator('dd').filter({ hasText: 'Equipo técnico' })).toBeVisible();
    await expect(page.locator('dd').filter({ hasText: ORG_ID })).toBeVisible();
  });

  test('con sesión válida, M5 /iih muestra fase F2 y M7 /muestreo F1 mínimo (decisión híbrida)', async ({
    page,
  }) => {
    await seedSession(page, CLAIMS_EQUIPO);

    // M5 (IIH): el módulo completo pasa a F2 (decisión híbrida; F1-08 → F2-06).
    await page.goto('/iih');
    await expect(page.getByRole('heading', { name: 'Inventario de infraestructura hidráulica' }))
      .toBeVisible();
    await expect(page.getByText('Fase prevista F2', { exact: false })).toBeVisible();

    // M7 (Muestreo): F1 mínimo / F2 completo, con su phaseNote visible.
    await page.goto('/muestreo');
    await expect(page.getByRole('heading', { name: 'Muestreo y cadena de custodia' }))
      .toBeVisible();
    await expect(page.getByText('Fase prevista F1', { exact: false })).toBeVisible();
    await expect(page.getByText('F1 mínimo / F2 completo', { exact: false })).toBeVisible();
  });

  test('rol invitado queda restringido en /kanban (no ve el placeholder)', async ({ page }) => {
    await seedSession(page, CLAIMS_INVITADO);
    await page.goto('/kanban');

    await expect(page.getByRole('heading', { name: 'Esta sección no corresponde a tu perfil' }))
      .toBeVisible();
    await expect(page.getByText('Tablero de diagnósticos')).toHaveCount(0);
    await expect(page.getByText('Acceso no disponible para tu rol')).toBeVisible();
  });

  test('logout limpia la sesión y vuelve a /login', async ({ page }) => {
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto('/');
    await expect(sessionPanel(page)).toBeVisible();

    await page.locator('details summary').click();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(loginHeading(page)).toBeVisible();
  });

  test('/sincronizacion publica gates no encolables y no simula cola', async ({ page }) => {
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto('/sincronizacion');

    await expect(page.getByRole('heading', { name: 'Estado de sincronización' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /no encolables/i })).toBeVisible();
    await expect(page.getByText('EF-01 diagnostics/advance-phase')).toBeVisible();
    await expect(page.getByText('EF-12 diagnostics/reprogram-milestone')).toBeVisible();
    await expect(page.getByText('— no implementado')).toHaveCount(2);
  });
});

test.describe('B1 — falla cerrada de claims', () => {
  const invalidCases = [
    {
      name: 'sin claims de organización/rol',
      claims: { sub: USER_EQUIPO, email: 'e2e@example.invalid' },
    },
    {
      name: 'organization_id con UUID inválido',
      claims: {
        sub: USER_EQUIPO,
        email: 'e2e@example.invalid',
        organization_id: 'no-es-uuid',
        global_role: 'equipo',
      },
    },
    {
      name: 'global_role fuera del enum',
      claims: {
        sub: USER_EQUIPO,
        email: 'e2e@example.invalid',
        organization_id: ORG_ID,
        global_role: 'superadmin',
      },
    },
  ];

  for (const invalid of invalidCases) {
    test(`${invalid.name} ⇒ no monta el shell y redirige a /login`, async ({ page }) => {
      await seedSession(page, invalid.claims);
      await page.goto('/kanban');

      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole('alert').filter({ hasText: 'organización o el rol' }))
        .toBeVisible();
      await expect(page.getByText('Sesión verificada')).toHaveCount(0);
      await expect(shellNav(page)).toHaveCount(0);
    });
  }

  test('LoginPage no redirige a / con claims inválidos (B1)', async ({ page }) => {
    await seedSession(page, { sub: USER_EQUIPO, email: 'e2e@example.invalid' });
    await page.goto('/login');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('alert').filter({ hasText: 'organización o el rol' }))
      .toBeVisible();
    // Si redirigiera a `/`, el panel aparecería; no debe ocurrir.
    await expect(sessionPanel(page)).toHaveCount(0);
  });
});
