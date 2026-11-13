-- F1-03c — fixture sintética para el E2E real de M1 contra Supabase local.
-- Se ejecuta DESPUÉS de `supabase db reset` (seed F1-01a ya aplicado).
-- Sólo datos sintéticos `.invalid`; no modifica migraciones ni datos reales.
--
-- Casos:
--   * Empresa A1 -> contraparte `empresa A` (ownership; la ve solo esa empresa).
--   * Empresa A2 -> sin contraparte (no la ve la empresa A; sí admin/coordinador agregado).
--   * Empresa B1 (otro tenant) -> contraparte `empresa B` (cross-tenant 0 para A).
--   * Empresa sintética del seed (b100...) -> membresía de diagnóstico para equipo/observador.
begin;

insert into public.organizations (id, name, org_type)
values (
  '00000000-0000-4000-8000-000000000002',
  'Organización E2E B (sintética)',
  'empresa'
)
on conflict (id) do nothing;

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
values (
  'a1000000-0000-4000-8000-000000000007',
  'authenticated',
  'authenticated',
  'empresa.b.local@example.invalid',
  now(),
  now(),
  now()
)
on conflict (id) do nothing;

insert into public.profiles (user_id, organization_id, full_name, email, global_role)
values (
  'a1000000-0000-4000-8000-000000000007',
  '00000000-0000-4000-8000-000000000002',
  'Empresa E2E B',
  'empresa.b.local@example.invalid',
  'empresa'
)
on conflict (user_id) do nothing;

insert into public.companies (
  id, organization_id, razon_social, nombre_planta, giro,
  calle, colonia_parque, cp, municipio, organismo_operador,
  lat, lon, empleados, turnos, unidad_produccion,
  contraparte_user_id, ciclo_vida
)
values
  (
    'b2000000-0000-4000-8000-0000000000a1',
    '00000000-0000-4000-8000-000000000001',
    'Empresa E2E A1 (contraparte)',
    'Planta E2E A1',
    'manufacturera',
    'Calle E2E 1',
    'Parque E2E',
    '87000',
    'Ciudad Victoria',
    'COMAPA Victoria',
    23.7369,
    -99.1411,
    120,
    '2 turnos',
    'ton',
    'a1000000-0000-4000-8000-000000000003',
    'prospecto'
  ),
  (
    'b2000000-0000-4000-8000-0000000000a2',
    '00000000-0000-4000-8000-000000000001',
    'Empresa E2E A2 (sin contraparte)',
    'Planta E2E A2',
    'maquiladora',
    'Calle E2E 2',
    'Parque E2E',
    '87001',
    'Ciudad Victoria',
    'COMAPA Victoria',
    null,
    null,
    null,
    null,
    null,
    null,
    'prospecto'
  ),
  (
    'b2000000-0000-4000-8000-0000000000b1',
    '00000000-0000-4000-8000-000000000002',
    'Empresa E2E B1 (otro tenant)',
    'Planta E2E B1',
    'alimentos_bebidas',
    'Calle E2E B',
    'Parque E2E B',
    '87002',
    'Ciudad Victoria',
    'COMAPA Victoria',
    null,
    null,
    40,
    '1 turno',
    'litros',
    'a1000000-0000-4000-8000-000000000007',
    'activa'
  )
on conflict (id) do nothing;

commit;
