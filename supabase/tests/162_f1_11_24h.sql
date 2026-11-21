-- F1-11 límite 24 h: +1 s normal, -1 s tardío (TD-8).
begin;
select plan(12);

insert into public.organizations (id,name,org_type) values ('af000000-0000-4000-8000-0000000000a1','Org LB 24h','srhds');
insert into auth.users (id,aud,role,email,created_at,updated_at) values ('cf000000-0000-4000-8000-000000000001','authenticated','authenticated','coord24@example.invalid',now(),now());
insert into public.profiles (user_id,organization_id,full_name,email,global_role) values ('cf000000-0000-4000-8000-000000000001','af000000-0000-4000-8000-0000000000a1','Coord 24','coord24@example.invalid','coordinador_srhds');
insert into public.companies (id,organization_id,razon_social,nombre_planta,giro,calle,colonia_parque,cp,municipio,organismo_operador) values ('bf000000-0000-4000-8000-000000000001','af000000-0000-4000-8000-0000000000a1','Empresa 24','Planta 24','manufacturera','Calle','Parque','87000','Victoria','COMAPA');
insert into public.diagnostics (id,organization_id,company_id,tipo,fecha_inicio,fecha_fin,index_version_id) values ('df000000-0000-4000-8000-000000000001','af000000-0000-4000-8000-0000000000a1','bf000000-0000-4000-8000-000000000001','inicial','2026-01-01','2026-02-12','00000000-0000-4000-8000-0000000000a1');
insert into public.project_members (diagnostic_id,user_id,organization_id,role) values ('df000000-0000-4000-8000-000000000001','cf000000-0000-4000-8000-000000000001','af000000-0000-4000-8000-0000000000a1','coordinador');
insert into public.documents (id,organization_id,diagnostic_id,doc_type,title,r2_key,sha256,mime,size_bytes,uploaded_by) values ('ff000000-0000-4000-8000-000000000001','af000000-0000-4000-8000-0000000000a1','df000000-0000-4000-8000-000000000001','otro','24.pdf','24/a.pdf',repeat('a',64),'application/pdf',10,'cf000000-0000-4000-8000-000000000001');
insert into public.logbook_entries (id,diagnostic_id,clave,folio,fecha,horario_inicio,responsable_sesion,created_by) values
  ('ef000000-0000-4000-8000-000000000001','df000000-0000-4000-8000-000000000001','R1','BIT-R1-24N',((now() - interval '24 hours' + interval '1 second') at time zone 'America/Mexico_City')::date,((now() - interval '24 hours' + interval '1 second') at time zone 'America/Mexico_City')::time,'Coord','cf000000-0000-4000-8000-000000000001'),
  ('ef000000-0000-4000-8000-000000000002','df000000-0000-4000-8000-000000000001','R1','BIT-R1-24L',((now() - interval '24 hours' - interval '1 second') at time zone 'America/Mexico_City')::date,((now() - interval '24 hours' - interval '1 second') at time zone 'America/Mexico_City')::time,'Coord','cf000000-0000-4000-8000-000000000001');
insert into public.logbook_participants(entry_id,nombre,cargo,institucion) values
  ('ef000000-0000-4000-8000-000000000001','D1','C','Empresa'),('ef000000-0000-4000-8000-000000000001','D2','C','Empresa'),('ef000000-0000-4000-8000-000000000001','D3','C','SRHDS'),
  ('ef000000-0000-4000-8000-000000000002','D1','C','Empresa'),('ef000000-0000-4000-8000-000000000002','D2','C','Empresa'),('ef000000-0000-4000-8000-000000000002','D3','C','SRHDS');
update public.logbook_evidence set document_id='ff000000-0000-4000-8000-000000000001' where entry_id in ('ef000000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000002');

set local role service_role;
set local request.jwt.claims='{}';
select is((public.fn_submit_logbook_review('cf000000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000001')->>'ok'),'true','submit normal');
select is((public.fn_sign_logbook_participant('cf000000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000001','D1')->>'ok'),'true','firma N1');
select is((public.fn_sign_logbook_participant('cf000000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000001','D2')->>'ok'),'true','firma N2');
select is((public.fn_sign_logbook_participant('cf000000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000001','D3')->>'ok'),'true','firma N3');
select is((public.fn_close_logbook('cf000000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000001'))->>'ok','true','+1 s cierra normal');
select is((public.fn_submit_logbook_review('cf000000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000002')->>'ok'),'true','submit tardío');
select is((public.fn_sign_logbook_participant('cf000000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000002','D1')->>'ok'),'true','firma L1');
select is((public.fn_sign_logbook_participant('cf000000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000002','D2')->>'ok'),'true','firma L2');
select is((public.fn_sign_logbook_participant('cf000000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000002','D3')->>'ok'),'true','firma L3');
select is((public.fn_close_logbook('cf000000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000002'))->>'code','VALIDATION_RAZON','-1 s exige razón');
select is((public.fn_close_logbook('cf000000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000002','Justificación válida de cierre tardío'))->>'ok','true','-1 s con razón cierra');
select is((select cierre_tardio from public.logbook_entries where id='ef000000-0000-4000-8000-000000000002'),true,'cierre_tardio true');
reset role;
select * from finish();
rollback;
