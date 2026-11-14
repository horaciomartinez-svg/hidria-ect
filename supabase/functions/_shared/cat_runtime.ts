/**
 * HIDRIA — wiring de runtime de EF-04 (`cat/submit|validate-r2`, task-126).
 * Reutiliza `_shared/ef_runtime.ts` y lo tipa como cliente CAT (cat_items/cat_responses/ficha R2).
 */

import type { EfRuntime } from "./ef_runtime.ts";
import { createEfRuntime } from "./ef_runtime.ts";
import type { CatClient, CatDeps } from "./cat_transition.ts";

export interface CatRuntime {
  readonly config: EfRuntime["config"];
  readonly deps: CatDeps;
}

export function createCatRuntime(
  env: Record<string, string | undefined> = Deno.env.toObject(),
  fetchImpl: typeof fetch = fetch,
): CatRuntime {
  const runtime = createEfRuntime(env, fetchImpl);
  return {
    config: runtime.config,
    deps: { client: runtime.client as unknown as CatClient },
  };
}
