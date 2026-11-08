import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { RequireAuth, RequireGlobalRole } from './lib/auth/guards';
import { MODULES } from './routes/registry';
import { LoginPage } from './routes/LoginPage';
import { ModulePlaceholderPage } from './routes/ModulePlaceholderPage';
import { PanelPage } from './routes/PanelPage';
import { SincronizacionPage } from './routes/SincronizacionPage';
import { AboutPage, NotFoundPage, PrivacyPage, RouteErrorPage } from './routes/StatePages';

/**
 * Rutas del cliente (F1-02).
 *
 * - `/login` es pública; el resto vive bajo el shell autenticado y requiere sesión.
 * - Cada módulo M1–M13 tiene su ruta propia, con guarda por rol institucional.
 * - Rutas de servicio: `/sincronizacion`, `/acerca`, `/privacidad`, 404.
 *
 * Las pantallas de módulo son placeholders en esta entrega; la ruta canónica ya es
 * la definitiva para evitar enlaces rotos en E2E y en la navegación.
 */
const moduleRoutes: RouteObject[] = MODULES.map((module) => ({
  path: module.path.slice(1),
  element: (
    <RequireGlobalRole roles={module.roles}>
      <ModulePlaceholderPage module={module} />
    </RequireGlobalRole>
  ),
}));

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
    errorElement: <RouteErrorPage />,
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <PanelPage /> },
      ...moduleRoutes,
      { path: 'sincronizacion', element: <SincronizacionPage /> },
      { path: 'acerca', element: <AboutPage /> },
      { path: 'privacidad', element: <PrivacyPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
