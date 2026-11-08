-- F1-00 — pgTAP: M-03 folio de reporte, M-04 BHE y M-08 completitud
begin;

select plan(9);

insert into public.organizations (id, name, org_type)
values ('11111111-1111-4111-8111-111111111111','Org pgTAP BHE','srhds');
insert into public.companies (id, organization_id, razon_social, nombre_planta, giro,
  calle, colonia_parque, cp, municipio, organismo_operador)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111',
  'Empresa BHE','Planta','manufacturera','Calle','Parque','87000','Victoria','COMAPA');
insert into public.diagnostics (id, organization_id, company_id, tipo, fecha_inicio,
  fecha_fin, index_version_id)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','inicial','2026-01-01','2026-02-12',
  '00000000-0000-4000-8000-0000000000a1');
insert into public.water_balances (id, organization_id, diagnostic_id, periodo_anio,
  mes_inicio, estado)
values ('12121212-1212-4212-8212-121212121212','11111111-1111-4111-8111-111111111111',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',2026,1,'en_captura');
insert into public.balance_flows (balance_id, catalog_code, mes, volumen_m3)
select '12121212-1212-4212-8212-121212121212'::uuid,'ENT-01',m,100 from generate_series(1,12) m
union all
select '12121212-1212-4212-8212-121212121212'::uuid,'DST-01',m,87.4 from generate_series(1,12) m;

-- M-04: RPC sin filtro de estado y brecha ponderada
select is((select count(*) from public.fn_bhe_monthly('12121212-1212-4212-8212-121212121212')),
  12::bigint, 'fn_bhe_monthly calcula 12 meses sobre un balance en_captura');
select is((select brecha_pct from public.fn_bhe_monthly('12121212-1212-4212-8212-121212121212') where mes=7),
  12.6::numeric, 'julio tiene brecha 12.6 % aun sin validar R3');
select is((select brecha_anual_pct from public.fn_bhe_summary('12121212-1212-4212-8212-121212121212')),
  12.6::numeric, 'brecha anual ponderada por volumen = 12.6 %');
select is((select meses_sobre_umbral from public.fn_bhe_summary('12121212-1212-4212-8212-121212121212')),
  12, 'los 12 meses superan el umbral 10 %');

-- M-03: folio server-side -R1/-R2
insert into public.report_emissions (diagnostic_id, matriz) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','[]'::jsonb);
insert into public.report_emissions (diagnostic_id, matriz) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','[]'::jsonb);
select is((select folio from public.report_emissions where diagnostic_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' and revision=1),
  (select folio from public.diagnostics where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') || '-R1',
  'primera emisión usa {folio}-R1');
select is((select folio from public.report_emissions where diagnostic_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' and revision=2),
  (select folio from public.diagnostics where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') || '-R2',
  'segunda emisión usa {folio}-R2 y no sobrescribe');

-- M-08: función de completitud
select is((select count(*) from public.fn_completeness('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')),
  10::bigint, 'fn_completeness devuelve los 10 requisitos');
select is((select reporte_emitible from public.fn_completeness('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') limit 1),
  false, 'reporte_emitible=false si falta cualquier requisito');
select is((select p5_bhe from public.v_diagnostic_completeness where diagnostic_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  false, 'p5_bhe refleja que el balance sigue en_captura');

select * from finish();
rollback;
