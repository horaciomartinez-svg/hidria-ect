import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import type { GlobalRole } from './claims';
import { ConfigMissingPage, ForbiddenPage, LoadingPage } from '../../routes/StatePages';

/**
 * Guarda de rutas protegidas: sin sesión se redirige a `/login` recordando el
 * destino. El cliente **no** sustituye a RLS ni a las guardas de las EF: sólo
 * evita navegar a pantallas que el usuario no puede operar.
 *
 * Falla cerrada (B1): una sesión con claims de HIDRIA ausentes o inválidos
 * (`invalid_claims`) **no monta el shell**; se envía a login con la explicación.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'unconfigured') return <ConfigMissingPage />;
  if (status === 'loading') return <LoadingPage label="Comprobando sesión…" />;
  if (status === 'anonymous' || status === 'invalid_claims') {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from,
          error: status === 'invalid_claims' ? 'invalid_claims' : undefined,
        }}
      />
    );
  }
  return <>{children}</>;
}

/**
 * Guarda por rol institucional (claim `global_role`). La decisión efectiva de
 * acceso está en RLS y en las Edge Functions (`docs/04` §2.1).
 */
export function RequireGlobalRole({
  roles,
  children,
}: {
  roles: readonly GlobalRole[];
  children: ReactNode;
}) {
  const { claims } = useAuth();
  const role = claims?.globalRole ?? null;
  if (!role || !roles.includes(role)) return <ForbiddenPage allowedRoles={roles} />;
  return <>{children}</>;
}
