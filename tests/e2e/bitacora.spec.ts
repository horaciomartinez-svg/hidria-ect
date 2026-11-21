import { test, expect, type Page, type Route } from '@playwright/test';
import { AUTH_STORAGE_KEY, ORG_ID, sessionFor } from './support/session';

/**
 * HIDRIA — E2E UI-level de M10 Bitácora (F1-11a / task-174).
 *
 * Mockea PostgREST (diagnóstico, templates, entries, hijas, completeness),
 * EF-02 (submit-review/sign/close) y EF-08 (evidencia), con fixtures sintéticas.
 * RLS/guards/RPC/EF reales se cubren en F1-11b/c (pgTAP/Deno).
 */

const DIAG = 'c1000000-0000-4000-8000-000000000001';
const ENTRY = 'f2000000-0000-4000-8000-000000000001';
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

const KEYS = ['V1', 'V2', 'V3', 'R1', 'R2', 'R3', 'R4', 'R5'];
const TEMPLATES = KEYS.map((clave, index) => ({
  clave,
  semana: index + 1,
  tipo: index < 3 ? 'visita' : 'reunion',
  titulo: `Ficha ${clave}`,
  duracion_horas: 2,
  objetivo: `Objetivo ${clave}`,
  asistentes_requeridos: 'Coordinador SRHDS · Responsable de empresa',
  agenda_items: [
    { no: 1, actividad: 'Apertura' },
    { no: 2, actividad: 'Revisión de avances' },
  ],
  evidence_items: [{ item: 'Acta firmada', obligatorio: true }],
}));

function entryFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTRY,
    organization_id: ORG_ID,
    diagnostic_id: DIAG,
    clave: 'V1',
    folio: 'BIT-V1-01',
    responsable_sesion: 'Equipo SRHDS',
    fecha: '2026-11-20',
    horario_inicio: '09:00:00',
    horario_fin: null,
    modalidad: 'presencial',
    lugar: 'Planta',
    estado: 'abierta',
    cerrada_en: null,
    cerrada_razon: null,
    version: 1,
    created_at: '2026-11-20T15:00:00Z',
    updated_at: '2026-11-20T15:00:00Z',
    ...overrides,
  };
}

function participant(overrides: Record<string, unknown> = {}) {
  return {
    entry_id: ENTRY,
    nombre: 'Ana Pérez',
    cargo: 'Jefa de planta',
    institucion: 'Empresa',
    contacto: 'ana@example.invalid',
    firma_ts: null,
    ...overrides,
  };
}

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
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
  entry: Record<string, unknown> | null;
  participants: Record<string, unknown>[];
  agenda: Record<string, unknown>[];
  findings: Record<string, unknown>[];
  agreements: Record<string, unknown>[];
  evidence: Record<string, unknown>[];
  changeLog: Record<string, unknown>[];
  bitacoraCerrada: boolean;
  p7: boolean;
  createCalls: Array<Record<string, unknown>>;
  mutations: Array<{ method: string; table: string; body?: unknown; url: string }>;
  efCalls: Array<{ action: string; body: Record<string, unknown> }>;
  closeStatus?: number;
  closeBody?: unknown;
}

function diagnosticBody(state: MockState) {
  return {
    id: DIAG,
    folio: 'MDOHI-2026-0001',
    fase_actual: 4,
    bitacora_cerrada: state.bitacoraCerrada,
    companies: { razon_social: COMPANY },
  };
}

function allFilled(state: MockState) {
  return state.entry
    ? KEYS.map((clave, index) =>
        entryFixture({
          id: `f2000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          clave,
          folio: `BIT-${clave}-01`,
          estado: 'cerrada',
        }),
      )
    : [];
}

async function mockBitacora(page: Page, overrides: Partial<MockState> = {}): Promise<MockState> {
  const state: MockState = {
    role: 'equipo',
    entry: entryFixture(),
    participants: [participant()],
    agenda: [
      { entry_id: ENTRY, no: 1, actividad: 'Apertura', responsable: null, resultado: 'Realizada', estado: 'realizado' },
      { entry_id: ENTRY, no: 2, actividad: 'Revisión de avances', responsable: null, resultado: null, estado: 'realizado' },
    ],
    findings: [{ id: 1, entry_id: ENTRY, tema: 'Fugas', texto: 'Se detectó fuga en bomba 2', links: [] }],
    agreements: [{ id: 1, entry_id: ENTRY, compromiso: 'Revisar bomba', responsable: 'Equipo', fecha: '2026-11-30', seguimiento: null, cerrado: false }],
    evidence: [{ id: 1, entry_id: ENTRY, item: 'Acta firmada', document_id: null, folio: null, obligatorio: true }],
    changeLog: [],
    bitacoraCerrada: false,
    p7: false,
    createCalls: [],
    mutations: [],
    efCalls: [],
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
  await page.route('**/rest/v1/logbook_templates**', (route) => {
    if (route.request().url().includes('clave=eq.')) {
      return json(route, 200, TEMPLATES[0]);
    }
    return json(route, 200, TEMPLATES);
  });
  await page.route('**/rest/v1/v_diagnostic_completeness**', (route) => {
    const payload = { diagnostic_id: DIAG, p7_bitacoras: state.p7 };
    if (route.request().url().includes('diagnostic_id=eq.')) return json(route, 200, payload);
    return json(route, 200, [payload]);
  });
  await page.route('**/rest/v1/logbook_entries**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      if (!state.entry) return route.fulfill({ status: 204, headers: CORS_HEADERS });
      if (request.url().includes('id=eq.')) return json(route, 200, state.entry);
      return json(route, 200, [state.entry]);
    }
    const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
    state.createCalls.push(body);
    state.mutations.push({ method: request.method(), table: 'logbook_entries', body, url: request.url() });
    const created = entryFixture({ ...body, id: 'f2000000-0000-4000-8000-000000000099', folio: 'BIT-V2-01' });
    state.entry = created;
    return json(route, 201, created);
  });
  for (const [table, key] of [
    ['logbook_participants', 'participants'],
    ['logbook_agenda', 'agenda'],
    ['logbook_findings', 'findings'],
    ['logbook_agreements', 'agreements'],
    ['logbook_evidence', 'evidence'],
    ['logbook_change_log', 'changeLog'],
  ] as const) {
    await page.route(`**/rest/v1/${table}**`, async (route) => {
      const request = route.request();
      const rows = state[key];
      if (request.method() === 'GET') return json(route, 200, rows);
      const body = request.postData() ? JSON.parse(request.postData() ?? '{}') : undefined;
      state.mutations.push({ method: request.method(), table, body, url: request.url() });
      return json(route, 200, body ?? {});
    });
  }

  await page.route('**/functions/v1/ef-02-logbook/logbook/**', async (route) => {
    const url = route.request().url();
    const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
    const action = url.endsWith('/submit-review')
      ? 'submit-review'
      : url.endsWith('/sign')
        ? 'sign'
        : 'close';
    state.efCalls.push({ action, body });
    if (action === 'submit-review') {
      if (state.entry) state.entry = { ...state.entry, estado: 'en_revision' };
      return json(route, 200, { entry_id: ENTRY, folio: 'BIT-V1-01', estado: 'en_revision' });
    }
    if (action === 'sign') {
      const name = String(body.participante ?? '');
      state.participants = state.participants.map((row) =>
        row.nombre === name ? { ...row, firma_ts: '2026-11-21T16:00:00Z' } : row,
      );
      return json(route, 200, {
        entry_id: ENTRY,
        folio: 'BIT-V1-01',
        participante: name,
        firma_ts: '2026-11-21T16:00:00Z',
        estado: state.entry?.estado,
      });
    }
    if (state.closeStatus && state.closeStatus >= 400) {
      return json(route, state.closeStatus, state.closeBody ?? {});
    }
    if (state.entry) {
      state.entry = {
        ...state.entry,
        estado: 'cerrada',
        cerrada_en: '2026-11-21T16:30:00Z',
        cerrada_razon: body.cierre_razon ?? null,
        cierre_tardio: Boolean(body.cierre_razon),
        version: Number(state.entry.version ?? 1) + 1,
      };
    }
    state.changeLog = [
      ...state.changeLog,
      { id: 1, entry_id: ENTRY, version: 2, descripcion: 'cierre de ficha', responsable: 'x', ts: '2026-11-21T16:30:00Z' },
    ];
    return json(route, 200, {
      entry_id: ENTRY,
      folio: 'BIT-V1-01',
      clave: 'V1',
      cerrada_en: '2026-11-21T16:30:00Z',
      version: 2,
      cierre_tardio: true,
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

  await corsPreflight(page);
  return state;
}

function pdfFile() {
  return {
    name: 'acta.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 synthetic'),
  };
}

test.describe('M10 — Bitácora', () => {
  test('lista: 8 claves, gate y alta mínima de ficha', async ({ page }) => {
    const state = await mockBitacora(page, { entry: null });
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto('/bitacora');

    await expect(page.getByTestId('bitacora-list-page')).toBeVisible();
    await expect(page.getByTestId('bitacora-diagnostic')).toBeVisible();
    for (const key of KEYS) {
      await expect(page.getByTestId(`bitacora-missing-${key}`)).toBeVisible();
    }
    await page.getByTestId('bitacora-create-V1').click();
    await page.getByTestId('bitacora-create-responsable').fill('Equipo SRHDS');
    await page.getByTestId('bitacora-create-submit').click();
    await expect(page.getByTestId('bitacora-notice')).toBeVisible();
    expect(state.createCalls[0]).toMatchObject({
      diagnostic_id: DIAG,
      clave: 'V1',
      responsable_sesion: 'Equipo SRHDS',
    });
    expect(state.createCalls[0]).not.toHaveProperty('organization_id');
    expect(state.createCalls[0]).not.toHaveProperty('folio');
  });

  test('detalle: agenda, participantes, evidencia y gate visibles', async ({ page }) => {
    await mockBitacora(page);
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto(`/bitacora/${ENTRY}`);

    await expect(page.getByTestId('bitacora-entry-page')).toBeVisible();
    await expect(page.getByText('BIT-V1-01')).toBeVisible();
    await expect(page.getByTestId('bitacora-estado')).toHaveText('Abierta');
    await expect(page.getByTestId('bitacora-participants')).toContainText('Ana Pérez');
    await expect(page.getByTestId('bitacora-agenda-1')).toBeVisible();
    await expect(page.getByTestId('bitacora-evidence-1')).toContainText('Obligatoria');
    await expect(page.getByTestId('bitacora-gate')).toContainText('no está completa');
    await expect(page.getByTestId('bitacora-submit')).toBeVisible();
  });

  test('submit-review → en_revision y close con razón → cerrada/read-only', async ({ page }) => {
    const state = await mockBitacora(page);
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto(`/bitacora/${ENTRY}`);

    await page.getByTestId('bitacora-submit').click();
    await expect(page.getByTestId('bitacora-entry-notice')).toBeVisible();
    expect(state.efCalls[0]?.action).toBe('submit-review');
    await expect(page.getByTestId('bitacora-estado')).toHaveText('En revisión');
    await expect(page.getByTestId('bitacora-close')).toBeVisible();

    await page.getByTestId('bitacora-close-reason').fill('Cierre tardío justificado por revisión de acta y firmas.');
    await page.getByTestId('bitacora-close-submit').click();
    await expect(page.getByTestId('bitacora-entry-notice')).toContainText('Ficha cerrada');
    expect(state.efCalls.at(-1)?.action).toBe('close');
    expect(state.efCalls.at(-1)?.body).toMatchObject({ cierre_razon: 'Cierre tardío justificado por revisión de acta y firmas.' });
    await expect(page.getByTestId('bitacora-estado')).toHaveText('Cerrada');
    await expect(page.getByTestId('bitacora-close')).toHaveCount(0);
    await expect(page.getByTestId('bitacora-resultado-1')).toBeDisabled();
  });

  test('firma de participante vía EF-02', async ({ page }) => {
    const state = await mockBitacora(page);
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto(`/bitacora/${ENTRY}`);

    await page.getByTestId('bitacora-sign-Ana Pérez').click();
    await expect(page.getByTestId('bitacora-entry-notice')).toContainText('Firma registrada');
    expect(state.efCalls[0]).toMatchObject({ action: 'sign', body: { participante: 'Ana Pérez' } });
    await expect(page.getByTestId('bitacora-participants')).toContainText('Firmado');
  });

  test('cierre rechazado por VALIDATION_RAZON: mensaje y ficha editable', async ({ page }) => {
    const state = await mockBitacora(page, {
      entry: entryFixture({ estado: 'en_revision' }),
      closeStatus: 422,
      closeBody: {
        error: {
          code: 'VALIDATION_RAZON',
          message: 'El cierre tardío requiere una razón de al menos 20 caracteres.',
          details: { requiere_razon: true },
        },
      },
    });
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto(`/bitacora/${ENTRY}`);

    await page.getByTestId('bitacora-close-reason').fill('corta');
    await page.getByTestId('bitacora-close-submit').click();
    await expect(page.getByTestId('bitacora-action-error')).toContainText('al menos 20 caracteres');
    await expect(page.getByTestId('bitacora-action-error')).toContainText('VALIDATION_RAZON');
    await expect(page.getByTestId('bitacora-estado')).toHaveText('En revisión');
    expect(state.efCalls).toHaveLength(1);
  });

  test('edición de agenda y alta de participante por RLS', async ({ page }) => {
    const state = await mockBitacora(page);
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto(`/bitacora/${ENTRY}`);

    await page.getByTestId('bitacora-resultado-2').fill('Revisada con acuerdos');
    await page.getByTestId('bitacora-save-agenda-2').click();
    await expect(page.getByTestId('bitacora-entry-notice')).toContainText('Agenda actualizada');

    await page.getByTestId('bitacora-participant-nombre').fill('Luis Gómez');
    await page.getByLabel('Cargo').fill('Operador');
    await page.getByLabel('Institución').fill('Empresa');
    await page.getByRole('button', { name: 'Agregar participante' }).click();
    await expect(page.getByTestId('bitacora-entry-notice')).toContainText('Participante agregado');
    expect(state.mutations.some((m) => m.table === 'logbook_participants' && m.method === 'POST')).toBe(true);
  });

  test('evidencia: subir documento EF-08 y ligar a la fila', async ({ page }) => {
    const state = await mockBitacora(page);
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto(`/bitacora/${ENTRY}`);

    await page.getByTestId('bitacora-evidence-file-1').setInputFiles(pdfFile());
    await expect(page.getByTestId('bitacora-entry-notice')).toContainText('Evidencia');
    expect(state.mutations.some((m) => m.table === 'logbook_evidence' && m.method === 'PATCH')).toBe(true);
  });

  test('observador: solo lectura (sin submit/firmar/cerrar)', async ({ page }) => {
    await mockBitacora(page, { role: 'observador' });
    await seedSession(page, CLAIMS_OBSERVADOR);
    await page.goto(`/bitacora/${ENTRY}`);

    await expect(page.getByTestId('bitacora-submit')).toHaveCount(0);
    await expect(page.getByTestId('bitacora-sign-Ana Pérez')).toHaveCount(0);
    await expect(page.getByTestId('bitacora-resultado-1')).toBeDisabled();
    await expect(page.getByTestId('bitacora-close')).toHaveCount(0);
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
    await page.route('**/rest/v1/logbook_templates**', (route) => json(route, 200, []));
    await seedSession(page, CLAIMS_EQUIPO);
    await page.goto('/bitacora');

    await expect(page.getByText('Sin diagnósticos visibles')).toBeVisible();
    await page.context().setOffline(true);
    await expect(page.locator('[data-logbook-state="offline"]')).toBeVisible();
    await page.context().setOffline(false);
  });
});
