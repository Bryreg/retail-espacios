# Notas del capacitador · Capítulos 7 (Plano de la sede), 8 (Planogramas) y 9 (Ajustes)

Para quien da la capacitación del Administrador. Los datos son los de la siembra de prueba
(`herramientas/sembrar.py`, sede **CENTRO**): 16 muebles —góndolas dobles `GON-01`…`GON-04`
vendidas por participación, góndolas de la casa `GON-12` y `GON-13` con planogramas
publicados, puntas `PUN-01`…`PUN-09` y la nevera `NEV-01`—. Las capturas salen de
`administrador/capturas-plano.cjs` (computador, 1280 × 800). Actualizado el 20/11/2026 contra la app con
los arreglos del PR #121; revisado otra vez con #123 (sin capturas nuevas: ninguna de estas pantallas
mostraba lo que cambió).

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
| No encuentra un mueble | La búsqueda dice *0 de 16* | Mirar que el filtro de abajo esté en **Todos**; probar con el código o con otra parte del nombre del proveedor. |
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
- Buscar `PUN-05`, después «Café Montaña» (marca `PUN-02`, `PUN-03` y `GON-03`: 3 de 16) y el filtro *Por vencer*.
- La ficha de `PUN-09`: «Reservado» (no «Ocupado»).
- Colocar una punta, girarla con **R**, cambiarle el código y borrarla; borrar la `PUN-04` y ver el
  rechazo; **Deshacer**.
- El informe de **Renumerar** (sin aplicar) y **Imprimir**.
- El 3D: recorrer, *Primera persona*, *Presentar*.
- **Mis muebles**: el asistente de tres pasos hasta *Colocar en el plano*.
- `GON-03`: *Distribuir la cara A* (cada marca con su color) y *Listo, guardar la cara*.
- `GON-12 · B`: agregar destino, arrastrar, publicar, mandar la guía, abrir la guía y *Copiar el enlace*.
- Pendientes › *Revisar* un planograma montado, abriendo Pendientes desde el Plano: «Viniste desde Plano de
  la sede…», *No coincide* con números, y al cerrar vuelve al Plano.
- Ajustes: tarifas (se guardan solas), temporadas, agregar y eliminar una sede (papelera), nombres
  propios, correo de prueba.

## No se pudo capturar

- **Arrastrar un mueble en el 2D** se hace en el guion, pero la captura de «moverlo» no aporta (se ve
  igual que antes): se explica con texto.
- **«Productos y distribuciones», probar un producto y el panel de un mueble en el 3D** (donde una
  reserva dice «Reservado»): el clic sobre el dibujo 3D depende de la cámara y no es estable en el
  navegador automático. El 3D sí se ve, y su leyenda dice *Disponible · Ocupado · Reservado · No
  comercializable*.
- **El correo real de la guía** que le llega a quien monta: está en el manual de Quien monta.
- **Un correo de prueba que salga bien**: la copia tiene el correo cortado a propósito (puerto cerrado),
  así que siempre sale el mensaje rojo; se muestra como ejemplo de «si falla».
- **Aplicar Renumerar**: no se aplicó para no cambiar los códigos que usan el resto de las capturas.
- **Restaurar una sede de la papelera**: se muestra el botón *Restaurar*, no se tocó.

## Posibles errores del sistema

Los de la versión anterior de estas notas, uno por uno (verificados el 20/11/2026):

1. **La búsqueda del plano no encontraba proveedores con espacios por partes.** — **Arreglado en
   #121.** «Café Montaña» marca `PUN-02`, `PUN-03` y `GON-03` (*3 de 16*; captura `03b-buscar-proveedor`).
2. **Textos con nombres viejos de pantallas.** — **Arreglado en #121.** La ficha dice «Los contratos se
   hacen en Contratos…» y, en un mueble por participación, «…se ubica en Plano de la sede › 3D →
   «Distribuir la cara»»; Tarifas dice «Con esto, Pendientes marca los contratos que pagan por debajo
   (en Corregir)»; «Cómo se llaman los muebles acá» nombra Contratos, Indicadores, Montajes, Tarifas y el
   Plano de la sede. El que quedaba —la pestaña Venta, bajo *Cómo*, «…Vender ofrece la cara entera…»—
   está **arreglado en #123**: Plano › clic en `PUN-01` dice «Se vende entera. Con «Entera o por …»,
   Contratos ofrece la cara entera o cada parte, nunca las dos en las mismas fechas.» (verificado el
   20/11/2026, noche).
3. **«Falta distribuir · empieza en 7 días o menos» con participaciones que ya corren.** — **Arreglado en
   #121:** el título dice «Falta distribuir · ya corre · 7» y cada fila «· ya corre.».
4. **«avisó que quedó · hoy … · sin foto».** — **Arreglado en #121:** «avisó que quedó montada · hoy … ·
   sin foto».
5. **«Revisar» desde Pendientes estando en el Plano dejaba el Inicio atrás.** — **Arreglado en #121** (como
   se decidió): la bandeja vive en el Inicio, pero arriba dice «Viniste desde Plano de la sede: al cerrar
   Pendientes volvés ahí.» con «Volver a Plano de la sede», y al cerrar la revisión y la bandeja vuelve a
   `/plano`.
6. **La ficha de `PUN-09` (reserva) decía «Ocupado».** — **Arreglado en #121:** dice «Reservado» (captura
   `05b-ficha-reserva`). El renglón *Estado* de la pestaña Venta también dice «Reservado».
7. **Caras: la píldora «Lista · versión 1 desde el 20 nov» se montaba sobre «Sin montar».** — **No se
   repite:** a 1280 px la píldora parte en dos renglones y no pisa la columna de al lado.
8. **Distribuir la cara: dos marcas con el mismo azul.** — **Arreglado en #121:** Yogur Andino, Papitas
   Norte y Aseo Total Hogar salen cada una de un color.
9. **«Nevera de la entrada» como ejemplo de nombre al crear una punta.** — **Arreglado en #123:** el
   ejemplo es del tipo elegido. Mis muebles › Crear un mueble › paso 3: *Punta de góndola* sugiere «Punta
   de la entrada»; *Nevera de puertas*, «Nevera de la entrada» (verificado el 20/11/2026, noche). La
   captura `21-asistente-3` tiene el nombre ya escrito, así que no cambia.
10. **«Publicada… por admin» con la clave de instalación.** — **Sigue:** Versiones dice «Publicada el 20
    nov por admin · rige desde el 20 nov». Con cuentas reales debería decir la persona; con la clave
    maestra no hay nombre (propio de la copia de prueba).
11. **Para quien prepara capturas: el `zoom` del `<body>`.** — Ya corregido en `comun.cjs`.

Nuevos:

12. **(Herramientas) La siembra falla de noche** (ver `notas.md`, 16): correr `levantar.sh` y los guiones
    con `TZ=America/Bogota` entre las 19:00 y las 24:00 de Colombia.
