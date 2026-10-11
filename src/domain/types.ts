/**
 * Tipos de dominio compartidos por las herramientas y el ciclo del agente.
 * No dependen de ningún proveedor LLM ni del servidor HTTP.
 */

export type FormatoSalida = "xlsx" | "pdf" | "portal";

export type EstadoCampo = "lleno" | "faltante" | "requiere_confirmacion";

/** Un campo solicitado por el cliente, tras leer la plantilla. */
export interface CampoSolicitado {
  etiqueta: string;
  obligatorio: boolean;
  /** Coordenada de celda cuando el formato es xlsx (hoja + celda del valor). */
  hoja?: string;
  celdaEtiqueta?: string;
  celdaValor?: string;
}

/** Resultado del mapeo de un campo contra el maestro. */
export interface CampoMapeado {
  etiqueta: string;
  obligatorio: boolean;
  estado: EstadoCampo;
  /** Clave del maestro de la que proviene el valor (ruta con puntos). `null` si faltante. */
  fuente: string | null;
  /** Valor resuelto desde el maestro. `null` si faltante. */
  valor: string | null;
  /** Confianza del mapeo etiqueta -> clave del maestro, en [0, 1]. */
  confianza: number;
  /** Explicación cuando requiere confirmación o está faltante. */
  nota: string | null;
  /** Coordenadas de celda, propagadas desde la plantilla xlsx. */
  hoja?: string;
  celdaValor?: string;
}

export interface Mapeo {
  llenos: CampoMapeado[];
  faltantes: CampoMapeado[];
  requiere_confirmacion: CampoMapeado[];
}

export interface SolicitudLeida {
  caso: string;
  pais: string;
  cliente: string;
  formato: FormatoSalida;
  campos: CampoSolicitado[];
  soportes: string[];
}

export interface ItemChecklist {
  tipo: string;
  estado: "presente" | "ausente" | "vencido";
  archivo: string | null;
  vigencia_hasta: string | null;
  nota: string | null;
}

export interface Checklist {
  items: ItemChecklist[];
  listo_para_firma: boolean;
  bloqueos: string[];
}

/** Contrato uniforme de salida de toda herramienta. Nunca se lanza una excepción. */
export type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface ToolContext {
  /** Raíz del proyecto. Las rutas se resuelven desde aquí, nunca absolutas en el código. */
  directory: string;
  sessionId: string;
}
