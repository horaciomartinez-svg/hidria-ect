-- ============================================================================
-- F1-07c / task-127 — RPC atómicas EF-04: submit y validate-r2 del CAT.
--   * UPDATE diagnostics.cat_estado + audit_log + api_idempotency en una tx.
--   * Completitud contra cat_items A1-v1/cat_responses; ficha R2 cerrada.
--   * SECURITY DEFINER service_role-only.
-- ============================================================================

create or replace function public.fn_submit_cat(
  p_user_id uuid,
  p_diagnostic_id uuid,
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
  v_role text;
  v_diag public.diagnostics%rowtype;
  v_pending jsonb;
  v_audit text;
  v_resp jsonb;
begin
  if p_user_id is null or p_diagnostic_id is null then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION_PARAMETRO_REQUERIDO', 'message', 'Parámetros incompletos.');
  end if;
  if v_key is not null then
    perform pg_advisory_xact_lock(hashtext('EF-04.submit:' || p_user_id::text || ':' || v_key));
    select * into v_existing from public.api_idempotency
     where user_id=p_user_id and endpoint='EF-04.submit' and key=v_key;
    if found then
      if v_existing.request_hash is distinct from coalesce(p_request_hash,'') then
        return jsonb_build_object('ok', false, 'code', 'CONFLICT_STATE', 'message', 'Idempotency-Key reutilizada con otro request.');
      end if;
      if v_existing.response_body is not null then
        return v_existing.response_body || jsonb_build_object('replayed', true);
      end if;
      return jsonb_build_object('ok', false, 'code', 'CONFLICT_STATE', 'message', 'Operación en curso.');
    end if;
  end if;
  v_role := public.fn_diag_role(p_user_id, p_diagnostic_id);
  if v_role is null or v_role not in ('empresa','coordinador','equipo') then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN_ROLE', 'message', 'Rol no autorizado para enviar el CAT.');
  end if;
  select * into v_diag from public.diagnostics where id=p_diagnostic_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN_NOT_MEMBER', 'message', 'Diagnóstico inexistente o fuera del tenant.');
  end if;
  if not exists (select 1 from public.profiles p where p.user_id=p_user_id and p.organization_id=v_diag.organization_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN_NOT_MEMBER', 'message', 'El usuario no pertenece al tenant del diagnóstico.');
  end if;
  if v_diag.cat_estado not in ('no_enviado','en_captura') then
    return jsonb_build_object('ok', false, 'code', 'CONFLICT_STATE', 'message', 'El CAT no está en captura.', 'details', jsonb_build_object('cat_estado', v_diag.cat_estado));
  end if;

  select coalesce(jsonb_agg(ci.codigo order by ci.orden), '[]'::jsonb) into v_pending
    from public.cat_items ci
    left join public.cat_responses cr
      on cr.item_id = ci.id and cr.diagnostic_id = p_diagnostic_id
   where ci.version = 'A1-v1'
     and (
       cr.item_id is null
       or (not cr.no_se and not cr.na and cr.valor is null)
       or (ci.admite_evidencia and cr.resuelta_en_campo and cr.document_id is null)
     );
  if jsonb_array_length(v_pending) > 0 then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION_CAT_INCOMPLETO',
      'message', 'Faltan respuestas obligatorias del CAT.',
      'details', jsonb_build_object('faltantes', v_pending));
  end if;

  update public.diagnostics set cat_estado='en_revision' where id=p_diagnostic_id;
  v_audit := public.fn_audit_write(p_user_id, 'update', 'diagnostics', p_diagnostic_id::text,
    jsonb_build_object('cat_estado_anterior', v_diag.cat_estado, 'cat_estado_nuevo', 'en_revision', 'idempotency_key', v_key));
  v_resp := jsonb_build_object('ok', true, 'replayed', false,
    'data', jsonb_build_object('diagnostic_id', p_diagnostic_id, 'cat_estado', 'en_revision', 'pendientes', 0),
    'audit_ref', 'audit:' || v_audit);
  if v_key is not null then
    insert into public.api_idempotency(user_id,endpoint,key,request_hash,status_code,response_body,response_ref,completed_at)
    values (p_user_id,'EF-04.submit',v_key,coalesce(p_request_hash,''),200,v_resp,'audit:'||v_audit,now());
  end if;
  return v_resp;
end;
$$;

create or replace function public.fn_validate_cat_r2(
  p_user_id uuid,
  p_diagnostic_id uuid,
  p_ficha_r2_id uuid,
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
  v_role text;
  v_diag public.diagnostics%rowtype;
  v_ficha uuid;
  v_audit text;
  v_resp jsonb;
begin
  if p_user_id is null or p_diagnostic_id is null or p_ficha_r2_id is null then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION_PARAMETRO_REQUERIDO', 'message', 'Parámetros incompletos.');
  end if;
  if v_key is not null then
    perform pg_advisory_xact_lock(hashtext('EF-04.validate:' || p_user_id::text || ':' || v_key));
    select * into v_existing from public.api_idempotency
     where user_id=p_user_id and endpoint='EF-04.validate' and key=v_key;
    if found then
      if v_existing.request_hash is distinct from coalesce(p_request_hash,'') then
        return jsonb_build_object('ok', false, 'code', 'CONFLICT_STATE', 'message', 'Idempotency-Key reutilizada con otro request.');
      end if;
      if v_existing.response_body is not null then
        return v_existing.response_body || jsonb_build_object('replayed', true);
      end if;
      return jsonb_build_object('ok', false, 'code', 'CONFLICT_STATE', 'message', 'Operación en curso.');
    end if;
  end if;
  v_role := public.fn_diag_role(p_user_id, p_diagnostic_id);
  if v_role is null or v_role not in ('coordinador','equipo') then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN_ROLE', 'message', 'Solo coordinador/equipo valida R2.');
  end if;
  select * into v_diag from public.diagnostics where id=p_diagnostic_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN_NOT_MEMBER', 'message', 'Diagnóstico inexistente o fuera del tenant.');
  end if;
  if not exists (select 1 from public.profiles p where p.user_id=p_user_id and p.organization_id=v_diag.organization_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN_NOT_MEMBER', 'message', 'El usuario no pertenece al tenant del diagnóstico.');
  end if;
  if v_diag.cat_estado <> 'en_revision' then
    return jsonb_build_object('ok', false, 'code', 'CONFLICT_STATE', 'message', 'El CAT no está en revisión.', 'details', jsonb_build_object('cat_estado', v_diag.cat_estado));
  end if;
  select le.id into v_ficha from public.logbook_entries le
   where le.id=p_ficha_r2_id and le.diagnostic_id=p_diagnostic_id
     and le.clave='R2' and le.estado='cerrada';
  if v_ficha is null then
    return jsonb_build_object('ok', false, 'code', 'GATE_R2_FICHA', 'message', 'Ficha R2 cerrada inexistente o de otro diagnóstico.');
  end if;
  if exists (select 1 from public.cat_responses where diagnostic_id=p_diagnostic_id and no_se)
     and not exists (select 1 from public.logbook_findings where entry_id=v_ficha) then
    return jsonb_build_object('ok', false, 'code', 'GATE_R2_FICHA', 'message', 'Las respuestas no_se requieren plan/hallazgo en la ficha R2.');
  end if;

  update public.diagnostics set cat_estado='validado_r2' where id=p_diagnostic_id;
  v_audit := public.fn_audit_write(p_user_id, 'approve', 'diagnostics', p_diagnostic_id::text,
    jsonb_build_object('cat_estado_anterior','en_revision','cat_estado_nuevo','validado_r2','ficha_r2_id',v_ficha,'idempotency_key',v_key));
  v_resp := jsonb_build_object('ok', true, 'replayed', false,
    'data', jsonb_build_object('diagnostic_id', p_diagnostic_id, 'cat_estado', 'validado_r2', 'pendientes', 0),
    'audit_ref', 'audit:' || v_audit);
  if v_key is not null then
    insert into public.api_idempotency(user_id,endpoint,key,request_hash,status_code,response_body,response_ref,completed_at)
    values (p_user_id,'EF-04.validate',v_key,coalesce(p_request_hash,''),200,v_resp,'audit:'||v_audit,now());
  end if;
  return v_resp;
end;
$$;

revoke all on function public.fn_submit_cat(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.fn_submit_cat(uuid,uuid,text,text) to service_role;
revoke all on function public.fn_validate_cat_r2(uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.fn_validate_cat_r2(uuid,uuid,uuid,text,text) to service_role;

comment on function public.fn_submit_cat(uuid,uuid,text,text) is
  'F1-07c/EF-04 submit: completitud A1-v1, UPDATE cat_estado+audit+idempotencia; service_role.';
comment on function public.fn_validate_cat_r2(uuid,uuid,uuid,text,text) is
  'F1-07c/EF-04 validate-r2: ficha R2 cerrada, UPDATE cat_estado+audit+idempotencia; service_role.';
