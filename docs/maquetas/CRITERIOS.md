# Lo que este cliente ya dijo que quiere

Este encargo lleva varias rondas. **No vas a ver ninguna propuesta anterior,
a propósito** — la idea es que tu solución nazca del problema y no de corregir
la de otro. Pero sí tenés lo que el cliente dijo con sus palabras, que es la
información más cara que hay acá.

## Sus palabras

> "Quiero un sistema pulcro, que cada cosa esté ahí por algo, que pueda cerrar
> trato y revisar información todo a la mano."

> "No me refiero a poner más texto, me refiero a que la forma de presentar los
> datos sea la más óptima para lo que están diseñados."

> "Se ve muy obvio que es hecho con IA. Ojalá volver la interfaz mucho más
> parecida a algo hecho por humano."

## Los cuatro criterios que salen de ahí

### 1. La forma la manda el dato, no el gusto

Antes de dibujar cada cosa, preguntate **qué trabajo hace ese dato**, y de ahí
sale la forma. No al revés. Algunos ejemplos del razonamiento, no de la
solución:

- Una magnitud sola no necesita gráfico: es una cifra. Un anillo de progreso
  para un solo número es decoración.
- Unas partes de un total quieren una forma donde se vea que **suman**.
- Un ranking quiere estar **ordenado**; ordenado, se lee sin mirar las cifras.
- Unos hechos con fecha quieren un **eje de tiempo**, no una tabla ordenada por
  días: la tabla dice cuándo, el eje dice además *cuánto falta* y *qué se
  superpone*.
- Una ubicación quiere un plano, y no hay sustituto.
- Una cantidad que hay que **contar** (cuántos espacios de 23) se cuenta mejor
  en unidades discretas que en un porcentaje.

Si dos elementos dicen el mismo dato de dos maneras, uno de los dos sobra.

### 2. Pulcro: cada cosa está ahí por algo

Recorré tu propia pantalla elemento por elemento y preguntá "¿esto qué hace?".
Lo que no contesta, se va. Un rótulo que repite lo que se ve, un ícono que
acompaña a una palabra que ya se entiende, un borde que separa lo que el
espacio ya separaba, una cifra que está dos veces: todo eso se va.

El cliente rechazó una propuesta por **agregarle un párrafo explicativo**. La
prosa no es la respuesta: si hace falta una frase para explicar un gráfico, el
gráfico está mal elegido.

### 3. Cerrar trato y revisar, las dos al mismo tiempo

El usuario está al teléfono con un proveedor. No puede irse a otra pantalla a
mirar un dato y volver, ni esperar a que algo se abra.

Eso quiere decir que **el formulario del contrato no puede ser un globo que
aparece al hacer clic**: si armar el contrato es la mitad del trabajo, la
mitad del trabajo tiene lugar fijo. Y toda la información de revisión tiene
que estar puesta al mismo tiempo, sin scroll, en 1440×900.

### 4. Que no se lea como generado

El cliente ya rechazó varias rondas diciendo que "se ve hecho por IA". Dos
caminos que ya se probaron y **no** funcionaron, para que no los repitas:

- **Imitar un género de software conocido.** Copiar el aspecto de una familia
  de productos famosa da un resultado correcto y anónimo. La identidad tiene
  que salir de ESTE negocio: alquilar metros de góndola en supermercados
  colombianos, con temporadas colombianas y proveedores colombianos.
- **Agregar texto que explique.** Ver el criterio 2.

Leé `ANTI-SLOP.md` y `TELLS.md`: son un catálogo de ~100 señales que delatan
una interfaz generada. Corré su self-check final sobre tu propio trabajo antes
de entregar. Ojo: ese catálogo está escrito contra las páginas de aterrizaje de
startup; esto es una herramienta de trabajo diario. Traducí lo que aplique y
descartá lo que no, pero las reglas de tipografía, color, consistencia y
contraste valen todas.

---

## Dos reglas duras de color

**El ámbar, el oro y el ocre están prohibidos**, y **los fondos oscuros
también**. El cliente los descartó explícitamente. La pantalla va clara.

**Y la paleta se valida, no se elige a ojo.** Hay un validador que corre así:

```
node /tmp/claude-0/bundled-skills/2.1.252/2c18aad20415e638300d2a76f9f5e8ec/dataviz/scripts/validate_palette.js "#hex,#hex,#hex" --mode light
```

Corrélo sobre los colores con los que codificás estado. En una ronda anterior
la combinación verde + naranja falló: se confunden con protanopía, que es el
daltonismo más común, y en esta pantalla eso separa "libre" de "ocupado".
Arreglalo hasta que diga ALL CHECKS PASS, y contá en tu nota qué te devolvió.

Guía completa de visualización, vale la pena leerla:
`/tmp/claude-0/bundled-skills/2.1.252/2c18aad20415e638300d2a76f9f5e8ec/dataviz/`
en particular `references/choosing-a-form.md` (qué forma le toca a cada dato)
y `references/anti-patterns.md` (el catálogo de lo que sale mal).

---

## Cómo se juzga

El cliente va a mirar tu maqueta al lado de otras cuatro, en una captura, sin
leer una palabra tuya. Las preguntas que se va a hacer:

1. ¿Cada dato está en la forma que le corresponde, o hay gráficos de adorno?
2. ¿Sobra algo? ¿Hay algo dicho dos veces?
3. ¿Puedo cerrar un trato sin irme a otro lado?
4. ¿Puedo ver cómo va la sede sin hacer scroll?
5. ¿Esto lo hizo una persona que entiende este negocio?

Tomá una decisión fuerte y sostenela. Es preferible que le desagrade con
carácter a que le dé lo mismo.
