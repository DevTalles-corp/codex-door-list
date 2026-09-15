# Design pass de la entrada digital

| # | Hallazgo | Archivo:línea | Decisión | Razón |
|---:|---|---|---|---|
| 1 | En móvil, cinco filas de detalles aparecen antes del código QR. | `app/entradas/[code]/public-ticket.tsx:104`; `app/globals.css:289` |atender|  |
| 2 | La vista válida no indica explícitamente que el asistente debe presentar el código QR al ingresar. | `app/entradas/[code]/public-ticket.tsx:91` |atender|  |
| 3 | El título del evento puede competir visualmente con el estado y el código QR. | `app/entradas/[code]/public-ticket.tsx:97`; `app/globals.css:24` |atender|  |
| 4 | Los cinco datos de la entrada se presentan con el mismo peso, sin dividir la información en grupos más pequeños. | `app/entradas/[code]/public-ticket.tsx:105` |atender|  |
| 5 | Una falla al consultar el servicio se presenta bajo el título «Entrada no encontrada». | `app/entradas/[code]/public-ticket.tsx:72` |rechazar|Esto puede ser debido a migraciones, si no la encuentra en la base de datos esta bien el mensaje|
| 6 | El estado de enlace inválido no ofrece una salida, una ruta de regreso ni una alternativa de recuperación. | `app/entradas/[code]/public-ticket.tsx:72` |atender|  |
| 7 | Los estados de error no ofrecen una vía para contactar al organizador o solicitar ayuda. | `app/entradas/[code]/public-ticket.tsx:72` |rechazar|Todavía no se implemento una página o medio de comunicación|
| 8 | La carga reemplaza por completo la geometría final de la entrada y provoca un salto estructural. | `app/entradas/[code]/public-ticket.tsx:62` |atender|  |
| 9 | El mensaje dinámico de carga no usa `role="status"` para anunciar la verificación a tecnologías asistivas. | `app/entradas/[code]/public-ticket.tsx:64` |atender|  |
| 10 | La entrada se obtiene después de la hidratación del cliente y la ruta no aporta una representación de carga con geometría de ticket. | `app/entradas/[code]/page.tsx:17`; `app/entradas/[code]/public-ticket.tsx:58` |atender|  |
| 11 | El email del asistente permanece visible en una credencial que puede mostrarse a terceros. | `app/entradas/[code]/public-ticket.tsx:107` |atender|  |
| 12 | El token completo permanece visible aunque no sea necesario para el escaneo habitual. | `app/entradas/[code]/public-ticket.tsx:121` |atender|  |
| 13 | El token de 64 caracteres no tiene una etiqueta que explique su función como código de respaldo. | `app/entradas/[code]/public-ticket.tsx:121` |atender| |
| 14 | El código de respaldo puede partirse en cualquier posición, por lo que resulta difícil leerlo, dictarlo o compararlo. | `app/entradas/[code]/public-ticket.tsx:121`; `app/globals.css:256` |atender| |
| 15 | No existe una acción para copiar el código de respaldo. | `app/entradas/[code]/public-ticket.tsx:113` |atender|  |
| 16 | La página tiene estilos de impresión, pero no ofrece una acción visible para imprimir o guardar la entrada. | `app/entradas/[code]/public-ticket.tsx:91`; `app/globals.css:296` |atender|  |
| 17 | Las advertencias de entrada utilizada o revocada usan `role="status"` aunque ya están presentes en el render inicial. | `app/entradas/[code]/public-ticket.tsx:125` |rechazar|Ya están presentes en el render inicial |
| 18 | Los estados «Utilizada» y «Revocada» explican lo ocurrido, pero no indican qué puede hacer el asistente a continuación. | `app/entradas/[code]/public-ticket.tsx:125` |rechazar|Esto se implementara con la atención al cliente|
| 19 | La insignia de entrada válida depende de texto y color, pero no incorpora una señal visual compacta para acelerar el reconocimiento. | `app/entradas/[code]/public-ticket.tsx:99` |atender|  |
| 20 | La composición es coherente, pero todavía podría reutilizarse casi sin cambios en otra plataforma de eventos. | `app/entradas/[code]/public-ticket.tsx:93` |rechazar|Ya que se puede utilizar no haremos cambios |
