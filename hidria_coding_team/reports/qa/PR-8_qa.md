# PR #8 — QA: F1-01b Auth EF (`_shared/auth.ts`, guardas de rol y `401 AUTH_INVALID`)

- **Agente:** `qa-tester` (05)
- **Fecha:** 2026-11-07 20:40 (America/Mexico_City)
- **Tarea:** `task-34` — F1 · QA PR #8 (F1-01b auth EF, Deno tests)
- **PR:** [#8](https://github.com/horaciomartinez-svg/hidria-ect/pull/8) — `feature/F1-01b-auth-ef` → `main`
- **Head evaluado (histórico):** `caaf071b9a124dd89a938467b94071b36611ee77` (54/54 Deno; VERDE)
- **Head de código re-QA:** `a49681d9e6a098fb5137fcc845b1ffa78f0ab99c` — B1/M2; **58/58 Deno reproducidas**
- **Head final PR:** `00f2ed1fdd9b01e318d7711fe2012cb9574f43ee` (commit documental: solo reporte F1-01b; código idéntico a `a49681d`; CI 4/4)
- **Base:** `main` `6b95be062736bd62d65c9e8fa48419d7aece078e` · merge-base con la rama: `b4fbc83`
- **Diff del PR:** 5 archivos — `supabase/functions/_shared/auth.ts`, `errors.ts`, `tests/asserts.ts`, `tests/auth_test.ts` y reporte F1-01b. Solo `supabase/functions/_shared/**` + reporte.
- **Deltas:** `21b2ca3..caaf071` (solo tests/report, fixtures 005/006); `caaf071..a49681d` (B1 firma base64→401, M2 parámetros→422, alineación de claims con ADR-005); `a49681d..00f2ed1` (solo `reports/F1/F1-01b_auth_ef.md`, +55/−38).
- **Entorno:** Windows / PowerShell 5.1 · **Deno 2.9.6** vía `npx --yes deno@2` (reproducido por QA) · GitHub Actions

## Resultado histórico `caaf071`: VERDE — con excepción documentada de CI (job Deno follow-up)

> **Re-QA final (`a49681d` código / `00f2ed1` documental):** ver «Re-QA final» al final.
> Dictamen final: **VERDE — merge permitido**, con **excepción Deno-CI** (job Deno antes de
> G1) y una **observación P3** (el reporte aún conserva una fila obsoleta en §2.4 sobre
> `tenant_inconsistente`; corregir en el próximo commit documental). B1/M2 cubiertos y suite
> **58/58 ejecutada por QA**; sin verdes funcionales (integración HTTP/EF pendiente).

## 1. Ejecución independiente de la suite (evidencia)

Ejecutada por QA sobre una copia materializada del **árbol del head `caaf071`** (sin git de
escritura; `npx deno@2` descargó Deno 2.9.6):

| # | Comando | Resultado |
|---|---|---|
| 1 | `npx --yes deno@2 test supabase/functions/_shared/tests/` | **`ok | 54 passed | 0 failed (137 ms)`** |
| 2 | `npx --yes deno@2 check errors.ts auth.ts tests/asserts.ts tests/auth_test.ts` | **exit 0** (4 archivos sin errores) |
| 3 | `npx --yes deno@2 lint …` (4 archivos) | **exit 0** (0 problemas) |
| 4 | `npx --yes deno@2 fmt --check …` (4 archivos) | **exit 0** |

Nota: el mensaje del supervisor indicaba «53 pruebas»; en el head final `caaf071` el
conteo real es **54** (`Deno.test` en el archivo = 54; la prueba añadida es
`admin_institucional no eleva privilegios de diagnóstico` y EF-11 se amplió a
observador/admin/invitado). El reporte del PR ya está actualizado a 54/54; coincide con
la ejecución de QA. `deno.lock` no se versiona (no está en el diff).

## 2. Cobertura de la suite (54 pruebas)

| Grupo | Casos | Qué cubre | Trazabilidad `docs/05` |
|---|---|---|---|
| SEC-04 token/claims | 16 | token ausente/no-Bearer/malformado, payload no-JSON, firma inválida, alg ≠ HS256, expirado, `nbf` futuro, sin claim de tenant, `organization_id`≠`tenant_id`, tenant no-UUID, `sub` inválido, audiencia, emisor, `global_role` ausente/fuera de catálogo | SEC-04 |
| Camino válido y claims | 7 | contexto congelado, alias `tenant_id`, precedencia, verificador inyectado, `verifyProfile` true/false, misconfig → 500, `verifyHs256Signature` | SEC-04 / ADR-005 |
| Guardas de claims | 3 | `requireTenant`, `requireGlobalRole` (permitido / 403) | SEC-01/SEC-03 base |
| Guarda de diagnóstico | 4 | rol válido, no miembro, rol insuficiente, id malformado (anti-enumeración) | DOC-03, PG-11, RPT-03 |
| Catálogo | 3 | 16 endpoints ↔ EF-01…EF-13, políticas, métodos/rutas/params | API-01/API-02 base |
| Guardas por endpoint | 12 | EF-01; EF-07/12/13 solo coordinador; **admin no eleva privilegios**; EF-03; EF-08 presign/register; EF-11 (observador/admin/invitado); recurso ajeno; parámetros faltantes | API-02, DOC-01/02/05 |
| Pipeline/middleware | 6 | `authorizeEndpoint` (éxito/401/403/ruta desconocida/body), `withAuth` (401, contexto, 500 sin fugas) | API-00…04 base |
| Errores/envelope | 3 | `VALIDATION_*`→422, catálogo §8, `ref` de auditoría, `GLOBAL_ROLES` (6) | API-03 base |

**Huecos de cobertura (no bloqueantes):** no hay prueba explícita de `exp` **ausente**
(el código lo rechaza como `token_expirado`) ni de `iat` con tipo inválido; el alcance es
unitaria de middleware, sin HTTP real ni JWT emitido por Supabase (E3); `verifyProfile`
requiere `profiles`/`_shared/db.ts` (pendiente); JWT asimétrico/JWKS es futuro (interfaz
`verify` inyectable ya probada). Todo está declarado en el reporte del PR §8.

## 3. Revisión estática de seguridad (QA)

| Comprobación | Resultado |
|---|---|
| Verificación de firma | HS256 con `crypto.subtle.verify` (HMAC); `alg` debe ser exactamente `HS256` (`none`/RS256 rechazados); secreto se inyecta, **no** se lee `Deno.env` |
| Tiempos | `exp` obligatorio y numérico (expirado ⇒ 401); `nbf` con tolerancia 30 s; `iat` no numérico ⇒ 401 |
| Audiencia/emisor | `aud` debe contener `authenticated` (configurable); `iss` validado si se configura |
| Claims | `sub` UUID obligatorio; **`organization_id` con precedencia**, alias `tenant_id`; si ambos difieren ⇒ 401 `tenant_inconsistente`; sin tenant ⇒ 401 |
| Rol global | validado contra los 6 de ADR-005; rol de diagnóstico **nunca** viene del cliente (se resuelve con `resolveRole` inyectado) |
| 403 | `FORBIDDEN_ROLE` vs `FORBIDDEN_NOT_MEMBER`; id malformado/ajeno ⇒ `FORBIDDEN_NOT_MEMBER` (anti-enumeración) |
| Endpoints | 16 rutas ↔ EF-01…EF-13; EF-07/12/13 solo `coordinador`; EF-08 presign solo auth+tenant (documentado); `admin_institucional` no eleva privilegios de diagnóstico |
| Errores | catálogo `docs/04` §8 completo (AUTH, FORBIDDEN, CONFLICT_*, GATE_*, RATE_LIMIT, EXT_PSC, NOT_IMPLEMENTED_PHASE, `VALIDATION_*`→422); envelope sin stack traces; `withAuth` degrada no controlados a 500 genérico |
| Secretos | sin secretos reales en el diff; JWT de prueba firmado con secreto sintético; sin `service_role`/`SUPABASE_*` en código; `Deno.env` no se usa |

## 4. Regresión y alcance

| Comprobación | Resultado |
|---|---|
| CI en `caaf071` | **4/4 success** — runs [42438259343](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42438259343) (push) y [42438262784](https://github.com/horaciomartinez-svg/hidria-ect/actions/runs/42438262784) (PR), `head_sha=caaf071`; Guardas + Cliente |
| Archivos fuera de alcance | No: PR = `supabase/functions/_shared/**` (4) + reporte; sin migraciones, `supabase/tests/**`, `app/**`, `.github/**`, `docs/**` |
| `docs/02` ↔ migración base | Sin cambios: mismo blob `a2394bce…` en `caaf071` |
| Secret scan del árbol | Sin coincidencias de patrones de secreto; guarda CI verde |
| Deno | `test/check/lint/fmt` verdes en local (§1); **no** en CI (excepción) |
| `mergeable_state` | `clean` según el supervisor; la consulta API devolvió `unknown` puntualmente (GitHub calculando), sin conflicto ni fallo de checks |

## 5. Dictamen explícito de la excepción Deno-CI

- QA **reproduce** la suite 54/54 y los checks de calidad en el head final ⇒ la evidencia de
  ejecución exigida existe; **no es AMARILLO por falta de ejecución** (a diferencia de
  F1-00/F1-01a con pgTAP).
- El CI **no ejecuta Deno**: la suite no bloquea regresiones futuras. Se acepta como
  **excepción documentada de infraestructura** con **follow-up obligatorio antes de G1**:
  job `denoland/setup-deno` + `deno lint/check/test` (ligado a task-13 / habilitadores).
- **Dictamen: VERDE (merge permitido)**, sin veto de QA; la condición de CI aplica al gate
  G1, no al merge de este PR.

## 6. Observaciones (no bloqueantes)

| ID | Observación | Severidad | Dueño |
|---|---|---|---|
| O-01 | CI sin job Deno: la suite (54) no es check obligatorio; job `denoland/setup-deno` + lint/check/test antes de G1 (junto a task-13). | P2 (G1) | devops + QA |
| O-02 | Faltan casos explícitos para `exp` ausente e `iat` inválido (el código ya los rechaza); añadir 2 aserciones. | P3 | dev-edge-functions |
| O-03 | SEC-04 se prueba a nivel middleware; la integración HTTP/EF real (401/403 end-to-end) y `verifyProfile` con DB quedan para la primera EF (task-21/F1-06). | P2 (F1) | dev-edge-functions + QA |
| O-04 | Sin `supabase/config.toml` ni `deno.json`; `SUPABASE_JWT_SECRET` no está en el inventario `.env.example` (declarado en reporte §8.2). | P3 | devops |
| O-05 | El conteo del mensaje de coordinación («53») quedó desactualizado: el head final tiene **54** pruebas; el reporte del PR ya está corregido. | P3 | supervisor/QA |
| O-06 | Catálogo de 16 endpoints ↔ EF-01…EF-13: la exactitud frente a `docs/04` §3/§4 es del spec review; QA verificó consistencia interna y ejecución de las guardas. | informativo | revisor |

## 7. Checklist QA (`agents/05_qa_tester.md` §5)

| Criterio | Estado |
|---|---|
| Suites aplicables ejecutadas y verdes | ✓ local 54/54 + check/lint/fmt exit 0; ✗ no automatizadas en CI (excepción) |
| Sin regresiones | ✓ CI 4/4; alcance aislado; `auth.ts`/`errors.ts` sin cambios en el delta |
| Matriz actualizada | ✓ R-17 y Evidencia F1-01b con nota unitaria; **sin verdes funcionales** |
| Gates metodológicos | N/A (auth middleware) |
| SEC-04 | ✓ 16 casos unitarios 401; integración HTTP pendiente (no verde funcional) |
| Secretos | ✓ sin secretos reales; `Deno.env` no usado |

## 8. Conclusión

**VERDE para F1-01b (merge permitido)** en `caaf071`: 54/54 pruebas Deno verdes
(reproducidas por QA), check/lint/fmt verdes, CI 4/4, sin secretos y sin archivos fuera de
alcance. **Excepción documentada:** el CI no ejecuta Deno; se exige job Deno antes de G1
(task-13). El resto (integración EF real, `verifyProfile`/DB, JWKS) queda en F1-01/F1-06.
QA no mergea; no se ejecutó git de escritura.

## Firma

QA `qa-tester`. Solo reporte QA y matriz de trazabilidad; sin modificar producto, tests,
migraciones, `app/**`, `.github/**` ni `docs/**`. Sin secretos impresos.

## Re-QA final (`a49681d` código · `00f2ed1` documental) — 2026-11-07 20:45

**Dictamen: VERDE — merge permitido**, con **excepción Deno-CI** documentada (job Deno
obligatorio antes de G1, ligado a task-13) y **observación P3** de documentación (§2.4 del
reporte F1-01b conserva una fila obsoleta). No bloqueante.

### Ejecución reproducida por QA

Se materializó el árbol del head de código `a49681d` (sin git de escritura) y se ejecutó con
**Deno 2.9.6** vía `npx --yes deno@2`:

| # | Comando | Resultado |
|---|---|---|
| 1 | `deno test supabase/functions/_shared/tests/` | **`ok | 58 passed | 0 failed (291 ms)`** |
| 2 | `deno check` (4 archivos) | exit 0 |
| 3 | `deno lint` (4 archivos) | exit 0 (0 problemas) |
| 4 | `deno fmt --check` (4 archivos) | exit 0 |

El delta `a49681d..00f2ed1` es **solo** `reports/F1/F1-01b_auth_ef.md` (+55/−38): el código
de `auth.ts`/`errors.ts`/tests es idéntico, por lo que la ejecución sobre `a49681d` aplica al
head final `00f2ed1`. CI final **4/4 success** en `00f2ed1` (runs 42439240740 push /
42439244147 PR, `head_sha=00f2ed1`).

### Cobertura B1/M2 (delta `caaf071..a49681d`, 58 pruebas)

| Hallazgo | Implementación | Pruebas |
|---|---|---|
| **B1** firma base64url malformada ⇒ 500 | `decodeJwt` decodifica header, payload **y firma** dentro del `try`; `%%%`/firma vacía ⇒ `401 AUTH_INVALID` (`formato_token`), preservando `ApiError`; `withAuth` responde 401 canónico sin stack | 2 pruebas B1 + caso `withAuth`; suite total 58/58 |
| **M2** parámetro de cliente faltante ⇒ 500 | `guardEndpoint` lanza `422 VALIDATION_PARAMETRO_REQUERIDO` con `details.param`; los fallos de configuración de la EF (dependencias sin inyectar) siguen 500 | 2 pruebas (ruta y `body.diagnostic_id` de EF-08 register) |
| Alineación de claims ADR-005/F1-01a | `organization_id` precedencia y `tenant_id` respaldo; sin rechazo por mismatch (misma semántica que `current_org_id()` de la BD) | Tests ADR-005 actualizados |
| Catálogo errores | `GATE_R2_FICHA`/`GATE_R3_FICHA` (409, hueco de docs/04 §8 → F1-18) | Test de `statusForErrorCode` |
| Fixtures | Organización semilla `00000000-…001` (ya no `b1000000-…001`, que es empresa) | Tests de aislamiento/precedencia |

### Regresión / alcance

| Comprobación | Resultado |
|---|---|
| CI en `00f2ed1` | **4/4 success** (runs 42439240740/42439244147; head_sha=00f2ed1); mergeable clean |
| `docs/02` ↔ migración base | Blob idéntico `a2394bce…` en `00f2ed1` |
| Secretos | Secret scan del árbol `00f2ed1` sin coincidencias |
| Alcance | 5 archivos: `_shared/**` (4) + reporte; sin migraciones/`supabase/tests`/`app`/`.github`/`docs` |
| Delta documental | Solo reporte (+55/−38); sin cambios en `auth.ts`/`errors.ts`/tests |

### Observaciones (no bloqueantes)

| ID | Observación | Severidad | Dueño |
|---|---|---|---|
| O-01 | El CI **no ejecuta Deno**: 58 pruebas no son check obligatorio; job `denoland/setup-deno` + lint/check/test antes de G1 (task-13). | P2 (G1) | devops + QA |
| O-02 | El reporte F1-01b `00f2ed1` aún conserva en §2.4 la fila «`organization_id` ≠ `tenant_id` ⇒ 401 `tenant_inconsistente`», obsoleta tras la alineación ADR-005 (el código y el resto del reporte ya dicen precedencia). Corregir en el próximo commit documental (no bloqueante). | P3 | dev-edge-functions |
| O-03 | SEC-04 es unitario de middleware; integración HTTP real/`verifyProfile` con DB pendientes (primera EF/task-21). | P2 (F1) | dev-edge-functions + QA |
| O-04 | EF-08 presign (M1/Q-08) rastreado en **task-39**; `GATE_R2/R3_FICHA` requieren alta en `docs/04` (F1-18). | P3 | revisor + docs |
| O-05 | E3 (hook activo) consta en `F0-14` según el reporte; QA **no** lo re-verificó en este delta (fuera de alcance auth middleware). | info | Lead/devops |

### Conclusión

**VERDE para F1-01b en `00f2ed1` (código `a49681d`)**: 58/58 pruebas Deno reproducidas por
QA, check/lint/fmt verdes, CI 4/4, sin secretos, sin cambios fuera de alcance. Excepción
Deno-CI y observación P3 de reporte no bloquean el merge; el job Deno es exigible antes de
G1. Sin verdes funcionales de SEC-04 en la matriz (falta integración HTTP/EF). QA no mergea
ni hace git de escritura.
