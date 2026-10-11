/**
 * Acceso de solo lectura al repositorio maestro.
 * Resuelve claves anidadas con notación de puntos (ej. "banco.numero_cuenta").
 */

export type MaestroJSON = Record<string, unknown>;

/** Lee un valor del maestro por ruta de puntos. Devuelve null si no existe. */
export function leerClave(maestro: MaestroJSON, ruta: string): string | null {
  const partes = ruta.split(".");
  let actual: unknown = maestro;
  for (const parte of partes) {
    if (actual === null || actual === undefined || typeof actual !== "object") {
      return null;
    }
    actual = (actual as Record<string, unknown>)[parte];
  }
  if (actual === null || actual === undefined) return null;
  if (typeof actual === "object") {
    // Un objeto completo no es un valor presentable: se considera no resuelto.
    return null;
  }
  return String(actual);
}

/** Normaliza una etiqueta para comparaciones tolerantes (sin tildes, minúsculas). */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
