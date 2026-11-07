# HIDRIA — Glosario de Siglas

## Documento v1.0 · Vigente para todo el paquete de especificación del Ecosistema de Circularidad Tecnológica (ECT)

> Lee este glosario primero. Todas las siglas del paquete (`Arquitectura v2.0`, `01`–`06`, schema SQL, prototipo) se usan con el significado de esta tabla. Ante cualquier duda de interpretación, este documento manda.

---

## 1. Instituciones y actores

| Sigla | Significado | Notas |
|---|---|---|
| **SRHDS** | Secretaría de Recursos Hidráulicos para el Desarrollo Social (Gobierno del Estado de Tamaulipas) | Sujeto obligado; titular de la Unidad de Transparencia y del Comité de Transparencia |
| **SDFI** | Subsecretaría de Desarrollo y Fomento Industrial | Órgano desconcentrado de la SRHDS; **Responsable** del tratamiento de datos personales y operadora del Programa Empresas Hídricamente Responsables («la Subsecretaría») |
| **UCI** | **Universidades y Centros de Innovación** | Equipo técnico académico (encargado): comprende todas las Universidades Tecnológicas, Politécnicas, la UAT y los Centros de Innovación Tecnológica del estado que participan en el Programa |
| **UAT** | Universidad Autónoma de Tamaulipas | Institución participante **dentro de UCI**; la sigla como nombre del equipo fue retirada de los documentos el 2026-11-08 para abarcar a todas las universidades y centros |
| **CIT** | Circularidad Industrial de Tamaulipas | Centro de Innovación Tecnológica participante; forma parte de UCI |
| **PRODET** | Programa de Desarrollo Económico y/o alianzas de desarrollo territorial del estado | Referenciado en convenios del Programa (ver expediente de alianzas) |
| **ECT** | Ecosistema de Circularidad Tecnológica | Marco del que HIDRIA es plataforma digital |
| **HIDRIA** | Plataforma digital del ECT | Nombre del sistema |
| **Transparencia para el Pueblo de Tamaulipas** | Órgano garante estatal de protección de datos y transparencia | Autoridad ante la que se interpone el recurso de revisión ARCO |
| **SABG** | Secretaría Anticorrupción y Buen Gobierno | Autoridad federal en protección de datos del sector privado (sucesora funcional del INAI, extinto en 2024) |
| **EMA** | Entidad Mexicana de Acreditación | Acredita a laboratorios de ensayo (`samples.acreditacion_ema`) |
| **PSC** | Prestador de Servicios de Certificación (de firma electrónica) | Provee sello de tiempo y firma conforme a NOM-151 |
| **PNT** | Plataforma Nacional de Transparencia | Medio para ejercer derechos ARCO |

## 2. Metodología MD-OHI

| Sigla | Significado | Notas |
|---|---|---|
| **MD-OHI** | Metodología de Diagnóstico para la Optimización Hídrica Industrial | Metodología rectora (diagnóstico de 6 semanas: 3 visitas V1–V3, 5 reuniones R1–R5) |
| **CAT** | Cuestionario de Análisis Técnico | Instrumento de captura (47 preguntas, secciones A–H); validado en R2 |
| **IIH** | Inventario de Infraestructura Hidráulica | Activos `USO-nn`; verificado en visita V1 |
| **BHE** | Balance Hídrico Enriquecido | 12 meses; validado en R3; regla de bloqueo si brecha mensual > 10 % |
| **IVOH** | Índice de Valoración de Optimización Hídrica | 6 factores F1–F6 con pesos (0.15/0.20/0.20/0.20/0.15/0.10); semáforo <5 rojo · 5–7.9 amarillo · ≥8 verde; validado en R4 |
| **V1, V2, V3** | Visitas técnicas (semanas 1, 3 y 5) | Fichas de bitácora `BIT-Vn-nn` |
| **R1, R2, R3, R4, R5** | Reuniones de validación (semanas 1, 2, 4, 5 y 6) | Fichas de bitácora `BIT-Rn-nn` |
| **S1…S6** | Semanas del diagnóstico | Columnas del Kanban por fase |
| **BIT** | Bitácora de trabajo en línea | Fichas foliadas por tipo de evento |
| **NOM-001/002/003** | Normas oficiales mexicanas de descarga a cuerpos receptores | Referencia de `quality_parameters.norma_ref` |
| **NOM-151-SCFI-2016** | NOM de comercio electrónico (conservación de mensajes de datos) | Firma/validez del Reporte de Diagnóstico vía PSC |
| **DQO / DBO5** | Demanda química/biológica de oxígeno | Parámetros del BHE (mg/L) |
| **NDA** | Acuerdo de confidencialidad (non-disclosure) | Clasificación por defecto del expediente: `restringido_nda` |
| **ARCO** | Acceso, Rectificación, Cancelación y Oposición | Derechos del titular (buzón en plataforma, folio `ARCO-AAAA-NNNN`) |
| **ODS** | Objetivos de Desarrollo Sostenible | Marco de reporte agregado (ODS 6, 9, 12) |
| **EHR** | Empresa Hídricamente Responsable | Reconocimiento del Programa (`companies.ciclo_vida`) |

## 3. Plataforma y técnica

| Sigla | Significado | Notas |
|---|---|---|
| **EF** | Edge Function (Supabase) | EF-01…EF-13, contratos en doc `04` |
| **RLS** | Row Level Security | Políticas por tenant (`organization_id`) y por rol de diagnóstico |
| **JWT** | JSON Web Token | Sesión; custom claims `organization_id` y `global_role` |
| **PWA** | Progressive Web App | Cliente React offline-first (service worker + IndexedDB) |
| **Dexie** | Librería IndexedDB | Cola de sincronización offline del cliente |
| **R2** | Cloudflare R2 | Almacén de documentos (bytes); egress $0; URLs prefirmadas |
| **DEK / KEK** | Data / Key Encryption Key | Cifrado envelope AES-256-GCM |
| **WIP** | Work In Progress | Límite de tarjetas por columna del Kanban |
| **MVP** | Producto mínimo viable | Fase 1 del roadmap |
| **DPIA** | Evaluación de impacto (data protection impact assessment) | Obligatoria antes de módulos con tratamiento nuevo |
| **OB3** | Open Badges 3.0 | Insignia digital del examen del aula (JSON-LD) |
| **LWW** | Last-Writer-Wins | Resolución de conflictos offline por campo |
| **pgTAP** | Framework de pruebas para PostgreSQL | Nivel base de datos del plan de pruebas |
| **CI** | Integración continua | Ejecución automática de suites de prueba |

## 4. Normativas citadas

| Sigla | Significado | Vigencia |
|---|---|---|
| **LGPDPPSO** | Ley General de Protección de Datos Personales en Posesión de Sujetos Obligados | DOF 20-mar-2025 (nueva; regla general de sujetos obligados) |
| **LFPDPPP** | Ley Federal de Protección de Datos Personales en Posesión de los Particulares | DOF 20-mar-2025 (nueva; sector privado) |
| **Ley estatal de datos (Tamaulipas)** | Ley de Protección de Datos Personales en Posesión de los Sujetos Obligados del Estado de Tamaulipas | Decreto 66-369, 8-jul-2025 (abrogó la de 2017) |
| **LFPDPPP/LGPDPPSO 2017** | Versiones anteriores | Abrogadas en 2025; solo referencia histórica |

---

## Cambios de nomenclatura registrados

| Fecha | Cambio | Motivo |
|---|---|---|
| 2026-11-08 | «UAT-CIT» → **UCI** (Universidades y Centros de Innovación) | El Programa trabaja con varias universidades (Tecnológicas, Politécnicas, UAT) y Centros de Innovación Tecnológica del estado; el equipo técnico ya no se nombra por una sola institución |
| 2026-11-08 | Responsable = **SDFI** (Subsecretaría de Desarrollo y Fomento Industrial), órgano desconcentrado de la **SRHDS** | Corrección de la titularidad del tratamiento de datos personales |

*Fin del glosario. Mantener sincronizado con los documentos del paquete ante cualquier cambio de nomenclatura institucional.*
