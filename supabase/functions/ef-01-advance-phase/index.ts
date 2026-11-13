/**
 * HIDRIA — Edge Function EF-01: `advance-phase` (M2/M11).
 *
 * Contrato `docs/04` §4 EF-01 / TD-1; ADR-013. La lógica vive en `_shared/advance_phase.ts`
 * (probada por el job Deno del CI); este archivo solo conecta el runtime.
 */

import { createAdvancePhaseHandler } from "../_shared/advance_phase.ts";
import { createEfRuntime } from "../_shared/ef_runtime.ts";

const runtime = createEfRuntime();

Deno.serve(
  createAdvancePhaseHandler(runtime.config, { client: runtime.client }),
);
