# Notas · Quien monta

## No se pudo capturar
- **El correo dentro de un buzón real** (Gmail, Outlook): en la copia de prueba no sale ningún correo. Se muestra el correo REAL que armó el servidor (sacado de su cola, `herramientas/correo.py`) con una cabecera de buzón simple; en el teléfono de cada persona se ve con el diseño de su aplicación de correo.
- **«Mandar ahora» / «Descartar»** al volver a abrir un enlace con un reporte guardado sin señal (habría que cerrar la página sin señal y volver a abrirla): se explica con el texto del código (`FormularioMontaje.tsx`), sin captura.
- **La cámara del celular**: la captura muestra el botón «Tomar foto»; la foto se cargó como archivo (la cámara del navegador no existe en la copia).

## Posibles errores del sistema / cosas para revisar
- En el correo «… por montar», la fecha sale como `desde el 2026-11-20` (formato de sistema), mientras la pantalla de montaje dice «Del 20 nov al 31 ene». Cosmético, pero quien monta lee las dos.
- Los entrepaños se cuentan con la base incluida: una punta con 5 entrepaños en el plano dice «Entrepaño 1 de 6». Es coherente en toda la app (el plano dice «2 de 6 entrepaños vendidos»), así que parece intencional; el manual lo explica («el 1 es la base»).
- En la pantalla de montaje, la guía de un planograma cuenta los estantes **desde arriba** y los entrepaños de una punta **desde abajo**. No es un error, pero es la confusión más probable; el manual y la hoja de bolsillo lo remarcan.
