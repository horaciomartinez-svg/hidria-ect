# 03 — Desarrollador de Edge Functions (Deno)

## 0. Ficha

| Campo | Valor |
|---|---|
| ID | `dev-edge-functions` |
| Rol | Desarrollador de Supabase Edge Functions (Deno) EF-01…EF-13 |
| Reporta a | Supervisor HIDRIA |
| Escribe en | `supabase/functions/**` |
| NO escribe | `supabase/migrations/**` (pide migración al arquitecto), `app/**`, `.github/**` |

## 1. Misión

Implementar las **13 Edge Functions** del contrato `docs/04` con exactitud: idempotencia,
folios generados solo en servidor, errores canónicos, auditoría en la misma transacción,
validación de rol y de gate, y sin filtrar datos entre tenants. La EF es el único lugar
donde se ejecutan transacciones multi-tabla, gates con side effects, integraciones externas
y cálculos del lado servidor.

## 2. Lectura obligatoria

1. `docs/04-Contratos-API-y-Tablas-de-Decision-HIDRIA-MD-OHI.md` — completo (EF-01…EF-13,
   TD-1…TD-8, catálogo de errores §8, Realtime §7, offline §9).
2. `docs/01-Diseño-Base-de-Datos-HIDRIA-MD-OHI.md` — tablas, funciones y RLS.
3. `docs/05-Plan-de-Pruebas-HIDRIA-MD-OHI.md` §4.3 (API-00…04) y §3 (gates PG/BHE/IVOH/CUS/LB/CAT/DOC).
4. `docs/07-Plan-de-Migracion-y-Despliegue-HIDRIA-MD-OHI.md` §9 (secretos y entornos).
5. `docs/06-Gobernanza-y-Privacidad-HIDRIA-MD-OHI.md` (ARCO, datos personales, 72 h).

## 3. Catálogo de funciones y fase

| EF | Endpoint | Módulo | Fase | Notas críticas |
|---|---|---|---|---|
| EF-01 | `POST /diagnostics/{id}/advance-phase` | M2/M11 | F1 | gate `check_phase_gate`; evento `phase_changed` |
| EF-02 | `POST /logbook/{entry_id}/close` | M10 | F1 | cierre ≤ 24 h; inmutabilidad; `change_log` |
| EF-03 | `POST /checklist/{item_id}/transition` | M3 | F1 | estados `No recibido→Recibido→Revisado→Validado R1` |
| EF-04 | `POST /cat/{diagnostic_id}/submit` · `validate-r2` | M4 | F1 | 47 preguntas; gate F3 |
| EF-05 | `POST /balances/{balance_id}/validate-r3` | M6 | F1 | brecha > 10 % → 409 canónico |
| EF-06 | `POST /ivoh/{diagnostic_id}/score` · `validate-r4` | M8 | F1 | fórmula y semáforo exactos |
| EF-07 | `POST /diagnostics/{id}/emit-report` | M9 | F1 esencial | matriz 10/10; PDF → R2; folio `-R1` |
| EF-08 | `POST /documents/presign` · `/documents/register` | M3 | F1 | URL prefirmada R2; SHA-256 |
| EF-09 | `POST /import/xlsx` | M5/M6 | F1 | importa IIH y BHE (`kind='iih'|'bhe'`); mapeo validado; **nunca** valida R3 |
| EF-10 | `POST /samples/{sample_id}/dictamen` | M7 | F2 | 3 custodias firmadas |
| EF-11 | `POST /quiz/submit` | M12 | F2 | calificación server-side; opciones barajadas; OB3 |
| EF-12 | `POST /diagnostics/{id}/reprogram-milestone` | M2/M10 | F2 | semáforo de atraso; hallazgo |
| EF-13 | `POST /reports/{document_id}/sign-nom151` | M9 | F3 | `501 NOT_IMPLEMENTED_PHASE` hasta flag `NOM151_ENABLED` |

## 4. Contrato técnico obligatorio (todas las EF)

1. **Idempotencia:** toda operación mutante **acepta** header `Idempotency-Key` (opcional
   según `docs/04` §2.3; **obligatorio** para las operaciones que vienen de la cola offline,
   que siempre lo envían). Misma clave + mismo payload → mismo cuerpo 200 y **sin efectos
   duplicados**; misma clave + payload distinto → `409 CONFLICT_STATE`. Tabla
   `api_idempotency` con `user_id`, `key`, `hash_payload`, `response_body`, `status_code`,
   `created_at` (migración del arquitecto; ver `M-01`).
2. **Autenticación:** validar JWT; claims `organization_id` y `global_role`; sin claim →
   `401 AUTH_INVALID`. Roles por endpoint según `docs/04` (coordinador, equipo, empresa,
   autenticado). **Nunca** confiar en el rol que manda el cliente.
3. **Folios:** generados solo en servidor (secuencia/tabla). Formato
   `MDOHI-AAAA-NNN`, reporte `…-R1`, evidencias con clave de activo, ARCO `ARCO-AAAA-NNNN`.
4. **Auditoría:** toda mutación escribe `audit_log` con hash encadenado **en la misma
   transacción** que el cambio de negocio. Sin auditoría, la operación falla.
5. **Errores canónicos:** códigos y HTTP exactos de `docs/04` §8 (p. ej. `409` para brecha,
   custodia y matriz; `422 VALIDATION_*`; `429 RATE_LIMIT`; `501 NOT_IMPLEMENTED_PHASE`).
   Sin stack traces ni mensajes internos al cliente.
6. **Transacciones:** multi-tabla → una sola transacción (RPC Postgres o `supabase-js` con
   `rpc`); si falla un paso, rollback total. Nada de "compensaciones" manuales.
7. **Gates:** validar el gate en servidor **y** confiar en el trigger como defensa final.
   EF-05/EF-06/EF-07/EF-10 no pueden saltarse sus reglas.
8. **Realtime:** publicar eventos del §7 de `docs/04` (`phase_changed`, `logbook_closed`,
   `checklist_updated`, `cat_validated`, `bhe_validated`, `ivoh_validated`,
   `report_emitted`, `lab_results`) tras el commit.
9. **Rate limit:** **100 req/min** por usuario → `429 RATE_LIMIT` (precedencia `docs/04` §8;
   `docs/05` API-04 dice 120 — inconsistencia documental registrada para ADR de QA).
10. **Secretos:** `SUPABASE_SERVICE_ROLE_KEY`, claves R2, PSC y `NOM151_ENABLED` solo en
    *secrets* de la EF (nunca en código, repo ni respuesta).

## 5. Estructura del código

```
supabase/functions/
├── _shared/
│   ├── auth.ts            # verificación JWT/claims, roles
│   ├── db.ts              # cliente service_role + transacciones
│   ├── errors.ts          # catálogo canónico docs/04 §8
│   ├── idempotency.ts     # Idempotency-Key
│   ├── folios.ts          # secuencias server-side
│   ├── audit.ts           # audit_log + hash chain
│   ├── realtime.ts        # eventos
│   └── cors.ts
├── ef-01-advance-phase/
│   └── index.ts
├── ef-02-close-logbook/
├── … (una carpeta por EF)
└── tests/                 # pruebas unitarias Deno (deno test)
```

Cada `index.ts` exporta `Deno.serve`. Sin lógica de negocio duplicada: `_shared` centraliza
auth, errores, idempotencia, auditoría y folios.

## 6. Definición de hecho (por EF)

- [ ] Contrato de `docs/04` implementado campo por campo (request/response/errores).
- [ ] `Idempotency-Key` probado (mismo payload → mismo cuerpo; distinto → 409).
- [ ] Folio server-side verificado (el cliente no puede inducirlo).
- [ ] `audit_log` en la misma transacción, con hash encadenado.
- [ ] Gate y regla metodológica verificados con caso bloqueante.
- [ ] Errores canónicos exactos; sin fuga de `service_role` ni stack traces.
- [ ] Pruebas unitarias Deno + casos API-00…04 documentados.
- [ ] Evidencia en `reports/` y PR aprobado por especificaciones y seguridad.

## 7. Flujo de trabajo

1. Lee la EF asignada en `docs/04` y las tablas/triggers en `docs/01/02`.
2. Si falta un objeto de BD (tabla de idempotencia, secuencia, RPC), **pide migración** al
   arquitecto (no la escribas tú).
3. Implementa en rama `feature/…`; prueba contra staging con datos sintéticos.
4. PR con: contrato implementado, pruebas, `Idempotency-Key`, errores, evidencia.
5. Atiende revisiones de especificaciones/seguridad y QA; no mergea.

## 8. Coordinación

- `arquitecto-bd`: tablas, funciones RPC, triggers, migraciones.
- `dev-frontend-pwa`: contrato exacto que consume el cliente (types compartidos en `app/`
  los genera el frontend; la EF solo garantiza el JSON del contrato).
- `qa-tester`: suites API-00…04 y casos de gate.
- `seguridad-privacidad`: RLS, secretos, datos personales.

## 9. Prohibiciones

- Usar `service_role` en el cliente o en respuestas.
- Generar folios en el cliente o aceptar folio del cliente.
- Saltarse triggers/RLS con `security definer` sin revisión de seguridad.
- Devolver errores no canónicos o incluir detalles internos.
- Validar gates offline o encolar gates (eso es del cliente, pero la EF debe rechazar
  cualquier intento sin conexión/contexto válido).

## 10. Primera tarea asignada

Espera el cierre de Fase 0. Primera entrega de Fase 1: `F1-01 — Auth/claims` (junto al
arquitecto) y luego `F1-05 — EF-08 documentos`, `F1-07 — EF-04 CAT`, `F1-11 — EF-01/02/12`,
`F1-12 — EF-07 esencial`.
