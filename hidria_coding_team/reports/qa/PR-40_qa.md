# PR #40 — QA: EF-08 presign con membresía (task-39 / Q-08)

- **Agente:** `qa-tester` (05)
- **Fecha:** 2026-11-08 15:00 (America/Mexico_City)
- **Tarea:** `task-93` — QA PR #40 (EF-08, task-39)
- **PR:** [#40](https://github.com/horaciomartinez-svg/hidria-ect/pull/40) — `feature/F1-39-ef08-presign` → `main`
- **Head evaluado:** `eb5f62e42b9a0bc1899c5de1710e5f14ce70e171` · **Base:** `main` `40785b4`
- **Diff:** 14 archivos, +2618/−34 — `supabase/functions/**`, ADR-012, README y reporte F1-39. **Sin** `docs/**` (contrato EF-08 ya en main), `supabase/migrations/**`, `app/**` ni `.github/**`.
- **CI:** **12/12 check runs success** en `eb5f62e` (runs `43353874625` PR y `43353866750` push; 6 jobs). Job **Edge Functions (Deno)** success, cubriendo `functions/**` (task-87).
- **Delta final:** `eb5f62e` vs `99e948c` = solo `reports/F1/F1-39_ef08_presign.md` (+17/−9); el código/tests verificados son idénticos.

## Resultado: **VERDE** — merge permitido; task-39 cerrada

> `presign` exige membresía/rol/tenant **antes de firmar**, TTL **300 s** duro, clave R2
> server-side y respuesta mínima **sin `r2_key`**; `register` responde **501** sin efectos;
> CORS con allowlist estricta; tests Deno **101/101**; sin `R2_*`/secretos reales y sin
> E2E real declarado (se hará en F1-16 con credenciales). Contrato `docs/04` de `main`
> coherente con la respuesta/TTL/501. **Seguridad aprobó sin veto**.

## 1. Deno final (`99e948c`, sin `.env`)

| Comando | Resultado |
|---|---|
| `deno fmt --check supabase/functions` | **OK — 14 archivos** |
| `deno lint supabase/functions` | **OK — 13 archivos, 0 problemas** |
| `deno check supabase/functions/_shared supabase/functions/ef-08-documents/index.ts` | **OK** |
| `deno test supabase/functions/_shared` | **101 passed / 0 failed** (58 previas + 43 nuevas) |

Cubre:
- **`r2_test`**: vector SigV4 externo AWS (`aeeed9bb…`) + RFC 4231 HMAC-SHA256 + SHA-256; URL PUT host/bucket/clave, `Content-Type` firmado, TTL 300 y tope duro; codificación RFC 3986; clave `org/{org}/diag/{diag}/{document_id}.{ext}`; UUID v5 determinista; allowlists MIME/ext/doc_type/exposure; filename/traversal/tamaño; fail-closed sin credenciales.
- **`presign_test`**: 200 con respuesta **sin `r2_key`**, TTL 300; 401 sin token; 404 ruta; **501 register**; 422 sin `diagnostic_id`/JSON/metadatos; **403** no miembro, observador/invitado, tenant distinto; rol del JWT (no body); idempotencia determinista; CORS preflight permitido/denegado; ruta solo POST.
- **`cors_test`**: allowlist estricta, sin comodines, preflight.
- **`documents_runtime_test`**: env → auth/R2/CORS, deps DB inyectables, fail-closed.
- **`auth_test`**: catálogo EF-08 presign (scope diagnostic, roles coordinador/equipo/empresa) y guardas.

## 2. Contrato y `register`

- `docs/04` (main `40785b4`, fuera del diff de #40): `POST /documents/presign` con `diagnostic_id` + filename/doc_type/mime/size/exposure; respuesta `{upload_url, document_id, expira_en_seg:300, metodo:'PUT'}`, **sin r2_key/bucket/credenciales**; errores 401/403/422/500; `register` 501 `NOT_IMPLEMENTED_PHASE` documentado.
- `register` autentica primero y responde 501 **sin escritura/efectos**; test dedicado.
- **P3 documental (no bloqueante):** el texto de `docs/04` menciona “tope duro 900 s, no configurable” mientras el código/pruebas fijan **300 s duro**; alinear la frase a 300 en la próxima revisión documental (el comportamiento es el más restrictivo).
- **Sin E2E real**: no hay `R2_*` en `.env` (B-03); firmador validado por vector + estructura; E2E real se difiere a F1-16. No se declara verde E2E.

## 3. Seguridad, alcance y secretos

| Comprobación | Resultado |
|---|---|
| Membresía/rol/tenant antes de firmar | ✓ `fn_diag_role` con `service_role`; admin/coord **sin membresía** también denegados; no miembro/otro tenant → 403 `FORBIDDEN_NOT_MEMBER` anti-enumeración |
| TTL | ✓ 300 s duro, `Content-Type` firmado, sin override del cliente |
| Clave R2 | ✓ server-side `org/.../{document_id}.{ext}`; respuesta mínima sin `r2_key` |
| `register` | ✓ 501 sin efectos (F1-05/task-86) |
| CORS | ✓ allowlist estricta, sin comodines |
| Secretos | ✓ sin `R2_*`/credenciales en repo; solo `.env.example` con placeholders; tests con secretos sintéticos |
| Alcance | ✓ 14 archivos `supabase/functions/**` + ADR-012 + reporte/README; sin `app/**`, `docs/**`, migraciones ni `.github/**` |
| CI | ✓ 6/6 jobs / 12 check-runs, Deno extendido a `functions/**` |

## 4. Trazabilidad

- **task-39 cerrada**: Q-08/M1 de PR #8 resuelto (membresía antes de firmar, TTL, clave server-side, respuesta mínima, 501 register, CORS, sin side effects).
- **task-86** (register real F1-05) y **task-87** (Deno CI extendido) quedan como referencias: task-87 ya efectivo en CI; task-86 futura.
- `qa/trazabilidad.md`: evidencia de EF-08 unit/integración Deno; **sin verdes E2E/R2 reales** ni de reglas R-* (no se ejecutaron casos `docs/05` con datos reales).

## Dictamen

**VERDE — merge permitido.** Membresía/rol/tenant antes de firmar, TTL 300, clave server-side, respuesta sin `r2_key`, `register` 501 sin efectos, CORS estricto, tests Deno **101/101**, CI 12/12, sin secretos y alcance correcto. **task-39 cerrada**; E2E real R2 → F1-16 y P3 documental TTL 300/900 a alinear. QA no mergea; no se ejecutó git de escritura.

## Firma

QA `qa-tester`. Solo este reporte y `qa/trazabilidad.md`; sin modificar `app/**`,
`supabase/**`, `.github/**` ni `docs/**`. Sin secretos.
