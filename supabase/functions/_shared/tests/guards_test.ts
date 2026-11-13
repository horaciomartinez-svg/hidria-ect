/**
 * F1-04 — pruebas de `_shared/guards.ts` (replicación TD-1, fichas y `proximo_hito`).
 */

import { assert, assertEquals } from "./asserts.ts";
import {
  evaluatePhaseGate,
  fichaClaveForPhase,
  formatProximoHito,
  GATE_MESSAGES,
  type GateData,
  NEXT_MILESTONE_BY_PHASE,
} from "../guards.ts";

function data(overrides: Partial<GateData> = {}): GateData {
  return {
    checklistLayout: { estado: "validado_r1" },
    catEstado: "validado_r2",
    iih: { total: 3, unverified: 0 },
    balance: { estado: "validado_r3", maxBrechaPct: 8.5 },
    ivohValidatedCount: 6,
    ficha: { clave: "R1", estado: "cerrada", folio: "BIT-R1-01" },
    ...overrides,
  };
}

Deno.test("gate F2: checklist R1 + ficha R1 cerrada ⇒ ok con folio_respaldo", () => {
  const result = evaluatePhaseGate(1, data());
  assertEquals(result.ok, true);
  if (!result.ok) throw new Error("se esperaba gate ok");
  assertEquals(result.fichaClave, "R1");
  assertEquals(result.folioRespaldo, "BIT-R1-01");
  assert(result.entregable.includes("validado_r1"));
});

Deno.test("gate F2: checklist no validado ⇒ GATE_CHECKLIST_R1 con mensaje del trigger", () => {
  const result = evaluatePhaseGate(
    1,
    data({ checklistLayout: { estado: "revisado" } }),
  );
  assertEquals(result.ok, false);
  if (result.ok) throw new Error("se esperaba gate fail");
  assertEquals(result.code, "GATE_CHECKLIST_R1");
  assertEquals(result.message, GATE_MESSAGES.GATE_CHECKLIST_R1);
  assertEquals(result.details, {
    item_code: "layout",
    estado_actual: "revisado",
  });
});

Deno.test("gate: ficha ausente o abierta ⇒ mismo GATE_* con reason='ficha'", () => {
  const missing = evaluatePhaseGate(3, data({ ficha: null }));
  assertEquals(missing.ok, false);
  if (missing.ok) throw new Error("se esperaba fail");
  assertEquals(missing.code, "GATE_IIH_V1");
  assertEquals(missing.details, { reason: "ficha", ficha_clave: "V1" });

  const open = evaluatePhaseGate(
    4,
    data({ ficha: { clave: "R3", estado: "abierta", folio: "BIT-R3-09" } }),
  );
  assertEquals(open.ok, false);
  if (open.ok) throw new Error("se esperaba fail");
  assertEquals(open.details.reason, "ficha");
  assertEquals(open.details.estado_ficha, "abierta");
});

Deno.test("gate F3: CAT validado R2 + ficha R2", () => {
  const ok = evaluatePhaseGate(
    2,
    data({ ficha: { clave: "R2", estado: "cerrada", folio: "BIT-R2-01" } }),
  );
  assertEquals(ok.ok, true);

  const fail = evaluatePhaseGate(
    2,
    data({
      catEstado: "en_revision",
      ficha: { clave: "R2", estado: "cerrada", folio: "BIT-R2-01" },
    }),
  );
  assertEquals(fail.ok, false);
  if (fail.ok) throw new Error("se esperaba fail");
  assertEquals(fail.code, "GATE_CAT_R2");
  assertEquals(fail.details.cat_estado, "en_revision");
});

Deno.test("gate F4: IIH con activos sin verificar ⇒ GATE_IIH_V1; sin activos ⇒ ok", () => {
  const fail = evaluatePhaseGate(
    3,
    data({
      iih: { total: 4, unverified: 1 },
      ficha: { clave: "V1", estado: "cerrada", folio: "BIT-V1-01" },
    }),
  );
  assertEquals(fail.ok, false);
  if (fail.ok) throw new Error("se esperaba fail");
  assertEquals(fail.code, "GATE_IIH_V1");
  assertEquals(fail.details.activos_sin_verificar, 1);

  const empty = evaluatePhaseGate(
    3,
    data({
      iih: { total: 0, unverified: 0 },
      ficha: { clave: "V1", estado: "cerrada", folio: null },
    }),
  );
  assertEquals(empty.ok, true);
});

Deno.test("gate F5: BHE validado R3 con brecha ≤10 ⇒ ok; brecha >10 o en captura ⇒ GATE_BHE_R3", () => {
  const ficha = { clave: "R3", estado: "cerrada", folio: "BIT-R3-01" };
  assertEquals(evaluatePhaseGate(4, data({ ficha })).ok, true);

  const brecha = evaluatePhaseGate(
    4,
    data({ ficha, balance: { estado: "validado_r3", maxBrechaPct: 12.6 } }),
  );
  assertEquals(brecha.ok, false);
  if (brecha.ok) throw new Error("se esperaba fail");
  assertEquals(brecha.code, "GATE_BHE_R3");
  assertEquals(brecha.details.motivo, "brecha");

  const captura = evaluatePhaseGate(
    4,
    data({ ficha, balance: { estado: "en_captura", maxBrechaPct: null } }),
  );
  assertEquals(captura.ok, false);
  if (captura.ok) throw new Error("se esperaba fail");
  assertEquals(captura.code, "GATE_BHE_R3");
});

Deno.test("gate F6: 6/6 IVOH validado R4 ⇒ ok; 5/6 ⇒ GATE_IVOH_R4", () => {
  const ficha = { clave: "R4", estado: "cerrada", folio: "BIT-R4-01" };
  assertEquals(evaluatePhaseGate(5, data({ ficha })).ok, true);

  const fail = evaluatePhaseGate(
    5,
    data({ ficha, ivohValidatedCount: 5 }),
  );
  assertEquals(fail.ok, false);
  if (fail.ok) throw new Error("se esperaba fail");
  assertEquals(fail.code, "GATE_IVOH_R4");
  assertEquals(fail.details.factores_validados, 5);
});

Deno.test("gate: fase 6 o fuera de rango ⇒ CONFLICT_PHASE (TD-1 fila 6 es EF-07)", () => {
  for (const fase of [0, 6, 7]) {
    const result = evaluatePhaseGate(fase, data({ ficha: null }));
    assertEquals(result.ok, false);
    if (result.ok) throw new Error("se esperaba fail");
    assertEquals(result.code, "CONFLICT_PHASE");
  }
});

Deno.test("mapa de hitos y formato de proximo_hito (sin fecha calculada)", () => {
  assertEquals(NEXT_MILESTONE_BY_PHASE[2], "R2");
  assertEquals(NEXT_MILESTONE_BY_PHASE[3], "V1");
  assertEquals(NEXT_MILESTONE_BY_PHASE[4], "R3");
  assertEquals(NEXT_MILESTONE_BY_PHASE[5], "R4");
  assertEquals(NEXT_MILESTONE_BY_PHASE[6], "R5");
  assertEquals(formatProximoHito("R2"), "R2");
  assertEquals(formatProximoHito("R2", "2026-11-20"), "R2 · 2026-11-20");
  assertEquals(formatProximoHito(null), null);
  assertEquals(fichaClaveForPhase(1), "R1");
  assertEquals(fichaClaveForPhase(5), "R4");
  assertEquals(fichaClaveForPhase(6), null);
});
