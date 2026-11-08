/**
 * F1-01b — aserciones mínimas para las pruebas Deno de `_shared/`.
 *
 * Se implementan localmente (≈80 líneas) para que las pruebas de las Edge Functions no
 * dependan de módulos remotos ni de `node_modules`: el runner de CI puede ejecutar
 * `deno test supabase/functions/_shared` sin red y sin configuración extra, condición
 * necesaria mientras el job Deno del CI sigue siendo un follow-up (B-04/F1-19).
 */

export function fail(message = "aserción fallida"): never {
  throw new Error(message);
}

export function assert(
  condition: unknown,
  message = "se esperaba una condición verdadera",
): asserts condition {
  if (!condition) {
    fail(message);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function render(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Igualdad estructural (profunda) para primitivos, arreglos y objetos planos. */
export function assertEquals<T>(
  actual: T,
  expected: T,
  message = "los valores no son iguales",
): void {
  if (!deepEqual(actual, expected)) {
    fail(
      `${message}\n  actual:   ${render(actual)}\n  esperado: ${
        render(expected)
      }`,
    );
  }
}

function deepEqual(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true;
  if (typeof actual !== typeof expected) return false;
  if (typeof actual === "number" && typeof expected === "number") {
    return Number.isNaN(actual) && Number.isNaN(expected);
  }
  if (Array.isArray(actual) || Array.isArray(expected)) {
    if (!Array.isArray(actual) || !Array.isArray(expected)) return false;
    if (actual.length !== expected.length) return false;
    return actual.every((item, index) => deepEqual(item, expected[index]));
  }
  if (isPlainObject(actual) && isPlainObject(expected)) {
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();
    if (!deepEqual(actualKeys, expectedKeys)) return false;
    return actualKeys.every((key) => deepEqual(actual[key], expected[key]));
  }
  return false;
}

/** Comprueba que `text` case con la expresión regular. */
export function assertMatch(
  text: string,
  pattern: RegExp,
  message = "el texto no coincide con el patrón esperado",
): void {
  if (!pattern.test(text)) {
    fail(`${message}\n  texto:   ${text}\n  patrón:  ${pattern}`);
  }
}

/** Comprueba que `text` NO contenga `needle` (p. ej. fugas de stack o mensajes internos). */
export function assertNotIncludes(
  text: string,
  needle: string,
  message = "el texto contiene un valor prohibido",
): void {
  if (text.includes(needle)) {
    fail(`${message}: ${needle}`);
  }
}
