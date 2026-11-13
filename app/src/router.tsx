import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { RequireAuth, RequireGlobalRole } from './lib/auth/guards';
import { MODULES, moduleById } from './routes/registry';
import { EmpresaDetailPage } from './routes/empresas/EmpresaDetailPage';
import { EmpresaFormPage } from './routes/empresas/EmpresaFormPage';
import { EmpresasListPage } from './routes/empresas/EmpresasListPage';
import { LoginPage } from './routes/LoginPage';
import { ModulePlaceholderPage } from './routes/ModulePlaceholderPage';
import { PanelPage } from './routes/PanelPage';
import { SincronizacionPage } from './routes/SincronizacionPage';
import { AboutPage, NotFoundPage, PrivacyPage, RouteErrorPage } from './routes/StatePages';

/**
 * Rutas del cliente.
 *
 * - `/login` es pública; el resto vive bajo el shell autenticado y requiere sesión.
 * - M1 (`/empresas`) ya tiene pantallas reales (F1-03b); el resto de módulos M2–M13 sigue
 *   como placeholder con su contrato.
 * - Rutas de servicio: `/sincronizacion`, `/acerca`, `/privacidad`, 404.
 */
const placeholderRoutes: RouteObject[] = MODULES.filter((module) => module.id !== 'M1').map(
  (module) => ({
    path: module.path.slice(1),
    element: (
      <RequireGlobalRole roles={module.roles}>
        <ModulePlaceholderPage module={module} />
      </RequireGlobalRole>
    ),
  }),
);

const M1_ROLES = moduleById('M1').roles;

const empresaRoutes: RouteObject[] = [
  {
    path: 'empresas',
    element: (
      <RequireGlobalRole roles={M1_ROLES}>
        <EmpresasListPage />
      </RequireGlobalRole>
    ),
  },
  {
    path: 'empresas/nueva',
    element: (
      <RequireGlobalRole roles={M1_ROLES}>
        <EmpresaFormPage mode="create" />
      </RequireGlobalRole>
    ),
  },
  {
    path: 'empresas/:companyId',
    element: (
      <RequireGlobalRole roles={M1_ROLES}>
        <EmpresaDetailPage />
      </RequireGlobalRole>
    ),
  },
  {
    path: 'empresas/:companyId/editar',
    element: (
      <RequireGlobalRole roles={M1_ROLES}>
        <EmpresaFormPage mode="edit" />
      </RequireGlobalRole>
    ),
  },
];

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
      ...empresaRoutes,
      ...placeholderRoutes,
      { path: 'sincronizacion', element: <SincronizacionPage /> },
      { path: 'acerca', element: <AboutPage /> },
      { path: 'privacidad', element: <PrivacyPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
