# Conocimiento del proceso: Registro como proveedor

Este documento describe las reglas del negocio que el agente debe conocer. El
agente lo consulta como contexto; no contiene valores de datos (esos salen solo
de las herramientas).

## Qué es el proceso

Un cliente envía por correo una solicitud para registrar a Periferia IT Group
como proveedor en su sistema. Pide llenar un formulario (Excel, PDF o portal
web) y adjuntar soportes (Cámara de Comercio, RUT, certificación bancaria, etc.).
El agente llena el formulario con datos del repositorio maestro, arma el paquete
de soportes y lo deja listo para la firma del representante legal. El agente
nunca firma ni envía.

## Estados de un campo

Cada campo solicitado termina en uno de tres estados:

- **lleno**: existe en el maestro con confianza alta (>= 0.8). Se escribe el valor.
- **faltante**: no existe en el maestro. Nunca se inventa. Va al reporte de faltantes.
- **requiere_confirmacion**: mapeo con confianza < 0.8, o una regla de país lo exige.

## Reglas de país (identificador tributario)

El identificador tributario cambia por país:

- Colombia (CO) → NIT
- Ecuador (EC) → RUC
- Perú (PE) → RUC
- Panamá (PA) → RUC
- Honduras (HN) → RTN

Periferia solo tiene NIT colombiano. Cuando el cliente de otro país pide su
identificador tributario, se llena con el NIT pero se marca
`requiere_confirmacion` con la nota de "identificador extranjero". La analista
decide si aplica.

## Datos bancarios

Los datos bancarios (banco, tipo de cuenta, número de cuenta, titular, SWIFT)
solo se llenan si la plantilla los pide explícitamente. Nunca se incluyen en el
borrador de correo.

## Soportes

- Un soporte **exigido pero ausente** del repositorio bloquea `listo_para_firma`.
- Un soporte **vencido** (su `vigencia_hasta` es anterior a la fecha de ejecución)
  bloquea `listo_para_firma`.
- Un soporte sin fecha de vigencia (`null`) no vence.
- Un campo `faltante` NO bloquea la firma, pero aparece en el checklist.

## Formatos de salida

- **xlsx**: se escribe cada etiqueta y su valor en la hoja y celda indicadas.
- **pdf**: se genera un PDF con todos los campos (etiqueta + valor) en orden.
- **portal**: no se implementa el llenado. Se responde "formato no soportado" y
  se generan los valores listos para copiar en `valores-portal.md`.

## Acción externa

El agente no ejecuta ninguna acción externa (envío, firma, carga a portal) sin
una confirmación explícita del usuario en el turno inmediatamente anterior.
"Enviar" en este reto solo escribe `ENVIO-SIMULADO.md`.
