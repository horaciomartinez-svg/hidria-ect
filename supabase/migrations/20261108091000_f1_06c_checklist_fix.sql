-- ============================================================================
-- F1-06c fix forward-only 091000 (task-115 · #54)
--   * SEC-PR54-01/VETO: rechaza cambio de diagnostic_id en UPDATE (cross-tenant).
--   * SEC-PR54-02: REVOKE EXECUTE de las funciones de trigger.
--   * B3: validado_r1 exige ficha R1 (abierta/cerrada) de la semana en curso.
--   * M1: validado_r1 es terminal (mensaje CONFLICT_STATE) y solo coordinador.
--   * M2: auditoría DB con action='approve' al entrar a validado_r1.
--   * B4: fn_transition_checklist_item (RPC atómica EF-03, service_role-only).
-- Forward-only. docs/02 intacto.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- M1/B3 — Trigger TD-2 (autoridad final para UPDATE directo autenticado)
-- ---------------------------------------------------------------------------
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
  v_ficha_ok boolean;
begin
  -- SEC-PR54-01: la pertenencia al diagnóstico es inmutable, incluso para
  -- service_role/owner (se valida antes del bypass de auth.uid()).
  if tg_op = 'UPDATE' and new.diagnostic_id is distinct from old.diagnostic_id then
    raise exception 'checklist: diagnostic_id es inmutable (cross-tenant bloqueado).'
      using errcode = '42501';
  end if;

  -- service_role / fixtures: la EF y los seeds validan su contrato.
  if auth.uid() is null then
    return new;
  end if;

  v_role := public.my_diagnostic_role(new.diagnostic_id);
  if v_role is null then
    raise exception 'checklist: el usuario no es miembro del diagnóstico.'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if v_role not in ('coordinador','equipo') then
      raise exception 'checklist: solo coordinador/equipo crea ítems.'
        using errcode = '42501';
    end if;
    if new.estado <> 'no_recibido' then
      raise exception 'checklist: un ítem nuevo inicia en no_recibido.'
        using errcode = 'P0001';
    end if;
  elsif new.estado is distinct from old.estado then
    if old.estado = 'validado_r1' then
      -- M1: terminal explícito (la EF/RPC lo mapea a CONFLICT_STATE 409).
      raise exception 'checklist: validado_r1 es terminal (CONFLICT_STATE).'
        using errcode = 'P0001';
    elsif old.estado = 'no_recibido' and new.estado = 'recibido' then
      if v_role = 'empresa' then
        if new.document_id is null then
          raise exception 'checklist: empresa debe adjuntar documento al recibir.'
            using errcode = 'P0001';
        end if;
      elsif v_role in ('coordinador','equipo') then
        if new.solicitud_nota is null
           or length(btrim(new.solicitud_nota)) = 0 then
          raise exception 'checklist: coordinador/equipo debe indicar solicitud_nota.'
            using errcode = 'P0001';
        end if;
      else
        raise exception 'checklist: rol no autorizado para recibir.'
          using errcode = '42501';
      end if;
    elsif old.estado = 'recibido' and new.estado = 'revisado' then
      if v_role not in ('coordinador','equipo') then
        raise exception 'checklist: solo coordinador/equipo revisa.'
          using errcode = '42501';
      end if;
    elsif old.estado = 'revisado' and new.estado = 'validado_r1' then
      if v_role <> 'coordinador' then
        raise exception 'checklist: solo coordinador valida R1.'
          using errcode = '42501';
      end if;
      if new.document_id is null then
        raise exception 'checklist: validado_r1 exige documento.'
          using errcode = 'P0001';
      end if;
      -- B3 (TD-2 #3): ficha R1 abierta/cerrada de la semana en curso.
      select exists (
        select 1
          from public.logbook_entries l
         where l.diagnostic_id = new.diagnostic_id
           and l.clave = 'R1'
           and l.estado in ('abierta','cerrada')
           and l.fecha >= date_trunc('week', current_date)::date
           and l.fecha < (date_trunc('week', current_date)
                          + interval '7 days')::date
      ) into v_ficha_ok;
      if not v_ficha_ok then
        raise exception 'checklist: validado_r1 exige ficha R1 de la semana.'
          using errcode = 'P0001';
      end if;
    else
      raise exception 'checklist: transición TD-2 no permitida (% → %).',
        old.estado, new.estado using errcode = 'P0001';
    end if;
  else
    if v_role not in ('coordinador','equipo') then
      raise exception 'checklist: solo coordinador/equipo modifica metadatos del ítem.'
        using errcode = '42501';
    end if;
  end if;

  if new.document_id is not null then
    select d.organization_id, d.diagnostic_id, d.upload_status
      into v_doc_org, v_doc_diag, v_doc_status
      from public.documents d where d.id = new.document_id;
    select d.organization_id into v_diag_org
      from public.diagnostics d where d.id = new.diagnostic_id;
    if v_doc_org is null or v_doc_org <> v_diag_org
       or v_doc_diag <> new.diagnostic_id
       or v_doc_status <> 'registered' then
      raise exception 'checklist: documento no pertenece al diagnóstico o no está registrado.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- M2 — Auditoría DB: approve al validar R1 (update en el resto)
-- ---------------------------------------------------------------------------
create or replace function public.trg_checklist_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text;
begin
  if auth.uid() is not null then
    v_action := case
      when tg_op = 'INSERT' then 'create'
      when new.estado = 'validado_r1'
           and (tg_op = 'INSERT' or old.estado is distinct from 'validado_r1')
        then 'approve'
      else 'update'
    end;
    perform public.fn_audit_write(
      auth.uid(),
      v_action,
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

-- SEC-PR54-02: las funciones de trigger no son invocables por API.
revoke all on function public.trg_checklist_transition()
  from public, anon, authenticated;
revoke all on function public.trg_checklist_audit()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- B4 — RPC atómica de transición EF-03 (SECURITY DEFINER, service_role-only)
-- ---------------------------------------------------------------------------
create or replace function public.fn_transition_checklist_item(
  p_user_id uuid,
  p_item_id uuid,
  p_to text,
  p_document_id uuid default null,
  p_solicitud_nota text default null,
  p_idempotency_key text default null,
  p_request_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text := nullif(p_idempotency_key, '');
  v_existing public.api_idempotency%rowtype;
  v_item public.document_checklist_items%rowtype;
  v_diag_org uuid;
  v_doc_org uuid;
  v_doc_diag uuid;
  v_doc_status text;
  v_role text;
  v_doc uuid;
  v_audit text;
  v_resp jsonb;
  v_action text;
  v_ficha_ok boolean;
begin
  if p_user_id is null or p_item_id is null or p_to is null then
    return jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_PARAMETRO_REQUERIDO',
      'message', 'Parámetros incompletos.');
  end if;

  -- Idempotencia: claim/replay atómico (misma transacción que el UPDATE).
  if v_key is not null then
    perform pg_advisory_xact_lock(
      hashtext('EF-03.transition:' || p_user_id::text || ':' || v_key));
    select * into v_existing from public.api_idempotency
     where user_id = p_user_id and endpoint = 'EF-03.transition' and key = v_key;
    if found then
      if v_existing.request_hash is distinct from coalesce(p_request_hash, '') then
        return jsonb_build_object(
          'ok', false, 'code', 'CONFLICT_STATE',
          'message', 'Idempotency-Key reutilizada con otro request.');
      end if;
      if v_existing.response_body is not null then
        return v_existing.response_body || jsonb_build_object('replayed', true);
      end if;
      return jsonb_build_object(
        'ok', false, 'code', 'CONFLICT_STATE',
        'message', 'Operación en curso.');
    end if;
  end if;

  select * into v_item from public.document_checklist_items
   where id = p_item_id for update;
  if not found then
    return jsonb_build_object(
      'ok', false, 'code', 'FORBIDDEN_NOT_MEMBER',
      'message', 'Ítem inexistente o fuera del tenant.');
  end if;
  select d.organization_id into v_diag_org
    from public.diagnostics d where d.id = v_item.diagnostic_id;
  if not exists (
    select 1 from public.profiles p
     where p.user_id = p_user_id and p.organization_id = v_diag_org
  ) then
    return jsonb_build_object(
      'ok', false, 'code', 'FORBIDDEN_NOT_MEMBER',
      'message', 'El usuario no pertenece al tenant del diagnóstico.');
  end if;
  v_role := public.fn_diag_role(p_user_id, v_item.diagnostic_id);
  if v_role is null then
    return jsonb_build_object(
      'ok', false, 'code', 'FORBIDDEN_NOT_MEMBER',
      'message', 'El usuario no es miembro del diagnóstico.');
  end if;

  if p_to not in ('recibido','revisado','validado_r1') then
    return jsonb_build_object(
      'ok', false, 'code', 'CONFLICT_STATE',
      'message', 'Estado destino inválido.',
      'details', jsonb_build_object('estado_actual', v_item.estado));
  end if;
  if v_item.estado = 'validado_r1' then
    -- M1: terminal → CONFLICT_STATE (no P0001 genérico).
    return jsonb_build_object(
      'ok', false, 'code', 'CONFLICT_STATE',
      'message', 'validado_r1 es terminal.',
      'details', jsonb_build_object('estado_actual', v_item.estado));
  end if;

  if p_to = 'recibido' and v_item.estado = 'no_recibido' then
    if v_role = 'empresa' then
      if coalesce(p_document_id, v_item.document_id) is null then
        return jsonb_build_object(
          'ok', false, 'code', 'CONFLICT_STATE',
          'message', 'Empresa debe adjuntar documento.');
      end if;
    elsif v_role in ('coordinador','equipo') then
      if p_solicitud_nota is null
         or length(btrim(p_solicitud_nota)) = 0 then
        return jsonb_build_object(
          'ok', false, 'code', 'CONFLICT_STATE',
          'message', 'Coordinador/equipo debe indicar solicitud_nota.');
      end if;
    else
      return jsonb_build_object(
        'ok', false, 'code', 'FORBIDDEN_ROLE',
        'message', 'Rol no autorizado para recibir.');
    end if;
  elsif p_to = 'revisado' and v_item.estado = 'recibido' then
    if v_role not in ('coordinador','equipo') then
      return jsonb_build_object(
        'ok', false, 'code', 'FORBIDDEN_ROLE',
        'message', 'Solo coordinador/equipo revisa.');
    end if;
  elsif p_to = 'validado_r1' and v_item.estado = 'revisado' then
    if v_role <> 'coordinador' then
      return jsonb_build_object(
        'ok', false, 'code', 'FORBIDDEN_ROLE',
        'message', 'Solo coordinador valida R1.');
    end if;
    if coalesce(p_document_id, v_item.document_id) is null then
      return jsonb_build_object(
        'ok', false, 'code', 'CONFLICT_STATE',
        'message', 'validado_r1 exige documento.');
    end if;
    -- B3 (TD-2 #3): ficha R1 abierta/cerrada de la semana en curso.
    select exists (
      select 1
        from public.logbook_entries l
       where l.diagnostic_id = v_item.diagnostic_id
         and l.clave = 'R1'
         and l.estado in ('abierta','cerrada')
         and l.fecha >= date_trunc('week', current_date)::date
         and l.fecha < (date_trunc('week', current_date)
                        + interval '7 days')::date
    ) into v_ficha_ok;
    if not v_ficha_ok then
      return jsonb_build_object(
        'ok', false, 'code', 'CONFLICT_STATE',
        'message', 'validado_r1 exige ficha R1 de la semana.');
    end if;
  else
    return jsonb_build_object(
      'ok', false, 'code', 'CONFLICT_STATE',
      'message', 'Transición TD-2 no permitida.',
      'details', jsonb_build_object('estado_actual', v_item.estado));
  end if;

  v_doc := coalesce(p_document_id, v_item.document_id);
  if v_doc is not null then
    select d.organization_id, d.diagnostic_id, d.upload_status
      into v_doc_org, v_doc_diag, v_doc_status
      from public.documents d where d.id = v_doc;
    if v_doc_org is null or v_doc_org <> v_diag_org
       or v_doc_diag <> v_item.diagnostic_id
       or v_doc_status <> 'registered' then
      return jsonb_build_object(
        'ok', false, 'code', 'CONFLICT_STATE',
        'message', 'Documento no pertenece al diagnóstico o no está registrado.');
    end if;
  end if;

  update public.document_checklist_items
     set estado = p_to,
         document_id = coalesce(p_document_id, document_id),
         solicitud_nota = coalesce(p_solicitud_nota, solicitud_nota)
   where id = p_item_id;

  v_action := case when p_to = 'validado_r1' then 'approve' else 'update' end;
  v_audit := public.fn_audit_write(
    p_user_id, v_action, 'document_checklist_items', p_item_id::text,
    jsonb_build_object(
      'item_id', p_item_id, 'item_code', v_item.item_code,
      'estado_anterior', v_item.estado, 'estado_nuevo', p_to,
      'document_id', v_doc, 'idempotency_key', v_key));
  v_resp := jsonb_build_object(
    'ok', true, 'replayed', false,
    'data', jsonb_build_object(
      'item_id', p_item_id, 'item_code', v_item.item_code,
      'estado', p_to, 'document_id', v_doc),
    'audit_ref', 'audit:' || v_audit);
  if v_key is not null then
    insert into public.api_idempotency
      (user_id, endpoint, key, request_hash, status_code, response_body,
       response_ref, completed_at)
    values
      (p_user_id, 'EF-03.transition', v_key, coalesce(p_request_hash, ''),
       200, v_resp, 'audit:' || v_audit, now());
  end if;
  return v_resp;
end;
$$;

revoke all on function public.fn_transition_checklist_item(
  uuid, uuid, text, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.fn_transition_checklist_item(
  uuid, uuid, text, uuid, text, text, text)
  to service_role;

comment on function public.fn_transition_checklist_item(
  uuid, uuid, text, uuid, text, text, text) is
  'F1-06c/EF-03: transición TD-2 atómica (rol/tenant/documento/ficha R1/audit/idempotencia); service_role-only.';
