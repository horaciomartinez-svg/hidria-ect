import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from './config';

/**
 * Cliente Supabase con la clave **anon** (RLS es la frontera; docs/04 §1.1).
 * Es `null` cuando faltan variables de entorno o se detectó una clave de servicio:
 * la app muestra una pantalla de configuración en lugar de fallar en blanco.
 *
 * Contrato de sesión: `JWT` con claims `organization_id` (canónico), `tenant_id`
 * (alias) y `global_role` (ADR-005). El rol por diagnóstico no viaja en el JWT:
 * se resuelve en servidor (`docs/04` §2.1).
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  : null;
