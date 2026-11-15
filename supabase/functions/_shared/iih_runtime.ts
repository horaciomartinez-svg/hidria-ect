/**
 * HIDRIA — wiring de runtime de EF-09 (`import/xlsx`, task-135).
 */

import { buildR2Config, type R2Config } from "./r2.ts";
import { createEfRuntime } from "./ef_runtime.ts";
import type {
  IihImportClient,
  IihImportConfig,
  IihImportDeps,
} from "./iih_import.ts";

export interface IihImportRuntime {
  readonly config: IihImportConfig;
  readonly deps: IihImportDeps;
}

export function createIihImportRuntime(
  env: Record<string, string | undefined> = Deno.env.toObject(),
  fetchImpl: typeof fetch = fetch,
): IihImportRuntime {
  const runtime = createEfRuntime(env, fetchImpl);
  const r2: R2Config = buildR2Config(env);
  return {
    config: {
      auth: runtime.config.auth,
      cors: runtime.config.cors,
      r2,
    },
    deps: { client: runtime.client as unknown as IihImportClient },
  };
}
