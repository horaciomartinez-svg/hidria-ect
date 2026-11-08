# HIDRIA — Plan de Migración y Despliegue

## Documento v1.0 — Ecosistema de Circularidad Tecnológica (ECT) · Metodología MD-OHI

---

# 0. Control del documento

| Campo | Valor |
|---|---|
| Documento | HIDRIA — Plan de migración y despliegue (ítem 6 del roadmap) |
| Versión | 1.0 |
| Fecha | 2026-11-08 |
| Dependencias | `Arquitectura HIDRIA-ECT con MD-OHI v2.0.md` (§9 arquitectura técnica, §10 roadmap); `02-supabase_schema_hidria_mdohi.sql`; `03-seed_catalogos.sql`; addendum de privacidad (§12 del doc `06`); `04-Contratos-API-y-Tablas-de-Decision-HIDRIA-MD-OHI.md` (EF-01…EF-13); `05-Plan-de-Pruebas-HIDRIA-MD-OHI.md` (entornos, criterios de salida, CAP) |
| Stack | Cliente **React 18 + TS + Vite como PWA** · núcleo **Supabase** (Postgres + RLS + Edge Functions + Realtime + Auth) · perímetro **Cloudflare** (DNS, CDN, WAF, Pages, R2) |
| Audiencia | Equipo de agentes de IA / desarrollo / administración TI de la SDFI-SRHDS |
| Alcance | Entornos, secuencia de despliegue por fases del roadmap, orden y estrategia de migraciones, runbooks de despliegue, CI/CD, respaldos y DR, rollback, monitoreo, costos y criterios de salida |

---

# 1. Principios rectores

1. **Migraciones forward-only e idempotentes.** El DDL (`02`) y los seeds (`03`) están escritos con `if not exists` / `drop policy if exists`: nunca se edita una migración ya aplicada; ante un error se escribe la migración correctiva siguiente. No hay migraciones destructivas en el camino al piloto.
2. **El plan de pruebas es la puerta.** Ninguna fase pasa a producción sin cumplir los criterios de salida del nivel correspondiente del doc `05` (gates metodológicos = bloqueo de release).
3. **Datos reales solo en `piloto`.** Local y staging operan con datos sintéticos; los datos del Programa heredan la clasificación `restringido_nda` (doc `06` §3).
4. **Despliegues reproducibles.** Todo lo que se ejecuta a mano una vez se convierte en script o pipeline; el estado deseado vive en el repo, no en la memoria del operador.

---

# 2. Arquitectura de entornos

| Entorno | Supabase | Cloudflare | Cliente PWA | Datos | Propósito |
|---|---|---|---|---|---|
| `local` | Supabase CLI (docker) | — (emulador R2 opcional MinIO) | `npm run dev` | Seed + fixtures sintéticos | Desarrollo, pruebas pgTAP/unitarias en cada cambio |
| `staging` | Proyecto Supabase dedicado | Cuenta CF de staging: Pages `staging.hidria`, R2 bucket `hidria-staging` | Build de rama `develop` | Dataset sintético 30 empresas / 60 diagnósticos | Contratos API, E2E, offline, rendimiento (PER) |
| `piloto` | Proyecto Supabase del Programa | Cuenta CF de la SDFI: Pages `hidria`, R2 `hidria-reports` / `hidria-docs` | Build de rama `main` | Datos reales del Programa Piloto | Aceptación con equipo SDFI/UCI (CAP-01…04) |
| `producción` (fase 4) | Mismo proyecto que piloto, escalado | Igual, con multi-equipo | Igual | Padrón estatal completo | Escalamiento estatal |

**Aislamiento entre entornos:** un proyecto Supabase por entorno (nunca compartir base entre staging y piloto); secretos distintos por entorno (§9); el cliente obtiene la configuración por variables de entorno en build time (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) — la clave `service_role` **jamás** se empaqueta en el cliente.

**Ramas:** `main` (producción/piloto) ← `develop` (staging) ← ramas de función. Las migraciones SQL viven en `supabase/migrations/` con prefijo de fecha; los seeds en `supabase/seed.sql` (contenido de `03`) y el addendum de privacidad como migración fechada posterior.

---

# 3. Secuencia de despliegue por fases (alineada al roadmap §10)

## Fase 0 — Fundación (previo al MVP)

| # | Actividad | Evidencia de salida |
|---|---|---|
| 0.1 | Crear proyectos Supabase `staging` y `piloto`; region sugerida `us-central` (Texas, latencia con Tamaulipas) | Proyectos activos, accesos de equipo configurados |
| 0.2 | Crear cuenta/zone Cloudflare de la SDFI; DNS base `hidria.[dominio]` | Zone activa |
| 0.3 | Repo con estructura: `/supabase/migrations`, `/supabase/functions`, `/app` (cliente React), `/docs` (este paquete) | Repo inicializado, CI mínima (lint + build cliente) |
| 0.4 | Aplicar migración base `02` + seeds `03` en staging | pgTAP suite base en verde |
| 0.5 | Configurar Auth hook `custom_access_token_hook` (claims `organization_id`, `global_role` desde `profiles`) | JWT con claims verificado (test SEC-04 inverso) |
| 0.6 | Migración de contenido: **plantillas oficiales → catálogos** (CAT A1-v1 con las 47 preguntas desde el Instructivo Anexo A; `logbook_templates` V1–R5 con agendas; rúbricas y pesos IVOH v1.0; `completeness_items`; banco de preguntas del aula administrado por `service_role`) | Seeds verificados contra documentos oficiales; acta de validación con la Coordinación |
| 0.7 | Buckets R2: `hidria-reports`, `hidria-docs` (versionado), políticas de ciclo de vida | Buckets creados, credenciales en Vault (§9) |

## Fase 1 — MVP MD-OHI (4–6 meses estimados)

| # | Actividad | Evidencia de salida |
|---|---|---|
| 1.1 | Desplegar EF del MVP: **EF-01, EF-02, EF-03, EF-04, EF-07, EF-08, EF-11** (gates de fase, bitácora, checklist, CAT, reporte, documentos R2, aula). Nota: EF-07 se despliega aquí en su versión esencial (PDF + folio `-R1` + gate 10/10) porque el piloto lo exige como criterio de salida (CAP-02); las capacidades avanzadas de M9 quedan para Fase 3 | Suites de contrato API en verde (API-00…04) |
| 1.2 | Cliente PWA: módulos M1, M2, M3, M4, M10, M11, M12 (los del prototipo ya verificado) | E2E-01…02, 05…10 en verde |
| 1.3 | Realtime: canales `diagnostic:{id}`, `org:{id}`, `user:{id}` | RT-01/02 en verde |
| 1.4 | Sincronización offline (Dexie + cola + LWW por campos) | OFF-01…04 en verde |
| 1.5 | Publicar PWA en Cloudflare Pages (`staging`, luego `piloto`) con HTTPS + CDN + headers de seguridad | Lighthouse PWA ≥ 90; headers verificados |
| 1.6 | Desplegar **addendum de privacidad** (buzón ARCO) y aviso de privacidad aprobado | PRIV-01…04 en verde; aviso publicado en login/perfil |

## Fase 2 — Piloto con 3 industrias ancla

| # | Actividad | Evidencia de salida |
|---|---|---|
| 2.1 | EF restantes del diagnóstico técnico: **EF-05 (BHE/R3), EF-06 (IVOH), EF-09 (XLSX), EF-10 (custodia), EF-12 (reprogramación)** | BHE/IVOH/CUS suites en verde |
| 2.2 | Módulos M5 IIH, M6 BHE (importador Excel), M7 muestreo/custodia en cliente | E2E-03, 04, 11 en verde |
| 2.3 | Corté de datos reales: alta de las 3 empresas ancla y arranque de los 3 diagnósticos de 6 semanas | Tarjetas en Kanban fase 1; bitácoras foliadas |
| 2.4 | Corrección en caliente durante el piloto (regla del roadmap): defects críticos se atienden en ≤ 48 h | Log de incidentes del piloto |
| 2.5 | **Criterio de salida del piloto** (arquitectura §11): CAP-01…04 | Tres diagnósticos archivados con evidencia; sesión de aceptación firmada |

## Fase 3 — Módulos avanzados

EF-13 (firma NOM-151 vía PSC, con doble en pruebas), M8 IVOH completo con radial comparativo, M9 en su versión avanzada (Plan de Acción en Gantt integrado al reporte), M13 tableros estatales y marcos ODS/ISO **solo con datos agregados/anonimizados** (vistas filtradas; DPIA previa obligatoria, doc `06` §11.3).

## Fase 4 — Escalamiento estatal

Multi-equipo de diagnóstico (roles por cohorte), cohortes del aula, reevaluaciones anuales masivas; revisión de límites de plan Supabase y materialización de vistas si PER-02 lo exige (decisión documentada, doc `05`).

---

# 4. Orden y estrategia de migraciones

```
supabase/migrations/
├── 20261031000000_base_hidria_mdohi.sql        ← contenido de 02-supabase_schema_hidria_mdohi.sql
├── 20261031001000_seed_catalogos.sql           ← contenido de 03-seed_catalogos.sql (idempotente)
└── 20261108000000_privacy_addendum.sql         ← §12 del doc 06 (privacy_requests + secuencia + trigger)
```

- **Aplicación:** `supabase db push` (CLI) o pegado en SQL Editor para ejecución manual puntual; el pipeline aplica automáticamente en staging con cada merge a `develop` y en piloto con cada release a `main`.
- **Idempotencia:** los tres archivos pueden reaplicarse sin error en una base **donde ya fueron aplicados** (la operación `create or replace` / `if not exists` lo permite); el addendum incluye `create sequence if not exists` y `drop trigger if exists`. La aplicación **limpia desde cero** se validará en CI con pgTAP (job de Fase 1, docs/05 §7) sobre una base vacía.
- **Corrección 2026-11-08 (bug real detectado en primera aplicación):** la migración base original creaba tres funciones `language sql` (`my_diagnostic_role`, `is_diagnostic_member`, `is_logbook_entry_member`) **antes** de las tablas que referencian; PostgreSQL valida el cuerpo de las funciones SQL al crearlas (`42P01`), por lo que la migración abortaba en un proyecto limpio. Fix publicado: esas funciones se crean ahora en la sección 4b, **después** de las tablas (`supabase/migrations/20261031000000_base_hidria_mdohi.sql` y `docs/02` actualizados; mismo contenido, mismo orden de aplicación).
- **Correcciones:** nunca se edita un archivo aplicado; se agrega migración nueva (ej. la corrección del banco de preguntas `v_quiz_questions` ya incorporada en el archivo base publicado el 2026-11-08).

### Migración desde la plataforma ECT v1.0

El rediseño v2.0 sustituye los formularios genéricos F-01…F-06 por las apps MD-OHI (arquitectura §2). Estrategia: los expedientes históricos de la v1.0 se **congelan como archivos** (PDF/ZIP) y se cargan a R2 como documentos `doc_type='otro'`, `exposure_level` según su clasificación, vinculados a la empresa correspondiente; **no** se migra a tablas del modelo MD-OHI (los instrumentos no son equivalentes). La v1.0 queda en solo-lectura hasta confirmar la migración, luego se retira. Acta de cierre firmada por la Coordinación.

---

# 5. Runbooks de despliegue

## 5.1 Edge Functions

```bash
# por función, en CI con secrets del entorno
supabase functions deploy <ef-name> --project-ref <ref>
supabase secrets set R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET=... PSC_API_KEY=... --project-ref <ref>
```

- Una función = un archivo en `supabase/functions/<nombre>/index.ts` (Deno); contratos conforme al doc `04`.
- Verificación post-despliegue: suite de contrato del doc `05` (API-00…04) contra el entorno.
- EF-13 se despliega con feature flag `NOM151_ENABLED=false` hasta la fase 3 (responde 501, comportamiento esperado RPT-04).

## 5.2 Cliente PWA (Cloudflare Pages)

```bash
cd app
npm ci && npm run build            # dist/ con service worker + manifest
# Pages: build command "npm run build", output "dist", env vars VITE_*
```

- Dominio `hidria.[dominio]` vía Cloudflare DNS (proxy activado: CDN + WAF).
- Headers obligatorios: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Content-Security-Policy` (allowlist: Supabase, R2, fonts), `Permissions-Policy` (sin tracking).
- Versionado del service worker: el build inyecta hash; la actualización fuerza recarga de caché del shell sin tocar la cola Dexie del usuario.

## 5.3 Configuración Cloudflare

| Componente | Configuración |
|---|---|
| DNS | `hidria.[dominio]` → Pages (proxied); `api` no expone nada (las EF van por `<ref>.supabase.co`) |
| WAF | Reglas: bloqueo de rutas inexistentes, rate limiting por IP en `/functions/v1/*` (refuerzo del 429 del doc `04` §8), geobloqueo opcional fuera de MX/US |
| R2 | Buckets `hidria-docs` (versionado, lifecycle a archive 90 días) y `hidria-reports`; CORS: solo origen del PWA, métodos `PUT/GET` prefirmados; **sin dominio público de bucket** (acceso solo por URL prefirmada) |
| Pages | Build de `main` (piloto) y `develop` (staging); preview por rama |

## 5.4 Secretos y claves (doc `06` §8)

| Secreto | Dónde vive | Rotación |
|---|---|---|
| `service_role` key | Supabase Vault / CI secrets; solo server-side (EF y pipelines) | Trimestral y por incidente |
| Claves R2 | `supabase secrets` (las consumen EF-07/EF-08) | Trimestral |
| JWT secret / Auth | Administración Supabase | Por incidente |
| Claves PSC (fase 3) | Vault | Anual o por contrato |
| Anon key | Embebida en el cliente (pública por diseño; la seguridad es RLS) | — |

## 5.5 CI/CD

| Disparador | Pipeline | Puertas |
|---|---|---|
| Push a rama | Lint + build cliente + pgTAP en local CLI | Fallo = bloquea merge |
| Merge a `develop` | Migraciones en staging + deploy EF + build Pages staging + contratos API + unitarias | Verde → disponible en staging |
| Nightly | E2E completo (Playwright) contra staging | Reporte en repo |
| Release a `main` (tag `vX.Y.Z`) | Mismas etapas contra piloto + tag de migración aplicada + backup previo (§7) | Verde + checklist §8 → disponible para el equipo |
| Semanal | k6 (PER) en staging | Regresión > 20 % abre incidente |

---

# 6. Respaldo, recuperación y continuidad

| Elemento | Estrategia | RPO | RTO |
|---|---|---|---|
| Postgres (piloto) | Backups diarios automáticos de Supabase + **PITR** (point-in-time recovery, retención recomendada 7 días mínimo, 14 en fase 4) | ≤ 24 h (PITR: minutos) | ≤ 24 h |
| R2 (documentos) | Versionado de objetos + replicación a bucket secundario (o `s3 sync` programado a proveedor alterno) | ≤ 24 h | ≤ 48 h |
| Configuración | Repo como fuente de verdad + export de definiciones | — | ≤ 4 h |
| Ejercicios | **Simulacro de restauración trimestral** (cargar backup en proyecto efímero y correr pgTAP + 3 E2E críticos) | — | Constancia archivada |

Escenario pérdida de región Supabase: recrear proyecto en región alterna, restaurar backup + replicar R2, actualizar `VITE_SUPABASE_URL` y redesplegar Pages (dominio propio del cliente facilita el cambio sin tocar DNS de usuarios si se usa dominio propio para API vía gateway; en MVP basta con re-apuntar el proyecto).

---

# 7. Rollback

1. **Migraciones:** forward-only; el rollback es *restore* del backup previo al release (§6) más una migración correctiva si el daño es de datos. Por eso **todo release a `main` exige backup verificado** (automático en pipeline).
2. **Edge Functions:** redeploy del tag anterior (`supabase functions deploy` desde el commit previo); las EF son stateless.
3. **Cliente Pages:** Pages conserva despliegues anteriores; rollback = re-asignar el despliegue anterior (instantáneo).
4. **Feature flags:** EF-13 y M13 viajan detrás de flags; desactivar no requiere redeploy.
5. **Corte de datos del piloto (Fase 2.3):** reversible durante la primera semana (diagnósticos aún en fase 1); pasado ese punto, los ajustes se hacen como reprogramación documentada (EF-12), nunca borrando capturas.

---

# 8. Checklists operativos

**Pre-release (obligatorio, en el pipeline como issue template):**
□ Migraciones aplicadas en staging y pgTAP verde □ Contratos API verdes □ E2E nightly sin fallos en 3 corridas □ Backup automático del piloto verificado (último < 24 h) □ Secrets del entorno presentes □ Feature flags en el estado planeado □ Aviso de ventana de despliegue al equipo (≤ 30 min de interrupción acordada).

**Día de despliegue:** □ Ejecutar pipeline de release □ Verificar health checks (§9) □ Confirmar folio vivo: crear empresa de prueba y checklist layout en staging □ E2E-01 (flujo crítico) en verde contra piloto □ Anunciar al equipo.

**Post-release (48 h):** □ Monitoreo de errores sin alertas nuevas □ Tiempo de respuesta dentro de umbral (doc `05` PER) □ Primeras bitácoras/fichas reales correctas □ Cerrar versión y actualizar registro de cambios del paquete.

---

# 9. Monitoreo y alertas

| Señal | Herramienta | Umbral de alerta |
|---|---|---|
| Errores 5xx en EF | Logs Supabase + query `audit_log` | > 5/min o cualquier `EXT_PSC` |
| Latencia p95 de vistas (PER-02) | Supabase observability / k6 programado | > 300 ms sostenido 15 min |
| Fallos de sincronización offline | Telemetría del cliente (opt-in, agregada) | Colas con > 50 reintentos |
| Cadena de auditoría | Job diario: verificar `prev_hash→hash` íntegro | Cualquier ruptura = incidente crítico |
| Certificados/DNS | Cloudflare (automático) | — |
| Vencimientos ARCO | Job diario sobre `privacy_requests.vence_en` | Vence en 48 h sin respuesta → escalamiento |
| Disponibilidad del PWA | Uptime check cada 5 min a `hidria.[dominio]` | Caída > 2 min → alerta |

---

# 10. Costos de referencia

Estimación base de la arquitectura v2.0 §9: **~USD 50–70/mes** en el escenario inicial (~300 usuarios), a verificar contra precios vigentes al momento del despliegue. Componentes: Supabase (plan Pro con PITR), Cloudflare (Pages + R2: almacenamiento ~USD 0.015/GB-mes, **egress $0** — motivo de la elección de R2), dominio, PSC NOM-151 (por sello, fase 3). Revisar precios vigentes antes de Fase 1 y documentar la decisión en este archivo.

---

# 11. Responsables y ventanas de despliegue

| Rol | Responsabilidad |
|---|---|
| Coordinación SDFI | Autoriza releases a piloto; firma checklists y actas de aceptación |
| Oficial de protección de datos | Vigila buzón ARCO, vulneraciones y DPIA (doc `06`) antes de activar módulos nuevos |
| UCI (equipo técnico) | Ejecuta pipelines, runbooks, simulacros de restauración; soporte en caliente durante el piloto |
| Proveedores (Supabase/Cloudflare/PSC) | SLAs contractuales (doc `06` §7–8) |

Ventanas: despliegues a piloto en horario hábil acordado (martes/jueves, ≤ 30 min), nunca durante visitas V1–V3 de diagnósticos activos salvo hotfix crítico.

---

*Fin del plan. La ejecución real de cada runbook queda registrada (quién, cuándo, evidencia) en el registro de despliegues del repo; este documento se actualiza cuando cambie el stack o los proveedores.*
