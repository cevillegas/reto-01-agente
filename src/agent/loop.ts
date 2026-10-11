import type { LLMAdapter, Mensaje, ToolSchema } from "../llm/adapter.js";
import type { ToolContext } from "../domain/types.js";
import { TOOLS, toolSchemaParaLLM, validarArgs } from "../tools/registry.js";
import type { Sesion, ToolCallEvento } from "./sessions.js";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface AgentConfig {
  maxIterations: number;
  maxTokensPerSession: number;
  directory: string;
}

export interface TurnoResultado {
  reply: string;
  toolCalls: ToolCallEvento[];
  needsConfirmation: boolean;
  topeAlcanzado: boolean;
}

/** Esquemas de todas las herramientas en el formato que entiende el proveedor. */
function esquemasLLM(): ToolSchema[] {
  const out: ToolSchema[] = [];
  for (const [nombre, tool] of TOOLS) out.push(toolSchemaParaLLM(nombre, tool));
  return out;
}

/** Log global de llamadas a herramientas (CA4): out/log.jsonl. */
async function logGlobal(directory: string, entry: Record<string, unknown>): Promise<void> {
  try {
    const ruta = join(directory, "out", "log.jsonl");
    await mkdir(dirname(ruta), { recursive: true });
    await appendFile(ruta, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n", "utf8");
  } catch {
    // best-effort
  }
}

/** Detecta si el ultimo mensaje del asistente cierra pidiendo confirmacion. */
function pideConfirmacion(texto: string): boolean {
  const t = texto.toLowerCase();
  // Debe contener una pregunta y un verbo de accion/confirmacion.
  return t.includes("?") && /(confirm|env[ií]|desea|quieres|procedo|autoriza)/.test(t);
}

/**
 * Ejecuta un turno del agente: alimenta el mensaje del usuario, corre el bucle
 * modelo -> herramientas hasta que el modelo responde con texto o se alcanza el
 * tope de iteraciones (CA1). Devuelve la respuesta y las tool calls del turno.
 */
export async function ejecutarTurno(
  sesion: Sesion,
  mensajeUsuario: string,
  llm: LLMAdapter,
  config: AgentConfig,
): Promise<TurnoResultado> {
  sesion.mensajes.push({ role: "user", content: mensajeUsuario });

  const herramientas = esquemasLLM();
  const toolCallsTurno: ToolCallEvento[] = [];
  const ctx: ToolContext = { directory: config.directory, sessionId: sesion.id };

  for (let iter = 0; iter < config.maxIterations; iter++) {
    // Tope de tokens por sesion (control de costo).
    if (sesion.tokensUsados > config.maxTokensPerSession) {
      const reply = "Alcancé el tope de tokens de la sesión. Inicia una nueva para continuar.";
      sesion.mensajes.push({ role: "assistant", content: reply });
      return { reply, toolCalls: toolCallsTurno, needsConfirmation: false, topeAlcanzado: true };
    }

    let respuesta;
    try {
      respuesta = await llm.enviar(sesion.mensajes, herramientas);
    } catch (e) {
      // CA5: un error del proveedor se muestra claro y la sesion no muere.
      const msg = e instanceof Error ? e.message : String(e);
      const reply = `Hubo un problema con el proveedor del modelo: ${msg}. Puedes reintentar.`;
      sesion.mensajes.push({ role: "assistant", content: reply });
      return { reply, toolCalls: toolCallsTurno, needsConfirmation: false, topeAlcanzado: false };
    }

    sesion.tokensUsados += respuesta.tokens;

    // El modelo respondio con texto y sin herramientas: fin del turno.
    if (respuesta.toolCalls.length === 0) {
      sesion.mensajes.push({ role: "assistant", content: respuesta.content });
      return {
        reply: respuesta.content,
        toolCalls: toolCallsTurno,
        needsConfirmation: pideConfirmacion(respuesta.content),
        topeAlcanzado: false,
      };
    }

    // Registrar el turno del asistente con sus tool calls.
    sesion.mensajes.push({
      role: "assistant",
      content: respuesta.content,
      toolCalls: respuesta.toolCalls,
    });

    // Ejecutar cada herramienta solicitada.
    for (const tc of respuesta.toolCalls) {
      const tool = TOOLS.get(tc.name);
      let resultado: string;
      let ok = true;

      if (!tool) {
        resultado = JSON.stringify({ ok: false, error: `Herramienta desconocida: ${tc.name}` });
        ok = false;
      } else {
        const val = validarArgs(tool, tc.arguments);
        if (!val.ok) {
          resultado = JSON.stringify({ ok: false, error: val.error });
          ok = false;
        } else {
          resultado = await tool.execute(val.data, ctx);
          try {
            ok = JSON.parse(resultado).ok !== false;
          } catch {
            ok = true;
          }
        }
      }

      const evento: ToolCallEvento = {
        name: tc.name,
        arguments: tc.arguments,
        resultadoResumen: resumir(resultado),
        ok,
      };
      toolCallsTurno.push(evento);
      sesion.historialToolCalls.push(evento);
      await logGlobal(config.directory, {
        herramienta: tc.name,
        sessionId: sesion.id,
        ok,
        argumentos: tc.arguments,
        resumen: evento.resultadoResumen,
      });

      sesion.mensajes.push({
        role: "tool",
        toolCallId: tc.id,
        name: tc.name,
        content: resultado,
      });
    }
  }

  // CA1: tope de iteraciones alcanzado.
  const reply =
    "Alcancé el tope de iteraciones de este turno. Esto es lo que tengo hasta ahora; dime si continúo.";
  sesion.mensajes.push({ role: "assistant", content: reply });
  return { reply, toolCalls: toolCallsTurno, needsConfirmation: false, topeAlcanzado: true };
}

/** Resume el resultado de una herramienta para mostrarlo en el chat. */
function resumir(resultado: string): string {
  try {
    const parsed = JSON.parse(resultado);
    if (parsed.ok === false) return `error: ${parsed.error}`;
    const data = parsed.data ?? {};
    const claves = Object.keys(data);
    if (claves.length === 0) return "ok";
    return claves
      .slice(0, 4)
      .map((k) => {
        const v = (data as Record<string, unknown>)[k];
        if (Array.isArray(v)) return `${k}=[${v.length}]`;
        if (v && typeof v === "object") return `${k}={...}`;
        return `${k}=${String(v)}`;
      })
      .join(", ");
  } catch {
    return resultado.slice(0, 120);
  }
}
