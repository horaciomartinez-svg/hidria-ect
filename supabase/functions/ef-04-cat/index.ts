/**
 * HIDRIA — Edge Function EF-04: CAT `submit` y `validate-r2` (M4).
 * Contrato `docs/04` §4 EF-04; task-126 (F1-07b). Lógica en `_shared/cat_transition.ts`.
 */

import { createCatHandler } from "../_shared/cat_transition.ts";
import { createCatRuntime } from "../_shared/cat_runtime.ts";

const runtime = createCatRuntime();

Deno.serve(createCatHandler(runtime.config, runtime.deps));
