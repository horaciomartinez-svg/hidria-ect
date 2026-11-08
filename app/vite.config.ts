import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// HIDRIA — cliente PWA (React 18 + TS + Vite + Tailwind). F1-02.
const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

const srcDir = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  plugins: [react()],
  // El `.env` del monorepo vive en la raíz (TEAM.md §9). Vite sólo expone al bundle las
  // variables con prefijo `VITE_`; el resto (p. ej. `SUPABASE_SERVICE_ROLE_KEY`) nunca se
  // inyecta en el cliente. El cliente además falla cerrado si detecta una clave de servicio.
  envDir: fileURLToPath(new URL('..', import.meta.url)),
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
});
