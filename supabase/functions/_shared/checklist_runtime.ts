/**
 * HIDRIA — wiring de runtime de EF-03 (`checklist/transition`, task-114).
 *
 * Reutiliza `_shared/ef_runtime.ts` (auth/CORS/Realtime + cliente `service_role`) y lo tipa
 * como el cliente extendido de EF-03 (ítem de checklist, documento y usuarios por rol).
 * Todo es inyectable (`env`, `fetchImpl`) para probarse sin red.
 */

import type { EfRuntime } from "./ef_runtime.ts";
import { createEfRuntime } from "./ef_runtime.ts";
import type { ChecklistClient, ChecklistDeps } from "./checklist_transition.ts";

export interface ChecklistRuntime {
  readonly config: EfRuntime["config"];
  readonly deps: ChecklistDeps;
}

export function createChecklistRuntime(
  env: Record<string, string | undefined> = Deno.env.toObject(),
  fetchImpl: typeof fetch = fetch,
): ChecklistRuntime {
  const runtime = createEfRuntime(env, fetchImpl);
  return {
    config: runtime.config,
    deps: { client: runtime.client as unknown as ChecklistClient },
  };
}
