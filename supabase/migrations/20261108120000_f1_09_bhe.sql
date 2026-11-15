-- ============================================================================
-- F1-09 task-142 — BHE M6: capture views, guards, gate F5, RPC EF-05/EF-09.
-- Forward-only; docs/02 intacto. Base main@3af51ae.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Views (captura 12 filas y formula canonica con circular restando)
-- ---------------------------------------------------------------------------
create or replace view public.v_bhe_monthly
with (security_invoker = true) as
select
  wb.diagnostic_id, wb.id as balance_id, bf.mes,
  coalesce(sum(bf.volumen_m3) filter (where fc.grupo='entrada'),0) as entradas_m3,
  coalesce(sum(bf.volumen_m3) filter (where fc.grupo in ('consumo_proceso','consumo_general')),0) as destinos_m3,
  coalesce(sum(bf.volumen_m3) filter (where fc.grupo='descarga'),0) as descargas_m3,
  coalesce(sum(bf.volumen_m3) filter (where fc.grupo='perdida'),0) as perdidas_m3,
  coalesce(sum(bf.volumen_m3) filter (where fc.grupo='circular'),0) as circular_m3,
  coalesce(sum(bf.volumen_m3) filter (where fc.grupo='entrada'),0)
    - coalesce(sum(bf.volumen_m3) filter (where fc.grupo in ('consumo_proceso','consumo_general','descarga','perdida','circular')),0) as brecha_m3,
  round(100.0 * (coalesce(sum(bf.volumen_m3) filter (where fc.grupo='entrada'),0)
    - coalesce(sum(bf.volumen_m3) filter (where fc.grupo in ('consumo_proceso','consumo_general','descarga','perdida','circular')),0))
    / nullif(coalesce(sum(bf.volumen_m3) filter (where fc.grupo='entrada'),0),0),2) as brecha_pct
from public.water_balances wb
join public.balance_flows bf on bf.balance_id=wb.id
join public.balance_flow_catalog fc on fc.code=bf.catalog_code
where wb.estado='validado_r3'
group by wb.diagnostic_id,wb.id,bf.mes;

create or replace view public.v_bhe_monthly_capture
with (security_invoker = true) as
select
  wb.diagnostic_id, wb.id as balance_id, g.mes,
  coalesce(sum(bf.volumen_m3) filter (where fc.grupo='entrada'),0) as entradas_m3,
  coalesce(sum(bf.volumen_m3) filter (where fc.grupo in ('consumo_proceso','consumo_general')),0) as destinos_m3,
  coalesce(sum(bf.volumen_m3) filter (where fc.grupo='descarga'),0) as descargas_m3,
  coalesce(sum(bf.volumen_m3) filter (where fc.grupo='perdida'),0) as perdidas_m3,
  coalesce(sum(bf.volumen_m3) filter (where fc.grupo='circular'),0) as circular_m3,
  coalesce(sum(bf.volumen_m3) filter (where fc.grupo='entrada'),0)
    - coalesce(sum(bf.volumen_m3) filter (where fc.grupo in ('consumo_proceso','consumo_general','descarga','perdida','circular')),0) as brecha_m3,
  round(100.0 * (coalesce(sum(bf.volumen_m3) filter (where fc.grupo='entrada'),0)
    - coalesce(sum(bf.volumen_m3) filter (where fc.grupo in ('consumo_proceso','consumo_general','descarga','perdida','circular')),0))
    / nullif(coalesce(sum(bf.volumen_m3) filter (where fc.grupo='entrada'),0),0),2) as brecha_pct,
  count(bf.*) as flujos_count,
  (count(bf.*) > 0) as tiene_captura
from public.water_balances wb
cross join generate_series(1,12) as g(mes)
left join public.balance_flows bf on bf.balance_id=wb.id and bf.mes=g.mes
left join public.balance_flow_catalog fc on fc.code=bf.catalog_code
group by wb.diagnostic_id,wb.id,g.mes;

create or replace view public.v_bhe_capture_summary
with (security_invoker = true) as
select
  diagnostic_id, balance_id,
  round(sum(entradas_m3),2) as entradas_anual_m3,
  round(sum(destinos_m3),2) as destinos_anual_m3,
  round(sum(circular_m3),2) as circular_anual_m3,
  round(sum(descargas_m3),2) as descargas_anual_m3,
  round(sum(perdidas_m3),2) as perdidas_anual_m3,
  round(sum(brecha_m3),2) as brecha_anual_m3,
  round(100.0 * sum(brecha_m3) / nullif(sum(entradas_m3),0),2) as brecha_anual_pct,
  max(brecha_pct) as brecha_max_mes_pct,
  count(*) filter (where brecha_pct > 10) as meses_sobre_umbral,
  count(*) filter (where tiene_captura) as meses_con_captura,
  (count(*) filter (where tiene_captura) = 12) as captura_completa,
  (sum(entradas_m3) > 0) as tiene_datos
from public.v_bhe_monthly_capture
group by diagnostic_id,balance_id;

create or replace view public.v_bhe_summary
with (security_invoker = true) as
select
  diagnostic_id, balance_id,
  round(sum(entradas_m3),2) as entradas_anual_m3,
  round(sum(destinos_m3),2) as destinos_anual_m3,
  round(sum(circular_m3),2) as circular_anual_m3,
  round(sum(descargas_m3),2) as descargas_anual_m3,
  round(sum(brecha_m3),2) as brecha_anual_m3,
  round(avg(brecha_pct),2) as brecha_pct_promedio,
  max(brecha_pct) > 10 as balance_no_cierra,
  round(100.0 * sum(brecha_m3) / nullif(sum(entradas_m3),0),2) as brecha_anual_pct,
  max(brecha_pct) as brecha_max_mes_pct,
  count(*) filter (where brecha_pct > 10) as meses_sobre_umbral
from public.v_bhe_monthly
group by diagnostic_id,balance_id;

grant select on public.v_bhe_monthly, public.v_bhe_monthly_capture,
  public.v_bhe_capture_summary, public.v_bhe_summary to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Guards water_balances / balance_flows / start capture
-- ---------------------------------------------------------------------------
create or replace function public.trg_water_balances_guard()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_diag_org uuid;
begin
  select d.organization_id into v_diag_org from public.diagnostics d where d.id=new.diagnostic_id;
  if v_diag_org is null or new.organization_id is distinct from v_diag_org then
    raise exception 'BHE: organization_id debe ser el tenant del diagnóstico.' using errcode='42501';
  end if;
  if tg_op='INSERT' then
    if auth.uid() is not null then
      new.estado := 'borrador';
      new.version := coalesce((select max(wb.version)+1 from public.water_balances wb where wb.diagnostic_id=new.diagnostic_id),1);
      new.validado_r3_logbook_id := null;
    end if;
  else
    if new.diagnostic_id is distinct from old.diagnostic_id
       or new.organization_id is distinct from old.organization_id then
      raise exception 'BHE: diagnostic_id/organization_id inmutables.' using errcode='42501';
    end if;
    if auth.uid() is not null then
      if old.estado='validado_r3' then
        raise exception 'BHE: balance validado_r3 es inmutable.' using errcode='42501';
      end if;
      if new.estado is distinct from old.estado
         and not (old.estado='borrador' and new.estado='en_captura') then
        raise exception 'BHE: cierre R3 solo por RPC service_role.' using errcode='42501';
      end if;
      if new.validado_r3_logbook_id is distinct from old.validado_r3_logbook_id
         or new.version is distinct from old.version then
        raise exception 'BHE: cierre R3 solo por RPC service_role.' using errcode='42501';
      end if;
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists water_balances_guard on public.water_balances;
create trigger water_balances_guard before insert or update on public.water_balances
for each row execute function public.trg_water_balances_guard();
revoke all on function public.trg_water_balances_guard() from public,anon,authenticated;

create or replace function public.trg_balance_flows_guard()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_state text; v_role text;
begin
  select wb.estado into v_state from public.water_balances wb where wb.id=new.balance_id;
  if v_state is null then raise exception 'BHE: balance inexistente.' using errcode='42501'; end if;
  if v_state='validado_r3' then raise exception 'BHE: balance validado_r3 es inmutable.' using errcode='42501'; end if;
  if auth.uid() is not null then
    v_role := public.fn_diag_role(auth.uid(), (select diagnostic_id from public.water_balances where id=new.balance_id));
    if v_role is null or v_role not in ('coordinador','equipo') then
      raise exception 'BHE: solo coordinador/equipo escribe flujos.' using errcode='42501';
    end if;
  end if;
  if tg_op='UPDATE' then
    if new.balance_id is distinct from old.balance_id
       or new.catalog_code is distinct from old.catalog_code
       or new.mes is distinct from old.mes then
      raise exception 'BHE: claves del flujo inmutables.' using errcode='42501';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists balance_flows_guard on public.balance_flows;
create trigger balance_flows_guard before insert or update on public.balance_flows
for each row execute function public.trg_balance_flows_guard();
revoke all on function public.trg_balance_flows_guard() from public,anon,authenticated;

create or replace function public.trg_balance_flows_start_capture()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.water_balances set estado='en_captura'
   where id=new.balance_id and estado='borrador';
  return new;
end; $$;
drop trigger if exists balance_flows_start_capture on public.balance_flows;
create trigger balance_flows_start_capture after insert on public.balance_flows
for each row execute function public.trg_balance_flows_start_capture();
revoke all on function public.trg_balance_flows_start_capture() from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- 3. check_phase_gate F5 (estado + 12 meses + brecha <=10)
-- ---------------------------------------------------------------------------
create or replace function public.check_phase_gate()
returns trigger language plpgsql as $$
begin
  if new.fase_actual > old.fase_actual then
    if new.fase_actual >= 2 and not exists (select 1 from public.document_checklist_items i where i.diagnostic_id=new.id and i.item_code='layout' and i.estado='validado_r1') then
      raise exception 'Gate F2: la lista de cotejo (layout) no está validada en R1.';
    end if;
    if new.fase_actual >= 3 and new.cat_estado <> 'validado_r2' then
      raise exception 'Gate F3: el CAT no está validado en R2.';
    end if;
    if new.fase_actual >= 4 and exists (select 1 from public.iih_assets a where a.diagnostic_id=new.id and not a.verificado_v1) then
      raise exception 'Gate F4: el IIH tiene activos sin verificar en V1.';
    end if;
    if old.fase_actual < 5 and new.fase_actual >= 5 then
      if not exists (select 1 from public.water_balances wb where wb.diagnostic_id=new.id and wb.estado='validado_r3') then
        raise exception 'Gate F5: el balance hídrico no está validado en R3.';
      end if;
      if exists (select 1 from public.water_balances wb where wb.diagnostic_id=new.id and wb.estado='validado_r3'
                 and (select count(*) from public.v_bhe_monthly m where m.balance_id=wb.id) < 12) then
        raise exception 'Gate F5: el balance hídrico no tiene los 12 meses completos.';
      end if;
      if exists (select 1 from public.v_bhe_summary s join public.water_balances wb on wb.id=s.balance_id
                 where wb.diagnostic_id=new.id and wb.estado='validado_r3'
                   and (s.brecha_anual_pct > 10 or s.brecha_max_mes_pct > 10 or s.balance_no_cierra)) then
        raise exception 'Gate F5: un balance que no cierra no es un dato, es una tarea pendiente.';
      end if;
    end if;
    if new.fase_actual >= 6 and (select count(*) from public.ivoh_evaluations e where e.diagnostic_id=new.id and e.estado='validado_r4') < 6 then
      raise exception 'Gate F6: el IVOH no está validado en R4 (se requieren 6/6 factores).';
    end if;
  end if;
  return new;
end; $$;

-- ---------------------------------------------------------------------------
-- 4. RPC validate-r3
-- ---------------------------------------------------------------------------
create or replace function public.fn_validate_bhe_r3(
  p_user_id uuid, p_balance_id uuid, p_r3_logbook_id uuid,
  p_idempotency_key text default null, p_request_hash text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_key text := nullif(p_idempotency_key,'');
  v_existing public.api_idempotency%rowtype;
  v_bal public.water_balances%rowtype; v_diag public.diagnostics%rowtype;
  v_role text; v_ficha uuid; v_count int; v_complete bool; v_entradas numeric;
  v_max numeric; v_annual numeric; v_meses jsonb; v_audit text; v_resp jsonb;
begin
  if p_user_id is null or p_balance_id is null or p_r3_logbook_id is null then
    return jsonb_build_object('ok',false,'code','VALIDATION_PARAMETRO_REQUERIDO','message','Parámetros incompletos.');
  end if;
  if v_key is not null then
    perform pg_advisory_xact_lock(hashtext('EF-05.validate-r3:'||p_user_id::text||':'||v_key));
    select * into v_existing from public.api_idempotency where user_id=p_user_id and endpoint='EF-05.validate-r3' and key=v_key;
    if found then
      if v_existing.request_hash is distinct from coalesce(p_request_hash,'') then return jsonb_build_object('ok',false,'code','CONFLICT_STATE','message','Idempotency-Key reutilizada con otro request.'); end if;
      if v_existing.response_body is not null then return v_existing.response_body || jsonb_build_object('replayed',true); end if;
      return jsonb_build_object('ok',false,'code','CONFLICT_STATE','message','Operación en curso.');
    end if;
  end if;
  select * into v_bal from public.water_balances where id=p_balance_id for update;
  if not found then return jsonb_build_object('ok',false,'code','FORBIDDEN_NOT_MEMBER','message','Balance inexistente o fuera del tenant.'); end if;
  select * into v_diag from public.diagnostics where id=v_bal.diagnostic_id;
  v_role := public.fn_diag_role(p_user_id,v_bal.diagnostic_id);
  if v_role is null or v_role not in ('coordinador','equipo') then return jsonb_build_object('ok',false,'code','FORBIDDEN_ROLE','message','Solo coordinador/equipo valida R3.'); end if;
  if not exists (select 1 from public.profiles p where p.user_id=p_user_id and p.organization_id=v_diag.organization_id) then return jsonb_build_object('ok',false,'code','FORBIDDEN_NOT_MEMBER','message','El usuario no pertenece al tenant.'); end if;
  if v_diag.estado <> 'activo' then return jsonb_build_object('ok',false,'code','CONFLICT_STATE','message','Diagnóstico no activo.'); end if;
  if v_bal.estado <> 'en_captura' then return jsonb_build_object('ok',false,'code','CONFLICT_STATE','message','El balance no está en captura.','details',jsonb_build_object('estado',v_bal.estado)); end if;
  select le.id into v_ficha from public.logbook_entries le where le.id=p_r3_logbook_id and le.diagnostic_id=v_bal.diagnostic_id and le.clave='R3' and le.estado='cerrada';
  if v_ficha is null then return jsonb_build_object('ok',false,'code','GATE_R3_FICHA','message','Ficha R3 cerrada inexistente o de otro diagnóstico.'); end if;

  select count(*), bool_and(tiene_captura), coalesce(sum(entradas_m3),0), max(brecha_pct)
    into v_count,v_complete,v_entradas,v_max
    from public.v_bhe_monthly_capture where balance_id=p_balance_id;
  if v_count < 12 or not coalesce(v_complete,false) or v_entradas <= 0 then
    return jsonb_build_object('ok',false,'code','VALIDATION_BHE_INCOMPLETO','message','El balance no tiene los 12 meses con captura y entradas.','details',jsonb_build_object('meses_con_captura',v_count,'entradas_m3',v_entradas));
  end if;
  select jsonb_agg(jsonb_build_object('mes',mes,'brecha_pct',brecha_pct) order by mes) into v_meses
    from public.v_bhe_monthly_capture where balance_id=p_balance_id and brecha_pct > 10;
  if v_meses is not null then
    return jsonb_build_object('ok',false,'code','GATE_BHE_BRECHA','message','Un balance que no cierra no es un dato, es una tarea pendiente.','details',jsonb_build_object('meses',v_meses));
  end if;
  select brecha_anual_pct into v_annual from public.v_bhe_capture_summary where balance_id=p_balance_id;

  update public.water_balances set estado='validado_r3', validado_r3_logbook_id=v_ficha, version=version+1 where id=p_balance_id;
  update public.diagnostics set brecha_pct=v_annual where id=v_bal.diagnostic_id;
  v_audit := public.fn_audit_write(p_user_id,'approve','water_balances',p_balance_id::text,
    jsonb_build_object('estado_anterior',v_bal.estado,'estado_nuevo','validado_r3','ficha_r3_id',v_ficha,'brecha_anual_pct',v_annual,'idempotency_key',v_key));
  v_resp := jsonb_build_object('ok',true,'replayed',false,'data',jsonb_build_object('balance_id',p_balance_id,'estado','validado_r3','brecha_anual_pct',v_annual,'brecha_max_mes_pct',v_max,'meses_sobre_umbral',0),'audit_ref','audit:'||v_audit);
  if v_key is not null then insert into public.api_idempotency(user_id,endpoint,key,request_hash,status_code,response_body,response_ref,completed_at) values (p_user_id,'EF-05.validate-r3',v_key,coalesce(p_request_hash,''),200,v_resp,'audit:'||v_audit,now()); end if;
  return v_resp;
end; $$;
revoke all on function public.fn_validate_bhe_r3(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.fn_validate_bhe_r3(uuid,uuid,uuid,text,text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. RPC import-bhe
-- ---------------------------------------------------------------------------
create or replace function public.fn_import_bhe(
  p_user_id uuid, p_diagnostic_id uuid, p_document_id uuid, p_periodo_anio smallint,
  p_rows jsonb, p_checksum text default null,
  p_idempotency_key text default null, p_request_hash text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_key text := nullif(p_idempotency_key,'');
  v_existing public.api_idempotency%rowtype;
  v_role text; v_diag public.diagnostics%rowtype; v_doc public.documents%rowtype;
  v_bal public.water_balances%rowtype; v_row jsonb; v_ord int:=0; v_ok int:=0;
  v_rejected jsonb:='[]'::jsonb; v_valid jsonb:='[]'::jsonb;
  v_balance_id uuid; v_audit text; v_resp jsonb;
begin
  if p_user_id is null or p_diagnostic_id is null or p_document_id is null or p_periodo_anio is null or p_rows is null then
    return jsonb_build_object('ok',false,'code','VALIDATION_PARAMETRO_REQUERIDO','message','Parámetros incompletos.');
  end if;
  if p_periodo_anio < 2000 or p_periodo_anio > 2100 or jsonb_typeof(p_rows) <> 'array' then
    return jsonb_build_object('ok',false,'code','VALIDATION_BHE_INCOMPLETO','message','periodo_anio o filas inválidas.');
  end if;
  if v_key is not null then
    perform pg_advisory_xact_lock(hashtext('EF-09.bhe:'||p_user_id::text||':'||v_key));
    select * into v_existing from public.api_idempotency where user_id=p_user_id and endpoint='EF-09.bhe' and key=v_key;
    if found then
      if v_existing.request_hash is distinct from coalesce(p_request_hash,'') then return jsonb_build_object('ok',false,'code','CONFLICT_STATE','message','Idempotency-Key reutilizada con otro request.'); end if;
      if v_existing.response_body is not null then return v_existing.response_body || jsonb_build_object('replayed',true); end if;
      return jsonb_build_object('ok',false,'code','CONFLICT_STATE','message','Operación en curso.');
    end if;
  end if;
  v_role := public.fn_diag_role(p_user_id,p_diagnostic_id);
  if v_role is null or v_role not in ('coordinador','equipo') then return jsonb_build_object('ok',false,'code','FORBIDDEN_ROLE','message','Solo coordinador/equipo importa BHE.'); end if;
  select * into v_diag from public.diagnostics where id=p_diagnostic_id;
  if not found or v_diag.estado <> 'activo'
     or not exists (select 1 from public.profiles p where p.user_id=p_user_id and p.organization_id=v_diag.organization_id) then
    return jsonb_build_object('ok',false,'code','FORBIDDEN_NOT_MEMBER','message','Diagnóstico/tenant inválido o no activo.');
  end if;
  select * into v_doc from public.documents where id=p_document_id;
  if not found or v_doc.diagnostic_id <> p_diagnostic_id or v_doc.organization_id <> v_diag.organization_id or v_doc.upload_status <> 'registered' then
    return jsonb_build_object('ok',false,'code','FORBIDDEN_NOT_MEMBER','message','Documento XLSX inexistente, de otro diagnóstico o no registrado.');
  end if;
  if v_doc.mime <> 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' then
    return jsonb_build_object('ok',false,'code','VALIDATION_XLSX_ESTRUCTURA','message','BHE solo admite XLSX OOXML; .xls no soportado.');
  end if;
  if p_checksum is null or p_checksum <> v_doc.sha256 then
    return jsonb_build_object('ok',false,'code','VALIDATION_XLSX_CONTENIDO','message','Checksum no coincide con el documento.');
  end if;

  -- Staging en memoria: no toca cabecera/flows hasta tener >=1 fila válida.
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_ord := v_ord + 1;
    begin
      if nullif(v_row->>'catalog_code','') is null or nullif(v_row->>'mes','') is null or nullif(v_row->>'volumen_m3','') is null then
        raise exception 'fila incompleta';
      end if;
      if (v_row->>'mes')::int not between 1 and 12 or (v_row->>'volumen_m3')::numeric < 0 then
        raise exception 'mes/volumen inválido';
      end if;
      if not exists (select 1 from public.balance_flow_catalog where code=v_row->>'catalog_code') then
        raise exception 'catalog_code inválido';
      end if;
      v_valid := v_valid || jsonb_build_array(jsonb_build_object(
        'catalog_code', v_row->>'catalog_code', 'mes', (v_row->>'mes')::smallint,
        'volumen_m3', (v_row->>'volumen_m3')::numeric,
        'fila', coalesce(nullif(v_row->>'fila','')::int, v_ord)));
      v_ok := v_ok + 1;
    exception when others then
      v_rejected := v_rejected || jsonb_build_array(jsonb_build_object('fila',coalesce(nullif(v_row->>'fila','')::int,v_ord),'razon',sqlerrm));
    end;
  end loop;
  if v_ok = 0 then
    return jsonb_build_object('ok',false,'code','VALIDATION_BHE_INCOMPLETO','message','Ninguna fila válida; no se modifica el balance ni sus flujos.','details',jsonb_build_object('filas_ok',0,'filas_rechazadas',v_rejected));
  end if;

  select * into v_bal from public.water_balances where diagnostic_id=p_diagnostic_id order by version desc limit 1;
  if found then
    if v_bal.estado='validado_r3' then return jsonb_build_object('ok',false,'code','CONFLICT_STATE','message','El balance ya está validado_r3.'); end if;
    if v_bal.periodo_anio <> p_periodo_anio then return jsonb_build_object('ok',false,'code','CONFLICT_STATE','message','periodo_anio distinto al balance existente.'); end if;
    v_balance_id := v_bal.id;
    update public.water_balances set fuente_origen='importada_excel', estado='en_captura' where id=v_balance_id;
    delete from public.balance_flows where balance_id=v_balance_id;
  else
    insert into public.water_balances (organization_id,diagnostic_id,periodo_anio,mes_inicio,fuente_origen,estado,version)
    values (v_diag.organization_id,p_diagnostic_id,p_periodo_anio,1,'importada_excel','en_captura',1)
    returning id into v_balance_id;
  end if;

  for v_row in select value from jsonb_array_elements(v_valid) loop
    insert into public.balance_flows (balance_id,catalog_code,mes,volumen_m3)
    values (v_balance_id,v_row->>'catalog_code',(v_row->>'mes')::smallint,(v_row->>'volumen_m3')::numeric);
  end loop;

  v_audit := public.fn_audit_write(p_user_id,'create','water_balances',v_balance_id::text,
    jsonb_build_object('import','xlsx','document_id',p_document_id,'checksum',p_checksum,'periodo_anio',p_periodo_anio,
                       'filas_ok',v_ok,'filas_rechazadas',v_rejected,'idempotency_key',v_key));
  v_resp := jsonb_build_object('ok',true,'replayed',false,
    'data',jsonb_build_object('destino_id',v_balance_id,'balance_id',v_balance_id,'periodo_anio',p_periodo_anio,
                              'filas_ok',v_ok,'filas_rechazadas',v_rejected),
    'audit_ref','audit:'||v_audit);
  if v_key is not null then insert into public.api_idempotency(user_id,endpoint,key,request_hash,status_code,response_body,response_ref,completed_at)
    values (p_user_id,'EF-09.bhe',v_key,coalesce(p_request_hash,''),200,v_resp,'audit:'||v_audit,now()); end if;
  return v_resp;
end; $$;
revoke all on function public.fn_import_bhe(uuid,uuid,uuid,smallint,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.fn_import_bhe(uuid,uuid,uuid,smallint,jsonb,text,text,text) to service_role;
