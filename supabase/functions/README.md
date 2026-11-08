# Edge Functions — Supabase (Deno)

Contratos: `docs/04-Contratos-API-y-Tablas-de-Decision-HIDRIA-MD-OHI.md` (EF-01…EF-13).

## Convención

```
supabase/functions/
├── _shared/                 # auth, db, errors, idempotency, folios, audit, realtime, cors
├── ef-01-advance-phase/
│   └── index.ts
├── ef-02-close-logbook/
├── …
└── tests/                   # pruebas unitarias Deno
```

Reglas obligatorias (detalle en `hidria_coding_team/agents/03_dev_edge_functions.md`):

1. `Idempotency-Key` **opcional** en `docs/04` §2.3; **obligatorio** en las operaciones que
   vienen de la cola offline (siempre lo envían). Mismo payload → mismo cuerpo; distinto → 409.
2. Folios **solo** server-side (`MDOHI-AAAA-NNN`, `-R1`, ARCO).
3. `audit_log` con hash encadenado en la **misma transacción**.
4. Errores canónicos de `docs/04` §8; sin stack traces.
5. `service_role` solo como secreto de la EF; nunca en respuestas ni logs.
6. Gates EF-01…EF-07, EF-10, EF-12: sin conexión no se validan (el cliente deshabilita).

## Variables de entorno de las EF

Se configuran con `supabase secrets set` (nunca en el repo):
`SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`PSC_*` y `NOM151_ENABLED`.

> Fase 0: esta carpeta está lista para la primera EF (`F1-05`/`F1-07`). Aún no hay
> funciones desplegadas.
