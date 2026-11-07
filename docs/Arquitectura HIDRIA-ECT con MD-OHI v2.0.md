---
# HIDRIA — Plataforma del Ecosistema de Circularidad Tecnológica
## Documento de Diseño y Especificaciones v2.0 — Rediseño de arquitectura para la implementación de la Metodología de Diagnóstico para la Optimización Hídrica Industrial (MD-OHI)
**Gobierno del Estado de Tamaulipas · SRHDS · Programa «Empresas Hídricamente Responsables» · PRODET · Universidades · CIT**
Versión 2.0 — Octubre de 2026
Documento de trabajo confidencial — uso institucional
Supersedente parcial del documento «ECT Plataforma — Diseño y Especificaciones v1.0» (julio 2026)
---

# 0. Control del documento

| Campo | Valor |
|---|---|
| Documento | HIDRIA — Arquitectura v2.0 (integración MD-OHI) |
| Base documental | `plataforma_ect.agent.final.md` (v1.0); Manual MD-OHI (oct. 2026); Instructivos de Trabajo Anexos A, C y D; Bitácora de Trabajo; Cuestionario CAT; Plantilla de Captura BHE; Taller MD-OHI (presentaciones) |
| Alcance del rediseño | Modelo de datos, módulos funcionales, flujos operativos, Kanban, aula (curso + examen), integración documental, motor IVOH y generador de Reporte de Diagnóstico |
| Lo que se conserva sin cambios | Capítulos 2 (contexto), 3 (benchmark) y 6 (arquitectura técnica base: **cliente web React + PWA** + Supabase + Cloudflare, seguridad, costos) del documento v1.0 (ver Nota de cambio 2026-11-08 abajo) |

**Nota de cambio 2026-11-08 (decisión de stack).** El cliente multiplataforma de la v1.0 (Flutter + Drift) se sustituye por **React 18 + TypeScript + Vite + Tailwind, desplegado como PWA**: el offline-first que justificaba Flutter se resuelve con service worker + IndexedDB (Dexie) y cola de sincronización con resolución por campos (misma garantía metodológica para V1–V3 en campo). Motivos: (1) el prototipo navegable ya construido y verificado implementa todas las pantallas de los módulos M1–M13 en este stack; (2) una sola codebase web adaptable a escritorio/tableta/móvil, sin mantener dos stacks; (3) las funciones Edge y el esquema Supabase quedan idénticos — el cambio afecta solo a la capa cliente. Todas las referencias a «Flutter» en este documento deben leerse como «cliente React + PWA». |

---

# 1. Resumen ejecutivo

El documento v1.0 diseñó la plataforma HIDRIA como columna vertebral colaborativa del Ecosistema de Circularidad Tecnológica, con formularios genéricos F-01 a F-06, un Kanban genérico de tareas y un aula tipo Google Classroom orientada a retos. Entre tanto, la SRHDS ha publicado la **Metodología de Diagnóstico para la Optimización Hídrica Industrial (MD-OHI)**, con sus instrumentos operativos: Cuestionario de Análisis Técnico (CAT, Anexo A), formato de cadena de custodia (Anexo B), Inventario de Infraestructura Hidráulica (IIH, Anexo C), Balance Hídrico Enriquecido (BHE, Anexo D), sistema de calificación **IVOH** (0–10, seis factores ponderados, gráfica radial, semáforo), bitácora de visitas y reuniones (V1–V3, R1–R5), cronograma fijo de seis semanas y contenido mínimo del Reporte de Diagnóstico.

Este documento v2.0 **sustituye los formularios genéricos y el Kanban genérico por el objeto rector de la metodología: el Diagnóstico MD-OHI**. El rediseño se apoya en tres decisiones estructurales:

1. **El Diagnóstico es la unidad atómica de la plataforma.** Una empresa atendida puede tener un historial de diagnósticos; cada diagnóstico concentra su expediente documental, CAT, inventario, balance, cadena de custodia, IVOH, reporte y plan de acción. El Kanban deja de ser un tablero de tareas sueltas: **cada tarjeta es el diagnóstico de una empresa y cada columna es una fase del cronograma MD-OHI** (Semana 1 Arranque → Semana 6 Reporte), con avance físico validado por entregables verificables.
2. **Los instrumentos de la metodología se digitalizan como aplicaciones nativas, no como formularios planos.** El CAT es un formulario guiado de ocho secciones (A–H); el IIH es un registro de activos con folio por etapa de la ruta del agua (CAP/ALM/TRA/DIS/USO/EVA); el BHE replica en línea la plantilla Excel de cinco hojas con sus cálculos (brecha ≤ 10 %, indicadores, carga contaminante) e interoperabilidad bidireccional con el archivo Excel oficial. El IVOH es un motor de rúbricas con evidencia obligatoria por factor, ponderaciones versionadas y gráfica radial automática.
3. **La plataforma impone las reglas de la metodología como gates de flujo.** Sin CAT validado no se cierra el expediente documental de la semana 1–2; sin balance validado en R3 no se habilita la calificación IVOH; sin IVOH validado en R4 no se genera el Reporte de Diagnóstico; sin firma de R5 (NOM-151) el diagnóstico no se archiva. La restricción temporal de seis semanas se traduce en semáforos de atraso sobre las tarjetas del Kanban.

El **Aula MD-OHI** convierte el Taller de la Metodología (guía práctica de 90 minutos, ocho módulos, ejercicios por estación) en un curso en línea tipo Google Classroom con examen rápido calificado automáticamente y microcredencial Open Badges 3.0; su aprobación es requisito configurable para que un usuario pueda participar en un equipo de diagnóstico.

La arquitectura técnica de la v1.0 (cliente web React + PWA offline-first, núcleo Supabase con RLS multi-tenant, perímetro Cloudflare, cifrado de documentos, firma NOM-151, costo ~USD 50–70/mes en el escenario inicial) **se conserva íntegramente** (cambio de stack cliente decidido el 2026-11-08, ver control del documento); la v2.0 añade sobre ella componentes especializados: importador/exportador Excel BHE-IIH, motor de cálculo hídrico, motor de rúbricas IVOH, generador de Reporte de Diagnóstico y motor de evaluaciones del aula.

---

# 2. Qué cambia y qué se conserva respecto a la v1.0

| Componente v1.0 | Disposición v2.0 | Motivo |
|---|---|---|
| Formularios genéricos F-01 a F-06 | **Se sustituyen** por las apps MD-OHI (CAT, IIH, BHE, cadena de custodia, IVOH) | La metodología define instrumentos, columnas, reglas y entregables precisos; replicarlos captura su valor metodológico |
| Kanban genérico de tareas | **Se rediseña**: tarjeta = diagnóstico de empresa; columnas = fases del cronograma MD-OHI de 6 semanas | El usuario requiere que el Kanban siga el cronograma del diagnóstico |
| Aula/retos genéricos | **Se rediseña** como Aula MD-OHI: curso del Taller + examen rápido + badges | El Taller de la Metodología es el contenido formativo rector y pide examen |
| Gantt progresivo | **Se especializa**: (a) cronograma estándar de 6 semanas por diagnóstico (hitos R1–R5, V1–V3) y (b) Plan de Acción de economía circular post-diagnóstico | El manual fija ruta crítica semanal y el plan de acción se firma en Gantt |
| Repositorio documental cifrado | **Se conserva** con catálogo documental estructurado por los 5 requisitos del oficio + evidencias | La documentación básica (layout, planos, parámetros de calidad, etc.) requiere lista de cotejo |
| Validación en cadena (alumno→mentor empresa→mentor académico) | **Se adapta** al circuito MD-OHI: captura (empresa/equipo) → revisión técnica (equipo SRHDS–Universidad–CIT) → validación con empresa (R3/R4) → bloqueo y firma (R5) | La metodología valida con reuniones, no con mentores por omisión |
| Informes por marco NOM/ISO/GRI/ODS | **Se conserva** y se alimenta automáticamente del BHE, IVOH y reportes | Los indicadores base (consumo específico, reúso, brecha, carga contaminante) se calculan en plataforma |
| Stack técnico, seguridad, costos, landing | **Sin cambios** (ver cap. 9) | La v1.0 resolvió estos frentes y siguen siendo válidos |

---

# 3. Mapa de alineación MD-OHI ↔ plataforma

La tabla siguiente es el contrato funcional del rediseño: cada fase de la metodología, cada entregable verificable y cada instrumento tiene su módulo y sus entidades.

## 3.1 Fases, semanas y entregables (Manual MD-OHI §6–7, 15)

| Semana / fase MD-OHI | Actividades clave | Entregable verificable | Módulo(s) plataforma | Entidad rectora |
|---|---|---|---|---|
| 1. Arranque y documentación | R1 de arranque; entrega y validación de documentación básica con lista de cotejo; envío del CAT | Expediente documental con lista de cotejo validada; minuta R1 | M1 Registro de empresas; M3 Repositorio documental; M4 CAT; M10 Bitácora | `diagnostics` (fase 1), `document_checklist_items`, `cat_responses` |
| 2. Análisis documental y Campo I | Gabinete; visita V1 (recorrido por la ruta del agua, verificación de inventario, registro fotográfico); R2 de cierre | Registro de visita V1, hallazgos preliminares; CAT completo o con avance sustantivo | M5 IIH; M10 Bitácora; M4 CAT | `field_visits` (V1), `iih_assets` |
| 3. Campo II: medición y muestreo | V2: mediciones de caudal, lecturas; muestreo del efluente con cadena de custodia; envío a laboratorio | Registro de mediciones; muestras bajo cadena de custodia | M7 Muestreo y laboratorio; M10 Bitácora | `sampling_campaigns`, `custody_transfers`, `field_measurements` |
| 4. Balance hídrico y laboratorio | Recepción de resultados de laboratorio; cierre del BHE; indicadores base; R3 de validación | BHE validado; informe preliminar de calidad | M6 BHE; M7 Laboratorio; M10 Bitácora | `water_balances`, `lab_results` |
| 5. Evaluación IVOH y alternativas | Sesión de calificación de factores; formulación de alternativas; V3 de verificación; R4 de validación | IVOH calculado con gráfica radial; cartera de alternativas priorizada | M8 Motor IVOH; M9 Alternativas; M10 Bitácora | `ivoh_evaluations`, `alternatives` |
| 6. Reporte y Plan de Acción | Integración del reporte; diseño del Plan de Acción en Gantt; R5 de presentación y firma | Reporte de Diagnóstico y Plan de Acción presentados y firmados | M9 Reporte; M2 Plan de Acción; M10 Bitácora | `reports`, `action_plans` |

## 3.2 Instrumentos y formatos de la metodología

| Instrumento (fuente) | Digitalización en plataforma | Regla de negocio implementada |
|---|---|---|
| CAT — Anexo A, 8 secciones (A–H), ~40 preguntas, 4 tipos de respuesta | M4: formulario guiado por sección, guardado parcial, evidencia adjunta por pregunta, firma de quien responde | Respuesta «No sé» válida y trazable; dudas se canalizan a R2; plazo semanas 1–2 con semáforo de vencimiento |
| Cadena de custodia — Anexo B | M7: formato digital por muestra, firmas de muestreador/entrega/recepción con sello de tiempo | Sin cadena de custodia completa la muestra no es válida; temperatura e integridad verificadas al recibir |
| IIH — Anexo C, 6 etapas, 20 columnas, folios por etapa | M5: registro de activos con catálogo de tipos por etapa, prioridad calculada, resumen F5 automático | Mínimo obligatorio: identificación, ubicación, estado, operación, criticidad, intervención; folios no reutilizables |
| BHE — Anexo D, 5 hojas (Instrucciones, 1 Entradas, 2 Destinos, 3 Reúso y calidad, 4 Balance e indicadores) | M6: captura nativa de las 4 hojas de trabajo con las mismas filas/columnas y fórmulas; importador/exportador del Excel oficial | Brecha = entradas − destinos, expresada en %; brecha > 10 % genera hallazgo, no se fuerza el cierre; regla «sin balance validado no hay IVOH» |
| IVOH — Manual §11, 6 factores, rúbrica de 4 niveles, ponderaciones fijas (0.15/0.20/0.20/0.20/0.15/0.10), semáforo, gráfica radial | M8: matriz de calificación con evidencia obligatoria por factor, cálculo automático, ponderaciones versionadas y bloqueadas | Solo se habilita con BHE validado; todo puntaje exige evidencia; validación de empresa en R4 |
| Reporte de Diagnóstico — Manual §12, contenido mínimo de 11 bloques | M9: generador de reporte que ensambla los objetos ya validados y folia los anexos | El reporte solo se puede emitir con IVOH validado; firma NOM-151 de todas las partes en R5 |
| Bitácora — 8 fichas (V1–V3, R1–R5), control de avance, registro fotográfico, control de cambios | M10: fichas en línea con campos esenciales, agendas y checklists de evidencia precargados, cierre en ≤ 24 h; sus datos prefabrican Metodología/Conclusiones/Recomendaciones del reporte | Fichas cerradas inmutables (tachadura digital y control de cambios con versión anterior preservada); folios de evidencia con clave de activo; firma elabora/revisa/valida |
| Taller MD-OHI — 8 módulos, ejercicios por estación | M12 Aula: curso con las 8 secciones + examen rápido + badges | Aprobación configurable como requisito para integrar un equipo de diagnóstico |

---

# 4. Vista general de módulos

| ID | Módulo | Función | Referencia metodológica |
|---|---|---|---|
| M1 | Registro de empresas atendidas | Alta y expediente maestro de la empresa/planta; ciclo de vida empresa → diagnóstico → seguimiento anual | Manual §2 (alcance), §8; Proceso de Atención Empresarial |
| M2 | Gestión de diagnósticos | Objeto rector «Diagnóstico MD-OHI»: fases, equipo de trabajo, fechas, estado, gates | Manual §6, §7, §15 |
| M3 | Repositorio documental con lista de cotejo | Carga de layout, planos hidrosanitarios, parámetros de calidad, títulos, permisos, recibos; lista de cotejo validada en R1 | Manual §8 (Tabla 4) |
| M4 | CAT digital | Cuestionario de Análisis Técnico guiado, secciones A–H | Anexo A e Instructivo |
| M5 | Inventario de Infraestructura Hidráulica | Registro de activos por etapa con folio, prioridad calculada y resumen F5 | Anexo C e Instructivo |
| M6 | Balance Hídrico Enriquecido | Captura nativa de entradas/destinos/reúso-calidad/balance, indicadores, dictámenes; interoperabilidad Excel | Anexo D e Instructivo |
| M7 | Muestreo y laboratorio | Campañas de muestreo, cadena de custodia digital, resultados de laboratorio y dictamen de cumplimiento NOM | Manual §10, Anexo B |
| M8 | Motor IVOH | Calificación F1–F6 con rúbricas, evidencia, ponderaciones fijas, semáforo, gráfica radial | Manual §11 |
| M9 | Reporte de Diagnóstico y Plan de Acción | Generador del reporte (§12), cartera de alternativas, Plan de Acción en Gantt y firma R5 | Manual §12–13 |
| M10 | Bitácora de trabajo | Fichas digitales V1–V3 y R1–R5 con evidencia fotográfica foliada | Bitácora de Trabajo |
| M11 | Kanban de diagnósticos | Tablero por fases del cronograma MD-OHI; tarjeta = diagnóstico de una empresa | Manual §15 + requerimiento del usuario |
| M12 | Aula MD-OHI (tipo Google Classroom) | Curso del Taller, materiales, ejercicios, examen rápido y badges | Taller MD-OHI (presentaciones) |
| M13 | Informes e indicadores | Tablero SRHDS/estatal, indicadores del Programa, marcos NOM/ISO/ODS | Manual §9, §11; ODS 6, ISO 46001 |

Funciones transversales conservadas de la v1.0 (audit log inmutable, SSO, offline-first, multi-organización, WCAG 2.2 AA, panel administrativo) aplican a todos los módulos.

---

# 5. Módulos funcionales (especificación)

## 5.1 M1 — Registro de empresas atendidas

**Propósito.** Dar de alta las empresas atendidas por el Programa «Empresas Hídricamente Responsables» y mantener su expediente maestro, del cual cuelgan todos los diagnósticos (inicial, reevaluaciones anuales, seguimientos).

**Objeto Empresa (Company).** Campos mínimos: razón social, nombre de planta, giro industrial (catálogo: manufacturera, maquiladora, termoeléctrica, alimentos y bebidas, otra), domicilio completo (calle, colonia/parque industrial, C.P.), municipio, organismo operador de agua y alcantarillado, coordenadas georreferenciadas (para contexto de cuenca y estrés hídrico CONAGUA/WRI Aqueduct), número de empleados, turnos, unidad de producción principal, contraparte designada (nombre, cargo, correo, teléfono) y logo/fotografía opcional. El municipio y la ubicación son obligatorios: alimentan el factor F2 (estrés hídrico de cuenca) y el catálogo de organismos operadores.

**Ciclo de vida de la empresa.** `Prospecto → Convenio/NDA firmado (NOM-151) → Activa → Con diagnóstico vigente → Con Plan de Acción en ejecución → Empresa Hídricamente Responsable (reconocimiento, IVOH ≥ 8.0 verde)` . El paso a «Activa» exige el convenio de colaboración y el NDA firmados en el flujo documental (ver 5.3), replicando la Fase 0 de la v1.0.

**Relación con diagnósticos.** Una empresa tiene 1..n diagnósticos (`diagnostics`), cada uno con su propia ruta de 6 semanas; las reevaluaciones anuales comparan contra la línea base del diagnóstico anterior (mismo IVOH, mismos indicadores). La plataforma conserva el historial para medir la mejora anual (meta documentada del manual: IVOH ≥ 7.0 en la primera reevaluación, como referencia).

**Funcionalidades clave**

- Alta por el administrador institucional o por solicitud desde la landing (flujo de aprobación de la v1.0).
- Expediente maestro con pestañas: Datos generales · Diagnósticos · Documentos · Contactos y contrapartes · Reconocimientos.
- Invitación de la contraparte de la empresa como «usuario empresa» (patrón invitado de un solo proyecto) y de los miembros del equipo de Triple Hélice.
- Semáforo de vigencia: alertas de diagnóstico anual pendiente y de documentos por vencer (concesión, permiso de descarga).
- Vista pública agregada y anonimizada para contadores de impacto de la landing (nivel de exposición público).

## 5.2 M2 — Gestión de diagnósticos (objeto rector)

**Propósito.** Crear y conducir el diagnóstico MD-OHI de una empresa, imponiendo las reglas de la metodología.

**Objeto Diagnóstico (`diagnostics`).** Campos: empresa, folio del diagnóstico ( correlativo por año, p. ej. `MDOHI-2026-014`), tipo (inicial / reevaluación anual / seguimiento), fecha de inicio y de fin comprometidas (6 semanas naturales), equipo de trabajo (SRHDS, empresa, universidad, CIT, organismo operador como observador/co-regulador), fase actual (1–6), estado (`Activo → Validado → Reportado → Archivado` o `Suspendido/Reprogramado`), IVOH actual, brecha del balance, porcentaje de avance calculado, y próximo hito (R/V) con fecha.

**Gates de fase (reglas automáticas).** El diagnóstico solo avanza de fase cuando el entregable verificable de la semana está cerrado:

| Transición de fase | Gate obligatorio |
|---|---|
| 1 → 2 | Lista de cotejo documental completa (M3) y minuta R1 firmada (M10) |
| 2 → 3 | Ficha V1 cerrada (M10) e inventario IIH verificado con folios (M5) |
| 3 → 4 | Cadenas de custodia completas y muestras enviadas (M7); mediciones registradas |
| 4 → 5 | BHE validado en R3 (brecha calculada e indicadores listos) (M6); resultados de laboratorio cargados (M7) |
| 5 → 6 | IVOH validado en R4 con evidencia por factor (M8) y cartera de alternativas priorizada (M9) |
| 6 → Archivado | Matriz de completitud al 100 % (CAT, documentación, IIH, BHE, muestreo, 8 fichas de bitácora, IVOH, cartera, fotos); Reporte de Diagnóstico generado, Plan de Acción firmado en R5 (M9, M10) |

Si una actividad se retrasa por causa de la empresa, la SRHDS reprograma dentro de la misma estructura de seis semanas o documenta la extensión justificada; la plataforma registra ambas (la nota del manual: «si alguna actividad se retrasa… se documenta la extensión justificada»).

**Semáforo de atraso.** Cada diagnóstico calcula días de desfase contra la fecha comprometida de su fase: verde (en tiempo), amarillo (≤ 7 días), rojo (> 7 días o fase vencida). Se muestra en la tarjeta Kanban, en el expediente de la empresa y en el tablero de indicadores de la SRHDS.

## 5.3 M3 — Repositorio documental con lista de cotejo

**Propósito.** Recibir, custodiar y cotejar la documentación básica de la sección 8 del manual, más las evidencias complementarias.

**Catálogo documental estructurado.** Cada requisito del oficio SRHDS/SDFI es un tipo documental con su propia ficha de recepción:

| Tipo documental | Contenido mínimo | Uso trazado en la plataforma |
|---|---|---|
| Layout de la planta | Planos generales o croquis con distribución de áreas | Planeación de visitas; puntos de medición y muestreo en V1; referencia de ubicación de activos del IIH |
| Planos hidrosanitarios | Red de agua potable y drenaje | Trazado de la ruta del agua; puntos de interconexión de reúso y descargas |
| Parámetros de calidad por proceso | Límites tolerables por proceso (dureza, pH, DQO, SST, conductividad) | Análisis calidad–uso del BHE (hoja 3) y factor F4 |
| Inventario de infraestructura (IIH) | Registro de activos (se captura en M5; el archivo Excel se archiva aquí) | Evidencia F5 |
| Balance hídrico básico (Excel) | Consumos mensuales por áreas del año en curso | Pre-llenado del BHE |
| Complementarios | Título(s) de concesión, permiso de descarga / condiciones particulares, recibos de agua, informes de laboratorio previos | Verificación normativa F3 |

**Lista de cotejo.** Lista fija con los requisitos anteriores; cada ítem pasa por `No recibido → Recibido → Revisado (equipo) → Validado en R1`. La validación «se hace en la reunión, no por correo»: la ficha R1 (M10) incluye el checklist y las solicitudes de lo faltante quedan en la minuta. Todo documento hereda del repositorio v1.0: cifrado AES-256-GCM (envelope encryption), versionado, hash SHA-256, niveles de exposición (público / anonimizado / sintético / restringido con NDA), marca de agua y firma NOM-151 vía PSC.

**Evidencia por pregunta/campo.** Los adjuntos pueden vincularse a una pregunta del CAT, a un activo del IIH, a un flujo del BHE o a un factor del IVOH, de modo que la evidencia nunca quede huérfana del dato que sustenta.

## 5.4 M4 — CAT digital (Cuestionario de Análisis Técnico)

**Propósito.** Capturar el Anexo A completo (secciones A–H, ~40 preguntas, tipos: abierta, breve, una opción, múltiples opciones) con llenado guiado, tal como lo describe su instructivo.

**Especificación del formulario.** El CAT se define como **plantilla de formulario versionada** (`form_templates`, JSON-driven): cada pregunta lleva código (A1…H3), enunciado, tipo de respuesta, opciones, texto de ayuda del instructivo (incluido el «para qué se usa en el diagnóstico»), si admite evidencia adjunta y reglas condicionales (p. ej., B2 solo si B1 incluye «pozo»; D5 solo si D4 indica PTAR existente). Guardado parcial ilimitado; progreso por sección visible (barras «Semana 1–2»).

**Circuito de llenado.** (1) La plataforma envía el CAT a la contraparte de la empresa al crear el diagnóstico (semana 1); (2) la empresa responde con acompañamiento del equipo; (3) el campo «No sé» es una opción explícita y trazable que crea automáticamente una tarea de resolución en campo (medición o verificación) asignada al equipo; (4) las dudas se anotan en el propio formulario y se resuelven en R2; (5) la contraparte firma (e.firma/NOM-151 o firma manuscrita digital) y el equipo da cierre: `En captura → En revisión → Validado en R2`.

**Derivaciones automáticas hacia otros módulos.** Las respuestas del CAT alimentan de forma estructurada: giro y producción → cálculo de consumo específico (BHE hoja 4); fuentes de abastecimiento y medición → filas semilla de la hoja «1. Entradas»; destino de descargas y PTAR → filas de «2. Destinos» y el paquete de parámetros de muestreo (M7); reúso y pluvial → flujos de «3. Reúso y calidad»; riesgos de cuenca y gobernanza → insumos de los factores F2 y F6.

## 5.5 M5 — Inventario de Infraestructura Hidráulica (IIH)

**Propósito.** Digitalizar el Anexo C: los activos de las seis etapas de la ruta del agua con las veinte columnas en seis bloques y folios por etapa.

**Modelo de captura.** Tabla de activos (`iih_assets`) por diagnóstico, con precarga de catálogo de ~75 tipos de activo por etapa (captación, almacenamiento, tratamiento, distribución, uso y consumo, evacuación). Campos (equivalencia columna a columna con la plantilla):

| Bloque | Campos |
|---|---|
| Identificación | folio (CAP-/ALM-/TRA-/DIS-/USO-/EVA- consecutivo, no reutilizable), tipo de activo (catálogo por etapa), identificación/TAG, ubicación en planta con referencia a layout/plano |
| Especificaciones técnicas | capacidad o caudal de diseño + unidad, potencia (kW), material, año de instalación (antigüedad calculada) |
| Estado, operación y suficiencia | estado físico (bueno/regular/deficiente/fuera de servicio), opera (sí/no/parcial), criticidad (alta/media/baja), respaldo o redundancia, suficiencia (suficiente/limitada/insuficiente) |
| Mantenimiento | tipo de mantenimiento (preventivo/correctivo/mixto/nulo), último servicio documentado |
| Intervención y prioridad | intervención requerida (ninguna / rehabilitación / reposición / ampliación), prioridad **calculada** = f(estado, criticidad, operación) |
| Hallazgos y evidencia | observaciones, fotografía georreferenciada o folio de evidencia |

**Reglas implementadas del instructivo.** Mínimo obligatorio validado por fila (sin identificación, ubicación, estado, operación, criticidad e intervención el activo no se guarda como «completo»); «No sé» queda en blanco y se anota en observaciones (tarea de verificación en V1); un renglón por activo; la hoja «Resumen y F5» se calcula sola: conteos por etapa, índice de conservación, mantenimiento, suficiencia, autonomía de almacenamiento y **lectura orientativa del factor F5** que alimenta M8.

**Verificación en campo V1.** Modo campo del módulo (offline-first): el recorrido sigue la ruta del agua; cada activo se marca «verificado en V1», con foto foliada; los hallazgos de fugas y riegos se capturan como notas georreferenciadas que alimentan F2.

## 5.6 M6 — Balance Hídrico Enriquecido (BHE)

**Propósito.** Replicar en línea la «Plantilla de Captura» de cinco hojas, con sus convenciones, fórmulas y reglas, y ofrecer interoperabilidad total con el Excel oficial.

**Estructura en plataforma (equivalencia exacta con el archivo):**

| Hoja de la plantilla | Vista en plataforma | Captura | Cálculo automático |
|---|---|---|---|
| Instrucciones | Panel de ayuda contextual (convención de celdas, estimaciones guía, glosario) | — | — |
| 1. Entradas | Tabla 12 meses × hasta 6 fuentes (red municipal, pozo 1..n con número de título, pluvial, agua residual tratada, otras) + columna de fuente del dato y comentarios | 12 meses por fuente; conciliación contra recibos y bitácoras | Total anual y promedio mensual por fila y total de entradas |
| 2. Destinos del agua | Tabla 12 meses × consumos (proceso: enfriamiento, calderas, lavados, agua incorporada al producto; generales: sanitarios, regaderas, comedor, áreas verdes, limpieza), descargas (alcantarillado, cuerpo receptor, evaporación, lodos) y pérdidas | 11 destinos; declaración de método cuando es estimación | Totales y cierre |
| 3. Reúso y calidad | Parte A: 4 flujos de circularidad (recirculación torres/calderas con ciclos de concentración, reúso interno, agua tratada reusada); Parte B: caracterización de 13 parámetros contra límites (NOM-001/NOM-002, condiciones particulares, NOM-003, calidad de proceso), con dictamen «¿Cumple?» por parámetro | Flujos y resultados de laboratorio (remiten a M7) | Totales y dictámenes; regla especial de pH (promedio y rango) |
| 4. Balance e indicadores | Balance mensual (entradas vs. destinos), brecha, indicadores base (consumo total anual, consumo específico m³/unidad, % reúso y recirculación, % agua no contabilizada, carga contaminante diaria con DQO/DBO₅ y días de operación) | Producción mensual, días de operación (desde CAT A5), DQO y DBO₅ | Brecha en m³ y %; semáforo de brecha (>10 % = hallazgo); todos los indicadores |

**Reglas de negocio implementadas.** (i) Ecuación del balance por mes: Entradas = Consumos + Descargas + Pérdidas + Agua incorporada al producto ± Variación de almacenamiento. (ii) *Un balance que no cierra no es un dato, es una tarea pendiente*: si la brecha supera 10 % la plataforma bloquea la validación en R3 y abre hallazgo «buscar destino faltante»; nunca auto-ajusta filas. (iii) Convención visual de la plantilla (captura / cálculo / encabezado / guía) se replica en la UI para que quien la use en Excel la reconozca. (iv) Unidad única m³/mes con conversor integrado (L, gal). (v) El periodo (12 meses consecutivos y año de corte) se declara una vez y se valida coherencia con el periodo de producción.

**Interoperabilidad Excel.** (a) *Importador*: subir la plantilla oficial ya llenada y mapear a las vistas (validación de hojas, filas y rangos; reporte de celdas inválidas). (b) *Exportador*: generar un archivo Excel idéntico en estructura al oficial, para quien requiera trabajar offline o entregar el Anexo D en formato original. La captura nativa es la fuente de verdad; el archivo es interoperabilidad, no duplicidad.

**Del BHE al IVOH.** Los indicadores calculados alimentan directamente los factores F1 (medición y brecha), F2 (consumo específico, fugas, contexto de cuenca) y F4 (% de reúso/recirculación, compatibilidad calidad–uso).

## 5.7 M7 — Muestreo y laboratorio (cadena de custodia)

**Propósito.** Operar la campaña de muestreo de la visita V2 (semana 3) y la recepción de resultados (semana 4), con validez probatoria.

**Definición de puntos y paquete.** En V1 el equipo define los puntos de muestreo (descarga final obligatoria; corrientes internas si aplica; verificación de puerto de muestreo conforme al Anexo A de la NOM-001) y el paquete de parámetros (Tabla 6 del manual: contaminantes básicos, patógenos, metales y cianuros, toxicidad aguda Vibrio fischeri, parámetros de reúso/proceso), según giro y destino de la descarga. La plataforma genera el plan de muestreo por punto con tipo de muestra (compuesta proporcional al caudal según horas de operación declaradas en CAT A5; simple para temperatura, pH y toxicidad) y preservación.

**Cadena de custodia digital (Anexo B).** Cada muestra recibe un código único (`{FOLIO-DIAG}-M##`) y una ficha con: punto, fecha-hora de colecta, tipo de muestra y número de muestras simples integradas, caudal al momento de la colecta, preservación, parámetros solicitados, norma de referencia del análisis, laboratorio (razón social, acreditación EMA y aprobación). Las transferencias se firman en línea: muestreador → entrega → recepción en laboratorio con temperatura e integridad del recipiente; cualquier desviación se anota y evalúa su efecto sobre la validez. **Regla: sin cadena de custodia completa la muestra no es válida y su resultado no puede alimentar el dictamen.**

**Resultados de laboratorio.** Carga del informe PDF del laboratorio (folio, hash, nivel restringido) más captura estructurada de resultados por parámetro; la plataforma compara contra los límites aplicables (NOM-001 si descarga a cuerpo receptor; NOM-002 si alcantarillado, más condiciones particulares del organismo operador; NOM-003 si se evalúa reúso) y emite el **dictamen de cumplimiento** por parámetro y global, con semáforo. El dictamen alimenta el factor F3 y la hoja «3. Reúso y calidad» del BHE.

**Modo campo offline.** Captura sin conectividad en planta (códigos de muestra, fotos de rotulado, lecturas de caudal y presión con método declarado: macromedidor, ultrasónico portátil, aforo o estimación ingenieril documentada), sincronización al recuperar conectividad.

## 5.8 M8 — Motor IVOH

**Propósito.** Calcular el Índice de Viabilidad de Optimización Hídrica con rigor, evidencia y comparabilidad entre plantas.

**Configuración del índice.** Los seis factores, sus ponderaciones fijas (F1 0.15, F2 0.20, F3 0.20, F4 0.20, F5 0.15, F6 0.10) y sus rúbricas de cuatro niveles (0–2 Incipiente, 3–5 Básico, 6–8 Consolidado, 9–10 Referente) se almacenan en una **versión parametrizable del índice** (`ivoh_index_versions`); la plataforma fija la versión vigente y bloquea su modificación (todo ajuste futuro requiere aprobación de la Subsecretaría y queda versionado, conforme al manual).

**Ficha de evaluación por factor.** Para cada factor: puntaje 0–10 (entero o con medio punto, según la regla de valores intermedios del manual), justificación, **evidencia obligatoria vinculada** (documentos del M3, activos del M5, flujos e indicadores del M6, resultados del M7, fichas de la bitácora M10, respuestas del CAT M4) y nivel de la rúbrica seleccionado. El sistema muestra por factor los datos ya disponibles de otros módulos como «evidencia sugerida», pero el calificador decide y documenta. La ficha es co-elaborada por el equipo de trabajo y validada con la empresa en R4.

**Cálculo y representación.** `IVOH = 0.15·F1 + 0.20·F2 + 0.20·F3 + 0.20·F4 + 0.15·F5 + 0.10·F6`, redondeo a un decimal, con semáforo institucional: 0.0–4.9 rojo (viabilidad inicial → Plan de Acción con acciones habilitadoras de bajo CAPEX), 5.0–7.9 amarillo (viabilidad media → acciones habilitadoras + proyectos de retorno corto), 8.0–10.0 verde (viabilidad alta → proyectos de economía circular de mayor escala; candidata a «Empresa Hídricamente Responsable»). **Gráfica radial de seis ejes obligatoria**, exportable, con zonas de fondo por semáforo, comparable contra diagnósticos previos de la misma empresa y contra otras plantas (agregado anonimizado).

**Gates.** No se habilita la calificación sin BHE validado (regla «sin balance validado no hay IVOH»); la validación de la empresa (R4) bloquea la ficha; una vez bloqueada, cualquier corrección genera versión nueva.

## 5.9 M9 — Reporte de Diagnóstico y Plan de Acción

**Matriz de completitud del diagnóstico (gate de emisión).** El Reporte de Diagnóstico solo puede generarse cuando **todos** los prerrequisitos del expediente están cerrados. La plataforma muestra esta matriz en la pestaña del reporte (verde/rojo por renglón) y bloquea la emisión hasta el 100 %:

| # | Prerrequisito | Verificado en | Estado requerido |
|---|---|---|---|
| 1 | Lista de cotejo documental completa (los 5 requisitos del oficio + complementarios) | M3, ficha R1 | Validada en R1 |
| 2 | CAT respondido y aclarado | M4, ficha R2 | Validado en R2, firmado por quien responde |
| 3 | Inventario IIH integrado y verificado | M5, ficha V1 | Cerrado con folios y resumen F5 calculado |
| 4 | Mediciones de campo registradas y muestras bajo cadena de custodia completa | M7, ficha V2 | Cadenas de 3 transferencias firmadas; comprobante de envío |
| 5 | Balance Hídrico Enriquecido cerrado | M6, ficha R3 | Validado en R3 (brecha calculada e informada) |
| 6 | Resultados de laboratorio cargados con dictamen de cumplimiento | M7, ficha R3 | Informe del laboratorio acreditado foliado |
| 7 | Las ocho fichas de bitácora (V1–V3, R1–R5) cerradas y firmadas | M10 | Cerradas (elabora / revisa / valida) y bitácora cerrada en semana 6 |
| 8 | IVOH calificado con evidencia por factor | M8, ficha R4 | Validado en R4 (ficha bloqueada, radial y semáforo emitidos) |
| 9 | Cartera de alternativas priorizada | M9, fichas V3 y R4 | Verificada en V3 y priorizada en R4 |
| 10 | Registro fotográfico foliado | M10 | Evidencia foliada y vinculada a fichas y activos |

El botón «Generar Reporte» se habilita únicamente con los diez renglones en verde; cada renglón enlaza al módulo y a la ficha que lo acredita, de modo que el equipo sabe exactamente qué falta y dónde resolverlo. Esta matriz es también el checklist de la columna «Semana 6 · Reporte» del Kanban.

**Generador del Reporte de Diagnóstico.** Construye el documento de la sección 12 del manual ensamblando automáticamente los objetos ya validados: portada y control de versiones; resumen ejecutivo (IVOH, radial, hallazgos, cartera priorizada); antecedentes y descripción de la planta (del expediente M1 y CAT M4); metodología aplicada (fases, visitas, reuniones — de la bitácora M10); balance hídrico enriquecido (diagrama de flujos, tabla mensual, calidad, brecha, indicadores — de M6); resultados de laboratorio y evaluación de cumplimiento (M7); evaluación IVOH (fichas por factor con evidencia, radial, índice e interpretación — de M8); conclusiones; recomendaciones y Plan de Acción. Los **anexos se folian solos**: A CAT respondido, B cadenas de custodia, C IIH, D BHE, E ficha IVOH y evidencia, F registros fotográficos. El contenido de Metodología aplicada, conclusiones y recomendaciones se **prefabrica desde la bitácora** (tabla de extracción en 5.10.5): el equipo revisa y redacta el análisis, sin transcribir. Formato de salida: PDF maquetado (editable en origen), con el sello institucional y control de versiones. **Gate: emisión condicionada a la matriz de completitud (10/10 en verde)**; una vez emitida la primera versión, toda corrección genera una nueva versión del reporte, nunca una sobreescritura, y queda ligada a la ficha R5 y al control de cambios de la bitácora.

**Cartera de alternativas.** Registro de alternativas de solución a partir del catálogo de la jerarquía circular (1 Reducir, 2 Reutilizar y recircular, 3 Regenerar, 4 Recuperar, 5 Repensar fuentes), cada una con ficha: descripción, factor(es) del IVOH que mejora, ahorro hídrico estimado (m³/año), ahorro financiero estimado, CAPEX/OPEX de orden de magnitud, periodo simple de retorno, criterio de priorización (incluida la regla «obligatorio cuando F1 o F2 < 6» del nivel Reducir), estado de verificación de supuestos en V3 y prioridad final. La priorización se valida con la empresa en R4.

**Plan de Acción en Gantt.** Objetivos, acciones, responsables, fechas de cumplimiento e indicadores de verificación, conectado al módulo Gantt de la v1.0 (mismo objeto tarea con vista Gantt/Kanban/calendario). Se firma por todas las partes en R5 con firma NOM-151 vía PSC (constancia archivada en el expediente). Post-firma, el Plan de Acción se convierte en el tablero de ejecución de la etapa de implementación del Proceso de Atención Empresarial, con seguimiento de indicadores contra la línea base del diagnóstico.

## 5.10 M10 — Bitácora de trabajo (llenado en línea)

**Propósito.** Operar en línea la Bitácora de Trabajo del Diagnóstico: las ocho fichas (V1–V3 y R1–R5) se llenan en sesión desde web o móvil (modo campo offline-first para las visitas) y constituyen, además de la evidencia del proceso, una **fuente estructurada de datos** que el generador del Reporte de Diagnóstico (M9) consume directamente. La bitácora digital replica fielmente la estructura del documento oficial: misma clave de folios, mismos apartados, mismas agendas y checklists de evidencia precargados.

### 5.10.1 Modelo de la ficha digital

Cada ficha tiene tres zonas: **bloque de identificación**, **seis apartados** y **cierre con firmas**. Los textos de guía (objetivo, asistentes requeridos, entregable y agenda precargada) no se borran: lo no realizado o modificado se explica en hallazgos, replicando la regla de llenado del formato oficial.

**Bloque de identificación (campos esenciales):** responsable de la sesión (miembro del equipo), fecha, horario (inicio y término), modalidad (presencial / virtual / mixta), lugar o plataforma, folio automático `BIT-<clave>-NN` (consecutivo de dos dígitos por tipo de evento, p. ej. `BIT-V2-01`; sesiones adicionales generan `BIT-V2-02` y se anotan en el control de avance), objetivo del evento y asistentes requeridos (precargados por tipo de ficha) y entregable verificable (precargado).

**Apartado 1 — Participantes.** Tabla de asistentes con nombre completo, cargo o área, institución (empresa / SRHDS / universidad / CIT / laboratorio), correo o teléfono y firma digital de asistencia. Al firmar, el participante queda registrado en el audit log con sello de tiempo.

**Apartado 2 — Agenda desarrollada y resultados.** Agenda precargada por ficha (ver 5.10.2) con columnas actividad → responsable → resultado o acuerdo; cada ítem se marca `Realizado / Modificado / No realizado` y su resultado se captura en línea. Este apartado es evidencia directa del apartado «Metodología aplicada» del reporte.

**Apartado 3 — Hallazgos, observaciones e incidencias.** Texto estructurado con clasificación opcional por tema (medición, fugas/desperdicios, infraestructura, cumplimiento, operación, datos documentales) y vinculación a objetos: activo del IIH (folio CAP-/ALM-/…), pregunta del CAT, flujo del BHE o factor del IVOH. Un hallazgo de fugas detectado en V1, por ejemplo, queda ligado al activo y alimenta el factor F2.

**Apartado 4 — Acuerdos y compromisos.** Tabla: acuerdo o compromiso, responsable, fecha, seguimiento. Los acuerdos con fecha generan recordatorios automáticos (notificaciones al responsable) y, al cerrarse, alimentan las conclusiones y el Plan de Acción del reporte.

**Apartado 5 — Evidencia y anexos del evento.** Checklist precargado por ficha (ver 5.10.2) cuyos ítems se van ligando a archivos o folios reales del expediente (M3, M5, M6, M7 o `photo_log`); cada ítem marcado exige el folio o la referencia, y el sistema valida que exista antes de permitir el cierre de la ficha.

**Apartado 6 — Cierre y firmas.** Tres firmas obligatorias con fecha: **Elaboró** (equipo de trabajo), **Revisó** (contraparte de la empresa) y **Validó** (SRHDS); autógrafa digital o electrónica NOM-151, según el perfil del firmante. La ficha se cierra el mismo día o dentro de las 24 horas siguientes; cierre posterior exige fecha real de elaboración y razón en observaciones. Una vez cerrada, la ficha queda **inmutable**: toda corrección posterior pasa por el control de cambios (5.10.4).

### 5.10.2 Agendas y checklists precargados por ficha

| Ficha | Sem. | Duración | Agenda precargada (actividades) | Checklist de evidencia precargado |
|---|---|---|---|---|
| **R1** Arranque | 1 | Máx. 2 h | Presentación del equipo; alcance y metodología MD-OHI; asignación de contrapartes; calendario de 6 semanas; entrega y validación de documentación con lista de cotejo; envío del CAT y acuerdos de confidencialidad | Lista de cotejo validada; acta de integración del equipo; calendario firmado; cuestionario enviado; acuerdos de confidencialidad |
| **V1** Reconocimiento y verificación | 2 | Una jornada | Reunión de inicio y seguridad; recorrido captación–almacenamiento–tratamiento; recorrido distribución–usos; verificación de inventario, fugas y desperdicios; identificación de puntos de medición y muestreo con registro fotográfico; entrevistas de cierre con EHS, Facilities y Mantenimiento | Registro fotográfico; inventario verificado; croquis de puntos de medición y muestreo; notas de entrevistas por área; lista de asistencia |
| **R2** Cierre de visita | 2 | 30–45 min | Presentación de hallazgos preliminares de V1; revisión del avance del CAT; aclaración de dudas y vacíos; acuerdos de entrega de evidencia pendiente; confirmación de fechas y logística de V2 | Minuta de hallazgos; cuestionario con avance; compromisos de evidencia pendiente; confirmación de V2 |
| **V2** Mediciones y muestreo | 3 | Una jornada | Verificación de puntos y seguridad; medición de caudal en entradas, macromedidores y recirculación; lecturas de presión, niveles y ciclos de concentración; toma de muestras del efluente y corrientes internas; cadena de custodia, preservación y envío al laboratorio; verificación de la operación de la PTAR | Registro de mediciones; cadenas de custodia firmadas; fotografías de carátulas e instrumentos; croquis de puntos de muestreo; comprobante de envío al laboratorio |
| **R3** Validación de datos y balance | 4 | Máx. 1.5 h | Presentación del BHE y de la brecha; revisión de entradas, destinos, reúso y recirculación; revisión de indicadores base (consumo específico, reúso, agua no contabilizada); resultados de laboratorio y cumplimiento de límites; aclaración de inconsistencias y ajustes; acuerdos de información pendiente para el IVOH | BHE validado; informe preliminar de laboratorio; registro de ajustes al balance; acuerdos de información pendiente |
| **V3** Verificación de supuestos | 5 | Media jornada | Presentación de alternativas; recorrido de espacios disponibles; verificación de puntos de interconexión; mediciones complementarias de calidad; análisis de calidad requerida por proceso; cierre y acuerdos de ajuste de alternativas | Croquis de alternativas anotado; registro fotográfico de espacios y puntos; mediciones complementarias; notas de verificación por alternativa |
| **R4** Validación del IVOH | 5 | Máx. 1.5 h | Presentación de la ficha de evaluación y evidencia por factor; calificación de los seis factores y cálculo del IVOH; presentación de la gráfica radial y semaforización; presentación de la cartera de alternativas y su evaluación preliminar; priorización de alternativas; acuerdos para la integración del reporte y del Plan de Acción | Ficha de evaluación IVOH; gráfica radial; cartera priorizada; registro de la sesión de calificación |
| **R5** Presentación final | 6 | Sesión final | Presentación del resumen ejecutivo y del IVOH; conclusiones y recomendaciones; presentación del Plan de Acción en Gantt; acuerdos de ejecución y seguimiento (etapa 8); firma del Plan por todas las partes; cierre del diagnóstico e integración del expediente | Reporte de Diagnóstico; Plan de Acción firmado; minuta de acuerdos de seguimiento; expediente integrado |

La convocatoria, validación y firmas siguen la Tabla 6 de la bitácora: R1 la convoca y valida la dirección de planta (firman SRHDS y empresa); R2 y R3 las valida la contraparte; R4 la valida dirección o contraparte (firman dirección y SRHDS); R5 la valida la dirección y firman todas las partes. La plataforma aplica estos circuitos como flujos de firma con orden y recordatorios.

### 5.10.3 Control de avance del diagnóstico (dentro de la bitácora)

Dos vistas consolidadas, alimentadas por las fichas y por los estados de M2:

- **Fases y entregables verificables:** las seis fases con su entregable, fecha de cumplimiento, folio del documento que lo respalda y estado **P (programado) / R (realizado) / X (reprogramado)**. Si un hito se reprograma, la fecha original se conserva y la nueva se anota en hallazgos de la ficha correspondiente.
- **Registro de hitos:** los ocho hitos con semana, fecha programada, fecha realizada, folio de la ficha y estado P/R/X. La fecha programada la propone el cronograma estándar de 6 semanas de M2 y se ajusta en R1 (calendario firmado).

El control de avance alimenta el porcentaje de avance del diagnóstico (M2), la tarjeta Kanban (M11) y el semáforo de atraso, y se incluye en el reporte como evidencia del cumplimiento del cronograma.

### 5.10.4 Registro fotográfico, control de cambios y cierre de la bitácora

**Registro fotográfico (`photo_log`).** Inventario unificado de la evidencia de las ocho sesiones: folio, evento, fecha, descripción y archivo. Convención de folios automática: `V1-01`, `V1-02`… y, cuando la fotografía documenta un hallazgo de un activo, la clave del activo se agrega al folio (p. ej. `V1-05-03 · USO-01`), vinculando foto ↔ ficha ↔ activo del IIH ↔ factor del IVOH. Las fotos se suben en sesión (compresión y georreferencia) y heredan el nivel de exposición restringido del expediente.

**Control de cambios.** Tabla versionada (versión, fecha, descripción del cambio, responsable). Cualquier modificación posterior al cierre de una ficha se registra aquí y conserva la versión anterior en el expediente: corrección = tachadura digital con valor anterior visible, fecha e iniciales.

**Cierre de la bitácora (semana 6).** Confirma que las ocho fichas están completas, que la evidencia está foliada y que los acuerdos fueron comunicados a la empresa. Lo firman quien integra el expediente (equipo) y quien valida por la SRHDS; no requiere presencia de todas las partes. El cierre de la bitácora es **prerrequisito de la emisión del Reporte de Diagnóstico** (ver M9).

### 5.10.5 Extracción de datos de la bitácora hacia el Reporte de Diagnóstico

La bitácora no es solo evidencia: el generador del reporte toma de ella, sin re-captura:

| Contenido de la bitácora | Alimenta en el Reporte de Diagnóstico (§12 del manual) |
|---|---|
| Bloques de identificación de las 8 fichas + agenda resultados | Metodología aplicada: fases, visitas, reuniones, documentación recibida, mediciones y campaña de muestreo |
| Control de avance (P/R/X, fechas, folios) | Metodología aplicada: cumplimiento del cronograma de 6 semanas; antecedentes |
| Hallazgos V1 (fugas, riegos, desperdicios, medición) | Conclusiones (riesgos y oportunidades) y evidencia del factor F2 |
| Croquis y puntos de medición/muestreo de V1 | Metodología aplicada (campaña de muestreo) y verificación del Anexo A de la NOM-001 |
| Registro de mediciones V2 (apartado y evidencia) | Metodología aplicada y consistencia con el BHE |
| Acuerdos R1 (calendario firmado, contrapartes) | Metodología aplicada y antecedentes |
| Minuta R2 (aclaraciones al CAT, compromisos) | Anexo A (cuestionario respondido) y metodología |
| BHE validado y ajustes de R3 | Balance hídrico enriquecido (capítulo del reporte) y conclusión de brecha |
| Sesión de calificación de R4 (fichas por factor) | Evaluación IVOH: ficha con evidencia por factor |
| Notas de verificación de V3 por alternativa | Recomendaciones: viabilidad verificada en sitio de cada alternativa |
| Conclusiones y recomendaciones presentadas en R5 | Conclusiones y Recomendaciones (redacción asistida con lo aprobado en sesión) |
| Acuerdos de ejecución y seguimiento de R5 | Plan de Acción: responsables, fechas e indicadores |
| Registro fotográfico foliado | Anexos del reporte (evidencia fotográfica) |

Así, cuando se cierran las ocho fichas, el apartado de metodología y gran parte de conclusiones y recomendaciones del reporte ya están construidos; el equipo **revisa y redacta**, no vuelve a transcribir.

## 5.11 M11 — Kanban de diagnósticos

**Propósito.** Superficie de trabajo cotidiana del Programa, conforme al cronograma del diagnóstico: **cada tarjeta es el diagnóstico de una empresa y las columnas son las seis fases del cronograma MD-OHI** (Semana 1 Arranque y documentación → Semana 2 Análisis documental y Campo I → Semana 3 Campo II Medición y muestreo → Semana 4 Balance hídrico y laboratorio → Semana 5 Evaluación IVOH y alternativas → Semana 6 Reporte y Plan de Acción), más dos columnas de frontera: «Convenio/NDA» (antes de arrancar) y «Archivado/En seguimiento» (después de R5).

**La tarjeta-diagnóstico.** Vista compacta con: razón social y planta (con avatar/logo), giro, municipio y organismo operador; fase y semana (S1…S6) con fecha comprometida; semáforo de atraso (verde/amarillo/rojo); checklist del entregable verificable de la fase (el gate de M2, con estado por ítem); porcentaje de avance calculado; próximo hito (V/R con fecha); IVOH y semáforo IVOH cuando ya fue calificado (interino durante la semana 5); responsable del equipo (SRHDS) y contraparte de la empresa; indicadores vivos (brecha del balance, indicador de reúso). Al abrir la tarjeta se accede al expediente completo del diagnóstico (M2–M10) sin salir del tablero.

**Movimiento de tarjetas.** Una tarjeta avanza de columna solo cuando su gate de fase está cumplido (M2); el sistema ofrece una vista «Checklist de la semana» para cerrar el entregable. Los roles con permiso de mover son el gestor SRHDS del diagnóstico y el coordinador; la empresa puede mover solo hacia validaciones que le corresponden (patrón Kanboard de columna restringida). Límites WIP por columna configurables (recomendado: 3–5 diagnósticos en campo simultáneos por equipo). Si el avance del estudio lo confirma el equipo, la tarjeta se mueve de fase y la ficha de bitácora correspondiente queda foliada; si una actividad se retrasa por causa de la empresa, se usa «Reprogramar» (con justificación documentada, sin salir de las 6 semanas) y la tarjeta muestra el semáforo.

**Vistas adicionales del mismo objeto.** (a) Gantt del cronograma de 6 semanas por diagnóstico (hitos R1–R5 y V1–V3 sobre la ruta crítica); (b) calendario de visitas y reuniones de todos los diagnósticos (programación estatal de campo); (c) tabla comparativa de diagnósticos (empresa, fase, IVOH, brecha, atraso); (d) tablero «Reevaluaciones anuales» con las empresas cuyo diagnóstico cumple ciclo.

## 5.12 M12 — Aula MD-OHI (tipo Google Classroom)

**Propósito.** Capacitar en la metodología a los equipos de Triple Hélice (empresas, universidades, CIT, SRHDS) con el contenido del Taller de la Metodología y verificar el aprendizaje con un examen rápido.

**Curso «Taller MD-OHI».** Reproducción en línea de la estructura del Taller (90 minutos, 8 módulos): (1) Los tres productos del diagnóstico; (2) La ruta de 6 semanas y sus entregables; (3) Semana por semana: qué se hace y qué se valida; (4) Ejemplo 1 · Inventario de infraestructura hidráulica; (5) Ejemplo 2 · Balance hídrico enriquecido; (6) Ejemplo 3 · Calificación IVOH y semáforo; (7) Ejercicios guiados por estación; (8) Cierre: errores frecuentes y próximos pasos. Cada módulo = unidad con video/materiales (las presentaciones del Taller y los documentos del Programa como lecturas), un ejercicio corto interactivo (mismo espíritu del Taller: «un ejercicio corto después de cada ejemplo») y un cuestionario de autoevaluación.

**Examen rápido.** Banco de preguntas parametrizado por módulo (reglas del juego: 6 semanas / 3 visitas / 5 reuniones / 5 documentos; criterio de cierre del balance brecha ≤ 10 %; pesos del IVOH; rúbricas por factor; regla «sin cadena de custodia no hay dato válido»; gates de validación R1–R5). Configuración por cohorte: número de reactivos, tiempo límite, umbral de aprobación (recomendado 80 %), reintentos permitidos, aleatorización. Calificación automática instantánea con retroalimentación por reactivo (referencia al módulo y al numeral del manual correspondiente).

**Operación tipo Classroom.** Stream por cohorte con anuncios; tareas con entrega y retroalimentación; rol observador/directivo (resúmenes de avance sin edición, patrón «guardian»); conformación de cohortes por organización (universidades, CIT, SRHDS). Al aprobar el examen, el usuario recibe **badge Open Badges 3.0** «Aplicador certificado MD-OHI», verificable y portable. Configurable: exigir el badge como requisito para ser asignado a un equipo de diagnóstico (garantiza que quien captura conoce la metodología). La SRHDS puede crear cohortes por generación del Programa y medir cobertura formativa por organización.

## 5.13 M13 — Informes e indicadores

**Tablero del Programa (SRHDS/Subsecretaría).** Indicadores calculados en vivo desde los módulos: diagnósticos por fase y por semáforo de atraso; distribución de IVOH del padrón (radar agregado anonimizado); brecha promedio del padrón; % de plantas con balance validado; cumplimiento NOM-001/NOM-002 por planta; cartera de proyectos del Plan de Acción por nivel de la jerarquía circular (m³/año de ahorro potencial, CAPEX agregado, retornos); cobertura formativa (usuarios con badge / usuarios activos); reevaluaciones anuales cumplidas vs. programadas.

**Evidencia para marcos.** NOM-001/002/003 (descargas), ISO 46001 (balance e indicadores de eficiencia), ISO 14046 (huella hídrica con los flujos del BHE), ODS 6.3.1/6.4.1/6.4.2 (tratamiento, eficiencia, estrés hídrico), ODS 12.6.1, GRI 303/306: los informes se generan desde la misma evidencia operativa, con la plantilla Indicador/Valor/Fuente de la v1.0. Informes ejecutivos programables (semanal/mensual) a directivos y observadores, en PDF/Excel, con datos agregados y anonimizados cuando cruzan organizaciones.

**Contadores públicos de impacto.** Plantas diagnosticadas, m³ de agua reutilizada, alumnos participantes, empresas «Hídricamente Responsables»: alimentan la landing pública con datos agregados y verificables (no editables a mano).

---

# 6. Modelo de datos (extensión del capítulo 6.3 de la v1.0)

Se conservan las entidades base de la v1.0 (`organizations`, `users`, `projects`, `boards`, `cards`, `forms`, `form_responses`, `documents`, `document_versions`, `signatures`, `audit_log`, `badges`, `notifications`, `gantt_tasks`). La v2.0 añade el dominio MD-OHI. Multi-tenancy sin cambios: `organization_id` + custom claims en JWT + RLS en todas las tablas de negocio; el tenant del Programa es la SRHDS, y las empresas, universidades y CIT acceden por membresía a proyectos/diagnósticos con permisos por fila.

## 6.1 Entidades nuevas del dominio MD-OHI

| Tabla | Descripción | Campos clave |
|---|---|---|
| `companies` | Empresa atendida (expediente maestro) | razón social, planta, giro (catálogo), domicilio, municipio, organismo operador, coordenadas, empleados, turnos, unidad de producción, contraparte (FK users), ciclo de vida, reconocimientos |
| `diagnostics` | Diagnóstico MD-OHI (objeto rector) | folio, company_id, tipo (inicial/reevaluación/seguimiento), fechas (inicio, fin comprometido), fase_actual (1–6), estado, ivoh_actual, brecha_actual, avance_pct, próximo_hito, semáforo_atraso, versión índice IVOH |
| `diagnostic_team` | Equipo de Triple Hélice por diagnóstico | diagnostic_id, user_id, institución, rol en el diagnóstico, vigencia |
| `document_checklist_items` | Lista de cotejo de la documentación básica | diagnostic_id, tipo documental (layout/planos/parámetros/IIH/BHE básico/concesión/permiso/recibos/lab previos), estado (no recibido/recibido/revisado/validado R1), document_id, notas de solicitud |
| `cat_responses` | Respuestas del Cuestionario de Análisis Técnico | diagnostic_id, pregunta_id, valor (abierta/opción/opciones múltiples/no-sé/N-A), evidencia document_id, resuelta_en_campo, firma responsable, estado del cuestionario |
| `iih_assets` | Activos del Inventario de Infraestructura Hidráulica | diagnostic_id, folio (CAP/ALM/TRA/DIS/USO/EVA), tipo, tag, ubicación, capacidad+unidad, potencia kW, material, año, estado físico, opera, criticidad, respaldo, suficiencia, mantenimiento (tipo, último servicio), intervención, prioridad calculada, observaciones, fotos, verificado_en_V1 |
| `water_balances` | Balance Hídrico Enriquecido (cabecera) | diagnostic_id, periodo (año de corte), fuente_origen (captura nativa/importado Excel), estado, brecha_m3, brecha_pct, validado_R3, versión |
| `balance_flows` | Flujos del BHE por mes | balance_id, hoja (entradas/destinos/reúso), flujo (catálogo: red municipal, pozo n, pluvial, residual tratada; consumos por uso; descargas por destino; flujos circulares), mes (1–12), volumen m³, fuente_dato, comentario, método si es estimación |
| `quality_parameters` | Caracterización de calidad del BHE (hoja 3-B) | balance_id, parámetro (13 del catálogo), valor, unidad, límite aplicable, norma referencia (NOM-001/NOM-002/NOM-003/proceso/condiciones particulares), dictamen_cumple |
| `balance_indicators` | Indicadores base calculados | balance_id, consumo_total_anual, consumo_especifico, pct_reuso, pct_no_contabilizada, carga_contaminante (DQO, DBO₅, días operación), producción mensual |
| `sampling_campaigns` / `samples` | Campaña de muestreo V2 | diagnostic_id, punto (descarga final/corriente interna), puerto muestreo NOM-001, código muestra, tipo (simple/compuesta), n_simples, fecha-hora, caudal, preservación, parámetros solicitados, norma referencia |
| `custody_transfers` | Cadena de custodia (Anexo B) | sample_id, secuencia (muestreo/entrega/recepción), quien, rol, fecha-hora, firma, temperatura recepción, integridad recipiente, observaciones |
| `lab_results` | Resultados de laboratorio | sample_id, laboratorio (razón social, acreditación EMA), parámetro, valor, unidad, método, informe document_id, dictamen (cumple/no cumple) por parámetro |
| `ivoh_index_versions` | Versión parametrizada del índice | versión, vigencia, factores (F1–F6) con pesos fijos, niveles de rúbrica, aprobado por, fecha |
| `ivoh_evaluations` | Ficha de evaluación IVOH | diagnostic_id, version_id, factor (F1–F6), puntaje, nivel rúbrica, justificación, evidencia vinculada (documentos, activos, indicadores, resultados, bitácora, CAT), estado (borrador/validado R4), versionado |
| `ivoh_scores` | Resultado calculado | evaluation_id, IVOH (1 decimal), semáforo, gráfica radial (serie JSON para reutilizar en reporte y comparativas) |
| `alternatives` | Cartera de alternativas de solución | diagnostic_id, jerarquía (1 reducir…5 repensar), descripción, factores_mejora, ahorro_m3_anio, ahorro_financiero, CAPEX, OPEX, retorno_simple, prioridad, verificado_en_V3, validado_R4 |
| `action_plans` / `action_plan_items` | Plan de Acción en Gantt | diagnostic_id, objetivo, acción, responsable, fechas, indicador verificación, firma R5 (signature_id) |
| `logbook_entries` | Bitácora V1–V3 / R1–R5 (fichas en línea) | diagnostic_id, clave (V1/V2/V3/R1…R5), folio (BIT-…-nn), responsable_sesión, fecha, horario_inicio/término, modalidad (P/V/M), lugar, participantes (nombre, cargo, institución, contacto, firma asistencia), agenda_items (actividad precargada, responsable, resultado/acuerdo, estado realizado/modificado/no realizado), hallazgos (texto, tema, vínculos a activos/CAT/flujos/factores), acuerdos (compromiso, responsable, fecha, seguimiento), evidencia_checklist (ítems precargados ligados a document_id/folio), firmas (elabora/revisa empresa/valida SRHDS + fecha), estado (abierta/cerrada), cerrada_en ≤24 h, versión |
| `logbook_change_log` | Control de cambios de la bitácora | entry_id, versión, fecha, descripción, responsable, valor_anterior preservado |
| `logbook_progress` | Control de avance del diagnóstico | diagnostic_id, fases (entregable, fecha, folio, estado P/R/X), hitos (fecha programada/realizada, folio ficha, estado P/R/X) |
| `field_measurements` | Mediciones de campo V2 | diagnostic_id, punto, magnitud (caudal, presión, nivel, ciclos concentración), método (macromedidor/ultrasónico/aforo/estimación documentada), valor, unidad, fecha-hora |
| `photo_log` | Registro fotográfico foliado | diagnostic_id, evento (V1/V2/V3…), folio, document_id, georreferencia, activo relacionado (folio IIH) |
| `course_cohorts` / `course_enrollments` / `quiz_attempts` | Aula MD-OHI | cohorte, usuario, avance por módulo, intentos de examen, calificación, aprobado, badge emitido |

## 6.2 Relaciones de integridad de negocio (reglas a nivel base de datos)

1. `diagnostics.fase_actual` solo puede incrementar si el entregable de la fase origen está validado (transición transaccional validada por Edge Function; el estado del entregable vive en las tablas del módulo correspondiente).
2. `ivoh_evaluations` requiere un `water_balances.validado_R3 = true` del mismo diagnóstico (gate).
3. `samples` sin `custody_transfers` completa (3 transferencias firmadas) tienen `lab_results.dictamen` bloqueado.
4. Todo documento vinculado como evidencia hereda el nivel de exposición del objeto que sustenta y se registra en `audit_log` con hash.
5. `ivoh_index_versions` inmutable una vez vigente (nueva versión = nueva fila).
6. Los volúmenes de `balance_flows` alimentan cálculos derivados (totales, brecha, indicadores) mediante vistas materializadas recalculadas por trigger, garantizando que «la hoja 4 funcione como tablero» igual que la plantilla.

## 6.3 Interoperabilidad con los formatos oficiales

| Archivo oficial | Ruta de interoperabilidad |
|---|---|
| Plantilla «Balance Hídrico Enriquecido — Plantilla de Captura» (.xlsx, 5 hojas) | Importador (mapeo celda→campo, validaciones, reporte de errores) y exportador (reconstrucción idéntica de hojas y formatos) |
| Plantilla «Inventario de Infraestructura Hidráulica» (.xlsx, 10 hojas) | Importador/exportador por etapa con folios preservados; catálogo de tipos y listas sincronizados |
| Cuestionario CAT (Word) | Migrado a `form_templates` JSON versionado; exportable a PDF idéntico al Anexo A para entrega impresa |
| Bitácora (Word) | Exportable a PDF con las ocho fichas foliadas |
| Cadena de custodia (tabla del manual) | Formato digital nativo; exportable como tabla PDF del Anexo B |

---

# 7. Flujo operativo end-to-end (las 6 semanas dentro de la plataforma)

**Semana 1 — Arranque y documentación.** La tarjeta-diagnóstico nace en la columna «Convenio/NDA». Se firman convenio y NDA (M3, flujo de firma NOM-151); se emite la invitación a la contraparte de la empresa. En R1 (ficha de bitácora) se valida la lista de cotejo documental (los 5 requisitos + complementarios); lo faltante se pide en la misma reunión y queda en la minuta. Se envía el CAT (M4) a la contraparte con llenado guiado. La empresa carga layout, planos hidrosanitarios y parámetros de calidad por proceso al expediente (M3); el equipo pre-llena el BHE en gabinete con el balance básico recibido (M6) y el inventario inicial (M5). Gate para mover a Semana 2: checklist R1 completo.

**Semana 2 — Análisis documental y Campo I.** V1 con modo campo: recorrido por la ruta del agua con layout y planos en pantalla, verificación del IIH (folios marcados como verificados, fotos foliadas), detección de fugas/riegos (notas georreferenciadas → F2), definición de puntos de medición y muestreo (alimentan M7). R2 cierra la visita y aclara el CAT: el cuestionario pasa a «Validado en R2». Gate: ficha V1 cerrada + IIH verificado + CAT validado.

**Semana 3 — Campo II: medición y muestreo.** V2: mediciones de caudal/presión/niveles con método declarado; plan de muestreo ejecutado con cadena de custodia digital (códigos de muestra, firmas de transferencia, envío el mismo día); verificación de operación de PTAR. Gate: cadenas de custodia completas + mediciones registradas.

**Semana 4 — Balance hídrico y laboratorio.** Recepción de resultados del laboratorio (con acreditación EMA) y dictámenes de cumplimiento; cierre del BHE (12 meses completos, calidad, brecha); R3 valida datos y balance con la empresa: el BHE queda `validado_R3 = true`. Brecha > 10 % ⇒ hallazgo y tarea de búsqueda del destino faltante. Gate: BHE validado + resultados de laboratorio cargados.

**Semana 5 — Evaluación IVOH y alternativas.** Se habilita la ficha IVOH con evidencia sugerida de M3–M7; sesión de calificación del equipo con la empresa; formulación de alternativas con evaluación técnico-financiera preliminar; V3 verifica supuestos en sitio; R4 valida el IVOH (bloqueo con versión) y prioriza la cartera. Gate: IVOH validado + cartera priorizada.

**Semana 6 — Reporte y Plan de Acción.** La matriz de completitud (M9) valida que nada falte: documentación cotejada, CAT validado, IIH verificado, cadenas de custodia completas, BHE validado, laboratorio cargado, las ocho fichas de bitácora cerradas y firmadas, IVOH validado, cartera priorizada y evidencia foliada. El generador ensambla entonces el Reporte de Diagnóstico —con Metodología aplicada, conclusiones y recomendaciones ya prefabricadas desde las fichas y sin re-captura— y folia los anexos (A–F); el Plan de Acción se estructura en Gantt con responsables, fechas e indicadores; R5 presenta a dirección y firman todas las partes (NOM-151). La tarjeta se mueve a «Archivado/En seguimiento», el expediente se integra como línea base, y el Plan de Acción activa el tablero de ejecución para la etapa de implementación. Reevaluación anual: la SRHDS agenda el siguiente diagnóstico tipo «reevaluación» y el IVOF se compara contra línea base.

---

# 8. Roles y permisos (adaptación de la matriz v1.0)

| Rol | Módulos y permisos clave |
|---|---|
| Coordinador SRHDS / Subsecretaría (SDFI) | Crear diagnósticos y mover tarjetas Kanban; validar R3/R4/R5; certificar resultados; tablero estatal; administrar versión del índice IVOH y cohortes del aula |
| Equipo de diagnóstico (SRHDS + Universidad + CIT) | Captura y revisión técnica de CAT, IIH, BHE, muestreo, bitácora; calificación IVOH; integración de reporte; requiere badge del aula (configurable) |
| Empresa (contraparte designada) | Cargar documentación básica; responder CAT; validar en R3/R4 (firma); consultar su expediente bajo NDA; no ve datos de otras empresas |
| Organismo Operador (COMAPA/JAD) | Observador/co-regulador: consulta condiciones particulares, resultados de descarga de su municipio; firma como co-regulador en R4/R5 cuando aplique |
| Directivo / observador | Lectura agregada, digests y tableros sin edición (patrón guardian) |
| Administrador institucional (PRODET/operador) | Configuración global, plantillas de formularios y del índice, «ver como rol», audit log |
| Alumno / participante del aula | Curso, ejercicios, examen, badge; participa en diagnósticos solo si está en el equipo asignado |
| Invitado externo | Un solo diagnóstico o curso, con vigencia y registro |

Permisos por fila: la empresa solo ve `diagnostics` y objetos donde sea miembro; la SRHDS ve todo el padrón; las universidades/CIT solo los diagnósticos de su equipo; los agregados estatales cruzan organizaciones solo anonimizados. Niveles de exposición documental (público/anonimizado/sintético/restringido NDA) se heredan a evidencias, reportes e indicadores.

---

# 9. Arquitectura técnica (conservada de la v1.0 + componentes MD-OHI)

**Base sin cambios.** Cliente web **React 18 + TypeScript + Vite + Tailwind** (una codebase, PWA offline-first: service worker + IndexedDB/Dexie con cola de sincronización y sellos de tiempo de captura vs. sincronización distinguibles); perímetro Cloudflare (DNS, CDN, WAF, Workers, Pages para landing, R2 para documentos cifrados con egress $0); núcleo Supabase (Postgres multi-tenant con `organization_id` + RLS, Auth con custom claims, Realtime para tableros, Edge Functions, Vault); FCM para notificaciones; firma NOM-151 vía PSC acreditado. Cifrado envelope AES-256-GCM (DEK por proyecto, KEK por organización fuera de la base), hash SHA-256, URLs prefirmadas, audit log append-only encadenado por hash. Estimación de infraestructura y límites de escala: los del capítulo 6 de la v1.0 (USD $50–70/mes escenario ~300 usuarios, a verificar contra precios vigentes).

**Componentes nuevos sobre la base:**

| Componente | Tipo | Responsabilidad |
|---|---|---|
| Importador/exportador XLSX (BHE e IIH) | Edge Function + librería de hojas de cálculo | Mapeo celda↔campo, validación de estructura oficial, generación de archivo idéntico; auditoría del mapeo en `audit_log` |
| Motor de cálculo hídrico | SQL (vistas materializadas + triggers) + validaciones en Edge Function | Totales, brecha, indicadores base, carga contaminante, dictámenes de cumplimiento por parámetro; regla de bloqueo si brecha > 10 % |
| Motor de rúbricas IVOH | Configuración versionada + Edge Function | Cálculo ponderado, semáforo, generación de la serie de la gráfica radial; bloqueo tras validación R4 |
| Generador de Reporte de Diagnóstico | Edge Function (maquetación → PDF) | Ensamblado del contenido mínimo §12 con anexos foliados; plantilla institucional versionada |
| Motor de evaluaciones del aula | Servicio dentro de Supabase | Banco de preguntas, aleatorización, calificación automática con retroalimentación, umbral de aprobación, badges Open Badges 3.0 |
| Motor de gates de fase | Edge Function transaccional | Aplicación de las reglas de transición de `diagnostics.fase_actual` contra estados de entregables |

**Tiempo real donde importa.** El Kanban de diagnósticos, el progreso del BHE (la «hoja 4 como tablero»), los dictámenes de laboratorio y las notificaciones de hitos (R1–R5, V1–V3) usan Realtime por canal de diagnóstico; el estado persistente siempre vive en Postgres. Modo offline-first crítico para V1–V3 (campo industrial con conectividad intermitente): cola de sincronización con resolución por campos, sellos de tiempo de captura y de sincronización distinguibles para preservar la regla «la bitácora se llena durante o inmediatamente después del evento».

**Seguridad y cumplimiento.** Sin cambios al esquema v1.0 (LFPDPPP/LGPDPPSO, derechos ARCO, aviso de privacidad, contratos responsable–encargado, NOM-151). Precisión v2.0: balances hídricos, planos, parámetros de proceso y resultados de laboratorio se clasifican por defecto como **restringidos con NDA** (nivel máximo) dentro del expediente de la empresa; solo datos agregados y anonimizados alimentan tableros estatales y contadores públicos.

---

# 10. Roadmap de implementación (ajuste del roadmap v1.0)

| Fase | Alcance | Referencia |
|---|---|---|
| Fase 0 — Fundación | Requisitos MD-OHI confirmados con la Subsecretaría; diseño UX/UI final de los módulos; migración de plantillas Excel a `form_templates` y catálogos; parametrización del índice IVOH v1.0 | Sin cambio respecto a v1.0 |
| Fase 1 — MVP MD-OHI | M1 empresas, M2 diagnósticos con gates, M3 documental con lista de cotejo, M4 CAT, M11 Kanban de diagnósticos, M10 bitácora, M12 aula con examen, notificaciones | Sustituye al MVP de la v1.0 (4–6 meses estimados) |
| Fase 2 — Piloto con 3 industrias ancla | M5 IIH, M6 BHE con importador Excel, M7 muestreo y cadena de custodia; corrección en caliente durante el piloto real de 6 semanas por planta | Sincronizado con el Programa Piloto |
| Fase 3 — Módulos avanzados | M8 IVOH completo con radial comparativo, M9 generador de reporte + Plan de Acción en Gantt + firma NOM-151, M13 tableros estatales y marcos ODS/ISO | Incluye firma NOM-151 y telemetría futura |
| Fase 4 — Escalamiento estatal | Multi-equipo de diagnóstico, cohortes del aula por generación, reevaluaciones anuales masivas, analítica agregada del padrón | Ritmo 2/5/8/10/11 plantas por año |

Criterio de salida del piloto: tres diagnósticos completados en plataforma con CAT, IIH, BHE (brecha documentada), cadenas de custodia, IVOH validado, reporte firmado y tarjetas movidas a «Archivado», con tiempos medios de validación por fase medidos en el tablero de adopción.

---

# 11. Criterios de aceptación verificables

1. **Alta de empresas y diagnósticos.** Se puede registrar una empresa, firmar convenio/NDA (NOM-151) y crear su diagnóstico con folio y cronograma de 6 semanas; la tarjeta aparece en el Kanban.
2. **Carga documental.** La empresa sube layout, planos hidrosanitarios y parámetros de calidad con la lista de cotejo; la validación en R1 bloquea el avance a la semana 2 si falta un requisito.
3. **CAT.** La contraparte responde las 8 secciones con guardado parcial, «No sé» trazable, evidencia por pregunta y firma; las dudas se canalizan a R2 y el estado pasa a «Validado en R2».
4. **IIH.** El inventario captura activos por etapa con folio no reutilizable y prioridad calculada; el resumen F5 se genera solo; la verificación en V1 marca folios con fotos.
5. **BHE.** La captura replica las 4 hojas de la plantilla; la brecha se calcula en vivo y >10 % bloquea la validación R3 y abre hallazgo; importar y exportar el Excel oficial es simétrico (mismos valores, misma estructura).
6. **Muestreo.** Sin cadena de custodia de tres transferencias firmadas no hay dictamen; los resultados se comparan contra NOM-001/002/003 y condiciones particulares.
7. **IVOH.** Solo se habilita con BHE validado; cada factor exige evidencia vinculada; el cálculo ponderado, semáforo y gráfica radial son automáticos; R4 bloquea la ficha; la ponderación solo cambia por versión aprobada.
8. **Reporte.** El generador produce el reporte con los 11 bloques del §12 y anexos A–F foliados, **solo cuando la matriz de completitud está 10/10 en verde** (CAT validado, documentación cotejada, IIH verificado, cadenas de custodia completas, BHE validado, laboratorio cargado, 8 fichas de bitácoras cerradas y firmadas, IVOH validado, cartera priorizada, fotos foliadas); el Plan de Acción se firma en R5 y queda como tablero de ejecución; toda corrección posterior genera versión nueva.
9. **Kanban.** La tarjeta-diagnóstico se mueve por las 6 columnas conforme a los gates; muestra semáforo de atraso, IVOH y checklist de entregable; WIP configurable.
10. **Aula.** El curso del Taller con 8 módulos se completa con ejercicios; el examen rápido se califica automáticamente con umbral configurable y emite badge; el badge puede ser requisito de asignación a diagnósticos.
11. **Trazabilidad.** Toda captura, validación, movimiento de tarjeta, firma y descarga queda en el audit log inmutable con hash; cualquier aprobación es verificable con su constancia NOM-151.
12. **Confidencialidad.** Los datos de cada empresa son invisibles para otras organizaciones (prueba RLS); los tableros estatales y contadores públicos solo muestran agregados anonimizados.
13. **Bitácora en línea.** Cada ficha (V1–V3, R1–R5) se llena en sesión con los apartados del formato oficial: identificación (responsable, fecha, horario, modalidad, lugar, folio BIT-), participantes con firma de asistencia, agenda precargada con resultados, hallazgos clasificados y vinculables a activos/factores, acuerdos con responsable y fecha, checklist de evidencia que exige folio real antes del cierre, y firmas elabora/revisa/valida con cierre en ≤ 24 h. Las fichas cerradas son inmutables (correcciones solo por control de cambios con versión anterior preservada); el registro fotográfico usa la convención de folios con clave de activo; y los datos de la bitácora (agendas, hallazgos, acuerdos, control de avance) prefabrican los apartados de Metodología aplicada, conclusiones y recomendaciones del Reporte de Diagnóstico sin re-captura.

---

# Anexo. Equivalencia plantillas oficiales ↔ entidades de plataforma

| Elemento oficial | Ubicación en plataforma |
|---|---|
| Manual MD-OHI §8, Tabla 4 (documentación básica) | M3, `document_checklist_items` + tipos documentales |
| Anexo A / Cuestionario CAT (secciones A–H) | M4, `form_templates` (JSON versionado) + `cat_responses` |
| Anexo B / Cadena de custodia (Tabla B1) | M7, `samples` + `custody_transfers` |
| Anexo C / Inventario (6 etapas × 20 columnas, hoja «Resumen y F5») | M5, `iih_assets` + vista resumen |
| Anexo D / BHE (hojas 1–4) | M6, `water_balances` + `balance_flows` + `quality_parameters` + `balance_indicators` |
| Manual §11, Tablas 7–10 (factores, rúbricas, semáforo, ejemplo) | M8, `ivoh_index_versions` + `ivoh_evaluations` + `ivoh_scores` |
| Manual §12 (contenido mínimo del reporte) y §13 (Plan de Acción y catálogo de acciones) | M9, generador de reporte + `alternatives` + `action_plans` |
| Manual §15 / cronograma de 6 semanas (Tabla 13) | M2 (fases y gates) + M11 (Kanban) + Gantt de diagnóstico |
| Bitácora (fichas V1–V3, R1–R5 con sus apartados y agendas precargadas; control de avance P/R/X; registro fotográfico foliado; control de cambios; cierre de bitácora) | M10, `logbook_entries` + `photo_log` + `logbook_progress` + `logbook_change_log` (extracción al reporte según 5.10.5) |
| Taller MD-OHI (8 módulos, ejercicios, reglas del juego) | M12, curso + `quiz_attempts` + badges |

**Cierre.** Con este rediseño, la plataforma HIDRIA deja de ser una suite de colaboración genérica y se convierte en el sistema operativo del Programa «Empresas Hídricamente Responsables»: la metodología MD-OHI —sus reglas, plazos, instrumentos y entregables— queda compilada en software, con trazabilidad auditable de extremo a extremo y la flexibilidad necesaria para comparar plantas, reevaluar anualmente y escalar a todo el padrón industrial del Estado.
