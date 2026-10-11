import { z } from "zod";
import type { ToolContext } from "../domain/types.js";
import * as proveedor from "./proveedor.js";

/** Forma de una herramienta segun el contrato del PRD (seccion 6.2). */
export interface Tool {
  description: string;
  args: Record<string, z.ZodTypeAny>;
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string>;
}

/**
 * Construye el registro de herramientas. El nombre que ve el modelo es
 * `<archivo>_<export>`, de ahi el prefijo "proveedor_".
 */
function registrarArchivo(prefijo: string, modulo: Record<string, unknown>): Map<string, Tool> {
  const mapa = new Map<string, Tool>();
  for (const [nombreExport, valor] of Object.entries(modulo)) {
    if (valor && typeof valor === "object" && "execute" in valor && "args" in valor) {
      mapa.set(`${prefijo}_${nombreExport}`, valor as Tool);
    }
  }
  return mapa;
}

export const TOOLS: Map<string, Tool> = registrarArchivo("proveedor", proveedor);

/** Valida los argumentos de una herramienta con su esquema zod. */
export function validarArgs(tool: Tool, args: unknown): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  const schema = z.object(tool.args);
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    return { ok: false, error: `Argumentos invalidos: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` };
  }
  return { ok: true, data: parsed.data as Record<string, unknown> };
}

/** Serializa el esquema de una herramienta a JSON Schema para el proveedor LLM. */
export function toolSchemaParaLLM(nombre: string, tool: Tool): {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required: string[] };
} {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [clave, schema] of Object.entries(tool.args)) {
    properties[clave] = zodABasico(schema);
    if (!schema.isOptional()) required.push(clave);
  }
  return { name: nombre, description: tool.description, parameters: { type: "object", properties, required } };
}

/** Conversion minima de zod a JSON Schema (suficiente para este contrato). */
function zodABasico(schema: z.ZodTypeAny): Record<string, unknown> {
  const desc = schema.description;
  const base: Record<string, unknown> = desc ? { description: desc } : {};
  if (schema instanceof z.ZodString) return { type: "string", ...base };
  if (schema instanceof z.ZodBoolean) return { type: "boolean", ...base };
  if (schema instanceof z.ZodNumber) return { type: "number", ...base };
  if (schema instanceof z.ZodArray) return { type: "array", items: zodABasico(schema.element), ...base };
  if (schema instanceof z.ZodObject) return { type: "object", ...base };
  if (schema instanceof z.ZodOptional) return zodABasico(schema.unwrap());
  return { type: "object", ...base };
}
