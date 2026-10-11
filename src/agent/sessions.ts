import type { Mensaje } from "../llm/adapter.js";

/** Evento de llamada a herramienta, visible en el front y en el historial. */
export interface ToolCallEvento {
  name: string;
  arguments: Record<string, unknown>;
  resultadoResumen: string;
  ok: boolean;
}

export interface Sesion {
  id: string;
  mensajes: Mensaje[];
  tokensUsados: number;
  historialToolCalls: ToolCallEvento[];
}

/** Almacen de sesiones en memoria (sin base de datos, segun el PRD). */
const sesiones = new Map<string, Sesion>();

export function obtenerOCrearSesion(id: string, systemPrompt: string): Sesion {
  let s = sesiones.get(id);
  if (!s) {
    s = {
      id,
      mensajes: [{ role: "system", content: systemPrompt }],
      tokensUsados: 0,
      historialToolCalls: [],
    };
    sesiones.set(id, s);
  }
  return s;
}

export function obtenerSesion(id: string): Sesion | undefined {
  return sesiones.get(id);
}
