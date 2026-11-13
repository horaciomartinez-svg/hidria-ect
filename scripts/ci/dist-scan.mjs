#!/usr/bin/env node
/**
 * HIDRIA — escaneo del bundle de producción (task-50 / SEC-PR12-01).
 *
 * Recorre `app/dist/**` y falla si encuentra **credenciales de servicio**:
 *   - clave secreta Supabase (`sb_secret_` + token largo);
 *   - asignación de `SUPABASE_SERVICE_ROLE_KEY`/`SERVICE_ROLE_KEY` con valor;
 *   - JWT cuyo payload declara `role: service_role` (clave de servicio);
 *   - `"role": "service_role"` literal (forma JSON de un JWT inyectado).
 *
 * El literal `service_role` aislado se reporta como **aviso** (no falla): aparece
 * legítimamente en la guarda build-time, en el texto de UI de F1-02a y en el
 * propio supabase-js; por sí solo no es una credencial. Lo que bloquea es una
 * clave/JWT de servicio utilizable.
 *
 * Uso:
 *   node scripts/ci/dist-scan.mjs             # escanea app/dist
 *   node scripts/ci/dist-scan.mjs <directorio> # escanea otro directorio (tests)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const targetArg = process.argv[2];
const TARGET = targetArg ? path.resolve(targetArg) : path.join(REPO_ROOT, 'app', 'dist');

const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.json', '.webmanifest', '.map', '.txt', '.xml', '.svg']);
const MAX_FILE_BYTES = 8 * 1024 * 1024;

const SECRET_PATTERNS = [
  {
    id: 'supabase-secret-key',
    label: 'clave secreta Supabase (sb_secret_…)',
    re: /sb_secret_[A-Za-z0-9_-]{20,}/g,
  },
  {
    id: 'service-role-env',
    label: 'variable de clave service_role con valor',
    re: /(?:SUPABASE_)?SERVICE_ROLE_KEY\s*[:=]\s*['"][^'"\s]{8,}['"]/g,
  },
  {
    id: 'service-role-json',
    label: 'payload JSON con role=service_role',
    re: /["']role["']\s*:\s*["']service_role["']/g,
  },
];

const JWT_RE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const LITERAL_SERVICE_ROLE_RE = /service_role/g;

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function isTextFile(file) {
  const ext = path.extname(file).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  return false;
}

function decodeJwtPayload(token) {
  try {
    const [, payload] = token.split('.');
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

if (!statSync(TARGET, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`[dist-scan] No existe el directorio ${TARGET}. Compila el cliente antes de escanear (npm run build).`);
  process.exit(2);
}

const files = walk(TARGET).filter(isTextFile);
const failures = [];
const warnings = [];

for (const file of files) {
  const rel = path.relative(TARGET, file);
  let text;
  try {
    if (statSync(file).size > MAX_FILE_BYTES) continue;
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  for (const pattern of SECRET_PATTERNS) {
    pattern.re.lastIndex = 0;
    let match;
    while ((match = pattern.re.exec(text)) !== null) {
      const value = match[0].length > 48 ? `${match[0].slice(0, 44)}…` : match[0];
      failures.push({ file: rel, line: lineOf(text, match.index), label: pattern.label, value });
    }
  }

  JWT_RE.lastIndex = 0;
  let jwt;
  while ((jwt = JWT_RE.exec(text)) !== null) {
    const payload = decodeJwtPayload(jwt[0]);
    if (payload && payload.role === 'service_role') {
      failures.push({ file: rel, line: lineOf(text, jwt.index), label: 'JWT con role=service_role', value: `${jwt[0].slice(0, 24)}…` });
    }
  }

  LITERAL_SERVICE_ROLE_RE.lastIndex = 0;
  let literal;
  while ((literal = LITERAL_SERVICE_ROLE_RE.exec(text)) !== null) {
    const start = Math.max(0, literal.index - 60);
    const end = Math.min(text.length, literal.index + 60);
    const context = text.slice(start, end).replace(/\s+/g, ' ');
    warnings.push({ file: rel, line: lineOf(text, literal.index), context });
  }
}

console.log(`[dist-scan] ${files.length} archivos de texto escaneados en ${path.relative(REPO_ROOT, TARGET) || TARGET}.`);

if (warnings.length > 0) {
  console.warn(`[dist-scan] AVISO: ${warnings.length} referencia(s) al literal "service_role" (guarda/UI/supabase-js, sin credencial).`);
  for (const w of warnings.slice(0, 5)) console.warn(`  - ${w.file}:${w.line}`);
  if (warnings.length > 5) console.warn('  …');
}

if (failures.length > 0) {
  console.error(`[dist-scan] FALLO: ${failures.length} credencial(es) de servicio en el bundle:`);
  for (const f of failures) {
    console.error(`  - ${f.file}:${f.line} — ${f.label} — ${f.value}`);
  }
  console.error('[dist-scan] El bundle público no puede contener claves/JWT de servicio (TEAM.md §4/§15).');
  process.exit(1);
}

console.log('[dist-scan] OK: sin claves secretas, variables service_role con valor ni JWT de servicio en el bundle.');
