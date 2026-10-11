import { leerClave, normalizar, type MaestroJSON } from "../domain/maestro.js";
import {
  UMBRAL_CONFIANZA,
  esIdentificadorExtranjero,
  notaIdentificadorExtranjero,
} from "../domain/reglas.js";
import type { CampoMapeado, CampoSolicitado, Mapeo } from "../domain/types.js";

/**
 * Resuelve la clave del maestro para una etiqueta de cliente usando el glosario.
 * Devuelve la clave y la confianza del mapeo:
 *  - 1.0  : coincidencia exacta en el glosario.
 *  - 0.9  : coincidencia normalizada (sin tildes / may-min / espacios).
 *  - 0.0  : sin coincidencia -> campo faltante.
 */
function resolverClave(
  etiqueta: string,
  glosario: Record<string, string>,
): { clave: string | null; confianza: number } {
  if (Object.prototype.hasOwnProperty.call(glosario, etiqueta)) {
    return { clave: glosario[etiqueta]!, confianza: 1 };
  }
  const objetivo = normalizar(etiqueta);
  for (const [sinonimo, clave] of Object.entries(glosario)) {
    if (normalizar(sinonimo) === objetivo) {
      return { clave, confianza: 0.9 };
    }
  }
  return { clave: null, confianza: 0 };
}

/** Mapea un solo campo contra el maestro aplicando reglas de pais. */
export function mapearCampo(
  campo: CampoSolicitado,
  glosario: Record<string, string>,
  maestro: MaestroJSON,
  pais: string,
): CampoMapeado {
  const { clave, confianza } = resolverClave(campo.etiqueta, glosario);
  const base = {
    etiqueta: campo.etiqueta,
    obligatorio: campo.obligatorio,
    hoja: campo.hoja,
    celdaValor: campo.celdaValor,
  };

  // Sin clave en el glosario: campo faltante. Nunca se inventa un valor.
  if (clave === null) {
    return {
      ...base,
      estado: "faltante",
      fuente: null,
      valor: null,
      confianza: 0,
      nota: "No existe en el repositorio maestro ni en el glosario.",
    };
  }

  const valor = leerClave(maestro, clave);

  // La clave existe en el glosario pero no hay dato en el maestro: faltante.
  if (valor === null) {
    return {
      ...base,
      estado: "faltante",
      fuente: clave,
      valor: null,
      confianza,
      nota: `Mapea a "${clave}" pero el maestro no tiene ese dato.`,
    };
  }

  // RN1: identificador tributario extranjero -> requiere confirmacion.
  if (esIdentificadorExtranjero(clave, pais)) {
    return {
      ...base,
      estado: "requiere_confirmacion",
      fuente: clave,
      valor,
      confianza,
      nota: notaIdentificadorExtranjero(pais),
    };
  }

  // Confianza por debajo del umbral -> requiere confirmacion.
  if (confianza < UMBRAL_CONFIANZA) {
    return {
      ...base,
      estado: "requiere_confirmacion",
      fuente: clave,
      valor,
      confianza,
      nota: `Mapeo con confianza ${confianza.toFixed(2)} (< ${UMBRAL_CONFIANZA}).`,
    };
  }

  return {
    ...base,
    estado: "lleno",
    fuente: clave,
    valor,
    confianza,
    nota: null,
  };
}

/** Mapea todos los campos y los agrupa por estado. */
export function mapearCampos(
  campos: CampoSolicitado[],
  glosario: Record<string, string>,
  maestro: MaestroJSON,
  pais: string,
): Mapeo {
  const mapeados = campos.map((c) => mapearCampo(c, glosario, maestro, pais));
  return {
    llenos: mapeados.filter((m) => m.estado === "lleno"),
    faltantes: mapeados.filter((m) => m.estado === "faltante"),
    requiere_confirmacion: mapeados.filter((m) => m.estado === "requiere_confirmacion"),
  };
}
