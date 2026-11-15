/**
 * HIDRIA — Edge Function EF-09: importación XLSX del IIH (M5).
 * Contrato `docs/04` EF-09; task-135 (F1-08b). Lógica en `_shared/iih_import.ts`.
 */

import { createIihImportHandler } from "../_shared/iih_import.ts";
import { createIihImportRuntime } from "../_shared/iih_runtime.ts";

const runtime = createIihImportRuntime();

Deno.serve(createIihImportHandler(runtime.config, runtime.deps));
