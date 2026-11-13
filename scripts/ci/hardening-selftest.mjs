#!/usr/bin/env node
/**
 * HIDRIA — self-test versionado de los controles de CI hardening (SEC-PR29-03).
 *
 * Ejecuta los fixtures negativos/positivos versionados en `scripts/ci/fixtures/`:
 *  - npm-audit: high no allowlisted → 1; high allowlisted → 0; critical allowlisted → 1;
 *    allowlist con `packages` vacío (wildcard) → 2 (schema inválido, SEC-PR29-01).
 *  - dist-scan: credenciales inyectadas → 1; solo literal `service_role` → 0.
 *
 * Lo invoca el job `Seguridad (dependencias y bundle)` en CI; así una regresión de
 * patrones/lógica de allowlist falla el pipeline en vez de pasar silenciosamente.
 *
 * Uso: node scripts/ci/hardening-selftest.mjs
 */
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const FIXTURES = path.join(SCRIPT_DIR, 'fixtures');
const AUDIT_SCRIPT = path.join(SCRIPT_DIR, 'npm-audit.mjs');
const DIST_SCRIPT = path.join(SCRIPT_DIR, 'dist-scan.mjs');

function run(script, args, extraEnv = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
    timeout: 120_000,
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error,
  };
}

const cases = [
  {
    name: 'npm-audit: high no allowlisted → bloquea',
    run: () => run(AUDIT_SCRIPT, [path.join(FIXTURES, 'npm-audit', 'high-blocking.json')]),
    expected: 1,
  },
  {
    name: 'npm-audit: high allowlisted → acepta',
    run: () => run(AUDIT_SCRIPT, [path.join(FIXTURES, 'npm-audit', 'high-allowlisted.json')]),
    expected: 0,
  },
  {
    name: 'npm-audit: critical allowlisted → bloquea (critical nunca se acepta)',
    run: () => run(AUDIT_SCRIPT, [path.join(FIXTURES, 'npm-audit', 'critical-allowlisted.json')]),
    expected: 1,
  },
  {
    name: 'npm-audit: allowlist con packages vacío (wildcard) → schema inválido',
    run: () =>
      run(AUDIT_SCRIPT, [path.join(FIXTURES, 'npm-audit', 'high-blocking.json')], {
        NPM_AUDIT_ALLOWLIST: path.join(FIXTURES, 'npm-audit', 'allowlist-wildcard.json'),
      }),
    expected: 2,
    expectStderr: 'packages',
  },
  {
    name: 'dist-scan: credenciales de servicio inyectadas → bloquea',
    run: () => run(DIST_SCRIPT, [path.join(FIXTURES, 'bundle-bad')]),
    expected: 1,
  },
  {
    name: 'dist-scan: solo literal `service_role` (guarda) → acepta con aviso',
    run: () => run(DIST_SCRIPT, [path.join(FIXTURES, 'bundle-ok')]),
    expected: 0,
  },
];

let failures = 0;
for (const testCase of cases) {
  const result = testCase.run();
  const crashed = result.error || result.status === null;
  const ok =
    !crashed &&
    result.status === testCase.expected &&
    (!testCase.expectStderr || `${result.stdout}\n${result.stderr}`.includes(testCase.expectStderr));
  console.log(`[selftest] ${ok ? 'OK  ' : 'FALLO'} ${testCase.name} (exit=${result.status}, esperado=${testCase.expected})`);
  if (!ok) {
    failures += 1;
    const tail = `${result.stdout}\n${result.stderr}`.trim().split('\n').slice(-8).join(' | ');
    console.error(`  detalle: ${tail || '(sin salida)'}`);
  }
}

if (failures > 0) {
  console.error(`[selftest] FALLO: ${failures} caso(s) de fixtures no se comportaron como se espera.`);
  process.exit(1);
}
console.log('[selftest] OK: fixtures negativos/positivos de audit y dist-scan se comportan como se espera.');
