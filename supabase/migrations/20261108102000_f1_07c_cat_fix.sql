-- ============================================================================
-- F1-07c fix 102000 — SEC-PR58-01 + M2 RPC state + validaciones M1.
--   * cat_responses: diagnostic_id/item_id/created_by inmutables en UPDATE.
--   * multiple: no vacío y sin duplicados.
--   * fn_submit_cat/fn_validate_cat_r2: diagnóstico activo y fase 1..3.
-- Forward-only; docs/02 intacto.
-- ============================================================================

create or replace function public.trg_cat_response_validate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.cat_items%rowtype;
  v_diag_org uuid;
  v_doc_org uuid;
  v_doc_diag uuid;
  v_doc_status text;
  v_kind text;
  v_elem text;
begin
  if tg_op = 'UPDATE' then
    if new.diagnostic_id is distinct from old.diagnostic_id
       or new.item_id is distinct from old.item_id then
      raise exception 'CAT: diagnostic_id/item_id son inmutables.' using errcode = '42501';
    end if;
    if new.created_by is distinct from old.created_by then
      raise exception 'CAT: created_by es inmutable.' using errcode = '42501';
    end if;
  end if;

  select * into v_item from public.cat_items where id = new.item_id;
  if not found then
    raise exception 'CAT: el ítem no existe.' using errcode = '42501';
  end if;
  select d.organization_id into v_diag_org from public.diagnostics d where d.id = new.diagnostic_id;
  if v_diag_org is null then
    raise exception 'CAT: diagnóstico inexistente.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and auth.uid() is not null then
    new.created_by := auth.uid();
  end if;

  if new.no_se and new.na then
    raise exception 'CAT: no_se y na son excluyentes.' using errcode = '23514';
  end if;

  if not (new.no_se or new.na) then
    if new.valor is null then
      raise exception 'CAT: valor obligatorio salvo no_se/na.' using errcode = '23514';
    end if;
    v_kind := jsonb_typeof(new.valor);
    if v_item.tipo = 'opcion_unica' then
      if v_kind <> 'string' or not exists (
        select 1 from jsonb_array_elements_text(coalesce(v_item.opciones, '[]'::jsonb)) o
         where o = new.valor #>> '{}'
      ) then
        raise exception 'CAT: opción no válida para el ítem.' using errcode = '23514';
      end if;
    elsif v_item.tipo = 'multiple' then
      if v_kind <> 'array' then
        raise exception 'CAT: multiple requiere un arreglo.' using errcode = '23514';
      end if;
      if jsonb_array_length(new.valor) = 0 then
        raise exception 'CAT: multiple no puede estar vacío.' using errcode = '23514';
      end if;
      if (select count(*) from jsonb_array_elements_text(new.valor))
         <> (select count(distinct e) from jsonb_array_elements_text(new.valor) e) then
        raise exception 'CAT: multiple contiene duplicados.' using errcode = '23514';
      end if;
      for v_elem in select jsonb_array_elements_text(new.valor) loop
        if not exists (
          select 1 from jsonb_array_elements_text(coalesce(v_item.opciones, '[]'::jsonb)) o
           where o = v_elem
        ) then
          raise exception 'CAT: opción múltiple no válida.' using errcode = '23514';
        end if;
      end loop;
    else
      if v_kind <> 'string' or length(btrim(new.valor #>> '{}')) = 0 then
        raise exception 'CAT: respuesta abierta/breve inválida.' using errcode = '23514';
      end if;
    end if;
  end if;

  if new.document_id is not null then
    select d.organization_id, d.diagnostic_id, d.upload_status
      into v_doc_org, v_doc_diag, v_doc_status
      from public.documents d where d.id = new.document_id;
    if v_doc_org is null or v_doc_org <> v_diag_org or v_doc_diag <> new.diagnostic_id
       or v_doc_status <> 'registered' then
      raise exception 'CAT: documento no pertenece al diagnóstico o no está registrado.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.trg_cat_response_validate() from public, anon, authenticated;

create or replace function public.fn_submit_cat(
  p_user_id uuid, p_diagnostic_id uuid,
  p_idempotency_key text default null, p_request_hash text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_key text := nullif(p_idempotency_key,''); v_existing public.api_idempotency%rowtype;
  v_role text; v_diag public.diagnostics%rowtype; v_pending jsonb; v_audit text; v_resp jsonb;
begin
  if p_user_id is null or p_diagnostic_id is null then return jsonb_build_object('ok',false,'code','VALIDATION_PARAMETRO_REQUERIDO','message','Parámetros incompletos.'); end if;
  if v_key is not null then
    perform pg_advisory_xact_lock(hashtext('EF-04.submit:'||p_user_id::text||':'||v_key));
    select * into v_existing from public.api_idempotency where user_id=p_user_id and endpoint='EF-04.submit' and key=v_key;
    if found then
      if v_existing.request_hash is distinct from coalesce(p_request_hash,'') then return jsonb_build_object('ok',false,'code','CONFLICT_STATE','message','Idempotency-Key reutilizada con otro request.'); end if;
      if v_existing.response_body is not null then return v_existing.response_body || jsonb_build_object('replayed',true); end if;
      return jsonb_build_object('ok',false,'code','CONFLICT_STATE','message','Operación en curso.');
    end if;
  end if;
  v_role := public.fn_diag_role(p_user_id,p_diagnostic_id);
  if v_role is null or v_role not in ('empresa','coordinador','equipo') then return jsonb_build_object('ok',false,'code','FORBIDDEN_ROLE','message','Rol no autorizado para enviar el CAT.'); end if;
  select * into v_diag from public.diagnostics where id=p_diagnostic_id for update;
  if not found then return jsonb_build_object('ok',false,'code','FORBIDDEN_NOT_MEMBER','message','Diagnóstico inexistente o fuera del tenant.'); end if;
  if not exists (select 1 from public.profiles p where p.user_id=p_user_id and p.organization_id=v_diag.organization_id) then return jsonb_build_object('ok',false,'code','FORBIDDEN_NOT_MEMBER','message','El usuario no pertenece al tenant del diagnóstico.'); end if;
  if v_diag.estado <> 'activo' or v_diag.fase_actual not between 1 and 3 then
    return jsonb_build_object('ok',false,'code','CONFLICT_STATE','message','El diagnóstico no está activo/fase válida para el CAT.','details',jsonb_build_object('estado_actual',v_diag.estado,'fase_actual',v_diag.fase_actual));
  end if;
  if v_diag.cat_estado not in ('no_enviado','en_captura') then return jsonb_build_object('ok',false,'code','CONFLICT_STATE','message','El CAT no está en captura.','details',jsonb_build_object('cat_estado',v_diag.cat_estado)); end if;
  select coalesce(jsonb_agg(ci.codigo order by ci.orden),'[]'::jsonb) into v_pending
    from public.cat_items ci left join public.cat_responses cr on cr.item_id=ci.id and cr.diagnostic_id=p_diagnostic_id
   where ci.version='A1-v1' and (cr.item_id is null or (not cr.no_se and not cr.na and cr.valor is null) or (ci.admite_evidencia and cr.resuelta_en_campo and cr.document_id is null));
  if jsonb_array_length(v_pending)>0 then return jsonb_build_object('ok',false,'code','VALIDATION_CAT_INCOMPLETO','message','Faltan respuestas obligatorias del CAT.','details',jsonb_build_object('faltantes',v_pending)); end if;
  update public.diagnostics set cat_estado='en_revision' where id=p_diagnostic_id;
  v_audit := public.fn_audit_write(p_user_id,'update','diagnostics',p_diagnostic_id::text,jsonb_build_object('cat_estado_anterior',v_diag.cat_estado,'cat_estado_nuevo','en_revision','idempotency_key',v_key));
  v_resp := jsonb_build_object('ok',true,'replayed',false,'data',jsonb_build_object('diagnostic_id',p_diagnostic_id,'cat_estado','en_revision','pendientes',0),'audit_ref','audit:'||v_audit);
  if v_key is not null then insert into public.api_idempotency(user_id,endpoint,key,request_hash,status_code,response_body,response_ref,completed_at) values (p_user_id,'EF-04.submit',v_key,coalesce(p_request_hash,''),200,v_resp,'audit:'||v_audit,now()); end if;
  return v_resp;
end; $$;

create or replace function public.fn_validate_cat_r2(
  p_user_id uuid, p_diagnostic_id uuid, p_ficha_r2_id uuid,
  p_idempotency_key text default null, p_request_hash text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_key text := nullif(p_idempotency_key,''); v_existing public.api_idempotency%rowtype;
  v_role text; v_diag public.diagnostics%rowtype; v_ficha uuid; v_audit text; v_resp jsonb;
begin
  if p_user_id is null or p_diagnostic_id is null or p_ficha_r2_id is null then return jsonb_build_object('ok',false,'code','VALIDATION_PARAMETRO_REQUERIDO','message','Parámetros incompletos.'); end if;
  if v_key is not null then
    perform pg_advisory_xact_lock(hashtext('EF-04.validate:'||p_user_id::text||':'||v_key));
    select * into v_existing from public.api_idempotency where user_id=p_user_id and endpoint='EF-04.validate' and key=v_key;
    if found then
      if v_existing.request_hash is distinct from coalesce(p_request_hash,'') then return jsonb_build_object('ok',false,'code','CONFLICT_STATE','message','Idempotency-Key reutilizada con otro request.'); end if;
      if v_existing.response_body is not null then return v_existing.response_body || jsonb_build_object('replayed',true); end if;
      return jsonb_build_object('ok',false,'code','CONFLICT_STATE','message','Operación en curso.');
    end if;
  end if;
  v_role := public.fn_diag_role(p_user_id,p_diagnostic_id);
  if v_role is null or v_role not in ('coordinador','equipo') then return jsonb_build_object('ok',false,'code','FORBIDDEN_ROLE','message','Solo coordinador/equipo valida R2.'); end if;
  select * into v_diag from public.diagnostics where id=p_diagnostic_id for update;
  if not found then return jsonb_build_object('ok',false,'code','FORBIDDEN_NOT_MEMBER','message','Diagnóstico inexistente o fuera del tenant.'); end if;
  if not exists (select 1 from public.profiles p where p.user_id=p_user_id and p.organization_id=v_diag.organization_id) then return jsonb_build_object('ok',false,'code','FORBIDDEN_NOT_MEMBER','message','El usuario no pertenece al tenant del diagnóstico.'); end if;
  if v_diag.estado <> 'activo' or v_diag.fase_actual not between 1 and 3 then
    return jsonb_build_object('ok',false,'code','CONFLICT_STATE','message','El diagnóstico no está activo/fase válida para el CAT.','details',jsonb_build_object('estado_actual',v_diag.estado,'fase_actual',v_diag.fase_actual));
  end if;
  if v_diag.cat_estado <> 'en_revision' then return jsonb_build_object('ok',false,'code','CONFLICT_STATE','message','El CAT no está en revisión.','details',jsonb_build_object('cat_estado',v_diag.cat_estado)); end if;
  select le.id into v_ficha from public.logbook_entries le where le.id=p_ficha_r2_id and le.diagnostic_id=p_diagnostic_id and le.clave='R2' and le.estado='cerrada';
  if v_ficha is null then return jsonb_build_object('ok',false,'code','GATE_R2_FICHA','message','Ficha R2 cerrada inexistente o de otro diagnóstico.'); end if;
  if exists (select 1 from public.cat_responses where diagnostic_id=p_diagnostic_id and no_se) and not exists (select 1 from public.logbook_findings where entry_id=v_ficha) then
    return jsonb_build_object('ok',false,'code','GATE_R2_FICHA','message','Las respuestas no_se requieren plan/hallazgo en la ficha R2.');
  end if;
  update public.diagnostics set cat_estado='validado_r2' where id=p_diagnostic_id;
  v_audit := public.fn_audit_write(p_user_id,'approve','diagnostics',p_diagnostic_id::text,jsonb_build_object('cat_estado_anterior','en_revision','cat_estado_nuevo','validado_r2','ficha_r2_id',v_ficha,'idempotency_key',v_key));
  v_resp := jsonb_build_object('ok',true,'replayed',false,'data',jsonb_build_object('diagnostic_id',p_diagnostic_id,'cat_estado','validado_r2','pendientes',0),'audit_ref','audit:'||v_audit);
  if v_key is not null then insert into public.api_idempotency(user_id,endpoint,key,request_hash,status_code,response_body,response_ref,completed_at) values (p_user_id,'EF-04.validate',v_key,coalesce(p_request_hash,''),200,v_resp,'audit:'||v_audit,now()); end if;
  return v_resp;
end; $$;

revoke all on function public.fn_submit_cat(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.fn_submit_cat(uuid,uuid,text,text) to service_role;
revoke all on function public.fn_validate_cat_r2(uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.fn_validate_cat_r2(uuid,uuid,uuid,text,text) to service_role;
