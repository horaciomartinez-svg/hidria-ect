-- ============================================================================
-- F1-00 — Corrección forward-only del search_path de trg_audit_hash
-- El trigger llamaba digest()/encode() sin fijar search_path; al invocarse desde
-- fn_audit_write (search_path=public,pg_temp) la extensión pgcrypto no se
-- resolvía. Se fija el search_path al esquema de extensiones.
-- ============================================================================

create or replace function public.trg_audit_hash()
returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  p_hash text;
begin
  perform pg_advisory_xact_lock(20261108010100);

  select hash into p_hash from public.audit_log order by id desc limit 1;
  new.prev_hash := coalesce(p_hash, 'GENESIS');
  new.hash := encode(digest(new.prev_hash || new.ts::text || coalesce(new.user_id::text,'') ||
    new.action || new.entity || new.entity_id || coalesce(new.meta::text,''), 'sha256'), 'hex');
  return new;
end;
$$;

comment on function public.trg_audit_hash() is
  'F1-00/M-02: hash encadenado con advisory lock; search_path incluye extensions para pgcrypto.digest.';
