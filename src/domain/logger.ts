import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { paths } from "./paths.js";

/** Entrada de bitacora por herramienta (RN5). */
export interface LogEntry {
  ts: string;
  herramienta: string;
  ok: boolean;
  resumen: string;
}

/**
 * Agrega una linea JSON a out/<caso>/log.jsonl. Crea el directorio si falta.
 * Nunca lanza: un fallo de logging no debe tumbar la herramienta.
 */
export async function registrarLog(
  directory: string,
  caso: string,
  entry: Omit<LogEntry, "ts">,
): Promise<void> {
  try {
    const ruta = paths.outLog(directory, caso);
    await mkdir(dirname(ruta), { recursive: true });
    const linea = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n";
    await appendFile(ruta, linea, "utf8");
  } catch {
    // El logging es best-effort. No propagamos el error al agente.
  }
}
