/**
 * HIDRIA — replicación en EF de los gates de fase TD-1 (EF-01).
 *
 * Tarea `task-95` (F1-04). El trigger `diagnostics_phase_gate` sigue siendo la **autoridad
 * final**; estas guardas permiten responder 409 antes de tocar datos y son la fuente de
 * `p_gate` (entregable/folio de respaldo). Mensajes idénticos a los del trigger (`Gate Fx…`).
 *
 * TD-1 (docs/04 §5): filas 1–5 son EF-01; la fila 6 (`estado→reportado`) es EF-07 (decisión
 * del revisor, 2026-11-12). Cadena de hitos siguiente (decisión del revisor):
 * `2→R2, 3→V1, 4→R3, 5→R4, 6→R5`.
 */

export type GateCode =
  | "GATE_CHECKLIST_R1"
  | "GATE_CAT_R2"
  | "GATE_IIH_V1"
  | "GATE_BHE_R3"
  | "GATE_IVOH_R4";

/** Datos mínimos que la EF lee para replicar el gate de la fase origen. */
export interface GateData {
  /** `document_checklist_items` con `item_code='layout'` (fase 1). */
  readonly checklistLayout?: { estado: string } | null;
  /** `diagnostics.cat_estado` (fase 2). */
  readonly catEstado: string;
  /** `iih_assets` del diagnóstico (fase 3). */
  readonly iih?: { total: number; unverified: number } | null;
  /** `water_balances` vigente (fase 4). */
  readonly balance?: {
    estado: string;
    maxBrechaPct: number | null;
  } | null;
  /** Factores IVOH en `validado_r4` (fase 5). */
  readonly ivohValidatedCount: number;
  /** Ficha de bitácora de respaldo: estado y folio. */
  readonly ficha?:
    | { clave: string; estado: string; folio: string | null }
    | null;
}

export interface GateOk {
  readonly ok: true;
  readonly code: null;
  readonly entregable: string;
  readonly folioRespaldo: string | null;
  readonly fichaClave: string;
}

export interface GateFail {
  readonly ok: false;
  readonly code: GateCode | "CONFLICT_PHASE";
  readonly message: string;
  readonly details: Record<string, unknown>;
}

export type GateResult = GateOk | GateFail;

/** Mensajes canónicos del trigger `diagnostics_phase_gate` (docs/04 §8 / docs/05 PG). */
export const GATE_MESSAGES: Readonly<Record<GateCode, string>> = {
  GATE_CHECKLIST_R1:
    "Gate F2: la lista de cotejo (layout) no está validada en R1.",
  GATE_CAT_R2: "Gate F3: el CAT no está validado en R2.",
  GATE_IIH_V1: "Gate F4: el IIH tiene activos sin verificar en V1.",
  GATE_BHE_R3: "Gate F5: el balance hídrico no está validado en R3.",
  GATE_IVOH_R4: "Gate F6: el IVOH no está validado en R4.",
};

/** Hito que sigue al entrar a cada fase (decisión del revisor; `3→V1`, no `V2`). */
export const NEXT_MILESTONE_BY_PHASE: Readonly<Record<number, string>> = {
  2: "R2",
  3: "V1",
  4: "R3",
  5: "R4",
  6: "R5",
};

/** Ficha de respaldo exigida por TD-1 para cada fase origen. */
export function fichaClaveForPhase(faseOrigen: number): string | null {
  switch (faseOrigen) {
    case 1:
      return "R1";
    case 2:
      return "R2";
    case 3:
      return "V1";
    case 4:
      return "R3";
    case 5:
      return "R4";
    default:
      return null;
  }
}

const GATE_CODE_BY_PHASE: Readonly<Record<number, GateCode>> = {
  1: "GATE_CHECKLIST_R1",
  2: "GATE_CAT_R2",
  3: "GATE_IIH_V1",
  4: "GATE_BHE_R3",
  5: "GATE_IVOH_R4",
};

/**
 * `proximo_hito` (texto). Formato `"<clave> · YYYY-MM-DD"` **solo** si hay fecha canónica;
 * no se calcula desde `fecha_inicio` (decisión del revisor).
 */
export function formatProximoHito(
  clave: string | null,
  fechaCanonica?: string,
): string | null {
  if (clave === null) return null;
  return fechaCanonica === undefined ? clave : `${clave} · ${fechaCanonica}`;
}

/**
 * Evalúa el gate de la fase origen (TD-1 filas 1–5). La fila 6 no aplica a EF-01
 * (`estado→reportado` es EF-07): desde fase 6 la EF responde `CONFLICT_PHASE`.
 *
 * @param faseOrigen 1..5
 * @param data lecturas del diagnóstico (checklist, CAT, IIH, BHE, IVOH y ficha de respaldo)
 */
export function evaluatePhaseGate(
  faseOrigen: number,
  data: GateData,
): GateResult {
  const code = GATE_CODE_BY_PHASE[faseOrigen];
  const fichaClave = fichaClaveForPhase(faseOrigen);
  if (code === undefined || fichaClave === null) {
    return {
      ok: false,
      code: "CONFLICT_PHASE",
      message: "No se puede avanzar desde la fase indicada.",
      details: { fase_origen: faseOrigen },
    };
  }

  const ficha = data.ficha;
  if (ficha === null || ficha === undefined || ficha.clave !== fichaClave) {
    return {
      ok: false,
      code,
      message: GATE_MESSAGES[code],
      details: { reason: "ficha", ficha_clave: fichaClave },
    };
  }
  if (ficha.estado !== "cerrada") {
    return {
      ok: false,
      code,
      message: GATE_MESSAGES[code],
      details: {
        reason: "ficha",
        ficha_clave: fichaClave,
        estado_ficha: ficha.estado,
      },
    };
  }
  const folioRespaldo = ficha.folio ?? null;

  const failure = (details: Record<string, unknown>): GateFail => ({
    ok: false,
    code,
    message: GATE_MESSAGES[code],
    details,
  });

  switch (faseOrigen) {
    case 1:
      if (data.checklistLayout?.estado !== "validado_r1") {
        return failure({
          item_code: "layout",
          estado_actual: data.checklistLayout?.estado ?? null,
        });
      }
      return {
        ok: true,
        code: null,
        entregable: "document_checklist_items['layout'].estado='validado_r1'",
        folioRespaldo,
        fichaClave,
      };
    case 2:
      if (data.catEstado !== "validado_r2") {
        return failure({ cat_estado: data.catEstado });
      }
      return {
        ok: true,
        code: null,
        entregable: "diagnostics.cat_estado='validado_r2'",
        folioRespaldo,
        fichaClave,
      };
    case 3: {
      const iih = data.iih;
      if (iih === null || iih === undefined || iih.unverified > 0) {
        return failure({
          activos_total: iih?.total ?? 0,
          activos_sin_verificar: iih?.unverified ?? 0,
        });
      }
      return {
        ok: true,
        code: null,
        entregable: "todos iih_assets.verificado_v1=true",
        folioRespaldo,
        fichaClave,
      };
    }
    case 4: {
      const balance = data.balance;
      if (
        balance === null || balance === undefined ||
        balance.estado !== "validado_r3"
      ) {
        return failure({ estado_balance: balance?.estado ?? null });
      }
      if (balance.maxBrechaPct !== null && balance.maxBrechaPct > 10) {
        return failure({
          motivo: "brecha",
          max_brecha_pct: balance.maxBrechaPct,
        });
      }
      return {
        ok: true,
        code: null,
        entregable: "water_balances.estado='validado_r3' y brecha mensual ≤10%",
        folioRespaldo,
        fichaClave,
      };
    }
    case 5:
      if (data.ivohValidatedCount < 6) {
        return failure({
          factores_validados: data.ivohValidatedCount,
          factores_requeridos: 6,
        });
      }
      return {
        ok: true,
        code: null,
        entregable: "6/6 ivoh_evaluations.estado='validado_r4'",
        folioRespaldo,
        fichaClave,
      };
    default:
      return {
        ok: false,
        code: "CONFLICT_PHASE",
        message: "No se puede avanzar desde la fase indicada.",
        details: { fase_origen: faseOrigen },
      };
  }
}
