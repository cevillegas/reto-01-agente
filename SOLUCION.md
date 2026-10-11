# SOLUCIÓN — Reto 01: Agente "Registro como Proveedor"

## 1. Problema en una frase

El área administrativa de Periferia transcribe a mano 8–12 formularios de
registro de proveedor al mes con datos que ya existen; le duele a la analista
administrativa (retrabajo y riesgo de error) y a la empresa (demora en facturar).

## 2. Arquitectura

```
┌──────────────┐  HTTP   ┌───────────────────────────────────────────┐
│ web/ (chat)  │ ──────▶ │ src/server.ts                              │
│ - historial  │ ◀────── │   └─ src/agent/loop.ts (ciclo del agente)  │
│ - tool calls │         │        ├─ src/llm/* (adaptador LLM)         │
│ - confirmar  │         │        └─ src/tools/* (herramientas zod)    │
└──────────────┘         └──────────┬──────────────────────┬──────────┘
                                    │                       │
                             fixtures/ (lectura)        out/ (escritura)
```

Separación de responsabilidades (lo que se evalúa):

- **Comportamiento** → `agent/prompt.md` (system prompt).
- **Conocimiento** → `src/knowledge/registro-proveedor.md` (reglas del proceso).
- **Ejecución** → `src/tools/` (herramientas). Son la única fuente de valores.
- Un cambio de reglas de negocio no toca `server.ts` ni el ciclo del agente.

## 3. Ciclo del agente

Implementado en `src/agent/loop.ts`. Por cada turno:

1. Se agrega el mensaje del usuario a la sesión (en memoria).
2. Bucle `modelo → herramientas` hasta que el modelo responde con texto o se
   alcanza el **tope de iteraciones** (`MAX_ITERATIONS`, default 25 — CA1).
3. Cada tool call se **valida con su esquema zod** antes de ejecutarse; si falla,
   el error vuelve al modelo (no se ejecuta la herramienta).
4. Toda tool call se registra en el historial visible del chat y en
   `out/log.jsonl` (CA4). Las herramientas además escriben `out/<caso>/log.jsonl` (RN5).
5. Un error del proveedor LLM se captura y se muestra en lenguaje claro; la
   sesión no muere (CA5).

**Confirmación humana (CA3)**: `proveedor_simular_envio` solo escribe si
`confirmado=true`. El agente nunca lo manda sin una confirmación explícita del
usuario en el turno anterior; termina el turno con una pregunta y el front
resalta ese estado (`needsConfirmation`).

**Control de costo**: tope de iteraciones por turno y tope de tokens por sesión
(`MAX_TOKENS_PER_SESSION`), ambos configurables.

## 4. Elección del modelo

El diseño es **agnóstico del proveedor**: el ciclo depende solo de la interfaz
`LLMAdapter` (`src/llm/adapter.ts`). Hay tres implementaciones:

- `mock` (default): máquina de estados determinista, sin red ni clave. Permite
  defender el agente completo sin gastar tokens y hace la demo reproducible.
- `openai`: Chat Completions con tool calling (`gpt-4o-mini` por defecto).
- `anthropic`: Messages API con tool use (`claude-3-5-sonnet` por defecto).

Para producción recomendaría `gpt-4o-mini` o `claude-3-5-haiku`: el trabajo real
lo hacen las herramientas (deterministas), el modelo solo orquesta y redacta. El
costo estimado por caso es bajo (orquestar 4–5 tool calls y un resumen; del orden
de centavos de USD por caso con un modelo pequeño).

## 5. Diseño del portal web (sección 7.4 del PRD)

El formato `portal` no se implementa como llenado automático. La herramienta
`proveedor_generar_formulario` detecta el formato y produce
`out/<caso>/valores-portal.md` con los valores listos para copiar.

Para producción:

- **Estrategia**: automatización con navegador controlado (Playwright) o una
  extensión de navegador que rellene campos a partir del mapeo. Límites reales:
  CAPTCHA, MFA y cambios de layout rompen cualquier automatización ciega.
- **Credenciales**: nunca en el repo, el prompt ni los logs. Las ingresa el
  humano en el portal; el agente nunca las ve. En producción, un gestor de
  secretos (Vault / Secrets Manager) y el humano completa MFA.
- **Reparto humano/agente**: el agente prepara y valida los valores; el humano
  hace login, resuelve CAPTCHA/MFA y da clic en "Enviar". El ingreso de
  credenciales y el envío final son siempre humanos.

## 6. Decisiones y trade-offs

1. **HTTP nativo de Node en vez de Express.** Menos dependencias, arranque
   trivial y portable. Trade-off: ruteo manual. Descarté Express porque el
   contrato de la API es mínimo y no justificaba la dependencia.
2. **Mapeo determinista por glosario con confianza discreta (1.0 / 0.9 / 0.0).**
   El PRD exige que el valor nunca se invente; un mapeo por reglas es auditable y
   reproducible. Descarté usar el modelo para el mapeo porque introduce no
   determinismo y riesgo de alucinar un valor: el modelo orquesta, no decide datos.
3. **Adaptador `mock` como default.** Permite demo y defensa sin clave ni costo, y
   desacopla la evaluación del agente de la disponibilidad de un proveedor.
   Trade-off: el mock no "razona", sigue un flujo fijo; es intencional, porque lo
   que se prueba es el ciclo y las herramientas, no la creatividad del modelo.
4. **Escritura solo bajo `out/`, fixtures como solo lectura.** Las rutas se
   centralizan en `src/domain/paths.ts` y se resuelven desde `ctx.directory`.

## 7. Supuestos

- **Fecha de ejecución** configurable (`FECHA_EJECUCION`, default `2026-09-03`,
  coherente con la versión del PRD). Con esa fecha: `camara_comercio` (vence
  2026-09-30) está vigente y `parafiscales` (vence 2026-08-31) está **vencido**,
  lo que ejercita el bloqueo por soporte vencido en el caso HN.
- El `portal` no trae plantilla de campos adjunta en los fixtures, así que
  `valores-portal.md` lista los campos que haya (en este fixture, ninguno) y deja
  el formato marcado como no soportado, que es lo que pide el PRD.
- Los campos sin fuente en el maestro (ej. "Número de contribuyente especial",
  "Referencias comerciales") se reportan como `faltante`, nunca se inventan.
- El identificador tributario extranjero se llena con el NIT colombiano y se
  marca `requiere_confirmacion` (RN1); no bloquea, lo decide la analista.

## 8. Cobertura de historias de usuario

| HU | Estado | Nota |
|---|---|---|
| HU-1 Leer la solicitud | hecho | Campos ambiguos de país → `requiere_confirmacion` (RN1). |
| HU-2 Mapear campos al maestro | hecho | 3 estados; glosario resuelve sinónimos; nunca inventa. |
| HU-3 Generar formulario | hecho | xlsx (P0) y pdf (P1) hechos; portal (P2) → valores-portal.md. |
| HU-4 Armar paquete para firma | hecho | checklist + soportes + borrador; bloqueo por vencido/ausente. |
| HU-5 Manejo de errores | hecho | Herramientas devuelven `{ ok, data }` o `{ ok:false, error }`, nunca lanzan. |

Para producción faltaría: AcroForm real en PDF (hoy se genera un PDF con los
campos), integración real de correo/SharePoint/portal, y un dueño del dato del
maestro.

## 9. Uso de IA

- **Asistente usado**: Kiro (agente de desarrollo) para andamiar la estructura,
  escribir las herramientas y la documentación.
- **Para qué**: scaffolding del proyecto, implementación de herramientas y ciclo,
  redacción de README/SOLUCION.
- **Qué descarté**: usar el LLM para el mapeo de campos (riesgo de inventar
  valores) y usar Express (dependencia innecesaria). Toda la lógica de datos es
  determinista y auditable, condición del PRD.

## 10. Riesgos en producción y mitigación

- **Plantillas peores que los fixtures** (campos ambiguos, formatos raros).
  Mitigación: ampliar el glosario y mantener el estado `requiere_confirmacion`
  como red de seguridad; el humano confirma lo dudoso.
- **El modelo "completa" un faltante.** Mitigación: el valor sale solo de las
  herramientas; el prompt lo prohíbe y el diseño lo hace innecesario.
- **Datos sensibles (cuenta bancaria, NIT).** Mitigación: datos bancarios solo si
  la plantilla los pide; nunca en el borrador de correo (RN2).
- **Maestro desactualizado.** Mitigación: definir un dueño del dato y una fecha de
  revisión; hoy el maestro es un fixture de solo lectura.
