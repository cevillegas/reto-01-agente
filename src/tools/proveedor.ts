import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { paths } from "../domain/paths.js";
import { registrarLog } from "../domain/logger.js";
import type {
  CampoMapeado,
  CampoSolicitado,
  Checklist,
  Mapeo,
  SolicitudLeida,
  ToolContext,
} from "../domain/types.js";
import {
  cargarGlosario,
  cargarMaestro,
  cargarPlantillaCampos,
  cargarPlantillaCeldas,
  cargarSolicitud,
  cargarSoportesExigidos,
} from "./fixtures-io.js";
import { mapearCampos } from "./mapeo.js";
import {
  generarPdf,
  generarPortal,
  generarXlsx,
} from "./generadores.js";
import {
  construirChecklistYCopiar,
  copiarFormularioAlPaquete,
  escribirBorradorCorreo,
  escribirChecklistMd,
} from "./paquete.js";

/** Fecha de ejecucion para evaluar vigencias; configurable para determinismo. */
function fechaEjecucion(): string {
  return process.env.FECHA_EJECUCION ?? "2026-09-03";
}

/** Envuelve una operacion para garantizar el contrato: nunca lanza. */
async function seguro<T>(
  fn: () => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Herramienta: proveedor_leer_solicitud
// ---------------------------------------------------------------------------
export const leer_solicitud = {
  description:
    "Lee el correo del cliente y su plantilla; devuelve pais, cliente, formato de salida, los campos solicitados y los soportes exigidos.",
  args: {
    caso: z.string().describe("Nombre de la carpeta del caso en fixtures/reto-01/casos/"),
  },
  async execute(args: { caso: string }, ctx: ToolContext): Promise<string> {
    const r = await seguro<SolicitudLeida>(async () => {
      const solicitud = await cargarSolicitud(ctx.directory, args.caso);
      const soportes = await cargarSoportesExigidos(ctx.directory, args.caso);

      let campos: CampoSolicitado[] = [];
      if (solicitud.formato === "xlsx") {
        const celdas = await cargarPlantillaCeldas(ctx.directory, args.caso);
        campos = celdas.map((c) => ({
          etiqueta: c.etiqueta,
          obligatorio: true,
          hoja: c.hoja,
          celdaEtiqueta: c.celda_etiqueta,
          celdaValor: c.celda_valor,
        }));
      } else if (solicitud.formato === "pdf") {
        const camposPdf = await cargarPlantillaCampos(ctx.directory, args.caso);
        campos = camposPdf.map((c) => ({ etiqueta: c.etiqueta, obligatorio: c.obligatorio }));
      }
      // portal: no hay plantilla de campos adjunta; campos queda vacio.

      return {
        caso: args.caso,
        pais: solicitud.pais,
        cliente: solicitud.cliente,
        formato: solicitud.formato,
        campos,
        soportes,
      };
    });

    await registrarLog(ctx.directory, args.caso, {
      herramienta: "proveedor_leer_solicitud",
      ok: r.ok,
      resumen: r.ok
        ? `formato=${r.data.formato}, campos=${r.data.campos.length}, soportes=${r.data.soportes.length}`
        : r.error,
    });
    return JSON.stringify(r);
  },
};

// ---------------------------------------------------------------------------
// Herramienta: proveedor_mapear_campos
// ---------------------------------------------------------------------------
const campoSolicitadoSchema = z.object({
  etiqueta: z.string(),
  obligatorio: z.boolean(),
  hoja: z.string().optional(),
  celdaEtiqueta: z.string().optional(),
  celdaValor: z.string().optional(),
});

export const mapear_campos = {
  description:
    "Cruza cada campo solicitado contra el repositorio maestro usando el glosario; devuelve los campos llenos, faltantes y los que requieren confirmacion.",
  args: {
    caso: z.string().describe("Nombre de la carpeta del caso"),
    campos: z
      .array(campoSolicitadoSchema)
      .describe("Campos solicitados devueltos por proveedor_leer_solicitud"),
  },
  async execute(args: { caso: string; campos: CampoSolicitado[] }, ctx: ToolContext): Promise<string> {
    const r = await seguro<Mapeo>(async () => {
      const solicitud = await cargarSolicitud(ctx.directory, args.caso);
      const glosario = await cargarGlosario(ctx.directory);
      const maestro = await cargarMaestro(ctx.directory);
      return mapearCampos(args.campos, glosario, maestro, solicitud.pais);
    });

    await registrarLog(ctx.directory, args.caso, {
      herramienta: "proveedor_mapear_campos",
      ok: r.ok,
      resumen: r.ok
        ? `llenos=${r.data.llenos.length}, faltantes=${r.data.faltantes.length}, confirmacion=${r.data.requiere_confirmacion.length}`
        : r.error,
    });
    return JSON.stringify(r);
  },
};

// ---------------------------------------------------------------------------
// Herramienta: proveedor_generar_formulario
// ---------------------------------------------------------------------------
const mapeoSchema = z.object({
  llenos: z.array(z.any()),
  faltantes: z.array(z.any()),
  requiere_confirmacion: z.array(z.any()),
});

export const generar_formulario = {
  description:
    "Genera el formulario en el formato del cliente (xlsx, pdf o valores para portal) a partir del mapeo de campos.",
  args: {
    caso: z.string().describe("Nombre de la carpeta del caso"),
    mapeo: mapeoSchema.describe("Resultado de proveedor_mapear_campos"),
  },
  async execute(args: { caso: string; mapeo: Mapeo }, ctx: ToolContext): Promise<string> {
    const r = await seguro<{ ruta: string; formato: string; soportado: boolean }>(async () => {
      const solicitud = await cargarSolicitud(ctx.directory, args.caso);
      // Los campos a escribir son los que tienen valor (llenos + confirmables).
      const campos: CampoMapeado[] = [
        ...args.mapeo.llenos,
        ...args.mapeo.requiere_confirmacion,
        ...args.mapeo.faltantes,
      ];

      if (solicitud.formato === "xlsx") {
        const ruta = await generarXlsx(ctx.directory, args.caso, campos);
        return { ruta, formato: "xlsx", soportado: true };
      }
      if (solicitud.formato === "pdf") {
        const ruta = await generarPdf(ctx.directory, args.caso, solicitud.cliente, campos);
        return { ruta, formato: "pdf", soportado: true };
      }
      // portal: formato no soportado para llenado; se generan valores copiables.
      const ruta = await generarPortal(ctx.directory, args.caso, solicitud.cliente, campos);
      return { ruta, formato: "portal", soportado: false };
    });

    await registrarLog(ctx.directory, args.caso, {
      herramienta: "proveedor_generar_formulario",
      ok: r.ok,
      resumen: r.ok ? `formato=${r.data.formato}, ruta=${r.data.ruta}` : r.error,
    });
    return JSON.stringify(r);
  },
};

// ---------------------------------------------------------------------------
// Herramienta: proveedor_armar_paquete
// ---------------------------------------------------------------------------
export const armar_paquete = {
  description:
    "Arma el paquete para firma: copia los soportes exigidos existentes, genera el checklist (presentes/ausentes/vencidos) y el borrador de correo. Devuelve si esta listo para firma.",
  args: {
    caso: z.string().describe("Nombre de la carpeta del caso"),
  },
  async execute(args: { caso: string }, ctx: ToolContext): Promise<string> {
    const r = await seguro<{ ruta: string; listo_para_firma: boolean; checklist: Checklist }>(
      async () => {
        const solicitud = await cargarSolicitud(ctx.directory, args.caso);
        const soportes = await cargarSoportesExigidos(ctx.directory, args.caso);

        const checklist = await construirChecklistYCopiar(
          ctx.directory,
          args.caso,
          soportes,
          fechaEjecucion(),
        );
        await escribirChecklistMd(ctx.directory, args.caso, checklist);

        const nombreFormulario =
          solicitud.formato === "xlsx"
            ? "formulario.xlsx"
            : solicitud.formato === "pdf"
              ? "formulario.pdf"
              : "valores-portal.md";
        await copiarFormularioAlPaquete(ctx.directory, args.caso, nombreFormulario);

        await escribirBorradorCorreo(
          ctx.directory,
          args.caso,
          solicitud.cliente,
          `paquete/${nombreFormulario}`,
          checklist,
        );

        return {
          ruta: `out/${args.caso}/paquete`,
          listo_para_firma: checklist.listo_para_firma,
          checklist,
        };
      },
    );

    await registrarLog(ctx.directory, args.caso, {
      herramienta: "proveedor_armar_paquete",
      ok: r.ok,
      resumen: r.ok
        ? `listo_para_firma=${r.data.listo_para_firma}, bloqueos=${r.data.checklist.bloqueos.length}`
        : r.error,
    });
    return JSON.stringify(r);
  },
};

// ---------------------------------------------------------------------------
// Herramienta: proveedor_simular_envio
// ---------------------------------------------------------------------------
export const simular_envio = {
  description:
    "Simula el envio del paquete. SOLO procede con confirmado=true (confirmacion humana explicita). Escribe ENVIO-SIMULADO.md.",
  args: {
    caso: z.string().describe("Nombre de la carpeta del caso"),
    confirmado: z
      .boolean()
      .describe("Debe ser true. Representa la confirmacion humana explicita del turno anterior."),
  },
  async execute(args: { caso: string; confirmado: boolean }, ctx: ToolContext): Promise<string> {
    if (args.confirmado !== true) {
      const res = { ok: false as const, error: "requiere confirmación explícita" };
      await registrarLog(ctx.directory, args.caso, {
        herramienta: "proveedor_simular_envio",
        ok: false,
        resumen: "bloqueado: sin confirmacion",
      });
      return JSON.stringify(res);
    }

    const r = await seguro<{ ruta: string }>(async () => {
      const outDir = paths.outCaso(ctx.directory, args.caso);
      await mkdir(outDir, { recursive: true });
      const contenido = [
        "# ENVIO SIMULADO",
        "",
        `Caso: ${args.caso}`,
        `Fecha: ${new Date().toISOString()}`,
        "",
        "El paquete fue marcado como enviado (simulacion). En produccion aqui se",
        "integraria el envio real, previa firma del representante legal.",
        "",
      ].join("\n");
      await writeFile(join(outDir, "ENVIO-SIMULADO.md"), contenido, "utf8");
      return { ruta: `out/${args.caso}/ENVIO-SIMULADO.md` };
    });

    await registrarLog(ctx.directory, args.caso, {
      herramienta: "proveedor_simular_envio",
      ok: r.ok,
      resumen: r.ok ? `enviado: ${r.data.ruta}` : r.error,
    });
    return JSON.stringify(r);
  },
};
