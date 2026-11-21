/**
 * HIDRIA — Edge Function EF-02: Bitácora `submit-review`/`sign`/`close` (M10).
 * Contrato ADR-016/docs/04; task-173 (F1-11). Lógica en `_shared/logbook_actions.ts`.
 */

import { createLogbookHandler } from "../_shared/logbook_actions.ts";
import { createLogbookRuntime } from "../_shared/logbook_runtime.ts";

const runtime = createLogbookRuntime();

Deno.serve(createLogbookHandler(runtime.config, runtime.deps));
