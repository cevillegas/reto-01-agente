/**
 * Módulo reutilizable — herramientas.
 *
 * NO es una copia: reexporta las MISMAS herramientas que usa la aplicación,
 * para garantizar que el módulo y el servidor comparten una sola fuente de
 * verdad. Importables sin levantar el servidor HTTP.
 */
export {
  leer_solicitud,
  mapear_campos,
  generar_formulario,
  armar_paquete,
  simular_envio,
} from "../../src/tools/proveedor.js";
