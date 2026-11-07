-- ============================================================================
-- ADDENDUM DE PRIVACIDAD — HIDRIA MD-OHI (ítem 5)
-- Ejecutar después de 02 y 03. Idempotente.
-- ============================================================================
create sequence if not exists public.privacy_folio_seq;
create table if not exists public.privacy_requests (
  id              uuid primary key default uuid_generate_v4(),
  folio           text not null unique default
                  ('ARCO-' || to_char(now(),'YYYY') || '-' ||
                   lpad(nextval('public.privacy_folio_seq')::text, 4, '0')),
  organization_id uuid not null references public.organizations(id),  -- siempre la org SRHDS
  derecho         text not null check (derecho in ('acceso','rectificacion','cancelacion','oposicion')),
  titular_nombre  text not null,
  titular_contacto text not null,          -- medio para notificaciones (art. 46 fr. I)
  descripcion     text,                    -- datos buscados (n/a en acceso) y correcciones
  documentos      jsonb not null default '[]'::jsonb,  -- acreditación (documents.id)
  estado          text not null default 'recibida' check (estado in
                  ('recibida','prevencion','en_analisis','respondida',
                   'hecha_efectiva','improcedente','cerrada')),
  medio           text not null default 'plataforma' check (medio in
                  ('plataforma','presencial','pnt','correo')),
  recibida_en     timestamptz not null default now(),
  vence_en        timestamptz not null default now() + interval '20 days',
  extension_dias  smallint check (extension_dias between 0 and 10),  -- art. 45
  respondida_en   timestamptz,
  efectiva_en     timestamptz,             -- +15 días post respuesta (art. 45)
  respuesta       text,
  comite_resolucion_id uuid,               -- documento del Comité cuando inexistencia
  created_by      uuid references public.profiles(user_id),
  updated_at      timestamptz not null default now()
);
alter table public.privacy_requests enable row level security;
drop policy if exists privacy_tenant on public.privacy_requests;
create policy privacy_tenant on public.privacy_requests for all
  using (public.is_tenant_member(organization_id))
  with check (public.is_tenant_member(organization_id));
-- Regla de negocio: extensión única (art. 45) — trigger
create or replace function public.trg_privacy_extension_once()
returns trigger language plpgsql as $$
begin
  if new.extension_dias is distinct from old.extension_dias and old.extension_dias is not null then
    raise exception 'ARCO: la extension del plazo es unica (art. 45).';
  end if;
  if new.extension_dias is not null then
    new.vence_en := old.vence_en + make_interval(days => new.extension_dias);
  end if;
  return new;
end; $$;
drop trigger if exists privacy_extension_once on public.privacy_requests;
create trigger privacy_extension_once before update on public.privacy_requests
for each row when (new.extension_dias is distinct from old.extension_dias)
execute function public.trg_privacy_extension_once();
