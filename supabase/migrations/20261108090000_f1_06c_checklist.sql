-- ============================================================================
-- F1-06c / task-115 — M3 checklist: TD-2, roles, documento↔ítem y auditoría DB.
--   * Retira checklist_write (FOR ALL) para que no abra DELETE/SELECT extra.
--   * Trigger de transición TD-2 por rol + ligadura documento↔diagnóstico.
--   * Auditoría DB solo para cambios de usuario autenticado (EF-03 con
--     service_role conserva su propia auditoría atómica).
-- Forward-only; docs/02 intacto.
-- ============================================================================

drop policy if exists checklist_write on public.document_checklist_items;

create or replace function public.trg_checklist_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_diag_org uuid;
  v_doc_org uuid;
  v_doc_diag uuid;
  v_doc_status text;
begin
  -- service_role / fixtures: la EF y los seeds ya validan su contrato.
  if auth.uid() is null then
    return new;
  end if;

  v_role := public.my_diagnostic_role(new.diagnostic_id);
  if v_role is null then
    raise exception 'checklist: el usuario no es miembro del diagnóstico.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if v_role not in ('coordinador','equipo') then
      raise exception 'checklist: solo coordinador/equipo crea ítems.' using errcode = '42501';
    end if;
    if new.estado <> 'no_recibido' then
      raise exception 'checklist: un ítem nuevo inicia en no_recibido.' using errcode = 'P0001';
    end if;
  elsif new.estado is distinct from old.estado then
    -- TD-2
    if old.estado = 'no_recibido' and new.estado = 'recibido' then
      if v_role = 'empresa' then
        if new.document_id is null then
          raise exception 'checklist: empresa debe adjuntar documento al recibir.' using errcode = 'P0001';
        end if;
      elsif v_role in ('coordinador','equipo') then
        if new.solicitud_nota is null or length(btrim(new.solicitud_nota)) = 0 then
          raise exception 'checklist: coordinador/equipo debe indicar solicitud_nota.' using errcode = 'P0001';
        end if;
      else
        raise exception 'checklist: rol no autorizado para recibir.' using errcode = '42501';
      end if;
    elsif old.estado = 'recibido' and new.estado = 'revisado' then
      if v_role not in ('coordinador','equipo') then
        raise exception 'checklist: solo coordinador/equipo revisa.' using errcode = '42501';
      end if;
    elsif old.estado = 'revisado' and new.estado = 'validado_r1' then
      if v_role <> 'coordinador' then
        raise exception 'checklist: solo coordinador valida R1.' using errcode = '42501';
      end if;
      if new.document_id is null then
        raise exception 'checklist: validado_r1 exige documento.' using errcode = 'P0001';
      end if;
    else
      raise exception 'checklist: transición TD-2 no permitida (% → %).', old.estado, new.estado
        using errcode = 'P0001';
    end if;
  else
    -- Cambios que no son transición: solo coordinador/equipo.
    if v_role not in ('coordinador','equipo') then
      raise exception 'checklist: solo coordinador/equipo modifica metadatos del ítem.' using errcode = '42501';
    end if;
  end if;

  if new.document_id is not null then
    select d.organization_id, d.diagnostic_id, d.upload_status
      into v_doc_org, v_doc_diag, v_doc_status
      from public.documents d where d.id = new.document_id;
    select d.organization_id into v_diag_org
      from public.diagnostics d where d.id = new.diagnostic_id;
    if v_doc_org is null or v_doc_org <> v_diag_org or v_doc_diag <> new.diagnostic_id
       or v_doc_status <> 'registered' then
      raise exception 'checklist: documento no pertenece al diagnóstico o no está registrado.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists checklist_transition on public.document_checklist_items;
create trigger checklist_transition
  before insert or update on public.document_checklist_items
  for each row execute function public.trg_checklist_transition();

create or replace function public.trg_checklist_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- La EF-03 usa service_role y audita en su RPC/transacción; aquí se cubren
  -- cambios directos de usuarios autenticados.
  if auth.uid() is not null then
    perform public.fn_audit_write(
      auth.uid(),
      case when tg_op = 'INSERT' then 'create' else 'update' end,
      'document_checklist_items',
      new.id::text,
      jsonb_build_object(
        'diagnostic_id', new.diagnostic_id,
        'item_code', new.item_code,
        'estado_anterior', case when tg_op = 'UPDATE' then old.estado else null end,
        'estado_nuevo', new.estado,
        'document_id', new.document_id
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists checklist_audit on public.document_checklist_items;
create trigger checklist_audit
  after insert or update on public.document_checklist_items
  for each row execute function public.trg_checklist_audit();

comment on function public.trg_checklist_transition() is
  'F1-06c: TD-2 por rol y ligadura documento↔diagnóstico para document_checklist_items.';
