import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { RequireAuth, RequireGlobalRole } from './lib/auth/guards';
import { COMPANY_CREATE_ROLES, COMPANY_EDIT_ROLES } from './features/empresas/types';
import { MODULES } from './routes/registry';
import { CatFormPage } from './routes/cat/CatFormPage';
import { CatListPage } from './routes/cat/CatListPage';
import { ChecklistPage } from './routes/checklist/ChecklistPage';
import { BheDetailPage } from './routes/bhe/BheDetailPage';
import { BheListPage } from './routes/bhe/BheListPage';
import { IvohDetailPage } from './routes/ivoh/IvohDetailPage';
import { IvohListPage } from './routes/ivoh/IvohListPage';
import { IihInventoryPage } from './routes/iih/IihInventoryPage';
import { IihListPage } from './routes/iih/IihListPage';
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
const placeholderRoutes: RouteObject[] = MODULES.filter(
  (module) =>
    module.id !== 'M1' &&
    module.id !== 'M3' &&
    module.id !== 'M4' &&
    module.id !== 'M5' &&
    module.id !== 'M6' &&
    module.id !== 'M8',
).map((module) => ({
  path: module.path.slice(1),
  element: (
    <RequireGlobalRole roles={module.roles}>
      <ModulePlaceholderPage module={module} />
    </RequireGlobalRole>
  ),
}));

const empresaRoutes: RouteObject[] = [
  {
    // Lectura: RLS decide las filas (una `empresa` con membresía puede leer su empresa).
    path: 'empresas',
    element: <EmpresasListPage />,
  },
  {
    // Alta: F1-03a (#36) publicó companies.created_by y el SELECT del creador, así que el
    // alta vuelve a los 3 roles de escritura (B2 de #35 cerrado).
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
    // Edición: institucionales con escritura y rol `empresa` (sólo su ficha; RLS decide).
    path: 'empresas/:companyId/editar',
    element: (
      <RequireGlobalRole roles={COMPANY_EDIT_ROLES}>
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
      // M3 — checklist documental (F1-06a); `/documentos` queda como alias del path anterior.
      { path: 'checklist', element: <ChecklistPage /> },
      { path: 'documentos', element: <Navigate to="/checklist" replace /> },
      // M4 — CAT (F1-07a): selector de diagnóstico y captura del banco A1-v1.
      { path: 'cat', element: <CatListPage /> },
      { path: 'cat/:diagnosticId', element: <CatFormPage /> },
      // M5 — IIH (F1-08a): inventario, alta/edición e importación XLSX.
      { path: 'iih', element: <IihListPage /> },
      { path: 'iih/:diagnosticId', element: <IihInventoryPage /> },
      // M6 — BHE (F1-09a): captura mensual, brecha de solo lectura, validación R3 e import XLSX.
      { path: 'bhe', element: <BheListPage /> },
      { path: 'bhe/:diagnosticId', element: <BheDetailPage /> },
      // M8 — IVOH (F1-10a): captura de 6 factores, total/semáforo de solo lectura y validación R4.
      { path: 'ivoh', element: <IvohListPage /> },
      { path: 'ivoh/:diagnosticId', element: <IvohDetailPage /> },
      ...placeholderRoutes,
      { path: 'sincronizacion', element: <SincronizacionPage /> },
      { path: 'acerca', element: <AboutPage /> },
      { path: 'privacidad', element: <PrivacyPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
