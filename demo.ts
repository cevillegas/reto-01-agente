/**
 * demo.ts — Verificación de las herramientas SIN modelo.
 *
 * Ejecuta los 4 casos de fixtures/reto-01/casos/ llamando directamente a las
 * herramientas, en el orden del flujo del agente, e imprime un resumen por caso.
 * No requiere clave de ningún proveedor.
 *
 *   bun run demo.ts   (o)   npm run demo
 */
import { rm, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  leer_solicitud,
  mapear_campos,
  generar_formulario,
  armar_paquete,
  simular_envio,
} from "./src/tools/proveedor.js";
import type { ToolContext } from "./src/domain/types.js";

const DIR = dirname(fileURLToPath(import.meta.url));
const ctx: ToolContext = { directory: DIR, sessionId: "demo" };

function parse(json: string): any {
  return JSON.parse(json);
}

async function listarCasos(): Promise<string[]> {
  const casosDir = join(DIR, "fixtures", "reto-01", "casos");
  const entradas = await readdir(casosDir, { withFileTypes: true });
  return entradas.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

async function procesarCaso(caso: string): Promise<void> {
  console.log("\n" + "=".repeat(70));
  console.log(`CASO: ${caso}`);
  console.log("=".repeat(70));

  // 1. Leer solicitud
  const leido = parse(await leer_solicitud.execute({ caso }, ctx));
  if (!leido.ok) {
    console.log(`  ✗ leer_solicitud: ${leido.error}`);
    return;
  }
  const { pais, cliente, formato, campos, soportes } = leido.data;
  console.log(`  Cliente: ${cliente}  |  País: ${pais}  |  Formato: ${formato}`);
  console.log(`  Campos solicitados: ${campos.length}  |  Soportes exigidos: ${soportes.join(", ")}`);

  // 2. Mapear campos
  const mapeado = parse(await mapear_campos.execute({ caso, campos }, ctx));
  if (!mapeado.ok) {
    console.log(`  ✗ mapear_campos: ${mapeado.error}`);
    return;
  }
  const m = mapeado.data;
  console.log(`  → Llenos: ${m.llenos.length}`);
  console.log(`  → Faltantes: ${m.faltantes.length}${m.faltantes.length ? " (" + m.faltantes.map((f: any) => f.etiqueta).join(", ") + ")" : ""}`);
  console.log(`  → Requieren confirmación: ${m.requiere_confirmacion.length}`);
  for (const c of m.requiere_confirmacion) {
    console.log(`      · ${c.etiqueta}: ${c.nota}`);
  }

  // 3. Generar formulario
  const form = parse(await generar_formulario.execute({ caso, mapeo: m }, ctx));
  if (form.ok) {
    console.log(`  → Formulario: ${form.data.ruta} (${form.data.formato}${form.data.soportado ? "" : ", NO soportado"})`);
  } else {
    console.log(`  ✗ generar_formulario: ${form.error}`);
  }

  // 4. Armar paquete
  const paq = parse(await armar_paquete.execute({ caso }, ctx));
  if (paq.ok) {
    console.log(`  → Paquete: ${paq.data.ruta}`);
    console.log(`  → Estado: ${paq.data.listo_para_firma ? "LISTO PARA FIRMA" : "BLOQUEADO"}`);
    for (const b of paq.data.checklist.bloqueos) console.log(`      · bloqueo: ${b}`);
  } else {
    console.log(`  ✗ armar_paquete: ${paq.error}`);
  }

  // 5. Demostrar la confirmación humana: envío sin confirmar debe fallar.
  const sinConfirmar = parse(await simular_envio.execute({ caso, confirmado: false }, ctx));
  console.log(`  → Envío sin confirmar: ${sinConfirmar.ok ? "ENVIADO (mal)" : "rechazado correctamente (" + sinConfirmar.error + ")"}`);
}

async function main(): Promise<void> {
  // Determinismo: limpiar out/ al inicio.
  await rm(join(DIR, "out"), { recursive: true, force: true });

  console.log("DEMO · Reto 01 — Agente Registro como Proveedor");
  console.log(`Fecha de ejecución (vigencias): ${process.env.FECHA_EJECUCION ?? "2026-09-03"}`);

  const casos = await listarCasos();
  for (const caso of casos) await procesarCaso(caso);

  // Demostrar el envío CON confirmación para un caso listo.
  console.log("\n" + "=".repeat(70));
  console.log("CONFIRMACIÓN HUMANA — envío con confirmado=true (caso co-industrias-delta)");
  console.log("=".repeat(70));
  const envio = parse(await simular_envio.execute({ caso: "co-industrias-delta", confirmado: true }, ctx));
  console.log(envio.ok ? `  ✓ Enviado: ${envio.data.ruta}` : `  ✗ ${envio.error}`);

  console.log("\nDemo finalizada. Revisa la carpeta out/ para ver los artefactos generados.\n");
}

main().catch((e) => {
  console.error("Error fatal en la demo:", e);
  process.exit(1);
});
