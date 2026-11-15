import { test, expect, type Page, type Route } from '@playwright/test';
import { AUTH_STORAGE_KEY, ORG_ID, sessionFor } from './support/session';

/**
 * HIDRIA — E2E UI-level de M5 IIH (F1-08a / task-134).
 *
 * Mockea PostgREST (diagnóstico, catálogos, activos), EF-08 (presign/register + PUT R2) y
 * EF-09 (JSON `{diagnostic_id, document_id, kind:'iih'}`) con fixtures sintéticas. La RLS,
 * trigger de folio y RPC de import reales los cubren F1-08b (Deno) y F1-08c (pgTAP).
 */

const DIAG = 'c1000000-0000-4000-8000-000000000001';
const COMPANY = 'Aceros del Golfo, S.A. de C.V.';
const COMPANY_ID = 'b1000000-0000-4000-8000-000000000001';
const DOC_ID = 'd9000000-0000-4000-8000-000000000001';
const TYPE_CAP = 1;
const TYPE_ALM = 2;

const CLAIMS_EQUIPO = {
  sub: 'a1000000-0000-4000-8000-000000000002',
  email: 'e2e.equipo@example.invalid',
  organization_id: ORG_ID,
  tenant_id: ORG_ID,
  global_role: 'equipo',
};
const CLAIMS_OBSERVADOR = {
  sub: 'a1000000-0000-4000-8000-000000000004',
  email: 'e2e.observador@example.invalid',
  organization_id: ORG_ID,
  tenant_id: ORG_ID,
  global_role: 'observador',
};

const STAGES = [
  { code: 'CAP', nombre: 'Captación', orden: 1 },
  { code: 'ALM', nombre: 'Almacenamiento', orden: 2 },
  { code: 'TRA', nombre: 'Tratamiento', orden: 3 },
  { code: 'DIS', nombre: 'Distribución', orden: 4 },
  { code: 'USO', nombre: 'Uso y consumo', orden: 5 },
  { code: 'EVA', nombre: 'Evacuación', orden: 6 },
];
const TYPES = [
  { id: TYPE_CAP, stage_code: 'CAP', code: 'CAP-01', nombre: 'Pozo profundo' },
  { id: TYPE_ALM, stage_code: 'ALM', code: 'ALM-01', nombre: 'Tanque superficial' },
];

function asset(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'a5000000-0000-4000-8000-000000000001',
    diagnostic_id: DIAG,
    folio: 'CAP-01',
    stage_code: 'CAP',
    asset_type_id: TYPE_CAP,
    tag: 'TAG-001',
    ubicacion: 'Cuarto de bombas',
    capacidad: '25.000',
    capacidad_unidad: 'm3',
    potencia_kw: '15.00',
    material: 'Acero',
    anio_instalacion: 2018,
    estado_fisico: 'bueno',
    opera: 'si',
    criticidad: 'alta',
    respaldo: false,
    suficiencia: 'suficiente',
    mantenimiento_tipo: 'preventivo',
    ultimo_servicio: '2026-01-01',
    intervencion: 'ninguna',
    prioridad: 'media',
    observaciones: null,
    verificado_v1: false,
    updated_at: '2026-01-01T00:00:00Z',
    iih_asset_types: { nombre: 'Pozo profundo' },
    ...overrides,
  };
}

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,OPTIONS',
  'access-control-allow-headers':
    'authorization,apikey,content-type,idempotency-key,prefer,accept',
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
  role: string;
  assets: ReturnType<typeof asset>[];
  writeCalls: Array<{ method: string; body: unknown; url: string }>;
  ef09Calls: Array<Record<string, unknown>>;
  ef09Urls: string[];
  ef08: { presign: unknown[]; register: unknown[] };
  ef09Status?: number;
  ef09Body?: unknown;
}

function diagnosticBody() {
  return {
    id: DIAG,
    folio: 'MDOHI-2026-0001',
    company_id: COMPANY_ID,
    organization_id: ORG_ID,
    companies: { razon_social: COMPANY },
  };
}

async function mockIih(page: Page, overrides: Partial<MockState> = {}): Promise<MockState> {
  const state: MockState = {
    role: 'equipo',
    assets: [
      asset(),
      asset({
        id: 'a5000000-0000-4000-8000-000000000002',
        folio: 'ALM-01',
        stage_code: 'ALM',
        asset_type_id: TYPE_ALM,
        tag: 'TAG-002',
        ubicacion: 'Planta baja',
        verificado_v1: true,
        iih_asset_types: { nombre: 'Tanque superficial' },
      }),
    ],
    writeCalls: [],
    ef09Calls: [],
    ef09Urls: [],
    ef08: { presign: [], register: [] },
    ...overrides,
  };

  await page.route('**test.invalid/**', (route) => route.abort());
  await page.route('**/auth/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/rest/v1/profiles**', (route) => route.abort());
  await page.route('**/rest/v1/organizations**', (route) => route.abort());
  await page.route('**/rest/v1/project_members**', (route) =>
    json(route, 200, [{ diagnostic_id: DIAG, role: state.role, user_id: 'x' }]),
  );
  await page.route('**/rest/v1/iih_stages**', (route) => json(route, 200, STAGES));
  await page.route('**/rest/v1/iih_asset_types**', (route) => json(route, 200, TYPES));
  await page.route('**/rest/v1/diagnostics**', (route) => {
    if (route.request().url().includes('id=eq.')) return json(route, 200, diagnosticBody());
    return json(route, 200, [diagnosticBody()]);
  });
  await page.route('**/rest/v1/iih_assets**', async (route) => {
    const request = route.request();
    const method = request.method();
    if (method === 'GET') return json(route, 200, state.assets);
    const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
    state.writeCalls.push({ method, body, url: request.url() });
    if (method === 'POST') {
      const created = asset({
        id: 'a5000000-0000-4000-8000-000000000099',
        folio: 'CAP-03',
        tag: String(body.tag ?? ''),
        ubicacion: String(body.ubicacion ?? ''),
        stage_code: String(body.stage_code ?? 'CAP'),
        verificado_v1: Boolean(body.verificado_v1),
      });
      state.assets = [...state.assets, created];
      return json(route, 201, { id: created.id });
    }
    const url = request.url();
    const id = decodeURIComponent(url.split('id=eq.')[1]?.split('&')[0] ?? '');
    state.assets = state.assets.map((current) =>
      current.id === id ? { ...current, ...body } : current,
    );
    return json(route, 200, { id });
  });

  await page.route('**/functions/v1/ef-08-documents/presign**', async (route) => {
    state.ef08.presign.push(JSON.parse(route.request().postData() ?? '{}'));
    return json(route, 200, {
      upload_url: `https://r2.test.invalid/put/${DOC_ID}`,
      document_id: DOC_ID,
      expira_en_seg: 300,
      metodo: 'PUT',
    });
  });
  await page.route('https://r2.test.invalid/**', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS_HEADERS })
      : route.fulfill({ status: 200, headers: CORS_HEADERS, body: 'ok' }),
  );
  await page.route('**/functions/v1/ef-08-documents/register**', async (route) => {
    state.ef08.register.push(JSON.parse(route.request().postData() ?? '{}'));
    return json(route, 200, { document_id: DOC_ID, sha256: 'a'.repeat(64) });
  });
  await page.route('**/functions/v1/ef-09-import/**', async (route) => {
    state.ef09Calls.push(JSON.parse(route.request().postData() ?? '{}'));
    state.ef09Urls.push(route.request().url());
    if (state.ef09Status && state.ef09Status >= 400) {
      return json(route, state.ef09Status, state.ef09Body ?? {});
    }
    return json(route, 200, {
      kind: 'iih',
      destino_id: DIAG,
      filas_ok: 2,
      filas_rechazadas: [
        { fila: 10, razon: 'Capacidad inválida <img src=x onerror="alert(1)">' },
      ],
      advertencias: ['Una fila sin evidencia <script>alert(1)</script>'],
    });
  });
  await corsPreflight(page);
  return state;
}

function xlsxFile(name = 'IIH_plantilla.xlsx') {
  return {
    name,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from('PK\x03\x04plantilla-sintetica'),
  };
}

test.describe('M5 — IIH', () => {
  test('equipo: resumen, tabla y filtros del inventario', async ({ page }) => {
    await mockIih(page);
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto('/iih');
    await page.getByTestId('iih-open').click();

    await expect(page.getByTestId('iih-inventory-page')).toBeVisible();
    await expect(page.getByText(COMPANY)).toBeVisible();
    await expect(page.getByTestId('iih-summary')).toContainText('2');
    await expect(page.getByTestId('iih-row')).toHaveCount(2);
    await expect(page.getByTestId('iih-row').getByText('CAP-01')).toBeVisible();
    await expect(page.getByTestId('iih-v1-ALM-01')).toHaveText('Sí');

    await page.getByTestId('iih-search').fill('TAG-002');
    await expect(page.getByTestId('iih-row')).toHaveCount(1);
    await page.getByTestId('iih-search').fill('');
    await page.getByTestId('iih-filter-stage').selectOption('CAP');
    await expect(page.getByTestId('iih-row')).toHaveCount(1);
    await expect(page.getByTestId('iih-row').getByText('CAP-01')).toBeVisible();
  });

  test('equipo: alta de activo (organization_id del claim; folio server-side)', async ({ page }) => {
    const state = await mockIih(page);
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto(`/iih/${DIAG}`);

    await page.getByTestId('iih-new').click();
    await page.getByTestId('iih-form').getByLabel('Etapa').selectOption('CAP');
    await page.getByTestId('iih-form').getByLabel('Tipo de activo').selectOption(String(TYPE_CAP));
    await page.getByTestId('iih-form').getByLabel('TAG interno').fill('TAG-003');
    await page.getByTestId('iih-form').getByLabel('Ubicación (layout/plano)').fill('Azotea');
    await page.getByTestId('iih-save').click();

    await expect(page.getByTestId('iih-notice')).toBeVisible();
    // SEC-PR65-01/OBS: la organización no es un campo editable del formulario.
    await expect(page.getByTestId('iih-form').getByLabel(/organización/i)).toHaveCount(0);
    const post = state.writeCalls.find((call) => call.method === 'POST');
    expect(post?.body).toMatchObject({
      diagnostic_id: DIAG,
      organization_id: ORG_ID,
      tag: 'TAG-003',
      stage_code: 'CAP',
    });
    expect(post?.body).not.toHaveProperty('folio');
    expect(post?.body).not.toHaveProperty('created_by');
  });

  test('equipo: edición/verificación V1 sin enviar campos server-side', async ({ page }) => {
    const state = await mockIih(page);
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto(`/iih/${DIAG}`);

    await page.getByTestId('iih-edit-CAP-01').click();
    await page.getByTestId('iih-verificado').check();
    await page.getByTestId('iih-save').click();

    await expect(page.getByTestId('iih-notice')).toBeVisible();
    const patch = state.writeCalls.find((call) => call.method === 'PATCH');
    expect(patch?.body).toMatchObject({ verificado_v1: true });
    expect(patch?.body).not.toHaveProperty('folio');
    expect(patch?.body).not.toHaveProperty('organization_id');
    // OBS seguridad: el UPDATE va scoped al id del activo, sin diagnostic_id manipulable.
    expect(patch?.url).toContain('id=eq.a5000000-0000-4000-8000-000000000001');
    expect(patch?.body).not.toHaveProperty('diagnostic_id');
  });

  test('observador: sólo lectura (sin alta, edición ni import)', async ({ page }) => {
    await mockIih(page, { role: 'observador' });
    await seedSession(page, CLAIMS_OBSERVADOR);
    await page.goto(`/iih/${DIAG}`);

    await expect(page.getByTestId('iih-row')).toHaveCount(2);
    await expect(page.getByTestId('iih-new')).toHaveCount(0);
    await expect(page.getByTestId('iih-edit-CAP-01')).toHaveCount(0);
    await expect(page.getByTestId('iih-file')).toHaveCount(0);
  });

  test('importación XLSX: EF-08 (presign/register) → EF-09 JSON y reporte por fila', async ({
    page,
  }) => {
    const state = await mockIih(page);
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto(`/iih/${DIAG}`);

    await page.getByTestId('iih-file').setInputFiles(xlsxFile());
    await expect(page.getByTestId('iih-import-result')).toBeVisible();
    await expect(page.getByTestId('iih-import-result')).toContainText('Filas válidas: 2');
    await expect(page.getByTestId('iih-import-result')).toContainText('Fila');
    await expect(page.getByTestId('iih-import-result')).toContainText('Capacidad inválida');
    await expect(page.getByTestId('iih-import-result')).toContainText('<img src=x onerror="alert(1)">');
    await expect(page.getByTestId('iih-import-result').locator('img, script')).toHaveCount(0);

    expect(state.ef08.presign).toHaveLength(1);
    expect(state.ef08.register).toHaveLength(1);
    expect(state.ef09Calls[0]).toMatchObject({
      diagnostic_id: DIAG,
      document_id: DOC_ID,
      kind: 'iih',
    });
    expect(state.ef09Urls[0]).toMatch(/\/functions\/v1\/ef-09-import\/import\/xlsx$/);
  });

  test('estructura XLSX inválida (422) muestra el error de EF-09', async ({ page }) => {
    const state = await mockIih(page, {
      ef09Status: 422,
      ef09Body: {
        error: {
          code: 'VALIDATION_XLSX_ESTRUCTURA',
          message: 'Faltan columnas de la plantilla.',
          details: { faltantes: ['potencia_kw'] },
        },
      },
    });
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto(`/iih/${DIAG}`);

    await page.getByTestId('iih-file').setInputFiles(xlsxFile());
    await expect(page.getByTestId('iih-import-error')).toBeVisible();
    await expect(page.getByTestId('iih-import-error')).toContainText('Faltan columnas');
    expect(state.ef09Calls).toHaveLength(1);
  });

  test('archivo no XLSX: se rechaza en cliente sin llamar a EF-08/EF-09', async ({ page }) => {
    const state = await mockIih(page);
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto(`/iih/${DIAG}`);

    await page.getByTestId('iih-file').setInputFiles({
      name: 'inventario.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('folio,tag\nCAP-01,TAG-001'),
    });
    await expect(page.getByTestId('iih-import-error')).toBeVisible();
    expect(state.ef08.presign).toHaveLength(0);
    expect(state.ef09Calls).toHaveLength(0);
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
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto('/iih');

    await expect(page.getByText('Sin diagnósticos visibles')).toBeVisible();
    await page.context().setOffline(true);
    await expect(page.locator('[data-iih-state="offline"]')).toBeVisible();
    await page.context().setOffline(false);
  });
});
