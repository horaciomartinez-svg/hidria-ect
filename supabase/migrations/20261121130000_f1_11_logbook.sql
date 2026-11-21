-- ============================================================================
-- F1-11 task-172 — Bitácora M10/EF-02: estados, guards, seed, RPC y gate.
-- Forward-only; docs/02 intacto. Base main@e6ab1c8.
-- ============================================================================

alter table public.logbook_entries add column if not exists cierre_tardio boolean not null default false;
alter table public.logbook_entries drop constraint if exists logbook_entries_estado_check;
alter table public.logbook_entries add constraint logbook_entries_estado_check check (estado in ('abierta','en_revision','cerrada'));

create or replace function public.trg_logbook_guard()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_org uuid; v_role text;
begin
  select d.organization_id into v_org from public.diagnostics d where d.id=new.diagnostic_id;
  if v_org is null then raise exception 'Bitácora: diagnóstico inexistente.' using errcode='42501'; end if;
  if tg_op='INSERT' then
    new.organization_id := v_org;
    if new.created_by is null then new.created_by := auth.uid(); end if;
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
    if new.created_by is null then raise exception 'Bitácora: created_by requerido.' using errcode='23502'; end if;
    if auth.uid() is not null then
      new.estado := 'abierta';
      new.cerrada_en := null;
      new.cerrada_razon := null;
      new.cierre_tardio := false;
      new.version := 1;
    end if;
  else
    if new.diagnostic_id is distinct from old.diagnostic_id
       or new.organization_id is distinct from old.organization_id
       or new.clave is distinct from old.clave
       or new.folio is distinct from old.folio then
      raise exception 'Bitácora: claves/folio/org inmutables.' using errcode='42501';
    end if;
    if auth.uid() is not null then
      if old.estado='cerrada' then raise exception 'Ficha cerrada: inmutable.' using errcode='42501'; end if;
      if new.estado is distinct from old.estado
         or new.cerrada_en is distinct from old.cerrada_en
         or new.cerrada_razon is distinct from old.cerrada_razon
         or new.version is distinct from old.version
         or new.cierre_tardio is distinct from old.cierre_tardio then
        raise exception 'Bitácora: cierre solo por RPC service_role.' using errcode='42501';
      end if;
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists logbook_guard on public.logbook_entries;
create trigger logbook_guard before insert or update on public.logbook_entries
for each row execute function public.trg_logbook_guard();
revoke all on function public.trg_logbook_guard() from public,anon,authenticated;

create or replace function public.trg_logbook_immutable()
returns trigger language plpgsql as $$
begin
  if old.estado='cerrada' and tg_op in ('UPDATE','DELETE') then
    raise exception 'Ficha % cerrada: inmutable.', old.folio using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;

create or replace function public.trg_logbook_child_guard()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_state text; v_diag uuid; v_role text;
begin
  select e.estado, e.diagnostic_id into v_state,v_diag from public.logbook_entries e where e.id=new.entry_id;
  if v_state is null then raise exception 'Bitácora: ficha inexistente.' using errcode='42501'; end if;
  if v_state='cerrada' and auth.uid() is not null then raise exception 'Ficha cerrada: hijas inmutables.' using errcode='42501'; end if;
  if auth.uid() is not null then
    v_role := public.fn_diag_role(auth.uid(),v_diag);
    if v_role is null or v_role not in ('coordinador','equipo') then
      raise exception 'Bitácora: solo coordinador/equipo edita hijas.' using errcode='42501';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists logbook_child_guard on public.logbook_participants;
drop trigger if exists logbook_child_guard on public.logbook_agenda;
drop trigger if exists logbook_child_guard on public.logbook_findings;
drop trigger if exists logbook_child_guard on public.logbook_agreements;
drop trigger if exists logbook_child_guard on public.logbook_evidence;
create trigger logbook_child_guard before insert or update on public.logbook_participants for each row execute function public.trg_logbook_child_guard();
create trigger logbook_child_guard before insert or update on public.logbook_agenda for each row execute function public.trg_logbook_child_guard();
create trigger logbook_child_guard before insert or update on public.logbook_findings for each row execute function public.trg_logbook_child_guard();
create trigger logbook_child_guard before insert or update on public.logbook_agreements for each row execute function public.trg_logbook_child_guard();
create trigger logbook_child_guard before insert or update on public.logbook_evidence for each row execute function public.trg_logbook_child_guard();
revoke all on function public.trg_logbook_child_guard() from public,anon,authenticated;

create or replace function public.trg_logbook_delete_guard()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_state text; v_diag uuid; v_role text;
begin
  select e.estado,e.diagnostic_id into v_state,v_diag from public.logbook_entries e where e.id=old.entry_id;
  if v_state='cerrada' and auth.uid() is not null then raise exception 'Ficha cerrada: hijas inmutables.' using errcode='42501'; end if;
  if auth.uid() is not null then
    v_role:=public.fn_diag_role(auth.uid(),v_diag);
    if v_role is null or v_role not in ('coordinador','equipo') then raise exception 'Bitácora: solo coordinador/equipo.' using errcode='42501'; end if;
  end if;
  return old;
end; $$;
drop trigger if exists logbook_delete_guard on public.logbook_participants;
drop trigger if exists logbook_delete_guard on public.logbook_agenda;
drop trigger if exists logbook_delete_guard on public.logbook_findings;
drop trigger if exists logbook_delete_guard on public.logbook_agreements;
drop trigger if exists logbook_delete_guard on public.logbook_evidence;
create trigger logbook_delete_guard before delete on public.logbook_participants for each row execute function public.trg_logbook_delete_guard();
create trigger logbook_delete_guard before delete on public.logbook_agenda for each row execute function public.trg_logbook_delete_guard();
create trigger logbook_delete_guard before delete on public.logbook_findings for each row execute function public.trg_logbook_delete_guard();
create trigger logbook_delete_guard before delete on public.logbook_agreements for each row execute function public.trg_logbook_delete_guard();
create trigger logbook_delete_guard before delete on public.logbook_evidence for each row execute function public.trg_logbook_delete_guard();
revoke all on function public.trg_logbook_delete_guard() from public,anon,authenticated;

create or replace function public.trg_logbook_sign_guard()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is not null and (
     (tg_op='INSERT' and new.firma_ts is not null) or
     (tg_op='UPDATE' and new.firma_ts is distinct from old.firma_ts)) then
    raise exception 'Firma solo por RPC service_role.' using errcode='42501';
  end if;
  return new;
end; $$;
drop trigger if exists logbook_sign_guard on public.logbook_participants;
create trigger logbook_sign_guard before insert or update on public.logbook_participants
for each row execute function public.trg_logbook_sign_guard();
revoke all on function public.trg_logbook_sign_guard() from public,anon,authenticated;

-- Hijas: DELETE post-cierre 42501 (B1).
create or replace function public.trg_logbook_child_delete_guard()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_state text; v_diag uuid; v_role text;
begin
  select e.estado, e.diagnostic_id into v_state,v_diag from public.logbook_entries e where e.id=old.entry_id;
  if not found then return old; end if;
  if v_state='cerrada' and auth.uid() is not null then raise exception 'Ficha cerrada: hijas inmutables.' using errcode='42501'; end if;
  if auth.uid() is not null then
    v_role:=public.fn_diag_role(auth.uid(),v_diag);
    if v_role is null or v_role not in ('coordinador','equipo') then raise exception 'Bitácora: solo coordinador/equipo edita hijas.' using errcode='42501'; end if;
  end if;
  return old;
end; $$;
drop trigger if exists logbook_child_del_guard on public.logbook_participants;
drop trigger if exists logbook_child_del_guard on public.logbook_agenda;
drop trigger if exists logbook_child_del_guard on public.logbook_findings;
drop trigger if exists logbook_child_del_guard on public.logbook_agreements;
drop trigger if exists logbook_child_del_guard on public.logbook_evidence;
create trigger logbook_child_del_guard before delete on public.logbook_participants for each row execute function public.trg_logbook_child_delete_guard();
create trigger logbook_child_del_guard before delete on public.logbook_agenda for each row execute function public.trg_logbook_child_delete_guard();
create trigger logbook_child_del_guard before delete on public.logbook_findings for each row execute function public.trg_logbook_child_delete_guard();
create trigger logbook_child_del_guard before delete on public.logbook_agreements for each row execute function public.trg_logbook_child_delete_guard();
create trigger logbook_child_del_guard before delete on public.logbook_evidence for each row execute function public.trg_logbook_child_delete_guard();
revoke all on function public.trg_logbook_child_delete_guard() from public,anon,authenticated;

-- Firma solo por RPC EF-02 (SEC-PR77-01): autenticado no fija/cambia firma_ts.
create or replace function public.trg_logbook_participant_sign_guard()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is not null then
    if tg_op='INSERT' and new.firma_ts is not null then
      raise exception 'Firma: solo EF-02 puede registrar firma_ts.' using errcode='42501';
    end if;
    if tg_op='UPDATE' and new.firma_ts is distinct from old.firma_ts then
      raise exception 'Firma: solo EF-02 puede registrar firma_ts.' using errcode='42501';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists logbook_participant_sign_guard on public.logbook_participants;
create trigger logbook_participant_sign_guard before insert or update on public.logbook_participants
for each row execute function public.trg_logbook_participant_sign_guard();
revoke all on function public.trg_logbook_participant_sign_guard() from public,anon,authenticated;

-- Evidencia: document_id debe ser del mismo diagnóstico/tenant (SEC-PR79-01).
create or replace function public.trg_logbook_evidence_doc_guard()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_diag uuid; v_org uuid; v_doc_diag uuid; v_doc_org uuid; v_status text;
begin
  if new.document_id is null then return new; end if;
  select e.diagnostic_id, e.organization_id into v_diag,v_org from public.logbook_entries e where e.id=new.entry_id;
  select d.diagnostic_id, d.organization_id, d.upload_status into v_doc_diag,v_doc_org,v_status from public.documents d where d.id=new.document_id;
  if v_doc_diag is null or v_doc_diag <> v_diag or v_doc_org <> v_org or v_status <> 'registered' then
    raise exception 'Evidencia: documento de otro diagnóstico/tenant o no registrado.' using errcode='42501';
  end if;
  return new;
end; $$;
drop trigger if exists logbook_evidence_doc_guard on public.logbook_evidence;
create trigger logbook_evidence_doc_guard before insert or update on public.logbook_evidence
for each row execute function public.trg_logbook_evidence_doc_guard();
revoke all on function public.trg_logbook_evidence_doc_guard() from public,anon,authenticated;

-- Seed agenda/evidence desde template al crear la ficha.
create or replace function public.trg_logbook_seed_children()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_tpl public.logbook_templates%rowtype; v_item jsonb; v_no int:=0;
begin
  if new.estado <> 'abierta' then return new; end if;
  select * into v_tpl from public.logbook_templates where clave=new.clave;
  if found then
    for v_item in select value from jsonb_array_elements(v_tpl.agenda_items) loop
      v_no:=v_no+1;
      insert into public.logbook_agenda(entry_id,no,actividad,estado)
      values (new.id,v_no,v_item#>>'{}','realizado');
    end loop;
    for v_item in select value from jsonb_array_elements(v_tpl.evidence_items) loop
      insert into public.logbook_evidence(entry_id,item,obligatorio,document_id)
      values (new.id,v_item#>>'{}',true,null);
    end loop;
  end if;
  return new;
end; $$;
drop trigger if exists logbook_seed_children on public.logbook_entries;
create trigger logbook_seed_children after insert on public.logbook_entries
for each row execute function public.trg_logbook_seed_children();
revoke all on function public.trg_logbook_seed_children() from public,anon,authenticated;

create or replace function public.trg_logbook_evidence_document()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_diag uuid; v_org uuid; v_doc public.documents%rowtype;
begin
  if new.document_id is null then return new; end if;
  select e.diagnostic_id, e.organization_id into v_diag,v_org from public.logbook_entries e where e.id=new.entry_id;
  select * into v_doc from public.documents where id=new.document_id;
  if not found or v_doc.diagnostic_id is distinct from v_diag or v_doc.organization_id is distinct from v_org or v_doc.upload_status <> 'registered' then
    raise exception 'Bitácora: documento de evidencia ajeno/no registrado.' using errcode='42501';
  end if;
  return new;
end; $$;
drop trigger if exists logbook_evidence_document on public.logbook_evidence;
create trigger logbook_evidence_document before insert or update of document_id on public.logbook_evidence
for each row execute function public.trg_logbook_evidence_document();
revoke all on function public.trg_logbook_evidence_document() from public,anon,authenticated;

-- RLS escritura: entries/hijas solo coord/equipo; change_log append-only service.
drop policy if exists logbook_entries_ins on public.logbook_entries;
drop policy if exists logbook_entries_upd on public.logbook_entries;
create policy logbook_entries_ins on public.logbook_entries for insert to authenticated
  with check (is_diagnostic_member(diagnostic_id) and fn_diag_role(auth.uid(),diagnostic_id) in ('coordinador','equipo'));
create policy logbook_entries_upd on public.logbook_entries for update to authenticated
  using (is_diagnostic_member(diagnostic_id) and fn_diag_role(auth.uid(),diagnostic_id) in ('coordinador','equipo'))
  with check (is_diagnostic_member(diagnostic_id) and fn_diag_role(auth.uid(),diagnostic_id) in ('coordinador','equipo'));
drop policy if exists logbook_change_log_ins on public.logbook_change_log;
drop policy if exists logbook_change_log_upd on public.logbook_change_log;
revoke insert,update,delete on public.logbook_change_log from authenticated;
drop policy if exists logbook_agenda_upd on public.logbook_agenda;
drop policy if exists logbook_evidence_upd on public.logbook_evidence;
drop policy if exists logbook_participants_upd on public.logbook_participants;
drop policy if exists logbook_findings_upd on public.logbook_findings;
drop policy if exists logbook_agreements_upd on public.logbook_agreements;
drop policy if exists logbook_agenda_ins on public.logbook_agenda;
drop policy if exists logbook_evidence_ins on public.logbook_evidence;
drop policy if exists logbook_participants_ins on public.logbook_participants;
drop policy if exists logbook_findings_ins on public.logbook_findings;
drop policy if exists logbook_agreements_ins on public.logbook_agreements;
create policy logbook_agenda_ins on public.logbook_agenda for insert to authenticated with check (is_logbook_entry_member(entry_id) and exists(select 1 from public.logbook_entries e where e.id=entry_id and fn_diag_role(auth.uid(),e.diagnostic_id) in ('coordinador','equipo')));
create policy logbook_agenda_upd on public.logbook_agenda for update to authenticated using (is_logbook_entry_member(entry_id)) with check (is_logbook_entry_member(entry_id));
create policy logbook_evidence_ins on public.logbook_evidence for insert to authenticated with check (is_logbook_entry_member(entry_id) and exists(select 1 from public.logbook_entries e where e.id=entry_id and fn_diag_role(auth.uid(),e.diagnostic_id) in ('coordinador','equipo')));
create policy logbook_evidence_upd on public.logbook_evidence for update to authenticated using (is_logbook_entry_member(entry_id)) with check (is_logbook_entry_member(entry_id));
create policy logbook_participants_ins on public.logbook_participants for insert to authenticated with check (is_logbook_entry_member(entry_id) and exists(select 1 from public.logbook_entries e where e.id=entry_id and fn_diag_role(auth.uid(),e.diagnostic_id) in ('coordinador','equipo')));
create policy logbook_participants_upd on public.logbook_participants for update to authenticated using (is_logbook_entry_member(entry_id)) with check (is_logbook_entry_member(entry_id));
create policy logbook_findings_ins on public.logbook_findings for insert to authenticated with check (is_logbook_entry_member(entry_id));
create policy logbook_findings_upd on public.logbook_findings for update to authenticated using (is_logbook_entry_member(entry_id)) with check (is_logbook_entry_member(entry_id));
create policy logbook_agreements_ins on public.logbook_agreements for insert to authenticated with check (is_logbook_entry_member(entry_id));
create policy logbook_agreements_upd on public.logbook_agreements for update to authenticated using (is_logbook_entry_member(entry_id)) with check (is_logbook_entry_member(entry_id));

-- p7 corregido: 8 claves cubiertas y todas las filas existentes de esas claves cerradas.
create or replace view public.v_diagnostic_completeness with (security_invoker = true) as
select d.id as diagnostic_id,
  (select bool_and(i.estado='validado_r1') from public.document_checklist_items i where i.diagnostic_id=d.id) as p1_documentos,
  d.cat_estado='validado_r2' as p2_cat,
  (select bool_and(a.verificado_v1) from public.iih_assets a where a.diagnostic_id=d.id) as p3_iih,
  (exists (select 1 from public.samples s where s.diagnostic_id=d.id and (select count(*) from public.custody_transfers ct where ct.sample_id=s.id and ct.firma is not null and length(btrim(ct.firma))>0)=3)) as p4_custodia,
  (select bool_and(wb.estado='validado_r3') from public.water_balances wb where wb.diagnostic_id=d.id) as p5_bhe,
  (exists (select 1 from public.lab_results lr join public.samples s on s.id=lr.sample_id where s.diagnostic_id=d.id and lr.dictamen is not null)) as p6_lab,
  (select count(distinct le.clave)=8
     and bool_and(le.estado='cerrada')
     and count(*) filter (where le.estado in ('abierta','en_revision'))=0
   from public.logbook_entries le
   where le.diagnostic_id=d.id and le.clave in ('V1','V2','V3','R1','R2','R3','R4','R5')) as p7_bitacoras,
  (select count(distinct e.factor_code)=6 from public.ivoh_evaluations e join public.ivoh_factors f on f.version_id=e.version_id and f.factor_code=e.factor_code where e.diagnostic_id=d.id and e.version_id=d.index_version_id and e.estado='validado_r4') as p8_ivoh,
  (exists (select 1 from public.alternatives a where a.diagnostic_id=d.id and a.validado_r4)) as p9_alternativas,
  ((select count(*) from public.photo_log p join public.logbook_entries le on le.id=p.entry_id where le.diagnostic_id=d.id)>=8) as p10_fotos
from public.diagnostics d;

create or replace function public.fn_logbook_gate(p_diagnostic_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select count(distinct le.clave)=8
     and bool_and(le.estado='cerrada')
     and count(*) filter (where le.estado in ('abierta','en_revision'))=0
  from public.logbook_entries le
  where le.diagnostic_id=p_diagnostic_id and le.clave in ('V1','V2','V3','R1','R2','R3','R4','R5');
$$;
revoke all on function public.fn_logbook_gate(uuid) from public,anon,authenticated;
grant execute on function public.fn_logbook_gate(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- RPC EF-02
-- ---------------------------------------------------------------------------
create or replace function public.fn_submit_logbook_review(p_user_id uuid,p_entry_id uuid,p_idempotency_key text default null,p_request_hash text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_key text:=nullif(p_idempotency_key,''); v_existing public.api_idempotency%rowtype; v_role text; v_e public.logbook_entries%rowtype; v_audit text; v_resp jsonb;
begin
  if p_user_id is null or p_entry_id is null then return jsonb_build_object('ok',false,'code','VALIDATION_PARAMETRO_REQUERIDO','message','Parámetros incompletos.'); end if;
  if v_key is not null then
    perform pg_advisory_xact_lock(hashtext('EF-02.submit-review:'||p_user_id::text||':'||v_key));
    select * into v_existing from public.api_idempotency where user_id=p_user_id and endpoint='EF-02.submit-review' and key=v_key;
    if found then
      if v_existing.request_hash is distinct from coalesce(p_request_hash,'') then return jsonb_build_object('ok',false,'code','CONFLICT_STATE','message','Idempotency-Key reutilizada.'); end if;
      if v_existing.response_body is not null then return v_existing.response_body || jsonb_build_object('replayed',true); end if;
    end if;
  end if;
  select * into v_e from public.logbook_entries where id=p_entry_id for update;
  if not found then return jsonb_build_object('ok',false,'code','FORBIDDEN_NOT_MEMBER','message','Ficha inexistente.'); end if;
  v_role:=public.fn_diag_role(p_user_id,v_e.diagnostic_id);
  if v_role is null or v_role not in ('coordinador','equipo') then return jsonb_build_object('ok',false,'code','FORBIDDEN_ROLE','message','Solo coordinador/equipo.'); end if;
  if v_e.estado<>'abierta' then return jsonb_build_object('ok',false,'code','CONFLICT_STATE','message','La ficha no está abierta.'); end if;
  update public.logbook_entries set estado='en_revision',version=version+1 where id=p_entry_id;
  v_audit:=public.fn_audit_write(p_user_id,'update','logbook_entries',p_entry_id::text,jsonb_build_object('estado_nuevo','en_revision'));
  v_resp:=jsonb_build_object('ok',true,'replayed',false,'data',jsonb_build_object('entry_id',p_entry_id,'estado','en_revision'),'audit_ref','audit:'||v_audit);
  if v_key is not null then insert into public.api_idempotency(user_id,endpoint,key,request_hash,status_code,response_body,response_ref,completed_at) values (p_user_id,'EF-02.submit-review',v_key,coalesce(p_request_hash,''),200,v_resp,'audit:'||v_audit,now()); end if;
  return v_resp;
end; $$;
revoke all on function public.fn_submit_logbook_review(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.fn_submit_logbook_review(uuid,uuid,text,text) to service_role;

create or replace function public.fn_sign_logbook_participant(p_user_id uuid,p_entry_id uuid,p_participante_nombre text,p_idempotency_key text default null,p_request_hash text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_key text:=nullif(p_idempotency_key,''); v_existing public.api_idempotency%rowtype; v_role text; v_e public.logbook_entries%rowtype; v_audit text; v_resp jsonb;
begin
  if p_user_id is null or p_entry_id is null or nullif(btrim(p_participante_nombre),'') is null then return jsonb_build_object('ok',false,'code','VALIDATION_PARAMETRO_REQUERIDO','message','Parámetros incompletos.'); end if;
  if v_key is not null then
    perform pg_advisory_xact_lock(hashtext('EF-02.sign:'||p_user_id::text||':'||v_key));
    select * into v_existing from public.api_idempotency where user_id=p_user_id and endpoint='EF-02.sign' and key=v_key;
    if found then
      if v_existing.request_hash is distinct from coalesce(p_request_hash,'') then return jsonb_build_object('ok',false,'code','CONFLICT_STATE','message','Idempotency-Key reutilizada.'); end if;
      if v_existing.response_body is not null then return v_existing.response_body || jsonb_build_object('replayed',true); end if;
    end if;
  end if;
  select * into v_e from public.logbook_entries where id=p_entry_id for update;
  if not found then return jsonb_build_object('ok',false,'code','FORBIDDEN_NOT_MEMBER','message','Ficha inexistente.'); end if;
  v_role:=public.fn_diag_role(p_user_id,v_e.diagnostic_id);
  if v_role is null or v_role not in ('coordinador','equipo') then return jsonb_build_object('ok',false,'code','FORBIDDEN_ROLE','message','Solo coordinador/equipo.'); end if;
  if v_e.estado not in ('abierta','en_revision') then return jsonb_build_object('ok',false,'code','CONFLICT_STATE','message','La ficha no admite firma.'); end if;
  if not exists (select 1 from public.logbook_participants where entry_id=p_entry_id and nombre=p_participante_nombre) then return jsonb_build_object('ok',false,'code','VALIDATION_FIRMAS','message','Participante no encontrado.'); end if;
  if exists (select 1 from public.logbook_participants where entry_id=p_entry_id and nombre=p_participante_nombre and firma_ts is not null) then
    return jsonb_build_object('ok',false,'code','CONFLICT_STATE','message','El participante ya firmó.');
  end if;
  update public.logbook_participants set firma_ts=now() where entry_id=p_entry_id and nombre=p_participante_nombre;
  v_audit:=public.fn_audit_write(p_user_id,'update','logbook_participants',p_entry_id::text,jsonb_build_object('participante',p_participante_nombre));
  v_resp:=jsonb_build_object('ok',true,'replayed',false,'data',jsonb_build_object('entry_id',p_entry_id,'participante',p_participante_nombre,'firma_ts',now()),'audit_ref','audit:'||v_audit);
  if v_key is not null then insert into public.api_idempotency(user_id,endpoint,key,request_hash,status_code,response_body,response_ref,completed_at) values (p_user_id,'EF-02.sign',v_key,coalesce(p_request_hash,''),200,v_resp,'audit:'||v_audit,now()); end if;
  return v_resp;
end; $$;
revoke all on function public.fn_sign_logbook_participant(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.fn_sign_logbook_participant(uuid,uuid,text,text,text) to service_role;

create or replace function public.fn_close_logbook(p_user_id uuid,p_entry_id uuid,p_cierre_razon text default null,p_idempotency_key text default null,p_request_hash text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_key text:=nullif(p_idempotency_key,''); v_existing public.api_idempotency%rowtype;
  v_role text; v_e public.logbook_entries%rowtype; v_tpl public.logbook_templates%rowtype;
  v_event timestamptz; v_late boolean; v_required int; v_signed int; v_n int; v_ok int;
  v_audit text; v_resp jsonb; v_prev jsonb;
begin
  if p_user_id is null or p_entry_id is null then return jsonb_build_object('ok',false,'code','VALIDATION_PARAMETRO_REQUERIDO','message','Parámetros incompletos.'); end if;
  if v_key is not null then
    perform pg_advisory_xact_lock(hashtext('EF-02.close:'||p_user_id::text||':'||v_key));
    select * into v_existing from public.api_idempotency where user_id=p_user_id and endpoint='EF-02.close' and key=v_key;
    if found then
      if v_existing.request_hash is distinct from coalesce(p_request_hash,'') then return jsonb_build_object('ok',false,'code','CONFLICT_STATE','message','Idempotency-Key reutilizada.'); end if;
      if v_existing.response_body is not null then return v_existing.response_body || jsonb_build_object('replayed',true); end if;
    end if;
  end if;
  select * into v_e from public.logbook_entries where id=p_entry_id for update;
  if not found then return jsonb_build_object('ok',false,'code','FORBIDDEN_NOT_MEMBER','message','Ficha inexistente.'); end if;
  v_role:=public.fn_diag_role(p_user_id,v_e.diagnostic_id);
  if v_role is null or v_role not in ('coordinador','equipo') then return jsonb_build_object('ok',false,'code','FORBIDDEN_ROLE','message','Solo coordinador/equipo.'); end if;
  if v_e.estado<>'en_revision' then return jsonb_build_object('ok',false,'code','CONFLICT_STATE','message','La ficha no está en revisión.'); end if;
  select * into v_tpl from public.logbook_templates where clave=v_e.clave;
  select count(*) into v_required from unnest(string_to_array(v_tpl.asistentes_requeridos,'·')) s where btrim(s)<>'';
  select count(distinct nombre) into v_signed from public.logbook_participants where entry_id=p_entry_id and firma_ts is not null;
  if v_signed < v_required then return jsonb_build_object('ok',false,'code','VALIDATION_FIRMAS','message','Firmas insuficientes.'); end if;
  select count(*) into v_n from jsonb_array_elements(v_tpl.agenda_items);
  select count(*) into v_ok from public.logbook_agenda a where a.entry_id=p_entry_id and a.no between 1 and v_n;
  if v_ok < v_n or exists (select 1 from public.logbook_agenda a where a.entry_id=p_entry_id and a.estado in ('no_realizado','modificado') and nullif(btrim(coalesce(a.resultado,'')),'') is null) then
    return jsonb_build_object('ok',false,'code','VALIDATION_AGENDA','message','Agenda incompleta.');
  end if;
  select count(*) into v_n from jsonb_array_elements(v_tpl.evidence_items);
  if exists (
    select 1 from jsonb_array_elements_text(v_tpl.evidence_items) it
    where not exists (
      select 1 from public.logbook_evidence e
      where e.entry_id=p_entry_id and e.item=it.value and e.document_id is not null
    )
  ) then
    return jsonb_build_object('ok',false,'code','VALIDATION_EVIDENCIA','message','Evidencia obligatoria incompleta.');
  end if;
  v_event := ((v_e.fecha + v_e.horario_inicio) at time zone 'America/Mexico_City');
  v_late := now() > v_event + interval '24 hours';
  if v_late and (p_cierre_razon is null or length(btrim(p_cierre_razon)) < 20) then
    return jsonb_build_object('ok',false,'code','VALIDATION_RAZON','message','Cierre tardío requiere razón de al menos 20 caracteres.','details',jsonb_build_object('requiere_razon',true,'event_ts',v_event));
  end if;
  v_prev := to_jsonb(v_e);
  update public.logbook_entries set estado='cerrada',cerrada_en=now(),cerrada_razon=nullif(btrim(coalesce(p_cierre_razon,'')),''),version=version+1,cierre_tardio=v_late where id=p_entry_id;
  insert into public.logbook_change_log(entry_id,version,descripcion,responsable,prev)
  values (p_entry_id,v_e.version+1,'cierre de ficha',p_user_id,v_prev);
  v_audit:=public.fn_audit_write(p_user_id,'sign','logbook_entries',p_entry_id::text,jsonb_build_object('cierre_tardio',v_late,'razon',p_cierre_razon,'version',v_e.version+1));
  update public.diagnostics set bitacora_cerrada=public.fn_logbook_gate(v_e.diagnostic_id) where id=v_e.diagnostic_id;
  v_resp:=jsonb_build_object('ok',true,'replayed',false,'data',jsonb_build_object('entry_id',p_entry_id,'folio',v_e.folio,'clave',v_e.clave,'cerrada_en',now(),'version',v_e.version+1,'cierre_tardio',v_late),'audit_ref','audit:'||v_audit);
  if v_key is not null then insert into public.api_idempotency(user_id,endpoint,key,request_hash,status_code,response_body,response_ref,completed_at) values (p_user_id,'EF-02.close',v_key,coalesce(p_request_hash,''),200,v_resp,'audit:'||v_audit,now()); end if;
  return v_resp;
end; $$;
revoke all on function public.fn_close_logbook(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.fn_close_logbook(uuid,uuid,text,text,text) to service_role;
