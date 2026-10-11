---
name: registro-proveedor
description: Conocimiento del proceso de registro como proveedor de Periferia IT Group — estados de campo, reglas de país para el identificador tributario, manejo de soportes (vigencia y ausencia), formatos de salida y la regla de confirmación humana antes de acciones externas.
---

# Conocimiento del proceso: Registro como proveedor

## Qué es el proceso

Un cliente envía por correo una solicitud para registrar a Periferia IT Group
como proveedor. Pide llenar un formulario (Excel, PDF o portal web) y adjuntar
soportes. El agente llena el formulario con datos del repositorio maestro, arma
el paquete de soportes y lo deja listo para la firma del representante legal. El
agente nunca firma ni envía.

## Estados de un campo

- **lleno**: existe en el maestro con confianza alta (>= 0.8). Se escribe el valor.
- **faltante**: no existe en el maestro. Nunca se inventa. Va al reporte de faltantes.
- **requiere_confirmacion**: mapeo con confianza < 0.8, o una regla de país lo exige.

## Reglas de país (identificador tributario)

- CO → NIT · EC → RUC · PE → RUC · PA → RUC · HN → RTN.
- Periferia solo tiene NIT colombiano. Para clientes de otro país se llena con el
  NIT y se marca `requiere_confirmacion` con la nota "identificador extranjero".

## Datos bancarios

Solo se llenan si la plantilla los pide explícitamente. Nunca en el borrador de correo.

## Soportes

- Soporte exigido ausente del repositorio → bloquea `listo_para_firma`.
- Soporte vencido (`vigencia_hasta` < fecha de ejecución) → bloquea `listo_para_firma`.
- Soporte sin fecha de vigencia (`null`) → no vence.
- Un campo `faltante` NO bloquea la firma, pero aparece en el checklist.

## Formatos de salida

- **xlsx**: etiqueta y valor en la hoja/celda indicadas.
- **pdf**: PDF con todos los campos (etiqueta + valor) en orden.
- **portal**: no se implementa el llenado; se generan los valores en `valores-portal.md`.

## Acción externa

El agente no ejecuta ninguna acción externa sin confirmación explícita del
usuario en el turno inmediatamente anterior. "Enviar" solo escribe `ENVIO-SIMULADO.md`.
