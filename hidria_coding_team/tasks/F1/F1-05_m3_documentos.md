---
id: F1-05
fase: F1
titulo: M3 — Documentos y EF-08 (URL prefirmada + registro)
owner: dev-edge-functions + dev-frontend-pwa
estado: pendiente
prioridad: P0
deps: [F1-04]
write_scope: ["supabase/functions/ef-08-*/**", "app/**", "reports/F1/F1-05_*"]
evidencia: ["reports/F1/F1-05_m3_documentos.md"]
---

# F1-05 — M3 Documentos y EF-08

## Objetivo

Subida de documentos a R2 con URL prefirmada (`POST /documents/presign`) y registro
(`POST /documents/register`) con hash SHA-256, versionado, nivel de exposición y vínculo a
la empresa/diagnóstico/checklist.

## Entregables

- EF-08 (ambos endpoints, idempotencia, errores canónicos).
- UI de carga con progreso, reintento y verificación de hash.
- RLS de `documents` y acceso por membresía.
- Pruebas API y E2E de carga.

## Criterios de aceptación

- [ ] Bytes van directo cliente↔R2 (sin proxy de la app).
- [ ] SHA-256 verificado; versión anterior preservada.
- [ ] Documento sin vínculo no queda huérfano (registro transaccional).
- [ ] API-01/02 verdes para EF-08.
