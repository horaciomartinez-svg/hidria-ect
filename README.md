# HIDRIA — Plataforma de Optimización Hídrica Industrial

Repositorio del **Programa Empresas Hídricamente Responsables (HIDRIA)** de la Subsecretaría de Desarrollo y Fomento Industrial (SDFI), órgano desconcentrado de la Secretaría de Recursos Hidráulicos para el Desarrollo Social (SRHDS) del Gobierno del Estado de Tamaulipas.

La plataforma digitaliza la **Metodología de Diagnóstico para la Optimización Hídrica Industrial (MD-OHI)**: alta de empresas, diagnósticos de seis semanas, repositorio documental, cuestionario de análisis técnico (CAT), inventario de infraestructura hidráulica (IIH), balance hídrico enriquecido (BHE), muestreo y cadena de custodia, cálculo del Índice de Valor de Optimización Hídrica (IVOH), bitácoras, planes de acción, aula de capacitación y reportes.

## Alcance de este repositorio

El repositorio contiene el **paquete documental v1.0**, el **esquema de base de datos** ya
aplicado en Supabase y, a partir de la Fase 0, el **código de la plataforma** (cliente React
PWA y Edge Functions) que construye el equipo autónomo `hidria_coding_team/`, conforme al
plan de `docs/07`.

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
├── docs/                          # Paquete HIDRIA MD-OHI v1.0 (fuente única de verdad)
├── app/                           # Cliente React 18 + TS + Vite + Tailwind (PWA)
├── supabase/
│   ├── migrations/                # 3 migraciones aplicadas (forward-only)
│   ├── functions/                 # Edge Functions EF-01…EF-13 (Fase 1)
│   └── tests/                     # pgTAP
├── tests/                         # unitarias/E2E del cliente (Fase 1)
├── qa/                            # matriz de trazabilidad (Fase 1)
├── scripts/                       # guardas de CI y verificación local
├── hidria_coding_team/            # gobierno del equipo autónomo (8 agentes)
├── .github/workflows/ci.yml       # CI mínima
├── .env.example                   # plantilla sin valores reales
└── package.json                   # workspaces (app)
```

`supabase/migrations/` es la copia desplegable de los documentos SQL del paquete, con prefijo de fecha según el orden de aplicación del documento `07`; el *addendum de privacidad* (buzón ARCO) proviene de `docs/06` §12.

## Equipo autónomo `hidria_coding_team`

La plataforma se construye por un equipo de **8 agentes de IA** que trabajan en el bucle
`PLAN → ASSIGN → IMPLEMENT → PR → SPEC REVIEW → SECURITY REVIEW → QA → MERGE → DEPLOY STAGING
→ VERIFY`, sin revisión humana paso a paso. El gobierno, el backlog y la evidencia viven en
[`hidria_coding_team/TEAM.md`](hidria_coding_team/TEAM.md) y [`hidria_coding_team/tasks/`](hidria_coding_team/tasks/BACKLOG.md);
las instrucciones de cada agente, en [`hidria_coding_team/agents/`](hidria_coding_team/agents/).
El humano solo interviene ante una condición de PARO (`TEAM.md` §12).

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
