-- ============================================================================
-- F1-00 / M-06 — RPC de rol/membresía para service_role (H-01)
-- F1-00 / M-08 — Función de completitud 10/10 alineada a
--                v_diagnostic_completeness (TD-4 / Q-03)
-- Forward-only e idempotente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- M-06.1  Las funciones RLS usan auth.uid(); una Edge Function con service_role
--         no tiene auth.uid(). Se exponen versiones parametrizadas idénticas.
-- ---------------------------------------------------------------------------
create or replace function public.fn_diag_role(p_user_id uuid, p_diagnostic_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select pm.role
    from public.project_members pm
   where pm.diagnostic_id = p_diagnostic_id
     and pm.user_id = p_user_id
   limit 1;
$$;

create or replace function public.fn_is_diag_member(p_user_id uuid, p_diagnostic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.project_members pm
     where pm.diagnostic_id = p_diagnostic_id
       and pm.user_id = p_user_id
  );
$$;

revoke all on function public.fn_diag_role(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fn_is_diag_member(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_diag_role(uuid, uuid) to service_role;
grant execute on function public.fn_is_diag_member(uuid, uuid) to service_role;

comment on function public.fn_diag_role(uuid, uuid) is
  'F1-00/M-06: equivalente parametrizado de my_diagnostic_role() para EF con service_role. Solo service_role.';
comment on function public.fn_is_diag_member(uuid, uuid) is
  'F1-00/M-06: equivalente parametrizado de is_diagnostic_member() para EF con service_role. Solo service_role.';

-- ---------------------------------------------------------------------------
-- M-08.1  v_diagnostic_completeness: se alinean dos requisitos con los gates
--         metodológicos de F1-00/H-5:
--           p4 custodia = 3 transferencias FIRMADAS (firma no nula/no vacía)
--           p8 IVOH     = 6/6 factores validados en R4
--         El resto de columnas conserva su definición (compatibilidad).
-- ---------------------------------------------------------------------------
create or replace view public.v_diagnostic_completeness as
select
  d.id as diagnostic_id,
  (select bool_and(i.estado = 'validado_r1')
     from public.document_checklist_items i
    where i.diagnostic_id = d.id) as p1_documentos,
  (d.cat_estado = 'validado_r2') as p2_cat,
  (select bool_and(a.verificado_v1)
     from public.iih_assets a
    where a.diagnostic_id = d.id) as p3_iih,
  (exists (
    select 1
      from public.samples s
     where s.diagnostic_id = d.id
       and (select count(*)
              from public.custody_transfers ct
             where ct.sample_id = s.id
               and ct.firma is not null
               and length(btrim(ct.firma)) > 0) = 3
  )) as p4_custodia,
  (select bool_and(wb.estado = 'validado_r3')
     from public.water_balances wb
    where wb.diagnostic_id = d.id) as p5_bhe,
  (exists (
    select 1
      from public.lab_results lr
      join public.samples s on s.id = lr.sample_id
     where s.diagnostic_id = d.id
       and lr.dictamen is not null
  )) as p6_lab,
  (select count(*) = 8 and bool_and(le.estado = 'cerrada')
     from public.logbook_entries le
    where le.diagnostic_id = d.id) as p7_bitacoras,
  ((select count(*)
      from public.ivoh_evaluations e
     where e.diagnostic_id = d.id
       and e.estado = 'validado_r4') = 6) as p8_ivoh,
  (exists (
    select 1
      from public.alternatives a
     where a.diagnostic_id = d.id
       and a.validado_r4
  )) as p9_alternativas,
  ((select count(*)
      from public.photo_log p
      join public.logbook_entries le on le.id = p.entry_id
     where le.diagnostic_id = d.id) >= 8) as p10_fotos
from public.diagnostics d;

-- ---------------------------------------------------------------------------
-- M-08.2  fn_completeness: matriz de 10 requisitos con orden/nombre/verificado_en
--         y reporte_emitible. Es invoker: respeta RLS de la vista y de las
--         tablas base para authenticated; service_role la usa desde EF-07.
-- ---------------------------------------------------------------------------
create or replace function public.fn_completeness(p_diagnostic_id uuid)
returns table (
  orden            smallint,
  nombre           text,
  verificado_en    text,
  ok               boolean,
  reporte_emitible boolean
)
language sql
stable
set search_path = public, pg_temp
as $$
  with vc as (
    select *
      from public.v_diagnostic_completeness
     where diagnostic_id = p_diagnostic_id
  ),
  flags as (
    select 1::smallint as orden, vc.p1_documentos as ok from vc
    union all select 2::smallint, vc.p2_cat           from vc
    union all select 3::smallint, vc.p3_iih           from vc
    union all select 4::smallint, vc.p4_custodia      from vc
    union all select 5::smallint, vc.p5_bhe           from vc
    union all select 6::smallint, vc.p6_lab           from vc
    union all select 7::smallint, vc.p7_bitacoras     from vc
    union all select 8::smallint, vc.p8_ivoh          from vc
    union all select 9::smallint, vc.p9_alternativas  from vc
    union all select 10::smallint, vc.p10_fotos       from vc
  ),
  agg as (
    select coalesce(bool_and(coalesce(ok, false)), false) as emitible
      from flags
  )
  select
    ci.orden,
    ci.nombre,
    ci.verificado_en,
    coalesce(f.ok, false) as ok,
    a.emitible as reporte_emitible
  from public.completeness_items ci
  left join flags f on f.orden = ci.orden
  cross join agg a
  order by ci.orden;
$$;

create or replace function public.fn_reporte_emitible(p_diagnostic_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(bool_and(ok), false)
    from public.fn_completeness(p_diagnostic_id);
$$;

revoke all on function public.fn_completeness(uuid) from public, anon;
revoke all on function public.fn_reporte_emitible(uuid) from public, anon;
grant execute on function public.fn_completeness(uuid) to authenticated, service_role;
grant execute on function public.fn_reporte_emitible(uuid) to authenticated, service_role;

comment on function public.fn_completeness(uuid) is
  'F1-00/M-08: matriz 10/10 desde completeness_items + v_diagnostic_completeness; reporte_emitible = AND de los 10.';
comment on function public.fn_reporte_emitible(uuid) is
  'F1-00/M-08: atajo booleano 10/10 para el gate de EF-07.';
