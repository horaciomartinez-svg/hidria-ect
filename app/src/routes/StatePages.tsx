import { useEffect } from 'react';
import { Link, useRouteError } from 'react-router-dom';
import { APP_BUILD, APP_VERSION, SERVICE_ROLE_LEAK_DETECTED } from '../lib/config';
import { GLOBAL_ROLE_LABEL, type GlobalRole } from '../lib/auth/claims';
import { InstallCta } from '../components/pwa/InstallCta';

/* ------------------------------------------------------------------------- */
/* Primitivas de estado (accesibles y sin lógica de negocio)                  */
/* ------------------------------------------------------------------------- */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      {children}
    </div>
  );
}

export function LoadingPage({ label = 'Cargando…' }: { label?: string }) {
  return (
    <Shell>
      <p className="text-sm font-medium text-hidria-700" role="status" aria-live="polite">
        {label}
      </p>
      <div className="h-1 w-40 overflow-hidden rounded bg-hidria-100" aria-hidden="true">
        <div className="h-full w-1/2 animate-pulse bg-hidria-600" />
      </div>
    </Shell>
  );
}

export function ConfigMissingPage() {
  return (
    <Shell>
      <p className="text-xs font-semibold uppercase tracking-widest text-hidria-600">
        SDFI · SRHDS · Gobierno del Estado de Tamaulipas
      </p>
      <h1 className="text-2xl font-semibold tracking-tight text-hidria-900">
        Configuración del cliente incompleta
      </h1>
      {SERVICE_ROLE_LEAK_DETECTED ? (
        <p
          className="rounded-lg border border-semaforo-crit/40 bg-red-50 p-4 text-sm text-semaforo-crit"
          role="alert"
        >
          Se detectó una clave con rol <code>service_role</code> en
          <code>VITE_SUPABASE_ANON_KEY</code>. El cliente se detuvo de forma segura
          (TEAM.md §15): retire esa clave del entorno del cliente y use la clave
          pública <code>anon</code>. Reporte el incidente a Seguridad y Privacidad.
        </p>
      ) : (
        <p className="text-sm leading-relaxed text-slate-700">
          Faltan <code>VITE_SUPABASE_URL</code> y/o <code>VITE_SUPABASE_ANON_KEY</code>.
          En el monorepo se definen en el <code>.env</code> de la raíz (nunca versionado;
          plantilla en <code>.env.example</code>). El cliente sólo lee variables con
          prefijo <code>VITE_</code>: la clave <code>service_role</code> jamás se usa aquí.
        </p>
      )}
      <p className="text-xs text-slate-500">Cliente HIDRIA v{APP_VERSION}.</p>
    </Shell>
  );
}

export function ForbiddenPage({ allowedRoles }: { allowedRoles?: readonly GlobalRole[] }) {
  return (
    <Shell>
      <p className="text-xs font-semibold uppercase tracking-widest text-semaforo-warn">
        Acceso no disponible para tu rol
      </p>
      <h1 className="text-2xl font-semibold tracking-tight text-hidria-900">
        Esta sección no corresponde a tu perfil
      </h1>
      <p className="text-sm leading-relaxed text-slate-700">
        El acceso efectivo lo decide la seguridad por fila (RLS) y las Edge Functions
        (<code>docs/04</code> §2.1). Si necesitas operar esta sección, solicita el rol
        correspondiente a la Coordinación SRHDS.
      </p>
      {allowedRoles && allowedRoles.length > 0 && (
        <p className="text-xs text-slate-500">
          Roles previstos: {allowedRoles.map((role) => GLOBAL_ROLE_LABEL[role]).join(' · ')}
        </p>
      )}
      <Link className="text-sm font-semibold text-hidria-700 underline" to="/">
        Volver al panel
      </Link>
    </Shell>
  );
}

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-hidria-900">
        Página no encontrada
      </h1>
      <p className="mt-2 text-sm text-slate-700">
        La ruta solicitada no existe en el cliente. Revisa la dirección o vuelve al
        panel de inicio.
      </p>
      <Link className="mt-6 inline-block text-sm font-semibold text-hidria-700 underline" to="/">
        Volver al panel
      </Link>
    </div>
  );
}

export function AboutPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight text-hidria-900">Acerca de HIDRIA</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">
        Plataforma del Programa «Empresas Hídricamente Responsables» para digitalizar la
        Metodología de Diagnóstico para la Optimización Hídrica Industrial (MD-OHI).
        Responsable: SDFI — Subsecretaría de Desarrollo y Fomento Industrial, órgano
        desconcentrado de la SRHDS. Equipo académico: UCI (Universidades y Centros de
        Innovación).
      </p>
      <dl className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-line bg-panel p-4">
          <dt className="text-xs uppercase tracking-wide text-slate-500">Versión del cliente</dt>
          <dd className="mt-1 font-mono text-lg text-hidria-900">v{APP_VERSION}</dd>
        </div>
        <div className="rounded-lg border border-line bg-panel p-4">
          <dt className="text-xs uppercase tracking-wide text-slate-500">Build</dt>
          <dd className="mt-1 break-all font-mono text-sm text-hidria-900">{APP_BUILD}</dd>
        </div>
        <div className="rounded-lg border border-line bg-panel p-4">
          <dt className="text-xs uppercase tracking-wide text-slate-500">Fase</dt>
          <dd className="mt-1 text-lg text-hidria-900">Fase 1 — MVP núcleo (F1-02b)</dd>
        </div>
      </dl>

      <section
        className="mt-6 rounded-lg border border-line bg-panel p-5"
        aria-labelledby="instalar-titulo"
      >
        <h2 id="instalar-titulo" className="text-sm font-semibold text-hidria-900">
          Instalación y uso sin conexión
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          HIDRIA puede instalarse como aplicación y abrir sin conexión el shell de la
          plataforma. Los datos y las validaciones requieren conexión; la captura offline se
          habilitará con los módulos de campo (M4/M6/M10).
        </p>
        <div className="mt-3">
          <InstallCta />
        </div>
      </section>
      <p className="mt-6 text-xs text-slate-500">
        Contratos consumidos: <code>docs/04</code> §2.1 (claims), §2.5 (folios), §7
        (Realtime) y §8 (errores canónicos); textos legales: <code>docs/06</code>.
      </p>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight text-hidria-900">
        Aviso de privacidad
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-700">
        El aviso de privacidad y el procedimiento de derechos ARCO se publicarán en esta
        sección con el texto <strong>íntegro y sin reformular</strong> del Anexo A de
        <code> docs/06</code>, una vez aprobado por el Comité de Transparencia de la SRHDS
        (<code>docs/06</code> §4 y §11). Este cliente no redacta ni resume textos legales.
      </p>
      <p className="mt-4 text-sm leading-relaxed text-slate-700">
        Mientras se publica, las solicitudes se atienden por los canales institucionales
        de la Unidad de Transparencia de la SRHDS.
      </p>
    </div>
  );
}

export function RouteErrorPage() {
  const error = useRouteError();

  // SEC-PR12-07: en producción no se expone el mensaje de error real (puede filtrar
  // detalles internos); se registra en consola y se muestra un mensaje genérico.
  // En desarrollo se incluye el detalle para depurar.
  useEffect(() => {
    console.error('[HIDRIA] Error de ruta:', error);
  }, [error]);

  const detail =
    import.meta.env.DEV && error instanceof Error ? error.message : null;

  return (
    <Shell>
      <h1 className="text-2xl font-semibold tracking-tight text-hidria-900">
        No se pudo mostrar esta pantalla
      </h1>
      <p className="rounded-lg border border-line bg-panel p-4 text-sm text-slate-700" role="alert">
        Ocurrió un error inesperado en el cliente. Intenta recargar; si persiste, contacta a
        la Coordinación SRHDS indicando la ruta y la hora.
      </p>
      {detail && (
        <p className="rounded-lg border border-line bg-panel p-4 font-mono text-xs text-slate-500">
          Detalle (sólo desarrollo): {detail}
        </p>
      )}
      <div className="flex gap-4 text-sm font-semibold">
        <button
          type="button"
          className="text-hidria-700 underline"
          onClick={() => window.location.reload()}
        >
          Recargar
        </button>
        <Link className="text-hidria-700 underline" to="/">
          Ir al panel
        </Link>
      </div>
    </Shell>
  );
}
