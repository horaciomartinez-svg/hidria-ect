-- ============================================================================
-- F1-00 / M-04 — RPC de cálculo BHE pre-R3 y brecha anual ponderada
--   * fn_bhe_monthly(balance_id): sin filtro de estado (sirve a EF-05 sobre
--     un balance en_captura, docs/05 BHE-05 y F1-01 H-08).
--   * fn_bhe_summary(balance_id): brecha anual PONDERADA por volumen
--     (100*sum(brecha_m3)/sum(entradas_m3)), no avg(porcentajes) (Q-04).
--   * v_bhe_summary conserva sus columnas y agrega brecha_anual_pct al final;
--     no rompe v_balance_indicators ni el contrato de lectura.
-- Forward-only e idempotente.
-- ============================================================================

create or replace function public.fn_bhe_monthly(p_balance_id uuid)
returns table (
  mes          smallint,
  entradas_m3  numeric,
  destinos_m3  numeric,
  descargas_m3 numeric,
  perdidas_m3  numeric,
  circular_m3  numeric,
  brecha_m3    numeric,
  brecha_pct   numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    bf.mes,
    coalesce(sum(bf.volumen_m3) filter (where fc.grupo = 'entrada'), 0)::numeric as entradas_m3,
    coalesce(sum(bf.volumen_m3) filter (where fc.grupo in ('consumo_proceso','consumo_general')), 0)::numeric as destinos_m3,
    coalesce(sum(bf.volumen_m3) filter (where fc.grupo = 'descarga'), 0)::numeric as descargas_m3,
    coalesce(sum(bf.volumen_m3) filter (where fc.grupo = 'perdida'), 0)::numeric as perdidas_m3,
    coalesce(sum(bf.volumen_m3) filter (where fc.grupo = 'circular'), 0)::numeric as circular_m3,
    (coalesce(sum(bf.volumen_m3) filter (where fc.grupo = 'entrada'), 0)
     - coalesce(sum(bf.volumen_m3) filter (where fc.grupo in ('consumo_proceso','consumo_general','descarga','perdida')), 0))::numeric as brecha_m3,
    round(100.0 * (
      coalesce(sum(bf.volumen_m3) filter (where fc.grupo = 'entrada'), 0)
      - coalesce(sum(bf.volumen_m3) filter (where fc.grupo in ('consumo_proceso','consumo_general','descarga','perdida')), 0)
    ) / nullif(coalesce(sum(bf.volumen_m3) filter (where fc.grupo = 'entrada'), 0), 0), 2) as brecha_pct
  from public.water_balances wb
  join public.balance_flows bf on bf.balance_id = wb.id
  join public.balance_flow_catalog fc on fc.code = bf.catalog_code
  where wb.id = p_balance_id
  group by bf.mes
  order by bf.mes;
$$;

comment on function public.fn_bhe_monthly(uuid) is
  'F1-00/M-04: calculo mensual BHE por balance_id SIN filtro de estado (pre-R3). EF-05. Solo service_role.';

create or replace function public.fn_bhe_summary(p_balance_id uuid)
returns table (
  entradas_anual_m3   numeric,
  destinos_anual_m3   numeric,
  circular_anual_m3   numeric,
  descargas_anual_m3  numeric,
  perdidas_anual_m3   numeric,
  brecha_anual_m3     numeric,
  brecha_anual_pct    numeric,
  brecha_pct_promedio numeric,
  brecha_max_mes_pct  numeric,
  meses_sobre_umbral  integer,
  balance_no_cierra   boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with m as (
    select * from public.fn_bhe_monthly(p_balance_id)
  )
  select
    round(coalesce(sum(entradas_m3), 0), 2)::numeric  as entradas_anual_m3,
    round(coalesce(sum(destinos_m3), 0), 2)::numeric  as destinos_anual_m3,
    round(coalesce(sum(circular_m3), 0), 2)::numeric  as circular_anual_m3,
    round(coalesce(sum(descargas_m3), 0), 2)::numeric as descargas_anual_m3,
    round(coalesce(sum(perdidas_m3), 0), 2)::numeric  as perdidas_anual_m3,
    round(coalesce(sum(brecha_m3), 0), 2)::numeric    as brecha_anual_m3,
    round(100.0 * coalesce(sum(brecha_m3), 0) / nullif(coalesce(sum(entradas_m3), 0), 0), 2) as brecha_anual_pct,
    round(coalesce(avg(brecha_pct), 0), 2)::numeric   as brecha_pct_promedio,
    coalesce(max(brecha_pct), 0)::numeric             as brecha_max_mes_pct,
    (count(*) filter (where brecha_pct > 10))::integer as meses_sobre_umbral,
    (coalesce(max(brecha_pct), 0) > 10)                as balance_no_cierra
  from m;
$$;

comment on function public.fn_bhe_summary(uuid) is
  'F1-00/M-04: resumen BHE con brecha anual ponderada por volumen (Q-04) y meses sobre umbral. EF-05. Solo service_role.';

-- ---------------------------------------------------------------------------
-- v_bhe_summary: se agrega brecha_anual_pct al final (compatible hacia atrás).
-- Las vistas siguen siendo el modelo de lectura oficial post-R3; el RPC cubre
-- el pre-chequeo de un balance en_captura.
-- ---------------------------------------------------------------------------
create or replace view public.v_bhe_summary as
select
  diagnostic_id,
  balance_id,
  round(sum(entradas_m3), 2)  as entradas_anual_m3,
  round(sum(destinos_m3), 2)  as destinos_anual_m3,
  round(sum(circular_m3), 2)  as circular_anual_m3,
  round(sum(descargas_m3), 2) as descargas_anual_m3,
  round(sum(brecha_m3), 2)    as brecha_anual_m3,
  round(avg(brecha_pct), 2)   as brecha_pct_promedio,
  max(brecha_pct) > 10        as balance_no_cierra,
  round(100.0 * sum(brecha_m3) / nullif(sum(entradas_m3), 0), 2) as brecha_anual_pct
from public.v_bhe_monthly
group by diagnostic_id, balance_id;

-- Superficie mínima de las RPC: solo service_role (EF-05); authenticated no
-- puede invocarlas (evita lectura cross-tenant al ser security definer).
revoke all on function public.fn_bhe_monthly(uuid) from public, anon, authenticated;
revoke all on function public.fn_bhe_summary(uuid) from public, anon, authenticated;
grant execute on function public.fn_bhe_monthly(uuid) to service_role;
grant execute on function public.fn_bhe_summary(uuid) to service_role;
