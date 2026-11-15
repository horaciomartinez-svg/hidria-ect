-- ============================================================================
-- F1-08c / task-136 â€” IIH M5: auditorÃ­a DB e importaciÃ³n XLSX atÃ³mica (EF-09).
--   * iih_assets ya tiene columnas/CHECK/FK/RLS de roles y folio server-side.
--   * Import: filas vÃ¡lidas insertadas; rechazadas por fila; audit+idempotencia.
--   * Forward-only; docs/02 intacto.
-- ============================================================================

create or replace function public.trg_iih_assets_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null then
    perform public.fn_audit_write(
      auth.uid(),
      case when tg_op = 'INSERT' then 'create' when tg_op = 'UPDATE' then 'update' else 'delete' end,
      'iih_assets', new.id::text,
      jsonb_build_object('diagnostic_id', new.diagnostic_id, 'folio', new.folio,
                         'stage_code', new.stage_code, 'tag', new.tag,
                         'verificado_v1', new.verificado_v1)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists iih_assets_audit on public.iih_assets;
create trigger iih_assets_audit
  after insert or update on public.iih_assets
  for each row execute function public.trg_iih_assets_audit();
revoke all on function public.trg_iih_assets_audit() from public, anon, authenticated;

create or replace function public.trg_iih_assets_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_diag_org uuid;
  v_type_stage text;
begin
  if tg_op = 'UPDATE' then
    if new.diagnostic_id is distinct from old.diagnostic_id
       or new.organization_id is distinct from old.organization_id
       or new.folio is distinct from old.folio then
      raise exception 'IIH: diagnostic_id/organization_id/folio son inmutables.' using errcode = '42501';
    end if;
  end if;
  select d.organization_id into v_diag_org from public.diagnostics d where d.id = new.diagnostic_id;
  if v_diag_org is null or new.organization_id <> v_diag_org then
    raise exception 'IIH: el activo no pertenece al tenant del diagnÃ³stico.' using errcode = '42501';
  end if;
  select t.stage_code into v_type_stage from public.iih_asset_types t where t.id = new.asset_type_id;
  if v_type_stage is null or v_type_stage <> new.stage_code then
    raise exception 'IIH: asset_type_id no corresponde a la etapa.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists iih_assets_guard on public.iih_assets;
create trigger iih_assets_guard
  before insert or update on public.iih_assets
  for each row execute function public.trg_iih_assets_guard();
revoke all on function public.trg_iih_assets_guard() from public, anon, authenticated;

create or replace function public.fn_import_iih_assets(
  p_user_id uuid,
  p_diagnostic_id uuid,
  p_document_id uuid,
  p_rows jsonb,
  p_checksum text default null,
  p_idempotency_key text default null,
  p_request_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text := nullif(p_idempotency_key, '');
  v_existing public.api_idempotency%rowtype;
  v_role text;
  v_diag public.diagnostics%rowtype;
  v_doc public.documents%rowtype;
  v_row jsonb;
  v_ord integer := 0;
  v_ok integer := 0;
  v_rejected jsonb := '[]'::jsonb;
  v_asset_type public.iih_asset_types%rowtype;
  v_audit text;
  v_resp jsonb;
  v_reason text;
begin
  if p_user_id is null or p_diagnostic_id is null or p_rows is null then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION_XLSX_ESTRUCTURA', 'message', 'ParÃ¡metros incompletos.');
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION_XLSX_ESTRUCTURA', 'message', 'p_rows debe ser un arreglo.');
  end if;

  if v_key is not null then
    perform pg_advisory_xact_lock(hashtext('EF-09.iih:' || p_user_id::text || ':' || v_key));
    select * into v_existing from public.api_idempotency
     where user_id = p_user_id and endpoint = 'EF-09.iih' and key = v_key;
    if found then
      if v_existing.request_hash is distinct from coalesce(p_request_hash, '') then
        return jsonb_build_object('ok', false, 'code', 'CONFLICT_STATE', 'message', 'Idempotency-Key reutilizada con otro request.');
      end if;
      if v_existing.response_body is not null then
        return v_existing.response_body || jsonb_build_object('replayed', true);
      end if;
      return jsonb_build_object('ok', false, 'code', 'CONFLICT_STATE', 'message', 'OperaciÃ³n en curso.');
    end if;
  end if;

  v_role := public.fn_diag_role(p_user_id, p_diagnostic_id);
  if v_role is null or v_role not in ('coordinador','equipo') then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN_ROLE', 'message', 'Solo coordinador/equipo importa IIH.');
  end if;
  select * into v_diag from public.diagnostics where id = p_diagnostic_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN_NOT_MEMBER', 'message', 'DiagnÃ³stico inexistente o fuera del tenant.');
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = p_user_id and p.organization_id = v_diag.organization_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN_NOT_MEMBER', 'message', 'El usuario no pertenece al tenant del diagnóstico.');
  end if;
  -- SEC-PR62-01: el import exige el XLSX fuente registrado y su sha256.
  if p_document_id is null then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION_XLSX_ESTRUCTURA', 'message', 'document_id es obligatorio.');
  end if;
  select * into v_doc from public.documents where id = p_document_id;
  if not found or v_doc.organization_id <> v_diag.organization_id
     or v_doc.diagnostic_id <> p_diagnostic_id then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN_NOT_MEMBER', 'message', 'Documento inexistente o fuera del diagnóstico/tenant.');
  end if;
  if v_doc.upload_status <> 'registered' then
    return jsonb_build_object('ok', false, 'code', 'CONFLICT_STATE', 'message', 'El documento del XLSX no está registrado.');
  end if;
  if p_checksum is null or p_checksum <> v_doc.sha256 then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION_XLSX_CONTENIDO', 'message', 'Checksum del XLSX no coincide con el documento registrado.');
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_ord := v_ord + 1;
    v_reason := null;
    begin
      if nullif(v_row->>'stage_code', '') is null
         or nullif(v_row->>'tag', '') is null
         or nullif(v_row->>'ubicacion', '') is null
         or nullif(v_row->>'estado_fisico', '') is null
         or nullif(v_row->>'opera', '') is null
         or nullif(v_row->>'criticidad', '') is null
         or nullif(v_row->>'intervencion', '') is null
         or nullif(v_row->>'prioridad', '') is null
         or (v_row->>'asset_type_id') is null then
        raise exception 'campos obligatorios incompletos';
      end if;
      select * into v_asset_type from public.iih_asset_types where id = (v_row->>'asset_type_id')::bigint;
      if not found or v_asset_type.stage_code <> (v_row->>'stage_code') then
        raise exception 'asset_type_id no corresponde a la etapa';
      end if;
      insert into public.iih_assets
        (organization_id, diagnostic_id, stage_code, asset_type_id, tag, ubicacion, capacidad,
         capacidad_unidad, potencia_kw, material, anio_instalacion, estado_fisico, opera, criticidad,
         respaldo, suficiencia, mantenimiento_tipo, ultimo_servicio, intervencion, prioridad, observaciones)
      values
        (v_diag.organization_id, p_diagnostic_id, v_row->>'stage_code',
         (v_row->>'asset_type_id')::bigint, v_row->>'tag', v_row->>'ubicacion',
         nullif(v_row->>'capacidad','')::numeric, nullif(v_row->>'capacidad_unidad',''),
         nullif(v_row->>'potencia_kw','')::numeric, nullif(v_row->>'material',''),
         nullif(v_row->>'anio_instalacion','')::smallint, v_row->>'estado_fisico', v_row->>'opera',
         v_row->>'criticidad', coalesce((v_row->>'respaldo')::boolean, false),
         nullif(v_row->>'suficiencia',''), nullif(v_row->>'mantenimiento_tipo',''),
         nullif(v_row->>'ultimo_servicio','')::date, v_row->>'intervencion', v_row->>'prioridad',
         nullif(v_row->>'observaciones',''));
      v_ok := v_ok + 1;
    exception when others then
      v_reason := sqlerrm;
      v_rejected := v_rejected || jsonb_build_array(jsonb_build_object('fila', v_ord, 'razon', v_reason));
    end;
  end loop;

  v_audit := public.fn_audit_write(p_user_id, 'create', 'iih_assets', p_diagnostic_id::text,
    jsonb_build_object('import', 'xlsx', 'document_id', p_document_id, 'checksum', p_checksum,
                       'filas_ok', v_ok, 'filas_rechazadas', v_rejected, 'idempotency_key', v_key));
  v_resp := jsonb_build_object(
    'ok', true, 'replayed', false,
    'data', jsonb_build_object('destino_id', p_diagnostic_id, 'diagnostic_id', p_diagnostic_id, 'filas_ok', v_ok,
                               'filas_rechazadas', v_rejected),
    'audit_ref', 'audit:' || v_audit
  );
  if v_key is not null then
    insert into public.api_idempotency(user_id,endpoint,key,request_hash,status_code,response_body,response_ref,completed_at)
    values (p_user_id,'EF-09.iih',v_key,coalesce(p_request_hash,''),200,v_resp,'audit:'||v_audit,now());
  end if;
  return v_resp;
end;
$$;

revoke all on function public.fn_import_iih_assets(uuid,uuid,uuid,jsonb,text,text,text) from public, anon, authenticated;
grant execute on function public.fn_import_iih_assets(uuid,uuid,uuid,jsonb,text,text,text) to service_role;

comment on function public.fn_import_iih_assets(uuid,uuid,uuid,jsonb,text,text,text) is
  'F1-08c/EF-09: importaciÃ³n IIH por filas, audit+idempotencia; service_role.';

