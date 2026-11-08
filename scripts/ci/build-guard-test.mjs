#!/usr/bin/env node
/**
 * HIDRIA — prueba del guard build-time de la clave pública del cliente (task-50 / SEC-PR12-01).
 *
 * `app/vite.config.ts` implementa `assertPublicClientKey` (F1-02a, preservado en #21):
 * falla el build si `VITE_SUPABASE_ANON_KEY` es `sb_secret_*`, un JWT con rol distinto de
 * `anon` (`service_role`) o un JWT ilegible. Este script lo verifica de extremo a extremo
 * lanzando builds de Vite con claves sintéticas en directorios temporales (no toca app/dist).
 *
 * Casos: anon válida (build OK), sb_secret_* (falla), JWT service_role (falla), JWT ilegible (falla).
 * Uso: node scripts/ci/build-guard-test.mjs
 */
import { rmSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const APP_DIR = path.join(REPO_ROOT, 'app');
const VITE_BIN = path.join(REPO_ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const TMP_ROOT = path.join(REPO_ROOT, '.tmp-guard-test');

function b64url(value) {
  return Buffer.from(JSON.stringify(value), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function jwt(payload) {
  const header = b64url({ alg: 'HS256', typ: 'JWT' });
  return `${header}.${b64url(payload)}.${'x'.repeat(43)}`;
}

function runBuild(caseName, anonKey) {
  // Vite resuelve `outDir` relativo a la raíz `app/`; se usa `../.tmp-guard-test` para
  // no ensuciar el árbol compartido (el script limpia `TMP_ROOT` al final).
  const outDir = path.join('..', '.tmp-guard-test', caseName);
  rmSync(path.join(TMP_ROOT, caseName), { recursive: true, force: true });
  const result = spawnSync(
    process.execPath,
    [VITE_BIN, 'build', '--outDir', outDir, '--emptyOutDir', '--minify', 'false', '--logLevel', 'error'],
    {
      cwd: APP_DIR,
      encoding: 'utf8',
      env: { ...process.env, VITE_SUPABASE_ANON_KEY: anonKey },
      timeout: 180_000,
    },
  );
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error,
  };
}

const cases = [
  {
    name: 'anon-publica',
    key: jwt({ role: 'anon', iss: 'supabase', sub: '00000000-0000-0000-0000-000000000000' }),
    expect: 'pass',
    expectedText: null,
  },
  {
    name: 'sb-secret',
    key: `sb_secret_${'a'.repeat(40)}`,
    expect: 'fail',
    expectedText: 'sb_secret',
  },
  {
    name: 'jwt-service-role',
    key: jwt({ role: 'service_role', iss: 'supabase' }),
    expect: 'fail',
    expectedText: 'role "anon"',
  },
  {
    name: 'jwt-ilegible',
    key: 'no-es-un-jwt',
    expect: 'fail',
    expectedText: 'payload',
  },
];

rmSync(TMP_ROOT, { recursive: true, force: true });

let failures = 0;
try {
  for (const testCase of cases) {
    const result = runBuild(testCase.name, testCase.key);
    const combined = `${result.stdout}\n${result.stderr}`;
    const crashed = result.error || result.status === null;
    const ok =
      testCase.expect === 'pass'
        ? result.status === 0
        : !crashed && result.status !== 0 && (!testCase.expectedText || combined.includes(testCase.expectedText));
    console.log(
      `[build-guard] ${ok ? 'OK  ' : 'FALLO'} ${testCase.name} (esperado: ${testCase.expect}; exit=${result.status})`,
    );
    if (!ok) {
      failures += 1;
      console.error(`  salida: ${combined.trim().split('\n').slice(-6).join(' | ')}`);
    }
  }
} finally {
  rmSync(TMP_ROOT, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`[build-guard] FALLO: ${failures} caso(s) del guard build-time no se comportaron como se espera.`);
  process.exit(1);
}
console.log('[build-guard] OK: guard build-time rechaza claves secretas/servicio e ilegibles y acepta anon pública.');
