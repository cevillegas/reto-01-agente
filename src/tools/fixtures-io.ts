import { readFile } from "node:fs/promises";
import { paths } from "../domain/paths.js";
import type { MaestroJSON } from "../domain/maestro.js";

/** Correo normalizado del caso (solicitud.json). */
export interface SolicitudJSON {
  id: string;
  de: string;
  asunto: string;
  fecha: string;
  pais: string;
  cliente: string;
  formato: "xlsx" | "pdf" | "portal";
  cuerpo: string;
  adjuntos: string[];
}

/** Fila de plantilla-celdas.json (formato xlsx). */
export interface CeldaPlantilla {
  hoja: string;
  celda_etiqueta: string;
  etiqueta: string;
  celda_valor: string;
}

/** Fila de plantilla-campos.json (formato pdf). */
export interface CampoPlantilla {
  etiqueta: string;
  obligatorio: boolean;
}

/** Fila del indice de soportes. */
export interface SoporteIndex {
  tipo: string;
  archivo: string;
  vigencia_hasta: string | null;
  pais_emisor: string;
  descripcion: string;
}

async function leerJSON<T>(ruta: string): Promise<T> {
  const texto = await readFile(ruta, "utf8");
  return JSON.parse(texto) as T;
}

export async function cargarSolicitud(dir: string, caso: string): Promise<SolicitudJSON> {
  return leerJSON<SolicitudJSON>(`${paths.casoDir(dir, caso)}/solicitud.json`);
}

export async function cargarPlantillaCeldas(dir: string, caso: string): Promise<CeldaPlantilla[]> {
  return leerJSON<CeldaPlantilla[]>(`${paths.casoDir(dir, caso)}/plantilla-celdas.json`);
}

export async function cargarPlantillaCampos(dir: string, caso: string): Promise<CampoPlantilla[]> {
  return leerJSON<CampoPlantilla[]>(`${paths.casoDir(dir, caso)}/plantilla-campos.json`);
}

export async function cargarSoportesExigidos(dir: string, caso: string): Promise<string[]> {
  return leerJSON<string[]>(`${paths.casoDir(dir, caso)}/soportes-exigidos.json`);
}

export async function cargarMaestro(dir: string): Promise<MaestroJSON> {
  return leerJSON<MaestroJSON>(paths.maestro(dir));
}

export async function cargarGlosario(dir: string): Promise<Record<string, string>> {
  return leerJSON<Record<string, string>>(paths.glosario(dir));
}

export async function cargarSoportesIndex(dir: string): Promise<SoporteIndex[]> {
  return leerJSON<SoporteIndex[]>(paths.soportesIndex(dir));
}
