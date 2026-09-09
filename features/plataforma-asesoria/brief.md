# RECABRA · Plataforma — brief para el rediseño (Fase 11)

> Este documento es el ENCARGO que reciben los diseñadores. **Diseñan a ciegas:
> no ven la consola actual, ni sus capturas, ni ninguna propuesta anterior.**
> Todo lo que necesitan está acá: qué es, para quién, qué datos existen, qué
> tiene que poder hacer, y con qué vara se juzga.

## 1. Qué es y para qué sirve

RECABRA es el sistema con el que un supermercado alquila sus espacios de
exhibición (puntas de góndola, islas, neveras, exhibiciones de piso) a
proveedores, por periodo y a un canon mensual. Cada supermercado es un
**cliente** de RECABRA y tiene su propia base con sus sedes, sus planos, sus
espacios, sus contratos y sus proveedores.

**La Plataforma es la consola del operador de RECABRA** (quien vende y acompaña
el sistema). Su trabajo con ella tiene dos momentos:

1. **La cartera.** Abrir la consola y saber, en un vistazo, cómo va el negocio
   de todos los clientes y **a quién llamar primero**.
2. **La sesión de asesoría.** Sentarse (o llamar) a un cliente con su
   información delante y proponerle, con números, qué hacer este mes para
   ganar más plata con sus espacios: qué está libre y a quién ofrecérselo, qué
   contratos vencen, dónde cobra por debajo de su propia tarifa, de qué
   proveedor depende demasiado, qué sede está subutilizada.

Hay una tercera pieza: **el informe que se le deja al cliente** (imprimible o
compartible), que cuenta lo mismo que la sesión, pero escrito para él.

Además, por ley de datos personales, el cliente puede pedir el **reporte de
transparencia**: qué datos toma la plataforma de su base, cómo los calcula y
quién los consultó. Ese reporte ya existe y no se rediseña acá; sólo tiene
que tener su lugar.

## 2. El problema que hay que resolver (en palabras del dueño)

> «Entré con mi correo a la plataforma y le di “ver detalle” a un cliente. Me
> encontré con un montón de información sin orden, súper largo, sin entender
> exactamente qué era cada cosa. Necesitamos que quede como un espacio de
> análisis y de asesoría para nuestros clientes.»

Un ejemplo concreto de lo que NO puede pasar: una recomendación que dice
«113 espacio(s) de tipo góndola libre(s)» seguida de los **113 códigos en un
párrafo** y de «ofrecerlos a P&G, Unilever, Alquería a unos $ 827.500
mensuales cada uno». Todo el dato está, y no se entiende nada: ni cuáles
sedes, ni por qué esos proveedores, ni qué hacer primero.

## 3. La referencia: cómo cuentan resultados los analistas de datos

No hay referencia visual. La referencia es **el método con el que un
científico o analista de datos presenta resultados a quien decide**. Estas son
las reglas, y son de cumplimiento:

1. **La conclusión primero (pirámide).** Cada pantalla y cada bloque abre con
   UNA frase que dice el hallazgo con su número: «Galerías tiene 44 % de
   ocupación sobre 254 espacios: 143 libres que a su precio promedio valen
   $ 118 millones al mes». Después viene la evidencia, después el detalle.
   Nunca al revés.
2. **Todo número contra algo.** Un número solo no dice nada. Ocupación contra
   el mes pasado y contra la cartera; el canon contra la propia tarifa de
   referencia del cliente y contra el promedio de la plataforma para ese tipo;
   los proveedores contra el total. Si no hay contra qué, se dice «sin
   referencia», no se inventa.
3. **La forma la manda el dato.** Una magnitud sola es una cifra, no un anillo.
   Partes de un total quieren verse sumar. Un ranking quiere estar ordenado.
   Hechos con fecha quieren un eje de tiempo. Una ubicación quiere el plano.
   Lo que hay que contar se cuenta en unidades, no en porcentaje. Nada de
   tortas ni de gráficos de adorno: si hace falta una frase para explicar un
   gráfico, el gráfico está mal elegido.
4. **Anotar sobre el dato, no al lado.** El hallazgo va escrito encima del
   gráfico (la caída de marzo, el mes en que entró el proveedor grande), no en
   una leyenda aparte ni en un párrafo debajo.
5. **Situación → hallazgo → propuesta → valor.** La sesión de asesoría es una
   historia con ese orden: dónde está el cliente, qué encontramos, qué le
   proponemos, cuánto vale hacerlo. Cada recomendación es **una acción con un
   valor** («Ofrecer las 5 puntas libres de NAVE a Postobón: $ 6,7 millones al
   mes»), no una descripción.
6. **Resumen arriba, detalle bajo demanda.** Cien códigos no se listan: se
   agregan («113 góndolas libres: 96 en TERRÓN, 12 en NAVE, 5 en VILLA») y el
   listado se abre cuando se pide, o se señala en el plano. El operador tiene
   que poder llegar a cada contrato y a cada espacio, pero nunca a costa de
   tapar el resumen.
7. **Honestidad del dato.** De cuántos clientes o sedes sale cada cifra, qué
   está «sin dato» y por qué, de qué fecha es. Un cliente sin tarifa de
   referencia configurada no tiene «spread»: se dice, no se rellena.
8. **Prioridad visible.** Lo urgente primero y se nota: por orden, por peso,
   por señal. Alta / media / baja son palabras, no sólo colores.

## 3b. La forma de cada dato — el corazón del encargo

**Lo que más pesa en este rediseño es la presentación de los datos.** Antes
de dibujar cada bloque hay que contestar por escrito: ¿qué pregunta responde
este dato? ¿qué trabajo hace (magnitud, partes de un total, ranking,
cambio en el tiempo, ubicación, comparación contra una referencia, conteo)?
¿qué forma le corresponde a ese trabajo? La guía completa está en la skill
`dataviz` (`references/choosing-a-form.md`, `marks-and-anatomy.md`,
`anti-patterns.md`): leerla entera antes de diseñar.

Punto de partida (a discutir, no a copiar). Cada opción tiene que traer en su
README **esta tabla completa, con su propia respuesta y su porqué**, para
cada dato del inventario de §4:

| Dato | Pregunta | Trabajo del dato | Forma que le toca | Contra qué |
|---|---|---|---|---|
| Ingreso contratado del mes (cliente o cartera) | ¿cuánto entra? | magnitud sola | cifra grande, con su variación al mes anterior al lado (una flecha con número, no un anillo) | mes anterior |
| Ocupación % | ¿qué tan lleno está? | parte de un total | cifra + la proporción dibujada como unidades que suman (ocupados + libres = comercializables), no un anillo ni una torta | mes anterior · cartera |
| Ocupación por sede | ¿qué sede rinde y cuál no? | ranking de partes | barras ordenadas de menor a mayor con la cifra al final de cada una; la peor primero porque es la llamada | la media del cliente |
| Tendencia 12 meses (ingreso, ocupación) | ¿hacia dónde va? | cambio en el tiempo | línea con eje de tiempo, el mes parcial marcado, y los movimientos anotados sobre la línea (entró X, venció Y) | su propio pasado |
| Movimientos (entradas / salidas por mes) | ¿qué se ganó y qué se perdió? | flujo con signo en el tiempo | barras divergentes sobre el eje de meses (entradas arriba, salidas abajo), rotuladas con plata, no con conteo | el saldo |
| Espacios por estado (libre / se libera / ocupado) | ¿cuánto hay para vender? | conteo | unidades discretas (una marca por espacio, agrupadas por sede o tipo), con la palabra al lado del color | — |
| Canon promedio por tipo vs benchmark | ¿cobra bien? | comparación contra referencia | par de puntos o barra con la referencia como línea, por tipo, con la brecha escrita en % | benchmark de la plataforma |
| Spread % (cartera) | ¿quién cobra por debajo de lo que dice que vale? | comparación contra referencia, por cliente | puntos sobre un eje con el cero marcado; negativo a la izquierda; el nombre al lado | cero |
| Proveedores: participación % | ¿de quién depende? | partes de un total, ranking | barras horizontales ordenadas que suman 100, con el umbral de concentración marcado | umbral |
| Contratos por vencer | ¿qué se cae y cuándo? | hechos con fecha | eje de tiempo de los próximos 90 días con cada contrato como marca rotulada con plata, o una lista ordenada por fecha si son pocos | hoy |
| Recomendaciones | ¿qué hago primero? | ranking por valor y prioridad | lista ordenada, cada una como acción + evidencia en una línea + valor; la prioridad como palabra y como orden | valor en juego total |
| Oportunidades (espacio libre + candidatos) | ¿a quién le ofrezco qué? | asignación | tabla agrupada por sede y tipo, con el precio sugerido y su origen, y los candidatos como nombres; el plano de la sede si existe | precio sugerido |
| Adopción (activa / dormida / fantasma / sin cuentas / nueva) | ¿quién no está usando lo que paga? | clasificación con conteo | conteo por clase en unidades, y la lista de los fantasma con días sin acceso | — |
| Cohortes de adopción | ¿los nuevos se quedan? | retención en el tiempo | tabla de cohortes (mes de alta × retención a 30 días), sin gráfico si son pocas | — |
| Valor en juego total | ¿cuánto vale hacer todo esto? | magnitud sola | cifra grande con las partes que la componen visibles (cuánto es espacios libres, cuánto precio, cuánto vencimientos) | ingreso actual |

Reglas duras de esta tabla: **una sola escala por gráfico** (nunca dos ejes);
color categórico en orden fijo y validado; los tres estados con sus hex de
`tema.css`; el gris para lo que no se alquila o no tiene dato; cada gráfico
con su tabla equivalente accesible; **ningún gráfico sin la frase de arriba
que diga qué se ve**.

## 4. Lo que la plataforma SABE (inventario real, no inventar más)

Todo esto ya lo calcula el sistema. Los diseñadores reciben además un
archivo JSON de ejemplo con estas mismas claves y cifras plausibles.

**Cartera (todos los clientes, por periodo mensual):**
- por cliente: nombre, estado de cuenta (activo / gracia / solo lectura /
  suspendido), sedes con plano, espacios comercializables, ocupación %,
  canon promedio mensual, ingreso contratado del mes, top 5 proveedores por
  contratos, usuarios con cuenta, último acceso, spread % (cuánto cobra
  contra su propia tarifa: negativo = por debajo) y cuántos contratos no
  tienen tarifa aplicable;
- consolidado de lo mismo, con cuántos clientes entran y cuántos dieron error;
- **tendencia**: los mismos indicadores mes a mes, 12 meses (el mes en curso
  es parcial);
- **adopción**: cada cliente clasificado como activa / dormida / fantasma
  (tiene contratos y nadie entra) / sin cuentas / nueva, con días sin acceso,
  y las cohortes por mes de alta con retención a 30 días;
- solicitudes de supresión (derechos de datos) y el cambio de estado de cuenta:
  operativos, no de análisis.

**Un cliente (detalle, por periodo mensual):**
- sedes: espacios, libres, ocupación % de cada una;
- espacios: código, sede, tipo, zona, estado (libre todo el periodo / se
  libera en el periodo / ocupado), y si tiene contrato: proveedor, marca,
  canon mensual, inicio, fin, días para vencer, si arranca en el periodo;
- por tipo de espacio: cuántos hay y cuántos libres, el canon promedio que
  ESTE cliente cobra por ese tipo, y el **benchmark de la plataforma** para
  ese tipo (promedio de todos los clientes) — nunca la tarifa de referencia
  del cliente, que es confidencial y no sale de su base;
- proveedores: espacios que tiene, canon total, participación % sobre los
  contratos del cliente (nombre saneado: sin correos ni teléfonos);
- movimientos de 12 meses: por mes, contratos que entraron y que salieron
  (con motivo: vencimiento o cancelación), con proveedor, código, tipo y canon;
- oportunidades: cada espacio libre o que se libera, con su precio sugerido
  (el promedio del cliente para ese tipo, o el benchmark si el cliente no
  tiene) y **candidatos**: proveedores que ya tienen ese tipo de espacio en
  este cliente;
- recomendaciones, de siete tipos, cada una con prioridad (alta / media /
  baja), valor estimado mensual, explicación y sus datos:
  `espacio_libre` (por tipo), `contrato_por_vencer` (por contrato),
  `precio_bajo_tarifa` (por tipo, contra el benchmark), `concentracion_proveedor`
  (un proveedor con demasiada participación), `sede_subutilizada`,
  `sin_tarifa` (tipos sin precio de referencia), `arranque` (cliente nuevo sin
  contratos: qué hacer primero); más el total de «valor en juego» y el
  conteo por prioridad;
- el reporte de transparencia del cliente (catálogo de qué se toma y la
  bitácora de quién lo consultó), ya diseñado, con su enlace.

**Reglas de frontera que no se negocian:** el operador ve cifras exactas de
todos los clientes (no hay supresión de celda chica) pero **nunca la tarifa
de referencia** del cliente; los nombres de proveedor van saneados; todo es
**solo lectura** salvo el estado de cuenta y las supresiones; cada consulta
al detalle queda en la bitácora que el cliente puede ver.

## 5. Lo que tiene que existir

**A. La cartera** (la pantalla de entrada). Contesta «¿cómo va el negocio y a
quién llamo primero?». Un titular con el estado de la cartera; la tendencia
de 12 meses anotada; la lista de clientes **ordenada por necesidad de
asesoría** (ocupación baja, cuenta fantasma, cobra por debajo, vencimientos
cerca, sin tarifa), cada uno con la razón en una línea; la adopción como
parte de esa misma lectura, no como panel aparte. Desde cada cliente se entra
a su sesión.

**B. La sesión de asesoría de un cliente.** Un guion con capítulos, en este
orden, cada uno con su conclusión arriba:
1. **Dónde está** — ocupación, ingreso, cuántas sedes y espacios, contra el mes
   pasado y contra la cartera; la tendencia del cliente en 12 meses con los
   movimientos anotados (entró X, salió Y).
2. **Qué encontramos** — los hallazgos que importan, priorizados, cada uno con
   su evidencia en una línea y su valor.
3. **Qué proponemos** — las recomendaciones como acciones: qué ofrecer, a
   quién (los candidatos), a cuánto (el precio sugerido y de dónde sale),
   cuánto vale; agrupadas para que 113 góndolas sean una frase y no 113
   códigos; con el plano o la sede como ancla cuando ayuda.
4. **Los datos detrás** — espacios, contratos, proveedores y movimientos:
   completos, filtrables, plegados por defecto. Cada cifra de arriba tiene que
   poder rastrearse hasta acá.
5. **De dónde sale** — el periodo, la fecha de generación, la cobertura, y el
   enlace al reporte de transparencia.

**C. El informe para el cliente.** La misma historia (1 → 3, sin «los datos
detrás» ni nada interno de la cartera), en una pieza que se imprime o se
comparte y que un gerente de supermercado lee solo. Nombra al cliente, el
periodo y a RECABRA.

**Transversal:** los periodos se eligen (mes); los estados de cuenta y las
supresiones siguen existiendo como operaciones, fuera de la historia; todo
número lleva su formato de plata en pesos colombianos; escala a 30 clientes
en la cartera y a 300 espacios en un cliente sin volverse una lista.

## 6. Lo que no se negocia de forma

- El **sistema de tokens** del producto (`frontend/src/tema.css`): claro por
  defecto, oscuro a un clic, la tipografía de sistema con monoespaciada para
  cifras y códigos, los tres estados de espacio con sus hex validados, y **un
  solo amarillo por pantalla**, en la acción principal. Los tokens son texto:
  se leen, no se miran.
- Los colores con los que se codifica un dato se validan con el validador de
  la guía de visualización (`dataviz`), no se eligen a ojo.
- Cero recursos externos, cero librerías: HTML autocontenido.
- Escritorio primero (1440×900 y 1366×768); el celular razonable, no perfecto.
- Nada de texto que explique lo que la forma debería decir sola. Nada dicho
  dos veces.

## 7. Entregables por opción

`index.html` autocontenido con las tres piezas (cartera, sesión de un cliente,
informe para el cliente) navegables entre sí, con los datos del JSON de
ejemplo; `README.md` con las decisiones: qué pregunta contesta cada bloque y
por qué esa forma, qué se dejó afuera y por qué, el resultado del validador.

## 8. Cómo se juzga

El dueño va a mirar las opciones una al lado de la otra, sin leer una palabra
de los README, y se va a preguntar:

1. ¿Entiendo en diez segundos cómo va este cliente y qué le propongo?
2. ¿Cada número está contra algo? ¿Sé de dónde sale?
3. ¿Sobra algo? ¿Hay algo dicho dos veces? ¿Hay gráficos de adorno?
4. ¿Puedo llegar al detalle sin que el detalle me tape el resumen?
5. ¿Esto se lo puedo mostrar a un gerente de supermercado tal cual?
6. ¿Esto lo hizo alguien que entiende de alquilar metros de góndola?

Tomá una decisión fuerte y sostenela. Es preferible que desagrade con
carácter a que dé lo mismo.
