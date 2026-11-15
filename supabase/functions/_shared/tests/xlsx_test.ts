/**
 * F1-08b — pruebas del lector XLSX propio (ZIP+XML, sin dependencias).
 */

import { assert, assertEquals } from "./asserts.ts";
import { ApiError } from "../errors.ts";
import { parseXlsx } from "../xlsx.ts";

function zipStored(entries: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  for (const [name, content] of Object.entries(entries)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, nameBytes.length, true);
    header.set(nameBytes, 30);
    chunks.push(header, data);
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function workbookFiles(sheetXml: string): Record<string, string> {
  return {
    "xl/workbook.xml":
      '<workbook><sheets><sheet name="Hoja1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/sharedStrings.xml":
      "<sst><si><t>Hola</t></si><si><t>Mundo &amp; Cía</t></si></sst>",
    "xl/worksheets/sheet1.xml": sheetXml,
  };
}

function throwsApi(fn: () => Promise<unknown>, reason: string): Promise<void> {
  return fn().then(
    () => {
      throw new Error("se esperaba ApiError " + reason);
    },
    (error) => {
      assert(error instanceof ApiError);
      assertEquals(error.code, "VALIDATION_XLSX_ESTRUCTURA");
      assertEquals((error.details as { reason?: string })?.reason, reason);
    },
  );
}

Deno.test("XLSX: parsea celdas shared/numeric/inline y filas", async () => {
  const sheetXml = "<worksheet><sheetData>" +
    '<row r="1"><c r="A1" t="s"><v>0</v></c></row>' +
    '<row r="2"><c r="B2"><v>42</v></c></row>' +
    '<row r="3"><c r="C3" t="inlineStr"><is><t>Texto</t></is></c></row>' +
    "</sheetData></worksheet>";
  const workbook = await parseXlsx(zipStored(workbookFiles(sheetXml)));
  assertEquals(workbook.sheets.length, 1);
  const sheet = workbook.sheets[0];
  assertEquals(sheet.name, "Hoja1");
  assertEquals(sheet.rows.get(1)?.get(1), "Hola");
  assertEquals(sheet.rows.get(2)?.get(2), "42");
  assertEquals(sheet.rows.get(3)?.get(3), "Texto");
});

Deno.test("XLSX: rechaza fórmulas y XML con DOCTYPE", async () => {
  const formula = '<worksheet><sheetData><row r="8">' +
    '<c r="B8"><f>SUM(A1:A2)</f><v>3</v></c></row></sheetData></worksheet>';
  await throwsApi(
    () => parseXlsx(zipStored(workbookFiles(formula))),
    "formula_no_permitida",
  );

  const files = workbookFiles("<worksheet/>");
  files["xl/workbook.xml"] =
    '<!DOCTYPE x [<!ENTITY e "x">]><workbook><sheets><sheet name="Hoja1" r:id="rId1"/></sheets></workbook>';
  await throwsApi(() => parseXlsx(zipStored(files)), "xml_no_seguro");
});

Deno.test("XLSX: límites de entradas y relación de hoja obligatoria", async () => {
  const many: Record<string, string> = {
    "xl/workbook.xml":
      '<workbook><sheets><sheet name="Hoja1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": "<worksheet/>",
  };
  for (let index = 0; index < 5; index += 1) many[`extra${index}.xml`] = "x";
  await throwsApi(
    () =>
      parseXlsx(zipStored(many), {
        maxEntries: 2,
        maxTotalUncompressedBytes: 10_000,
        maxEntryRatio: 200,
        maxRows: 100,
      }),
    "zip_demasiadas_entradas",
  );

  const noRels: Record<string, string> = {
    "xl/workbook.xml":
      '<workbook><sheets><sheet name="Hoja1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": "<Relationships/>",
    "xl/worksheets/sheet1.xml": "<worksheet/>",
  };
  await throwsApi(
    () => parseXlsx(zipStored(noRels)),
    "hoja_sin_relacion",
  );
});

Deno.test("XLSX: no es un ZIP/XLSX ⇒ VALIDATION_XLSX_ESTRUCTURA", async () => {
  await throwsApi(
    () => parseXlsx(new TextEncoder().encode("no soy un zip")),
    "zip_vacio",
  );
});
