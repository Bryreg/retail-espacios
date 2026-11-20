# Notas del capacitador · Capítulos 7 (Plano de la sede), 8 (Planogramas) y 9 (Ajustes)

Para quien da la capacitación del Administrador. Los datos son los de la siembra de prueba
(`herramientas/sembrar.py`, sede **CENTRO**): 16 muebles —góndolas dobles `GON-01`…`GON-04`
vendidas por participación, góndolas de la casa `GON-12` y `GON-13` con planogramas
publicados, puntas `PUN-01`…`PUN-09` y la nevera `NEV-01`—. Las capturas salen de
`administrador/capturas-plano.cjs` (computador, 1280 × 800).

## Todos los días / de vez en cuando

**Todos los días**
- Mirar **Pendientes › Hoy**: *Planograma montado por revisar* (revisarlo), *No se pudo montar el
  planograma*, *Planograma sin montar* (mandar la guía) y *Falta distribuir* (repartir la cara).
- Buscar un espacio en el plano por su código y abrir su ficha para contestar «¿está libre?, ¿quién lo
  tiene?, ¿hasta cuándo?».

**Cada semana**
- **Plano › Caras**: que no quede ninguna *Sin repartir* ni *Para revisar*.
- Filtro **Por vencer** del plano, para saber qué hay que renovar o volver a vender.

**De vez en cuando**
- Agregar, mover o borrar muebles cuando cambia la tienda; después, **Revisar**.
- Crear un mueble propio en **Mis muebles** cuando la tienda tiene uno con otras medidas.
- Publicar una versión nueva de un planograma (cambio de surtido, promoción con fecha de fin).
- Ajustes: tarifas al empezar el año, temporadas, metas, responsables por sede cuando cambia la gente.

**Muy rara vez (y con la gerencia)**
- **Renumerar** los códigos. Agregar o eliminar una sede.

## Nunca hagas

- **Nunca edites el plano con el proveedor mirando** la pantalla de Contratos o Indicadores (tienen
  precios). Para mostrar, usá el 3D con **Presentar**.
- **Nunca cierres la pestaña** con el aviso rojo *Rechazado por el servidor*: el cambio vive sólo en ese
  computador. Tocá **Deshacer** primero.
- **Nunca apliques Renumerar** sin el informe impreso y sin avisar a la tienda: cambian los códigos de
  la cartelería y de los correos.
- **Nunca cambies cómo se vende** (entera / entrepaños / participación) un mueble con contratos vivos.
- **Nunca pongas el correo de un proveedor** como gerente o administrador de sede en Avisos: recibiría
  los precios de todos. Al proveedor se le manda la guía con «Otros correos», que va sin precios.
- **Nunca reenvíes el enlace de una guía** a quien no monta: abre sin contraseña. Si pasó, Ajustes ›
  Equipo › *Cortar un enlace*.
- **Nunca elimines una sede** para «limpiarla»: se cierran sus contratos y el tablero pierde sus cifras.
  Vuelve sólo si la restaurás dentro de los 30 días.

## Errores típicos y cómo corregirlos

| Error | Cómo se ve | Cómo se corrige |
|---|---|---|
| Arrastró un mueble sin querer | Quedó corrido | **Deshacer** (o Ctrl+Z) enseguida. Si ya salió, arrastrarlo de vuelta. Para evitarlo: trabajar en **Mirar** salvo cuando se edita. |
| Intentó borrar un mueble vendido | *Rechazado por el servidor* · *El servidor no guardó el plano* | **Deshacer**. Si de verdad se va, primero cancelar el contrato y después borrar. |
| No encuentra un mueble por el proveedor | La búsqueda dice *0 de 16* | Buscar por el **código**. (Ver *Posibles errores del sistema*, 1.) |
| Publicó una versión con un error | La guía ya salió | Corregir el dibujo y **publicar la versión siguiente**; volver a mandar la guía. |
| Mandó la guía a quien no era | — | Ajustes › Equipo › **Cortar un enlace** con ese enlace. |
| Marcó «coincide» y no coincidía | Versiones: *Coincide* | Volver a revisar cuando quien monta avise otra vez; la última revisión manda. |
| Agregó una sede de más | Aparece en la lista de sedes | Eliminarla (pide escribir el nombre). Queda 30 días en la papelera. |
| El correo de prueba sale en rojo | *No son las credenciales…* | No es un error de la persona: avisar a quien maneja la cuenta / soporte. |
| Puso «mamut» en el tipo equivocado | El nombre propio sale en otro mueble | Borrar el campo (vacío vuelve al de RECABRA) y escribirlo en el tipo correcto. |

## Ejercicios sugeridos

1. **¿Quién tiene la `PUN-03`?** Buscá `PUN-03`, abrí su ficha y contestá: cómo se vende (*Por
   entrepaños*), qué entrepaños están vendidos y a quién (EN1 Café Montaña, EN2 Bebidas del Valle) y
   cuáles están libres (EN3 a EN6).
2. **Lo que vence.** Con el filtro **Por vencer**, encontrá el mueble que vence este mes (`PUN-01`,
   Limpio Hogar) y decí hasta cuándo va.
3. **Una punta nueva.** En **Editar**, agregá una *Punta Góndola* en un lugar libre, cambiale el código
   (por ejemplo `PUN-10`), pasala a *Por entrepaños* y después borrala con **Eliminar**. Probá también
   borrar la `PUN-04` (tiene contrato de Snacks Norte) y corregí con **Deshacer**.
4. **Una promoción en la casa.** En `GON-12 · cara B` (le queda 20 % libre) agregá el destino
   «Lácteos», categoría, 20 %; ubicalo, publicá la versión 2 desde hoy y mandá la guía a quien monta en
   CENTRO.
5. **Revisar un montaje.** En Pendientes › Hoy, revisá `GON-13 · B` (avisaron que quedó montada, sin
   foto): marcá **No coincide**, el número de *Arroz La Esquina*, escribí qué corregir y guardá
   mandando la guía.

## 5 preguntas de evaluación (con respuesta)

1. **¿En qué vista se agregan, mueven o borran muebles?** — En el Plano **2D**, en modo **Editar**. El
   3D es sólo para mirar.
2. **Quiero borrar la `PUN-04` y sale «El servidor no guardó el plano». ¿Qué pasó y qué hago?** —
   Tiene un contrato vivo (Snacks Norte). Toco **Deshacer**; si de verdad se va, primero se cancela el
   contrato y después se borra.
3. **¿Cuáles son los 3 pasos de «Distribuir la cara» en una góndola de la casa?** — Elegí qué va ·
   Dibujalo en la cara · Publicá con una fecha.
4. **Publiqué una versión con un error. ¿La borro?** — No se puede: una versión publicada no se borra
   ni se cambia. Se corrige y se publica la siguiente.
5. **¿Quién recibe la orden de montaje sin valores?** — El **Mercaderista** de la sede (Ajustes ›
   Avisos › Quién recibe los avisos). El gerente y el administrador de sede reciben el resumen con el
   valor.

## Qué demostrar en vivo

- Mirar ↔ Editar, la rueda para acercar y **espacio + arrastrar** para moverse; *Centrar en todo*.
- Buscar `PUN-05` y el filtro *Por vencer*.
- Colocar una punta, girarla con **R**, cambiarle el código y borrarla; borrar la `PUN-04` y ver el
  rechazo; **Deshacer**.
- El informe de **Renumerar** (sin aplicar) y **Imprimir**.
- El 3D: recorrer, *Primera persona*, *Presentar*.
- **Mis muebles**: el asistente de tres pasos hasta *Colocar en el plano*.
- `GON-03`: *Distribuir la cara A* y *Listo, guardar la cara*.
- `GON-12 · B`: agregar destino, arrastrar, publicar, mandar la guía, abrir la guía y *Copiar el enlace*.
- Pendientes › *Revisar* un planograma montado: *No coincide* con números.
- Ajustes: tarifas (se guardan solas), temporadas, agregar y eliminar una sede (papelera), nombres
  propios, correo de prueba.

## No se pudo capturar

- **Arrastrar un mueble en el 2D** se hace en el guion, pero la captura de «moverlo» no aporta (se ve
  igual que antes): se explica con texto y la captura de *Rotar* quedó fuera del manual por espacio.
- **«Productos y distribuciones» y probar un producto en el 3D** (elegir un mueble dentro del 3D):
  el clic sobre el dibujo 3D depende de la cámara y no es estable en el navegador automático. El 3D sí
  se ve (WebGL anduvo en headless).
- **El correo real de la guía** que le llega a quien monta: está en el manual de Quien monta.
- **Un correo de prueba que salga bien**: la copia de prueba tiene el correo cortado a propósito
  (puerto cerrado), así que siempre sale el mensaje rojo; se muestra como ejemplo de «si falla».
- **Aplicar Renumerar**: no se aplicó para no cambiar los códigos que usan el resto de las capturas.
- **Restaurar una sede de la papelera**: se muestra el botón *Restaurar*, no se tocó.

## Posibles errores del sistema

1. **La búsqueda del plano no encuentra proveedores con espacios por partes.** El buscador dice
   «Buscar espacio, categoría o proveedor…», pero «Café», «Montaña» o «Café Montaña» dan *0 de 16*,
   aunque Café Montaña tiene `PUN-02-EN2`, `PUN-03-EN1` y una participación en `GON-03-B`. «Snacks»
   sí encuentra 1 (la `PUN-04`, vendida entera). Reproducir: Plano › Mirar › escribir «Café».
2. **Textos con nombres viejos de pantallas** en la ficha del mueble (pestaña Venta):
   «Los contratos se hacen en **Sede → Vender**…» (hoy es *Contratos*), y en un mueble por
   participación «…se ubica en el **Editor 3D → «Distribuir esta cara»**» (hoy es *Plano › 3D* y el
   botón dice *Distribuir la cara*). En Ajustes › Tarifas: «…el **Dashboard** marca los contratos…»
   (hoy es *Inicio* / *Indicadores*). En «Cómo se llaman los muebles acá»: «Vender, Supervisar, Estado
   por espacio… el Editor 3D». Reproducir: abrir la ficha de `PUN-01` o `GON-03`.
3. **Pendientes › «Falta distribuir · empieza en 7 días o menos»** lista participaciones que *ya
   corren* desde hace meses (`GON-01 · A`… «ya corre»): el título dice «empieza en 7 días o menos».
   Reproducir: Pendientes › Hoy con la siembra.
4. **Pendientes › Planograma montado por revisar** dice «avisó que quedó · hoy 15:47 · sin foto»
   (parece faltar «montada»). Reproducir: Pendientes › Hoy, fila `GON-13 · B · versión 1`.
5. **Al tocar «Revisar» en Pendientes estando en el Plano**, la pantalla de atrás pasa al Inicio
   (la ficha de revisión se abre encima del Inicio, no del Plano). No rompe nada, pero desorienta.
6. **La ficha de `PUN-09`** (reserva provisional que empieza el mes que viene y caduca hoy) muestra el
   estado *Ocupado* en vez de *Reservado* (el filtro sí la cuenta en *Reservados*). Reproducir: Plano ›
   Editar › clic en `PUN-09`.
7. **Caras: la píldora «Lista · versión 1 desde el 20 nov» se monta sobre el texto «Sin montar»** de
   la columna de al lado a 1280 px. Reproducir: Plano › Caras.
8. **Distribuir la cara (por porcentaje):** dos marcas distintas (Yogur Andino y Papitas Norte) salen
   con el mismo azul punteado; cuesta distinguirlas. Reproducir: `GON-03` › Distribuir la cara A.
9. **El nombre del mueble en Mis muebles** sugiere «Nevera de la entrada» como ejemplo aunque se esté
   creando una punta (texto de ejemplo fijo). Menor.
10. **En Versiones dice «Publicada… por admin»** cuando se entra con la clave de instalación (sin
    persona). Con cuentas reales debería decir el correo; con la clave maestra no hay nombre.
11. **Para quien prepara capturas:** a 1280 × 800 la app aplica `zoom` al `<body>` (~0,9) y las marcas
    naranjas de `herramientas/comun.cjs` salían corridas (ya corregido en `comun.cjs`).
