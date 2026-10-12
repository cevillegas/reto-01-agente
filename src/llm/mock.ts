import type { LLMAdapter, Mensaje, RespuestaLLM, ToolSchema } from "./adapter.js";

/**
 * Adaptador mock determinista. No usa clave ni red. Implementa una maquina de
 * estados que reproduce el flujo correcto del agente:
 *   leer -> mapear -> generar -> armar -> resumir (y pide confirmacion para envio).
 *
 * Sirve para probar el ciclo completo del agente y el front sin gastar tokens de
 * un proveedor real. La eleccion del proveedor real se hace via LLM_PROVIDER.
 */
export class MockAdapter implements LLMAdapter {
  readonly provider = "mock";
  readonly model = "mock-deterministic";

  async enviar(mensajes: Mensaje[], _herramientas: ToolSchema[]): Promise<RespuestaLLM> {
    const caso = this.detectarCaso(mensajes);
    const quiereEnviar = this.ultimoUsuarioConfirmaEnvio(mensajes);
    const toolsEjecutadas = this.toolsEjecutadas(mensajes);

    // Flujo de envio: solo si el usuario confirmo explicitamente.
    if (quiereEnviar) {
      if (!toolsEjecutadas.has("proveedor_simular_envio")) {
        return this.pedir("proveedor_simular_envio", { caso, confirmado: true });
      }
      return this.texto("Listo. El envío quedó simulado en ENVIO-SIMULADO.md.");
    }

    if (!toolsEjecutadas.has("proveedor_leer_solicitud")) {
      return this.pedir("proveedor_leer_solicitud", { caso });
    }
    if (!toolsEjecutadas.has("proveedor_mapear_campos")) {
      const campos = this.extraerCampos(mensajes);
      return this.pedir("proveedor_mapear_campos", { caso, campos });
    }
    if (!toolsEjecutadas.has("proveedor_generar_formulario")) {
      const mapeo = this.extraerMapeo(mensajes);
      return this.pedir("proveedor_generar_formulario", { caso, mapeo });
    }
    if (!toolsEjecutadas.has("proveedor_armar_paquete")) {
      return this.pedir("proveedor_armar_paquete", { caso });
    }

    // Todo ejecutado: resumen final con pregunta de confirmacion.
    return this.texto(this.resumenFinal(mensajes, caso));
  }

  private pedir(name: string, args: Record<string, unknown>): RespuestaLLM {
    return {
      content: "",
      toolCalls: [{ id: `call_${name}_${Date.now()}`, name, arguments: args }],
      tokens: 50,
    };
  }

  private texto(content: string): RespuestaLLM {
    return { content, toolCalls: [], tokens: 80 };
  }

  private detectarCaso(mensajes: Mensaje[]): string {
    const casos = [
      "co-industrias-delta",
      "ec-corp-andina",
      "hn-agroexport-sula",
      "pa-logistica-istmo",
    ];
    // Primero buscar en mensajes de usuario (más explícito)
    for (const m of mensajes) {
      if (m.role === "user") {
        for (const c of casos) if (m.content.includes(c)) return c;
      }
    }
    // Si no está en mensajes de usuario, buscar en tool calls ya ejecutadas
    // (cubre el caso donde el usuario solo dice "envía" sin repetir el nombre)
    for (let i = mensajes.length - 1; i >= 0; i--) {
      const m = mensajes[i]!;
      if (m.role === "tool") {
        try {
          const parsed = JSON.parse(m.content);
          const casoEnData = parsed.data?.caso;
          if (casoEnData && casos.includes(casoEnData)) return casoEnData;
        } catch { /* ignorar */ }
      }
      // También buscar en los argumentos del assistant tool call
      if (m.role === "assistant" && m.toolCalls?.length) {
        for (const tc of m.toolCalls) {
          const casoArg = (tc.arguments as Record<string, unknown>)?.caso;
          if (typeof casoArg === "string" && casos.includes(casoArg)) return casoArg;
        }
      }
    }
    return "co-industrias-delta";
  }

  private ultimoUsuarioConfirmaEnvio(mensajes: Mensaje[]): boolean {
    const usuarios = mensajes.filter((m) => m.role === "user");
    const ultimo = usuarios[usuarios.length - 1];
    if (!ultimo || ultimo.role !== "user") return false;
    const t = ultimo.content.toLowerCase();
    return /\b(env[ií]a|env[ií]o|confirmo|conf[ií]rmalo|procede|adelante)\b/.test(t);
  }

  private toolsEjecutadas(mensajes: Mensaje[]): Set<string> {
    const set = new Set<string>();
    for (const m of mensajes) if (m.role === "tool") set.add(m.name);
    return set;
  }

  private resultadoDe(mensajes: Mensaje[], name: string): any | null {
    for (let i = mensajes.length - 1; i >= 0; i--) {
      const m = mensajes[i]!;
      if (m.role === "tool" && m.name === name) {
        try {
          const parsed = JSON.parse(m.content);
          return parsed.ok ? parsed.data : null;
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  private extraerCampos(mensajes: Mensaje[]): unknown[] {
    const data = this.resultadoDe(mensajes, "proveedor_leer_solicitud");
    return data?.campos ?? [];
  }

  private extraerMapeo(mensajes: Mensaje[]): unknown {
    return this.resultadoDe(mensajes, "proveedor_mapear_campos") ?? {
      llenos: [],
      faltantes: [],
      requiere_confirmacion: [],
    };
  }

  private resumenFinal(mensajes: Mensaje[], caso: string): string {
    const mapeo = this.resultadoDe(mensajes, "proveedor_mapear_campos");
    const paquete = this.resultadoDe(mensajes, "proveedor_armar_paquete");
    const form = this.resultadoDe(mensajes, "proveedor_generar_formulario");

    const lineas: string[] = [`Procesé el caso **${caso}**.`, ""];
    if (mapeo) {
      lineas.push(`- Campos llenos: ${mapeo.llenos.length}`);
      lineas.push(`- Campos faltantes: ${mapeo.faltantes.length}` + (mapeo.faltantes.length ? ` (${mapeo.faltantes.map((f: any) => f.etiqueta).join(", ")})` : ""));
      lineas.push(`- Requieren confirmación: ${mapeo.requiere_confirmacion.length}` + (mapeo.requiere_confirmacion.length ? ` (${mapeo.requiere_confirmacion.map((f: any) => f.etiqueta).join(", ")})` : ""));
    }
    if (form) lineas.push(`- Formulario: ${form.ruta} (${form.formato}${form.soportado ? "" : ", no soportado"})`);
    if (paquete) {
      lineas.push(`- Paquete: ${paquete.ruta}`);
      lineas.push(`- Estado: ${paquete.listo_para_firma ? "LISTO PARA FIRMA" : "BLOQUEADO"}`);
      if (paquete.checklist?.bloqueos?.length) {
        lineas.push(`- Bloqueos: ${paquete.checklist.bloqueos.join("; ")}`);
      }
    }
    lineas.push("", "No he enviado nada. ¿Quieres que simule el envío del paquete? (responde \"envía\" para confirmar)");
    return lineas.join("\n");
  }
}
