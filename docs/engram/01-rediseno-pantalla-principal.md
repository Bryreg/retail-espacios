# Rediseño de la pantalla principal: por qué se veía hecho con IA

> Engram (pendiente de cargar) · `diseno/rediseno-2026-09` · sesiones del
> 2026-08-31 al 2026-09-01 · estado vigente en
> [docs/ESTADO.md](../ESTADO.md#rediseño-de-la-pantalla-principal)

## El disparador

Al presentar el sistema, la devolución fue: **«se ve muy obvio que es hecho con
IA»**. No era un comentario sobre la funcionalidad. Lo que siguió fueron seis
rondas y una veintena de maquetas.

## Lo que no funcionó, y por qué importa

**Sacar los tells no alcanza.** La primera pasada quitó gradientes, sombras,
esquinas redondeadas y la paleta por defecto. Rechazada: quitar las señales deja
una interfaz *neutra*, que es otro género reconocible. La sustracción no produce
identidad.

**Partir de lo que ya existe ancla.** Cinco propuestas hechas sobre la base de la
que más gustaba dieron cinco rechazos: convergieron a variaciones en vez de
proponer. **Diseñar a ciegas** —sin ver el sistema actual ni ninguna propuesta
previa— fue lo único que produjo un acierto.

**«Storytelling» no quería decir más texto.** Una ronda entera se perdió
agregando prosa. La aclaración fue: *«no me refiero a poner más texto, me refiero
a que la forma de presentar los datos sea la más óptima para lo que están
diseñados»*.

**Un cambio de escuela completo tampoco.** Una ronda pedida en clave WMS/ERP de
bodega grande fue rechazada en bloque. La escuela que sobrevivió es la de los
sistemas de administración de comercio, tomando su **estructura** y no su piel.

## Los criterios, en las palabras del usuario

1. **Pulcro.** Que cada cosa esté ahí por algo.
2. **Cerrar trato y revisar información, todo a la mano.**
3. La forma de presentar cada dato tiene que ser **la óptima para ese dato**.
4. **Sin sesgo**: los diseñadores no ven el sistema actual.

## Dos restricciones que aparecieron en el camino

- **El mapa isométrico es innegociable en las dos pantallas.** Varios agentes
  dibujaron plantas ortogonales; ninguna sirvió.
- **La pantalla Vender la ve el cliente.** No puede aparecer el nombre de otro
  proveedor, ni un canon negociado, ni un ranking, ni nada por debajo de tarifa,
  ni el canon total de la sede, ni la plata del periodo. Sólo disponibilidad,
  tiempo y contrato. Esto invalidó la mejor función de una de las propuestas.

## La elegida

**q1**, por el plano isométrico y por las fechas de liberación escritas sobre el
propio mueble. Injertos de **q3**: contratar varios espacios en un solo contrato
—un proveedor no negocia una punta suelta— y el bloque «cuándo se libera cada
espacio». El **calendario comercial de q2 se descartó después de probarlo**:
repetía lo que ya dicen la banda de temporada del gráfico y los sellos del
contrato.

## La decisión de forma que más costó

«Cuándo se libera cada espacio» se rehízo cinco veces. Sirve de precedente para
cualquier gráfico del sistema:

| Intento | Por qué falló |
|---|---|
| Una barra por espacio sobre eje de fechas (q3) | Gasta el ancho pintando lo *ocupado*, que es lo que no se vende; la fecha queda como astilla contra el borde |
| Área escalonada con los códigos sobre los escalones | Cinco códigos en tres fechas separadas por dos días se pisan entre sí y contra el borde |
| Escalera + columna de códigos al costado | Deja de chocar, pero parte el bloque en dos piezas que hay que juntar con la vista |
| Cinco formas distintas a competir | Ganó la escalera; las otras cuatro —inventario por tipo, tira del mes, agenda sin gráfico, un punto por espacio— quedan guardadas en `docs/maquetas/opciones-libera.html` |
| **A·4: escalera a todo el ancho** | **La que quedó** |

La disponibilidad **sólo sube** dentro del periodo: la serie es monótona y el
escalón dice de un vistazo lo único que importa al negociar una fecha de inicio
—no se mueve nada durante 25 días y después caen tres entregas en cinco—.

Cuatro decisiones de A·4 que conviene no deshacer:

1. **Sin columna lateral.** A 1024 px quedan 66 px entre el 25 y el 27 de sep y
   un chip mide 56: los códigos caben debajo de su fecha. Si el panel se
   angosta, vuelven a chocar y hay que reponer la columna.
2. **Sin eje vertical.** El rango es angosto (15 a 20); cada tramo va rotulado
   con su cifra, al inicio de la meseta para que quede pegada a su escalón.
3. **Peine de días** bajo el eje: el tramo plano se lee como tiempo que pasa.
4. **El cursor escribe la respuesta.** Es lo que convierte el gráfico en la
   contestación de «¿cuántos tengo si arranca el día X?».

Se descartó a propósito la variante con **techo en los 23 de la sala**: hace
legible la proporción pero aplasta el escalón, que es el dato que se negocia.
De ella queda una regla de color: sus bandas son un solo tono con luminosidad
descendente, no tres colores, porque la versión con gris daba ΔE 4.0 en
deuteranopía contra el verde claro.

## La paleta, que es una regla y no un gusto

**Verde se puede vender, naranja a medias, rojo no.** Una escala, no tres
etiquetas sueltas. Cuatro estados: libre `#00786A`, parcialmente ocupado
`#F08519`, tomado `#8E1226`, resto de la sala `#D3D9DB`. El mismo naranja sirve
en la paleta de producción, que tiene el rojo más claro.

El naranja tiene un costo anotado: es vecino de tono del rojo, así que el par
más apretado se mudó ahí —ΔE 13.8 daltónico y 16.7 en visión normal, contra
21.8 y 27.5 que daba el ámbar—. Sigue por encima del piso y los dos estados van
rotulados, pero no se puede oscurecer más: `#D4700F` cae a ΔE 6.6 contra el rojo
de producción.

El rojo es **oscuro a propósito**. Verde contra rojo es el par que se colapsa
en un daltónico y lo único que los separa es la luminosidad. Validado con el
script de dataviz sobre todos los pares: peor caso ΔE 11.0 en deuteranopía y
16.8 en visión normal. Cada estado va además rotulado. **Antes de mover
cualquiera de los cuatro hay que volver a correr el validador**; que «se vean
distintos» no es evidencia.

Ojo con el precedente: en una ronda anterior el par verde + naranja
(`#C8501E ↔ #17734D`) dio ΔE 5.3 en protanopía y hubo que abandonarlo. Lo que
salvó al rojo no fue el tono sino bajarlo en luminosidad.

El verde queda reservado para la disponibilidad: una acción como «agregar otro
espacio» va en tinta, no en verde.

## Siete tamaños de letra

9.5 · 11 · 12 · 13 · 14.5 · 17 · 27. Antes había diecisiete, que es lo que hace
que una pantalla se vea armada de a pedazos. El contraste lo dan la familia, el
peso y el color, no el tamaño. Nada baja de 9.4 px reales.
`generadores/tamanos.mjs` lista los tamaños como se renderizan —incluido lo que
va dentro de un SVG, que se escala con el viewBox— y sirve para no dejar entrar
un octavo.

## Regla de honestidad que hay que sostener

Hoy es el día 1 de 31 del periodo, así que **la plata perdida del periodo es
$0**. La cifra verdadera y útil es la **quema diaria: $294.411 por día vacío**.
Ninguna pantalla debe pintar una pérdida que todavía no existe.

## Dónde vive todo

- `docs/maquetas/` — las ocho pantallas finalistas, la elegida, el brief, los
  criterios, el prompt completo y las tipografías en disco.
- `docs/maquetas/generadores/riel.py` — genera el SVG del gráfico de liberación.

## Lo que falta

La contraparte de **Supervisar** con el mismo sistema, y después bajarlo al
código. Cuando eso pase hay que reescribir «La línea visual» de `ESTADO.md`.
