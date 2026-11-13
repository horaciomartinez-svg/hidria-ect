-- ============================================================================
-- F1 task-35 fix — revisión spec PR #32
--   * B1: membresía de invitado inmutable en UPDATE (role/diagnóstico/user/org);
--     DELETE sigue permitido para revocación.
--   * M2 (a): documents/iih_assets/samples/signatures/water_balances exigen
--     membresía del diagnóstico para TODOS los roles (docs/01 §5), no solo invitado.
-- Forward-only. No edita migraciones aplicadas.
-- ============================================================================

-- M2 (a): alcance por membresía para todos los roles.
drop policy if exists profiles_sel on public.profiles;
create policy profiles_sel on public.profiles
  for select to public
  using (
    public.is_tenant_member(organization_id)
    and (
      coalesce(auth.jwt() ->> 'global_role', 'invitado') <> 'invitado'
      or user_id = auth.uid()
    )
  );

drop policy if exists documents_sel on public.documents;
create policy documents_sel on public.documents
  for select to public
  using (
    public.is_tenant_member(organization_id)
    and public.is_diagnostic_member(diagnostic_id)
  );

drop policy if exists iih_assets_sel on public.iih_assets;
create policy iih_assets_sel on public.iih_assets
  for select to public
  using (
    public.is_tenant_member(organization_id)
    and public.is_diagnostic_member(diagnostic_id)
  );

drop policy if exists samples_sel on public.samples;
create policy samples_sel on public.samples
  for select to public
  using (
    public.is_tenant_member(organization_id)
    and public.is_diagnostic_member(diagnostic_id)
  );

drop policy if exists signatures_sel on public.signatures;
create policy signatures_sel on public.signatures
  for select to public
  using (
    public.is_tenant_member(organization_id)
    and exists (
      select 1 from public.documents doc
      where doc.id = signatures.document_id
        and public.is_diagnostic_member(doc.diagnostic_id)
    )
  );

drop policy if exists water_balances_sel on public.water_balances;
create policy water_balances_sel on public.water_balances
  for select to public
  using (
    public.is_tenant_member(organization_id)
    and public.is_diagnostic_member(diagnostic_id)
  );

-- B1: el trigger de invitado ahora cubre INSERT y UPDATE.
create or replace function public.trg_project_members_invitado_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_global_new text;
  v_global_old text;
begin
  if tg_op = 'UPDATE' then
    select global_role into v_global_old from public.profiles where user_id = old.user_id;
    select global_role into v_global_new from public.profiles where user_id = new.user_id;
    if v_global_old = 'invitado' or v_global_new = 'invitado' then
      if new.user_id is distinct from old.user_id
         or new.diagnostic_id is distinct from old.diagnostic_id
         or new.organization_id is distinct from old.organization_id
         or new.role is distinct from 'observador'
      then
        raise exception 'Invitado: no se puede cambiar user_id/diagnóstico/role; solo observador.'
          using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  select global_role into v_global_new from public.profiles where user_id = new.user_id;
  if v_global_new = 'invitado' then
    if new.role <> 'observador' then
      raise exception 'Invitado: la membresía debe usar role=observador.' using errcode = '42501';
    end if;
    if exists (
      select 1 from public.project_members pm
       where pm.user_id = new.user_id
         and pm.diagnostic_id <> new.diagnostic_id
    ) then
      raise exception 'Invitado: solo se permite una membresía activa (vigencia diferida a F1-04).'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists project_members_invitado_scope on public.project_members;
create trigger project_members_invitado_scope
  before insert or update on public.project_members
  for each row execute function public.trg_project_members_invitado_scope();

comment on function public.trg_project_members_invitado_scope() is
  'F1 task-35: invitado solo role=observador, una membresía activa; UPDATE de identidad/role bloqueado; DELETE permite revocación.';

-- VETO-3: solo admin_institucional puede cambiar global_role; evita invitado->staff.
create or replace function public.trg_profiles_role_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null
     and coalesce(auth.jwt() ->> 'global_role', '') <> 'admin_institucional'
     and new.global_role is distinct from old.global_role
  then
    raise exception 'profiles: solo admin_institucional puede cambiar global_role.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard
  before update on public.profiles
  for each row execute function public.trg_profiles_role_guard();

comment on function public.trg_profiles_role_guard() is
  'F1 task-35: un coordinador no puede promover/cambiar global_role; solo admin_institucional.';
