const MODULOS = [
  'M1 · Registro de empresas',
  'M2 · Diagnósticos y gates',
  'M3 · Repositorio documental',
  'M4 · CAT',
  'M5 · IIH',
  'M6 · BHE',
  'M7 · Muestreo y custodia',
  'M8 · IVOH',
  'M9 · Reporte y Plan de Acción',
  'M10 · Bitácora',
  'M11 · Kanban',
  'M12 · Aula MD-OHI',
  'M13 · Informes e indicadores',
];

export default function App() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-hidria-600">
          SDFI · SRHDS · Gobierno del Estado de Tamaulipas
        </p>
        <h1 className="text-4xl font-bold text-hidria-900">HIDRIA</h1>
        <p className="max-w-2xl text-slate-600">
          Plataforma de Optimización Hídrica Industrial — Metodología de Diagnóstico
          MD-OHI. Cliente PWA offline-first en construcción por el equipo autónomo
          <span className="font-medium text-hidria-700"> hidria_coding_team</span>.
        </p>
      </header>

      <section className="rounded-xl border border-hidria-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-hidria-900">Estado de la fundación</h2>
        <ul className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
          <li>✓ Monorepo React 18 + TypeScript + Vite + Tailwind</li>
          <li>✓ Supabase con 44 tablas y RLS (3 migraciones aplicadas)</li>
          <li>✓ CI mínima (guardas + lint + typecheck + build)</li>
          <li>◐ Fase 0 — validación en curso; Fase 1 — MVP núcleo</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-hidria-900">Módulos M1–M13</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {MODULOS.map((m) => (
            <li
              key={m}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              {m}
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-auto border-t border-slate-200 pt-4 text-xs text-slate-500">
        Documentación normativa en <code>docs/</code> · Equipo autónomo en{' '}
        <code>hidria_coding_team/</code>
      </footer>
    </main>
  );
}
