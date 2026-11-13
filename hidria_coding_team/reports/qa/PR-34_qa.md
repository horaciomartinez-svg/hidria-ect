# PR #34 — QA: follow-ups SEC-PR29-01/03 (allowlist estricta + fixtures CI)

- **Agente:** `qa-tester` (05)
- **Fecha:** 2026-11-08 14:20 (America/Mexico_City)
- **Tarea:** `task-79` — QA PR #34 (task-50 follow-ups)
- **PR:** [#34](https://github.com/horaciomartinez-svg/hidria-ect/pull/34) — `ci/F1-19-ci-hardening-followups` → `main`
- **Head evaluado:** `c624ecac66f3c629b4780b2a3b3867a788efb0f4` · **Base:** `main` `82d77ad`
- **Diff:** 13 archivos, +372/−9 — CI/scripts/fixtures/reportes; sin producto, BD, migraciones ni `docs/02`.
- **CI:** **12/12 check runs success** (runs `43346849743` PR y `43346843073` push; 6 jobs: Guardas, Cliente, Deno, pgTAP, E2E, **Seguridad**). Job Seguridad ~59 s; workflow ~2 min.

## Resultado: **VERDE** — merge permitido; SEC-PR29-01/03 cerrados

> La allowlist queda **cerrada por construcción** (schema: GHSA válido + `packages` no vacío +
> razón/tarea; sin wildcard), los fixtures negativos/positivos están versionados y el job
> `Seguridad` ejecuta el self-test. Los 6 casos del selftest pasan, `build-guard-test` 5/5
> (incluye `sb_publishable_*`), `npm audit` prod 0 high/critical y `docs/02` intacto. Sin
> secretos reales en fixtures (sintéticos y excluidos del secret scan con justificación).

## 1. Self-test local (`c624eca`, sin `.env`)

```text
node scripts/ci/hardening-selftest.mjs
[selftest] OK npm-audit: high no allowlisted → bloquea (exit=1, esperado=1)
[selftest] OK npm-audit: high allowlisted → acepta (exit=0, esperado=0)
[selftest] OK npm-audit: critical allowlisted → bloquea (exit=1, esperado=1)
[selftest] OK npm-audit: allowlist packages vacío (wildcard) → schema inválido (exit=2, esperado=2)
[selftest] OK dist-scan: credenciales inyectadas → bloquea (exit=1, esperado=1)
[selftest] OK dist-scan: solo literal service_role (guarda) → acepta con aviso (exit=0, esperado=0)
[selftest] OK: fixtures ... se comportan como se espera.
```

- **`npm-audit`**: schema v2 valida GHSA `GHSA-xxxx-xxxx-xxxx`, `packages` array no vacío (sin
  wildcard), `reason` y `task`; allowlist inválida → **exit 2** (no se ignora). `critical`
  nunca se acepta, aunque el GHSA esté allowlisted.
- **`dist-scan`**: `bundle-bad` (sb_secret + SERVICE_ROLE_KEY + JWT service_role) → **exit 1**;
  `bundle-ok` (solo literal `service_role`) → **exit 0** con aviso.
- **`build-guard-test` 5/5**: anon OK, `sb_publishable_*` OK, `sb_secret_*`/JWT service_role/
  ilegible fallan.
- **`npm audit` real**: producción 2 moderate, **0 high/critical**; exit 0.

## 2. Job CI `Seguridad (dependencias y bundle)`

Pasos ejecutados en CI (run `43346849743`, job `131628150844` success): checkout → Node 22 →
`npm ci` → `npm-audit` → build → `build-guard-test` → `dist-scan` → **`hardening-selftest`**
(todos success). Los otros 5 jobs siguen intactos; el workflow solo **añade** el step de
selftest. `dist-scan` es local (sin red); el audit usa npm/red como corresponde. Job ~59 s,
workflow <5 min.

## 3. Seguridad de los fixtures y alcance

- Los fixtures contienen **secretos/JWT sintéticos** (`sb_secret_aaaa…`, JWT de fixture) para
  probar que los escáneres fallan; `scripts/ci/guardas.sh` los excluye explícitamente
  (`scripts/ci/fixtures/**`) con justificación. Secret scan del resto del árbol limpio.
- Sin credenciales reales, sin PII, sin `.env`; fixtures locales y deterministas.
- `docs/02` blob `a2394bce…` intacto; alcance 13 archivos CI/scripts/reportes; sin
  `app/**`, `supabase/**`, migraciones ni `docs/**`.

## 4. Trazabilidad

- **SEC-PR29-01 cerrado**: allowlist sin wildcard, schema estricto y fixture negativo.
- **SEC-PR29-03 cerrado**: fixtures versionados y self-test ejecutado por CI.
- **SEC-PR29-05/06**: build-guard 5/5 incluye publishable y allowlist registra
  `expected_severity`/`re_evaluate_by` (task-53).
- **SEC-PR29-02 sigue pendiente** (check `Seguridad` no required hasta que el usuario lo añada;
  condición pre-G1, no blocker de #34). Sin verdes de reglas R-* (es CI/seguridad).

## Dictamen

**VERDE — merge permitido.** Selftest 6/6, build-guard 5/5, audit prod 0 high/critical,
job Seguridad ejecuta el self-test, fixtures sintéticos y secret scan limpio, `docs/02` intacto.
SEC-PR29-01/03 cerrados; SEC-PR29-02 (required) queda como acción de usuario pre-G1. QA no
mergea; no se ejecutó git de escritura.

## Firma

QA `qa-tester`. Solo este reporte y `qa/trazabilidad.md`; sin modificar `app/**`,
`supabase/**`, `.github/**` ni `docs/**`. Sin secretos.

---

## Actualización 2026-11-13 — SEC-PR29-02 CERRADO

El usuario confirmó que el check **Seguridad (dependencias y bundle)** ya es **required** en el ruleset proteccion-main (id 26780941): **6 checks required** activos (Guardas, Cliente, Deno, pgTAP, E2E y Seguridad), con approvals 0, 
on_fast_forward/deletion y sin bypass. Condición pre-G1 **SEC-PR29-02 cumplida**; no queda acción pendiente.
