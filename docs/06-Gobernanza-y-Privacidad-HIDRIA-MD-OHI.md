# HIDRIA — Gobernanza y Privacidad

## Documento v1.0 — Ecosistema de Circularidad Tecnológica (ECT) · Metodología MD-OHI

---

# 0. Control del documento

| Campo | Valor |
|---|---|
| Documento | HIDRIA — Gobernanza y privacidad (ítem 5 del roadmap) |
| Versión | 1.0 |
| Fecha | 2026-11-08 |
| Dependencias | `Arquitectura HIDRIA-ECT con MD-OHI v2.0.md` (§9 seguridad y cumplimiento); `02-supabase_schema_hidria_mdohi.sql` (`exposure_level`, `audit_log`, RLS); `05-Plan-de-Pruebas-HIDRIA-MD-OHI.md` (casos SEC) |
| Audiencia | Subsecretaría de Desarrollo y Fomento Industrial (SDFI) · Secretaría de Recursos Hidráulicos para el Desarrollo Social (SRHDS) · UCI (Universidades y Centros de Innovación) · equipo de agentes de IA / desarrollo |
| Alcance | Marco normativo vigente, roles responsable/encargado, clasificación de datos, aviso de privacidad, derechos ARCO, transferencias, contratos, medidas de seguridad, vulneraciones, retención y gobernanza operativa |

> **Nota de vigencia.** El marco mexicano de protección de datos cambió en 2024–2025: el INAI se extinguió (reforma constitucional, DOF 20-dic-2024) y se publicaron una nueva LFPDPPP y una nueva LGPDPPSO (DOF 20-mar-2025), con la Secretaría Anticorrupción y Buen Gobierno (SABG) como autoridad federal en el sector privado. En Tamaulipas, la ley de 2017 fue **abrogada y sustituida** por la Ley de Protección de Datos Personales en Posesión de los Sujetos Obligados del Estado de Tamaulipas (Decreto 66-369, 8-jul-2025). Este documento se redactó sobre ese marco vigente; cualquier reforma posterior debe revisarse antes de la publicación del aviso de privacidad.

---

# 1. Marco normativo vigente

| Nivel | Norma | Aplica a HIDRIA como |
|---|---|---|
| Constitucional | Art. 16, párr. 2º, CPEUM | Derecho de toda persona a la protección de sus datos personales; SRHDS es sujeto obligado |
| Federal general | **LGPDPPSO** (DOF 20-mar-2025) | Regla general para sujetos obligados; la ley estatal se armoniza con ella y la aplica supletoriamente |
| Federal privados | **LFPDPPP 2025** (DOF 20-mar-2025) | Régimen de particulares: empresas atendidas (como responsables independientes de sus empleados) y cualquier encargado privado (p. ej., CIT si opera como persona jurídica privada) |
| Estatal | **Ley de Protección de Datos Personales en Posesión de los Sujetos Obligados del Estado de Tamaulipas** (Decreto 66-369, 8-jul-2025; P.O. 10-jul-2025) | Norma principal para el tratamiento que hace la SDFI. Autoridad garante para el Poder Ejecutivo estatal y los municipios: **Transparencia para el Pueblo de Tamaulipas** |
| Estatal | Ley de Transparencia y Acceso a la Información Pública del Estado de Tamaulipas | Complementaria (Unidades de Transparencia, Comité de Transparencia) |
| Soft law | Lineamientos generales de protección de datos para el sector público (ANPDP/INAI, vigentes en lo no contrario) | Referencia práctica mientras la SABG/expida los nuevos; en particular el procedimiento de vulneraciones (72 h) y medidas de seguridad |
| Archivística | Ley General de Archivos y normativa estatal archivística; Programa de Desarrollo Archivístico del Estado | Retención y supresión (§10) |

**Principios aplicables a todo tratamiento en la plataforma** (ley estatal art. 13; LGPDPPSO): licitud, finalidad, lealtad, consentimiento (cuando sea fundamento), calidad, proporcionalidad, información y responsabilidad. La plataforma los implementa de forma técnica: finalidad declarada por campo (catálogo de finalidades), proporcionalidad por minimización (solo datos que los instrumentos MD-OHI exigen), calidad por bitácora validada, información por aviso de privacidad accesible en la propia plataforma.

---

# 2. Roles y responsabilidades

| Actor | Rol de protección de datos | Base |
|---|---|---|
| **SDFI — Subsecretaría de Desarrollo y Fomento Industrial** (Programa Empresas Hídricamente Responsables), órgano desconcentrado de la SRHDS | **Responsable**: decide sobre el tratamiento de los datos personales que la plataforma concentra (equipo técnico, contrapartes de empresas, asistentes a sesiones, participantes del aula) | Ley estatal: tratamiento atribuido a un órgano desconcentrado dentro del sujeto obligado SRHDS (Poder Ejecutivo estatal) |
| **Unidad de Transparencia SRHDS** | Atención de solicitudes ARCO; ventanilla de la plataforma; vinculación con el Comité de Transparencia | Ley estatal arts. 45–51 |
| **Oficial / área de protección de datos** | Gestión interna de ARCO, inventario, capacitación, atención de vulneraciones | Función equivalente a la del oficial (ley estatal 2017 art. 112, subsistente como práctica institucional) |
| **UCI — Universidades y Centros de Innovación** (equipo técnico Triple Hélice) | **Encargado(s)**: tratan datos personales a nombre y por cuenta de la SDFI, sin decisión propia sobre finalidades; sujeto a contrato responsable–encargado (§7). Si algún integrante decide finalidades propias (p. ej., investigación), lo hará como responsable independiente con fundamento propio y datos anonimizados | Ley estatal (definición de encargada); LFPDPPP 2025 para la parte privada |
| **Empresas atendidas** | **Responsables independientes** de los datos personales de sus propios trabajadores (contrapartes que capturan el CAT, asisten a visitas). La plataforma solo aloja los datos que la empresa transfiere al Programa con finalidad diagnóstica; la empresa debe informar a sus titulares conforme a su propio aviso | LFPDPPP 2025 / LGPDPPSO según naturaleza |
| **Organismo operador de agua** | **Tercero receptor**: solo ve el expediente técnico de su competencia (documentos, balance) bajo la membresía `organismo_operador`; no recibe datos personales salvo los de la contraparte que firma actas | Minimización |
| **Laboratorios acreditados** | Encargado puntual: reciben muestras (datos no personales por diseño) y datos de contacto mínimos para logística; obligados a confidencialidad por contrato | §7 |
| **Proveedores cloud (Supabase, Cloudflare)** | Encargados de infraestructura (procesamiento en la nube); selección conforme a requisitos de la ley estatal para cómputo en la nube: políticas afines a la ley, transparencia de subcontrataciones, sin titularidad sobre la información, confidencialidad | Ley estatal 2017 art. 94 (referencia de política institucional, a revalidar contra la ley 2025 y sus lineamientos) |
| **PSC de firma NOM-151** | Encargado puntual (fase 3): recibe el PDF del Reporte; confidencialidad contractual | §7 |

---

# 3. Inventario y clasificación de datos

## 3.1 Categorías

| Categoría | Ejemplos en HIDRIA | Tratamiento |
|---|---|---|
| **Datos personales** | Nombre, cargo, correo, teléfono de: equipo SDFI/UCI, contrapartes de la empresa, asistentes a V/R, participantes del aula | Aviso de privacidad; RLS; ARCO |
| **Datos personales sensibles** | No se recaban por diseño. Si una evidencia fotográfica expusiera a personas, se difuminará/anonymizará antes de archivar | Prohibido salvo excepción legal; registro en hallazgos |
| **Datos industriales confidenciales** | Balances hídricos, planos, parámetros de proceso, layout, resultados de laboratorio, reporte de diagnóstico | **No son datos personales**, pero se clasifican por defecto `restringido_nda` (arquitectura §9); NDA con la empresa; base de toda la seguridad del expediente |
| **Datos agregados/anonimizados** | Contadores públicos del Programa, tableros estatales, ODS | Solo agregados que no permitan identificación directa ni por combinación; el acceso público sale de vistas filtradas |
| **Metadatos de operación** | Folios, sellos de tiempo, `audit_log` | Seguridad de la plataforma; el `audit_log` es evidencia, no expediente de la empresa |

## 3.2 Mapeo a la implementación

| Decisión de gobernanza | Implementación (fuente de verdad: DDL) |
|---|---|
| Aislamiento entre entidades atendidas | Tenancy `organization_id` + RLS `is_tenant_member` |
| Aislamiento por diagnóstico | `project_members` + `my_diagnostic_role` |
| Confidencialidad documental por defecto | `documents.exposure_level default 'restringido_nda'` |
| Cadena de evidencia | `audit_log` append-only encadenado por hash (trigger `trg_audit_hash`) |
| Trazabilidad de quién vio/qué | `audit_log` actions `view`/`download`; URLs de descarga de 15 min (doc 04 EF-08) |
| Cifrado | Envelope AES-256-GCM: DEK por diagnóstico en R2, KEK por organización fuera de la base (arquitectura §9) |

---

# 4. Aviso de privacidad

## 4.1 Estructura obligatoria (ley estatal arts. 33–44, armonizadas con LGPDPPSO)

El aviso de privacidad de la SDFI para el tratamiento vía HIDRIA contiene, como mínimo:

1. **Identidad y domicilio del responsable**: Subsecretaría de Desarrollo y Fomento Industrial (SDFI), órgano desconcentrado de la Secretaría de Recursos Hidráulicos para el Desarrollo Social (SRHDS) del Gobierno del Estado de Tamaulipas («la Subsecretaría»), con domicilio oficial y correo institucional de la Unidad de Transparencia de la SRHDS.
2. **Finalidades**: (a) obligatorias — ejecución del Programa y de la metodología MD-OHI (diagnóstico, bitácora, reporte), gestión del aula y certificación; estadística agregada del padrón estatal; (b) opcionales — difusión de buenas prácticas (solo con datos agregados y previo acuerdo con la empresa).
3. **Datos personales objeto de tratamiento**: los del §3.1 categoría 1.
4. **Transferencias**: organismos operadores (solo expediente técnico), laboratorios acreditados (logística de muestreo), PSC de firma (solo PDF del reporte), y las previstas en el art. 20 LGPDPPSO / supuestos de la ley estatal (requerimiento de autoridad competente). **No se requiere consentimiento para transferencias en estos supuestos de ley, pero el aviso las debe informar.**
5. **Medios para ejercer derechos ARCO**: el buzón de la plataforma (§5.3), la Unidad de Transparencia y la Plataforma Nacional de Transparencia.
6. **Medio para revocar el consentimiento** (cuando el fundamento sea consentimiento) y manifestar negativa para finalidades opcionales.
7. **Procedimiento para comunicar cambios al aviso** (versión, fecha, difusión en la plataforma).
8. Uso de **mecanismos de cookies/almacenamiento local** de la PWA (Dexie/IndexedDB): sin rastreo publicitario; solo operación offline.

## 4.2 Texto modelo

Ver **Anexo A**. Debe aprobarlo la Unidad de Transparencia y el Comité de Transparencia de la SRHDS antes de la publicación, y versionarse dentro de la plataforma (módulo «Aviso de privacidad» visible desde el login y el perfil).

---

# 5. Derechos ARCO

## 5.1 Procedimiento y plazos (ley estatal Decreto 66-369)

| Etapa | Plazo | Fundamento |
|---|---|---|
| Acuse de recibo | Inmediato (la plataforma genera folio `ARCO-AAAA-NNN`) | Procedimiento sencillo (art. 45) |
| **Respuesta a la solicitud** | **20 días** desde el día siguiente a la recepción; ampliable **una sola vez hasta 10 días** notificando al titular dentro del primer plazo | Art. 45 |
| **Hacer efectivo el derecho** (entrega, rectificación, cancelación, oposición) | **15 días** siguientes a la notificación de la respuesta | Art. 45 |
| Prevención (faltan requisitos) | Prevenir en **5 días**; el titular subsana en **10 días**; si no, se tiene por no presentada; la prevención interrumpe el plazo | Art. 47 (fr. prevención) |
| Incompetencia | Comunicar en **3 días** y orientar al responsable competente | Art. 47 |
| Inexistencia | Declaración por resolución del **Comité de Transparencia** | Art. 47 |
| Gratuidad | Gratuito; solo costos de reproducción/certificación/envío conforme a normativa; sin costo hasta 20 hojas simples o si el titular aporta el medio | Art. 44 |
| **Recurso de revisión** | **15 días** desde la notificación de la respuesta (o del vencimiento del plazo), ante **Transparencia para el Pueblo de Tamaulipas** o ante la Unidad de Transparencia que conoció la solicitud | Arts. 85, 94, 95 |
| Requisitos mínimos de la solicitud | Nombre y medio de contacto; documentos que acrediten identidad/personalidad; área responsable si se conoce; descripción clara de los datos (salvo acceso); derecho que se ejerce; elementos que faciliten localización | Art. 46 |

## 5.2 Causales de improcedencia (art. 49)

Titular no acreditado; datos no en posesión del responsable; impedimento legal; lesión a terceros; obstaculización de actuaciones judiciales/administrativas; resolución de autoridad; cancelación/oposición ya realizada; responsable no competente; protección de intereses del titular; obligaciones contraídas por el titular. En todos los casos, la negativa se informa **fundada y motivada** dentro del plazo de respuesta, por el mismo medio.

## 5.3 Implementación en la plataforma

1. **Buzón ARCO** en el cliente (login y perfil): formulario con los requisitos del art. 46; genera folio y acuse; permite adjuntar documentos de acreditación (suben con `exposure_level='restringido_nda'` vía EF-08).
2. **Tabla `privacy_requests`** (addendum SQL, §12): estados `recibida → prevencion → en_analisis → respondida → hecha_efectiva | improcedente`; campos de plazos (fecha vencimiento calculada = recepción + 20 días; extensión opcional +10; efectiva +15); vínculo a la resolución del Comité de Transparencia cuando proceda.
3. **Atención**: la Unidad de Transparencia gestiona; el oficial de protección supervisa vencimientos; la plataforma notifica al titular por correo y dentro de su bandeja (`notifications kind='validacion'`).
4. **Trazabilidad**: todo el flujo queda en `audit_log` (qué dato, qué decisión, qué documento) — coherente con el principio de responsabilidad demostrada (accountability).
5. **Medios adicionales**: solicitud física ante la Unidad de Transparencia y Plataforma Nacional de Transparencia, con captura manual en el buzón por el oficial (mismo folio y plazos).

---

# 6. Transferencias, remisiones y cesiones

| Figura | Qué es en HIDRIA | Requisito |
|---|---|---|
| **Remisión** (responsable ↔ encargado) | SDFI → UCI (operación de la plataforma); SDFI → Supabase/Cloudflare (infraestructura); SDFI → laboratorio/PSC | Contrato responsable–encargado (§7); minimización |
| **Transferencia** (a tercero distinto responsable) | Expediente técnico al organismo operador (miembro del diagnóstico); datos agregados a tableros públicos | Informar en el aviso de privacidad; supuestos de ley (art. 20 LGPDPPSO y correlativo estatal: ley/reglamento, convenio, salud, reconocimiento de derechos, etc.); para finalidades opcionales, manifestación de negativa del titular |
| **Cesión** (cambio de responsable) | No prevista en el MVP; si el Programa migra de titularidad (p. ej., a otra dependencia), requiere análisis específico y aviso a titulares | Análisis jurídico previo |

**Reglas de minimización técnica**: el organismo operador accede solo a su diagnóstico (`project_members role='organismo_operador'` + RLS); los tableros públicos consumen exclusivamente vistas agregadas sin identificadores; los laboratorios reciben código de muestra, no razón social salvo necesidad logística acreditada en el contrato.

---

# 7. Contratos responsable–encargado

Aplica a UCI (operación técnica), proveedores cloud, laboratorios y PSC. Minuta en **Anexo B** con las cláusulas obligatorias:

1. **Objeto y finalidad**: tratar los datos personales exclusivamente para las finalidades instruidas por la SDFI, con el alcance de la plataforma HIDRIA.
2. **Confidencialidad**: obligación de guardar confidencialidad durante y después del vínculo; alcance a datos industriales `restringido_nda` del expediente.
3. **Medidas de seguridad**: las del §8, verificables; cifrado, control de acceso por rol, bitácora de accesos.
4. **Prohibición de subencargo** sin autorización previa y por escrito de la SDFI (con el mismo nivel de obligaciones, a cadena).
5. **Prohibición de uso propio**: los datos no alimentarán productos, entrenamiento de modelos ni fines propios del encargado.
6. **Notificación de vulneraciones**: inmediata y a más tardar en **24 horas** al responsable (para que este cumpla el plazo legal de 72 h, §9).
7. **Derecho de auditoría y supervisión**: la SDFI (o Transparencia para el Pueblo de Tamaulipas) podrá verificar el cumplimiento; evidencia de las pruebas SEC del plan de pruebas.
8. **Devolución y supresión**: al término, devolución o supresión certificada de los datos y sus copias, salvo obligación de conservación (bloqueo), que se hará constar.
9. **Responsabilidad**: el encargado responde por daños y perjuicios por incumplimiento; la SDFI responde frente al titular y conserva acción de repetición.
10. **Vigencia y terminación**: ligada al convenio del Programa; causas de rescisión inmediata por incumplimiento a esta política.

---

# 8. Medidas de seguridad

## 8.1 Administrativas

| Medida | Descripción |
|---|---|
| Oficial/área de protección de datos | Designación documental; funciones del §2 |
| Inventario de datos personales | Obligación de sujetos obligados; se mantiene como catálogo vivo ligado al esquema de la BD (qué tabla aloja qué categoría, §3.2) |
| Capacitación | Inducción + anual al equipo SDFI/UCI (incluye manejo del expediente restringido y respuesta a ARCO) |
| Auditoría | Anual (o por incidente): revisión de `audit_log`, pruebas SEC/PRIV del plan, accesos de servicio |
| Control de acceso | Altas/bajas de personal en `profiles`/`project_members` en el día; revisión trimestral de membresías |
| Política de contraseñas/MFA | MFA obligatorio para roles `coordinador` y `admin_institucional`; sesiones por JWT corto + refresh |

## 8.2 Técnicas (ya especificadas en arquitectura §9 y doc 04)

Cifrado en tránsito (TLS) y en reposo (AES-256-GCM envelope: DEK por diagnóstico, KEK por organización fuera de la base); RLS multi-tenant y por rol; URLs prefirmadas de 15 min para descarga; lista blanca de tipos de archivo; `audit_log` append-only encadenado; backups cifrados con prueba de restauración trimestral; separación de entornos (local/staging/piloto) sin datos reales fuera de `piloto`.

## 8.3 Físicas

Delegadas al centro de datos de los proveedores cloud con acuerdos de nivel de servicio; el responsable conserva la obligación de selección conforme a los requisitos de la ley estatal para cómputo en la nube (políticas afines, transparencia de subcontratación, sin titularidad de la información, confidencialidad).

---

# 9. Vulneraciones de seguridad (brechas de datos personales)

Procedimiento alineado al art. 40 LGPDPPSO y lineamientos de procedencia (vigentes en lo no contrario: notificación en **72 horas** máximo):

| Paso | Plazo | Responsable | Evidencia |
|---|---|---|---|
| 1. Detección y contención | Inmediato | Quien detecta → oficial de protección | Ticket de incidente, timestamp |
| 2. Confirmación y clasificación | ≤ 12 h | Oficial + área de TI | Dictamen: si afecta significativamente derechos patrimoniales o morales |
| 3. Notificación a la SDFI (responsable) por el encargado | ≤ 24 h | Encargado (cláusula 6 del contrato) | Oficio/correo |
| 4. **Notificación al titular** | ≤ **72 h** desde la confirmación | Responsable (Unidad de Transparencia) | Contenido mínimo: naturaleza del incidente, datos comprometidos, recomendaciones al titular, acciones correctivas inmediatas, medios para mayor información, circunstancias del impacto |
| 5. Notificación a la autoridad garante (Transparencia para el Pueblo de Tamaulipas) | ≤ 72 h (junto con la del titular) | Responsable | Mismo expediente + hora/fecha de identificación |
| 6. Mitigación, análisis de causa raíz y medidas correctivas | ≤ 15 días naturales | Oficial + TI | Informe al Comité de Transparencia |
| 7. Registro y lecciones | Permanente | Oficial | Bitácora de incidentes; actualización del plan de pruebas |

La plataforma aporta: `audit_log` para reconstruir accesos, canal `notifications` para avisar a titulares, y congelación de cuentas comprometidas (desactivación de JWT por `profiles`).

---

# 10. Retención y supresión

Principio: conservar solo durante la finalidad y los plazos de las obligaciones aplicables; la supresión es eliminación/borrado/destrucción bajo medidas de seguridad (definición de la ley estatal). Matriz de retención (a validar contra el Programa de Desarrollo Archivístico del Estado antes de su publicación):

| Conjunto | Retención | Disposición final |
|---|---|---|
| Expediente completo del diagnóstico (documentos, CAT, IIH, BHE, custodia, IVOH, bitácoras, reporte) | Vida del Programa + **5 años** (referencia: series documentales de programas sectoriales) | Supresión certificada; constancia en `audit_log` |
| Datos personales de contrapartes y asistentes (participantes, firmas) | Duración del diagnóstico + **2 años** (prescripción de acciones) | Bloqueo → supresión |
| Registros del aula e insignias | Permanente mientras dure el reconocimiento del Programa; insignia verificable sin datos personales adicionales | Se conserva el JSON-LD de la insignia; se suprimen respuestas detalladas a los **2 años** |
| `audit_log` | **5 años** (evidencia de seguridad y accountability) | Supresión por lote certificado |
| Solicitudes ARCO y su expediente | **5 años** | Supresión certificada |
| Backups | Ciclo corto (30 días) con cifrado | Destrucción automatizada |

La supresión de datos personales se instrumenta en la plataforma como proceso con constancia (qué registros, qué método, cuándo), dejando huella en `audit_log` sin conservar el dato suprimido.

---

# 11. Gobernanza operativa

1. **Comité de Transparencia SRHDS**: resuelve inexistencias (art. 47) y conoce de los informes anuales de protección de datos del Programa.
2. **Informe anual**: gestión de ARCO (número, plazos cumplidos), vulneraciones, auditorías, capacitación — presentado al Comité y disponible para la autoridad garante.
3. **Evaluación de impacto (DPIA)**: obligatoria antes de activar módulos que introduzcan tratamiento nuevo (fase 3: telemetría, analítica agregada; firma NOM-151 con tercero).
4. **Cambios al aviso de privacidad**: versión, aprobación del Comité, difusión en plataforma y, si alteran sustancialmente el tratamiento, comunicación a titulares.
5. **Relación con la autoridad garante**: atención de requerimientos de Transparencia para el Pueblo de Tamaulipas; los procedimientos en trámite se sustancian conforme a la ley vigente al momento de su inicio (transitorio de la ley estatal).

---

# 12. Implementación técnica (addendum al esquema)

Se aplica **después** de `02-supabase_schema_hidria_mdohi.sql` y `03-seed_catalogos.sql`. Añade el buzón ARCO a la base; el resto de la gobernanza ya vive en el esquema (`exposure_level`, `audit_log`, RLS).

```sql
-- ============================================================================
-- ADDENDUM DE PRIVACIDAD — HIDRIA MD-OHI (ítem 5)
-- Ejecutar después de 02 y 03. Idempotente.
-- ============================================================================
create sequence if not exists public.privacy_folio_seq;
create table if not exists public.privacy_requests (
  id              uuid primary key default uuid_generate_v4(),
  folio           text not null unique default
                  ('ARCO-' || to_char(now(),'YYYY') || '-' ||
                   lpad(nextval('public.privacy_folio_seq')::text, 4, '0')),
  organization_id uuid not null references public.organizations(id),  -- siempre la org SRHDS
  derecho         text not null check (derecho in ('acceso','rectificacion','cancelacion','oposicion')),
  titular_nombre  text not null,
  titular_contacto text not null,          -- medio para notificaciones (art. 46 fr. I)
  descripcion     text,                    -- datos buscados (n/a en acceso) y correcciones
  documentos      jsonb not null default '[]'::jsonb,  -- acreditación (documents.id)
  estado          text not null default 'recibida' check (estado in
                  ('recibida','prevencion','en_analisis','respondida',
                   'hecha_efectiva','improcedente','cerrada')),
  medio           text not null default 'plataforma' check (medio in
                  ('plataforma','presencial','pnt','correo')),
  recibida_en     timestamptz not null default now(),
  vence_en        timestamptz not null default now() + interval '20 days',
  extension_dias  smallint check (extension_dias between 0 and 10),  -- art. 45
  respondida_en   timestamptz,
  efectiva_en     timestamptz,             -- +15 días post respuesta (art. 45)
  respuesta       text,
  comite_resolucion_id uuid,               -- documento del Comité cuando inexistencia
  created_by      uuid references public.profiles(user_id),
  updated_at      timestamptz not null default now()
);
alter table public.privacy_requests enable row level security;
drop policy if exists privacy_tenant on public.privacy_requests;
create policy privacy_tenant on public.privacy_requests for all
  using (public.is_tenant_member(organization_id))
  with check (public.is_tenant_member(organization_id));
-- Regla de negocio: extensión única (art. 45) — trigger
create or replace function public.trg_privacy_extension_once()
returns trigger language plpgsql as $$
begin
  if new.extension_dias is distinct from old.extension_dias and old.extension_dias is not null then
    raise exception 'ARCO: la extension del plazo es unica (art. 45).';
  end if;
  if new.extension_dias is not null then
    new.vence_en := old.vence_en + make_interval(days => new.extension_dias);
  end if;
  return new;
end; $$;
drop trigger if exists privacy_extension_once on public.privacy_requests;
create trigger privacy_extension_once before update on public.privacy_requests
for each row when (new.extension_dias is distinct from old.extension_dias)
execute function public.trg_privacy_extension_once();
```

Casos de prueba asociados (agregar al plan de pruebas): `PRIV-01` doble extensión → excepción; `PRIV-02` vencimiento calculado (recibida + 20 días, +10 con extensión, efectiva +15 post respuesta); `PRIV-03` usuario de otro tenant no lee el buzón; `PRIV-04` folio `ARCO-AAAA-NNNN` único y consecutivo.

---

# Anexo A — Aviso de privacidad (texto modelo, pendiente de aprobación del Comité de Transparencia)

> **AVISO DE PRIVACIDAD SIMPLIFICADO — PROGRAMA EMPRESAS HÍDRICAMENTE RESPONSABLES / PLATAFORMA HIDRIA**
>
> **Responsable.** Subsecretaría de Desarrollo y Fomento Industrial (SDFI), órgano desconcentrado de la Secretaría de Recursos Hidráulicos para el Desarrollo Social (SRHDS) del Gobierno del Estado de Tamaulipas («la Subsecretaría»), con domicilio en [domicilio oficial], y correo de la Unidad de Transparencia de la SRHDS: [correo institucional].
>
> **Finalidades.** (Obligatorias) Identificar y dar seguimiento a las empresas atendidas por el Programa; operar la metodología MD-OHI (alta de empresas, diagnósticos, repositorio documental, cuestionarios, balances hídricos, muestreos, calificaciones IVOH, bitácoras y reportes); administrar el aula de capacitación y emitir constancias; elaborar estadística agregada y anonimizada del padrón estatal de circularidad hídrica. (Opcionales) Difundir buenas prácticas sectoriales con información agregada, previo acuerdo con la empresa participante.
>
> **Datos personales tratados.** Nombre, cargo, correo electrónico y teléfono de las personas que integran los equipos técnico y de coordinación, de las contrapartes de las empresas atendidas, de las personas asistentes a visitas y reuniones, y de las personas participantes en el aula, así como las firmas y registros de asistencia que los instrumentos de la metodología requieren.
>
> **Transferencias.** Se podrán transferir datos personales a: organismos operadores de agua (únicamente los relacionados con la atención del diagnóstico); laboratorios de ensayo acreditados (solo los necesarios para la logística de muestreo); y los supuestos previstos en el artículo 20 de la Ley General de Protección de Datos Personales en Posesión de Sujetos Obligados y en la legislación estatal aplicable. No se realizarán transferencias adicionales sin previo aviso.
>
> **Derechos ARCO.** Usted podrá ejercer sus derechos de acceso, rectificación, cancelación y oposición a través del buzón de la plataforma HIDRIA (sección «Protección de datos»), ante la Unidad de Transparencia de la SRHDS o en la Plataforma Nacional de Transparencia. Los plazos de atención son los previstos en la Ley de Protección de Datos Personales en Posesión de los Sujetos Obligados del Estado de Tamaulipas.
>
> **Medio para revocar el consentimiento y manifestar negativa.** Cuando el tratamiento se base en su consentimiento o afecte finalidades opcionales, podrá manifestar su negativa en el mismo buzón, sin responsabilidad ni consecuencia para la atención obligatoria del Programa.
>
> **Cambios al aviso.** Cualquier modificación se hará de su conocimiento a través de la plataforma. Este aviso se actualiza y publica conforme a la versión vigente aprobada por el Comité de Transparencia.
>
> **Quejas.** Ante la negativa o falta de respuesta a su solicitud, usted podrá interponer recurso de revisión ante Transparencia para el Pueblo de Tamaulipas, en el plazo de 15 días conforme a la ley estatal.

---

# Anexo B — Minuta de contrato responsable–encargado (cláusulas)

Ver §7 para el detalle; la minuta incluye: partes (SDFI como responsable; el encargado identificado con su personalidad jurídica), antecedentes del Programa, definiciones conforme a la ley estatal y la LFPDPPP, cláusulas 1–10 del §7, anexo técnico de medidas de seguridad (§8.2), anexo de subencargos autorizados (Supabase, Cloudflare), firmas y vigencia. Las instituciones educativas y de investigación (UCI) suscriben además convenio marco de colaboración en el que se fija su condición de encargado y las reglas de publicación académica con datos anonimizados.

---

# Anexo C — Formato de solicitud ARCO (buzón de la plataforma)

Campos: (I) nombre del titular y medio para recibir notificaciones (correo/plataforma); (II) documentos que acrediten identidad (carga en EF-08, `restringido_nda`) y, en su caso, personalidad e identidad del representante; (III) área responsable (precargada: «Unidad de Transparencia SRHDS»); (IV) descripción clara y precisa de los datos personales respecto de los que se ejerce el derecho (no aplica para acceso); (V) derecho que se ejerce o petición concreta (acceso/rectificación/cancelación/oposición; en rectificación, las modificaciones y su sustento documental); (VI) elementos que faciliten la localización (folio de diagnóstico, empresa, rango de fechas, módulo). El sistema valida requisitos mínimos del art. 46, genera folio `ARCO-AAAA-NNNN` y acuse con fecha de vencimiento.

---

# Anexo D — Procedimiento de vulneración (checklist operativo, 72 h)

□ Detección registrada (quién, cuándo, cómo) □ Contención inmediata □ Confirmación ≤ 12 h y dictamen de afectación significativa □ Aviso del encargado al responsable ≤ 24 h □ Expediente del incidente (naturaleza, datos comprometidos, titulares afectados, causa, medidas) □ Notificación a titulares y a Transparencia para el Pueblo de Tamaulipas ≤ 72 h (contenido mínimo del §9 paso 4) □ Medios gratuitos y de amplia cobertura para el aviso □ Mitigación y análisis de causa raíz ≤ 15 días □ Informe al Comité de Transparencia □ Actualización de medidas de seguridad y del plan de pruebas □ Cierre documentado en bitácora de incidentes.

---

*Fin del documento. Este documento es normativo para la operación del Programa en lo relativo a datos personales y confidencialidad del expediente; su incumplimiento se trata como hallazgo crítico en la auditoría anual (§8.1).*
