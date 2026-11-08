-- ============================================================================
-- F1-00 / M-01 — Idempotencia de operaciones (API-00, OFF-02, OFF-04)
-- Forward-only e idempotente. No edita migraciones aplicadas.
-- Tabla privada: solo `service_role` (EF) y owner. Sin políticas para
-- `anon`/`authenticated`: RLS deniega por defecto.
-- ============================================================================

create table if not exists public.api_idempotency (
  id            bigint generated always as identity primary key,
  user_id       uuid        not null,
  endpoint      text        not null,
  key           text        not null,
  request_hash  text        not null,
  status_code   smallint    check (status_code between 100 and 599),
  response_body jsonb,
  response_ref  text,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz,
  expires_at    timestamptz not null default (now() + interval '7 days'),
  constraint api_idempotency_user_endpoint_key_key unique (user_id, endpoint, key)
);

create index if not exists idx_api_idempotency_expires
  on public.api_idempotency (expires_at);

create index if not exists idx_api_idempotency_user
  on public.api_idempotency (user_id, created_at desc);

comment on table public.api_idempotency is
  'F1-00/M-01: claim/replay de Idempotency-Key por usuario+endpoint. Solo service_role; RLS sin políticas para authenticated/anon.';

alter table public.api_idempotency enable row level security;

-- Superficie mínima: la EF usa service_role (bypass RLS) y es la única que
-- puede reclamar/completar filas. Se re-revoca en la migración de grants.
revoke all on public.api_idempotency from anon, authenticated;
grant select, insert, update, delete on public.api_idempotency to service_role;
