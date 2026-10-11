# Documentación del proyecto — Agente "Registro como Proveedor"

> Guía para **entender** el proyecto: qué hace, cómo están organizadas las
> carpetas y cómo funciona por dentro. No es el documento de entrega
> (`SOLUCION.md`), sino una explicación funcional y de arquitectura.

---

## 1. ¿Qué resuelve este proyecto?

Cuando un cliente quiere registrar a Periferia IT Group como su proveedor, le
envía por correo un formulario para llenar (en Excel, PDF o un portal web) y le
pide adjuntar unos soportes (Cámara de Comercio, RUT, certificación bancaria,
etc.). Hoy una persona copia esos datos a mano, uno por uno.

Este proyecto es un **agente conversacional** que hace ese trabajo:

1. Lee la solicitud del cliente y entiende qué campos y qué soportes pide.
2. Busca cada dato en el **repositorio maestro** de Periferia (una ficha con toda
   la información de la empresa).
3. Llena el formulario en el mismo formato que mandó el cliente.
4. Arma un "paquete para firma": el formulario + los soportes + una lista de
   verificación + un borrador de correo.
5. Avisa qué falta o qué hay que confirmar, y **nunca envía ni firma sin que un
   humano lo autorice**.

Tú le hablas por un chat ("procesa el caso X") y él va mostrando cada paso.

---

## 2. Las tres ideas que explican todo

Si entiendes estas tres ideas, entiendes el proyecto completo.

### Idea 1 — El agente no inventa datos, las "herramientas" se los dan

El modelo de lenguaje (el "cerebro") **no conoce** el NIT ni la cuenta bancaria
de Periferia. Esos datos solo salen de unas funciones llamadas **herramientas**.
El agente puede decidir *cuándo* usar una herramienta, pero el *valor* siempre
viene de la herramienta, no de la imaginación del modelo. Así nunca se inventa un
dato sensible.

### Idea 2 — Tres responsabilidades separadas

El proyecto separa a propósito tres cosas en tres lugares distintos:

- **Comportamiento** (cómo se comporta el agente) → `agent/prompt.md`
- **Conocimiento** (las reglas del negocio) → `src/knowledge/`
- **Ejecución** (el trabajo real con los datos) → `src/tools/`

¿Por qué importa? Porque si mañana cambia una regla de negocio, tocas el
conocimiento, no el motor del agente. Cada cosa en su caja.

### Idea 3 — El modelo es intercambiable

El agente funciona con un modelo "de mentira" (`mock`, sin costo ni clave) o con
uno real (OpenAI, Anthropic). Cambiar de uno a otro es cambiar una variable de
entorno; el resto del código no se entera. Esto permite demostrar todo sin gastar.

---

## 3. Distribución de carpetas

```
reto-01/
├── agent/
│   └── prompt.md            → El "instructivo" del agente (su personalidad y reglas)
│
├── src/                     → Todo el código del backend
│   ├── server.ts            → Punto de entrada: levanta el servidor web y la API
│   │
│   ├── agent/               → EL MOTOR DEL AGENTE
│   │   ├── loop.ts          → El ciclo: pregunta al modelo, ejecuta herramientas, repite
│   │   └── sessions.ts      → Memoria de cada conversación (en RAM)
│   │
│   ├── llm/                 → CONEXIÓN AL MODELO DE LENGUAJE
│   │   ├── adapter.ts       → El "enchufe" estándar (qué debe cumplir cualquier modelo)
│   │   ├── mock.ts          → Modelo falso, determinista, sin clave (por defecto)
│   │   ├── openai.ts        → Conexión real a OpenAI
│   │   ├── anthropic.ts     → Conexión real a Anthropic (Claude)
│   │   └── factory.ts       → Elige cuál usar según la variable LLM_PROVIDER
│   │
│   ├── tools/               → LAS HERRAMIENTAS (el trabajo real)
│   │   ├── proveedor.ts     → Define las 5 herramientas que ve el agente
│   │   ├── registry.ts      → Las registra y valida sus argumentos
│   │   ├── fixtures-io.ts   → Lee los archivos de entrada (solicitud, maestro, etc.)
│   │   ├── mapeo.ts         → Cruza cada campo pedido con el maestro
│   │   ├── generadores.ts   → Crea el Excel / PDF / archivo de portal
│   │   └── paquete.ts       → Arma el paquete para firma (checklist, correo, copias)
│   │
│   ├── domain/              → PIEZAS BASE compartidas (sin lógica de servidor)
│   │   ├── types.ts         → Los "moldes" de datos (qué forma tiene un campo, etc.)
│   │   ├── reglas.ts        → Reglas de negocio puras (país, vigencia, confianza)
│   │   ├── maestro.ts       → Cómo leer un dato del maestro (ej. "banco.numero_cuenta")
│   │   ├── paths.ts         → Dónde está cada archivo (todas las rutas en un solo lugar)
│   │   └── logger.ts        → Deja registro de lo que hace cada herramienta
│   │
│   └── knowledge/
│       └── registro-proveedor.md → Las reglas del proceso, en texto, para el agente
│
├── web/                     → EL CHAT (lo que ves en el navegador)
│   ├── index.html           → La página
│   ├── styles.css           → Los estilos
│   └── app.js               → La lógica del chat (enviar mensaje, mostrar respuestas)
│
├── fixtures/                → DATOS DE ENTRADA (los da Periferia, NO se tocan)
│   └── reto-01/
│       ├── casos/           → Las 4 solicitudes de ejemplo
│       ├── repositorio/     → El maestro de Periferia y sus soportes
│       └── glosario-campos.json → Diccionario de sinónimos de campos
│
├── out/                     → RESULTADOS generados al ejecutar (se puede borrar)
│
├── modulo/                  → BONUS: el agente empaquetado para reusar en otra plataforma
│   ├── agent.md
│   ├── tools/proveedor.ts   → Reexporta las MISMAS herramientas (no son copias)
│   └── skill/registro-proveedor/SKILL.md
│
├── demo.ts                  → Prueba las herramientas sin modelo (un comando)
├── README.md                → Cómo levantar y usar el proyecto
├── SOLUCION.md              → Documento de entrega para el evaluador
└── DOCUMENTACION.md         → Este archivo
```

### Cómo leer esta estructura

Hay una **jerarquía de dependencias** sana (de abajo hacia arriba):

```
domain/   (no depende de nada)
   ↑
tools/    (usa domain)
   ↑
llm/      (independiente, solo define el "enchufe" del modelo)
   ↑
agent/    (usa tools + llm)
   ↑
server.ts (usa agent, y sirve web/)
```

Las capas de abajo no saben que existen las de arriba. Eso hace el código fácil
de probar y de cambiar por partes.

---

## 4. ¿Cómo funciona por dentro? (el recorrido de una petición)

Supón que escribes en el chat: *"Procesa el caso ec-corp-andina. No envíes nada."*

```
  TÚ (navegador)
     │  escribes el mensaje
     ▼
  web/app.js  ──POST /api/chat──►  src/server.ts
                                      │  busca/crea la sesión
                                      ▼
                                src/agent/loop.ts  (EL CICLO)
                                      │
            ┌─────────────────────────┤
            │  1. Le pasa la conversación al modelo (src/llm/*)
            │  2. El modelo dice: "usa la herramienta proveedor_leer_solicitud"
            │  3. loop.ts valida los argumentos (zod) y ejecuta la herramienta
            │  4. La herramienta (src/tools/*) hace el trabajo y devuelve datos
            │  5. loop.ts le devuelve el resultado al modelo
            │  6. El modelo pide la siguiente herramienta... y así
            │     (leer → mapear → generar → armar)
            └─────────────────────────┐
                                      ▼
                        El modelo redacta el resumen final
                                      │
     ◄──{ reply, toolCalls, needsConfirmation }──┘
     │
  web/app.js  muestra: el resumen + cada herramienta usada + (si aplica) el aviso de confirmación
```

El punto clave: **el ciclo se repite** (modelo → herramienta → modelo → ...)
hasta que el modelo tiene todo y responde con texto. Hay un tope de vueltas
(25 por defecto) para que nunca se quede dando vueltas infinitas.

---

## 5. Las 5 herramientas (qué hace cada una)

El agente solo puede hacer lo que estas herramientas le permiten. Cada una recibe
unos argumentos validados y devuelve siempre `{ ok: true, data }` o
`{ ok: false, error }` — nunca "explota".

| Herramienta | Qué hace | Resultado |
|---|---|---|
| `proveedor_leer_solicitud` | Abre la solicitud del cliente y su plantilla | País, cliente, formato, lista de campos y soportes pedidos |
| `proveedor_mapear_campos` | Cruza cada campo con el maestro usando el glosario | Campos **llenos**, **faltantes** y los que **requieren confirmación** |
| `proveedor_generar_formulario` | Crea el formulario en el formato pedido | `formulario.xlsx`, `formulario.pdf` o `valores-portal.md` |
| `proveedor_armar_paquete` | Copia soportes, arma checklist y borrador de correo | Carpeta `paquete/` + si está **listo para firma** |
| `proveedor_simular_envio` | Simula el envío (solo con confirmación humana) | `ENVIO-SIMULADO.md` (o error si no se confirmó) |

### Los tres estados de un campo (lo más importante del negocio)

Cuando el agente busca un campo en el maestro, pasa una de tres cosas:

- **lleno** → lo encontró con certeza. Se escribe el valor.
- **faltante** → no existe en el maestro. **No se inventa.** Se reporta como faltante.
- **requiere_confirmación** → lo encontró pero hay una duda (ej. el cliente es de
  Ecuador y pide "RUC", pero Periferia solo tiene NIT colombiano). Se llena, pero
  se marca para que un humano confirme.

### Qué bloquea la firma

El paquete queda **"listo para firma"** solo si todos los soportes exigidos están
presentes y vigentes. Lo bloquea:

- Un soporte **ausente** (el cliente lo pide pero Periferia no lo tiene).
- Un soporte **vencido** (su fecha de vigencia ya pasó).

Un campo faltante **no** bloquea la firma, pero sí aparece en el checklist.

---

## 6. Los datos de entrada (carpeta `fixtures/`)

Son los archivos que simula Periferia. **No se modifican**; el agente solo los lee.

| Archivo | Qué es |
|---|---|
| `casos/<caso>/solicitud.json` | El correo del cliente: quién es, de qué país, qué formato pide |
| `casos/<caso>/plantilla-celdas.json` | (Excel) Qué va en cada celda del formulario |
| `casos/<caso>/plantilla-campos.json` | (PDF) La lista de campos a llenar |
| `casos/<caso>/soportes-exigidos.json` | Qué soportes pide ese cliente |
| `repositorio/maestro.json` | **La ficha de Periferia** (NIT, dirección, banco, representante...) |
| `repositorio/soportes/` | Los soportes de Periferia + su índice con vigencias |
| `glosario-campos.json` | Diccionario: traduce "Nombre de la empresa" → `razon_social`, etc. |

Los 4 casos de ejemplo están pensados para probar situaciones distintas:

- **co-industrias-delta** (Colombia, Excel): caso ideal, todo se llena.
- **ec-corp-andina** (Ecuador, PDF): pide RUC (confirmar) y le falta un soporte.
- **hn-agroexport-sula** (Honduras, Excel): pide RTN (confirmar) y tiene un soporte vencido.
- **pa-logistica-istmo** (Panamá, portal): formato no soportado, genera valores para copiar.

---

## 7. Cómo probarlo

### Opción rápida: la demo (sin navegador, sin clave)

```bash
npm install
npm run demo
```

Procesa los 4 casos de corrido y muestra un resumen de cada uno. Los resultados
quedan en `out/`.

### Opción completa: el chat

```bash
npm run dev
```

Abre `http://localhost:3001` y escribe, por ejemplo:
*"Procesa el caso ec-corp-andina. No envíes nada todavía."*

Verás el resumen, cada herramienta que usó, y un aviso si espera tu confirmación.

---

## 8. Glosario rápido

- **Agente**: el programa que conversa, decide qué herramientas usar y responde.
- **Herramienta (tool)**: una función concreta que hace una tarea y devuelve datos.
  Es la única fuente de valores reales.
- **Ciclo del agente**: el bucle "pregunto al modelo → ejecuto herramienta →
  repito" hasta tener la respuesta.
- **Adaptador LLM**: la pieza que habla con el modelo (mock, OpenAI o Anthropic).
- **Maestro**: la ficha con todos los datos de Periferia.
- **Fixture**: dato de entrada de ejemplo que da Periferia.
- **zod**: librería que valida que los argumentos de una herramienta tengan la
  forma correcta antes de ejecutarla.
- **Confirmación humana**: el agente se detiene y pregunta antes de cualquier
  acción externa (como "enviar"); no procede sin un sí explícito.
```
