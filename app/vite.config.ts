import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// HIDRIA — cliente PWA (React 18 + TS + Vite + Tailwind). F1-02.
const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

const srcDir = fileURLToPath(new URL('./src', import.meta.url));
const envDir = fileURLToPath(new URL('..', import.meta.url));

/** Decodifica el payload de un JWT sin verificar la firma (sólo para validar la clave). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Guard **build-time** (SEC-PR12-01): la clave del cliente debe ser pública.
 *
 * La guarda de runtime de `src/lib/config.ts` sólo evita `createClient`, pero Vite ya
 * habría inlineado la variable en el bundle. Aquí se falla el build (incluido CI) si
 * `VITE_SUPABASE_ANON_KEY` es una clave secreta (`sb_secret_*`), un JWT con rol
 * distinto de `anon` (`service_role`) o un JWT ilegible.
 */
function assertPublicClientKey(anonKey: string | undefined): void {
  const key = (anonKey ?? '').trim();
  if (key.length === 0) return; // Sin configuración: el cliente arranca en modo "sin configurar".
  if (/^sb_secret_/i.test(key)) {
    throw new Error(
      '[HIDRIA] VITE_SUPABASE_ANON_KEY parece una clave secreta (sb_secret_*). ' +
        'Use la clave pública anon/publishable; service_role nunca va al cliente (TEAM.md §15).',
    );
  }
  if (/^sb_publishable_/i.test(key)) return;
  const payload = decodeJwtPayload(key);
  if (!payload) {
    throw new Error(
      '[HIDRIA] VITE_SUPABASE_ANON_KEY no es una clave pública JWT válida (no se pudo leer su payload).',
    );
  }
  const role = payload.role;
  if (role !== 'anon') {
    throw new Error(
      `[HIDRIA] VITE_SUPABASE_ANON_KEY debe tener role "anon" (encontrado: ${String(role)}). ` +
        'Si es una clave de servicio, retírela del entorno del cliente (PARO de seguridad).',
    );
  }
}

export default defineConfig(({ mode }) => {
  // El `.env` del monorepo vive en la raíz (TEAM.md §9). Vite sólo expone al bundle las
  // variables con prefijo `VITE_`; el resto (p. ej. `SUPABASE_SERVICE_ROLE_KEY`) nunca se
  // inyecta en el cliente. Se valida la clave pública antes de compilar.
  const env = loadEnv(mode, envDir, 'VITE_');
  assertPublicClientKey(env.VITE_SUPABASE_ANON_KEY);

  return {
    plugins: [react()],
    envDir,
    resolve: {
      alias: { '@': srcDir },
    },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    server: {
      port: 5173,
      strictPort: true,
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
  };
});
