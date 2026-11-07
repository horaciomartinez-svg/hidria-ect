-- ============================================================================
-- HIDRIA · Plataforma MD-OHI — Catálogos semilla (idempotente: re-ejecutable)
-- Ejecutar DESPUÉS de 02-supabase_schema_hidria_mdohi.sql
-- ============================================================================

-- 0. Tenant principal (ajustar nombre si aplica)
insert into public.organizations (id, name, org_type) values
  ('00000000-0000-4000-8000-000000000001', 'Secretaría de Recursos Hidráulicos y Desarrollo Sustentable — Programa EHR', 'srhds')
on conflict (id) do nothing;

-- ============================================================================
-- 1. IIH — 6 etapas y tipos de activo precargados (~66)
-- ============================================================================
insert into public.iih_stages (code, nombre, orden) values
  ('CAP','Captación',1), ('ALM','Almacenamiento',2), ('TRA','Tratamiento',3),
  ('DIS','Distribución',4), ('USO','Uso y consumo',5), ('EVA','Evacuación',6)
on conflict (code) do nothing;

insert into public.iih_asset_types (stage_code, code, nombre) values
-- Captación
('CAP','CAP-01','Toma de red municipal'),
('CAP','CAP-02','Pozo de extracción'),
('CAP','CAP-03','Cárcamo de bombeo'),
('CAP','CAP-04','Bomba de extracción'),
('CAP','CAP-05','Macromedidor de entrada'),
('CAP','CAP-06','Medidor de pozo'),
('CAP','CAP-07','Válvula de control de entrada'),
('CAP','CAP-08','Captación pluvial (azotea/cuneta)'),
('CAP','CAP-09','Toma de agua residual tratada'),
('CAP','CAP-10','Registro de conexión / caja de válvulas'),
('CAP','CAP-11','Otro (captación)'),
-- Almacenamiento
('ALM','ALM-01','Tanque superficial'),
('ALM','ALM-02','Tanque elevado'),
('ALM','ALM-03','Cisterna'),
('ALM','ALM-04','Torre de almacenamiento'),
('ALM','ALM-05','Tanque de proceso'),
('ALM','ALM-06','Tanque de agua tratada'),
('ALM','ALM-07','Tanque de reserva contra incendio'),
('ALM','ALM-08','Tanque de regulación'),
('ALM','ALM-09','Tanque de condensado'),
('ALM','ALM-10','Sistema de control de nivel'),
('ALM','ALM-11','Otro (almacenamiento)'),
-- Tratamiento
('TRA','TRA-01','Filtro de medios'),
('TRA','TRA-02','Suavizador'),
('TRA','TRA-03','Planta de ósmosis inversa'),
('TRA','TRA-04','Sistema de desinfección (cloro/UV)'),
('TRA','TRA-05','Sistema de dosificación química'),
('TRA','TRA-06','PTAR — planta de tratamiento de aguas residuales'),
('TRA','TRA-07','Clarificador / sedimentador'),
('TRA','TRA-08','Sistema de aireación'),
('TRA','TRA-09','Manejo y espesamiento de lodos'),
('TRA','TRA-10','Tanque de contacto'),
('TRA','TRA-11','Otro (tratamiento)'),
-- Distribución
('DIS','DIS-01','Red de agua potable'),
('DIS','DIS-02','Red de proceso'),
('DIS','DIS-03','Red de reúso'),
('DIS','DIS-04','Bomba de presión'),
('DIS','DIS-05','Bomba de trasvase'),
('DIS','DIS-06','Medidor por área/proceso'),
('DIS','DIS-07','Válvula de control / reducción de presión'),
('DIS','DIS-08','Interconexión entre redes'),
('DIS','DIS-09','Red contra incendio / hidrantes'),
('DIS','DIS-10','Tablero de control de bombas'),
('DIS','DIS-11','Otro (distribución)'),
-- Uso y consumo
('USO','USO-01','Torre de enfriamiento'),
('USO','USO-02','Chiller'),
('USO','USO-03','Caldera'),
('USO','USO-04','Equipo de lavado (CIP, tinas)'),
('USO','USO-05','Línea de proceso que usa agua'),
('USO','USO-06','Sanitarios'),
('USO','USO-07','Regaderas'),
('USO','USO-08','Comedor / cocina'),
('USO','USO-09','Riego de áreas verdes'),
('USO','USO-10','Lavado general y limpieza'),
('USO','USO-11','Otro (uso y consumo)'),
-- Evacuación
('EVA','EVA-01','Descarga a alcantarillado'),
('EVA','EVA-02','Descarga a cuerpo receptor'),
('EVA','EVA-03','Cárcamo de drenaje'),
('EVA','EVA-04','Medidor de descarga'),
('EVA','EVA-05','Pozo de muestreo / registro'),
('EVA','EVA-06','Drenaje pluvial'),
('EVA','EVA-07','Sistema de evaporación'),
('EVA','EVA-08','Trampa de grasas'),
('EVA','EVA-09','Caja de registro de drenaje'),
('EVA','EVA-10','Sala de válvulas de descarga'),
('EVA','EVA-11','Otro (evacuación)')
on conflict (code) do nothing;

-- ============================================================================
-- 2. BHE — catálogo de flujos (espejo de la plantilla Excel)
-- ============================================================================
insert into public.balance_flow_catalog (code, grupo, nombre, orden) values
-- Entradas
('ENT-01','entrada','Red municipal',1),
('ENT-02','entrada','Pozo propio (núm. en comentario)',2),
('ENT-03','entrada','Agua pluvial captada',3),
('ENT-04','entrada','Agua residual tratada adquirida',4),
('ENT-05','entrada','Otras fuentes',5),
-- Destinos: consumos de proceso
('DST-01','consumo_proceso','Enfriamiento',10),
('DST-02','consumo_proceso','Calderas',11),
('DST-03','consumo_proceso','Lavados',12),
('DST-04','consumo_proceso','Agua incorporada al producto',13),
('DST-05','consumo_proceso','Otros usos de proceso',14),
-- Destinos: consumos generales
('DST-06','consumo_general','Sanitarios',20),
('DST-07','consumo_general','Regaderas',21),
('DST-08','consumo_general','Comedor',22),
('DST-09','consumo_general','Áreas verdes',23),
('DST-10','consumo_general','Limpieza',24),
-- Descargas y pérdidas
('DST-11','descarga','Descarga a alcantarillado',30),
('DST-12','descarga','Descarga a cuerpo receptor',31),
('DST-13','perdida','Pérdidas / agua no contabilizada',40),
-- Flujos circulares
('CIR-01','circular','Recirculación de torres de enfriamiento',50),
('CIR-02','circular','Recirculación de calderas (ciclos de concentración)',51),
('CIR-03','circular','Reúso interno',52),
('CIR-04','circular','Agua tratada reusada',53)
on conflict (code) do nothing;

-- 3. Parámetros de calidad (catálogo)
insert into public.quality_parameters_catalog (code, nombre, grupo, unidad_default) values
('TEMP','Temperatura','basico','°C'),
('PH','pH','basico','u.pH'),
('SST','Sólidos suspendidos totales','basico','mg/L'),
('SED','Sólidos sedimentables','basico','mL/L'),
('DBO5','DBO₅ (demanda bioquímica de oxígeno)','basico','mg/L'),
('DQO','DQO (demanda química de oxígeno)','basico','mg/L'),
('GYA','Grasas y aceites','basico','mg/L'),
('NT','Nitrógeno total','basico','mg/L'),
('PT','Fósforo total','basico','mg/L'),
('COLOR','Color verdadero','basico','UPC'),
('CF','Coliformes fecales','patogeno','NMP/100 mL'),
('HH','Huevos de helminto','patogeno','HUA/L'),
('METALES','Metales (As, Cd, Cu, Cr, Hg, Ni, Pb, Zn, cianuros)','metal','mg/L'),
('TOX','Toxicidad aguda','toxicidad','% dilución'),
('COND','Conductividad','reuso_proceso','µS/cm'),
('DUREZA','Dureza total','reuso_proceso','mg/L CaCO₃'),
('SDT','Sólidos disueltos totales','reuso_proceso','mg/L'),
('CLORUROS','Cloruros','reuso_proceso','mg/L'),
('ALCALINIDAD','Alcalinidad total','reuso_proceso','mg/L CaCO₃')
on conflict (code) do nothing;

-- ============================================================================
-- 4. IVOH — índice v1 (factores, pesos y rúbricas de calificación)
-- ============================================================================
insert into public.ivoh_index_versions (id, version, vigente, fecha_aprobacion) values
  ('00000000-0000-4000-8000-0000000000A1', 1, true, now())
on conflict (version) do nothing;

insert into public.ivoh_factors (version_id, factor_code, nombre, peso) values
('00000000-0000-4000-8000-0000000000A1','F1','Estrés hídrico del territorio',0.15),
('00000000-0000-4000-8000-0000000000A1','F2','Vulnerabilidad del abastecimiento',0.20),
('00000000-0000-4000-8000-0000000000A1','F3','Eficiencia en el uso del agua',0.20),
('00000000-0000-4000-8000-0000000000A1','F4','Potencial de reúso y circularidad',0.20),
('00000000-0000-4000-8000-0000000000A1','F5','Integridad de infraestructura',0.15),
('00000000-0000-4000-8000-0000000000A1','F6','Gobernanza hídrica',0.10)
on conflict (version_id, factor_code) do nothing;

insert into public.ivoh_rubrics (factor_code, nivel_min, nivel_max, etiqueta, descripcion) values
('F1',0,2,'Incipiente','Sin presión conocida sobre el recurso en la zona; estrés hídrico bajo o nulo según fuentes oficiales.'),
('F1',3,5,'Básico','Estrés hídrico moderado: la zona presenta presión hídrica documentada en alguna época del año.'),
('F1',6,8,'Consolidado','Estrés hídrico alto o muy alto de forma recurrente; competencia por el recurso documentada.'),
('F1',9,10,'Referente','Estrés hídrico crítico / sobreexplotación acuífero o cuenca cerrada; disponibilidad comprometida.'),
('F2',0,2,'Incipiente','Suministro exclusivo de red con presión estable; sin interrupciones ni contingencia reportada.'),
('F2',3,5,'Básico','Suministro principal estable con contingencias ocasionales; fuentes alternativas limitadas.'),
('F2',6,8,'Consolidado','Interrupciones frecuentes o presión deficiente; dependencia de una sola fuente sin respaldo.'),
('F2',9,10,'Referente','Suministro crítico: cortes prolongados, sin fuente alternativa, concesión vencida o en trámite.'),
('F3',0,2,'Incipiente','Sin medición de entrada ni por áreas; sin balance hídrico; consumo específico desconocido.'),
('F3',3,5,'Básico','Medición de entrada; balance incompleto o con brechas importantes; fugas sin estimar.'),
('F3',6,8,'Consolidado','Medición por áreas y balance que cierra o casi cierra; fugas estimadas y campañas de detección.'),
('F3',9,10,'Referente','Medición completa, balance validado sin brecha, consumo específico monitoreado y metas de reducción.'),
('F4',0,2,'Incipiente','Sin reúso ni recirculación; el agua se usa una sola vez y se descarga.'),
('F4',3,5,'Básico','Recirculación incidental (torres, calderas) sin gestión de ciclos de concentración.'),
('F4',6,8,'Consolidado','Reúso interno parcial y/o aprovechamiento pluvial con potencial medible de ampliación.'),
('F4',9,10,'Referente','Esquema circular con reúso por calidad, cascadas de uso y compra/venta de residual tratada.'),
('F5',0,2,'Incipiente','Infraestructura deficiente, sin respaldos y con fallas recurrentes que comprometen la continuidad.'),
('F5',3,5,'Básico','Estado regular; componentes críticos identificados pero sin plan de rehabilitación o reposición.'),
('F5',6,8,'Consolidado','Buen estado general; prioridades de intervención definidas desde el inventario verificado.'),
('F5',9,10,'Referente','Infraestructura robusta, redundante y con mantenimiento programado documentado.'),
('F6',0,2,'Incipiente','Sin responsable, presupuesto ni política del agua; decisiones reactivas.'),
('F6',3,5,'Básico','Responsable nombrado pero sin presupuesto ni capacitación sistemática.'),
('F6',6,8,'Consolidado','Responsable con presupuesto, capacitación y reporte de indicadores internos.'),
('F6',9,10,'Referente','Gobernanza integral: política, metas, indicadores reportados (ESG/ISO 46001) y compromiso directivo.')
on conflict (factor_code, nivel_min) do nothing;

-- ============================================================================
-- 5. Matriz de completitud del diagnóstico (gate de emisión, 10/10)
-- ============================================================================
insert into public.completeness_items (orden, nombre, verificado_en, modulo) values
(1,'Documentación básica validada (lista de cotejo)','R1','document_checklist_items'),
(2,'CAT validado','R2','diagnostics.cat_estado'),
(3,'IIH verificado en campo','V1','iih_assets.verificado_v1'),
(4,'Cadena de custodia completa (3 transferencias)','V2','custody_transfers'),
(5,'Balance hídrico validado','R3','water_balances.estado'),
(6,'Resultados de laboratorio cargados','R3','lab_results'),
(7,'Bitácoras completas y firmadas (V1–R5)','R5','logbook_entries'),
(8,'IVOH validado','R4','ivoh_evaluations.estado'),
(9,'Cartera de alternativas priorizada y validada','R4','alternatives.validado_r4'),
(10,'Registro fotográfico foliado completo','Semana 6','photo_log')
on conflict (orden) do nothing;

-- ============================================================================
-- 6. Bitácora — 8 plantillas de ficha (agenda + checklist de evidencia)
-- ============================================================================
insert into public.logbook_templates (clave, semana, tipo, titulo, duracion_horas, objetivo, asistentes_requeridos, agenda_items, evidence_items) values
('R1',1,'reunion','Reunión 1 — Presentación y solicitud de documentación',2.0,
 'Presentar al equipo y la metodología; obtener el compromiso de la alta dirección; validar la lista de cotejo de documentación básica.',
 'Dirección de la empresa · responsable de planta · equipo técnico del diagnóstico',
 '["Presentación del equipo y de la metodología MD-OHI","Compromiso de la dirección y designación de contraparte","Revisión de la lista de cotejo: documentos disponibles y faltantes","Acuerdos de entrega y calendario de visitas","Firma del acta R1"]'::jsonb,
 '["Acta R1 firmada","Lista de cotejo validada","Registro fotográfico de la reunión"]'::jsonb),

('V1',1,'visita','Visita 1 — Recorrido y verificación del IIH',3.0,
 'Recorrido por las 6 etapas (captación a evacuación); verificar en campo el Inventario de Infraestructura Hidráulica; toma fotográfica foliada.',
 'Responsable de planta · operador/a de agua · equipo técnico',
 '["Recorrido por captación y almacenamiento","Recorrido por tratamiento y distribución","Recorrido por uso/consumo y evacuación","Verificación de activos del IIH (folio por folio)","Cierre de visita y acuerdos"]'::jsonb,
 '["IIH verificado activo por activo","Registro fotográfico foliado (V1-nn · folio de activo)","Boceto del trazado si aplica"]'::jsonb),

('R2',2,'reunion','Reunión 2 — Validación del CAT',1.5,
 'Validar respuestas del Cuestionario de Análisis Técnico; resolver «No sé»; levantar tareas de campo pendientes.',
 'Contraparte técnica de la empresa · equipo técnico',
 '["Resolución de preguntas «No sé» del CAT","Aclaración de fuentes de abastecimiento y descarga","Tareas de campo pendientes","Validación del CAT (estado validado_r2)","Firma del acta R2"]'::jsonb,
 '["CAT validado en plataforma","Acta R2 firmada","Listado de tareas de campo"]'::jsonb),

('V2',3,'visita','Visita 2 — Medición y muestreo',4.0,
 'Toma de parámetros in situ; verificación del método de estimación de flujos del BHE; muestreo con cadena de custodia (Anexo B).',
 'Contraparte técnica · operador/a · personal de laboratorio',
 '["Verificación de fuentes de dato del balance (macromedidores, aforos)","Medición de parámetros in situ","Colecta de muestras con cadena de custodia (muestreo → entrega → recepción)","Entrega de guía del BHE","Cierre de visita y acuerdos"]'::jsonb,
 '["Formato de cadena de custodia firmado (3 etapas)","Registro de parámetros in situ","Fotos de puntos de muestreo y medición (V2-nn)","Guía del BHE entregada"]'::jsonb),

('R3',4,'reunion','Reunión 3 — Validación del Balance Hídrico Enriquecido',2.0,
 'Validar captura del BHE a 12 meses; revisar cierre del balance (brecha); cargar resultados de laboratorio y dictamen.',
 'Contraparte técnica · equipo técnico',
 '["Revisión de entradas, destinos y flujos circulares mes a mes","Análisis de la brecha del balance (si >10%: tarea pendiente)","Carga y dictamen de resultados de laboratorio","Validación del BHE (validado_r3)","Firma del acta R3"]'::jsonb,
 '["BHE validado en plataforma","Registro de parámetros de calidad","Acta R3 firmada"]'::jsonb),

('V3',5,'visita','Visita 3 — Levantamiento de alternativas',3.0,
 'Levantar y verificar en campo las alternativas de optimización; jerarquizar según cartera (Reducir…Repensar); estimar ahorros.',
 'Contraparte técnica · operación · equipo técnico',
 '["Verificación en campo de alternativas preliminares","Levantamiento de ahorros estimados (m³/año y financiero)","Jerarquización de la cartera (5R)","Acuerdos para el taller de priorización R4","Cierre de visita y acuerdos"]'::jsonb,
 '["Cartera de alternativas verificada en campo (verificado_v3)","Registro fotográfico (V3-nn)","Estimaciones de ahorro documentadas"]'::jsonb),

('R4',5,'reunion','Reunión 4 — Taller de priorización y IVOH',2.5,
 'Priorizar la cartera con la empresa; integrar y validar la calificación IVOH; construir el reporte de diagnóstico.',
 'Dirección y contraparte técnica · equipo del diagnóstico',
 '["Taller de priorización de alternativas (jerarquía y quick wins)","Integración de la calificación IVOH factor por factor","Validación del IVOH (validado_r4) y acuerdo del semáforo","Revisión del borrador del Reporte de Diagnóstico","Firma del acta R4"]'::jsonb,
 '["IVOH validado (semáforo acordado)","Cartera priorizada y validada","Acta R4 firmada"]'::jsonb),

('R5',6,'reunion','Reunión 5 — Presentación del Reporte y Plan de Acción',2.0,
 'Presentar el Reporte de Diagnóstico; acordar el Plan de Acción con responsables y fechas; firma de ambos documentos.',
 'Dirección de la empresa · contraparte · equipo del diagnóstico · SRHDS',
 '["Presentación del Reporte de Diagnóstico (hallazgos, IVOH, brecha)","Acuerdo del Plan de Acción (acciones, responsables, fechas, indicadores)","Compromisos de seguimiento","Firma del Reporte y del Plan (NOM-151)","Cierre del diagnóstico"]'::jsonb,
 '["Reporte de Diagnóstico firmado (NOM-151)","Plan de Acción firmado","Acta R5 firmada"]'::jsonb)
on conflict (clave) do nothing;

-- ============================================================================
-- 7. CAT — Cuestionario de Análisis Técnico (Anexo A, 47 preguntas)
--    tipo: abierta | breve | opcion_unica | multiple
-- ============================================================================
insert into public.cat_items (version, seccion, codigo, enunciado, tipo, opciones, ayuda, admite_evidencia, orden) values
-- Sección A — Generalidades de la empresa (6)
('A1-v1','A','A1','Razón social de la empresa', 'abierta', null, 'Identificación del expediente', false, 1),
('A1-v1','A','A2','Nombre del responsable del contacto y su cargo', 'abierta', null, 'Contraparte del diagnóstico', false, 2),
('A1-v1','A','A3','¿En qué tipo de operación se enfoca la empresa?', 'opcion_unica', '["manufacturera","maquiladora","termoelectrica","alimentos_bebidas","otra"]', 'Clasificación del giro', false, 3),
('A1-v1','A','A4','¿Cuántos empleados tiene y en cuántos turnos opera?', 'breve', null, 'Estimación de usos generales (sanitarios, regaderas, comedor)', false, 4),
('A1-v1','A','A5','¿Cuántas horas diarias opera el proceso principal?', 'breve', null, 'Base del factor de carga contaminante', false, 5),
('A1-v1','A','A6','¿Cuál es su unidad de producción y producción mensual promedio?', 'breve', null, 'Base del consumo específico (indicador clave del balance)', false, 6),
-- Sección B — Fuentes de abastecimiento (7)
('A1-v1','B','B1','¿De dónde proviene el agua que utiliza?', 'multiple', '["red_municipal","pozo","pipas","pluvial","residual_tratada","otra"]', 'Define entradas del balance (F2)', true, 7),
('A1-v1','B','B2','¿Cuál es la situación de la concesión o asignación de la fuente principal?', 'opcion_unica', '["vigente_con_volumen","en_tramite","sin_concesion","no_sabe","na"]', 'Riesgo jurídico del abastecimiento (F2/F6)', true, 8),
('A1-v1','B','B3','¿Qué volumen mensual promedio consume? (m³)', 'breve', null, 'Cifra de referencia para el balance', false, 9),
('A1-v1','B','B4','¿Cómo mide el agua que entra a la planta?', 'opcion_unica', '["macromedidor","medidor_por_area","sin_medidor","no_sabe"]', 'Medición de entrada (F3)', false, 10),
('A1-v1','B','B5','¿Ha tenido interrupciones en el suministro en los últimos 12 meses?', 'opcion_unica', '["frecuentes","ocasionales","raras","nunca"]', 'Vulnerabilidad del abastecimiento (F2)', false, 11),
('A1-v1','B','B6','¿Qué le preocupa más de la disponibilidad del agua?', 'abierta', null, 'Contexto para F1/F2', false, 12),
('A1-v1','B','B7','¿Conoce el nivel de estrés hídrico de su zona?', 'opcion_unica', '["si","no","solo_por_noticias"]', 'F1 — estrés hídrico del territorio', false, 13),
-- Sección C — Usos y consumo de agua (7)
('A1-v1','C','C1','¿Para qué usa el agua dentro de la planta?', 'multiple', '["enfriamiento","calderas","lavado","producto","sanitarios","areas_verdes","limpieza","otro"]', 'Define destinos del balance (F3)', true, 14),
('A1-v1','C','C2','¿Mide el agua por área o proceso?', 'opcion_unica', '["todas","algunas","ninguna","no_sabe"]', 'Medición por áreas (F3)', false, 15),
('A1-v1','C','C3','¿Con qué frecuencia registra los consumos?', 'opcion_unica', '["diario","semanal","mensual","no_registra"]', 'Frecuencia de registro (F3/F6)', false, 16),
('A1-v1','C','C4','¿Conoce su consumo específico (agua por unidad producida)?', 'breve', null, 'Indicador de eficiencia (F3)', false, 17),
('A1-v1','C','C5','¿Ha realizado campañas de detección de fugas en los últimos 2 años?', 'opcion_unica', '["si","no","no_recuerda"]', 'Gestión de pérdidas (F3/F5)', false, 18),
('A1-v1','C','C6','¿Tiene estimada la proporción de agua que se pierde?', 'opcion_unica', '["ninguna","menor_5","5_a_10","10_a_20","mayor_20","no_sabe"]', 'Brecha del balance (F3)', false, 19),
('A1-v1','C','C7','¿Dónde identifica los mayores desperdicios de agua?', 'abierta', null, 'Hallazgo candidato para la cartera de alternativas', false, 20),
-- Sección D — Descargas y disposición final (8)
('A1-v1','D','D1','¿A dónde descarga el agua residual?', 'multiple', '["alcantarillado","cuerpo_receptor","reuso_interno","evaporacion","gestor","otro"]', 'Define destinos de descarga del balance (F4)', true, 21),
('A1-v1','D','D2','¿Cuenta con permiso o convenio de descarga vigente?', 'opcion_unica', '["vigente","en_tramite","vencido","sin_permiso","no_sabe"]', 'Riesgo regulatorio (F6)', true, 22),
('A1-v1','D','D3','¿El organismo operador le ha establecido condiciones particulares de descarga?', 'opcion_unica', '["si","no","no_sabe"]', 'Define la norma de referencia del laboratorio', false, 23),
('A1-v1','D','D4','¿Cuenta con planta de tratamiento de aguas residuales propia?', 'opcion_unica', '["si","no","parcial"]', 'F4 — potencial de circularidad', true, 24),
('A1-v1','D','D5','Si tiene PTAR, describa el tren de tratamiento', 'abierta', null, 'Solo si D4 = si/parcial', false, 25),
('A1-v1','D','D6','¿Ha realizado análisis de laboratorio de sus descargas en los últimos 12 meses?', 'opcion_unica', '["si_trimestral","si_anual","solo_una_vez","no"]', 'Cumplimiento y línea base (F6)', true, 26),
('A1-v1','D','D7','¿Qué parámetros de calidad exige su proceso o su descarga?', 'abierta', null, 'Define el paquete de parámetros del muestreo V2', false, 27),
('A1-v1','D','D8','¿Ha tenido problemas por descargas (multas, reclamos, contingencias)?', 'abierta', null, 'Riesgos identificados (G1)', false, 28),
-- Sección E — Reúso y aprovechamiento (6)
('A1-v1','E','E1','¿Reutiliza agua actualmente?', 'opcion_unica', '["si","no","solo_recirculacion"]', 'F4 — potencial de reúso', false, 29),
('A1-v1','E','E2','Si reutiliza, ¿en qué procesos?', 'abierta', null, 'Solo si E1 = si', false, 30),
('A1-v1','E','E3','¿Qué usos aceptarían operar con agua reusada?', 'multiple', '["enfriamiento","calderas","lavado","areas_verdes","limpieza","ninguno"]', 'Barreras y potencial de reúso (F4)', false, 31),
('A1-v1','E','E4','¿Aprovecha agua pluvial?', 'opcion_unica', '["si","no","interesado"]', 'F4', false, 32),
('A1-v1','E','E5','¿Estaría dispuesta a comprar agua residual tratada de terceros?', 'opcion_unica', '["si","depende_calidad","no","no_sabe"]', 'Esquema circular interempresas (F4)', false, 33),
('A1-v1','E','E6','¿Qué le impide reutilizar más agua?', 'multiple', '["calidad","costo","espacio","regulacion","desconocimiento","otro"]', 'Barreras de reúso (F4/F6)', false, 34),
-- Sección F — Gestión y gobernanza del agua (6)
('A1-v1','F','F1','¿Existe un responsable del agua en la empresa?', 'opcion_unica', '["dedicado","parcial","ninguno"]', 'F6 — gobernanza', false, 35),
('A1-v1','F','F2','¿Existe presupuesto asignado para temas de agua?', 'opcion_unica', '["si","parcial","no"]', 'F6', false, 36),
('A1-v1','F','F3','¿Ha capacitado al personal en uso eficiente del agua?', 'opcion_unica', '["si_frecuente","alguna_vez","nunca"]', 'F6', false, 37),
('A1-v1','F','F4','¿Tiene metas de reducción de consumo de agua?', 'opcion_unica', '["si_medible","si_generales","no"]', 'F3/F6', false, 38),
('A1-v1','F','F5','¿Reporta indicadores de agua (informes anuales, ESG, certificaciones)?', 'opcion_unica', '["si_publico","si_interno","no"]', 'F6 — gobernanza', false, 39),
('A1-v1','F','F6','¿Cuenta con certificaciones ambientales o de gestión de agua?', 'multiple', '["iso_14001","iso_46001","industria_limpia","esr","ninguna","otra"]', 'Contexto de madurez (F6)', false, 40),
-- Sección G — Riesgos y continuidad (4)
('A1-v1','G','G1','¿Ha identificado riesgos hídricos para su operación?', 'opcion_unica', '["si_formalmente","de_forma_general","no"]', 'Gestión de riesgo (F1/F2)', false, 41),
('A1-v1','G','G2','¿Cuenta con plan de contingencia ante contingencias hídricas?', 'opcion_unica', '["si","no","en_desarrollo"]', 'Continuidad operativa (F2/F6)', false, 42),
('A1-v1','G','G3','¿Cuál es el riesgo hídrico más relevante para su operación?', 'abierta', null, 'Hallazgo para el reporte', false, 43),
('A1-v1','G','G4','¿Qué autonomía de almacenamiento tiene (días de operación)?', 'opcion_unica', '["menor_1","1_a_3","3_a_7","mayor_7","sin_almacenamiento"]', 'Resiliencia del abastecimiento (F2/F5)', false, 44),
-- Sección H — Documentación y observaciones (3)
('A1-v1','H','H1','¿Qué documentación entregó con este cuestionario?', 'multiple', '["layout","planos","parametros_calidad","concesion","permiso_descarga","iih","balance_basico","recibos","ninguna"]', 'Debe coincidir con la lista de cotejo R1', true, 45),
('A1-v1','H','H2','¿Existe información adicional relevante que deba considerarse?', 'abierta', null, 'Cualquier insumo para el diagnóstico', false, 46),
('A1-v1','H','H3','Observaciones generales', 'abierta', null, 'Libre', false, 47)
on conflict (version, codigo) do nothing;

-- ============================================================================
-- 8. Aula — módulos del taller y banco de examen
-- ============================================================================
insert into public.course_modules (orden, titulo, materiales) values
(1,'Introducción a la metodología MD-OHI y al Programa EHR','["presentacion_mod1","guia_rapida","video_intro"]'),
(2,'Lista de cotejo y documentación básica','["presentacion_mod2","plantilla_cotejo"]'),
(3,'Cuestionario de Análisis Técnico (CAT)','["presentacion_mod3","anexo_a"]'),
(4,'Inventario de Infraestructura Hidráulica (IIH)','["presentacion_mod4","anexo_c","plantilla_iih"]'),
(5,'Balance Hídrico Enriquecido (BHE)','["presentacion_mod5","anexo_d","plantilla_bhe"]'),
(6,'Muestreo y cadena de custodia','["presentacion_mod6","anexo_b"]'),
(7,'Índice de Viabilidad de Optimización Hídrica (IVOH)','["presentacion_mod7","tabla_rubricas"]'),
(8,'Reporte de Diagnóstico y Plan de Acción','["presentacion_mod8","ejemplo_reporte"]')
on conflict (orden) do nothing;

insert into public.quiz_questions (module_orden, pregunta, opciones, correcta, retroalimentacion) values
(1,'¿Cuál es la duración estándar del diagnóstico MD-OHI?', '["4 semanas","6 semanas","8 semanas","12 semanas"]', 1, 'El diagnóstico dura 6 semanas naturales, con 3 visitas y 5 reuniones.'),
(1,'¿Qué organizaciones integran el equipo del diagnóstico (Triple Hélice)?', '["Solo gobierno y empresa","Gobierno, universidades y centros de innovación tecnológica","Solo universidades","Empresa y laboratorio"]', 1, 'El equipo reúne SRHDS, universidades y CIT en coordinación con la empresa.'),
(2,'¿Dónde se valida la lista de cotejo de documentación básica?', '["R2","V1","R1","R3"]', 2, 'La lista de cotejo se valida en la Reunión 1 (R1), al inicio del diagnóstico.'),
(2,'¿Cuál de estos NO es parte de la documentación básica?', '["Layout","Planos de instalaciones hidráulicas","Estados financieros auditados","Parámetros de calidad de agua para proceso"]', 2, 'La documentación básica es técnica: layout, planos, parámetros de calidad, inventario, balance básico y soportes.'),
(3,'¿Cuándo se valida el CAT?', '["R1","R2","R3","R4"]', 1, 'El CAT se valida en la Reunión 2 (R2); en R1 solo se solicita documentación.'),
(3,'Las respuestas «No sé» del CAT…', '["Se omiten","Son tarea de campo obligatoria a resolver antes de cerrar el diagnóstico","Se penalizan en el IVOH","Se reemplazan por NA"]', 1, 'Todo «No sé» queda registrado como tarea de campo por resolver (trazabilidad completa).'),
(4,'¿Cuántas etapas tiene el Inventario de Infraestructura Hidráulica?', '["4","5","6","8"]', 2, '6 etapas: captación, almacenamiento, tratamiento, distribución, uso y consumo, evacuación.'),
(4,'¿Qué significa un activo foliado como USO-03?', '["Es el tercer activo de la etapa de uso y consumo","Es la tercera visita","Es el tercer balance","Es un parámetro de calidad"]', 0, 'El folio concatena el código de etapa (USO) con un correlativo por diagnóstico.'),
(5,'¿Sobre cuántos meses se construye el Balance Hídrico Enriquecido?', '["3","6","12","24"]', 2, '12 meses consecutivos, alineados al periodo de producción.'),
(5,'¿Qué indica una brecha mayor al 10 % en el balance?', '["Que el balance está validado","Que el balance no cierra: es una tarea pendiente, no un dato","Que hay que descartar la empresa","Que el IVOH sube de nivel"]', 1, 'La brecha >10 % bloquea la validación en R3 y se registra como hallazgo/tarea pendiente.'),
(6,'¿Cuántas transferencias firmadas requiere la cadena de custodia?', '["1","2","3","4"]', 2, 'Muestreo, entrega y recepción: sin las 3 firmas no hay dictamen de laboratorio.'),
(7,'¿Cuál es la fórmula del IVOH?', '["Promedio simple de 6 factores","Suma ponderada de 6 factores (pesos 0.15/0.20/0.20/0.20/0.15/0.10)","Producto de los factores","El menor puntaje de los 6 factores"]', 1, 'IVOH = 0.15F1 + 0.20F2 + 0.20F3 + 0.20F4 + 0.15F5 + 0.10F6.'),
(7,'Un IVOH de 8.4 significa…', '["Viabilidad inicial (rojo)","Viabilidad media (amarillo)","Alta viabilidad (verde), candidata a Empresa Hídricamente Responsable","Diagnóstico inválido"]', 2, 'Semáforo: <5 rojo, 5–7.9 amarillo, ≥8 verde.'),
(8,'¿Cuándo se puede emitir el Reporte de Diagnóstico?', '["Al terminar el CAT","Cuando la matriz de completitud marca 10 de 10","Cuando el IVOH es verde","Al firmar el convenio"]', 1, 'El reporte se genera solo cuando los 10 prerrequisitos de la matriz de completitud están cumplidos.')
on conflict do nothing;

-- ============================================================================
-- FIN DE CATÁLOGOS SEMILLA
-- ============================================================================
