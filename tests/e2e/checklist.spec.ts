import { test, expect, type Page, type Route } from '@playwright/test';
import { AUTH_STORAGE_KEY, ORG_ID, sessionFor } from './support/session';

/**
 * HIDRIA — E2E UI-level de M3 Checklist documental (F1-06a / task-113).
 *
 * Proyecto Supabase ficticio: se interceptan PostgREST (checklist, project_members) y las EF
 * (`ef-08-documents/presign`, `register`, `ef-03-checklist/.../transition`) con fixtures.
 * La autorización real (RLS/TD-2/EF-03) la verifican F1-06b/c (Deno/pgTAP); aquí se valida la
 * UI: estados, acciones por rol, flujo presign→PUT→register→EF-03 y errores.
 */

const DIAG = 'c1000000-0000-4000-8000-000000000001';
const COMPANY_NAME = 'Aceros del Golfo, S.A. de C.V.';
const DOC_ID = 'd9000000-0000-4000-8000-000000000001';
const ITEM_LAYOUT = 'e3000000-0000-4000-8000-000000000001';
const ITEM_PLANOS = 'e3000000-0000-4000-8000-000000000002';
const ITEM_RECIBOS = 'e3000000-0000-4000-8000-000000000003';

const CLAIMS_EQUIPO = {
  sub: 'a1000000-0000-4000-8000-000000000002',
  email: 'e2e.equipo@example.invalid',
  organization_id: ORG_ID,
  tenant_id: ORG_ID,
  global_role: 'equipo',
};
const CLAIMS_COORD = {
  sub: 'a1000000-0000-4000-8000-000000000001',
  email: 'e2e.coord@example.invalid',
  organization_id: ORG_ID,
  tenant_id: ORG_ID,
  global_role: 'coordinador_srhds',
};
const CLAIMS_EMPRESA = {
  sub: 'a1000000-0000-4000-8000-000000000003',
  email: 'e2e.empresa@example.invalid',
  organization_id: ORG_ID,
  tenant_id: ORG_ID,
  global_role: 'empresa',
};

function checklistItem(overrides: {
  id: string;
  item_code: string;
  estado: string;
  document_id?: string | null;
  solicitud_nota?: string | null;
}) {
  return {
    id: overrides.id,
    diagnostic_id: DIAG,
    item_code: overrides.item_code,
    estado: overrides.estado,
    document_id: overrides.document_id ?? null,
    solicitud_nota: overrides.solicitud_nota ?? null,
    updated_at: '2026-01-01T00:00:00Z',
    diagnostics: {
      id: DIAG,
      folio: 'MDOHI-2026-001',
      company_id: 'b1000000-0000-4000-8000-000000000001',
      companies: { razon_social: COMPANY_NAME },
    },
  };
}

const ITEMS = [
  checklistItem({ id: ITEM_LAYOUT, item_code: 'layout', estado: 'no_recibido' }),
  checklistItem({ id: ITEM_PLANOS, item_code: 'planos', estado: 'recibido', document_id: DOC_ID }),
  checklistItem({ id: ITEM_RECIBOS, item_code: 'recibos', estado: 'revisado', document_id: DOC_ID }),
];

async function seedSession(page: Page, claims: Record<string, unknown>) {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: AUTH_STORAGE_KEY, value: JSON.stringify(sessionFor(claims)) },
  );
}

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
  'access-control-allow-headers': 'authorization,apikey,content-type,idempotency-key',
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

/** Mock base: PostgREST del checklist/miembros + auth; EF se añaden por test. */
async function mockBase(
  page: Page,
  members: Array<{ diagnostic_id: string; role: string }>,
  state: { items: ReturnType<typeof checklistItem>[] } = {
    items: ITEMS.map((item) => ({ ...item })),
  },
) {
  await page.route('**test.invalid/**', (route) => route.abort());
  await page.route('**/auth/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/rest/v1/profiles**', (route) => route.abort());
  await page.route('**/rest/v1/organizations**', (route) => route.abort());
  await page.route('**/rest/v1/document_checklist_items**', (route) => {
    if (route.request().method() !== 'GET') {
      return json(route, 405, { message: 'La UI no debe escribir el checklist por PostgREST' });
    }
    return json(route, 200, state.items);
  });
  await page.route('**/rest/v1/project_members**', (route) =>
    json(
      route,
      200,
      members.map((member) => ({ diagnostic_id: member.diagnostic_id, role: member.role, user_id: 'x' })),
    ),
  );
  await corsPreflight(page);
  return state;
}

async function mockDocumentsEf(
  page: Page,
  capture: { presign: unknown[]; register: unknown[]; transition: unknown[] },
  options: {
    presignStatus?: number;
    presignBody?: unknown;
    transitionStatus?: number;
    transitionBody?: unknown;
    state?: { items: ReturnType<typeof checklistItem>[] };
  } = {},
) {
  await page.route('**/functions/v1/ef-08-documents/presign**', async (route) => {
    capture.presign.push(JSON.parse(route.request().postData() ?? '{}'));
    if (options.presignStatus && options.presignStatus >= 400) {
      await json(route, options.presignStatus, options.presignBody ?? {});
      return;
    }
    await json(route, 200, {
      upload_url: `https://r2.test.invalid/put/${DOC_ID}`,
      document_id: DOC_ID,
      expira_en_seg: 300,
      metodo: 'PUT',
    });
  });
  await page.route('https://r2.test.invalid/**', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS_HEADERS })
      : route.fulfill({
          status: 200,
          contentType: 'application/pdf',
          headers: CORS_HEADERS,
          body: 'ok',
        }),
  );
  await page.route('**/functions/v1/ef-08-documents/register**', async (route) => {
    capture.register.push(JSON.parse(route.request().postData() ?? '{}'));
    await json(route, 200, { document_id: DOC_ID, sha256: 'a'.repeat(64) });
  });
  await page.route('**/functions/v1/ef-03-checklist/**', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
    capture.transition.push(body);
    if (options.transitionStatus && options.transitionStatus >= 400) {
      await json(route, options.transitionStatus, options.transitionBody ?? {});
      return;
    }
    const itemId = route.request().url().split('/checklist/')[1]?.split('/')[0] ?? ITEM_LAYOUT;
    const item = options.state?.items.find((candidate) => candidate.id === itemId);
    if (item) {
      item.estado = (body.to as string) ?? 'recibido';
      if (body.document_id) item.document_id = body.document_id as string;
    }
    await json(route, 200, {
      item_id: itemId,
      item_code: item?.item_code ?? 'layout',
      estado: body.to ?? 'recibido',
      document_id: (body.document_id as string | undefined) ?? null,
    });
  });
}

test.describe('M3 — Checklist documental', () => {
  test('equipo: muestra estados y sólo las transiciones de su rol', async ({ page }) => {
    await mockBase(page, [{ diagnostic_id: DIAG, role: 'equipo' }]);
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto('/checklist');

    await expect(page.getByTestId('checklist-page')).toBeVisible();
    await expect(page.getByText(COMPANY_NAME)).toBeVisible();
    await expect(page.getByTestId('checklist-state-layout')).toHaveText('No recibido');
    await expect(page.getByTestId('checklist-state-planos')).toHaveText('Recibido');
    await expect(page.getByTestId('checklist-state-recibos')).toHaveText('Revisado');

    // Equipo puede solicitar/revisar, no validar en R1; no puede adjuntar como empresa.
    await expect(page.getByTestId('checklist-transition-recibido-layout')).toBeVisible();
    await expect(page.getByTestId('checklist-transition-revisado-planos')).toBeVisible();
    await expect(page.getByTestId('checklist-transition-validado_r1-recibos')).toHaveCount(0);
    await expect(page.getByTestId('checklist-upload-layout')).toHaveCount(0);
  });

  test('staff: pedir documento con nota envía EF-03 con solicitud_nota', async ({ page }) => {
    const capture = { presign: [] as unknown[], register: [] as unknown[], transition: [] as unknown[] };
    await mockBase(page, [{ diagnostic_id: DIAG, role: 'equipo' }]);
    await mockDocumentsEf(page, capture);
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto('/checklist');

    await page.getByTestId('checklist-transition-recibido-layout').click();
    await expect(page.getByTestId('checklist-note-layout')).toBeVisible();
    await page.getByTestId('checklist-note-layout').fill('Falta el layout actualizado del sitio.');
    await page.getByTestId('checklist-note-submit-layout').click();

    await expect.poll(() => capture.transition.length).toBe(1);
    expect(capture.transition[0]).toMatchObject({
      to: 'recibido',
      solicitud_nota: 'Falta el layout actualizado del sitio.',
    });
    await expect(page.getByTestId('checklist-notice')).toBeVisible();
  });

  test('empresa: presign → PUT → register → EF-03 recibido con document_id', async ({
    page,
  }) => {
    const capture = { presign: [] as unknown[], register: [] as unknown[], transition: [] as unknown[] };
    const state = await mockBase(page, [{ diagnostic_id: DIAG, role: 'empresa' }]);
    await mockDocumentsEf(page, capture, { state });
    await seedSession(page, CLAIMS_EMPRESA);
    await page.goto('/checklist');

    // Sin acciones de staff: empresa sólo puede adjuntar en no_recibido.
    await expect(page.getByTestId('checklist-transition-revisado-planos')).toHaveCount(0);
    await expect(page.getByTestId('checklist-upload-layout')).toBeAttached();

    await page.getByTestId('checklist-upload-layout').setInputFiles({
      name: 'layout.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 documento sintético'),
    });

    await expect(page.getByTestId('checklist-notice')).toBeVisible();
    await expect(page.getByTestId('checklist-state-layout')).toHaveText('Recibido');

    expect(capture.presign).toHaveLength(1);
    expect(capture.presign[0]).toMatchObject({
      diagnostic_id: DIAG,
      doc_type: 'layout',
      mime: 'application/pdf',
      exposure_level: 'restringido_nda',
    });
    expect(capture.register).toHaveLength(1);
    expect(capture.register[0]).toMatchObject({
      diagnostic_id: DIAG,
      document_id: DOC_ID,
    });
    expect((capture.register[0] as { sha256: string }).sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(capture.transition[0]).toMatchObject({
      to: 'recibido',
      document_id: DOC_ID,
    });
  });

  test('coordinador: valida en R1 (sólo con documento) por EF-03', async ({ page }) => {
    const capture = { presign: [] as unknown[], register: [] as unknown[], transition: [] as unknown[] };
    const state = await mockBase(page, [{ diagnostic_id: DIAG, role: 'coordinador' }]);
    await mockDocumentsEf(page, capture, { state });
    await seedSession(page, CLAIMS_COORD);
    await page.goto('/checklist');

    await expect(page.getByTestId('checklist-transition-validado_r1-recibos')).toBeVisible();
    await page.getByTestId('checklist-transition-validado_r1-recibos').click();
    await expect.poll(() => capture.transition.length).toBe(1);
    expect(capture.transition[0]).toMatchObject({
      to: 'validado_r1',
      document_id: DOC_ID,
    });
    await expect(page.getByTestId('checklist-state-recibos')).toHaveText('Validado en R1');
  });

  test('error de EF-08: muestra alerta y no encadena register/EF-03', async ({ page }) => {
    const capture = { presign: [] as unknown[], register: [] as unknown[], transition: [] as unknown[] };
    await mockBase(page, [{ diagnostic_id: DIAG, role: 'empresa' }]);
    await mockDocumentsEf(page, capture, {
      presignStatus: 403,
      presignBody: { error: { code: 'FORBIDDEN_ROLE', message: 'Rol no autorizado.' } },
    });
    await seedSession(page, CLAIMS_EMPRESA);
    await page.goto('/checklist');

    await page.getByTestId('checklist-upload-layout').setInputFiles({
      name: 'layout.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 documento sintético'),
    });

    await expect(page.getByTestId('checklist-item-error-layout')).toBeVisible();
    await expect(page.getByTestId('checklist-item-error-layout')).toContainText(
      /Rol no autorizado/,
    );
    expect(capture.register).toHaveLength(0);
    expect(capture.transition).toHaveLength(0);
  });

  test('EF-03 rechaza la validación (403) y la UI lo maneja sin cambiar estado', async ({
    page,
  }) => {
    const capture = { presign: [] as unknown[], register: [] as unknown[], transition: [] as unknown[] };
    const state = await mockBase(page, [{ diagnostic_id: DIAG, role: 'coordinador' }]);
    await mockDocumentsEf(page, capture, {
      state,
      transitionStatus: 403,
      transitionBody: {
        error: { code: 'FORBIDDEN_ROLE', message: 'Rol no autorizado para validar.' },
      },
    });
    await seedSession(page, CLAIMS_COORD);
    await page.goto('/checklist');

    await page.getByTestId('checklist-transition-validado_r1-recibos').click();
    await expect(page.getByTestId('checklist-item-error-recibos')).toBeVisible();
    await expect(page.getByTestId('checklist-item-error-recibos')).toContainText(
      /Rol no autorizado/,
    );
    // La transición no se aplicó: el estado sigue en revisado (autoridad EF-03/trigger).
    await expect(page.getByTestId('checklist-state-recibos')).toHaveText('Revisado');
  });

  test('estados vacío y offline del checklist', async ({ page }) => {
    await page.route('**test.invalid/**', (route) => route.abort());
    await page.route('**/auth/v1/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    );
    await page.route('**/rest/v1/profiles**', (route) => route.abort());
    await page.route('**/rest/v1/organizations**', (route) => route.abort());
    await page.route('**/rest/v1/document_checklist_items**', (route) => json(route, 200, []));
    await page.route('**/rest/v1/project_members**', (route) => json(route, 200, []));
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto('/checklist');

    await expect(page.getByTestId('checklist-empty')).toBeVisible();
    await expect(page.getByText('Sin ítems de checklist visibles')).toBeVisible();

    await page.context().setOffline(true);
    await expect(page.locator('[data-checklist-state="offline"]')).toBeVisible();
    await page.context().setOffline(false);
  });
});
