# Encargo: la pantalla principal de RECABRA

> Versión 2 del prompt con el que salió la maqueta #6. Conserva la escuela
> (Polaris) y el preámbulo ciego, y suma tres cosas que el cliente pidió
> después: **análisis de datos** para elegir la forma de cada dato, los **dos
> modos** —vender y supervisar— cada uno con lo suyo, y los **criterios** que
> reveló al rechazar once propuestas.
> Lo marcado con «NUEVO» no estaba en la versión que produjo la #6.

---

## 1. Regla dura: diseñás a ciegas

**TENÉS PROHIBIDO MIRAR CÓMO SE VE EL SISTEMA HOY**, ni ninguna propuesta
anterior. No abras, no leas, no listes nada bajo:

    /home/user/retail-espacios/frontend
    /home/user/retail-espacios/backend
    /home/user/retail-espacios/src
    ninguna carpeta de maquetas, versiones o respaldos

Ese código existe y funciona, pero el encargo nace justamente de que el diseño
actual «se ve hecho por IA», y el cliente pidió expresamente una propuesta sin
el sesgo de haber visto cómo es hoy. Si mirás, contaminás el encargo.

Lo único que SÍ podés leer del repo es `/home/user/retail-espacios/.claude/skills/`

### NUEVO · Segunda regla dura: no borres nada

Escribí SOLO tus dos archivos. **No borres, no muevas, no limpies, no
reorganices** ningún archivo ni carpeta. En una ronda anterior un agente
«ordenó» el directorio y se llevó por delante el trabajo de otros diez.

---

## 2. El brief

Leé `BRIEF.md` completo antes de tocar nada: el negocio, los dos roles, los
datos que existen y los datos reales de la sede NAVE.

### NUEVO · Leé también `CRITERIOS.md`

Es lo más caro que hay acá: las palabras textuales del cliente después de
rechazar once propuestas, y los cuatro criterios que salen de ellas. Léelo
dos veces.

---

## 3. NUEVO · Dos modos, no uno: vender y supervisar

Acá hay **dos modos de la misma pantalla**, y es una decisión de producto ya
tomada, no algo que tengas que resolver. Diseñá los dos.

    [ Vender ]  [ Supervisar ]

El administrador comercial cambia entre los dos. **El mercaderista no vende,
así que sólo ve Supervisar**, y ahí no aparece un solo peso.

### Modo VENDER · manda el plano, el contrato va al lado

El trabajo es: encontrar un espacio libre para lo que el proveedor está
pidiendo, ver dónde queda, y cerrar.

- El plano se lleva la pantalla. La punta de la entrada vale el triple que la
  góndola del fondo, y quien vende esto piensa señalando el piso con el dedo.
- El contrato se llena **al lado**, no en un globo que aparece: si armar el
  contrato es la mitad del trabajo, la mitad del trabajo tiene lugar fijo.
- Con la **tarifa de referencia** a la vista, porque es contra ella que se
  negocia, y sabiendo si el precio que se está poniendo queda por encima o por
  debajo.
- Todo medido contra el **periodo elegido** (una temporada, o dos fechas):
  qué está libre TODO el periodo, qué sólo una parte, y cuánto vale eso.

**Y una cosa que no va acá:** los indicadores de ocupación de hoy. Para
decidir un precio no sirve saber cuántos espacios hay ocupados esta mañana;
sirve ver qué hay libre en el periodo que se está vendiendo, y dónde queda.
Si ponés indicadores de hoy en Vender, le estás quitando lugar al plano para
mostrar algo que no se usa en ese momento.

### Modo SUPERVISAR · mandan los números y lo pendiente

El trabajo es: ver cómo va la sede y qué hay que atender.

- Cuánto entra hoy y de quién.
- Qué está ocupado y **hasta cuándo**.
- Qué se vence, en cuántos días, y cuánta plata se va con eso. Renovar es la
  acción que sale de acá, y también es vender: cinco contratos que caen son
  cinco llamadas por hacer.
- Qué arrancó y nadie reportó el montaje.
- Quién está pagando por debajo de la tarifa.
- Cuánto queda por vender en el periodo, y cuánto se evapora por día vacío.

**La vista del mercaderista es este mismo modo, sin un solo valor en pesos.**
No se tacha ni se pone «$—»: la cifra sencillamente no existe para él. Lo que
sí es suyo es el montaje: qué exhibiciones arrancaron sin reporte y hace
cuántos días.

### La regla que vale para los dos

**Dentro de cada modo, todo tiene que estar al alcance de la mano: sin scroll
y sin navegar a otra parte, en 1440×900.** El usuario está al teléfono con un
proveedor y no puede irse a mirar un dato y volver.

Cambiar de modo sí es un movimiento legítimo — son dos trabajos distintos, en
dos momentos distintos. Lo que no es legítimo es tener que bajar la página o
abrir algo para completar el trabajo que ya estás haciendo.

## 4. NUEVO · Análisis de datos: la forma la manda el dato

Esta es la parte que más pesa en la evaluación. El cliente lo dijo así:

> «No me refiero a poner más texto, me refiero a que **la forma de presentar
> los datos sea la más óptima para lo que están diseñados**.»

Antes de dibujar cada cosa, preguntate **qué trabajo hace ese dato**, y de ahí
sacá la forma. No al revés. Ejemplos del razonamiento, no de la solución:

- Una magnitud sola no necesita gráfico: es una cifra. Un anillo de progreso
  para un solo número es decoración.
- Unas partes de un total quieren una forma donde se vea que **suman**.
- Un ranking quiere estar **ordenado**; ordenado se lee sin mirar las cifras.
- Unos hechos con fecha quieren un **eje de tiempo**, no una tabla ordenada
  por días: la tabla dice cuándo, el eje dice además cuánto falta y qué se
  superpone.
- Una cantidad que hay que **contar** (cuántos de 23) se cuenta mejor en
  unidades discretas que en un porcentaje.
- Una ubicación quiere un plano, y no hay sustituto.

**Si dos elementos dicen el mismo dato de dos maneras, uno de los dos sobra.**

### Las herramientas que tenés que usar

La guía de visualización de datos, que es la que decide la forma:

    /tmp/claude-0/bundled-skills/2.1.252/2c18aad20415e638300d2a76f9f5e8ec/dataviz/
      references/choosing-a-form.md     ← qué forma le toca a cada dato
      references/marks-and-anatomy.md   ← cómo se dibuja bien una marca
      references/anti-patterns.md       ← el catálogo de lo que sale mal
      references/interaction.md         ← filtros, hover, rangos de fecha
      scripts/validate_palette.js       ← el validador de color

**La paleta se valida, no se elige a ojo.** Corré el validador sobre los
colores con los que codificás estado:

    node .../dataviz/scripts/validate_palette.js "#hex,#hex,#hex" --mode light

En una ronda anterior la combinación verde + naranja **falló**: se confunden
con protanopía, que es el daltonismo más común, y en esta pantalla eso separa
«libre» de «ocupado». Llegá a `ALL CHECKS PASS` y contá en tu nota qué te
devolvió.

Dos reglas duras de color que el cliente puso: **nada de ámbar, oro ni ocre**,
y **nada de fondos oscuros**. La pantalla va clara.

Y la base de diseño `ui-ux-pro-max` (88 estilos, 192 paletas, 74 pares
tipográficos, 119 guías de UX, 25 tipos de gráfico):

    cd /home/user/retail-espacios
    python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<consulta>" --domain ux
    python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<consulta>" --domain color

La skill misma avisa: verificá que lo que devuelve le sirva a TU producto. Si
te da algo de página de aterrizaje para una herramienta de operación,
descartalo y volvé a preguntar más angosto. **No aceptes un resultado
genérico.**

---

## 5. Anti-slop

Leé `ANTI-SLOP.md` y `TELLS.md`: ~100 señales que delatan una interfaz
generada. Corré su self-check final sobre tu propio trabajo antes de entregar.

Ojo: ese catálogo está escrito contra las páginas de aterrizaje de startup, y
esto es una herramienta de trabajo diario. Traducí lo que aplique y descartá
lo que no, pero las reglas de tipografía, color, consistencia y contraste
valen todas.

### NUEVO · Dos caminos que ya se probaron y fallaron

- **Imitar un género de software conocido.** Copiar el aspecto de una familia
  de productos famosa da un resultado correcto y anónimo. La identidad tiene
  que salir de ESTE negocio.
- **Agregar texto que explique.** Si hace falta una frase para explicar un
  gráfico, el gráfico está mal elegido.

### NUEVO · Pulcro: cada cosa está ahí por algo

Recorré tu propia pantalla elemento por elemento y preguntá «¿esto qué hace?».
Lo que no contesta, se va. Un rótulo que repite lo que se ve, un ícono que
acompaña a una palabra que ya se entiende, un borde que separa lo que el
espacio ya separaba, una cifra que está dos veces: todo eso se va.

---

## 6. Tu dirección: la escuela Polaris

*(Sin cambios respecto de la versión que produjo la #6.)*

Tu escuela es el **sistema de diseño de una plataforma de comercio madura**
(Polaris, de Shopify), adaptado. Es la más cercana a lo que esto es de verdad:
una herramienta de administración para un comerciante.

Lo que traés: patrones probados en millones de horas de uso por gente que
vende — la jerarquía de una página de administración, cómo se muestra un
estado, cómo se lista lo que pide acción, cómo se separa lo que uno mira de lo
que uno hace. Convenciones que el usuario ya conoce de otras herramientas de
comercio.

**Tu riesgo, y es el grande:** Polaris es un sistema conocido, y copiarlo tal
cual da un resultado correcto y anónimo — exactamente lo que el cliente
rechazó. Tomá su **ESTRUCTURA** y su rigor, y ponele una identidad que sea de
este producto: alquilar metros de góndola en supermercados colombianos, no
vender remeras.

Buscá en la skill `"commerce admin merchant dashboard"` y lo demás.

---

## 7. Lo que entregás

**Dos archivos HTML autocontenidos**, uno por modo:

    m-CLAVE-vender.html       ← el modo Vender
    m-CLAVE-supervisar.html   ← el modo Supervisar

Los dos comparten el mismo sistema —misma barra, misma tipografía, mismos
colores, mismos componentes— y se diferencian en qué manda adentro. Que se vea
que son dos modos del mismo producto y no dos productos.

Cada uno:

- **1440×900 exactos.** Sin scroll, sin desborde horizontal. Verificalo
  abriendo el archivo, no suponiendo.
- CSS adentro del `<style>`. Sin CDN (no cargan). Sin JavaScript, o el mínimo.
- Tipografías: `<link rel="stylesheet" href="fuentes/tipos.css">`. Sólo las 22
  familias de `TIPOGRAFIAS.txt`. El navegador de este contenedor no llega a
  Google Fonts, así que un `<link>` externo se dibujaría con la fallback del
  sistema y arruinaría tu dirección tipográfica.
- **Datos reales del brief.** Los nombres tal cual están (hay razones sociales
  y hay nombres de pila en minúscula: así es la base). Los conteos exactos.
- Español de Colombia con voseo. Ni una palabra en inglés visible.
- El plano de la tienda dibujado en SVG a mano. 106 muebles, 23 vendibles.
  **Ningún rótulo puede pisar a otro** — verificalo por código, fue un defecto
  real de una ronda anterior.
- Iconos: SVG inline dibujado por vos, geométrico y simple, o ninguno. Los
  sistemas de administración usan iconos chicos y funcionales, nunca
  ilustraciones. Sin emojis.
- Contraste AA en todo. Esto se mira ocho horas al día.

Y `nota-CLAVE.md`, máximo 400 palabras, en español: tu tesis, **qué forma le
diste a cada dato y por qué**, **qué cambia entre los dos modos y qué se
mantiene**, qué te devolvió el validador de color, qué sacrificaste y cuál es
tu riesgo.

---

## 8. Cómo se juzga

El cliente mira tu maqueta en una captura, sin leer una palabra tuya. Ya
rechazó once. Las cinco preguntas que se hace:

1. ¿Cada dato está en la forma que le corresponde, o hay gráficos de adorno?
2. ¿Sobra algo? ¿Hay algo dicho dos veces?
3. **En Vender: ¿puedo cerrar un trato sin irme a otro lado?**
4. **En Supervisar: ¿veo todo lo que tengo que atender sin hacer scroll?**
5. ¿Esto lo hizo una persona que entiende este negocio?

Tomá una decisión fuerte y sostenela. Es preferible que le desagrade con
carácter a que le dé lo mismo.
