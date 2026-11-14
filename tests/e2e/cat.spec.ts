import { test, expect, type Page, type Route } from '@playwright/test';
import { AUTH_STORAGE_KEY, ORG_ID, sessionFor } from './support/session';

/**
 * HIDRIA — E2E UI-level de M4 CAT (F1-07a / task-113).
 *
 * Proyecto Supabase ficticio: se mockean `cat_items` (47 preguntas A1-v1 generadas con la
 * misma forma que `docs/03` §7), `cat_responses`, `diagnostics`, `project_members` y EF-04.
 * La RLS/trigger reales las cubren F1-07b (Deno) y F1-07c (pgTAP); aquí se valida la UI:
 * render por secciones, borrador, validaciones, submit/validate-r2 y gates.
 */

const DIAG = 'c1000000-0000-4000-8000-000000000001';
const COMPANY = 'Aceros del Golfo, S.A. de C.V.';
const COMPANY_ID = 'b1000000-0000-4000-8000-000000000001';

const CLAIMS_EMPRESA = {
  sub: 'a1000000-0000-4000-8000-000000000003',
  email: 'e2e.empresa@example.invalid',
  organization_id: ORG_ID,
  tenant_id: ORG_ID,
  global_role: 'empresa',
};
const CLAIMS_EQUIPO = {
  sub: 'a1000000-0000-4000-8000-000000000002',
  email: 'e2e.equipo@example.invalid',
  organization_id: ORG_ID,
  tenant_id: ORG_ID,
  global_role: 'equipo',
};

const SECTION_COUNTS: Array<[string, number]> = [
  ['A', 6],
  ['B', 7],
  ['C', 7],
  ['D', 8],
  ['E', 6],
  ['F', 6],
  ['G', 4],
  ['H', 3],
];
const TYPES = ['abierta', 'breve', 'opcion_unica', 'multiple'] as const;

function buildItems() {
  const items: Array<Record<string, unknown>> = [];
  let index = 0;
  for (const [section, count] of SECTION_COUNTS) {
    for (let position = 1; position <= count; position += 1) {
      const tipo = TYPES[index % TYPES.length];
      items.push({
        id: `f1000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        version: 'A1-v1',
        seccion: section,
        codigo: `${section}${position}`,
        enunciado: `Pregunta ${section}${position} del banco A1-v1`,
        tipo,
        opciones:
          tipo === 'opcion_unica' || tipo === 'multiple'
            ? ['si', 'no', 'no_sabe']
            : null,
        ayuda: `Ayuda de ${section}${position}`,
        admite_evidencia: false,
        condicion: null,
        orden: index + 1,
      });
      index += 1;
    }
  }
  return items;
}

const ITEMS = buildItems();

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,OPTIONS',
  'access-control-allow-headers': 'authorization,apikey,content-type,idempotency-key,prefer,accept',
};

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  });
}

async function corsPreflight(page: Page) {
  await page.route('**test.invalid/**', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS_HEADERS })
      : route.fallback(),
  );
}

async function seedSession(page: Page, claims: Record<string, unknown>) {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: AUTH_STORAGE_KEY, value: JSON.stringify(sessionFor(claims)) },
  );
}

interface MockState {
  catEstado: 'no_enviado' | 'en_captura' | 'en_revision' | 'validado_r2';
  responses: Array<{
    item_id: string;
    valor: unknown;
    no_se: boolean;
    na: boolean;
    document_id: string | null;
    updated_at: string;
  }>;
  role: string;
  ef04Calls: Array<{ action: string; body: unknown }>;
  saveCalls: Array<{ method: string; body: unknown }>;
  ef04Status?: number;
  ef04Body?: unknown;
}

function diagnosticBody(state: MockState) {
  return {
    id: DIAG,
    folio: 'MDOHI-2026-0001',
    cat_estado: state.catEstado,
    company_id: COMPANY_ID,
    companies: { razon_social: COMPANY },
  };
}

async function mockCat(page: Page, overrides: Partial<MockState> = {}): Promise<MockState> {
  const state: MockState = {
    catEstado: 'en_captura',
    responses: [],
    role: 'empresa',
    ef04Calls: [],
    saveCalls: [],
    ...overrides,
  };

  await page.route('**test.invalid/**', (route) => route.abort());
  await page.route('**/auth/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/rest/v1/profiles**', (route) => route.abort());
  await page.route('**/rest/v1/organizations**', (route) => route.abort());
  await page.route('**/rest/v1/cat_items**', (route) => json(route, 200, ITEMS));
  await page.route('**/rest/v1/project_members**', (route) =>
    json(route, 200, [{ diagnostic_id: DIAG, role: state.role, user_id: 'x' }]),
  );
  await page.route('**/rest/v1/diagnostics**', (route) => {
    const url = route.request().url();
    if (url.includes('id=eq.')) return json(route, 200, diagnosticBody(state));
    return json(route, 200, [diagnosticBody(state)]);
  });
  await page.route('**/rest/v1/cat_responses**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') return json(route, 200, state.responses);
    const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
    state.saveCalls.push({ method: request.method(), body });
    if (request.method() === 'PATCH') {
      const url = request.url();
      const itemId = decodeURIComponent(url.split('item_id=eq.')[1]?.split('&')[0] ?? '');
      const existing = state.responses.find((response) => response.item_id === itemId);
      const saved = {
        item_id: itemId,
        valor: body.valor ?? null,
        no_se: Boolean(body.no_se),
        na: Boolean(body.na),
        document_id: null,
        updated_at: '2026-01-01T00:00:00Z',
      };
      state.responses = existing
        ? state.responses.map((response) => (response.item_id === itemId ? saved : response))
        : [...state.responses, saved];
      return json(route, 200, saved);
    }
    const saved = {
      item_id: body.item_id as string,
      valor: body.valor ?? null,
      no_se: Boolean(body.no_se),
      na: Boolean(body.na),
      document_id: null,
      updated_at: '2026-01-01T00:00:00Z',
    };
    state.responses = [...state.responses, saved];
    return json(route, 201, saved);
  });
  await page.route('**/functions/v1/ef-04-cat/**', async (route) => {
    const url = route.request().url();
    const action = url.endsWith('/validate-r2') ? 'validate-r2' : 'submit';
    state.ef04Calls.push({
      action,
      body: JSON.parse(route.request().postData() ?? '{}'),
    });
    if (state.ef04Status && state.ef04Status >= 400) {
      return json(route, state.ef04Status, state.ef04Body ?? {});
    }
    if (action === 'submit') {
      state.catEstado = 'en_revision';
      return json(route, 200, {
        diagnostic_id: DIAG,
        cat_estado: 'en_revision',
        pendientes: 0,
      });
    }
    state.catEstado = 'validado_r2';
    return json(route, 200, {
      diagnostic_id: DIAG,
      cat_estado: 'validado_r2',
      pendientes: 0,
    });
  });
  await corsPreflight(page);
  return state;
}

function allResponses() {
  return ITEMS.map((item) => ({
    item_id: item.id as string,
    valor: 'Respuesta sintética',
    no_se: false,
    na: false,
    document_id: null,
    updated_at: '2026-01-01T00:00:00Z',
  }));
}

test.describe('M4 — CAT', () => {
  test('empresa: lista diagnóstico, abre el CAT y renderiza 47 preguntas en A–H', async ({
    page,
  }) => {
    await mockCat(page);
    await seedSession(page, CLAIMS_EMPRESA);
    await page.goto('/cat');

    await expect(page.getByTestId('cat-list-page')).toBeVisible();
    await expect(page.getByText(COMPANY)).toBeVisible();
    await page.getByTestId('cat-open').click();

    await expect(page).toHaveURL(new RegExp(`/cat/${DIAG}$`));
    await expect(page.getByTestId('cat-form-page')).toBeVisible();
    await expect(page.getByTestId('cat-progress')).toContainText('0/47');
    for (const section of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
      await expect(page.getByTestId(`cat-section-${section}`)).toBeVisible();
    }
    // 47 preguntas renderizadas.
    expect(await page.locator('[data-testid^="cat-item-"]').count()).toBe(47);
    await expect(page.getByTestId('cat-submit')).toBeVisible();
    await expect(page.getByTestId('cat-validate-r2')).toHaveCount(0);
  });

  test('guardado de borrador por PostgREST (sin tocar cat_estado)', async ({ page }) => {
    const state = await mockCat(page, { role: 'empresa' });
    await seedSession(page, CLAIMS_EMPRESA);
    await page.goto(`/cat/${DIAG}`);

    await page.getByTestId('cat-item-A1').getByRole('textbox').fill('Respuesta A1');
    await page.getByTestId('cat-input-A1').blur();

    await expect(page.getByTestId('cat-progress')).toContainText('1/47');
    expect(state.saveCalls.length).toBeGreaterThan(0);
    expect(state.saveCalls[0]?.body).toMatchObject({ valor: 'Respuesta A1' });
    // El guardado no cambia el estado del CAT.
    await expect(page.getByTestId('cat-estado')).toHaveText('En captura');
  });

  test('submit bloqueado por validación local si faltan obligatorias (sin llamar EF-04)', async ({
    page,
  }) => {
    const state = await mockCat(page, { role: 'empresa' });
    await seedSession(page, CLAIMS_EMPRESA);
    await page.goto(`/cat/${DIAG}`);

    await page.getByTestId('cat-submit').click();
    await expect(page.getByTestId('cat-submit-error')).toBeVisible();
    await expect(page.getByTestId('cat-submit-error')).toContainText('Faltan 47 respuestas obligatorias');
    expect(state.ef04Calls).toHaveLength(0);
    await expect(page.getByText('Respuesta obligatoria (valor, «No sé» o «No aplica»).').first()).toBeVisible();
  });

  test('submit completo → EF-04 y estado en revisión (gate R2 pendiente)', async ({ page }) => {
    const state = await mockCat(page, {
      role: 'empresa',
      responses: allResponses(),
    });
    await seedSession(page, CLAIMS_EMPRESA);
    await page.goto(`/cat/${DIAG}`);

    await expect(page.getByTestId('cat-progress')).toContainText('47/47');
    await page.getByTestId('cat-submit').click();
    await expect(page.getByTestId('cat-notice')).toBeVisible();
    expect(state.ef04Calls).toHaveLength(1);
    expect(state.ef04Calls[0]?.action).toBe('submit');
    await expect(page.getByTestId('cat-estado')).toHaveText('En revisión (R2)');
    await expect(page.getByTestId('cat-gate')).toContainText('gate F3');
    // Empresa no valida R2.
    await expect(page.getByTestId('cat-validate-r2')).toHaveCount(0);
  });

  test('coordinador: valida en R2 y desbloquea el gate', async ({ page }) => {
    const state = await mockCat(page, {
      role: 'coordinador',
      catEstado: 'en_revision',
      responses: allResponses(),
    });
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto(`/cat/${DIAG}`);

    await expect(page.getByTestId('cat-validate-r2')).toBeVisible();
    await page.getByTestId('cat-validate-r2').click();
    await expect(page.getByTestId('cat-notice')).toBeVisible();
    expect(state.ef04Calls[0]?.action).toBe('validate-r2');
    await expect(page.getByTestId('cat-estado')).toHaveText('Validado en R2');
    await expect(page.getByTestId('cat-gate')).toContainText('desbloqueado');
  });

  test('EF-04 rechaza el submit (403) y muestra error sin cambiar estado', async ({ page }) => {
    await mockCat(page, {
      role: 'empresa',
      responses: allResponses(),
      ef04Status: 403,
      ef04Body: { error: { code: 'FORBIDDEN_ROLE', message: 'Rol no autorizado.' } },
    });
    await seedSession(page, CLAIMS_EMPRESA);
    await page.goto(`/cat/${DIAG}`);

    await page.getByTestId('cat-submit').click();
    await expect(page.getByTestId('cat-submit-error')).toBeVisible();
    await expect(page.getByTestId('cat-submit-error')).toContainText(/Rol no autorizado/);
    await expect(page.getByTestId('cat-estado')).toHaveText('En captura');
  });

  test('estados vacío y offline', async ({ page }) => {
    await page.route('**test.invalid/**', (route) => route.abort());
    await page.route('**/auth/v1/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    );
    await page.route('**/rest/v1/profiles**', (route) => route.abort());
    await page.route('**/rest/v1/organizations**', (route) => route.abort());
    await page.route('**/rest/v1/diagnostics**', (route) => json(route, 200, []));
    await page.route('**/rest/v1/project_members**', (route) => json(route, 200, []));
    await seedSession(page, CLAIMS_EMPRESA);
    await page.goto('/cat');

    await expect(page.getByText('Sin diagnósticos visibles')).toBeVisible();
    await page.context().setOffline(true);
    await expect(page.locator('[data-cat-state="offline"]')).toBeVisible();
    await page.context().setOffline(false);
  });
});
