-- ============================================================================
-- F1-07c / task-127 — CAT A1-v1: RLS de respuestas, validación y auditoría.
--   * El banco de 47 preguntas YA existe (docs/03 §7 / seed); no se duplica.
--   * cat_responses: escritura solo coord/equipo/empresa (no observador/invitado).
--   * Validación de tipo/opciones/N-A, documento↔diagnóstico y auditoría directa.
-- Forward-only; docs/02 intacto. RPC transaccional EF-04 se coordina aparte.
-- ============================================================================

drop policy if exists cat_empresa_write on public.cat_responses;
drop policy if exists cat_empresa_update on public.cat_responses;
drop policy if exists cat_responses_ins on public.cat_responses;
drop policy if exists cat_responses_upd on public.cat_responses;

create policy cat_responses_ins on public.cat_responses
  for insert to public
  with check (
    public.is_tenant_member(
      (select d.organization_id from public.diagnostics d where d.id = diagnostic_id)
    )
    and public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo','empresa')
  );

create policy cat_responses_upd on public.cat_responses
  for update to public
  using (
    public.is_tenant_member(
      (select d.organization_id from public.diagnostics d where d.id = diagnostic_id)
    )
    and public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo','empresa')
  )
  with check (
    public.is_tenant_member(
      (select d.organization_id from public.diagnostics d where d.id = diagnostic_id)
    )
    and public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo','empresa')
  );

create or replace function public.trg_cat_response_validate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.cat_items%rowtype;
  v_diag_org uuid;
  v_doc_org uuid;
  v_doc_diag uuid;
  v_doc_status text;
  v_kind text;
  v_text text;
  v_elem text;
begin
  select * into v_item from public.cat_items where id = new.item_id;
  if not found then
    raise exception 'CAT: el ítem no existe.' using errcode = '42501';
  end if;
  select d.organization_id into v_diag_org from public.diagnostics d where d.id = new.diagnostic_id;
  if v_diag_org is null then
    raise exception 'CAT: diagnóstico inexistente.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' and auth.uid() is not null then
    new.created_by := auth.uid();
  elsif tg_op = 'UPDATE' and new.created_by is distinct from old.created_by then
    raise exception 'CAT: created_by es inmutable.' using errcode = '42501';
  end if;

  if new.no_se and new.na then
    raise exception 'CAT: no_se y na son excluyentes.' using errcode = '23514';
  end if;

  if not (new.no_se or new.na) then
    if new.valor is null then
      raise exception 'CAT: valor obligatorio salvo no_se/na.' using errcode = '23514';
    end if;
    v_kind := jsonb_typeof(new.valor);
    if v_item.tipo = 'opcion_unica' then
      if v_kind <> 'string' or not exists (
        select 1 from jsonb_array_elements_text(coalesce(v_item.opciones, '[]'::jsonb)) o
         where o = new.valor #>> '{}'
      ) then
        raise exception 'CAT: opción no válida para el ítem.' using errcode = '23514';
      end if;
    elsif v_item.tipo = 'multiple' then
      if v_kind <> 'array' then
        raise exception 'CAT: multiple requiere un arreglo.' using errcode = '23514';
      end if;
      for v_elem in select jsonb_array_elements_text(new.valor) loop
        if not exists (
          select 1 from jsonb_array_elements_text(coalesce(v_item.opciones, '[]'::jsonb)) o
           where o = v_elem
        ) then
          raise exception 'CAT: opción múltiple no válida.' using errcode = '23514';
        end if;
      end loop;
    else
      if v_kind <> 'string' or length(btrim(new.valor #>> '{}')) = 0 then
        raise exception 'CAT: respuesta abierta/breve inválida.' using errcode = '23514';
      end if;
    end if;
  end if;

  if new.document_id is not null then
    select d.organization_id, d.diagnostic_id, d.upload_status
      into v_doc_org, v_doc_diag, v_doc_status
      from public.documents d where d.id = new.document_id;
    if v_doc_org is null or v_doc_org <> v_diag_org or v_doc_diag <> new.diagnostic_id
       or v_doc_status <> 'registered' then
      raise exception 'CAT: documento no pertenece al diagnóstico o no está registrado.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists cat_response_validate on public.cat_responses;
create trigger cat_response_validate
  before insert or update on public.cat_responses
  for each row execute function public.trg_cat_response_validate();

create or replace function public.trg_cat_response_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null then
    perform public.fn_audit_write(
      auth.uid(),
      case when tg_op = 'INSERT' then 'create' else 'update' end,
      'cat_responses',
      new.diagnostic_id::text || ':' || new.item_id::text,
      jsonb_build_object('diagnostic_id', new.diagnostic_id, 'item_id', new.item_id,
                         'no_se', new.no_se, 'na', new.na, 'document_id', new.document_id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists cat_response_audit on public.cat_responses;
create trigger cat_response_audit
  after insert or update on public.cat_responses
  for each row execute function public.trg_cat_response_audit();

revoke all on function public.trg_cat_response_validate() from public, anon, authenticated;
revoke all on function public.trg_cat_response_audit() from public, anon, authenticated;

comment on function public.trg_cat_response_validate() is
  'F1-07c: valida tipo/opciones/N-A y documento↔diagnóstico en cat_responses.';
