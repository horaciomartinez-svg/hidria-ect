# ADR-007 — Seed sintético en migraciones: alcance, guardrails y retirada antes de piloto

- **Estado:** aceptada con condiciones (supervisor y revisor aprobados; visto bueno de seguridad pendiente; condiciones del revisor en `reports/reviews/PR-7_spec.md`)
- **Fecha:** 2026-11-08
- **Autor:** Lead (creador), a solicitud del supervisor (task-27) y a partir del hallazgo **M1**
  de `reports/reviews/PR-7_spec.md`
- **Documentos afectados:** `docs/07` §1.3/§4, `docs/01` §5, `TEAM.md` §9, `F1-18`
- **Aprobación requerida:** `supervisor-hidria` + `revisor-especificaciones` (+ visto bueno de
  `seguridad-privacidad` por datos sintéticos/PII)

## 1. Contexto

`F1-01a` (PR #7) incluye en una **migración forward-only**
(`20261108020000_f1_01a_auth_claims.sql`) un **seed sintético**: inicialmente 5 `auth.users`
y 5 `profiles` (incluido un `admin_institucional` ficticio), 1 empresa, 2 diagnósticos y 6
`project_members`, con emails `.invalid` y UUID fijos. El fix de `task-26` añade el sexto
rol (`invitado`), por lo que la composición final es **6 usuarios y 6 perfiles**. Se necesita
para probar RLS y claims mientras el Auth hook no está activo (E3).

Problema: las migraciones se aplican a **todos los entornos**, incluido `piloto` (datos
reales). `docs/07` §4 ubica los seeds en `supabase/seed.sql`, no en migraciones. Un seed de
negocio en migración acabaría en el entorno con datos reales si no se retira.

## 2. Decisión

1. **Se acepta el seed de F1-01a como fixture de desarrollo/staging**, con estos guardrails:
   - Solo datos **sintéticos**: emails `*.sintetico@example.invalid`, UUID fijos, sin PII real,
     sin credenciales reales ni secretos.
   - Nunca se cargan datos reales en el proyecto mientras no exista staging separado (ADR-004
     E2).
2. **Retirada obligatoria antes de `piloto`/G3:** una migración forward-only de **limpieza**
   (`delete` de los UUID fijos del seed y de sus dependencias) debe existir y ejecutarse antes
   del primer uso con datos reales. **`task-27`** rastrea la ejecución (dueño
   `arquitecto-bd`) y es **bloqueante de G3**. La limpieza debe:
   - ejecutarse en **orden** (hijos → padres), con **guardas** que aborten si aparecen
     dependientes inesperados;
   - **no tocar** la organización base `00000000-0000-4000-8000-000000000001` ni el catálogo
     IVOH;
   - verificar al final **0 filas** del seed y **0** emails `*.invalid`;
   - quedar documentada como paso explícito en el runbook de `docs/07` §5.
   Esta operación es la **excepción expresa** a la regla de `docs/07` §1.1 «no hay migraciones
   destructivas en el camino al piloto»: se permite únicamente como *cleanup* de fixtures
   sintéticos, acotada por UUID y con verificación post-ejecución.
3. **Fixtures futuros fuera de migraciones:** a partir de F1-01b, los datos de prueba van a
   `supabase/seed.sql` (o script de desarrollo equivalente) o a fixtures de CI, **no** a
   migraciones. Las migraciones solo contienen esquema, funciones, políticas y datos
   **maestros/catálogos** aprobados (no datos de negocio). **`task-28`** añade una **guarda de
   CI** que impida inserts de fixtures en `supabase/migrations/**`.
4. **Verificación:** el seed se aplica en **dev/staging local**; la CI actual **no** aplica
   seeds (eso llegará con `task-13`, pgTAP/Postgres en CI). El runbook de `piloto` (docs/07
   §5) incluye la ejecución de la limpieza y la comprobación de que no quedan `*.invalid`/UUID
   de seed.
5. **Endurecimiento de los usuarios sintéticos:** solo emails `.invalid`, **sin**
   `email_confirmed_at`, sin contraseñas reales y **nunca** el perfil admin en una organización
   real; el perfil `admin_institucional` sintético no debe dar acceso a datos reales. Con la
   limpieza previa a piloto y la separación de entornos queda mitigado.

## 3. Alternativas consideradas

- **Mover el seed a `supabase/seed.sql` ahora:** correcto a largo plazo, pero F1-01a ya tiene
  las migraciones aplicadas en el proyecto dev/staging; requiere una migración de limpieza
  igual y retrasa la corrección del fail-open (B1). Se adopta como regla para lo sucesivo
  (punto 3) y se ejecuta la limpieza vía `task-27`.
- **Dejar el seed permanentemente:** rechazado (llevaría datos sintéticos a piloto).

## 4. Consecuencias

- F1-01a puede mergearse con el seed, siempre que B1 (fail-open) y M2 (`invitado`, 6 roles) se
  corrijan en el mismo ciclo y `task-27` quede abierta y bloqueante para G3.
- `docs/07` §4/§5 y `docs/01` §5 se actualizan en `F1-18` (incluida la excepción a §1.1).
- El runbook de piloto gana un paso explícito de limpieza de fixtures y la guarda de CI
  (`task-28`) evita que vuelvan a introducirse fixtures en migraciones.

## 5. Aprobación

| Rol | Nombre | Estado | Evidencia |
|---|---|---|---|
| Supervisor | `supervisor-hidria` | **APROBADO** (2026-11-07 20:20) | Este ADR + `task-27` (bloqueante para G3); registro en `reports/F1/00-supervisor_estado.md` |
| Revisor | `revisor-especificaciones` | **APROBADO con condiciones** (2026-11-07 20:20) | `reports/reviews/PR-7_spec.md` §5 + anexo ADR-007: B1/M2 en el mismo ciclo; `task-27` bloqueante de G3 con limpieza guardada (excepción documentada a `docs/07` §1.1); reflejar `invitado` si M2 lo añade |
| Seguridad | `seguridad-privacidad` | **APROBADO CON CONDICIONES** (2026-11-07 20:20) | `reports/security/PR-7_security.md` §7: limpieza forward-only con orden y guardas (no tocar org base `00000000-…0001` ni catálogo IVOH; abortar ante dependientes inesperados); guarda CI que impida inserts de fixtures en `supabase/migrations/**`; endurecer usuarios sintéticos (sin `email_confirmed_at`, solo `.invalid`, admin nunca en org real) |
