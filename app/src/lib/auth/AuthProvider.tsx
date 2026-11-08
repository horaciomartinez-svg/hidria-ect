import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { isSupabaseConfigured } from '../config';
import { readClaims, type HidriaClaims } from './claims';

/**
 * Estado de sesión.
 *
 * `invalid_claims` = hay token de Supabase Auth pero sus claims de HIDRIA
 * (`sub` UUID, `organization_id` UUID y `global_role` del enum; ADR-005) faltan o no
 * son válidos. La app **falla cerrada**: no monta el shell y redirige a login con
 * explicación (B1 de la revisión de PR #12).
 */
export type AuthStatus =
  | 'unconfigured'
  | 'loading'
  | 'anonymous'
  | 'invalid_claims'
  | 'authenticated';

export interface SessionProfile {
  fullName: string | null;
  organizationName: string | null;
}

export interface SignInResult {
  ok: boolean;
  message?: string;
}

export interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  claims: HidriaClaims | null;
  profile: SessionProfile | null;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Sesión de Supabase Auth + claims de HIDRIA (ADR-005).
 *
 * Los claims se derivan **del access token** (no de datos mutables del cliente) y se
 * validan de forma estricta: sin `sub`/`organization_id` UUID/`global_role` del enum
 * la sesión queda en `invalid_claims` y no se monta el shell. El perfil y el nombre de
 * la organización son sólo presentación (fallos de RLS/red se degradan a `null`).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [claims, setClaims] = useState<HidriaClaims | null>(null);
  const [status, setStatus] = useState<AuthStatus>(
    isSupabaseConfigured ? 'loading' : 'unconfigured',
  );
  const [profile, setProfile] = useState<SessionProfile | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    const applySession = (nextSession: Session | null) => {
      if (!active) return;
      setSession(nextSession);
      if (!nextSession) {
        setClaims(null);
        setStatus('anonymous');
        return;
      }
      const parsed = readClaims(nextSession.access_token);
      if (!parsed) {
        setClaims(null);
        setStatus('invalid_claims');
        return;
      }
      setClaims(parsed);
      setStatus('authenticated');
    };

    void supabase.auth
      .getSession()
      .then(({ data }) => applySession(data.session))
      .catch(() => applySession(null));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !session || !claims) {
      setProfile(null);
      return;
    }
    let active = true;
    void (async () => {
      let fullName: string | null = null;
      let organizationName: string | null = null;
      try {
        const profileResult = await supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', claims.sub)
          .maybeSingle<{ full_name?: unknown }>();
        fullName = asText(profileResult.data?.full_name);
      } catch {
        /* RLS o red: el perfil es opcional para operar. */
      }
      try {
        const orgResult = await supabase
          .from('organizations')
          .select('name')
          .eq('id', claims.organizationId)
          .maybeSingle<{ name?: unknown }>();
        organizationName = asText(orgResult.data?.name);
      } catch {
        /* idem */
      }
      if (active) setProfile({ fullName, organizationName });
    })();
    return () => {
      active = false;
    };
  }, [session, claims]);

  const signIn = useCallback(async (email: string, password: string): Promise<SignInResult> => {
    if (!supabase) {
      return {
        ok: false,
        message: 'La configuración de Supabase está incompleta en este despliegue.',
      };
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (!error) return { ok: true };
    const invalidCredentials =
      error.status === 400 || /invalid|credentials/i.test(error.message);
    return {
      ok: false,
      message: invalidCredentials
        ? 'Credenciales inválidas. Verifica tu correo y contraseña institucionales.'
        : 'No fue posible iniciar sesión. Intenta de nuevo o contacta a la Coordinación SRHDS.',
    };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, session, claims, profile, signIn, signOut }),
    [status, session, claims, profile, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  return context;
}
