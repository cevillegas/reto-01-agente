import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { crearAdaptador } from "./llm/factory.js";
import { ejecutarTurno, type AgentConfig } from "./agent/loop.js";
import { obtenerOCrearSesion, obtenerSesion } from "./agent/sessions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = join(__dirname, "..");

const PORT = Number(process.env.PORT ?? 3001);
const config: AgentConfig = {
  maxIterations: Number(process.env.MAX_ITERATIONS ?? 25),
  maxTokensPerSession: Number(process.env.MAX_TOKENS_PER_SESSION ?? 200000),
  directory: PROJECT_DIR,
};

const llm = crearAdaptador();

/** Carga el system prompt desde agent/prompt.md + conocimiento del proceso. */
async function cargarSystemPrompt(): Promise<string> {
  const prompt = await readFile(join(PROJECT_DIR, "agent", "prompt.md"), "utf8");
  const knowledge = await readFile(
    join(PROJECT_DIR, "src", "knowledge", "registro-proveedor.md"),
    "utf8",
  );
  return `${prompt}\n\n---\n\n# Conocimiento del proceso\n\n${knowledge}`;
}

let SYSTEM_PROMPT = "";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function enviarJSON(res: any, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

async function leerBody(req: any): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

    // --- API ---
    if (url.pathname === "/api/health") {
      // Nunca expone la clave: solo provider y model.
      return enviarJSON(res, 200, { ok: true, provider: llm.provider, model: llm.model });
    }

    // Diagnóstico temporal: lista archivos generados
    if (url.pathname === "/api/debug/out") {
      const { readdir } = await import("node:fs/promises");
      const outDir = join(PROJECT_DIR, "out");
      try {
        const archivos: string[] = [];
        const casos = await readdir(outDir).catch(() => []);
        for (const caso of casos) {
          const files = await readdir(join(outDir, caso)).catch(() => []);
          for (const f of files) archivos.push(`out/${caso}/${f}`);
          const paquete = await readdir(join(outDir, caso, "paquete")).catch(() => []);
          for (const f of paquete) archivos.push(`out/${caso}/paquete/${f}`);
        }
        return enviarJSON(res, 200, { PROJECT_DIR, archivos });
      } catch (e) {
        return enviarJSON(res, 200, { PROJECT_DIR, error: String(e) });
      }
    }

    if (url.pathname === "/api/chat" && req.method === "POST") {
      const body = await leerBody(req);
      const sessionId = String(body.sessionId ?? `sess_${Date.now()}`);
      const message = String(body.message ?? "");
      if (!message.trim()) return enviarJSON(res, 400, { ok: false, error: "message vacío" });

      const sesion = obtenerOCrearSesion(sessionId, SYSTEM_PROMPT);
      const resultado = await ejecutarTurno(sesion, message, llm, config);
      return enviarJSON(res, 200, {
        sessionId,
        reply: resultado.reply,
        toolCalls: resultado.toolCalls,
        needsConfirmation: resultado.needsConfirmation,
      });
    }

    const matchSesion = url.pathname.match(/^\/api\/sessions\/(.+)$/);
    if (matchSesion && req.method === "GET") {
      const s = obtenerSesion(decodeURIComponent(matchSesion[1]!));
      if (!s) return enviarJSON(res, 404, { ok: false, error: "sesión no encontrada" });
      // No se devuelve el system prompt crudo para no filtrar conocimiento interno.
      return enviarJSON(res, 200, {
        id: s.id,
        tokensUsados: s.tokensUsados,
        historialToolCalls: s.historialToolCalls,
        mensajes: s.mensajes.filter((m) => m.role !== "system"),
      });
    }

    // --- Archivos generados (out/) ---
    if (url.pathname.startsWith("/out/")) {
      const relative = url.pathname.replace(/^\//, ""); // quita el / inicial
      const full = join(PROJECT_DIR, relative);
      if (!full.startsWith(join(PROJECT_DIR, "out"))) {
        res.writeHead(403);
        return res.end("Forbidden");
      }
      try {
        const contenido = await readFile(full);
        const ext = extname(full);
        const mime: Record<string, string> = {
          ".md": "text/plain; charset=utf-8",
          ".pdf": "application/pdf",
          ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          ".json": "application/json; charset=utf-8",
          ".txt": "text/plain; charset=utf-8",
        };
        res.writeHead(200, { "Content-Type": mime[ext] ?? "application/octet-stream" });
        return res.end(contenido);
      } catch {
        res.writeHead(404);
        return res.end("Not found");
      }
    }

    // --- Front estatico ---
    let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const full = join(PROJECT_DIR, "web", filePath);
    if (!full.startsWith(join(PROJECT_DIR, "web"))) {
      res.writeHead(403);
      return res.end("Forbidden");
    }
    try {
      const contenido = await readFile(full);
      res.writeHead(200, { "Content-Type": MIME[extname(full)] ?? "application/octet-stream" });
      return res.end(contenido);
    } catch {
      res.writeHead(404);
      return res.end("Not found");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return enviarJSON(res, 500, { ok: false, error: msg });
  }
});

cargarSystemPrompt().then((p) => {
  SYSTEM_PROMPT = p;
  server.listen(PORT, () => {
    console.log(`Backend en http://localhost:${PORT}  (provider=${llm.provider}, model=${llm.model})`);
  });
});
