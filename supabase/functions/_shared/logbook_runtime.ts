/**
 * HIDRIA — wiring de runtime de EF-02 (`logbook/{id}/…`, task-173).
 */

import { createEfRuntime } from "./ef_runtime.ts";
import type {
  LogbookClient,
  LogbookConfig,
  LogbookDeps,
} from "./logbook_actions.ts";

export interface LogbookRuntime {
  readonly config: LogbookConfig;
  readonly deps: LogbookDeps;
}

export function createLogbookRuntime(
  env: Record<string, string | undefined> = Deno.env.toObject(),
  fetchImpl: typeof fetch = fetch,
): LogbookRuntime {
  const runtime = createEfRuntime(env, fetchImpl);
  return {
    config: {
      auth: runtime.config.auth,
      cors: runtime.config.cors,
      realtime: runtime.config.realtime,
    },
    deps: { client: runtime.client as unknown as LogbookClient },
  };
}
