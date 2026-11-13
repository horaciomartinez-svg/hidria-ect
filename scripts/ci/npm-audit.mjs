#!/usr/bin/env node
/**
 * HIDRIA — auditoría de dependencias de producción (task-50 / SEC-PR12-02).
 *
 * Ejecuta `npm audit --omit=dev --json` y falla si hay vulnerabilidades
 * **high** o **critical** que no estén en `scripts/ci/npm-audit-allowlist.json`.
 * Los advisories allowlisted son solo de severidad high (documentados con GHSA,
 * paquete, razón y tarea); **critical nunca se acepta**.
 *
 * Uso:
 *   node scripts/ci/npm-audit.mjs                 # CI: ejecuta npm audit
 *   node scripts/ci/npm-audit.mjs <audit.json>    # tests: analiza un JSON dado
 *
 * Salida: resumen legible (CI logs); exit 0 = sin hallazgos bloqueantes.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const ALLOWLIST_PATH = path.join(SCRIPT_DIR, 'npm-audit-allowlist.json');

function loadAllowlist() {
  try {
    const raw = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8').replace(/^\uFEFF/, ''));
    return Array.isArray(raw.allowlist) ? raw.allowlist : [];
  } catch (err) {
    console.error(`[npm-audit] No se pudo leer ${ALLOWLIST_PATH}: ${err.message}`);
    process.exit(2);
  }
}

function loadAuditReport() {
  const fixture = process.argv[2];
  if (fixture) {
    try {
      return JSON.parse(readFileSync(path.resolve(fixture), 'utf8').replace(/^\uFEFF/, ''));
    } catch (err) {
      console.error(`[npm-audit] JSON de fixture inválido (${fixture}): ${err.message}`);
      process.exit(2);
    }
  }

  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['audit', '--omit=dev', '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 32 * 1024 * 1024,
  });

  if (result.error) {
    console.error(`[npm-audit] No se pudo ejecutar npm audit: ${result.error.message}`);
    process.exit(2);
  }

  // npm audit sale con 1 cuando hay vulnerabilidades; el JSON sigue siendo válido.
  const stdout = (result.stdout || '').trim();
  try {
    return JSON.parse(stdout);
  } catch (err) {
    console.error('[npm-audit] Salida de npm audit no parseable como JSON.');
    if (stdout) console.error(stdout.slice(0, 2000));
    if (result.stderr) console.error(String(result.stderr).slice(0, 2000));
    process.exit(2);
  }
}

function ghsaOf(advisory) {
  const match = String(advisory?.url || '').match(/GHSA-[a-z0-9-]+/i);
  return match ? match[0].toUpperCase() : null;
}

function isAllowlisted(ghsa, packageNames, allowlist) {
  if (!ghsa) return false;
  return allowlist.some((entry) => {
    if (String(entry.ghsa || '').toUpperCase() !== ghsa) return false;
    const pkgs = Array.isArray(entry.packages) ? entry.packages : [entry.package].filter(Boolean);
    return pkgs.length === 0 || pkgs.some((p) => packageNames.includes(p));
  });
}

/**
 * Recolecta advisories (objetos con url/severity) de un paquete vulnerable.
 * npm audit puede representar una dependencia directa con `via: ["react-router"]`
 * (string) cuando el advisory real vive en la dependencia transitiva; se sigue
 * la cadena para no fallar por un advisory que sí está allowlisted.
 */
function collectAdvisories(name, vulnerabilities, seen = new Set()) {
  if (seen.has(name)) return [];
  seen.add(name);
  const vuln = vulnerabilities[name];
  if (!vuln) return [];

  const advisories = [];
  const viaNames = [];
  for (const via of vuln.via || []) {
    if (via && typeof via === 'object') advisories.push(via);
    else if (typeof via === 'string') viaNames.push(via);
  }
  for (const dep of viaNames) advisories.push(...collectAdvisories(dep, vulnerabilities, seen));
  return advisories;
}

const report = loadAuditReport();
const allowlist = loadAllowlist();
const vulnerabilities = report.vulnerabilities || {};
const metadata = report.metadata?.vulnerabilities || {};

if (!metadata || typeof metadata !== 'object') {
  console.error('[npm-audit] El reporte no contiene metadata.vulnerabilities.');
  process.exit(2);
}

const counts = {
  info: Number(metadata.info || 0),
  low: Number(metadata.low || 0),
  moderate: Number(metadata.moderate || 0),
  high: Number(metadata.high || 0),
  critical: Number(metadata.critical || 0),
  total: Number(metadata.total || 0),
};

console.log(
  `[npm-audit] Producción (--omit=dev): ${counts.total} vulnerabilidades ` +
    `(critical=${counts.critical}, high=${counts.high}, moderate=${counts.moderate}, ` +
    `low=${counts.low}, info=${counts.info}).`,
);

const blocking = [];
const accepted = [];
const warnings = [];

for (const [name, vuln] of Object.entries(vulnerabilities)) {
  const severity = String(vuln.severity || '').toLowerCase();
  if (severity !== 'high' && severity !== 'critical') continue;

  const advisories = collectAdvisories(name, vulnerabilities);
  const relevant = advisories.filter((a) => {
    const s = String(a.severity || severity).toLowerCase();
    return s === 'high' || s === 'critical';
  });
  const list = relevant.length > 0 ? relevant : [{ url: null, title: '(sin advisory asociado)', severity }];
  const packageNames = [name, ...(vuln.effects || [])];

  for (const advisory of list) {
    const ghsa = ghsaOf(advisory);
    const title = advisory.title || '(sin título)';
    const entry = { package: name, ghsa, title, severity };
    if (severity === 'critical') {
      blocking.push({ ...entry, reason: 'critical nunca se acepta (ni allowlisted)' });
    } else if (isAllowlisted(ghsa, packageNames, allowlist)) {
      accepted.push(entry);
    } else {
      blocking.push(entry);
    }
  }
}

for (const entry of accepted) {
  console.log(`[npm-audit] ACEPTADO (high, allowlist): ${entry.package} ${entry.ghsa} — ${entry.title}`);
}

// Los literales de guarda/UI de `service_role` no son credenciales; aquí solo
// se informa de moderadas para trazabilidad.
if (counts.moderate > 0) {
  warnings.push(`${counts.moderate} vulnerabilidad(es) moderate en producción (no bloquean; ver allowlist para react-router).`);
}

if (blocking.length > 0) {
  console.error('[npm-audit] FALLO: vulnerabilidades high/critical de producción sin excepción documentada:');
  for (const entry of blocking) {
    console.error(`  - ${entry.package} [${entry.severity}] ${entry.ghsa || '(sin GHSA)'} — ${entry.title}`);
    if (entry.reason) console.error(`    ${entry.reason}`);
  }
  console.error('[npm-audit] Corrige/actualiza la dependencia o añade una excepción razonada en scripts/ci/npm-audit-allowlist.json.');
  process.exit(1);
}

for (const warning of warnings) console.warn(`[npm-audit] AVISO: ${warning}`);
console.log(`[npm-audit] OK: sin high/critical de producción bloqueantes (${accepted.length} high aceptadas por allowlist).`);
