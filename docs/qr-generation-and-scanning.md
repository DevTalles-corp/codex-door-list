# Generación y lectura de códigos QR

**Estado:** recomendación técnica pendiente de implementación  
**Fecha:** 17 de septiembre de 2026

## Objetivo

Generar los códigos QR de las entradas en el servidor y permitir que el organizador los lea desde la cámara del navegador.

## Decisión recomendada

- Usar [`qrcode`](https://github.com/soldair/node-qrcode) para generar el QR en el servidor.
- Usar [`qr-scanner`](https://github.com/nimiq/qr-scanner) para leerlo desde la cámara del navegador.
- Mantener la validación y el registro del ingreso en el servidor. Un QR decodificado no debe considerarse una entrada válida por sí solo.

La recomendación se basa en la documentación vigente consultada mediante Context7 y en las dependencias y usos actuales del repositorio.

## Generación en el servidor

### Opción 1: `qrcode` — recomendada

`qrcode` ofrece APIs específicas para Node.js:

- `toBuffer()` genera una imagen PNG como `Buffer`.
- `toString(..., { type: "svg" })` genera SVG.
- Permite configurar tamaño, margen, colores y nivel de corrección de errores.
- El mismo resultado puede utilizarse en respuestas HTTP, emails o almacenamiento.

Esta dependencia ya está instalada y se usa en `lib/registration-email.ts` para adjuntar el QR al correo de confirmación.

### Opción 2: `qrcode.react`

`qrcode.react` proporciona `QRCodeSVG` y `QRCodeCanvas` para representar un QR como parte del DOM de React. Es conveniente cuando el único objetivo es mostrarlo dentro de una pantalla.

No es la opción preferida para la generación centralizada en servidor porque:

- Está orientada a la capa de presentación React.
- No produce directamente un archivo o `Buffer` reutilizable.
- La variante Canvas necesita APIs del navegador.
- Mantenerla junto con `qrcode` crea dos implementaciones para el mismo QR.

Actualmente se utiliza en `app/entradas/[code]/public-ticket.tsx`. Al implementar esta decisión, conviene reemplazar ese uso por una imagen producida en el servidor y evaluar la eliminación de `qrcode.react` si no queda ningún otro consumidor.

## Lectura desde la cámara

### Opción 1: `qr-scanner` — recomendada

`qr-scanner` está enfocada en códigos QR y proporciona:

- Lectura desde un elemento `<video>` o desde una imagen.
- Uso de `BarcodeDetector` nativo cuando está disponible.
- Fallback automático a un Web Worker cuando `BarcodeDetector` no existe o falla.
- Ciclo de vida explícito mediante `start()`, `stop()` y `destroy()`.
- Detección de cámaras y selección preferente de la cámara trasera.

Es la alternativa más pequeña y directa para Door List porque el producto solamente necesita leer QR.

### Opción 2: `html5-qrcode`

[`html5-qrcode`](https://github.com/mebjas/html5-qrcode) admite QR y numerosos formatos adicionales de códigos de barras. Incluye:

- `Html5QrcodeScanner`, con interfaz preconstruida.
- `Html5Qrcode`, para construir una interfaz propia.
- Lectura desde cámara o archivo.
- Selección de cámara y control de región y frecuencia de escaneo.

Es una buena elección si más adelante se necesitan formatos como EAN, UPC, Code 128 o Data Matrix. Para el alcance actual aporta más API y funcionalidad de la necesaria.

## Arquitectura propuesta

1. Centralizar la generación en un helper dentro de `lib/` usando `qrcode`.
2. Exponer el QR desde una Route Handler, por ejemplo `app/api/entradas/[code]/qr/route.ts`, con el `Content-Type` correspondiente y una política de caché deliberada.
3. Mostrar esa imagen en la entrada pública sin generar nuevamente el QR en el navegador.
4. Implementar el lector como un componente de cliente junto a la ruta del dashboard que lo use. Este componente requiere `"use client"` porque controla `<video>`, permisos y `getUserMedia`.
5. Tras decodificar el QR, enviar `{ ticketCode }` a una API de check-in.
6. Validar en el servidor el evento, la existencia, pertenencia, vigencia y estado del ticket.
7. Registrar el ingreso mediante una operación atómica para impedir el uso concurrente o repetido de la misma entrada.

## Seguridad y comportamiento

- El contenido del QR debe ser un identificador opaco, no información personal del asistente.
- Nunca se debe confiar en el valor recibido desde el lector sin validarlo en el servidor.
- La API debe diferenciar con estados HTTP reales una entrada inexistente, revocada, ya utilizada o válida.
- Los contratos de request y response deben usar `camelCase` y los errores deben conservar la forma `{ error: string }`.
- La interfaz no debe mostrar mensajes crudos de Supabase ni de la librería de cámara.
- La cámara requiere un contexto seguro HTTPS, salvo las excepciones habituales de desarrollo local.
- El permiso de cámara debe solicitarse como consecuencia de una acción clara del usuario.
- Al abandonar la pantalla o completar la lectura se debe ejecutar `stop()`/`destroy()` para liberar la cámara y el worker.
- Debe existir una alternativa manual para introducir el código de respaldo cuando la cámara no esté disponible o el permiso sea rechazado.

## Criterio para reconsiderar la decisión

Reevaluar `html5-qrcode` si el producto comienza a admitir códigos de barras distintos de QR o si se decide adoptar su interfaz preconstruida. Mientras el alcance sea exclusivamente QR y la aplicación mantenga su propia interfaz, conservar `qr-scanner` como opción preferida.
