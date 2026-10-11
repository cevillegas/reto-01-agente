import type { LLMAdapter } from "./adapter.js";
import { MockAdapter } from "./mock.js";
import { OpenAIAdapter } from "./openai.js";
import { AnthropicAdapter } from "./anthropic.js";

/**
 * Selecciona el adaptador segun LLM_PROVIDER. El ciclo del agente no conoce
 * esta funcion mas que por la interfaz LLMAdapter.
 */
export function crearAdaptador(): LLMAdapter {
  const provider = (process.env.LLM_PROVIDER ?? "mock").toLowerCase();
  switch (provider) {
    case "openai":
      return new OpenAIAdapter();
    case "anthropic":
      return new AnthropicAdapter();
    case "mock":
      return new MockAdapter();
    default:
      throw new Error(`LLM_PROVIDER desconocido: "${provider}". Use openai | anthropic | mock.`);
  }
}
