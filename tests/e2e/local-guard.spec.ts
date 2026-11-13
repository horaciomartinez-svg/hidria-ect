/**
 * F1-03c — Guard del modo E2E real: sólo Supabase local y con secretos presentes.
 *
 * Se ejecuta siempre (no requiere Supabase): es la prueba de que el helper del modo
 * local rechaza URLs remotas y entornos incompletos, evitando apuntar por error a
 * staging/producción o correr sin anon/JWT secret.
 */
import { expect, test } from '@playwright/test';
import { assertLocalEnv, isLocalSupabaseUrl } from './support/local-supabase';

test.describe('guard E2E local (sin Supabase)', () => {
  test('sólo acepta hosts locales', () => {
    expect(isLocalSupabaseUrl('http://127.0.0.1:54321')).toBe(true);
    expect(isLocalSupabaseUrl('http://localhost:54321')).toBe(true);
    expect(isLocalSupabaseUrl('http://[::1]:54321')).toBe(true);
    expect(isLocalSupabaseUrl('https://test.invalid')).toBe(false);
    expect(isLocalSupabaseUrl('https://proyecto.supabase.co')).toBe(false);
    expect(isLocalSupabaseUrl('not-a-url')).toBe(false);
  });

  test('assertLocalEnv rechaza URL remota y secretos ausentes', () => {
    expect(() =>
      assertLocalEnv({
        url: 'https://proyecto.supabase.co',
        anonKey: 'anon',
        jwtSecret: 'secret',
      }),
    ).toThrow(/sólo admite Supabase local/);

    expect(() =>
      assertLocalEnv({
        url: 'http://127.0.0.1:54321',
        anonKey: '',
        jwtSecret: 'secret',
      }),
    ).toThrow(/E2E_SUPABASE_ANON_KEY/);

    expect(() =>
      assertLocalEnv({
        url: 'http://127.0.0.1:54321',
        anonKey: 'anon',
        jwtSecret: '',
      }),
    ).toThrow(/E2E_SUPABASE_JWT_SECRET/);
  });
});
