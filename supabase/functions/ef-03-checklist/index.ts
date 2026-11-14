/**
 * HIDRIA — Edge Function EF-03: transición de la lista de cotejo (M3).
 *
 * Contrato `docs/04` §4 EF-03 y TD-2; task-114 (F1-06b). La lógica y las pruebas viven en
 * `_shared/checklist_transition.ts`; este archivo solo conecta el runtime.
 */

import { createChecklistTransitionHandler } from "../_shared/checklist_transition.ts";
import { createChecklistRuntime } from "../_shared/checklist_runtime.ts";

const runtime = createChecklistRuntime();

Deno.serve(
  createChecklistTransitionHandler(runtime.config, runtime.deps),
);
