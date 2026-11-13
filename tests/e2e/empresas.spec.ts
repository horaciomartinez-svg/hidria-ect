import { test, expect, type Page, type Route } from '@playwright/test';
import {
  AUTH_STORAGE_KEY,
  CLAIMS_EQUIPO,
  ORG_ID,
  USER_EQUIPO,
  sessionFor,
} from './support/session';

/**
 * HIDRIA — E2E de M1 Empresas (F1-03b).
 *
 * El proyecto Supabase es ficticio: se intercepta PostgREST (`/rest/v1/companies`) con
 * fixtures sintéticos para probar la UI (lista, alta→lectura, detalle, validación,
 * estados vacío/permiso/offline) sin secretos ni datos reales.
 *
 * La autorización real (RLS por organización/rol) la verifica la suite pgTAP de F1-03a;
 * aquí se comprueba que la UI maneja correctamente la respuesta que RLS produce (0 filas
 * o 403).
 */

const ORG_OTRO = '00000000-0000-4000-8000-0000000000b2';
const USER_OTRO = 'a1000000-0000-4000-8000-0000000000b2';

const COMPANY_ID = 'd1000000-0000-4000-8000-000000000001';

const COMPANY = {
  id: COMPANY_ID,
  organization_id: ORG_ID,
  razon_social: 'Aceros del Golfo, S.A. de C.V.',
  nombre_planta: 'Planta Norte',
  giro: 'manufacturera',
  calle: 'Av. Industrial 100',
  colonia_parque: 'Parque Industrial Norte',
  cp: '87000',
  municipio: 'Ciudad Victoria',
  organismo_operador: 'COMAPA Victoria',
  lat: 23.7369,
  lon: -99.1411,
  empleados: 120,
  turnos: '2 turnos de 12 h',
  unidad_produccion: 'ton',
  contraparte_user_id: null,
  ciclo_vida: 'prospecto',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const CLAIMS_OTRO = {
  sub: USER_OTRO,
  email: 'e2e.otro@example.invalid',
  organization_id: ORG_OTRO,
  tenant_id: ORG_OTRO,
  global_role: 'equipo',
};

async function seedSession(page: Page, claims: Record<string, unknown>) {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: AUTH_STORAGE_KEY, value: JSON.stringify(sessionFor(claims)) },
  );
}

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Intercepta el proyecto ficticio: auth 200, perfiles/organizaciones abortados. */
async function mockSupabase(page: Page) {
  await page.route('**test.invalid/**', (route) => route.abort());
  await page.route('**/auth/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/rest/v1/profiles**', (route) => route.abort());
  await page.route('**/rest/v1/organizations**', (route) => route.abort());
}

test.describe('M1 — Empresas', () => {
  test('lista las empresas visibles para el tenant', async ({ page }) => {
    await mockSupabase(page);
    await page.route('**/rest/v1/companies**', (route) => json(route, 200, [COMPANY]));
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto('/empresas');

    await expect(page.getByRole('heading', { name: 'Empresas', level: 1 })).toBeVisible();
    await expect(page.getByTestId('empresa-row')).toHaveCount(1);
    await expect(page.getByText(COMPANY.razon_social)).toBeVisible();
    await expect(page.getByTestId('empresa-row').getByText('Manufacturera')).toBeVisible();
    await expect(page.getByTestId('alta-empresa')).toBeVisible();
  });

  test('alta → lectura: crea la empresa y la muestra en el listado y el detalle', async ({
    page,
  }) => {
    await mockSupabase(page);
    let creada: Record<string, unknown> | null = null;

    await page.route('**/rest/v1/companies**', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
        creada = { ...COMPANY, ...body, id: COMPANY_ID };
        await json(route, 201, creada);
        return;
      }
      if (request.method() === 'PATCH') {
        const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
        creada = { ...(creada ?? COMPANY), ...body };
        await json(route, 200, creada);
        return;
      }
      if (route.request().url().includes('id=eq.')) {
        await json(route, 200, creada ?? null);
        return;
      }
      await json(route, 200, creada ? [creada] : []);
    });

    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto('/empresas');
    await expect(page.getByTestId('empresas-empty')).toBeVisible();

    await page.getByTestId('alta-empresa').click();
    await expect(page).toHaveURL(/\/empresas\/nueva$/);

    await page.getByTestId('empresa-field-razon_social').fill(COMPANY.razon_social);
    await page.getByTestId('empresa-field-nombre_planta').fill(COMPANY.nombre_planta);
    await page.getByTestId('empresa-field-giro').selectOption('manufacturera');
    await page.getByLabel('Calle y número').fill(COMPANY.calle);
    await page.getByLabel('Colonia o parque industrial').fill(COMPANY.colonia_parque);
    await page.getByLabel('Código postal').fill(COMPANY.cp);
    await page.getByTestId('empresa-field-municipio').fill(COMPANY.municipio);
    await page
      .getByTestId('empresa-field-organismo_operador')
      .fill(COMPANY.organismo_operador);
    await page.getByTestId('empresa-submit').click();

    await expect(page).toHaveURL(new RegExp(`/empresas/${COMPANY_ID}$`));
    await expect(page.getByTestId('empresa-titulo')).toHaveText(COMPANY.razon_social);
    // La organización enviada procede del claim de sesión, nunca del formulario.
    expect(creada?.organization_id).toBe(ORG_ID);

    await page.goto('/empresas');
    await expect(page.getByTestId('empresa-row')).toHaveCount(1);
  });

  test('empresa de otra organización: RLS devuelve 0 filas y la UI muestra vacío', async ({
    page,
  }) => {
    await mockSupabase(page);
    // El backend real (RLS) no devuelve filas para el tenant B; se simula la respuesta.
    await page.route('**/rest/v1/companies**', (route) => json(route, 200, []));
    await seedSession(page, CLAIMS_OTRO);
    await page.goto('/empresas');

    await expect(page.getByTestId('empresas-empty')).toBeVisible();
    await expect(page.getByTestId('empresa-row')).toHaveCount(0);
    await expect(page.getByText(COMPANY.razon_social)).toHaveCount(0);
  });

  test('sin permiso (403 de RLS): muestra aviso y no lista datos', async ({ page }) => {
    await mockSupabase(page);
    await page.route('**/rest/v1/companies**', (route) =>
      json(route, 403, {
        code: '42501',
        message: 'permission denied for table companies',
        details: null,
        hint: null,
      }),
    );
    await seedSession(page, CLAIMS_OTRO);
    await page.goto('/empresas');

    await expect(page.getByText('No tienes permiso para ver estas empresas')).toBeVisible();
    await expect(page.getByTestId('empresa-row')).toHaveCount(0);
  });

  test('validación: el formulario vacío muestra resumen y no envía a PostgREST', async ({
    page,
  }) => {
    await mockSupabase(page);
    let posts = 0;
    await page.route('**/rest/v1/companies**', async (route) => {
      if (route.request().method() === 'POST') posts += 1;
      await json(route, 200, []);
    });
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto('/empresas/nueva');

    await page.getByTestId('empresa-submit').click();
    await expect(page.getByTestId('empresa-error-summary')).toBeVisible();
    await expect(page.getByTestId('empresa-field-razon_social')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(posts).toBe(0);
  });

  test('detalle de empresa: muestra el expediente y respeta el rol', async ({ page }) => {
    await mockSupabase(page);
    await page.route('**/rest/v1/companies**', (route) => json(route, 200, COMPANY));
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto(`/empresas/${COMPANY_ID}`);

    await expect(page.getByTestId('empresa-titulo')).toHaveText(COMPANY.razon_social);
    await expect(page.getByText('Datos del expediente')).toBeVisible();
    await expect(page.getByText('COMAPA Victoria')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Editar empresa' })).toBeVisible();
  });
});
