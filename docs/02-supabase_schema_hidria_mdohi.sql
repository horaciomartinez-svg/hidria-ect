-- ============================================================================
-- HIDRIA · Plataforma MD-OHI — Esquema Supabase (PostgreSQL 15)
-- Programa Empresas Hídricamente Responsables · SRHDS Tamaulipas
-- Datos en Supabase; bytes de documentos en Cloudflare R2 (tabla documents = metadatos)
-- Ejecutar en: SQL Editor de Supabase (o supabase db push). Orden: 1) este archivo 2) 03-seed_catalogos.sql
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ============================================================================
-- 0. FUNCIONES AUXILIARES
-- ============================================================================

-- Rol del usuario en un diagnóstico (security definer: evita RLS recursivo)
create or replace function public.my_diagnostic_role(p_diagnostic_id uuid)
returns text
language sql stable security definer set search_path = public as $$
  select pm.role from public.project_members pm
  where pm.diagnostic_id = p_diagnostic_id and pm.user_id = auth.uid()
  limit 1;
$$;

-- Es miembro del diagnóstico (cualquier rol)
create or replace function public.is_diagnostic_member(p_diagnostic_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_members pm
    where pm.diagnostic_id = p_diagnostic_id and pm.user_id = auth.uid()
  );
$$;

-- Es miembro del diagnóstico al que pertenece una ficha de bitácora
create or replace function public.is_logbook_entry_member(p_entry_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.logbook_entries le
    where le.id = p_entry_id and public.is_diagnostic_member(le.diagnostic_id)
  );
$$;

-- updated_at automático
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end; $$;

-- ============================================================================
-- 1. ESQUEMA BASE
-- ============================================================================

-- 1.1 Organizaciones (tenants del ecosistema)
create table if not exists public.organizations (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  org_type    text not null check (org_type in
              ('srhds','universidad','cit','empresa','organismo_operador','prodet','admin')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 1.2 Perfiles (extiende auth.users)
create table if not exists public.profiles (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id),
  full_name        text not null,
  position         text,
  email            text,
  phone            text,
  global_role      text not null default 'user' check (global_role in
                   ('admin_institucional','coordinador_srhds','equipo','empresa','observador','invitado')),
  badge_mdohi      boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 1.3 Empresas atendidas (M1)
create table if not exists public.companies (
  id                  uuid primary key default uuid_generate_v4(),
  organization_id     uuid not null references public.organizations(id),
  razon_social        text not null,
  nombre_planta       text not null,
  giro                text not null check (giro in
                      ('manufacturera','maquiladora','termoelectrica','alimentos_bebidas','otra')),
  calle               text not null,
  colonia_parque      text not null,
  cp                  text not null,
  municipio           text not null,
  organismo_operador  text not null,
  lat                 numeric(10,6),
  lon                 numeric(10,6),
  empleados           integer check (empleados is null or empleados >= 0),
  turnos              text,
  unidad_produccion   text,
  contraparte_user_id uuid references public.profiles(user_id),
  ciclo_vida          text not null default 'prospecto' check (ciclo_vida in
                      ('prospecto','convenio_firmado','activa','diagnostico_vigente','plan_accion','ehr')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- 1.4 Diagnósticos (M2, objeto rector del expediente técnico)
create sequence if not exists public.diagnostics_folio_seq start 1;

create table if not exists public.diagnostics (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id),
  folio           text not null unique default
                  ('MDOHI-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.diagnostics_folio_seq')::text, 3, '0')),
  company_id      uuid not null references public.companies(id),
  tipo            text not null check (tipo in ('inicial','reevaluacion','seguimiento')),
  fecha_inicio    date not null,
  fecha_fin       date not null check (fecha_fin > fecha_inicio),
  fase_actual     smallint not null default 1 check (fase_actual between 1 and 6),
  estado          text not null default 'activo' check (estado in
                  ('activo','validado','reportado','archivado','suspendido','reprogramado')),
  ivoh_actual     numeric(3,1),
  brecha_pct      numeric(5,2),
  avance_pct      numeric(5,1) not null default 0 check (avance_pct between 0 and 100),
  proximo_hito    text,
  semaforo_atraso text not null default 'verde' check (semaforo_atraso in ('verde','amarillo','rojo')),
  cat_estado      text not null default 'no_enviado' check (cat_estado in
                  ('no_enviado','en_captura','en_revision','validado_r2')),
  index_version_id uuid not null,  -- FK agregada tras crear ivoh_index_versions
  bitacora_cerrada boolean not null default false,
  reporte_document_id uuid,
  reprogramacion_justificacion text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 1.5 Membresía al diagnóstico (equipo Triple Hélice + empresa + observador)
create table if not exists public.project_members (
  diagnostic_id    uuid not null references public.diagnostics(id) on delete cascade,
  user_id          uuid not null references public.profiles(user_id),
  organization_id  uuid references public.organizations(id),
  role             text not null check (role in
                   ('coordinador','equipo','empresa','organismo_operador','observador')),
  created_at       timestamptz not null default now(),
  primary key (diagnostic_id, user_id)
);

-- 1.6 Documents = METADATOS; bytes en Cloudflare R2
create table if not exists public.documents (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references public.organizations(id),
  diagnostic_id    uuid references public.diagnostics(id) on delete set null,
  company_id       uuid references public.companies(id) on delete set null,
  doc_type         text not null check (doc_type in
                   ('layout','planos_hidrosanitarios','parametros_calidad','balance_basico',
                    'concesion','permiso_descarga','recibos','lab_previo','informe_laboratorio',
                    'reporte','plan_accion','bitacora_firmada','otro')),
  title            text not null,
  r2_key           text not null unique,  -- org/{org}/diag/{diag}/{id}.{ext}
  sha256           text not null,
  mime             text not null,
  size_bytes       bigint not null check (size_bytes >= 0),
  exposure_level   text not null default 'restringido_nda' check (exposure_level in
                   ('publico','anonimizado','sintetico','restringido_nda')),
  dek_id           text,
  folio_nom151     text,
  version          integer not null default 1 check (version >= 1),
  parent_document_id uuid references public.documents(id),
  uploaded_by      uuid not null references public.profiles(user_id),
  created_at       timestamptz not null default now()
);

-- 1.7 Firmas NOM-151
create table if not exists public.signatures (
  id             uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id),
  document_id    uuid not null references public.documents(id) on delete cascade,
  signer_user_id uuid references public.profiles(user_id),
  signer_name  text not null,
  signer_role  text not null,
  signer_org   text not null,
  order_no     smallint not null default 1 check (order_no >= 1),
  status       text not null default 'pendiente' check (status in ('pendiente','firmado','rechazado')),
  psc_provider text,
  folio        text,
  constancia_document_id uuid references public.documents(id),
  signed_at    timestamptz,
  created_at   timestamptz not null default now()
);

-- 1.8 Audit log encadenado (append-only)
create table if not exists public.audit_log (
  id        bigint generated always as identity primary key,
  ts        timestamptz not null default now(),
  user_id   uuid,
  action    text not null check (action in
            ('create','update','delete','view','download','approve','sign','move_phase')),
  entity    text not null,
  entity_id text not null,
  meta      jsonb,
  prev_hash text,
  hash      text not null
);

-- 1.9 Notificaciones
create table if not exists public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(user_id) on delete cascade,
  kind       text not null check (kind in ('hito','validacion','acuerdo','atraso','firma','curso')),
  payload    jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 2. DOMINIO MD-OHI
-- ============================================================================

-- 2.1 Lista de cotejo de documentos (M3)
create table if not exists public.document_checklist_items (
  id           uuid primary key default uuid_generate_v4(),
  diagnostic_id uuid not null references public.diagnostics(id) on delete cascade,
  item_code    text not null check (item_code in
               ('layout','planos','parametros_calidad','iih','balance_basico',
                'concesion','permiso_descarga','recibos','lab_previos','otra')),
  estado       text not null default 'no_recibido' check (estado in
               ('no_recibido','recibido','revisado','validado_r1')),
  document_id  uuid references public.documents(id) on delete set null,
  solicitud_nota text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (diagnostic_id, item_code)
);

-- 2.2 CAT (M4) — plantilla versionada + respuestas
create table if not exists public.cat_items (
  id           uuid primary key default uuid_generate_v4(),
  version      text not null default 'A1-v1',
  seccion      char(1) not null check (seccion in ('A','B','C','D','E','F','G','H')),
  codigo       text not null,
  enunciado    text not null,
  tipo         text not null check (tipo in ('abierta','breve','opcion_unica','multiple')),
  opciones     jsonb,
  ayuda        text,
  admite_evidencia boolean not null default false,
  condicion    jsonb,
  orden        smallint not null,
  unique (version, codigo)
);

create table if not exists public.cat_responses (
  diagnostic_id    uuid not null references public.diagnostics(id) on delete cascade,
  item_id          uuid not null references public.cat_items(id) on delete cascade,
  valor            jsonb,
  no_se            boolean not null default false,
  na               boolean not null default false,
  document_id      uuid references public.documents(id) on delete set null,
  resuelta_en_campo boolean not null default false,
  created_by       uuid not null references public.profiles(user_id),
  updated_at       timestamptz not null default now(),
  primary key (diagnostic_id, item_id)
);

-- 2.3 IIH (M5)
create table if not exists public.iih_stages (
  code  text primary key,  -- CAP ALM TRA DIS USO EVA
  nombre text not null,
  orden smallint not null unique
);

create table if not exists public.iih_asset_types (
  id         bigint generated always as identity primary key,
  stage_code text not null references public.iih_stages(code),
  code       text not null unique,   -- CAP-01 …
  nombre     text not null,
  activo     boolean not null default true
);

create table if not exists public.iih_assets (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id),
  diagnostic_id   uuid not null references public.diagnostics(id) on delete cascade,
  folio           text not null unique,  -- CAP-01 … asignado por trigger
  stage_code      text not null references public.iih_stages(code),
  asset_type_id   bigint not null references public.iih_asset_types(id),
  tag             text not null,
  ubicacion       text not null,
  capacidad       numeric(14,3),
  capacidad_unidad text,
  potencia_kw     numeric(10,2),
  material        text,
  anio_instalacion smallint check (anio_instalacion between 1900 and 2100),
  estado_fisico   text not null check (estado_fisico in ('bueno','regular','deficiente','fuera_de_servicio')),
  opera           text not null check (opera in ('si','no','parcial')),
  criticidad      text not null check (criticidad in ('alta','media','baja')),
  respaldo        boolean not null default false,
  suficiencia     text check (suficiencia in ('suficiente','limitada','insuficiente')),
  mantenimiento_tipo text check (mantenimiento_tipo in ('preventivo','correctivo','mixto','nulo')),
  ultimo_servicio date,
  intervencion    text not null check (intervencion in ('ninguna','rehabilitacion','reposicion','ampliacion')),
  prioridad       text not null check (prioridad in ('alta','media','baja')),
  observaciones   text,
  verificado_v1 boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 2.4 BHE (M6)
create table if not exists public.balance_flow_catalog (
  code   text primary key,   -- ENT-01, DST-01, CIR-01 …
  grupo  text not null check (grupo in ('entrada','consumo_proceso','consumo_general','descarga','perdida','circular')),
  nombre text not null,
  orden  smallint not null,
  activo boolean not null default true
);

create table if not exists public.water_balances (
  id             uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id),
  diagnostic_id  uuid not null references public.diagnostics(id) on delete cascade,
  periodo_anio   smallint not null check (periodo_anio between 2000 and 2100),
  mes_inicio     smallint not null check (mes_inicio between 1 and 12),
  fuente_origen  text not null default 'nativa' check (fuente_origen in ('nativa','importada_excel')),
  estado         text not null default 'borrador' check (estado in ('borrador','en_captura','validado_r3')),
  validado_r3_logbook_id uuid,
  produccion_mensual numeric(14,2)[12] check (array_length(produccion_mensual,1) = 12),
  unidad_produccion text,
  dias_operacion integer check (dias_operacion between 0 and 366),
  dqo_mg_l   numeric(10,2) check (dqo_mg_l is null or dqo_mg_l >= 0),
  dbo5_mg_l  numeric(10,2) check (dbo5_mg_l is null or dbo5_mg_l >= 0),
  version    integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (diagnostic_id, version)
);

create table if not exists public.balance_flows (
  balance_id     uuid not null references public.water_balances(id) on delete cascade,
  catalog_code   text not null references public.balance_flow_catalog(code),
  mes            smallint not null check (mes between 1 and 12),
  volumen_m3     numeric(14,2) not null default 0 check (volumen_m3 >= 0),
  fuente_dato    text,
  comentario     text,
  metodo_estimacion text check (metodo_estimacion in ('macromedidor','medidor_area','ultrasonico','aforo','estimacion_documentada')),
  updated_at     timestamptz not null default now(),
  primary key (balance_id, catalog_code, mes)
);

create table if not exists public.quality_parameters_catalog (
  code          text primary key,
  nombre        text not null,
  grupo         text not null check (grupo in ('basico','patogeno','metal','toxicidad','reuso_proceso')),
  unidad_default text
);

create table if not exists public.quality_parameters (
  balance_id     uuid not null references public.water_balances(id) on delete cascade,
  param_code     text not null references public.quality_parameters_catalog(code),
  valor          numeric(14,4),
  unidad         text,
  limite_aplicable numeric(14,4),
  norma_ref      text check (norma_ref in ('NOM-001','NOM-002','NOM-003','condiciones_particulares','proceso')),
  dictamen       boolean,
  lab_result_id  uuid,
  primary key (balance_id, param_code)
);

-- 2.5 Muestreo y laboratorio (M7)
create table if not exists public.samples (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id),
  diagnostic_id   uuid not null references public.diagnostics(id) on delete cascade,
  codigo          text not null unique,
  punto           text not null check (punto in ('descarga_final','corriente_interna')),
  tipo_muestra    text not null check (tipo_muestra in ('simple','compuesta')),
  n_simples       smallint check (n_simples is null or n_simples > 0),
  colecta_ts      timestamptz,
  caudal_momentaneo numeric(12,3),
  preservacion    text,
  params_solicitados jsonb not null default '[]'::jsonb,
  norma_ref     text,
  laboratorio   text,
  acreditacion_ema boolean not null default false,
  estado        text not null default 'planificada' check (estado in
                ('planificada','colectada','enviada','en_analisis','resultados_recibidos','descartada')),
  created_at    timestamptz not null default now()
);

create table if not exists public.custody_transfers (
  sample_id   uuid not null references public.samples(id) on delete cascade,
  secuencia   smallint not null check (secuencia between 1 and 3),
  etapa       text not null check (etapa in ('muestreo','entrega','recepcion')),
  person_name text not null,
  person_role text not null,
  person_org  text not null,
  ts          timestamptz not null,
  firma       text not null,
  temperatura_recepcion numeric(5,2),
  integridad_recipiente boolean not null default true,
  observaciones text,
  primary key (sample_id, secuencia)
);

create table if not exists public.lab_results (
  sample_id   uuid not null references public.samples(id) on delete cascade,
  param_code  text not null references public.quality_parameters_catalog(code),
  valor       numeric(14,4) not null,
  unidad      text not null,
  metodo      text,
  informe_document_id uuid references public.documents(id),
  dictamen    boolean,
  primary key (sample_id, param_code)
);

-- 2.6 IVOH (M8)
create table if not exists public.ivoh_index_versions (
  id               uuid primary key default uuid_generate_v4(),
  version          integer not null unique check (version >= 1),
  vigente          boolean not null default false,
  aprobado_por     uuid references public.profiles(user_id),
  fecha_aprobacion timestamptz
);

alter table public.diagnostics
  add constraint diagnostics_index_version_fkey
  foreign key (index_version_id) references public.ivoh_index_versions(id);

create table if not exists public.ivoh_factors (
  version_id  uuid not null references public.ivoh_index_versions(id) on delete cascade,
  factor_code text not null check (factor_code in ('F1','F2','F3','F4','F5','F6')),
  nombre      text not null,
  peso        numeric(3,2) not null check (peso > 0 and peso <= 1),
  primary key (version_id, factor_code)
);

create table if not exists public.ivoh_rubrics (
  factor_code text not null check (factor_code in ('F1','F2','F3','F4','F5','F6')),
  nivel_min   smallint not null check (nivel_min between 0 and 10),
  nivel_max   smallint not null check (nivel_max between 0 and 10 and nivel_max >= nivel_min),
  etiqueta    text not null,
  descripcion text not null,
  primary key (factor_code, nivel_min)
);

create table if not exists public.ivoh_evaluations (
  diagnostic_id uuid not null references public.diagnostics(id) on delete cascade,
  factor_code   text not null check (factor_code in ('F1','F2','F3','F4','F5','F6')),
  version_id    uuid not null references public.ivoh_index_versions(id),
  puntaje       numeric(2,1) not null check (puntaje between 0 and 10),
  justificacion text,
  evidencia     jsonb not null default '[]'::jsonb,
  estado        text not null default 'borrador' check (estado in ('borrador','validado_r4')),
  r4_logbook_id uuid,
  updated_at    timestamptz not null default now(),
  primary key (diagnostic_id, factor_code)
);

-- 2.7 Cartera de alternativas y Plan de Acción (M9)
create table if not exists public.alternatives (
  id            uuid primary key default uuid_generate_v4(),
  diagnostic_id uuid not null references public.diagnostics(id) on delete cascade,
  jerarquia     smallint not null check (jerarquia between 1 and 5), -- Reducir, Reutilizar, Reciclar, Recuperar, Repensar
  descripcion   text not null,
  factores_mejora jsonb not null default '[]'::jsonb, -- vinculados a factores IVOH F1..F6
  ahorro_m3_anio  numeric(14,2) check (ahorro_m3_anio is null or ahorro_m3_anio >= 0),
  ahorro_financiero numeric(14,2),
  capex         numeric(14,2) check (capex is null or capex >= 0),
  opex          numeric(14,2),
  retorno_simple numeric(6,2),
  prioridad     text not null default 'media' check (prioridad in ('alta','media','baja')),
  verificado_v3 boolean not null default false,
  validado_r4   boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists public.action_plans (
  id            uuid primary key default uuid_generate_v4(),
  diagnostic_id uuid not null references public.diagnostics(id) on delete cascade,
  objetivo      text not null,
  firmado       boolean not null default false,
  signature_flow_id uuid,
  created_at    timestamptz not null default now()
);

create table if not exists public.action_plan_items (
  id          uuid primary key default uuid_generate_v4(),
  plan_id     uuid not null references public.action_plans(id) on delete cascade,
  accion      text not null,
  responsable text not null,
  fecha_inicio date not null,
  fecha_fin    date not null check (fecha_fin >= fecha_inicio),
  indicador_verificacion text not null,
  estado      text not null default 'pendiente' check (estado in ('pendiente','en_curso','completada','cancelada')),
  orden       smallint not null default 1
);

-- 2.8 Matriz de completitud (config del gate de emisión)
create table if not exists public.completeness_items (
  orden smallint primary key check (orden between 1 and 10),
  nombre text not null,
  verificado_en text not null,  -- R1, V1, R2, V2, R3, R4, R5, semana 6
  modulo text not null          -- tabla/vista que lo resuelve
);

-- 2.9 Bitácora (M10)
create table if not exists public.logbook_templates (
  clave              text primary key check (clave in ('V1','V2','V3','R1','R2','R3','R4','R5')),
  semana             smallint not null check (semana between 1 and 6),
  tipo               text not null check (tipo in ('visita','reunion')),
  titulo             text not null,
  duracion_horas     numeric(3,1),
  objetivo           text not null,
  asistentes_requeridos text not null,
  agenda_items       jsonb not null default '[]'::jsonb,
  evidence_items     jsonb not null default '[]'::jsonb
);

create table if not exists public.logbook_entries (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id),
  diagnostic_id   uuid not null references public.diagnostics(id) on delete cascade,
  clave           text not null references public.logbook_templates(clave),
  folio           text not null unique,   -- BIT-V1-01 … asignado por trigger
  responsable_sesion text not null,
  fecha           date not null,
  horario_inicio  time not null,
  horario_fin     time,
  modalidad       text not null default 'presencial' check (modalidad in ('presencial','virtual','mixta')),
  lugar           text,
  estado          text not null default 'abierta' check (estado in ('abierta','cerrada')),
  cerrada_en      timestamptz,
  cerrada_razon   text,     -- obligatoria si cierre > 24 h
  version         integer not null default 1 check (version >= 1),
  created_by      uuid not null references public.profiles(user_id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.logbook_participants (
  entry_id   uuid not null references public.logbook_entries(id) on delete cascade,
  nombre     text not null,
  cargo      text not null,
  institucion text not null,
  contacto   text,
  firma_ts   timestamptz,
  primary key (entry_id, nombre)
);

create table if not exists public.logbook_agenda (
  entry_id   uuid not null references public.logbook_entries(id) on delete cascade,
  no         smallint not null,
  actividad  text not null,
  responsable text,
  resultado  text,
  estado     text not null default 'realizado' check (estado in ('realizado','modificado','no_realizado')),
  primary key (entry_id, no)
);

create table if not exists public.logbook_findings (
  id       bigint generated always as identity primary key,
  entry_id uuid not null references public.logbook_entries(id) on delete cascade,
  tema     text,
  texto    text not null,
  links    jsonb not null default '[]'::jsonb  -- activos (folio), CAT, flujos, factores IVOH
);

create table if not exists public.logbook_agreements (
  id          bigint generated always as identity primary key,
  entry_id    uuid not null references public.logbook_entries(id) on delete cascade,
  compromiso  text not null,
  responsable text not null,
  fecha       date not null,
  seguimiento text,
  cerrado     boolean not null default false
);

create table if not exists public.logbook_evidence (
  id        bigint generated always as identity primary key,
  entry_id  uuid not null references public.logbook_entries(id) on delete cascade,
  item      text not null,          -- del template
  document_id uuid references public.documents(id) on delete set null,
  folio     text,
  obligatorio boolean not null default false
);

create table if not exists public.logbook_change_log (
  id          bigint generated always as identity primary key,
  entry_id    uuid not null references public.logbook_entries(id) on delete cascade,
  version     integer not null,
  descripcion text not null,
  responsable uuid not null references public.profiles(user_id),
  prev        jsonb not null,
  ts          timestamptz not null default now()
);

create table if not exists public.photo_log (
  id          bigint generated always as identity primary key,
  entry_id    uuid not null references public.logbook_entries(id) on delete cascade,
  folio       text not null unique,  -- V1-01 … o V1-05-03 al documentar activo
  document_id uuid references public.documents(id) on delete set null,
  asset_folio text,                  -- USO-01 …
  geo         point,
  descripcion text
);

-- 2.10 Aula (M12)
create table if not exists public.course_modules (
  id         bigint generated always as identity primary key,
  orden      smallint not null unique,
  titulo     text not null,
  materiales jsonb not null default '[]'::jsonb
);

create table if not exists public.quiz_questions (
  id            bigint generated always as identity primary key,
  module_orden  smallint not null references public.course_modules(orden),
  pregunta      text not null,
  opciones      jsonb not null,     -- ["a","b","c","d"]
  correcta      smallint not null check (correcta between 0 and 3),
  retroalimentacion text
);

create table if not exists public.quiz_attempts (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(user_id) on delete cascade,
  score      numeric(5,1) not null check (score between 0 and 100),
  passed     boolean not null,
  answers    jsonb not null default '[]'::jsonb,
  ts         timestamptz not null default now()
);

-- ============================================================================
-- 3. VISTAS (motor de cálculo hídrico y gates)
-- ============================================================================

-- 3.1 BHE mensual: entradas, destinos, circular y brecha
create or replace view public.v_bhe_monthly as
select
  wb.diagnostic_id,
  wb.id as balance_id,
  bf.mes,
  coalesce(sum(bf.volumen_m3) filter (where fc.grupo = 'entrada'), 0)        as entradas_m3,
  coalesce(sum(bf.volumen_m3) filter (where fc.grupo in ('consumo_proceso','consumo_general')), 0) as destinos_m3,
  coalesce(sum(bf.volumen_m3) filter (where fc.grupo = 'descarga'), 0)       as descargas_m3,
  coalesce(sum(bf.volumen_m3) filter (where fc.grupo = 'perdida'), 0)        as perdidas_m3,
  coalesce(sum(bf.volumen_m3) filter (where fc.grupo = 'circular'), 0)       as circular_m3,
  coalesce(sum(bf.volumen_m3) filter (where fc.grupo = 'entrada'), 0)
    - coalesce(sum(bf.volumen_m3) filter (where fc.grupo in ('consumo_proceso','consumo_general','descarga','perdida')), 0)
    as brecha_m3,
  round(100.0 * (
    coalesce(sum(bf.volumen_m3) filter (where fc.grupo = 'entrada'), 0)
    - coalesce(sum(bf.volumen_m3) filter (where fc.grupo in ('consumo_proceso','consumo_general','descarga','perdida')), 0)
  ) / nullif(coalesce(sum(bf.volumen_m3) filter (where fc.grupo = 'entrada'), 0), 0), 2) as brecha_pct
from public.water_balances wb
join public.balance_flows bf on bf.balance_id = wb.id
join public.balance_flow_catalog fc on fc.code = bf.catalog_code
where wb.estado = 'validado_r3'
group by wb.diagnostic_id, wb.id, bf.mes;

-- 3.2 Resumen del balance (alimenta F3 y el semáforo de brecha)
create or replace view public.v_bhe_summary as
select
  diagnostic_id,
  balance_id,
  round(sum(entradas_m3), 2)  as entradas_anual_m3,
  round(sum(destinos_m3), 2)  as destinos_anual_m3,
  round(sum(circular_m3), 2)  as circular_anual_m3,
  round(sum(descargas_m3), 2) as descargas_anual_m3,
  round(sum(brecha_m3), 2)   as brecha_anual_m3,
  round(avg(brecha_pct), 2)  as brecha_pct_promedio,
  max(brecha_pct) > 10       as balance_no_cierra
from public.v_bhe_monthly
group by diagnostic_id, balance_id;

-- 3.3 Indicadores de balance (hoja 4 como tablero)
create or replace view public.v_balance_indicators as
select
  s.diagnostic_id,
  s.balance_id,
  s.entradas_anual_m3,
  s.brecha_anual_m3,
  s.circular_anual_m3,
  s.descargas_anual_m3,
  round(100.0 * s.circular_anual_m3 / nullif(s.entradas_anual_m3, 0), 2) as pct_reuso_recirculacion,
  round(100.0 * s.brecha_anual_m3  / nullif(s.entradas_anual_m3, 0), 2) as pct_agua_no_contabilizada,
  round(sum(wb.produccion_mensual[1] + wb.produccion_mensual[2] + wb.produccion_mensual[3]
          + wb.produccion_mensual[4] + wb.produccion_mensual[5] + wb.produccion_mensual[6]
          + wb.produccion_mensual[7] + wb.produccion_mensual[8] + wb.produccion_mensual[9]
          + wb.produccion_mensual[10] + wb.produccion_mensual[11] + wb.produccion_mensual[12]), 2)
      as produccion_anual,
  round(s.entradas_anual_m3
      / nullif(sum(wb.produccion_mensual[1] + wb.produccion_mensual[2] + wb.produccion_mensual[3]
          + wb.produccion_mensual[4] + wb.produccion_mensual[5] + wb.produccion_mensual[6]
          + wb.produccion_mensual[7] + wb.produccion_mensual[8] + wb.produccion_mensual[9]
          + wb.produccion_mensual[10] + wb.produccion_mensual[11] + wb.produccion_mensual[12]), 0), 4)
      as consumo_especifico_m3_unidad,
  round(wb.dqo_mg_l * s.descargas_anual_m3 / nullif(wb.dias_operacion, 0) / 1000.0, 2)  as carga_dqo_kg_dia,
  round(wb.dbo5_mg_l * s.descargas_anual_m3 / nullif(wb.dias_operacion, 0) / 1000.0, 2) as carga_dbo5_kg_dia
from public.v_bhe_summary s
join public.water_balances wb on wb.id = s.balance_id
group by s.diagnostic_id, s.balance_id, s.entradas_anual_m3, s.brecha_anual_m3,
         s.circular_anual_m3, s.descargas_anual_m3, wb.dqo_mg_l, wb.dbo5_mg_l, wb.dias_operacion;

-- 3.4 IVOH: índice ponderado y semáforo
create or replace view public.v_ivoh_score as
select
  e.diagnostic_id,
  round(sum(f.peso * e.puntaje), 1) as ivoh,
  case
    when round(sum(f.peso * e.puntaje), 1) < 5.0 then 'rojo'
    when round(sum(f.peso * e.puntaje), 1) < 8.0 then 'amarillo'
    else 'verde'
  end as semaforo,
  jsonb_object_agg(e.factor_code, e.puntaje) as serie_factores
from public.ivoh_evaluations e
join public.ivoh_factors f
  on f.version_id = e.version_id and f.factor_code = e.factor_code
where e.estado = 'validado_r4'
group by e.diagnostic_id;

-- 3.5 Matriz de completitud (gate de emisión del Reporte, 10/10)
create or replace view public.v_diagnostic_completeness as
select
  d.id as diagnostic_id,
  (select bool_and(estado = 'validado_r1') from public.document_checklist_items i where i.diagnostic_id = d.id) as p1_documentos,
  (d.cat_estado = 'validado_r2') as p2_cat,
  (select bool_and(verificado_v1) from public.iih_assets a where a.diagnostic_id = d.id) as p3_iih,
  (exists (
    select 1 from public.samples s
    where s.diagnostic_id = d.id
      and (select count(*) from public.custody_transfers ct where ct.sample_id = s.id) = 3
  )) as p4_custodia,
  (select bool_and(estado = 'validado_r3') from public.water_balances wb where wb.diagnostic_id = d.id) as p5_bhe,
  (exists (select 1 from public.lab_results lr
     join public.samples s on s.id = lr.sample_id
    where s.diagnostic_id = d.id and lr.dictamen is not null)) as p6_lab,
  (select count(*) = 8 and bool_and(estado = 'cerrada') from public.logbook_entries le where le.diagnostic_id = d.id) as p7_bitacoras,
  (exists (select 1 from public.ivoh_evaluations e where e.diagnostic_id = d.id and e.estado = 'validado_r4')) as p8_ivoh,
  (exists (select 1 from public.alternatives a where a.diagnostic_id = d.id and a.validado_r4)) as p9_alternativas,
  ((select count(*) from public.photo_log p
      join public.logbook_entries le on le.id = p.entry_id
     where le.diagnostic_id = d.id) >= 8) as p10_fotos
from public.diagnostics d;

-- ============================================================================
-- 4. TRIGGERS (folios, inmutabilidad, gates, auditoría)
-- ============================================================================

-- 4.1 Folio correlativo de activos IIH (CAP-01, no reutilizable)
create or replace function public.trg_iih_folio()
returns trigger language plpgsql as $$
declare seq int; pref text;
begin
  if new.folio is null then
    select count(*) + 1 into seq from public.iih_assets
     where diagnostic_id = new.diagnostic_id and stage_code = new.stage_code;
    pref := new.stage_code;
    new.folio := pref || '-' || lpad(seq::text, 2, '0');
  end if;
  -- prioridad calculada
  new.prioridad := case
    when new.estado_fisico = 'fuera_de_servicio' or new.criticidad = 'alta' then 'alta'
    when new.estado_fisico = 'deficiente' or new.opera = 'no' then 'alta'
    when new.estado_fisico = 'regular' or new.opera = 'parcial' then 'media'
    else 'baja' end;
  return new;
end; $$;
drop trigger if exists iih_folio on public.iih_assets;
create trigger iih_folio before insert or update on public.iih_assets for each row execute function public.trg_iih_folio();

-- 4.2 Folio de ficha de bitácora (BIT-V1-01)
create or replace function public.trg_logbook_folio()
returns trigger language plpgsql as $$
declare seq int;
begin
  if new.folio is null then
    select count(*) + 1 into seq from public.logbook_entries
     where diagnostic_id = new.diagnostic_id and clave = new.clave;
    new.folio := 'BIT-' || new.clave || '-' || lpad(seq::text, 2, '0');
  end if;
  return new;
end; $$;
drop trigger if exists logbook_folio on public.logbook_entries;
create trigger logbook_folio before insert on public.logbook_entries for each row execute function public.trg_logbook_folio();

-- 4.3 Folio de fotos (V1-01 o V1-05-03 con activo)
create or replace function public.trg_photo_folio()
returns trigger language plpgsql as $$
declare seq int;
begin
  if new.folio is null then
    select count(*) + 1 into seq from public.photo_log where entry_id = new.entry_id;
    if new.asset_folio is not null then
      new.folio := (select clave from public.logbook_entries where id = new.entry_id)
                 || '-' || lpad(seq::text, 2, '0') || '-' || new.asset_folio;
    else
      new.folio := (select clave from public.logbook_entries where id = new.entry_id)
                 || '-' || lpad(seq::text, 2, '0');
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists photo_folio on public.photo_log;
create trigger photo_folio before insert on public.photo_log for each row execute function public.trg_photo_folio();

-- 4.4 Bitácora cerrada = inmutable
create or replace function public.trg_logbook_immutable()
returns trigger language plpgsql as $$
begin
  if old.estado = 'cerrada' and tg_op = 'UPDATE' then
    raise exception 'Ficha % cerrada: inmutable. Use control de cambios (logbook_change_log).', old.folio;
  end if;
  if old.estado = 'cerrada' and tg_op = 'DELETE' then
    raise exception 'Ficha % cerrada: no se puede eliminar.', old.folio;
  end if;
  return old;
end; $$;
drop trigger if exists logbook_immutable on public.logbook_entries;
create trigger logbook_immutable before update or delete on public.logbook_entries
for each row execute function public.trg_logbook_immutable();

-- 4.5 Índice IVOH vigente inmutable
create or replace function public.trg_ivoh_version_immutable()
returns trigger language plpgsql as $$
begin
  if old.vigente and (tg_op = 'UPDATE' or tg_op = 'DELETE') then
    raise exception 'La versión % del IVOH está vigente y aprobada: inmutable.', old.version;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;
drop trigger if exists ivoh_immutable on public.ivoh_index_versions;
create trigger ivoh_immutable before update or delete on public.ivoh_index_versions
for each row execute function public.trg_ivoh_version_immutable();

-- 4.6 Gate de fase: valida entregables antes de avanzar
create or replace function public.check_phase_gate()
returns trigger language plpgsql as $$
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
    -- Fase 6 -> IVOH validado en R4
    if new.fase_actual >= 6 and not exists (
      select 1 from public.ivoh_evaluations e
      where e.diagnostic_id = new.id and e.estado = 'validado_r4') then
      raise exception 'Gate F6: el IVOH no está validado en R4.';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists diagnostics_phase_gate on public.diagnostics;
create trigger diagnostics_phase_gate before update on public.diagnostics
for each row when (new.fase_actual is distinct from old.fase_actual)
execute function public.check_phase_gate();

-- 4.7 Gate IVOH: sin BHE validado no hay evaluación
create or replace function public.trg_ivoh_requires_bhe()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.water_balances wb
                 where wb.diagnostic_id = new.diagnostic_id and wb.estado = 'validado_r3') then
    raise exception 'IVOH bloqueado: no existe un Balance Hídrico Enriquecido validado en R3.';
  end if;
  return new;
end; $$;
drop trigger if exists ivoh_requires_bhe on public.ivoh_evaluations;
create trigger ivoh_requires_bhe before insert or update on public.ivoh_evaluations
for each row execute function public.trg_ivoh_requires_bhe();

-- 4.8 Cadena de custodia: dictamen solo con 3 transferencias firmadas
create or replace function public.trg_custody_gate()
returns trigger language plpgsql as $$
begin
  if new.dictamen is not null and (
    select count(*) from public.custody_transfers ct where ct.sample_id = new.sample_id
  ) < 3 then
    raise exception 'Dictamen bloqueado: la muestra % requiere 3 transferencias firmadas de custodia.', new.sample_id;
  end if;
  return new;
end; $$;
drop trigger if exists custody_gate on public.lab_results;
create trigger custody_gate before insert or update on public.lab_results
for each row execute function public.trg_custody_gate();

-- 4.9 Auditoría encadenada (append-only)
create or replace function public.trg_audit_hash()
returns trigger language plpgsql as $$
declare p_hash text;
begin
  select hash into p_hash from public.audit_log order by id desc limit 1;
  new.prev_hash := coalesce(p_hash, 'GENESIS');
  new.hash := encode(digest(new.prev_hash || new.ts::text || coalesce(new.user_id::text,'') ||
    new.action || new.entity || new.entity_id || coalesce(new.meta::text,''), 'sha256'), 'hex');
  return new;
end; $$;
drop trigger if exists audit_hash on public.audit_log;
create trigger audit_hash before insert on public.audit_log for each row execute function public.trg_audit_hash();
revoke update, delete on public.audit_log from authenticated, anon;

-- 4.10 updated_at en tablas con ese campo
do $$
declare t text;
begin
  foreach t in array array[
    'organizations','profiles','companies','diagnostics','document_checklist_items',
    'cat_responses','iih_assets','water_balances','balance_flows','ivoh_evaluations',
    'logbook_entries']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
  end loop;
end $$;

-- ============================================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================================
-- Aislamiento por tenant (organization_id = claim tenant_id del JWT) para tablas
-- raíz; aislamiento por membresía al diagnóstico para las tablas del expediente.

-- Función: el usuario pertenece al tenant del JWT (custom claim set by Supabase Auth hook)
create or replace function public.is_tenant_member(p_organization_id uuid)
returns boolean language sql stable as $$
  select p_organization_id = (auth.jwt() ->> 'tenant_id')::uuid;
$$;

-- 5.1 Tablas raíz con organization_id (tenant isolation)
do $$
declare t text;
begin
  foreach t in array array[
    'organizations','profiles','companies','diagnostics','documents','signatures',
    'iih_assets','water_balances','samples']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_sel', t);
    execute format(
      'create policy %I on public.%I for select using (public.is_tenant_member(organization_id))', t||'_sel', t);
  end loop;
end $$;

-- Escritura restringida: admin institucional del tenant o según se indique en app
drop policy if exists profiles_write on public.profiles;
create policy profiles_write on public.profiles for all
  using (public.is_tenant_member(organization_id) and (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds'))
  with check (public.is_tenant_member(organization_id));

drop policy if exists companies_write on public.companies;
create policy companies_write on public.companies for all
  using (public.is_tenant_member(organization_id) and (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds','equipo'))
  with check (public.is_tenant_member(organization_id));

drop policy if exists diagnostics_write on public.diagnostics;
create policy diagnostics_write on public.diagnostics for all
  using (public.is_tenant_member(organization_id)
         and public.my_diagnostic_role(id) in ('coordinador','equipo'))
  with check (public.is_tenant_member(organization_id));

drop policy if exists documents_write on public.documents;
create policy documents_write on public.documents for all
  using (public.is_tenant_member(organization_id)
         and (public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo','empresa')
              or (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds')))
  with check (public.is_tenant_member(organization_id));

-- 5.2 Tablas del expediente por membresía al diagnóstico
-- 5.2a Tablas con columna diagnostic_id
do $$
declare t text;
begin
  foreach t in array array[
    'document_checklist_items','cat_responses','balance_flows',
    'quality_parameters','custody_transfers','lab_results','ivoh_evaluations',
    'alternatives','action_plans','action_plan_items','logbook_entries']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_sel', t);
    execute format('drop policy if exists %I on public.%I', t||'_ins', t);
    execute format('drop policy if exists %I on public.%I', t||'_upd', t);
    execute format('create policy %I on public.%I for select using (public.is_diagnostic_member(diagnostic_id))', t||'_sel', t);
    execute format('create policy %I on public.%I for insert with check (public.is_diagnostic_member(diagnostic_id))', t||'_ins', t);
    execute format('create policy %I on public.%I for update using (public.is_diagnostic_member(diagnostic_id)) with check (public.is_diagnostic_member(diagnostic_id))', t||'_upd', t);
  end loop;
end $$;

-- 5.2b Tablas hijas de la bitácora (ámbito por entry_id)
do $$
declare t text;
begin
  foreach t in array array[
    'logbook_participants','logbook_agenda','logbook_findings','logbook_agreements',
    'logbook_evidence','logbook_change_log','photo_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_sel', t);
    execute format('drop policy if exists %I on public.%I', t||'_ins', t);
    execute format('drop policy if exists %I on public.%I', t||'_upd', t);
    execute format('create policy %I on public.%I for select using (public.is_logbook_entry_member(entry_id))', t||'_sel', t);
    execute format('create policy %I on public.%I for insert with check (public.is_logbook_entry_member(entry_id))', t||'_ins', t);
    execute format('create policy %I on public.%I for update using (public.is_logbook_entry_member(entry_id)) with check (public.is_logbook_entry_member(entry_id))', t||'_upd', t);
  end loop;
end $$;

-- 5.2c Membresía: lectura para miembros; alta/baja solo coordinadores del diagnóstico
alter table public.project_members enable row level security;
drop policy if exists project_members_sel on public.project_members;
drop policy if exists project_members_admin on public.project_members;
create policy project_members_sel on public.project_members for select
  using (public.is_diagnostic_member(diagnostic_id));
create policy project_members_admin on public.project_members for all
  using (public.my_diagnostic_role(diagnostic_id) = 'coordinador')
  with check (public.my_diagnostic_role(diagnostic_id) = 'coordinador');

-- iih_assets / water_balances / samples ya tienen tenant-sel; escritura por membresía
drop policy if exists iih_assets_write on public.iih_assets;
create policy iih_assets_write on public.iih_assets for all
  using (public.is_diagnostic_member(diagnostic_id) and public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo'))
  with check (public.is_diagnostic_member(diagnostic_id));

drop policy if exists water_balances_write on public.water_balances;
create policy water_balances_write on public.water_balances for all
  using (public.is_diagnostic_member(diagnostic_id) and public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo'))
  with check (public.is_diagnostic_member(diagnostic_id));

drop policy if exists samples_write on public.samples;
create policy samples_write on public.samples for all
  using (public.is_diagnostic_member(diagnostic_id) and public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo'))
  with check (public.is_diagnostic_member(diagnostic_id));

-- CAT: la empresa también captura sus respuestas
drop policy if exists cat_empresa_write on public.cat_responses;
drop policy if exists cat_empresa_update on public.cat_responses;
create policy cat_empresa_write on public.cat_responses for insert
  with check (public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo','empresa'));
create policy cat_empresa_update on public.cat_responses for update
  using (public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo','empresa'))
  with check (public.my_diagnostic_role(diagnostic_id) in ('coordinador','equipo','empresa'));

-- Checklist: empresa carga documentos, equipo valida
drop policy if exists checklist_write on public.document_checklist_items;
create policy checklist_write on public.document_checklist_items for all
  using (public.is_diagnostic_member(diagnostic_id))
  with check (public.is_diagnostic_member(diagnostic_id));

-- 5.3 Catálogos y plantillas: lectura para autenticados, escritura solo admin institucional
do $$
declare t text;
begin
  foreach t in array array[
    'iih_stages','iih_asset_types','balance_flow_catalog','quality_parameters_catalog',
    'cat_items','ivoh_index_versions','ivoh_factors','ivoh_rubrics','completeness_items',
    'logbook_templates','course_modules']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_sel', t);
    execute format('drop policy if exists %I on public.%I', t||'_adm', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t||'_sel', t);
    execute format('create policy %I on public.%I for all to authenticated using ((auth.jwt() ->> %L) = %L) with check ((auth.jwt() ->> %L) = %L)',
      t||'_adm', t, 'global_role', 'admin_institucional', 'global_role', 'admin_institucional');
  end loop;
end $$;

-- 5.4a Banco de preguntas: JAMÁS se expone la tabla cruda (filtraría 'correcta').
-- Lectura pública solo vía vista sin columna correcta; la calificación es server-side (EF-11).
alter table public.quiz_questions enable row level security;
drop policy if exists quiz_questions_sel on public.quiz_questions;
drop policy if exists quiz_questions_adm on public.quiz_questions;
create policy quiz_questions_adm on public.quiz_questions for all
  using ((auth.jwt() ->> 'global_role') = 'admin_institucional')
  with check ((auth.jwt() ->> 'global_role') = 'admin_institucional');
revoke select on public.quiz_questions from authenticated;
-- La administracion del banco (alta/edición de preguntas) se hace con service_role
-- (panel interno / EF administrativa); la política _adm queda como defensa en profundidad.

create or replace view public.v_quiz_questions as
  select id, module_orden, pregunta, opciones
  from public.quiz_questions;
comment on view public.v_quiz_questions is
  'Solo lectura segura del banco: sin correcta ni retroalimentacion. La retroalimentacion llega via EF-11 tras calificar.';
grant select on public.v_quiz_questions to authenticated;

-- 5.4 Aula: intentos propios; lectura agregada para SRHDS
alter table public.quiz_attempts enable row level security;
drop policy if exists quiz_own on public.quiz_attempts;
drop policy if exists quiz_insert on public.quiz_attempts;
create policy quiz_own on public.quiz_attempts for select
  using (user_id = auth.uid() or (auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds'));
create policy quiz_insert on public.quiz_attempts for insert
  with check (user_id = auth.uid());

-- 5.5 Audit log: solo lectura admin/SRHDS; append vía trigger o service role
alter table public.audit_log enable row level security;
drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select
  to authenticated using ((auth.jwt() ->> 'global_role') in ('admin_institucional','coordinador_srhds'));

-- 5.6 Notifications propias
alter table public.notifications enable row level security;
drop policy if exists notif_own on public.notifications;
drop policy if exists notif_mark_read on public.notifications;
create policy notif_own on public.notifications for select
  using (user_id = auth.uid());
create policy notif_mark_read on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================================
-- 6. ÍNDICES (todo filtro caliente compuesto empieza por organization_id)
-- ============================================================================
create index if not exists idx_profiles_org            on public.profiles(organization_id);
create index if not exists idx_companies_org           on public.companies(organization_id);
create index if not exists idx_companies_municipio     on public.companies(organization_id, municipio);
create index if not exists idx_companies_ciclo         on public.companies(organization_id, ciclo_vida);
create index if not exists idx_diagnostics_org         on public.diagnostics(organization_id, estado, fase_actual);
create index if not exists idx_diagnostics_company     on public.diagnostics(company_id);
create index if not exists idx_members_user            on public.project_members(user_id);
create index if not exists idx_checklist_diag          on public.document_checklist_items(diagnostic_id, item_code);
create index if not exists idx_cat_resp_diag           on public.cat_responses(diagnostic_id);
create index if not exists idx_iih_diag                on public.iih_assets(diagnostic_id, stage_code);
create index if not exists idx_iih_folio               on public.iih_assets(folio);
create index if not exists idx_iih_prio                on public.iih_assets(diagnostic_id, prioridad);
create index if not exists idx_wbal_diag               on public.water_balances(diagnostic_id, version);
create index if not exists idx_flows_bal               on public.balance_flows(balance_id, catalog_code, mes);
create index if not exists idx_samples_diag            on public.samples(diagnostic_id, estado);
create index if not exists idx_custody_sample          on public.custody_transfers(sample_id, secuencia);
create index if not exists idx_lab_sample              on public.lab_results(sample_id);
create index if not exists idx_ivoh_diag               on public.ivoh_evaluations(diagnostic_id, factor_code);
create index if not exists idx_alt_diag                on public.alternatives(diagnostic_id, prioridad);
create index if not exists idx_planitems_plan          on public.action_plan_items(plan_id, fecha_inicio);
create index if not exists idx_lb_entries_diag         on public.logbook_entries(diagnostic_id, clave);
create index if not exists idx_lb_entries_folio        on public.logbook_entries(folio);
create index if not exists idx_lb_agenda_entry         on public.logbook_agenda(entry_id);
create index if not exists idx_lb_findings_entry       on public.logbook_findings(entry_id);
create index if not exists idx_lb_agreements_diag      on public.logbook_agreements(entry_id, cerrado);
create index if not exists idx_photo_entry             on public.photo_log(entry_id);
create index if not exists idx_photo_asset             on public.photo_log(asset_folio);
create index if not exists idx_docs_diag               on public.documents(diagnostic_id, doc_type);
create index if not exists idx_docs_r2                 on public.documents(r2_key);
create index if not exists idx_signatures_doc          on public.signatures(document_id, order_no);
create index if not exists idx_audit_entity            on public.audit_log(entity, entity_id);
create index if not exists idx_notifications_user      on public.notifications(user_id, read_at);
create index if not exists idx_quiz_user               on public.quiz_attempts(user_id, ts);

-- ============================================================================
-- FIN DEL ESQUEMA — continuar con 03-seed_catalogos.sql
-- ============================================================================
