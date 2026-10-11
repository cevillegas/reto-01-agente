import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { paths } from "../domain/paths.js";
import type { CampoMapeado } from "../domain/types.js";

/** Todos los campos que llevan un valor al formulario (llenos + confirmables). */
function camposConValor(campos: CampoMapeado[]): CampoMapeado[] {
  return campos.filter((c) => c.valor !== null);
}

/** Texto a escribir para un campo (marca los que requieren confirmacion). */
function valorMostrado(c: CampoMapeado): string {
  if (c.valor === null) return "(FALTANTE)";
  if (c.estado === "requiere_confirmacion") return `${c.valor} (confirmar)`;
  return c.valor;
}

/**
 * P0 - Excel. Escribe cada etiqueta y su valor en la hoja/celda indicadas por
 * la plantilla-celdas. Produce out/<caso>/formulario.xlsx.
 */
export async function generarXlsx(
  dir: string,
  caso: string,
  campos: CampoMapeado[],
): Promise<string> {
  const wb = XLSX.utils.book_new();

  // Agrupar campos por hoja
  const hojas: Record<string, CampoMapeado[]> = {};
  for (const c of campos) {
    if (!c.hoja || !c.celdaValor) continue;
    if (!hojas[c.hoja]) hojas[c.hoja] = [];
    hojas[c.hoja].push(c);
  }

  for (const [nombreHoja, camposHoja] of Object.entries(hojas)) {
    const ws: XLSX.WorkSheet = {};
    for (const c of camposHoja) {
      ws[c.celdaValor!] = { v: c.valor ?? "", t: "s" };
    }
    // Calcular rango desde las celdas usadas
    const refs = camposHoja.map((c) => c.celdaValor!);
    ws["!ref"] = refs.length > 0 ? XLSX.utils.encode_range(
      refs.reduce((acc, ref) => {
        const cell = XLSX.utils.decode_cell(ref);
        return {
          s: { r: Math.min(acc.s.r, cell.r), c: Math.min(acc.s.c, cell.c) },
          e: { r: Math.max(acc.e.r, cell.r), c: Math.max(acc.e.c, cell.c) },
        };
      }, { s: { r: Infinity, c: Infinity }, e: { r: -Infinity, c: -Infinity } })
    ) : "A1:A1";
    XLSX.utils.book_append_sheet(wb, ws, nombreHoja);
  }

  // Si no hay hojas con celdas definidas, agregar hoja vacía
  if (wb.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[""]]), "Formulario");
  }

  const outDir = paths.outCaso(dir, caso);
  await mkdir(outDir, { recursive: true });
  const ruta = join(outDir, "formulario.xlsx");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  await writeFile(ruta, buffer);
  return `out/${caso}/formulario.xlsx`;
}

/**
 * P1 - PDF. Genera un PDF con todos los campos (etiqueta: valor) en el orden
 * dado. No es un AcroForm rellenado; reproduce etiqueta y valor, que es lo que
 * el PRD acepta. Produce out/<caso>/formulario.pdf.
 */
export async function generarPdf(
  dir: string,
  caso: string,
  cliente: string,
  campos: CampoMapeado[],
): Promise<string> {
  const pdf = await PDFDocument.create();
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  const fuenteBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let pagina = pdf.addPage([595, 842]); // A4 vertical
  const margen = 50;
  let y = 790;

  pagina.drawText("Formulario de registro como proveedor", {
    x: margen, y, size: 16, font: fuenteBold, color: rgb(0, 0, 0),
  });
  y -= 24;
  pagina.drawText(`Cliente: ${cliente}`, { x: margen, y, size: 10, font: fuente });
  y -= 28;

  for (const c of campos) {
    if (y < margen + 40) {
      pagina = pdf.addPage([595, 842]);
      y = 790;
    }
    pagina.drawText(`${c.etiqueta}:`, { x: margen, y, size: 11, font: fuenteBold });
    y -= 15;
    pagina.drawText(valorMostrado(c), { x: margen + 10, y, size: 11, font: fuente });
    y -= 22;
  }

  const bytes = await pdf.save();
  const outDir = paths.outCaso(dir, caso);
  await mkdir(outDir, { recursive: true });
  const ruta = join(outDir, "formulario.pdf");
  await writeFile(ruta, bytes);
  return `out/${caso}/formulario.pdf`;
}

/**
 * P2 - Portal. No se implementa el llenado. Produce out/<caso>/valores-portal.md
 * con los valores listos para copiar manualmente.
 */
export async function generarPortal(
  dir: string,
  caso: string,
  cliente: string,
  campos: CampoMapeado[],
): Promise<string> {
  const lineas: string[] = [
    `# Valores para portal web - ${cliente}`,
    "",
    "> Formato \"portal\" no soportado para llenado automatico.",
    "> El ingreso de credenciales y el envio los realiza un humano.",
    "> Copia estos valores en el portal:",
    "",
    "| Campo | Valor | Estado |",
    "|---|---|---|",
  ];
  for (const c of campos) {
    lineas.push(`| ${c.etiqueta} | ${c.valor ?? "(faltante)"} | ${c.estado} |`);
  }
  lineas.push("");

  const outDir = paths.outCaso(dir, caso);
  await mkdir(outDir, { recursive: true });
  const ruta = join(outDir, "valores-portal.md");
  await writeFile(ruta, lineas.join("\n"), "utf8");
  return `out/${caso}/valores-portal.md`;
}

export { camposConValor };
