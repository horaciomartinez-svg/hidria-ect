/**
 * HIDRIA — Edge Function EF-06: IVOH `score` y `validate-r4` (M8).
 * Contrato ADR-015/docs/04; task-158 (F1-10). Lógica en `_shared/ivoh_validate.ts`.
 */

import { createIvohHandler } from "../_shared/ivoh_validate.ts";
import { createIvohRuntime } from "../_shared/ivoh_runtime.ts";

const runtime = createIvohRuntime();

Deno.serve(createIvohHandler(runtime.config, runtime.deps));
