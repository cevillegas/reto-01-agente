import type {
  LLMAdapter,
  Mensaje,
  RespuestaLLM,
  ToolCallRequest,
  ToolSchema,
} from "./adapter.js";

/**
 * Adaptador Anthropic (Messages API con tool use). La clave se lee de variable
 * de entorno; nunca se registra ni se expone.
 */
export class AnthropicAdapter implements LLMAdapter {
  readonly provider = "anthropic";
  readonly model: string;
  private readonly apiKey: string;

  constructor() {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("Falta ANTHROPIC_API_KEY en el entorno del backend.");
    this.apiKey = key;
    this.model = process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-20241022";
  }

  async enviar(mensajes: Mensaje[], herramientas: ToolSchema[]): Promise<RespuestaLLM> {
    const system = mensajes.find((m) => m.role === "system");
    const resto = mensajes.filter((m) => m.role !== "system");

    const body = {
      model: this.model,
      max_tokens: 2048,
      temperature: 0,
      system: system?.content ?? "",
      tools: herramientas.map((h) => ({
        name: h.name,
        description: h.description,
        input_schema: h.parameters,
      })),
      messages: this.mapMensajes(resto),
    };

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const detalle = await resp.text().catch(() => "");
      throw new Error(`Anthropic respondió ${resp.status}: ${detalle.slice(0, 200)}`);
    }

    const json: any = await resp.json();
    const bloques: any[] = json.content ?? [];
    let content = "";
    const toolCalls: ToolCallRequest[] = [];
    for (const b of bloques) {
      if (b.type === "text") content += b.text;
      if (b.type === "tool_use") {
        toolCalls.push({ id: b.id, name: b.name, arguments: b.input ?? {} });
      }
    }

    const tokens = (json.usage?.input_tokens ?? 0) + (json.usage?.output_tokens ?? 0);
    return { content, toolCalls, tokens };
  }

  private mapMensajes(mensajes: Mensaje[]): unknown[] {
    return mensajes.map((m) => {
      if (m.role === "tool") {
        return {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: m.toolCallId, content: m.content }],
        };
      }
      if (m.role === "assistant" && m.toolCalls?.length) {
        const content: unknown[] = [];
        if (m.content) content.push({ type: "text", text: m.content });
        for (const tc of m.toolCalls) {
          content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.arguments });
        }
        return { role: "assistant", content };
      }
      return { role: m.role, content: m.content };
    });
  }
}
