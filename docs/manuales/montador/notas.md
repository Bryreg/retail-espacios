# Notas · Quien monta

Verificado contra la app de después del PR #121 (siembra de `herramientas/sembrar.py`, ventana de
900 px), el 20/11/2026.

## No se pudo capturar
- **El correo dentro de un buzón real** (Gmail, Outlook): en la copia de prueba no sale ningún correo. Se muestra el correo REAL que armó el servidor (sacado de su cola, `herramientas/correo.py`) con una cabecera de buzón simple; en el equipo de cada persona se ve con el diseño de su aplicación de correo. El guion le da 8 px de aire al enlace del correo para que el recuadro naranja no tape el renglón de arriba (sólo en la captura).
- **La cámara**: la captura muestra el botón «Tomar foto»; la foto se cargó como archivo (la cámara del navegador no existe en la copia).
- **Que el reporte salga solo al volver la conexión** con la página abierta: lo hace la app (verificado), pero el guion ahora captura el otro camino —cerrar la página sin conexión y volver a abrir el enlace: «Tenés un reporte sin mandar» › «Mandar ahora»—, que antes no se había capturado.

## Posibles errores del sistema / cosas para revisar
- ~~En el correo «… por montar», la fecha sale como `desde el 2026-11-20`.~~ **Arreglado en #121**: el correo dice «desde el 20/11/2026» (dd/mm/aaaa). La pantalla de montaje sigue diciendo «Del 20 nov al 31 ene»; son dos formatos, pero los dos se leen.
- ~~«Sin señal: tu reporte quedó guardado en este teléfono.» en el computador.~~ **Arreglado en #121**: «Sin conexión: tu reporte quedó guardado en este equipo.», «… apenas vuelva la conexión.» y «Guardado en este equipo hoy a las …».
- Los entrepaños se cuentan con la base incluida: una punta con 5 entrepaños en el plano dice «Entrepaño 1 de 6». Es la regla del catálogo (ESTADO.md, #121: «no es un error»); el manual lo explica («el 1 es la base»).
- En la pantalla de montaje, la guía de un planograma cuenta los estantes **desde arriba** y los entrepaños de una punta **desde abajo**. No es un error, pero es la confusión más probable; el manual y la hoja de bolsillo lo remarcan.
- **Nuevo (sigue pasando, verificado):** si lo que quedó sin mandar es una **corrección** de un espacio ya reportado («Corregir el reporte» › … › «Confirmar» sin conexión) y se cierra la página, al volver a abrir el enlace se ve «Este espacio ya se reportó como montado» con el reporte viejo, y el «Tenés un reporte sin mandar» aparece recién después de tocar «Corregir el reporte». Quien no lo toque cree que no hay nada pendiente. Reproducir: enlace de PUN-03-EN1 ya reportado › «Corregir el reporte» › «Lo monté» + foto › sin conexión › «Confirmar» › cerrar › con conexión, abrir el enlace. El manual (5.1) lo avisa en una caja.
- **Nuevo (cosmético):** «Tocá para verla en grande» abre la planometría en una pestaña nueva del navegador (no en grande dentro de la página). El manual ahora lo dice; antes la captura «en grande» mostraba la misma pantalla.
