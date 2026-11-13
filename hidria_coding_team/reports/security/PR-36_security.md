# PR #36 — Revisión de Seguridad (F1-03a DB/RLS Empresas)

- **Agente:** `seguridad-privacidad` (08) — autoridad de **veto**
- **Fecha:** 2026-11-13 02:25 (America/Mexico_City)
- **PR:** [#36](https://github.com/horaciomartinez-svg/hidria-ect/pull/36) — `feat/F1-03a-companies` → `main`
- **Head:** `1fdc77be3996b5a4a40b989834713b5f586c41e4`; base `a0db8a1`; 4 archivos **+338/−1**;
  CI **6/6**, **pgTAP 231/231**; clean; **BD=repo=29**. Autor: `arquitecto-bd`.
- **Alcance:** `20261108060000_f1_03_companies.sql` (columna `created_by`, trigger ownership,
  policies `companies_sel/upd`, helper `company_in_tenant`), `080` plan 24, docs/01 y reporte.
  **Sin EF**, sin `docs/02`, sin migraciones previas editadas, sin secretos (scan 0).
- **Método:** revisión estática de la migración/trigger/policies/tests; contraste con MCP (schema
  29, función/policies aplicadas); docs/02 hash; CI. Sin git de escritura.

## Veredicto: **APROBADO CON OBSERVACIONES — SIN VETO**

Cierra los hallazgos de M1 Empresas: `created_by` es server-side e inmutable, el creador puede
hacer create→read sin membresía, la empresa ve/edita **su** ficha por `contraparte_user_id`, el
equipo sin membresía/created_by no ve empresas, `contraparte_user_id` se valida (perfil empresa,
mismo tenant, solo admin/coord) y `company_in_tenant` ya exige el tenant del llamante (cross-tenant
false). No hay regresión de aislamiento A/B ni cambios de `docs/02`/secretos.

## 1. `created_by` server-side (B2)

- Migración añade `created_by uuid REFERENCES profiles(user_id)` (nullable para filas históricas).
- Trigger `companies_ownership` BEFORE INSERT/UPDATE:
  - INSERT con `auth.uid()` no nulo → `NEW.created_by := auth.uid()` (el cliente no puede spoofear;
    si manda otro valor, se sobrescribe).
  - UPDATE que intente cambiar `created_by` → **42501** (`created_by` inmutable).
- `companies_sel` incluye `created_by = auth.uid()`; el equipo que crea la empresa la lee
  inmediatamente sin `project_members` (test 080: alta equipo → 1 fila; `created_by` = equipo).
- **Límite aceptado:** con `auth.uid()` NULL (service_role/fixtures) el trigger no fija el valor;
  son roles de confianza y no hay ruta de cliente para ellos. Sin EF en F1-03.

## 2. `companies_sel` / `companies_upd`

- `companies_sel`: tenant + `global_role` no nulo + (admin/coord **o** membresía de diagnóstico
  **o** `created_by=auth.uid()` **o** `empresa AND contraparte_user_id=auth.uid()`).
- `companies_upd`: tenant + (admin/coord/equipo **o** empresa con
  `contraparte_user_id=auth.uid()`); el trigger impide que la empresa cambie `contraparte` o
  `created_by`.
- `companies_ins/del` siguen con tenant + roles de escritura (post-#32, sin `FOR ALL` que
  conceda SELECT).
- Verificación 080: coordinador 2/tenant; empresa A 1 (propia) y 0 ajena; empresa B 1; observador
  con membresía 1; invitado 0; **equipo sin created_by = 0**, creador = 1; cross-tenant 0.

## 3. `contraparte_user_id` (SEC-PR35-01)

- Trigger `companies_ownership` valida en INSERT/UPDATE cuando el valor se asigna/cambia:
  - solo `admin_institucional`/`coordinador_srhds` (si `auth.uid()` no es nulo);
  - el UUID debe corresponder a un `profiles` **mismo tenant** y `global_role='empresa'`;
  - si no → **42501**.
- Tests 080: contraparte válida OK; perfil no-empresa → 42501; perfil de otro tenant → 42501;
  equipo no puede asignar; empresa no puede cambiar la suya; admin sí asigna; coordinador actualiza
  `ciclo_vida`.
- **Límite aceptado:** con `auth.uid()` NULL (service_role/fixtures) el trigger no aplica la
  restricción de rol; rol de confianza sin ruta de cliente. Las filas históricas con
  `contraparte_user_id` no se revalidan en la migración (el seed es válido); no hay datos reales.

## 4. `company_in_tenant` (SEC-PR32-06)

- Función SECURITY DEFINER: `p_organization_id = public.current_org_id()` **y** company del
  tenant; `current_org_id()` deriva de `organization_id`/`tenant_id` del JWT con validación UUID y
  fallback; claim ausente → NULL → false (fail-closed).
- Test 080: same tenant true; cross-tenant **false**; grants `authenticated`/`service_role`,
  revocado de `public/anon`. Ya no es un oráculo cross-tenant.

## 5. Observaciones (no bloqueantes)

| ID | Severidad | Hallazgo | Acción |
|---|---|---|---|
| **SEC-PR36-01** | OBS (contrato) | `companies_upd` permite a `equipo`/admin/coord actualizar **cualquier** empresa del tenant, no solo la creada; es coherente con docs/01 §5 (roles de escritura) y no cruza tenant, pero el texto del task decía “propia”. | Confirmar que el equipo puede editar empresas del tenant; si debe ser solo creador, restringir y test. |
| **SEC-PR36-02** | OBS (trusted roles) | Con `auth.uid()` NULL (`service_role`/fixtures) `created_by` y la restricción de contraparte no se aplican igual. | Sin ruta de cliente/EF; mantener service_role solo en servidor; documentado. |
| **SEC-PR36-03** | OBS (datos históricos) | Las filas existentes con `contraparte_user_id` no se revalidan al añadir el trigger. | Sin datos reales; migración/seed válidos; revisar en G3. |
| **SEC-PR36-04** | OBS | `created_by` nullable en filas previas; no afecta a create→read nuevos. | Aceptado; no requiere backfill en F1. |

## 6. Sin cambios/secretos/regresión

- `docs/02` **byte-idéntico** (SHA-256 `2A7B6F88…42CB5`); sin edición de migraciones previas.
- Forward-only: `schema_migrations=29` (28 + `20261108060000`); `db reset` desde archivos según
  reporte/CI.
- Secret scan **0**; tests sintéticos `.invalid`; sin PII real.
- CI 6/6, pgTAP 231/231; suites 010–070 sin regresión; sin cambios de hook/Realtime/audit/grants
  fuera de las policies de companies.

## 7. Conclusión

**APROBADO CON OBSERVACIONES, SIN VETO** para `1fdc77b`: `created_by`/B2, `companies_sel/upd`,
`contraparte_user_id` (SEC-PR35-01) y `company_in_tenant` (SEC-PR32-06) quedan cerrados con tests;
sin secretos ni drift. SEC-PR36-01 es una aclaración de contrato (equipo edita cualquier empresa
del tenant), no un bypass. Con spec+QA+CI procede el squash; #35 podrá usar `created_by` para su
B2 cuando integre F1-03a.

## Firma

`seguridad-privacidad` (08) — **APROBADO CON OBSERVACIONES** (sin veto) para
`1fdc77be3996b5a4a40b989834713b5f586c41e4` del PR #36 (F1-03a). Sin `git` de escritura, sin merge
y sin publicar secretos.
