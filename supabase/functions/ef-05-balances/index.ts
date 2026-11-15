/**
 * HIDRIA — Edge Function EF-05: validación R3 del BHE (M6).
 * Contrato ADR-014/docs/04; task-143 (F1-09). Lógica en `_shared/bhe_validate.ts`.
 */

import { createBheValidateHandler } from "../_shared/bhe_validate.ts";
import { createBheValidateRuntime } from "../_shared/bhe_runtime.ts";

const runtime = createBheValidateRuntime();

Deno.serve(createBheValidateHandler(runtime.config, runtime.deps));
