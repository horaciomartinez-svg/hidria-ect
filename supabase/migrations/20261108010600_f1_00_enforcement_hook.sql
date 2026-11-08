-- ============================================================================
-- F1-00 — Enforcement H-5 + custom_access_token_hook (ADR-005)
--   * trg_custody_gate: exige 3 transferencias FIRMADAS (firma no nula/no vacía)
--   * check_phase_gate: F6 exige 6/6 factores IVOH validados en R4
--   * ivoh_index_versions: un único registro vigente (índice parcial único)
--   * public.custom_access_token_hook: organization_id + tenant_id + global_role
--     (no se activa: requiere SUPABASE_ACCESS_TOKEN, E3)
-- Forward-only e idempotente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- H-5.1  Cadena de custodia: dictamen solo con 3 transferencias firmadas.
-- ---------------------------------------------------------------------------
create or replace function public.trg_custody_gate()
returns trigger
language plpgsql
as $$
begin
  if new.dictamen is not null and (
    select count(*)
      from public.custody_transfers ct
     where ct.sample_id = new.sample_id
       and ct.firma is not null
       and length(btrim(ct.firma)) > 0
  ) < 3 then
    raise exception 'Dictamen bloqueado: la muestra % requiere 3 transferencias firmadas de custodia.', new.sample_id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- H-5.2  Gate de fase: F6 exige los 6 factores IVOH validados en R4.
--        (docs/04 TD-1 #5; el trigger anterior solo exigía 1/6).
-- ---------------------------------------------------------------------------
create or replace function public.check_phase_gate()
returns trigger
language plpgsql
as $$
begin
  if new.fase_actual > old.fase_actual then
    -- Fase 2 -> lista de cotejo validada en R1
    if new.fase_actual >= 2 and not exists (
      select 1 from public.document_checklist_items i
      where i.diagnostic_id = new.id and i.item_code = 'layout' and i.estado = 'validado_r1') then
      raise exception 'Gate F2: la lista de cotejo (layout) no está validada en R1.';
    end if;
    -- Fase 3 -> CAT validado en R2
    if new.fase_actual >= 3 and new.cat_estado <> 'validado_r2' then
      raise exception 'Gate F3: el CAT no está validado en R2.';
    end if;
    -- Fase 4 -> IIH verificado en V1
    if new.fase_actual >= 4 and exists (
      select 1 from public.iih_assets a where a.diagnostic_id = new.id and not a.verificado_v1) then
      raise exception 'Gate F4: el IIH tiene activos sin verificar en V1.';
    end if;
    -- Fase 5 -> BHE validado en R3
    if new.fase_actual >= 5 and not exists (
      select 1 from public.water_balances wb
      where wb.diagnostic_id = new.id and wb.estado = 'validado_r3') then
      raise exception 'Gate F5: el balance hídrico no está validado en R3.';
    end if;
    -- Fase 6 -> IVOH validado en R4 (6/6 factores)
    if new.fase_actual >= 6 and (
      select count(*) from public.ivoh_evaluations e
      where e.diagnostic_id = new.id and e.estado = 'validado_r4') < 6 then
      raise exception 'Gate F6: el IVOH no está validado en R4 (se requieren 6/6 factores).';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- H-5.3  Una sola versión vigente del índice IVOH. El trigger de inmutabilidad
--        ya impide desmarcar la vigente; este índice impide insertar otra.
-- ---------------------------------------------------------------------------
create unique index if not exists uq_ivoh_index_versions_vigente
  on public.ivoh_index_versions ((vigente))
  where vigente;

comment on index public.uq_ivoh_index_versions_vigente is
  'F1-00/H-5: como maximo una fila con vigente=true en ivoh_index_versions.';

-- ---------------------------------------------------------------------------
-- Auth hook (ADR-005): claims organization_id + tenant_id + global_role desde
-- profiles. Se entrega como funcion, NO se activa (E3 sin access token).
-- ---------------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_claims  jsonb;
  v_org     uuid;
  v_rol     text;
begin
  v_user_id := (event ->> 'user_id')::uuid;
  v_claims  := coalesce(event -> 'claims', '{}'::jsonb);

  select p.organization_id, p.global_role
    into v_org, v_rol
    from public.profiles p
   where p.user_id = v_user_id;

  if v_org is null or v_rol is null then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'HIDRIA: usuario sin perfil u organizacion; acceso denegado.'
      )
    );
  end if;

  -- Claim contractual (docs/00, docs/04, docs/07)
  v_claims := jsonb_set(v_claims, '{organization_id}', to_jsonb(v_org::text), true);
  -- Compatibilidad con is_tenant_member() y las politicas RLS (docs/01, docs/02)
  v_claims := jsonb_set(v_claims, '{tenant_id}',       to_jsonb(v_org::text), true);
  -- Rol global institucional
  v_claims := jsonb_set(v_claims, '{global_role}',     to_jsonb(v_rol), true);

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

revoke all on function public.custom_access_token_hook(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.custom_access_token_hook(jsonb)
  to supabase_auth_admin;

comment on function public.custom_access_token_hook(jsonb) is
  'F1-00/ADR-005: custom access token hook (organization_id, tenant_id, global_role). Requiere activacion en Auth (E3).';
