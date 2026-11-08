-- ============================================================================
-- F1-00 / M-02 — Auditoría encadenada robusta (SEC-06, R-11)
--   * fn_audit_write con advisory lock (misma transacción de negocio)
--   * unique parcial de prev_hash (anti-bifurcación)
--   * enum de action ampliado con reject/error
--   * índice parcial de idempotency_key para forense
-- F1-00 / M-03 — Folio de reporte {folio}-R1/-R2 y revisión
--   * tabla report_emissions + trigger server-side (nunca lo compone el cliente)
-- Forward-only e idempotente. No edita la migración base.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- M-02.1  Ampliar el CHECK de audit_log.action (docs/04 §2.4: rechazos también
--         se auditan). Forward-only: se recrea la restricción.
-- ---------------------------------------------------------------------------
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log
  add constraint audit_log_action_check check (action in (
    'create','update','delete','view','download','approve','sign','move_phase',
    'reject','error'
  ));

-- ---------------------------------------------------------------------------
-- M-02.2  Trigger de hash con serialización por advisory lock.
--         Mantiene la fórmula de hash vigente (compatibilidad de cadena).
-- ---------------------------------------------------------------------------
create or replace function public.trg_audit_hash()
returns trigger
language plpgsql
as $$
declare
  p_hash text;
begin
  -- Serializa la lectura del último hash y la inserción de la fila.
  -- El lock se libera al terminar la transacción (xact lock).
  perform pg_advisory_xact_lock(20261108010100);

  select hash into p_hash from public.audit_log order by id desc limit 1;
  new.prev_hash := coalesce(p_hash, 'GENESIS');
  new.hash := encode(digest(new.prev_hash || new.ts::text || coalesce(new.user_id::text,'') ||
    new.action || new.entity || new.entity_id || coalesce(new.meta::text,''), 'sha256'), 'hex');
  return new;
end;
$$;

-- Guarda de integridad: un prev_hash no puede repetirse (salvo GENESIS).
create unique index if not exists audit_log_prev_hash_uniq
  on public.audit_log (prev_hash)
  where prev_hash is not null and prev_hash <> 'GENESIS';

-- Índice forense para localizar el registro de una Idempotency-Key.
create index if not exists audit_log_idempotency_key_idx
  on public.audit_log ((meta ->> 'idempotency_key'))
  where meta ? 'idempotency_key';

-- ---------------------------------------------------------------------------
-- M-02.3  fn_audit_write: primitiva server-side para las Edge Functions.
--         Escribe en la MISMA transacción y devuelve el hash (ref "audit:<hash>").
-- ---------------------------------------------------------------------------
create or replace function public.fn_audit_write(
  p_user     uuid,
  p_action   text,
  p_entity   text,
  p_entity_id text,
  p_meta     jsonb default '{}'::jsonb
)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_hash text;
begin
  perform pg_advisory_xact_lock(20261108010100);
  insert into public.audit_log (user_id, action, entity, entity_id, meta)
  values (p_user, p_action, p_entity, p_entity_id, coalesce(p_meta, '{}'::jsonb))
  returning hash into v_hash;
  return v_hash;
end;
$$;

revoke all on function public.fn_audit_write(uuid, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.fn_audit_write(uuid, text, text, text, jsonb)
  to service_role;

comment on function public.fn_audit_write(uuid, text, text, text, jsonb) is
  'F1-00/M-02: inserta audit_log en la transacción de negocio (advisory lock + hash encadenado) y devuelve el hash. Solo service_role.';

-- ---------------------------------------------------------------------------
-- M-03.1  Persistencia del folio de reporte y su revisión (-R1, -R2, ...).
-- ---------------------------------------------------------------------------
create table if not exists public.report_emissions (
  id            uuid primary key default uuid_generate_v4(),
  diagnostic_id uuid not null references public.diagnostics(id) on delete cascade,
  revision      smallint not null check (revision between 1 and 99),
  folio         text not null unique,
  document_id   uuid references public.documents(id) on delete set null,
  matriz        jsonb not null default '[]'::jsonb
                check (jsonb_typeof(matriz) = 'array'),
  emitido_por   uuid references public.profiles(user_id) on delete set null,
  emitido_en    timestamptz not null default now(),
  constraint report_emissions_diagnostic_revision_key unique (diagnostic_id, revision)
);

create index if not exists idx_report_emissions_diagnostic
  on public.report_emissions (diagnostic_id, revision desc);

comment on table public.report_emissions is
  'F1-00/M-03: emisiones del Reporte de Diagnóstico. Folio {diagnostics.folio}-R{revision}; la revisión y el folio los asigna el trigger, nunca el cliente.';

-- ---------------------------------------------------------------------------
-- M-03.2  Trigger de folio: bloquea el diagnóstico y calcula la siguiente
--         revisión. Ignora folio/revision enviados por el cliente.
-- ---------------------------------------------------------------------------
create or replace function public.trg_report_emission_folio()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_folio text;
  v_rev   smallint;
begin
  select d.folio into v_folio
    from public.diagnostics d
   where d.id = new.diagnostic_id
   for update;

  if v_folio is null then
    raise exception 'Reporte: el diagnostico % no existe.', new.diagnostic_id;
  end if;

  select coalesce(max(revision), 0) + 1 into v_rev
    from public.report_emissions
   where diagnostic_id = new.diagnostic_id;

  if v_rev > 99 then
    raise exception 'Reporte: limite de revisiones (99) alcanzado para el diagnostico %.', new.diagnostic_id;
  end if;

  new.revision := v_rev;
  new.folio    := v_folio || '-R' || v_rev::text;
  return new;
end;
$$;

drop trigger if exists report_emission_folio on public.report_emissions;
create trigger report_emission_folio
  before insert on public.report_emissions
  for each row execute function public.trg_report_emission_folio();

alter table public.report_emissions enable row level security;

drop policy if exists report_emissions_sel on public.report_emissions;
create policy report_emissions_sel on public.report_emissions
  for select to authenticated
  using (public.is_diagnostic_member(diagnostic_id));

-- Solo lectura para authenticated; escritura exclusiva de service_role (EF-07).
revoke all on public.report_emissions from anon, authenticated;
grant select on public.report_emissions to authenticated;
grant select, insert, update, delete on public.report_emissions to service_role;
