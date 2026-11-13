/**
 * HIDRIA — Edge Function EF-08: documentos a R2.
 *
 * Rutas servidas (contrato `docs/04` §4 EF-08; ADR-012):
 * - `POST /functions/v1/ef-08-documents/presign` (alias `/documents/presign`): URL `PUT`
 *   prefirmada de R2 con membresía de diagnóstico verificada antes de firmar (Q-08).
 * - `POST /functions/v1/ef-08-documents/register` (alias `/documents/register`): **501** en F1;
 *   se implementa en F1-05 (task-86) con RPC atómica `documents` + `audit_log`.
 *
 * La lógica vive en `_shared/presign.ts` (probada por el job Deno del CI); este archivo solo
 * conecta el runtime (env + fetch) con el handler.
 */

import { createRuntimeDocuments } from "../_shared/documents_runtime.ts";
import { createDocumentsHandler } from "../_shared/presign.ts";

const runtime = createRuntimeDocuments();

Deno.serve(createDocumentsHandler(runtime.config, runtime.deps));
