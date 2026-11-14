-- ============================================================================
-- F1-05 / task-86 — RPC atómica de registro de documentos (EF-08 register)
--   * Valida tenant/membresía/rol, metadatos y deriva r2_key server-side.
--   * INSERT documents + audit_log + api_idempotency en la misma transacción.
--   * SECURITY DEFINER service_role-only; el HEAD del objeto R2 lo hace la EF.
-- Forward-only. docs/02 intacto; sin upload_status/expires_at (follow-up Lead).
-- ============================================================================

alter table public.documents
  add column if not exists upload_status text not null default 'registered'
  check (upload_status in ('pendiente','registered','cancelado'));

create or replace function public.fn_register_document(
  p_user_id uuid,
  p_document_id uuid,
  p_diagnostic_id uuid,
  p_doc_type text,
  p_title text,
  p_mime text,
  p_size_bytes bigint,
  p_sha256 text,
  p_exposure_level text default 'restringido_nda',
  p_idempotency_key text default null,
  p_request_hash text default null,
  p_extension text default null
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
  v_org uuid;
  v_r2_key text;
  v_ext text;
  v_default_ext text;
  v_allowed text[];
  v_title text := btrim(p_title);
  v_exposure text := coalesce(nullif(p_exposure_level, ''), 'restringido_nda');
  v_audit text;
  v_resp jsonb;
begin
  if p_user_id is null or p_document_id is null or p_diagnostic_id is null
     or p_doc_type is null or p_title is null or p_mime is null
     or p_size_bytes is null or p_sha256 is null then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION_PARAMETRO_REQUERIDO', 'message', 'Parámetros incompletos.');
  end if;

  if v_key is not null then
    perform pg_advisory_xact_lock(hashtext('EF-08.register:' || p_user_id::text || ':' || v_key));
    select * into v_existing from public.api_idempotency
     where user_id = p_user_id and endpoint = 'EF-08.register' and key = v_key;
    if found then
      if v_existing.request_hash is distinct from coalesce(p_request_hash, '') then
        return jsonb_build_object('ok', false, 'code', 'CONFLICT_STATE', 'message', 'Idempotency-Key reutilizada con otro request.');
      end if;
      if v_existing.response_body is not null then
        return v_existing.response_body || jsonb_build_object('replayed', true);
      end if;
      return jsonb_build_object('ok', false, 'code', 'CONFLICT_STATE', 'message', 'Operación en curso.');
    end if;
  end if;

  v_role := public.fn_diag_role(p_user_id, p_diagnostic_id);
  if v_role is null or v_role not in ('coordinador','equipo','empresa') then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN_ROLE', 'message', 'Se requiere rol coordinador, equipo o empresa en el diagnóstico.');
  end if;

  select * into v_diag from public.diagnostics where id = p_diagnostic_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN_NOT_MEMBER', 'message', 'Diagnóstico inexistente o fuera del tenant.');
  end if;
  v_org := v_diag.organization_id;
  if not exists (
    select 1 from public.profiles p
     where p.user_id = p_user_id and p.organization_id = v_org
  ) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN_NOT_MEMBER', 'message', 'El usuario no pertenece al tenant del diagnóstico.');
  end if;

  if p_doc_type not in (
    'layout','planos_hidrosanitarios','parametros_calidad','balance_basico','concesion',
    'permiso_descarga','recibos','lab_previo','informe_laboratorio','reporte','plan_accion',
    'bitacora_firmada','otro'
  ) then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION_DOC_TYPE', 'message', 'Tipo de documento inválido.');
  end if;
  if p_mime not in (
    'application/pdf','image/png','image/jpeg','image/webp','image/tiff','image/heic',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel','image/vnd.dwg','application/dwg','application/acad',
    'application/x-ofx','application/ofx'
  ) then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION_FILE', 'message', 'Tipo de archivo no permitido.', 'details', jsonb_build_object('reason', 'mime_no_permitido'));
  end if;
  if v_exposure not in ('publico','anonimizado','sintetico','restringido_nda') then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION_EXPOSURE_LEVEL', 'message', 'Nivel de exposición inválido.');
  end if;
  if p_size_bytes < 1 or p_size_bytes > 104857600 then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION_FILE', 'message', 'Tamaño de archivo fuera de rango.', 'details', jsonb_build_object('reason', 'size_bytes'));
  end if;
  if p_sha256 !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION_FILE', 'message', 'sha256 debe ser 64 hex en minúsculas.');
  end if;
  if length(v_title) = 0 or length(v_title) > 255
     or v_title ~ '[[:cntrl:]]' or v_title ~ '[\\/]' or v_title like '%..%' then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION_FILE', 'message', 'Título de archivo inválido.');
  end if;

  v_allowed := case p_mime
    when 'application/pdf' then array['pdf']
    when 'image/png' then array['png']
    when 'image/jpeg' then array['jpg','jpeg']
    when 'image/webp' then array['webp']
    when 'image/tiff' then array['tif','tiff']
    when 'image/heic' then array['heic']
    when 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' then array['xlsx']
    when 'application/vnd.ms-excel' then array['xls']
    when 'image/vnd.dwg' then array['dwg']
    when 'application/dwg' then array['dwg']
    when 'application/acad' then array['dwg']
    when 'application/x-ofx' then array['ofx']
    when 'application/ofx' then array['ofx']
    else array[]::text[]
  end;
  v_default_ext := v_allowed[1];
  -- La extensión viene de la EF (misma que firmó el PUT) o del título; nunca del cliente.
  v_ext := lower(nullif(btrim(p_extension), ''));
  if v_ext is null or v_ext = '' then
    v_ext := lower(substring(v_title from '\.([A-Za-z0-9]+)$'));
  end if;
  if v_ext is null or v_ext = '' then
    v_ext := v_default_ext;
  elsif not (v_ext = any(v_allowed)) then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION_FILE', 'message', 'Extensión incompatible con el MIME.', 'details', jsonb_build_object('reason', 'extension_incompatible'));
  end if;
  v_r2_key := format('org/%s/diag/%s/%s.%s', v_org, p_diagnostic_id, p_document_id, v_ext);

  begin
    insert into public.documents
      (id, organization_id, diagnostic_id, company_id, doc_type, title, r2_key, sha256, mime,
       size_bytes, exposure_level, uploaded_by)
    values
      (p_document_id, v_org, p_diagnostic_id, v_diag.company_id, p_doc_type, v_title, v_r2_key,
       lower(p_sha256), p_mime, p_size_bytes, v_exposure, p_user_id);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'CONFLICT_STATE', 'message', 'El documento o la clave R2 ya están registrados.');
  end;

  v_audit := public.fn_audit_write(
    p_user_id, 'create', 'documents', p_document_id::text,
    jsonb_build_object('document_id', p_document_id, 'r2_key', v_r2_key, 'sha256', lower(p_sha256),
                       'diagnostic_id', p_diagnostic_id, 'idempotency_key', v_key)
  );

  v_resp := jsonb_build_object(
    'ok', true,
    'replayed', false,
    'data', jsonb_build_object('document_id', p_document_id, 'sha256', lower(p_sha256)),
    'audit_ref', 'audit:' || v_audit
  );

  if v_key is not null then
    insert into public.api_idempotency
      (user_id, endpoint, key, request_hash, status_code, response_body, response_ref, completed_at)
    values
      (p_user_id, 'EF-08.register', v_key, coalesce(p_request_hash, ''), 200, v_resp, 'audit:' || v_audit, now());
  end if;

  return v_resp;
end;
$$;

revoke all on function public.fn_register_document(uuid, uuid, uuid, text, text, text, bigint, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.fn_register_document(uuid, uuid, uuid, text, text, text, bigint, text, text, text, text, text) to service_role;

comment on function public.fn_register_document(uuid, uuid, uuid, text, text, text, bigint, text, text, text, text, text) is
  'F1-05/EF-08 register: INSERT documents+audit+idempotencia atómicos; service_role; r2_key server-side.';
