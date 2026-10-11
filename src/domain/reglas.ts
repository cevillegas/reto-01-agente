/**
 * Reglas de negocio puras del reto. Sin I/O: entran datos, salen decisiones.
 * Referencia: PRD seccion 7.3 (RN1-RN5).
 */

/** Identificador tributario esperado por pais (RN1). */
export const ID_TRIBUTARIO_POR_PAIS: Record<string, string> = {
  CO: "NIT",
  EC: "RUC",
  PE: "RUC",
  PA: "RUC",
  HN: "RTN",
};

/** Pais del que Periferia posee identificador propio. */
export const PAIS_ID_PROPIO = "CO";

/**
 * RN1: cuando el cliente pide el identificador tributario y el pais no es CO,
 * Periferia solo tiene NIT colombiano. Se llena con el NIT pero se marca para
 * confirmacion con la nota de identificador extranjero.
 */
export function esIdentificadorExtranjero(claveMaestro: string | null, pais: string): boolean {
  return claveMaestro === "nit" && pais !== PAIS_ID_PROPIO;
}

export function notaIdentificadorExtranjero(pais: string): string {
  const esperado = ID_TRIBUTARIO_POR_PAIS[pais] ?? "identificador local";
  return `Periferia solo tiene NIT colombiano; el cliente (${pais}) espera ${esperado}. Confirmar si aplica el NIT como identificador extranjero.`;
}

/** Umbral de confianza por debajo del cual un mapeo requiere confirmacion. */
export const UMBRAL_CONFIANZA = 0.8;

/**
 * Un soporte esta vencido si su vigencia_hasta es anterior a la fecha de
 * ejecucion. `vigencia_hasta = null` significa que no vence (RN3).
 * Fechas en formato YYYY-MM-DD; la comparacion lexicografica es segura.
 */
export function soporteVencido(vigenciaHasta: string | null, fechaEjecucion: string): boolean {
  if (vigenciaHasta === null) return false;
  return vigenciaHasta < fechaEjecucion;
}
