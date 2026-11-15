/**
 * HIDRIA — lector XLSX mínimo y seguro (sin dependencias) para EF-09.
 *
 * Tarea `task-135` (F1-08b). Soporta ZIP (stored/deflate) + `xl/workbook.xml`,
 * `xl/_rels/workbook.xml.rels`, `xl/sharedStrings.xml` y hojas. Límites anti
 * zip-bomb y rechazo de fórmulas/macros. No evalúa fórmulas ni XML externo.
 */

import { ApiError } from "./errors.ts";

export interface XlsxLimits {
  readonly maxEntries: number;
  readonly maxTotalUncompressedBytes: number;
  readonly maxEntryUncompressedBytes: number;
  readonly maxEntryRatio: number;
  readonly maxRows: number;
}

export const DEFAULT_XLSX_LIMITS: XlsxLimits = {
  maxEntries: 256,
  maxTotalUncompressedBytes: 25 * 1024 * 1024,
  maxEntryUncompressedBytes: 10 * 1024 * 1024,
  maxEntryRatio: 200,
  maxRows: 2000,
};

export interface XlsxSheet {
  readonly name: string;
  /** fila (1-based) → columna (1-based) → valor textual. */
  readonly rows: ReadonlyMap<number, ReadonlyMap<number, string>>;
}

export interface ParsedWorkbook {
  readonly sheets: readonly XlsxSheet[];
}

/** Opciones de parseo: BHE permite fórmulas solo en celdas de totales/resumen conocidas. */
export interface XlsxParseOptions {
  readonly allowFormula?: (
    sheetName: string,
    row: number,
    column: number,
  ) => boolean;
}

function structureError(
  reason: string,
  details: Record<string, unknown> = {},
): ApiError {
  return new ApiError(
    "VALIDATION_XLSX_ESTRUCTURA",
    "El archivo no corresponde a la plantilla XLSX esperada.",
    { reason, ...details },
  );
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(
      /&#x([0-9a-fA-F]+);/g,
      (_, hex) => String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function xmlText(fragment: string): string {
  const texts: string[] = [];
  const regex = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(fragment)) !== null) {
    texts.push(decodeXmlEntities(match[1]));
  }
  return texts.join("");
}

function columnIndex(letters: string): number {
  let value = 0;
  for (const char of letters.toUpperCase()) {
    value = value * 26 + (char.charCodeAt(0) - 64);
  }
  return value;
}

interface ZipEntry {
  readonly name: string;
  readonly bytes: Uint8Array;
}

/**
 * Inflate **streaming** con tope duro: acumula por chunks y cancela el stream en
 * cuanto el tamaño descomprimido excede `maxBytes` (SEC-PR64-01: nunca se
 * materializa una entrada bomba completa en memoria).
 */
async function inflateRawCapped(
  data: Uint8Array,
  maxBytes: number,
): Promise<Uint8Array> {
  const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(
    new DecompressionStream("deflate-raw"),
  );
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw structureError("zip_bomba_detectada", {
          max_bytes: maxBytes,
        });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function readZipEntries(
  bytes: Uint8Array,
  limits: XlsxLimits,
): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = new Map<string, Uint8Array>();
  let offset = 0;
  let totalUncompressed = 0;
  while (offset + 30 <= bytes.byteLength) {
    if (view.getUint32(offset, true) !== 0x04034b50) break;
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    if (nameStart + nameLength > bytes.byteLength) break;
    const name = new TextDecoder().decode(
      bytes.subarray(nameStart, nameStart + nameLength),
    );
    const dataStart = nameStart + nameLength + extraLength;
    if (dataStart + compressedSize > bytes.byteLength) break;
    const data = bytes.subarray(dataStart, dataStart + compressedSize);
    offset = dataStart + compressedSize;
    if (entries.size >= limits.maxEntries) {
      throw structureError("zip_demasiadas_entradas", {
        max_entries: limits.maxEntries,
      });
    }
    if (flags & 0x0001) {
      throw structureError("zip_cifrado_no_permitido");
    }
    const remainingTotal = limits.maxTotalUncompressedBytes - totalUncompressed;
    const ratioCap = compressedSize > 0
      ? Math.max(compressedSize * limits.maxEntryRatio, 1024)
      : limits.maxEntryUncompressedBytes;
    const cap = Math.min(
      limits.maxEntryUncompressedBytes,
      remainingTotal,
      ratioCap,
    );
    if (cap <= 0) {
      throw structureError("zip_demasiado_grande", {
        max_bytes: limits.maxTotalUncompressedBytes,
      });
    }
    let content: Uint8Array;
    if (method === 0) {
      content = data;
      if (content.byteLength > cap) {
        throw structureError("zip_bomba_detectada", { max_bytes: cap });
      }
    } else if (method === 8) {
      content = await inflateRawCapped(data, cap);
    } else {
      throw structureError("zip_metodo_no_soportado", { method });
    }
    totalUncompressed += content.byteLength;
    if (totalUncompressed > limits.maxTotalUncompressedBytes) {
      throw structureError("zip_demasiado_grande", {
        max_bytes: limits.maxTotalUncompressedBytes,
      });
    }
    if (
      compressedSize > 0 &&
      content.byteLength / compressedSize > limits.maxEntryRatio
    ) {
      throw structureError("zip_ratio_sospechoso", { name });
    }
    entries.set(name, content);
  }
  if (entries.size === 0) throw structureError("zip_vacio");
  return entries;
}

function decode(entry: Uint8Array | undefined, name: string): string {
  if (entry === undefined) throw structureError("falta_archivo_xlsx", { name });
  const text = new TextDecoder("utf-8").decode(entry);
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) {
    throw structureError("xml_no_seguro", { name });
  }
  return text;
}

function resolveTarget(target: string): string {
  const cleaned = target.replace(/^\/+/, "").replace(/^\.\.\//, "");
  return cleaned.startsWith("xl/") ? cleaned : `xl/${cleaned}`;
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const regex = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    strings.push(xmlText(match[1]));
  }
  return strings;
}

function parseSheetRows(
  xml: string,
  shared: readonly string[],
  limits: XlsxLimits,
  sheetName: string,
  options: XlsxParseOptions,
): Map<number, Map<number, string>> {
  const rows = new Map<number, Map<number, string>>();
  const cellRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let match: RegExpExecArray | null;
  while ((match = cellRegex.exec(xml)) !== null) {
    const attrs = match[1] ?? "";
    const inner = match[2] ?? "";
    const refMatch = /\br="([A-Z]+)(\d+)"/.exec(attrs);
    if (refMatch === null) continue;
    const rowNumber = Number(refMatch[2]);
    const columnNumber = columnIndex(refMatch[1]);
    if (/<f(?:\s|\/?>)/.test(inner)) {
      // BHE: fórmulas permitidas solo en celdas de totales/resumen conocidas
      // (se ignoran y se recalculan server-side); resto ⇒ rechazo.
      if (
        options.allowFormula !== undefined &&
        options.allowFormula(sheetName, rowNumber, columnNumber)
      ) {
        continue;
      }
      throw structureError("formula_no_permitida");
    }
    if (rowNumber > limits.maxRows) {
      throw structureError("demasiadas_filas", { max_rows: limits.maxRows });
    }
    const typeMatch = /\bt="([^"]+)"/.exec(attrs);
    const type = typeMatch === null ? "n" : typeMatch[1];
    let value = "";
    if (type === "inlineStr") {
      value = xmlText(inner);
    } else {
      const valueMatch = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner);
      const raw = valueMatch === null ? "" : decodeXmlEntities(valueMatch[1]);
      if (type === "s") {
        const index = Number(raw);
        if (!Number.isInteger(index) || index < 0 || index >= shared.length) {
          throw structureError("shared_string_invalido", { ref: match[0] });
        }
        value = shared[index];
      } else if (type === "b") {
        value = raw === "1" ? "TRUE" : "FALSE";
      } else {
        value = raw;
      }
    }
    if (value.length === 0) continue;
    const columns = rows.get(rowNumber) ?? new Map<number, string>();
    columns.set(columnIndex(refMatch[1]), value);
    rows.set(rowNumber, columns);
  }
  return rows;
}

function parseWorkbookSheets(
  xml: string,
): Array<{ name: string; rid: string }> {
  const sheets: Array<{ name: string; rid: string }> = [];
  const regex = /<sheet\b([^>]*)\/?>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    const attrs = match[1];
    const name = /\bname="([^"]+)"/.exec(attrs)?.[1];
    const rid = /\br:id="([^"]+)"/.exec(attrs)?.[1];
    if (name !== undefined && rid !== undefined) {
      sheets.push({ name: decodeXmlEntities(name), rid });
    }
  }
  return sheets;
}

function parseRels(xml: string): Map<string, string> {
  const rels = new Map<string, string>();
  const regex = /<Relationship\b([^>]*)\/?>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    const attrs = match[1];
    const id = /\bId="([^"]+)"/.exec(attrs)?.[1];
    const target = /\bTarget="([^"]+)"/.exec(attrs)?.[1];
    if (id !== undefined && target !== undefined) {
      rels.set(id, resolveTarget(target));
    }
  }
  return rels;
}

/**
 * Parsea un XLSX en memoria. Lanza `VALIDATION_XLSX_ESTRUCTURA` si no es un
 * libro válido, contiene fórmulas/macros o supera los límites de seguridad.
 */
export async function parseXlsx(
  bytes: Uint8Array,
  limits: XlsxLimits = DEFAULT_XLSX_LIMITS,
  options: XlsxParseOptions = {},
): Promise<ParsedWorkbook> {
  const entries = await readZipEntries(bytes, limits);
  if (entries.has("xl/vbaProject.bin")) {
    throw structureError("macros_no_permitidas");
  }
  const workbookXml = decode(entries.get("xl/workbook.xml"), "xl/workbook.xml");
  const relsXml = decode(
    entries.get("xl/_rels/workbook.xml.rels"),
    "xl/_rels/workbook.xml.rels",
  );
  const sharedXml = entries.has("xl/sharedStrings.xml")
    ? decode(entries.get("xl/sharedStrings.xml"), "xl/sharedStrings.xml")
    : "";
  const shared = parseSharedStrings(sharedXml);
  const rels = parseRels(relsXml);
  const sheets: XlsxSheet[] = [];
  for (const sheet of parseWorkbookSheets(workbookXml)) {
    const target = rels.get(sheet.rid);
    if (target === undefined) {
      throw structureError("hoja_sin_relacion", { sheet: sheet.name });
    }
    const xml = decode(entries.get(target), target);
    sheets.push({
      name: sheet.name,
      rows: parseSheetRows(xml, shared, limits, sheet.name, options),
    });
  }
  if (sheets.length === 0) throw structureError("sin_hojas");
  return { sheets };
}
