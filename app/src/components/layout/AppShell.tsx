import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth/AuthProvider';
import { GLOBAL_ROLE_LABEL } from '../../lib/auth/claims';
import { APP_VERSION } from '../../lib/config';
import { useOnline } from '../../lib/online';
import {
  NAV_GROUPS,
  moduleByPath,
  moduleById,
  modulesForRole,
  type ModuleDef,
} from '../../routes/registry';

/* ------------------------------------------------------------------------- */
/* Estado de conectividad (aria-live)                                        */
/* ------------------------------------------------------------------------- */

function ConnectivityBanner({ online }: { online: boolean }) {
  if (online) return null;
  return (
    <div
      className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-900"
      role="status"
      aria-live="polite"
      data-offline-banner="true"
    >
      Sin conexión: los cambios de captura se conservan en este dispositivo y las
      validaciones que requieren conexión permanecen deshabilitadas (docs/04 §6.4).
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Selector de organización                                                  */
/* ------------------------------------------------------------------------- */

function OrganizationSelector() {
  const { claims, profile } = useAuth();
  const organizationId = claims?.organizationId ?? null;
  const name = profile?.organizationName;
  const label = name ?? (organizationId ? `Organización ${organizationId.slice(0, 8)}…` : 'Sin organización');

  return (
    <div className="hidden items-center gap-2 md:flex">
      <label htmlFor="organizacion" className="sr-only">
        Organización activa
      </label>
      <select
        id="organizacion"
        className="max-w-[15rem] rounded-md border border-line bg-panel px-2 py-1.5 text-xs text-slate-700"
        value={organizationId ?? ''}
        disabled
        aria-describedby="organizacion-ayuda"
        title="La organización proviene del token de sesión (claim organization_id, ADR-005)"
      >
        <option value={organizationId ?? ''}>{label}</option>
      </select>
      <span id="organizacion-ayuda" className="sr-only">
        La organización activa proviene del token de sesión y no se puede cambiar desde la
        interfaz.
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Menú de sesión                                                            */
/* ------------------------------------------------------------------------- */

function SessionMenu() {
  const { claims, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const name = profile?.fullName ?? claims?.email ?? 'Sesión activa';
  const role = claims?.globalRole ?? null;
  const roleLabel = role ? GLOBAL_ROLE_LABEL[role] : 'Rol no reconocido';
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  const handleSignOut = async () => {
    setBusy(true);
    try {
      await signOut();
      navigate('/login', { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs text-slate-700 hover:border-hidria-200">
        <span
          aria-hidden="true"
          className="flex h-6 w-6 items-center justify-center rounded-full bg-hidria-700 font-mono text-[10px] font-semibold text-white"
        >
          {initials || 'HI'}
        </span>
        <span className="hidden max-w-[12rem] truncate sm:inline">{name}</span>
        <span className="sr-only">Abrir menú de sesión</span>
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-72 rounded-lg border border-line bg-panel p-4 shadow-card">
        <p className="text-sm font-semibold text-hidria-900">{name}</p>
        {claims?.email && <p className="mt-0.5 truncate text-xs text-slate-500">{claims.email}</p>}
        <p className="mt-2 inline-block rounded bg-hidria-50 px-2 py-0.5 text-[11px] font-medium text-hidria-700">
          {roleLabel}
        </p>
        <p className="mt-2 break-all font-mono text-[10px] text-slate-400">
          org {claims?.organizationId ?? '—'}
        </p>
        <hr className="my-3 border-line" />
        <Link
          className="block rounded px-1 py-1 text-xs text-slate-700 hover:text-hidria-700"
          to="/privacidad"
        >
          Aviso de privacidad
        </Link>
        <Link
          className="block rounded px-1 py-1 text-xs text-slate-700 hover:text-hidria-700"
          to="/acerca"
        >
          Acerca de HIDRIA
        </Link>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={busy}
          className="mt-2 w-full rounded-md border border-line px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:border-hidria-200 disabled:opacity-60"
        >
          {busy ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </button>
      </div>
    </details>
  );
}

/* ------------------------------------------------------------------------- */
/* Navegación lateral                                                        */
/* ------------------------------------------------------------------------- */

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { claims } = useAuth();
  const role = claims?.globalRole ?? null;
  const allowed = useMemo(() => new Set(modulesForRole(role).map((m) => m.id)), [role]);

  return (
    <nav aria-label="Módulos de la plataforma" className="px-3 py-4">
      {NAV_GROUPS.map((group) => {
        const modules = group.modules
          .filter((id) => allowed.has(id))
          .map((id) => moduleById(id));
        if (modules.length === 0) return null;
        return (
          <div key={group.label} className="mb-5">
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {modules.map((module) => (
                <li key={module.id}>
                  <NavLink
                    to={module.path}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[13px] ${
                        isActive
                          ? 'bg-hidria-50 font-semibold text-hidria-700'
                          : 'text-slate-700 hover:bg-hidria-50/60 hover:text-hidria-700'
                      }`
                    }
                  >
                    <span className="truncate">{module.short}</span>
                    <span className="font-mono text-[10px] text-slate-400">{module.id}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {allowed.size === 0 && (
        <p className="px-2 text-xs text-slate-500">
          Tu sesión no tiene un rol institucional reconocido. Contacta a la Coordinación
          SRHDS.
        </p>
      )}
    </nav>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-4 py-4">
        <Link to="/" className="flex items-center gap-2.5" onClick={onNavigate}>
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-md bg-hidria-700 font-mono text-xs font-bold text-white"
          >
            H
          </span>
          <span>
            <span className="block text-sm font-semibold leading-none tracking-tight text-hidria-900">
              HIDRIA
            </span>
            <span className="mt-1 block text-[9px] uppercase tracking-[0.14em] text-slate-500">
              MD-OHI · SRHDS
            </span>
          </span>
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SidebarNav onNavigate={onNavigate} />
      </div>
      <div className="border-t border-line px-4 py-3">
        <p className="text-[10px] text-slate-500">SDFI · SRHDS · Tamaulipas</p>
        <p className="mt-1 font-mono text-[10px] text-slate-400">cliente v{APP_VERSION}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Shell autenticado                                                         */
/* ------------------------------------------------------------------------- */

function Breadcrumbs({ module }: { module?: ModuleDef }) {
  const { pathname } = useLocation();
  const isHome = pathname === '/';
  return (
    <nav aria-label="Ruta de navegación" className="min-w-0">
      <ol className="flex items-center gap-1.5 text-xs text-slate-500">
        <li>
          {isHome ? (
            <span aria-current="page" className="font-medium text-hidria-900">
              Inicio
            </span>
          ) : (
            <Link to="/" className="hover:text-hidria-700">
              Inicio
            </Link>
          )}
        </li>
        {module && (
          <>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="truncate font-medium text-hidria-900">
              {module.short}
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}

export function AppShell() {
  const online = useOnline();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const module = moduleByPath(location.pathname);

  useEffect(() => {
    document.title = module
      ? `${module.title} · HIDRIA`
      : 'HIDRIA · Optimización Hídrica Industrial';
  }, [module]);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-surface">
      <a className="skip-link" href="#contenido">
        Saltar al contenido principal
      </a>

      {/* Navegación lateral (escritorio fija; móvil en panel deslizante) */}
      <aside
        id="navegacion-lateral"
        className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-line bg-panel transition-transform md:static md:translate-x-0 ${
          navOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Navegación principal"
      >
        <Sidebar onNavigate={() => setNavOpen(false)} />
      </aside>

      {navOpen && (
        <button
          type="button"
          aria-label="Cerrar navegación"
          className="fixed inset-0 z-30 bg-slate-900/30 md:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <ConnectivityBanner online={online} />

        <header className="sticky top-0 z-20 border-b border-line bg-panel/95 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-2.5">
            <button
              type="button"
              className="rounded-md border border-line px-2 py-1.5 text-xs font-semibold text-slate-700 md:hidden"
              aria-expanded={navOpen}
              aria-controls="navegacion-lateral"
              onClick={() => setNavOpen((open) => !open)}
            >
              Menú
            </button>
            <Breadcrumbs module={module} />
            <div className="ml-auto flex items-center gap-3">
              <span
                className="hidden items-center gap-1.5 text-[11px] text-slate-500 sm:flex"
                data-connection={online ? 'online' : 'offline'}
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-semaforo-ok' : 'bg-semaforo-warn'}`}
                />
                {online ? 'En línea' : 'Sin conexión'}
              </span>
              <OrganizationSelector />
              <SessionMenu />
            </div>
          </div>
        </header>

        <main id="contenido" className="min-w-0 flex-1 px-4 py-6 sm:px-6" tabIndex={-1}>
          <Outlet />
        </main>

        <footer className="border-t border-line px-4 py-3 text-[11px] text-slate-500 sm:px-6">
          HIDRIA — Plataforma de Optimización Hídrica Industrial · Metodología MD-OHI ·
          SDFI–SRHDS, Gobierno del Estado de Tamaulipas
        </footer>
      </div>
    </div>
  );
}
