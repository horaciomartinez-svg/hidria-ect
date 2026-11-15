/**
 * HIDRIA — wiring de runtime de EF-06 (`ivoh/{id}/score|validate-r4`, task-158).
 */

import { createEfRuntime } from "./ef_runtime.ts";
import type { IvohClient, IvohConfig, IvohDeps } from "./ivoh_validate.ts";

export interface IvohRuntime {
  readonly config: IvohConfig;
  readonly deps: IvohDeps;
}

export function createIvohRuntime(
  env: Record<string, string | undefined> = Deno.env.toObject(),
  fetchImpl: typeof fetch = fetch,
): IvohRuntime {
  const runtime = createEfRuntime(env, fetchImpl);
  return {
    config: {
      auth: runtime.config.auth,
      cors: runtime.config.cors,
      realtime: runtime.config.realtime,
    },
    deps: { client: runtime.client as unknown as IvohClient },
  };
}
