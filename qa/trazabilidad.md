# Matriz de trazabilidad — reglas metodológicas → casos de prueba

> Viva. La mantiene `qa-tester`. Fuente: `docs/04` (reglas/TD), `docs/05` (casos),
> `docs/06` (privacidad) y `docs/08` (aula). Sin evidencia de ejecución no hay verde.
> Estado: `pendiente` · `en_progreso` · `verde` · `rojo`.
>
> **Fase 0 (2026-11-07):** no existe producto que probar — no hay Edge Functions, no hay
> suites pgTAP, `app/` es un scaffold (landing M1–M13 sin auth/router/PWA) y no hay
> staging. Por eso **todas las reglas de producto están en `pendiente`** y la columna
> Evidencia queda vacía; no se inventan resultados. Lo único ejecutado y verde en F0 es la
> CI mínima y las guardas de repositorio (ver «Evidencia de Fase 0» y
> `reports/F0/F0-07_qa_ci.md`).
>
> **Fase 1 (F1-00, PR #4):** se aplicaron 8 migraciones correctivas (11 en total) y se
> entregaron 4 suites pgTAP (39 aserciones) que **no se ejecutaron** (el host no tiene
> Docker y la CI no levanta Postgres). Las reglas se validaron con **aserciones SQL
> equivalentes** contra el proyecto; eso no sustituye la ejecución pgTAP. **Ninguna fila
> cambia a `verde`**: dictamen QA **AMARILLO con excepción documentada**
> (`reports/qa/PR-4_qa.md`); la ejecución es condición de G1 vía **task-13**.
>
> **Fase 1 (F1-01a, PR #7):** helpers de claims (`current_org_id` con precedencia
> `organization_id` > `tenant_id`, `current_global_role`, `has_global_role`,
> `has_any_global_role`, `is_tenant_member`) y seed sintético verificados por SQL en vivo;
> tras los fixes B1/M2 (`20261108020020`) y el residual `array[NULL]`/`instance_id`
> (`20261108020030`) la suite `060` pasó a **51 aserciones** y tampoco se ejecutó.
> **Ninguna fila nueva a `verde`**: SEC-01/SEC-02/SEC-04 solo con notas SQL; el 401
> `AUTH_INVALID` es del middleware EF (task-21). Dictamen **AMARILLO con excepción**
> (`reports/qa/PR-7_qa.md`).
>
> **Fase 1 (F1-01b, PR #8):** middleware `_shared/auth.ts` + `errors.ts` con **58 pruebas
> Deno** (B1 firma base64→401 + M2 parámetros→422); QA las **ejecutó** (`npx --yes
> deno@2 test` → 58/58) y `check/lint/fmt` verdes. El CI no ejecuta Deno (follow-up
> obligatorio antes de G1). SEC-04 queda como evidencia **unitaria** de middleware, no como
> verde funcional (falta integración HTTP/EF).
>
> **Fase 1 (F1-02a, PR #12):** shell PWA (router M1–M13, sesión/claims, guardas,
> `/sincronizacion` con gates no encolables). QA **reprodujo** `lint/typecheck/build` sin
> `.env` en `5cc56ed` y en el fix `32a1da8` (head final PR `61aaa21`, docs-only). El fix de
> spec **B1** (claims estrictos: `sub`/`organization_id` UUID y `global_role` del enum;
> `AuthProvider` → `invalid_claims` sin shell; `RequireAuth` redirige; `LoginPage` no
> redirige) y **M1** (M5=F1, M7=F1 mínimo/F2 completo) quedó **verificado estáticamente**.
> **task-49/H-15:** suite **Playwright versionada** en `tests/e2e/` (11 casos) con
> **11/11 verde local** (Chrome y Chromium gestionado), `webServer` build+preview y sin
> Supabase real; **pendiente job CI `E2E Playwright` (DevOps)** para cerrar H-15. El smoke
> 24/24 del autor sigue sin versionar; sin verdes funcionales hasta el run de CI. PWA
> instalable → F1-02b; Lighthouse → F1-16; Dexie/`ops_queue` → capturas offline.

| # | Regla / contrato | Documento | Casos de prueba | Estado | Evidencia |
|---|---|---|---|---|---|
| R-01 | Gates de fase F2–F6 (`check_phase_gate`; bloquea checklist R1, CAT R2, IIH V1, BHE R3, IVOH R4) | docs/04 TD-1, §1.2, EF-01; docs/05 §2, §3.1 | PG-01…PG-13; E2E-01; E2E-03; API-01 | pendiente | — |
| R-02 | Transiciones de la lista de cotejo por rol y estado (TD-2) | docs/04 TD-2, EF-03; docs/05 §3.7 | DOC-01…DOC-06; E2E-09 | pendiente | — |
| R-03 | CAT de 47 preguntas; envío/validación R2 y gate F3 | docs/04 EF-04; docs/05 §3.6 | CAT-01…CAT-03; E2E-02 | pendiente | — |
| R-04 | Brecha BHE mensual > 10 % bloquea la validación R3; vistas `v_bhe_monthly`/`v_bhe_summary` | docs/04 TD-3, EF-05; docs/05 §3.2 | PG-07, PG-08; BHE-01…BHE-05; E2E-03 | pendiente | F1-00: `fn_bhe_monthly`/`fn_bhe_summary` validados por SQL; EF-05/BHE-01…04 y pgTAP 030 pendientes (task-13) |
| R-05 | IVOH requiere un BHE validado en R3 (`trg_ivoh_requires_bhe`) | docs/04 TD-6, §1.2; docs/05 §3.3 | IVOH-02 | pendiente | — |
| R-06 | Fórmula IVOH `0.15F1+0.20F2+0.20F3+0.20F4+0.15F5+0.10F6` y semáforo <5 / 5–7.9 / ≥8 | docs/04 EF-06, TD-6; docs/05 §3.3 | IVOH-01, IVOH-03, IVOH-04; E2E-05 | pendiente | — |
| R-07 | Reporte solo con matriz de completitud 10/10 (incluye 501 de EF-13 en fases 1–2) | docs/04 TD-4, EF-07; docs/05 §4.1 | RPT-01…RPT-04; E2E-06, E2E-07 | pendiente | F1-00: `fn_completeness`=10 filas y `reporte_emitible=false` validados por SQL; EF-07/pgTAP 030 no ejecutados |
| R-08 | Folio del Reporte `{folio_diagnostico}-R1` y versión inmutable | docs/04 EF-07, §2.5; docs/05 §4.1 | RPT-02; API-01 | pendiente | F1-00: trigger `report_emission_folio` `-R1/-R2` validado por SQL; pgTAP 030 no ejecutado |
| R-09 | Dictamen de laboratorio solo con 3 transferencias de custodia firmadas | docs/04 TD-5, EF-10; docs/05 §3.4 | CUS-01…CUS-04; E2E-04 | pendiente | F1-00: `trg_custody_gate` (firma no vacía) validado por SQL; EF-10/CUS-02…04 y pgTAP 040 no ejecutados |
| R-10 | Cierre de bitácora ≤ 24 h; cierre tardío con `cerrada_razon`; ficha cerrada inmutable y versionada | docs/04 TD-8, EF-02; docs/05 §3.5 | LB-01…LB-08; E2E-08 | pendiente | — |
| R-11 | Reprogramación de hito dentro de las 6 semanas con semáforo de atraso | docs/04 TD-1 (nota), EF-12; docs/05 §3.1 | PG-12; E2E-11 | pendiente | — |
| R-12 | Folios solo del lado servidor (diagnóstico, BIT-Vx, IIH USO, fotos, `-R1`, ARCO) | docs/04 §2.5, §1.2; docs/05 §3.5 | LB-06, LB-08, RPT-02; API-01 | pendiente | — (`UNIT-*` citado por docs/05 §1.3 sin casos definidos: ver H-1) |
| R-13 | Idempotencia con `Idempotency-Key`: misma clave+mismo payload → mismo cuerpo sin duplicar efectos | docs/04 §2.3; docs/05 §4.3 | API-00; OFF-04 | pendiente | F1-00: tabla `api_idempotency` + unique `(user,endpoint,key)` validada por SQL; API-00 (EF) y pgTAP 020 no ejecutados |
| R-14 | Los gates no se encolan offline; botón deshabilitado y cero llamadas a EF | docs/04 §6 (regla 4); docs/05 §4.4 | OFF-01 | pendiente | F1-02a: `/sincronizacion` publica la regla y lista **EF-01…07, EF-10, EF-12**; Dexie/`ops_queue` diferida a M4/M6/M10; smoke E2E **24/24 reportado, no reproducido** (H-15) |
| R-15 | Merge LWW por campo y conflicto visible en UI (nunca pisar en silencio) | docs/04 §6 (regla 3); docs/05 §4.4 | OFF-03 | pendiente | — |
| R-16 | RLS multi-tenant (`is_tenant_member`) y por membresía/rol de diagnóstico (`my_diagnostic_role`) | docs/01 §RLS; docs/04 §1.1; docs/05 §4.2 | SEC-01, SEC-02, SEC-03; DOC-06; E2E-09 | pendiente | F1-00: grants + `security_invoker` validados por SQL; aislamiento por filas probado con fixtures JWT en reporte del arquitecto (no pgTAP); SEC-01/02/03 pendientes. F1-01a: `current_org_id`/`is_tenant_member` con claims simulados + `SET ROLE` validados por SQL (1/0 sin claim/ajeno); suite 060 no ejecutada; tenant B **poblado** no probado. F1-00 RES-1 (PR #19): `diagnostics_ins/upd/del` + trigger de estado inicial/folio; 19 migraciones; suites 010/050; pgTAP **129/129**; UPDATE residual → **task-59 cerrada** (PR #26): folio inmutable + gate/estado solo service_role; pgTAP **133/133**, 20 migraciones |
| R-17 | JWT con custom claims `organization_id`/`global_role`; sin claim → 401 `AUTH_INVALID` | docs/04 §2.1; docs/07 §3 (paso 0.5); docs/05 §4.2 | SEC-04 | pendiente | F1-00: hook presente con claims (no activo, E3); F1-01a: BD falla cerrado (null/false/0 filas) verificado por SQL; **16 migraciones** y fix residual `array[NULL]`→false (`20261108020030`) + `instance_id` de los 6 seed users; F1-01b: **58 pruebas Deno del middleware ejecutadas por QA (58/58)** y **CI con job Edge Functions (Deno) 5/5**; SEC-04 unitario; 401 HTTP real/integración EF pendientes (task-21); suite 060 no ejecutada; F1-02a: UI con claims **estrictos** (fix B1: `invalid_claims`, sin shell) y guardas de navegación, pero **no autoriza** (RLS/EF manda) y su smoke 24/24 no se reprodujo |
| R-18 | `quiz_questions` denegada a `authenticated`; `v_quiz_questions` sin `correcta`/retroalimentación | docs/04 §9, TD-7; docs/05 §4.2 | SEC-05; AUL-01 | pendiente | F1-00: `authenticated` sin SELECT en tabla cruda y vista sin `correcta` (columnas) validado por SQL; pgTAP 010 no ejecutado; AUL-01 pendiente |
| R-19 | `audit_log` append-only con hash encadenado `prev_hash→hash` | docs/01; docs/04 §2.6; docs/05 §4.2 | SEC-06 | pendiente | F1-00: cadena/hash, GENESIS, unique `prev_hash` y append-only validados por SQL (estructura); recálculo SHA-256/concurrencia y pgTAP 020 no ejecutados |
| R-20 | Aviso de privacidad y ARCO verbatim; buzón ARCO con folio `ARCO-AAAA-NNNN` y plazos | docs/06 §5, §12; docs/05 no incluye PRIV | PRIV-01…PRIV-04 | pendiente | — (casos definidos solo en docs/06 §12: ver H-2) |
| R-21 | Aula: calificación server-side, ≥ 80 %, insignia Open Badges 3.0 | docs/08; docs/04 TD-7, EF-11; docs/05 §4.7 | AUL-01…AUL-03; E2E-10 | pendiente | — |
| R-22 | Realtime por canal `diagnostic:{id}`/`org:{org}` con RLS de suscripción | docs/04 §7; docs/05 §4.5 | RT-01, RT-02 | pendiente | F1-00: 5 tablas publicadas + 3 políticas `hidria_rt_*` validadas por SQL (existencia); predicados/denegación y pgTAP 040 no ejecutados; RT-01/02 en F1-17 |
| R-23 | Gate F4: todos los activos IIH con `verificado_v1=true` | docs/04 TD-1#3; docs/05 §3.1 | PG-05, PG-06 | pendiente | — |
| R-24 | Sin saltos de fase y rol de diagnóstico requerido | docs/04 TD-1#7/#8; docs/05 §3.1 | PG-10, PG-11 | pendiente | — |
| R-25 | Pesos y rúbricas del IVOH inmutables en la versión vigente | docs/04 TD-6, `trg_ivoh_version_immutable`; docs/05 §3.3 | IVOH-05 | pendiente | — |
| R-26 | Importador XLSX con estructura oficial; la importación no valida R3 | docs/04 EF-09; docs/05 §4.6 | XLS-01, XLS-02 | pendiente | — |
| R-27 | Contrato API por EF: happy, rol inválido (403), precondición rota (409/422) y límite de tasa (429) | docs/04 §4, §8; docs/05 §4.3 | API-01…API-04 | pendiente | — |
| R-28 | Rendimiento y límites (Kanban, vistas, presign R2, concurrencia) | docs/05 §4.8 | PER-01…PER-04 | pendiente | — |
| R-29 | Criterios de aceptación del piloto | docs/05 §9; arquitectura §11 | CAP-01…CAP-04; E2E-12 | pendiente | — |
| R-30 | Payload de los eventos Realtime del §7 (9 eventos) | docs/04 §7; docs/05 §4.5 | RT-01 (parcial, solo entrega/refresco); sin IDs por evento | pendiente | — (hueco de plan: no hay casos por payload: ver H-7) |
| R-31 | Cola offline FIFO con `Idempotency-Key = client_op_id` y sellos `captured_at` preservados | docs/04 §6 (reglas 1–2); docs/05 §4.4 | OFF-02 | pendiente | — |
| R-32 | Unitarias de cálculo (IVOH, brecha), parsers XLSX, LWW y validaciones (Vitest) | docs/05 §1.3; agente 05 §3 | `UNIT-*` (sin IDs ni casos en docs/05) | pendiente | — (hueco de plan: ver H-1) |

## Estado de ejecución por suite en Fase 0

Ninguna suite de producto es ejecutable: no hay implementación. Recuento de casos
**definidos** (solo definición, no ejecución):

| Suite / nivel | Casos definidos | Ejecutables en F0 | Bloqueo |
|---|---|---|---|
| pgTAP: PG / BHE / IVOH / CUS / LB / CAT / DOC / SEC | 50 | 0 | `supabase/tests/` solo tiene README; no hay runner pgTAP ni servicio Postgres en CI. Los triggers/RLS existen en el DDL, pero no hay casos SQL. |
| Reporte (RPT) | 4 | 0 | Sin EF-07, sin generación de PDF, sin R2. |
| Contrato API (API-00…API-04) | 5 | 0 | `supabase/functions/` solo tiene README; no hay EF desplegadas ni staging. |
| Unitarias cliente (`UNIT-*`) | 0 definidos | 0 | docs/05 cita Vitest pero no define casos; `app/` no tiene lógica de negocio. |
| E2E (E2E-01…E2E-12) | 12 | 0 | Sin auth, router, datos, UI funcional ni staging. |
| Offline (OFF-01…OFF-04) | 4 | 0 | Sin PWA/service worker/Dexie y sin EF. |
| Realtime (RT-01/02) | 2 | 0 | Sin canales ni cliente Supabase. |
| Importador XLSX (XLS-01/02) | 2 | 0 | Sin EF-09 ni UI de importación. |
| Aula (AUL-01…AUL-03) | 3 | 0 | Sin banco de preguntas expuesto ni EF-11. |
| Rendimiento (PER-01…PER-04) | 4 | 0 | Sin staging ni dataset sintético (30 empresas / 60 diagnósticos). |
| Privacidad (PRIV-01…PRIV-04) | 4 (docs/06) | 0 | Addendum ARCO aplicado en BD, pero sin buzón en cliente ni pruebas. |
| Piloto (CAP-01…CAP-04) | 4 | 0 | Requiere entorno `piloto` y 3 diagnósticos reales. |

**Total:** 90 casos definidos en `docs/05` + 4 de `docs/06` (`PRIV`) = **94 definidos, 0
ejecutables en F0**. La cobertura de la matriz es de *definición* (regla → caso); no de
*ejecución*.

### Suites F1 (PR #4 / PR #7) — definidas, NO ejecutadas

`supabase/tests/010…040, 060` contienen **90 aserciones pgTAP** (39 de F1-00 + 51 de
F1-01a). Se verificó estáticamente que `plan()` coincide (12/9/9/9/51) y que el esquema
soporta sus aserciones (SQL de solo lectura), pero **0/90 ejecutadas**: no hay runner
Postgres y la CI no levanta BD. La equivalencia con aserciones SQL vía MCP **no** se
contabiliza como ejecución. Dictamen QA: **AMARILLO con excepción documentada**
(`reports/qa/PR-4_qa.md` y `reports/qa/PR-7_qa.md`); **task-13** (pgTAP en CI, obligatoria
antes de G1) debe ejecutarlas y publicar run id.

| Archivo | Aserciones | Cobertura (capa BD) | Ejecutadas |
|---|---|---|---|
| `010_f1_00_grants_views.sql` | 12 | grants, `quiz_questions` vs vista, `security_invoker`, helper RLS | 0 |
| `020_f1_00_idempotency_audit.sql` | 9 | M-01 unicidad, M-02 hash/cadena/acciones `reject`/`error` | 0 |
| `030_f1_00_folio_bhe_completeness.sql` | 9 | folio `-R1/-R2`, BHE por RPC, completitud 10/10 | 0 |
| `040_f1_00_enforcement_realtime.sql` | 9 | custodia firmada, F6 6/6, vigente único, hook, Realtime | 0 |
| `060_f1_01a_auth_claims.sql` | 51 | seed 6 + `instance_id`, claims, B1 (`NULL`/`''`/`array['']`/`array[NULL]`), M2 `invitado`, RLS A/sin claim/ajeno, `my_diagnostic_role` | 0 |
| **Total** | **90** | capa BD (no E2E/EF) | **0** |

### Suite Deno F1-01b (PR #8) — ejecutada localmente, NO en CI

`supabase/functions/_shared/tests/auth_test.ts` contiene **58 pruebas** (SEC-04 unitario
incl. B1 firma base64→401, guardas de rol, catálogo de 16 endpoints, M2 parámetros→422,
middleware y errores). QA las ejecutó en local sobre el árbol `a49681d` (código idéntico al
head final `00f2ed1`) con `npx --yes deno@2 test` → **58/58 passed**, y `deno
check/lint/fmt` exit 0. **El CI no ejecuta Deno** → el job Deno (lint/check/test) queda como
follow-up obligatorio antes de G1 (ligado a task-13). No son casos de `docs/05`: cubren el
middleware, no la integración HTTP de las EF; por eso no se marca ningún verde funcional.
Evidencia: `reports/qa/PR-8_qa.md`.

### Suite E2E Playwright (task-49 / H-15) — versionada y verde en CI

`tests/e2e/` contiene la suite Playwright versionada del shell F1-02a: **11 casos** (protegidas
→ login, shell/nav/breadcrumbs/claims, M5 F1, `invitado` restringido, logout, gates no
encolables, B1 sin claims/UUID inválido/rol fuera de enum, `LoginPage` sin redirect). QA la
ejecutó contra el build de producción (`webServer` build+`vite preview`, Supabase ficticio,
sesiones JWT sintéticas, sin `.env` ni secretos) con **Chrome y Chromium gestionado**:
**11/11 passed** en ambos. Ya está en CI (PR #23, merge `cf7faa5`): run `42514177112` y
post-merge `42514381567`, **5/5 checks**, E2E job success (`11 passed`) y artefacto
`playwright-report`; **H-15 resuelto**. Evidencia: `reports/qa/F1-02_e2e.md`, PR #23.

## Huecos de plan detectados (para el revisor de especificaciones; QA no inventa IDs)

- **H-1.** `docs/05` §1.3 y el rol de QA (§3) citan pruebas `UNIT-*` (Vitest) pero el
  documento no define sus IDs ni casos. R-12 y R-32 quedan sin casos unitarios concretos.
- **H-2.** `PRIV-01…PRIV-04` se definen en `docs/06` §12 («agregar al plan de pruebas»)
  pero `docs/05` §2 no los incorpora; el plan de pruebas debe incluirlos.
- **H-3.** Límite de tasa contradictorio: `docs/04` §8 dice `RATE_LIMIT` a 100 req/min
  (MVP) y `docs/05` API-04 dice 120 req/min desde un usuario. Debe unificarse antes de
  API-04.
- **H-4.** `docs/05` API-00 exige `409 CONFLICT_STATE` cuando llega la misma
  `Idempotency-Key` con **distinto** payload; `docs/04` §2.3 no define ese caso. Contrato
  incompleto.
- **H-5.** `docs/05` §2 cita «RPT-01…RPT-03», pero §4.1 define RPT-04; la matriz
  referencia RPT-01…RPT-04.
- **H-6.** `docs/05` §8 (punto 1) exige pgTAP y contrato en cada push; la CI de F0 solo
  ejecuta guardas + lint/typecheck/build. Se planifica en F1 (no es defecto de F0).
- **H-7.** No hay casos por evento Realtime del §7 (solo RT-01/02 de entrega y
  aislamiento); los 9 payloads no tienen verificación dedicada.
- **H-8.** `docs/05` no define casos de capa BD para grants, `security_invoker`, tabla
  `api_idempotency`, `report_emissions` ni hook de claims. Las suites F1-00 se mapean a IDs
  cercanos (SEC-05, SEC-06, API-00, BHE-05, RPT-02, CUS-01, RT-02) pero **sin IDs propios**;
  al ejecutarlas en task-13 debe documentarse el mapeo y llevarse al plan (F1-18).
- **H-9.** Las suites F1-00 **no son ejecutables en Postgres+pgtap genérico**: requieren el
  baseline Supabase (roles `anon`/`authenticated`/`service_role`/`supabase_auth_admin`,
  `auth.users`/`auth.uid()`, `realtime.messages`/`topic()`, publicación
  `supabase_realtime`, esquemas `extensions`). Task-13 debe usar Supabase CLI local
  (`supabase start` + `supabase db reset` + `supabase test db`) o un bootstrap equivalente;
  un `services: postgres` pelado no basta. Aplica igual a la suite `060`.
- **H-10.** `docs/05` no define casos de capa BD para los helpers de claims ni para el seed
  sintético (precedencia `organization_id` > `tenant_id`, alias, sin claim → null/false,
  grants). La suite `060` se mapea a SEC-01/SEC-02 (parcial) y a la parte BD de SEC-04
  (falla cerrado); el `401 AUTH_INVALID` es del middleware EF (task-21). El mapeo debe
  llevarse al plan (F1-18) cuando task-13 ejecute la suite.
- **H-11.** El seed sintético (6 `auth.users` + 6 `profiles` + empresa/diagnósticos/
  membresías) va dentro de una **migración forward-only**. Cualquier entorno que aplique
  migraciones (staging y, en release, `piloto`) recibiría cuentas sintéticas. Debe moverse a
  `supabase/seed.sql` (solo local) o gatearse por entorno **antes de F1-16/piloto**; no
  bloquea F1-01a en dev/staging sintético (ADR-007 + task-27/task-28).
- **H-12 (resuelto en `20261108020030`).** El residual `has_any_global_role(array[NULL])`
  con claim ya devuelve **false** (sin claim también), con `unnest` + filtro de nulos/vacíos
  y `coalesce(…, false)`; `array['equipo',NULL]` es true si hay claim `equipo`. La suite
  `060` (51 aserciones) ya cubre `array[NULL]` con/sin claim. Verificado por QA en BD y
  estáticamente en la suite; queda pendiente solo la ejecución pgTAP (task-13).
- **H-13 (resuelto en CI).** El CI **ya incluye el job «Edge Functions (Deno)»** (5/5 en
  PR #12, `32a1da8`/`61aaa21`), que ejecuta la suite Deno de `_shared`; mantenerlo como check
  obligatorio y añadir `deno.json`/`SUPABASE_JWT_SECRET` al inventario si aplica. La suite
  pgTAP sigue fuera de CI (task-13).
- **H-14 (menor, documental).** El reporte F1-01b del head `00f2ed1` conserva en §2.4 la
  fila obsoleta «`organization_id` ≠ `tenant_id` ⇒ 401 `tenant_inconsistente`», ya
  contradictoria con §0.1/§2.1 y con el código (precedencia ADR-005, sin rechazo por
  mismatch). Corregir en el próximo commit documental; no afecta al código ni a los tests.
- **H-15 (RESUELTO — CI verde).** El smoke no versionado se reemplazó por la suite
  **Playwright versionada** `tests/e2e/` (11 casos): **11/11 local** (Chrome y Chromium),
  mergeada en PR #23 (`cf7faa5`). CI: run PR [42514177112](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42514177112)
  **5/5** (E2E job `128833457125` success; `11 passed`; artefacto `playwright-report`
  `13630053837`) y **run post-merge main** [42514381567](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42514381567)
  **5/5** (E2E job `128834097587` success; artefacto `13630457311`). El check `E2E Playwright`
  es estable; se recomienda añadirlo como **required** (ruleset). H-15 cerrado; los checks
  del shell quedan con evidencia CI. **No** se marcan verdes las reglas de producto R-*: la
  suite es UI del shell y E2E-01/E2E-09 de `docs/05` siguen sin flujos reales.

## Evidencia de Fase 0 (no son casos de `docs/05`)

| Verificación F0 | Evidencia |
|---|---|
| CI mínima en verde (guardas + lint/typecheck/build) en PR #2 | `reports/F0/F0-07_qa_ci.md`; checks 128564175440 y 128564175630; run [42425963485](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42425963485) |
| `docs/02` byte-idéntico a la migración base | SHA-256 `2A7B6F8888040990B109F580F6BE50F7F03BF7D9FF7B2299D7BD50BC85442CB5` (local) + job «Guardas de repositorio» |
| Estructura monorepo y scaffold compilable | `reports/qa/PR-2_qa.md`; `npm run lint/typecheck/build` exit 0 |

## Evidencia de Fase 1 (en curso — F1-00 / F1-01a)

| Verificación F1 | Resultado | Evidencia |
|---|---|---|
| 11 migraciones aplicadas (3 base + 8 F1-00), sin editar la base ni `docs/02` | ✓ | `list_migrations` (11 filas); hash `docs/02` intacto; `reports/qa/PR-4_qa.md` §2 |
| 46 tablas / 46 con RLS / 6 vistas / 105 políticas | ✓ | SQL de solo lectura (QA) |
| 5/6 vistas con `security_invoker=true`; `v_quiz_questions` definer | ✓ | `pg_class.reloptions` |
| Grants clave: `authenticated` sin `quiz_questions`/`api_idempotency`; `anon` sin datos; `service_role` audit INSERT sí/UPDATE no | ✓ | `has_table_privilege` |
| Realtime: 5 tablas publicadas + 3 políticas `hidria_rt_*` | ✓ | `pg_publication_tables`/`pg_policies` |
| Hook de claims presente (no activo, E3); default `invitado`; semilla institucional; única versión IVOH vigente | ✓ | SQL |
| 4 suites pgTAP F1-00 (39 aserciones) | **✗ NO ejecutadas** | `reports/qa/PR-4_qa.md`; task-13 |
| F1-01a: 5 helpers de claims (invoker, `search_path` fijo) con precedencia, alias, sin claim e inválido; **B1 fail-closed** tras `20261108020020` y residual `array[NULL]` en `20261108020030` | ✓ | SQL con `SET LOCAL request.jwt.claims` + `SET LOCAL ROLE authenticated`; `reports/qa/PR-7_qa.md` §Re-QA final |
| F1-01a: seed sintético 6 `auth.users`/6 `profiles` (6 roles incl. `invitado`)/1 company/2 diagnósticos/6 membresías, emails `.invalid`, **`instance_id` GoTrue 6/6**, sin password ni identities | ✓ (no re-ejecutado) | SQL de conteo; `on conflict` en las migraciones |
| F1-01a: grants `authenticated`/`service_role` sí; `anon` y `PUBLIC` no | ✓ | `has_function_privilege`/`proacl` |
| Suite pgTAP `060` F1-01a (**51 aserciones**, head `c958c9e`) | **✗ NO ejecutada** | `reports/qa/PR-7_qa.md`; task-13 |
| F1-01a: **16 migraciones** aplicadas (3 base + 9 F1-00 + 4 F1-01a), forward-only | ✓ | `list_migrations` (16 filas); 20000/010/020/030 sin editar |
| F1-01b: suite Deno `_shared/auth_test.ts` (**58 pruebas**) ejecutada por QA con `npx --yes deno@2 test` | **✓ 58/58** + check/lint/fmt 0 | árbol `a49681d` (código idéntico a `00f2ed1`); `reports/qa/PR-8_qa.md` §Re-QA final |
| F1-01b: CI no ejecuta Deno (solo guardas + cliente) | **✗ excepción** | follow-up job Deno antes de G1 (H-13) |
| F1-02a: `npm run lint/typecheck/build` reproducidos sin `.env` (91 módulos; 473.13 kB/136.84 kB gzip en `5cc56ed`; **475.01 kB/137.39 kB en el fix `32a1da8`**) | **✓ exit 0** | árboles `5cc56ed` y `32a1da8`; `reports/qa/PR-12_qa.md` §1 y §Re-QA delta |
| F1-02a delta: **B1** claims estrictos (`invalid_claims` sin shell; `RequireAuth` redirige; `LoginPage` no redirige) y **M1** M5=F1/M7=F1+nota; CI **5/5** (incl. Deno) en `32a1da8`/`61aaa21` | **✓ verificado estáticamente** | `reports/qa/PR-12_qa.md` §Re-QA delta |
| F1-02a: suite Playwright versionada `tests/e2e/` (**11 casos**) | **✓ 11/11 local** (Chrome + Chromium gestionado) | `reports/qa/F1-02_e2e.md`; sin `.env`/secretos, Supabase ficticio |
| F1-02a: job CI **`E2E Playwright`** con artefactos y run id | **✓ success** (PR `42514177112` y post-merge `42514381567`, 5/5; E2E jobs `128833457125`/`128834097587`, 11 passed) | artefactos `13630053837`/`13630457311`; `reports/qa/F1-02_e2e.md` |
| F1-02a: checks del shell E2E (protegidas/sesión/invitado/logout/gates/B1) | **✓ verde CI** (solo shell UI) | suite `tests/e2e/`; sin verdes de reglas R-* |
| F1-02a: PWA instalable / Lighthouse / Dexie | diferidos correctamente | F1-02b / F1-16 / capturas offline |
| F1-02b A/2: `npm ci`/`lint`/`typecheck`/`build` sin `.env` + PWA (`injectManifest`, 11 precache, `sw.js`, manifest, `offline.html`, iconos en `dist/`) | **✓ exit 0** | `reports/qa/PR-21_qa.md` §1–§2 + §Re-QA delta; head `73df49b` |
| F1-02b A/2: política de caché (solo shell, `NetworkOnly` Supabase/R2, sin tokens/IDB, `SKIP_WAITING` same-origin exacto, SW off en dev) y manifest/offline accesibles | **✓ estática + SW generado** | `PR-21_qa.md` §3–§5 + §Re-QA delta |
| F1-02b A/2: CI **10/10** runs (incl. pgTAP/E2E), `docs/02` intacto, alcance/secretos limpios | **✓** | runs 42515175830 / 42515171348; `PR-21_qa.md` §6 + §Re-QA delta |
| F1-02b A/2: observaciones P2 (`pwa:audit` sin archivo; icono maskable idéntico al normal) | **P2-02 resuelto** en `73df49b`; P2-01 icono maskable queda no bloqueante | `PR-21_qa.md` §7 + §Re-QA delta |
| F1-02b A/2 delta `73df49b`: B1 same-origin exacto (+ `check-sw-origin` en build), M1 fases diferidas a #22, offline sin `onclick`, `pwa:audit` retirado; CI **10/10** | **✓** | `PR-21_qa.md` §Re-QA delta; runs 42515175830/42515171348 |
| F1-02b: instalabilidad real/Lighthouse | **diferido** a F1-16/ADR-008 + B/2 (no exigido en A/2) | `PR-21_qa.md` §8 |
| F1-02b B/2 (PR #22 `7400dd9`/código `0d67135`): build/lint/typecheck sin `.env`, **E2E 11/11**, `pwa:audit` **12/12** local-only, `__APP_BUILD__`/cacheName, M5→F2/M7 F1 mínimo+nota, UI sin auto-skip | **✓** | `reports/qa/PR-22_qa.md` §1–§3; runs 43347019161/43347012385 |
| F1-02b B/2: SW/offline sin regresión, `docs/02` intacto, alcance app/tests/reportes, sin secretos; CI 12/12 | **✓** | `PR-22_qa.md` §4; check-runs 12/12 |
| F1-00 RES-1: 3 migraciones nuevas (`30000/010/020`), **19 en total**, forward-only; `diagnostics_ins/upd/del`, trigger estado inicial/folio, roles, company, vistas y `profiles_write` | **✓ verificado estático** | `reports/qa/PR-19_qa.md` §1–§2; MCP `schema_migrations`=19 |
| F1-00 RES-1: suites `010` plan **21**, `050` plan **24**, total **129/129** en pgTAP CI (6 suites) | **✓ CI** | run 42514098168 (PR) / 42514093030 (push); `PR-19_qa.md` §3–§4 |
| F1-00 RES-1: `docs/02` intacto, alcance migraciones/tests/reportes, sin secretos; residual UPDATE (incl. folio) → task-59 aceptada | **✓** | `PR-19_qa.md` §5–§6 |
| F1-00 task-59 (PR #26 `5d84a20`): `diagnostics_update_lock` folio inmutable y gate/estado solo `service_role`/EF; `fase_actual` por gate F2; INSERT RES-1 intacto | **✓ estático + pgTAP** | `reports/qa/PR-26_qa.md` §1–§2 |
| F1-00 task-59: suite `050` plan **28**, total **133/133** en CI (20 migraciones; run 42515152096/42515136929) | **✓** | `PR-26_qa.md` §2–§3 |
| F1-00 task-66 (PR #28 `434089f`): contrato `auth.uid() is null` (solo `service_role`/EF; RPC definer autenticado no válido), tests folio `service_role` + 5 gates restantes, sign-off ADR-010, notas docs/01 §5/docs/04 §2.5 | **✓ estático + pgTAP** | `reports/qa/PR-28_qa.md` §1–§2 |
| F1-00 task-66: suite `050` plan **34**, total **139/139** en CI (sin migraciones nuevas; 20) | **✓** | runs 42516247234 / 42516233947; `PR-28_qa.md` §2–§3 |
| CI hardening task-50 (PR #29 `e51e99b`): audit prod **0 high/critical** (2 moderate), dist-scan 0 hallazgos + fixture inyectado falla, build-guard 4/4, job Seguridad 6/6, E2E `ubuntu-24.04` | **✓** | `reports/qa/PR-29_qa.md` §1–§4; runs 43345519676/43345513459 |
| CI hardening task-50: SEC-PR29-01/03 cerrados en PR #34 `c624eca` (allowlist schema estricto, fixtures negativos versionados + selftest en job); **SEC-PR29-02 cerrado 2026-11-13** (ruleset con **6 checks required**, incluido `Seguridad (dependencias y bundle)`) | **✓ 01/02/03** | `reports/qa/PR-34_qa.md`; job `131628150844`; ruleset `26780941` |
| F1-01a task-35 (PR #32 `fe5c150`): matriz invitado/observador, profiles solo propio, companies membresía/agregado, 5 tablas sin agregado, VETO-1/2/3/4, B1 writes, M2(a), RES-1 crear→leer; BD=repo **28** | **✓ estático + pgTAP** | `reports/qa/PR-32_qa.md` §1–§3 |
| F1-01a task-35: suite `070` plan **68**, total **207/207** en CI; `docs/02` intacto, sin drift/secretos | **✓** | runs 43349789216 / 43349782169; `PR-32_qa.md` §3–§4 |
| F1-03a (PR #36 `1fdc77b`): `created_by` server-side, `companies_sel` creador/ownership, `companies_upd` empresa, contraparte trigger, `company_in_tenant` tenant-locked; suite `080` plan **24**, total **231/231**, BD=repo **29** | **✓ estático + pgTAP** | `reports/qa/PR-36_qa.md` §1–§3; runs 43351421413/43351415061 |
| F1-03b (PR #35 `555422f`): UI M1 lista/alta/detalle/edición, E2E **22/22** (shell 11 + Empresas 11), B1/SEC-PR35-01, M1–M5, **B2 habilitado con 3 roles** (alta equipo); CI 12/12 | **✓ UI/código**; E2E real backend en F1-03c | `reports/qa/PR-35_qa.md` §1–§5; runs 43353090946/43353084854 |
| F1-39 EF-08 presign (PR #40 `eb5f62e`): membresía/rol/tenant antes de firmar, TTL 300, clave R2 server-side, respuesta sin `r2_key`, `register` 501 sin efectos, CORS estricto; tests Deno **101/101**, fmt/lint/check 0 | **✓ unit/integración Deno** | `reports/qa/PR-40_qa.md` §1–§3; runs 43353874625/43353866750 |
| F1-39: contrato `docs/04` (main) sin `r2_key`/TTL300/501; sin `R2_*` ni E2E real (diferido F1-16); P3 doc TTL 300/900 a alinear | **✓ contrato; E2E real diferido** | `PR-40_qa.md` §2–§3 |

**Ninguna fila de la matriz cambia a `verde` con esta evidencia**: es verificación SQL
equivalente sobre la capa BD, no ejecución de los casos `docs/05` ni de las suites.

## Reglas de actualización

- Al implementar una regla, QA agrega los casos y cambia el estado con evidencia ejecutada
  (comando, salida, entorno, fecha). Sin ejecución no hay verde.
- Un `rojo` bloquea el merge/release de la fase (gate de `docs/05`).
- Toda regla nueva de `docs/04`/`docs/06` debe aparecer aquí antes de cerrar el PR que la
  introduce.
- Los huecos H-1…H-15 se escalan al revisor de especificaciones; QA no crea casos que los
  documentos no definen ni marca resultados no ejecutados.
- **F1-00 (PR #4):** las 4 suites pgTAP están definidas pero sin ejecutar. La matriz no
  cambia a verde hasta que **task-13** las ejecute en CI con Postgres; si fallan, el autor
  (arquitecto-bd) las corrige y QA re-ejecuta.
- **F1-01a (PR #7, head final `c958c9e`, mergeado `e21a665`):** helpers/seed/RLS verificados
  por SQL; B1/M2 en `20261108020020`, residual `array[NULL]` + `instance_id` en
  `20261108020030`; **16 migraciones**; suite `060` (**51 aserciones**) definida pero sin
  ejecutar. Task-13 antes de G1; Q-02 y M1/task-27 quedan no bloqueantes.
- **F1-01b (PR #8, head final `00f2ed1` / código `a49681d`):** suite Deno **ejecutada por
  QA 58/58** (check/lint/fmt verdes), incl. B1 firma base64→401 y M2 parámetros→422; sin
  verdes funcionales (SEC-04 unitario, falta integración HTTP/EF). El job Deno **ya está en
  CI** (H-13 resuelto) y la fila §2.4 del reporte (H-14) sigue como follow-up documental.
- **F1-02a (PR #12, head final `61aaa21` / código `32a1da8`):** build/lint/typecheck
  reproducidos en `5cc56ed` y en el fix; **B1** (claims estrictos/`invalid_claims`) y **M1**
  (M5=F1, M7=F1+nota) corregidos y verificados estáticamente; CI **5/5** (incl. Deno).
  **task-49:** suite Playwright **versionada 11/11 local y verde en CI** (PR #23 mergeado
  `cf7faa5`; runs `42514177112` y post-merge `42514381567`, 5/5, E2E 11 passed,
  artefactos); **H-15 resuelto**. Los checks del shell tienen evidencia CI; **no** se marcan
  verdes las reglas R-* (E2E-01/E2E-09 siguen sin flujos reales). PWA/Lighthouse/Dexie
  diferidos correctamente.
- **F1-02b A/2 (PR #21, head final `73df49b`): VERDE** de la unidad PWA base: build/lint/typecheck
  sin `.env`, SW `injectManifest` con 11 entradas, manifest/offline/iconos en `dist/`, caché
  solo shell + `NetworkOnly` Supabase/R2, SW off en dev, **B1 same-origin exacto** con
  `check-sw-origin` en build, M1 fases diferidas a #22, `pwa:audit` retirado y offline sin
  `onclick`; CI **10/10** (incl. pgTAP/E2E), sin secretos. P2-01 no bloqueante (icono maskable
  idéntico, revisar en B/2/F1-16). Instalabilidad/Lighthouse → F1-16/ADR-008 y B/2; sin verdes
  funcionales de instalabilidad en la matriz.
- **F1-00 RES-1 (PR #19, head `e602ecd`): VERDE** de task-18: 3 migraciones nuevas (19 total,
  forward-only), hardening de INSERT de `diagnostics` (tenant/rol/company/fase, estado inicial
  congelado, folio server-side, empresa/admin fuera), vistas y `profiles_write`; suites `010`
  (21) y `050` (24) con **6/6 suites / 129/129** en pgTAP CI; `docs/02` intacto; residual de
  UPDATE (estado/reporte/bitácora y **folio**) = **task-59 aceptada** por spec/seguridad antes
  de M2/F1-04. Sin verdes de reglas R-* (solo evidencia BD).
- **F1-00 task-59 (PR #26, head `5d84a20`): VERDE** — candado de UPDATE de `diagnostics`:
  folio inmutable para todos los roles, campos de gate/estado solo `service_role`/EF,
  `fase_actual` por `diagnostics_phase_gate` (P0001), INSERT RES-1 intacto. Suite `050` plan
  **28**, total **6 suites/133/133**; 20 migraciones forward-only; `docs/04` §2.5 y ADR-010
  actualizados; `docs/02` intacto. **task-59 cerrada**; residual de `docs/01` §5 documentado
  en ADR. Condiciones no bloqueantes en **task-66** (contrato RPC/EF vs trigger, tests de
  folio con service_role/gates restantes, sign-off ADR-010) antes de M2/F1-04. Sin verdes de
  reglas R-* (evidencia BD).
- **F1-00 task-66 (PR #28, head `434089f`): VERDE** — cierre de condiciones de task-59:
  contrato alineado (`auth.uid() is null` ⇒ solo `service_role`/EF; RPC `security definer`
  autenticado no es ruta válida), tests de folio con `service_role` y de los 5 gates
  restantes → 42501, sign-off en ADR-010 y notas `docs/01` §5/`docs/04` §2.5. Suite `050`
  plan **34**, total **6 suites/139/139**; sin migraciones nuevas (20), `docs/02` intacto.
  **task-66 cerrada**; sin verdes de reglas R-* (evidencia BD).
- **CI hardening task-50 (PR #29, head `e51e99b`): VERDE** — job `Seguridad (dependencias y
  bundle)`: audit prod 0 high/critical (2 moderate), `dist-scan` 0 hallazgos y fixtures
  `sb_secret_/service_role` fallan, build-guard 4/4 (anon pasa; secret/service_role/ilegible
  fallan); 5 checks existentes intactos; CI 12/12; E2E fijado a `ubuntu-24.04` por incompatibilidad
  del runner. Condiciones pre-G1: SEC-PR29-01 (allowlist sin wildcard) y SEC-PR29-02 (check
  required); SEC-PR29-03 fixtures negativos en CI. Sin verdes de reglas R-* (es CI).
- **SEC-PR29-02 CERRADO (2026-11-13):** el ruleset `proteccion-main` (id `26780941`) exige ya
  **6 checks required** — Guardas, Cliente, Deno, pgTAP, E2E y **`Seguridad (dependencias y
  bundle)`** — con approvals 0, `non_fast_forward`/`deletion` y sin bypass. Condición pre-G1
  cumplida por el usuario; no queda acción pendiente.
- **CI hardening follow-ups (PR #34, head `c624eca`): VERDE** — allowlist v2 estricta (GHSA +
  packages no vacío + reason/task; wildcard y critical rechazados; exit 2 en schema inválido),
  fixtures `bundle-bad`/`bundle-ok` y self-test en job `Seguridad` (6/6), `build-guard-test`
  5/5 (incluye publishable), audit prod 0 high/critical. **SEC-PR29-01/03 cerrados**;
  **SEC-PR29-02 (check required) CERRADO 2026-11-13**: ruleset con **6 checks required**
  (incluido `Seguridad (dependencias y bundle)`). Sin verdes R-* (CI).
- **F1-02b B/2 (PR #22, head final `7400dd9` / código `0d67135`): VERDE — F1-02 CERRADA.**
  UI de actualización/instalación sin auto-`skipWaiting`, a11y con role/aria-live, `__APP_BUILD__`
  y `cacheName` versionado, M5→F2/M7 F1 mínimo+nota, `pwa:audit` local-only con perfil temporal
  y **12/12 CDP** (E1–E10; E6 manual), E2E 11/11 y CI 12/12. SW/offline sin regresión; `docs/02`
  intacto; sin secretos. P2-01 (icono maskable) queda no bloqueante para F1-16/ADR-008. **F1-02
  (A/2 + B/2) cerrada**; sin verdes de reglas R-* (evidencia shell/PWA).
- **F1-01a task-35 (PR #32, head `fe5c150`): VERDE — task-35 CERRADA.** Matriz de mínimo
  privilegio (invitado/observador sin tenant-wide, profiles solo propio, companies
  membresía/agregado, 5 tablas con membresía sin agregado), **VETO-1/2/3/4**, **B1 writes**
  (documents sin OR de agregado) y **RES-1** (`company_in_tenant`, equipo crea→lee). Suite
  `070` plan **68**, total **6 suites/207/207**; BD=repo **28** migraciones, `docs/02` intacto,
  sin drift ni secretos. Vigencia temporal diferida a F1-04 (ADR-011). Sin verdes R-* (evidencia
  BD/RLS).
- **F1-03a (PR #36, head `1fdc77b`): VERDE — F1-03a lista.** `companies.created_by` server-side
  e inmutable, `companies_sel` con creador/empresa/membresía/agregado, `companies_upd` empresa
  propia, contraparte validada por trigger (mismo tenant/rol empresa/solo admin-coord),
  `company_in_tenant` tenant-locked. Suite `080` plan **24**, total **8 suites/231/231**; BD=repo
  **29**, `docs/02` intacto; sin regresión ni secretos.
- **F1-03b (PR #35, head final `555422f`): VERDE UI — B2 habilitado.** Rutas reales M1,
  PostgREST+RLS, validaciones/estados/a11y, E2E **22/22**, B1 lectura `empresa` y SEC-PR35-01
  resueltos; `COMPANY_CREATE_ROLES` vuelve a los 3 roles (incl. equipo) y el alta E2E usa el claim
  de equipo; CI 12/12. La lectura real `created_by`/`companies_sel` está probada por pgTAP
  #36/080; la E2E con backend real/RLS queda en **F1-03c/task-82**. Sin verdes de reglas R-*.
- **F1-39 EF-08 presign (PR #40, head `99e948c`): VERDE — task-39 cerrada.** Membresía/rol/tenant
  antes de firmar (admin/coord sin membresía denegados), TTL **300 s** duro, clave R2 server-side,
  respuesta mínima sin `r2_key`, `register` **501 sin efectos**, CORS estricto; tests Deno
  **101/101**, fmt/lint/check 0; CI 12/12 (Deno extendido a `functions/**`). Sin `R2_*`/E2E real
  (diferido F1-16); P3 documental TTL 300/900 a alinear. task-86 (register) futura, task-87
  (Deno CI) efectiva. Sin verdes E2E/R2 ni reglas R-*.
