import type {
  LLMAdapter,
  Mensaje,
  RespuestaLLM,
  ToolCallRequest,
  ToolSchema,
} from "./adapter.js";

/**
 * Adaptador OpenAI (Chat Completions con tool calling). La clave se lee de
 * variable de entorno; nunca se registra ni se expone.
 */
export class OpenAIAdapter implements LLMAdapter {
  readonly provider = "openai";
  readonly model: string;
  private readonly apiKey: string;

  constructor() {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("Falta OPENAI_API_KEY en el entorno del backend.");
    this.apiKey = key;
    this.model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  }

  async enviar(mensajes: Mensaje[], herramientas: ToolSchema[]): Promise<RespuestaLLM> {
    const body = {
      model: this.model,
      messages: this.mapMensajes(mensajes),
      tools: herramientas.map((h) => ({ type: "function", function: h })),
      tool_choice: "auto" as const,
      temperature: 0,
    };

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const detalle = await resp.text().catch(() => "");
      throw new Error(`OpenAI respondió ${resp.status}: ${detalle.slice(0, 200)}`);
    }

    const json: any = await resp.json();
    const choice = json.choices?.[0]?.message ?? {};
    const toolCalls: ToolCallRequest[] = (choice.tool_calls ?? []).map((tc: any) => ({
      id: tc.id,
      name: tc.function?.name,
      arguments: safeParse(tc.function?.arguments),
    }));

    return {
      content: choice.content ?? "",
      toolCalls,
      tokens: json.usage?.total_tokens ?? 0,
    };
  }

  private mapMensajes(mensajes: Mensaje[]): unknown[] {
    return mensajes.map((m) => {
      if (m.role === "tool") {
        return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
      }
      if (m.role === "assistant" && m.toolCalls?.length) {
        return {
          role: "assistant",
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        };
      }
      return { role: m.role, content: m.content };
    });
  }
}

function safeParse(s: unknown): Record<string, unknown> {
  if (typeof s !== "string") return {};
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}
