#!/usr/bin/env node
/**
 * Guarda de regresión (B1 de la revisión de PR #21): el service worker sólo debe aceptar
 * `SKIP_WAITING` desde un cliente del **mismo origen exacto**, comparando `URL.origin`,
 * nunca por prefijo (`startsWith`), que aceptaría `https://origen.evil.example`.
 *
 * Se ejecuta en `npm run build` (y por tanto en CI). No sustituye la prueba funcional de
 * dos orígenes (que requiere dos hosts y vive en la suite E2E/CDP de B/2 y task-49), pero
 * impide reintroducir el patrón inseguro.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const swPath = fileURLToPath(new URL('../src/pwa/sw.ts', import.meta.url));
const source = readFileSync(swPath, 'utf8');

const problems = [];

if (/sourceUrl\.startsWith\s*\(/.test(source)) {
  problems.push('usa sourceUrl.startsWith(...): debe comparar el origen exacto con URL.origin');
}
if (!/new URL\s*\(\s*sourceUrl\s*\)\s*\.origin/.test(source)) {
  problems.push('no se encontró `new URL(sourceUrl).origin` (origen exacto)');
}
if (!/sourceOrigin\s*!==\s*self\.location\.origin/.test(source)) {
  problems.push('no se encontró la comparación estricta `sourceOrigin !== self.location.origin`');
}
if (!/catch\s*\{/.test(source)) {
  problems.push('falta el try/catch para URLs de cliente inválidas');
}
if (!/Object\.keys\(data\)\.length\s*!==\s*1/.test(source)) {
  problems.push('el mensaje debe rechazar payload (exactamente {type:"SKIP_WAITING"})');
}

// Vectores de la regla (documentados como evidencia de la semántica esperada).
const ORIGIN = 'https://hidria.pages.dev';
const cases = [
  ['https://hidria.pages.dev/kanban', true],
  ['https://hidria.pages.dev', true],
  ['https://hidria.pages.dev.evil.example/', false],
  ['https://evil.example/hidria.pages.dev', false],
  ['http://hidria.pages.dev/', false],
  ['no-es-una-url', false],
];
const accepted = (url) => {
  try {
    return new URL(url).origin === ORIGIN;
  } catch {
    return false;
  }
};
for (const [url, expected] of cases) {
  if (accepted(url) !== expected) problems.push(`vector inesperado: ${url} → ${accepted(url)}`);
}

if (problems.length > 0) {
  console.error('[HIDRIA] Guarda SW mismo origen FALLÓ:');
  for (const problem of problems) console.error(` - ${problem}`);
  process.exit(1);
}
console.log(`[HIDRIA] Guarda SW mismo origen OK (${cases.length} vectores, ${swPath.split(/[\\/]/).pop()}).`);
