-- ============================================================================
-- F1 task-80 / F1-03a — DB/RLS M1 Empresas
--   * companies.created_by server-side + SELECT del creador (B2 create→read).
--   * contraparte_user_id validado: perfil existente, mismo tenant, rol empresa;
--     solo admin/coordinador pueden asignarlo (SEC-PR35-01).
--   * company_in_tenant valida el tenant del llamante (SEC-PR32-06).
--   * companies_sel: agregado admin/coord, membresía de diagnóstico, creador o
--     contraparte empresa; companies_upd permite a empresa su propia ficha.
--   * ciclo_vida sin candado adicional (decisión documentada en ADR/reporte).
-- Forward-only. No toca docs/02 ni migraciones previas.
-- ============================================================================

alter table public.companies
  add column if not exists created_by uuid references public.profiles(user_id);

create or replace function public.trg_companies_ownership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.jwt() ->> 'global_role', '');
begin
  if tg_op = 'INSERT' then
    if v_uid is not null then
      new.created_by := v_uid;
    end if;
  elsif new.created_by is distinct from old.created_by then
    raise exception 'companies: created_by es inmutable.' using errcode = '42501';
  end if;

  if new.contraparte_user_id is not null and (
       tg_op = 'INSERT'
       or new.contraparte_user_id is distinct from old.contraparte_user_id
     ) then
    if v_uid is not null and v_role not in ('admin_institucional','coordinador_srhds') then
      raise exception 'companies: solo admin/coordinador puede asignar contraparte_user_id.'
        using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.profiles p
       where p.user_id = new.contraparte_user_id
         and p.organization_id = new.organization_id
         and p.global_role = 'empresa'
    ) then
      raise exception 'companies: contraparte_user_id debe ser un perfil empresa del mismo tenant.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists companies_ownership on public.companies;
create trigger companies_ownership
  before insert or update on public.companies
  for each row execute function public.trg_companies_ownership();

-- SEC-PR32-06: el helper solo puede consultar el tenant del llamante.
create or replace function public.company_in_tenant(p_company_id uuid, p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_organization_id is not null
     and p_organization_id = public.current_org_id()
     and exists (
       select 1 from public.companies c
        where c.id = p_company_id
          and c.organization_id = p_organization_id
     );
$$;

revoke all on function public.company_in_tenant(uuid, uuid) from public, anon;
grant execute on function public.company_in_tenant(uuid, uuid) to authenticated, service_role;

drop policy if exists companies_sel on public.companies;
create policy companies_sel on public.companies
  for select to public
  using (
    public.is_tenant_member(organization_id)
    and (auth.jwt() ->> 'global_role') is not null
    and (
      (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds')
      or exists (
        select 1 from public.diagnostics d
        where d.company_id = companies.id
          and d.organization_id = companies.organization_id
          and public.my_diagnostic_role(d.id) is not null
      )
      or created_by = auth.uid()
      or ((auth.jwt() ->> 'global_role') = 'empresa' and contraparte_user_id = auth.uid())
    )
  );

drop policy if exists companies_upd on public.companies;
create policy companies_upd on public.companies
  for update to public
  using (
    public.is_tenant_member(organization_id)
    and (
      (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds','equipo')
      or ((auth.jwt() ->> 'global_role') = 'empresa' and contraparte_user_id = auth.uid())
    )
  )
  with check (
    public.is_tenant_member(organization_id)
    and (
      (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds','equipo')
      or ((auth.jwt() ->> 'global_role') = 'empresa' and contraparte_user_id = auth.uid())
    )
  );

comment on column public.companies.created_by is
  'F1-03a: creador del registro (server-side, auth.uid()); permite create→read sin membresía.';
comment on function public.trg_companies_ownership() is
  'F1-03a: created_by server-side; contraparte validada (perfil empresa del tenant, solo admin/coord).';
