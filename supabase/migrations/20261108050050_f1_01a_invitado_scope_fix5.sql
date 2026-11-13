-- ============================================================================
-- F1 task-35 fix5 — separar *_write FOR ALL de las 5 tablas para que su USING
-- no actúe como SELECT. documents ya se separó en 50040; faltan iih_assets,
-- samples y water_balances. Sin cambio de autorización de escritura.
-- Forward-only.
-- ============================================================================

drop policy if exists iih_assets_write on public.iih_assets;
create policy iih_assets_ins on public.iih_assets
  for insert to public
  with check (public.is_diagnostic_member(diagnostic_id) and public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo'));
create policy iih_assets_upd on public.iih_assets
  for update to public
  using (public.is_diagnostic_member(diagnostic_id) and public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo'))
  with check (public.is_diagnostic_member(diagnostic_id) and public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo'));
create policy iih_assets_del on public.iih_assets
  for delete to public
  using (public.is_diagnostic_member(diagnostic_id) and public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo'));

drop policy if exists samples_write on public.samples;
create policy samples_ins on public.samples
  for insert to public
  with check (public.is_diagnostic_member(diagnostic_id) and public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo'));
create policy samples_upd on public.samples
  for update to public
  using (public.is_diagnostic_member(diagnostic_id) and public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo'))
  with check (public.is_diagnostic_member(diagnostic_id) and public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo'));
create policy samples_del on public.samples
  for delete to public
  using (public.is_diagnostic_member(diagnostic_id) and public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo'));

drop policy if exists water_balances_write on public.water_balances;
create policy water_balances_ins on public.water_balances
  for insert to public
  with check (public.is_diagnostic_member(diagnostic_id) and public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo'));
create policy water_balances_upd on public.water_balances
  for update to public
  using (public.is_diagnostic_member(diagnostic_id) and public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo'))
  with check (public.is_diagnostic_member(diagnostic_id) and public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo'));
create policy water_balances_del on public.water_balances
  for delete to public
  using (public.is_diagnostic_member(diagnostic_id) and public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo'));
