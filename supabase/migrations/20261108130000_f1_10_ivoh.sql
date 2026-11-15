-- ============================================================================
-- F1-10 task-157 — IVOH M8: semaforo, PK versionada, vistas, guards,
-- RPC EF-06 score/validate-r4 y gate F6. Forward-only; docs/02 intacto.
-- ============================================================================

create table if not exists public.ivoh_semaforo (
  nivel text primary key check (nivel in ('rojo','amarillo','verde')),
  min_total numeric(3,1) not null,
  max_total numeric(3,1) not null,
  label text not null,
  descripcion text not null,
  orden smallint not null,
  check (min_total <= max_total)
);
insert into public.ivoh_semaforo(nivel,min_total,max_total,label,descripcion,orden) values
  ('rojo',0.0,4.9,'Crítico','IVOH por debajo de 5.0; requiere intervención prioritaria.',1),
  ('amarillo',5.0,7.9,'En desarrollo','IVOH entre 5.0 y 7.9; avances parciales con brechas.',2),
  ('verde',8.0,10.0,'Consolidado','IVOH de 8.0 o más; desempeño consolidado.',3)
on conflict (nivel) do update set min_total=excluded.min_total,max_total=excluded.max_total,
  label=excluded.label,descripcion=excluded.descripcion,orden=excluded.orden;
grant select on public.ivoh_semaforo to authenticated;
alter table public.ivoh_semaforo enable row level security;
drop policy if exists ivoh_semaforo_sel on public.ivoh_semaforo;
create policy ivoh_semaforo_sel on public.ivoh_semaforo for select to authenticated using (true);

-- PK versionada
alter table public.ivoh_evaluations drop constraint if exists ivoh_evaluations_pkey;
alter table public.ivoh_evaluations add primary key (diagnostic_id,version_id,factor_code);
create index if not exists idx_ivoh_evaluations_version on public.ivoh_evaluations(diagnostic_id,version_id);

-- v_ivoh_score: solo R4, versión vigente, pesos desde ivoh_factors, catálogo semáforo.
drop view if exists public.v_ivoh_score cascade;
create or replace view public.v_ivoh_score
with (security_invoker = true) as
with agg as (
  select d.id as diagnostic_id, d.index_version_id as version_id,
    round(sum(f.peso * e.puntaje),1) as ivoh,
    jsonb_object_agg(e.factor_code, e.puntaje order by e.factor_code) as serie_factores,
    jsonb_agg(jsonb_build_object('factor_code',e.factor_code,'peso',f.peso,'puntaje',e.puntaje,
      'aportacion',round(f.peso*e.puntaje,2)) order by e.factor_code) as por_factor
  from public.diagnostics d
  join public.ivoh_evaluations e on e.diagnostic_id=d.id and e.version_id=d.index_version_id and e.estado='validado_r4'
  join public.ivoh_factors f on f.version_id=e.version_id and f.factor_code=e.factor_code
  group by d.id,d.index_version_id
)
select a.*, s.nivel as semaforo, s.label as semaforo_label
from agg a left join public.ivoh_semaforo s
  on a.ivoh >= s.min_total and a.ivoh <= s.max_total;
grant select on public.v_ivoh_score to authenticated;

-- v_ivoh_capture: borrador por versión vigente, 0..6 factores; total solo 6/6.
drop view if exists public.v_ivoh_capture cascade;
create or replace view public.v_ivoh_capture
with (security_invoker = true) as
with base as (
  select d.id as diagnostic_id, d.index_version_id as version_id
  from public.diagnostics d
), agg as (
  select b.diagnostic_id,b.version_id,
    count(e.*) as factores_guardados,
    (count(e.*)=6) as completo,
    case when count(e.*)=6 then round(sum(f.peso*e.puntaje),1) else null end as total,
    jsonb_object_agg(e.factor_code,e.puntaje order by e.factor_code) filter (where e.factor_code is not null) as serie_factores,
    jsonb_agg(jsonb_build_object('factor_code',e.factor_code,'peso',f.peso,'puntaje',e.puntaje,
      'aportacion',round(f.peso*e.puntaje,2)) order by e.factor_code) filter (where e.factor_code is not null) as por_factor
  from base b
  left join public.ivoh_evaluations e on e.diagnostic_id=b.diagnostic_id and e.version_id=b.version_id
  left join public.ivoh_factors f on f.version_id=b.version_id and f.factor_code=e.factor_code
  group by b.diagnostic_id,b.version_id
)
select a.diagnostic_id,a.version_id,a.factores_guardados,a.completo,
  a.total, s.nivel as semaforo, s.label as semaforo_label,
  a.serie_factores,a.por_factor
from agg a left join public.ivoh_semaforo s
  on a.total is not null and a.total >= s.min_total and a.total <= s.max_total;
grant select on public.v_ivoh_capture to authenticated;

-- p8_ivoh: 6/6 validado_r4 de la versión vigente (B15).
create or replace view public.v_diagnostic_completeness as
select
  d.id as diagnostic_id,
  (select bool_and(i.estado='validado_r1') from public.document_checklist_items i where i.diagnostic_id=d.id) as p1_documentos,
  d.cat_estado='validado_r2' as p2_cat,
  (select bool_and(a.verificado_v1) from public.iih_assets a where a.diagnostic_id=d.id) as p3_iih,
  (exists (select 1 from public.samples s where s.diagnostic_id=d.id and
    (select count(*) from public.custody_transfers ct where ct.sample_id=s.id and ct.firma is not null and length(btrim(ct.firma))>0)=3)) as p4_custodia,
  (select bool_and(wb.estado='validado_r3') from public.water_balances wb where wb.diagnostic_id=d.id) as p5_bhe,
  (exists (select 1 from public.lab_results lr join public.samples s on s.id=lr.sample_id where s.diagnostic_id=d.id and lr.dictamen is not null)) as p6_lab,
  (select count(*)=8 and bool_and(le.estado='cerrada') from public.logbook_entries le where le.diagnostic_id=d.id) as p7_bitacoras,
  (select count(distinct e.factor_code)=6 from public.ivoh_evaluations e
     where e.diagnostic_id=d.id and e.version_id=d.index_version_id and e.estado='validado_r4') as p8_ivoh,
  (exists (select 1 from public.alternatives a where a.diagnostic_id=d.id and a.validado_r4)) as p9_alternativas,
  ((select count(*) from public.photo_log p join public.logbook_entries le on le.id=p.entry_id where le.diagnostic_id=d.id)>=8) as p10_fotos
from public.diagnostics d;
grant select on public.v_diagnostic_completeness to authenticated;


-- RLS: authenticated solo SELECT; retirar escrituras directas.
drop policy if exists ivoh_evaluations_ins on public.ivoh_evaluations;
drop policy if exists ivoh_evaluations_upd on public.ivoh_evaluations;
drop policy if exists ivoh_evaluations_del on public.ivoh_evaluations;

create or replace function public.trg_ivoh_evaluations_guard()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then
    if auth.uid() is not null then raise exception 'IVOH: captura solo por RPC service_role.' using errcode='42501'; end if;
  else
    if old.estado='validado_r4' then raise exception 'IVOH: evaluación validada_r4 es inmutable.' using errcode='42501'; end if;
    if auth.uid() is not null then raise exception 'IVOH: escritura solo por RPC service_role.' using errcode='42501'; end if;
    if new.diagnostic_id is distinct from old.diagnostic_id
       or new.version_id is distinct from old.version_id
       or new.factor_code is distinct from old.factor_code then
      raise exception 'IVOH: claves de evaluación inmutables.' using errcode='42501';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists ivoh_evaluations_guard on public.ivoh_evaluations;
create trigger ivoh_evaluations_guard before insert or update on public.ivoh_evaluations
for each row execute function public.trg_ivoh_evaluations_guard();
revoke all on function public.trg_ivoh_evaluations_guard() from public,anon,authenticated;

-- Gate F6: 6/6 validado_r4 de la versión vigente, solo al entrar a 6.
create or replace function public.check_phase_gate()
returns trigger language plpgsql as $$
begin
  if new.fase_actual > old.fase_actual then
    if new.fase_actual >= 2 and not exists (select 1 from public.document_checklist_items i where i.diagnostic_id=new.id and i.item_code='layout' and i.estado='validado_r1') then raise exception 'Gate F2: la lista de cotejo (layout) no está validada en R1.'; end if;
    if new.fase_actual >= 3 and new.cat_estado <> 'validado_r2' then raise exception 'Gate F3: el CAT no está validado en R2.'; end if;
    if new.fase_actual >= 4 and exists (select 1 from public.iih_assets a where a.diagnostic_id=new.id and not a.verificado_v1) then raise exception 'Gate F4: el IIH tiene activos sin verificar en V1.'; end if;
    if old.fase_actual < 5 and new.fase_actual >= 5 then
      if not exists (select 1 from public.water_balances wb where wb.diagnostic_id=new.id and wb.estado='validado_r3') then raise exception 'Gate F5: el balance hídrico no está validado en R3.'; end if;
      if exists (select 1 from public.water_balances wb where wb.diagnostic_id=new.id and wb.estado='validado_r3' and (select count(*) from public.v_bhe_monthly m where m.balance_id=wb.id) < 12) then raise exception 'Gate F5: el balance hídrico no tiene los 12 meses completos.'; end if;
      if exists (select 1 from public.v_bhe_summary s join public.water_balances wb on wb.id=s.balance_id where wb.diagnostic_id=new.id and wb.estado='validado_r3' and (s.brecha_anual_pct > 10 or s.brecha_max_mes_pct > 10 or s.balance_no_cierra)) then raise exception 'Gate F5: un balance que no cierra no es un dato, es una tarea pendiente.'; end if;
    end if;
    if old.fase_actual < 6 and new.fase_actual >= 6 then
      if (select count(distinct e.factor_code) from public.ivoh_evaluations e
          where e.diagnostic_id=new.id and e.version_id=new.index_version_id and e.estado='validado_r4') < 6 then
        raise exception 'Gate F6: el IVOH no está validado en R4 (6/6 de la versión vigente).';
      end if;
    end if;
  end if;
  return new;
end; $$;

-- ---------------------------------------------------------------------------
-- RPC save (parcial 1..6)
-- ---------------------------------------------------------------------------
create or replace function public.fn_save_ivoh_score(
  p_user_id uuid, p_diagnostic_id uuid, p_scores jsonb,
  p_idempotency_key text default null, p_request_hash text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_key text := nullif(p_idempotency_key,''); v_existing public.api_idempotency%rowtype;
  v_role text; v_diag public.diagnostics%rowtype; v_row jsonb; v_count int:=0; v_factor text;
  v_audit text; v_resp jsonb; v_seen text[]:='{}'; v_ev jsonb;
begin
  if p_user_id is null or p_diagnostic_id is null or p_scores is null or jsonb_typeof(p_scores)<>'array' then
    return jsonb_build_object('ok',false,'code','VALIDATION_PARAMETRO_REQUERIDO','message','Parámetros incompletos.');
  end if;
  if v_key is not null then
    perform pg_advisory_xact_lock(hashtext('EF-06.score:'||p_user_id::text||':'||v_key));
    select * into v_existing from public.api_idempotency where user_id=p_user_id and endpoint='EF-06.score' and key=v_key;
    if found then
      if v_existing.request_hash is distinct from coalesce(p_request_hash,'') then return jsonb_build_object('ok',false,'code','CONFLICT_STATE','message','Idempotency-Key reutilizada.'); end if;
      if v_existing.response_body is not null then return v_existing.response_body || jsonb_build_object('replayed',true); end if;
    end if;
  end if;
  v_role := public.fn_diag_role(p_user_id,p_diagnostic_id);
  if v_role is null or v_role not in ('coordinador','equipo') then return jsonb_build_object('ok',false,'code','FORBIDDEN_ROLE','message','Solo coordinador/equipo captura IVOH.'); end if;
  select * into v_diag from public.diagnostics where id=p_diagnostic_id;
  if not found or v_diag.estado<>'activo' or not exists (select 1 from public.profiles p where p.user_id=p_user_id and p.organization_id=v_diag.organization_id) then
    return jsonb_build_object('ok',false,'code','FORBIDDEN_NOT_MEMBER','message','Diagnóstico/tenant inválido.');
  end if;
  if not exists (select 1 from public.water_balances wb where wb.diagnostic_id=p_diagnostic_id and wb.estado='validado_r3') then
    return jsonb_build_object('ok',false,'code','GATE_BHE_R3','message','El BHE no está validado en R3.');
  end if;
  if jsonb_array_length(p_scores) < 1 or jsonb_array_length(p_scores) > 6 then
    return jsonb_build_object('ok',false,'code','VALIDATION_IVOH_INCOMPLETO','message','Debe enviar entre 1 y 6 factores.');
  end if;
  for v_row in select value from jsonb_array_elements(p_scores) loop
    v_factor := v_row->>'factor_code';
    if v_factor is null or v_factor not in ('F1','F2','F3','F4','F5','F6') then
      return jsonb_build_object('ok',false,'code','VALIDATION_IVOH_INCOMPLETO','message','factor_code inválido.','details',jsonb_build_object('factor',v_factor));
    end if;
    if v_factor = any(v_seen) then return jsonb_build_object('ok',false,'code','VALIDATION_IVOH_INCOMPLETO','message','factor_code duplicado.'); end if;
    v_seen := array_append(v_seen,v_factor);
    if nullif(v_row->>'puntaje','') is null or (v_row->>'puntaje')::numeric < 0 or (v_row->>'puntaje')::numeric > 10
       or mod((v_row->>'puntaje')::numeric*2,1) <> 0 then
      return jsonb_build_object('ok',false,'code','VALIDATION_IVOH_INCOMPLETO','message','puntaje 0–10 paso 0.5.','details',jsonb_build_object('factor',v_factor));
    end if;
    if nullif(btrim(coalesce(v_row->>'justificacion','')),'') is null then
      return jsonb_build_object('ok',false,'code','VALIDATION_IVOH_INCOMPLETO','message','justificacion obligatoria.','details',jsonb_build_object('factor',v_factor));
    end if;
    v_ev := v_row->'evidencia';
    if v_ev is null or jsonb_typeof(v_ev)<>'array' or jsonb_array_length(v_ev)<1 then
      return jsonb_build_object('ok',false,'code','VALIDATION_IVOH_INCOMPLETO','message','evidencia ≥1 por factor.','details',jsonb_build_object('factor',v_factor));
    end if;
    if exists (select 1 from jsonb_array_elements(v_ev) ev
               where coalesce(ev->>'tipo','') not in ('documento','activo','indicador','ficha')
                  or nullif(btrim(coalesce(ev->>'ref','')),'') is null) then
      return jsonb_build_object('ok',false,'code','VALIDATION_IVOH_INCOMPLETO','message','evidencia con tipo/ref inválidos.','details',jsonb_build_object('factor',v_factor));
    end if;
    if exists (select 1 from public.ivoh_evaluations e where e.diagnostic_id=p_diagnostic_id
               and e.version_id=v_diag.index_version_id and e.factor_code=v_factor and e.estado='validado_r4') then
      return jsonb_build_object('ok',false,'code','CONFLICT_STATE','message','Factor ya validado_r4.');
    end if;
    insert into public.ivoh_evaluations(diagnostic_id,version_id,factor_code,puntaje,justificacion,evidencia,estado)
    values (p_diagnostic_id,v_diag.index_version_id,v_factor,(v_row->>'puntaje')::numeric,v_row->>'justificacion',v_ev,'borrador')
    on conflict (diagnostic_id,version_id,factor_code) do update
      set puntaje=excluded.puntaje,justificacion=excluded.justificacion,evidencia=excluded.evidencia,updated_at=now()
      where public.ivoh_evaluations.estado='borrador';
    v_count := v_count + 1;
  end loop;
  v_audit := public.fn_audit_write(p_user_id,'update','ivoh_evaluations',p_diagnostic_id::text,
    jsonb_build_object('version_id',v_diag.index_version_id,'factores',v_seen,'factores_guardados',v_count,'idempotency_key',v_key));
  v_resp := jsonb_build_object('ok',true,'replayed',false,
    'data',jsonb_build_object('diagnostic_id',p_diagnostic_id,'version_id',v_diag.index_version_id,
      'estado','borrador','factores_guardados',v_count),'audit_ref','audit:'||v_audit);
  if v_key is not null then insert into public.api_idempotency(user_id,endpoint,key,request_hash,status_code,response_body,response_ref,completed_at)
    values (p_user_id,'EF-06.score',v_key,coalesce(p_request_hash,''),200,v_resp,'audit:'||v_audit,now()); end if;
  return v_resp;
end; $$;
revoke all on function public.fn_save_ivoh_score(uuid,uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.fn_save_ivoh_score(uuid,uuid,jsonb,text,text) to service_role;

-- ---------------------------------------------------------------------------
-- RPC validate-r4 (6/6)
-- ---------------------------------------------------------------------------
create or replace function public.fn_validate_ivoh_r4(
  p_user_id uuid, p_diagnostic_id uuid, p_r4_logbook_id uuid,
  p_idempotency_key text default null, p_request_hash text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_key text := nullif(p_idempotency_key,''); v_existing public.api_idempotency%rowtype;
  v_role text; v_diag public.diagnostics%rowtype; v_ficha uuid; v_count int;
  v_total numeric; v_semaforo text; v_label text; v_por jsonb; v_audit text; v_resp jsonb;
begin
  if p_user_id is null or p_diagnostic_id is null or p_r4_logbook_id is null then
    return jsonb_build_object('ok',false,'code','VALIDATION_PARAMETRO_REQUERIDO','message','Parámetros incompletos.');
  end if;
  if v_key is not null then
    perform pg_advisory_xact_lock(hashtext('EF-06.validate-r4:'||p_user_id::text||':'||v_key));
    select * into v_existing from public.api_idempotency where user_id=p_user_id and endpoint='EF-06.validate-r4' and key=v_key;
    if found then
      if v_existing.request_hash is distinct from coalesce(p_request_hash,'') then return jsonb_build_object('ok',false,'code','CONFLICT_STATE','message','Idempotency-Key reutilizada.'); end if;
      if v_existing.response_body is not null then return v_existing.response_body || jsonb_build_object('replayed',true); end if;
    end if;
  end if;
  v_role := public.fn_diag_role(p_user_id,p_diagnostic_id);
  if v_role is null or v_role not in ('coordinador','equipo') then return jsonb_build_object('ok',false,'code','FORBIDDEN_ROLE','message','Solo coordinador/equipo valida R4.'); end if;
  select * into v_diag from public.diagnostics where id=p_diagnostic_id;
  if not found or v_diag.estado<>'activo' or not exists (select 1 from public.profiles p where p.user_id=p_user_id and p.organization_id=v_diag.organization_id) then
    return jsonb_build_object('ok',false,'code','FORBIDDEN_NOT_MEMBER','message','Diagnóstico/tenant inválido.');
  end if;
  if not exists (select 1 from public.water_balances wb where wb.diagnostic_id=p_diagnostic_id and wb.estado='validado_r3') then
    return jsonb_build_object('ok',false,'code','GATE_BHE_R3','message','El BHE no está validado en R3.');
  end if;
  select le.id into v_ficha from public.logbook_entries le
   where le.id=p_r4_logbook_id and le.diagnostic_id=p_diagnostic_id and le.clave='R4' and le.estado='cerrada';
  if v_ficha is null then return jsonb_build_object('ok',false,'code','GATE_R4_FICHA','message','Ficha R4 cerrada inexistente o de otro diagnóstico.'); end if;
  if exists (select 1 from public.ivoh_evaluations e where e.diagnostic_id=p_diagnostic_id
             and e.version_id=v_diag.index_version_id and e.estado='validado_r4') then
    return jsonb_build_object('ok',false,'code','CONFLICT_STATE','message','El IVOH ya está validado_r4 para la versión vigente.');
  end if;
  select count(distinct e.factor_code) into v_count from public.ivoh_evaluations e
   where e.diagnostic_id=p_diagnostic_id and e.version_id=v_diag.index_version_id and e.estado='borrador';
  if v_count < 6 or exists (select 1 from public.ivoh_evaluations e where e.diagnostic_id=p_diagnostic_id
      and e.version_id=v_diag.index_version_id and e.estado='validado_r4') then
    return jsonb_build_object('ok',false,'code','VALIDATION_IVOH_INCOMPLETO','message','Se requieren 6/6 factores en borrador y ninguno validado.');
  end if;
  update public.ivoh_evaluations e set estado='validado_r4', r4_logbook_id=v_ficha
   where e.diagnostic_id=p_diagnostic_id and e.version_id=v_diag.index_version_id and e.estado='borrador';
  select ivoh,semaforo,semaforo_label,por_factor into v_total,v_semaforo,v_label,v_por
    from public.v_ivoh_score where diagnostic_id=p_diagnostic_id;
  if v_total is null then
    return jsonb_build_object('ok',false,'code','VALIDATION_IVOH_INCOMPLETO','message','No se pudo calcular el IVOH.');
  end if;
  update public.diagnostics set ivoh_actual=v_total where id=p_diagnostic_id;
  v_audit := public.fn_audit_write(p_user_id,'approve','ivoh_evaluations',p_diagnostic_id::text,
    jsonb_build_object('version_id',v_diag.index_version_id,'total',v_total,'semaforo',v_semaforo,'ficha_r4_id',v_ficha,'idempotency_key',v_key));
  v_resp := jsonb_build_object('ok',true,'replayed',false,
    'data',jsonb_build_object('diagnostic_id',p_diagnostic_id,'total',v_total,'semaforo',v_semaforo,
      'semaforo_label',v_label,'por_factor',v_por),'audit_ref','audit:'||v_audit);
  if v_key is not null then insert into public.api_idempotency(user_id,endpoint,key,request_hash,status_code,response_body,response_ref,completed_at)
    values (p_user_id,'EF-06.validate-r4',v_key,coalesce(p_request_hash,''),200,v_resp,'audit:'||v_audit,now()); end if;
  return v_resp;
end; $$;
revoke all on function public.fn_validate_ivoh_r4(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.fn_validate_ivoh_r4(uuid,uuid,uuid,text,text) to service_role;
