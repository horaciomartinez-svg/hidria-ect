-- F1-11 cierres QA: LB-01/02, 24 h lÃ­mite, RLS/ACL, idempotencia, p7 y post-cierre.
begin;
select plan(24);
create or replace function public.qa_lb_folio() returns trigger language plpgsql as $$
begin
  if new.folio is null then new.folio := 'QA-' || replace(new.id::text,'-',''); end if;
  return new;
end; $$;
drop trigger if exists qa_lb_folio on public.logbook_entries;
create trigger qa_lb_folio before insert on public.logbook_entries for each row execute function public.qa_lb_folio();

insert into public.organizations (id,name,org_type) values
  ('ae000000-0000-4000-8000-0000000000a1','Org LB QA','srhds'),
  ('ae000000-0000-4000-8000-0000000000b1','Org LB B','empresa');
insert into auth.users (id,aud,role,email,created_at,updated_at) values
  ('ce000000-0000-4000-8000-000000000001','authenticated','authenticated','coorda@example.invalid',now(),now()),
  ('ce000000-0000-4000-8000-000000000002','authenticated','authenticated','equipoa@example.invalid',now(),now()),
  ('ce000000-0000-4000-8000-000000000003','authenticated','authenticated','obsa@example.invalid',now(),now());
insert into public.profiles (user_id,organization_id,full_name,email,global_role) values
  ('ce000000-0000-4000-8000-000000000001','ae000000-0000-4000-8000-0000000000a1','Coord A','coorda@example.invalid','coordinador_srhds'),
  ('ce000000-0000-4000-8000-000000000002','ae000000-0000-4000-8000-0000000000a1','Equipo A','equipoa@example.invalid','equipo'),
  ('ce000000-0000-4000-8000-000000000003','ae000000-0000-4000-8000-0000000000a1','Obs A','obsa@example.invalid','observador');
insert into public.companies (id,organization_id,razon_social,nombre_planta,giro,calle,colonia_parque,cp,municipio,organismo_operador) values
  ('be000000-0000-4000-8000-000000000001','ae000000-0000-4000-8000-0000000000a1','Empresa A','Planta A','manufacturera','Calle','Parque','87000','Victoria','COMAPA'),
  ('be000000-0000-4000-8000-000000000002','ae000000-0000-4000-8000-0000000000b1','Empresa B','Planta B','manufacturera','Calle','Parque','87000','Victoria','COMAPA');
insert into public.diagnostics (id,organization_id,company_id,tipo,fecha_inicio,fecha_fin,index_version_id) values
  ('de000000-0000-4000-8000-000000000001','ae000000-0000-4000-8000-0000000000a1','be000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12','00000000-0000-4000-8000-0000000000a1'),
  ('de000000-0000-4000-8000-000000000002','ae000000-0000-4000-8000-0000000000a1','be000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12','00000000-0000-4000-8000-0000000000a1'),
  ('de000000-0000-4000-8000-000000000003','ae000000-0000-4000-8000-0000000000b1','be000000-0000-4000-8000-000000000002','inicial','2026-01-01','2026-02-12','00000000-0000-4000-8000-0000000000a1');
insert into public.project_members (diagnostic_id,user_id,organization_id,role) values
  ('de000000-0000-4000-8000-000000000001','ce000000-0000-4000-8000-000000000001','ae000000-0000-4000-8000-0000000000a1','coordinador'),
  ('de000000-0000-4000-8000-000000000001','ce000000-0000-4000-8000-000000000002','ae000000-0000-4000-8000-0000000000a1','equipo'),
  ('de000000-0000-4000-8000-000000000001','ce000000-0000-4000-8000-000000000003','ae000000-0000-4000-8000-0000000000a1','observador'),
  ('de000000-0000-4000-8000-000000000002','ce000000-0000-4000-8000-000000000001','ae000000-0000-4000-8000-0000000000a1','coordinador');
insert into public.documents (id,organization_id,diagnostic_id,doc_type,title,r2_key,sha256,mime,size_bytes,uploaded_by) values
  ('fe000000-0000-4000-8000-000000000001','ae000000-0000-4000-8000-0000000000a1','de000000-0000-4000-8000-000000000001','otro','a.pdf','qa/a.pdf',repeat('a',64),'application/pdf',10,'ce000000-0000-4000-8000-000000000001'),
  ('fe000000-0000-4000-8000-000000000002','ae000000-0000-4000-8000-0000000000b1','de000000-0000-4000-8000-000000000003','otro','b.pdf','qa/b.pdf',repeat('b',64),'application/pdf',10,'ce000000-0000-4000-8000-000000000001'),
  ('fe000000-0000-4000-8000-000000000003','ae000000-0000-4000-8000-0000000000a1','de000000-0000-4000-8000-000000000002','otro','d.pdf','qa/d.pdf',repeat('d',64),'application/pdf',10,'ce000000-0000-4000-8000-000000000001');
-- dA: 7 cerradas + R1 abierta (para bitacora_cerrada 8/8).
insert into public.logbook_entries (id,diagnostic_id,clave,fecha,horario_inicio,responsable_sesion,estado,cerrada_en,created_by) values
  ('ee000000-0000-4000-8000-000000000001','de000000-0000-4000-8000-000000000001','V1',current_date,'09:00','Coord','cerrada',now(),'ce000000-0000-4000-8000-000000000001'),
  ('ee000000-0000-4000-8000-000000000002','de000000-0000-4000-8000-000000000001','V2',current_date,'09:00','Coord','cerrada',now(),'ce000000-0000-4000-8000-000000000001'),
  ('ee000000-0000-4000-8000-000000000003','de000000-0000-4000-8000-000000000001','V3',current_date,'09:00','Coord','cerrada',now(),'ce000000-0000-4000-8000-000000000001'),
  ('ee000000-0000-4000-8000-000000000004','de000000-0000-4000-8000-000000000001','R2',current_date,'09:00','Coord','cerrada',now(),'ce000000-0000-4000-8000-000000000001'),
  ('ee000000-0000-4000-8000-000000000005','de000000-0000-4000-8000-000000000001','R3',current_date,'09:00','Coord','cerrada',now(),'ce000000-0000-4000-8000-000000000001'),
  ('ee000000-0000-4000-8000-000000000006','de000000-0000-4000-8000-000000000001','R4',current_date,'09:00','Coord','cerrada',now(),'ce000000-0000-4000-8000-000000000001'),
  ('ee000000-0000-4000-8000-000000000007','de000000-0000-4000-8000-000000000001','R5',current_date,'09:00','Coord','cerrada',now(),'ce000000-0000-4000-8000-000000000001'),
  ('ee000000-0000-4000-8000-000000000008','de000000-0000-4000-8000-000000000001','R1',current_date,'09:00','Coord','abierta',null,'ce000000-0000-4000-8000-000000000001');
insert into public.logbook_entries (id,diagnostic_id,clave,folio,fecha,horario_inicio,responsable_sesion,created_by) values
  ('ee000000-0000-4000-8000-000000000009','de000000-0000-4000-8000-000000000002','R2','BIT-QA-D2-01',current_date,'09:00','Coord','ce000000-0000-4000-8000-000000000001'),
  ('ee000000-0000-4000-8000-00000000000a','de000000-0000-4000-8000-000000000002','R3','BIT-QA-D2-02',current_date,'09:00','Coord','ce000000-0000-4000-8000-000000000001');
insert into public.logbook_participants (entry_id,nombre,cargo,institucion) values
  ('ee000000-0000-4000-8000-000000000008','DirecciÃ³n','DirecciÃ³n','Empresa'),
  ('ee000000-0000-4000-8000-000000000008','Responsable','Planta','Empresa'),
  ('ee000000-0000-4000-8000-000000000008','TÃ©cnico','TÃ©cnico','SRHDS'),
  ('ee000000-0000-4000-8000-00000000000a','Contraparte','TÃ©cnica','Empresa'),
  ('ee000000-0000-4000-8000-00000000000a','TÃ©cnico2','TÃ©cnico','SRHDS');
update public.logbook_evidence set document_id='fe000000-0000-4000-8000-000000000001' where entry_id='ee000000-0000-4000-8000-000000000008';

set local role service_role;
set local request.jwt.claims='{}';
select is((public.fn_submit_logbook_review('ce000000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000009')->>'ok'),'true','submit R2');
select is((public.fn_close_logbook('ce000000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000009')->>'code'),'VALIDATION_FIRMAS','LB-01 firmas faltantes');
select is((public.fn_submit_logbook_review('ce000000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-00000000000a')->>'ok'),'true','submit R3');
select is((public.fn_sign_logbook_participant('ce000000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-00000000000a','Contraparte')->>'ok'),'true','firma R3-1');
select is((public.fn_sign_logbook_participant('ce000000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-00000000000a','TÃ©cnico2')->>'ok'),'true','firma R3-2');
update public.logbook_agenda set estado='no_realizado', resultado=null where entry_id='ee000000-0000-4000-8000-00000000000a' and no=1;
select is((public.fn_close_logbook('ce000000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-00000000000a')->>'code'),'VALIDATION_AGENDA','LB-02 agenda sin resultado');

select is((public.fn_submit_logbook_review('ce000000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000008')->>'ok'),'true','submit R1');
select is((public.fn_sign_logbook_participant('ce000000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000008','DirecciÃ³n')->>'ok'),'true','firma R1-1');
select is((public.fn_sign_logbook_participant('ce000000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000008','Responsable')->>'ok'),'true','firma R1-2');
select is((public.fn_sign_logbook_participant('ce000000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000008','TÃ©cnico')->>'ok'),'true','firma R1-3');
select is((public.fn_close_logbook('ce000000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000008','k1','h1')->>'ok'),'true','close R1');
select is((public.fn_close_logbook('ce000000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000008','k1','h1')->>'replayed'),'true','replay close');
select is((public.fn_close_logbook('ce000000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000008','k1','h2')->>'code'),'CONFLICT_STATE','conflicto idempotencia');
select is((select bitacora_cerrada from public.diagnostics where id='de000000-0000-4000-8000-000000000001'),true,'bitacora_cerrada 8/8');
select is((select p7_bitacoras from public.v_diagnostic_completeness where diagnostic_id='de000000-0000-4000-8000-000000000001'),true,'p7 8/8');
select is((select count(*) from public.logbook_change_log where entry_id='ee000000-0000-4000-8000-000000000008'),1::bigint,'change_log cierre');
select is((select count(*) from public.audit_log where entity='logbook_entries' and action='sign'),1::bigint,'audit sign cierre');
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims='{"sub":"ce000000-0000-4000-8000-000000000003","organization_id":"ae000000-0000-4000-8000-0000000000a1","global_role":"observador"}';
select is((select count(*) from public.logbook_entries where diagnostic_id='de000000-0000-4000-8000-000000000001'),8::bigint,'observador lee 8');
select is((select count(*) from public.logbook_entries where diagnostic_id='de000000-0000-4000-8000-000000000003'),0::bigint,'cross-tenant 0');
with upd as (update public.logbook_participants set firma_ts=now() where entry_id='ee000000-0000-4000-8000-000000000008' returning 1)
select is((select count(*) from upd),0::bigint,'observador no firma');
select throws_ok($sql$ update public.logbook_entries set estado='abierta' where id='ee000000-0000-4000-8000-000000000008' $sql$,'42501',NULL,'post-cierre entry 42501');
select throws_ok($sql$ delete from public.logbook_agenda where entry_id='ee000000-0000-4000-8000-000000000008' $sql$,'42501',NULL,'post-cierre delete agenda 42501');
select throws_ok($sql$ update public.logbook_participants set firma_ts=now() where entry_id='ee000000-0000-4000-8000-000000000008' $sql$,'42501',NULL,'firma directa 42501');
reset role;
reset request.jwt.claims;

select ok(not has_function_privilege('authenticated','public.fn_close_logbook(uuid,uuid,text,text,text)','EXECUTE'),'ACL close negativa');
select * from finish();
rollback;