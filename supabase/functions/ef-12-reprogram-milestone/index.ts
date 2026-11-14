/**
 * HIDRIA — Edge Function EF-12: `reprogram-milestone` (M2/M10).
 *
 * Contrato `docs/04` §4 EF-12; ADR-013. La lógica vive en `_shared/reprogram_milestone.ts`
 * (probada por el job Deno del CI); este archivo solo conecta el runtime.
 */

import { createEfRuntime } from "../_shared/ef_runtime.ts";
import { createReprogramMilestoneHandler } from "../_shared/reprogram_milestone.ts";

const runtime = createEfRuntime();

Deno.serve(
  createReprogramMilestoneHandler(runtime.config, { client: runtime.client }),
);
