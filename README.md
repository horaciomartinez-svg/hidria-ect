# HIDRIA — Plataforma de Optimización Hídrica Industrial

Repositorio del **Programa Empresas Hídricamente Responsables (HIDRIA)** de la Subsecretaría de Desarrollo y Fomento Industrial (SDFI), órgano desconcentrado de la Secretaría de Recursos Hidráulicos para el Desarrollo Social (SRHDS) del Gobierno del Estado de Tamaulipas.

La plataforma digitaliza la **Metodología de Diagnóstico para la Optimización Hídrica Industrial (MD-OHI)**: alta de empresas, diagnósticos de seis semanas, repositorio documental, cuestionario de análisis técnico (CAT), inventario de infraestructura hidráulica (IIH), balance hídrico enriquecido (BHE), muestreo y cadena de custodia, cálculo del Índice de Valor de Optimización Hídrica (IVOH), bitácoras, planes de acción, aula de capacitación y reportes.

## Alcance de este repositorio (v1.0)

Esta versión contiene **únicamente el paquete documental y el esquema de base de datos** de HIDRIA MD-OHI v1.0. El código de la aplicación (cliente React PWA y Edge Functions) se incorpora por el equipo de desarrollo en fases posteriores, conforme al plan de `docs/07`.

| Capa | Tecnología prevista |
|---|---|
| Cliente | React + TypeScript, PWA con sincronización offline (Dexie/IndexedDB) |
| Datos y auth | Supabase (PostgreSQL, Auth, RLS multi-tenant, Realtime, Storage) |
| Cómputo y entrega | Cloudflare Pages (CDN/WAF) y Cloudflare R2 (documentos versionados) |
| Integraciones | Supabase Edge Functions (Deno) — contratos en `docs/04` |

## Estructura del repositorio

```
.
├── README.md
├── docs/                          # Paquete HIDRIA MD-OHI v1.0 (10 documentos)
│   ├── 00-Glosario-de-Siglas-HIDRIA-MD-OHI.md
│   ├── 01-Diseño-Base-de-Datos-HIDRIA-MD-OHI.md
│   ├── 02-supabase_schema_hidria_mdohi.sql
│   ├── 03-seed_catalogos.sql
│   ├── 04-Contratos-API-y-Tablas-de-Decision-HIDRIA-MD-OHI.md
│   ├── 05-Plan-de-Pruebas-HIDRIA-MD-OHI.md
│   ├── 06-Gobernanza-y-Privacidad-HIDRIA-MD-OHI.md
│   ├── 07-Plan-de-Migracion-y-Despliegue-HIDRIA-MD-OHI.md
│   ├── 08-Contenido-del-Aula-y-Banco-de-Preguntas-HIDRIA-MD-OHI.md
│   └── Arquitectura HIDRIA-ECT con MD-OHI v2.0.md
└── supabase/
    └── migrations/
        ├── 20261031000000_base_hidria_mdohi.sql
        ├── 20261031001000_seed_catalogos.sql
        └── 20261108000000_privacy_addendum.sql
```

`supabase/migrations/` es la copia desplegable de los documentos SQL del paquete, con prefijo de fecha según el orden de aplicación del documento `07`; el *addendum de privacidad* (buzón ARCO) proviene de `docs/06` §12.

## Aplicar la base de datos

```bash
# Con Supabase CLI enlazado al proyecto (staging/piloto)
supabase db push
```

Los tres archivos son idempotentes y deben aplicarse en el orden de su prefijo de fecha. Alternativamente pueden ejecutarse manualmente en el SQL Editor del proyecto.

## Documentación clave

- **Arquitectura HIDRIA-ECT con MD-OHI v2.0** — visión técnica, módulos M1–M13, Edge Functions y roadmap.
- **01 — Diseño de base de datos** — modelo de datos, funciones auxiliares y matriz RLS.
- **04 — Contratos de API y tablas de decisión** — EF-01…EF-13 y códigos de error.
- **06 — Gobernanza y privacidad** — cumplimiento en materia de datos personales, derechos ARCO, aviso de privacidad y addendum SQL.
- **07 — Plan de migración y despliegue** — entornos, ramas, orden de migraciones y runbooks.

## Seguridad

El repositorio es **público**. No se versionan secretos: las credenciales (`.env`, claves de Supabase, tokens de Cloudflare y de GitHub) se mantienen fuera del repositorio y están excluidas en `.gitignore`. La clave `service_role`, las contraseñas de base de datos y las credenciales de R2 **nunca** deben incluirse en commits ni en el cliente.

---

*Documentación operativa del Programa HIDRIA (SDFI–SRHDS Tamaulipas).*
