import { join } from "node:path";

/**
 * Centraliza la construcción de rutas. Todas se resuelven desde la raíz del
 * proyecto (ctx.directory). Las herramientas nunca arman rutas absolutas.
 */
export const paths = {
  fixturesReto(dir: string) {
    return join(dir, "fixtures", "reto-01");
  },
  casoDir(dir: string, caso: string) {
    return join(dir, "fixtures", "reto-01", "casos", caso);
  },
  maestro(dir: string) {
    return join(dir, "fixtures", "reto-01", "repositorio", "maestro.json");
  },
  glosario(dir: string) {
    return join(dir, "fixtures", "reto-01", "glosario-campos.json");
  },
  soportesIndex(dir: string) {
    return join(dir, "fixtures", "reto-01", "repositorio", "soportes", "index.json");
  },
  soporteArchivo(dir: string, archivo: string) {
    return join(dir, "fixtures", "reto-01", "repositorio", "soportes", archivo);
  },
  outCaso(dir: string, caso: string) {
    return join(dir, "out", caso);
  },
  outPaquete(dir: string, caso: string) {
    return join(dir, "out", caso, "paquete");
  },
  outLog(dir: string, caso: string) {
    return join(dir, "out", caso, "log.jsonl");
  },
};
