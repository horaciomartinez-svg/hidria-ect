-- ============================================================================
-- F1 task-94 / F1-04 — DB support for EF-01 (advance-phase) and EF-12
--   * milestone_reprogramming history (SELECT membership only; writes via RPC).
--   * fn_advance_phase / fn_reprogram_milestone: SECURITY DEFINER, EXECUTE
--     service_role only; revalidate role/tenant/state/transition/date;
--     gates by diagnostics_phase_gate; audit + api_idempotency in same tx.
-- Forward-only. docs/02 untouched; docs contract patches are separate (Lead).
-- ============================================================================

create table if not exists public.milestone_reprogramming (
  id bigint generated always as identity primary key,
  diagnostic_id uuid not null references public.diagnostics(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  hito text not null check (hito in ('V1','V2','V3','R1','R2','R3','R4','R5')),
  fecha_original date not null,
  fecha_nueva date not null,
  causa text not null check (causa in ('empresa','equipo','externa')),
  justificacion text not null check (length(btrim(justificacion)) >= 20),
  reprogramado_por uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now(),
  check (fecha_nueva >= fecha_original)
);

create index if not exists idx_milestone_reprogramming_diag
  on public.milestone_reprogramming (diagnostic_id, created_at desc);

alter table public.milestone_reprogramming enable row level security;
drop policy if exists milestone_reprogramming_sel on public.milestone_reprogramming;
create policy milestone_reprogramming_sel on public.milestone_reprogramming
  for select to public
  using (public.is_diagnostic_member(diagnostic_id));

revoke all on table public.milestone_reprogramming from public, anon, authenticated, service_role;
grant select on table public.milestone_reprogramming to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- EF-01: advance phase
-- ----------------------------------------------------------------------------
create or replace function public.fn_advance_phase(
  p_user_id uuid,
  p_diagnostic_id uuid,
  p_to_phase smallint,
  p_gate jsonb default '{}'::jsonb,
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
  v_avance numeric(5,1);
  v_proximo text;
  v_ficha_clave text;
  v_ficha_folio text;
  v_audit text;
  v_resp jsonb;
  v_code text;
  v_msg text;
begin
  if p_user_id is null or p_diagnostic_id is null or p_to_phase is null then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'message', 'Parámetros incompletos.');
  end if;

  if v_key is not null then
    perform pg_advisory_xact_lock(hashtext('EF-01:' || p_user_id::text || ':' || v_key));
    select * into v_existing from public.api_idempotency
     where user_id = p_user_id and endpoint = 'EF-01' and key = v_key;
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
  if v_role is null or v_role not in ('coordinador','equipo') then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN_ROLE', 'message', 'Se requiere rol coordinador o equipo en el diagnóstico.');
  end if;

  select * into v_diag from public.diagnostics where id = p_diagnostic_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Diagnóstico inexistente.');
  end if;
  if not exists (
    select 1 from public.profiles p
     where p.user_id = p_user_id and p.organization_id = v_diag.organization_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN_ROLE', 'message', 'El usuario no pertenece al tenant del diagnóstico.');
  end if;
  if v_diag.estado <> 'activo' then
    return jsonb_build_object('ok', false, 'code', 'CONFLICT_STATE', 'message', 'El diagnóstico no está activo.', 'details', jsonb_build_object('estado_actual', v_diag.estado));
  end if;
  if p_to_phase < 2 or p_to_phase > 6 or p_to_phase <> v_diag.fase_actual + 1 then
    return jsonb_build_object('ok', false, 'code', 'CONFLICT_PHASE', 'message', 'to_phase debe ser exactamente fase_actual + 1.', 'details', jsonb_build_object('fase_actual', v_diag.fase_actual));
  end if;

  -- La ficha de respaldo no se confía del cliente: mapa TD-1 por fase origen,
  -- búsqueda de la ficha cerrada en DB y folio real de esa ficha.
  v_ficha_clave := case v_diag.fase_actual
    when 1 then 'R1'
    when 2 then 'R2'
    when 3 then 'V1'
    when 4 then 'R3'
    when 5 then 'R4'
    else null
  end;
  if v_ficha_clave is null then
    return jsonb_build_object('ok', false, 'code', 'CONFLICT_PHASE', 'message', 'La fase actual no admite avance por EF-01.', 'details', jsonb_build_object('fase_actual', v_diag.fase_actual));
  end if;
  select le.folio into v_ficha_folio
    from public.logbook_entries le
   where le.diagnostic_id = p_diagnostic_id
     and le.clave = v_ficha_clave
     and le.estado = 'cerrada'
   order by le.created_at desc
   limit 1;
  if v_ficha_folio is null then
    return jsonb_build_object('ok', false, 'code', 'GATE_FICHA', 'message', 'La ficha de respaldo no existe o no está cerrada.', 'details', jsonb_build_object('ficha_clave', v_ficha_clave));
  end if;

  v_avance := round((p_to_phase::numeric * 100.0 / 6.0), 1);
  -- Mapa vinculante del revisor: 2→R2, 3→V1, 4→R3, 5→R4, 6→R5; sin fechas.
  v_proximo := case p_to_phase
    when 2 then 'R2'
    when 3 then 'V1'
    when 4 then 'R3'
    when 5 then 'R4'
    when 6 then 'R5'
    else v_diag.proximo_hito
  end;

  begin
    update public.diagnostics
       set fase_actual = p_to_phase,
           proximo_hito = v_proximo,
           avance_pct = v_avance
     where id = p_diagnostic_id;
  exception when sqlstate 'P0001' then
    v_msg := sqlerrm;
    v_code := case
      when v_msg like 'Gate F2:%' then 'GATE_CHECKLIST_R1'
      when v_msg like 'Gate F3:%' then 'GATE_CAT_R2'
      when v_msg like 'Gate F4:%' then 'GATE_IIH_V1'
      when v_msg like 'Gate F5:%' then 'GATE_BHE_R3'
      when v_msg like 'Gate F6:%' then 'GATE_IVOH_R4'
      else 'GATE_PHASE'
    end;
    return jsonb_build_object('ok', false, 'code', v_code, 'message', v_msg);
  end;

  v_audit := public.fn_audit_write(
    p_user_id, 'move_phase', 'diagnostics', p_diagnostic_id::text,
    jsonb_build_object(
      'fase_origen', v_diag.fase_actual,
      'fase_nueva', p_to_phase,
      'folio', v_diag.folio,
      'ficha_clave', v_ficha_clave,
      'folio_respaldo', v_ficha_folio,
      'gate', coalesce(p_gate, '{}'::jsonb)
    )
  );

  v_resp := jsonb_build_object(
    'ok', true,
    'replayed', false,
    'data', jsonb_build_object(
      'diagnostic_id', p_diagnostic_id,
      'folio', v_diag.folio,
      'fase_actual', p_to_phase,
      'proximo_hito', v_proximo,
      'avance_pct', v_avance,
      'gate', jsonb_build_object(
        'fase_origen', v_diag.fase_actual,
        'entregable', p_gate ->> 'entregable',
        'folio_respaldo', v_ficha_folio,
        'ficha_clave', v_ficha_clave
      )
    ),
    'audit_ref', 'audit:' || v_audit
  );

  if v_key is not null then
    insert into public.api_idempotency
      (user_id, endpoint, key, request_hash, status_code, response_body, response_ref, completed_at)
    values
      (p_user_id, 'EF-01', v_key, coalesce(p_request_hash, ''), 200, v_resp, 'audit:' || v_audit, now());
  end if;
  return v_resp;
end;
$$;

revoke all on function public.fn_advance_phase(uuid, uuid, smallint, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.fn_advance_phase(uuid, uuid, smallint, jsonb, text, text) to service_role;

-- ----------------------------------------------------------------------------
-- EF-12: reprogram milestone
-- ----------------------------------------------------------------------------
create or replace function public.fn_reprogram_milestone(
  p_user_id uuid,
  p_diagnostic_id uuid,
  p_hito text,
  p_fecha_original date,
  p_fecha_nueva date,
  p_justificacion text,
  p_causa text,
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
  v_entry_id uuid;
  v_entry_folio text;
  v_prev_nueva date;
  v_count integer;
  v_semaforo text;
  v_audit text;
  v_resp jsonb;
begin
  if p_user_id is null or p_diagnostic_id is null or p_hito is null
     or p_fecha_original is null or p_fecha_nueva is null
     or p_justificacion is null or p_causa is null then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION_REPROGRAMACION', 'message', 'Parámetros incompletos.');
  end if;

  if v_key is not null then
    perform pg_advisory_xact_lock(hashtext('EF-12:' || p_user_id::text || ':' || v_key));
    select * into v_existing from public.api_idempotency
     where user_id = p_user_id and endpoint = 'EF-12' and key = v_key;
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
  if v_role is distinct from 'coordinador' then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN_ROLE', 'message', 'Solo coordinador puede reprogramar hitos.');
  end if;

  select * into v_diag from public.diagnostics where id = p_diagnostic_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Diagnóstico inexistente.');
  end if;
  if not exists (
    select 1 from public.profiles p
     where p.user_id = p_user_id and p.organization_id = v_diag.organization_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN_ROLE', 'message', 'El usuario no pertenece al tenant del diagnóstico.');
  end if;
  if p_hito not in ('V1','V2','V3','R1','R2','R3','R4','R5')
     or p_causa not in ('empresa','equipo','externa')
     or length(btrim(p_justificacion)) < 20
     or p_fecha_nueva < p_fecha_original
     or p_fecha_nueva > v_diag.fecha_inicio + 42 then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION_REPROGRAMACION', 'message', 'Hito/fecha/justificación/causa inválidos.');
  end if;

  select id, folio into v_entry_id, v_entry_folio
    from public.logbook_entries
   where diagnostic_id = p_diagnostic_id and clave = p_hito
     and estado = 'cerrada'
   order by created_at desc
   limit 1;
  if v_entry_id is null then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION_HITO_SIN_FICHA', 'message', 'No existe ficha de bitácora para el hito.');
  end if;

  -- B1/spec: la fecha_original declarada debe coincidir con la última
  -- fecha_nueva del mismo hito (la primera reprogramación es la declarada).
  select fecha_nueva into v_prev_nueva
    from public.milestone_reprogramming
   where diagnostic_id = p_diagnostic_id and hito = p_hito
   order by created_at desc
   limit 1;
  if found and p_fecha_original is distinct from v_prev_nueva then
    return jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_REPROGRAMACION',
      'message', 'fecha_original debe coincidir con la última fecha_nueva del mismo hito.',
      'details', jsonb_build_object('fecha_original', p_fecha_original, 'ultima_fecha_nueva', v_prev_nueva)
    );
  end if;

  insert into public.milestone_reprogramming
    (diagnostic_id, organization_id, hito, fecha_original, fecha_nueva, causa, justificacion, reprogramado_por)
  values
    (p_diagnostic_id, v_diag.organization_id, p_hito, p_fecha_original, p_fecha_nueva, p_causa, p_justificacion, p_user_id);

  insert into public.logbook_findings (entry_id, tema, texto, links)
  values (
    v_entry_id, 'reprogramacion',
    format('fecha original: %s, nueva: %s, causa: %s', p_fecha_original, p_fecha_nueva, p_causa),
    '[]'::jsonb
  );

  select count(*) into v_count
    from public.milestone_reprogramming
   where diagnostic_id = p_diagnostic_id and hito = p_hito;
  v_semaforo := case
    when v_count >= 2 then 'rojo'
    when v_count = 1 and p_causa = 'empresa' then 'amarillo'
    else v_diag.semaforo_atraso
  end;

  update public.diagnostics
     set proximo_hito = p_hito || ' · ' || p_fecha_nueva::text,
         semaforo_atraso = v_semaforo,
         reprogramacion_justificacion = p_justificacion
   where id = p_diagnostic_id;

  v_audit := public.fn_audit_write(
    p_user_id, 'update', 'diagnostics', p_diagnostic_id::text,
    jsonb_build_object('hito', p_hito, 'fecha_original', p_fecha_original, 'fecha_nueva', p_fecha_nueva,
                       'causa', p_causa, 'reprogramaciones', v_count, 'entry_id', v_entry_id)
  );

  v_resp := jsonb_build_object(
    'ok', true,
    'replayed', false,
    'data', jsonb_build_object(
      'hito', p_hito,
      'fecha_nueva', p_fecha_nueva,
      'semaforo_atraso', v_semaforo,
      'entry_id', v_entry_id,
      'folio_ficha', v_entry_folio,
      'reprogramaciones', v_count
    ),
    'audit_ref', 'audit:' || v_audit
  );

  if v_key is not null then
    insert into public.api_idempotency
      (user_id, endpoint, key, request_hash, status_code, response_body, response_ref, completed_at)
    values
      (p_user_id, 'EF-12', v_key, coalesce(p_request_hash, ''), 200, v_resp, 'audit:' || v_audit, now());
  end if;
  return v_resp;
end;
$$;

revoke all on function public.fn_reprogram_milestone(uuid, uuid, text, date, date, text, text, text, text) from public, anon, authenticated;
grant execute on function public.fn_reprogram_milestone(uuid, uuid, text, date, date, text, text, text, text) to service_role;

comment on table public.milestone_reprogramming is
  'F1-04: historial de reprogramaciones de hitos; SELECT membresía, escritura solo RPC service_role.';
comment on function public.fn_advance_phase(uuid, uuid, smallint, jsonb, text, text) is
  'F1-04/EF-01: transición atómica de fase con gates, audit e idempotencia; service_role.';
comment on function public.fn_reprogram_milestone(uuid, uuid, text, date, date, text, text, text, text) is
  'F1-04/EF-12: reprogramación atómica de hito con historial, audit e idempotencia; service_role.';
