/**
 * Interfaz del proveedor LLM. El ciclo del agente depende solo de esto.
 * Cambiar de proveedor (OpenAI, Anthropic, mock) no toca el ciclo.
 */

export interface ToolSchema {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required: string[] };
}

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type Mensaje =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCallRequest[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export interface RespuestaLLM {
  /** Texto para el usuario (puede ir vacio si el modelo solo pide herramientas). */
  content: string;
  /** Herramientas que el modelo quiere ejecutar en esta iteracion. */
  toolCalls: ToolCallRequest[];
  /** Tokens aproximados consumidos, para el tope por sesion. */
  tokens: number;
}

export interface LLMAdapter {
  readonly provider: string;
  readonly model: string;
  enviar(mensajes: Mensaje[], herramientas: ToolSchema[]): Promise<RespuestaLLM>;
}
