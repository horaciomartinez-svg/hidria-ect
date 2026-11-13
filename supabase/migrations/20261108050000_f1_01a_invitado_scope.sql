-- ============================================================================
-- F1 task-35 — Alcance del rol `invitado` y visibilidad por membresía (Q-02)
-- Forward-only. No edita migraciones aplicadas.
--   * diagnostics: tenant + membresía o agregado SRHDS (admin/coord).
--   * profiles: tenant, excepto invitado = solo su propio perfil (claim JWT).
--   * companies: tenant + agregado SRHDS o EXISTS diagnóstico con membresía.
--   * documents/iih_assets/samples/signatures/water_balances: invitado solo si
--     es miembro del diagnóstico; resto de roles conserva el alcance actual.
--   * organizations/project_members no cambian (tenant propio/membresía).
--   * Alta de diagnóstico: el creador (coordinador/equipo) recibe membresía
--     automática para poder leer su propio diagnóstico.
--   * Invitado: una sola membresía activa, mapeada a role='observador'
--     (expiry diferido a F1-04; ver ADR-011).
-- ============================================================================

-- 1. diagnostics_sel
drop policy if exists diagnostics_sel on public.diagnostics;
create policy diagnostics_sel on public.diagnostics
  for select to public
  using (
    public.is_tenant_member(organization_id)
    and (
      public.my_diagnostic_role(id) is not null
      or (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds')
    )
  );

-- 2. profiles_sel: invitado solo su propia fila
drop policy if exists profiles_sel on public.profiles;
create policy profiles_sel on public.profiles
  for select to public
  using (
    public.is_tenant_member(organization_id)
    and (
      (auth.jwt() ->> 'global_role') is distinct from 'invitado'
      or user_id = auth.uid()
    )
  );

-- 3. companies_sel
drop policy if exists companies_sel on public.companies;
create policy companies_sel on public.companies
  for select to public
  using (
    public.is_tenant_member(organization_id)
    and (
      (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds')
      or exists (
        select 1 from public.diagnostics d
        where d.company_id = companies.id
          and d.organization_id = companies.organization_id
          and public.my_diagnostic_role(d.id) is not null
      )
    )
  );

-- 4. Auditoría de policies tenant-wide: invitado solo con membresía de diagnóstico.
drop policy if exists documents_sel on public.documents;
create policy documents_sel on public.documents
  for select to public
  using (
    public.is_tenant_member(organization_id)
    and (
      (auth.jwt() ->> 'global_role') is distinct from 'invitado'
      or public.is_diagnostic_member(diagnostic_id)
    )
  );

drop policy if exists iih_assets_sel on public.iih_assets;
create policy iih_assets_sel on public.iih_assets
  for select to public
  using (
    public.is_tenant_member(organization_id)
    and (
      (auth.jwt() ->> 'global_role') is distinct from 'invitado'
      or public.is_diagnostic_member(diagnostic_id)
    )
  );

drop policy if exists samples_sel on public.samples;
create policy samples_sel on public.samples
  for select to public
  using (
    public.is_tenant_member(organization_id)
    and (
      (auth.jwt() ->> 'global_role') is distinct from 'invitado'
      or public.is_diagnostic_member(diagnostic_id)
    )
  );

drop policy if exists signatures_sel on public.signatures;
create policy signatures_sel on public.signatures
  for select to public
  using (
    public.is_tenant_member(organization_id)
    and (
      (auth.jwt() ->> 'global_role') is distinct from 'invitado'
      or exists (
        select 1 from public.documents doc
        where doc.id = signatures.document_id
          and public.is_diagnostic_member(doc.diagnostic_id)
      )
    )
  );

drop policy if exists water_balances_sel on public.water_balances;
create policy water_balances_sel on public.water_balances
  for select to public
  using (
    public.is_tenant_member(organization_id)
    and (
      (auth.jwt() ->> 'global_role') is distinct from 'invitado'
      or public.is_diagnostic_member(diagnostic_id)
    )
  );

-- 5. El creador de un diagnóstico recibe membresía (crear -> leer).
create or replace function public.trg_diagnostics_creator_membership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    return new;
  end if;
  select case
           when global_role = 'coordinador_srhds' then 'coordinador'
           when global_role = 'equipo' then 'equipo'
           else null
         end
    into v_role
    from public.profiles
   where user_id = v_uid;
  if v_role is null then
    return new;
  end if;
  insert into public.project_members (diagnostic_id, user_id, organization_id, role)
  values (new.id, v_uid, new.organization_id, v_role)
  on conflict (diagnostic_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists diagnostics_creator_membership on public.diagnostics;
create trigger diagnostics_creator_membership
  after insert on public.diagnostics
  for each row execute function public.trg_diagnostics_creator_membership();

-- 6. Invitado: una sola membresía activa y role='observador' (sin rol nuevo).
create or replace function public.trg_project_members_invitado_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_global text;
begin
  select global_role into v_global
    from public.profiles
   where user_id = new.user_id;
  if v_global = 'invitado' then
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
  before insert on public.project_members
  for each row execute function public.trg_project_members_invitado_scope();

comment on function public.trg_diagnostics_creator_membership() is
  'F1 task-35: el creador coordinador/equipo recibe membresía para leer su diagnóstico.';
comment on function public.trg_project_members_invitado_scope() is
  'F1 task-35: invitado solo role=observador y una membresía activa; expiry en F1-04.';
