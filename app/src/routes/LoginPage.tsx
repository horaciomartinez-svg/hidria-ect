import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthProvider';
import { APP_VERSION } from '../lib/config';
import { ConfigMissingPage } from './StatePages';

function safeRedirect(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/';
}

/**
 * Inicio de sesión con Supabase Auth (email + contraseña institucional).
 *
 * El rol y la organización **no** se eligen aquí: provienen del token de sesión
 * (claims `organization_id`/`tenant_id`/`global_role`, ADR-005) que emite el hook
 * `custom_access_token_hook`. El cliente no autoriza nada por sí mismo.
 */
export function LoginPage() {
  const { status, signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = 'Iniciar sesión · HIDRIA';
  }, []);

  if (status === 'unconfigured') return <ConfigMissingPage />;
  if (status === 'authenticated') return <Navigate to={safeRedirect(location.state)} replace />;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (email.trim().length === 0 || password.length === 0) {
      setError('Ingresa tu correo institucional y contraseña.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await signIn(email, password);
      if (!result.ok) setError(result.message ?? 'No fue posible iniciar sesión.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-surface lg:grid-cols-[1.05fr_1fr]">
      <section
        className="relative hidden flex-col justify-between overflow-hidden bg-hidria-900 p-12 text-white lg:flex"
        aria-hidden="true"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-hidria-200">
            Programa Empresas Hídricamente Responsables
          </p>
          <p className="mt-6 max-w-md text-3xl font-semibold leading-tight">
            Diagnósticos de optimización hídrica, de la evidencia al plan de acción.
          </p>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-hidria-100">
            Metodología MD-OHI · cronograma de 6 semanas · 3 visitas y 5 reuniones de
            validación · balance hídrico enriquecido · IVOH con semáforo institucional.
          </p>
        </div>
        <p className="text-xs text-hidria-200">
          SDFI · SRHDS · Gobierno del Estado de Tamaulipas · UCI (Universidades y Centros de
          Innovación)
        </p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-hidria-600">
            SDFI · SRHDS · Tamaulipas
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-hidria-900">
            Iniciar sesión
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Acceso con credenciales institucionales (Supabase Auth).
          </p>

          <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)} noValidate>
            <div>
              <label htmlFor="correo" className="block text-sm font-medium text-slate-800">
                Correo institucional
              </label>
              <input
                id="correo"
                name="correo"
                type="email"
                autoComplete="email"
                required
                disabled={submitting}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-describedby="correo-ayuda"
                className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-slate-900 disabled:opacity-60"
              />
              <p id="correo-ayuda" className="mt-1 text-[11px] text-slate-500">
                Usa el correo registrado en el Programa.
              </p>
            </div>

            <div>
              <label htmlFor="contrasena" className="block text-sm font-medium text-slate-800">
                Contraseña
              </label>
              <input
                id="contrasena"
                name="contrasena"
                type="password"
                autoComplete="current-password"
                required
                disabled={submitting}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-slate-900 disabled:opacity-60"
              />
            </div>

            <div aria-live="polite" role="status">
              {error && (
                <p
                  role="alert"
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-semaforo-crit"
                >
                  {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-hidria-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-hidria-800 disabled:opacity-60"
            >
              {submitting ? 'Verificando…' : 'Entrar'}
            </button>
          </form>

          <p className="mt-6 text-[11px] leading-relaxed text-slate-500">
            Al ingresar aceptas el tratamiento de datos personales del Programa. Consulta el{' '}
            <Link className="font-medium text-hidria-700 underline" to="/privacidad">
              aviso de privacidad
            </Link>
            . ¿Problemas de acceso? Contacta a la Coordinación SRHDS.
          </p>
          <p className="mt-4 font-mono text-[10px] text-slate-400">cliente v{APP_VERSION}</p>
        </div>
      </section>
    </div>
  );
}
