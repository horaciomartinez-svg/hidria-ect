/**
 * F1-03c — E2E **real** de M1 Empresas contra Supabase local + seeds.
 *
 * Skip por defecto: se ejecuta sólo con `E2E_LOCAL_SUPABASE=1` en el job CI que
 * levanta `supabase start` + `db reset` + `tests/e2e/fixtures/local-m1.sql`.
 *
 * Las pruebas usan JWT HS256 firmados con el `JWT_SECRET` efímero del Supabase local
 * y llamadas PostgREST reales; por tanto RLS, `created_by`, `companies_sel`,
 * ownership de empresa y cross-tenant son la autoridad, no un mock de red.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  LOCAL_AUTH_STORAGE_KEY,
  LOCAL_COMPANIES,
  LOCAL_ORG_B,
  LOCAL_SUPABASE_ANON_KEY,
  LOCAL_SUPABASE_URL,
  LOCAL_USERS,
  assertLocalEnv,
  claimsFor,
  seedLocalSession,
} from './support/local-supabase';

const LOCAL_ENABLED = process.env.E2E_LOCAL_SUPABASE === '1';

test.describe.configure({ mode: 'serial' });

test.describe('M1 Empresas — E2E real Supabase local', () => {
  test.skip(!LOCAL_ENABLED, 'Requiere E2E_LOCAL_SUPABASE=1 y Supabase local+fixture');

  test.beforeAll(() => {
    assertLocalEnv();
  });

  test.beforeEach(async ({ page }) => {
    await page.route('**/auth/v1/**', (route) => route.continue());
  });

  async function accessToken(page: Page): Promise<string> {
    return page.evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) throw new Error('Sesión local no sembrada');
      return (JSON.parse(raw) as { access_token: string }).access_token;
    }, LOCAL_AUTH_STORAGE_KEY);
  }

  async function restGet(page: Page, query: string) {
    const token = await accessToken(page);
    return page.request.get(`${LOCAL_SUPABASE_URL}/rest/v1/${query}`, {
      headers: {
        apikey: LOCAL_SUPABASE_ANON_KEY,
        authorization: `Bearer ${token}`,
      },
    });
  }

  test('equipo crea empresa y la lee con created_by/companies_sel', async ({ page }) => {
    await seedLocalSession(page, claimsFor('equipo', LOCAL_USERS.equipo));
    await page.goto('/empresas');
    await expect(page.getByRole('heading', { name: 'Empresas', level: 1 })).toBeVisible();

    await page.getByTestId('alta-empresa').click();
    await expect(page).toHaveURL(/\/empresas\/nueva$/);

    const nombre = `Empresa E2E Equipo ${Date.now()}`;
    await page.getByTestId('empresa-field-razon_social').fill(nombre);
    await page.getByTestId('empresa-field-nombre_planta').fill('Planta E2E Equipo');
    await page.getByTestId('empresa-field-giro').selectOption('manufacturera');
    await page.getByTestId('empresa-field-calle').fill('Calle E2E Equipo 1');
    await page.getByTestId('empresa-field-colonia_parque').fill('Parque E2E');
    await page.getByTestId('empresa-field-cp').fill('87000');
    await page.getByTestId('empresa-field-municipio').fill('Ciudad Victoria');
    await page.getByTestId('empresa-field-organismo_operador').fill('COMAPA Victoria');
    await page.getByTestId('empresa-submit').click();

    await expect(page).toHaveURL(/\/empresas\/[0-9a-f-]{36}$/);
    const companyId = page.url().split('/').pop() as string;
    await expect(page.getByTestId('empresa-titulo')).toHaveText(nombre);

    const response = await restGet(
      page,
      `companies?select=id,created_by,organization_id&id=eq.${companyId}`,
    );
    expect(response.status()).toBe(200);
    const rows = (await response.json()) as Array<{
      id: string;
      created_by: string;
      organization_id: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].created_by).toBe(LOCAL_USERS.equipo);
    expect(rows[0].organization_id).toBe(
      '00000000-0000-4000-8000-000000000001',
    );

    // Recarga: la fila sigue visible por `companies_sel` del creador.
    await page.goto('/empresas');
    await expect(page.getByText(nombre)).toBeVisible();

    // Edición real (PATCH) y lectura del detalle actualizado.
    await page.getByText(nombre).click();
    await page.getByRole('link', { name: 'Editar empresa' }).click();
    await page.getByTestId('empresa-field-nombre_planta').fill('Planta E2E Equipo Editada');
    await page.getByTestId('empresa-submit').click();
    await expect(page).toHaveURL(new RegExp(`/empresas/${companyId}$`));
    await expect(page.getByText('Planta E2E Equipo Editada')).toBeVisible();
  });

  test('empresa ve su empresa (contraparte), no la ajena ni cross-tenant', async ({ page }) => {
    await seedLocalSession(page, claimsFor('empresa', LOCAL_USERS.empresaA));
    await page.goto('/empresas');

    await expect(page.getByTestId('empresa-row')).toHaveCount(1);
    await expect(page.getByText('Empresa E2E A1 (contraparte)')).toBeVisible();
    await expect(page.getByText('Empresa E2E A2 (sin contraparte)')).toHaveCount(0);
    await expect(page.getByText('Empresa E2E B1 (otro tenant)')).toHaveCount(0);
    await expect(page.getByTestId('alta-empresa')).toHaveCount(0);

    await page.goto(`/empresas/${LOCAL_COMPANIES.a1}`);
    await expect(page.getByTestId('empresa-titulo')).toHaveText(
      'Empresa E2E A1 (contraparte)',
    );
    await expect(page.getByRole('link', { name: 'Editar empresa' })).toHaveCount(0);

    // RLS real por PostgREST: A2 y B1 no son visibles para empresa A.
    for (const id of [LOCAL_COMPANIES.a2, LOCAL_COMPANIES.b1]) {
      const response = await restGet(page, `companies?select=id&id=eq.${id}`);
      expect(response.status()).toBe(200);
      expect((await response.json()) as unknown[]).toHaveLength(0);
    }
  });

  test('invitado sin membresía: 0 empresas y sin alta', async ({ page }) => {
    await seedLocalSession(page, claimsFor('invitado', LOCAL_USERS.invitado));
    await page.goto('/empresas');

    await expect(page.getByTestId('empresas-empty')).toBeVisible();
    await expect(page.getByTestId('empresa-row')).toHaveCount(0);
    await expect(page.getByTestId('alta-empresa')).toHaveCount(0);

    await page.goto(`/empresas/${LOCAL_COMPANIES.a1}`);
    await expect(page.getByTestId('empresa-titulo')).toHaveCount(0);
  });

  test('observador con membresía ve la empresa de su diagnóstico y no crea', async ({ page }) => {
    await seedLocalSession(page, claimsFor('observador', LOCAL_USERS.observador));
    await page.goto('/empresas');

    await expect(page.getByText('Empresa Sintética A')).toBeVisible();
    await expect(page.getByTestId('alta-empresa')).toHaveCount(0);
  });

  test('empresa del tenant B ve solo su empresa (cross-tenant real)', async ({ page }) => {
    await seedLocalSession(
      page,
      claimsFor('empresa', LOCAL_USERS.empresaB, LOCAL_ORG_B),
    );
    await page.goto('/empresas');

    await expect(page.getByText('Empresa E2E B1 (otro tenant)')).toBeVisible();
    await expect(page.getByText('Empresa E2E A1 (contraparte)')).toHaveCount(0);
  });
});
