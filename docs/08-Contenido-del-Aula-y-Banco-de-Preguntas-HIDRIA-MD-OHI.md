# HIDRIA — Contenido del Aula MD-OHI y banco de preguntas

## Documento v1.0 — Ecosistema de Circularidad Tecnológica (ECT)

---

# 0. Control del documento

| Campo | Valor |
|---|---|
| Documento | HIDRIA — Contenido del aula y banco de preguntas (ítem 7 del roadmap) |
| Versión | 1.0 |
| Fecha | 2026-11-08 |
| Dependencias | `Arquitectura HIDRIA-ECT con MD-OHI v2.0.md` (§5.12 M12); `03-seed_catalogos.sql` (semilla inicial del aula, que este documento sustituye como versión canónica); `04-Contratos-API-y-Tablas-de-Decision-HIDRIA-MD-OHI.md` (EF-11, TD-7); `05-Plan-de-Pruebas-HIDRIA-MD-OHI.md` (AUL-01…03); `06-Gobernanza-y-Privacidad-HIDRIA-MD-OHI.md` (banco protegido: `v_quiz_questions`, administración por `service_role`) |
| Audiencia | Coordinación SDFI · UCI (equipo académico) · equipo de agentes de IA / desarrollo |
| Alcance | Estructura canónica del curso «Taller MD-OHI», desarrollo de los 8 módulos (video, materiales, ejercicio, autoevaluación), especificación del examen final, banco de preguntas completo, insignia Open Badges 3.0 y reglas de carga/administración |

---

# 1. Modelo pedagógico y modelo de datos

## 1.1 Espíritu del Taller (arquitectura §5.12)

El curso reproduce en línea el **Taller MD-OHI de 90 minutos**: cada módulo es una unidad con **(a)** video/materiales, **(b)** un ejercicio corto interactivo (mismo espíritu del Taller presencial: «un ejercicio corto después de cada ejemplo») y **(c)** un cuestionario de autoevaluación. La evaluación sumativa es el **examen final**, calificado en servidor (EF-11) con umbral de aprobación **≥ 80 %** (TD-7) e insignia **Open Badges 3.0**.

## 1.2 Tablas implicadas (fuente de verdad: `02`)

| Tabla | Uso | Quién escribe |
|---|---|---|
| `course_modules` (orden, titulo, materiales jsonb) | Unidades del curso | `service_role` (panel admin / migración) |
| `quiz_questions` (module_orden, pregunta, opciones, correcta, retroalimentacion) | Banco: autoevaluaciones (module_orden 1–8) y examen (module_orden 0 = pool) | `service_role` — **nunca** el cliente (revoke, doc `06`) |
| `quiz_attempts` | Intentos y calificación | EF-11 inserta; el titular lee los propios |
| `v_quiz_questions` | Lectura segura (sin `correcta`) | Todos los autenticados |

Convención adoptada en este documento: **`module_orden = 0` identifica el pool del examen final**; 1–8 las autoevaluaciones de cada módulo.

## 1.3 Materiales: archivos oficiales del Programa

Los identificadores `materiales` referencian objetos en R2 (bucket `hidria-docs/aula/`) que ya existen en el expediente del Programa:

| ID | Archivo de origen |
|---|---|
| `manual_mdohi` | Manual de la Metodología de Diagnóstico para la Optimización Hídrica Industrial (oct. 2026) |
| `proceso_atencion` | Proceso de Atención Empresarial — Empresas Hídricamente Responsables |
| `anexo_a_cat` | Instructivo de Trabajo — Cuestionario de Análisis Técnico (Anexo A) |
| `anexo_b_muestreo` | Instructivo de Trabajo — Muestreo y cadena de custodia (Anexo B) |
| `anexo_c_iih` | Instructivo de Trabajo — Inventario de Infraestructura Hidráulica (Anexo C) |
| `anexo_d_bhe` | Instructivo de Trabajo — Balance Hídrico Enriquecido (Anexo D) |
| `plantilla_cat` | Cuestionario CAT (plantilla de captura) |
| `plantilla_bhe` | Balance Hídrico Enriquecido — Plantilla de Captura (XLSX) |
| `plantilla_iih` | Plantilla de captura IIH |
| `rubricas_ivoh` | Herramienta de Calificación IVOH (XLSX) |
| `presentaciones_taller` | Presentaciones del Taller MD-OHI (8 módulos) |
| `ejemplo_reporte` | Reporte de Diagnóstico (ejemplo anonimizado del piloto) |
| `bitacora_formato` | Formato oficial de Bitácora de Trabajo |

Los **videos** se producen como cortes por módulo (guion base en §3 de cada módulo; duración 6–10 min); se alojan en `hidria-docs/aula/video_modN.mp4` con URL de streaming por Pages (no pública).

---

# 2. Estructura canónica del curso «Taller MD-OHI»

Sustituye la lista de `course_modules` sembrada en `03` (que seguía los instrumentos); la versión canónica es esta, alineada con la arquitectura §5.12:

| Módulo | Título | Duración video | Materiales | Ejercicio | Autoeval |
|---|---|---|---|---|---|
| 1 | Los tres productos del diagnóstico | 8 min | `manual_mdohi` §1–5, `proceso_atencion`, `presentaciones_taller` m1 | 1 (identificar productos) | 2 preguntas |
| 2 | La ruta de 6 semanas y sus entregables | 9 min | `manual_mdohi` §6–7, `bitacora_formato`, `presentaciones_taller` m2 | 2 (secuenciar hitos) | 2 preguntas |
| 3 | Semana por semana: qué se hace y qué se valida | 12 min | `manual_mdohi` §15, `presentaciones_taller` m3 | 3 (emparejar semana–validación) | 3 preguntas |
| 4 | Ejemplo 1 · Inventario de Infraestructura Hidráulica | 10 min | `anexo_c_iih`, `plantilla_iih`, `presentaciones_taller` m4 | 4 (foliar activos) | 2 preguntas |
| 5 | Ejemplo 2 · Balance Hídrico Enriquecido | 12 min | `anexo_d_bhe`, `plantilla_bhe`, `presentaciones_taller` m5 | 5 (detectar brecha) | 3 preguntas |
| 6 | Ejemplo 3 · Calificación IVOH y semáforo | 10 min | `rubricas_ivoh`, `manual_mdohi` §IVOH, `presentaciones_taller` m6 | 6 (calcular IVOH) | 3 preguntas |
| 7 | Ejercicios guiados por estación (campo) | 15 min | `anexo_a_cat`, `anexo_b_muestreo`, `plantilla_cat`, `presentaciones_taller` m7 | 7 (custodia + CAT) | 2 preguntas |
| 8 | Cierre: errores frecuentes y próximos pasos | 8 min | `ejemplo_reporte`, `manual_mdohi` §12, `proceso_atencion`, `presentaciones_taller` m8 | 8 (matriz 10/10) | 2 preguntas |
| — | **Examen final** (pool `module_orden=0`) | 30 min, sin materiales | — | — | 10 de 24 |

Progreso del alumno: módulo «completado» = video visto (evento) + ejercicio enviado + autoeval contestada; el examen se habilita al completar los 8 módulos (regla del cliente; EF-11 no la exige en MVP).

---

# 3. Desarrollo por módulo

## Módulo 1 — Los tres productos del diagnóstico

- **Objetivo**: que el participante identifique los tres productos del diagnóstico MD-OHI y qué resuelve cada uno para la empresa.
- **Guion del video**: (1) qué es la optimización hídrica industrial y por qué el Programa existe (contexto estatal); (2) Producto 1 — **diagnóstico técnico**: CAT, IIH, BHE, muestreo (el estado actual del agua en la planta); (3) Producto 2 — **calificación IVOH** con semáforo (qué tan viable es optimizar); (4) Producto 3 — **Reporte de Diagnóstico y Plan de Acción** (ruta de medidas con ahorros); (5) qué gana la empresa: ahorro, cumplimiento, reconocimiento EHR.
- **Ejercicio corto (interactivo)**: se presenta el caso «Lácteos del Norte» en tres tarjetas (a: inventario de 42 activos hidráulicos; b: IVOH 8.4 verde; c: plan con 12 medidas y ahorro estimado 31,000 m³/año). El participante arrastra cada tarjeta al producto correspondiente. **Solución**: a→Diagnóstico técnico; b→Calificación IVOH; c→Reporte y Plan de Acción. Retroalimentación inmediata por tarjeta.
- **Autoevaluación**:
  1. *¿Cuáles son los tres productos del diagnóstico MD-OHI?* — a) CAT, IIH y BHE · b) **Diagnóstico técnico, calificación IVOH, y Reporte con Plan de Acción** · c) Balance, muestreo y reporte · d) Convenio, diagnóstico y constancia. **(correcta: b)** — *Los instrumentos (CAT, IIH, BHE) son partes del producto 1; los productos son los tres entregables al titular de la empresa.*
  2. *¿Qué representa el semáforo del IVOH?* — a) El cumplimiento de NOM-001 · b) **El nivel de viabilidad de optimización** · c) La calidad del agua · d) El avance del equipo. **(correcta: b)** — *Rojo <5, amarillo 5–7.9, verde ≥8: qué tan viable es optimizar, no cumplimiento ni calidad.*

## Módulo 2 — La ruta de 6 semanas y sus entregables

- **Objetivo**: dominar la secuencia de visitas (V1–V3), reuniones (R1–R5) y el entregable verificable de cada semana.
- **Guion del video**: línea de tiempo de 6 semanas; qué pasa en cada hito; rol de la Triple Hélice (SDFI/UCI/empresa); la regla de oro: **un diagnóstico no avanza de fase sin su entregable verificable** (los gates de la plataforma); reprogramación con justificación documentada.
- **Ejercicio corto**: línea de tiempo desordenada con 8 eventos (alta y convenio; R1 lista de cotejo; V1 verificación IIH; R2 validación CAT; V2 levantamiento alternativas; R3 validación BHE; R4 validación IVOH; R5 plan de acción + reporte). El participante ordena y asigna cada evento a su semana (S1…S6). **Solución**: alta+R1→S1; R2→S2; V1→S3; R3+V2→S4; R4→S5; R5+reporte→S6. (El orden exacto se ajusta al Manual §6–7 vigente.)
- **Autoevaluación**:
  1. *¿Cuántas visitas técnicas y cuántas reuniones de validación tiene el diagnóstico?* — a) 2 y 4 · b) **3 visitas (V1–V3) y 5 reuniones (R1–R5)** · c) 5 y 3 · d) 6 y 6. **(correcta: b)**
  2. *¿Qué condición debe cumplirse para que el diagnóstico avance de fase en la plataforma?* — a) Que pase el tiempo de la semana · b) Que la empresa lo solicite · c) **Que el entregable verificable de la fase esté cerrado y validado** · d) Que el IVOH sea verde. **(correcta: c)** — *La plataforma bloquea el avance si el gate no está cumplido (TD-1).*

## Módulo 3 — Semana por semana: qué se hace y qué se valida

- **Objetivo**: conocer las actividades y responsables semana a semana, y qué queda foliado en bitácora.
- **Guion del video**: recorrido semana a semana con la «checklist de la semana» del Kanban (vista en vivo de la plataforma); captura de bitácora durante o inmediatamente después de cada evento; reprogramación sin salirse de las 6 semanas.
- **Ejercicio corto**: tabla de 6 filas (semana) × 3 columnas (qué se hace / qué se valida / folio que queda). El participante completa las celdas arrastrando frases. **Solución** (resumen): S1 alta, R1 cotejo→valida documentación básica→BIT-R1; S2 CAT→valida CAT→BIT-R2; S3 V1→verifica IIH→BIT-V1; S4 BHE+R3, V2→valida balance, alternativas→BIT-R3/BIT-V2; S5 IVOH+R4, muestreo→valida IVOH→BIT-R4; S6 R5→plan de acción y emite reporte→BIT-R5 + folio `-R1`.
- **Autoevaluación**:
  1. *¿En qué semana se valida el CAT y ante quién?* — a) S1 ante SDFI · b) **S2, en R2** · c) S3 en V1 · d) S5 en R4. **(correcta: b)**
  2. *La bitácora se llena…* — a) Al final del diagnóstico, de memoria · b) **Durante o inmediatamente después de cada evento** · c) Solo si hay incidentes · d) La llena solo la empresa. **(correcta: b)** — *Regla metodológica: la ficha se cierra en ≤24 h o con justificación (TD-8).*
  3. *Si un hito se retrasa por causa de la empresa…* — a) Se abandona el diagnóstico · b) Se avanza igual · c) **Se reprograma con justificación documentada, conservando la fecha original** · d) Se reinicia el conteo de semanas. **(correcta: c)** — *EF-12: el hallazgo conserva fecha original y nueva; semáforo de atraso.*

## Módulo 4 — Ejemplo 1 · Inventario de Infraestructura Hidráulica

- **Objetivo**: saber levantar el IIH por etapas y foliar activos (USO-01…), verificándolos en V1.
- **Guion del video**: las 6 etapas (captación, almacenamiento, tratamiento, distribución, uso y consumo, evacuación); cómo se recorre la planta; qué se fotografía (folio `V1-nn`); verificación V1 y consecuencias de activos sin verificar (bloqueo del gate F4).
- **Ejercicio corto**: mini-plano con 8 íconos de activos (pozo, cisterna, suavizador, bomba, red, tanque de proceso, lavadora de tambores, descarga). El participante asigna cada uno a su etapa y folio (CA-01, AL-01, TR-01, DI-01, USO-01…). **Solución**: pozo→captación CA-01; cisterna→almacenamiento AL-01; suavizador→tratamiento TR-01; bomba/red→distribución DI-01/DI-02; tanque de proceso/lavadora→uso y consumo USO-01/USO-02; descarga→evacuación EV-01.
- **Autoevaluación**:
  1. *¿Cuáles son las etapas del IIH?* — a) 4 · b) 5 · c) **6: captación, almacenamiento, tratamiento, distribución, uso y consumo, evacuación** · d) 8. **(correcta: c)**
  2. *¿Qué pasa si un activo queda sin verificar en V1?* — a) Nada, se anota en el reporte · b) **El diagnóstico no avanza a fase 4 hasta verificarlo** · c) Se elimina del inventario · d) Baja el IVOH 1 punto. **(correcta: b)** — *Gate F4 (TD-1#3, trigger en la base).*

## Módulo 5 — Ejemplo 2 · Balance Hídrico Enriquecido

- **Objetivo**: construir el BHE de 12 meses, calcular la brecha y aplicar la regla de bloqueo >10 %.
- **Guion del video**: flujos de entrada (captación, red municipal, pozo…) y destinos (proceso, servicios, jardines, reúso, descarga, pérdidas); fórmula de la brecha; la frase regla: **«un balance que no cierra no es un dato, es una tarea pendiente»**; validación en R3 y qué se corrige (nunca se fuerza el número).
- **Ejercicio corto**: tabla de 12 meses con entradas y destinos; julio tiene brecha 12.6 %. El participante (1) calcula la brecha de julio, (2) decide si el balance es validable en R3, (3) indica qué hacer. **Solución**: (1) brecha = (entradas − destinos − pérdidas)/entradas = 12.6 %; (2) **no validable** (>10 %); (3) corregir flujos de julio (medir de nuevo, revisar recibos y producción) y reintentar — el gate es reintentable sin penalización (BHE-03).
- **Autoevaluación**:
  1. *¿Sobre qué periodo se construye el BHE?* — a) 3 meses · b) 6 · c) **12 meses consecutivos** · d) El último año fiscal. **(correcta: c)**
  2. *¿Qué ocurre con la validación R3 si un mes tiene brecha >10 %?* — a) Se valida con observación · b) **Se bloquea la validación hasta corregir el balance** · c) Se descarta ese mes · d) Se promedia con los demás. **(correcta: b)** — *La plataforma responde 409 GATE_BHE_BRECHA con el detalle por mes.*
  3. *La brecha del balance representa…* — a) El agua reciclada · b) **La diferencia no explicada entre entradas y destinos** · c) Las pérdidas por evaporación únicamente · d) El consumo de proceso. **(correcta: b)**

## Módulo 6 — Ejemplo 3 · Calificación IVOH y semáforo

- **Objetivo**: calificar los 6 factores con rúbrica, calcular el IVOH ponderado e interpretar el semáforo.
- **Guion del video**: los 6 factores y sus pesos (0.15/0.20/0.20/0.20/0.15/0.10); cómo se justifica un puntaje con evidencia; la gráfica radial; semáforo y qué sigue para una empresa verde (ruta EHR); los pesos son inmutables en la versión vigente.
- **Ejercicio corto**: se dan puntajes F1=6.5, F2=7.0, F3=8.0, F4=6.0, F5=7.5, F6=9.0. El participante calcula el IVOH y marca el semáforo. **Solución**: 6.5×0.15 + 7.0×0.20 + 8.0×0.20 + 6.0×0.20 + 7.5×0.15 + 9.0×0.10 = **7.2 → amarillo** (5–7.9).
- **Autoevaluación**:
  1. *¿Cuál es la fórmula del IVOH?* — a) Promedio simple · b) **Σ peso×puntaje con pesos 0.15/0.20/0.20/0.20/0.15/0.10** · c) Producto de factores · d) El factor mínimo. **(correcta: b)**
  2. *Una empresa con IVOH 8.4…* — a) Rojo, no viable · b) Amarillo · c) **Verde: alta viabilidad, candidata a EHR** · d) Diagnóstico inválido. **(correcta: c)** — *≥8 es verde.*
  3. *¿Quién valida el IVOH y dónde queda fijado?* — a) La empresa, en su aviso · b) **El equipo en R4, congelado en la versión vigente** · c) El laboratorio, en el dictamen · d) Nadie, es orientativo. **(correcta: b)** — *Tras R4 los pesos/puntajes son inmutables (trigger).*

## Módulo 7 — Ejercicios guiados por estación (campo)

- **Objetivo**: practicar captura en campo: llenado del CAT con «No sé» como tarea, y la cadena de custodia de 3 firmas.
- **Guion del video**: estación 1 — recorrido y CAT (qué observar para responder bien; cuándo marcar «No sé» y qué implica); estación 2 — muestreo (puntos, preservación, registro de caudal); estación 3 — cadena de custodia (muestreo→entrega→recepción, temperatura e integridad); el dictamen sin 3 firmas no existe.
- **Ejercicio corto**: se muestra una custodia con 2 firmas y se pregunta si se puede emitir dictamen; luego se pide ordenar los pasos faltantes (registrar temperatura, firmar recepción, adjuntar informe). **Solución**: no hay dictamen con <3 custodias (409 GATE_CUSTODIA); pasos: firmar recepción con temperatura e integridad → adjuntar informe → registrar resultados con dictamen por parámetro.
- **Autoevaluación**:
  1. *Una respuesta «No sé» del CAT…* — a) Se deja en blanco · b) **Queda como tarea de campo obligatoria con trazabilidad hasta resolverla** · c) Penaliza 2 puntos · d) Convierte el diagnóstico en inválido. **(correcta: b)**
  2. *La cadena de custodia exige…* — a) 1 firma del muestreador · b) 2 firmas · c) **3 transferencias firmadas: muestreo, entrega y recepción** · d) Firma del laboratorio únicamente. **(correcta: c)**

## Módulo 8 — Cierre: errores frecuentes y próximos pasos

- **Objetivo**: reconocer los errores que más retrasan diagnósticos y saber qué sigue después del reporte (Plan de Acción y ruta EHR).
- **Guion del video**: errores frecuentes (bitácora tardía sin justificación, balance forzado, custodia incompleta, CAT con espacios en blanco, mover la tarjeta sin cerrar el entregable); la matriz 10/10 del Reporte; después del diagnóstico: implementación de medidas, reevaluación anual y reconocimiento EHR.
- **Ejercicio corto**: la matriz 10/10 aparece con 9 requisitos en verde y el requisito «Cartera de alternativas» en rojo. El participante indica qué falta y qué botón está disponible. **Solución**: falta vincular ≥1 alternativa por brecha mayor al BHE; el botón «Emitir reporte» permanece bloqueado con la lista de pendientes (409 GATE_REPORTE_INCOMPLETO).
- **Autoevaluación**:
  1. *El Reporte de Diagnóstico se puede emitir cuando…* — a) Termina el CAT · b) **La matriz de completitud marca 10/10** · c) El IVOH es verde · d) Pasan las 6 semanas. **(correcta: b)**
  2. *¿Cuál de estos es un error frecuente que la plataforma bloquea?* — a) Usar la plantilla oficial · b) **Mover la tarjeta de fase sin cerrar el entregable verificable** · c) Adjuntar evidencia fotográfica · d) Marcar «No sé» con plan de resolución. **(correcta: b)**

---

# 4. Examen final — especificación

| Parámetro | Valor |
|---|---|
| Pool | 24 preguntas (`module_orden = 0`, §5) |
| Selección | 10 aleatorias por intento, opciones barajadas (seed por `attempt_id`) |
| Umbral de aprobación | **≥ 80 %** (8/10) — TD-7 |
| Duración | 30 min; sin materiales de consulta |
| Calificación | **Server-side** (EF-11): el cliente nunca recibe `correcta` (SEC-05) |
| Retroalimentación | Por pregunta, solo **después** de calificar (EF-11 response) |
| Intentos | Sin límite en MVP; cada intento queda en `quiz_attempts` (doc `05` AUL-03) |
| Prerrequisito | 8 módulos completados (regla de cliente; EF-11 no la exige en MVP) |
| Al aprobar | Insignia **Open Badges 3.0** (§6) + `profiles.badge_mdohi = true` |

# 5. Banco de preguntas del examen (pool, module_orden = 0)

> Clave: letra en negrilla = correcta. Este banco **vive solo en este documento y en la base**; la carga es por `service_role` (§7).

| # | Pregunta | Opciones | Retroalimentación |
|---|---|---|---|
| 1 | ¿Dónde se valida la lista de cotejo de documentación básica? | a) R2 b) V1 **c) R1** d) R3 | La cotejo se valida en la primera reunión; R2 valida el CAT. |
| 2 | ¿Qué folio recibe una segunda sesión de la visita V2? | a) BIT-V1-02 b) BIT-V2-01 **c) BIT-V2-02** d) V2-02 | El consecutivo de dos dígitos corre por tipo de evento; sesiones extra se anotan en el control de avance. |
| 3 | Una ficha de bitácora se cierra 30 horas después del evento. ¿Qué exige la plataforma? | a) Nada, cierra igual b) Aprobación de la empresa **c) Una razón de cierre tardío (obligatoria > 24 h)** d) Nueva ficha | TD-8: el cierre tardío es válido con justificación ≥ 20 caracteres. |
| 4 | ¿Qué alimenta la gráfica radial del IVOH en el expediente? | a) El CAT b) `v_ivoh_score` c) El BHE mensual d) El usuario la dibuja | La vista calcula total ponderado y aportación por factor; el cliente no recalcula cifras oficiales. |
| 5 | Brecha anual 8 %, pero julio 11 %. ¿Se valida el BHE en R3? | a) Sí, el promedio manda b) **No: un mes > 10 % bloquea** c) Sí, con observación d) Solo si la empresa acepta | TD-3: la regla es mensual; el balance queda editable para corregir flujos. |
| 6 | ¿Quién puede pasar un ítem de la lista de cotejo a `validado_r1`? | a) La empresa b) Cualquier miembro c) **El rol coordinador** (el equipo puede marcar `revisado`) d) El observador | TD-2#3/#5: validar en R1 es facultad del coordinador; es terminal. |
| 7 | La acreditación EMA del laboratorio es obligatoria cuando… | a) Siempre b) **El dictamen se requiere por norma oficial** (`norma_ref`) c) Nunca d) Solo para metales | TD-5#4: sin acreditación no hay dictamen oficial. |
| 8 | IVOH total 7.9. ¿Semáforo? | a) Rojo b) **Amarillo** c) Verde d) Sin semáforo | 5.0–7.9 = amarillo; el verde empieza en 8.0. |
| 9 | ¿Qué desbloquea el avance a fase 5 del diagnóstico? | a) CAT validado b) IIH verificado c) **BHE validado en R3** d) IVOH validado | TD-1#4; el IVOH desbloquea la fase 6. |
| 10 | En el Kanban, ¿quién mueve las tarjetas de fase? | a) Cualquier usuario b) **Gestor SDFI del diagnóstico y coordinador** c) La empresa libremente d) Nadie, se mueven solas | La empresa solo hacia validaciones que le corresponden; el gate debe estar cumplido (M11). |
| 11 | Los balances, planos y parámetros de proceso del expediente se clasifican por defecto como… | a) Públicos b) Internos c) **Restringidos con NDA (`restringido_nda`)** d) Anonimizados | Arquitectura §9 y doc 06 §3: confidencialidad contractual por defecto. |
| 12 | Una pregunta del CAT respondida «No sé» y resuelta en campo queda… | a) Eliminada b) **Registrada con evidencia, firma y estado resuelto** c) Penalizada en IVOH d) Como N/A | `cat_responses.resuelta_en_campo`: trazabilidad completa de la duda a su resolución. |
| 13 | Al reprogramar un hito, ¿qué debe conservarse siempre? | a) El folio original b) **La fecha original, anotada en hallazgos junto a la nueva** c) La hora de la sesión d) El responsable original | EF-12: la reprogramación es documentada, sin salir de las 6 semanas. |
| 14 | El Reporte de Diagnóstico emitido recibe el folio… | a) `MDOHI-AAAA-NNN` b) `BIT-R5-01` c) **`{folio del diagnóstico}-R1`** d) `ARCO-AAAA-NNNN` | EF-07 asigna el folio del reporte anexando `-R1` al folio del diagnóstico. |
| 15 | El dictamen de laboratorio solo puede registrarse cuando… | a) Llega el informe PDF b) **Existen 3 transferencias de custodia firmadas** c) La muestra está colectada d) El BHE está validado | Trigger `trg_custody_gate` bloquea el dictamen con < 3 custodias. |
| 16 | ¿En qué hito se valida el CAT? | a) R1 **b) R2** c) V1 d) R4 | Gate F3: `cat_estado = 'validado_r2'`. |
| 17 | ¿En qué hito se verifica el IIH? | a) R1 b) R2 **c) V1** d) V2 | Gate F4: todos los activos `verificado_v1`. |
| 18 | El rol `empresa` en la plataforma puede… | a) Validar el BHE b) Mover tarjetas de cualquier columna c) **Subir documentos, llenar el CAT y atender validaciones que le corresponden** d) Emitir el reporte | RLS + TD: la empresa participa, no valida; la emisión es del coordinador. |
| 19 | Trabajando sin conexión (campo), la PWA… | a) Permite validar el BHE b) **Guarda borradores en cola y bloquea los gates hasta reconectar** c) Pierde lo capturado d) Envía todo al reconectar sin control | OFF-01: los gates nunca se encolan; la cola es para captura (CAT, BHE, bitácora). |
| 20 | Al aprobar el examen del aula, el participante recibe… | a) Un certificado PDF por correo b) **Una insignia Open Badges 3.0 verificable** c) 1 punto extra de IVOH d) Acceso de coordinador | EF-11 genera el JSON-LD de la insignia (OB3) con evidence del intento. |
| 21 | La calificación del examen ocurre… | a) En el navegador del participante b) **En el servidor (EF-11), contra el banco protegido** c) Manual por el instructor d) Por promedio de módulos | El cliente jamás ve `correcta` (revoke + `v_quiz_questions`, doc 06). |
| 22 | El Plan de Acción (producto 3) contiene… | a) Solo el IVOH b) **Medidas priorizadas con ahorros estimados y cronograma** c) La lista de cotejo d) Las fotos de V1 | Se acuerda en R5 e integra el Reporte; alimenta la ruta EHR. |
| 23 | La revisión anual de una Empresa Hídricamente Responsable corresponde a un diagnóstico de tipo… | a) Inicial **b) Reevaluación** c) Seguimiento d) Piloto | `diagnostics.tipo`: la reevaluación anual mide sostenibilidad del desempeño. |
| 24 | ¿Dónde viven los bytes de los documentos del expediente? | a) En Postgres b) **En Cloudflare R2; Postgres solo guarda metadatos y hash** c) En el navegador d) En el correo | EF-08: URL prefirmada de 15 min; `documents.r2_key` + `sha256`. |

**Banco total**: 24 del pool (examen) + 19 de autoevaluación (módulos 1–8) = 43 preguntas. Las 14 preguntas sembradas en `03` para los módulos instrumentales se mantienen como **banco de repaso opcional** (no forman parte del curso canónico) o se retiran en la regeneración de seeds (§7).

---

# 6. Insignia Open Badges 3.0 (al aprobar)

JSON-LD que EF-11 genera y guarda en `audit_log.meta` (evidencia) + entrega al titular:

```json
{
  "@context": ["https://www.w3.org/ns/credentials/v2", "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"],
  "id": "urn:uuid:<uuid>",
  "type": ["VerifiableCredential", "OpenBadgeCredential"],
  "issuer": { "id": "did:web:hidria.<dominio>", "type": "Profile", "name": "Programa Empresas Hídricamente Responsables — SDFI/UCI" },
  "validFrom": "<ts>",
  "name": "Taller MD-OHI — Aprobado",
  "credentialSubject": {
    "type": "AchievementSubject",
    "achievement": {
      "id": "urn:uuid:<achievement-uuid>",
      "type": "Achievement",
      "achievementType": "CourseCompletion",
      "name": "Taller de la Metodología de Diagnóstico para la Optimización Hídrica Industrial",
      "criteria": { "narrative": "Completar los 8 módulos y aprobar el examen final con ≥80 %." },
      "creator": { "id": "did:web:hidria.<dominio>", "type": "Profile", "name": "SDFI · UCI" }
    }
  },
  "evidence": [{ "type": "Evidence", "name": "Intento de examen", "id": "urn:quiz_attempts:<attempt_id>", "description": "Calificación server-side (EF-11); sin exposición del banco." }]
}
```

Verificación pública sin datos personales: la insignia se resuelve por `id` sin revelar respuestas ni datos del titular más allá del nombre que él decida mostrar (doc `06` §10: se conserva el JSON-LD, se suprimen respuestas detalladas a los 2 años).

---

# 7. Carga y administración del banco

1. **Canal**: exclusivamente `service_role` (panel admin interno o migración). La tabla cruda tiene `revoke select` para `authenticated` (doc 06 §12).
2. **Idempotencia por grupo**: cada carga corre en transacción y reemplaza el grupo (`module_orden`) completo, de modo que reeditar una pregunta no deja versiones huérfanas:

```sql
begin;
delete from public.quiz_questions where module_orden = 0;      -- pool del examen
insert into public.quiz_questions (module_orden, pregunta, opciones, correcta, retroalimentacion) values
  (0, '¿Dónde se valida la lista de cotejo de documentación básica?',
   '["R2","V1","R1","R3"]', 2, 'La cotejo se valida en la primera reunión; R2 valida el CAT.');
  -- ...resto del pool (§5)...
commit;
```

3. `course_modules` se carga con `insert … on conflict (orden) do update set titulo = excluded.titulo, materiales = excluded.materiales;` (los valores canónicos son los de §2).
4. **Sustitución de seeds**: la sección del aula en `03-seed_catalogos.sql` queda **superseded** por este documento; en la próxima revisión de seeds, `03` se regenera a partir de §2/§5 (con el loader por grupos), manteniendo la política de que el DDL manda ante discrepancias.
5. **Cambios al banco**: cualquier pregunta nueva pasa la guía de estilo (§8) y al menos una revisión de la Coordinación SDFI + UCI antes de cargarse; la carga queda en `audit_log`.

---

# 8. Guía de estilo para preguntas

1. **Una idea por pregunta**; enunciado interrogativo directo; sin dobles negaciones.
2. **Distractores plausibles** (errores reales observados en diagnósticos), no relleno; opciones de longitud y gramática paralelas.
3. **Una sola correcta**; su posición varía (no siempre la misma letra).
4. **Retroalimentación que enseña**: cita la regla o el gate (TD/trigger), no solo «correcto/incorrecto».
5. **Anclaje metodológico**: toda pregunta referencia un instrumento, hito o regla verificable del Manual/Anexos o del paquete técnico; nada de trivialidades no operativas.
6. **Vigencia**: si la metodología cambia (p. ej., pesos IVOH), el banco se revisa en la misma versión que el cambio.

---

# 9. Casos de prueba adicionales (agregar al doc `05`)

| ID | Caso | Esperado |
|---|---|---|
| AUL-04 | Dos intentos del mismo usuario | Conjuntos de 10 preguntas distintos (aleatoriedad por intento) y opciones en distinto orden; ambos en `quiz_attempts` |
| AUL-05 | Tras calificar | La respuesta de EF-11 incluye retroalimentación por pregunta y nunca el campo `correcta` del banco en la lectura previa (SEC-05) |
| AUL-06 | Re-carga del pool con una pregunta editada | La transacción reemplaza el grupo `module_orden=0`; no quedan duplicados; `v_quiz_questions` refleja el texto nuevo |
| AUL-07 | Insignia | El JSON-LD valida contra el contexto OB3; `evidence` apunta al `attempt_id`; verificación pública sin datos personales |

---

*Fin del documento. El banco y la estructura del curso son contenido del Programa: su aprobación final corresponde a la Coordinación SDFI con validación académica de UCI antes de la Fase 1 (plan de despliegue, actividad 0.6).*
