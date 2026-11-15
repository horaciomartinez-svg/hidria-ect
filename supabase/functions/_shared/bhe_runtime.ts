/**
 * HIDRIA — wiring de runtime de EF-05 (`balances/{id}/validate-r3`, task-143).
 */

import { createEfRuntime } from "./ef_runtime.ts";
import type {
  BheValidateClient,
  BheValidateConfig,
  BheValidateDeps,
} from "./bhe_validate.ts";

export interface BheValidateRuntime {
  readonly config: BheValidateConfig;
  readonly deps: BheValidateDeps;
}

export function createBheValidateRuntime(
  env: Record<string, string | undefined> = Deno.env.toObject(),
  fetchImpl: typeof fetch = fetch,
): BheValidateRuntime {
  const runtime = createEfRuntime(env, fetchImpl);
  return {
    config: {
      auth: runtime.config.auth,
      cors: runtime.config.cors,
      realtime: runtime.config.realtime,
    },
    deps: { client: runtime.client as unknown as BheValidateClient },
  };
}
