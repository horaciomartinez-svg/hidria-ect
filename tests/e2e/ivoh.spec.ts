import { test, expect, type Page, type Route } from '@playwright/test';
import { AUTH_STORAGE_KEY, ORG_ID, sessionFor } from './support/session';

/**
 * HIDRIA — E2E UI-level de M8 IVOH (F1-10a / task-159).
 *
 * Mockea PostgREST (diagnóstico, versión, factores, rúbricas, semáforo, evaluaciones y vistas),
 * EF-06 `score`/`validate-r4`, con fixtures sintéticas. La RLS/RPC/vistas reales se cubren en
 * F1-10b/c (pgTAP/Deno); aquí se valida la UI (sin cálculo cliente del IVOH).
 */

const DIAG = 'c1000000-0000-4000-8000-000000000001';
const VERSION = 'e1000000-0000-4000-8000-000000000001';
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

const FACTORS = [
  { version_id: VERSION, factor_code: 'F1', nombre: 'Gobernanza y estrategia', peso: 0.15 },
  { version_id: VERSION, factor_code: 'F2', nombre: 'Conocimiento del recurso', peso: 0.2 },
  { version_id: VERSION, factor_code: 'F3', nombre: 'Eficiencia de uso', peso: 0.2 },
  { version_id: VERSION, factor_code: 'F4', nombre: 'Gestión de pérdidas', peso: 0.2 },
  { version_id: VERSION, factor_code: 'F5', nombre: 'Reúso y circularidad', peso: 0.15 },
  { version_id: VERSION, factor_code: 'F6', nombre: 'Cultura y capacidades', peso: 0.1 },
];

const RUBRICS = FACTORS.flatMap((factor) => [
  { factor_code: factor.factor_code, nivel_min: 0, nivel_max: 4, etiqueta: 'Incipiente', descripcion: 'Sin prácticas formalizadas.' },
  { factor_code: factor.factor_code, nivel_min: 5, nivel_max: 7, etiqueta: 'Básico', descripcion: 'Prácticas parciales.' },
  { factor_code: factor.factor_code, nivel_min: 8, nivel_max: 10, etiqueta: 'Consolidado', descripcion: 'Prácticas consolidadas.' },
]);

const SEMAFORO = [
  { nivel: 'rojo', min_total: 0, max_total: 4.99, label: 'Incipiente', descripcion: 'Requiere intervención prioritaria.', orden: 1 },
  { nivel: 'amarillo', min_total: 5, max_total: 7.99, label: 'Básico', descripcion: 'Hay base pero faltan cierres.', orden: 2 },
  { nivel: 'verde', min_total: 8, max_total: null, label: 'Consolidado', descripcion: 'Desempeño consolidado.', orden: 3 },
];

function evaluation(factor: string, puntaje = 7, estado: 'borrador' | 'validado_r4' = 'borrador') {
  return {
    diagnostic_id: DIAG,
    version_id: VERSION,
    factor_code: factor,
    puntaje,
    justificacion: `Justificación ${factor}`,
    evidencia: [{ tipo: 'documento', ref: `DOC-${factor}` }],
    estado,
    r4_logbook_id: estado === 'validado_r4' ? 'd4000000-0000-4000-8000-000000000001' : null,
  };
}

function allEvaluations(puntaje = 7, estado: 'borrador' | 'validado_r4' = 'borrador') {
  return FACTORS.map((factor) => evaluation(factor.factor_code, puntaje, estado));
}

function captureFixture(overrides: Record<string, unknown> = {}) {
  return {
    diagnostic_id: DIAG,
    version_id: VERSION,
    factores_guardados: 6,
    completo: true,
    total: 7.2,
    semaforo: 'amarillo',
    semaforo_label: 'Básico',
    por_factor: FACTORS.map((factor) => ({
      factor_code: factor.factor_code,
      peso: factor.peso,
      puntaje: 7,
      aportacion: Number((factor.peso * 7).toFixed(2)),
    })),
    serie_factores: Object.fromEntries(FACTORS.map((factor) => [factor.factor_code, 7])),
    ...overrides,
  };
}

function scoreFixture() {
  return {
    diagnostic_id: DIAG,
    version_id: VERSION,
    ivoh: 7.2,
    semaforo: 'amarillo',
    semaforo_label: 'Básico',
    por_factor: FACTORS.map((factor) => ({
      factor_code: factor.factor_code,
      peso: factor.peso,
      puntaje: 7,
      aportacion: Number((factor.peso * 7).toFixed(2)),
    })),
    serie_factores: Object.fromEntries(FACTORS.map((factor) => [factor.factor_code, 7])),
  };
}

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
  ivohActual: number | null;
  evaluations: ReturnType<typeof evaluation>[];
  capture: Record<string, unknown> | null;
  score: Record<string, unknown> | null;
  scoreCalls: Array<Record<string, unknown>>;
  validateCalls: Array<Record<string, unknown>>;
  scoreStatus?: number;
  scoreBody?: unknown;
  validateStatus?: number;
  validateBody?: unknown;
}

function diagnosticBody(state: MockState) {
  return {
    id: DIAG,
    folio: 'MDOHI-2026-0001',
    company_id: COMPANY_ID,
    fase_actual: state.faseActual,
    index_version_id: VERSION,
    ivoh_actual: state.ivohActual,
    companies: { razon_social: COMPANY },
  };
}

async function mockIvoh(page: Page, overrides: Partial<MockState> = {}): Promise<MockState> {
  const state: MockState = {
    role: 'equipo',
    faseActual: 5,
    ivohActual: null,
    evaluations: [],
    capture: null,
    score: null,
    scoreCalls: [],
    validateCalls: [],
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
  await page.route('**/rest/v1/ivoh_index_versions**', (route) =>
    json(route, 200, [{ id: VERSION, version: 1 }]),
  );
  await page.route('**/rest/v1/ivoh_factors**', (route) => json(route, 200, FACTORS));
  await page.route('**/rest/v1/ivoh_rubrics**', (route) => json(route, 200, RUBRICS));
  await page.route('**/rest/v1/ivoh_semaforo**', (route) => json(route, 200, SEMAFORO));
  await page.route('**/rest/v1/ivoh_evaluations**', (route) => json(route, 200, state.evaluations));
  await page.route('**/rest/v1/v_ivoh_capture**', (route) =>
    state.capture === null
      ? route.fulfill({ status: 204, headers: CORS_HEADERS })
      : json(route, 200, state.capture),
  );
  await page.route('**/rest/v1/v_ivoh_score**', (route) =>
    state.score === null
      ? route.fulfill({ status: 204, headers: CORS_HEADERS })
      : json(route, 200, state.score),
  );

  await page.route('**/functions/v1/ef-06-ivoh/ivoh/**', async (route) => {
    const url = route.request().url();
    const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
    if (url.endsWith('/score')) {
      state.scoreCalls.push(body);
      if (state.scoreStatus && state.scoreStatus >= 400) {
        return json(route, state.scoreStatus, state.scoreBody ?? {});
      }
      const scores = Array.isArray(body.scores) ? (body.scores as Array<Record<string, unknown>>) : [];
      for (const score of scores) {
        const factor = String(score.factor_code);
        const next = {
          diagnostic_id: DIAG,
          version_id: VERSION,
          factor_code: factor,
          puntaje: Number(score.puntaje),
          justificacion: String(score.justificacion),
          evidencia: score.evidencia,
          estado: 'borrador' as const,
          r4_logbook_id: null,
        };
        state.evaluations = [
          ...state.evaluations.filter((item) => item.factor_code !== factor),
          next,
        ];
      }
      const factorsStored = state.evaluations.length;
      state.capture = captureFixture({
        factores_guardados: factorsStored,
        completo: factorsStored === 6,
        total: factorsStored === 6 ? 7.2 : null,
        semaforo: factorsStored === 6 ? 'amarillo' : null,
        semaforo_label: factorsStored === 6 ? 'Básico' : null,
      });
      return json(route, 200, {
        diagnostic_id: DIAG,
        version_id: VERSION,
        estado: 'borrador',
        factores_guardados: factorsStored,
      });
    }
    state.validateCalls.push(body);
    if (state.validateStatus && state.validateStatus >= 400) {
      return json(route, state.validateStatus, state.validateBody ?? {});
    }
    state.evaluations = allEvaluations(7, 'validado_r4');
    state.score = scoreFixture();
    state.ivohActual = 7.2;
    return json(route, 200, {
      diagnostic_id: DIAG,
      total: 7.2,
      semaforo: 'amarillo',
      semaforo_label: 'Básico',
      por_factor: scoreFixture().por_factor,
    });
  });
  await corsPreflight(page);
  return state;
}

test.describe('M8 — IVOH', () => {
  test('detalle: 6 factores, pesos, rúbricas y total de borrador solo lectura', async ({ page }) => {
    await mockIvoh(page, {
      evaluations: allEvaluations(7, 'borrador'),
      capture: captureFixture(),
    });
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto('/ivoh');
    await page.getByTestId('ivoh-open').click();

    await expect(page.getByTestId('ivoh-detail-page')).toBeVisible();
    await expect(page.getByText(COMPANY)).toBeVisible();
    for (const factor of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6']) {
      await expect(page.getByTestId(`ivoh-factor-${factor}`)).toBeVisible();
    }
    await expect(page.getByTestId('ivoh-total')).toHaveText('7.2');
    await expect(page.getByTestId('ivoh-semaforo')).toHaveText('Básico');
    await expect(page.getByTestId('ivoh-rubric-F1')).toContainText('Básico');
    await expect(page.getByTestId('ivoh-radial-pending')).toBeVisible();
    await expect(page.getByTestId('ivoh-validate')).toBeVisible();
  });

  test('autosave parcial por factor vía EF-06 score (sin cálculo cliente)', async ({ page }) => {
    const state = await mockIvoh(page);
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto(`/ivoh/${DIAG}`);

    await expect(page.getByTestId('ivoh-total')).toHaveText('—');
    await page.getByTestId('ivoh-puntaje-F1').selectOption('7.5');
    await page.getByTestId('ivoh-just-F1').fill('Justificación de prueba');
    await page.getByTestId('ivoh-evidence-add-F1').click();
    await page.getByTestId('ivoh-evidence-ref-F1-0').fill('DOC-001');
    await page.getByTestId('ivoh-save-F1').click();

    await expect(page.getByTestId('ivoh-status-F1')).toHaveText('Guardado');
    expect(state.scoreCalls[0]).toMatchObject({
      scores: [
        {
          factor_code: 'F1',
          puntaje: 7.5,
          justificacion: 'Justificación de prueba',
          evidencia: [{ tipo: 'documento', ref: 'DOC-001' }],
        },
      ],
    });
    await expect(page.getByTestId('ivoh-summary')).toContainText('1/6');
  });

  test('validación de evidencia: sin evidencia no llama EF-06', async ({ page }) => {
    const state = await mockIvoh(page);
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto(`/ivoh/${DIAG}`);

    await page.getByTestId('ivoh-puntaje-F1').selectOption('7.5');
    await page.getByTestId('ivoh-just-F1').fill('Justificación sin evidencia');
    await page.getByTestId('ivoh-save-F1').click();

    await expect(page.getByTestId('ivoh-error-F1')).toContainText('al menos una evidencia');
    expect(state.scoreCalls).toHaveLength(0);
  });

  test('validar R4: EF-06 con r4_logbook_id, total/semáforo oficiales y radial', async ({ page }) => {
    const state = await mockIvoh(page, {
      evaluations: allEvaluations(7, 'borrador'),
      capture: captureFixture(),
    });
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto(`/ivoh/${DIAG}`);

    await page.getByTestId('ivoh-r4-logbook').fill('d4000000-0000-4000-8000-000000000001');
    await page.getByTestId('ivoh-validate-submit').click();
    await expect(page.getByTestId('ivoh-notice')).toBeVisible();
    expect(state.validateCalls[0]).toMatchObject({
      r4_logbook_id: 'd4000000-0000-4000-8000-000000000001',
    });
    await expect(page.getByTestId('ivoh-total')).toHaveText('7.2');
    await expect(page.getByTestId('ivoh-semaforo')).toHaveText('Básico');
    await expect(page.getByTestId('ivoh-radial')).toBeVisible();
    await expect(page.getByTestId('ivoh-validate')).toHaveCount(0);
    await expect(page.getByTestId('ivoh-puntaje-F1')).toBeDisabled();
    await expect(page.getByTestId('ivoh-gate')).toContainText('gate F6 cumplido');
  });

  test('R4 bloqueado sin BHE R3: 409 accesible sin cambiar estado', async ({ page }) => {
    const state = await mockIvoh(page, {
      evaluations: allEvaluations(7, 'borrador'),
      capture: captureFixture(),
      validateStatus: 409,
      validateBody: {
        error: {
          code: 'GATE_BHE_R3',
          message: 'El IVOH requiere un BHE validado en R3.',
        },
      },
    });
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto(`/ivoh/${DIAG}`);

    await page.getByTestId('ivoh-r4-logbook').fill('d4000000-0000-4000-8000-000000000001');
    await page.getByTestId('ivoh-validate-submit').click();
    await expect(page.getByTestId('ivoh-validate-error')).toContainText('BHE validado en R3');
    expect(state.validateCalls).toHaveLength(1);
    await expect(page.getByTestId('ivoh-puntaje-F1')).toBeEnabled();
  });

  test('CONFLICT_IVOH_VERSION al guardar factor: error visible y sin mezclar versión', async ({ page }) => {
    const state = await mockIvoh(page, {
      scoreStatus: 409,
      scoreBody: {
        error: {
          code: 'CONFLICT_IVOH_VERSION',
          message: 'La versión del índice cambió.',
        },
      },
    });
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto(`/ivoh/${DIAG}`);

    await page.getByTestId('ivoh-puntaje-F1').selectOption('7.5');
    await page.getByTestId('ivoh-just-F1').fill('Justificación');
    await page.getByTestId('ivoh-evidence-add-F1').click();
    await page.getByTestId('ivoh-evidence-ref-F1-0').fill('DOC-001');
    await page.getByTestId('ivoh-save-F1').click();

    await expect(page.getByTestId('ivoh-error-F1')).toContainText('La versión del índice cambió');
    expect(state.scoreCalls).toHaveLength(1);
  });

  test('observador: solo lectura (sin validar y factores deshabilitados)', async ({ page }) => {
    await mockIvoh(page, {
      role: 'observador',
      evaluations: allEvaluations(7, 'borrador'),
      capture: captureFixture(),
    });
    await seedSession(page, CLAIMS_OBSERVADOR);
    await page.goto(`/ivoh/${DIAG}`);

    await expect(page.getByTestId('ivoh-validate')).toHaveCount(0);
    await expect(page.getByTestId('ivoh-puntaje-F1')).toBeDisabled();
    await expect(page.getByTestId('ivoh-save-F1')).toBeDisabled();
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
    await page.route('**/rest/v1/ivoh_index_versions**', (route) => json(route, 200, []));
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto('/ivoh');

    await expect(page.getByText('Sin diagnósticos visibles')).toBeVisible();
    await page.context().setOffline(true);
    await expect(page.locator('[data-ivoh-state="offline"]')).toBeVisible();
    await page.context().setOffline(false);
  });
});
