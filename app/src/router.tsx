import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { RequireAuth, RequireGlobalRole } from './lib/auth/guards';
import { COMPANY_CREATE_ROLES, COMPANY_WRITE_ROLES } from './features/empresas/types';
import { MODULES } from './routes/registry';
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

const empresaRoutes: RouteObject[] = [
  {
    // Lectura: RLS decide las filas (una `empresa` con membresía puede leer su empresa).
    path: 'empresas',
    element: <EmpresasListPage />,
  },
  {
    // Alta: restringida a admin/coordinación hasta que F1-03a publique created_by + SELECT
    // del creador (B2 de #35: sin lectura, una empresa de `equipo` no podría consultarse).
    path: 'empresas/nueva',
    element: (
      <RequireGlobalRole roles={COMPANY_CREATE_ROLES}>
        <EmpresaFormPage mode="create" />
      </RequireGlobalRole>
    ),
  },
  {
    // Lectura del expediente: RLS decide (empresa propia o roles institucionales).
    path: 'empresas/:companyId',
    element: <EmpresaDetailPage />,
  },
  {
    path: 'empresas/:companyId/editar',
    element: (
      <RequireGlobalRole roles={COMPANY_WRITE_ROLES}>
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
