# Reto 01 — Agente conversacional "Registro como Proveedor"

Agente que automatiza el llenado de formularios de registro como proveedor de
Periferia IT Group: lee la solicitud del cliente, mapea los campos contra el
repositorio maestro, genera el formulario en el formato pedido (Excel / PDF /
portal) y arma el paquete para firma. Nunca firma ni envía: prepara y pide
confirmación humana.

## Requisitos

- Node 20+ (probado con Node 24) o Bun.
- No necesitas clave de ningún proveedor para la demo ni para probar el chat: el
  adaptador por defecto es `mock` (determinista).

## Levantar en local (un comando)

```bash
npm install
npm run dev
```

Abre http://localhost:3001. El backend sirve el front de chat y la API.

Con Bun:

```bash
bun install
bun run src/server.ts
```

## Variables de entorno

Copia `.env.example` a `.env`. Todas tienen valor por defecto; solo necesitas una
clave si eliges un proveedor real.

| Variable | Default | Para qué |
|---|---|---|
| `LLM_PROVIDER` | `mock` | `mock` \| `openai` \| `anthropic` |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | — / `gpt-4o-mini` | Solo si `LLM_PROVIDER=openai` |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | — / `claude-3-5-sonnet-20241022` | Solo si `LLM_PROVIDER=anthropic` |
| `PORT` | `3001` | Puerto del backend |
| `MAX_ITERATIONS` | `25` | Tope de iteraciones por turno |
| `MAX_TOKENS_PER_SESSION` | `200000` | Tope de tokens por sesión |
| `FECHA_EJECUCION` | `2026-09-03` | Fecha para evaluar vigencia de soportes (determinismo) |

La clave del modelo vive solo en el backend. Nunca se expone en el front, los
logs ni las respuestas de la API (`/api/health` solo devuelve `provider` y `model`).

## Correr la demo (sin modelo)

```bash
npm run demo
```

Procesa los 4 casos de `fixtures/reto-01/casos/` llamando a las herramientas
directamente, imprime un resumen por caso y demuestra la confirmación humana
(envío rechazado sin confirmar, y aceptado con `confirmado=true`). Limpia `out/`
al inicio para ser determinista. Los artefactos quedan en `out/<caso>/`.

## Probar el chat

Prompt de ejemplo (sesión nueva):

```
Procesa el caso "ec-corp-andina". Dime qué campos quedaron llenos, cuáles
faltan, si el paquete está listo para firma y qué soportes debo actualizar.
No envíes nada todavía.
```

El agente encadena las herramientas (visibles en el chat), entrega el resumen y
cierra con una pregunta. Si respondes `envía`, simula el envío
(`out/<caso>/ENVIO-SIMULADO.md`).

## API

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/chat` | `{ sessionId, message }` → `{ reply, toolCalls[], needsConfirmation }` |
| `GET` | `/api/sessions/:id` | Historial de la sesión (sin el system prompt) |
| `GET` | `/api/health` | `{ ok, provider, model }` sin exponer la clave |

## Estructura

```
reto-01/
├── agent/prompt.md              # system prompt (comportamiento)
├── src/
│   ├── server.ts                # API HTTP + sirve el front
│   ├── agent/                   # ciclo del agente y sesiones
│   ├── llm/                     # adapter + mock/openai/anthropic + factory
│   ├── tools/                   # herramientas (proveedor_*) + lógica
│   ├── domain/                  # tipos, reglas, maestro, paths, logger
│   └── knowledge/               # conocimiento del proceso
├── web/                         # front de chat (HTML/CSS/JS plano)
├── fixtures/                    # entregados por Periferia (solo lectura)
├── out/                         # generado en ejecución
├── demo.ts                      # herramientas sin modelo
└── SOLUCION.md
```

## Link de prueba

Pendiente de desplegar. El backend es un único proceso Node sin estado en disco
(sesiones en memoria), apto para Render / Railway / Fly.io. Comando de arranque:
`npm install && npm run start`. Si no hay despliegue durante la defensa, se corre
en local con el adaptador `mock`.
