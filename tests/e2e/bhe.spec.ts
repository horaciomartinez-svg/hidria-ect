import { test, expect, type Page, type Route } from '@playwright/test';
import { AUTH_STORAGE_KEY, ORG_ID, sessionFor } from './support/session';

/**
 * HIDRIA — E2E UI-level de M6 BHE (F1-09a / task-144).
 *
 * Mockea PostgREST (diagnóstico, catálogo, balance/flows, vistas de captura y validación),
 * EF-08 (presign/register + PUT R2), EF-09 (kind='bhe') y EF-05 (validate-r3), con fixtures
 * sintéticas. La RLS, triggers, vistas y RPC reales se cubren en F1-09c (pgTAP) y F1-09b (Deno).
 */

const DIAG = 'c1000000-0000-4000-8000-000000000001';
const BAL = 'b9000000-0000-4000-8000-000000000001';
const DOC_ID = 'd9000000-0000-4000-8000-000000000001';
const COMPANY = 'Aceros del Golfo, S.A. de C.V.';
const COMPANY_ID = 'b1000000-0000-4000-8000-000000000001';

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

const CATALOG = [
  { code: 'ENT-01', grupo: 'entrada', nombre: 'Red municipal', orden: 1 },
  { code: 'DST-01', grupo: 'consumo_proceso', nombre: 'Enfriamiento', orden: 10 },
  { code: 'DST-06', grupo: 'consumo_general', nombre: 'Sanitarios', orden: 20 },
  { code: 'DST-11', grupo: 'descarga', nombre: 'Descarga a alcantarillado', orden: 30 },
  { code: 'DST-13', grupo: 'perdida', nombre: 'Pérdidas / agua no contabilizada', orden: 40 },
  { code: 'CIR-01', grupo: 'circular', nombre: 'Recirculación de torres', orden: 50 },
];

const MONTHLY = Array.from({ length: 12 }, (_, index) => ({
  balance_id: BAL,
  mes: index + 1,
  entradas_m3: 100,
  destinos_m3: 60,
  descargas_m3: 20,
  perdidas_m3: 10,
  circular_m3: 10,
  brecha_m3: 10,
  brecha_pct: 9.5,
  flujos_count: 3,
  tiene_captura: true,
}));

const SUMMARY = {
  balance_id: BAL,
  entradas_anual_m3: 1200,
  destinos_anual_m3: 720,
  descargas_anual_m3: 240,
  perdidas_anual_m3: 120,
  circular_anual_m3: 120,
  brecha_anual_m3: 120,
  brecha_anual_pct: 8.2,
  brecha_max_mes_pct: 9.5,
  meses_sobre_umbral: 0,
  meses_con_captura: 12,
  captura_completa: true,
  tiene_datos: true,
  brecha_pct_promedio: 9.5,
};

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
  role: string;
  faseActual: number;
  balance: Record<string, unknown> | null;
  flows: Array<Record<string, unknown>>;
  saveCalls: Array<Record<string, unknown>>;
  createCalls: Array<Record<string, unknown>>;
  ef05Calls: Array<Record<string, unknown>>;
  ef09Calls: Array<Record<string, unknown>>;
  ef05Status?: number;
  ef05Body?: unknown;
  summaryOverride?: Record<string, unknown> | null;
  importStatus?: number;
  importBody?: unknown;
}

function diagnosticBody(state: MockState) {
  return {
    id: DIAG,
    folio: 'MDOHI-2026-0001',
    company_id: COMPANY_ID,
    fase_actual: state.faseActual,
    organization_id: ORG_ID,
    companies: { razon_social: COMPANY },
  };
}

function balanceBody(state: MockState) {
  if (!state.balance) return null;
  return {
    id: BAL,
    diagnostic_id: DIAG,
    organization_id: ORG_ID,
    periodo_anio: 2025,
    mes_inicio: 1,
    fuente_origen: 'nativa',
    estado: 'en_captura',
    version: 1,
    validado_r3_logbook_id: null,
    produccion_mensual: null,
    unidad_produccion: null,
    dias_operacion: null,
    dqo_mg_l: null,
    dbo5_mg_l: null,
    updated_at: '2026-01-01T00:00:00Z',
    ...state.balance,
  };
}

async function mockBhe(page: Page, overrides: Partial<MockState> = {}): Promise<MockState> {
  const state: MockState = {
    role: 'equipo',
    faseActual: 4,
    balance: {},
    flows: [],
    saveCalls: [],
    createCalls: [],
    ef05Calls: [],
    ef09Calls: [],
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
  await page.route('**/rest/v1/diagnostics**', (route) => {
    if (route.request().url().includes('id=eq.')) return json(route, 200, diagnosticBody(state));
    return json(route, 200, [diagnosticBody(state)]);
  });
  await page.route('**/rest/v1/balance_flow_catalog**', (route) => json(route, 200, CATALOG));
  await page.route('**/rest/v1/water_balances**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      const balance = balanceBody(state);
      if (!state.balance) {
        return request.url().includes('diagnostic_id=eq.')
          ? route.fulfill({ status: 204, headers: CORS_HEADERS })
          : json(route, 200, []);
      }
      return request.url().includes('diagnostic_id=eq.')
        ? json(route, 200, balance)
        : json(route, 200, [balance]);
    }
    if (request.method() === 'POST') {
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      state.createCalls.push(body);
      state.balance = {
        id: BAL,
        estado: 'borrador',
        version: 1,
        fuente_origen: 'nativa',
        validado_r3_logbook_id: null,
        ...body,
      };
      return json(route, 201, balanceBody(state));
    }
    return json(route, 200, balanceBody(state));
  });
  await page.route('**/rest/v1/balance_flows**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') return json(route, 200, state.flows);
    const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
    state.saveCalls.push(body);
    const entry = {
      balance_id: BAL,
      catalog_code: body.catalog_code,
      mes: body.mes,
      volumen_m3: body.volumen_m3,
      fuente_dato: body.fuente_dato ?? null,
      comentario: body.comentario ?? null,
      metodo_estimacion: body.metodo_estimacion ?? null,
    };
    state.flows = [
      ...state.flows.filter(
        (flow) => !(flow.catalog_code === entry.catalog_code && flow.mes === entry.mes),
      ),
      entry,
    ];
    if (state.balance) state.balance.estado = 'en_captura';
    return json(route, 201, {});
  });
  await page.route('**/rest/v1/v_bhe_monthly_capture**', (route) => json(route, 200, MONTHLY));
  await page.route('**/rest/v1/v_bhe_monthly**', (route) => json(route, 200, MONTHLY));
  const summary = state.summaryOverride === undefined ? SUMMARY : state.summaryOverride;
  for (const table of ['v_bhe_capture_summary', 'v_bhe_summary']) {
    await page.route(`**/rest/v1/${table}**`, (route) => {
      if (route.request().url().includes('balance_id=eq.')) {
        return summary === null
          ? route.fulfill({ status: 204, headers: CORS_HEADERS })
          : json(route, 200, summary);
      }
      return json(route, 200, summary === null ? [] : [summary]);
    });
  }

  await page.route('**/functions/v1/ef-05-balances/balances/**', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
    state.ef05Calls.push(body);
    if (state.ef05Status && state.ef05Status >= 400) {
      return json(route, state.ef05Status, state.ef05Body ?? {});
    }
    state.balance = { ...(state.balance ?? {}), estado: 'validado_r3', validado_r3_logbook_id: body.r3_logbook_id };
    return json(route, 200, {
      balance_id: BAL,
      estado: 'validado_r3',
      brecha_anual_pct: 8.2,
      brecha_max_mes_pct: 9.5,
      meses_sobre_umbral: 0,
    });
  });
  await page.route('**/functions/v1/ef-08-documents/presign**', (route) =>
    json(route, 200, {
      upload_url: `https://r2.test.invalid/put/${DOC_ID}`,
      document_id: DOC_ID,
      expira_en_seg: 300,
      metodo: 'PUT',
    }),
  );
  await page.route('https://r2.test.invalid/**', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS_HEADERS })
      : route.fulfill({ status: 200, headers: CORS_HEADERS, body: 'ok' }),
  );
  await page.route('**/functions/v1/ef-08-documents/register**', (route) =>
    json(route, 200, { document_id: DOC_ID, sha256: 'a'.repeat(64) }),
  );
  await page.route('**/functions/v1/ef-09-import/import/xlsx**', async (route) => {
    state.ef09Calls.push(JSON.parse(route.request().postData() ?? '{}'));
    if (state.importStatus && state.importStatus >= 400) {
      return json(route, state.importStatus, state.importBody ?? {});
    }
    return json(route, 200, {
      kind: 'bhe',
      destino_id: BAL,
      periodo_anio: 2025,
      filas_ok: 12,
      filas_rechazadas: [{ fila: 9, razon: 'Mes inválido <b>no permitido</b>' }],
      advertencias: ['Una celda de totales fue ignorada <script>alert(1)</script>'],
    });
  });
  await corsPreflight(page);
  return state;
}

function xlsxFile(name = 'BHE_plantilla.xlsx') {
  return {
    name,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from('PK\x03\x04plantilla-sintetica'),
  };
}

test.describe('M6 — BHE', () => {
  test('equipo: detalle con resumen, 12 meses, totales y grupos de captura', async ({ page }) => {
    await mockBhe(page);
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto('/bhe');
    await page.getByTestId('bhe-open').click();

    await expect(page.getByTestId('bhe-detail-page')).toBeVisible();
    await expect(page.getByText(COMPANY)).toBeVisible();
    await expect(page.getByTestId('bhe-summary')).toContainText('12/12');
    await expect(page.getByTestId('bhe-summary')).toContainText('8.2 %');
    await expect(page.getByTestId('bhe-gap-tone')).toHaveText('Cierra (≤10 %)');
    await expect(page.getByTestId('bhe-totals')).toBeVisible();
    expect(await page.getByTestId('bhe-totals').locator('thead th').count()).toBe(13);
    for (const group of ['entrada', 'consumo_proceso', 'consumo_general', 'descarga', 'perdida', 'circular']) {
      await expect(page.getByTestId(`bhe-group-${group}`)).toBeVisible();
    }
    await expect(page.getByTestId('bhe-validate')).toBeVisible();
    await expect(page.getByTestId('bhe-flow-ENT-01-12')).toBeVisible();
  });

  test('creación de balance: solo diagnostic_id/periodo_anio/mes_inicio', async ({ page }) => {
    const state = await mockBhe(page, { balance: null });
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto(`/bhe/${DIAG}`);

    await expect(page.getByTestId('bhe-create')).toBeVisible();
    await page.getByTestId('bhe-create-year').fill('2025');
    await page.getByTestId('bhe-create-month').selectOption('1');
    await page.getByTestId('bhe-create-submit').click();
    await expect(page.getByTestId('bhe-notice')).toBeVisible();
    expect(state.createCalls[0]).toMatchObject({
      diagnostic_id: DIAG,
      periodo_anio: 2025,
      mes_inicio: 1,
    });
    expect(state.createCalls[0]).not.toHaveProperty('estado');
    expect(state.createCalls[0]).not.toHaveProperty('version');
    expect(state.createCalls[0]).not.toHaveProperty('organization_id');
  });

  test('captura: guardar celda flujo×mes por PostgREST y recargar totales', async ({ page }) => {
    const state = await mockBhe(page);
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto(`/bhe/${DIAG}`);

    await page.getByTestId('bhe-flow-ENT-01-1').fill('120');
    await page.getByTestId('bhe-flow-ENT-01-1').blur();
    await expect(page.getByTestId('bhe-save-status')).toHaveText('Guardado');
    expect(state.saveCalls[0]).toMatchObject({
      balance_id: BAL,
      catalog_code: 'ENT-01',
      mes: 1,
      volumen_m3: 120,
    });
    await expect(page.getByTestId('bhe-detail-page')).toContainText('En captura');
  });

  test('validar R3: EF-05 con r3_logbook_id y gate F5 desbloqueado', async ({ page }) => {
    const state = await mockBhe(page);
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto(`/bhe/${DIAG}`);

    await page.getByTestId('bhe-r3-logbook').fill('d4000000-0000-4000-8000-000000000001');
    await page.getByTestId('bhe-validate-submit').click();
    await expect(page.getByTestId('bhe-notice')).toBeVisible();
    expect(state.ef05Calls[0]).toMatchObject({
      r3_logbook_id: 'd4000000-0000-4000-8000-000000000001',
    });
    await expect(page.getByTestId('bhe-detail-page')).toContainText('Validado en R3');
    await expect(page.getByTestId('bhe-gate')).toContainText('gate F5 está cumplido');
    await expect(page.getByTestId('bhe-flow-ENT-01-1')).toBeDisabled();
  });

  test('brecha >10 %: 409 canónico + meses de details.meses y balance editable', async ({ page }) => {
    const state = await mockBhe(page, {
      ef05Status: 409,
      ef05Body: {
        error: {
          code: 'GATE_BHE_BRECHA',
          message: 'Un balance que no cierra no es un dato, es una tarea pendiente.',
          details: { meses: [{ mes: 7, brecha_pct: 12.6 }] },
        },
      },
    });
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto(`/bhe/${DIAG}`);

    await page.getByTestId('bhe-r3-logbook').fill('d4000000-0000-4000-8000-000000000001');
    await page.getByTestId('bhe-validate-submit').click();
    await expect(page.getByTestId('bhe-validate-error')).toContainText(
      'Un balance que no cierra no es un dato, es una tarea pendiente.',
    );
    await expect(page.getByTestId('bhe-validate-error')).toContainText('Julio');
    await expect(page.getByTestId('bhe-validate-error')).toContainText('12.6 %');
    await expect(page.getByTestId('bhe-flow-ENT-01-1')).toBeEnabled();
    expect(state.ef05Calls).toHaveLength(1);
  });

  test('captura incompleta: aviso y EF-05 422 sin estado validado', async ({ page }) => {
    const state = await mockBhe(page, {
      summaryOverride: {
        ...SUMMARY,
        meses_con_captura: 8,
        captura_completa: false,
        tiene_datos: true,
      },
      ef05Status: 422,
      ef05Body: {
        error: {
          code: 'VALIDATION_BHE_INCOMPLETO',
          message: 'El balance no tiene los 12 meses completos.',
        },
      },
    });
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto(`/bhe/${DIAG}`);

    await expect(page.getByTestId('bhe-incomplete-warning')).toContainText('8/12');
    await page.getByTestId('bhe-r3-logbook').fill('d4000000-0000-4000-8000-000000000001');
    await page.getByTestId('bhe-validate-submit').click();
    await expect(page.getByTestId('bhe-validate-error')).toContainText('12 meses');
    await expect(page.getByTestId('bhe-detail-page')).toContainText('En captura');
    await expect(page.getByTestId('bhe-detail-page')).not.toContainText('Validado en R3');
  });

  test('import BHE: EF-08 → EF-09 JSON con periodo_anio y filas rechazadas saneadas', async ({ page }) => {
    const state = await mockBhe(page);
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto(`/bhe/${DIAG}`);

    await expect(page.getByTestId('bhe-import-year')).toHaveValue('2025');
    await page.getByTestId('bhe-file').setInputFiles(xlsxFile());
    await expect(page.getByTestId('bhe-import-result')).toBeVisible();
    await expect(page.getByTestId('bhe-import-result')).toContainText('Filas válidas: 12');
    await expect(page.getByTestId('bhe-import-result')).toContainText('<b>no permitido</b>');
    await expect(page.getByTestId('bhe-import-result').locator('b, script')).toHaveCount(0);
    expect(state.ef09Calls[0]).toMatchObject({
      diagnostic_id: DIAG,
      document_id: DOC_ID,
      kind: 'bhe',
      periodo_anio: 2025,
    });
  });

  test('observador: solo lectura (sin validar/importar/crear y celdas deshabilitadas)', async ({ page }) => {
    await mockBhe(page, { role: 'observador' });
    await seedSession(page, CLAIMS_OBSERVADOR);
    await page.goto(`/bhe/${DIAG}`);

    await expect(page.getByTestId('bhe-detail-page')).toBeVisible();
    await expect(page.getByTestId('bhe-validate')).toHaveCount(0);
    await expect(page.getByTestId('bhe-import')).toHaveCount(0);
    await expect(page.getByTestId('bhe-flow-ENT-01-1')).toBeDisabled();
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
    await page.goto('/bhe');

    await expect(page.getByText('Sin diagnósticos visibles')).toBeVisible();
    await page.context().setOffline(true);
    await expect(page.locator('[data-bhe-state="offline"]')).toBeVisible();
    await page.context().setOffline(false);
  });
});
