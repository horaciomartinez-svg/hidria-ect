-- ============================================================================
-- F1-00 / M-05 — Realtime: publicación de tablas y autorización de canales
--   * Añade a `supabase_realtime` las tablas con eventos de docs/04 §7.
--   * Políticas RLS sobre `realtime.messages` para canales PRIVADOS:
--       diagnostic:{uuid}  -> miembro del diagnóstico
--       org:{uuid}         -> miembro del tenant
--       user:{uuid}        -> el propio usuario
--   * No se hace ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY:
--     ya está habilitada y el ALTER falla por ownership (ver docs Supabase).
-- Forward-only e idempotente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- M-05.1  Publicación Realtime (owner de la publicación: postgres).
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'notifications',
    'diagnostics',
    'document_checklist_items',
    'samples',
    'logbook_entries'
  ]
  loop
    if not exists (
      select 1
        from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

comment on publication supabase_realtime is
  'HIDRIA F1-00/M-05: tablas publicadas para postgres_changes (notifications y senales de expediente).';

-- ---------------------------------------------------------------------------
-- M-05.2  Políticas de canales privados en realtime.messages.
--         Las políticas se pueden crear como postgres aunque la tabla sea de
--         supabase_realtime_admin (supautils lo permite); NO se toca ENABLE RLS.
-- ---------------------------------------------------------------------------
drop policy if exists hidria_rt_diagnostic_read on realtime.messages;
create policy hidria_rt_diagnostic_read on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension in ('broadcast')
    and realtime.topic() like 'diagnostic:%'
    and public.is_diagnostic_member(
      case
        when pg_input_is_valid(split_part(realtime.topic(), ':', 2), 'uuid')
          then (split_part(realtime.topic(), ':', 2))::uuid
      end
    )
  );

drop policy if exists hidria_rt_org_read on realtime.messages;
create policy hidria_rt_org_read on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension in ('broadcast')
    and realtime.topic() like 'org:%'
    and public.is_tenant_member(
      case
        when pg_input_is_valid(split_part(realtime.topic(), ':', 2), 'uuid')
          then (split_part(realtime.topic(), ':', 2))::uuid
      end
    )
  );

drop policy if exists hidria_rt_user_read on realtime.messages;
create policy hidria_rt_user_read on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension in ('broadcast')
    and realtime.topic() like 'user:%'
    and case
          when pg_input_is_valid(split_part(realtime.topic(), ':', 2), 'uuid')
            then (split_part(realtime.topic(), ':', 2))::uuid
        end = auth.uid()
  );

comment on policy hidria_rt_diagnostic_read on realtime.messages is
  'HIDRIA M-05: solo miembros del diagnóstico reciben el canal diagnostic:{id}.';
comment on policy hidria_rt_org_read on realtime.messages is
  'HIDRIA M-05: solo miembros del tenant reciben el canal org:{id}.';
comment on policy hidria_rt_user_read on realtime.messages is
  'HIDRIA M-05: solo el titular recibe el canal user:{id}.';
