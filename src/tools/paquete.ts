import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { paths } from "../domain/paths.js";
import { soporteVencido } from "../domain/reglas.js";
import type { Checklist, ItemChecklist } from "../domain/types.js";
import { cargarSoportesIndex, type SoporteIndex } from "./fixtures-io.js";

/**
 * Construye el checklist de soportes exigidos y copia al paquete los que existen.
 * RN3: un soporte ausente o vencido bloquea listo_para_firma.
 */
export async function construirChecklistYCopiar(
  dir: string,
  caso: string,
  soportesExigidos: string[],
  fechaEjecucion: string,
): Promise<Checklist> {
  const indice = await cargarSoportesIndex(dir);
  const porTipo = new Map<string, SoporteIndex>(indice.map((s) => [s.tipo, s]));

  const paqueteDir = paths.outPaquete(dir, caso);
  await mkdir(paqueteDir, { recursive: true });

  const items: ItemChecklist[] = [];
  const bloqueos: string[] = [];

  for (const tipo of soportesExigidos) {
    const soporte = porTipo.get(tipo);

    if (!soporte) {
      items.push({ tipo, estado: "ausente", archivo: null, vigencia_hasta: null, nota: "No existe en el repositorio." });
      bloqueos.push(`Soporte exigido ausente: ${tipo}`);
      continue;
    }

    const vencido = soporteVencido(soporte.vigencia_hasta, fechaEjecucion);
    if (vencido) {
      items.push({
        tipo, estado: "vencido", archivo: soporte.archivo,
        vigencia_hasta: soporte.vigencia_hasta,
        nota: `Vencido el ${soporte.vigencia_hasta} (fecha de ejecucion ${fechaEjecucion}).`,
      });
      bloqueos.push(`Soporte vencido: ${tipo} (vigencia ${soporte.vigencia_hasta})`);
      // Se copia igual para que el humano lo tenga a la vista, pero bloquea.
      await copiarSoporte(dir, soporte.archivo, paqueteDir);
      continue;
    }

    await copiarSoporte(dir, soporte.archivo, paqueteDir);
    items.push({
      tipo, estado: "presente", archivo: soporte.archivo,
      vigencia_hasta: soporte.vigencia_hasta, nota: null,
    });
  }

  return { items, listo_para_firma: bloqueos.length === 0, bloqueos };
}

async function copiarSoporte(dir: string, archivo: string, destinoDir: string): Promise<void> {
  const origen = paths.soporteArchivo(dir, archivo);
  const destino = join(destinoDir, archivo);
  await copyFile(origen, destino);
}

/** Escribe checklist.md legible en el paquete. */
export async function escribirChecklistMd(
  dir: string,
  caso: string,
  checklist: Checklist,
): Promise<void> {
  const lineas: string[] = ["# Checklist de soportes", ""];
  lineas.push(`Estado: ${checklist.listo_para_firma ? "LISTO PARA FIRMA" : "BLOQUEADO"}`, "");
  lineas.push("| Soporte | Estado | Vigencia | Nota |", "|---|---|---|---|");
  for (const it of checklist.items) {
    lineas.push(`| ${it.tipo} | ${it.estado} | ${it.vigencia_hasta ?? "-"} | ${it.nota ?? "-"} |`);
  }
  if (checklist.bloqueos.length > 0) {
    lineas.push("", "## Bloqueos", "");
    for (const b of checklist.bloqueos) lineas.push(`- ${b}`);
  }
  lineas.push("");
  await writeFile(join(paths.outPaquete(dir, caso), "checklist.md"), lineas.join("\n"), "utf8");
}

/**
 * Borrador de correo para la analista. RN2: nunca incluye datos bancarios.
 */
export async function escribirBorradorCorreo(
  dir: string,
  caso: string,
  cliente: string,
  rutaFormulario: string,
  checklist: Checklist,
): Promise<void> {
  const presentes = checklist.items.filter((i) => i.estado === "presente").map((i) => i.tipo);
  const pendientes = checklist.items.filter((i) => i.estado !== "presente").map((i) => i.tipo);

  const lineas: string[] = [
    `# Borrador de correo - ${cliente}`,
    "",
    `Asunto: Registro de Periferia IT Group como proveedor`,
    "",
    "Estimados,",
    "",
    "Adjuntamos el formulario de registro diligenciado junto con los soportes",
    "solicitados para su revision.",
    "",
    `- Formulario: ${rutaFormulario}`,
    presentes.length ? `- Soportes adjuntos: ${presentes.join(", ")}` : "- Soportes adjuntos: (ninguno)",
  ];
  if (pendientes.length) {
    lineas.push(`- Soportes pendientes de actualizar: ${pendientes.join(", ")}`);
  }
  lineas.push(
    "",
    "Quedamos atentos a cualquier observacion.",
    "",
    "Cordialmente,",
    "Area Administrativa - Periferia IT Group",
    "",
    "> Nota: este es un borrador. No incluye datos bancarios por politica interna.",
    "",
  );
  await writeFile(join(paths.outPaquete(dir, caso), "borrador-correo.md"), lineas.join("\n"), "utf8");
}

/** Copia el formulario generado dentro del paquete, si existe en out/<caso>. */
export async function copiarFormularioAlPaquete(
  dir: string,
  caso: string,
  nombreArchivoFormulario: string,
): Promise<void> {
  try {
    const origen = join(paths.outCaso(dir, caso), nombreArchivoFormulario);
    const destino = join(paths.outPaquete(dir, caso), nombreArchivoFormulario);
    await readFile(origen); // confirma que existe
    await copyFile(origen, destino);
  } catch {
    // Si el formulario no se genero (ej. portal), no se copia. No es error fatal.
  }
}
