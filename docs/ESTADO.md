# RECABRA — estado del proyecto

Documento de referencia para retomar el trabajo sin tener que reconstruir el contexto.
Última actualización: 2026-10-19, **participaciones de cara, fase 2**: lo que faltaba de la
fase 1 y las cuatro decisiones de la dueña. Las zonas se **copian** de otra cara (de este
mueble, de otro o de otra sede) y llegan como borrador; se **dibujan en el 3D** y se **ajustan
al borde de la vecina**; la **nevera de puertas y la de bebidas** se venden por participación;
**renombrar una sede** ya no la borra (los contratos, las reservas, los montajes y las tarifas
siguen vivos con el nombre nuevo); la **mercaderista ve su zona** —sólo la suya— en el enlace de
montaje; **delante del proveedor**, en una cara por participación, se ve su % y lo que queda,
nunca formas ni nada de otros; y la **caducidad de una reserva** la elige quien opera, sin
valor por defecto. Vender cuenta el ámbar por su motivo («Disponible en parte»). Sin tablas ni
columnas nuevas. **Antes de desplegar**, ver *Dónde retomar → Lo que sigue de las
participaciones de cara*. Ver *Participaciones de cara, fase 2 (2026-10-19)*.

Antes, 2026-10-17, **participaciones de cara y zonas**: lo que pidió la dueña
para que el supermercado negocie y registre el **porcentaje de una cara que le toca a cada
proveedor y marca** («Café A, 30 % de la GON-01, con sus fechas y su precio») y que el área
comercial lo **distribuya dibujando zonas libres** sobre el mueble, sin que el dibujo cambie
el porcentaje ni el porcentaje imponga una forma. Una participación es una clase de división
más (`NAVE-GON-01-PC1`: una fila de `spaces` y un contrato normal) con cuatro tablas nuevas
(términos, distribuciones, zonas e historial, que nunca se purga); la capacidad —la suma de los
porcentajes que cuentan cada día, ≤ 100 %— la decide el servidor con el candado del mueble; la
superficie comercializable de siete tipos y la geometría de las zonas están escritas en TS y
en Python con los mismos casos, bit a bit; y el Editor 3D tiene un modo **Distribución**
(lienzo 2D y 3D con la misma fuente, mueble desnudo, teclado aislado, autoguardado) que nunca
aparece delante de un proveedor. Vender dice «Por participación · queda 45 %» sin nombres,
Supervisar suma «Para revisar» y la ficha de la cara, y la planilla y el contrato suelto
mandan a Distribución. **Antes de desplegar, correr `backend/scripts/buscar_codigos_pc.py`.**
Ver *Participaciones de cara y zonas (2026-10-17)* y *Dónde retomar*.

Antes, 2026-10-14, **vender por partes, la revisión de la rama**: tres
revisiones (regresión y plata, privacidad, guardas) y el recorrido. **La venta aguantaba**
—ningún camino vendía dos veces lo mismo con los códigos de la planilla—; lo que fallaba era
cómo se informaba, más un agujero del contrato suelto. Ahora **el contrato suelto exige el
código completo** de lo que se vende por partes (`NEV-03-PU2` sin la sede vendía la nevera
entera a uno y la puerta a otro), y la regla y las guardas del plano comparan los códigos
en su forma completa; **la consola** ya no ofrece como «se libera» una nevera con una puerta
vendida después, cuenta las bahías y forros vendidos y lista sus contratos; **el plano y la
lista de precios** ya no dicen «libre 21 oct» cuando ese día hay una puerta vendida; y lo que
el visor le marca al proveedor, la tarifa de cada fila, la caja que nunca se vende entera y el
punto rojo de la cara B pasaron a cuentas puras con su prueba (16 mutaciones sobrevivían).
Además: el 409 del plano dice «de 2 a 1 bahía de impulso» y «(contando la base)», el enlace
de montaje ya no repite «PU2», y dos `PUT /layout/settings` a la vez dan 409 y no 500. Ver
*Vender por partes (2026-10-14)*, el resumen de todo, y *Vender por partes: la revisión de la
rama (2026-10-14)*.

Antes, 2026-10-14, **vender por partes, recorrido en el navegador**: la ficha
de la nevera Inducol de 3 puertas, del taller a Vender, la planilla, Supervisar, el visor 3D,
el 409 y el enlace de la mercaderista. Se arreglaron siete cosas que se vieron mirando —el
plano decía «libre 14 oct» en una nevera con puertas vendidas (ahora «1 de 3 puertas
vendida»), el visor contaba las unidades de la nevera entera, Estado por espacio cortaba los
códigos de las puertas— y quedan anotadas las que no son chicas. Ver *Vender por partes: el
recorrido en el navegador (P5, 2026-10-14)*.

Antes, 2026-10-14, **vender por partes, paso 4: cómo se vende, configurado desde
la ficha**. Lo que pidió la dueña: que los muebles que cada supermercado arma con sus fichas
propias —y los modelos de RECABRA— queden configurados para venderse por partes. La ficha dice
cómo se vende (en el taller, «Cómo se vende»: por puertas, por tramos o por entrepaños según la
familia, con la cantidad; las bahías de la caja; el forro de la columna) y eso se ESTAMPA al
colocar. **Los modelos de RECABRA ya traen la suya**: las neveras de 2, 3 y 4 puertas, por
puertas; las góndolas de pared (los murales), por tramos, uno por módulo, que se fijan en el
panel con un clic («Fijar 4 tramos, uno por módulo»: la ficha es un módulo). Las paletas del
plano 2D y del Editor 3D lo dicen al lado de cada modelo («por puertas», «2 bahías de
impulso»), y el taller numera las partes sobre el mueble que gira («PU1», «EN1 · base»). **Lo
ya colocado no cambia solo**: un mueble colocado antes de que su ficha lo dijera se sigue
vendiendo entero, y su panel ofrece «Usar lo de la ficha» y «Aplicar lo de su ficha a los N
colocados con ella en la sede», que salta los que tienen algo vendido (con una parte vendida,
el mismo bloqueo del panel y el 409 `partes_vendidas` del servidor). Y el nombre propio de la
familia llega al nombre de sus partes: donde a la nevera de puertas le dicen «Enfriador
vertical», Tarifas dice «Puerta de Enfriador vertical (cada una)». Ver *Vender por partes: cómo
se vende, desde la ficha (P4, 2026-10-14)*.

Antes, 2026-10-14, **vender por partes, paso 3: las bahías de la caja y el forro
de la columna**. La caja registradora y la columna siguen sin venderse enteras en ningún lado,
pero ahora venden sus PIEZAS: cada bahía de impulso de una caja, una por una (`CAJ-04-BI1`, de
izquierda a derecha mirando la caja desde la fila), y el forro de una columna (`COL-07-FO`, sin
número). Se configuran en el panel «Cómo se vende» del plano 2D y del Editor 3D («Bahías de
impulso que se venden», con «Aplicar a todas las cajas de la sede»; «El forro se vende») o en la
ficha propia del taller (la caja y la columna ahora admiten fichas), y se dibujan en el 3D (los
nichos de la caja, el forro de la columna) y en el plano 2D. Vender: tocar una caja suma su
primera bahía libre, el renglón ofrece «BI1 · BI2» sin «Entera», y «Sumar la BI1 de todas las
cajas de la sede (8)» arma un contrato multiespacio. Una pieza no choca con nada más que
consigo misma, su tarifa es la de su clase («Bahía de impulso de caja (cada una)», «Forro de
columna»), sin respaldo, y nunca cuenta en la ocupación. Una caja sin bahías configuradas —todas
las de los planos de antes— no ofrece nada, como siempre. Ver *Vender por partes: las bahías de
la caja y el forro de la columna (P3, 2026-10-14)*.

Antes, 2026-10-14, **vender por partes, paso 2: tramos y entrepaños, y las fichas
propias que ya vienen configuradas**. El mural, la góndola (central o de pared), la nevera abierta
y la de vegetales se venden enteros o POR TRAMOS (`GON-05-B-TR2`, de izquierda a derecha mirando
esa cara); la góndola y la punta, enteras o POR ENTREPAÑOS (`PUN-02-EN1` es la base, contando de
abajo hacia arriba: con 4 entrepaños se venden 5). Un mueble se divide de UNA sola forma, elegida
en el panel «Cómo se vende» del plano 2D y del Editor 3D —que ahora ofrece las formas de su
familia— o, lo que pidió la dueña, **en la ficha propia del taller** («Cómo se vende»: la ficha
de un multideck «por tramos, 2» se coloca y Vender ya ofrece `TR1 · TR2`). La tarifa de un tramo
o un entrepaño es la de su clase por sede o, vacía, la de la cara ÷ partes. Con un tramo o un
entrepaño vendido no cambian los tramos ni los entrepaños (409 `partes_vendidas`, y el panel lo
frena antes). Los espacios internos del Editor 3D conviven: se avisan por parte, y en un mueble
que se vende por partes no se marca uno nuevo como vendido. Ver *Vender por partes: tramos y
entrepaños (P2, 2026-10-14)*.

Antes, 2026-10-14, **vender por partes, paso 1: la nevera entera o por puertas**.
En el panel del plano (2D y 3D) la nevera de puertas tiene «Cómo se vende: Entera · Entera o por
puertas (N)»; elegida la segunda, Vender ofrece «Entera · PU1 · PU2…» y `NEV-03-PU2` es un espacio
más (una fila de `spaces` con el código derivado, sin columnas nuevas): la planilla, el contrato
suelto, los correos, el montaje, Supervisar, la consola y la auditoría lo conocen. **La nevera
entera y sus puertas nunca en las mismas fechas; dos puertas distintas, sí** (`chocan`, los dos
lados con los mismos casos), con un candado por mueble para que dos ventas a la vez no pasen las
dos. Con una puerta vendida no cambia la cantidad de puertas ni deja de venderse por puertas
(409 `partes_vendidas`), y un mueble no puede llamarse como una parte (409 `nombre_reservado`).
La tarifa de una puerta es la de su clase por sede o, vacía, la de la nevera ÷ puertas. Un plano
sin `partes.division` se vende y se ve exactamente como antes. Ver *Vender por partes: la nevera
entera o por puertas (P1, 2026-10-14)*.

Antes, 2026-10-14, revisión de la rama de las fichas propias (tres revisiones
—regresión con Postgres 16, seguridad y mutación de las guardas— y el recorrido de la dueña.
**Vender arrancaba con la tarifa equivocada** si las fichas propias llegaban tarde o no llegaban:
ahora el valor acordado sigue a la tarifa mientras nadie lo toque y el store reintenta solo; un
`modelo` que no es texto ya no deja la aplicación en blanco; **un nombre propio viejo de más de 80
letras ya no traba la lista de sedes** (el servidor recorta en vez de rechazar); un número
gigante es un 422 y no un 500; «la fuente no es una imagen» ya no se salta con `#`, `;`, `&` o
`%`; y guardas para el cableado que once mutaciones pasaban en verde. Y **lo que sigue de los
muebles**: vender por partes (la nevera entera o por puertas con `NEV-03-PU2`, con las 4 repisas
por puerta de la ficha; el mural por tramos, la bahía de la caja y el forro de la columna),
después el material de la cara —espera la respuesta de la dueña— y las formas de cobro. Ver
*Fichas propias del cliente (2026-10-14)* y *Dónde retomar*).

Antes, 2026-10-14, cierre (el **recorrido de la dueña en el navegador**: armar
«Nevera Inducol 2 puertas» en el taller, colocarla desde la paleta del plano y del Editor 3D,
darle a su familia un nombre propio y verlo en el plano, el 3D y Vender, venderla, retirar la
ficha y ver que lo colocado sigue igual, y el trabajador sin poder crear fichas. Anduvo de punta
a punta; se arreglaron dos detalles que sólo se ven mirando: el pie del panel del 3D redondeaba
las medidas al decímetro y la lista del taller decía «todavía no armaste ninguna» con todas
retiradas. Ver *Fichas propias: el recorrido en el navegador (2026-10-14)*).

Antes, 2026-10-14, al final del día (el **nombre propio de cada familia de
muebles**: cada supermercado le pone su nombre a cada familia —«mamut», «tope de góndola»,
«exhibición especial»— en Configuración → «Cómo se llaman los muebles acá» (sólo
administración: una fila por familia con el nombre de RECABRA y el de la tienda), y ese nombre
sale en todas sus pantallas: la paleta y el panel del plano 2D y del Editor 3D, Vender (la
lista, el visor y la lámina del proveedor), Supervisar, Estado por espacio, Montajes, Tarifas
y el taller. La consola de la plataforma y los informes de asesoría siguen con el de RECABRA,
para comparar supermercados. Sin nombre propio todo sale como antes, y nada se guarda en el
plano. Ver *Cómo le dicen acá: el nombre propio de cada familia (2026-10-14)*).

Antes, 2026-10-14, más tarde (las **fichas propias de cada supermercado, en
pantalla**: el taller tiene la pestaña «Fichas», donde la dueña arma la ficha de un mueble suyo
—familia, nombre, medidas en centímetros con el rango de su familia a la vista, puertas,
entrepaños y módulo, tarifa y de dónde salió, sin foto— y lo ve girar con esa ficha mientras
escribe; el formulario valida con las mismas reglas que el servidor, y además los entrepaños a
25 cm, antes de mandar. Guardada, la ficha aparece en la paleta del plano 2D y del Editor 3D
debajo de su familia, después de las de RECABRA (las retiradas no se ofrecen); colocarla estampa
`cli:<clave>` como un modelo del catálogo, el panel la nombra, y `rateTypeOf` le da su tarifa
con la misma regla que el servidor, comparada con casos compartidos. Ver *Fichas propias: la
pantalla (2026-10-14)*).

Antes, 2026-10-14, noche (las **fichas propias de cada supermercado, del lado
del servidor**: una tabla nueva, `modelos_mueble`, en la base de cada uno, con la API
`/api/muebles/modelos` —la lee cualquier sesión, la escribe administración— para que la dueña
arme sus muebles sin pedirnos un cambio: familia, nombre, medidas, la geometría de su familia y
de dónde salieron, sin foto. Viajan en el plano como `cli:<clave>`, se validan con las MISMAS
reglas que los modelos del catálogo —que ahora viven en `fichas` de `muebles.json` y corren los
mismos casos en el navegador y en el servidor—, retirar no borra ni mueve nada colocado, y su
tarifa propia llega a la planilla y a la consola con una consulta por pedido. Falta la pantalla
(el taller y las paletas): ver *Fichas propias: el servidor (2026-10-14)*).

Antes, 2026-10-14, tarde (la revisión de la rama de los muebles de Colombia:
**deshacer un «Entrepaños» o un «Módulo» ahora se guarda** —el plano repuesto manda `null`
donde antes mandaba la clave ausente y el servidor rellenaba lo deshecho—; el panel cuenta los
entrepaños en la misma unidad en que se escriben (el «auto (5)» de la góndola de 1,80 eran 4
con producto y el techo); `PUT /layout` no le pasa la ficha de una góndola a una punta con su
mismo `id`; el enlace de la mercaderista deja pasar la ficha sólo con su tipo; las centrales
estimadas de 1,50 tienen los entrepaños de su nota; los ids de los modelos quedaron escritos en
una lista que sólo admite sumar; y guardas sobre el código real que coloca, guarda y cobra. La
estiba colocada desde un modelo se carga hasta el fondo y el exhibidor de cartón tiene su
dibujo. La dueña confirmó que las marcas pagan la nevera entera o por puertas: es lo próximo.
Ver *Muebles de Colombia (2026-10-13)* y, adentro, *La revisión de la rama (2026-10-14)*).

Antes, 2026-10-14 (cotejo visual de los muebles de Colombia: cada modelo se
miró en `/taller` contra su ficha, y el taller ahora dibuja el modelo con su ficha
estampada y, al lado, el de siempre. Las neveras, el puesto de impulso, las estibas y la
góndola de 2,00 coinciden con la ficha. Se arreglaron tres piezas del impulsador, que
también dibuja el exhibidor de cartón: las bandejas se corrían hacia atrás y el cartel
flotaba. Quedan abiertos un dibujo propio para el exhibidor de cartón, la torre de la
estiba que no llega al fondo y las repisas de la nevera, que no son las 4 de la ficha. Ver
*Cotejo visual de los muebles de Colombia (2026-10-14)*).

Antes, 2026-10-13, noche (lo que se puede editar del mueble y lo que no se
puede perder: la góndola y la punta tienen «Alto», «Entrepaños» y «Módulo» en el panel del
plano 2D y en el del Editor 3D —el mismo componente—, y la punta se dibuja, vende y
encuadra con ellos como la góndola. **Lo vendido no se mueve sin aviso**: con una cara con
contrato vivo o firmado, arte pintado o espacios internos vendidos, cambiar esos campos
dice qué se mueve («cambian las filas del arte de esta cara») y espera «Cambiar igual»; con
espacios internos vendidos la cantidad de entrepaños no cambia hasta liberarlos. **Una
pestaña vieja no borra lo nuevo**: `PUT /layout` le rellena al mueble la ficha que llega
ausente y sólo un `null` la borra. El visor de Vender y el enlace de la mercaderista ven el
mueble real. Ver *Lo que se puede editar y lo que no se puede perder (2026-10-13)*).

Antes, 2026-10-13, tarde (muebles de Colombia: el catálogo tiene
**modelos** —fichas de muebles de verdad con la URL de su fuente y cuánto confiar en
ellas, sin una sola imagen—: góndolas central y de pared por alto y módulo, puntas,
estiba completa, media y cuarta, exhibidor de cartón, neveras de 1 a 4 puertas y el
puesto de impulso. Dos tipos nuevos, la **nevera de puertas** (`NEV`, se vende entera) y
el **puesto de impulso** (`PIM`). Colocar un modelo estampa su ficha en el mueble y lo
colocado no se vuelve a leer de ella; la media estiba, el cuarto y el exhibidor de cartón
se cobran con su propia tarifa. La referencia del catálogo compara sólo los tipos que
conoce. Ver *Muebles de Colombia: modelos con su fuente (2026-10-13)*).

Antes, 2026-10-13 (el cobro de la suscripción: la operadora registra en la
consola la suscripción, las cuentas de cobro y los pagos por transferencia —sin pasarela y
sin emitir nada ante la DIAN—, y una escalera automática, apagada por defecto, avisa por
correo y pasa a sólo lectura a los 30 días de vencida, nunca antes de 10 días después del
aviso formal, y nunca suspende. La dueña del supermercado ve lo suyo en Configuración →
Suscripción. Tres revisores la revisaron y lo que encontraron quedó arreglado. Ver *Cobro
de la suscripción (2026-10-13)*).

Antes, 2026-10-13 (un solo catálogo de muebles: cada tipo de mueble está
escrito una vez, en `muebles.json`, con una copia idéntica para el servidor, y las tablas
de siempre se calculan de ahí; un plano viejo da lo mismo que antes, comparado contra una
referencia fija. Lo que el editor no conoce del mueble ya no se pierde al moverlo, y
«¿tiene cara B?» tiene una sola respuesta, que ahora también consultan la planilla y el
contrato suelto. Ver *Un solo catálogo de muebles (2026-10-13)*).

Antes, 2026-10-12 (el diseño se ve desde Vender: cada fila del contrato
trae un botón «3D» que abre la tienda ENCIMA de la ficha —la misma sala de «Presentar»,
con las tres tomas y el producto del proveedor del contrato— sin perder nada de lo
tecleado. Los muebles le llegan sin datos comerciales, el catálogo se pide por el nombre
del proveedor y la prueba no toca el plano. Ver *Ver el diseño desde Vender*).

Antes, 2026-10-10, noche (las fotos de montaje y las planometrías duran lo
que dura el contrato y sus renovaciones: cinco días después de que termina la cadena sin
renovación, la limpieza del mantenimiento las borra; el montaje queda, sin la foto. Está
detrás de `LIMPIAR_FOTOS_VENCIDAS`, apagado: hasta prenderlo sólo ensaya, porque la
política de datos publicada dice lo contrario. Ver *Las fotos duran lo que dura el
contrato*. La revisión adversarial de esa misma noche cerró siete hallazgos: el mismo
proveedor escrito distinto —«3M», «Kellogg's», «BIC»— ya no parte una renovación, y la
planilla ya no crea un «Bic» aparte de «BIC»; la línea del ensayo ahora sí llega al log de
Render; la renovación que vive sólo en el plano bloquea aunque haya otro contrato futuro;
las fotos que ningún contrato reclama ya no quedan para siempre; y el enlace de montaje ya
no le echa la culpa de una foto borrada al fin del contrato).

Antes, 2026-10-10, tarde (la revisión de toda la rama y la tercera crítica
de la demo: «Cambiar de proveedor» ya no suelta la reunión, «Terminar reunión», la lámina en
reunión no sale para el contrato ajeno, el teclado y la salida de pantalla completa no tocan
Presentar ni el plano, la ficha lee «9 cm» y bloquea lo ilegible; el relleno de lo vendido
sin pictogramas, el cabezote legible, la línea del robatope —era el copete de la punta en el
plano del parante—, la persona con huella, el vecino lavado y «Acostarla sólo en la N». Ver
*2026-10-10 (tarde): la revisión de la rama y la tercera crítica de la demo*).

Antes, 2026-10-10 (la tercera crítica, cerrada: «Presentar» a pantalla
completa sin la barra ni el marco y con el HUD que se esconde solo —el navegador muestra
unos segundos «Presioná Esc para salir», y el proveedor lo ve—; la persona entera del lado
libre, de la misma cuenta que la toma, en gris claro; «De cerca» sin medio copete y el
robatope con dos repisas; elegir un arte ya no traba la pantalla (worker del recorte y
precalentado); la 2 L con 3 rejillas automáticas, y la demo por proveedor con el
antes/después. Ver *2026-10-10: la tercera crítica — que la tienda parezca tienda*).

Antes, 2026-10-10 (el ambiente de la pantalla de venta: cielo raso a 3,2 m
con luminarias, muros que cierran la sala, brillo de las luminarias en el acero, sombra en
las uniones, piso que refleja y se oscurece al pie, habladores sin precios inventados
—`precio_publico` opcional en `supplier_asset_specs`, ALTER para las bases locales de la
rama—, vecinos atenuados y el mueble contratado entero con relleno. Antes, la tanda 1: la
nevera que acomoda sola las rejillas, la botella, la bolsa, la espalda de los envases, el
cabezote, el surtido y el aviso de frío. Ver *2026-10-09 (tanda 1)* y *(tanda 2)*).

Antes, 2026-10-09, noche (la revisión de código del producto en el 3D: una
foto con su fondo ya no infla el envase, «1.000 g» es un kilo, la foto que no carga cae a
la lámina y se reintenta, la reunión manda en el cartel, en «Presentar» y en el editor, la
caminata no rompe la lámina, y lo de atrás se dibuja con pocas facetas. Ver *2026-10-09
(noche): la revisión de código*).

Antes, 2026-10-09 (la segunda crítica del producto en el 3D: el mueble y el
envase con la misma luz en la pantalla de venta, «Presentar» que ya no esconde la prueba,
la tapa del vaso, la toma «De cerca» con teleobjetivo, la nevera encendida y la lámina con
las tomas de venta. Ver *2026-10-09 (tarde): la segunda crítica*).

Antes, 2026-10-08 (Probar un producto que se vea real: el producto del
proveedor se para en el mueble como envases 3D a escala, con su foto sin fondo de
etiqueta, en la cara entera o por entrepaño; «Mostrar al proveedor» abre una pantalla de
venta limpia y privada con tres tomas de cámara. Tabla nueva `supplier_asset_specs`. Ver
*2026-10-08: el producto se ve de verdad*, dentro de *Probarle el producto al mueble*).

Antes, 2026-10-02 (Auditoría de producción: lo que quedó del modelo
viejo. El plano real de Galerías ya no se baja sin sesión, salen «Empezar de cero» y
«Pasar a la base principal», borrar la foto de un montaje ya no da error, la fecha del
negocio es la de Colombia, el correo a la mercaderista vuelve a traer su enlace y el
dueño baja la copia de seguridad desde Configuración. Ver *Auditoría de producción
(2026-10-02)*, al principio de *Qué está hecho*).

Antes, 2026-10-01 (Ninguna prueba del backend depende del día en que
se corre: cinco amanecieron rojas el 1.º de octubre por tener septiembre escrito como
mes en curso, y otras 132 iban a caer el 2028-10-01. Ver *Pruebas con el mes escrito
a mano*. Antes, el mismo día: el acceso por clave compartida se apagó —la sección
«Claves de acceso» de Configuración se fue y `POST /api/auth/login` contesta 410
salvo `LOGIN_LEGADO=1`—; ver *Identidad*, el punto «Legado»).

Antes, 2026-09-23 (Invitaciones y ciclo de vida de los clientes: el
enlace del correo lleva al supermercado que invitó, nadie funda uno por error, y la
consola renombra, archiva, borra y **pasa un cliente a la base principal** —así el
supermercado real, que vivía como `pepito`, queda como `galerias` desde el código—.
Ver *Invitaciones: nadie funda un supermercado por error*, *El ciclo de vida de un
cliente* y *Pasar un cliente a la base principal*, después de la Fase 2.
Antes, el mismo día: el plano se mueve como el Editor 3D y Supervisar es una hoja
de 2×2 — ver *El plano se mueve como el Editor 3D*).

Gestión de espacios comerciales en supermercados: se dibuja el plano de cada sede, se
marca qué muebles se pueden alquilar y se les asignan contratos de proveedores.

---

## Dónde retomar

### Lo que sigue de las participaciones de cara (2026-10-19)

Lo hecho está en *Participaciones de cara y zonas (2026-10-17)* y *Participaciones de cara,
fase 2 (2026-10-19)*. **Antes de desplegar**, lo que tiene que hacer la dueña (o quien
despliegue), en la consola de Render (plan pago) o en una base restaurada de la copia con
`scripts/restaurar_copia.py`:

1. **Correr `backend/scripts/buscar_codigos_pc.py`** (sigue de la fase 1) y renombrar con la
   renumeración lo que aparezca: un mueble o una fila de `spaces` que hoy se llame `…-PC<n>`
   pasaría a leerse como una participación de otro mueble. Sale con 1 si encuentra algo.
2. **Mirar si algún plano tiene una nevera (`nevera_puertas` o `nevera_refrescos`) con
   `partes.division = "participacion"`** escrita por la API (la pantalla no lo ofrecía
   antes de la fase 2, pero el guardado no lo rechazaba). Al desplegar pasa a venderse por
   participación, con su contrato entero —si tiene— ocupando la cara entera. Si aparece,
   devolverla a «puertas»/«tramos» en «Cómo se vende» antes de desplegar.

No hace falta configurar nada: la fase 2 no tiene tablas, columnas ni variables nuevas.

**Las decisiones de la dueña (2026-10-18)**, ya aplicadas:

- **Reserva**: «se pone en reserva hasta una fecha límite elegida por quien esté manejando el
  sistema». Sin tope fijo; el formulario no la precarga (cierra el riesgo R7 del diseño).
- **Mercaderista**: ve su zona dibujada en el enlace de montaje, sólo la suya.
- **Proveedor**: «sólo lo suyo y lo libre». Su % y lo que queda, nunca formas (ni las suyas),
  nombres ni % de otros. Hoy sale en la tarjeta CONTRATADO del Editor 3D con el proveedor de la
  reunión nombrado y en el HUD de Presentar; **no** en la lámina ni en el visor de Vender (ver
  abajo).
- **Trabajador**: queda como estaba (el % no es plata).

**Lo que queda para después**:

- **El % del proveedor en el visor de Vender y en la lámina**: el proveedor del contrato vive en
  `ModoVender`/`useContrato` y la guarda de `probar-vender` prohíbe leer `/api/participaciones`
  desde la superficie de Vender. Hace falta un dato anónimo del servidor filtrado por proveedor
  (una ruta que devuelva sólo «lo suyo» de una cara para un proveedor dado), no leer la cara.
- **La unidad comercial de dos caras** (D4): vender «la góndola» al 30 % siguen siendo dos
  participaciones, una por cara. El pedido exige caras independientes (§8).
- **Los tipos sin receta**: la estiba (isla), el impulsador/exhibidor de cartón, el puesto de
  impulso, la batea, la nevera de vegetales y la de carnes, el stand de frutas y, por ahora, la
  isla fría. La lista escrita, con su razón, es `FUERA_DE_LA_PARTICIPACION` (`probar-catalogo.mjs` y
  `test_catalogo_muebles.py`). Cada uno necesita su receta en `superficie.ts`/`superficie.py`,
  sus casos en `casos/superficies.json` y la cota medida contra el 3D.
- **Editar en el 3D**: rectángulo, polígono y mover. Mover vértices uno por uno y la paridad
  total con el lienzo (B1-b/c del diseño) quedaron afuera: se hacen en el lienzo.
- **Unir dos filas duplicadas con contratos** (el mismo código con otras mayúsculas, las dos
  con algo colgado): la renumeración y el renombre se frenan y lo dicen; unirlas es un arreglo
  de datos a mano.
- **Una carrera real en Postgres** del archivo de sede contra la primera alta (E1): la prueba es
  con un espía en SQLite.
- **Un enlace de montaje de antes del 2026-10-02** (sin contrato en el token) deja de abrir si
  el espacio cambia de código (renumeración o renombre): el aviso del renombre lo dice («los
  anteriores hay que volver a mandarlos»).
- **«Descartar mis cambios» en «Mirar»**: está bien así (E2).

### Lo que sigue de los muebles (2026-10-14)

La meta de la dueña es que **cada supermercado arme sus muebles sin pedirnos un cambio**: el
próximo cliente es uno como Galerías o Cañaveral, con muebles de allá, armado con datos de
internet y sin fotos propias. Lo que ya está para eso: el catálogo único (*Un solo catálogo de
muebles*), los modelos de Colombia con su fuente, la nevera de puertas y el puesto de impulso
(*Muebles de Colombia (2026-10-13)*), y ahora **las fichas propias del cliente y el nombre
propio de cada familia**, revisados y recorridos en el navegador (*Fichas propias del cliente
(2026-10-14)*). Con eso un supermercado ya dibuja su tienda con sus muebles y sus palabras, y
desde el 2026-10-14 **los vende como los vende él: enteros o por partes** —también los que arma
con sus fichas propias—. Lo que sigue, en orden:

1. ~~**Vender por partes**~~ **hecho (P1 a P5 y la revisión de la rama, 2026-10-14)**: ver
   *Vender por partes (2026-10-14)*, que resume todo, y sus pasos. Lo que quedó para la dueña,
   junto (cada paso lo dice en su sección):
   - **la tarifa de las partes**: una propia por clase y por sede o, vacía, la de la cara ÷
     partes (decisión 3 del plan; la alternativa —siempre la fracción— es borrar la fila de la
     tarifa); una sola tarifa de tramo para la góndola, el multideck y vegetales;
   - **cómo nacen los modelos de RECABRA**: las centrales y las puntas (hoy enteras), la caja
     (¿con 2 bahías?), y si una nevera de UNA puerta se vende por puertas (hoy no);
   - **la base es el `EN1` y se vende**; «mural refrigerado» es el multideck; de 1 a 4 bahías;
   - **cómo arranca la venta de una nevera con puertas vendidas** (hoy tocarla pone «Entera» y
     el rechazo; podría sumar la primera puerta libre, como la caja) y cómo cuenta la lista de
     precios una cara parcial («+1 entran» y el color siguen contando por cara);
   - los soportes cedidos a un operador (Marketmedios), que sacan de la venta columnas enteras;
   - **las 4 repisas por puerta de la ficha** (hoy el dibujo pone 5 y el piso): cambia cómo se
     ve lo ya vendido.
2. **El material de la cara** (copete, cenefa, stopper) como venta aparte (PR 5 del plan). Es
   lo PRÓXIMO, y **espera una respuesta de la dueña**: si el copete de una cara se puede vender
   a otra marca que la de la cara. El plan recomienda que sí (es una pieza aparte, que Vender
   sugiere junto con la cara y la planilla avisa si van a proveedores distintos); la
   alternativa —siempre incluida en el contrato de la cara— impide vender la cenefa de un
   pasillo que la tienda usa para su propio surtido. Con la respuesta, es la maquinaria de las
   piezas (P3): una clase más (`CP`, `CN`, `ST` ya están reservados en el catálogo, sin clase).
3. **Las formas de cobro**: hoy un contrato tiene un valor acordado por espacio para sus
   fechas (sin prorrateo) y la referencia es una tarifa mensual por tipo, por sede y por clase
   de parte. Falta cobrar **por semana, por día, por temporada, por m² y por paquetes** (varios
   espacios a un precio). Antes de tocarlo: el m² ya se discutió y se descartó como ranking
   (*Tarifa de referencia y rendimiento $/m²*: la industria mide anaquel en metros lineales y
   frentes, y la huella de piso es casi cero en lo que se cuelga), y la temporada ya tiene sus
   ventanas (*Temporadas comerciales*). Es una conversación con la dueña antes que código.

De las fichas propias y los nombres, lo que queda: que la dueña haga el flujo ella misma con
una ficha de verdad de Cañaveral (`/taller` sigue siendo sólo de administración: entra con su
cuenta de dueña); el enlace de la mercaderista (`/?montar=…`, sin sesión) sigue con el nombre
de RECABRA, porque no lee la configuración; y la tarifa propia de una ficha sólo puede ser una
de las que su familia ya tiene (decisión del paso del servidor, a confirmar con ella).

Quedó abierto, más chico, de lo hecho:

- de qué lado van las manijas con 3 y 4 puertas (ninguna ficha lo dice);
- el aviso de lo vendido vive en el navegador: un `PUT /layout` armado a mano podría cambiar
  la geometría de una cara vendida sin preguntar (el servidor sólo cuida que no se pierda);
- la confiabilidad es una sola por modelo: en las centrales de GMC las medidas son de ficha
  y los entrepaños una estimación, y eso lo dice sólo la nota;
- los entrepaños de la PUNTA por ficha (sus modelos traen sólo medidas), y si la paleta de
  la góndola —doce modelos por familia— se lee mejor como una grilla alto × módulo;
- la estiba y el exhibidor de cartón de los planos de ANTES (sin modelo) siguen con su
  dibujo de siempre: la torre a cinco cajas de fondo y el impulsador. Cambiarlos es cambiar
  cómo se ve lo ya vendido, y eso lo decide la dueña;
- de vender por partes: en el visor, las puertas que no se venden quedan con las rejillas
  vacías; la consola lista los contratos de las piezas pero no les da renglón en la tabla de
  «Espacios» (no son caras); el Editor 3D no se recorrió en el navegador configurando partes
  desde ahí; y, ajeno a
  las partes, la planilla dice «Los avisos salieron agrupados» aunque el correo no esté
  configurado.

### Lo que sigue del cobro (2026-10-13)

Lo hecho está en *Cobro de la suscripción (2026-10-13)*. Lo que falta, todo del lado de la
dueña antes de tocar código:

- **Antes de prender `COBRANZA_AUTOMATICA`**: que su abogado revise los borradores de
  `docs/legal/borradores/` (política de datos con los datos de facturación, y términos con
  la escalera), publicarlos (subir `VERSION_POLITICA`) y cargar
  `COBRO_INSTRUCCIONES_TRANSFERENCIA` en Render.
- **La pasarela**: se eligió conectarla después. La investigación recomienda Wompi (link
  de pago por PSE por el neto, reenviable a tesorería) y ePayco si su banco es Davivienda.
- **La factura electrónica**: depende de lo que diga su contador (persona natural con
  cuenta de cobro, SIMPLE o SAS). Hoy el sistema sólo registra el número y el CUFE.
- **Galerías**: quedó con suscripción manual, sólo para llevar sus cuentas; nada la mueve.
  Falta que la dueña confirme si prefiere que no tenga suscripción.
- **Revisar al activar el segundo cliente**: con dos clientes activos, `unico()`
  (`clientes.py`) deja de devolver uno, y un token viejo sin el claim `cliente` deja de
  resolverse. No es del cobro, pero aparece el día que entre Cañaveral.

### Lo que quedó abierto el 2026-09-13

Lo que quedó abierto al cerrar la sesión del 2026-09-13, en orden de lo que más
conviene atacar primero. Nada de esto está empezado: son hilos, no trabajo a medias.

### 1. La nomenclatura por pasillo (conversación abierta con el dueño)

Un supermercado no se recorre por códigos sueltos: se recorre por pasillos. Quien
negocia dice «la punta del pasillo 3», no «PUN-07». La pregunta que quedó sobre la
mesa fue si la nomenclatura no debería armarse por pasillo, y la respuesta técnica es
que **el salto es más corto de lo que parece**: `frontend/src/utils/pasillos.ts` ya
deduce las corridas de la geometría —si dos góndolas comparten la coordenada
perpendicular están en la misma corrida— y ya está probado sin navegador. Lo que falta
es **usarlo para nombrar**, no sólo para agrupar.

Tres cosas quedaron contestadas y conviene no volver a averiguarlas:

- **Dos sedes del mismo supermercado NO pueden compartir una nomenclatura.**
  `Space.code` es `unique=True` y cada supermercado tiene **su propia base**
  (`backend/app/database.py` elige la base por cliente en `get_db`, y por eso separar
  clientes no obligó a tocar los doce routers). Entonces: entre clientes distintos los
  códigos pueden repetirse sin riesgo; **dentro de un cliente, el código es único y
  atraviesa todas sus sedes**. No hay forma de que un contrato caiga en la sede
  equivocada por un código repetido, pero tampoco hay nada que impida que un plano
  nuevo agote nombres que «se sienten» de otra sede.
- **Subir un contrato no obliga a elegir la sede** justamente porque el código ya la
  determina. Si la nomenclatura pasa a ser por pasillo, eso hay que revisarlo: dos
  sedes tienen las dos un «pasillo 3».
- **Los botones «Revisar» y «Renumerar»** (`frontend/src/pages/Renumerar.tsx`) son de
  cuando se cuadró la nomenclatura. Siguen siendo la única herramienta para arreglar un
  plano cuyos códigos quedaron desordenados, así que quitarlos ahora dejaría sin salida
  ese caso; lo que corresponde es decidirlo junto con el esquema por pasillo.

### 2. El 409 le pide al usuario algo que ya no puede hacer

`create_lease` (`backend/app/routers/spaces.py`) rechaza un contrato sobre un mueble no
comercializable con: *«Cambiá su destino a "Comercializable" en el plano»*. Para una
caja registradora o un mostrador de servicio eso es **imposible por diseño** — están en
`NUNCA_ALQUILABLE` y el editor ni siquiera ofrece el botón. El mensaje tiene que
distinguir los dos casos: «este mueble es operación de la tienda y nunca se alquila»
contra «este mueble está marcado como no comercializable, cambialo en el plano».
Defecto conocido, sin arreglar, chico: `motivo_para_no_vender` (`layout_lookup.py`) ya
separa la cara B que no existe; falta separar ahí el tipo que nunca se alquila.

### 3. El fondo del robatope

El catálogo le da 40 cm; la ficha del fabricante, 25. Es la única diferencia medida que
quedó sin corregir de toda la revisión del mobiliario, y se dejó así porque cambiarla
mueve muebles ya colocados en planos reales.

### 4. Datos de TERRON

Sigue pendiente y es lo más urgente en términos de negocio: ver
*Pendiente urgente: datos de TERRON*, más abajo.

### Dos PRs de terceros abiertos

- [#62](https://github.com/Bryreg/retail-espacios/pull/62) (`codex/…`) toca el mismo
  dominio 3D que se reconstruyó acá. **Un intento previo suyo se llevó puesto
  `statusColor`, `facePaint` y los cinco props de slot** — el mueble mejoraba y dejaba
  de poder venderse. Ese es el origen de `frontend/scripts/probar-muebles.mjs`. Si se
  retoma, el criterio de aceptación es que esa suite pase.
- [#37](https://github.com/Bryreg/retail-espacios/pull/37) trae el trabajo de la
  instancia `sistemas-maestros` en la rama `claude/sistemas-maestros-retail-mzb1om`,
  que **no comparte historia con `main`**: sale de `c4dc404`. Ojo al mergear.

---

## Cómo corre

| | |
|---|---|
| **Producción** | [retail-espacios.onrender.com](https://retail-espacios.onrender.com) — Render, auto-deploy desde `main` |
| **Backend** | FastAPI + SQLAlchemy 2 + Postgres (`backend/`) |
| **Frontend** | React 18 + TS + Vite + Three.js (`@react-three/fiber@8`) + Tailwind + CSS vars (`frontend/`) |
| **Tipografía** | Geist / Geist Mono desde Google Fonts |
| **Roles** | `admin` y `worker` (JWT). Los precios se redactan server-side para worker, que además solo ve el Dashboard |

Sedes reales: **NAVE**, **POBLADO**, **ciudad jardin**. `TERRON`, `CENTRO`, `NORTE` y
`SUR` son las que la app trae por defecto.

### Levantar el entorno local

```bash
# backend
cd backend && DATABASE_URL="sqlite:///./dev.db" JWT_SECRET=dev uvicorn app.main:app --port 8000

# frontend
cd frontend && npm install --legacy-peer-deps && npm run dev
```

Para que dos máquinas compartan datos en desarrollo, creá `frontend/.env.local`:

```
VITE_API_TARGET=https://retail-espacios.onrender.com
```

Sin eso, cada máquina habla con su propio backend y su propia base — y ninguna
sincronización puede funcionar entre ellas.

---

## Reglas duras

Estas no son preferencias. Romperlas rompe producción.

**Sin migraciones.** El esquema se crea con `Base.metadata.create_all()`. Eso crea
*tablas* nuevas pero **no agrega columnas a tablas existentes**: una columna nueva en
`spaces` o `layout_snapshots` simplemente no existiría en la base ya desplegada. Cuando
hizo falta guardar algo nuevo, se usó la tabla `app_config` (clave/valor) o el propio
JSON del layout. `test_t22` (`tests/test_tendencia_ataques.py`) lo vigila contra
`origin/main`: ninguna clase que ya existía gana una línea `Column(` o
`mapped_column(`; las tablas nuevas, sí.

**Una sola verdad: el plano guarda lo que ES el mueble, la base lo que se le VENDIÓ.**
Esto REEMPLAZA al modelo dual, que fue el mayor generador de bugs del proyecto — ver
*Una sola verdad para lo comercial*, más abajo, para el porqué y la migración.

- **Geometría e identidad → el JSON por sede de `layout_snapshots`.** Dónde está el
  mueble, cuánto mide, cómo se llama, si se alquila (tipo `UnifiedFixture` en
  `frontend/src/types/fixtures.ts`).
- **Lo comercial → `spaces` / `space_leases` / `suppliers`.** Estado, proveedor, marca,
  valor, fechas, observación. **El layout NO los guarda**: `PUT /api/layout/{sede}` los
  descarta al recibir (`CAMPOS_DE_CONTRATO` en `routers/layout.py`) y `pushSede` los
  recorta al mandar. Los dos lados cortan, así que ningún camino los devuelve al JSON.
- **El navegador las junta al leer**, en el borde del store:
  `GET /api/spaces/comercial` + `fusionarEstadoComercial` en
  `frontend/src/utils/estadoComercial.ts`. Por eso `DashboardView`, `FloorPlan2D`, el
  editor 3D y la escalera siguen leyendo `f.status` y `f.supplierName` sin un cambio.
- **La única excepción son los `slots`** (el estado por repisa del editor 3D): no tienen
  contraparte en ninguna tabla, así que tienen UNA fuente —el JSON— y no pueden
  discrepar con nada. Su precio SÍ sigue viajando en el layout y sigue redactándose para
  un mercaderista, así que `_restore_missing_slot_prices` lo rellena al guardar. Lo que
  sí puede pasar es que el plano de Vender (contratos) dé libre una cara con repisas
  vendidas aparte: la fila del contrato lo avisa («3 repisas vendidas») y el visor 3D no
  se lo dice al proveedor (ver *Ver el diseño desde Vender*, la crítica).

El código de espacio es `"SEDE-CODE"` en mayúsculas. La cara B de una góndola doble usa
sufijo `-B`; los campos top-level del fixture son la Cara A y `fixture.faceB` es la B.
**Una parte agrega su sufijo al final, después de la cara: `SEDE-CODE[-B]-PU<n>`**
(`NAVE-NEV-03-PU2`, `NAVE-GON-05-B-TR2`, `NAVE-PUN-02-EN1`), y una pieza, sin cara
(`NAVE-CAJ-04-BI1`; el forro, sin número: `NAVE-COL-07-FO`). Una participación de cara, igual
que una división: `NAVE-GON-01-B-PC3`, con el `n` que pone el servidor. La relación entre la cara y sus
partes se DEDUCE del código, sin columnas: `partirCodigo` (`utils/partes.ts`) y
`partir_codigo` (`services/partes.py`) leen de derecha a izquierda —el último tramo es una
parte si es el token de una clase que existe con su número; después, `-B` es la cara— y
quien resuelve contra el plano prueba primero el texto tal cual, así que un mueble viejo que
ya se llamara así sigue siendo ése. Los dos lados corren `frontend/scripts/casos/partes.json`.
Los códigos existentes no cambian.

**«¿Tiene cara B?» tiene UNA respuesta:** `carasDe` en `frontend/src/types/espacio.ts`
(`isDoubleGondola` es `carasDe(f) === 2`; `types/fixtures.ts` reexporta las dos) y su
espejo `caras_de` en `backend/app/services/layout_lookup.py`. Es la regla laxa: `gondola`
con `gondolaType` `"double"` o AUSENTE, o el tipo legado `gondola_doble`, son dos caras;
`"wall"` y todo lo demás, una. La usan Vender, la fusión, «Contrato sin mueble»,
Supervisar, el guardarraíl de `PUT /layout`, la importación del plano, las métricas,
`scripts/auditar_desfase.py` y las dos puertas que crean contratos: la planilla
(`PlanoIndexado.resolver` no resuelve la `-B` de un mueble de una cara, y la fila dice
«tiene una sola cara») y el contrato suelto (`motivo_para_no_vender`, 409). Hubo dos
reglas —la fusión, la auditoría y el servidor exigían `"double"` escrito— y una góndola
vieja sin el campo vendía su cara B sin que el plano la pintara ni el guardarraíl la
cuidara; y hasta el 2026-10-13 la planilla vendía `PUN-01-B`, que ningún plano ofrece.
Los dos lados corren los mismos casos (`frontend/scripts/casos/caras.json`:
`probar-auditoria.mjs` y `tests/test_caras.py`), y `probar-auditoria.mjs` falla si aparece
otra comparación con `"double"` —escrita como sea: `===`, `["double"].includes(…)`,
`case`, `in (…)`— fuera de esas dos funciones, o una `carasDe`/`isDoubleGondola`/`caras_de`
propia. Para DIBUJAR, los editores siguen tratando como doble todo lo que no es `"wall"`.

**Lo que el editor no conoce del mueble se conserva.** Las conversiones entre el store y
cada editor viven en `frontend/src/utils/convertirPlano.ts` (puro, lo prueba
`probar-plano.mjs`). La vuelta al store parte del mueble guardado con ese `id` y le
escribe encima lo que el editor sabe: `{ ...guardado, ...loQueSabe }`. Antes armaban el
mueble desde cero con una lista fija y el 2D borraba `vista3D` y el montaje de la cara A
al mover cualquier cosa. Un campo nuevo del mueble no tiene que sumarse a ninguna lista
de los editores (sí a `sinDatosComerciales` si el visor de Vender lo necesita, y a
`_solo_geometria` de `routers/montaje.py` si el mercaderista lo necesita: esas son listas de
lo que se DEJA pasar, a propósito, y lo que podría llevar un objeto adentro —la ficha— pasa
copiado clave por clave y con su tipo, nunca entero). Lo que el editor sabe MANDA, también cuando vale
`undefined`, y `probar-plano.mjs` edita en cada editor todos los campos que la vuelta
escribe: comparando sólo lo movido se pudo borrar `rentable` de la vuelta sin que nada
fallara, y una punta habilitada de nuevo volvía «No comercializable» al guardar.

**Cada tipo de mueble está escrito UNA vez: el catálogo de muebles**
(`frontend/src/catalogo/muebles.json`, con una copia idéntica byte a byte para el servidor
en `backend/app/catalogo/muebles.json`: la imagen de Docker lleva `backend/` y
`frontend/dist`, no una carpeta compartida). **Se edita uno y se copia sobre el otro**;
`tests/test_catalogo_muebles.py` y `probar-catalogo.mjs` fallan si difieren. Las tablas de
siempre se CALCULAN de ahí y ningún componente ni módulo del servidor tiene una copia
propia: las guardas cargan los módulos con un catálogo adulterado, de los dos lados, y
cada tabla tiene que cambiar con él. **Las claves de tipo, los prefijos y las claves de
tarifa no se cambian nunca** (están en los planos, en los códigos de espacio y en las
tarifas de cada cliente); las medidas, el color y el rótulo sólo se usan al CREAR un
mueble, salvo `rotuloEditor`, que el 2D estampa en `label` cada vez que abre el plano.
**Un plano viejo da lo mismo que antes:** `frontend/scripts/casos/catalogo-antes.json` es
una referencia FIJA y todo lo que cambie respecto de ella va escrito, con su porqué, en
`CAMBIOS_INTENCIONALES`. Compara SÓLO los tipos y las tarifas que conoce: un tipo nuevo
no se compara contra nada, lo valida el esquema. Qué dice cada tipo, quién lo lee y cómo
se agrega uno: *Un solo catálogo de muebles (2026-10-13)*.

**Un modelo se ESTAMPA, no se enlaza.** Los `modelos` del catálogo (fichas de muebles de
verdad, con la URL de su fuente y su confiabilidad; nunca una imagen de terceros) se usan
al COLOCAR: el mueble guarda sus medidas, su color, su `modelo` y su geometría
(`entrepanos`, `modulo`, `partes`), y la vuelta de ningún editor la vuelve a escribir: sólo
el panel, a propósito («Alto», «Entrepaños», «Módulo»; ver abajo). Cambiar una ficha
no mueve lo ya colocado. Lo único que se busca por el id es la tarifa propia del modelo
(`rateTypeOf` ↔ `tarifa_del_mueble`, que reciben el MUEBLE entero, nunca sólo su tipo), y
por eso **el `id` y la `tarifa` de un modelo no se cambian nunca**, igual que las claves de
los tipos: los ids que ya salieron están escritos en `frontend/scripts/casos/modelos-ids.json`
con su tipo, variante y tarifa, y `probar-catalogo` y `test_modelos_de_muebles.py` fallan si
uno desaparece o cambia, o si aparece uno sin anotar. Un mueble sin `modelo` es el modelo
base de su tipo y da exactamente lo de antes. Ver *Muebles de Colombia (2026-10-13)*. **Las
fichas propias de cada supermercado** (`cli:<clave>`, tabla `modelos_mueble`) siguen la misma
regla: se estampan, la clave, la familia y la tarifa no cambian nunca (el `PUT` las rechaza),
retirar es baja lógica y lo colocado no se mueve; y se validan con las mismas reglas que los
modelos del catálogo (`fichas` en `muebles.json`). Ver *Fichas propias: el servidor (2026-10-14)*.
**Cómo se vende también se estampa** (vender por partes, P4): la ficha dice la forma de
dividir y las piezas (`partes.division`, `partes.bahias`, `partes.forro`), el mueble las
recibe al colocarse y ninguno de los dos lados las vuelve a leer de la ficha para vender (el
servidor ni siquiera las lee: `test_partes_fichas.py`). Un mueble colocado antes de que su
ficha lo dijera se sigue vendiendo como se colocó; el panel le ofrece «Usar lo de la ficha»,
que pasa por las mismas guardas que cualquier cambio de partes.
En el navegador viven en `catalogo/propias.ts` (las lee `store/fichasPropias.ts` una vez por
sesión y otra al guardar una, y si la lectura falla reintenta sola con espera creciente; nunca
en `localStorage`, y una sesión de otro supermercado las olvida antes de leer las suyas), y
`modeloPorId` las busca DESPUÉS del catálogo y sólo con el prefijo `cli:` (un `modelo` que no es
texto no es un modelo: el servidor guarda el plano como llega). Como llegan después del primer
dibujo, **todo `useMemo`/`useCallback` que pregunta la tarifa (`rateTypeOf`, directo o por una
función del archivo) lleva `fichasPropias` en sus dependencias** (`useFichasPropias()`);
`probar-catalogo` recorre `src` y falla si falta. Y por lo mismo **el valor acordado de Vender
sigue a la tarifa de lista mientras nadie lo toque** (`valoresDeLista`, `utils/precioDeLista.ts`):
escrito una sola vez, quedaba con la tarifa de antes de que llegaran las fichas. Ver *Fichas
propias del cliente (2026-10-14)*.

**El nombre propio de una familia es sólo lo que se lee.** Cada supermercado le pone su nombre
a cada familia (`catalogLabels`, `layout_catalog_labels` en `app_config`, por la clave de la
biblioteca del 2D) y sus pantallas lo dicen por `catalogo/nombresPropios.ts`: `conNombrePropio`
para el nombre del mueble, `tipoDelMueble` para la columna «Tipo» (que reemplaza a
`rateTypeLabel(rateTypeOf(f))`, que ninguna pantalla vuelve a escribir) y `nombreDeTarifa` para
las filas de tarifa. **Nada de eso se guarda**: el `label` del mueble sigue siendo el rótulo de
RECABRA, la fila de `spaces` se crea con él, ningún código ni tarifa cambia, y el servidor sólo
lo guarda y lo devuelve (`test_nombres_propios.py` falla si otro módulo lo lee), **recortado y
nunca rechazado** —80 letras sin los espacios de los costados, a lo sumo 100, claves de hasta 60
(`nombres_propios_recortados`)—: viaja en el mismo `PUT /layout/settings` que la lista de sedes,
y un nombre viejo rechazado dejaba al supermercado sin poder tocar sus sedes. **La consola y
los informes de asesoría nunca lo usan**: comparan supermercados con el nombre de RECABRA
(`probar-nombres.mjs` falla si una página de la plataforma llega a ese módulo o lee
`catalogLabels`). El store no importa ese módulo (va de entrada y traería el catálogo).

**Lo vendido no se mueve sin aviso.** El alto, los entrepaños y el módulo de una góndola o
una punta deciden las filas del arte pintado, los entrepaños donde se para el producto y
los módulos por los que se reparte. Con una cara vendida —contrato vivo o firmado para más
adelante, arte pintado en la cara— o espacios internos vendidos, el panel no los cambia sin
decir qué se mueve y sin un «Cambiar igual»; con espacios internos vendidos, la CANTIDAD de
entrepaños no cambia hasta liberarlos. Una sola cuenta para los dos editores
(`revisarCambioDeGeometria` en `utils/geometriaDelMueble.ts`), y el aviso no nombra a
nadie. Ver *Lo que se puede editar y lo que no se puede perder*. **Con una puerta vendida**
(contrato vivo o firmado) la nevera no cambia la cantidad de puertas ni deja de venderse
por puertas —la «puerta 2» pasaría a ser otra hoja—: el panel «Cómo se vende» lo frena sin
nombrar a nadie (`revisarCambioDePartes` en `utils/partesDelMueble.ts`) y el servidor
también (409 `partes_vendidas`); con la nevera vendida ENTERA, cambiar las puertas avisa con
«Cambiar igual». Lo mismo **con un tramo o un entrepaño vendido**: no cambian los tramos, ni
la cantidad de entrepaños (que es la cantidad de partes: el «Entrepaños» del panel de
geometría lo frena con `loVendidoDe(…, estado)`), ni la forma de dividir; el alto sí, con
aviso. Estirar el mueble no frena: los tramos y las puertas se estiran parejo. Y **con una
bahía de impulso vendida** no cambia la cantidad de bahías de la caja (parten la mesa parejo:
la «bahía 1» quedaría en otro lugar; 409 `partes_vendidas`), y **con el forro vendido** la
columna no se queda sin forro (409 `contratos_vivos`); el panel lo frena antes, y «Aplicar a
todas las cajas de la sede» salta las que tienen una bahía vendida y lo dice.

**Una pestaña vieja no borra lo nuevo.** La ficha del mueble (`CLAVES_DE_FICHA`: `modelo`,
`partes`, `entrepanos`, `modulo`) son claves que un editor de antes no conoce. `PUT
/layout/{sede}` le rellena al mueble que ya estaba (mismo `id` y mismo tipo de verdad) la que
llega AUSENTE, y la borra sólo con un `null` explícito, que es como el navegador de hoy dice
«ya no está» (`_con_la_ficha_de_antes`). Un mueble nuevo —u otro tipo con el mismo `id`— no
hereda nada y un plano sin esas claves se guarda byte a byte igual. **Por eso el navegador
de hoy nunca saca una de estas claves borrándola: la pone en `null`.** Lo hacen el panel al
vaciar un campo (`conGeometria`) y el deshacer/rehacer del store (`conFichaQuitada` en
`utils/guardadoDelPlano.ts`); un camino nuevo que quite la ficha tiene que hacer lo mismo, o
el servidor la resucita. Una clave nueva de este tipo se suma a las DOS listas
(`services/layout_lookup.py` y `utils/guardadoDelPlano.ts`; pytest las compara). **Adentro de
`partes` vale lo mismo, clave por clave** (`puertas`, `division`): una pestaña de antes que no
conoce `division` la manda ausente y el servidor se la deja; un `null` la borra; y el panel
escribe `partes` ENTERA a partir de la que tiene (`conPartes`).

**Lo que no está en el mapa comercial está LIBRE, y la fusión REEMPLAZA.** No hace falta
pre-crear ningún `space`: la fila aparece cuando se vende. Y la fusión no rellena huecos
—escribe los siete campos siempre—, porque rellenar dejaría un contrato cancelado pintado
desde la copia vieja de `localStorage` hasta que alguien recargara.

**Un espacio se ocupa vendiéndolo, y se reserva en Vender.** Los selectores de estado del 2D
y del 3D ofrecen sólo «Disponible» y «Mantenimiento», y escriben en la BASE
(`PATCH /spaces/{id}/status`). Poner «Ocupado» a mano creaba un ocupado sin contrato, sin
proveedor y sin fechas: el fantasma exacto que todo esto vino a eliminar. **«Reservado» a mano
tampoco** (rediseño, PR 3, decisión 1): era un apartado sin proveedor ni fecha que no se vencía
nunca y se confundía con la reserva de verdad, que sale de Vender (`vender-api.md` §8). El
servidor lo rechaza en todo espacio (409 «Las reservas se hacen desde Vender, con proveedor y
fecha.», `RESERVA_SOLO_DESDE_VENDER`); los que ya estaban así se siguen leyendo igual (`GET
/spaces/comercial` los da `reserved`, sin `reservado`) y salen en Supervisar → Para revisar →
Corregir, **«Marcado reservado a mano»**, con «Liberar» (Disponible) y «Reservar de verdad» (libera
la marca y abre Vender con el espacio). Esa sección también la ve el trabajador: no lleva plata
ni proveedor —no tiene ninguno— y el estado ya le llega pintado en su mapa; las dos acciones son
de administración.

**La nota del panel del Plano es la de la base.** «Nota del contrato» (con contrato o reserva
vivos: la misma de Vender) o «Nota del espacio» se escribe con `PUT /spaces/{id}/nota` (admin,
hasta 500 letras), que la guarda donde la lee `GET /spaces/comercial` —el contrato que manda, si
no la reserva viva, si no `spaces.notes`— y la bitácora dice dónde, nunca el texto. Antes el
panel la escribía en el JSON del layout, que `PUT /layout` descarta (`CAMPOS_DE_CONTRATO`): se veía
cambiar y no se guardaba. Es texto libre de administración: `GET /spaces/…` ya no le manda
`notes` del espacio al trabajador (lo de los contratos ya se tachaba).

**Sacar de circulación algo vendido se frena al guardar el plano.** Borrar el mueble,
pasar la góndola de doble a simple o marcarlo no comercializable retira el espacio de la
venta y dejaba su contrato vivo y sin nada que lo mostrara. Ahora el `PUT` contesta 409
`contratos_vivos` nombrando proveedor y fecha, y el guardado queda pendiente. Se frena en
vez de cancelar solo: cancelar es plata y un compromiso con un proveedor, no lo decide un
guardado del plano. Se comprueba **sólo lo que ese guardado retira**, comparando contra el
snapshot anterior — un plano que ya venía desfasado tiene que poder guardarse igual.
Con la venta por partes, retirar incluye **dejar de vender por puertas o bajar la cantidad**
con una puerta vendida (`contratos_vivos`, porque esa puerta deja de existir), y **mover** lo
vendido: cambiar de 3 a 4 puertas con la PU2 vendida no la retira pero la cambia de lugar, y
contesta 409 `partes_vendidas` (`partes_que_se_moverian`, por el `code` del mueble y la
«firma» de sus partes). Y **un mueble nuevo no puede llamarse como una parte** (`NEV-PU2`,
`GON-B`: 409 `nombre_reservado`, `nombres_reservados_nuevos`); un plano viejo con un nombre
así se sigue guardando. Con las participaciones (2026-10-17), retirar incluye **sacar de «por
participación» una cara con términos vivos** —409 `participaciones_vivas`: las reservas
provisionales no son leases y `contratos_vivos` no las ve—, y el guardado frena además pasar a
participación un mueble con espacios internos vendidos y vigentes
(`slots_vendidos_en_participacion`) y vender un espacio interno en uno que se vende así
(`slots_en_participacion`). El candado se toma también cuando una cara entra o sale de «por
participación».

**Entero o por partes, nunca las dos; y una sola forma de dividir.** Un mueble se divide por
puertas, por tramos o por entrepaños, nunca por dos a la vez (`partes.division` es un solo
valor; el panel y la ficha ofrecen las de su familia). Lo decide `chocan` (los dos lados, los
mismos casos): el mismo espacio choca; la cara entera y una de sus divisiones, sí; dos
divisiones de la misma clase, no (dos puertas conviven); de clases distintas en la misma cara,
sí; una pieza sólo consigo misma (dos bahías de la misma caja conviven; la caja entera ni
se vende). Lo aplican los CUATRO caminos que escriben contratos —la
planilla y Vender (`bulk_leases`), el contrato suelto (`create_lease`) y la importación del
plano (`importar_del_plano`)— con `contratos_que_chocan` y `frase_de_choque`, que no nombra al
dueño de la otra parte ni su canon. Y como la puerta y la entera son dos filas de `spaces`
distintas, cada camino toma **un candado por mueble** antes de la revisión con la que escribe
(`services/candado.py`: `pg_advisory_xact_lock` ordenado por mueble; en SQLite no hace nada):
sin él, dos ventas a la vez pasaban las dos (`tests/test_partes_concurrencia.py`, contra un
Postgres descartable; y espías que exigen el candado ANTES de revisar en `confirmar`, el
contrato suelto y la importación). **La regla compara CÓDIGOS, así que un mueble que se vende
por partes se guarda con su código completo**: la planilla y Vender lo arman con
`PlanoIndexado.resolver`, y el contrato suelto exige esa forma (`forma_canonica`, 409
«Escribilo «NAVE-NEV-03-PU2»…») —aceptaba `NEV-03-PU2` sin la sede o con un espacio adelante,
la compuerta lo resolvía igual y la nevera entera, escrita completa, no lo veía: entera a uno
y por puertas a otro en las mismas fechas—. Y lo que ya estaba escrito de otra forma también
cuenta: `contratos_que_chocan` (con `sede`), `partes_que_se_moverian` y
`contratos_que_quedarian_sin_mueble` comparan sin mayúsculas ni espacios y con la forma corta
de una fila de esa sede pasada a la completa.

**Entera, por partes o por participación: nunca dos a la vez** (participaciones de cara,
2026-10-17). La participación es una clase de división más (`PC`: `NAVE-GON-01-PC1`,
`NAVE-GON-01-B-PC3`, una fila de `spaces` por participación y su contrato un `space_leases`
normal), elegida como las otras en `partes.division` (`"participacion"`): un solo valor por
mueble, que vale para las dos caras de una doble, cada una con su capacidad. Una cara que se
vende por participación no se vende entera ni por partes físicas (la compuerta,
`motivo_para_no_vender_parte`, en la planilla, Vender, el contrato suelto y la importación); una
participación de una cara que no se vende así no existe; y `chocan` no deja convivir en fechas
que se pisan la cara entera o una división con una participación. Dos participaciones de la
misma cara no chocan por código: las frena la capacidad. **Un código `PC` lo crea el servidor, y
sólo por los caminos de participaciones**: desde el rediseño de Vender (PR 1) un porcentaje de
cara **se vende —o se reserva— en Vender**, como una línea más del contrato
(`POST /api/contratos/vender`, que escribe con `participaciones.escribir_alta`), y **se renueva
desde Supervisar** («Renovar» en la ficha o en la lista de participaciones de la cara abre
Vender armado con el % y el término que renueva, `renueva`). Distribución sigue cargando,
cambiando y cancelando reservas provisionales y dibujando zonas (`/api/participaciones`); un
contrato `PC` se cancela desde su ficha. La planilla y el contrato suelto lo rechazan, y
`PATCH /spaces/{id}/status` no lo marca a mano. El `n` lo pone el
servidor y no se reutiliza nunca (el montaje atribuye por código y fecha), y un mueble nuevo no
puede llamarse `…-PC<n>` (`nombres_reservados_nuevos`). Ver *Participaciones de cara y zonas
(2026-10-17)*.

**La capacidad de una cara la decide el servidor, con el candado del mueble, en todo camino que
escriba un término.** Cada día desde hoy, la suma de los pb que cuentan —contratos activos,
reservas provisionales que no caducaron y, como 10 000, lo físico: la cara vendida entera o por
partes y un lease `PC` sin término— no pasa de 10 000 (`revisar_capacidad`). La revisan con el
candado tomado el alta, cambiar y confirmar una reserva, renovar y confirmar una distribución
(`services/participaciones.py`); lo que muestra el navegador es una vista previa con la gemela.
**Las reglas y la geometría están escritas DOS veces** —`reglas_participacion.py` ↔
`utils/participaciones.ts`, `zonas_geometria.py` ↔ `utils/zonasGeometria.ts`, `superficie.py` ↔
`utils/superficie.ts`— y tienen que dar lo mismo **bit a bit**, frases incluidas: los mismos
casos (`casos/participaciones.json`, `zonas.json`, `superficies.json`), bucles explícitos con el
mismo orden de suma, nada de `sum()`, `math.fsum` ni `reduce` sobre flotantes (hay guardas que
los buscan) y `hoy` siempre como parámetro. Lo que la dueña ve dibujando es lo que el servidor
acepta al confirmar: si las dos cuentas se separan, una zona al filo pasa en pantalla y rebota
con 409.

**Después de cada candado, `db.expire_all()`.** El orden es revisar → candado → `expire_all` →
revisar otra vez → escribir, y la segunda revisión es la que vale. SQLAlchemy no refresca un
objeto que la sesión ya tiene cuando se lo vuelve a consultar: sin el `expire_all`, una reserva
que otra sesión subió de 30 % a 70 % mientras se esperaba el candado se sigue leyendo en 30 %, y
la cara queda en 110 % (probado contra Postgres). Lo hacen todos los caminos que toman el candado
del mueble: los de participaciones, el contrato suelto, la planilla (`confirmar`), la importación
del plano, el guardado del plano, la renumeración (que además vuelve a calcular el plan) y el
borrado de sede (candado → `flush` → `expire_all`; en otro orden se traba con un guardado del
plano). Y todos arman el código de la cara con la sede del plano (`codigo_cara`): otra escritura
del código es otro candado.

**Un término `contrato` no copia proveedor, marca ni fechas: la verdad es su lease.** En
`participaciones` esas columnas van en NULL para un contrato, las reglas leen las fechas del
lease (`termino_para_reglas`) y las notas viven sólo en `lease.notes`. Sólo una reserva
provisional, que no tiene lease, las guarda. Un camino nuevo que escriba un contrato de
participación lo hace con `alta_de_contrato` (el de la planilla) y su término apunta al lease:
el día que exista «editar contrato», no hay copia que se contradiga.

**El % nunca cambia por el dibujo, y el dibujo nunca cambia precio, % ni fechas.** Lo contratado
es un compromiso: lo dibujado se mide (`dibujado_pb`) y se juzga contra él (`EXCESO`,
`PENDIENTE`), nunca al revés, y «Ajustar al contratado» achica las zonas, no sube el %. Lo
disponible sale de los términos, nunca de lo pintado. Y del otro lado, un cambio de término que
dejaría rota la distribución confirmada es 409 `rompe_distribucion`, no un ajuste callado de
las zonas.

**Delante de un proveedor no se ve ninguna zona** —ni la suya—, ni participaciones de otros, ni
sus porcentajes, ni otras marcas. Lo único que ve de una cara por participación es **su %
y lo que queda** (decisión de la dueña, 2026-10-18: «sólo lo suyo y lo libre; cómo está
distribuido su porcentaje es discrecional del supermercado»), y sólo donde la pantalla sabe
quién está delante: la tarjeta CONTRATADO del Editor 3D con el proveedor de la reunión nombrado
y el HUD de Presentar con el proveedor en pantalla (`privadoPara`). Lo cuenta `loDelProveedor`
(`utils/partes.ts`, puro: otro proveedor nunca suma) a partir de `useLoSuyo`
(`StoreEditor3D.tsx`), que lee la cara como Distribución y se queda con UN número por cara.
En Vender, un porcentaje es una línea del contrato: el % que se elige y lo que queda («queda X %»,
«X % sigue libre»), nunca zonas, ni números `PC`, ni el % o el nombre de otro, ni si lo tomado
es un contrato o una reserva (sí hasta cuándo: «tomado hasta el 31 mar»). Los textos que el
servidor le manda a Vender salen neutros (`frase_tomada`, `vender._fila_de_rechazo`: ««X» está
tomado del 2 nov al 30 nov: ajustá las fechas.», «Con esas fechas no entra: revisá la
distribución en Supervisar.»), y un rechazo del guardado del plano se dice con una frase
genérica, nunca con su `message`. **La planometría se carga sólo en Supervisar** (la ficha del
espacio, con el contrato ya hecho), nunca en Vender ni en una reserva. El modo Distribución depende de UNA condición, `distribucionALaVista`
(`StoreEditor3D.tsx`): sin Presentar, sin `privadoPara`, fuera del visor de Vender, sin reunión
y sin primera persona; adentro, Presentar y la lámina están deshabilitados, y el visor de Vender
nunca le pasa la capa a la escena (`probar-vender`). Vender dice «Por participación · queda
X %», sin nombres ni montos ajenos. Las pantallas del trabajador dicen la palabra («Libre»,
«Por participación», «Tomada»), nunca el % ni la ficha, y de `/api/participaciones` sólo lee
la ocupación anónima (`GET /participaciones/ocupacion`, la única ruta que no es de
administración). **Al trabajador le llega el % de una participación —por el texto de montaje
(D13) y por esa ocupación, que cruzada con `/spaces/comercial` le dice quién tiene cuánto—;
nunca le llega plata.** El % no es plata: es lo que se monta. La dueña lo confirmó el
2026-10-18: queda así.

**La mercaderista ve su zona y sólo la suya.** `GET /montaje/mi-espacio` suma `dibujo` (la
cara y SUS zonas) sólo con el enlace de montaje o para quien administra —nunca para el
trabajador—, sólo con la distribución CONFIRMADA y al día, y el filtro va en el servidor
(`participacion_space_id` igual al del contrato del enlace): las formas, los números y los
nombres de las otras participaciones no viajan. Lo dibuja `Montaje/MiZonaEnLaCara.tsx`: su
zona en color (`--marca-1`), el resto de la cara en gris (`--surface-3`), sin rótulos.

**La caducidad de una reserva provisional la elige quien opera.** Sin tope fijo y sin valor
por defecto (decisión de la dueña, 2026-10-18): el formulario arranca vacío y no guarda sin
ella; el servidor exige hoy ≤ caduca ≤ `hasta`, como siempre.

**Una sede se renombra, no se borra y se vuelve a crear.** `POST /api/layout/{sede}/renombrar`
(`services/renombre_sede.py`, admin) muda en UNA transacción los códigos con el prefijo de la
sede, la columna `sede`, los montajes, el registro de nombres de la renumeración, el plano, la
lista de sedes, las tarifas `by_sede` y los contactos de aviso `by_sede`; lo demás va por `id` y
sobrevive. El navegador no llama a `DELETE /layout` para renombrar (`probar-distribucion`).

**El historial de participaciones nunca se purga.** `historial_participaciones` es la
constancia de lo contratado y lo dibujado (D14): ningún borrado automático lo toca, no lleva
montos (`anotar_historial` frena una clave de plata, también anidada) y guarda el correo de quien
actuó; una supresión es manual y es una decisión escrita.

**Antes de desplegar, `backend/scripts/buscar_codigos_pc.py`.** Desde esta fase `PC` es un
token: un mueble que hoy se llame `…-PC<n>` (o una fila de `spaces` así) se leería como la
participación n de otro mueble, y su contrato contaría como un lease sin término que ocupa la
cara entera. El script sólo lee, usa el `DATABASE_URL` de la aplicación (la consola de Render o
una base restaurada de la copia) y sale con 1 si encuentra algo; lo que aparezca se renombra con
la renumeración ANTES de desplegar. Desde el despliegue, `nombres_reservados_nuevos` no deja
crear nombres así, pero uno viejo se sigue guardando.

**No todo mueble del plano es espacio vendible.** La columna sostiene el techo; la
caja registradora y el mostrador de servicio al cliente son puestos de trabajo de la
tienda. Esos tres tipos están en `NUNCA_ALQUILABLE` —`alquilable: "nunca"` en el
catálogo de muebles, que leen `frontend/src/types/fixtures.ts` y
`backend/app/services/layout_lookup.py`, y hay pruebas de los dos lados que verifican
que las dos listas digan lo mismo— y no tienen tarifa, no suman a la disponibilidad de
la sede y **nunca se venden enteros**: ni Vender, ni la planilla, ni el contrato suelto
aceptan `CAJ-04` o `COL-07`. **La excepción son sus PIEZAS** (desde el paso 3 de vender
por partes, 2026-10-14): la caja vende sus bahías de impulso una por una (`CAJ-04-BI1`) y
la columna su forro (`COL-07-FO`), cada pieza con su contrato, **sólo si el plano las
configura** (`partes.bahias`, `partes.forro`: en el panel «Cómo se vende» o desde la ficha
propia). Una pieza se ofrece aunque el mueble no sea comercializable (`piezas_de` /
`piezasDe` no preguntan la bandera ni el tipo), no choca con nada más que consigo misma, su
tarifa es la de su clase sin respaldo y nunca cuenta en la ocupación —no es una cara—. Una
caja sin `partes.bahias` (todas las de los planos de antes) no ofrece nada, como siempre. El
mostrador de servicio al cliente no tiene piezas. `NUNCA_ALQUILABLE` no cambió.

La regla pregunta **primero por el tipo y después por la bandera `rentable`**, y ese
orden es lo que la hace funcionar: la bandera se estampa al CREAR el mueble, así que un
plano guardado antes de que existiera no la trae, y `rentable` ausente significa
comercializable —tiene que significarlo, o esos planos se vaciarían—. Mirando sólo la
bandera, todas las cajas de los planos viejos seguían aceptando contratos. Mirando el
tipo primero, quedan bien sin migrar una sola fila. El auditor de consola
(`scripts/auditar_desfase.py`) pregunta lo mismo, con `es_comercializable`, desde el
2026-10-13: mirando sólo la bandera contaba como ofrecida una caja de un plano viejo, y
su contrato no salía en el script aunque la pantalla lo diera por «Contrato sin mueble».

La `metro` (zona libre) es distinta: nace no comercializable pero **se puede habilitar a
mano**, porque un metro de piso sí se le alquila a una marca para su stand.

**Dentro del plano el código es corto; afuera lleva la sede.** `PUN-01` es nomenclatura
de sede y se repite en las tres tiendas. Todo lo que salga del layout — la fila en
`spaces`, el enlace del correo, el reporte de montaje — usa el código completo, que arma
`fullSpaceCode(sede, code)` en `frontend/src/types/espacio.ts` (lo reexporta
`types/fixtures.ts`). Indexar por el código
corto es un bug silencioso: parece funcionar con una sola sede y con dos empieza a
mezclar tiendas.

**El 3D pinta el ARTE; la geometría del mueble vive aparte.** La foto del proveedor se
aplica *como material* de la cara del mesh y se alinea a los entrepaños reales. La regla
que decía «nunca crear geometría nueva posicionada para esto» sigue valiendo **para
PINTAR el arte** (la lámina): se intentó dos veces y falló las dos. Lo que sí cambió es de
dónde sale la forma del mueble — ver *La góndola se construye con las piezas que tiene
una de verdad*. Y el **producto en prueba** (los envases 3D de *2026-10-08: el producto
se ve de verdad*) sí es geometría nueva, pero no posicionada a mano: es **hija del grupo
del mueble** y reusa sus filas, vanos y caras (`VentaDeMueble`), que es lo que *El
producto estaba pintado al fondo del mueble* dejó escrito como la forma que funciona.

**Lo que mira un proveedor muestra SÓLO lo suyo.** La pantalla de venta (Presentar) y la
lámina que se descarga son de un proveedor: ahí se dibujan sus pruebas y ninguna otra.
La sesión acumula pruebas de varios proveedores (Alpina a la mañana, Diana a la tarde), y
el filtro es uno solo, `arteALaVista` en `muebles/privacidad.ts`: con `privadoPara`
indefinido (la pantalla de la dueña) pasa todo; con un `supplier_id`, sólo sus artes; con
`null` (Presentar sin proveedor identificado), ninguna. Las caras ajenas caen al relleno
neutro por rubro, sin fotos, patrones ni tiras de estado. Ver *2026-10-09: lo que vio la
crítica*. Y con una **reunión fijada** (el selector la fija al elegir un producto) manda
la reunión también fuera de Presentar: el editor dibuja sólo las pruebas de ese proveedor
(`pruebasDeLaReunion`), «Presentar» es para él aunque esté elegido otro mueble, y el
cartel del mouse y el panel callan nombres y precios con la misma cuenta (`hayReunion`).
Ver *2026-10-09 (noche)*. «Cambiar de proveedor» deja la reunión ABIERTA sin proveedor
(`REUNION_SIN_PROVEEDOR`, un `""` que no es `null`): con el selector abierto o cerrado no se
dibuja ninguna prueba, el panel las trata como ajenas y «Presentar» no adivina para quién;
se sale eligiendo un producto o con «Terminar reunión». En reunión, la lámina de un mueble
sin prueba de la reunión no sale para el contrato ajeno ni lleva sus datos
(`laminaDelMueble`). Y con un proveedor en pantalla el HUD NUNCA avisa de la prueba de otro
(«hay una prueba que no se está mostrando» le decía que esa punta se le ofrece a otro): a
la dueña se le avisa antes de entrar; «Mostrarla» existe sólo con `privadoPara` nulo. Ver
*2026-10-10* y *2026-10-10 (tarde)*. El visor 3D de **Vender** pasa por el mismo filtro con
`privadoPara` SIEMPRE definido, y además los muebles le llegan sin un dato comercial
(`sinDatosComerciales`) y el catálogo sólo con lo del proveedor del contrato
(`GET /api/catalogo/?proveedor=`): ver *Ver el diseño desde Vender*.

**La cuenta de los entrepaños se hace en un solo lugar.** `muebles/medidas.ts` es la
fuente: `nivelesDeEntrepano` ubica las bandejas, `filasDeProducto` deriva de ahí las filas
de arte, y `getPanelShelfSpan` y el producto 3D preguntan las dos a esa función. Antes
había dos copias con un comentario pidiendo mantenerlas iguales, y no se mantuvieron.

**La geometría del slot no se mueve aunque se mueva el mueble.** `ZONA_DE_SLOTS` y
`SLOT_PROTO` deciden dónde cayó cada espacio vendido, y esa posición viaja en los
contratos de los clientes. El mueble puede cambiar de forma entero —y cambió—; el espacio
vendido no puede cambiar de lugar.

**Orden de rutas en FastAPI.** Las rutas literales van declaradas **antes** de las
paramétricas y del catch-all, o éste se las traga. Aplica en `layout.py`
(`/revisions`, `/settings`) y en `spaces.py` (`/face-images`).

**`/` es pública; el ingreso vive en `/login`.** Sin sesión, `App.tsx` mira
`window.location.pathname`: `/` monta la landing (`src/pages/Landing/`) y **cualquier
otra ruta sigue montando `Login`**, que es lo que hace que un enlace guardado a
`/reporte-plataforma` termine ahí después de entrar. Lo que se resuelve ANTES que eso no
cambió y no puede cambiar: `/politica-datos` es pública y el enlace de montaje
(`/?montar=…&t=…`) manda sobre todo, así que la mercaderista nunca ve la landing aunque
su enlace caiga en `/`. El correo de invitación sigue apuntando a `/login?invitacion=…`
(`routers/usuarios.py`) y los CTA de la landing a `/login#registro`, que abre `Login` ya
en modo registro. La landing es **pública de verdad**: cero llamadas a `/api/*`, cero
datos de cliente —el plano isométrico es un supermercado inventado sembrado en
`src/pages/Landing/datos.ts`— y cero recursos externos. Su CSS cuelga entero de `.lp`
porque redefine tokens que se llaman igual que los de `src/index.css`; un selector suyo
que se escape repinta el tablero. three.js entra sólo por el `import()` perezoso de «Ver
en 3D» (`Vista3D.tsx`): el bundle inicial de `/` no lo lleva.

**El dinero no viaja al worker.** `negotiatedValue` se redacta server-side en las
respuestas de layout, `monthly_rent` en las de spaces, y las tarifas de referencia
exigen admin **también para leer**. En el cliente, las tarifas quedan fuera de
`partialize` a propósito: la clave `retail-fixtures-v1` sobrevive al logout, y una
máquina compartida no debe entregarle precios al siguiente turno.

**Los planos del store están SCOPED por cliente.** `retail-fixtures-v1` sobrevive
al logout (para poder leer el mapa offline), pero en un mundo multi-cliente eso
significaba que entrar con la cuenta de OTRO supermercado en la misma máquina
mostraba —y, peor, el bootstrap de `syncFromServer` SUBÍA— los planos del cliente
anterior a la base del nuevo. El store guarda ahora `clienteCache` (el slug dueño
del caché) y `scopeToCliente(cliente)` descarta todo lo persistido si la sesión
que abre pertenece a otro cliente, ANTES de cualquier sync. Se llama desde el
efecto de sesión de `App.tsx`, antes de `startAutoSync`. El dinero ya salía de
`partialize`; esto hace lo propio con los planos ante un cambio de inquilino.

**Un cliente se borra archivado, escribiendo su código, y nunca el de la base
principal.** Borrar (`POST /api/plataforma/clientes/{slug}/borrar`) hace `DROP
DATABASE` y no tiene vuelta atrás; por eso exige el cliente ya archivado (el archivo
es el período de gracia contra el clic equivocado), el código escrito a mano, y
rechaza el cliente cuya base es la de `DATABASE_URL` —que además es el registro de
todos—. Y **borra membresías, invitaciones y estado de cuenta de ese slug**: no es
limpieza, es seguridad — un cliente nuevo que tome el mismo slug heredaría miembros,
invitaciones pendientes y una suspensión ajena. Ver *El ciclo de vida de un cliente*.
Lo mismo con la cobranza (C1): se va su suscripción; sus cuentas de cobro y pagos
se quedan de constancia, colgados de un id de suscripción que no se reutiliza, así
que nadie hereda una deuda ajena (ver *Cobro de la suscripción*).

**La cobranza automática sólo pone sólo lectura, sólo a quien tiene suscripción
automática, nunca sin aviso y nunca encima de una persona.** La escalera
(`COBRANZA_AUTOMATICA`, apagada por defecto: sólo ensaya) nunca suspende —eso es del
PATCH de la operadora—, nunca toca a un cliente sin suscripción o con suscripción
manual, nunca a Galerías (ni la escalera ni el «levantar» de un pago le mueven el
estado), nunca cambia un estado que no es «activo» y que puso una persona, y
**nunca pasa a sólo lectura sin que el aviso formal por correo haya salido diez días
antes** (sin correo entregado, la cuenta se queda en gracia). Sólo lectura es a los
30 días de vencida o más, nunca menos (el PUT no acepta menos). Sus motivos no llevan
montos, y la franja y la pantalla de bloqueo no muestran ni montos ni el motivo
(texto libre de la operadora): eso está en «Ver suscripción», sólo para la dueña.
Todo cambio del interruptor pasa por `cobranza.mover_estado`. Ver *Cobro de la
suscripción (2026-10-13)*.

**Toda tabla nueva se clasifica: de negocio o de registro.** `services/traspaso.py`
tiene las dos listas (`TABLAS_DEL_CLIENTE`, `TABLAS_DEL_REGISTRO`). Pasar un cliente a
la base principal VACÍA las de negocio de esa base, que es también la del registro:
una tabla de registro mal clasificada —usuarios, membresías— se borraría con el
sistema entero adentro. Por eso una tabla sin clasificar hace que el traspaso se
niegue a correr, y `tests/test_traspaso.py` falla hasta que alguien decide de qué
lado está. La copia de seguridad sale de la misma lista: una tabla de negocio nueva
entra sola a la copia, y dejarla afuera es una decisión escrita
(`TABLAS_QUE_NO_SALEN` en `services/copia.py`). Las últimas que entraron así son las cuatro
de las participaciones de cara (`participaciones`, `distribuciones`, `zonas` e
`historial_participaciones`, 2026-10-17), de negocio y sin archivos; ninguna se apunta a sí
misma (`renueva_a` es un entero sin clave foránea), porque el traspaso copia sin `ORDER BY`.
Antes, `modelos_mueble` (las fichas propias de los muebles de cada supermercado, 2026-10-14), de
negocio y sin archivos —una ficha no lleva foto—, con clave primaria entera: la copia arma las
rutas de los archivos con la clave primaria, y la clave de texto de la ficha nunca llega a una
ruta del ZIP. Antes, `supplier_asset_specs` (la ficha del arte).

**La fecha del negocio es la de Colombia.** Render corre en UTC, cinco horas
adelante: preguntando `date.today()`, desde las 7 p. m. el servidor vivía en el día
siguiente. Toda decisión que dependa de qué día es —vigencia de un contrato,
vencimientos, recordatorios, montajes— pregunta a `app/fechas.py` (`hoy()`,
`ahora()`; UTC−5 fijo, Colombia no cambia de hora). Las marcas de tiempo siguen en
UTC, que son instantes y no días, y el mes de la consola de la plataforma
(`periodo_actual`) sigue en UTC por decisión propia. Las pruebas comparan contra
`app.fechas.hoy` (importado como `hoy_en_colombia`), nunca contra `date.today()`, y
`tests/test_hora_colombia.py` corre a las 9 p. m. de Colombia. Los scripts de
consola también (`backend/scripts/auditar_desfase.py`).

**De lo que guarda un supermercado, lo único que el sistema borra solo es la bitácora
al año y las fotos de montaje y las planometrías de una cadena de contratos terminada
hace más de cinco días.** (Aparte de los registros técnicos de vida corta, como los
intentos fallidos del freno de ingreso.) Nada más se borra sin que alguien lo pida: ni un contrato, ni un montaje (pierde la foto,
la fila queda), ni un documento del espacio, ni la cara del 3D, ni el arte del
catálogo. Y **ante la duda, no se borra**: lo que no cierra —un espacio de una sede
borrada, un código que no coincide, un contrato que vive sólo en el plano, fechas
imposibles— se conserva y se cuenta. El borrado de fotos está detrás de
`LIMPIAR_FOTOS_VENCIDAS`, apagado por defecto: apagado, la pasada sólo ensaya. Un
borrado automático nuevo es una decisión escrita, no un efecto de un PR. Ver *Las
fotos duran lo que dura el contrato*.

**`frontend/public/` es público.** Todo lo que está ahí se sirve en la raíz del sitio,
sin sesión. Ahí estuvieron el plano real de Galerías y 21 recortes hasta el
2026-10-02. `probar-limpieza.mjs` tiene la lista de lo permitido (`_redirects`,
`robots.txt`): agregar algo es publicarlo, y tiene que ser una decisión.

**Los espejos comparan identidad, no booleanos.** El plano 2D y el editor 3D mantienen
una copia local del store. Los guards que evitan el eco comparan la *identidad del array*,
no una bandera: un booleano lo consume la pasada equivocada del ciclo de montaje, y eso
causó una pérdida de datos real (ver más abajo).

**Lo reservado cuenta como ocupado.** Una reserva viva de una cara entera o de una parte
(`reservas_de_espacio`: `estado = "viva"` y `caduca ≥ hoy`, día de Colombia) choca en sus
fechas igual que un contrato en TODOS los caminos: `layout_lookup.contratos_que_chocan` la
devuelve como `ReservaComoContrato` (id negativo), así que la planilla, el contrato suelto, el
guardado de Vender, la importación del plano y la capacidad de una cara (`fisicos_de`) la ven
sin saber que existe; el guardarraíl de `PUT /layout` la frena como a algo vendido y
`GET /spaces/comercial` la da tomada. Un camino nuevo que decida si algo choca pregunta ahí, no
a `space_leases` a mano. Delante del proveedor se dice «tomado», nunca «reservado» ni de quién.
Una reserva guarda su precio o, si cobra por **% de las ventas**, el porcentaje y el corte; al
confirmarla el contrato nace cobrando así. **En Supervisar una reserva no es un contrato**: la
base la manda `occupied` con `reservaHasta` (sólo a quien administra) y `conLaReserva`
(`DashboardView.tsx`) la pasa a «Reservado · hasta el …», fuera del canon, de «N contratos», de
«Por vencer», de «Contratado sin montar», de «Quién paga el canon» y de Renovar; se confirma o se
cancela en «Para revisar» («Reservas que caducan hoy» en Hoy, «Reservas por caducar» en 30 días) o
en la ficha del espacio. **Al trabajador** la base le manda la cara `occupied` con la marca
`reservado: true` y NADA más de la reserva —ni fechas, ni plata, ni proveedor, ni `reservaHasta`—
(`tests/test_reservas_de_espacio.py`): `conLaReserva` la pone «Reservado» a secas, y no cae en
«Ocupado sin contrato» de Corregir. Ni `reservaHasta` ni `reservado` se le pegan al mueble ni
viajan en el layout (`CAMPOS_DE_CONTRATO`, los dos lados).

**Un contrato que se cobra por ventas no es un contrato de $ 0.** Su `monthly_rent` va en 0 y
la plata sale de `cortes_de_venta`: toda métrica que promedia canon lo excluye
(`_contratos_activos` ya no lo trae) y toda la que suma ingreso le agrega lo cobrado
(`services/cobros.cobrado_por_contrato`). Ver *Rediseño de Vender, PR 1*.

**El correo de montaje espera a la planometría.** Todo contrato nuevo nace con su fila en
`montajes_pendientes` (`escribir_contrato` / `create_lease`) y `_avisar` no le manda el montaje
mientras la tenga. Sale una vez, por `routers/montajes.avisar_los_listos`, cuando el contrato
tiene planometría y, si es un porcentaje, zona confirmada. Un camino nuevo que cree contratos
pasa por `escribir_contrato` (o deja la fila él mismo); uno que mande el montaje por su cuenta
se salta la regla. Ver *Rediseño, PR 2 (Supervisar)*.

---

## Qué está hecho

### Rediseño, PR 3 (Plano): la barra, el catálogo, el lienzo y el panel B (2026-10-20)

Los dibujos aprobados son `docs/maquetas/rediseno-2026-10/plano.html` (su lista «Dónde queda cada
cosa» es la lista de control: nada se fue) y `panel-plano.html` (el panel B); los íconos, los de la
hoja (`hoja-iconos-y-piezas.html`, tablas «Plano» y «Catálogo del Plano»). Todo cuelga de
`.plano2d` (`src/plano.css`).

- **La barra de arriba**: la sede con la MISMA pieza que Vender y Supervisar (`.barra-pantalla
  .pieza`, con «N de M · X muebles» y el menú «⋯» con Renombrar / Agregar / Eliminar, los campos y
  diálogos de siempre), **Editar | Mirar** (reemplaza a «Vista previa»), las herramientas como
  íconos con su atajo en el globo (Eliminar en rojo) y, a la derecha, el guardado con punto y
  palabra («Guardado · Guardando… · Sin conexión»; tocarlo sincroniza), Revisar, Renumerar y
  Atajos. **La sede se dice una sola vez** (decisión 2): la barra de abajo se fue entera.
- **El catálogo**: familias plegables con su ícono, cada tipo con el suyo (un solo mapa,
  `components/FloorPlan2D/iconos.ts`; el `emoji` de `muebles.json` sigue para quien lo lea, el
  plano ya no lo dibuja —tampoco en el lienzo: un mueble chico lleva el ícono de su tipo—), sus
  medidas y cuántos modelos; el lápiz del nombre propio y las fichas propias, como siempre. Se
  pliega a una franja (a lo angosto arranca plegado).
- **El lienzo**: buscador y filtros con su cuenta —Todos · Libres · Ocupados · **Vendido en parte**
  · **Reservados** · Por vencer · Vencidos (decisión 3: «en parte» son partes vendidas y libres en
  una cara, o una cara por participación con algo comprometido y lugar; «reservados», una reserva
  de Vender de la cara o de una parte, o un «Reservado» a mano de antes)— y, al pie, − / % / + /
  Centrar en todo / Mostrar los códigos / Pantalla completa (tocar el % vuelve al 100 %).
- **El panel B** (decisión 5): el código con su lápiz (reemplaza a la sección «Nombre», por el
  mismo `renombrar`), «tipo · sede (candado) · pasillo», la pastilla, la franja «medidas ·
  entrepaños · X de N vendido» y tres pestañas: **Venta** (se vende —el destino—, cómo —el mismo
  `PartesDelMueble`—, estado —Disponible | Mantenimiento—, lo contratado sin plata y «Vender», que
  abre Sede → Vender con el espacio por `pedirVender` del store y el `negociar` de siempre; en una
  cara por participación, «Distribuir»), **Medidas** (ancho × prof. × alto en una fila, entrepaños
  con − y +, módulo: el mismo `GeometriaDelMueble`, las mismas guardas) y **Documentos** (los
  archivos con su tamaño, «Usar como foto de la cara en el 3D» —el `uso: "cara"` del upload— con
  la foto en chiquito, y la nota; la pestaña dice cuántos archivos hay). Abre siempre en Venta.
  Varios elegidos, Revisar y Atajos, con el mismo lenguaje. **Sigue el tema** claro u oscuro: el
  plano no lee ningún `--dark-*`; `PartesDelMueble` y `GeometriaDelMueble` toman `enElTema` en el
  Plano y siguen en el cajón oscuro en el Editor 3D, que no cambió.
- **A lo angosto**: por debajo de 860 px el panel es una hoja que sube desde abajo, a todo el ancho;
  por debajo de 640 px el catálogo abierto flota sobre el lienzo. Nada empuja la página de costado.
- Los archivos del panel se leen al abrirlo con `GET /spaces/by-code` (leer no crea la fila de
  `spaces`; la crea, como antes, el primer archivo o la primera nota de quien administra).
- Guardas: `probar-plano` (sin emoji, sin «Reservado» a mano, la sede una vez y de sólo lectura,
  abre en Venta, cada sección del panel de antes en su pestaña, sin `--dark-*`, los filtros y el
  pie); las de `probar-comercial`, `probar-distribucion`, `probar-geometria`, `probar-partes`,
  `probar-nombres` y `probar-comercializable` miran la forma nueva. Servidor:
  `tests/test_panel_del_plano.py`.

### Rediseño, PR 2 (Supervisar): el correo de montaje espera a la planometría (2026-10-20)

Decisión del dueño. Manda `docs/rediseno/vender-api.md` §4.

- **El correo de montaje de cualquier contrato nuevo** —cara entera, parte o porcentaje, por
  cualquier camino: planilla, Vender, contrato suelto, reserva confirmada, alta / confirmación /
  renovación de un porcentaje— **sale cuando el contrato tiene su planometría** (`POST
  /leases/{id}/planometria`, que se carga en Supervisar) y, en un porcentaje, además su zona
  confirmada. Lo que pase último lo dispara (la carga de la planometría o la confirmación de la
  distribución), sale **una vez** y su fila de `montajes_pendientes` se borra. Reemplazar la
  planometría no lo reenvía. Comercial y el proveedor reciben su correo al guardar, como
  siempre.
- Cómo: `alta_de_contrato.escribir_contrato` (y `create_lease`) dejan la fila;
  `bulk_leases._avisar` no manda el montaje de un contrato con fila; `routers/montajes.py`
  (`avisar_los_listos`) lo manda cuando a la fila no le falta nada
  (`services/montajes_pendientes.py`: lo que falta se mira, no se guarda). El correo es uno solo
  para todos los caminos, el de la planilla, que ahora dice también **dónde queda** en palabras
  (lo que tenía el del contrato suelto, que dejó de mandar el suyo).
- Las respuestas lo dicen: `avisos.montaje` vacío y `avisos.montaje_pendiente: [lease_id]` al
  guardar; la carga de la planometría devuelve `aviso_de_montaje` (`salio` /
  `espera_distribucion` / `null`).
- **Contratos de antes** (sin fila): nada cambia; su aviso ya salió al guardarlos.
- **«Falta planometría»**: `GET /api/montajes/pendientes?sede=` (sólo administración, sin plata):
  los contratos vigentes o por empezar con el aviso pendiente, con `falta_planometria`,
  `falta_distribucion` y `dias_para_empezar`. Pruebas: `tests/test_montaje_espera_planometria.py`.

### Rediseño de Supervisar, PR 2: la pantalla (2026-10-20)

El dibujo aprobado es `docs/maquetas/rediseno-2026-10/supervisar.html`; su lista «Dónde queda
cada cosa» es la lista de control (nada se fue). Lo nuevo vive en `components/Supervisar/`
(`plata.ts`, `useUnidadDePlata.ts`, `paraRevisar.ts`, `piezas.tsx`, `FaltaPlanometria.tsx`) y en
`src/supervisar.css`, todo colgado de `.sup`, la raíz de Supervisar. Vender no llega a ninguno
(`probar-vender`).

- **«Plata: Al mes | Total»**, uno solo, en la franja. Lo guardado es el TOTAL del contrato: «Al
  mes» lo reparte en los meses de cada contrato con `utils/meses.ts` (nunca `/ 30`), «Total» lo
  deja como está. Lo siguen las cifras, la columna «Valor al mes / Valor total» de «Estado por
  espacio» y «Quién paga el canon». Un contrato por % de las ventas suma lo cargado en sus cortes
  (`GET /api/cobros`) y la tabla dice «8 % ventas»; una reserva no cuenta nunca. La tarifa de
  referencia es al mes: en «Total», por los meses del periodo. Se recuerda en el navegador
  (`recabra-supervisar-plata`, con try/catch). El trabajador no ve plata ni el selector.
- **«Para revisar» en tres grupos**: Hoy · 30 días · Corregir, con su cuenta siempre a la vista.
  Cada aviso es una fila de `avisos` (`DashboardView`): de ahí salen las cuentas, la pastilla roja
  de la pestaña Supervisar (la SUMA de los tres) y las chinchetas del plano. Abre en «Hoy» si tiene
  algo, si no en «30 días». Qué va dónde está en `paraRevisar.ts` (`DONDE_VA`): lo que falta
  distribuir o le falta la planometría va en «Hoy» con 7 días o menos para empezar; una reserva,
  si caduca hoy. Nuevas: **«Falta planometría»** (`GET /api/montajes/pendientes`, con «Cargar
  planometría», que abre la ficha con esa planometría arriba) y **«Montaje sin reporte»** (los
  contratos que arrancaron hace más de 30 días sin reporte: antes una nota que no contaba).
  «Contratado sin montar» va en rojo desde los 14 días (`DIAS_SIN_MONTAR_EN_ROJO`): el «más de 60»
  de antes no podía pasar, la lista corta a los 30.
- **La ficha**: el código como se lee, el estado en pastilla y el montaje con punto. Una cara por
  participación muestra la barra de hoy y «Comprometido X % · queda Y %» **del periodo** (el pico,
  `capacidad.periodo`), una fila por marca con su %, su cobro y su montaje, y Distribuir · Renovar
  · «Vender el Y %» (Vender con esa cara y lo que queda en el periodo: con lo de hoy, Vender lo
  rechazaba si otra participación arrancaba adentro). El precio y el cobro de cada marca los
  escribe Supervisar y llegan armados: `ParticipacionesDeLaCara` también la importa el plano 2D y
  no carga la plata de Supervisar. Una reserva: «Reservado hasta …» con Confirmar y Cancelar ahí
  mismo; la ficha sigue al mueble de la última sincronización, así que confirmar o cancelar la
  deja al día. **«Cargar planometría»** carga sobre el contrato de la fila (`lease_id`), aunque
  todavía no arranque; sin fila, el que corre hoy o el próximo (`active_lease ?? upcoming_lease`).
- **«Vendido en parte» es lo vendido por partes o por participación**, una sola cuenta
  (`comoLaVeSupervisar` en `utils/partes.ts`): la clave y el color del plano de Supervisar, la nota
  de «Ocupación» y la pestaña de la tabla. Una cara vendida ENTERA que empieza o termina adentro
  del periodo está tomada (Vender la sigue pintando «Disponible en parte»: ahí sí se vende). Las
  pestañas «Libres» y «Vendido en parte» cuentan exactamente las filas que muestran (sólo caras,
  con `faceMatchesFilter`), y «Libres» es lo libre en el periodo, la misma cuenta que la clave.
- **«Bajo tarifa de referencia»** compara lo que el contrato paga AL MES (su total en sus meses,
  `bajoLaTarifa` en `utils/meses.ts`) con la tarifa, que es al mes; la fila dice esa cifra.
- **El plano**: el mismo panel que el de Vender (`vp vp-plano`) y del mismo alto en las dos
  pantallas, por construcción: las dos filas del plano miden `--alto-plano`, la cuenta cerrada de
  la rejilla de Vender contra el alto MEDIDO del área de las pantallas (`--alto-area`, que
  `Dashboard.tsx` escribe en `.area-pantallas`). Antes Supervisar adivinaba el marco (132 px) y el
  verificador midió 520/525, 430/448 y otro alto a 1100 (donde Vender pasaba a `62vw`). Las
  chinchetas (`Pin`) marcan los muebles con algo en «Para revisar», del color de su grupo (Hoy
  rojo, 30 días ámbar, Corregir tinta); tocar una lleva a su aviso. Vender no las recibe. La
  chincheta se apoya ARRIBA de la caja del rótulo de su cara, que al acomodarse cuenta con ella:
  nunca tapa el código. «Participaciones de cara» va fuera de la hoja y mide lo que su contenido.
- Al cargar una planometría la ficha dice qué pasó con el aviso de montaje (`aviso_de_montaje` del
  servidor), y Vender ya no dice «Nadie va a montar» de un contrato cuyo aviso espera la
  planometría (`montaje_pendiente`).
- Vender: la cuarta forma de «Cómo se vende» envuelve a 390 px y el porqué de una forma que no se
  puede sale sólo al tocarla.

### Rediseño de Vender, PR 1: el servidor (2026-10-19)

El contrato entre la pantalla y el servidor está en `docs/rediseno/vender-api.md` (manda ese
archivo; esto es el resumen).

- **`POST /api/contratos/vender`** (`routers/vender.py`, `services/vender.py`): un contrato de
  Vender con varias líneas —caras enteras, partes y porcentajes— se guarda de una vez, todo o
  nada. Cada línea pasa por la revisión de su camino (`bulk_leases._revisar` lo entero y las
  partes, `participaciones.revisar_alta` los porcentajes); dos porcentajes de la misma cara se
  suman. Revisar → `tomar_candados` de todo el pedido UNA vez → `expire_all` → revisar → escribir.
  `?validar=1` no escribe. Para escribir con el candado ya tomado, `participaciones.alta` y
  `renovar` se partieron en revisar + `escribir_alta` / `escribir_renovacion`, sin cambiar lo que
  hacen. `tipo: "reserva"` vale para todo: un porcentaje es un término `reserva` con su precio
  en `precios_de_reserva` (que `confirmar_reserva` usa si no le mandan valor), lo entero y las
  partes van a `reservas_de_espacio` (`/api/reservas`: listar, confirmar, cancelar).
- **Seis tablas nuevas** (`models/vender.py`): `condiciones_de_contrato` (cómo se tecleó el
  precio: «al mes» o el total), `precios_de_reserva`, `cobros_por_venta` + `cortes_de_venta`
  (`/api/cobros`), `montajes_pendientes` y `reservas_de_espacio`. Una reserva
  —de porcentaje o de espacio— también puede cobrar por ventas: guarda el cobro y su contrato
  nace con `cobros_por_venta`. Todas en
  `TABLAS_DEL_CLIENTE` (copia y traspaso) y en la exportación del owner
  (`condiciones_comerciales`). Ninguna columna nueva en tablas viejas.
- **El montaje de un porcentaje espera su zona**: al firmar el contrato de una participación
  sin zona confirmada, comercial y el proveedor reciben su correo y el de montaje queda en
  `montajes_pendientes`; sale después de `POST /participaciones/distribucion/confirmar` (válida)
  y se borra. `_avisar` ganó `roles=`. (En el PR 2 la espera vale para todo contrato nuevo y
  también espera la planometría: ver la sección siguiente.)
- **Los correos dicen «Valor del contrato»** (lo guardado es el total del plazo) y, si se
  escribió por mes, «$ 1.800.000 ($ 600.000 al mes)» (`services/condiciones.py`): la planilla,
  el contrato suelto, el aviso de vencimiento y Vender.
- **`GET /api/suppliers/completar?prefijo=`**: un solo nombre (el de más contratos), desde 3
  letras, sin tildes; sólo administración.
- **`services/meses.py`**: la duración en meses, gemela de `frontend/src/utils/meses.ts`, con
  los casos de `frontend/scripts/casos/meses.json`.
- Pendiente: la serie histórica (`snapshot_metricas`) no guarda lo cobrado por ventas (no tiene
  columna y no se agregan): los meses cerrados cuentan sólo el canon fijo.

**La ronda de correcciones del dueño (2026-10-20).** El % y «por partes» llegan enteros de lo
que se toca al contrato (`espaciosDelContrato` pasa `pc` y `porPartes`); «Renovar» de la lista
de participaciones de la ficha abre Vender, no Distribución; la lista de entrepaños queda
abierta mientras la línea es «por partes»; un 409 de capacidad vuelve a leer la ocupación
anónima. Privacidad: las reservas no cuentan como contratos en Supervisar (ver la regla dura
*Lo reservado cuenta como ocupado*); los choques en Vender dicen «tomado» con la fecha corta;
«cómo se vende» no dice qué parte, qué cara ni qué `PC` está vendida; `bloqueo_por_participaciones`
no cuenta términos; en Vender no se piden cobros ni reservas y la pastilla roja de Supervisar no
se dibuja; `/dashboard/kpis` le ordena los proveedores al trabajador por nombre, no por plata.
«Ventas por cargar» dice «→ $ 360.000» mientras se escribe, y los códigos van como se leen
(`GON-04·B`). El rótulo de una cara libre hoy y tomada más adelante (contrato o reserva) dice
«libre hasta 31 oct», y la pastilla de la tarifa «hasta 31 oct». La ficha del contrato, con una
línea a 1440×900, entra sin rodar (una sola pista, el plazo junto al total, el cobro con «Correo
y nota» en un renglón). A 390 px la barra de la aplicación entra en un renglón y la ayuda del
plano no tapa los botones.

### Auditoría de producción (2026-10-02): lo que quedó del modelo viejo

El dueño vio «Claves de acceso» en Configuración —la pantalla de un modelo que ya no
existía— y pidió revisar si había más cosas así. Se recorrió el código que corre en
producción y la app en un navegador como dueño, mercaderista y operador. Lo que salió,
y cómo quedó:

**Lo peligroso**

- **El plano real de Galerías se podía bajar sin sesión.** `frontend/public/` tenía
  `plano.png` y 21 recortes —restos del mapa SVG viejo, con la marca de agua de un
  proveedor—, y todo lo que está ahí se sirve en la raíz del sitio sin login. Se
  borraron, junto con el mapa viejo que los usaba (`FloorMap`, `SpacePanel`,
  `ReferenceRateHint`, `api/dashboard.ts` y las funciones de `api/spaces.ts` que sólo
  él llamaba). Ver la regla dura *`frontend/public/` es público*.
- **«Empezar de cero»** estaba en la barra de todo administrador y borraba todos los
  contratos: era para limpiar la etapa de práctica. Salió entero: el componente,
  `GET/POST /api/layout/empezar-de-cero/…` y `services/empezar_de_cero.py`.
- **«Pasar a la base principal»** seguía en la consola. Era de un solo uso (Pepito →
  Galerías, ya hecho) y, usado con otro cliente, reemplazaba los datos reales de
  Galerías. Ver *Pasar un cliente a la base principal*.

**Lo que fallaba**

- **Borrar la foto de un montaje daba 500 en Postgres** (SQLite no lo muestra):
  `mount_confirmations.file_id` apunta al archivo sin regla de borrado. Ahora el
  montaje se queda —es la prueba de que algo pasó— y pierde la foto
  (`routers/files.py::delete_file`). Reproducido y verificado contra Postgres 16.
- **La hora del servidor.** Render corre en UTC: desde las 7 p. m. el sistema vivía en
  el día siguiente, y un contrato que vencía hoy se liberaba a esa hora y se podía
  volver a vender esa misma noche. Ver la regla dura *La fecha del negocio es la de
  Colombia*.
- **El correo a la mercaderista no traía su enlace** desde el 2026-09-02: la venta por
  lote decía «Abrir RECABRA», y sin cuenta no había nada que abrir. Ver *La
  mercaderista ya no entra con contraseña*, el apartado del 2026-10-02.
- **La copia de seguridad no corría desde el 2026-10-01**: `scripts/respaldo.py`
  entraba con la clave compartida que se apagó ese día. Ahora la baja el dueño desde
  Configuración; ver *La copia de seguridad*.

**Restos del modelo de claves compartidas**

- La barra decía sólo «Administrador» o «Trabajador». Ahora dice el supermercado y la
  persona con su rol (`QuienSoy` en `pages/Dashboard.tsx`): `/auth/oauth` y el alta
  devuelven `cliente_nombre` y `rol_cliente`, y el store los guarda.
- El montaje con cuenta propia ya no pide «Tu nombre»: guarda la cuenta de la sesión
  (`routers/mounts.py`, con `sub_y_email_de_la_sesion`). Por el enlace firmado, que no
  tiene cuenta detrás, se sigue pidiendo.
- El filtro de la bitácora ya no ofrece «Intento fallido», «Cambio de contraseña» ni el
  barrido (`RETIRADAS` en `services/bitacora.py`); las filas viejas se siguen leyendo
  con su título.
- `bootstrap_claves` ya no crea claves compartidas ni las escribe en el registro de
  Render (ver *Identidad*, «Legado»). `scripts/alta_cliente.py` se borró: daba de alta
  un supermercado imprimiendo dos claves que ya no abren nada.
- `GET /api/auth/clientes`, la lista pública de supermercados, se fue: sólo servía
  para nombrar el supermercado al entrar, y eso ahora lo dice `/auth/oauth`.
- `/taller` abría para cualquier sesión; ahora, sólo para administradores.
- Textos: «las tres sedes», «Terrón» como ejemplo en el registro, «todavía nadie
  entró con cuenta propia», la página pública que decía «No accede con contraseña
  compartida», y los comentarios de `render.yaml` y del `Dockerfile` que daban por
  vivo el ingreso con clave.

**Lo que no es código** y queda del lado del dueño: la política de datos que todos
aceptan al entrar sigue diciendo «BORRADOR PARA REVISIÓN DE ABOGADO», con espacios
sin llenar, y la página pública tiene siete «[COMPLETAR…]» (precio, correo de
contacto, razón social, NIT y ciudad). Necesitan sus datos y un abogado.

Pruebas: `tests/test_copia_de_seguridad.py`, `tests/test_hora_colombia.py`,
`tests/test_montaje_enlace.py`; en `tests/test_mounts.py`, la foto borrada y el
montaje con cuenta; en `tests/test_traspaso.py`, que la ruta ya no existe; y
`frontend/scripts/probar-limpieza.mjs` (lo público, la copia, lo que salió). Todas
verificadas en reversa, rompiendo el código a propósito.

### Identidad: cuentas individuales con Google/correo (Fase 1)

Conviven DOS formas de entrar, y las dos emiten el mismo JWT:

- **Legado**: las dos claves compartidas por rol (admin/worker) de siempre —
  intacto, byte a byte el mismo payload. Se apagará por cliente cuando ese
  cliente haya migrado a cuentas.
  **Fase 15: la pantalla ya no lo ofrece.** Se quitó de `Login.tsx` el bloque
  «Acceso anterior» entero —el divisor, el selector de supermercado y la clave
  compartida—: era una credencial de rol y no de persona, así que no distinguía
  quién hizo qué ni se podía revocar de a una, y convivía con el ingreso
  individual en la misma tarjeta, ofreciendo la puerta más débil al lado de la
  más fuerte. `POST /api/auth/login` **sigue existiendo en el backend**: lo usa
  toda la suite de pruebas para armar sesión sin montar Firebase, y sacarlo es
  una fase aparte. Lo que ya no existe es la forma de llegar a él desde la
  pantalla.
  **2026-10-01: apagado también en el servidor.** El dueño preguntó, mirando
  «Claves de acceso» en Configuración, si eso seguía siendo necesario con el
  acceso por correo. No lo era, y además estorbaba: esas claves no abrían nada
  desde la app, sólo este endpoint, y como `crear_cliente` le pone a cada
  supermercado nuevo las claves de `ADMIN_PASSWORD` / `WORKER_PASSWORD`, y el
  endpoint aceptaba el `cliente` de quien fuera, quien supiera esa clave entraba
  como admin a cualquier supermercado fundado por el alta. Ahora
  `POST /api/auth/login` y `PUT /api/auth/passwords` contestan **410** salvo que
  `LOGIN_LEGADO=1` (`exigir_login_legado`, como dependencia de la ruta: corta
  antes de mirar la clave, así que tampoco se cuentan intentos). La suite lo
  prende en `conftest.py`; en producción es un interruptor de emergencia, por si
  Firebase no dejara entrar a nadie. La sección de Configuración se quitó: a una
  persona se le corta el acceso desde Usuarios, de a una. Para armar una sesión
  sin Firebase en el entorno local hace falta `LOGIN_LEGADO=1` y
  `ADMIN_PASSWORD`. Pruebas: `tests/test_login_legado.py` (verificada en
  reversa) y el apartado de `probar-ingreso.mjs`.
  **2026-10-02: tampoco se crean.** `bootstrap_claves` le ponía a cada base nueva
  las claves de esas variables, y si faltaban inventaba una al azar y la escribía
  en el registro de Render. Ahora sólo actúa con `LOGIN_LEGADO=1`, sólo desde las
  variables, y nunca escribe una clave en el registro.
  **Consecuencia, y es la que importa operativamente:** Google/correo pasó a ser
  la ÚNICA puerta. Sin las tres `VITE_FIREBASE_*` en el front no se puede
  entrar; antes ese caso caía parado porque quedaba el formulario viejo. La
  pantalla ahora lo dice en vez de quedarse vacía, pero decirlo no es entrar:
  esas variables son ahora tan críticas como `DATABASE_URL`.
- **Cuentas individuales**: Google o correo/contraseña vía Firebase Auth
  (`POST /api/auth/oauth`). El backend NO corre SDK de Firebase: verifica el
  ID token contra el JWKS de Google (RS256 forzado desde el header — inmune a
  `alg none` y a la confusión RS256→HS256 —, clave por `kid`, `aud` =
  `FIREBASE_PROJECT_ID`, `iss` de securetoken, y **leeway de 60 s** porque
  medio segundo de desfase de reloj real bastó para rechazar todo token
  recién emitido). El JWT propio solo gana `sub` y `email`: todo el
  middleware y la redacción de dinero por rol siguen tal cual.

Las tablas de identidad (`usuarios`, `membresias`, `invitaciones`) viven en
la **base por defecto (el registro)**, junto a `clientes` — identidad global,
se lee SIEMPRE con `sesion_registro()`. Son tablas nuevas: `create_all()` las
crea, sin migración. El rol sale de la MEMBRESÍA (owner/admin/worker; owner
viaja como admin en el token), nunca del pedido. Invitación por correo con
expiración; se canjean TODAS las pendientes al entrar. Desactivar una
membresía corta el acceso de ESA persona en el siguiente request (cache de
60 s con invalidación explícita al desactivar). El freno de fuerza bruta de
`/oauth` usa una tabla propia (`intentos_oauth`) para no contaminar el del
login legado. Un correo es confiable si viene verificado o si el token lo
emitió Google — LA MISMA vara en la puerta y en la vinculación por correo
(tener dos varas causaba un 500 que además era oráculo de correos).

**Quién está adentro, en la barra (2026-10-02).** `/auth/oauth` y el alta devuelven
también `cliente_nombre` y `rol_cliente` (el de la membresía: owner, admin o
worker), y la barra muestra el supermercado y «persona · rol». Una sesión abierta
antes de eso no los tiene (`rolCliente` en null) y cae a la palabra del rol del
token hasta que vuelva a entrar.

Config: backend `FIREBASE_PROJECT_ID` (sin ella, `/oauth` da 503 y nadie
entra); frontend `VITE_FIREBASE_API_KEY` / `VITE_FIREBASE_AUTH_DOMAIN` /
`VITE_FIREBASE_PROJECT_ID` (sin ellas, la pantalla dice que el ingreso no está
configurado). Ver `render.yaml` para el deploy. Verificado de punta a punta contra
el proyecto Firebase real (`recabra`): firma, JWKS, audiencia y emisor.

### Clientes comerciales: alta self-service y estado de cuenta (Fase 2)

Un usuario con cuenta (Google/correo) y sin membresías puede **fundar su
supermercado**: `POST /api/clientes/alta` recibe el ID token de Firebase
directamente (la misma vara de correo confiable que `/oauth`), valida TODO
antes del paso irreversible (`crear_cliente()`), y el fundador nace **owner**.
Frenos: slugs reservados, tope de 2 fundaciones por usuario, freno por IP en
tabla propia (`alta_attempts`).

El **estado de cuenta** por cliente (`activo`/`gracia`/`solo_lectura`/
`suspendido`) vive en la tabla nueva `estados_cliente` del registro — **fila
ausente = activo**, así que los clientes existentes no necesitaron backfill.
El corte se aplica en UN lugar (`cliente_del_pedido`) y SOLO con credencial
presente (contestar 402 a un anónimo delataría quién dejó de pagar): `gracia`
avisa sin cortar; `solo_lectura` deja GET y corta mutaciones de negocio con
402 (auth y gestión de usuarios siguen, para poder entrar a ver y pagar; las
escrituras internas de un GET permitido, como `expire_leases()`, no se
cortan); `suspendido` corta todo salvo el login del owner, que es el ÚNICO que
ve el `motivo` escrito por el operador — su gente ve el estado, nunca la deuda.
(Desde la revisión de C2 la dueña lo lee en «Ver suscripción»: la franja y la
pantalla de bloqueo dicen un texto fijo, porque se ven en Vender y el motivo de la
operadora es texto libre.)
Los datos jamás se borran por estado. Desde C2, ver qué se debe y el estado en vivo tampoco se
cortan (`_EXENTOS_PARA_PONERSE_AL_DIA`, ver *La escalera de cobranza*).

**Enmendado en Fase 14**: el 402 sale rotulado con la cabecera
`X-Estado-Cuenta` (`suspendido` | `solo_lectura`), expuesta en CORS. Es lo que
le permite a la pantalla enterarse de un corte aplicado **a mitad de sesión**:
antes el estado sólo viajaba en `aviso_cuenta`, una vez, en la respuesta del
login, y una cuenta suspendida mientras su gente ya estaba adentro seguía
viéndose entera. El `detail` no cambió: sigue siendo el texto para la persona,
y el rótulo es el canal de la máquina. Los dos estados viajan distinto porque
se dibujan distinto (`suspendido` tapa la app; `solo_lectura` sólo avisa), y un
402 pelado no alcanza para elegir. Contrato medido de los dos lados en
`frontend/scripts/probar-suspension.mjs`.

**Operadores de plataforma**: correos en la env `OPERADOR_EMAILS`, solo para
cuentas con `sub` (el legado jamás). Panel en `/api/plataforma/*`: listar
clientes con estado y `PATCH` con motivo obligatorio. **Enmendado en Fase 4,
re-enmendado en Fase 7 y ampliado en Fase 8** (ver esas secciones más abajo):
el operador accede a datos de negocio de los clientes SOLO a través de los
endpoints de plataforma definidos en las specs — hoy los **agregados exactos**
de `/metricas`, `/tendencia` y `/adopcion` y el **detalle de negocio** de
`/clientes/{slug}/detalle` (espacios, contratos y proveedores de UN cliente
por vez) —, siempre **solo lectura**, siempre anotado en la bitácora del
registro con el email del operador, y siempre declarado en la política §5.3 y
en el catálogo del reporte de transparencia. Lo que ningún endpoint abre:
contactos y notas de proveedores, notas de espacios y contratos, fotos y
archivos, datos de usuarios y la tarifa de referencia.
Red-team dedicado en `tests/test_plataforma_ataques.py` (30 ataques; la
frontera resistió).

### Invitaciones: nadie funda un supermercado por error (2026-09-23)

**Lo que pasó.** El dueño de la plataforma entró a la consola y encontró cinco
clientes: Galerías (la instalación original, suspendida, sin una sola cuenta de
usuario), «pepitos», «Pepito», «Medium» y «SUPERMERCADO POBLADO». Él trabaja en
«Pepito», que fundó con su cuenta el día que estrenó el login, y lo invitaron
después a Galerías. Esperaba que la invitación lo llevara a Galerías y que Pepito
dejara de existir. No pasó ninguna de las dos cosas, y la razón está en el código:

- **Una invitación no mueve a nadie: suma una membresía.** Si la persona ya tenía
  un supermercado, queda con dos y el login pregunta a cuál entrar. Ningún
  supermercado se borra ni se fusiona con otro por una invitación.
- **La invitación se canjea por CORREO, y sólo por correo.** El enlace del mail
  (`/login?invitacion=<token>`) no lo leía nadie —ni la pantalla ni el backend—.
  Quien entraba con OTRA cuenta que la invitada (la personal en vez de la del
  trabajo, lo más común) recibía «su cuenta no tiene acceso a ningún
  supermercado»… con el formulario de **fundar uno** en el mismo cuadro. Así nacen
  supermercados vacíos que nadie quería, y así un administrador o una mercaderista
  podía terminar trabajando en una base vacía creyendo que era la de su empresa.
- **Galerías «sin cuentas de usuario»** quiere decir que ninguna membresía activa
  apunta a `galerias`: la invitación nunca se convirtió en acceso (se mandó a otro
  correo, o venció a los 7 días sin que se entrara con ESE correo). Todo lo que se
  cargó desde entonces vive en la base de Pepito (`recabra_pepito`), no en la de
  Galerías.

**Lo que cambió:**

- **El enlace se lee.** `GET /api/auth/invitacion/{token}` (pública, con el freno de
  `/oauth`: cada token inexistente cuenta como intento fallido) dice a qué
  supermercado, con qué rol y **con qué cuenta** entrar —el correo va enmascarado,
  `b•••o@gmail.com`— y si la invitación está vigente, usada o vencida. La pantalla
  lo muestra arriba del botón de Google.
- **`/oauth` recibe `invitacion`** y, con él: entra a ESE supermercado aunque la
  cuenta tenga otros (sin selector); con otra cuenta que la invitada contesta 403
  `invitacion_otro_correo` **sin crear usuario, sin canjear nada y sin entrar a
  ningún otro supermercado**; vencida, 410 `invitacion_vencida`; inexistente, 404
  `invitacion_invalida`; un acceso que ya existía y está desactivado, 403
  `invitacion_sin_acceso`. El `detail` es `{codigo, mensaje, …}` y `mensaje` va
  redactado para la persona. El canje sigue atado al correo: un enlace reenviado no
  le da acceso a quien lo tenga.
- **La pantalla de ingreso ya no ofrece fundar ante un 403.** Dice qué hacer si lo
  invitaron (entrar con la cuenta a la que llegó el correo) y deja fundar detrás de
  un botón propio, «Registrar un supermercado nuevo», con la advertencia de que crea
  uno nuevo y vacío. **Con un enlace de invitación en la URL, fundar no se ofrece.**
- **El selector de supermercados arranca vacío** (o en el último que se usó desde
  ese navegador, `recabra-ultimo-cliente` en `localStorage`): antes arrancaba en el
  primero de la lista, y un Enter mandaba a cualquiera. Dos supermercados que se
  leen igual se distinguen por su código.
- **Google pregunta siempre con qué cuenta** (`prompt: "select_account"`): sin eso,
  quien tenía una sola sesión de Google abierta entraba con ésa sin ver el selector,
  y «entrar con otra cuenta» no servía de nada.
- **El alta rechaza el nombre de un supermercado activo** (409, comparando sin
  tildes, mayúsculas ni signos — `clientes.nombre_normalizado`): quien escribe
  «Galerías» casi siempre es alguien de Galerías que no encontró su invitación. El
  mensaje le dice que pida una invitación, o que agregue ciudad o sede si es otro.
- **Sólo un dueño hace dueños.** Invitar con rol `owner`, y activar o desactivar a un
  owner, exige que quien lo pide sea owner de ese cliente (se pregunta a la
  membresía: el token lleva owner y admin como `admin`). Antes cualquier
  administrador se fabricaba un dueño. El login legado (sin `sub`) queda como
  estaba: es la clave de la instalación y no tiene pantalla desde la Fase 15.
- **El correo de invitación dice con qué cuenta entrar**, y escapa el nombre del
  supermercado (lo escribe quien lo funda). El panel de Usuarios dice a qué
  supermercado se invita.

**Lo que NO cambió, y conviene no suponer:** la invitación es al supermercado
entero —todas sus sedes—, no a una sede. Los roles siguen siendo owner / admin /
trabajador (mercaderista), y lo que ve cada uno no cambió.

Pruebas: `tests/test_invitacion_enlace.py` (backend) y
`frontend/scripts/probar-ingreso.mjs`, verificadas en reversa (28 mutaciones, todas
detectadas).

### El ciclo de vida de un cliente: renombrar, archivar, borrar (2026-09-23)

Desde la consola del operador, en *Lo operativo → Estados de cuenta*, con un botón
por acción y una confirmación que dice en palabras lo que va a pasar. Cada una deja
línea en `bitacora_plataforma` (`renombre` / `archivo` / `reactivacion` / `borrado`,
con `periodo = "<slug>:<YYYY-MM>"`) y el cliente la ve en su reporte de
transparencia.

- **Renombrar** (`PUT /clientes/{slug}/nombre`) cambia sólo el nombre VISIBLE. El
  slug no se toca: va adentro de cada token y arma el nombre de la base. Dos
  clientes ACTIVOS no pueden llamarse igual (409).
- **Archivar / reactivar** (`POST /clientes/{slug}/archivar` · `/reactivar`, motivo
  obligatorio) usa la columna `clientes.activo` que ya existía: nadie entra (los
  tokens de ese cliente dan 401 en el pedido siguiente), deja de salir en la
  pantalla de ingreso, en el selector y en el **análisis de la consola** (métricas,
  adopción, benchmark), y el mantenimiento de fondo lo saltea. Los datos quedan
  intactos. Reactivar con un nombre que ya usa otro activo da 409.
- **Borrar** (`POST /clientes/{slug}/borrar`, `{confirmacion: "<slug>"}`): ver la
  regla dura. Borra la base y, del registro, la fila del cliente, sus membresías,
  invitaciones, estado de cuenta, fundaciones, fotos mensuales propias, su
  suscripción y su historial de estados sin suscripción. Quedan las cuentas de las
  personas, sus consentimientos, las solicitudes de supresión (constancia legal),
  la bitácora, el consolidado mensual y sus cuentas de cobro y pagos (constancia
  contable, ver *Cobro de la suscripción*).
- **`GET /clientes` dice `base_principal`**, para que la consola no ofrezca borrar
  el cliente de la instalación original.
- **`unico()` ahora exige que ese único cliente sea el de siempre.** Resuelve las
  credenciales SIN claim `cliente` (tokens y enlaces de montaje de antes del
  multi-tenant, el login legado sin `cliente`), que nacieron todas en la
  instalación original. Con Galerías archivado y otro cliente activo, un enlace
  viejo de montaje se habría resuelto contra la base del otro.

Pruebas: `tests/test_plataforma_ciclo.py`, verificada en reversa.

### Pasar un cliente a la base principal (2026-09-23)

**2026-10-02: el botón y la ruta se fueron.** Era de un solo uso —Pepito pasó a
Galerías— y, usado por error con otro cliente, reemplazaba los datos reales de
Galerías. La consola ya no lo ofrece y `POST /api/plataforma/clientes/{slug}/
pasar-al-principal` no existe (`test_desde_la_web_ya_no_se_puede`). La lógica sigue
en `app/services/traspaso.py`, probada llamándola directo, por si alguna vez hace
falta desde la consola del servidor; la generación del caché de planos se queda,
porque protege de cualquier reemplazo de datos (también de cargar una copia de
seguridad). Lo que sigue describe cómo era.

**Por qué.** El dueño de la plataforma no quería que su supermercado se *llamara*
Galerías: quería que lo *fuera*, «desde el código». Su supermercado real vivía con el
código `pepito` (base `recabra_pepito`), y `galerias` —el cliente de la base
principal— tenía los datos de práctica de la instalación original. Cambiarle el slug
a Pepito no sirve: `galerias` es el cliente de `DATABASE_URL`, y esa base es también
la del registro de todos; no se puede apuntar a otra. Lo que se mueve son los DATOS.

**Qué hace** (`POST /api/plataforma/clientes/{slug}/pasar-al-principal`,
`{confirmacion: "<slug del principal>"}`, lógica en `app/services/traspaso.py`):

1. Archiva el origen (su propio commit): nadie escribe en él mientras se copia.
2. En UNA transacción sobre la base principal: vacía sus tablas de negocio, copia las
   del origen fila por fila (con sus `id`, archivos incluidos, de a pocas filas las
   que guardan archivos), corre los contadores de `id` en Postgres, sube las épocas
   de sesión por encima de las de ambos (ninguna sesión de antes sobrevive, y copiar
   una época más baja no resucita tokens revocados), marca una **generación** nueva,
   mueve al slug principal las membresías, invitaciones, estado de cuenta,
   fundación, fotos mensuales, supresiones y bitácora del origen —borrando antes las
   del principal viejo, para que una invitación de práctica no lleve a los datos
   reales— y deja activo al principal. Si algo falla, no cambia nada y el origen
   vuelve a quedar activo.
3. El origen queda archivado con su base intacta: es el respaldo. Se borra desde la
   consola cuando se confirma que todo pasó.

**Sólo se pasa un cliente ACTIVO.** El archivado es el respaldo de un traspaso: pasarlo
otra vez —un clic de más, semanas después— pisaría todo lo trabajado desde entonces en
el principal. Para usar el respaldo hay que reactivarlo antes, a propósito; la consola
ni ofrece el botón en una fila archivada, y el backend contesta 409.

**Del lado del navegador: la generación.** El caché de planos está scoped por slug
(`clienteCache`), y el slug del principal no cambia: un equipo que guardaba planos
de la Galerías de práctica los habría mostrado y —si alguna sede nunca había llegado
al servidor— subido encima de los datos reales. `GET /api/layout/settings` devuelve
`generacion`, y `syncFromServer` descarta lo guardado de otra generación ANTES de
reconciliar (`generacionCache`, `planosVacios()` en `store/fixtureStore.ts`).
Comprobado en el navegador con un control: sin el chequeo, la sede vieja se subía.

**Verificado contra Postgres 16 real**, no sólo SQLite: filas idénticas, archivos,
un alta nueva después del traspaso sin chocar ids (los contadores), y
`DROP DATABASE … WITH (FORCE)` cortando una conexión ajena abierta.

**El procedimiento para el caso de arriba** (lo ejecuta el operador desde la
consola; nadie tiene acceso a la base de producción desde fuera):

1. Asegurarse de que no quede nada sin guardar en Pepito (el indicador de
   sincronización en verde).
2. En la fila de **Pepito**, «Pasar a la base principal», escribir `galerias` y
   confirmar. Los datos de práctica de la Galerías original se pierden; Pepito queda
   archivado de respaldo; todos vuelven a entrar.
3. Entrar con la cuenta de siempre (ahora aterriza en `galerias`) y revisar que esté
   todo.
4. Borrar **Pepito** (ya archivado), y archivar y borrar **pepitos**, **Medium** y
   **SUPERMERCADO POBLADO**.

**Lo que no se arrastra** —corregido el 2026-10-02—: acá decía que los enlaces de
montaje mandados desde Pepito dejaban de abrir y había que reenviarlos. No hubo
ninguno: desde el 2026-09-02 el correo de la venta por lote ya no traía el enlace
firmado (ver *La mercaderista ya no entra con contraseña*), así que no había nada
que reenviar.

Pruebas: `tests/test_traspaso.py` (17 mutaciones detectadas) y
`frontend/scripts/probar-traspaso.mjs` (7).

**Resuelto el 2026-10-01:** `crear_cliente` le sigue poniendo a cada cliente nuevo
las claves compartidas de `ADMIN_PASSWORD` / `WORKER_PASSWORD`, pero la única puerta
que abrían —`POST /api/auth/login`— está apagada salvo `LOGIN_LEGADO=1` (ver
*Identidad*, punto «Legado»). Y desde el 2026-10-02 ni eso: sin `LOGIN_LEGADO` no
se las pone.

### Cobro de la suscripción (2026-10-13)

Cómo le cobra RECABRA a cada supermercado, para quien llega sin contexto. El detalle
de cada pieza está en las dos secciones que siguen —*a mano en la consola (C1)* y *La
escalera de cobranza (C2)*—; acá va el mapa, lo que cambió la revisión de las dos y
lo que falta.

**Lo que decidió la dueña, y manda sobre cualquier plan:**

- **Sin pasarela por ahora.** Nada de Wompi, enlaces de pago, webhooks ni datos de
  tarjeta: el supermercado paga por transferencia y la operadora registra el pago en
  la consola. La landing sigue siendo cierta («no se usa pasarela ni se piden datos de
  tarjeta»).
- **Sin DIAN.** El sistema registra «facturas o cuentas de cobro» emitidas FUERA de
  RECABRA: número y, si es factura electrónica, CUFE. El régimen lo ve ella con su
  contador.
- **Si no paga: avisos por correo y sólo lectura a los 30 días de vencida**, nunca
  antes de 10 días después de que salió el aviso formal. **Nunca suspensión
  automática**: suspender lo decide la operadora con el PATCH de siempre.
- **Galerías, y todo cliente sin suscripción, exento**: la automatización jamás lo
  toca.

**Las tablas.** Cinco, nuevas, de la base registro (`app/models/cobro.py`), en
`TABLAS_DEL_REGISTRO`, creadas por `create_all()` sin migración. Ninguna columna nueva
en tablas viejas (tampoco en `estados_cliente`). Plata en pesos enteros `BigInteger`;
todo cuelga de `suscripcion_id`, que no se reutiliza (`sqlite_autoincrement` en
SQLite, la secuencia en Postgres), así que quien funda de nuevo un slug borrado no
hereda nada.

| Tabla | Qué guarda |
|---|---|
| `suscripciones` | Una por cliente: modo (`manual` · `automatico`), valor pactado por supermercado o por sede, plazo, `dia_solo_lectura` (30 o más), prórroga, referencia del contrato o de los términos aceptados (obligatoria para automático), datos de facturación y retenciones esperadas. Sin fila = exento. Se borra con el cliente. |
| `facturas_cobro` | Cada cuenta de cobro registrada: período (un mes se cobra una sola vez), número único para siempre, CUFE opcional, vencimiento, total, retenciones estimadas, neto, estado, disputa y copia del nombre y el NIT. Se conserva al borrar el cliente (constancia contable). |
| `pagos_cobro` | Cada pago contra UNA cuenta de cobro: recibido, retenciones, certificado, referencia bancaria (no única: una transferencia puede pagar varias) y quién lo registró. Se conserva. |
| `cambios_estado_cuenta` | El historial del interruptor (`estados_cliente` guarda sólo el último), con quién lo hizo: un correo o `sistema:cobranza`. |
| `avisos_cobro` | Un correo de la escalera por (cuenta de cobro, hito), una sola vez. La fila del aviso formal es la constancia de la que cuelga el corte. |

**Quién ve qué.**

| Quién | Qué ve | Dónde |
|---|---|---|
| La operadora (`OPERADOR_EMAILS`) | La cartera de todos: plata, cuentas de cobro, pagos, quién registró qué, el estado y el que correspondería | Consola → *Lo operativo* → cajón «Cobros» (`/api/plataforma/cobros` y compañía) |
| La dueña del supermercado (membresía `owner`) | Lo suyo: estado con motivo, lo pactado, la próxima cuenta de cobro con total, retenciones y neto, desde cuándo pasaría a sólo lectura, el historial de un año y los datos para transferir (sólo si tiene suscripción) | Configuración → Suscripción, y «Ver suscripción» en la pantalla de bloqueo (`/api/clientes/mi-suscripcion`) · los correos |
| El correo de facturación | Los correos con montos, en un envío propio (no ve el correo de las dueñas). Si es el de alguien de su gente, no se le manda | Correo |
| Su gente (admin no dueña, worker, mercaderista) | El estado, sin motivo y sin un solo monto | La franja y la pantalla de bloqueo (`/api/auth/estado-cuenta`) |
| Cualquiera delante de la pantalla (Vender) | Un texto fijo por estado: ni montos ni el motivo | La franja y la pantalla de bloqueo |
| El cliente, en su reporte de transparencia | Que la operadora miró la cartera, registró su suscripción, una cuenta de cobro, un pago, una anulación o una disputa —sin montos—, y sólo desde que ESE cliente se fundó | `/api/clientes/mi-reporte-plataforma` |

**La escalera** (`services/cobranza_automatica.py`; sólo suscripciones automáticas de
clientes activos que no son la base principal; al arrancar, cada 12 horas y, con el
interruptor prendido, apenas la operadora registra un pago, anula, pone en disputa o
guarda la suscripción de ese cliente):

| Días desde el vencimiento | Estado | Correo (a la dueña y a facturación) |
|---|---|---|
| −5 a 0 (el día que vence, todavía a tiempo; hora de Colombia) | activo | recordatorio |
| 1 | gracia | «está vencida» |
| 8 | gracia | «lleva N días vencida» |
| 20 —diez antes del corte— o apenas se pueda si ya pasó | gracia | **aviso formal**: «desde el … pasa a sólo lectura» |
| 30, y al menos 10 después de que salió el aviso formal | sólo lectura | «la cuenta está en sólo lectura» (una vez por corte) |
| al ponerse al día | activo (sólo lo que puso el sistema) | constancia del pago |

Nunca suspendido. Nunca pisa un estado que no es «activo» y que puso una persona (ni
para arriba ni para abajo). Con prórroga vigente no pasa de gracia; una cuenta de
cobro en disputa no cuenta. Si el correo no sale —SMTP caído, nadie a quién
escribir—, la cuenta se queda en gracia y la línea del log lo dice («sin aviso formal
entregado»). Los motivos que escribe no llevan montos.

**El interruptor `COBRANZA_AUTOMATICA`**, en `render.yaml` con `sync: false`.
**Apagado por defecto**: vacío, `0`, `false`, `no`, `off` o cualquier otra cosa → cada
pasada sólo ENSAYA (calcula con el mismo código, no escribe un estado ni manda un
correo) y deja una línea WARNING en el log con lo que haría. Prendido sólo con `1`,
`true`, `si`/`sí` u `on`. Para prenderlo:

1. Cargar `COBRO_INSTRUCCIONES_TRANSFERENCIA` (abajo) y revisar que el correo saliente
   ande con el botón de prueba (ver *Configurar el envío* y *El botón de prueba ahora
   sirve para probar*): sin correo no hay aviso formal, y sin aviso no hay corte.
2. Mirar unos días la línea «Cobranza automática, ENSAYO …» del log de Render, y
   «Correr cobranza (ensayo)» de la consola con las fechas que importen.
3. Publicar la política y los términos revisados por el abogado (borradores en
   `docs/legal/borradores/`) y tener, para cada suscripción automática, la referencia
   del contrato firmado o de los términos aceptados (`contrato_ref`).
4. En Render → el servicio → *Environment*: `COBRANZA_AUTOMATICA=1`. Render redespliega
   y la pasada del arranque ya aplica.

Para apagarlo, borrar la variable o ponerla en `0`: la pasada siguiente vuelve a
ensayar. Lo que el sistema ya había puesto queda como está: se cambia con el PATCH, o
se levanta al registrar un pago que deja al día con la casilla «levantar» marcada.

**`COBRO_INSTRUCCIONES_TRANSFERENCIA`**, también con `sync: false`: el texto con los
datos para transferir (banco, tipo y número de cuenta, titular, NIT), hasta 2.000
caracteres. Nunca va en el repo. La ven la dueña de un supermercado CON suscripción
(Configuración → Suscripción) y los correos de cobranza; sin la variable, dicen que se
comuniquen con RECABRA.

**Galerías** (el cliente de la base principal) es exenta. Nunca automática (409). Puede
tener una suscripción manual sólo para que sus cuentas de cobro se vean en la cartera
—Galerías paga hoy por cuenta de cobro—, pero ningún camino del sistema le mueve el
estado: ni la escalera ni el «levantar» de un pago (`razon: "exento"`), y la cartera no
le calcula «correspondería». **Por confirmar con la dueña**: si la quiere en la cartera
con suscripción manual o sin fila.

**La revisión (2026-10-13).** Tres revisores sobre C1 y C2 —seguridad y privacidad;
la escalera y la plata; cobertura con mutaciones—. Lo que encontraron y quedó
arreglado, con su prueba en `tests/test_cobranza_revision.py` (vista fallar contra el
código de antes, o contra la mutación que el revisor dejó viva):

- **Sólo lectura sin aviso** (alta): una deuda vieja al prender el interruptor, una
  cuenta de cobro cargada tarde, el servicio dormido o el correo caído pasaban derecho a
  sólo lectura sin un solo aviso. Ahora el corte exige el aviso formal ENTREGADO (su fila
  en `avisos_cobro`) diez días antes, como mínimo; el cálculo vive en
  `cobranza.estado_objetivo` y `mover_estado` lo lee en la misma transacción, así que el
  ensayo dice lo mismo (para una fecha futura supone que el aviso sale el día que le
  toca). Para una suscripción manual, «correspondería» sigue siendo la regla sin aviso:
  es una indicación para la operadora.
- **Retenciones con decimales ×10** (alta): el formulario leía «3.5» como 35. Pesos y
  porcentajes se leen distinto (`formato.ts`), y la vista previa de una cuenta de cobro
  sin subtotal cuenta los meses del período, como el backend.
- **Un abono con «levantar»** bajaba la suspensión de una persona a un sólo lectura del
  sistema: ahora «levantar» sólo levanta si el pago deja al día (`no_queda_al_dia`).
- **El correo tras un abono** pedía el neto entero: ahora dice lo abonado y lo que falta.
- **Anular, disputar o prorrogar** no volvían a mirar al cliente hasta la pasada de las
  12 horas: con el interruptor prendido, la escalera de ese cliente corre enseguida.
- **Plata en `Integer`**: en Postgres reventaba con 2.400 millones. Ahora `BigInteger`, y
  lo calculado tiene el mismo tope (422) que lo escrito.
- **Períodos superpuestos** se cobraban dos veces: un mes se cobra una sola vez (409), y
  «2026-11..2026-11» se guarda «2026-11».
- **Datos bancarios a cualquiera**: el alta es self-service, y la API los daba a toda
  dueña aunque no tuviera suscripción. Ahora sólo con suscripción.
- **La bitácora de cobros de un cliente borrado** le llegaba a quien fundara el mismo
  slug, y una acción posterior sobre una factura huérfana se le atribuía. Ahora el reporte
  sólo cuenta las líneas de cobro posteriores a la fundación, y la factura huérfana se
  anota `#suscripcion-<id>`.
- **El motivo libre de la operadora** salía en la franja y en el bloqueo, delante de
  proveedores: ahora un texto fijo, el motivo detrás de «Ver suscripción», y la consola
  avisa al escribirlo.
- **Correos**: uno por destinatario, y el de facturación que es de su gente no recibe
  montos. Con la cuenta ya en sólo lectura, ningún correo anuncia el corte (dicen que ya
  está), y el «está en sólo lectura» sale una vez por corte.
- **Sólo lectura a 1 día**: `dia_solo_lectura` aceptaba de 1 a 365. Ahora de 30 a 365.
- **Galerías** se podía mover con un pago con «levantar»: ya no (ver arriba).
- **La próxima cuenta de cobro de la dueña** era la más vieja aunque estuviera en
  disputa: ahora la que cuenta para el atraso.
- **Aplicar la escalera con otra fecha**: `correr()` aceptaba aplicar con el reloj
  atrasado. Ahora sólo con la de hoy, en el servicio y en la consola.
- **La consola pedía la cartera** al abrirse y tras cada PATCH, y cada pedido anota
  «cobros» en el reporte de TODOS los clientes: ahora al abrir el cajón, y el PATCH la
  actualiza en memoria. El reporte nombra cada acción (antes, «pago_manual» crudo).
- **Textos que C2 había vuelto falsos** en la consola («nada de acá corta», «todavía
  no»): ahora dicen lo que pasa según el interruptor.
- **Pruebas que faltaban** (mutaciones que sobrevivían): el interruptor con `0`/`off`,
  la constancia de pago para pagos viejos, el orden de los hitos, la frontera de las
  exenciones probada en `_aplicar_estado`, y en pantalla: «Correr cobranza» manda
  `ensayo: 1`, `duena` sale del servidor, el reloj llama a `revisar()`, y
  `MiSuscripcion` sólo se monta en el bloqueo y en Configuración. La prueba de dos hilos
  de la escalera se saltea fuera de SQLite: en Postgres el `FOR UPDATE` serializa antes
  de la barrera, que es justo lo que protege.

Verificado además contra un **Postgres 16** descartable: las tres suites de cobranza,
74 pasan y 1 se saltea (la de dos hilos).

**Lo que falta:**

- **Pasarela**: la recomendada es **Wompi** (Plan Avanzado Agregador; enlace de pago por
  el NETO de retenciones, PSE o Botón Bancolombia, webhook firmado), pero **la decisión
  es de la dueña y está pendiente**. Nada integrado; si se integra, la landing deja de
  ser cierta y hay que cambiarla en el mismo PR.
- **Factura electrónica**: si RECABRA factura electrónicamente, y en qué régimen (SIMPLE,
  SAS, persona natural), lo ve la dueña con su contador. Hoy sólo se registran número y
  CUFE de lo que se emite afuera.
- **Política de datos y términos del servicio**: borradores para el abogado en
  `docs/legal/borradores/` (`politica-datos-cobro.md`, `terminos-servicio.md`). La
  política publicada y `VERSION_POLITICA` NO se tocaron: publicarla es una versión
  nueva y dispara el re-consentimiento. Va antes de prender el interruptor.
- Anular un pago mal cargado (hoy no hay vuelta atrás desde la consola).
- Pasar una suscripción de automática a manual no levanta lo que había puesto el
  sistema: se baja con el PATCH.
- Las líneas de ciclo de vida (archivo, borrado, renombre) de un slug borrado todavía
  le llegan al reporte de quien lo funda de nuevo: es la deuda de antes de C1; las de
  cobro ya no.
- `services/traspaso.py` (sin ruta desde 2026-10-02) no mueve la suscripción.

### Cobro de la suscripción, a mano en la consola (C1, 2026-10-13)

Lo que RECABRA le cobra a cada supermercado, registrado por la operadora en la
consola (*Lo operativo → Cobros*). **No corta el servicio a nadie**: es la base
sobre la que después corre la escalera automática (C2).

**Lo que decidió la dueña, y manda sobre el plan de la pasarela:**

- **Sin pasarela por ahora.** Ni Wompi, ni enlaces de pago, ni webhooks. La
  landing sigue siendo cierta: transferencia contra cuenta de cobro, sin datos de
  tarjeta.
- **Sin DIAN.** El sistema registra «facturas o cuentas de cobro» genéricas
  —número, CUFE si la factura es electrónica— que se emitieron FUERA de RECABRA.
  El régimen lo ve ella con su contador.
- **Si no paga: avisos y sólo lectura a los 30 días de vencida la factura**
  (C2). **Nunca suspensión automática**: suspender lo decide ella con el PATCH de
  siempre.
- **Galerías, y todo cliente sin suscripción, queda exento**: la cobranza jamás
  lo toca.

**Cuatro tablas nuevas del registro** (`app/models/cobro.py`, en
`TABLAS_DEL_REGISTRO`; ninguna columna nueva en tablas viejas):

- `suscripciones` — una por cliente: modo `manual` | `automatico`, valor pactado
  en pesos enteros, unidad (`supermercado_mes` | `sede_mes`) y cantidad,
  periodicidad, plazo de pago, `dia_solo_lectura` (30 o más), prórroga, `contrato_ref`,
  datos de facturación y los porcentajes de retención esperados. **Sin fila =
  exento**, igual que sin fila de estado = activo. El precio va acá: no hay
  catálogo de planes.
- `facturas_cobro` — período, número (único para siempre, también el de una
  anulada), CUFE opcional, emisión, vencimiento, subtotal, IVA, total,
  retenciones estimadas, neto esperado, estado (`borrador` | `emitida` |
  `pagada` | `anulada`), marca de disputa, y una copia del nombre y el NIT al
  emitir. Una sola **viva** por período y suscripción: el índice único es
  parcial y deja afuera a las anuladas, porque anular la que salió mal y emitir
  la corregida para el mismo mes es lo normal. Desde la revisión, además, ningún
  mes lo cubren dos vivas (409): antes «2026-11» y «2026-11..2026-12» entraban las
  dos.
- `pagos_cobro` — contra UNA factura: medio (`transferencia` | `otro`), recibido,
  retefuente/reteICA/reteIVA, certificado recibido sí/no, referencia bancaria
  (obligatoria y **no única**: una transferencia que paga dos cuentas de cobro se
  registra en cada una con la misma referencia), fecha y quién lo registró.
- `cambios_estado_cuenta` — el historial del interruptor: `estados_cliente`
  guarda sólo el último cambio.

**Todo cuelga de `suscripcion_id`, no del slug**, y ese id no se reutiliza nunca
(`sqlite_autoincrement` en SQLite —sin él la fila borrada devolvía su id—, la
secuencia en Postgres). Borrar un cliente borra su suscripción y su historial de
estados SIN suscripción; las facturas, los pagos y el historial atado a la
suscripción se conservan como constancia contable, y quien funde el mismo slug
arranca exento y sin deuda.

**Cuándo una factura está pagada**: lo recibido más las retenciones de los pagos
aprobados cubre el total, con mil pesos de tolerancia por redondeo. Las
retenciones cuentan aunque el certificado no haya llegado. **«Vencida»** no es un
estado guardado: emitida, impaga y con `vence_el < hoy` (Colombia) — el día del
vencimiento todavía está a tiempo. Una factura en disputa no cuenta para el
atraso.

**Un solo camino para el interruptor: `services/cobranza.mover_estado`.** El
PATCH de la consola pasó a llamarlo y contesta lo mismo de siempre; además deja
la fila en `cambios_estado_cuenta`. Sus reglas para una máquina (actor que
empieza con `sistema:`): **nunca empeora un estado puesto por una persona** (sólo
uno sin fila, «activo», o puesto por otra máquina); mejora uno puesto por una
persona sólo si ella lo pidió; no reescribe un estado igual. Con
`EL_QUE_CORRESPONDE` calcula el estado DENTRO de la misma transacción que lo
escribe (suscripción y estado `FOR UPDATE` en Postgres). `estado_objetivo` es
pura: activo · gracia desde el día siguiente al vencimiento · sólo lectura a los
`dia_solo_lectura` días —para una suscripción automática, además, no antes de 10
días después de que salió el aviso formal (revisión de C2)— · no pasa de gracia con
prórroga vigente · **nunca suspendido**. Galerías nunca se mueve por acá. Se muestra («correspondería») y, desde C2, la escalera lo aplica a
las suscripciones automáticas (ver la sección siguiente). Desde C2 también
reintenta una vez si dos caminos crean la PRIMERA fila de estado a la vez (sin
fila, `FOR UPDATE` no tiene qué bloquear, tampoco en Postgres), y tiene modo
`ensayo`: decide igual y no escribe.

**Registrar un pago puede LEVANTAR el estado**, y sólo eso, sólo si la operadora
marca «Si con este pago queda al día, levantar el estado de cuenta» (apagada por
defecto) y el pago deja al día: vuelve a activo, nunca sube, y lo firma
`sistema:cobranza` (el correo de ella queda en el pago). Un abono que no deja al
día no toca nada (`no_queda_al_dia`): antes bajaba a «lo que corresponde», y una
suspensión puesta a mano se volvía un sólo lectura del sistema (revisión de C2). Así la escalera de
C2 reconoce ese estado como suyo. **Los motivos que escribe el sistema no llevan
montos**: le llegan a la dueña del supermercado y la franja se ve en Vender,
delante de los proveedores.

**Endpoints** (`/api/plataforma`, sólo operadora, todos al registro):
`GET /cobros` (la cartera: modo, valor, próxima a pagar, atraso, estado actual y
el que correspondería, último pago, facturas; exentos sin deuda),
`PUT /clientes/{slug}/suscripcion` (automático exige `contrato_ref` → 422;
`dia_solo_lectura` menor que 30 → 422; el cliente de la base principal nunca es
automático → 409),
`POST /clientes/{slug}/facturas` (sin suscripción → 409),
`POST /facturas/{id}/pagos`, `POST /facturas/{id}/anular` (con pagos → 409) y
`POST /facturas/{id}/disputa`, con motivo. Bitácora del registro con códigos
`cobros` (alcanza a todos, como `clientes`), `suscripcion`, `factura`,
`pago_manual`, `anulacion` y `disputa` (`"<slug>:<YYYY-MM>"`), cada uno con su
rama en `plataforma_reporte._accesos_del_cliente`: el cliente las ve en su
reporte de transparencia, sin montos, y sólo las posteriores a su fundación (una
acción sobre la factura de un cliente borrado se anota `#suscripcion-<id>`).

**Pantalla**: cajón «Cobros» (`components/plataforma/cartera-cobros.tsx`) con la
cartera y los formularios —suscripción, emitir, registrar pago con retenciones y
referencia, anular, disputa— y columna «Modo» en la tabla de estados. Plata y
facturas, sólo para la operadora: `probar-plataforma.mjs` (1d) falla si un
archivo fuera de la consola nombra la API de cobros, y si la casilla de levantar
deja de arrancar apagada. Recorrido en navegador sobre una base sembrada: cargar
suscripción, emitir una vencida, sólo lectura a mano, pago con retenciones y
«levantar» → activo firmado `sistema:cobranza`, sin errores de la app ni de la API.

Pruebas: `tests/test_cobranza_consola.py` (23; cada una rota a propósito una vez
y vista fallar).

**Pendiente**: anular un pago mal cargado (hoy no hay vuelta atrás desde la
consola); `services/traspaso.py` (sin ruta desde 2026-10-02) no mueve la
suscripción del origen al principal. La escalera, los avisos y la pantalla de la
dueña llegaron en C2.

### La escalera de cobranza, sola y en ensayo por defecto (C2, 2026-10-13)

Lo que decidió la dueña: **si no paga, avisos por correo y sólo lectura a los 30
días de vencida la cuenta de cobro; nunca suspensión automática** (suspender lo
decide ella con el PATCH de siempre); Galerías y todo cliente sin suscripción,
exentos. Sin pasarela: se sigue pagando por transferencia y la operadora
registra el pago en la consola (C1).

**La tarea** (`services/cobranza_automatica.py`, bloque propio en
`main._run_lease_maintenance`, después del cierre del mes; al arrancar y cada
12 horas) recorre SÓLO las suscripciones en modo `automatico` de clientes
activos —ni las manuales, ni los clientes sin suscripción, ni los archivados, ni
el de la base principal— y para cada una llama a `cobranza.mover_estado(slug,
EL_QUE_CORRESPONDE, actor="sistema:cobranza")`, que calcula y escribe en la
misma transacción. Con `d` = días desde el vencimiento de la cuenta de cobro
emitida, impaga y sin disputa más vieja: `d ≤ 0` activo · `1 ≤ d < 30` gracia ·
`d ≥ 30` sólo lectura (el 30 es `dia_solo_lectura` de cada suscripción, 30 o
más), **y nunca antes de 10 días después de que salió el aviso formal** (revisión
de C2: sin el correo entregado, la cuenta se queda en gracia). El día del
vencimiento todavía está a tiempo (fecha de Colombia). Con prórroga vigente no
pasa de gracia.

**Nunca pisa a una persona.** Un estado que NO es «activo» y que puso alguien
(`cambiado_por` sin `sistema:`) queda como está, para arriba y para abajo: si la
operadora le dio aire a mano (gracia) o la suspendió, la escalera no la toca, ni
siquiera cuando paga. Al ponerse al día, la escalera devuelve a activo sólo lo
que puso ella misma. Un «activo» puesto a mano NO congela la escalera (C1 lo
decidió así: es la ausencia de corte): **para darle aire a un cliente que debe,
la herramienta es la prórroga**, no el PATCH a «activo» — la consola lo dice al
lado de cada diferencia («automático: lo aplica la próxima pasada»).

**Un pago registrado** con la suscripción automática y la escalera prendida
corre la escalera de ESE cliente apenas sale la respuesta (en segundo plano): lo
que puso el sistema vuelve a activo sin esperar 12 horas, y sale la constancia.
Desde la revisión, lo mismo al anular una cuenta de cobro, ponerla o sacarla de
disputa, y guardar la suscripción (una prórroga).

**Los correos** (`avisos_cobro`, tabla nueva del registro, UNIQUE por factura e
hito): `por_vencer` (desde 5 días antes), `vencida` (d=1), `mas_7` (d=8),
`aviso_solo_lectura` (10 días antes del día de sólo lectura, o apenas se pueda si
no salió a tiempo, y entonces corre el corte), `solo_lectura` (sólo si la cuenta
quedó de verdad así por la escalera, una vez por corte) y `pago_recibido` (pagos
registrados en los últimos 10 días). Sólo a las cuentas con membresía ACTIVA de
dueña y al correo de facturación de la suscripción —salvo que sea el de alguien de
su gente—, **un envío por destinatario**: nunca a su gente ni a la libreta de
contactos por sede. Llevan número, total, retenciones estimadas, neto (tras un
abono, lo abonado y lo que falta), vencimiento y los datos de
`COBRO_INSTRUCCIONES_TRANSFERENCIA`. Con la cuenta ya en sólo lectura, ninguno
anuncia el corte: dicen que ya está. **Con el servicio
dormido se pone al día sin duplicar**: cada pasada manda sólo el hito que le
toca HOY a cada cuenta de cobro (el que despierta 20 días tarde manda uno, no
tres) y nunca uno anterior a otro que ya salió. La fila del hito se escribe
ANTES de mandar (la reserva: dos pasadas a la vez chocan con el UNIQUE) y se
borra si el envío falla, para que se reintente. Con un estado puesto por una
persona, los correos no anuncian una fecha de sólo lectura que no va a llegar.
Los motivos que escribe el sistema siguen sin montos.

**El interruptor `COBRANZA_AUTOMATICA`** (mismo patrón que
`LIMPIAR_FOTOS_VENCIDAS`, declarado en `render.yaml` con `sync: false`): vacío o
en 0 —el valor por defecto—, la pasada sólo ENSAYA: calcula con el mismo código
(`mover_estado(..., ensayo=True)`), no escribe un estado ni manda un correo, y
deja UNA línea WARNING por pasada, también con «0 cambios»:
`Cobranza automática, ENSAYO (COBRANZA_AUTOMATICA apagado), lo que haría el
2026-11-16: 1 suscripción automática · 1 cambio: canaveral activo→gracia · 1
correo: canaveral CC-001 vencida`. Sin montos ni correos en el log. Se prende con
1 en el panel de Render cuando la dueña haya mirado unos días el ensayo.

**Consola**: «Correr cobranza (ensayo)» en el cajón «Cobros»
(`POST /api/plataforma/cobranza/correr?ensayo=1[&fecha=YYYY-MM-DD]`): qué haría
hoy, o el día que se elija, a quién movería y qué avisos mandaría (hito y
cuántos destinatarios, sin los correos). Desde la pantalla es siempre un ensayo;
`?ensayo=0` exige el interruptor prendido (409) y la fecha de hoy (422), y
`correr()` mismo rechaza aplicar con otra fecha, hacia adelante o hacia atrás.
Bitácora `cobranza`, que alcanza a todos como `cobros`.

**La dueña del supermercado** (membresía `owner`, `require_owner`):
`GET /api/clientes/mi-suscripcion` —estado con motivo, lo pactado, la próxima
cuenta de cobro con total, retenciones estimadas, neto, vencimiento y desde qué
día pasaría a sólo lectura, el historial de un año de cuentas de cobro, pagos y
cambios de estado (sin el correo de la operadora: «RECABRA» o «automático») y
las instrucciones de transferencia, sólo si tiene suscripción— y `PUT /api/clientes/mi-suscripcion/
facturacion` (razón social, NIT, correo de facturación, municipio; valen para
las cuentas de cobro que vengan). Su gente recibe 403. En pantalla, sección
«Suscripción» de Configuración (`components/suscripcion/MiSuscripcion.tsx`), con
el mismo filtro de rol que la copia de seguridad.

**Exentos del corte** (`_EXENTOS_PARA_PONERSE_AL_DIA` en `clientes.py`, con
`_path_bajo`): `/api/clientes/mi-suscripcion` (y su `/facturacion`) y
`/api/auth/estado-cuenta`. Una dueña suspendida lee su suscripción y nada más
del negocio.

**El estado se refresca sin volver a entrar.** `GET /api/auth/estado-cuenta`
(cualquier rol con sesión; el motivo sólo para la dueña; sin plata) lo consultan
`BloqueoCuenta` y la franja al montarse, cada 3 minutos y con «Reintentar»; lo
que dice el servidor va al store con `actualizarAvisoCuenta`, que también LIMPIA
el aviso cuando la cuenta vuelve a estar al día. La franja está montada siempre
en el tablero, así que también se entera de un paso a gracia a mitad de sesión
(eso no da 402). **Ni la franja ni la pantalla de bloqueo muestran un monto, ni
el motivo** (desde la revisión: el de la operadora es texto libre) —se ven en
Vender, delante de proveedores—: a la dueña le ofrecen «Ver
suscripción», que muestra la plata tras un clic (en la franja abre
Configuración → Suscripción; en `BloqueoCuenta`, la misma vista dentro de la
pantalla, que no tiene router). Y un 402 ya no pisa el motivo de verdad con el
texto genérico «en caliente» si el estado es el mismo (titilaba con cada 402 de
la sincronización).

Pruebas: `tests/test_cobranza_escalera.py` (20, con `time_machine`: cada tramo,
el día del vencimiento a las 11:30 p. m. de Colombia, el servicio que despierta
20 días tarde, la prórroga, el estado de una persona intocable, el pago que
vuelve a activo, nunca suspendido, manual/sin suscripción/archivado nunca se
mueve, el ensayo no escribe ni manda, la línea del log con «0 cambios», correos
sólo a dueñas y facturación, dos pasadas a la vez con una barrera, reintento de
un correo caído, la consola, la dueña suspendida, su gente con 403 y sin motivo,
la frontera de las exenciones). Cada una vista caer con una mutación.
`probar-suspension.mjs` ganó 9 guardas de pantalla (las rutas exentas son las
que pide el navegador, la consulta en vivo, «Reintentar», cero montos en la
franja y el bloqueo, la plata tras un clic y sólo para la dueña).

**Pendiente**: la factura electrónica y la pasarela siguen fuera, por decisión de
la dueña; la política de datos todavía no declara el correo de facturación ni la
finalidad «cobro del servicio» (borrador para el abogado en
`docs/legal/borradores/`, antes de prender el interruptor). La revisión corrió las
suites de cobranza contra un Postgres 16 descartable (ver *Cobro de la suscripción
(2026-10-13)*).

### Compliance: Ley 1581, consentimiento y hardening (Fase 3 comercial)

**Tablas nuevas (registro, `create_all()`, sin migraciones):** `consentimientos`
(usuario, versión, fecha, IP, origen; `UNIQUE(usuario_id, version)`),
`solicitudes_supresion`, `export_attempts`. **En la base de cada cliente:**
`space_faces` (designación explícita de la cara del mueble).

**Reglas duras nuevas:**
- `VERSION_POLITICA = "2026-09-v2"` (`models/consentimiento.py`, subida en Fase
  7 Parte C) — debe coincidir con el encabezado de `docs/legal/politica-datos.md`,
  y `frontend/src/legal/politica-datos.md` es copia byte a byte (test lo fija).
  El historial de versiones vive en §11 de la política ("Vigencia y
  versionado"), no en §10.
- El alta exige `acepta_politica=true` → 422 antes de cualquier escritura.
  `/oauth` devuelve 428 `consentimiento_requerido` solo cuando el canje crearía
  membresía NUEVA; usuario existente recibe `pedir_consentimiento: true`
  top-level (el JWT NO cambia de forma). `POST /auth/aceptar-politica` → 204
  idempotente. Login legado intocado.
- **Owner-only** (export, supresión) = `sub` + membresía activa `rol=="owner"`
  leída del registro; el rol del token NO alcanza. Legado → 403 por
  construcción.
- `GET /api/clientes/mi-export` (3/hora → 429) excluye SIEMPRE bitácora,
  hashes, tablas de intentos y `estados_cliente` — por construcción.
  `POST /solicitar-supresion` → nada se borra nunca; atiende el operador en
  `/api/plataforma/supresiones` con nota obligatoria.
- **Ponerse al día tampoco se corta** (C2): la suscripción de la dueña
  (`/api/clientes/mi-suscripcion`) y el estado en vivo (`/api/auth/estado-cuenta`)
  están exentos del 402, en `_EXENTOS_PARA_PONERSE_AL_DIA`. Nada de negocio.
- **Los derechos del titular NO se cortan por estado de cuenta**: export,
  solicitud de supresión y aceptar-politica están exentos del 402 (incluso en
  suspendido) — el interruptor de cobranza no puede bloquear el habeas data.
- **Cara del mueble = designación explícita** (`uso=cara` → `space_faces`),
  nunca heurística de recencia; sin designación no hay cara para worker ni 3D
  (fail closed). Borrar el archivo borra la designación.
- CSP con los hosts medidos de Firebase (identitytoolkit/securetoken en
  connect-src, apis.google.com en script-src, *.firebaseapp.com en frame-src);
  única concesión `'unsafe-inline'` en style-src. Verificada en navegador
  headless: login completo, cero violaciones. HSTS mira también
  `x-forwarded-proto` (Render). Cabeceras en TODA respuesta, errores incluidos.
- Página pública `/politica-datos` sin login. CI de dependencias en
  `.github/workflows/deps-audit.yml` (falla solo HIGH/CRITICAL).

**Pendientes de la fase:** m-5 imagen con prefijo `montaje--` baja para worker
sin bitácora (xfail strict); m-6 el 404 al worker no se anota (xfail strict);
m-7 tarea operativa post-deploy: re-designar la cara de los espacios
existentes; la política y la guía RNBD son **BORRADOR** con `[COMPLETAR]` /
`[VALIDAR CON ABOGADO]` — no publicar sin abogado.

### Fase 4 — Consola de plataforma

El dueño del SaaS opera y entiende su negocio desde una superficie propia.

- **Ruta `/plataforma`**, página completa fuera del layout de cliente (sin
  Topbar de sede) — el modal `PlataformaPanel` murió, su contenido (estados
  + supresiones) se mudó a la página. Un operador sin membresías aterriza
  ahí directo tras el login con Google; uno con membresías llega por el
  botón del Topbar, que ahora navega en vez de abrir modal.
- **`GET /api/plataforma/metricas`**: consolidado + por cliente con los
  agregados **taxativos** de la spec (sedes con plano, espacios
  comercializables, % de ocupación, canon promedio mensual, ingreso
  contratado del mes, top 5 proveedores por nombre + conteo de contratos,
  usuarios con cuenta y fecha del último acceso, estado de cuenta). Cache de
  5 min **en memoria del proceso**. Tabla **nueva** del registro
  `bitacora_plataforma` (sin migración, mismo patrón que las tablas de la
  Fase 3): cada consulta de métricas anota el email del operador, cuándo y
  qué período — hit de cache incluido. Las bases de cliente se abren
  **read-only y en secuencia**, tolerantes a fallos (patrón de
  `_run_lease_maintenance`: una base rota marca error en su fila, el resto
  del panel sigue). **Nombre de proveedor saneado**: `top_proveedores` no
  devuelve `Supplier.name` verbatim — se depura de correos y teléfonos (se
  enmascaran) antes de entrar al JSON, para que el campo de texto libre que
  carga el supermercado no filtre un dato de contacto de un tercero.
- **Enmienda de la regla del operador, RE-ENMENDADA en Fase 7 y AMPLIADA en
  Fase 8** (ver la nota en "Clientes comerciales" arriba): el operador ve los
  **agregados EXACTOS de todos los clientes, sin umbral** — con un contrato
  activo, el ingreso del mes es ese contrato y así se publica — **y, desde la
  Fase 8, también el DETALLE DE NEGOCIO de cada cliente**: espacios (código,
  tipo, estado en el período), contratos (proveedor saneado, marca, canon
  mensual, fechas) y proveedores, más el resumen por tipo, los movimientos de
  12 meses y las oportunidades y recomendaciones que se derivan de todo eso.
  Ese detalle es **de un cliente por vez, solo lectura, con bitácora
  (`accion="detalle"`) y declarado en la política (§5.3 (a)) y en el catálogo
  del reporte de transparencia** (`endpoints: ["detalle"]`), de modo que el
  cliente ve en su propio reporte qué se lee de él y quién lo leyó. El detalle
  abre la base del cliente pedido; la ÚNICA lectura de otras bases es
  `benchmark_por_tipo`, que recorre los mismos clientes que `/metricas` y
  devuelve un promedio de canon por tipo de espacio — un número, sin slugs,
  conteos ni nombres —; `test_auditoria_frontera.py::f01` y
  `test_detalle_ataques.py::d10/d11` fijan que eso es todo lo que cruza. Hasta la
  Fase 6 los agregados se protegían con una supresión de celda chica (K=3: por
  debajo de 3 contratos activos, el dato salía `null`); el dueño de la
  plataforma decidió cambiar el trato en vez de parcharlo (la auditoría
  integral encontró que la regla era porosa, `frontera-5`, resuelto abajo). La
  contrapartida sigue siendo el **reporte de transparencia** (Fase 7, más
  abajo). **Lo que sigue intacto, y es la frontera que no se movió**: datos de
  contacto de proveedores (`contact_name`, `phone`, `email`) y sus notas;
  notas de espacios y de contratos; fotos y archivos (`SpaceFile`,
  `LeaseFile`); cualquier correo, nombre o id de un **usuario** final; la
  **tarifa de referencia** (sólo `tarifa_configurada` sí/no y el spread); y la
  **escritura** — ningún endpoint de plataforma modifica el negocio de un
  cliente. El JSON de `/metricas` sigue sin llevar filas: el detalle vive
  SÓLO en `/clientes/{slug}/detalle`. Un cliente suspendido también aparece en
  métricas (el operador necesita ver el negocio completo).
- **Token de operador sin membresías**: `cliente="plataforma"` (slug
  reservado en el alta — ningún cliente real puede llamarse así). Solo
  resuelve bajo `/api/plataforma/*`; en cualquier otro path da 401 **por
  construcción** (no es una lista de excepciones, es que `cliente_del_pedido`
  no sabe abrir ninguna base de negocio para ese slug).
- SIN MIGRACIONES, login legado y JWT intocados; rutas literales
  (`/metricas`) antes de paramétricas.

**Pendientes conocidos de la fase:**

- El cache de métricas es **por proceso**: con más de un worker de uvicorn
  habría un cálculo por proceso (hoy Render corre uno).
- La época del token plataforma se valida contra la base **por defecto**
  (que también es la de GALERIAS): cambiar la clave del rol `worker` de
  GALERIAS invalida tokens de operador vigentes. Revalidan con Google en un
  click; se aceptó a cambio de no debilitar la revocación.
- `ultimo_acceso` sale de `ultimo_login`, que solo se actualiza en
  `/oauth`: cuentas que solo usan el login legado no mueven esa fecha.
- **H-5, aceptado a conciencia** (`test_m33_…` en `test_metricas_ataques.py`):
  como consecuencia directa del punto anterior, **el admin del cliente que
  vive en la base por defecto puede cerrarle la sesión al operador de la
  plataforma** sin ser operador ni saber que lo hizo — le basta con cambiar
  la contraseña de `worker` de su propio cliente. Efecto máximo: un
  re-login del operador con Google. Se documentó y se aceptó en vez de
  quitarle la validación de época al token (que sería debilitar la
  revocación) o darle una época propia en el registro (clave nueva, regla
  nueva, para ahorrar un re-login ocasional).
- **M-1 / H-6, mayor, queda para la fase siguiente** (`test_m34_…` en
  `test_metricas_ataques.py`, sirve de recordatorio — no está marcado
  `xfail` porque hoy documenta la conducta aceptada, no una promesa
  incumplida): el cache de métricas de 5 min **no se invalida** cuando el
  operador cambia el `estado_cuenta` de un cliente con `PATCH`
  (`invalidar_cache_estado` limpia el cache de `plataforma_estado`, pero no
  llama a `limpiar_cache_metricas()`). Durante hasta 5 minutos el panel de
  métricas puede seguir mostrando `estado_cuenta: "activo"` de un cliente
  que el propio operador acaba de suspender en la misma pantalla. No es un
  problema de privacidad (no hay dato personal de por medio), es de
  confianza en el tablero. El arreglo (llamar `limpiar_cache_metricas()`
  desde el `PATCH` de estado) queda para la fase siguiente.
- La Política de Tratamiento de Datos ganó un punto (5.3) declarando estas
  métricas, marcado `[VALIDAR CON ABOGADO]`. **`VERSION_POLITICA` NO se
  subió en esta fase**: no por regla general, sino porque la condición que
  el propio red team fijó para eso —que los agregados no permitan
  reconstruir un valor individual (H-2) ni filtrar un dato de contacto de un
  tercero (H-1)— quedó satisfecha por la regla de los 3 contratos y el saneo
  de nombre de proveedor descritos arriba. **Superado en Fase 7**: al quitar
  la regla de los 3 contratos el trato cambia de forma material, y
  `VERSION_POLITICA` sube a `"2026-09-v2"` (ver la sección Fase 7 más abajo).

### Fase 5 — Tendencia temporal (histórico de métricas)

La Fase 4 dejó una **foto**; ésta agrega la **película**. El motivo es que un mes
pasado ya no se puede recorrer: la base de un cliente guarda los contratos como
están HOY, no como estaban en agosto, así que preguntarle por un mes viejo
devuelve la verdad de hoy proyectada hacia atrás. Sin historia persistida,
"¿estamos mejorando o empeorando?" es incontestable.

- **Tabla nueva del registro `snapshot_metricas`** (`create_all()`, SIN
  migración; cero columnas agregadas a tablas existentes, `bitacora_plataforma`
  incluida). `UNIQUE(cliente_slug, periodo)`. Una fila por cliente y mes, más la
  fila del total con `cliente_slug = "__consolidado__"` (constante
  `CONSOLIDADO_SLUG`; los guiones bajos la dejan fuera de `SLUG_VALIDO`, así que
  ningún cliente real puede colisionar). Guarda **CRUDOS**: `sedes_con_plano`,
  `espacios_comercializables`, `ocupadas`, `contratos_activos`, `canon_total`,
  `usuarios` (un CONTEO — **ningún id, correo ni nombre baja a disco**;
  la deduplicación de la misma persona con cuenta en dos supermercados se
  resuelve en memoria al capturar), `proveedores_json` (`{nombre_SANEADO:
  conteo}`, top-5 elegido con el nombre original y saneado al bajar — ver
  Auditoría integral), `clientes_incluidos`, `clientes_con_error`,
  `origen` (`"vista"` | `"cierre"`) y `capturado_en`.
- **El saneo del nombre del proveedor se aplica al ESCRIBIR (y también al
  leer, idempotente)**, no al guardar los números
  (`plataforma_tendencia.publicar_fila` reusa `_pct`, `_plata` y `_top` de
  `plataforma_metricas` — cero fórmulas duplicadas). Así la regla vive en un
  solo lugar. Hasta la Fase 6 este mismo camino aplicaba además la supresión
  de celda chica (K=3) AL LEER; la Fase 7 la quitó — el histórico entero
  publica ahora el número exacto sin tocar una fila persistida.
  **`contratos_activos` y `ocupadas` nunca salen** al JSON: son crudos de
  negocio (numerador y denominador de la ocupación), no algo que la spec deje
  cruzar la frontera del operador — eso no cambió con Fase 7.
- **Poblado híbrido, sin job nuevo**:
  - *Write-through*: `calcular(anio_mes, origen="vista")` hace el upsert justo
    antes del `return`. Va colgado del **cálculo** y no del endpoint, porque un
    acierto del cache de 5 min no recalcula nada ni trae los crudos. Si la
    persistencia falla, `/metricas` responde igual (log y no propaga).
  - *Cierre automático*: `cerrar_mes_anterior()` al **final** de
    `_run_lease_maintenance` (ciclo de 12 h), DESPUÉS del recorrido por
    clientes. Es tarea de la plataforma y no de cada supermercado (se hace una
    vez por corrida). Si al mes ya cerrado le falta la fila consolidada o la de
    algún cliente del registro, llama a `calcular(mes, origen="cierre")`; si no
    falta nada, no hace nada. **Va al final y no al principio a propósito**:
    cuando falta una fila recorre todas las bases, y hacerlo antes de
    vencimientos y recordatorios retrasaba ese barrido varios segundos en cada
    arranque (Render reinicia seguido) y volvía intermitentes los tests de
    `test_recordatorios.py`, que comparten el hilo de mantenimiento con el
    fixture `client`.
  - **El apagado ESPERA al hilo de mantenimiento** (`lifespan`, tope 30 s).
    Cancelar la tarea asyncio cortaba el `await`, no el hilo: el hilo seguía
    vivo después del shutdown y, en los tests (misma memoria, `DATABASE_URL`
    ya apuntando al archivo del test siguiente), terminaba escribiendo el
    snapshot en la base de OTRO test — `ERROR` intermitentes en el setup del
    siguiente. La vuelta en curso se guarda en `_mantenimiento_en_vuelo` y el
    shutdown la `await`ea; el hilo mira `_stop_mantenimiento` entre clientes y
    antes del cierre mensual, así que normalmente termina en milisegundos.
  - **Regla del congelado**: el mes EN CURSO se sobreescribe siempre (converge);
    un mes PASADO se inserta sólo si falta, FILA POR CLIENTE — eso nunca cambia.
    Un cliente con la base rota **no recibe fila** — un hueco es la verdad, un
    cero sería una mentira congelada.
  - **Excepción del congelado, sólo para la fila `__consolidado__`**: si una
    captura de un mes YA PASADO inserta al menos una fila por cliente que
    faltaba (un cliente nuevo con historia retroactiva, o una base que estuvo
    rota durante el cierre y ahora se pudo leer), la consolidada de ESE período
    se **reconstruye** a partir de TODAS las filas por cliente ya persistidas
    (no sólo las de esta captura), en la misma transacción del upsert —
    `persistir_snapshots` en `app/plataforma_tendencia.py`. El total nunca
    puede contradecir a sus sumandos, ni siquiera congelado. El ponderado (Σ/Σ)
    de la reconstrucción usa el mismo helper compartido que arma el
    consolidado la primera vez: `consolidar_crudos` en
    `app/plataforma_metricas.py`. La reconstrucción suma SIEMPRE desde disco
    para los clientes con fila previa y sólo toma de memoria los slugs recién
    insertados en esta captura (BUG-1, iteración 3 — auditoría integral,
    bugs-1: usar los crudos de HOY para un mes pasado contradecía a las filas
    congeladas): exacta para ingreso/ocupación/contratos/sedes; **aproximada
    para usuarios y proveedores** en las filas que vienen de disco (conteo sin
    ids, top-5 sin conteo completo). Limitación conocida, aceptada.
- **`GET /api/plataforma/tendencia?cliente=<slug|__consolidado__>&meses=N`**
  (default consolidado / 12, máx 24). `require_operador`, ruta **literal
  declarada justo después de `/metricas`** y antes de `/supresiones/{id}` y
  `/clientes/{slug}`. **No abre ninguna base de cliente**: lee sólo el registro.
  Sin cache (son N filas de una tabla indexada). `meses` fuera de rango → 422;
  slug inexistente → 404 con texto FIJO ("No hay un cliente con ese código.").
  La serie trae **siempre N meses consecutivos** terminando en el mes en curso
  (UTC), del más viejo al más nuevo: un mes sin fila sale con `sin_dato: true` y
  todo en `null` en vez de omitirse (un hueco callado en un gráfico de línea se
  lee como una caída), y el mes en curso va marcado `parcial: true`.
- **Consolidado ponderado (Σ/Σ)**: la fila guarda SUMAS, nunca promedios, y el
  canon promedio y la ocupación se derivan al leer. Guardar el promedio ya
  calculado dejaría sin sumandos y la única cuenta posible pasaría a ser el
  promedio de promedios — la equivocada (la lección de vitrinas).
- **Bitácora**: cada consulta anota `accion="tendencia"` en
  `bitacora_plataforma`, con el alcance completo como QUÉ de la línea
  (`periodo = "<cliente>:<desde>..<hasta>"`, p. ej.
  `"__consolidado__:2025-10..2026-09"`) — lo consultado acá es un rango, no un mes.
- Login legado, redacción por rol y JWT intocados.

**Pendientes conocidos de la fase:**

- **Un cliente con la base rota deja el cierre "incompleto" para siempre**:
  `cerrar_mes_anterior()` compara contra `ClienteRow`, así que mientras a ese
  cliente le falte la fila del mes anterior, cada corrida del ciclo (12 h)
  vuelve a recorrer todas las bases. Es idempotente y barato en la escala
  actual, pero es trabajo repetido: la alternativa (anotar "este mes ya se
  intentó") pedía una tabla o una columna más.
- ~~El primer mes de vida de un cliente puede quedar con el consolidado
  incompleto~~ — **arreglado**: si el ciclo cierra el mes anterior antes de que
  un cliente nuevo exista (o antes de que su base se pudiera leer) y después
  aparece su fila, el consolidado de ese mes **se recompone** en vez de quedar
  congelado sin él (ver "Excepción del congelado" arriba). Test
  `test_BUG_consolidado_congelado_no_incluye_al_cliente_que_llego_despues` en
  `backend/tests/test_tendencia_conciliacion.py` (ya no `xfail`).
- El histórico **no se rellena hacia atrás**: la serie arranca vacía y se llena
  mes a mes desde el despliegue. Un backfill sería inventar datos.

### Fase 6 — Asesoría

Cierra el roadmap de asesoría de la consola con las dos lecturas que faltaban
para que una sesión tenga algo concreto que recomendar: **oportunidad de
precio** (spread canon vs tarifa de referencia) y **cohortes de adopción**
(cuentas fantasma). Backend y frontend completos en esta fase.

**Spread (oportunidad de precio).** `spread_pct = (Σ canon_con_tarifa / Σ
tarifa_aplicable − 1) × 100`, por cliente y consolidado, con un helper propio
`_spread` (`null` sólo por ausencia de dato: sin contratos con tarifa
aplicable, o sin tarifa acumulada positiva — ver Fase 7, que le quitó el
umbral K=3 que aplicaba hasta la Fase 6). **La tarifa NUNCA sale de la base
del cliente**: ni su valor, ni su suma, ni un promedio — sólo la relación.

- **Dónde vive**: `backend/app/plataforma_metricas.py`. `_numeros_del_layout`
  gana un tercer valor de retorno, `mapa_tipos` (`codigo_completo -> (SEDE,
  tipo)`), armado en la MISMA pasada que ya abre el plano para
  `_caras_comercializables` — no se abre una segunda vez por contrato.
  `_tarifas_limpias(db)` lee `reference_rates_raw` (de `routers/layout.py`) y
  aplica la MISMA regla de `_clean_rates` (sólo números > 0); import local,
  misma sesión del cliente que ya está abierta. `_tarifa_aplicable` resuelve
  sede-o-default por contrato. Los cinco crudos nuevos
  (`canon_con_tarifa`, `tarifa_total`, `contratos_con_tarifa`,
  `contratos_sin_tarifa`, `tarifa_configurada`) se calculan en
  `_metricas_de_un_cliente` y NUNCA entran a `publicas_desde_crudos` —esa
  función la reusa la tendencia (Fase 5), que reconstruye crudos desde disco
  sin estas claves y tiraría `KeyError`—; los tres campos públicos por
  cliente (`spread_pct`, `tarifa_configurada`, `contratos_sin_tarifa`) se
  agregan DESPUÉS, en `_metricas_de_un_cliente`, igual que `ultimo_acceso`.
  El consolidado (`spread_pct`, `clientes_con_tarifa`) se calcula en
  `_consolidar` —sólo `/metricas`—, nunca en `consolidar_agregado` ni
  `consolidar_crudos`, por la misma razón de la tendencia.
- **Decisión de privacidad**: contrato cuyo espacio no está en el mapa (código
  fuera del plano) o cuyo tipo no tiene tarifa aplicable (ni por sede ni
  default) → cuenta en `contratos_sin_tarifa` y queda fuera del spread. Sin
  ninguna tarifa configurada → `spread_pct: null`, `tarifa_configurada:
  false`, `contratos_sin_tarifa` = todos los activos del período (es el
  estado inicial más común). Consolidado ponderado (Σ canon_con_tarifa / Σ
  tarifa_total de los clientes LEGIBLES), nunca promedio de spreads —
  verificado a mano en `test_plataforma_spread.py` con un reparto asimétrico
  a propósito.
- **Caché**: el spread viaja en el mismo cuerpo de `/metricas`, mismo caché
  de 5 minutos, mismo `limpiar_cache_metricas()`.
- **Riesgo residual aceptado (documentado, no un bug), vigente tras Fase 7**:
  con n contratos con tarifa del mismo tipo y `contratos_sin_tarifa == 0`,
  alguien que conozca el ingreso publicado puede despejar la tarifa unitaria
  (`ingreso / (1 + spread/100) / n`), sea cual sea n. Hasta la Fase 6 esto se
  aceptaba EN LA FRONTERA de K=3 (con exactamente 3 contratos); sin umbral el
  residual ya no tiene frontera — se acepta para cualquier n, es la misma
  decisión de producto de Fase 7 (agregados exactos, contrapartida en el
  reporte de transparencia), no un descuido de esta fase.
- **Pendiente, fuera de alcance**: histórico del spread. `snapshot_metricas`
  no puede ganar columnas (SIN MIGRACIONES) y una tabla nueva sólo para esto
  no se justifica todavía.

**Adopción (cohortes).** Todo sale del REGISTRO —nunca de una base de
cliente nueva—: `ClienteRow`, `EstadoCliente`, `Membresia` + `Usuario.
ultimo_login`, `Fundacion.creado_en`, más `contratos_activos_por_cliente`
(parte B, abajo). Ningún correo, nombre ni id de usuario sale al JSON; las
fechas van sin hora.

- **Dónde vive**: `backend/app/plataforma_adopcion.py`, función
  `calcular_adopcion()`. La clasificación se calcula UNA vez, en este orden:
  `sin_cuentas` (cero membresías activas) → `nueva` (alta hace menos de 30
  días) → `activa` (algún acceso en 30 días) → `fantasma` (contratos activos
  y sin acceso reciente — la señal que la asesoría busca) → `dormida` (nada
  de lo anterior). Cohorte = mes de `Fundacion.creado_en` más antigua del
  slug, o `ClienteRow.creado` si no hay fundación, o `null` si ninguna de las
  dos existe. Un slug ausente de `contratos_activos_por_cliente` (base rota
  este período) sale con `con_contratos_activos: false` y
  `error: ERROR_BASE_ILEGIBLE`; el resto de la fila (puro registro) se
  calcula igual.
- **Gotcha real, ya corregido**: `datetime` es subclase de `date` en Python
  —`isinstance(alta, date)` da `True` para las dos—, así que reducir
  `ClienteRow.creado` (un `datetime`) a día exige preguntar por `datetime`
  explícitamente; la pregunta al revés deja pasar el `datetime` intacto y la
  resta contra un `date` revienta con `TypeError` en el primer cliente sin
  `Fundacion` (típicamente `galerias`).
- **Router**: `GET /api/plataforma/adopcion`, sin parámetros, declarado
  INMEDIATAMENTE después de `/tendencia` y antes de `/supresiones/{id}` y
  `/clientes/{slug}` (orden literal-antes-de-paramétrica). Bitácora SIEMPRE,
  `accion="adopcion"`, después de calcular.

**Conteo de contratos para adopción, sin abrir bases nuevas (parte B).** El
cuerpo de `calcular()` se partió: `_calcular(anio_mes, origen) -> (cuerpo,
{slug: nº contratos activos | None})` hace el recorrido real y devuelve el
conteo de contratos activos por cliente como segundo valor (de uso INTERNO,
nunca al JSON) — `None` para una base que se intentó leer y no se pudo, y el
slug AUSENTE para un cliente que nació después de ese cálculo (así la
adopción no confunde un alta reciente con una base rota); `calcular()` queda como wrapper de siempre, con la misma
firma que ya usaba `cerrar_mes_anterior`. `metricas_del_periodo` llama a
`_calcular` y llena, además del caché de siempre (`_cache`, sin cambiar su
forma), un `_cache_contratos[anio_mes]` con el mismo TTL de 5 minutos.
`contratos_activos_por_cliente(anio_mes)` sirve del caché si está fresco, o
dispara `metricas_del_periodo` (que lo llena) si no. `limpiar_cache_metricas()`
limpia los dos cachés.

**Decisión de privacidad del spread (vinculante, cierra la pendiente de Fase
4; enmendada por Fase 7).** La tarifa de referencia es estrategia comercial
del cliente y NUNCA cruza la frontera del operador: ni su valor, ni Σ tarifa,
ni un promedio, ni por sede. Sólo viaja la relación `spread_pct`. Lista
taxativa de campos nuevos en `/metricas`: por cliente `spread_pct` (`null`
sólo por ausencia de dato: sin tarifa configurada o sin contratos con tarifa
aplicable), `tarifa_configurada`, `contratos_sin_tarifa`; consolidado
`spread_pct` y `clientes_con_tarifa`. Lista negra test-enforced: ninguna otra
clave con `tarifa`, `rates`, `by_sede`, `default`. **Fase 7 — el spread
consolidado vuelve a sumar a TODOS los legibles con tarifa**, igual que ya
hacía el ingreso consolidado: hasta la Fase 6 sumaba SÓLO a los clientes cuyo
propio spread se publicaba (≥ K contratos con tarifa) para que un cliente
suprimido no se despejara por diferencia (hallazgo H-1 de la fase,
`test_asesoria_ataques.py` a16/a17); sin supresión que proteger, esa
distinción con el ingreso consolidado desaparece — el total del negocio es
el dato en los dos casos. Riesgo aceptado (documentado, ya no acotado a K=3):
con n contratos con tarifa del mismo tipo, el ingreso publicado deja estimar
la tarifa unitaria (a18, medido); es la misma aceptación que ya rige el
canon promedio.

**Endpoint `GET /api/plataforma/adopcion`.** Sin parámetros (siempre el mes
en curso UTC). `require_operador`: sin token 401, admin legado 403, dueño de
cliente 403, operador 200. Bitácora siempre, `accion="adopcion"`,
`periodo=<YYYY-MM>`. Responde `{ periodo, generado_en, cohortes: [...],
clientes: [...] }`; el frontend ordena los `fantasma` primero. No abre ninguna
base de cliente que `/metricas` no abra ya. La ventana "activo" es de 30 días
INCLUSIVE (`<= DIAS_RECIENTE`: el día 30 exacto cuenta — hallazgo H-4,
`test_asesoria_contador.py` 10e).

**Frontend (`/plataforma`).** Columna "vs tarifa" en la tabla de clientes con
dos estados (`−12,4 %` / `+3,1 %`; `sin tarifa`) — hasta Fase 6 había un
tercero, `Suprimido ‹3`, que la Fase 7 eliminó; tile en el
hero "VS TARIFA DE REFERENCIA" con la lectura en palabras; panel "Adopción"
debajo de "Tendencia" con tabla de cohortes (mes, clientes, retención 30d,
desglose por badge) y lista "A quién llamar hoy". `components/plataforma/
adopcion.tsx`; primitivas de `consola.tsx`, tokens `--con-*`, claro y oscuro,
sin librerías nuevas, bajo la CSP de Fase 3.

### Auditoría integral (post Fase 6)

Auditoría adversarial del sistema completo (spec en `features/auditoria/spec.md`,
entregables en `features/auditoria/outputs/`), sobre seis dimensiones: ingreso
al sistema, aislamiento multi-tenant y base de datos, frontera del operador,
OWASP/hardening, bugs de las Fases 4–6 y compliance/privacidad. Cinco auditores,
24 hallazgos con reproducción (cada uno con un test en
`tests/test_auditoria_<dimension>.py`, estilo `test_*_ataques.py`), 11
arreglados en la misma rama con el `xfail` convertido en test verde. La
frontera multi-tenant, la verificación de Firebase y los derechos del titular
aguantaron todo sin un solo cruce: lo que se encontró fue de segundo orden.

**Qué se arregló**

- **Uploads con tope de streaming** (`app/services/subidas.py::leer_con_tope`):
  `files.py`, `mounts.py`, `catalogo.py` y `planograms.py` leían el archivo
  ENTERO en RAM antes de comparar contra su límite (con `--workers 1`, un
  archivo de GB tumba el único proceso). Ahora se lee de a 64 KiB y se corta
  apenas se pasa; códigos y textos de respuesta no cambiaron. `montaje.py`
  hereda el arreglo porque delega en `mounts.registrar_montaje`.
- **Tope de tamaño de cuerpo para toda la app, antes de cualquier auth**
  (`subidas.py::LimiteDeCuerpo`, middleware ASGI puro registrado en `main.py`):
  2 MiB para JSON y todo lo que no sea multipart, 12 MiB para
  `multipart/form-data` (el tope propio de cada endpoint lo sigue aplicando el
  helper). `Content-Length` sirve para rechazar de entrada, nunca para
  permitir: decide el conteo real. Responde 413 JSON con las cabeceras de
  seguridad. No es `@app.middleware("http")` a propósito: `BaseHTTPMiddleware`
  no puede intervenir el `receive`. El tope JSON de 2 MiB es un juicio (los
  layouts por sede pesan cientos de KB), vive en `subidas.py::TOPE_JSON`.
- **El `Bearer basura` ya no delata el estado de cuenta** (ingresos-1). Con un
  solo cliente en la instalación, la rama `unico()` de `cliente_del_pedido`
  aplicaba `_aplicar_estado` ante CUALQUIER texto en el header o en `?token=`,
  y el 402 salía antes del 401. Ahora hay `auth.token_verifica()` y la rama
  exige que la credencial verifique (firma y `exp`): sin credencial → 401;
  credencial que no verifica → 401; token nuestro válido (incluso legado sin
  claim `cliente`) → se aplica el estado de cuenta, 402 si corresponde.
- **Exenciones del interruptor con frontera de segmento** (ingresos-2):
  `clientes._path_bajo` (igualdad o prefijo + `/`) reemplaza `startswith` en
  `_EXENTOS_EN_SOLO_LECTURA`, `_EXENTOS_POR_HABEAS_DATA` y
  `_es_path_de_plataforma`. Un solo helper para las tres.
- **BUG-1, iteración 3** (bugs-1): la reconstrucción de la fila
  `__consolidado__` cuando una captura de un mes pasado inserta una fila que
  faltaba ya no usa los crudos de HOY para clientes con fila previa. Regla
  única en `_reconstruir_consolidado`: un cliente con fila persistida antes de
  esta captura se suma SIEMPRE desde su fila en disco; sólo los slugs recién
  insertados salen de memoria. Ingreso, ocupación, contratos y sedes del
  consolidado nunca contradicen a sus sumandos.
- **El nombre del proveedor baja SANEADO a `snapshot_metricas`**
  (compliance-1 = frontera-2). `_recortar_top` elige el top-5 con el nombre
  original y persiste `{sanear_nombre_proveedor(nombre): conteo}`, sumando
  conteos si dos originales sanean igual. Los NÚMEROS siguen crudos y se
  vuelven públicos y exactos al leer (Fase 7, sin umbral); el NOMBRE se
  protege al escribir (y el saneo es idempotente, así que leer sigue pasando
  por `_top`). Sin migración.
- **Saneo Unicode** (frontera-1): `sanear_nombre_proveedor` normaliza NFKC
  (`＠` → `@`, dígitos de ancho completo → ASCII), borra los caracteres de
  categoría `Cf` (ZWSP, ZWNJ, BOM, marcas de dirección) y `_TELEFONO_RE`
  acepta `/ _ · ,` como separadores.
- **Ventana de `periodo`** (frontera-3): `normalizar_periodo` acepta sólo
  `[actual − 24, actual + 12]` meses (`MESES_HISTORIA_MAXIMO`,
  `VENTANA_MESES_ADELANTE`); fuera de ahí, 422 con texto fijo. **Un mes futuro
  NO se persiste** (una proyección no es historia). `_cache` y
  `_cache_contratos` son LRU con `TOPE_CACHE_PERIODOS = 24`.
- **Purga del registro** (frontera-4 = ingresos-5):
  `plataforma_tendencia.purgar_registro()` borra `bitacora_plataforma` con más
  de `DIAS_QUE_SE_GUARDA` días (365, la misma constante que `audit_log`),
  `intentos_alta` con más de 24 h y las filas POR CLIENTE de
  `snapshot_metricas` anteriores a `actual − 36 meses`. **La fila
  `__consolidado__` no se purga nunca**: es la serie larga del negocio. Corre
  al final de `cerrar_mes_anterior()`, en su propio `try/except`, SIEMPRE.
- **Bitácora en las lecturas de PII** (frontera-6): `/supresiones` y
  `/clientes` ahora también anotan en `bitacora_plataforma`
  (`_anotar_consulta`), igual que `/metricas`, `/tendencia` y `/adopcion`.
- **Gate de `pip-audit` con CVSS real** (hardening-8): el script
  `.github/scripts/pip_audit_severity.py` hacía `float()` sobre un vector CVSS
  textual y nunca podía confirmar un HIGH/CRITICAL. Ahora calcula el score
  base v3.x desde el vector y tiene `--self-test`. Consecuencia: el gate falla
  con 9 HIGH confirmados hasta que se actualicen las dependencias (abajo).
- **Guardianes que mentían** (verif-1, verif-2): `test_t32` fallaba sobre un
  comentario por un `A or B and C` sin paréntesis — ahora mira sólo líneas
  del diff con `Content-Security-Policy`; `test_ingresos_16` afirmaba la
  ausencia de purga con grep y quedó verde diciendo algo falso — ahora fija la
  presencia por el objeto real.

**Qué queda abierto y por qué**

- **frontera-5 — RESUELTO por decisión de producto (Fase 7)**. Con un
  cliente que publicaba y otro suprimido por K=3, `ingreso_consolidado −
  ingreso_visible` devolvía al peso el canon del contrato único del
  suprimido — contradecía la regla "el consolidado sí suma a todos" (Fase 4,
  `test_m26`). En vez de parchear la regla (opciones consideradas: sumar
  sólo clientes publicables, o sumar a los suprimidos sólo si entre todos
  juntan ≥ K contratos), el dueño de la plataforma decidió **cambiar el
  trato**: el operador ve los agregados EXACTOS de todos los clientes, sin
  umbral — K=3 desaparece de `/metricas`, `/tendencia` y del spread. Ya no
  hay ninguna celda suprimida que el consolidado pueda despejar. La
  contrapartida es el reporte de transparencia (ver la sección "Fase 7 —
  Transparencia" más abajo). `test_f09` (`test_auditoria_frontera.py`) se
  eliminó con un comentario en su lugar; el helper que usaba no se
  reutiliza en ningún otro test de ese archivo.
- ~~Dependencias con DoS~~ — **cerrado en la misma rama**: `fastapi 0.115.0
  → 0.141.1` (arrastra `starlette 1.6.0`, que parchea CVE-2024-47874, y
  `pydantic 2.13.5`), `python-multipart 0.0.32`, `PyJWT 2.13.0`. `pip-audit`
  limpio. Dos consecuencias de la subida, ya absorbidas: (1) PyJWT ≥ 2.10
  exige que el claim `sub` sea TEXTO — `create_token` emite `str(id)` y
  `auth._sub_entero` lo vuelve entero al leer (`invalidar_cache_membresia`
  acepta las dos formas); (2) con Starlette 1.x `include_router` deja en
  `app.routes` un `_IncludedRouter` sin `path` ni `methods`, así que los
  tests que barrían rutas por atributos recorrían cero rutas y pasaban en
  verde sin comprobar nada — ahora usan `conftest.rutas_planas(app)` (aplana
  en orden de declaración) o el esquema OpenAPI. En el frontend `npm audit
  fix` cerró `browserslist` (HIGH); queda `vite ≤ 6.4.2` (HIGH, sólo servidor
  de desarrollo: path traversal en `.map` y `launch-editor` en Windows) porque
  el salto a Vite 8 es mayor y se hace aparte.
- **2026-10-03: PyJWT 2.15.1 y `@grpc/grpc-js` forzado a 1.14.5.** Con el mes
  nuevo, los checks de dependencias volvieron a correr y marcaron dos cosas que
  no venían de ningún cambio. Primero, 13 avisos sobre PyJWT 2.13.0, seis altos o
  críticos. Casi todos piden mezclar HMAC y RSA en una misma verificación, o usar
  `PyJWKClient`, y acá no pasa ninguna de las dos (HS256 para las sesiones, RS256
  para Firebase, cada uno por su lado); igual se subió a 2.15.1. Segundo,
  `@grpc/grpc-js` 1.9.16, que trae Firestore —viene dentro del paquete
  `firebase`— aunque la app sólo importa `firebase/app` y `firebase/auth` y grpc no
  llega al bundle. Hasta la última versión de Firestore lo fija en `~1.9.0`, así
  que se fuerza con `overrides` en `package.json`. Quedan avisos moderados en
  `react-router` y en `uuid` (vía `exceljs`), que el gate no cuenta.
- **Dockerfile sin `USER`** (hardening-9): no verificable contra el disco de
  datos de Render desde acá.
- **H-7 / H-8** (identidad) y **R-3 / R-4 / R-5** (alta self-service) siguen
  xfail; ingresos-4 (falla de infraestructura del alta disfrazada de "slug
  tomado") se suma a R-4.
- Documentados sin cambio: ingresos-3 (leeway sobre `exp`, medido,
  aceptable), hardening-2 (HSTS spoofeable, benigno por RFC 6797 §7.2),
  compliance-2 (validación en el ORM como defensa opcional), compliance-3
  (texto de la política: nombrar Brevo/SendGrid y el enlace con credencial de
  un solo uso en §9.1; completar §6 con 365 días).
- Decisiones de producto anotadas: zona horaria del negocio (`periodo_actual`
  en UTC), supresión de `ultimo_acceso` bajo K cuando hay un solo usuario,
  retención de logs de correo en Render.

### Fase 7 — Transparencia

El operador ve las cifras exactas y cada cliente puede auditar qué se tomó de
él. Decisión del dueño de la plataforma, 2026-09-05, en respuesta directa al
hallazgo `frontera-5` de la auditoría integral: en vez de parchear la regla
de los 3 contratos (K=3), se cambia el trato.

**Parte A — Quitar K=3 (backend, `plataforma_metricas.py` / `plataforma_tendencia.py`).**
`K_MINIMO_CONTRATOS` y `_suprimir_celda_chica` se eliminan del todo (y toda
llamada: `publicas_desde_crudos`, `consolidar_agregado`, `_consolidar`,
`plataforma_tendencia.publicar_fila`). Por cliente y consolidado:
`ingreso_contratado_mes` es SIEMPRE un número (`0.0` con 0 contratos);
`canon_promedio_mensual` es número con ≥1 contrato y `null` sólo con 0
contratos (no hay promedio de cero términos); `top_proveedores` es la lista
real saneada por `_top`, vacía sólo si no hay contratos con proveedor.
`_spread` conserva su firma (`None` si `contratos == 0` o `tarifa <= 0`, si
no `round((canon/tarifa - 1)*100, 1)`) pero sin el piso de K=3. El
consolidado del spread (`_consolidar`) vuelve a sumar a TODOS los clientes
legibles con tarifa — igual que ya hacía el ingreso consolidado — porque sin
supresión que proteger, excluir a los que antes se suprimían no tiene
sentido. En `/tendencia`: `publicar_fila` aplica las mismas reglas exactas;
`contratos_activos` y `ocupadas` siguen sin salir (son crudos de negocio, no
algo que la spec deje cruzar la frontera); nada cambia en snapshot (crudos,
saneo al escribir), caché, bitácora ni adopción. `grep -rn "K_MINIMO|
_suprimir_celda_chica" backend/app` da vacío. Los 9 archivos de test que
afirmaban la supresión (`test_plataforma_metricas`, `test_metricas_conciliacion`,
`test_metricas_ataques`, `test_plataforma_tendencia`, `test_tendencia_ataques`,
`test_tendencia_conciliacion`, `test_asesoria_ataques`, `test_asesoria_contador`,
`test_auditoria_frontera`) se reescribieron para afirmar el comportamiento
nuevo; `test_f09` (frontera-5) se eliminó con un comentario en su lugar.

**Parte B — Reporte de transparencia (`app/plataforma_reporte.py`, sin
migraciones).** La contrapartida de la Parte A: cada cliente puede pedir, a
demanda, cada dato que la plataforma tomó de él, cómo lo calculó, de dónde,
para qué, y quién del operador lo consultó y cuándo. El módulo declara un
`CATALOGO` TAXATIVO en código (no prosa suelta en el frontend) con, por cada
agregado de `/metricas` / `/tendencia` / `/adopcion`: nombre, definición
(fórmula en palabras), fuente (qué tablas), finalidad (`asesoria` /
`salud_cartera` / `cobranza`), endpoints que lo exponen y tratamiento
(`exacto` / `saneado` / `sin_hora` / `conteo` / `relacion`). El catálogo
también declara las cifras que SOLO el reporte publica en `valores[]`
(`ocupadas`, `contratos_activos`, `canon_total`, `origen`, `capturado_en`),
con `endpoints: ["reporte"]` — `"reporte"` es un valor válido de `endpoints`
en el shape (`endpoints:[metricas|tendencia|adopcion|reporte]`). Regla dura:
ninguna clave puede aparecer en `valores[]` sin una entrada en `CATALOGO`
(la fija `test_t62`). El reporte se
arma SOLO con lo que ya existe — `snapshot_metricas`, `bitacora_plataforma`,
`consentimientos`, `solicitudes_supresion` y, para el spread del mes en
curso, `_metricas_de_un_cliente` sobre la base de ESE cliente — sin filas de
contratos.

Endpoints:

- `GET /api/clientes/mi-reporte-plataforma?meses=N` — dueño del cliente
  (`require_owner`, como `/mi-export`), ruta literal en `routers/derechos.py`,
  exenta del interruptor de cobranza (`_EXENTOS_POR_HABEAS_DATA`). `meses` se
  valida primero (`1..MESES_MAXIMO`, si no 422) ANTES de cobrar el freno
  compartido con `/mi-export` — un pedido inválido nunca consume cupo de un
  derecho de habeas data. Ese freno (3/hora por usuario, tabla
  `export_attempts`) queda compartido con `/mi-export`: riesgo aceptado
  (L-3 de la revisión legal), decisión del Maestro de mantenerlo así sin
  migraciones. Un slug ajeno da 403/404 indistinguible.
- `GET /api/plataforma/clientes/{slug}/reporte?meses=N` — operador
  (`require_operador`), declarada DESPUÉS de las literales, anota
  `accion="reporte"` con `periodo="<slug>:<desde>..<hasta>"` en la bitácora
  (el reporte también es un acceso; el reporte siguiente del dueño lo lista).

Los dos devuelven el MISMO JSON:

```
{cliente:{slug,nombre}, generado_en, ventana:{desde,hasta,meses},
 politica:{version_vigente,version_aceptada|null,aceptada_en(fecha)|null,base_legal,url},
 catalogo:[{clave,nombre,definicion,fuente,finalidad:asesoria|salud_cartera|cobranza,
            endpoints:[...],tratamiento:exacto|saneado|sin_hora|conteo|relacion}],
 valores:[{periodo,sin_dato,origen,capturado_en(fecha),sedes_con_plano,
           espacios_comercializables,ocupadas,ocupacion_pct,contratos_activos,
           canon_total,canon_promedio_mensual,usuarios_con_cuenta,
           top_proveedores:[{nombre(saneado),contratos}]}],
 spread_actual:{periodo,tarifa_configurada,spread_pct,contratos_sin_tarifa}|null,
 accesos:{total,lineas:[{fecha,operador,accion,periodo}]},
 derechos:{export,supresion,reporte,contacto}}
```

Frontend: ruta `/reporte-plataforma` (dueño) y `/plataforma/reporte/:slug`
(operador), vista imprimible (`@media print`, sin cabecera de app), botón
"Descargar JSON", reusa `consola.tsx` y los tokens `--con-*`, claro/oscuro en
pantalla y siempre claro en impresión, sin librerías nuevas, bajo la CSP de
Fase 3. El tipo del item de `top_proveedores` en el reporte es
`ProveedorTopReporte {nombre, contratos}` — distinto de `ProveedorTop
{nombre, contratos_activos}` que ya usan `/metricas` y `/tendencia` (no
comparten shape ni nombre de campo de conteo).

**Parte C — Política y consentimiento.** `VERSION_POLITICA` sube a
`"2026-09-v2"` (`models/consentimiento.py`): es un cambio material del trato
(agregados exactos sin umbral, contrapartida del reporte), así que el flujo
existente de re-consentimiento (`consentimiento_requerido` al entrar,
`/aceptar-politica`) se dispara para todos los usuarios con cuenta; el legado
(claves compartidas) no se rompe. §5.3 de `docs/legal/politica-datos.md` (y
su copia byte-idéntica en `frontend/src/legal/`) se reescribe declarando el
trato nuevo con las frases `"agregados exactos"`, `"sin umbral"`, `"reporte
de transparencia"` y `"mi-reporte-plataforma"` (test-enforced,
`test_asesoria_ataques.py` a15), manteniendo los marcadores `[VALIDAR CON
ABOGADO]`. `/mi-export` y el reporte incluyen la versión de política
aceptada.

**Verificación de cierre (2026-09-05).** Sonda independiente sobre base
propia: cliente con 1 contrato de 4.173.919 y tarifa punta 5.000.000 →
`/metricas` publica ingreso 4173919.0, promedio 4173919.0, spread −16.5,
proveedor saneado; consolidado 7673919.0 = Σ de los tres clientes legibles;
`/tendencia` idéntico y `sin_dato: false`. Reporte del dueño: 22 entradas de
catálogo, 12 meses, cero rastros de otros clientes; del operador: mismo shape
y línea `accion="reporte"` en la bitácora que el reporte siguiente del dueño
lista. Re-consentimiento verificado de punta a punta; legado intacto. `tsc` y
`build` limpios. Capturas en `features/transparencia/outputs/capturas/`.

**Gotcha para quien agregue un GET con parámetro de ruta**:
`test_montaje_enlace.py::test_el_token_no_abre_ningun_otro_endpoint` barre el
OpenAPI entero con el token de montaje y necesita un valor para cada
parámetro en su diccionario `relleno`. `GET /api/plataforma/clientes/{slug}/
reporte` fue el primer GET con `{slug}` y lo rompió; `slug` ya está en el
diccionario. Un parámetro nuevo sin relleno hace fallar la suite entera a
propósito.

### Fase 8 — Detalle por cliente para asesoría

**La decisión del dueño (2026-09-05, encima de la Fase 7).** "La plataforma aún
no tiene toda la información disponible para hacer análisis: no sé qué proveedor
está en cada espacio adicional y a qué precio". El límite "el operador ve
agregados, nunca filas" era una decisión de diseño de la Fase 4, no una
limitación técnica: para el servicio de **asesoría comercial** que RECABRA le
vende a cada supermercado, el operador necesita ver el negocio **espacio por
espacio** y derivar de ahí qué proponerle hoy al cliente. Esta fase abre esa
vista, **solo lectura**, con bitácora, y la declara en la política y en el
reporte de transparencia **dentro de la misma versión de política**
(`2026-09-v2`, que todavía no se había desplegado) para que el cliente consienta
el trato completo **una sola vez**.

**El endpoint.** `GET /api/plataforma/clientes/{slug}/detalle?periodo=YYYY-MM`
(`require_operador`; por defecto el mes en curso, misma ventana que
`/metricas`; `app/plataforma_detalle.py`, ruta declarada AL FINAL de
`routers/plataforma.py`). Abre la base de ESE cliente **una vez**, sólo
`query`, y anota `accion="detalle"` con `periodo="<slug>:<YYYY-MM>"` en
`bitacora_plataforma` **después** de armar (un 401/403/404/422/503 no deja
línea). La única otra apertura de bases es `benchmark_por_tipo`: recorre los
mismos clientes que `_calcular` de métricas (secuencia, read-only, `try/except`
por cliente, caché 5 min con el mismo LRU acotado) y devuelve UN número por
tipo. Por eso `test_auditoria_frontera.py::f01` lista esta ruta entre las que
abren bases, junto a `/metricas`, `/tendencia`, `/adopcion` y `/reporte`.
`slug` inexistente → 404 con el texto fijo `"No hay un cliente con ese
código."`; dueño de cliente, legado y trabajador → 403; sin token → 401;
período fuera de ventana → 422; base ilegible → 503 con `ERROR_BASE_ILEGIBLE`
(la ruta del archivo va al log, nunca al JSON). Sin caché del detalle: cada
consulta se calcula y se anota. SIN MIGRACIONES: todo sale de
`layout_snapshots`, `spaces` (sólo `code`, `zone`, `area_m2`), `space_leases`
(sin `notes` ni ids), `suppliers.name` y `app_config` (sólo el sí/no de la
tarifa), con los helpers que ya existían (`_numeros_del_layout` y su mapa de
tipos, `_es_gondola_doble`, `_tarifa_aplicable`, `sanear_nombre_proveedor`,
`_huella`) más dos nuevos en `plataforma_metricas.py`: `_del_periodo` (la
regla "activo en el período", enunciada una sola vez) y
`_contratos_del_cliente`.

Shape (VINCULANTE, idéntico en backend y frontend):

```
{cliente:{slug,nombre,estado_cuenta}, periodo, desde, hasta, generado_en,
 sedes_con_plano,
 sedes:[{sede,espacios,ocupados,libres,ocupacion_pct}],
 espacios:[{codigo(SEDE-CODE, cara B con -B),sede,codigo_corto,cara:A|B|null,tipo,
            zona(SANEADA),area_m2,estado:ocupado|libre|se_libera,
            contrato:{proveedor(SANEADO),marca(SANEADA),canon_mensual,inicio,fin,
                      dias_para_vencer,arranca_en_periodo}|null}],
 contratos_fuera_del_plano: N,
 resumen_por_tipo:[{tipo,total,ocupados,libres,canon_promedio,canon_minimo,
                    canon_maximo,tarifa_configurada(sí/no)}],
 proveedores:[{nombre(SANEADO),espacios,tipos,sedes,canon_total,canon_promedio,
               participacion_pct(cuota de CONTRATOS, no de canon),desde,
               contratos_por_vencer_60d}],
 movimientos:[{mes,entradas:[{proveedor,codigo,tipo,canon_mensual,fecha,cancelado}],
                   salidas:[{proveedor,codigo,tipo,canon_mensual,fecha,
                             motivo:vencimiento|cancelacion}]}]  (12 meses),
 benchmark_plataforma:{<tipo>: UN promedio de todos los clientes legibles},
 oportunidades:[{codigo,sede,tipo,estado:libre|se_libera,precio_sugerido,
                 origen_precio:cliente|benchmark|null,valor_estimado_mensual,
                 candidatos:[{proveedor(SANEADO),canon_actual,mismo_tipo}]}],
 recomendaciones:[{id:"{tipo}:{clave}",
                   tipo:espacio_libre|contrato_por_vencer|precio_bajo_tarifa|
                        concentracion_proveedor|sede_subutilizada|sin_tarifa|arranque,
                   prioridad:alta|media|baja,valor_estimado_mensual,explicacion,datos}]}
```

**Las reglas de estado, oportunidad y recomendación.** "Contrato del período"
es `is_active AND start_date <= hasta AND end_date >= desde` (`_del_periodo`,
la MISMA regla de `_contratos_activos`); con varios contratos sobre un espacio
se publica el de fin más tardío. Un espacio está `ocupado` si tiene contrato
del período, `se_libera` si además `fin <= hasta`, `libre` si no tiene
ninguno; un contrato que arranca dentro del período cuenta como ocupado
(`arranca_en_periodo`). Un contrato cuyo código no está en el plano no es un
espacio pero sí es plata: cuenta en `contratos_fuera_del_plano`,
`proveedores`, `movimientos` y `contrato_por_vencer`, nunca en `espacios`,
`resumen_por_tipo` ni `oportunidades`. El **precio sugerido** de un espacio
libre o que se libera es el canon promedio que ESE cliente cobra por ese tipo
(`origen_precio: "cliente"`); si no cobra ninguno, el benchmark
(`"benchmark"`); si tampoco, `null`. Los **candidatos** son proveedores del
mismo cliente que no ocupan ese espacio, primero los del mismo tipo, por canon
actual desc, hasta 3. Las **recomendaciones** (`id="{tipo}:{clave}"`) se
ordenan por prioridad, valor desc e id: `espacio_libre` (una por TIPO, valor Σ
precio sugerido), `contrato_por_vencer` (≤ 60 días; ≤ 30 alta y nunca menos
que media), `precio_bajo_tarifa` (tipo con ≥ 2 contratos y alguno bajo el
promedio del PROPIO cliente — nunca contra la tarifa),
`concentracion_proveedor` (≥ 40 % de los contratos del período y ≥ 2
contratos; ≥ 60 % alta), `sede_subutilizada` (≥ 15 puntos bajo la ocupación
global, con ≥ 2 sedes), `sin_tarifa` (una, siempre baja, valor 0) y `arranque`
como ÚNICA con cero contratos del período. Prioridad general: alta desde el
15 % del ingreso contratado del mes, media desde el 5 %. La `explicacion` la
genera el backend por plantilla, sin PII: nombres saneados, códigos, tipos,
fechas y plata como `"$ 1.200.000"`.

**Verificación de cierre (2026-09-05).** Sonda independiente: cliente con 2
sedes, góndola doble, punta y nevera, 3 contratos del período (uno vence el 20,
uno arranca el 15) → 5/5 espacios con tipo, estado y contrato exactos; resumen
gondola 2/2/0 prom 800.000 (min 600.000, max 1.000.000), punta 2/1/1 prom
2.000.000, nevera 1/0/1 `null`; `SUR-PUN-01` sugerido 2.000.000 del cliente,
`NAVE-NEV-01` 400.000 de benchmark = (300.000+500.000)/2 del otro cliente; 7
recomendaciones en orden alta×4 (espacio_libre 4.000.000, contrato_por_vencer
2.000.000 a 19 días, sede_subutilizada 2.000.000, concentracion_proveedor
1.600.000 con 2 de 3 = 66,7 %), media×2, baja×1; 10/10 agujas de PII
ausentes, sólo `tarifa_configurada` como clave con "tarifa"; 401/403/403/404
sin línea de bitácora y exactamente una línea tras el 200, listada en el
reporte del dueño; conteos de filas idénticos antes y después. Capturas en
`features/asesoria-detalle/outputs/capturas/`.

**Pendientes conocidos de la fase:**

- **Benchmark con pocos aportantes**: `benchmark_plataforma` no tiene umbral
  de clientes aportantes por tipo; con dos clientes que tienen un tipo, cada
  uno puede despejar el canon del otro por diferencia. Decisión de producto
  pendiente, misma familia que `frontera-5` (el dueño ya eligió exactitud a
  cambio de transparencia en Fase 7; si se mantiene ese criterio, no hay nada
  que hacer).
- **`participacion_pct` es cuota de contratos**, no de canon: el catálogo y la
  política lo dicen así desde el cierre de Fase 8; si alguien lo cambia a
  canon, cambia también `concentracion_proveedor` y los dos documentos.

**El benchmark de plataforma** es **un número por tipo de espacio** — el canon
promedio de los contratos vigentes de ese tipo en todos los clientes legibles —,
con caché de 5 min como el de métricas, y jamás sale con desglose, sedes ni
nombres de otros supermercados. Es lo único del detalle que mira más de una
base.

**La frontera (lista taxativa de lo que el detalle NO devuelve):**
`Supplier.contact_name` / `phone` / `email` / `notes`; `Space.notes`;
`SpaceLease.notes`; `SpaceFile` / `LeaseFile` (fotos y documentos de montaje);
cualquier correo, nombre o id de un **usuario**; la **tarifa de referencia**
(sólo `tarifa_configurada` sí/no por tipo y el spread que ya existía); cualquier
dato de **otro cliente** dentro del detalle de uno (el benchmark es un promedio,
un número por tipo); ningún texto libre del cliente sin sanear (proveedor,
marca **y zona** pasan por `sanear_nombre_proveedor` — el auditor encontró la
zona sin sanear, `detalle-1`, corregida al cierre); y nada en **modo
escritura**.

**La política (misma versión, `2026-09-v2`).** §5.3 (a) suma el **detalle de
espacios y contratos** con las palabras de la spec (código y tipo del espacio,
ocupado o libre, proveedor por **nombre comercial** depurado, marca, canon,
fechas, resumen por tipo con la tarifa sólo como sí/no, proveedores,
movimientos, **oportunidades** y **recomendaciones**); §5.3 (b) perdió "ningún
contrato, ningún espacio" y quedó como la lista taxativa de arriba; §5.3 (c) y
(d) suman el detalle a los accesos del reporte y a la bitácora; §3.6 (nuevo)
declara las finalidades, con **"mejora del servicio y de la plataforma"**
agregada a asesoría / salud de la cartera / cobranza. `VERSION_POLITICA` **NO
sube**: la v2 no se había desplegado y el titular consiente el trato completo en
un solo acto (§11 lo deja escrito en el historial, bajo la fila de 2026-09-v2).
Un `[VALIDAR CON ABOGADO]` nuevo pregunta por el contrato individual con nombre
de proveedor y por el benchmark cruzado entre clientes. La copia de
`frontend/src/legal/politica-datos.md` sigue byte-idéntica (test-enforced).

**El catálogo del reporte** (`app/plataforma_reporte.py::CATALOGO`) pasa de 22 a
**34 entradas**: 12 nuevas con `endpoints: ["detalle"]` — `espacio_codigo_y_tipo`,
`espacio_estado`, `contrato_proveedor` (saneado), `contrato_marca`,
`contrato_canon_mensual`, `contrato_fechas`, `resumen_por_tipo`,
`proveedores_del_cliente` (saneado), `movimientos`, `benchmark_plataforma`,
`oportunidades` y `recomendaciones`. `"detalle"` es un valor válido más de
`endpoints` (junto a `metricas` / `tendencia` / `adopcion` / `reporte`). El enum
de `finalidad` NO cambia (`asesoria|salud_cartera|cobranza`, que es como lo tipa
el frontend): las 12 van con `asesoria`, y la finalidad nueva de la política vive
en el documento. `_accesos_del_cliente` gana la rama
`accion == "detalle"` → alcanza si `periodo` empieza con `"<slug>:"`, así que la
consulta del detalle aparece en el reporte de transparencia del titular.

**El frontend**: página `/plataforma/clientes/:slug` (operador) con
**Recomendaciones primero** (es "qué le propongo hoy"), luego Oportunidades,
Espacios (filtrable por sede, tipo y estado, con buscador), Por tipo,
Proveedores y Movimientos; botón **"Imprimir recomendaciones"** que reusa la
vista imprimible del reporte de Fase 7 (`@media print`); enlace **"Ver detalle"**
en cada fila de la tabla de `/plataforma` y enlace al reporte de transparencia
del cliente. Primitivas de `components/plataforma/consola.tsx`, tokens `--con-*`,
claro y oscuro, sin librerías nuevas, bajo la CSP.

**Gotcha heredado de la Fase 7** (vale también para este endpoint):
`test_montaje_enlace.py::test_el_token_no_abre_ningun_otro_endpoint` barre el
OpenAPI entero con el token de montaje y necesita un valor para cada parámetro
de ruta en su diccionario `relleno`. `slug` ya está ahí desde el cierre de la
Fase 7, así que `GET /api/plataforma/clientes/{slug}/detalle` queda barrido
solo; un parámetro de ruta NUEVO sin su relleno hace fallar la suite entera a
propósito.

### Fase 9 — Landing pública

**El problema (dueño, 2026-09-05).** Al abrir `retail-espacios.onrender.com`
lo único que había era el formulario de ingreso: nada decía qué es RECABRA,
para quién es ni por qué registrarse. La landing tiene que vender el sistema
y llevar al registro en 30 segundos.

**Ruteo.** Sin sesión, `App.tsx` resuelve en este orden y el orden es
vinculante: `/politica-datos` → enlace de montaje (`/?montar=…&t=…`, que
apunta a la RAÍZ, `routers/spaces.py`) → `/` = `Landing` → **cualquier otra
ruta = `Login`** (así un enlace guardado a `/reporte-plataforma` aterriza ahí
después de entrar). Con sesión, `/` sigue siendo el tablero o `/plataforma`.
`/login#registro` abre `Login` en modo registro; es el destino de los dos CTA
«Crear mi cuenta». `/login?invitacion=…` no se tocó (el canje sigue en el
backend). Sin backend nuevo: `/` es el mismo cascarón del SPA; no hay ningún
`/api/landing/*` (barrido de la tabla de rutas en `test_landing_ataques.py::l13`).

**La voz, en dos pasos (Fases 15 y 16).** Por decisión del dueño la landing
pasó primero de voseo a usted (Fase 15) y después a **registro comercial
formal** (Fase 16). Los dos pasos hicieron falta y el segundo enseña algo:

- **Fase 15** cambió los verbos —«dibujás» → «dibuje»— y dejó el registro
  intacto. La página siguió leyéndose conversacional («esta es la pantalla que
  falta», «la plata», «sin vueltas», «no se hace de cabeza») y el dueño lo vio
  de inmediato en la página dibujada. **Conjugar en usted no es escribir
  formal.**
- **Fase 16** reescribió el registro: enunciativo en vez de conversacional
  («el contrato se registra sobre el mueble», no «toque el mueble y llene la
  ficha»), sin coloquialismos, y con el vocabulario del oficio intacto —canon,
  sede, punta de góndola, mercaderista, vigencia— porque la prohibición de
  jerga de `copy.md` §0 es sobre jerga de SOFTWARE, no sobre el idioma del
  retail. La regla nueva está escrita en `copy.md` §0 y es de REGISTRO, no de
  conjugación.

**El H1 también cambió, en la Fase 16: «Recabre cada metro.»** El juego con el
nombre de la marca es el mismo —queda incluso más cerca de RECABRA escrito— pero
en el registro de la página. Está fijado en
`backend/tests/test_landing_ataques.py::TITULAR_E`; cambiar el H1 sin tocar esa
constante deja la prueba midiendo un slogan que ya no existe.

**El interior de la aplicación sigue en voseo** (Dashboard, Vender, Montaje,
Carga masiva). Cambiarlo entero es otra fase; una mezcla a mitad de camino sería
peor que cualquiera de las dos voces sostenidas.

**Fase 16: la landing quedó en cinco secciones.** Se retiraron **Asesoría** y
**Confianza / dónde quedan sus datos**, por decisión del dueño. Quedan 01
Funciones, 02 Para quién, 03 Implementación, 04 Precio, 05 Cierre. Dos cuidados
que el borrado podía llevarse por delante:

1. **El enlace a la Política de Tratamiento de Datos** vivía en el bloque de
   Confianza *y* en el pie. Ahora vive sólo en el pie, junto con el aviso de la
   Ley 1581 de 2012 y el Decreto 1377 de 2013. Es obligación legal, no copy
   comercial: `probar-landing.mjs` afirma que el pie lo tiene.
2. **El copy retirado NO se guardó en `copy.md`.** Un bloque comentado en el
   mismo archivo del que la landing se escribe es una invitación a que vuelva;
   vive en el historial de git, que es donde va lo que ya no se publica. Y hay
   una prueba de AUSENCIA (`probar-landing.mjs`, «la asesoría y el bloque de
   datos NO volvieron a la página») con las frases que sólo existían ahí.

La asesoría sigue existiendo como servicio y las pantallas del operador siguen
en el producto (`/plataforma`). Lo que se quitó es la promesa en la página
pública, no la función.

**Orden de trabajo (indicación del dueño, `features/landing/spec.md`).**
Copy primero (`outputs/copy.md`: texto final sección por sección, cifras con
archivo de origen en §12, datos de ejemplo en §13, 28 «no prometemos» en §14),
después diseño **sin referencias visuales** —sólo copy y spec, sin capturas ni
paleta—, y recién después frontend con lo funcional heredado (rutas, CSP,
three.js perezoso) y la estética del diseño nuevo. Lo que choca con la
aplicación interior se documenta como decisión del dueño, no se suaviza.

**Lo que se construyó.** `src/pages/Landing/`: `Landing.tsx` (nueve secciones
con el copy literal), `landing.css` (tokens y componentes **todos bajo `.lp`**:
redefine `--bg`, `--surface`, `--ink`, `--accent`, `.card`, `.nav`, `.btn` que
`src/index.css` ya usa; `probar-landing.mjs` falla si un selector se escapa),
`datos.ts` (supermercado inventado: 2 sedes, 16 alquilables 7/3/6, ~30 muebles
de contexto, prefijos de `nomenclatura.ts`, proveedores inventados — nunca
reemplazar por marcas reales), `PlanoIsometrico.tsx` (SVG propio, proyección
2:1, paneo/zoom como un solo `transform` por `ref`; la rueda sola siempre
scrollea la página y el zoom por rueda pide Ctrl/⌘ (ver gotcha abajo); teclado completo; ficha con el orden de copy
§11.2; leyenda con la palabra al lado del color; tabla equivalente; límite de
error) y `Vista3D.tsx` (three.js, **escena mínima propia, NO `StoreEditor3D`**,
que arrastra fiber/drei/store/API; entra por `lazy(() => import(...))`, se
pinta a pedido, libera renderer al desmontar). SEO en `index.html` servido en
el HTML: title, description, robots, `og:*`, `twitter:card`. Tema claro/oscuro
por `data-lp-tema` con preferencia guardada; `prefers-reduced-motion` respetado.

**Diseño «Planta y tinta»** (`outputs/diseno.md` + `outputs/prototipo/`): la
página es un plano — papel cálido `#F7F4EE`, tinta, retícula isométrica,
tipografía del sistema (cero descargas, por eso cumple la CSP sin tocarla),
ultramar `#3A34D6` como único color de acción porque verde/ámbar/rojo ya
significan estado. Estados validados con el validador de `dataviz` en claro y
oscuro. Sólo Ocupación lleva cifra en «los números que vas a tener a la
vista»; las otras cuatro, rótulo sin número: es la prueba visual de que nadie
promete «+30 %».

**Cifras del copy, todas con origen.** Recordatorios 30/15/6
(`services/reminders.py`, no 30/15/7); enlace de montaje 30 días (`auth.py`);
planilla 300 filas (`bulk_leases.py`); «Renovar» a ≤ 60 días; 9 temporadas
(`types/seasons.ts`); 15 tipos con tarifa (`fixtures.ts`); desvío desde 1 %;
`$ 1.500.000 × 61 días = $ 3.050.000` (este documento); ocupación de ejemplo
35 % = 8 de 23 caras. Regla: si un número no está en copy §12, no se escribe.
La sección de Asesoría NO promete un panel dentro de la cuenta del
supermercado: las recomendaciones salen de la consola del operador y llegan
por la sesión de asesoría, y la landing lo dice junto al reporte de
transparencia. Las capturas de `features/*/outputs/capturas/` son de la
consola del operador con un cliente de prueba y no van en la landing.

**El armazón cambió.** La landing no importaba three, pero `main.tsx → App.tsx
→ Dashboard → StoreEditor3D` lo metía en el chunk principal y el visitante
anónimo bajaba el motor 3D y Firebase antes del titular (hallazgo H-1 del
auditor). Por eso **todas las pantallas de adentro entran por `React.lazy`**
con una frontera `Suspense` en `App.tsx`. Build: `three.module-*.js` 732 kB
en chunk propio, `Dashboard-*.js` 1.058 kB aparte, `index-*.js` 300 kB.

**Verificación (2026-09-06).** `tsc` limpio; `build` limpio; suite completa
verde dos veces en serie (990 pruebas, 1 saltada, 7 xfail); 21 pruebas propias
(`npm run probar:landing`, render con `react-dom/server`), 11 de rutas
(`test_landing.py`) y 28 del red team (`test_landing_ataques.py`: cero API,
cero sesión, cero red, cero clientes reales, cero recursos externos, CSP
directiva por directiva, los nueve enlaces que circulan devuelven el mismo
cascarón, orden de guardas, grafo estático sin three). En navegador: 0
peticiones a `/api/`, 0 violaciones de CSP, 0 errores; three sólo baja al tocar
«Ver en 3D». **LCP en Slow 4G: 3,42 s** (objetivo < 2,5 s; en 4G rápido 1,8 s):
lo que pesa es el chunk de entrada y la hoja de fuentes de Google de
`index.html` que la landing no usa. Capturas 360/1440 × claro/oscuro en
`features/landing/outputs/capturas/`.

**Pendientes al cierre de la fase** (detalle en
`features/landing/outputs/ENTREGA.md`): recorte horizontal a 360 px por
`min-height: 300px` + `aspect-ratio` en `.mesa__stage` (`landing.css:285`);
LCP en 4G lento; `frontend/public/robots.txt` (hoy `/robots.txt` devuelve la
landing en HTML); anclas `#transparencia`/`#derechos` muertas porque
`markdownLite` no emite `id`; `og:image` 1200×630; el copy del atraso no cuenta
el escalón `suspendido`; los siete `[COMPLETAR]` (precio, unidad, correo de
contacto, razón social, NIT, ciudad, correo de protección de datos) y el
`mailto:` vacío de «Hablemos». Decisiones del dueño: `/login` no se parece a
la landing (papel cálido + ultramar + sistema vs. papel frío + tinta + Chivo);
los cuatro colores de estado son el mismo lenguaje pero no los mismos hex que
`index.css`; dos sedes o una; diagramas o capturas en «Cómo se usa».

**Pendientes conocidos de la fase:**

- **LCP en 4G lento**: 3,42 s medidos (objetivo < 2,5 s); en 4G rápido 1,8 s.
  El elemento LCP es el párrafo del hero y el costo es el entry de la app
  (~294 kB) más la hoja de fuentes de Google en `index.html`, que bloquea el
  pintado. Palancas: inyectar la hoja de fuentes por JS sólo en las pantallas
  de adentro y bajar el entry. No bloquea el merge; sí conviene antes de
  pautar la página.
- **`og:image`** falta (1200×630 desde el plano de ejemplo).
- **`markdownLite` no emite `id` en encabezados**: toda ancla `#…` hacia
  `/politica-datos` aterriza arriba.
- **Siete `[COMPLETAR]`** visibles en la página (precio, unidad, correo de
  contacto, razón social, NIT, ciudad, correo de protección de datos): sin
  ellos la página no se pauta, aunque ya se puede desplegar.
- Resueltos al cierre: el recorte a 360 px (`min-height: 0` en móvil),
  `/robots.txt` estático, el escalón `suspendido` en el copy del precio.

### Landing — re-vestido a la dirección E («La fusión»)

El dueño eligió, entre las cinco direcciones del taller de diseño, la **E**
(`features/landing/outputs/opciones/E-fusion/`): estructura y densidad de C con
el gesto de A concentrado donde vale. La landing de la Fase 9 («Planta y
tinta», papel cálido + ultramar) quedó **reemplazada**; lo funcional se
conservó entero. Lo que cambia respecto de lo escrito más arriba en esta misma
sección:

- **Ocho secciones**, no nueve: hero, lo que hace, para quién, cómo se arranca,
  asesoría, datos, precio, cierre. Entre ellas, conectores que nombran el
  título **literal** de la siguiente.
- **Estética:** fondo `#04070A` (el oscuro es el modo de la casa; el claro está
  entero y a un clic), **amarillo de etiqueta de precio `#FFD028` como único
  color de acción** —ya no el ultramar—, display de sistema con peso 800 y
  monoespaciada con cifras tabulares para códigos, plata y fechas. Los cuatro
  estados siguen siendo los hex validados con `dataviz` (oscuro `#00BE86 ·
  #F5A524 · #F4544E`; claro `#00805A · #CE8A0A · #D8342E`).
- **El plano ya no vive en una tarjeta del hero:** es una **sala pegada**
  (`position: sticky`, 100 dvh) que ocupa el hero y «Lo que hace», con la
  **cámara guiada por el scroll** (lerp 0,14 sobre un único `transform`, mapa
  de nueve escenas en `PlanoIsometrico.tsx`). Sobre el propio plano salen las
  capas de prueba ancladas al mueble del que habla cada tarjeta.
- **Motor nuevo del plano**, portado de E: una sola proyección con parámetro
  (`motor.ts`), donde «Ver en 3D» **no dibuja otra escena** sino que baja el
  horizonte y sube los muebles interpolando 760 ms. El `React.lazy` de
  `Vista3D` (three.js) **sigue existiendo y sigue siendo el único camino a
  three**: se abre desde «Recorrerla», el botón que aparece dentro de la vista
  3D. El bundle inicial de `/` sigue sin un byte de three.
- **`prefers-reduced-motion` no apaga nada:** deja la cámara quieta (los
  encuadres cambian de golpe), las capas de prueba aparecen igual y «Cómo se
  arranca» se lee como tres pasos con la sala ya dibujada y pintada.
- **`datos.ts` se rehízo con la constante `PIEZAS` de E:** 45 piezas, 16
  alquilables (10 CENTRO / 6 PALMAS) y 29 de contexto, mismo reparto 7/3/6 y
  los mismos proveedores inventados. El supermercado **no se nombra**: el
  nombre que propone `copy.md` §13 ya identifica a un cliente en la consola del
  operador y `test_landing_ataques.py` §L05 lo prohíbe en una página pública.
- **No cambió nada de lo que sostiene la fase:** cero `/api/*`, cero sesión,
  cero red, cero recursos externos, todo el CSS bajo `.lp`, `/login`,
  `/politica-datos`, el deep link de montaje y la redirección de quien ya tiene
  sesión intactos. `test_landing.py`, `test_landing_ataques.py` y
  `npm run probar:landing` siguen verdes (de este último se actualizaron dos
  asserts: el titular es ahora «Recabrá cada metro.» con el titular viejo de
  subtítulo, y el enlace de salto apunta a `#contenido`).

- **Gotchas de producción (dueño, 2026-09-06):** (1) Chrome pone
  `outline: auto 5px` a cualquier elemento SVG con foco —también por clic, no
  solo `:focus-visible`— y lo dibuja en unidades del plano: con la cámara a ×19
  salía un aro blanco que tapaba el mueble elegido. `landing.css` apaga el
  `outline` en `.pieza:focus`; el foco visible es el `.pieza__ring` amarillo.
  (2) «Armar» la rueda con el clic hasta que el mouse saliera del plano
  secuestraba el scroll, porque el plano pegado ocupa toda la pantalla. Ahora
  la rueda sola siempre scrollea; el zoom por rueda es Ctrl/⌘ + rueda (la
  pinza del trackpad manda `ctrlKey` sola), más los botones y la pinza táctil.
  (3) Tocar un mueble «congelaba» el plano: un clic con 4 px de movimiento
  (mouse real, dedo) contaba como arrastre y dejaba la cámara «libre» para
  siempre, fuera de las escenas del scroll. Ya no existe la cámara libre
  permanente: la cámara de cada sección SIEMPRE retoma el plano al cambiar de
  sección (un arrastre o zoom a mano vale hasta la siguiente), y el umbral de
  arrastre subió a 10 px. El clic y la ficha se conservan.
  (4) La ficha del mueble tapaba la capa de prueba de la sección (p. ej. la
  tira de temporadas). Ahora la ficha solo existe en el inicio (escena
  `hero`); en las specs, señalar o tocar un mueble deja el anillo y el
  código, sin ficha. Al volver arriba, la ficha vuelve.
- **Gotcha al cerrar (verificador de fidelidad):** `src/index.css` define una
  clase global `.rotulo` (versalita mono 600, 9,5 px) que pisaba el pill del
  plano; `landing.css` la redeclara entera (`font-weight`, `text-transform`).
  Lo mismo con el preflight de Tailwind: los `h4` y el `padding` de los botones
  se declaran explícitos. La sala de «Cómo se arranca» ajusta su `viewBox` a la
  caja real (como E) en vez del 640 × 300 fijo, que la dejaba un cuarto más
  chica.

Detalle de qué se portó tal cual, qué se adaptó y qué quedó distinto de E en
`features/landing/outputs/frontend-E.md`.

### CI en GitHub: por qué estuvo rojo en `main` (#48 → #49) y cómo se arregló

Los merges de #48 y #49 dejaron **rojo** el job «Backend · pytest» de `main` sin
que nadie lo viera (se mergeaba mirando la suite local, verde). Cuatro fallos,
todos de tests, ninguno del producto — y ninguno reproducible local:

- `test_a9`: comparaba dos respuestas enteras de `/adopcion` y `generado_en`
  cambió de segundo entre llamada y llamada. Ahora se compara sin el reloj.
- `test_t53`: el 404 genérico dice «Not Found» con httpx 0.27 (el pinneado en
  `requirements-dev.txt`, que no normaliza `..` en el path) y «Not found» (el
  catch-all de la SPA) con httpx 0.28 (el local). El test acepta los dos.
- `test_ingresos_12`: hace `git show 6dd2f4c:…` y el checkout de Actions es
  superficial (`fetch-depth: 1`), así que el commit no existía. El job del
  backend clona con `fetch-depth: 0`.

**Regla:** antes de mergear, mirar los checks del PR en GitHub, no solo la
suite local; y después del merge, el run de `main`.

### CI lento: la suite se quedaba con una app entera por prueba (2026-10-18)

El job «Backend · pytest» pasó de ~20 min a 51 (PR #79) y a 81 (PR #80), más un
cuarto de hora sin salir después del 100 %: en el #80 lo cancelamos a los 100 min
con `1590 passed` ya impreso en el log. No era la cantidad de pruebas, era
**memoria**: cada prueba dejaba ~7 MB que nunca se liberaban.

**Por qué.** El fixture `client` importa la app entera de nuevo en cada prueba y al
terminar la saca de `sys.modules`. Pero tres cosas de afuera seguían apuntando a
sus clases y funciones, y la app vieja no moría nunca:

- `JoinCondition._track_overlapping_sync_targets` de SQLAlchemy, un
  `WeakKeyDictionary` cuyos valores apuntan a su propia clave (columna → mapper →
  relación): ninguna entrada muere. **Sin tope**; es la que hacía crecer todo.
- los cachés de `typing` (`Optional[Space]`, `list[...]`), 128 por función;
- los tres `lru_cache` de 4.096 de `fastapi.dependencies.models`, con las
  funciones de las rutas.

Con ~1.600 pruebas el proceso pasaba los 4 GB y decenas de millones de objetos: el
runner de GitHub (poca RAM) entraba en swap, cada pasada completa del recolector
tardaba segundos y al salir había que liberar todo eso. En local (más RAM) se notaba
menos: 37 min.

**El arreglo** (sólo pruebas, nada de la app): `conftest.soltar_la_app_vieja()` corta
las tres referencias después de purgar `sys.modules`; el cuerpo del fixture quedó en
`app_de_prueba()`, con la limpieza en un `finally` (antes, si el arranque fallaba, la
prueba siguiente heredaba la app y la base de esa). Medido en los primeros 40
archivos (740 pruebas): de 4,7 GB y 19 M objetos a 300 MB y 244 k; de 18 min 46 s a
13 min 50 s. La suite entera, en local: 1613 pasan, la memoria no pasa de 318 MB,
31 min contra 37, y el proceso sale en menos de un segundo.

`test_suite_sin_fuga.py` levanta la app dos veces y exige que las dos se liberen:
sacar cualquiera de las tres limpiezas la pone roja (probado una por una). Si se
pone roja después de actualizar una librería, hay una referencia nueva: se busca
subiendo desde una clase vieja con `gc.get_referrers` hasta un módulo que siga en
`sys.modules`, y se corta en el mismo lugar. Antes mira que el arranque no haya
logueado excepciones: pytest guarda el registro con su traceback, que también
retiene la app, y eso es un arranque roto, no una fuga.

Queda una app retenida por cada módulo de `scripts/` que importan las pruebas
(`scripts.auditar_desfase` y otros importan modelos arriba y la purga sólo saca
`app.*`): son unas pocas y no crecen por prueba.

El job tiene además `timeout-minutes: 60` (sin tope, uno trabado esperaba las 6 h
que da GitHub sin mostrar el log) y `TMPDIR: /dev/shm`: cada prueba crea su base
SQLite en el directorio temporal y cada `CREATE TABLE` del arranque hace fsync; en
memoria la suite entera bajó de 31 a 24 min en local, con las mismas 1613 pasando.
Para correrla así en local: `cd backend && TMPDIR=$(mktemp -d -p /dev/shm) python -m
pytest`.

### Pruebas con el mes escrito a mano: rojas desde el 2026-10-01

El 1.º de octubre de 2026 cinco pruebas del backend amanecieron rojas sin que la
app cambiara: `test_t14`, `test_t18` y `test_t25` (`test_tendencia_ataques.py`),
`test_m25` (`test_metricas_ataques.py`) y `test_compliance1`
(`test_auditoria_compliance.py`). Hablaban del **mes en curso** —el último punto
de la serie de la consola, el mes que cierra el mantenimiento, el que se calcula
al abrir el panel— pero lo tenían escrito: «2026-09», «coherente con la fecha
fijada del entorno de test». Ninguna fecha estaba fijada. Con octubre, la serie
terminó en un mes sin datos, los contratos sembrados (del 1 al 30 de septiembre)
dejaron de ser del mes en curso y el arranque de la app pasó a cerrar septiembre
por su cuenta antes de que la prueba contara filas.

Ahora toman el mes de `periodo_actual()` —el reloj de la consola, en UTC— y
siembran los contratos del primer al último día de ese mes. En
`test_tendencia_ataques.py`, además, `_fijar_mes_en_curso` deja el mes quieto
mientras dura la prueba: leído del reloj y nada más, una corrida justo en el
cambio de mes (las 7 p. m. del último día, hora de Colombia) sembraba en uno y
preguntaba por el otro.

**La misma bomba, con fecha: 2028-10-01.** Corriendo la suite con el reloj del
proceso adelantado apareció otra tanda: 132 pruebas de seis archivos
(`test_plataforma_metricas`, `test_plataforma_detalle`, `test_metricas_ataques`,
`test_plataforma_spread`, `test_asesoria_ataques`, `test_metricas_conciliacion`)
tienen sus datos en septiembre de 2026 y los piden por la API
(`?periodo=2026-09`), que sólo acepta los últimos 24 meses
(`ventana_de_periodos`): desde octubre de 2028, 422. Ésas no hablan del mes en
curso sino de UN mes, así que no se reescriben: corren con el reloj en ese mes.
`conftest.py` trae la marca `reloj` —esos archivos llevan
`pytestmark = SEPTIEMBRE_DE_2026`, el 15 a mediodía— y mueve el reloj de todo el
proceso con `time-machine` (en `requirements-dev.txt`) **antes** de levantar la
app, para que el arranque cierre el mes anterior del mismo calendario que la
prueba. `test_reloj.py` vigila ese orden.

Verificado con el reloj del proceso movido: la suite entera pasa el 15 de
septiembre de 2026, el 1.º de enero de 2027 y el 1.º de octubre de 2028 (ese día,
sin la marca: 100 fallas y 32 errores). Las cinco del principio, además, el 1.º
y el último día de varios meses, el 29 de febrero de 2028 y en 2031, y con el
cambio de mes cayendo en 28 instantes distintos de la corrida: 0 fallas, contra
6 sin `_fijar_mes_en_curso`.

Para repetirlo, la suite acepta `--reloj`: `cd backend && python -m pytest
--reloj 2028-10-01T00:00:05+00:00` corre todo con el reloj del proceso en esa
fecha (las pruebas con la marca `reloj` siguen yendo a la suya).

**Regla:** ninguna prueba depende del día en que se corre. La que habla del mes
en curso lo lee de `periodo_actual()`; la que tiene sus datos en un mes escrito
a mano y lo pide por la API lleva la marca `reloj` en ese mes. Una prueba nueva
con fechas se corre también con `--reloj` en una fecha de dentro de un par de
años antes de darla por buena.

### Pendientes conocidos: clientes y plataforma

- **R-3 (menor)**: el tope de 2 fundaciones es count+insert sin barrera en la
  base — una carrera perfecta podría fundar de más. `UNIQUE` solo cubre
  repetir el mismo slug.
- **R-4 (menor)**: si `crear_cliente()` falla tras el commit intermedio (que
  suelta el candado de SQLite), queda un `Usuario` sin membresía ni fundación.
  No da acceso a nada; es fondo de tabla.
- **R-5 (latente)**: `crear_cliente` adopta una base `recabra_<slug>`
  preexistente en vez de rechazarla. Hoy inalcanzable (producción se llama
  `retail_espacios`); es un renombre de base de distancia. Test xfail que lo
  documenta.
- Un login legado rechazado por suspensión no deja línea en la bitácora.
- Un estado desconocido escrito a mano en `estados_cliente` **falla abierto**
  (pasa como activo): no cortarle el servicio a quien paga ante un valor que
  el código no entiende.
- ~~El estado se refresca al **entrar**: un cambio a mitad de sesión se ve en el
  próximo login (el 402 puntual de cada mutación sí llega igual).~~ **Cerrado
  (Fase 14).** Era el agujero que hacía que suspender un cliente no se notara:
  el 402 llegaba a cada pedido, pero el interceptor sólo conocía el 401, así que
  la app seguía dibujada con lo que ya tenía en memoria y en `localStorage` —
  navegación entera, pestañas, botones, y un chip de «Sin conexión» como único
  síntoma, que se lee como un problema de red. Ahora el 402 viaja rotulado con
  `X-Estado-Cuenta` (`suspendido` | `solo_lectura`) y el interceptor de
  `api/client.ts` escribe ese estado en el store: `BloqueoCuenta` tapa la app
  entera en el pedido siguiente, sin esperar a ningún login. El 402 **no**
  cierra la sesión —eso lo sigue haciendo sólo el 401—, porque el owner tiene
  que poder quedarse adentro para ver el motivo y pagar.
- El cache del estado es de 60 s; el PATCH del operador lo invalida — mover la
  fila a mano en la base no.
- **Para el abogado, abiertas por la Fase 8** (marcador nuevo en §5.3, además de
  las heredadas de la Fase 7 —agregado sobre un solo contrato, relación
  canon/tarifa sin umbral, proveedor unipersonal, fecha de último acceso, día de
  aceptación—): **(1)** si el **contrato de encargo** del §5.2 y la finalidad de
  asesoría alcanzan para que el operador lea el **canon y las fechas de un
  contrato individual** junto al **nombre comercial** del proveedor —dato
  comercial del supermercado y, a la vez, de un tercero que puede ser persona
  natural— o hace falta una cláusula/autorización adicional; **(2)** si el
  **precio sugerido calculado sobre el promedio de toda la plataforma** —un solo
  número por tipo, sin nombres ni desglose— queda cubierto por el contrato de
  servicio como estadística agregada o hay que pactarlo expresamente, y si esa
  disociación alcanza cuando hay pocos clientes con ese tipo de espacio;
  **(3)** la **marca** exhibida como dato de un tercero; **(4)** el plazo de
  retención de `bitacora_plataforma`, que sigue en `[COMPLETAR]` en el §6 de la
  política y ahora guarda también las consultas de detalle.

### Pendientes conocidos: identidad

- **Firebase no se consulta por revocación**: una cuenta deshabilitada en la
  consola de Firebase puede canjear su ID token vigente (≤1 h) por un JWT
  propio de 12 h. Mitigado de verdad por el chequeo de membresía por request:
  desactivar la membresía acá corta el acceso ya. Deshabilitar en Firebase
  SIN desactivar la membresía no corta nada — el procedimiento es desactivar
  la membresía.
- **El email del actor va concatenado en `detalle` del `audit_log`**
  (`… · correo@x.co`), no en la columna `actor` (que sigue diciendo el rol).
  Funciona pero obliga a parsear texto; una columna nueva pediría migración o
  tabla aparte — decisión pendiente.
- Los caminos del SDK de Firebase en el cliente (alta por correo,
  verificación, reset) no tienen tests automatizados: el repo no tiene runner
  de tests de frontend. El backend sí está cubierto (identidad + ataques).


### Clientes: alta self-service y estado de cuenta (Fase 2)

Dos cosas nuevas, construidas sobre la Fase 1: un supermercado se puede
fundar solo, y la plataforma tiene un interruptor de estado de cuenta por
cliente que un operador mueve a mano.

**El alta** (`POST /api/clientes/alta`, `app/routers/alta.py`) recibe el
`id_token` de Firebase **directo**, sin JWT propio — un usuario sin
membresías no puede tener uno (`/oauth` le da 403), así que no hay JWT que
pedirle. La misma vara de correo confiable que `/oauth` (verificado, o el
proveedor es Google) y las mismas reglas de vinculación de `Usuario` (por
`firebase_uid`, si no por email, nunca se crea uno nuevo si el email ya tiene
fila). El freno de fuerza bruta es una tabla propia (`alta_attempts`, vía
`IntentoAlta`) para no contaminar ni `login_attempts` ni `intentos_oauth`.
`crear_cliente(slug, nombre)` —que ya existía— es el paso **irreversible**:
crea la base de Postgres. Por eso TODA la validación va antes — slug con la
misma forma que exige `crear_cliente`, lista de reservados
(`galerias`, `api`, `plataforma`, …), verificación directa de que el slug no
existe (activo o no: `buscar()` filtra inactivos y dejaría estrellar el
UNIQUE), y el tope de **2 clientes fundados por usuario** (tabla
`fundaciones`) — así que "sin cliente a medias" es literal: si algo falla,
no queda una base a medio crear.

**Estado de cuenta sin tocar `clientes`.** La tabla nueva `estados_cliente`
(base registro, `create_all` la crea sin migración) vive **al lado** de
`clientes`, no adentro: **fila ausente = activo**, y una fila con
`estado="activo"` también es activo (el PATCH la deja puesta como constancia
de quién hizo el último cambio, incluido reactivar). Por construcción,
galerías y todo cliente que ya existía hoy quedan activos sin ninguna
acción — cero backfill, cero fila que escribir.

**El interruptor vive en un solo lugar**: `_aplicar_estado`, adentro de
`cliente_del_pedido` (`clientes.py`), el único punto por el que pasan todos
los routers de negocio. Semántica: `activo`/`gracia` pasan; `solo_lectura`
deja pasar GET/HEAD/OPTIONS y corta el resto con 402; `suspendido` corta
todo, GET incluido. Dos exenciones explícitas, a propósito:
- **`/api/plataforma/*` siempre pasa** — opera sobre el registro, no sobre
  la base del cliente, y un operador cuyo propio cliente quedó degradado
  tiene que poder seguir destrabando cuentas, incluida la suya.
- **`/api/auth` y `/api/usuarios` pasan en `solo_lectura`** — el owner
  necesita poder entrar y gestionar su gente para poder pagar (spec, decisión
  3). En `suspendido` NO hay excepción para estos dos: el corte ahí es total.

`/api/auth/login` y `/api/auth/oauth` **no pasan por `cliente_del_pedido`**
(resuelven su propio cliente antes de que exista ningún token), así que el
gating de esos dos vive aparte, explícito, en `routers/auth.py` — mismo
`estado_de()`, mismos códigos, pero cada uno con su propio motivo: el legado
comprueba la contraseña ANTES de mirar el estado, para que la pantalla de
ingreso no se convierta en un oráculo de qué supermercados dejaron de pagar
con solo probar slugs.

**`expire_leases()` sigue andando en `solo_lectura` a propósito.** El corte
es al **pedido HTTP**, no a la sesión de base: un `GET /api/spaces/map` que
pasa el filtro (es lectura) puede seguir disparando por dentro la escritura
que vence contratos vencidos — si el corte viviera en la sesión, ese mismo
GET se caería al intentar escribir. Es la sutileza central del contrato de
esta fase, y tiene test dedicado
(`test_solo_lectura_no_rompe_el_get_que_escribe_por_dentro`).

**Operador de plataforma** = email en la env `OPERADOR_EMAILS`
(coma-separada), sin distinguir mayúsculas, sin tabla de superadmins que
alguien pueda escribir — se lee de la env en cada llamada. Sólo aplica a
cuentas con `sub`: el login legado nunca trae `email` en el token, así que
`request.state.actor_email` queda ausente y `require_operador` da 403
siempre, por construcción, sin ningún chequeo especial para el legado.
`GET /api/plataforma/clientes` y `PATCH /api/plataforma/clientes/{slug}`
(motivo obligatorio, también al dejar "activo") sólo tocan el registro:
nunca abren la base de negocio de un cliente.

Config: `OPERADOR_EMAILS` sin poner deja el panel de operador inexistente
para todos — no hay 500, cualquier cuenta con `sub` simplemente da
`operador: false`.

#### Pendientes conocidos: clientes

De la auditoría de regresión y del red team
(`features/clientes/outputs/regresion-fase-2.md`,
`features/clientes/outputs/red-team-privilegio.md`):

- **La suite completa de pytest sólo está verde la primera vez que se corre
  sobre un checkout** (hallazgo R-0, encontrado por duplicado y sin
  coordinación por el auditor de regresión y por el red team).
  `tests/test_correo_api.py` —pre-existente, ajeno a esta fase— importa
  `app.services.mailer` a nivel de módulo; pytest colecciona (importa) todos
  los archivos de test antes de correr ningún fixture, así que ese import
  deja `app.database` clavado contra su default
  (`sqlite:///./retail_espacios.db`, un archivo real en `backend/`) desde
  ANTES de que el fixture `client()` del primer test ponga el
  `DATABASE_URL` de prueba. Sólo el primer test de toda la sesión paga esto
  (la purga de `sys.modules` corre en el teardown, protege del segundo test
  en adelante). Antes de esta fase era inofensivo porque nada revisaba
  estado persistente; desde que el primer test alfabético del repo es
  `test_alta.py::test_alta_feliz_funda_owner_y_base_vacia` —que funda un
  cliente real llamado `nuevomarket`— la segunda corrida sobre el mismo
  checkout arranca en rojo (409, el slug ya existe) o, si dos procesos
  comparten el mismo directorio, con `readonly database`. Antes de medir
  regresión sobre esta rama: `rm -f backend/retail_espacios.db
  backend/recabra_*.db`. Arreglo de una línea, fuera del territorio de los
  tres builders de esta fase: mover el import de `test_correo_api.py`
  adentro de sus funciones, como hace el resto de `tests/`.
- **El 402 del interruptor se contesta sin credencial** (R-1, mayor): en una
  instalación de un solo cliente, `cliente_del_pedido` resuelve por `unico()`
  antes de que `require_auth` mire el token, así que un `GET` anónimo
  distingue 401 (cuenta sana) de 402 (degradada/suspendida) — exactamente el
  oráculo que el login legado se cuidó de no construir. Sugerido: que
  `_aplicar_estado` sólo corra cuando el pedido trajo credencial.
- **`aviso_cuenta.motivo` en `gracia`/`solo_lectura` le llega a cualquier
  rol**, worker incluido — a diferencia de `suspendido`, donde el motivo ya
  está protegido para el owner solo. Es texto libre que el operador escribe
  para uso comercial (facturas, con quién hablar), no para la trastienda.
- **El tope de 2 fundaciones por usuario no tiene barrera en la base**: dos
  altas simultáneas del mismo usuario pueden ganarle la carrera al `count()`.
  El UNIQUE existente evita fundar el mismo slug dos veces, no evita fundar
  un tercer cliente distinto.
- **Un alta que falla en `crear_cliente` deja un `Usuario` huérfano** (sin
  membresía ni fundación): el commit que suelta el candado de SQLite antes
  del paso irreversible también graba el usuario. No abre nada (`/oauth` le
  da 403 igual), pero contradice "sin cliente a medias" en sentido estricto.
- **`crear_cliente` no distingue crear una base de adoptar una que ya
  existe**: si una base `recabra_<slug>` de la misma instancia de Postgres
  no tiene fila en `clientes`, el alta le mete las tablas de RECABRA adentro
  y el fundador nace admin ahí. Hoy no es alcanzable (la base de producción
  se llama `retail_espacios`, no hay `recabra_*` huérfanas), pero el
  `recabra_nuevomarket.db` que deja la propia suite de tests al correr es
  exactamente ese escenario en miniatura.

### Sincronización entre computadores

El síntoma era "lo que hago acá no se ve allá". Eran varios defectos encadenados, todos
corregidos:

- `syncFromServer()` corría al cargar el módulo, **antes del login**: sin token daba 401,
  el interceptor borraba la sesión y nunca se reintentaba. Ahora arranca desde `App.tsx`
  con la sesión activa.
- El merge decidía por **cantidad** de fixtures, así que las eliminaciones nunca
  viajaban. Ahora manda la revisión (`updated_at`).
- Un único timer de guardado global para todas las sedes; ahora hay uno por sede.
- Sin revalidación tras la carga inicial. Hay polling de revisiones cada 20 s y refetch al
  recuperar el foco, al mostrar la pestaña y al reconectar.
- La lista de sedes y las etiquetas del catálogo vivían solo en `localStorage`. Ahora se
  comparten server-side y la lista visible es la **unión** de la configurada y de toda
  sede con snapshot, para que ninguna con datos quede oculta.
- Los fallos eran silenciosos mientras la UI decía "✓ Sincronizado". Hay un indicador real
  en el header y resolución explícita de conflictos.

Endpoints nuevos: `GET /layout/revisions` (polling barato), `GET/PUT /layout/settings`,
`DELETE /layout/{sede}`. El `PUT` acepta `base_updated_at` y responde 409 si otro equipo
guardó en el medio.

### Muebles comercializables

Campo opcional `rentable` en `UnifiedFixture`, con semántica retrocompatible: **ausente
significa comercializable**, solo un `false` explícito marca infraestructura (helper
`isRentable`). Columnas, cajas y zonas libres nacen como no comercializables.

Un mueble no comercializable no admite contrato (también bloqueado server-side con 409),
queda fuera de todas las métricas de disponibilidad y se dibuja en gris pizarra.

### Dashboard

KPIs arriba de todo, mapa isométrico y columna de "Atención" lado a lado, un solo buscador
para toda la página, y vista propia para el rol worker (arranca por espacios disponibles y
lo que vence, sin nada de dinero).

Al hacer clic en un mueble se abre un popover anclado a él; "Ver todo" pasa el detalle
completo a la columna derecha. Los campos vacíos no se dibujan.

### Paleta y tipografía

El sistema visual sale de `docs/maquetas/` y vive en `frontend/src/index.css` +
`tailwind.config.js`, que repiten los mismos valores (literales en Tailwind y no
`var(--x)`, porque media docena de clases usan el modificador de opacidad y Tailwind
sólo sabe separarle el alfa a un color que puede leer). **Si tocás uno, tocá los dos.**

**Tres estados y nada más.** Verde se puede vender, naranja a medias, rojo no:

| Lectura | Color | Token |
|---|---|---|
| Libre todo el periodo | verde `#00786A` | `--libre` |
| Se libera en el periodo | naranja `#F08519` | `--entra` (texto: `--entra-txt` `#B35F0A`) |
| Tomado | rojo oscuro `#8E1226` | `--ocupado` |
| Resto de la sala | gris `#D3D9DB` · `#E4E8E9` | `--resto` |

El rojo es **oscuro a propósito**: cuando el tono se colapsa bajo deuteranopía lo que
separa es la luminosidad, y un rojo claro contra un verde medio se vuelven el mismo
bloque. Medida con la misma cuenta, esta terna separa mejor que la que estaba desplegada
en TODOS los pares — el peor par pasa de 13,5 a 19,9 en dicromacia y de 27,4 a 33,8 en
visión normal. Cada estado va **siempre rotulado**, así que la identidad nunca depende
sólo del color.

`success` / `warning` / `danger` apuntan a esos mismos tres. Acá no quieren decir «bien /
cuidado / error»: quieren decir libre, se libera, tomado.

**El plano pinta siempre esa escala de tres.** Antes, sin periodo elegido, contestaba con
la otra —«qué pasa hoy», siete clases— y ahí `free` contra `maintenance` daba ΔE 3.6 en
deuteranopía: el mismo color para dos estados opuestos. La salida no fue inventarle un
color a nadie sino sacarle el trabajo al color: **«Hoy» pasó a ser un periodo de un día**
(`hoyComoRango()` en `SeasonPicker`), las dos pantallas tienen siempre periodo puesto, y
el detalle por estado vive **escrito** en la tabla, donde cada fila lleva su palabra.

**Tipografía: Chivo + Archivo Narrow.** Chivo para leer; Archivo Narrow para códigos y
versalitas. Cada mitad hace algo que la otra no puede: Chivo tiene un 900 de verdad —no
un 700 engordado— y sobre ese peso se apoya el único número grande de la pantalla, el
total del contrato; Archivo Narrow aprieta `GON-60·A` en una columna de 56 px, y de eso
depende que las 23 caras entren sin cortar un código. `--font-mono` sigue llamándose así
por los ochenta lugares que la piden, pero **no es monoespaciada**: lo que hacía falta de
un mono era que las cifras alinearan, y eso lo da `tabular-nums`, que está en el body.

**Siete tamaños y ninguno más** — 9.5 · 11 · 12 · 13 · 14.5 · 17 · 27 — escritos en
`index.css`. Había diecisiete, que es lo que hace que una pantalla se vea armada de a
pedazos. El contraste lo dan la familia, el peso y el color, no el tamaño. Radios: 2 px
para lo que se toca, 3 px para el panel. Sin sombras salvo el modal.

**Antes de mover un color hay que volver a correr la cuenta** sobre los cinco del plano
—los tres estados, el cuerpo del mueble y lo no comercializable—. Que «se vean distintos»
no es evidencia.

### Tarifa de referencia y rendimiento $/m²

Eran los dos primeros del backlog; salieron juntos porque comparten dominio (dinero).

- **Tarifa de referencia** por tipo de mueble: una general + ajuste opcional por sede
  (`app_config`, clave `layout_reference_rates` — sin migraciones, como manda la regla).
  Se edita desde el botón **Tarifas** del Dashboard; guardado automático con el mismo
  debounce que las settings. La tarifa de góndola es **por cara** (doble y mural
  comparten tarifa, porque el valor negociado también es por cara).
- Endpoints `GET/PUT /layout/rates`, declarados antes del catch-all. A diferencia de
  `/layout/settings`, acá **también el GET exige admin**: es dinero. En el cliente las
  tarifas nunca tocan `localStorage` y un login de worker las deja en `null`, así que
  una máquina compartida no filtra nada.
- En los paneles de contrato (2D y 3D) el campo de valor muestra la referencia del
  tipo+sede y el desvío (`−17% vs referencia`, ámbar por debajo / verde en línea o
  arriba).
- En el Dashboard admin: sección **"Bajo tarifa de referencia"** en Atención, con el
  desvío y `pagado · ref` en compacto.
- **No hay ranking de $/m²** y no debe volver: el precio se cuadra internamente, y además
  medía el plano equivocado. La industria mide anaquel en metros lineales y facings (el
  informe de la FTC de 2003 pide "linear feet" y "facings"; "square feet" no aparece), y
  la huella de piso es cero o casi cero para ristra, robatope y exhibidor cruz. La tarifa
  plana por mueble/sede sí es la convención real: la rate card publicada de Albert Heijn
  cobra por mueble, por tienda, por unidad de tiempo, sin mencionar área.
- El helper es `referenceRateFor(rates, sede, type)` y la clave de tipo
  `rateTypeOf()` (normaliza los tipos 2D legados `gondola_doble`/`gondola_mural` a
  `gondola`). Umbral de marcado: desvío ≥ 1 % — un peso de redondeo no es anomalía.

### Disponibilidad por fechas y calendario por temporada

Un contrato cargado para diciembre marcaba el espacio como ocupado **desde el momento de
guardarlo** y sumaba su valor al ingreso mensual. Lo peor no era el número sino la venta
perdida: el backend sí razonaba por fechas y aceptaba vender los meses previos, pero nadie
lo intentaba porque la pantalla decía "ocupado".

- La ocupación se **deriva** de `startDate`/`endDate`, que ya viajaban en el JSON del
  layout (`contractPhase`). Derivar en vez de guardar evita tener que correr algo que
  voltee el estado al llegar la fecha, y funciona sobre los planos ya guardados: sin
  migración ni backfill.
- Estado **"Contratado"** para lo firmado que aún no arranca: tarjeta, chip de filtro y
  color propio en el mapa (violeta claro). El ingreso mensual cuenta solo lo vigente; lo
  pactado va en su propia línea.
- El mapa pinta de **rojo lo vencido**, que la paleta ya pedía y no estaba implementado.
- `Space.active_lease` devuelve el contrato vigente HOY y se agregó `upcoming_lease`.

Sobre el mapa hay un control **"Disponible para"**: chips de temporada más dos campos de
fecha. Con un periodo elegido cambia la lectura entera — la leyenda pasa a tres estados
(libre todo el periodo / libre parte / tomado) y aparece el conteo de lo vendible. Las
tarjetas de arriba **siguen reportando hoy**, a propósito, y el encabezado del mapa dice
cuál contesta qué.

### Temporadas comerciales

Separación que hace que esto no se pudra: el **ancla** es un hecho del calendario y se
calcula (tercer domingo de junio, pascua por Meeus/Jones/Butcher, viernes tras el cuarto
jueves de noviembre); la **ventana de venta** —días antes y después— es decisión comercial
y se guarda en `app_config`, global para las tres sedes. El año entrante las anclas se
mueven solas y las ventanas siguen puestas. Se editan desde el ícono junto a los chips
(admin). `GET /layout/seasons` lo lee cualquier rol: son fechas, no dinero.

**Aritmética de días** (`types/seasons.ts`): todo pasa por un entero calculado con
`Date.UTC` sobre los componentes civiles, y el parseo de `"YYYY-MM-DD"` es propio —
`new Date(str)` lo toma como UTC y en Colombia retrocede un día. Los rangos son
**inclusivos en ambos extremos**, igual que el chequeo de solapamiento del backend: un
mueble necesita día de desmontaje. Un contrato de **un solo día es válido** (Black Friday
es un viernes suelto).

`reservado` y `mantenimiento` no tienen fechas: describen el presente. Bloquean un periodo
que incluya hoy, pero **no** uno enteramente futuro — bloquearlo escondería inventario
vendible detrás de una bandera puesta meses antes.

### Una pantalla de sede, dos modos

Había dos pestañas —**Negociar** y **Resumen**— que abrían las dos con el plano de la
misma sede y se diferenciaban en poco más que el orden de las tarjetas. La pregunta "¿en
cuál de las dos hago el contrato?" no tenía buena respuesta, y quien entraba a Negociar
elegía el espacio de **una lista de códigos**: `PUN-04` no dice si la punta está en la
entrada o contra la pared del fondo, y esa es media negociación.

Ahora es **una sola pestaña (Sede)** con un interruptor arriba que declara para qué está
abierta la pantalla:

- **Vender** — el mapa se lleva la pantalla, pintado por disponibilidad del periodo, y la
  ficha del contrato va al lado. Sin KPIs: para poner un precio no sirve la ocupación de
  hoy, sirve ver qué hay libre en el periodo y dónde queda.
- **Supervisar** — el tablero de siempre: KPIs, filtros por estado, mapa con el panel de
  Atención al lado y la tabla por espacio. Lleva un contador de pendientes en el
  interruptor, así que invita solo.

El mercaderista **no ve el interruptor**: no vende, y su pantalla es Supervisar.

**El periodo es uno solo.** La misma tira de temporadas que pinta el mapa llena después
las fechas del contrato, así no hay dos calendarios que puedan discrepar. Al entrar a
Vender se pone solo en hoy→30 días si no había ninguno: "hoy" no es una pregunta
comercial, lo que se vende es una temporada.

**El contrato** (`frontend/src/components/Contrato/`) está partido en un hook con el
estado (`useContrato`) y dos piezas para dibujarlo. El botón de guardar **no vive adentro
del formulario** sino en una barra pegada al pie de la pantalla, que resume de corrido lo
que va a quedar escrito —espacio → proveedor → valor → fechas— y dice qué falta antes de
que nadie busque el botón. Para algo que escribe plata, esa relectura vale el espacio.

Detalles que sobrevivieron de la pantalla anterior porque se ganaron el lugar:

- Las fechas vienen **ya puestas** con el periodo elegido arriba, y se congelan al abrir
  la ficha: cambiar la temporada mientras alguien teclea no le reescribe el acuerdo.
- El semáforo del encabezado (`Libre todo el periodo` / `Parte del periodo vendida`)
  responde por **las fechas que están escritas**, no por el periodo con el que abrió. Si
  se corre el "hasta" hasta pisar un contrato que ya existe, el aviso aparece ahí mismo.
- Debajo del valor va la comparación contra la **tarifa de referencia**.
- Al lado del código va **dónde queda** en palabras ("A unos 3 m de las neveras"), medido
  de borde a borde. El mapa está al lado, pero al teléfono con el proveedor hay que poder
  decir "es la punta de la entrada, no la del fondo".
- Una **góndola doble son dos espacios**: la ficha trae el selector de cara A/B.
- Un mueble no comercializable no abre contrato: la ficha explica que es parte del local.

Al guardar hace `find-or-create` del espacio y del proveedor y `POST /leases`. Ya **no**
escribe el contrato en el JSON del layout —eso dejó de existir con *Una sola verdad para
lo comercial*: el contrato es una fila y el mapa se pinta de ahí— y muestra una
confirmación que **se queda hasta que la cierren**: al cerrar un trato lo que hay que ver
es a quién le llegó el aviso, y un mensaje que se va solo a los dos segundos no lo dice.
Esa confirmación vive en la pantalla y no en el formulario, porque al guardar el mueble
cambia de estado y eso desmontaba el mensaje justo cuando había que leerlo.

Desde **Supervisar** también se vende: el popover del mapa y el panel de detalle traen
"Negociar este espacio", que cambia de modo con ese espacio ya elegido.

#### Cómo quedaron las dos pantallas (las maquetas, en código)

Las maquetas de `docs/maquetas/elegida-vender.html` y `elegida-supervisar.html` bajaron a
código. Lo que cambió no es el aspecto: es **qué contesta cada pantalla**.

**El parte en prosa se fue de las dos**, y con él su maquinaria: `utils/parte.ts`,
`utils/redaccion.ts`, `components/Parte/` y sus dos suites no están en el repo. Eran
cuatrocientas líneas que no importaba nadie, y código muerto que sigue corriendo en CI se
lee como código vivo hasta que alguien pierde media hora averiguando que no lo es. Están
en la historia de la rama de diseño, que es donde hay que buscarlas si el parte vuelve.

**Supervisar** abre con una franja de cinco cifras: canon vigente, sin alquilar, vence en
30 días, ocupación, sin montar. «Sin alquilar» es la que faltaba —«ocupación 35 %» dice
que sobra sala, «$8.730.000 al mes a tarifa» dice cuánto vale esa sala— y lleva su tasa
por día, que dice **«por día vacío» y no «perdido»**: con el periodo por delante todavía
no se perdió nada. A un mercaderista la franja le cambia: ve *Vence en 30 días* y
*Libres* contados en espacios, nunca en pesos (el servidor ya le borra el
`negotiatedValue`, así que en pesos le llegaría un `$0` que hace parecer quebrada a la
sede).

«Atención» es ahora **«Para revisar»** y cada fila es un **botón que selecciona el espacio
en el plano de al lado**. Antes la lista y el plano eran dos paneles que no se hablaban.
«Los que más pagan» es **«Quién paga el canon»**, con el porcentaje del canon y el sello
VENCE: el ranking 1-2-3 contestaba una pregunta de vanidad; la que importa es de quién
depende la sede. **«Estado por espacio»** queda a todo el ancho debajo del plano, con los
chips de filtro en su encabezado —Todas / Por vencer / Sin montar / Libres, y el que no
puede devolver nada no se dibuja—.

~~Y el plano **deja de ser un directorio**: la tabla ya lista las 23 caras con su código, así
que arriba se rotula sólo la fila abierta.~~ **Ya no (2026-09-23):** el plano de Supervisar
es el mismo que el de Vender y rotula todo. El argumento era de medida —«veintitrés rótulos
en un panel de 700 px caen a un cuerpo ilegible»— y dejó de valer cuando el rótulo pasó a
medir 10,5 px en pantalla a todo acercamiento y a ceder cuando no entra (ver *El plano se
mueve como el Editor 3D*). Lo no comercializable sigue sin rotularse nunca: es el contexto
donde está lo que se vende, y el contexto se dibuja.

**Vender** suma dos paneles. **«Cuándo se libera cada espacio»** (`components/Libera/`) es
una escalera sobre el eje de fechas con peine de días y un cursor que escribe la respuesta
—«si arranca el 26 de sep → 17 libres»—. Contesta la pregunta con la que se negocia una
fecha de arranque, que ninguna cifra suelta contesta: «15 libres» es cierto hoy y deja de
serlo el martes. **La serie no se asume monótona**: se cuenta día por día, porque un
contrato que arranca en el medio del periodo *baja* la disponibilidad y dibujarlo como una
subida sería mentir sobre inventario ya vendido. Los chips de código se apilan por columna
y sueltan los que no entran, en vez de dibujarse encimados.

**«Tarifa de referencia»** sale de atrás del botón y ocupa la columna derecha mientras no
hay espacio elegido —donde antes había 428 px de blanco reservado para lo que no estaba—.
Tocar una fila aísla esa familia en el plano. Abrir un modal para consultar un precio en
cada llamada es lo que hace que la gente termine con la lista impresa al lado del teclado.

La ficha del contrato lleva el espacio adentro de un recuadro propio con su tarifa —es el
único dato que no se teclea— y al pie el **TOTAL DEL CONTRATO**, que no existía: el
formulario pide el valor *mensual*, pero lo que se firma es el total del plazo, y
$1.500.000 al mes por 61 días son $3.050.000. Esa cuenta se hacía de cabeza con el
proveedor esperando. Debajo, las temporadas que el plazo cubre: argumento de venta y
control a la vez —si la temporada que se buscaba no aparece, las fechas están mal—.

#### El contrato multiespacio

Un contrato con un proveedor sobre tres puntas de góndola es **un solo acuerdo**
—un proveedor, un periodo, una firma— y hasta acá había que tipearlo tres veces, con
tres oportunidades de escribir una fecha distinta. Ahora la ficha lleva una lista.

- **La arma el plano.** Tocar un espacio lo suma al contrato; tocarlo de nuevo lo saca.
  Antes reemplazaba la selección. El plano marca todos los elegidos, y la cámara sólo se
  acerca cuando hay UNO: con dos o más, acercarse a uno esconde los que faltan tocar.
- **El valor va por espacio**, adentro de su renglón, y arranca con la tarifa de
  referencia escrita. La punta de la entrada no vale lo que la del fondo, y ése es
  justamente el detalle que se negocia; con el precio de lista puesto, bajarlo es una
  decisión que se toma mirando cuánto se está bajando. Al lado, el desvío contra la
  referencia, en el renglón del espacio que lo tiene.
- **Las dos caras de una góndola doble pueden ir en el mismo contrato.** Cada letra es
  un interruptor y no una opción: una marca que quiere el pasillo entero compra A y B, y
  con un selector entre las dos eso eran dos contratos.
- **El total es del plazo**, no del mes: $2.250.000 al mes por 61 días son $4.575.000.

**Se guarda por el camino de la tanda** (`POST /leases/bulk/confirmar`), el mismo que
usa la planilla, y eso no es comodidad de implementación. Por el camino de a uno cada
espacio dispara su propio juego de correos: un acuerdo sobre tres puntas le llegaba al
proveedor como tres confirmaciones, al comercial como tres contratos nuevos y al
mercaderista como tres órdenes. Nueve correos para una sola firma es exactamente lo que
hace que nadie los lea — y ese endpoint ya lo tenía resuelto («un correo por rol para
TODA la tanda»). De paso trae dos cosas gratis: **revalida** cada espacio contra la base
justo antes de escribir —entre que se armó el contrato y se tocó el botón, alguien pudo
haber vendido una de esas puntas desde otra sesión— y devuelve fila por fila qué pasó.

Hubo que agregarle dos campos a la respuesta, sin migración: `lease_id` por fila —la
planometría cuelga del contrato, así que la pantalla necesita su id, y va a **cada**
espacio porque el mercaderista abre el que le toca montar— y `avisos`, que dice a quién
se le encoló un correo. Ese segundo campo existe por la misma razón que existía en el
alta de a uno: cerrar la llamada creyendo que se le avisó al mercaderista, sin que haya
salido un correo, es el modo de falla que vuelve inútil la herramienta.

**Si un espacio falla, no se deshace nada.** Tres espacios son tres filas y la segunda
puede fallar con la primera ya escrita; deshacerla sería peor, porque el correo ya salió
y otra sesión pudo haberla leído. La confirmación dice exactamente qué quedó y qué no,
con el código a mano para reintentarlo.

**Lo que NO hace:** los N contratos quedan como N filas independientes en `space_leases`,
sin nada que los ate. No hay tabla de contratos —y la habría que agregar, no migrar, que
sí está permitido—. Mientras tanto la agrupación es **derivable**: mismo proveedor,
mismo desde, mismo hasta, misma sede. Cancelar sigue siendo de a un espacio.

#### El encuadre del plano

> **Reemplazado en parte (2026-09-23).** Con la cámara del editor el dibujo gira, así que
> la «proporción del plano» dejó de existir: el lienzo mide `--alto-plano` en las dos
> pantallas, y la cámara ya no se acerca sola a nada —tampoco en Supervisar—. Lo que
> sigue queda como el porqué de lo que había; lo vigente está en *El plano se mueve como
> el Editor 3D*.

Tres cosas que salieron de mirar la pantalla desplegada y no de diseñarla.

**La tarjeta del plano no lleva alto: lo pone la PROPORCIÓN DEL PLANO.** Con alto fijo
—538 en Vender, 732 en Supervisar, que son los de la maqueta— el panel quedaba de
1450×430, una ranura de 3,4:1, y el plano de NAVE es de 1,7:1. `preserveAspectRatio`
lo encajaba por el alto y dejaba **el 55 % del ancho en blanco**: el dibujo se veía
chico y lejos, con medio panel vacío alrededor. La proporción no se puede fijar en el
código porque depende de la sede —una tienda larga y angosta y una cuadrada proyectan
distinto—, así que el lienzo la toma del `viewBox` de la escena, con un techo de 720 px
para que una sede casi cuadrada no empuje una tarjeta de mil píxeles y un piso de 360
para que una muy alargada no quede como una tira.

**En Vender la cámara ya no se acerca al mueble elegido.** No es una preferencia: ahí
tocar un espacio lo SUMA al contrato, así que el gesto siguiente es tocar otro — y
acercarse al primero esconde justamente los que faltan elegir. En Supervisar sí se
acerca, porque ahí se abre una fila de la tabla y la pregunta es dónde queda; pero el
tope bajó de 3,4 a 1,9 —a 3,4 se veían cuatro muebles y el resto de la sala quedaba
afuera— y el resto de la sala se apaga al 45 % y no al 20 %, que dejaba fantasmas.

**Las columnas miden lo que miden.** La fila es `flex-start` y no `stretch`: estirar la
tarjeta del plano para igualar la altura de la ficha le agregaba trescientos píxeles de
blanco debajo del dibujo. La única que se estira es la de la derecha, y sólo cuando no
hay ficha: si no, la lista de precios —unos 380 px— quedaba al lado de un plano de 700
y dejaba el fondo gris a la vista, que se lee como que falta algo. Estirada, la tabla
queda arriba y lo que sobra es hoja en blanco.

**La lista de precios dice CUÁLES.** «Isla · 3 · $1.200.000» dice cuántas quedan y no
cuáles, y para averiguarlo había que buscar los prismas verdes a ojo entre ciento seis
muebles. Debajo de cada tipo van los códigos de sus caras libres, como pastillas que se
tocan para sumarlas al contrato — la misma acción que tocar el mueble en el plano, por
el otro camino: el plano contesta «dónde queda» y la lista contesta «cuáles hay», y
según cuál de las dos preguntas traiga el proveedor uno arranca por un lado o por el
otro. Las que se liberan adentro del periodo van en naranja y con su fecha: es
inventario vendible —«te lo puedo dar desde el 25»— y esconderlo es dejar de ofrecer
cinco espacios de veinte. Con la ficha del contrato abierta los códigos se MUDAN de columna: la derecha
mide medio metro más que la izquierda y ese desnivel dejaba la esquina de abajo en gris,
así que van a la izquierda, debajo de la escalera, como panel propio —«Qué está libre»—.
Donde falta alto, que es también donde sirven: se sigue eligiendo espacios con el
contrato a medio llenar. A todo el ancho de esa columna las pastillas entran en una fila
por tipo y se leen de un golpe.

**Las dos columnas terminan a la misma altura**, y lo que absorbe la diferencia es
siempre el ÚLTIMO panel de la columna corta —la lista de precios a la derecha, la de
espacios libres a la izquierda—. Nunca la tarjeta del plano ni la escalera: ésas se
miden con su dibujo, y estirarlas les agrega blanco adentro.

**Cómo se mira sin backend.** `docs/maquetas/generadores/pantalla.mjs` sirve
`frontend/dist` y contesta `/api/*` con una sede sintética que lleva los ocho contratos
reales de NAVE. Lo que no está en el mapa de rutas contesta **404 y no `[]`** —así un
componente toma su camino de error en vez de recibir algo que parece un dato, que fue
exactamente el primer bicho que encontró—. Corre en tres modos: `admin`, `trabajador`
(replica lo que el servidor le borra a un mercaderista y verifica que **no le quede un
solo peso en pantalla**) y `ficha`.


#### El plano se mueve como el Editor 3D (2026-09-23)

El pedido del dueño, con tres capturas de TERRON: mover el mapa de Vender y de
Supervisar «de la misma manera que se mueve en el editor 3D» —sólo la cámara, sin la
primera persona ni el resto del editor—. Con eso vinieron tres detalles que se arreglaron
en el mismo cambio, y una segunda vuelta con dos correcciones suyas (ver *La segunda
vuelta*, al final de esta sección).

**La cámara es la del editor, en SVG.** `frontend/src/utils/camaraPlano.ts` replica el
`OrbitControls` de three.js que usa el editor, con sus mismas cuentas:

- Izquierdo **gira**; derecho —o izquierdo con Shift, Ctrl o ⌘— **mueve**; la rueda
  **acerca** (1/0,95 por clic, con la normalización de ruedas por línea y del pellizco del
  panel táctil); el botón del medio acerca arrastrando. Un dedo gira; dos acercan y mueven.
- Arrastrar el **alto** del lienzo entero es una vuelta (así lo hace OrbitControls). El
  lienzo del plano es más bajo que el del editor, así que el mismo arrastre gira un poco
  más: es la misma regla, no la misma cantidad de píxeles.
- Mover desliza el punto de mira sobre la pantalla (`screenSpacePanning`), y se gira
  alrededor de ese punto. El tope de abajo es el del editor (π/2,1). El de arriba NO: el
  editor no baja de 30° de la vertical y este plano deja llegar a 0° —la vista superior,
  orientada como el editor 2D— arrastrando hacia abajo.
- **Abre con el isométrico de siempre** (`VISTA_INICIAL`: azimut 45°, polar
  arccos(1/√3)), con las alturas achatadas al 55 % como las dibujaba la fórmula fija
  (`ALTURA`) y encuadrado igual: la caja proyectada más 26 unidades por lado, que era el
  viewBox. Los trazos van en unidades de aquel isométrico (`UNIDAD_ISO`). «Centrar» vuelve
  a esa vista.
- Lo que no se copió: la perspectiva. El plano es ortográfico —las medidas parejas en
  toda la sala— y acercar es escalar.

**Por qué SVG y no el lienzo de three.js.** Todo lo que cuelga del mapa —el rótulo que
mide 10,5 px a todo acercamiento y cede cuando no entra, el resaltado que apaga la sala
desde la tarifa y la escalera, la cara A o B que se toca, el tooltip— es SVG y se quedó
como estaba. Cambió sólo cómo se proyecta un punto. De paso el tablero no carga WebGL.

**El orden de pintado dejó de ser por centro.** El isométrico fijo ordenaba por `cx + cz`,
que falla con los muebles largos: una góndola de diez metros tiene el centro lejos de la
punta que tiene pegada, y con la cámara girando ese error aparece y desaparece según el
ángulo. `ordenDePintado` compara, para cada par que se toca EN PANTALLA, quién está
delante sobre una columna de pantalla que cruce a los dos —para prismas parados en el
mismo piso y cámara ortográfica eso decide quién tapa a quién— y ordena topológicamente.
`scripts/probar-camara.mjs` lo comprueba como un ojo: tira rayos contra los prismas en
cientos de salas y vistas al azar y compara lo que el rayo toca primero con lo que el
pintor dejó arriba. El orden por centro falla esa prueba.

**Qué se ve de cada mueble.** Los dos lados que dan a la cámara (desde arriba, ninguno:
sólo las tapas, el plano 2D pintado por disponibilidad): los largos son la cara que
se vende y llevan su color —el de −z (o −x) es la A, el otro la B; tocarlo elige esa
cara—; las cabeceras son el cuerpo. La luz viene de la izquierda de la pantalla y con la
cámara del isométrico de antes da las mismas sombras (0,14 y 0,26).

**La orientación es estado; el acercamiento, no.** Girar cambia qué lados se ven y en qué
orden se pintan, así que rehace la escena (un cuadro por vez: ~7 ms para 223 muebles).
Acercar y mover siguen siendo un `transform` escrito a mano sobre el grupo de la escena,
como antes. Los rótulos se miden una vez; al girar sólo se mueven sus anclas y se vuelven
a acomodar.

**El mismo plano en las dos pantallas.** Supervisar pasaba otras opciones —rótulos sólo
del elegido, alto por la proporción del dibujo, acercarse solo al mueble elegido— y el
mismo plano salía mucho más grande que en Vender. Ahora `IsoMap` no tiene opciones de
encuadre: las dos pantallas usan el mismo componente con los mismos rótulos y
herramientas, en una celda del mismo tamaño (ver la hoja de Supervisar, abajo). La
ayuda de los gestos («Arrastrá para girar · clic derecho para mover · rueda para
acercar») está hasta el primer gesto y se va.

**«Cuándo se libera cada espacio» ya no pisa letras** (`components/Libera/acomodo.ts`,
`scripts/probar-libera.mjs`). Un contrato que arrancaba al día siguiente —PUN-13 en la
captura— ponía su fecha y su chip contra el borde izquierdo, donde vivían «hoy · 23 sep»
y «PUN · PUNTA DE GÓNDOLA», y las tres se encimaban:

- La leyenda de los prefijos sube al renglón del título, a la derecha. En el renglón de
  los chips sólo hay chips.
- Cada fecha va con su columna de chips, siempre juntas, centradas en su día; se pueden
  correr a la derecha para esquivar la anterior, pero sin dejar de tapar su diente del
  peine. La que no entra se queda sin columna (su escalón y su cifra siguen, y el cursor
  la lee).
- «hoy · 23 sep» cede su lugar a la fecha del primer cambio. **No se acorta a «hoy»**: la
  primera versión lo hacía, y pegado a «24 sep» se leía «hoy 24 sep».
- Las cifras de los escalones no se tapan entre sí; la nota «sin cambios durante N días»
  sólo se escribe si termina antes del primer escalón.
- Con tres o más códigos el mismo día, el segundo renglón dice «+2 más» (y los enciende en
  el plano): el tercer renglón de antes se salía de la caja y no se veía.
- El chip de un contrato que ARRANCA va con el color de «Tomado». Iba con el de «Se
  libera», que decía lo contrario de lo que pasa ese día.

**«Estado por espacio», sin huecos y con filtro.** Proveedor no tenía ancho y se quedaba
con todo lo sobrante: mil píxeles para nombres de trescientos, y el estado a media
pantalla del proveedor. Ahora Tipo y Proveedor miden su texto más largo (con techo; el que
se pasa se corta con «…» y el nombre entero queda al pasar por encima), y la tabla
**llena su columna repartiendo el sobrante parejo** entre todas las columnas
(`utils/anchosTabla.ts`). Si falta lugar ceden primero Proveedor y después Tipo; las
cifras y las fechas no se cortan nunca. El encabezado lleva un **filtro de texto** que es
el MISMO que el del plano —escribir en uno escribe en los dos, así no pueden decir cosas
distintas— y el subtítulo cuenta «18 de 68 espacios». El filtro ahora encuentra también
por tipo («punta», «impulsador»). La tabla se desplaza dentro de su tarjeta con los
títulos de las columnas fijos arriba.

**La segunda vuelta (el mismo día).** El dueño devolvió dos cosas de la primera versión:

- *«Me cambiaste el tipo de gráfico para el mapa. Antes se veía mejor, ahora se ve más
  apretado y con mucho espacio a los lados.»* La primera versión abría desde arriba: una
  sede es un rectángulo de 1,3 : 1 y el panel mide 2,5 : 1, así que sobraban los dos
  costados; en isométrico la misma sede es un rombo de 2 : 1, la forma del panel. Se
  volvió al aspecto de antes —misma proyección, alturas, encuadre y trazos, comprobado
  contra la fórmula vieja en `probar-camara`— sin sacar los movimientos de cámara.
- *«La tabla quedó con un hueco grande a la derecha vacío. Miremos cómo reorganizar los
  módulos para que sea simétrico.»* La tabla apretada a la izquierda dejaba la mitad de
  una pantalla ancha en blanco. Supervisar pasó a ser **una hoja con la rejilla de
  Vender**: las mismas dos columnas (1004 : 402) y filas del alto del panel del plano
  (`--alto-plano`: 550/804 de lo que queda debajo de las barras, nunca menos de 448 px):

      el plano             │ para revisar (o la ficha del espacio elegido)
      estado por espacio   │ quién paga el canon

  Cada tarjeta tiene al lado otra de su misma altura y desplaza lo suyo. El plano mide
  en Supervisar exactamente lo que en Vender (1317 px de ancho a 1920). Para quien no ve
  plata no hay «quién paga el canon» y la tabla se queda con la fila entera. Por debajo
  de 1100 px de ancho, una sola columna, como Vender.

### Tres cosas que estaban rotas y no se veían

Salieron recorriendo la negociación completa como la haría una persona, no leyendo código:

- **Los archivos del contrato nunca aparecían.** El popover y el panel de detalle buscaban
  el espacio por el código **corto** (`PUN-04`) mientras la base lo guarda completo
  (`NAVE-PUN-04`), así que `by-code` contestaba 404 siempre y la sección se rendía en
  silencio. El corto además se repite entre sedes.
- **El error al guardar era invisible.** Salía al pie del formulario, debajo de la nota y
  fuera de la parte visible de la ficha, mientras el botón que lo provoca vive en la barra
  de abajo: se tocaba «Guardar», el backend rechazaba el choque de fechas y en pantalla no
  pasaba nada. Ahora sale en la barra, al lado del botón.
- **La planometría de un contrato futuro no se veía.** El endpoint respondía sólo por el
  contrato que corre hoy, así que el recién vendido para la temporada que viene —que es
  cuando más se consulta— no tenía ninguna. Ahora responde el vigente o, si no hay, el
  próximo. Los vencidos no: «así debe quedar» de algo ya desmontado no es una respuesta.

### Carga masiva desde una planilla

La temporada se negocia en una reunión y queda en un Excel con cuarenta filas. Cargarlas de
a una por el mapa es media tarde de trabajo y, peor, media tarde de oportunidades de
equivocarse.

**El archivo lo lee el navegador** (`frontend/src/utils/planilla.ts`, con la librería de
Excel que la app ya usaba para ver adjuntos) y al servidor le llegan filas en JSON. Así el
backend no aprende a abrir hojas de cálculo —una dependencia más para tres tiendas— y de
paso un CSV entra por el mismo camino sin escribir nada.

**Dos pasos, `validar` y `confirmar`** (`backend/app/routers/bulk_leases.py`):

- `validar` **no escribe nada**. Devuelve un veredicto por fila —qué mueble resolvió, qué le
  falta, con qué choca— para que la revisión ocurra antes de crear cuarenta contratos y
  disparar los correos. Una importación a ciegas que sale mal no se deshace con un botón.
- `confirmar` **vuelve a validar**: entre la revisión y el botón alguien pudo vender uno de
  esos espacios desde el mapa, y crearlo igual dejaría dos proveedores en la misma punta.
  Crea sólo lo que pasa; una fila mala no tira abajo las treinta y nueve buenas.

**La planilla es la que trae la gente, no un formato.** Los encabezados se reconocen por
sinónimos (`Código`/`Espacio`, `Renta`/`Valor mensual`, `Fecha inicio`/`Desde`), la fila de
títulos no tiene que ser la primera —las planillas suelen arrancar con un título—, y hay
plantilla descargable para quien la quiera.

Las fechas se leen **día primero**: `03/04/2026` es el 3 de abril. Es la convención local, y
leerlo al revés no falla ruidosamente: crea un contrato de tres meses en el mes equivocado
sin que nada avise. Los montos aceptan `$1.800.000`, `1800000` y `1,800,000`; un separador
único seguido de exactamente tres dígitos es de miles, porque `1.800` son mil ochocientos
pesos y no un peso con ochocientas milésimas.

**Qué se rechaza y qué sólo se avisa.** Error (la fila no entra): código que no existe en el
plano, mueble no comercializable, falta proveedor/valor/fechas, fechas al revés, choque con
un contrato existente, **choque con otra fila del mismo archivo** —el error más fácil de
cometer en una planilla y el más difícil de ver leyéndola—, **código ambiguo** y **falta la
sede**. Aviso (entra, pero se mira): el valor 15% o más por debajo de la tarifa de
referencia, un correo con formato dudoso —que se descarta en vez de guardarse mal— y **el
mueble que tiene un gemelo de nombre**.

### El código ambiguo, que es cómo un contrato terminaba en el mueble equivocado

Un mueble tiene dos nombres: el `code`, que es la llave con la que se guarda todo, y la
`nomenclatura`, el nombre que la persona escribe y que lo reemplaza **en pantalla**. La
planilla resolvía sólo contra el `code`. Entonces quien leía el plano, veía «IMP-08» y
escribía «IMP-08», mandaba el contrato al mueble cuyo código es IMP-08 — que no es el que
estaba mirando, porque el que el plano dibuja «IMP-08» tiene por código IMP-12.

En CIUDAD JARDIN se renumeró a mano una corrida de impulsadores. Correr números dentro de un
conjunto cerrado garantiza que **cada nombre nuevo sea el código viejo de otro**: seis de
seis. Reproducido de punta a punta por la pantalla real, incluida la parte que importa: se
vendió dos veces lo que para quien mira el plano es el mismo espacio, a dos proveedores, con
las mismas fechas, y ninguna validación se quejó. El choque de fechas existe y funciona —con
el plano limpio rechaza la segunda venta—; lo que lo esquiva es que el nombre que se lee y la
llave que une sean dos cosas.

**Un texto ambiguo no entra.** Si lo tecleado es el `code` de un mueble **y** el nombre
dibujado de otro, la fila se rechaza y el mensaje ofrece **los dos caminos con su código
completo**, primero el que el plano dibuja con ese texto. El consejo importa tanto como el
rechazo: la primera versión decía «escribí el código completo» a secas, y seguirlo llevaba
derecho al mueble equivocado. Un mensaje que manda a la trampa es peor que ninguno.

**El código completo desempata, y por eso avisa en vez de rechazar.** `CIUDAD JARDIN-IMP-08`
identifica un mueble sin ambigüedad, así que entra — rechazarlo dejaría seis muebles
imposibles de contratar y rompería Vender, que manda siempre el código completo. Pero el
mueble al que lleva tiene un gemelo de nombre, así que la fila sale en ámbar diciendo a cuál
va y cuál es el otro. La pregunta que hace el aviso no es la del rechazo: el rechazo pregunta
por el **texto** tecleado, el aviso por el **mueble** resuelto. Preguntar sólo por el texto
dejaba pasar justo el camino que el rechazo recomendaba.

**Los avisos no se abaratan.** Con el plano sano, una tanda normal sigue dando cero avisos —
medido contra el código anterior a la fase, con los dos servidores en paralelo y la misma
planilla. Un aviso que sale en todas las filas entrena a la gente a ignorarlo, que es la misma
razón por la que «proveedor nuevo» no pinta la fila.

**La sede, que era un agujero aparte.** Sin sede el código quedaba corto y creaba **un segundo
espacio para el mismo mueble físico**, con su propio contrato y ciego al choque del otro: una
doble venta literal, sin ningún renombre de por medio. Ahora la fila sin sede no entra, el
código completo se arma con la sede **del mueble encontrado** y la sede de otra tienda se
rechaza diciendo dónde sí existe ese código.

**El eco de la revisión muestra lo que la persona reconoce.** Devolvía el `label` del tipo
—«Impulsador Marca», idéntico en los once impulsadores— y el código que la persona acababa de
teclear: dos campos indistinguibles entre el mueble correcto y el equivocado. Ahora devuelve
además `nombre_dibujado`, que es el único que los distingue, y la revisión lo muestra en su
propia columna.

**Y lo que ya está mal se ve.** «Revisar antes de negociar» no recibía el campo del nombre y
declaraba limpio un plano con cuatro nombres repetidos; ahora los lista, junto con los que
pisan el código de otro, y lista además los **contratos vigentes cuyo mueble se dibuja con
otro nombre**, con proveedor, fechas, código real y nombre dibujado. Ninguna validación nueva
bloquea el guardado de un plano que ya está mal: se avisa, no se traba, o CIUDAD JARDIN
quedaría sin poder guardarse.

**Lo que esta fase NO hace, y por qué.** No renombra el `code` de verdad: arrastra
`spaces.code` y `spaces.svg_id` (los dos UNIQUE), `mount_confirmations.space_code`, los
enlaces de montaje y el histórico de la plataforma, y este proyecto no migra. Y no resuelve la
planilla por nomenclatura, porque en el plano medido las seis nomenclaturas son ambiguas
contra un código ajeno: sola, esa opción deja seis filas que no se pueden cargar. El camino
para tener **un solo nombre** es otro y va aparte: que el `code` sea un identificador interno
que nadie ve, que el nombre sea único contra los nombres **y** los códigos de la sede, y que
todas las pantallas dibujen el nombre. Ahí renombrar propaga gratis, porque nada se une por el
nombre.

**Lo que queda abierto.** `PUT /layout/{sede}` acepta la lista de muebles sin mirar
(`schemas/layout.py`), así que la prohibición de crear un nombre que pisa un código ajeno vive
sólo en el navegador. El guardarraíl de servidor no puede ser «rechazar los choques» sino «no
aceptar choques **nuevos**», comparando contra el snapshot anterior; si no, un plano que ya
está mal deja de poder guardarse.

### Un solo nombre (fase 13): el código ES el nombre

La fase 12 administró el problema; ésta lo elimina. El dueño lo dijo mejor que el
diseño anterior: «¿no es mejor que el sistema asigne la nomenclatura
automáticamente por defecto, evitando repetirla, y que si edito el nombre solo me
deje ponerle uno que no exista, y que se cambie en todas las pantallas?».

Lo que lo hizo posible fue un dato del negocio, no una idea: **los contratos
cargados eran de prueba**. Mover el `code` arrastra `spaces.code` y
`spaces.svg_id` (los dos UNIQUE), `mount_confirmations.space_code` y el histórico
de la plataforma; con datos reales encima eso pesa, con datos de prueba no. Así
que se hizo lo correcto: **se eliminó `nomenclatura` y el `code` pasó a ser el
nombre**. Con un solo campo, el nombre es igual en todas las pantallas por
construcción, no porque alguien se acuerde de sincronizarlas.

**La renumeración.** El dueño pidió renumerar parejo las seis sedes siguiendo el
recorrido del plano, sin agregar ni borrar un mueble. Vive en
`services/renumeracion.py` con dos pasos, como la carga masiva y por la misma
razón: `previo` no escribe nada y devuelve la tabla completa antes → después;
`aplicar` escribe todo en una transacción.

**La regla de recorrido no se inventó: ya estaba medida.** Se agrupa en bandas
sobre el eje perpendicular al que se camina y se ordena dentro de cada banda. Eso
es lo mismo que hace `utils/pasillos.ts` para deducir las corridas, y §«Pasillos»
registra que ahí «el resultado coincide con lo que hizo la persona a mano: nueve
de las diez corridas calzan exactamente». Quien numeró el plano caminó pasillo
por pasillo; copiar eso es más honesto que inventar una regla y esperar que
coincida. Prueba independiente: el verificador numeró tres planos a mano como
caminaría la tienda y la renumeración dio **cero cambios** en los tres.

**Los invariantes se afirman en el código, no sólo en las pruebas.** Si el conteo
por sede cambia, si el conjunto de `id` no es el mismo, o si alguna coordenada se
movió, la operación **falla entera y no escribe nada**. El `id` del mueble es la
identidad real a través de la renumeración; el nombre es sólo cómo se lo llama.
Medido sobre seis sedes y 92 muebles, comparando 18 campos mueble por mueble:
cero diferencias.

**Los dos UNIQUE y la rotación pura.** Renumerar suele ser una permutación, y una
permutación choca a mitad de camino contra `spaces.code`/`svg_id`: se resuelve
con valores temporales en dos pasadas dentro de una transacción. Probado con
nueve góndolas cuyos nombres forman un ciclo, con contrato encima de las nueve.

**El sistema recuerda cómo se llamaba cada mueble**, en la tabla propia
`renumeracion_nombres` (una fila por mueble y por corrida) y **no** en un campo
más del mueble: un segundo campo de nombre adentro del mueble es exactamente la
clase de error que esta fase eliminó, y además se pisaría en la segunda
renumeración, perdiendo el original —que es el que dice el cartel—. Llega a la
pantalla como campo **derivado** al leer y se saca al escribir, así que el plano
guardado sigue teniendo un solo nombre. De la cadena se devuelve la punta más
vieja: la pregunta real es «qué dice el papel que tengo en la mano», y un nombre
intermedio nunca estuvo escrito en una pared.

Sin ese recuerdo, la reconciliación —«contratos para revisar uno por uno»— se
vaciaba **justo después de renumerar**, que es el único momento en que hace
falta: la tienda todavía tiene la cartelería vieja. Es el hallazgo que más caro
salía y no se veía en ninguna prueba verde.

**El papel es la mitad del valor.** El informe se imprime en A4 sin controles,
agrupado por sede, ordenado como se camina el plano, con una casilla por renglón
para tachar contra la cartelería y con las cifras a la vista: cuántos muebles hay,
cuántos cambian, cuántos se agregan (cero) y cuántos se borran (cero). Sin él,
renumerar deja el plano y el local hablando idiomas distintos.

**El guardarraíl de servidor**, que la fase 12 dejó abierto: `PUT /layout/{sede}`
rechaza los choques **nuevos** comparando cuentas contra el snapshot anterior. Se
comparan cuentas y no pares, y por eso el intercambio y las cadenas de renombres
pasan: la cuenta de cada nombre no sube. Un plano que ya está mal se sigue
guardando, y uno que llega por primera vez entra aunque venga sucio —así llega un
plano existente, y trabarlo lo haría inimportable, no más seguro—.

**El intercambio existe porque la regla sin él es impracticable.** Renumerar una
corrida a mano es una rotación, y «no puede existir» bloquea cada paso: para
llamar «IMP-08» al mueble IMP-12 hay que liberar antes ese nombre. Los tres
caminos de renombre ofrecen intercambiar como una sola operación.

**Dos errores de mensaje que valen como regla.** Un rechazo que aconseja mal es
peor que ninguno: la primera versión del mensaje ambiguo decía «escribí el código
completo» y seguirlo llevaba derecho al mueble equivocado. Y un rechazo por regla
que se pinta como falla de red —el 409 se mostraba como «Sin conexión» con un
ícono de nube tachada— le esconde a la persona la explicación que el servidor ya
le dio.

**Y una trampa de medición, anotada para el que vuelva.** La reconciliación se
alimenta de los campos comerciales desnormalizados en el mueble del layout, no de
`space_leases`: cargar contratos por la API no los escribe en el plano y la
sección no aparece. Hay que cargarlos por la pantalla de Planilla. La primera
medición de esto dio un falso negativo por eso.


Acá se es **más estricto que en el alta de a uno**: ahí un código sin mueble en el plano se
acepta —hay filas sembradas y muebles borrados después del contrato— pero en una planilla es
un tipeo, y crearlo callado deja un contrato colgado de un espacio fantasma que nadie va a
montar.

«Proveedor nuevo» se dice pero **no pinta la fila**. En una planilla de temporada casi todos
lo son, y cuarenta filas en amarillo entrenan a la gente a ignorar el amarillo —que es el
color reservado para lo que sí hay que mirar—.

**El proveedor se reconoce sin mayúsculas ni espacios de más, en la revisión y al
confirmar.** La revisión ya comparaba así, pero `confirmar` buscaba el nombre exacto: con
«BIC» cargado, una fila «Bic» no avisaba «Proveedor nuevo» y al confirmar creaba en
silencio un segundo proveedor. Eso parte el historial y hacía que la limpieza de fotos
tomara la renovación por otro proveedor. Desde 2026-10-10 `confirmar` reusa el que la
revisión reconoció (si ya hay dos que sólo difieren en mayúsculas, el más viejo), y la
constancia va al proveedor del contrato creado, no al nombre escrito en la fila.

**Los avisos van agrupados**: un correo al comercial con la tanda completa, uno al
mercaderista con la lista a montar (sin valores) y una constancia por proveedor con todos
sus espacios. Cuarenta contratos por el camino de a uno serían ciento veinte correos en un
minuto: nadie los lee y el proveedor de correo los trata como spam.

Tope de 300 filas por archivo. No es una limitación técnica: una planilla que no se puede
revisar en pantalla no se puede aprobar con criterio.

### La planometría

Cómo debe quedar armada la exhibición: la foto o el PDF que manda el proveedor.
**Cuelga del contrato, no del mueble** (`lease_files`, tabla nueva).

La misma punta de góndola recibe una planometría distinta cada vez que se alquila —cambia
con el proveedor y con la temporada—, así que guardada en el mueble habría **un solo
casillero que se sobreescribe**: al entrar Nutresa se pierde la de Alpina, y con ella la
única prueba de qué se acordó armar en septiembre. Colgada del contrato, cada acuerdo
lleva la suya y el histórico queda.

Tabla propia y no `space_files` con una marca en el nombre, aunque eso ya se hizo una vez
para las fotos de montaje: `list_face_images` toma la imagen más reciente de un espacio
para pintar el panel del 3D, y una planometría ahí adentro volvería a secuestrar las artes
del proveedor. Con tabla propia eso es imposible por construcción, no por convención.

Quién la ve, y por dónde llega:

| Quién | Cuándo | Cómo la encuentra |
|---|---|---|
| Admin | al cerrar el trato | la adjunta en el formulario; se sube después de crear el contrato |
| Admin | después | detalle del espacio en Supervisar — puede cambiarla o quitarla |
| Mercaderista | al montar | `GET /planometrias/por-espacio/{code}` |

El mercaderista llega **por el código del espacio**, no por el id del contrato: el enlace
del correo trae el código y no tiene por qué saber que existen contratos. El backend hace
el salto espacio → contrato **que corre hoy** → archivo, y por fechas y no por la bandera
`is_active`, que se queda en True desde que el contrato se crea.

Detalles que se ganaron el lugar:

- **Una por contrato.** Cargar otra reemplaza la anterior: dos verdades sobre cómo debe
  quedar el mismo mueble es justo lo que este archivo existe para evitar.
- **Si la subida falla, el contrato igual queda.** Ya se guardó y los correos ya salieron;
  se avisa en la confirmación y se puede cargar después desde el detalle del espacio. Ese
  mismo camino es el único que tienen los contratos anteriores a que esto existiera.
- **Se acepta PDF además de imagen.** La mitad de los proveedores manda la exhibición en
  PDF. El filtro compara contra una lista **cerrada** y nunca contra `image/*`: un SVG es
  una imagen para el navegador y un documento con scripts para todo lo demás, y esto se
  sirve inline desde el mismo origen que la app.
- **El archivo dura lo que dura el contrato y sus renovaciones** (desde el 2026-10-10;
  antes no se borraba nunca). Cinco días después de que el último contrato de la cadena
  termina sin renovación, la limpieza del mantenimiento lo borra junto con las fotos de
  montaje — con el interruptor `LIMPIAR_FOTOS_VENCIDAS` prendido. Ver *Las fotos duran
  lo que dura el contrato*.

### Cancelar un contrato

`DELETE /spaces/{id}/leases/{id}` existía desde siempre y **ninguna pantalla lo llamaba**.
El agujero se veía en el propio mensaje de choque de fechas —«Cancelalo primero o ajustá
las fechas»— que mandaba a hacer algo que la aplicación no permitía.

Ahora está en el detalle del espacio (Supervisar → tocar el mueble → Ver todo), sólo para
admin y con confirmación. Cancela el que corre hoy o, si no hay, **el que ya está firmado
y todavía no arranca**: ése es el que hay que soltar cuando un proveedor se cae antes de
empezar, y era el más difícil de alcanzar porque su id no salía en ninguna respuesta —
`SpaceOut` ahora expone `upcoming_lease`, que sale de una property del modelo y **no es
una columna nueva**. La redacción para el mercaderista cubre las dos: agregar el próximo
sin tacharle el valor habría abierto por la ventana lo que la app cierra por la puerta.

Al cancelar **ya no se escribe nada en el layout**: el contrato era una fila y ya no
está, y el mapa se pinta de la base. (Hasta el cambio de *Una sola verdad para lo
comercial*, acá había que parchear el JSON o el mueble seguía pintado como vendido.) El
reporte de montaje **no se borra nunca**. La planometría y la foto del montaje sí, pero no
al cancelar: el contrato cancelado cuenta hasta su fecha de fin ORIGINAL —no hay columna de
fecha de baja, y adivinarla borraría antes— y cinco días después, si no hubo renovación, se
van con la limpieza de *Las fotos duran lo que dura el contrato*.

### Una sola verdad para lo comercial

El cambio más grande del proyecto y el que elimina una familia entera de bugs, no uno.

**De dónde salió.** El dueño reportó dos cosas mirando la pantalla real: *«no me deja
alquilar la IMP-17 que está libre, el sistema la toma como ocupada y no tiene ningún
contrato»* y *«aún colocando el precio del contrato me salía que estaba en 0»*. El
segundo era un efecto que mandaba un campo que no miraba. El primero no tenía un culpable:
la base tenía el contrato y el plano no, **y los dos decían la verdad que conocían**.

**La causa.** El mismo hecho estaba escrito dos veces —en `space_leases` y adentro del
JSON del layout— y nada los obligaba a coincidir. El plano NUNCA le escribió a la base:
no es un olvido, es que ese camino no existe. La dirección que sí existía —de la base al
plano— la hacía **el navegador, por cortesía**: al vender, al cancelar y al subir una
planilla, la pantalla parcheaba el JSON y lo guardaba. Si esa pestaña se cerraba antes,
o guardaba sobre la sede equivocada, el desfase quedaba para siempre.

**La auditoría.** Antes de decidir nada se escribió `scripts/auditar_desfase.py`, que
lee las dos y mira **las dos direcciones**. Encontró que toda edición del plano que saca
un espacio de circulación deja su contrato vivo: borrar el mueble, pasar la góndola de
doble a simple y marcarlo no comercializable. Ninguna avisaba. Y encontró la dirección
contraria, que es la que decidió la arquitectura: **contratos que viven SÓLO en el JSON**,
sin fila en ninguna tabla — no salen en ningún reporte, no generan aviso de vencimiento y
no existen para nada que consulte la base.

**La decisión, y lo que la hizo posible.** Dijo el dueño: *«actualmente no hay nada real
que merezca la pena mantener; si es necesario tocar todos los muebles y todos los
contratos, hazlo»*. Sin datos reales encima, el corte se pudo hacer entero de una vez.

**El corte, en orden.**

1. `GET /api/spaces/comercial` devuelve, por código completo, lo que la base sabe. Manda
   el contrato que corre hoy; si no hay, el firmado que todavía no arranca —eso es
   *comprometido*, no libre, y venderlo encima sería venderlo dos veces—. Un vencido no
   manda. También reporta «reservado» y «en mantenimiento», que no son plata pero tampoco
   son libre. La plata no sale para un mercaderista.
2. `scripts/importar_contratos_del_plano.py` pasa a la base lo que vivía sólo en el JSON.
   Una sola corrida, idempotente, con `--ensayo` primero. Lo que no se puede importar
   —sin proveedor o sin fechas, que en la base son obligatorios— se **reporta**;
   inventarlo sería peor.
3. `PUT /api/layout/{sede}` descarta los siete campos de contrato. En silencio, no con un
   rechazo: una pestaña abierta desde antes del despliegue los sigue mandando, y trabarle
   el plano sería romperle el trabajo por algo que no puede entender ni arreglar.
4. El store fusiona al leer, y el poll mira lo comercial aparte: vender o cancelar no
   cambia ninguna revisión de plano, así que atarlo a la adopción dejaba una venta hecha
   en otro equipo sin aparecer nunca.
5. Vender, cancelar, la planilla y los selectores de estado dejan de parchear y recargan.
6. Las tres puertas se cierran en el guardado del plano (409 `contratos_vivos`).

**Lo que queda del auditor, y dónde se ve.** Sigue haciendo falta: lo que ya está
desfasado en producción se guardó antes de que el guardarraíl existiera y nadie lo va a
arreglar solo.

La auditoría **vive en la pantalla**, en Supervisar → «Para revisar» → *Contrato sin
mueble en el plano*. Sale el espacio, la sede, el proveedor y hasta cuándo va, y se
resuelve ahí mismo: o se dibuja el mueble con ese código —y el contrato aparece solo— o
se cancela, con el botón que ya sabe nombrar lo que encuentra cuando el plano no lo
tiene.

No necesita consola ni credenciales, y ésa es la razón de que se calcule en el navegador
y no con el script: **el store ya bajó todo lo que hace falta**. `fetchAllLayouts` trae
todos los planos y `fetchEstadoComercial` el mapa comercial entero, porque los necesita
para pintar; la auditoría es una resta entre dos cosas que ya están en memoria
(`utils/auditoriaDesfase.ts`). La consola del servicio en Render, que es donde correría
el script, es un plan pago. Y de paso deja de ser una corrida que alguien tiene que
acordarse de hacer.

`backend/scripts/auditar_desfase.py` se queda igual, sin cambios: sólo lee, ve las DOS
direcciones y sirve donde sí haya consola.

**La otra dirección también se resuelve desde la pantalla**, en la misma tarjeta:
*Contrato que sólo vive en el plano*. Ésa el navegador NO la puede calcular —la fusión
reemplaza lo comercial con lo que dice la base, así que un contrato que sólo está en el
JSON desaparece antes de que ninguna pantalla lo mire—, así que se le pregunta al
servidor, que es el único que ve el snapshot crudo:

- `GET /api/layout/importacion/previo` — qué habría para importar. **No escribe una
  fila.** Se pide sola al abrir Supervisar, una vez por sesión y sólo para un admin.
- `POST /api/layout/importacion/aplicar` — lo escribe, todo en una transacción.
  Idempotente, así que el botón se puede apretar dos veces sin miedo. Queda en la
  bitácora como `contrato.importado`: esto CREA contratos, que es plata.

Los dos pasos son la misma forma que la renumeración y por la misma razón: lo que
escribe contratos se mira antes de escribirlo. Y lo que no se puede importar —sin
proveedor o sin fechas, que en `space_leases` son obligatorias— se muestra aparte con el
motivo dicho para que se pueda arreglar («le falta el proveedor»). Rellenarlo con algo
plausible sería fabricar un contrato que nadie firmó.

**La lógica vive en `app/services/importar_del_plano.py`**, y el script pasó a ser una
cáscara de consola sobre ella. Tener dos implementaciones de algo que escribe contratos
era justo la clase de duplicación que este cambio viene sacando.

Es una migración de **una sola vez**: desde el corte el layout no puede guardar un
contrato nuevo, así que en cuanto se importe lo que había, esto contesta vacío para
siempre y la sección no vuelve a aparecer.

`espacios_ofrecidos` (servidor) y `espaciosOfrecidos` (navegador) tienen que contestar lo
mismo: el primero decide qué se FRENA al guardar y el segundo qué se AVISA en la
pantalla. Hay pruebas que atan las tres decisiones —tipo, bandera `rentable` y cara B—
para que no se separen en silencio.

**Lo que ninguna fusión arregla**, y por eso se avisa: un contrato sobre un espacio que
NINGÚN plano dibuja. Ahí no hay nada que pintar. Después de una carga por planilla,
`utils/espaciosSinMueble.ts` los nombra uno por uno.

**La prueba que cierra el cambio** es `tests/test_punta_a_punta.py`: dibuja dos tiendas,
vende, sube una planilla que las cruza, choca contra las tres puertas, cancela, retira un
espacio a mano — y le pregunta al auditor. Una sola verdad quiere decir que después de
usar todo, el auditor da cero.

### El contrato tiene un solo dueño

El contrato se llenaba en **tres** lugares: el panel del plano 2D, el panel del editor 3D
y la pantalla de venta. Los dos primeros ya no lo hacen, y no era una duplicación inocente:

- los campos escribían el **JSON del layout** sin tocar la base, así que se podía dejar un
  proveedor y un valor puestos en el mapa sin que existiera ningún `SpaceLease`;
- el botón "Guardar contrato" llamaba a `createLease` **cada vez que se tocaba**. No editaba
  nada: corregir una fecha y volver a guardar creaba un segundo contrato sobre el mismo
  espacio. No hay endpoint de edición de contratos —sólo alta y baja—, así que la
  "edición" que se perdió al sacarlos nunca existió.

Ahora la división es por lo que cada pantalla sabe:

| | Plano 2D · Editor 3D | Sede → Vender |
|---|---|---|
| Diseño | destino, sede, nomenclatura, dimensiones, rotación, artes/archivos, observación | — |
| Comercial | lo contratado, **de sólo lectura**, con un puntero a dónde se cambia | proveedor, marca, correo, valor, fechas, nota |

El panel del plano muestra quién tiene el espacio, hasta cuándo y por cuánto (esto último
sólo para el admin), y dice que se cambia en Sede → Vender. El editor 3D, igual.

**Las pestañas dicen para qué sirven.** Los nombres solos no alcanzaban —"Plano" y
"Editor 3D" suenan a lo mismo, y desde ninguno se adivina que el contrato se llenaba ahí
adentro—. Hay una frase en el tooltip de cada una y una línea que separa el trabajo diario
(Sede · Montajes) del diseño de la tienda (Plano · Editor 3D), que es donde se entra una
vez cada tanto. El admin aterriza en **Sede**, modo Vender.

**El correo del proveedor ya se puede cargar.** El formulario lo pide, y
`/suppliers/find-or-create` **completa** el que falta sin pisar el que ya está. Antes no
había forma de cargarlo desde la interfaz, así que el tercer aviso —la constancia al
proveedor— no salía nunca.

### Pantalla de negociación: del contrato al montaje

Guardar un contrato ya no termina en la base: dispara **tres correos distintos según a
quién le sirve qué** (`backend/app/routers/spaces.py`).

- **Comercial** (administrador de sede, gerente operacional): el contrato completo, con
  el valor.
- **Montaje** (el mercaderista): el mismo espacio **sin un solo monto**, y un enlace
  directo `.../?montar=SEDE-CODE`.
- **Proveedor**, si tiene correo cargado: confirmación de lo suyo.

Los destinatarios viven en `app_config` bajo `notify_contacts`, por sede y por rol
(`backend/app/services/contacts.py`), y se editan desde Configuración. Si están vacíos
cae al `notify_emails` de siempre.

El enlace abre `MountView` (`frontend/src/pages/MountView.tsx`) en el celular: tarjetas
grandes ordenadas por urgencia — lo que ya arrancó primero —, dos botones del tamaño de
un pulgar y la cámara a un toque. El worker es el único rol que escribe algo en el
sistema, y solo esto: `POST /mounts/`. Un "no pude" **exige motivo**, porque sin motivo no
se sabe a quién reclamarle.

**Dónde queda.** Antes de preguntar nada, la pantalla muestra el plano de la tienda con el
mueble señalado (`components/MiniMapa/`) y la ubicación escrita — *"A unos 4 m de las
cajas"*. Tres decisiones que vale la pena conservar:

- **Cenital, no isométrico.** El mapa isométrico del Dashboard extruye por altura y pinta
  de atrás hacia adelante, así que tapa justo los muebles chicos —bateas, ristras— que son
  los que cuesta encontrar. Y para "estoy acá, tengo que llegar allá" la convención que
  todo el mundo ya sabe leer es la del directorio de centro comercial.
- **El alto sale de la forma de la planta**, no es fijo. Con alto fijo, una tienda larga y
  angosta —la forma normal de un supermercado— se dibujaba a menos de 5 px por metro y una
  punta de góndola quedaba de cuatro píxeles: se veía, no se podía usar.
- **Las referencias salen de los datos, no del aire.** Las cajas y las neveras se etiquetan
  porque existen como muebles. No hay flecha de norte ni "entrada" porque el sistema no
  guarda ninguna de las dos cosas, y ponerlas sería inventarle información a alguien que
  está parado en un pasillo.

El mapa busca por el código CRUDO del mueble contra el mismo arreglo del que salió, nunca
por el `SEDE-CODE`: la nomenclatura corta se repite entre tiendas y buscar suelto devuelve
el mueble de la sede equivocada. Si el mueble no está en el layout —contrato sobre un
espacio que después se borró del plano— el mapa se omite entero en vez de mostrar uno que
no señala nada.

**La distancia se mide de borde a borde, nunca de centro a centro.** No es una sutileza de
implementación: en NAVE la pared de refrigerados está dibujada como UN mueble de 26 m de
ancho, así que su centro queda a media tienda de sus propios extremos. Midiendo al centro,
a una punta que está a 3 m de la nevera se le decía "a 8 m" — y con esa frase se camina
para el lado equivocado. Con los datos reales de NAVE, el centro se equivocaba en **11 de
los 19** espacios alquilables. Por lo mismo el encuadre del plano usa la huella de cada eje
por separado: usar `max(w, d)` para los dos lados —que parecía lo seguro— inflaba el
recinto al doble de alto por culpa de ese mismo mueble, y dibujaba todo más chico de lo
necesario justo donde hay que encontrar una punta de 90 cm.

El correo de montaje lleva la ubicación **escrita**, no dibujada: Gmail descarta el SVG
embebido, un PNG obligaría a rasterizar en el servidor y una imagen servida por la app
pediría token. El texto llega intacto a cualquier cliente, y el plano vive del otro lado
del enlace. La frase la calcula `describe_location` en `services/layout_lookup.py`, que
espeja `describirUbicacion` del cliente — si las dos se separan, el mercaderista lee una
cosa en el correo y otra en la pantalla.

**La foto es obligatoria** cuando se reporta "montado", en el servidor y en la pantalla:
"montado" sin foto es una afirmación sin respaldo, y es exactamente lo que el proveedor
discute meses después. Al "no pude" **no** se le exige: si el material nunca llegó puede no
haber qué fotografiar, y dejar sin reportar un problema es peor que quedarse sin la foto.

Alrededor de esa regla hay cuatro defensas, todas porque bloquear al mercaderista es peor
que no tener la función:

- Se aceptan **HEIC/HEIF**: es lo que sale de un iPhone cuando iOS no convierte al subir.
  Rechazarlo dejaría a esa persona sin poder reportar nada desde su propio teléfono.
- La foto se **reduce en el navegador** a 1600 px y JPEG antes de salir (`utils/foto.ts`),
  con red: ante cualquier error se sube el original. Incluye un chequeo de lienzo uniforme,
  porque un HEIC que no se decodifica no lanza error — produce un JPEG negro perfectamente
  válido, y eso es peor que un rechazo: la prueba queda guardada y no muestra nada.
- Hay **timeout de subida**; sin él, una conexión colgada dejaba el botón muerto para
  siempre y la única salida era recargar, que perdía la foto.
- Se puede **elegir de la galería**, no solo tomarla: `capture` manda directo a la cámara y
  en Android saca la opción de galería, lo que dejaba atrapado a quien montó sin señal y
  volvió a reportar más tarde.

Y como la foto movida es lo más normal del mundo, el aviso de "ya se reportó" ofrece
**corregir el reporte**: el histórico guarda todos y vale el último. Sin eso, la prueba que
el proveedor va a discutir en tres meses queda siendo la primera que salió.

Dos detalles que no son obvios y que conviene no deshacer:

- **El tipo de archivo se valida contra una lista cerrada, nunca contra `image/*`.** Un SVG
  es una imagen para el navegador y un documento con scripts para todo lo demás; guardado
  como foto y servido inline desde el mismo origen que la aplicación, ejecutaría JavaScript
  con la sesión de quien lo abra.
- **La foto de montaje lleva un prefijo reservado en el nombre** (`montaje--`) y
  `list_face_images` la excluye. Se cuelga del mismo `Space` que las artes del proveedor, y
  el editor 3D usa la imagen *más reciente* de cada espacio como planograma: sin la marca,
  la foto del anaquel tomada de costado reemplazaba la textura de la góndola en la pantalla
  del comercial — y con la foto obligatoria, en cada contrato.

Se guarda **una fila por reporte**, no una por espacio (tabla nueva `mount_confirmations`,
permitida por la regla: `create_all` sí crea tablas). El histórico de quién dijo qué y
cuándo es justamente lo que contesta cuando el proveedor reclama meses después. La hora la
pone el servidor: el EXIF de un celular se edita.

Borrar una sede **archiva** sus confirmaciones (`archivado_en`) en la misma transacción que
archiva sus contratos. No se borran —son prueba— pero dejan de contar: una sede recreada
con el mismo nombre reusa los mismos códigos y heredaría los "montado" de la anterior.
Cubierto en `backend/tests/test_mounts.py`.

### Bugs preexistentes corregidos

Los tres se encontraron levantando la app contra datos sembrados, no leyendo código:

- **El plano 2D subía un layout vacío** ~16 ms después de montar, antes de que llegara la
  respuesta del servidor. Desde un navegador con `localStorage` limpio, abrir la app
  **vaciaba la sede en el servidor**. Es la causa de fondo del problema de sincronización
  original: no es que los cambios no viajaran, es que el otro equipo los borraba al entrar.
- **El editor 3D borraba `faceB` y `nomenclatura`** de todos los fixtures con solo abrirse,
  y subía la pérdida.
- **El proxy de Vite quitaba el prefijo `/api`** que el backend sí monta, así que
  `npm run dev` nunca pudo hablar con un backend local.

---

### Qué hay de verdad en los planos (agosto 2026)

Medido contra producción, porque el mapa del montaje vale lo que valga la fidelidad del
plano y eso no se puede suponer:

| Sede | Muebles |
|---|---|
| NAVE | 104 |
| POBLADO | 104 |
| CENTRO | 48 |
| NORTE | 6 |
| ciudad jardin | 1 |
| TERRON | **0** |
| SUR | 0 |

**NAVE está a escala, y bien.** Huella de 42,4 × 15,8 m (669 m²), con los muebles ocupando
el 29 % del recinto — proporción normal de un supermercado con sus pasillos. El 92 % de los
muebles tiene medidas propias, no la del catálogo: alguien midió. Las coordenadas caen en
la grilla de 5 cm del editor (86 %) y **ninguna** en metros enteros, que es la firma de un
plano medido y no de uno acomodado para que se vea lindo. Solo 2 pares de góndolas se pisan
(GON-46/GON-48 y GON-60/GON-67) y no hay muebles apilados en la misma coordenada.

Dos cosas que conviene saber antes de tocar el mapa:

- **Los muebles largos se dibujaron como uno solo.** La pared de refrigerados es un único
  `nevera_refrescos` de 26,05 m; hay otro de 10,05 m y un `nevera_carnes` de 6,05 m. Es una
  representación razonable de una corrida continua, pero rompe cualquier cálculo que trate
  al mueble como un punto.
- **Hay 12 muebles de referencia** en NAVE (5 cajas, 3 neveras de refrescos, 3 stands de
  frutas, 1 mostrador de carnes), así que la frase de ubicación y las etiquetas del mapa
  tienen de dónde salir. En una sede donde solo se dibuje lo alquilable no habría ninguna:
  ahí el mapa sigue funcionando, pero sin etiquetas ni frase.

De los 104 muebles de NAVE, **19 son comercializables**. El resto es infraestructura, que es
justo lo que hace legible el mapa: contexto en gris y todo el color en el destino.

---

## El 3D asumía una tienda que no existe

El editor 3D nació con un local ficticio de **30 × 42 m anclado en el origen**, en dos
constantes: `STORE_W` y `STORE_D`. Todo colgaba de ahí — por dónde se puede caminar, dónde
se dibuja la grilla, hasta dónde llega el piso que recibe los clics, adónde apunta la luz.

Ninguna sede real cabe en esa caja. NAVE ocupa **47,4 × 20,8 m y empieza en x = −25,4**: de
sus 104 muebles, **48 (el 46 %) quedaban fuera** y eran literalmente inalcanzables a pie. La
mitad izquierda del supermercado no se podía visitar. Al mismo tiempo sobraban 30 m de piso
vacío hacia el fondo, porque la caja se estiraba hasta z = 44 donde la tienda termina en
13,3.

Ahora la extensión del local **se deduce de los muebles**, en `frontend/src/utils/planta.ts`.
El módulo es geometría pura y vive fuera del componente a propósito: así se puede probar sin
montar Three.js ni un navegador (`npm run probar:planta`, 15 pruebas).

**La huella de un mueble se calcula rotada.** El helper de colocación (`getAABB`) ignora
`rotY` porque los muebles se colocan sin girar, pero para caminar no se puede: 63 de los 104
muebles de NAVE son góndolas y la mayoría están giradas 90°. Sin la rotación, una góndola de
3,6 m de largo se lee como si midiera 0,9 m y uno la atraviesa caminando.

### Caminar

- **Los muebles frenan.** Antes no había colisión de ninguna clase: se atravesaban las
  góndolas. El choque se resuelve **por eje**, así que uno resbala a lo largo de la góndola
  en vez de clavarse contra ella.
- **El paso se mide en metros por segundo**, no por frame. Eran `0,08` por frame — a 60 fps,
  4,8 m/s, o sea trotando, y en una pantalla más rápida iba más rápido todavía. Ahora son
  1,4 m/s caminando y 3,2 con Shift.
- **El paso se recorre en tramos cortos** (`PASO_MAXIMO = 0,2 m`). El choque se mide punto a
  punto, así que un paso más largo que el obstáculo lo saltaba limpio. Hoy un paso dura como
  mucho 0,32 m y lo más delgado que hay —una columna de 30 cm— mide 0,86 m ya inflada por el
  radio del cuerpo, así que no pasaría; pero eso dependía de que nadie subiera la velocidad.
- **Se entra por un lugar libre.** El centro del local, o el primer punto despejado buscando
  en espiral: nadie aparece dentro de una góndola.
- **La Zona Libre se pisa.** Lo que mide menos de 25 cm de alto es una marca en el piso, no
  un obstáculo. Es una regla por altura, no una lista de tipos, así que un mueble bajo nuevo
  queda bien solo.
- **Quien queda dentro de un mueble puede salir.** Si alguien coloca una góndola encima
  mientras se camina, frenarlo ahí lo dejaría atrapado para siempre.

### Lo que se veía mal por lo mismo

- **La grilla y el piso que recibe clics** estaban centrados en la tienda ficticia. Un
  pedazo del local quedaba sin piso: hacer clic ahí no hacía nada.
- **Arrastrar un mueble** estaba topado en `x ≥ 0`, así que la mitad izquierda de una sede
  real no se podía editar.
- **La luz y su cámara de sombras** apuntaban al centro de la caja: la sombra se recortaba
  justo donde empieza la mitad izquierda de NAVE.
- **La advertencia de "góndola mural cerca de una pared"** salía siempre, porque medía
  contra x = 30 / z = 42 en vez de contra donde terminan los muebles.
- **El encuadre al abrir.** Una cámara guardada apuntando al centro de la tienda ficticia
  (15, 21) dejaba la sede arrinconada en una esquina de la pantalla. Ahora se reencuadra
  siempre que la mira caiga fuera del local; si el usuario la dejó adentro, se respeta.
- **Salir de la caminata no devolvía la vista.** Faltaban dos cosas que ya faltaban antes:
  `update()` en los controles —sin él la cámara conserva la rotación de la caminata y sigue
  mirando la góndola que uno tenía enfrente— y un `invalidate()`, porque el lienzo sólo
  renderiza bajo demanda y el cuadro nuevo nunca se dibujaba.

### El minimapa y el teletransporte

Lo que hace abandonar un recorrido en primera persona no es que se vea feo: es no
saber dónde uno está parado. El minimapa es el préstamo más directo que hay de los
videojuegos y resuelve exactamente eso.

**Es el mismo `MiniMapa` de la pantalla del montaje**, no uno nuevo. Se le agregaron dos
cosas y el resto quedó igual:

- `camara={{ x, z, dirX, dirZ }}` dibuja el "usted está aquí" con su cono de visión. Se le
  pasa el **vector** de dirección y no un ángulo a propósito: el 3D lo saca de
  `camera.getWorldDirection()` y así nadie tiene que acertarle desde afuera a la convención
  de Euler de Three.js.
- `onIrA(x, z)` vuelve el plano entero elegible **por posición y no por mueble**, y devuelve
  metros. Ése es el teletransporte.

`targetCode` pasó a ser opcional: la caminata no señala ningún mueble en particular.

**Dónde aterriza el salto.** En el lugar despejado más cercano a lo que se tocó
(`puntoLibreCerca`, el mismo que elige por dónde se entra). Quien apunta al medio de una
góndola quiere el pasillo de al lado, no que no pase nada. La mirada no se toca: uno salta,
no gira.

**Por qué el salto pide soltar el mouse.** Con el puntero capturado el navegador lo esconde
y manda todo al lienzo: no hay cursor que pueda tocar un `<div>`. Así que el minimapa
siempre orienta, pero sólo se vuelve clickeable con el mouse suelto — `Esc`, clic en el
plano, y clic en el lienzo para seguir caminando. Es el mismo patrón de cualquier juego que
abre el mapa grande soltando el control.

**Un bug que sólo se veía estando quieto.** El lienzo corre con `frameloop="demand"`:
dibuja cuando alguien se lo pide. `PointerLockControls` mueve la cámara en el `mousemove`,
fuera del bucle de cuadros, y nadie pedía el redibujo — así que **parado y mirando alrededor
la imagen quedaba congelada** hasta tocar una tecla de movimiento. Caminando no se notaba,
porque el propio paso pedía el cuadro. Se arregla enganchando `invalidate()` al `change` del
control.

**El minimapa no re-renderiza 60 veces por segundo.** La posición se informa sólo cuando uno
se movió más de 12 cm o giró lo suficiente; caminando eso son unas pocas veces por metro.

Y de paso: las etiquetas de referencia se calculaban 5 px por letra, pero van en negrita, en
mayúsculas y con `letter-spacing`. Con esa cuenta "CARNES" y "NEVERAS" pasaban el filtro de
choque en NAVE y se dibujaban una encima de la otra igual. Ahora son 6,5.

---

## Las cuatro del proveedor

El 3D dejó de ser una maqueta bonita: es con lo que se le muestra a un proveedor
qué está comprando.

### Ver la exhibición en 3D

Hay DOS puertas al 3D de un espacio, y no son la misma cosa:

- **Desde Supervisar**, un botón en la ficha de detalle lleva al **Editor 3D**
  encuadrando ese espacio (antes había que entrar a mano y buscarlo entre 104 muebles).
  Es la pantalla de la dueña: el editor entero, con lo que se puede tocar y guardar.
  Cambia de pestaña, y Supervisar no tiene contrato que perder.
- **Desde Vender**, «Ver en 3D» en la cabecera del contrato abre el **visor de venta**
  ENCIMA de la ficha, sin cambiar de pestaña: la misma escena de «Presentar», pero
  privada para el proveedor del contrato, sin poder escribir nada, con la prueba de
  producto en la ficha y la lámina sin período ni valor. Ver *Ver el diseño desde
  Vender*.

> **Corregido (2026-10-12, y otra vez el 13).** Este párrafo decía que el botón estaba
> también «en el formulario de negociación». Se fue de Vender en 31da515 (Fase 10, PR 2:
> la ficha de D se reescribió en `ModoVender.tsx` y `CabezaContrato` se fue entera, con
> el botón adentro) sin que nadie lo decidiera, y además ese camino no le sirve a
> Vender: el pedido viaja por `enfoque3D`, que **cambia de pestaña** y desmonta la hoja,
> y se perdía el contrato a medio llenar. Lo que dice abajo del encuadre, del pedido por
> el store y de la lámina («La lámina para el proveedor», con período y valor) es del
> EDITOR; el visor de Vender no usa `enfoque3D` ni la cámara guardada, y su lámina va
> sin plata.

El pedido viaja por el store (`enfoque3D`) porque la pantalla de sede y el editor 3D
son pestañas hermanas sin props entre ellas. Se identifica **por id de mueble y no
por código**: el código corto se repite entre sedes y a veces llega con el prefijo
puesto y a veces no.

**Cómo se calcula el encuadre.** En la caja de Three.js el orden de materiales es
`[+X, −X, +Y, −Y, +Z, −Z]`, y el editor pinta la cara A en el índice 5 y la B en el
4: la **cara A mira a −Z y la B a +Z** en coordenadas locales, y después el mueble
gira `rotY`. La cámara se para de ese lado, a la distancia que necesita el campo
visual para que la exhibición entre llena, y nunca por debajo de 1,65 m — una batea
de 80 cm mirada desde 40 parece una foto tomada en el piso.

Un detalle que costó una prueba: **la cara mide `w` × `h` siempre**. Es una cara de
la caja, abarca los ejes locales del mueble; girarlo cambia hacia dónde apunta, no
cuánto mide. No confundir con `huella`, que sí intercambia ancho y fondo porque
describe la caja alineada al mundo.

### Vistas guardadas por espacio

Con un mueble seleccionado, el panel derecho ofrece guardar la cámara actual como
**la** vista de ese espacio y esa cara. Al enfocarlo de nuevo abre en ese ángulo; sin
vista guardada, en el encuadre calculado. Se puede olvidar.

Vive en el JSON del layout (`vista3D` por mueble, por cara), así que viaja al
servidor y aparece en la laptop del que arma la propuesta. **Sin migración.**

Dos cuidados:

- La vuelta de los editores al store tiene que arrastrarla. Ninguno la modela, y
  **mover un mueble borraba todos los encuadres de la sede** y le mandaba la pérdida
  al servidor: primero en el 3D, que la arrastró con una línea, y hasta el
  2026-10-13 en el plano 2D. Desde entonces las dos vueltas conservan todo lo que no
  conocen (`utils/convertirPlano.ts`, ver *Reglas duras*).
- Guardar y borrar escriben el layout pero **no entran al historial**: que Ctrl+Z
  deshaga un encuadre de cámara mezcla dos cosas que no tienen nada que ver.

Se guarda la cámara ORBITAL. En primera persona la cámara no se persiste —la
caminata escribiría cientos de veces por recorrido— así que el botón lo avisa en vez
de guardar algo viejo.

### Antes / después del arte

Un interruptor en la barra apaga las artes del proveedor. El «antes» es el mueble
**pelado**: ni la foto ni el patrón de categoría, que es contra lo que se compara la
marca puesta.

### La lámina para el proveedor

El botón de captura bajaba un volcado crudo del lienzo. Un PNG suelto sin sede, sin
código de espacio y sin período no se puede adjuntar a nada: el que lo recibe no sabe
si es su punta de góndola o la de al lado.

Ahora, con un mueble elegido, saca **dos tomas desde la misma cámara** —sin arte y
con arte— y las compone con un pie que dice proveedor, categoría, período, valor y
mueble. La plata se tacha para el rol trabajador, igual que en el resto: una lámina
es un archivo que se reenvía.

Tres cosas que sólo se vieron mirando el archivo que salía:

- **El PNG salía en blanco.** El lienzo no se creó con `preserveDrawingBuffer`, así
  que el búfer se limpia al componer y un `toDataURL` suelto no lee nada. Hay que
  dibujar y leer en el mismo turno.
- **El gizmo y la caja de selección salían en la foto.** Apagarlos por estado de
  React deja la captura a merced de cuándo React confirma el cambio, y el gizmo
  aparecía en la primera de las dos tomas. Se marcan con `userData.chrome` y los
  esconde la propia captura, sincrónicamente.
- **Sin arte cargada las dos tomas salen idénticas.** Mostrar el mismo dibujo dos
  veces rotulado «Hoy» y «Con la marca» es mentirle al que recibe la lámina: ahí va
  una sola imagen.

### Y un gizmo que nunca se dibujó

`TransformControls` dejó de ser un `Object3D`: en three 0.184 extiende `Controls`, y
lo que va a la escena es su ayudante (`getHelper()`). El `as unknown as THREE.Object3D`
que había silenciaba el error de tipos pero no el de runtime — la escena rechazaba el
objeto y **la flecha para mover un mueble nunca se dibujó**. Sólo se veía al
seleccionar, que hasta ahora era raro; con «Ver en 3D» seleccionando solo, saltó a la
primera.

---

## El plano, que es donde empieza todo

De acá salen los espacios que se venden, el metraje que se cobra, el recorrido
que se le muestra al proveedor y el mapa con el que el mercaderista encuentra la
exhibición. Un error acá no se nota hasta que ya viajó a un contrato.

**El plano de NAVE está sano** — se midió antes de tocar nada: 104 muebles, 0
códigos repetidos, 0 prefijos mal puestos, se camina entero con hombro de 1,20 m
y sólo dos roces de 0,01 y 0,03 m². El problema no eran los datos: era que el
editor no protegía lo que alguien había hecho a mano.

### Una sola nomenclatura

Había dos, una por editor. El plano 2D generaba `GON-01` con `max + 1`; el editor
3D generaba `NAVE-GON-001` **contando** cuántos había. Contar no es lo mismo que
buscar el siguiente libre: con `GON-01` y `GON-03` en el plano, contaba 2 y
devolvía `GON-03` otra vez. **Dos muebles con el mismo código son dos espacios
compartiendo contratos, archivos y correos de montaje.**

Ahora viven en `utils/nomenclatura.ts`, los usan los dos editores, y el código
devuelto es el primer número **libre** —no `max + 1`, que bastaba una edición
manual para hacerlo chocar. La sede no va en el código: se antepone al guardar el
espacio (`fullSpaceCode`), que es donde hace falta que sea único entre sedes.

Editar un código a mano tampoco puede pisar a otro: el campo se tiñe y no cierra.

### Juntos sí, encima no

Los dos editores comparaban cajas **sin rotar**. El 2D zafaba porque intercambia
ancho y alto al girar, así que sus medidas ya vienen giradas; el 3D no, y la
mayoría de las góndolas de una sede real están giradas 90°: una de 3,6 × 0,9 se
leía como 0,9 de ancho y se podía soltar atravesada sobre otra.

Peor: en el 3D **el fantasma se pintaba rojo y el clic soltaba el mueble igual**.
El aviso era decorativo. El plano 2D siempre lo bloqueó.

La regla ahora es una y explícita, en `TOLERANCIA_CONTACTO` (2 cm):

- **Hasta 2 cm es contacto.** Una corrida se arma poniendo las góndolas al ras y
  eso tiene que salir siempre. Con «cero solape» bastaba el ruido de coma
  flotante de una rotación —`cos(90°)` da 6·10⁻¹⁷, no 0— para que el editor se
  negara a dejarlas juntas. Dos centímetros es menos que la grilla de 5 cm con la
  que se dibuja: por debajo de eso nadie lo puso ahí a propósito.
- **Por encima es un mueble sobre otro**, y se bloquea.

### Pasillos

Un supermercado no se recorre por códigos sueltos. Quien negocia dice «la punta
del pasillo 3», no «PUN-07».

El plano ya tenía esa estructura y el editor no la conocía: las 56 góndolas
principales de NAVE forman **10 corridas limpias**, y quien lo dibujó las numeró
en orden. `utils/pasillos.ts` lo deduce de la geometría agrupando por la
coordenada perpendicular, y el resultado **coincide con lo que hizo la persona a
mano**: nueve de las diez corridas calzan exactamente con los códigos existentes,
y cada pasillo recibe sus dos puntas, una por cabecera. Los 18 muebles sin
pasillo son la pared perimetral, las cajas y las zonas libres — que efectivamente
no están en ningún pasillo.

**No se guarda: se deduce.** Mover una góndola cambia su pasillo, y un dato
guardado se quedaría viejo sin que nadie se entere.

**El código no lleva el pasillo, a propósito.** El código es la llave de los
contratos, los archivos, los correos de montaje y los enlaces ya enviados:
renombrar `GON-17` a `P03-GON-05` huerfaniza todo eso y obliga a migrar `spaces`,
`space_files` y `space_leases`. El pasillo se muestra al lado.

### Revisar antes de negociar

Un botón en la barra del plano abre `utils/revision.ts`, que reporta:

| | |
|---|---|
| Códigos repetidos | error — dos espacios compartiendo historia |
| Muebles encimados | error arriba de 0,05 m², aviso debajo |
| Pasillos angostos | error si no pasa una persona (0,56 m), aviso si no pasa un carrito (0,90 m) |
| Prefijo que no corresponde al tipo | aviso |
| Piso encerrado entre muebles | aviso — se ve en el plano pero no se puede caminar |

Cada hallazgo salta al mueble. Sobre NAVE reporta exactamente los dos roces
reales y nada más; los huecos entre sus pasillos van de 1,30 a 2,80 m.

### Los atajos: por qué «a veces andaban»

**Duplicar fallaba para 11 de los 17 tipos del catálogo, en silencio.** `Ctrl+D`
desplazaba la copia 0,5 m en los dos ejes y la descartaba si chocaba. Una Góndola
Doble mide 0,90 × 0,90: la copia siempre se solapaba con su original, se tiraba, y
no pasaba nada ni se avisaba. Andaba sólo para los seis tipos que miden menos de
50 cm en alguno de sus lados (mural, punta, robatope, ristra, impulsador,
columna). De ahí el «a veces funciona».

Ahora la copia cae **al ras al lado**, que es para lo que se usa el atajo: seguir
armando una corrida. Si no hay lugar, lo dice.

**Pegar pegaba encima.** `Ctrl+V` probaba cinco desplazamientos en diagonal y, si
ninguno servía, pegaba igual sobre lo que hubiera. Ahora busca de verdad y el
grupo se mueve entero, así que media corrida copiada vuelve como media corrida.

**⌘Z no andaba en Mac.** Deshacer y rehacer miraban sólo `ctrlKey`, mientras que
⌘A, ⌘D, ⌘C y ⌘V sí aceptaban `metaKey`. Ahora todos aceptan los dos.

**`R` rotaba de más y de menos.** Sin guarda de modificadores, `Ctrl+R` (recargar)
también rotaba; y sólo giraba si había EXACTAMENTE un mueble elegido, así que con
dos o más no hacía nada y no decía por qué. Ahora exige que no haya modificadores
y gira toda la selección.

**El plano no tenía ningún aviso.** Un atajo que no hacía nada era indistinguible
de uno que no existía. Ahora cada acción confirma en pantalla —«3 muebles
duplicados», «No hay lugar libre cerca»— y borrar recuerda que `Ctrl+Z` existe.

### Dónde están escritos

Un botón **Atajos** en la barra del plano abre la lista completa, agrupada por
para qué sirve. La barra de estado muestra un resumen **sacado de la misma
constante**, así que no se pueden desfasar.

Antes la única ayuda era esa línea de la barra: con `white-space: nowrap` y
`text-overflow: ellipsis` se cortaba en una ventana angosta, y de entrada no
mencionaba deshacer, duplicar, copiar, pegar ni Escape. (Hay un `ZoneEditorPanel`
con una lista de atajos en `components/FloorMap/`: es código muerto, no lo importa
nadie.)

---

## El correo de un contrato

Un contrato dispara **tres** correos, uno por rol. Comercial y el proveedor, al guardarlo;
el de montaje, **cuando el contrato tiene su planometría** (y, en un porcentaje, su zona
confirmada), una vez — ver *El correo de montaje espera a la planometría* (PR 2):

| Para | Qué lleva |
|---|---|
| **Comercial** (gerente + admin de la sede) | resumen con el **valor del contrato** |
| **Montaje** (mercaderista de la sede) | orden de trabajo **sin valores**, con la parte, dónde queda en palabras y el enlace firmado `/?montar=SEDE-CODE&t=…` |
| **Proveedor** | constancia de lo acordado, con el valor. Sólo si tiene correo cargado |

Los destinatarios salen de la libreta (`notify_contacts` en `app_config`), por sede
y por rol. Si está vacía se cae a la lista global vieja (`notify_emails`).

### La pantalla afirmaba lo que no había pasado

La confirmación decía **«Ya salieron los avisos: …»** como frase fija. Con el SMTP
sin configurar en el servidor —que es como viene `render.yaml`— o sin un solo
contacto cargado, decía exactamente lo mismo y no salía ni un correo.

Cerrar una negociación creyendo que se avisó al mercaderista, y que no se haya
avisado a nadie, es el modo de falla que vuelve inútil la herramienta.

Ahora `POST /spaces/{id}/leases` devuelve un bloque `avisos` con `smtp_listo` y las
direcciones por rol, y la pantalla dice lo que de verdad pasó: a quién se le avisó,
o que **no se avisó a nadie** y por qué. Reporta lo **encolado**, no lo entregado —
los envíos son tareas en segundo plano que corren después de responder— pero eso ya
es la diferencia entre «se intentó» y «se afirmó sin intentar».

### El aviso previo estaba muerto

`NotifyPreview` avisa **antes** de guardar si el correo no está configurado o si no
hay contactos para esa sede. Estuvo vivo hasta `64a30d2` y **quedó sin montar en
`12695c2`**, el commit que partió el contrato en un hook más piezas de
presentación: el componente siguió existiendo, nadie lo importó, y la pantalla pasó
a afirmar los avisos sin poder saberlo. Ahora vive en la ficha de Vender, justo
encima del botón de guardar, con los tokens claros de esa pantalla.

### El correo de prueba miraba la clave equivocada

`POST /notifications/test` leía **sólo** `notify_emails`, la lista global vieja, y
no la libreta de contactos de donde salen los avisos de verdad: con la libreta
llena respondía «no hay destinatarios» y nadie entendía por qué. Ahora junta las
dos y el mensaje incluye servidor, remitente y destinatarios, para poder verificar
la configuración sin adivinar.

### El hosting bloquea la salida SMTP

Se cargaron las credenciales de Gmail en Render y el botón de prueba falló. El log
del servidor lo resolvió en una línea:

```
File "smtplib.py", line 312, in _get_socket
  return socket.create_connection((host, port), timeout, ...
OSError: [Errno 101] Network is unreachable
```

Falló en `create_connection`: **nunca llegó a autenticarse**. No era la contraseña.
Render en plan gratuito cierra la salida SMTP, así que ninguna credencial de Gmail
funciona ahí. El puerto 443 sí sale.

### Dos caminos, elegidos con `EMAIL_PROVIDER`

| | |
|---|---|
| `smtp` **(por defecto)** | `smtplib` contra un servidor de correo. Necesita salida SMTP abierta |
| `brevo` / `sendgrid` | una llamada HTTPS a la API del proveedor |

**El SMTP no se reemplazó, se le sumó una alternativa.** Sin `EMAIL_PROVIDER` nada
cambia: una instalación existente no se entera. Si mañana el plan de Render permite
salida SMTP, se borra esa variable y las credenciales que ya estaban vuelven a
funcionar solas — hay una prueba que lo fija.

Se usa `urllib.request` y no `httpx` ni `requests` a propósito: `requirements.txt`
no trae ningún cliente HTTP, y una dependencia nueva es una forma de romper el
despliegue.

Los dos proveedores permiten verificar **una dirección suelta** como remitente
—`bmgpersonal99@gmail.com`, sin dominio propio—, que es lo que hacía falta acá.

### Configurar el envío

**Por HTTPS** (lo que funciona en el plan gratuito):
`EMAIL_PROVIDER=brevo`, `EMAIL_API_KEY`, `MAIL_FROM` y opcionalmente
`MAIL_FROM_NAME`. La dirección de `MAIL_FROM` tiene que estar verificada como
remitente en el proveedor.

**Por SMTP**: `SMTP_USER` y `SMTP_PASSWORD`, más `SMTP_HOST` (por defecto
`smtp.gmail.com`) y `SMTP_PORT` (por defecto `587`). Con Gmail, `SMTP_PASSWORD` no
es la contraseña de la cuenta sino una **contraseña de aplicación** de 16
caracteres, que exige verificación en dos pasos. Google la muestra en cuatro grupos
separados por espacios y quien la copia se los lleva puestos: **el módulo se los
saca**, porque el servidor la rechazaba con un error de credenciales que no
mencionaba los espacios.

**El puerto decide el modo**: 465 abre SSL desde el saludo y 587 hace STARTTLS.
Antes se hacía `starttls()` siempre, así que configurar 465 —una elección
habitual— fallaba con un error que no mencionaba el puerto.

**Los destinatarios** se cargan desde el ícono de ajustes del encabezado: gerente
operacional, y por sede el administrador y el mercaderista.

### El botón de prueba ahora sirve para probar

Respondía «No se pudo enviar el correo de prueba. Revise las credenciales SMTP y
los registros del servidor» pasara lo que pasara: una contraseña rechazada y un
puerto bloqueado por la red daban el mismo texto, y para distinguirlos había que
entrar a los logs del servidor. Un botón de prueba que no dice qué falló no prueba
nada.

Ahora devuelve el motivo real, más el servidor, el remitente, los destinatarios y
**cuántos segundos tardó** — que distingue una autenticación rechazada (vuelve en
menos de un segundo) de un puerto bloqueado (tarda hasta que corta el temporizador)
sin leer un solo log.

Un detalle de orden que costaría encontrar: **`smtplib.SMTPException` hereda de
`OSError`**, así que un `except OSError` puesto antes se traga también los errores
de autenticación y los reporta como problema de red.

---

## La mercaderista ya no entra con contraseña

El correo de montaje llevaba un enlace pelado y del otro lado había un login. La
mercaderista entraba con la **contraseña compartida del rol `worker`** y
aterrizaba en el tablero: el mapa de la sede entera, la tabla con el proveedor,
el período y el estado de cada espacio. Todo eso para responder una sola
pregunta — ¿lo montaste? —. Y una contraseña compartida repartida por correo
sobrevive a la persona que deja de trabajar ahí.

Ahora el correo lleva un **enlace firmado**: un JWT de rol `montaje`, acotado a
ESE espacio y con vencimiento a 30 días (`MONTAJE_TTL_DAYS`; desde el 2026-10-02,
contados desde que arranca el contrato, y el enlace dice cuál es — ver más abajo). Se
toca y se está adentro, sin contraseña, en una pantalla que sólo tiene ese espacio.

### La regla de la que cuelga todo: cerrado por defecto

`decode_token` **no reconoce el rol `montaje`**, así que `require_auth` lo
rechaza en toda la aplicación. Lo abre `require_montaje`, y sólo está puesto en
un router nuevo —`/api/montaje`— que es todo lo que ese token alcanza.

Es a propósito y al revés de lo que sale natural: dejarlo pasar por la puerta
general y filtrar endpoint por endpoint significa que el endpoint que alguien
agregue mañana nace abierto. Así nace cerrado.

`test_el_token_no_abre_ningun_otro_endpoint` recorre **las rutas de verdad** de
la app —26 hoy, con `/api/health` como única excepción escrita a mano— y exige
401 en todas. Si alguien agrega un endpoint, el barrido lo prueba solo; si
agrega uno con un parámetro que el test no sabe rellenar, falla pidiendo que se
lo enseñen, en vez de saltárselo en silencio.

### Tres endpoints, ni uno más

* `GET /montaje/mi-espacio` — todo lo que la pantalla muestra, en **una sola
  llamada**: su espacio con proveedor, marca y fechas; los vecinos como **pura
  geometría** para dibujar dónde queda; si hay planometría; y el último reporte.
  Una y no cuatro porque del otro lado hay un celular con señal de supermercado.
* `GET /montaje/planometria` — el archivo de "así debe quedar". Se sirve desde
  acá y no por `/planometrias/{id}` para no tener que abrir ese endpoint: allá
  el id viene del pedido y habría que confiar en una comprobación; acá el
  archivo se resuelve **desde el token** y no hay id que cambiar en la barra de
  direcciones.
* `POST /montaje/reportar` — el reporte. El código del espacio **no se toma del
  formulario**: sale del token. Un campo del formulario lo escribe el cliente, y
  con un enlace repartido por correo eso alcanza para escribir sobre el espacio
  de otro proveedor.

Los vecinos pasan por una **lista blanca** (`_GEOMETRIA`) y no por una negra: un
campo comercial que se agregue mañana al layout no se filtra por olvido.

### Una sola definición de qué es un reporte válido

Hay dos puertas al mismo acto —el tablero con sesión y el enlace firmado— y las
reglas (foto obligatoria si "montado", motivo obligatorio si "no pude", tipos de
imagen aceptados, el prefijo `montaje--` que evita secuestrar la textura del 3D)
viven en **una** función: `registrar_montaje` en `routers/mounts.py`. Duplicadas,
la copia que se olvide de exigir la foto es justo la que usa quien monta.

Lo mismo del lado del navegador: el formulario salió de `MountView.tsx` a
`components/Montaje/FormularioMontaje.tsx` y lo usan las dos pantallas. Lo que
cambia entre ellas entra por props — a dónde se manda el reporte, de dónde sale
la planometría, y si hay una lista a la que volver.

Y qué contrato manda hoy sobre un espacio es **una** regla
(`services/contratos.py`), compartida con la planometría por código: si cada uno
eligiera por su cuenta, el enlace mostraría "así debe quedar" de un contrato y
los datos de otro.

### Del lado del navegador

`App.tsx` lee `?t=` **una vez, al arrancar**, antes de cualquier sesión: con ese
token no hay tablero, no hay sincronización de layout y no hay login. El token
se queda en la URL a propósito —es la credencial del enlace, y ahí sobrevive a
una recarga—.

`api/montaje.ts` es un cliente axios **aparte** del de la sesión y guarda el
token **sólo en memoria**. Meterlo donde vive el de la sesión tendría dos
costos: al admin que abre el enlace en su propio computador para revisar algo lo
sacaría de su sesión, y dejaría la credencial de un enlace repartido por correo
en el `localStorage` del navegador. Verificado en el navegador: el admin abre el
enlace, ve la pantalla de montaje, vuelve a `/` y sigue siendo admin.

Un enlace inválido o vencido **no dice «iniciá sesión»** — dice que el enlace ya
no sirve y que pida que se lo reenvíen. Decirle a alguien que inicie sesión es
mandarlo a buscar una contraseña que ya no necesita tener. (Cambió el 2026-10-02:
ya no hay cómo reenviarlo, y quien tiene cuenta propia sí puede confirmar desde
«Montajes», así que ahora ofrece las dos salidas — ver más abajo.)

### 2026-10-02: el enlace volvió al correo, y vive lo que dura el trabajo

**El correo de la venta por lote no lo traía.** Desde el 2026-09-02 el aviso a la
mercaderista decía «Abrir RECABRA» y nada más: sin cuenta de trabajador, no había
nada que abrir. Ahora cada fila del correo trae su propio enlace firmado, «Ver dónde
queda y confirmar» (`_enlace_de_montaje` en `routers/bulk_leases.py`), con el
supermercado adentro del token: sin eso, el enlace de un supermercado abriría la
pantalla contra la base de otro. Los textos que vienen de la planilla salen
escapados (`html.escape`): un proveedor llamado `<b>…` no arma HTML en el correo.

**Y vive hasta un mes después de que arranca el contrato**, no un mes desde que se
firmó (`dias_del_enlace_de_montaje` en `app/auth.py`, con techo de 400 días): el
enlace de un contrato vendido con dos meses de anticipación llegaba muerto al día
de armar la exhibición. Vale igual para el correo de un contrato suelto
(`routers/spaces.py`).

**Un enlace vencido dice qué hacer**: si tiene cuenta, entrar y confirmar desde
«Montajes» —con el botón a `/login`—; si no, pedirle a quien administra el
supermercado que lo invite con su correo.

**El enlace dice qué contrato se monta.** Como sale al vender y vive hasta un mes
después del arranque, se abre mientras el espacio todavía es de otro proveedor. Sin
decir su contrato, la pantalla mostraba el que corre hoy —otro proveedor, otra
planometría como «así debe quedar»— y un «lo monté» quedaba anotado sobre el código,
a nombre de ése (lo encontró la revisión del cambio, con una prueba). Ahora el token
lleva `contrato` (`create_mount_token`, `contrato_del_montaje` en `app/auth.py`) y
`routers/montaje.py` trabaja sobre ése:

* muestra su proveedor, sus fechas y su planometría;
* **se confirma desde la víspera del arranque** —el día en que se desarma lo
  anterior y se arma esto—; antes, `/montaje/reportar` contesta 409 con la fecha, y
  la pantalla lo dice («Todavía no se monta») en vez de ofrecer el formulario;
* sólo da por reportado lo confirmado desde esa víspera: el «montado» del proveedor
  anterior no es el de éste. El reporte se guarda por código —no hay columna para el
  contrato, y no se agregan columnas—, así que se separa por fecha;
* si el contrato se canceló, o no es de ese espacio, contesta 410 y la pantalla dice
  que ya no hay nada que montar.

Los enlaces de antes, sin contrato adentro, siguen como eran: el contrato que manda
hoy (`contrato_para_montar`).

**El tablero, con la misma regla (2026-10-05).** *Montajes* (`MountView`) y
Sede/Supervisar (`DashboardView`: la columna de montaje, «No se pudo», el filtro y la
cifra de «Sin montar») tomaban el último reporte de cada código sin mirar fechas.
Cuando un espacio pasaba de un contrato a otro, el «montado» del anterior sacaba al
nuevo de la lista de pendientes y Supervisar lo pintaba «Montado» con la foto del
proveedor anterior: justo el contrato que se está cobrando sin que nadie haya ido.
Ahora las dos pantallas preguntan a `utils/montajeDelContrato.ts`
(`reporteDelContrato`): cuenta lo reportado desde la víspera del arranque de ESE
contrato, a medianoche de Colombia, igual que el enlace. La hora del reporte sin
huso (SQLite) se lee como UTC; el navegador la tomaría como hora local. Una
renovación con el mismo proveedor también vuelve a pedir el reporte: es otro
contrato, y la foto del anterior no prueba el período nuevo. (Para GUARDAR las fotos, en
cambio, la renovación sí es la misma cadena: las del período anterior se conservan
mientras la cadena siga viva — ver *Las fotos duran lo que dura el contrato*.) `probar-montajes.mjs`
prueba la función de verdad (con `esbuild`, el proceso en hora de Bogotá para que
la hora sin huso muerda), vigila que las dos pantallas la usen y que
`routers/montaje.py` siga diciendo la misma víspera: 8 mutaciones detectadas.
Comprobado en el navegador con el relevo real (Alpina se reportó montada, Colanta
arranca hoy): con `main`, Colanta no salía en *Montajes*, Supervisar decía
«Montado» y «Sin montar» contaba 1; con el arreglo sale pendiente, dice
«Pendiente», cuenta 2, y al reportarla desaparece de la lista.

El título de los correos también se escapa (`html_shell` en `services/mailer.py`):
es el asunto, lleva la sede o el código, y los escribe quien administra.

**Con cuenta propia, el reporte dice quién fue.** En la pestaña *Montajes* el
formulario muestra «Reporta <nombre>» en vez de pedir «Tu nombre», y el servidor
guarda la cuenta de la sesión, no lo que se tecleara. Por el enlace no hay cuenta
detrás, y el nombre se sigue pidiendo.

Pruebas: `tests/test_montaje_enlace.py` (el enlace del lote abre ESE espacio de ESE
supermercado, vive lo que dura el trabajo y dice su contrato: 9 mutaciones
detectadas), `tests/test_mounts.py`, y en `probar-limpieza.mjs` los dos avisos de la
pantalla.

### Lo que NO cambió

El rol `worker` sigue existiendo y la pestaña *Montajes* del tablero sigue ahí. Desde
el 2026-10-01 se entra con cuenta propia —una invitación desde Usuarios—: la
contraseña compartida ya no abre nada.

---

## Probarle el producto al mueble, delante del proveedor

El 3D mostraba lo que YA está contratado. Para cerrar un trato tiene que
mostrar lo que **podría** estar: el proveedor pregunta «¿y cómo se vería mi
producto acá?» y la respuesta tiene que salir en la pantalla, en esa reunión.

### Por qué el arte no podía seguir colgando del espacio

El arte entraba por los archivos del espacio en el plano 2D, y el 3D tomaba la
imagen **más reciente** de ese espacio (`list_face_images`). Tres consecuencias:

* No había botón en el 3D, que es justo donde se está negociando.
* El arte quedaba atada al espacio: el mismo producto había que **resubirlo en
  cada punta** que se quisiera mostrar.
* Cualquier imagen subida al espacio se convertía en el producto del mueble —un
  contrato escaneado en JPG, la foto de un pasillo—. Ya se había reservado el
  prefijo `montaje--` para que la foto de la mercaderista dejara de secuestrar
  la textura, y ese parche tapa **un** caso de los muchos posibles.

Ahora hay tabla propia (`supplier_assets`, sin migración: `create_all` sí crea
tablas nuevas) y el arte cuelga del **proveedor**. Se carga una vez y se le
prueba a cualquier mueble, de cualquier sede. El camino viejo sigue andando
para lo que ya está cargado.

### La prueba NO se guarda en el layout

Es la decisión de fondo y va contra lo que sale natural. El layout es lo que
está montado **de verdad**: si probar un producto lo escribiera ahí, la góndola
que Nutresa tiene alquilada aparecería con producto de Alpina en la pantalla de
todos, y el 3D dejaría de servir para saber qué hay puesto en la tienda.

La prueba vive en la sesión, indexada por `${fixtureId}|A` — por **id de mueble
y cara**, no por código de espacio: el código se compone en tres lugares con
reglas de prefijo y mayúsculas, y basta que una difiera para pintar el mueble
equivocado. *(La clave guarda UN arte, el principal. Desde la tanda 1 de la tercera
crítica una cara de góndola o de punta admite además un **surtido** de hasta 4 artes del
MISMO proveedor (`comoSePrueba.surtido`, `MAXIMO_DE_SURTIDO`), un bloque vertical por
vano; el copete, el cabezote y la toma siguen con el principal. Ya no es cierto que «la
prueba admite un solo arte».)*

Prioridad de la cara: `producto en prueba → foto del espacio → patrón de
categoría → color plano`. La prueba va primero porque es una elección explícita
hecha en ese momento, delante del proveedor: tiene que ganarle a lo que haya
cargado de antes, que es justamente lo que se está proponiendo reemplazar.

### La lámina ya no le miente al proveedor

Es el arreglo más importante de todo esto. La lámina tomaba el proveedor, la
categoría, las fechas y el valor **del contrato vigente sobre ese espacio**.
Probándole un producto de Alpina a una punta alquilada por Nutresa, salía la
foto del yogur de Alpina y, debajo, «Proveedor: Nutresa» con las fechas y el
valor de Nutresa. El error más caro posible en el único papel que el proveedor
se lleva.

Ahora, cuando se está proponiendo, el pie habla de la propuesta: proveedor y
producto del arte que se está probando, y **sin período ni valor** — de lo
propuesto todavía no hay nada acordado, y poner las fechas del contrato de al
lado sería inventarlas. El rótulo de la segunda toma dice «Con Alpina» en vez
de «Con la marca», y el archivo sale `NAVE-PUN-01_Alpina_antes-despues.png`.

### Un bug viejo que salió al probar esto

**El panel comercial del 3D no se abría haciendo clic en un mueble.** El mueble
se selecciona en `pointerdown`, pero el `click` que viene después seguía bajando
hasta el piso —que está detrás y sí tiene `onClick`— y ahí `onFloorClick` hacía
`setSelectedId(null)`. Un clic seleccionaba y deseleccionaba en el mismo gesto.

Se notaba poco porque al panel se llega también desde **Vender**, que fija la
selección desde afuera. Se arregla cortando la propagación en el `onClick` del
mueble; mientras se está **colocando** uno no se corta, porque ahí el clic tiene
que llegar al piso, que es quien detecta que se está montando sobre otro.

### Cómo se comprobó

16 pruebas nuevas del catálogo (quién carga, quién mira, el SVG rechazado, el
arte que no se pisa con los archivos del espacio) y 3 del pie de la lámina.
Y manejando Chromium contra un backend real: cargar el arte, elegirla del
selector, ver la góndola surtida con el producto parado sobre cada entrepaño,
apagar las artes para el «antes», y exportar la lámina de una punta alquilada
por Nutresa comprobando que el papel dice **Alpina**.

Un detalle de las pruebas que casi manda a arreglar algo que no estaba roto: una
punta sembrada con 0.9 m de fondo (las reales tienen 0.4) hace que sus propios
entrepaños tapen el panel pintado y sólo se vea producto en el hueco de arriba.
Con medidas reales llena los cuatro.

### 2026-10-08: el producto se ve de verdad

El dueño lo pidió con una captura en la mano: la prueba de Alpina «se ve muy poco
realista, y tiene que verse bien para que el cliente se proyecte en ese espacio». Se
veía una calcomanía: la foto del producto repetida, **con su fondo blanco**, estirada al
alto de cada entrepaño (un vaso de 9 cm salía de 26), cortada por los entrepaños y
tapada por el velo verde de los slots. Y el dueño contestó tres cosas que ordenan todo
lo de abajo: (1) se le muestra la pantalla al proveedor, por videollamada o en persona;
(2) puede volver, pero antes de producción quiere ver cómo queda; (3) se puede vender por
repisa —proveedor y precio por entrepaño— **siempre con la opción de vender la cara
entera**.

**Cada unidad es un envase 3D a escala, con la foto sin fondo de etiqueta.**

* **La ficha del arte** (`supplier_asset_specs`, 1:1 con `supplier_assets`; tabla nueva,
  ninguna existente gana columnas): forma (auto, caja, botella, lata, vaso, frasco,
  bolsa, otro), alto/ancho/fondo en mm, si se apila, si va acostada (desde la revisión de
  código se aplica: la sesión la pisa sólo si la dueña toca «Mostrarla acostada» o
  «Volver a pararla») y qué hacer con el fondo de la foto (auto, quitar, dejar). `forma` y `fondo_foto` son `String` y no enum,
  para no necesitar `ALTER TYPE` en Postgres. `extra_json` queda de reserva, porque una
  vez desplegada esta tabla tampoco puede ganar columnas. El alto es **obligatorio en un
  arte nuevo**: es lo que decide la escala y cuántos frentes entran, que es justo lo que
  se negocia. Las artes viejas, sin ficha, se estiman en el navegador —por el contenido
  escrito en el nombre («200 g», «1,5 L») para líquidos y lácteos, si no por el rubro— y
  se rotulan **«≈ medidas estimadas»** en el selector y en el panel; la dueña las fija
  con **Medidas**. API: `GET /api/catalogo/` trae `ficha` por outerjoin; el alta acepta
  la ficha en el mismo form (se valida ANTES de leer el archivo); `PUT
  /api/catalogo/{id}/ficha` es sólo admin; borrar el arte borra su ficha primero.
* **El recorte del fondo** (`muebles/recorte.ts`, puro): mediana y ruido del borde,
  inundación desde el borde, componentes ≥ 2 % del mayor, relleno de huecos, sombra, un
  alfa suave de 2 px con el color descontaminado, sangrado de 6 px y el resto pintado
  con el color dominante. Si duda, **no recorta** (`dudoso`) y lo dice: la salida a mano
  es «Quitar / Dejar» en la ficha, con la vista previa sobre un damero (`EditorDeFicha`).
  Con el fondo puesto («conservado») la foto se recorta igual a la caja del producto —el
  aspecto decide el ancho y los frentes—, y ese ancho se acota a la forma y se rotula «≈»
  si la ficha no lo trae (ver *2026-10-09 (noche)*).
  No se hace en el servidor: no hay nada que segmente, y meterlo es superficie de ataque.
* **El envase** (`perfiles.ts`, `geometriaDeEtiqueta`): caja (la foto de frente y un
  color liso en los cantos —ver 2026-10-09—), **cuerpo de revolución** torneado con la
  silueta de la propia foto (botella, lata, vaso, frasco), almohada (bolsa: dos caras
  abombadas que se afinan a cero en los costados) y, como último recurso, el recorte
  plano. Las tapas de la botella van de UN color sacado de la foto: con la proyección
  plana repetían la primera fila estirada (rayas sobre cada vaso). El vaso y la lata,
  desde la segunda crítica, llevan su tapa aparte —el foil dibujado con los colores de la
  foto— y el costado sin la franja de tapa de la foto (ver *2026-10-09 (tarde)*).
* **El material** (`etiqueta.ts`): con luz, un entorno PMREM propio del producto (un
  cuarto gris con cuatro tiras de luz, uno por lienzo) y **tono neutro sólo en ese
  material**. La luz de la tienda no se toca: ni `scene.environment` ni el tone mapping
  global. Calibrado con la carta de color de `/taller`: `K_ENTORNO 0,9 · K_EMISION 0,26`
  dan el blanco de la etiqueta en rgb(237,234,230) y ΔE2000 medio 3,3 en los parches de
  marca, con el tono corrido ≤ 1,3°.
* **El acomodo** (`muebles/frentes.ts`, `unidadesDePrueba`, puro): frentes reales por
  vano con la misma cuenta que el relleno (`acomodar`), hasta tres de fondo —la segunda
  un 18 % y la tercera un 32 % más oscuras (`TONO_POR_FONDO`)—, apilado sólo si la ficha
  lo dice (hasta tres pisos, también el vaso), un desorden **determinista** (sembrado por
  mueble, cara y arte: el producto
  no se reacomoda cuando se mueve la cámara; desde 2026-10-09 la botella y la lata giran
  hasta 5° adelante, hay columnas corridas y huecos atrás) y una sombra de contacto. El
  empaque es CONCRETO: si no entra, el entrepaño queda vacío y se dice por qué, nunca se
  cambia por uno más chico.
* **El dibujo** (`ProductoDePrueba.tsx`): hijo del grupo del mueble, con la misma
  anidación que las piezas —la cara en su plano de montaje, la B girada media vuelta, cada
  fila en la altura de su entrepaño girada lo que gira ese entrepaño—, así que en el
  entrepaño alto inclinado el producto se inclina con él sin una línea de trigonometría.
  Una `InstancedMesh` por fila (dos: el frente con 32 lados y lo de atrás con 12, ver
  `DETALLE`). Lo usan la góndola, la punta, la nevera de refrescos y el
  robatope (`TIPOS_CON_PRUEBA_3D`); los muebles sin entrepaños siguen con la lámina. Si
  la foto no carga, la cara cae a la lámina y el panel ofrece «Reintentar».

**Dónde va: «Toda la cara» o «Por entrepaño».** Es el pedido (3) del dueño. «Toda la
cara» es el valor de entrada y está siempre a un clic. «Por entrepaño» muestra los
entrepaños de arriba hacia abajo, numerados desde el piso, con sus cm libres: apagado
con «no entra: 6,5 cm» si el producto no entra parado, y marcado **«vendido», sin
nombre**, si un slot vendido lo cubre (la regla de `entrepanosDelEspacio`, la misma del
relleno). Con la cara entera y entrepaños vendidos lo avisa: «Esta cara tiene 2
entrepaños vendidos: la prueba los tapa». El panel dice la cuenta que se negocia —«Entran
10 por entrepaño · 3 de fondo · 3 apilados · 40 de frente», con «≈» si las medidas son
estimadas— y, cuando no entra, lo dice con medidas («No entra parada: 33 cm en 31 cm
libres», o «No entra de fondo: 45 cm en 40 cm de entrepaño») y ofrece **«Mostrarla
acostada»** para botellas y latas. El «cómo» vive al lado
de `prueba`, en un mapa de sesión con la misma clave (`comoSePrueba`), y **tampoco va al
layout**: probar o ajustar no llama a `setPlacedFixtures` (lo vigila una prueba).

**«Mostrar al proveedor»: la pantalla de venta, limpia y privada.** Es el pedido (1): la
pantalla la está mirando un proveedor. El botón (el amarillo del editor) prende
Presentar y encuadra la cara de frente. En Presentar no hay paneles de slot, caja de
selección, gizmo, tooltip, insignia «Sin contrato» ni tiras de estado (`FixtureMesh`
recibe `neutro` y pinta gris lo que era verde o rojo), y **las caras sin prueba no
muestran ni la foto del espacio ni el patrón de categoría**: son las marcas de OTROS
proveedores, así que caen al relleno neutro por rubro, sin nombres. Desde 2026-10-09
tampoco las PRUEBAS de otros proveedores de la misma sesión (`privacidad.ts`), y lo mismo
vale para la lámina. La persona de 1,70 m queda —es la escala—, como silueta plana en el
plano de la cara. Un clic en Presentar elige el mueble pero no lo arrastra. Fuera de
Presentar, mientras haya una reunión (una prueba, el proveedor de la reunión fijado o el
selector abierto: `hayReunion`), el tooltip no dice de quién es el espacio ni cuánto
paga, y el bloque «Contratado» del panel dice sólo «Ocupado hasta jun 2027»: se puede
estar compartiendo la pantalla sin haber apretado nada.

**El selector de productos ya no abre el catálogo entero.** El catálogo es la lista de
clientes de la tienda: abrirlo delante de Alpina le mostraba los productos de Nutresa y
de Colanta. Ahora hay un **proveedor de la reunión** (estado de sesión): sin fijar, el
selector no lista nada hasta tres letras del nombre del PROVEEDOR (no del producto);
elegir un arte lo fija, y entonces sólo salen los suyos («Productos de Alpina», con
«Cambiar de proveedor»). El alta de un arte llega con ese proveedor elegido.

**La cámara del vendedor** (`vistaDeVenta`, en `utils/planta.ts`; `vistaDeCara` no se
tocó): tres tomas quietas, **De frente**, **Tres cuartos** y **De cerca**, en el HUD de
Presentar. Siempre DENTRO del pasillo —mide el pasillo libre con los mismos muros de la
caminata, así que la cara B de una góndola ya no se mira desde detrás de la de
enfrente—, a la altura de un comprador y dentro del rango polar de la órbita. El foco
sale de la misma cuenta que dibuja el producto (`focoDeLaPrueba`): «De cerca» va al
entrepaño con producto más cerca de 1,3 m, nunca a uno vacío. El tres cuartos gira hacia
el lado contrario a la persona, si ahí hay pasillo (desde «la crítica de la demo», con un
vecino pegado gira hacia el costado libre: ver abajo). Es un corte, sin animación: por
videollamada el movimiento se empasta. En Presentar la órbita deja acercarse a 0,5 m
(`distanciaMinima`; fuera, 1,2 m desde la segunda crítica: con los 4 m de antes los
controles empujaban «Encuadrar esta cara» detrás de la góndola de enfrente). «De cerca»
va con teleobjetivo (`FOV_DE_CERCA`, 32°) y el entrepaño llena el 75 % del cuadro.

**Lo que costó encontrar, para no volver a pagarlo:**

* **El canvas 2D guarda el color premultiplicado.** La textura opaca se armaba
  releyendo el lienzo con alfa, y lo transparente volvía NEGRO: justo donde el recorte
  había dejado el sangrado y el color de la marca. Tapas de caja negras, bases de botella
  negras, una costura oscura en cada vaso. Ahora sale del `rgba` del recorte (lo vigila
  una prueba).
* **La botella de 30 cm en 30 cm libres entra** —es la cuenta que se negocia—, pero
  parada sobre el alambre asomaba la tapa por la rejilla de arriba (puntos naranjas en el
  estante vacío). Se la hunde en el alambre lo que sobra, nunca más que lo que la
  levanta la rejilla.
* **El acento del editor era casi negro en el tema claro.** `[data-cajon-oscuro]`
  invertía la tinta pero no volvía a declarar `--accent-rgb`, y una propiedad
  personalizada se hereda ya resuelta: «Cara A» o «Toda la cara» activos quedaban
  invisibles sobre la sala. Ahora el cajón la redeclara (`tema.css`).
* Las posiciones de `BufferGeometry` son `Float32`: comparar contra `alto / 2` con
  `1e-9` no encuentra nunca el vértice (0,165 en float32 es 0,16500000655…).

**Lo que quedó afuera, a propósito (y lo que la ronda siguiente saldó):**

* ~~La marca en el copete de la punta~~ — hecha el 2026-10-09 (`pop.ts`).
* ~~El panel comercial seguía mostrando el contrato vigente con una prueba activa~~ —
  desde el 2026-10-09 el bloque «Contratado» es discreto durante la reunión.
* ~~La foto en tres cuartos se avisaba pero no se corregía~~ — desde el 2026-10-09 la
  caja se endereza sola (`rectificarCaja`); el aviso queda, más suave.

### Cómo se comprobó (2026-10-08)

* **Pruebas.** `probar-muebles` pasó de 104 a 131 pruebas (el acomodo y el relleno,
  ejecutados; la inclinación; la nevera con la botella de 2 L que no entra y la de 1,5 L
  que entra en las rejillas 1, 4 y 5; los UV de cada envase; el parche de shader contra
  los shaders de three; y las guardas de texto de Presentar, del selector y de la
  prueba que no escribe el plano). `probar-arte` es nueva (15: el recorte con buffers
  sintéticos, la estimación sin ficha, la caja en perspectiva). `probar-planta` suma la
  cámara de venta (33 → 39: la cara B de GON-01 se mira desde adentro del pasillo, «De
  cerca» a ≤ 1,2 m, el ángulo polar siempre en rango, la persona fuera del primer
  plano). `probar-tema` suma el acento del cajón (25). En el backend, 6 pruebas nuevas
  del catálogo (alta con ficha, `PUT` que crea y reemplaza, 403/401/404, 422 por cada
  campo inválido, el `DELETE` que no deja la ficha huérfana, `ficha: null`) y la ficha
  entra en las pruebas de la copia de seguridad y del traspaso. La suite entera del
  backend: 1216 pasan, 2 saltadas, 7 xfail (21 min).
* **Cada guarda nueva se probó rompiéndola**: el código se copia aparte, se muta, la
  prueba tiene que caer y se restaura con `cp` (nunca `git checkout`). En los pasos 9
  a 11, 39 mutaciones: una sobrevivió (el tres cuartos que esquiva a la persona y se
  paraba detrás de una columna) y la prueba se reforzó hasta que cayó. Las del
  backend, 7 de 7.
* **El relleno genérico no cambió ni un píxel**: el refactor de la cuenta (pasos 2 y 3)
  se comparó en `/taller` con capturas antes y después, píxel a píxel, en ocho casos.
* **Mirado, no supuesto.** Con el servidor local sembrado (cuatro fotos reales de
  producto con sus fichas, más una botella de 1,5 L) y Chromium en swiftshader a
  1920×1080: las cuatro pruebas con «Mostrar al proveedor» y sus tres tomas, por
  entrepaño, la nevera que avisa y la botella acostada, el selector privado, el panel
  con el velo y la lámina descargada (sin paneles de slot; «Con Alpina» con los
  envases). Y la videollamada: la toma «De cerca» del yogur, quieta, codificada en VP8
  a 500 kbps y 720p — en el cuadro 40 se lee «finesse» y el logo.

### 2026-10-09: lo que vio la crítica

Antes de mostrárselo al dueño, las capturas de la primera ronda pasaron por una crítica
con el ojo de un proveedor del otro lado de la videollamada. El veredicto fue «casi»: la
escala, el recorte y las tres tomas ya funcionaban, pero había cuatro cosas que un
representante de marca ve en el primer segundo, y una de ellas rompía una regla dura.

**1. La pantalla de Diana mostraba a Alpina.** La sesión acumula pruebas: a la mañana la
punta con el yogur de Alpina, a la tarde el robatope con el arroz de Diana, y las dos
quedan puestas. «Mostrar al proveedor» con el arroz encuadraba el robatope… con los
vasos de Alpina ocupando el 40 % del cuadro y las cajas de Kellogg's en la góndola de
enfrente. El proveedor que mira veía a sus competidores y, de yapa, se enteraba de que
la punta de al lado se le está ofreciendo a otro. El filtro de Presentar sólo apagaba
las caras SIN prueba.

* Ahora hay **un proveedor en pantalla** (`proveedorEnPantalla`). Lo fija «Mostrar al
  proveedor» con el dueño del producto que va a encuadrar; el botón «Presentar», con el
  del mueble elegido o, si no, con el de la reunión (`proveedorParaPresentar`).
* La escena recibe `privadoPara` y pasa cada prueba por `arteALaVista`
  (`muebles/privacidad.ts`, puro y ejecutado en `probar-muebles`): en la pantalla de un
  proveedor sólo se dibujan sus artes. El HUD sólo ofrece tomas de lo que se ve.
* **La lámina** («Propuesta») saca sus DOS tomas con el mismo filtro, puesto antes de la
  primera (`laminaPara`). Antes «Con Alpina» traía el patrón de cajas de la góndola de al
  lado y «Hoy» no; ahora la única diferencia entre las dos es el producto. Y las tiras de
  estado también se apagan en la lámina (`neutro={privadoPara !== undefined}`).
* **El panel de la dueña con la reunión en curso.** El selector pide tres letras
  justamente porque se usa con la pantalla compartida, pero detrás seguía legible
  «Bimbo · $1.500.000 / mes». Con una prueba puesta, un proveedor de reunión fijado o el
  selector abierto, el bloque «Contratado» dice sólo «Ocupado hasta jun 2027» y un «Ver
  contrato» que exige el clic. El panel de un SLOT (el formulario para editarlo) no se
  tocó: se abre a propósito y es para escribir.

**2. Los envases se leían como texturas rotas.** Lo que la foto le pasa a cada forma ya
no es la misma textura para todas (`muebles/texturas.ts`, puro, ejecutado en
`probar-arte`):

* **El borde**: los últimos 2 px de la silueta traen el blanco del estudio. En la
  botella y la bolsa, que se ven de costado, ese borde estirado era un halo y un serrucho
  en la base. `erosionarYSangrar` encoge el alfa 2 px (mínimo de la ventana: el degradé
  se corre sin perderse) y repinta lo que quedó afuera con el color de adentro.
* **La caja en tres cuartos se endereza** (`rectificarCaja`): el contorno de arriba de
  una caja fotografiada en tres cuartos son DOS rectas que se juntan en la arista más
  cercana, que es la columna más alta. Si eso está clarísimo (dos rectas con pendientes
  contrarias, la arista lejos de los bordes), la cara grande se endereza a un rectángulo
  con la perspectiva de verdad —la mitad lejana sale más comprimida en la foto:
  x(u) = (x₀(1−u)h₁ + x₁u·h₀)/((1−u)h₁ + u·h₀)—; si no, se usa la foto como venía. Se
  acabó el «doble lomo» de la Müsli: cada caja tenía el frente y el panel nutricional.
* **El costado de la caja es un color** (`colorDeCostado`: el dominante de la franja
  del borde, sin blancos —desde «la crítica de la demo», el de mayor área en los costados,
  blancos incluidos: sin ellos la Avena salía con el negro de sus sellos—) con un degradé
  hacia atrás por color de vértice, en un SEGUNDO
  material de la misma malla (la caja parada tiene dos grupos). Con la última columna de
  la foto estirada salían rayas rojas y blancas, y en los vanos lejanos las cajas se
  leían como cartulinas de canto.
* **La botella se ve llena** (`llenarBotella`, sólo para `transparente`: ficha botella,
  o rubro de botella sin ficha). Por el PET de la foto se ve el blanco del estudio: en
  el 3D era una botella de kumis, y acostada la mitad blanca y la mitad roja con el nivel
  en vertical. El líquido se lee por TONO en el cuarto de abajo y tiñe los claros de las
  filas transparentes y del pie, conservando la luz de la foto; la letra blanca de la
  etiqueta no se toca (sus filas tienen menos de la mitad de blanco). Sin un líquido de
  color —agua, una botella blanca— no se toca nada.
* **El pie de la botella se redondea** (el 7 % de abajo) y las botellas ACOSTADAS van con
  1,2 cm más de aire y casi derechas (±0,5°): el pico de una se metía en la base de la
  otra y la fila se leía como un salchichón rebanado.
* **La bolsa** dejó de ser un ladrillo: dos caras abombadas que se afinan a CERO en los
  costados (la costura), el fondo apoyado con espesor y un sello fino arriba; la textura
  con alfa recorta la silueta de la foto (las esquinas onduladas del sello).

**3. La nevera: las rejillas se acomodan, en sesión.** La de 2 L no entraba parada en
ninguna rejilla y la única salida era acostarla; en Colombia una 2 L acostada en la
nevera de gaseosas casi no se ve — el mercaderista sube una rejilla. Y la de 1,5 L
dejaba vacías las dos del medio, la zona caliente. La cuenta es `rejillasParaProducto`
(pura): las reparte parejas entre la primera y el techo, tantas como entren con el
producto más 2 cm (5 cm desde la tanda 3: `HOLGURA_DE_REJILLA`), nunca más que las
que tiene la nevera, al ras de una ranura si así siguen entrando. La nevera DIBUJA esas
rejillas (`NeveraReal` recibe `niveles`) y el
producto apoya en ellas, con las mismas alturas; la cámara de venta las encuadra. Es de
la sesión, como toda la prueba (`comoSePrueba.rejillas`): el plano no cambia. *Desde la
tanda 1 (ver «nevera y envases», más abajo) ya no es un botón que se ofrece: las
rejillas se acomodan SOLAS, y si el acomodo no queda bien hay «De fábrica» y «A
mano».* El panel dice qué entrepaños quedan vacíos y por qué («Los entrepaños 2 y 3
quedan vacíos: 30 cm no entran en 27,5 cm»).

**4. La escena de venta.**

* **La persona** era un muñeco de cápsulas parado delante del plano de la cara: la
  perspectiva la agrandaba —salía más alta que la punta de 1,80 y la hacía ver de
  juguete— y en la toma de una cara B quedaba detrás de la góndola. En Presentar ahora
  es una **silueta plana** (desde la segunda crítica, opaca y de un gris cálido: ver
  abajo; desde la tanda 3, en venta, gris claro #b8b4ae y donde la pone la toma), parada
  EN EL PLANO de la cara que se muestra, a 30 cm del canto
  (`lugarDeLaFigura(…, enLaCara)`); no va en «De cerca», y si el borde del cuadro la
  corta no se dibuja. (Desde la segunda crítica, también en el editor.)
* **El copete de la punta lleva la marca** (`pop.ts`, el paso opcional del plan): un
  degradé del color dominante de la foto, dos recortes del producto y una raya blanca,
  SIN texto. Sólo con «Toda la cara» y con la casilla «Marca en el copete» (prendida por
  defecto); va sólo en la cara que mira al pasillo.
* **El remate del robatope** era casi negro y en la toma de cerca dominaba el cuadro: es
  gris medio con un filo claro.
* **La sombra**: `shadow-bias -0,0005` y `normalBias 0,02`. Las bandejas vacías tenían
  rayas diagonales (shadow acne), y en «Por entrepaño» era lo que más se veía después
  del producto.
* **Los encuadres**: «De frente» por entrepaño mira lo elegido casi perpendicular, a su
  altura, y no desde 1,2 m para abajo (`FocoDeVenta.porEntrepano`). Y el pasillo de un
  mueble arrimado a otro (el robatope pegado a la punta) ya no mide cero:
  `distanciaLibre` ignora las huellas que rodean el punto de partida —la del vecino
  inflada por el radio del cuerpo cubre el canto—, y la toma de frente del robatope dejó
  de pegarse a 90 cm cortándole las repisas.
* **Los slots con una prueba puesta** se dibujan como contorno de 1 px (`ContornoDeSlot`)
  y el panel queda transparente (sigue recibiendo el clic): aun al 15 % teñían de verde
  menta el mueble y el producto.
* **Menos clonado**: la botella y la lata paradas giran hasta 5° adelante y 8° atrás, una
  columna de cada tanto queda corrida hacia adentro ENTERA (la de adelante no se mete en
  la de atrás) y un 5 % de los huecos de ATRÁS está vacío; el frente siempre completo. El
  vaso con tapa de foil se apilaba de a dos (`pisosMaximos`); la segunda crítica lo
  devolvió a tres (ver abajo).

**Lo que no se hizo, y por qué:**

* **El relleno neutro en los muebles contratados ENTEROS** (la góndola de Bimbo vacía en
  Presentar): el plan lo dejó fuera — el «Hoy» de un mueble contratado entero con los
  slots libres se sigue viendo vacío. *(Hecho en la tanda 2, paso 14, sólo en venta.)*
* **Brillo en el piso, luz cenital, techo**: son cambios globales de escena, fuera de
  alcance por regla (la luz de la tienda está calibrada para los muebles). *(La tanda 2
  los hizo sin tocar esa luz y sólo en la pantalla de venta: cielo raso con luminarias,
  brillo en el acero y reflejo en el piso; ver «2026-10-09 (tanda 2): el ambiente».)*
* **Fondo de 4–5 unidades** en vez de 3: más instancias en swiftshader por algo que sólo
  se ve de costado. Queda en 3.
* El yogur Finesse de la demo es refrigerado y va en una punta seca; para la demo se le
  corrigió el nombre al gramaje de la foto (150 g) en la base LOCAL de capturas. Para
  mostrársela a Alpina conviene un producto de góndola seca.

**Cómo se comprobó.** `probar-muebles` 138 (privacidad ejecutada con dos proveedores, las
rejillas, las acostadas que no se tocan, el vaso de a dos, el desorden que no mete un
vaso en otro, la bolsa sin costados, el copete sin texto, el panel discreto, la lámina
con el filtro antes de la primera toma); `probar-arte` 21 (el borde, la caja enderezada
con su perspectiva y la que no se endereza, el costado, la botella llena y la de agua
intacta); `probar-planta` 41 (la persona en el plano de la cara, el pasillo del robatope,
el encuadre por entrepaño). Cada guarda nueva se probó rompiéndola: 38 mutaciones, 38
cayeron, todo restaurado con `cp`. Las capturas, en el servidor local a 1920×1080, en
`scratchpad/realismo/capturas/despues-r1`.

**Gotcha nuevo.** Una `InstancedMesh` con una LISTA de materiales sólo dibuja los grupos
de la geometría: una geometría sin grupos con una lista no dibuja nada. `ProductoDePrueba`
pasa la lista sólo si la geometría tiene grupos (la caja parada), y si no el primer
material.

### 2026-10-09 (tarde): la segunda crítica — que el producto no parezca pegado

La segunda pasada de la crítica dio otra vez «casi», con dos defectos graves que el
proveedor ve sin buscarlos: el envase **brillaba más que el mueble** —se leía como una
calcomanía sobre una maqueta grafito— y el botón «Presentar» de siempre **escondía la
prueba**. Lo demás era de terminación: la tapa del vaso, el contacto con la bandeja, la
punta medio surtida, la toma «De cerca», la nevera como caja negra, la persona fantasma y
la lámina con puntitos.

**1. Una misma luz para el mueble y el producto** (`muebles/luzDeVenta.ts`). Medido: el
blanco de la caja de cereal en 232-240 sRGB contra 97-112 del porta-precios, que es casi
blanco (#f7f5ef). No era el color de la góndola —el acero ya es gris claro, #c6cac9, la
RAL 7035 de cualquier Éxito— sino la luz: el editor no lleva entorno, y una cara VERTICAL
de un mueble sólo recibía la ambiente (0,55/π del albedo); el envase, en cambio, trae su
propio cuarto de luz (`useEntornoDeProducto`).

* En la pantalla de venta (Presentar y la lámina) cada material de mueble recibe la luz
  **difusa** de ese mismo cuarto, como un hemisferio —el promedio del techo arriba, el
  del piso abajo— sumado en el shader (`parcheDeLuzDeVenta`, con su propia clave de
  programa). La reciben `useMateriales` (góndola y punta), la nevera, el robatope y el
  relleno por rubro, por un contexto (`LuzDeVenta`) que la escena prende sólo con
  `privadoPara` definido. Fuera de Presentar el editor se ve igual que siempre.
* Medido después, en la toma de cerca de la punta: etiqueta 208-212, porta-precios 198,
  frente de la bandeja 223, paneles ~180; la tapa del vaso, 146 (era lo más claro del
  cuadro, 216). El blanco del producto queda por debajo del blanco del mueble, que es lo
  que pedía el criterio (a no más de 15 por encima). La etiqueta no se tocó: sigue
  calibrada como dice *La calibración* en `etiqueta.ts`.
* **Por qué no el mapa de entorno.** La primera versión le ponía al mueble el MISMO
  PMREM que al envase. Se veía igual, pero muestrear un PMREM en cada píxel de cada
  mueble —en una toma de venta, la pantalla entera— hacía el cuadro mucho más caro, y los
  muebles son mates: de ese mapa sólo se veía la parte difusa, que es casi exactamente un
  hemisferio. **Por qué no `scene.environment` ni una `HemisphereLight`**: alumbran TODO,
  el piso, las paredes y el propio envase, que ya trae su luz calibrada (y en three 0.184
  `scene.environment` también lo toman los `MeshLambertMaterial`).

**2. «Presentar» no puede esconder la prueba.** La punta de Alpina salía vacía delante de
Alpina. La causa de fondo era un bug de una línea en el selector: el `map` de los grupos
llamaba `proveedor` a su variable y **tapaba la prop**, así que `if (!proveedor)` leía el
nombre del grupo —siempre lleno— y elegir un producto NUNCA fijaba el proveedor de la
reunión; sin mueble elegido, Presentar quedaba sin proveedor y no mostraba ninguna prueba.

* El grupo se llama `deGrupo` (lo vigila una prueba).
* `proveedorParaPresentar` suma un paso: si todas las pruebas de la sesión son de UN
  proveedor, ése. (Desde la revisión de código el proveedor de la REUNIÓN va antes que
  el mueble elegido: ver *2026-10-09 (noche)*.) Con pruebas de dos y nada elegido no adivina: el HUD avisa «Hay una
  prueba que no se está mostrando · Mostrarla», **sin nombres** (la pantalla ya puede
  estar compartida) y muestra la última (`ultimaPrueba`).
* Con el mueble elegido probado, el botón «Presentar» ES «Mostrar al proveedor» (si la
  prueba es del proveedor de la reunión, cuando hay una).
* **«Encuadrar esta cara» es la toma «De frente»** de la pantalla de venta, dentro del
  pasillo; la vista guardada a mano sigue mandando. Y la órbita del editor deja acercarse
  a 1,2 m (eran 4): con 4, los controles empujaban cualquier encuadre a 4 m de su mira, y
  en un pasillo de 2 m eso es DETRÁS de la góndola de enfrente —el lomo vacío de GON-02 que
  se veía en la cara B de GON-01 no era la cuenta del encuadre, era el mínimo de la
  órbita—.
* **El HUD no se pierde** con un arrastre que empieza sobre otro mueble (lo elige) ni con
  un clic en el piso (suelta la selección): las tomas caen al mueble de la última toma
  (`muebleDelHud`). Al salir de Presentar el pedido de toma se borra, con un contador
  propio para que un número nuevo nunca coincida con uno ya atendido.

**3. El vaso** (`vasoConTapa` en `perfiles.ts`, `tapaDeFoto` en `texturas.ts`). La foto de
un vaso trae arriba el reborde y el foil; envuelta en el cuerpo, esa franja quedaba
pintada en el costado, y encima el disco 3D: doble tapa, un hongo. Ahora la franja se lee
de la foto (filas desde arriba con la mitad o más del color del reborde o del foil; nada
si lo de arriba es del color del cuerpo, como una lata pareja) y el costado se envuelve
sin ella; la tapa es otra pieza con otro material —el foil dibujado con los colores de la
foto: degradé, un brillo en diagonal, textura fina, el sellado y el reborde, sin texto— y
el canto del reborde queda vivo. 32 lados (a 150 px el borde se aparta del círculo menos
de medio píxel) y **con índice**: una punta llena son 360 vasos.

**4. Apoyado y menos clonado.** Cada fila lleva una tira de contacto (`tiraDeContacto`):
oscura bajo el frente y desvanecida 2 cm hacia el pasillo, hija de la fila —se inclina con
el entrepaño—. Lo de atrás cae un 18 % y un 32 % (`TONO_POR_FONDO`; con 12 % por fila las
tapas de atrás se medían casi iguales a las del frente). El desorden es de ±2 mm a lo
ancho y ±3 mm de fondo, y un 22 % de las columnas queda corrida 1-2 cm. Las cajas llevan
los cantos verticales en sombra (`oscurecerCantos`): cinco cajas con la misma foto se
leían como un empapelado continuo, «Kellogg'sKellogg'sKellogg's».

**5. La punta surtida.** El vaso vuelve a apilarse de a tres (de a dos quedaba un 35 % de
aire sobre cada entrepaño). Y el hueco de 6,5 cm entre el último entrepaño y el copete,
que con el producto puesto se leía como una bandeja vacía a la altura de los ojos, lo tapa
una **cenefa** del color de la marca (`materialDeCenefa`), sólo con la marca en el copete
y sólo si el hueco no sirve para producto (< 12 cm). No hizo falta «acomodar los
entrepaños» de la punta, como en la nevera: con tres apilados ya llenan.

**6. «De cerca» con teleobjetivo** (`FOV_DE_CERCA`, 32°). Con 50° la cámara se pegaba a
60 cm y miraba desde 1,6 m para abajo: un tercio del cuadro era metal y copete, dominaban
las tapas y las cajas de los bordes se estiraban. Ahora el entrepaño (con su labio) llena
el 75 % del alto, la cámara va 10 cm por encima de su centro y más atrás; en un mueble
angosto (el robatope) encuadra dos repisas y media *(desde la tanda 3, el PAR de repisas
con producto más cerca de 1,3 m, al 70 % del alto: `parDeRepisas`)*. El campo visual
vuelve a 50° con
cualquier otra toma, al salir de Presentar y en la vista superior. Los vasos de 9 cm
miden ~165 px de alto en 1080p.

**7. La nevera de venta.** En la pantalla de venta la nevera de refrescos lleva forro claro
en los costados, el techo y la bandeja de abajo, la rejilla de alambre (una textura de
varillas, opaca: con transparencia hay que ordenar contra las botellas) y una luminaria
arriba, y el fondo no recibe la sombra de la luz de la tienda (la carrocería lo recortaba
en rectángulos a media anchura). El cabezote lleva la marca como el copete de la punta
—en un cartel apaisado, la franja del medio de la foto, que es la etiqueta, repetida—.
**No lleva vidrio**: `nevera_refrescos` es un multideck de frente abierto por su ficha del
catálogo (ver *Lo que le faltaba, y era todo*, en `NeveraReal.tsx`), y un vidrio delante
mentiría sobre el mueble que se vende.

**8. La persona** es una figura de escala de arquitectura: opaca, de un gris cálido
(#8c867e) más oscuro que el piso, con los brazos pegados al cuerpo; la translúcida era un
fantasma por el que se veían el piso y la pared. Va también en el EDITOR, en el plano de
la cara: el muñeco de cápsulas, 35 cm por delante, quedaba en primer plano en cuanto
«Encuadrar esta cara» pasó a ser la toma de frente, y se leía como un maniquí de prueba
de choque. *(Desde la tanda 3, en la pantalla de venta es gris claro, #b8b4ae —la oscura
pesaba casi como el mueble—, y la elige la misma cuenta que arma la toma
(`personaYTomaDeVenta`): entera y del lado libre, o ninguna. El editor sigue con #8c867e
a 0,3 m del canto. Ver «2026-10-10».)*

**9. La lámina** saca las tomas de la pantalla de venta: «Hoy» y «Con …» desde la toma «De
frente» con aire (`HOLGURA_DE_LAMINA`: el mueble al ~65 % del alto) y una tercera **«De
cerca»**; cada captura se recorta a la forma del mueble y se apoya sobre el color de la
sala (el lienzo es transparente y el PNG salía con un cielo blanco). Al terminar, la
cámara vuelve a donde estaba. Y cada toma **espera a que la escena la confirme**
(`EstadoDeEscena`, escrito en un `useLayoutEffect` de la escena): el lienzo es otra raíz
de React, y con la punta llena «dos cuadros» ya no alcanzaban — «Con Alpina» salía sin el
producto, igual a «Hoy», y la lámina quedaba con una sola imagen.

**10. Lo chico.** La botella encoge 4 px de borde (no 2) y tiñe también los claros
apenas rosados de los hombros (el brillo del PET con el reflejo de la etiqueta), con el
reflejo a lo sumo al 30 %: de cerca eran triángulos blancos. El copete lleva un recorte
héroe al centro con dos más chicos arrimados y sin la raya blanca. La bolsa es más llena
hacia los costados (cos^0,4) y su canto toma el color del plástico (`tenirCantos`).

**Rendimiento: lo que se encontró de paso.** El editor entero estaba suscripto al store
completo (`useFixtureStore()` sin selector), y la órbita escribe la cámara en el store en
cada paso de un arrastre: cada giro re-renderizaba veinte veces el editor, la escena y
cada mueble. Y la referencia de las instancias del producto, escrita en línea, pedía un
cuadro en cada render. Ahora son selectores y una referencia estable. En swiftshader a
1920×1080 una toma de venta tarda ~3,5 s por cuadro con la punta llena (~1 M de
triángulos) — la misma toma de la góndola con la build de la ronda 1 tardaba 7 s: es el
costo de llenar 2 M de píxeles con MSAA y sombras en una CPU, no del producto. Con una
placa de video cualquiera son milisegundos.

**Lo que no se hizo, y por qué:**

* **Vidrio en la nevera**: es de frente abierto (ver 7).
* **Sombras de 2048 recortadas al mueble encuadrado**: fuera de alcance por regla (cambio
  global de escena). Las bandejas ya no tienen el acné; la sombra en escalera del costado
  de una góndola en tres cuartos sigue.
* **El robatope al 35 % del ancho en «De frente»**: mide 0,3 × 1,6 m; entero y de frente
  en 16:9 no puede ocupar más del ~10 % sin cortarlo. «De cerca» lo encuadra (2,5 repisas).
  *(Sigue sin hacerse después de la tanda 3, por lo mismo; y con la persona entera al lado
  el cuadro se abre un poco más. Lo que vende el robatope es «De cerca», que ahora encuadra
  dos repisas al 70 % del alto.)*
* **El Finesse refrigerado en una punta seca**: es el caso del dueño, y es dato de la
  demo, no del render.

**Cómo se comprobó.** `probar-muebles` 142 (la luz de venta ejecutada y sólo en la
pantalla de venta, el vaso con su tapa y el costado sin la franja, la tira de contacto
hija de la fila, la lámina que espera a la escena y deja la cámara, el HUD que no se
pierde, el selector que fija al proveedor, el botón «Presentar» con la prueba, la cenefa,
la silueta opaca y sin el muñeco de cápsulas); `probar-arte` 25 (la tapa leída de la foto, la lata pareja que no se
recorta, los cantos de la caja y de la bolsa, los hombros de la botella); `probar-planta`
42 («De cerca» con teleobjetivo: 70-80 % del cuadro, a la altura del entrepaño, el
robatope con dos repisas y media). Cada guarda nueva se probó rompiéndola: 41 mutaciones,
41 cayeron, todo restaurado con `cp`. Las capturas, en `scratchpad/realismo/capturas/despues-r2`.

**Gotcha nuevo.** Un `ref` en línea en un componente de R3F se vuelve a llamar en CADA
render (React lo trata como una referencia nueva), y si adentro hay un `invalidate()`, cada
render pide un cuadro. Con `frameloop="demand"` eso es invisible en una máquina rápida y
encola segundos de cuadros en una lenta. Las referencias que dibujan van con `useCallback`.

### 2026-10-09 (noche): la revisión de código — que lo que se negocia no mienta

Después de la segunda crítica (visual), una revisión del CÓDIGO buscó lo que las
capturas no muestran: casos en que la cuenta de frentes miente, en que la cara queda
vacía en plena reunión, en que la pantalla compartida nombra a otro proveedor, y lo que
cuesta dibujarlo en una PC sin placa de video. Catorce hallazgos; los reales se arreglaron
todos, cada uno con una prueba que se rompió a propósito (37 mutaciones, 37 cayeron).

**1. Una foto con su fondo ya no infla el envase** (`recorte.ts`, `empaqueDeArte`). Si el
fondo de la foto no se quita («conservado» o «dudoso»), el aspecto era el de la foto
ENTERA, márgenes incluidos, y con el alto de la ficha el ancho salía de ahí: una botella
de 10 cm sobre un estudio con degradé quedaba de 30 cm de diámetro, con 2 frentes por
entrepaño en vez de 8 — justo la cuenta que se negocia, y sin «≈».

* «Conservado» ahora se **recorta a la caja del producto** (`productoSobreFondo`): el
  fondo se modela como una superficie que une los cuatro bordes (un parche de Coons:
  reproduce exacto un degradé, que es lo que hace que un estudio no sea «parejo»), la
  tolerancia sale del ruido del propio borde (18 a 60) y las manchas de menos del 2 % de
  la mayor no cuentan (el ruido de una foto de celular). El fondo se deja —es lo que se
  pidió o lo que no se pudo quitar—; los márgenes no. «Dudoso» no se recorta: es el
  producto claro que toca los bordes, y la foto entera ES su caja.
* Y en los dos casos el ancho **no se cree a ciegas**: sin `ancho_mm` en la ficha se acota
  a 0,6–1,6 veces el aspecto típico de su forma (`ASPECTO_DE_FORMA`: botella 0,29, vaso
  0,83…), se rotula «≈» (`anchoEstimado`) y la ficha lo pide en amarillo («La foto
  conserva su fondo y el ancho no se puede medir de ella»).

**2. «1.000 g» es un kilo** (`contenidoDelTexto`). Acá la coma es el decimal y el punto
separa los miles; leído al revés, «Yogurt 1.000 g» era 1 g y el envase caía al mínimo de
4 cm, con decenas de frentes de juguete. Punto seguido de grupos de exactamente tres
cifras = miles; «1.5 L», con una cifra, sigue siendo litro y medio; y en litros o kilos un
«1.250» de miles daría un envase de 1.250 L, así que ahí se lee como decimal.

**3. La foto que no carga ya no deja la cara vacía** (`etiqueta.ts`). Con Render
despertando (502), un token vencido (401) o la red cortada, la etiqueta quedaba en
«error» para siempre: la cara probada sin producto, sin foto, sin patrón y sin relleno, y
el panel en «Preparando el producto…» hasta recargar la página.

* `cargar` mira `res.ok` (antes intentaba leer el HTML del error como imagen).
* Un error se vuelve a pedir solo a los 15 s (`REINTENTO_MS`) y con **«Reintentar»** en el
  panel, que dice «No se pudo cargar la foto del producto». Mientras reintenta, el estado
  es «reintentando» y cuenta como el error, para que la cara no parpadee vacía.
* `construirPrueba` devuelve `null` si la foto falló o si el arte ya no está en el
  catálogo, y la cara **cae a la lámina de siempre** (`resolveFaceMaterial`), como hacía
  el camino viejo a propósito. En una pantalla privada cae sólo a SU arte, nunca a la foto
  del espacio, que es la marca del que hoy lo tiene.
* Una recarga del catálogo que falla (después de «Guardar medidas») deja el catálogo que
  había: vaciarlo dejaba sin arte todas las caras probadas.

**4. La reunión manda en todo lo que se ve** (`privacidad.ts`). Tres agujeros con la
misma forma: la pantalla se comparte aunque no se haya apretado «Presentar».

* **El cartel del mouse** miraba sólo si había pruebas; con la reunión de Alpina en curso
  y la prueba recién quitada mostraba «Bimbo · $1.500.000/mes». Ahora usa la misma cuenta
  que el panel (`hayReunion`: prueba, proveedor de la reunión o selector abierto).
* **«Presentar» le pasaba la pantalla a otro**: con la reunión de Diana, un arrastre que
  empezó sobre la punta de Alpina la elegía, y el botón le mostraba a Diana los vasos de
  Alpina a pantalla completa. Ahora el proveedor de la reunión va PRIMERO
  (`proveedorParaPresentar`), el botón sólo «muestra al proveedor» la prueba del mueble
  elegido si es de él, y la de otro queda vacía con el aviso sin nombres de siempre
  (`pruebaAjenaDelMueble`).
* **El editor dibujaba las pruebas de todos**: probándole arroz a Diana, la punta seguía
  con los 345 vasos de Alpina de la mañana y su copete. Con una reunión fijada, la pantalla
  de la dueña dibuja sólo las pruebas de ESE proveedor (`pruebasDeLaReunion`); las otras
  no se borran —vuelven al cambiar de proveedor— y el panel dice «En esta cara hay una
  prueba de otro proveedor: no se muestra mientras dura esta reunión», sin nombre ni foto,
  con «Quitarla». Lo de los ESPACIOS (las fotos de los contratos vigentes) se sigue viendo
  en el editor: es la tienda como está, la misma que el proveedor recorre.
* **La lámina** sin producto en prueba era la pantalla de la dueña; ahora es para el que
  tiene el contrato (si tiene artes) o para nadie, y el PNG sin mueble elegido, para el
  proveedor de la reunión.

**5. «Propuesta» en la caminata** sacaba «Hoy» y «Con …» desde la cámara de la caminata
(la escena no atiende tomas en primera persona), «De cerca» igual a «Con …», y al
terminar giraba la cámara de la caminata. Ahora sale de la caminata primero y espera a
que la escena lo confirme (`primeraPersona` en `EstadoDeEscena`).

**6. Lo que costaba dibujarlo** (`DETALLE` en `perfiles.ts`). Una góndola doble de 3,6 m con
un vaso apilable eran 3.708 envases de 1.280 triángulos: 4,7 M, y sólo 1.260 envases al
frente. Lo de atrás (`prof` ≥ 1) va con 12 lados y 4 filas (192 triángulos; la botella,
312), y un vaso de perfil casi recto —un cono truncado, como el Finesse— lleva 4 filas
también al frente (512). Esa góndola baja a 1,1 M; la punta de Alpina, de 441 K a 105 K.
Las unidades se parten por profundidad una vez, en el memo, no en el render. Y entrar y
salir de Presentar ya no deja materiales vivos: cada mueble suelta los de antes
(`useSoltarMateriales`), la textura de alambre de la nevera es una por cantidad de
varillas, compartida, y la nevera de puertas y el mural no arman alambre ni forro.

**7. Lo chico.** La ficha `acostado` se guardaba y nunca se aplicaba (el editor pasaba
siempre `false`): ahora la sesión la pisa sólo si la dueña tocó «Mostrarla acostada» o
«Volver a pararla», y la ficha tiene la casilla «va acostado». Un envase que no entra de
FONDO dice «No entra de fondo: 45 cm en 40 cm de entrepaño» y no «de ancho». Y los campos
de la ficha siguen a la ficha cuando cambia desde afuera (otra foto en el alta, «Medidas»
de otro producto): quedaba el «9» viejo escrito con la ficha vacía.

**La guarda de «arte o relleno» ahora se corre.** Buscaba el texto
`cubiertas={cubiertasDe(`; con `cubiertasDe` devolviendo siempre `[null, null]`, o con
`ProductoEnMueble` sin pasarle `cubiertas` al relleno, seguía en verde mientras el relleno
de Nutresa se dibujaba debajo de los vasos de Alpina. `cubiertasDe` vive en `frentes.ts`, y
`probar-muebles` compila `ProductoEnGondola` y `ProductoEnPunta` con un React mínimo (los
componentes se llaman como funciones), llama el `ref` de cada `instancedMesh` con un nodo
falso y cuenta las instancias, cara por cara.

**Lo que se descartó, y por qué:** ninguno de los catorce era falso. Bajar la profundidad
a 2 para los envases torneados no hizo falta: con lo de atrás de pocas facetas el costo ya
bajó a la cuarta parte, y la tercera fila es la que se ve desde arriba en los entrepaños
bajos.

**Cómo se comprobó.** `probar-muebles` 147 (la foto que falla, ejecutada con un `fetch`
falso: 502, «Reintentar», el reintento solo; arte o relleno corrido; el tope de
triángulos; no entra de fondo; la reunión primero en Presentar, las pruebas de la reunión
en el editor, el cartel con `hayReunion`; la lámina privada; la caminata; los materiales
que se sueltan); `probar-arte` 29 (el estudio con degradé recortado al producto, el ancho
acotado, «1.000 g», la ficha acostada, los campos que siguen a la ficha). Cada guarda
nueva se rompió a propósito: 37 mutaciones, 37 cayeron (tres sobrevivieron la primera
vez y la prueba se reforzó), todo restaurado con `cp`. Mirado: la toma «De cerca» de la
punta con lo de atrás en 12 lados y el vaso recto en 4 filas no se distingue de la de la
ronda anterior; el editor durante la reunión de Diana muestra la punta de Alpina sin sus
vasos.

**El juego para el dueño** (`scratchpad/realismo/capturas/final/`): cada mueble ANTES y
DESPUÉS con el mismo encuadre, de frente y de cerca, en Presentar. El «antes» es la
build de HEAD (la lámina plana), exportada con `git archive` —sin tocar el árbol de
trabajo— y construida aparte; la cámara la fija una vista guardada en la cara
(`vista3D`), que las dos builds respetan con «Encuadrar esta cara», a ≥ 4,2 m del punto de
mira (la órbita de HEAD no deja menos de 4) y con la misma dirección que la toma de venta
de la build nueva. Dos diferencias que no son de encuadre y hay que contar al mostrarlo:
la nevera nueva lleva las rejillas acomodadas (la de 2 L no entra parada en las de
fábrica; la lámina vieja la estiraba), y en el robatope la punta vecina sale vacía en el
«después» porque la reunión es de Diana y los vasos son de Alpina.

### 2026-10-09 (tanda 1): nevera y envases — que se acomode sola, y que se pueda a mano

La dueña aprobó el rumbo y las exigencias del revisor, con una regla para todo lo que
se acomoda: **que se mejore sola, y si no lo hace bien, que haya cómo hacerlo a mano.**
Ocho pasos; todo lo que se elige sigue siendo de la sesión (`comoSePrueba`), nunca del
plano, y la pantalla del mercaderista y Vender no se tocaron.

**1. Las rejillas de la nevera: automáticas, «De fábrica» o «A mano».** La cuenta es una
sola, `rejillasDeLaPrueba` (`frentes.ts`, pura), y la usan el dibujo, el panel y la toma
de venta. *Automáticas* (lo que hay sin tocar nada): se acomodan sólo si el producto
parado no entra en alguna de fábrica Y acomodadas muestran más frentes; un producto que
ya entra queda en las de fábrica. *De fábrica*: las del mueble, aunque no entre (el panel
dice «No entra parada: 33 cm en 31 cm libres»). *A mano*: cuántas (de 1 a las de fábrica
—no hasta las que entran: con más, el panel tiene que poder decir dónde no entra—) y cada
rejilla se sube o se baja de a una ranura (`PARANTE.pasoRanura`, 2,5 cm) con 5 cm como
mínimo entre dos; la de abajo y el techo no se mueven. «A mano» arranca con las que se
ven, así que tocarlo no cambia nada hasta mover algo. Cambiar de modo o de cantidad
vuelve «Dónde va» a «Toda la cara» (los índices de «Por entrepaño» son de las filas
vigentes: el 3 de cinco no es el 3 de cuatro); mover una rejilla no (`ajusteDeRejillas`).
La toma de venta re-encuadra cuando las rejillas llegan tarde (la foto carga después
del primer encuadre), sin pisar un giro a mano, y la lámina lo dice en un renglón
«Exhibición». Con las fotos de prueba: la 2 L sale parada en **4** rejillas automáticas
(35 a 37,5 cm libres, 40 de frente) — el plan esperaba 3, pero `rejillasParaProducto`,
que no se cambió, reparte las que entran y entran 4; la 1,5 L, 4 × 11 = 44. *(Corregido en
la tanda 3: la holgura sobre el producto pasó de 2 a 5 cm (`HOLGURA_DE_REJILLA`) y la 2 L
sale con **3** rejillas de 47,5-50 cm, 30 de frente; la 1,5 L sigue en 4 × 11. Ver
«2026-10-10».)* «Mostrarla
acostada» sigue y acostada ignora la elección (las rejillas se acomodan para pararla).

**2. La botella PET: hombros llenos y torno fiel.** El hombro de la 2 L salía con un
anillo claro: el PET apenas teñido no caía en la cubeta de tono del líquido. Ahora la
clasificación es por **cromaticidad** (`claseDePixel`: líquido si el color normalizado
se aparta ≤ 0,06 del líquido y la luz está entre 0,3 y 1,8 veces la suya; claro, si es
neutro), las filas que son etiqueta o tapa no se tocan (`filasDeEtiqueta`) y el claro
del PET se llena con el líquido por distancia al borde. En la toma «De cerca» el hombro
mide p95 de luminancia 115 (la prueba exige menos de 150 sobre una botella sintética) y
mediana 54: L* 28 contra 27 del cuerpo, el mismo rojo. El perfil del torno es de **64 bandas** (era 24), cada una la
mediana de sus tres filas centrales, y `filasAdaptadas` suma filas donde el semiancho
salta más del 4 % o la cuerda del torno se sale de la silueta, hasta `TOPE_DE_BOTELLA`
(2.200; la botella del frente pasa de 1.664 a 2.176). El torno no queda más ancho que la
foto en más de 1 px. *Un costo que apareció al medir:* con 64 bandas la de abajo del
vaso Finesse es el canto redondeado de la base y mandaba el vaso «casi recto» a
dieciséis filas (1.280 triángulos por vaso del frente, +184 K en la punta). Ahora se
prueba si la quebrada de cuatro filas —más una para el canto que se aparta— sigue al
perfil: el Finesse queda en 576.

**3. La espalda de los envases torneados.** La UV del frente es plana: la mitad de atrás
recibía la foto espejada y a 70° se leía «esse» al revés. El torno del frente se arma
en dos medias vueltas (`mitadDeTorno`: el frente de +X a −X por −Z, la espalda de −X a
+X por +Z, cada una con su UV y sin costura compartida) y la espalda lleva una textura
propia (`espaldaDeEtiqueta`): los costados de la foto interpolados y la tabla del medio
sin texto, suavizada en vertical. `materialDeEtiqueta` tiene **índices fijos**: 0 la foto,
1 la tapa (o la foto, en la botella), 2 la espalda — los grupos de cada geometría
apuntan a un material que existe en todos los envases. Lo de atrás («bajo») no lleva
espalda: no se ve.

**4. La bolsa almohadillada.** Se para en su fuelle: el lomo curvo, ~5 mm en los
costados (`MEDIO_COSTADO`), un sello plano arriba (1,2 cm o el 7 % del alto) un 8 % más
claro por color de vértice, y lo de atrás con la mitad de filas y columnas.

**5. El cabezote de la nevera es un aviso luminoso.** Un recorte grande de la etiqueta
—la banda de la marca, con un 15 % de aire, no la etiqueta entera: la de una 2 L es
casi cuadrada y al alto del cabezote quedaba un sello chico en un aviso de 1,1 m—,
retroiluminado y sólo en la cara del frente de la chapa (los otros cinco lados, color).

**6. Las dos líneas del copete: bisectadas.** La causa no era el copete: era el
**respaldo de la góndola vecina** (GON-01), una caja cerrada que desde el eje de la
toma se ve exactamente de canto; con triángulos casi de perfil, swiftshader deja pasar
la profundidad y dibuja dos líneas sobre lo que está detrás. Se encontró apagando piezas
con interruptores de `localStorage` en una build de depuración (el árbol se restauró
con `cp` y quedó sin rastro). La góndola ahora lleva un respaldo de **una cara**
(`geometriaRespaldo(…, cerrado=false)`, `respaldoCerrado={false}` sólo en
`GondolaReal`: la espina cierra atrás): el salto de luminancia en la línea pasó de 27,1
a 0,0. La punta conserva la caja: con una cara sola se veía a través y `/taller`
cambiaba un 4,2 %; así queda idéntico píxel a píxel (8 de 8). *Visto de paso, sin
arreglar:* los parantes del extremo de GON-01 se meten 2,5 cm en la punta pegada.

**7. El surtido del mismo proveedor, y la variación con un solo arte.** En la góndola y la
punta (`TIPOS_CON_SURTIDO`), el panel ofrece «Más productos de <proveedor> en esta
cara»: sólo artes de ESE proveedor, sacados del catálogo, sin buscador libre (la
pantalla puede estar compartida), hasta 4 en total (`MAXIMO_DE_SURTIDO`). Cada producto
va en un **bloque vertical** (`bloquesDeSurtido`): un bloque por vano, empezando por el
que se ve primero desde el pasillo (+X), con cortes redondeados en los vanos; con menos
vanos que productos, partes iguales. Cada producto llena su bloque en todos los
entrepaños y ningún frente cae sobre un parante. `surtidoALaVista` filtra lo que no es
del proveedor (y en la reunión de otro, nada). El copete, el cabezote, la toma y
`/taller` siguen con el principal, y el pie de la lámina nombra los productos, sin
período ni valor. **Con un solo arte** en una cara de más de 1,2 m (el «papel de
colgadura»): en un 35 % de los entrepaños de cada vano falta una columna del frente
(sólo con dos o más de fondo, y la de atrás está: nunca un hueco de punta a punta) y una
caja de cada cuatro va girada ±1,5°, acotada para no cruzarse con la vecina. Con surtido
no hay frente corrido.

**8. El frío.** `vaRefrigerado(categoría, nombre)` (`producto.ts`, pura): sí yogur, kumis,
queso, mantequilla, carne, embutido, pollo, pescado, helado, «refrigerado» o «lácteos
frescos»; no larga vida, UHT, arequipe, en polvo — y esos le ganan a los «sí». El
selector marca «frío» en la tarjeta y el panel avisa «Este producto va refrigerado:
probalo en una nevera» cuando el mueble no es de frío (`avisoDeFrio`, con los cuatro
muebles fríos de `FIXTURE_DEFS`). **Avisa, no prohíbe:** decide la dueña. Y un vaso sin
ficha no se apila: sólo la ficha lo dice (`apilable = ficha?.apilable ?? lata`).

**El costo, medido** (un cuadro de la toma «De frente», contando las llamadas de WebGL
con la build de HEAD y la nueva sobre la misma base): nevera con la 2 L 710 → 750
llamadas y 93 K → 317 K triángulos (en HEAD la 2 L no entraba parada; ahora son 40
botellas de pie), punta con el Finesse 1.196 → 1.204 y 391 K → 406 K, góndola con la
caja 986 → 966 y 180 K igual,
robatope con la bolsa 1.188 igual y 219 K → 208 K. Sigue `frameloop="demand"` y sin
postproceso.

**Cómo se comprobó.** `probar-muebles` 162, `probar-arte` 38, `probar-propuesta` 20 (con el
renglón «Exhibición» y el pie del surtido); `tsc` y `build` limpios. Cada guarda nueva se
rompió a propósito con `mutar.py`: 27 mutaciones, 27 cayeron (tres sobrevivieron la
primera vez —la UHT y la larga vida no ganaban contra nada; el rosa caía afuera por
claro, no por color— y las pruebas se reforzaron), todo restaurado con `cp`. Las
capturas (`scratchpad/realismo/capturas/r2-nevera-y-envases/final/`, nunca en el repo):
la nevera automática, de fábrica, a mano y con la 1,5 L; la botella de cerca; el vaso a
70° y la bolsa a 60°; la góndola de Kellogg's con un arte y con el surtido (Müsli,
Barbie y Zucaritas, fotos de Open Food Facts); el aviso de frío en la punta y su
ausencia en la nevera.

### 2026-10-09 (tanda 2): el ambiente — que el lugar se vea tan real como el envase

La crítica de la tercera ronda lo dijo así: «un proveedor reconoce su producto, pero no
reconoce un supermercado». El envase ya era creíble y el lugar no: muebles gris mate sin
un brillo, uniones sin sombra, porta-precios vacíos, la mitad de arriba del cuadro con
el color plano de la sala, un piso que no reflejaba nada y la nevera vecina pesando lo
mismo que la que se vende. Seis pasos (9 a 14), **todos sólo en la pantalla de venta**
(Presentar y la lámina): el editor y `/taller` quedan como estaban, salvo el piso, que
ahora sigue los límites reales de la planta. Nada se guarda en el layout, sigue
`frameloop="demand"` y no hay pases de posproceso.

**9. Cielo raso a 3,2 m, luminarias, muros que cierran la sala.** Antes de construir
nada se midió dónde corta la toma de venta (cámara a 1,25 m, borde de arriba del cuadro
a ~15,8° sobre la horizontal): con un techo a 4,5 m no entraba **ninguna** fila de techo
en las seis tomas de PUN-01, NEV-01 y ROB-01; a 3,2 m, la punta muestra 88 filas de
frente y 127 de tres cuartos. Por eso es un cielo raso a 3,2 m (`ALTO_CIELO_RASO`), el de
un supermercado mediano, con las luminarias **embutidas**: tiras de 2,4 × 0,2 m
(`LUMINARIA`) en filas paralelas al eje largo de las góndolas (`direccionDeGondolas`:
vota cada mueble alargado con su largo, así dos góndolas de 3,6 m le ganan a tres puntas),
cada ~3 m y con al menos 20 cm entre tiras. El paso se ajusta para que la primera y la
última queden a 0,5 m del muro, como las deja un luminotécnico: centradas con el paso
fijo, en la sede de pruebas quedaba 1,3 m de techo sin luz contra cada muro y la toma
en tres cuartos del robatope —que mira a una esquina— no veía ninguna. La cuenta es pura
(`luminariasDeTienda` en `utils/planta.ts`) y devuelve, además de las instancias, los
PARÁMETROS de la grilla (origen, paso, tamaño, giro): con eso el brillo del acero y el
reflejo del piso saben en O(1) si en un punto del techo hay una tira, sin recorrer la
lista. Los muros de venta son cuatro planos de una sola cara que miran hacia adentro
(`muebles/sala.ts`), unidos en una geometría, y los zócalos en otra; el cielo raso mira
abajo. Desde la órbita alejada o la vista superior no se dibujan, y la tienda se ve como
una maqueta abierta en vez de una caja. En primera persona siguen las cajas de 4,5 m de
la caminata y NO los planos (las dos cosas juntas se pisaban y titilaban). Ni techo ni
muros tiran ni reciben sombra, y no suman luces: el mapa de sombras y la calibración de
la escena no se tocan. Son 4 llamadas (cielo raso, luminarias en una `InstancedMesh`,
muros, zócalos). En venta no se dibuja la grilla del piso.

*Por qué se revisó «Techo no»* (ver *Muros, y sólo al caminar*): aquella decisión
suponía un techo que tapa la direccional, que obliga a otra iluminación y que esconde el
plano en la órbita. Éste no tira sombra (la direccional pasa), no agrega ninguna luz (no
recompila nada), tiene una sola cara que mira abajo (desde arriba no existe) y sólo está
en venta. Y a 3,2 m sí entra en cuadro. El «remate del muro» que quedaba sabido (*Lo que
queda sabido*, más abajo) se resolvió así, sin tocar la luz.

*StoreRoom con los límites reales.* El piso, sus bordes y los muros salían de una caja
calculada SIN la rotación de los muebles (`f.x ± f.w/2`): con góndolas giradas 90° el
muro quedaba corrido hasta (w − d)/2 ≈ 1,35 m respecto de la caminata, la cámara de
venta y las luminarias. Ahora todo sale de `limites` (el mismo de la caminata y de
`vistaDeVenta`). En el editor eso se ve: **el piso coincide con la grilla**. Es la única
diferencia del editor además de los envases.

*Los uniformes de la tienda son UNO.* `UNIFORMES_DE_TIENDA` (`luzDeVenta.ts`) guarda la
altura del cielo raso, la grilla y los límites; `StoreRoom` los actualiza cuando cambia
la planta (`ponerTienda`) y cada material de venta engancha esas MISMAS referencias en
`shader.uniforms`. Mover un mueble no recompila nada.

**10. La luz de venta: un programa, y el brillo de las luminarias en el acero.** La luz
del cuarto se escribía DENTRO del shader, así que cada intensidad era un programa (había
cuatro: 1,15, 0,69, 1,035 y 0,92). Ahora la intensidad y el brillo son uniformes de cada
material (`uLuzVenta`, `uBrillo`, guardados en `material.userData.luzDeVenta`) y la
clave de programa es una sola, `luz-de-venta`: three llama a `onBeforeCompile` por
material aunque reuse el programa, así que cada material engancha los suyos. Los
materiales DECLARATIVOS del robatope pasan por `usePropsDeLuzDeVenta`, un objeto estable:
con `conLuzDeVenta` en cada render, R3F les ponía uniformes nuevos en cada cuadro y los
del programa compilado —los que atenúa el paso 14— quedaban huérfanos.

El brillo es un término más del mismo trozo de shader, sin muestrear ningún mapa (el
PMREM en cada píxel de cada mueble hacía el cuadro 25 veces más caro). Con
`vViewPosition`, `normal`, `viewMatrix` y `cameraPosition` se arman la posición y el
rayo reflejado en el MUNDO; si sube, se corta con el plano del cielo raso y la grilla dice
si ahí hay una tira (`floor` en el marco girado de la grilla, el borde suavizado con
`fwidth` más la distancia por la rugosidad, para que una tira fina no titile); fuera de
la planta, el muro; si baja, el piso. Fresnel de Schlick con F0 = 0,04 (la pintura
electrostática es un dieléctrico), por `uBrillo` de cada pieza (`BRILLO`: pintado 0,35,
estructura 0,45, porta-precios 0,25, panel 0,2, zócalo 0,3, relleno 0,15, robatope 0,3) y
por la oclusión del paso 11. **Se prototipó primero en JS** (`brilloDeVenta`, el gemelo
de la cuenta, con las mismas constantes que el GLSL —una guarda lo vigila—) con las
cámaras de `vistaDeVenta` sobre el porta-precios y el parante de PUN-01. Ahí se vieron
dos cosas que la fórmula del borrador (`pow(R·arriba, 8)` sobre dos colores) no daba:
con el rayo espejo solo, una cara vertical vista desde 1,25 m refleja el PISO y nunca
una luminaria (0,9 sRGB de brillo en el parante); y una tira de luz es casi cien veces
más clara que el techo. El reflejo promedia dos rayos —el espejo y uno levantado
`0,8 × rugosidad`, con peso 0,35— y la luminaria vale 48 (lineal) contra 0,55 del techo:
con 3 el reflejo ensanchado de una tira de 20 cm no se despegaba del techo (6 sRGB), con
120 lavaba el acero. Con la cámara por encima del cielo raso el reflejo se apaga (desde
arriba el techo no se dibuja, y el piso mostraba manchas bajo luminarias invisibles).

**11. La sombra de las uniones, sin mallas nuevas.** El panel de fondo ya era una
`InstancedMesh` de listones: en venta cada listón recibe `setColorAt` según su distancia
al entrepaño de arriba (`SOMBRA_DE_LISTON`) y three multiplica (`USE_COLOR`) sin cambiar
de material. Los entrepaños llevan color de vértice (`geometriaEntrepanoDeVenta`): 0,64
en la unión con el fondo hasta 7 cm (con 0,72 sobre 5 cm, desde 1,25 m era una raya de 1
o 2 píxeles) y 0,85 a 3 cm de cada parante. Ese material (`pintadoAO`, con
`vertexColors`) existe sólo en venta y sólo lo usan los entrepaños; la tapa de la punta,
la espina y lo demás siguen con `pintado` —con `vertexColors` y sin atributo `color`
saldrían negros, y una guarda recorre la escena del taller buscando ese caso—.

*Lo que costó:* los valores salen de medir en la captura, no del albedo. El tono de la
escena (ACES) achica la diferencia en los grises claros (un 0,86 sale apenas un 7 % más
oscuro), y entre dos entrepaños de 33-37 cm NINGÚN listón queda limpio: «el panel a media
altura» es el segundo listón, no uno a 1,0. En las tomas desde 1,25 m el de justo debajo
lo tapan el labio y el porta-precios de los entrepaños bajos; con una cámara algo más
alta (Presentar en GON-02) sí se ve, y con 0,62 / 0,74 la franja bajo el entrepaño salía
a 148 sRGB contra ~160 del medio: un 8 %, y la crítica pide 12. Quedó `debajo` 0,48,
`siguiente` 0,66, `tercero` 0,86 y `encima` (la unión con el entrepaño de abajo) 0,82.

**12. El piso de venta: oscuro al pie y un reflejo tenue de las luminarias, en O(1).**
El mismo Lambert de la baldosa, con un parche (`parcheDelPiso`); en el editor, el de
siempre. (a) `sombraDeHuellas` (`utils/planta.ts`, pura) arma un mapa de 10 cm por píxel
con las huellas de `huella()` —la misma de la caminata, con la rotación— difuminadas 30
cm, y oscurece hasta un 30 % el color después de `map_fragment` (una sede de 40 × 30 m
son 120 KB; se rehace sólo cuando cambia el plano). (b) El rayo reflejado se corta con
el cielo raso y se evalúa contra la MISMA grilla con los uniformes compartidos: nunca se
recorre una lista de luminarias en uniformes, que en una integrada podía pasarse del
límite. Sólo cuenta la luminaria, como mucho el 12 % del blanco DE LA PANTALLA (se suma
después del tono: sumado antes, en un piso claro, eran 5 sRGB), con el borde ensanchado
por la distancia.

**13. Habladores, y el precio al público OPCIONAL en la ficha.** En Éxito, Olímpica o
Jumbo no hay un frente sin su etiqueta, y la tira blanca y lisa era, de cerca, la señal
más clara de maqueta. Pero un hablador es justo donde un sistema de venta podría mentir.
Tres reglas (`muebles/habladores.ts`, puro):

* **Nunca se inventa un precio.** El hablador del producto en prueba lleva la cifra SÓLO
  si alguien la cargó en la ficha; si no, en su lugar van dos barras grises. El nombre va
  sin sus números («150 g» se lee como un precio desde el otro lado de la videollamada).
  `contenidoDelHablador` da `precio: null` sin precio y una guarda dibuja con un contexto
  2D falso y verifica que no se escribe ningún dígito.
* **Lo de otros no se lee.** Lo vendido a otros lleva habladores GENÉRICOS: etiquetas
  blancas con la franja amarilla y rayas grises, sin texto (no llama a `fillText`), con
  CERO geometría —es la misma tira con una textura de módulo compartida
  (`preciosConHabladores`), que repite una etiqueta cada 35 cm; para eso la UV de la cara
  de la tira pasó a metros a lo ancho y 0-1 a lo alto (sin mapa no cambia nada)—. Van
  sólo en los (vano, entrepaño) que el relleno cubre en un 80 % o más
  (`tramosConRelleno`): un slot vendido de medio vano deja ese porta-precios liso, porque
  si no la mitad libre tendría habladores. Lo libre, sin hablador.
* **El de un arte ajeno no sale** en una pantalla privada (`habladorALaVista`, con la
  misma privacidad que la prueba).

El hablador de la prueba es una `InstancedMesh` de planos de 6 × 2,6 cm por (fila,
producto), HIJA del grupo de la fila (se inclina con el entrepaño), uno en el borde
izquierdo de cada bloque visto desde el pasillo y otro cada 60 cm, 1 mm delante de la
caja REAL de la tira. Dónde está la tira lo dice una sola cuenta, `labioDeFila`
(`medidas.ts`), con las constantes que usan los muebles (las de la nevera y el robatope
pasaron a `NEVERA` y `ROBATOPE`). La textura es una por arte (256 × 112) y se suelta con
su etiqueta.

*Un detalle que sólo se vio en la captura:* la tira de la góndola y la punta va centrada
en el plano de apoyo y montada DETRÁS del labio del entrepaño, que sube 3 cm: la mitad
de arriba de la tira no se ve. El genérico centrado salía como una raya gris sin la
franja amarilla. Ahora se dibuja en lo que se ve (`VENTANA_DE_LA_TIRA`, ≈ 0,43 del alto
desde abajo, con el lienzo a 64 filas), y una guarda mide esa ventana sobre las
geometrías puestas como las pone `CaraDeEstanteria`.

*El precio en la base, ahora o nunca.* `supplier_asset_specs` es nueva en esta rama y no
se desplegó: es la última oportunidad de una columna tipada. `precio_publico` (entero,
pesos, nulo por defecto) con tope en la API (`ge=50, le=10_000_000`: 0 es un error y 20
millones, un tipeo), en el alta por formulario y en `EditorDeFicha` como «Precio en
góndola (opcional)», vacío por defecto. La tabla ya estaba en `TABLAS_DEL_CLIENTE` y la
copia va por las columnas reales: la ficha con precio viaja en la copia y en el traspaso
(pruebas en `test_catalogo`, `test_copia_de_seguridad` y `test_traspaso`). **Una base
LOCAL creada desde esta rama antes de este cambio** tiene la tabla sin la columna, y
`create_all` no agrega columnas: `GET /api/catalogo/` se cae con «no such column». Hay
que correr una vez `ALTER TABLE supplier_asset_specs ADD COLUMN precio_publico INTEGER`
(sólo si falta). Producción no tiene la tabla: nace con la columna.

**14. Los vecinos dejan de competir; el relleno, con variación; el contratado entero,
lleno.** Se atenúa sólo si algún mueble tiene FOCO —el de una prueba a la vista o el de
la toma—; sin ninguno (Presentar sin proveedor) la tienda queda entera. El foco va en un
contexto APARTE, `FocoDeVenta`, boolean y memoizado en el grupo de cada mueble:
`LuzDeVenta` es dependencia de los `useMemo` de materiales de ~100 muebles, y un objeto
nuevo en cada render los rehacía todos. La atenuación la escribe un efecto en los
uniformes del paso 10 (`atenuarUniformes`) con `invalidate()`: no se recrea ni se
recompila nada. `ATENUACION` es 0,55 de la luz y 0,5 del brillo, no el 0,75 del plan:
medido en bolsa-4, con 0,75 la góndola de al lado quedaba sólo un 18 % abajo (la luz de
la escena, que no se atenúa, pesa). La nevera vecina además apaga su frío
(`apagarElFrio`: forro, interior y tiras), por efecto; sus botellas mudas siguen ahí, sólo
dejan de competir. El relleno neutro lleva en venta un tono por unidad (±6 %, sembrado
por mueble, `tonosDelRelleno`) y una etiqueta más clara por color de vértice; en la caja
—el envase más repetido— la etiqueta es de corte NETO en las dos caras grandes (cada
cara en tres franjas con sus propios vértices, 20 triángulos como la de antes): con el
degradé suave de la primera versión el relleno seguía siendo una pared de bloques de un
color. Y **el mueble contratado ENTERO con los slots libres** (la góndola de Bimbo de
*Lo que no se hizo*, arriba) se ve en venta con el relleno de su rubro: es vendido, y lo
vendido puede llevarlo; en el editor no cambia.

**Medido sobre las capturas** (`scratchpad/realismo/capturas/r2-ambiente/`, nunca en el
repo; `t2/medir-t2.mjs`, sin Chromium):

* **Cielo raso:** en el tercio de arriba del cuadro, 4 luminarias en la punta de frente,
  5 en tres cuartos, 3 en el robatope en tres cuartos y 2 en la nevera en tres cuartos
  (de frente, en la nevera, la parte de arriba es el muro de atrás, como se esperaba). El
  color plano de la sala (#e8e4dc) ocupa el **0 %** de todas las tomas de venta; en
  despues-r2 era el 24-26 % de la punta y hasta el 28 % del robatope.
* **Piso:** el reflejo de las luminarias deja manchas 13-14 sRGB por encima del piso de
  alrededor en las tomas de tres cuartos (12 en la nevera; antes, 0). Junto a la base de
  la punta el piso queda un 12 % más oscuro que a ~1 m (antes, 1,5 %).
* **Uniones** (un vano vacío de GON-02, de cerca): la franja bajo el entrepaño a 129 sRGB
  contra ~157 a media altura (18 % más oscura); la unión del entrepaño con el fondo a
  175-179 contra 214 de su centro (16-18 %).
* **Vecinos:** en la toma de la nevera, NEV-02 queda un 37 % menos luminosa que NEV-01,
  con sus botellas mudas a la vista (antes era un 76 % MÁS clara); en la del robatope, la
  góndola libre de al lado queda un 25 % por debajo (antes, un 2 %).
* **Brillo del acero:** lo prueba el gemelo en JS con las cámaras de venta (una mancha de
  luminaria 15 sRGB o más sobre el promedio de su pieza, que se corre entre frente y
  tres cuartos). En la captura no encontré una medida que lo separe bien: el contraste
  p95−p5 «sin el producto» que pedía la crítica (de ~25 a 50 o más) da, con mi máscara,
  66-100 ya en despues-r2 y 97-120 ahora; el número de la crítica no se pudo reproducir.
* **Titileo:** en un giro lento de 32 cuadros (`t2/giro2.mjs`, con video VP8 a 500 kbps),
  los saltos de ida y vuelta de un bloque de 24 px fuera del piso son los mismos que con
  la build de b58a759, sin brillos (1.178 contra 1.172); en el piso, 359 contra 305: son
  los reflejos que se deslizan con la cámara. Mirados cuadro a cuadro, sin escalones.

**El costo.** Un cuadro de cada toma en swiftshader a 1920 × 1080 (`t2/costo-tomas.mjs`: llamadas y
triángulos de UN cuadro; el tiempo, hasta un `readPixels` que espera a la GPU —`gl.finish`
no bloquea en Chrome—), contra la build de b58a759 sobre la misma base. **Llamadas**: como
mucho 632 (la punta en tres cuartos; tope 700) y entre −1 % y +6 % por toma. **Triángulos**:
la punta +2 % (263 K), la góndola y el robatope menos que antes; la nevera pasa de 78 K a
160 K por las 40 botellas paradas de la tanda 1. **El cuadro** NO cumple el tope de 1,25
veces: la punta tarda 1,29-1,40 veces lo de antes (1.450-1.865 ms), la góndola 1,22-1,32,
el robatope 1,46-1,48 y la nevera 2,2-2,3 (ahí pesa la tanda 1). Con builds de prueba
(archivo respaldado y restaurado con `cp`) se vio de dónde sale: sin el brillo del acero
la punta baja a 1.274 ms y el robatope a 1.156 (−240/−280 ms); sin el parche del piso,
−30 a −100; sin muros ni cielo raso, nada. Es cuenta por píxel, que en swiftshader (la CPU
pinta) se paga entera y en cualquier placa integrada casi no; sigue `frameloop="demand"`
y no hay pases. Si en la PC de la dueña se siente, la palanca es el segundo rayo del
lóbulo o sacarle el brillo al relleno (queda anotado como pendiente).

**Cómo se comprobó.** `tsc` limpio; `npm run probar` entero en 0 fallas
(`probar-muebles` 183, `probar-arte` 39, `probar-planta` 49, `probar-propuesta` 20);
`build`; backend `pytest -q -p no:warnings` completo: 1.218 pasan, 2 saltadas, 7 xfail
(por el paso 13). Mutaciones con `mutar.py` (respaldo y vuelta con `cp`, `git diff --stat`
limpio): 48, todas cayeron al final; dos sobrevivieron la primera vez —el brillo con el
rayo espejo solo y una luminaria apenas más clara que el techo pasaban, porque el canto de
una cara vista de lado refleja el techo liso y sube igual— y la prueba ahora exige una
mancha DE LUMINARIA sobre el promedio de su pieza. Las bases `.db` del scratchpad ya
tenían la columna. Capturas (`scratchpad/realismo/capturas/r2-ambiente/`): `final2` (los
cuatro casos, editor y venta, y la vista superior), `vecinos-final2` (PUN-03 contratada
entera, PUN-02 y GON-02 con slots vendidos, editor y Presentar sin proveedor), `control`
(el precio sintético de 1.234, rotulado como dato de prueba), `giro-final` y `costo-*`.

### 2026-10-10: la tercera crítica — que la tienda parezca tienda

La tercera crítica se atendió en tres tandas en serie: la nevera y los envases (tanda 1),
el ambiente (tanda 2) y ésta, **Presentar y el encuadre** (pasos 15 a 18), que cierra con
la demo por proveedor y el antes/después para el dueño. Lo que se veía por la
videollamada: una app —la barra de RECABRA y el lienzo con las esquinas redondeadas—, la
píldora del HUD tapando el producto en «De cerca», la persona que no salía en el robatope
y, cuando salía, pesaba casi como el mueble; «De cerca» de la punta con medio vaso del
copete arriba; el robatope de cerca con 2,6 repisas, y elegir un arte que trababa la
pantalla medio segundo. Todo sigue siendo de la sesión: nada va al layout, Vender y la
pantalla del mercaderista no se tocaron, sigue `frameloop="demand"` y no hay pases.

**15. Presentar ocupa la pantalla.** En Presentar el contenedor del editor es `fixed
inset-0 z-[60]`, sin `rounded-xl` ni `border`: tapa la barra aunque el navegador niegue la
pantalla completa. La pantalla completa se pide del contenedor **en el mismo clic**
(`pedirPantallaCompleta`, desde «Mostrar al proveedor» y «Presentar», con `catch`): un
efecto o un `await` pierden el gesto del usuario y el navegador la niega. La salida es
**un** efecto sobre `presentationMode` (su limpieza): cubre «Salir», el botón, Esc, el
desmontaje y cualquier `setPresentationMode(false)`, sin repetirla en cada botón. (Acá
decía que un `fullscreenchange` sin elemento apagaba Presentar: ya NO —desde *2026-10-10
(tarde)*—, porque Chrome saca de pantalla completa a la pestaña que deja de estar al frente
y el Ctrl+Tab a Meet dejaba el editor a la vista; salir de la pantalla completa deja
Presentar con su `fixed inset-0` y el HUD ofrece volver.) Sin pantalla completa, Esc sale de Presentar desde el manejador de teclas,
**salvo** en primera persona o con el mouse capturado (`document.pointerLockElement`):
ahí Esc suelta el mouse, como siempre.

* **El aviso del navegador.** Al entrar a pantalla completa, Chrome y Edge muestran unos
  segundos «Presioná Esc para salir de la pantalla completa» arriba al centro, y **el
  proveedor lo ve** por la videollamada. Es del navegador y no se puede esconder (a
  propósito: es la defensa contra una página que se haga pasar por el escritorio). Si
  molesta, se entra a Presentar antes de compartir la pantalla o se espera a que se vaya.
  Chromium sin ventana (Playwright) no lo dibuja: las capturas no lo muestran.
* **El HUD se esconde solo** (`HudQueSeEsconde`): a los 2 s sin mover el mouse
  (`HUD_SE_ESCONDE_MS`) queda transparente y sin recibir clics, con una transición, y
  vuelve con `mousemove` o `touchstart`; el cursor se esconde con él (en el contenedor).
  El temporizador es estado de la píldora y no del editor: en el editor, cada vez que
  aparece o se esconde se re-renderizaría la escena entera.
* **La toma sigue al tamaño.** Pasar a pantalla completa cambia el lienzo, y la toma
  quedaba encuadrada para el tamaño de antes. El efecto atiende la clave
  `${n}|${ancho}x${alto}|${filas}`: un pedido nuevo siempre encuadra; un cambio de tamaño
  o de filas (las rejillas que llegan tarde) sólo si la cámara sigue donde la dejó la toma
  (posición y mira a menos de 1 mm). Un giro a mano de la dueña no se pisa al agrandar la
  ventana.
* **Dos pendientes de privacidad.** (a) «Cambiar de proveedor» dejaba la reunión sin
  proveedor con el selector abierto, y en ese rato el editor volvía a dibujar TODAS las
  pruebas de la sesión: `eligiendo` subió del panel al editor y `pruebasDeLaReunion(…,
  eligiendo)` no da ninguna con el selector abierto y sin proveedor. (b) En Presentar con
  un proveedor fijado, la prueba oculta de OTRO proveedor se avisa sin nombres y **sin**
  «Mostrarla» (le pasaba la pantalla al otro): el botón se ofrece sólo con `privadoPara`
  nulo, cuando no hay nadie identificado.

**16. Los encuadres: una sola cuenta para la toma y la persona.** La persona no salía en
el robatope porque la toma «De frente» encuadra la franja del mueble con un 12 % de aire,
y el robatope mide 1,6 m: la cabeza (1,70) quedaba afuera y la silueta se escondía. Y la
silueta se calculaba aparte de la toma, así que podía caer donde la toma no miraba.

* `personaYTomaDeVenta` (`utils/planta.ts`, pura), para «De frente» y «Tres cuartos» de la
  cara entera: prueba separaciones de 1,2 → 1,1 → 1,0 → 0,8 → 0,6 → 0,45 → 0,3 m
  (`SEPARACIONES_DE_LA_FIGURA`) a los dos lados, primero el libre (`ladosPorLibre`); para
  cada una arma la toma con `vistaDeVenta`, con el foco subido a 1,75 m y un `incluir` que
  abre el cuadro hasta la persona SIN correr el centro del mueble; se queda con la primera
  cuyas cuatro esquinas (`FIGURA_DE_ESCALA`, proyectadas con la MISMA cámara) caen dentro
  de ±0,98, sin montarse sobre la cara ni salirse de la planta. Si ninguna entra, la toma
  de siempre y sin persona: media persona no da escala. Pasa en la cara B de GON-01, que
  da a un pasillo de 2 m. La escena dibuja ESA persona (`personaDeVenta`), y la lámina
  abre su recorte hasta ella (`aspectoConPersona`). Por entrepaño y «De cerca» miran lo
  elegido de frente y no llevan persona.
* En venta la silueta es **gris claro, #b8b4ae**, opaca (con `alphaTest`): la de #8c867e
  pesaba casi como el mueble. El color y la separación entran como parámetros sólo en
  venta; el editor sigue con #8c867e y a 0,3 m del canto.
* **«De cerca» de la punta no corta el copete.** `techoDeCara(h)` (`medidas.ts`: h menos
  el copete, nunca menos de 40 cm) es la única cuenta del alto del cuerpo, y la usan
  `PuntaReal`, `ProductoEnPunta`, la venta y la cámara (`FocoDeVenta.techoDeCara`; antes
  había dos copias y `focoDeLaPrueba` no sabía del copete). Si el borde de arriba del
  cuadro cae dentro del copete, la mira baja lo justo para que quede debajo: arriba se ve
  la tapa del cuerpo y la barra de luz, nunca medio cartel. Y el entrepaño elegido queda
  por encima de la franja del HUD (110 de 1080 px, `FRANJA_DEL_HUD`), por si la píldora
  vuelve.
* **El robatope de cerca, con dos repisas.** En un mueble angosto (vano de menos de 0,5 m,
  `MUEBLE_ANGOSTO`) `focoDeLaPrueba` devuelve el PAR de repisas vecinas con producto más
  cerca de 1,3 m (`parDeRepisas`) y la toma las deja en el 70 % del alto
  (`LLENADO_DE_PAR`). Antes encuadraba dos y media y la bolsa ocupaba ~245 px.

**17. Elegir un arte no traba la pantalla.** Se midió antes de tocar (`t3/perf3.mjs`: el
perfilador de CDP y un `PerformanceObserver` de tareas largas, en la build local con
swiftshader). Al elegir el Finesse el hilo principal se bloqueaba **987 ms** (y otra de 328),
y el tiempo no estaba donde se suponía: 792 ms eran `getImageData` —el lienzo 2D sin
`willReadFrequently` vive en la GPU y cada lectura baja la imagen entera— y 301 ms
`getProgramInfoLog`, que es three esperando el enlace del programa del envase en el primer
dibujo. El recorte y las variantes, juntos, poco más de 150 ms. Los arreglos, en el orden
en que se fueron midiendo:

1. `willReadFrequently` en el lienzo de la tapa (el único `getImageData` que quedaba en
   `etiqueta.ts`): 987 → 420-484 ms.
2. **Un Worker de módulo, perezoso** (`recorte.worker.ts`, creado en el primer uso desde
   `prepararFoto.ts`; nunca al importar, porque probar-muebles y probar-arte importan
   esos módulos en node). El `fetch` con `res.ok` queda en el hilo principal; al worker va
   el Blob y vuelven el recorte y las variantes con sus buffers TRANSFERIDOS. Sin Worker u
   OffscreenCanvas, o si el módulo no arranca (`onerror`: lo pendiente se contesta y el
   worker se termina), el mismo código partido en etapas (`prepararFotoPorEtapas`, con
   `scheduler.yield` o `setTimeout(0)` entre una y otra). La vista previa del alta
   (`EditorDeFicha`) usa el mismo worker. El ámbito del worker se tipa con una interfaz
   mínima: la lib WebWorker en el `tsconfig` choca con la del DOM.
3. **El programa**: una vez por sesión, `compileAsync` de los materiales del envase (los
   cuatro con luz, instanciados, y el impreso del copete) con mallas fuera de cuadro, y la
   consulta que fuerza el enlace (`getUniforms`) en un rato libre.
4. **La textura**: `initTexture` y un `fenceSync` de WebGL2 que espera a la GPU ANTES de
   avisarle a la escena; la subida no cae en el cuadro del clic.

Quedó en **91-101 ms** sin precalentar (tope 300). Y con el proveedor de la reunión fijado,
al abrir el selector se precalientan hasta 6 artes suyas (`PRECALENTAR_HASTA`), de a una,
sin pasar el máximo de 16 del caché ni desalojar lo que está en uso: elegir una de ésas
no produce **ninguna** tarea larga (tope 150). `requestIdleCallback` no existe en Safari:
`enReposo` cae a `setTimeout`. La cuenta del worker (`prepararFoto`, pura) da los mismos
bytes que la del hilo principal y que el camino troceado (probar-arte), y en el navegador,
con una foto real, el worker y el hilo principal dieron lo mismo píxel a píxel
(`createImageBitmap` y OffscreenCanvas podían convertir el color o premultiplicar distinto:
no lo hacen).

**18. La demo por proveedor, y el antes/después.** Una reunión por proveedor, cada mueble
con un producto que un comprador colombiano reconoce ahí, en la base LOCAL de capturas
(`fichas.mjs`, `sembrar.mjs` y `t3/demo.mjs` en el scratchpad; `srv/reiniciar.sh --demo`):

* **Alpina**: PUN-01 con la **Avena Finesse larga vida 1 L** (caja de 71 × 235 × 64 mm, no
  apilable, foto de Open Food Facts: la leche entera y la deslactosada de 1 L sólo tienen
  fotos en la mano), con la marca en el copete; y NEV-02 con el **Finesse fresa 150 g** (vaso de 75 × 90 mm, no
  apilable), que es donde lo espera un KAM de Alpina. El Finesse en la punta seca queda
  sólo como control del aviso de frío.
* **Postobón**: NEV-01 con la Manzana 2 L, que sin tocar nada sale con **3 rejillas**
  automáticas y las botellas paradas (ver abajo); «De fábrica» dice «No entra parada: 33 cm
  en 31 cm libres», «A mano» con 4 rejillas y una movida dos ranuras dice dónde no entra, y
  la 1,5 L en automático da 4 × 11. La lámina lleva el renglón de la exhibición.
* **Kellogg's**: GON-01 cara B con el surtido —Müsli arándanos (el principal, a la
  izquierda desde el pasillo), Choco Krispis y Zucaritas—, un bloque por vano; y la misma
  cara con un solo arte.
* **Diana**: ROB-01 con el Arroz Diana 1 kg, una bolsa por repisa (la cuenta real).
* **Vecinos**: GON-02 y PUN-02 con slots vendidos a otros rubros (galletas, aseo,
  enlatados), PUN-03 contratada entera (Bimbo, panadería) y lo demás libre.
* **El precio** sólo se dibuja con un arte SINTÉTICO, «Producto de prueba» de «Proveedor
  de prueba», con 1.234 cargado sólo en la base local; va aparte, en
  `despues-r3/control/`, y nunca en el juego final.

*La 2 L, por fin con 3 rejillas.* La tanda 1 dejó anotado que salía con 4 y el plan
esperaba 3. La holgura que el reparto deja sobre el producto (`HOLGURA_DE_REJILLA`) pasó de
2 a **5 cm**, y es la que dejaría un mercaderista para sacar la botella sin tumbar la de al
lado: con 2 cm entraban 4 rejillas apretadas (35-37,5 cm libres, 40 de frente); con 5 cm
salen 3 de 47,5-50 cm (30 de frente), y la 1,5 L (30 cm) sigue en 4 × 11.

**Medido sobre las capturas** (`scratchpad/realismo/capturas/r2-presentar-y-encuadre/`,
nunca en el repo; `t3/medir-t3.mjs`, sin Chromium):

* **Pantalla completa:** en las 23 tomas de venta el píxel (2,2) es escena (la sala o el
  cielo raso; en el editor es el blanco 255 de la barra). Ninguna tiene la barra.
* **El HUD:** capturado a los 2,6 s sin mover el mouse, la toma es idéntica píxel a píxel a
  la misma toma tomada antes (0 píxeles distintos); con el mouse recién movido, 18.439
  píxeles distintos en la franja de abajo (la píldora). Esc sin primera persona sale de
  Presentar.
* **La persona** (#b8b4ae, sale exacta en la captura) está entera —su caja no toca ningún
  borde— en «De frente» y «Tres cuartos» de PUN-01, NEV-01, NEV-02 y ROB-01, del lado
  libre: 700-890 px de alto de frente. En GON-01 B no hay lugar y no sale. En el editor
  sigue la de #8c867e.
* **Cielo raso:** 4 luminarias en la punta de frente y 6 en tres cuartos, 4 y 4 en el
  robatope, 2-3 en la nevera en tres cuartos (de frente, la parte de arriba de la nevera es
  el muro de atrás). El color plano de la sala: 0 % en todas las tomas de venta.
* **Vecinos:** en la toma de Postobón, NEV-02 (sin prueba) queda un 51 % menos luminosa que
  NEV-01; en la de Alpina, al revés, NEV-01 un 64 % por debajo de NEV-02.
* **Botella:** un parche de 40 × 40 sobre el hombro de la 2 L en «De cerca» da p95 143 (tope
  150), sin bandas crema; el blanco de la etiqueta, mediana 207.
* **Videollamada:** la toma «De cerca» de la nevera y la de la punta, quietas, en VP8 a 500
  kbps y 720p: en el cuadro 40 se leen «MANZANA POSTOBÓN» y «finesse Avena».
* **El copete** (la causa de sus dos líneas quedó en la tanda 1, paso 6: el respaldo de la
  góndola vecina visto de canto, no el cartel): en el «antes» de e11540e con la misma cámara
  se ven las dos líneas en x ≈ 956 y 963; en el «Hoy» de la lámina de la punta (copete liso)
  el salto entre columnas vecinas en el centro del cartel es 0.

**El costo** (`t3/costo3.mjs`: llamadas y triángulos de UN cuadro y el tiempo del cuadro en
swiftshader a 1920 × 1080, mediana de 3, hasta un `readPixels` que espera a la GPU), contra
la build de despues-r2 (880037e) con la MISMA base de la demo y las mismas tomas. Esta tanda
no agregó geometría repetida ni cuenta por píxel: **llamadas** como mucho 621 (la punta en
tres cuartos; tope 700), entre −3 % y +1 % por toma; **triángulos** entre −18 % (la nevera:
30 botellas en 3 rejillas contra 40 en 4) y +1 %; **el cuadro**, entre 0,65 y 1,11 veces lo
de despues-r2 (la góndola en tres cuartos, 2.324 contra 2.102 ms; la nevera de frente, 781
contra 1.199). La góndola con el surtido de Kellogg's suma 30 llamadas contra la misma toma
con un solo arte (517 contra 487; tope +60) y queda igual que en despues-r2. Lo que la
tanda 2 dejó pendiente contra b58a759 (el brillo del acero, ~250 ms por cuadro en
swiftshader) sigue igual: no se tocó.

**Cómo se comprobó.** `tsc` limpio; `npm run probar` entero en 0 fallas
(`probar-muebles` 190, `probar-arte` 44, `probar-planta` 54, `probar-propuesta` 20); `build`;
`python -c "import app.main"` (el backend no cambió desde el cierre de la tanda 2, así que
no se volvió a correr `pytest`). Cada guarda nueva se rompió a propósito con `mutar.py`
(respaldo y vuelta con `cp`, `git diff --stat` limpio): 32 mutaciones, todas cayeron al
final; dos sobrevivieron la primera vez —la toma que no sigue al tamaño (la guarda miraba
las filas y la cámara quieta, no el tamaño) y el worker cuyo módulo no arranca y al que se
le seguía mandando (el Worker falso de la prueba nunca fallaba al cargar)— y las pruebas
se reforzaron. `/taller` es idéntico píxel a píxel a despues-r2 en los ocho casos del
relleno genérico. Capturas (`scratchpad/realismo/capturas/r2-presentar-y-encuadre/`, nunca
en el repo): `despues-r3` (la demo entera: tomas de venta con el HUD escondido, paneles,
rejillas automáticas, de fábrica y a mano, la 1,5 L, el surtido y el arte solo, el aviso de
frío, los giros de 60° y 70°, Presentar con y sin HUD, el editor y las láminas de Postobón,
Kellogg's y Alpina), `despues-r3/control` (el precio sintético, rotulado como dato de
prueba), `final` (antes/después con la misma cámara contra e11540e y los `comparar-*`),
`video`, `taller-*` y `costo-*`.

**Visto de paso, sin tocar:**

* ~~La tapa de la caja de la Avena sale casi negra~~ — saldado (también los costados) en
  «la crítica de la demo», abajo: `colorDeCostado` ya no descarta los blancos.
* ~~La persona, girada a mano, se ve de canto~~ — saldado abajo: en venta gira hacia la
  cámara.
* GON-01 cara B, contra un pasillo de 2 m, no tiene lugar para la persona entera en
  ninguna toma de cara entera: sale sin persona, como manda la regla.

**Lo que no se hizo, y por qué:**

* **El robatope al 35 % del ancho en «De frente»** (ver la segunda crítica): mide 0,3 ×
  1,6 m y entero y de frente en 16:9 ocupa ~10 % del ancho; con la persona entera al lado,
  la toma se abre todavía un poco más. Lo que vende el robatope es «De cerca», que ahora
  encuadra dos repisas al 70 %.
* **El tiempo del cuadro en swiftshader** (pendiente de la tanda 2): esta tanda no agregó
  geometría ni cuenta por píxel; ver *El costo*, arriba.
* **El aviso «Presioná Esc para salir»**: es del navegador (ver 15).

### 2026-10-10 (noche): la crítica de la demo — que lo de al lado también parezca tienda

La dueña aceptó las exigencias del crítico visual sobre la demo de la tercera crítica
(`capturas/critica-r1/`). Con el ambiente y Presentar resueltos, lo que delataba «es un
dibujo» era otra cosa: las cajas blancas con costados negros, el relleno de los vecinos
como fichas de LEGO, los copetes blancos lisos, la sombra en serrucho al pie de cada mueble
y el «Tres cuartos» de la nevera mirando a la vecina. Todo sigue siendo de la sesión y sólo
de la pantalla de venta: nada va al layout, Vender y el mercaderista no se tocaron, el
editor y `/taller` se ven como antes, `frameloop="demand"` y sin pases.

**1. El costado y la tapa de la caja ya no salen negros** (`colorDeCostado`, `texturas.ts`).
La receta anterior tomaba «el dominante de la franja del borde, sin los blancos». En la
Avena Finesse —cartón blanco— lo único que quedaba en esa franja eran los octógonos negros
de advertencia y la foto de la avena: en «Tres cuartos» cada columna de la punta era un
bloque negro con una calcomanía adelante, y en «De cerca» todas las tapas negras. Ahora es
el color de MAYOR ÁREA en las columnas de los costados del frente (del 3 al 9 % de cada
lado: sin la franja de arriba, donde van los sellos en Colombia, ni la banda del canto, que
ya viene oscurecida), con los blancos contando; en una etiqueta clara no cuenta nada de
luminosidad menor al 25 % (sello, letra, sombra del borde de la foto), en una oscura —el
café de Choco Krispis— sí. La cubeta más poblada (8 niveles por canal) y su grupo a 32
niveles, promediado dos veces: con cubetas finas el color de una foto real se reparte y gana
un sello liso. En la Avena: #292925 → #989dac (el lila de su canto); en «Tres cuartos» lo casi
negro de la cara bajó del 17,9 al 4,8 % y en «De cerca» las tapas pasaron de 90 a 177 de
luminancia media.

**2. El relleno de lo vendido a otros se lee como empaque** (`rellenoDeVenta.ts`, nuevo).
La regla no cambia —sin marcas, sin texto, ilegible a distancia—. Lo que cambia, sólo en
venta:

* **Un color por «producto», en bloques**: cada rubro tiene una paleta de cinco colores
  APAGADOS (`PALETAS`, saturación HSV ≤ 0,45: el aseo en blancos, celestes y verdes; los
  enlatados en rojos y amarillos; las galletas en azules, rojos y dorados…), elegida por las
  palabras del rubro como `rubroQueCasa`. El rubro es texto libre y puede traer una marca:
  sólo elige colores, nunca se dibuja. A lo largo de cada entrepaño los frentes van en
  bloques de 2 a 5 del mismo color y diseño (`coloresDelRelleno`, puro y sembrado), un
  bloque no cruza un parante y lo de atrás lleva el color de su frente. En venta el rojo y
  el verde están permitidos: el estado comercial no se dibuja ahí.
* **Una etiqueta pintada sin texto**: cuatro diseños abstractos en UNA textura para toda la
  tienda (`pintarEtiquetaDeRelleno`: banda clara con una mancha de «logo», ventana de
  «foto», sello redondo, franjas; rayas grises de 2 px que de lejos se leen como letra y de
  cerca no dicen nada). La textura es un dato: el rojo oscurece, el verde lleva a blanco.
  Va por `uv` en la cara del pasillo de la caja, alrededor de la faja de la botella y la
  lata, y de frente en la bolsa (`conBandaDeEtiqueta`).
* **Cero llamadas nuevas**: el color va por instancia en la MISMA `InstancedMesh`, y el
  diseño viaja ADENTRO del rojo del color por instancia (`colorConDiseno`: rojo + 2 ×
  diseño, que el vertex shader decodifica con `floor(r / 2)`). Un atributo por instancia
  obligaba a clonar la geometría, compartida por caché. El material de venta es blanco (el
  color es el de cada unidad) y tiene su propio programa (`relleno-de-venta`), con la luz de
  venta y la etiqueta encadenadas en `onBeforeCompile`.

**3. El copete de la punta libre lleva la chapa de la tienda** (`copeteDeTienda.ts`, nuevo).
Los copetes blancos lisos y enormes se leían como carteles sin terminar. En venta, una
punta sin prueba lleva un azul petróleo apagado (`COLOR_DE_TIENDA`) en degradé, con una faja
clara abajo y dos filetes: SIN texto —el sistema no tiene el color ni la señalética de la
sede, y el rubro de un contrato puede traer la marca de otro proveedor—. La chapa del
copete pasó a dos grupos (`geometriaDeChapa`: los cantos y la cara del pasillo), así que una
punta libre suma UNA llamada, y la probada baja de seis a dos.

**4. El copete de un envase blanco toma el color de su marca** (`colorDeMarca`, `pop.ts`).
Con la Avena el dominante era el blanco del cartón: blanco sobre blanco, «una pizarra con
stickers». Si el dominante no es un color de marca (saturación < 0,2 o luminosidad ≥ 72 %),
la marca es el grupo de tono MÁS SATURADO que ocupe al menos el 6 % de la etiqueta (18
sectores de 20° sumados con sus vecinos); por área ganaba la foto de la avena (14 %) y no
el morado de Alpina (10 %, pero con saturación 0,59 contra 0,45). Sin ningún grupo así, el
dominante: no se inventa un color. Con un envase ANGOSTO (`ENVASE_ANGOSTO`: la caja de 1 L,
una botella) el copete lleva el héroe al 90 % del alto con dos unidades por lado en abanico
y, a la izquierda, la franja del logo recortada grande —más allá del vuelo, que tapa un
robatope pegado (`MARGEN_DE_LA_FRANJA`)—, con los bordes fundidos. El vaso conserva su
receta. Medido en De frente: saturación del copete 0,05 → 0,32 y envases en el 62 % del
ancho. La cenefa sale del mismo color.

**5. Sin la sombra en serrucho.** three r184 cambia `PCFSoftShadowMap` por `PCFShadowMap` (lo
avisa la consola): con un mapa de 1024 para toda la sede, cada mueble lejos del centro
tiraba al costado una sombra dura, en diagonal y dentada, 15–25 cm fuera de la base. El piso
de venta ya no recibe la sombra de la direccional (`receiveShadow={false}`; es un material
propio de la venta, así que ningún otro programa se recompila); el pie lo oscurece la
sombra de las huellas, blanda y pegada a la base: un 12,8 % más oscuro a 10 cm que a 1 m.
Las sombras adentro del mueble (el entrepaño sobre el producto) siguen. El editor no cambia.

**6. «Tres cuartos» gira hacia el costado libre** (`vistaDeVenta`, `utils/planta.ts`). Giraba
hacia el lado contrario a la persona, y la persona se para del lado libre: en NEV-01 la
cámara iba hacia NEV-02 y la vecina —libre, con sus botellas mudas— ocupaba casi la mitad del
cuadro. Con un mueble a menos de `VECINO_PEGADO` (1 m) de un canto y más lugar del otro,
gira hacia el otro, aunque ahí esté la persona. La persona se para hasta donde llega el piso
de su costado (`alcanceDeLaFigura`): puede quedar más allá de un exhibidor angosto
(`ANGOSTO_ENTRE_MEDIO`, 70 cm con el cuerpo: el robatope pegado a la punta), nunca más allá
de otro mueble entero (antes, a 1,2 m del robatope del lado de la punta, quedaba parada más
allá de la punta). Es lo que deja a la persona de la punta del lado CONTRARIO a la cámara en
«Tres cuartos»: con el piso libre a secas, el robatope la mandaba del lado de la cámara, en
primer plano y más alta que el mueble. En la sede de las pruebas la vecina de NEV-01 bajó de
~34 % a ~12 % del cuadro (casco de su caja proyectada). Si no entra entera de ningún lado, la
toma sale sin persona (el robatope de la demo en «Tres cuartos»).

**7. Choco Krispis: la foto, no el código.** La crítica leyó una franja del costado con texto
vertical a la izquierda del frente y el octógono cortado a la derecha, y lo atribuyó al
enderezado. La columna «CEREAL DE ARROZ CUBIERTO…» está IMPRESA en el frente de la caja (se
ve en la foto original, una caja en la mano); el octógono cortado era el recorte a mano de
la tanda 3, que esquivaba los dedos. La foto de la demo se volvió a recortar hasta el canto
(`scratchpad/realismo/r2a/choco.mjs`, nunca en el repo), con las uñas tapadas por el espejo
de lo que tienen al lado. El «Recortar costado» a mano en la ficha no se hizo: no había un
error de enderezado que corregir.

**Los bajos que se atendieron:**

* **La persona gira hacia la cámara** (sólo en venta): sobre su eje vertical, como un cartel
  de cartón; girada a mano ya no es una astilla de canto. Lo que decide si entra en el cuadro
  siguen siendo las esquinas de la toma.
* **El cabezote**: la chapa un 25 % más clara (retroiluminada, el rojo de Postobón tal cual
  era una lámina oscura), el recorte fundido con el fondo en sus cuatro bordes y sin las
  botellitas de las puntas.
* **La 2 L acostada**: el gris del PET del cuello contaba como etiqueta y quedaba con los
  brillos blancos de la foto (manchas dentadas alrededor del pico); ahora va como el claro
  —el líquido a su luz— (`esGrisDePet`). Y la base muestrea el cuerpo (`V_DE_LA_BASE`, el
  18 %) y no los lóbulos del pie: era un disco rosado y blanco.
* **La bolsa**: el lomo, más oscuro hacia los costados por color de vértice
  (`LOMO_DE_BOLSA`, 24 %). No se engordó: 6 cm es lo que mide la bolsa de 1 kg.
* **La caja «variada»** (con un solo arte): no era una caja adelantada, sino la de ATRÁS de
  un frente corrido, que quedaba a la vista con el tono de una tapada (0,82) y se leía como
  un hueco oscuro, 12 niveles por debajo de sus vecinas. Va con `TONO_DEL_CORRIDO` (0,92):
  a la vista, de frente al pasillo, recibe más luz que una tapada. En kellogg-un-arte-4,
  −5,6 niveles contra sus vecinas (tope 8).
* El copete de la Avena: la franja del logo arranca después del vuelo
  (`MARGEN_DE_LA_FRANJA`): en la toma de frente la tapaba el cabezote del robatope.
* `capturar.mjs` del scratchpad mueve el mouse antes de tocar el HUD (que se esconde).

**Lo que no se hizo, y por qué:**

* **Rejillas de más cuando sobra alto** (el Finesse en cinco rejillas con aire): las
  automáticas acomodan las rejillas que la nevera TIENE; agregar otras es comprar parrillas,
  una decisión de la dueña, y la prueba no inventa rejillas (`repartirRejillas` acota a las
  de fábrica). Sigue igual que en la tanda 1.
* **Carteles colgantes y rótulos de sección**: dirían un pasillo o una categoría, y la
  nomenclatura por pasillo es una conversación abierta con el dueño («Dónde retomar»,
  punto 1). No se inventa señalética.

**Cómo se comprobó.** `tsc` limpio; `npm run probar` entero en 0 fallas (`probar-muebles`
193, `probar-arte` 47, `probar-planta` 56); `build`. El backend no cambió: no se corrió
`pytest`. Cada guarda nueva se rompió a propósito con `mutar.py` (respaldo y vuelta con
`cp`, `git diff --stat` limpio): 29 de 29 cayeron. Dos reglas de la persona en «Tres
cuartos» —el costado contrario a la cámara primero y un tope de cercanía— sobrevivieron a
su mutación: lo que de verdad decidía era `alcanceDeLaFigura` (con el piso libre estricto,
el robatope mandaba a la persona del lado de la cámara), y del lado de la cámara la
persona nunca pasa la primera vuelta de `personaYTomaDeVenta`. Se sacaron: eran código
sin efecto. `/taller` es idéntico píxel a píxel a la tanda 3 en los ocho casos del relleno
genérico (el relleno de venta no existe fuera de la venta).

Medido sobre las capturas (`scratchpad/realismo/capturas/r2-arreglo-1/`, nunca en el
repo; la demo de `srv/reiniciar.sh --demo`, `r2a/demo-capturas.mjs` y `r2a/mirar.mjs`, con
las mismas tomas que la crítica; `r2a/medir.mjs`):

* **La Avena**: lo casi negro de la cara de la punta en «Tres cuartos», del 17,9 al 4,8 %;
  las tapas en «De cerca», de 90 a 177 de luminancia media (p10 154).
* **El copete**: saturación media de 0,05 a 0,33; los envases y la franja cubren el 63 %
  del ancho del cartel.
* **El relleno**: en la toma del pasillo (t3-pasillo) la saturación media de lo que tiene
  color bajó de 0,63 a 0,44, y lo de saturación mayor a 0,6, del 73 al 7 %. Tres colores o
  más en cada entrepaño vendido.
* **El copete libre**: desvío de 33 niveles (no es un liso).
* **El piso**: a 10 cm de la base, un 12,8 % más oscuro que a 1 m, sin la sombra dentada.
* **Choco Krispis**: el octógono completo («EXCESO EN AZÚCARES») y «180 g» en «De cerca».
* **El costo** (`r2a/costo.mjs`, la copia de `t3/costo3.mjs`, contra la build de la tanda 3
  con la misma base): llamadas como mucho 617 (tope 700; a lo sumo +6 en una toma: la chapa
  de una punta libre suma una, la probada baja de seis a dos, y el relleno no suma
  ninguna), triángulos iguales o menos (−11 % en el robatope en «Tres cuartos», que ahora
  mira hacia el otro lado) y el cuadro entre 0,62 y 1,09 veces lo de la tanda 3.

---

### 2026-10-10 (madrugada): la segunda crítica de la demo — que lo libre deje de competir

La crítica de la demo después de la vuelta anterior (`capturas/r2-arreglo-1/`) dio «casi».
Lo que quedaba: la toma estrella de Alpina rodeada de muebles vacíos a plena luz (el
robatope libre MÁS claro que la punta vendida), las neveras solas contra un muro liso, el
héroe del copete de la Avena mutilado («inesse»), un hilo blanco en cada botella de 2 L y
un cabezote que no se leía luminoso. Las mismas reglas que siempre: todo de la sesión y de
la pantalla de venta, nada al layout, Vender y el mercaderista intactos, el editor y
`/taller` como estaban (`/taller`: 0 px de diferencia en sus ocho casos), `frameloop` a
demanda y sin pases.

**1. El vecino pierde exposición, no sólo la luz del cuarto** (`EXPOSICION_DEL_VECINO`,
`luzDeVenta.ts`). La atenuación de la tanda 2 bajaba la luz del cuarto (× 0,55) y el brillo
de las luminarias, pero una cara blanca que mira a la cámara recibe casi toda su luz de la
direccional y la ambiente, que no se tocaban: el robatope libre pegado a la punta quedaba
en 181 de luminancia media contra 156 de la punta, y la góndola libre de «Tres cuartos» a
la par (154 contra 153). Ahora el parche de venta multiplica TODO lo que sale del material
—`outgoingLight *= uExposicion`, justo antes de `opaque_fragment`, en el Lambert y en el
Standard— por un uniforme más de cada material, que el mismo efecto de siempre
(`atenuarUniformes`) pone en 0,38 sin foco y en 1 con foco; nada se rehace ni se
recompila. Calibrado en la demo: con 0,62 el robatope quedaba a la par; con 0,45, un 15 %
abajo (las caras de arriba de sus repisas, de frente a la direccional, se comen el tono);
con 0,38, un 26 % abajo (122 contra 165) y la góndola libre un 38 % (102 contra 165). Dos
excepciones con su propia exposición (el segundo argumento de `useAtenuacion`):

* **La nevera vecina** va con 1 (`EXPOSICION_DE_NEVERA_VECINA`): ya se apaga con su frío
  (`apagarElFrio`), y con las dos sus botellas mudas —que tienen que seguir leyéndose—
  bajaban de 65 a 28.
* **La chapa de la tienda** del copete de una punta libre va con 0,7
  (`EXPOSICION_DE_LA_CHAPA`): con 0,38 el azul petróleo era una losa negra. Y pasó a ser un
  material POR punta (`materialDeCopeteDeTienda`, con la textura compartida y el mismo
  programa; cada punta lo memoriza y lo suelta): con uno solo para todas, o se atenuaban
  todas o ninguna.

Lo que la crítica pedía además para «Tres cuartos» de la punta —girar si la góndola libre
pasaba del 20 % del cuadro— no hizo falta: medido con la caja proyectada y lo que tapa la
punta, lo que se ve de GON-01 es el 8 % (la cota sin tapar, 19 %); pesaba por la luz, no
por el área. Lo vigila `probar-planta` (a lo sumo 15 % visible).

**2. El muro de venta tiene degradé y cenefa** (`sala.ts`). Un muro beige del mismo tono de
arriba abajo «dice render de arquitectura», y la nevera contra él, «un electrodoméstico en
un salón vacío».

* **El degradé** (`DEGRADE_DEL_MURO`, `luzDelMuro`): más claro arriba, bajo las luminarias,
  y un 26 % más oscuro (lineal) al pie, por color de vértice en franjas de 40 cm. El muro
  pasó a `meshBasicMaterial` sin tono con el color que ya se veía en pantalla (#cfccc4, lo
  que daba el Lambert con su `emissive`): con el `emissive` del Lambert el color de vértice
  sólo tocaba la parte difusa y el degradé no se veía. En pantalla, de 211 arriba a 183
  al pie.
* **La cenefa perimetral** (`geometriaDeCenefa`, `CENEFA`): una faja de 35 cm a 2,45 m en
  los cuatro muros, en paneles de 2,4 m que alternan dos tonos de la chapa de la tienda
  (`COLOR_DE_TIENDA`), con un filete claro abajo y arriba. Una geometría, una llamada.
  SIN texto y SIN colores por categoría: «bebidas frías» o «lácteos» es señalética, y la
  nomenclatura por pasillo sigue siendo una conversación abierta con el dueño («Dónde
  retomar», punto 1). Es la tienda, no un proveedor.

**3. «De frente» con persona no abre el cuadro** (`personaYTomaDeVenta`, `utils/planta.ts`).
La toma probaba la persona a 1,2 m y abría el cuadro hasta ella: la nevera de la demo
ocupaba el 26 % del ancho y el resto era muro. Ahora primero busca la mayor separación en
que la persona entra en la toma del mueble SIN abrirla —el mueble lleno de alto y ella por
el borde— y sólo si ninguna entra abre el cuadro como antes. Con eso:

* la toma con persona es del mueble ENTERO: del piso a lo más alto entre la cabeza y el
  remate del mueble, con `AIRE_SOBRE_EL_MUEBLE` (6 cm) —con el foco del producto a secas,
  el cabezote de la nevera quedaba a 3 % del borde—;
* **con un vecino pegado de un costado** y lugar del otro, «De frente» se corre 18 cm
  hacia el libre (`corridaPorVecino`, `DESCENTRADO_POR_VECINO`; la cámara con la mira):
  centrada, la nevera vecina entraba entera en su mitad del cuadro (29 %); corrida, el
  borde la corta (menos del 25 %) y el mueble sigue casi al centro. Sólo en la pantalla de
  venta: «Encuadrar esta cara» del editor sigue centrado;
* la persona no se superpone con la CAJA del mueble (las ocho esquinas, no las cuatro de la
  cara) y deja `AIRE_DE_LA_FIGURA` (30 px) de aire: en «Tres cuartos» tapaba el costado de
  NEV-01 que da a la cámara.

**4. «De frente» de una cara larga abre el campo visual** (`fovParaLaCara`). Una góndola de
3,6 m frente a un pasillo de 2 m no entra con 50°: la lámina de Kellogg's cortaba el bloque
de Müsli —el principal— y el de Zucaritas. En la pantalla de venta, «De frente» de la cara
entera prueba la toma de verdad de 50° a 70° (`FOV_MAXIMO_DE_FRENTE`, unos 24 mm) hasta que
las cuatro esquinas caen dentro del 96 % del cuadro, y con el campo abierto la cámara se
para al fondo del pasillo (`alFondo`: con la cuenta de siempre se acercaba al abrirlo y la
cara volvía a no entrar). Una nevera o una punta, que entran, quedan en 50°. Ahora la toma
de Kellogg's muestra los tres bloques y el cielo raso con sus luminarias. (Desde el
2026-10-13 el tope es 95°, también por entrepaño y sin la corrida por el vecino desde el
fondo del pasillo: con el cajón del visor de Vender abierto la misma cara pedía hasta 93°.
Ver «Ver el diseño desde Vender» → «la segunda crítica».)

**5. El héroe del copete de una caja es un envase entero** (`pop.ts`). La franja del logo a
la izquierda del copete era, en una caja, la banda del medio de la foto de canto a canto:
en la Avena el logo llega al borde de la foto y se comía la «f» de «finesse», borroso y con
halo. Ahora la franja va sólo si es la etiqueta de verdad (la botella transparente) y sin
ampliar la foto más de 1,5 veces (`AMPLIACION_MAXIMA`; si así queda en menos de la mitad del
alto, no va); sin ella, el abanico lleva tres envases por lado —siete, como el copete del
Finesse, que la crítica daba por bueno—. Para la reunión, la foto de la Avena se cambió por
la caja de la DERECHA de la misma foto de Open Food Facts, que trae el frente entero (la
«f» y el octógono «CONTIENE EDULCORANTES»), con su etiqueta de importación tapada por el
fondo de la caja y la palabra «Avena» de la otra caja (`scratchpad/realismo/r2b/
avena-compuesta.mjs`; dato de demo, nunca en el repo).

**6. La botella sin hilo ni flecos** (`llenarBotella`, `texturas.ts`). El hilo blanco que
bajaba del cuello a la base en cada 2 L era NUESTRO: el reflejo de 3 px al 30 % que se le
pintaba. Ahora es una banda gaussiana suave a un cuarto del ancho (`REFLEJO_DEL_PET`,
σ = 7 % de la fila, a lo sumo 10 % de blanco): la curva del plástico; el brillo lo pone la
luz. Los flecos dentados eran PET con el fondo detrás teñido del rosa de la etiqueta y de
la tapa ([177, 139, 141], croma 38) que quedaba como «otro», sin teñir, en el borde de
arriba de la etiqueta y en el anillo del cuello: el gris del PET admite ahora hasta 55 de
croma (`CROMA_DEL_PET`; la tinta tiene más: el rosa 155, la tapa 195). Y las primeras tres
filas de la etiqueta, si son mayormente claras (`CANTO_CLARO`, 40 %: el canto del papel
con el fondo detrás), toman el color de la etiqueta de abajo; la letra blanca que arranca
al ras cubre menos y no se toca. Medido en «De cerca» de Postobón: columnas con una línea
de 40 niveles sobre el cuerpo en la mitad de las filas, de 8 a 0.

**7. El cabezote se lee luminoso** (`dibujarCartel`, rama apaisada). Era una banda rosa
salmón plana (el rojo mezclado con gris, 120 de luminancia con 6 de rango) con un recorte
del 8 % del ancho. Ahora: el color de la marca SATURADO (`saturar`: saturación ≥ 0,62 y
luminosidad entre 0,36 y 0,5; un gris queda gris), en degradé VERTICAL más claro arriba (en
diagonal, en un cartel de 13 a 1, no se veía); detrás de la marca, el panel del papel de
la etiqueta —su propio fondo, `FranjaDeEtiqueta.fondo`, el promedio de lo que no es letra
en el 40 % del medio de la banda, saturado y claro—, de al menos el 40 % del ancho con las
puntas fundidas (`PANEL_DEL_CABEZOTE`; no es un dibujo nuevo: es la etiqueta estirada
detrás de su marca); el recorte al 78 % del alto sin ampliar la foto más de 1,5 veces; el
lienzo a 2048 (a 1024 salía pixelado en la lámina); y más emisión
(`EMISION_RETROILUMINADA`, 2,4 veces la de lo impreso): el blanco de la marca, 226 contra
223 del forro. Chapa: 95 de media con 59 de rango.

**Los bajos que se atendieron:**

* **La variación sembrada en cualquier cara** (`unidadesDePrueba`): una de cada cuatro cajas
  del frente gira hasta 1,5° también en la punta (eran «44 cajas de Avena en fila
  perfecta»); el vaso —todo envase torneado— gira como una botella (con ±0,9° los 39
  Finesse miraban todos al frente); y una de cada seis columnas queda un poco ADELANTADA
  (`COLUMNA_ADELANTADA`, `ADELANTO`: 3-4 mm, dentro del centímetro de retiro al frente). El
  frente corrido sigue siendo sólo de las caras largas con un arte.
* **La persona sin tapar el mueble** en «Tres cuartos» (ver 3).
* **El relleno cercano** en «De cerca» girado: con la exposición del vecino ya va apagado.

**Lo que no se hizo, y por qué:**

* **El brillo en los parantes de la punta**: una cara vertical de frente a la cámara refleja
  el piso o el muro, no las luminarias, y una franja que se mueva con el azimut sería un
  efecto pintado que no sale de la tienda que se dibuja. Queda pendiente con un criterio
  propio.
* **El cielo raso en la lámina de la nevera**: con el muro de atrás a 2,5 m, el borde de
  arriba de la toma lo toca antes del techo (ver la medida de la tanda 2); la cenefa nueva
  es lo que se ve arriba.

**Cómo se comprobó.** `tsc` limpio; `npm run probar` entero en 0 fallas (`probar-muebles`
195, `probar-arte` 48, `probar-planta` 59); `build`. El backend no cambió (no hizo falta
`pytest`). Cada guarda nueva se rompió a propósito con `mutar.py` (respaldo y vuelta con
`cp`, `git diff --stat` limpio): 36 de 36 cayeron, después de endurecer las cinco que
sobrevivían la primera vuelta (el canto de prueba no era fila de etiqueta, la foto de
prueba era chica para que el tope de ampliación mordiera, y la columna adelantada se medía
contra el entrepaño de otra fila). Una mutación más resultó equivalente y se descartó
(limitar la búsqueda del campo visual a 50° cae en el máximo igual).

Medido sobre las capturas (`scratchpad/realismo/capturas/r2-arreglo-2/final/`, nunca en el
repo; `r2b/demo-capturas.mjs` y `r2b/medir.mjs`, contra `r2-arreglo-1/final`):

* **Los vecinos**: el robatope junto a la punta, de 16 % MÁS claro a 26 % más oscuro; la
  góndola libre de «Tres cuartos», de a la par a 38 % más oscura; NEV-02, 45 % (era 46 %).
* **La botella**: 0 columnas con hilo (eran 8).
* **El cabezote**: marca 226 contra forro 223 (era 220); chapa con 59 de rango (era 7).
* **El costo** (`r2b/costo.mjs`): llamadas iguales o +2 por toma, salvo la góndola de
  Kellogg's de frente, que ahora entra entera (492 → 570, tope 700; +13 % de triángulos):
  más producto en el cuadro, no más costo por mueble. El cuadro entre 0,76 y 1,24 veces.

### 2026-10-10 (tarde): la revisión de la rama y la tercera crítica de la demo

Dos cosas en una vuelta: los hallazgos de la revisión de código de TODA la rama (todos
los de gravedad alta y media, y los bajos que salían baratos) y lo que dejó la crítica de
la demo después de `r2-arreglo-2` («casi»). La dueña estuvo de acuerdo con las exigencias
del crítico visual. Las reglas de siempre: la prueba es de la sesión y nada va al layout,
Vender y el mercaderista intactos, el editor como estaba, `frameloop` a demanda y sin
pases. Commits: `7c1ae4b` (la revisión), `5cb01ab` y `cb8bf0a` (la crítica) y el de este
cierre.

#### La revisión de la rama

**Privacidad y Presentar** (`privacidad.ts`, `StoreEditor3D.tsx`):

* **«Cambiar de proveedor» deja la reunión ABIERTA sin proveedor** (`REUNION_SIN_PROVEEDOR`,
  un `""` que no es `null`). Antes la dejaba en `null` —«no hay reunión»— y al cerrar el
  selector sin elegir, el editor volvía a dibujar las pruebas de todos, el panel nombraba
  la de Alpina con su foto y «Presentar» le daba la pantalla a Alpina delante de Diana.
  Con el centinela no se dibuja ninguna prueba, el panel trata toda prueba como ajena y
  `proveedorParaPresentar` no adivina (devuelve `null`).
* **«Terminar reunión»** en la barra: la reunión no terminaba nunca (el tooltip y el
  bloque «Contratado» escondían proveedor y valor en TODOS los muebles hasta recargar).
  Pide confirmación si hay pruebas y las quita. Y las pruebas de un mueble borrado ya no
  la sostienen (`pruebasDelPlano`): no hay panel desde donde quitarlas.
* **La lámina de un mueble elegido, en reunión, no sale para el contrato ajeno**
  (`laminaDelMueble`): sin prueba de la reunión es para el proveedor de la reunión (o
  nadie) y el pie va sin proveedor, período ni valor del contrato de otro. Antes, en la
  reunión de Diana con la punta de Alpina elegida, el lienzo compartido dibujaba los vasos
  de Alpina durante las tomas y bajaba «…_Alpina.png» con su valor mensual.
* **El HUD no le avisa al proveedor la prueba de otro**: «Hay una prueba que no se está
  mostrando» encima de la punta vacía le decía que esa punta se le ofrece a otro. Con un
  proveedor en pantalla el HUD dice «Modo presentación» a secas; a la dueña se le avisa
  ANTES de entrar (el título del botón y el panel).
* **Las tomas van a la cara pedida** (`caraDeLasTomas`): con Müsli en la A y Zucaritas en
  la B, «De cerca» saltaba al otro lado de la góndola, y la lámina salía con la A.
* **En Presentar el teclado sólo atiende Esc** (ni R, ni F, ni Retroceso, ni Ctrl+Z): la
  selección no se ve en Presentar y una tecla sin querer giraba o borraba la punta delante
  del proveedor, y quedaba escrito en el plano.
* **Salir de la pantalla completa ya no apaga Presentar.** Chrome y Edge sacan de pantalla
  completa a la pestaña que deja de estar al frente (Ctrl+Tab a Meet para apretar
  «Compartir»), y eso apagaba Presentar: la pestaña compartida pasaba a mostrar el editor
  con datos de otros proveedores. Filtrar por `visibilityState` no servía: el
  `fullscreenchange` llega ANTES que el `visibilitychange`. Ahora Presentar sigue con su
  `fixed inset-0` y el HUD ofrece «Pantalla completa»; un segundo Esc sale.

**La ficha** (`EditorDeFicha.tsx`): lee «9 cm», «9cm», «90 mm» y «4,900» (coma con tres
cifras es miles), dice en castellano y en cm lo que no se entiende o se sale de los topes
(`TOPES_MM`, los mismos de `FichaIn`), y los dos «Guardar medidas» y el alta se BLOQUEAN
mientras haya algo ilegible (`onValidez`). Antes lo ilegible viajaba como `null` y el PUT,
que reemplaza la ficha entera, borraba un alto o un precio que estaban bien.

**Geometría:** la bolsa acostada ya no sale negra (le faltaba el atributo `color` con un
material de `vertexColors`: en three r184 eso vale 0); el hablador genérico de la cara B
de una góndola doble ya no queda espejado (`tramosConRelleno` busca el vano con −x en las
caras que se montan giradas); y el tablero carga el editor 3D perezoso (`React.lazy`): cada
carga de KPIs o Supervisar bajaba ~160 KB gzip de la prueba de producto.

**Backend:** reactivar un cliente crea las tablas que se desplegaron mientras estaba
archivado (`preparar_esquema`, la misma del alta: el arranque sólo recorre los activos y el
catálogo daba 500 hasta el próximo reinicio), y borrar un proveedor con artes o con
historial de contratos contesta 409 con el porqué en vez del 500 de la clave foránea de
Postgres (en SQLite pasaba y dejaba artes huérfanas).

#### La tercera crítica de la demo

**1. El relleno neutro deja de ser un pictograma** (alta; `rellenoDeVenta.ts`). Lo vendido
a otros eran bloques de color con un óvalo casi negro de borde duro y una franja clara de
corte neto que se leía como capa transparente: en «De cerca» del robatope, media pantalla
de juguete al lado del arroz real. Ahora nada baja de `SOMBRA_MINIMA` (0,62 de la luz del
envase), lo claro es papel a medias (`BLANCO_MAXIMO`), la ventana de la «foto» va en
degradé, la caja lleva un degradé vertical leve (−8 % abajo) por color de vértice, y la
textura se suaviza 3-4 px después de pintar (`suavizarPorCelda`, sin mezclar un diseño con
el de al lado). En un vecino, el relleno conserva más luz que su mueble
(`EXPOSICION_DEL_RELLENO_VECINO`): es mercadería con color, no un hueco. Cero llamadas nuevas.

**2. El cabezote se lee como aviso** (media; `pop.ts`). La marca sale de la foto a
resolución completa con un realce de nitidez de radio 1 (`realzar`), sobre un panel de
esquinas redondeadas con filete blanco (no un halo); el papel de la foto se lleva al del
panel columna por columna (`igualarFondoPorColumna`: la foto de un envase redondo se oscurece
hacia los costados) y la letra clara queda BLANCA. Si al tope de ampliación no cubre el 40 %
del ancho, la marca se repite una vez a cada lado al 30 % (`ECO_DE_LA_MARCA`): luz de
fondo, no miniaturas.

**3. La base de la 2 L acostada** (media; `perfiles.ts`). Todas las filas del pie suben al
cuerpo con la `u` del mismo ángulo (con la proyección plana muestreaban el fondo quitado
entre los lóbulos: la cuña rosada y blanca), y el disco va un 15 % más oscuro con los cinco
lóbulos del pie petaloide por color de vértice.

**4. La línea oscura del remate del robatope** (media). Era el costado del COPETE de la
punta vecina: el robatope se arrima al costado de la punta, su remate (1,6 m) queda más
alto que el cuerpo de ella (1,44 m), y el vuelo del copete (5 cm) se metía en el parante
del robatope (5 cm) con la cara justo en el plano de la cara interior del parante. Los dos
peleaban por el depth-buffer: una línea de 2-3 px que colgaba del remate hasta la tapa de
la punta. La primera bisección (apagando remate, fondo, producto y parantes) la daba por un
costado sin luz y le puso emisión al parante; no era eso —en la build de depuración la
línea seguía con el color del VECINO de atrás, no del parante—. Ahora `COPETE.vuelo` es
4,5 cm, medio centímetro adentro del parante (`ROBATOPE.parante`), y la emisión lateral se
sacó. Medido en «De cerca» del robatope: la columna de la línea caía 131 niveles bajo el
lateral; ahora 0. Lo vigila una prueba sobre la punta ARMADA (lo más afuera de sus mallas
contra la cara interior de un robatope pegado).

**5. La bolsa** (media; `perfiles.ts`): el lomo con el color dominante en degradé hacia el
canto (no la foto estirada); el sello de 12 mm, un 15 % más claro y con tres rayas finas
del termosellado (con 4 columnas: casi el costo de antes); y las de atrás 1-2 cm más bajas
—asentadas— con otro giro. «De cerca» del robatope cierra el par de repisas a
`LLENADO_DE_PAR` = 0,8 del alto en el plano de la mira (la crítica medía en la captura, de
la bolsa de arriba al riel de abajo: 62 % con 0,7; pedía 65-75).

**Los bajos:**

* **La persona tiene huella y degradé** (`sombraDePersona`, `planoDeSilueta`): un óvalo
  blando de 45 × 25 cm al 35 % bajo los pies, HIJO de la figura (gira y se esconde con
  ella), translúcido y sin escribir profundidad; y la silueta un 9 % más oscura al pie por
  color de vértice. El gris y la opacidad de arriba, los de siempre.
* **La góndola libre ya no es un esqueleto de CAD** (`LAVADO_DEL_VECINO`, `luzDeVenta.ts`).
  La exposición del vecino multiplica todo por igual y conserva el contraste: el panel de
  fondo quedaba casi negro (55) bajo entrepaños claros de canto vivo (salto de 103). Ahora
  el color final del vecino se mezcla un 30 % con un gris medio (0,2 lineal, calculado con
  el tono ACES de la escena), proporcional a lo que se apaga (`lavadoPara`: la nevera
  vecina, con exposición 1, no se lava; la chapa del copete libre, a medias). Un uniforme
  más por material, el mismo programa. En «De cerca» girado 60°: panel de 55 a 86, salto
  de 103 a 63 (pedía ≤ 60: el canto de arriba del entrepaño contra la sombra que tiene
  debajo); el blanco apagado del robatope casi no cambia.
* **«Acostarla sólo en la N»** (`filasSinAlto`, `ComoSePrueba.acostarDondeNoEntra`). A
  mano, la 2 L dejaba vacío el entrepaño que no alcanza, y para el proveedor un hueco en el
  medio de SU nevera es un quiebre de inventario. Junto al aviso, el botón la acuesta SÓLO
  ahí (el mismo producto, acostado, con su propio «dónde»; `PruebaDeCara.acostada`); en
  los demás sigue parada. Es un flag de la sesión, así que si se mueven las rejillas se
  acuesta donde haga falta; «Dejarlo vacío» lo deshace. El resumen lo cuenta («· 3
  acostadas en la 2 · 33 de frente»).
* **«De fábrica» lo dice en su línea**: «Las 5 de fábrica, como está la nevera hoy. No
  entra parada: 33 cm en 31 cm libres.».

**Lo que no se hizo, y por qué:**

* **El vidrio de la nevera de refrescos.** `nevera_refrescos` es, por su ficha del
  catálogo, una vitrina multideck ABIERTA (la cortina de aire es lo que la hace leer como
  mueble de frío); la de puertas de vidrio existe (`NeveraReal variante="puertas"`, la usa
  la vitrina). Ponerle puerta sólo en venta haría que el editor y la pantalla del proveedor
  mostraran muebles distintos, y si las neveras de la sede son de puerta es un dato del
  mueble, no un efecto. Queda para decidir con la dueña: un tipo (o una opción del mueble)
  «con puertas», no un vidrio pintado en venta.

**Cómo se comprobó.** `tsc` limpio; `npm run probar` entero en 0 fallas (`probar-muebles`
209, `probar-arte` 49, `probar-planta` 59); `build`; `pytest` (la rama tocó el backend):
1.220 en verde, 7 xfail y 2 omitidas, salida 0.
Las guardas nuevas se rompieron a propósito con `mutar.py` (respaldo y vuelta con `cp`,
`git diff --stat` limpio): 16 de 16 cayeron (una primera mutación de la huella era
equivalente —agregaba un grupo vacío— y se cambió por la que de verdad la saca de la
figura).

Medido sobre las capturas (`scratchpad/realismo/capturas/final2/`, nunca en el repo; el
juego estándar de `capturar.mjs` contra el de la crítica, `critica-r3/`):

* **El relleno** (bolsa-6, la góndola vendida de al lado): p5 de 24 a 70 (pedía ≥ 40); los
  saltos de más de 25 niveles en 3 px, de 2,5 % a 0,5 % de las muestras (lo que queda es el
  canto entre cajas).
* **El cabezote** (gaseosa-4): la marca con p95 de 254 contra 223 del forro (era 215).
* **La línea del robatope** (bolsa-6, x 1066-1086): de 131 niveles bajo el lateral a 0.
* **La góndola libre** («De cerca» del robatope girado 60°): panel de 55 a 86, salto de 103
  a 63.
* **El costo** (`r3d/costo.mjs`, contra `r2-arreglo-2/costo-final2`): +1 llamada por toma
  (la huella de la persona), los mismos triángulos salvo la bolsa (+210, el sello) y el
  cuadro igual (entre 0,98 y 1,09 veces).

El juego para la dueña: `final2/comparar-*.png` (antes —la build de e11540e, la lámina
plana— y después con la MISMA cámara, de frente y de cerca, por mueble de la demo),
`final2/demo/` (la demo por proveedor: rejillas automáticas, a mano, de fábrica y «Acostarla
sólo en la 2»; el editor; las láminas; Presentar a pantalla completa) y `final2/estandar/`
(el juego de la crítica, para medir contra él).

---

## El producto estaba pintado al fondo del mueble

Al ver la primera góndola vestida en producción saltó lo que ninguna prueba
podía atrapar: el producto **quedaba perdido al fondo**. Se veía un estante
vacío con algo dibujado atrás.

No era el arte. La imagen se pintaba sobre el panel **trasero** de cada mueble
—la espina de la góndola, la placa de la punta, la pared de la nevera—. Es el
sitio cómodo: esos paneles ya existen y ya heredan la transformación del
mueble, que es justo lo que hundió los dos intentos anteriores de poner
geometría nueva (replicaban la matemática de ubicación y se despegaban).

Pero en una góndola de 0.9 m de fondo eso deja el producto **44 cm detrás del
filo del entrepaño**. En una tienda el producto está adelante: eso es lo que
significa un *facing*, y es literalmente lo que el proveedor viene a comprar.

### La lámina

Ahora la imagen va en una lámina propia (`LaminaDeProducto`), parada a 5 cm del
plano exterior del mueble — lo justo para que el riel de precio y el filo del
entrepaño queden por delante, como en un lineal de verdad.

No repite la matemática de ubicación: es **hija del mismo grupo** que el mueble,
así que sólo conoce coordenadas locales. Ese era el error de los intentos
viejos, no la idea de tener geometría propia.

Dos detalles que la hacen funcionar:

* **El fondo de la lámina es invisible**, no del color del panel. Con un
  material opaco sería una placa tapando el estante entero; con
  `opacity: 0, depthWrite: false` sólo se ve donde hay producto.
* **`y` y `alto` son los mismos que tenía el panel pintado.** La textura viene
  compuesta con las filas alineadas a los entrepaños reales en el espacio local
  de ese panel, así que moverla en Z no toca la alineación — moverla en Y sí la
  rompería.

Se aplicó a los cinco tipos que se pintan: góndola (doble y mural), punta,
robatope, vitrina y nevera de refrescos. Los paneles estructurales volvieron a
ser lisos, y con eso `getPlainLambert` y `getPlainStandard` quedaron sin uso
—existían sólo para ser el fondo de una caja pintada— y se borraron.

### Lo que queda sabido — saldado para el producto en prueba (2026-10-08)

El producto se estiraba hasta llenar el alto del entrepaño: una bolsa de café de
25 cm ocupaba los 39 cm del hueco. Arreglarlo pedía saber el alto real del
empaque, que no se pedía al cargar el arte. **Ya se pide**: la ficha del arte
(`supplier_asset_specs`) guarda forma y medidas, el alto es obligatorio en un arte
nuevo, y lo que se prueba en la góndola, la punta, la nevera de refrescos y el
robatope se dibuja como envases a escala (ver *2026-10-08: el producto se ve de
verdad*). La lámina estirada sigue sólo en los muebles sin entrepaños (vitrina,
ristra, cruz, impulsador, isla) y en las fotos de espacio cargadas desde el plano.

---

## Un solo nombre para el mueble

El panel del plano decía **«—»** en Nomenclatura mientras el plano dibujaba
`GON-800` sobre el mismo mueble. No era un bug de dibujo: eran **dos campos
distintos**.

* El **código** (`GON-800`) lo genera el sistema, se dibuja dentro del mueble y
  es la llave: forma el código de espacio que viaja al contrato, al correo del
  mercaderista y a la lámina.
* La **nomenclatura** era texto libre, opcional y aparte. Vacía en los 109
  muebles del plano real. Sólo se dibujaba como una píldora encima del mueble, y
  sólo si tenía valor — así que prender «Etiquetas» sobre un plano recién hecho
  no mostraba **ni una etiqueta**.

Lo que decidió el arreglo: **el resto de la app ya los trataba como uno solo.**
El minimapa, la pantalla de montaje, el tablero y el 3D mostraban
`nomenclatura || código`. El plano 2D era el único que los separaba, y su panel
el único lugar donde se veía «—» cuando el nombre efectivo era `GON-800`.

### La regla

> **Esto describe el modelo VIEJO, el de dos nombres, y se conserva porque
> explica de dónde salió el error de la fase 12.** Desde la fase 13 hay un solo
> campo: el `code` **es** el nombre. Ver §«Un solo nombre» más abajo.

`nombreDeMueble(mueble)` en `utils/nomenclatura.ts`: el nombre era el código que
puso el sistema, y escribir una nomenclatura lo **reemplazaba**. Se creyó que
eso daba una sola respuesta a «¿cómo se llama este mueble?». No la daba: la daba
en pantalla y no en la llave, que es donde se resolvían los contratos.

El código nunca se toca: sigue siendo la llave del espacio. Lo que cambia es
cómo se lo nombra.

### La píldora sólo dice lo que la caja no dice

Al principio la píldora se dibujó siempre con el nombre efectivo. Resultado: el
nombre aparecía **dos veces** por mueble —adentro de la caja y en la píldora
encima— y las píldoras chocaban con el mueble de arriba. Peor que antes.

Ahora sale sólo cuando el nombre **no** es el del sistema (`nombrePropio`). Si
es el heredado, la caja ya lo dice. Y escribir en el campo exactamente el mismo
código tampoco cuenta como nombre propio: no es un nombre nuevo, es el mismo.

### Lo que ve el usuario

* Sin nombre escrito: el panel dice `GON-800 · del sistema` en vez de «—».
* Con nombre escrito: el panel dice `P1-A`, y `P1-A` aparece sobre el mueble.
* Vaciar el campo devuelve el nombre del sistema; el placeholder del input es el
  propio código, para que se vea qué se hereda.

---

## Tres pedidos del uso diario

### El período, en «Estado por espacio»

La tabla **ordenaba por fecha de fin** y calculaba los días restantes, pero no
mostraba ni el inicio ni el fin. Para renovar —o para reclamarle a un
proveedor— hace falta saber desde y hasta cuándo, no sólo cuántos días quedan.
Ahora hay dos columnas, `Desde` y `Hasta`, apagadas cuando la cara está libre
(son historia, igual que el «último: proveedor» de al lado).

De paso: los encabezados alineaban por índice (`i >= 4` → derecha). Agregar una
columna en el medio corría la alineación de todas las de atrás, y ya dejaba
«Montaje» con el título a la derecha y el contenido a la izquierda. Ahora cada
columna declara su alineación.

### Ocupado es rojo

Es la convención de cualquier mapa de disponibilidad: verde se puede vender,
rojo no. Estuvo un tiempo en violeta para no chocar con el rojo de «vencido»,
pero **el mapa de la sede nunca dejó de pintarlo rojo**
(`components/FloorMap/zones.ts`), así que el mismo estado tenía dos colores
según la pestaña. Ahora es rojo en los cuatro lugares: plano 2D, editor 3D,
mapa de la sede y el chip que lo filtra en el tablero.

También el «Tomado» del mapa de Vender, que es el mismo hecho con otra
etiqueta: ese mapa queda verde / ámbar / rojo, que se lee sin leyenda.

Vencido comparte el rojo y no compite: es un subconjunto de lo ocupado, la
tabla lo dice con todas las letras y el filtro «Vencidos» lo aísla.

### El mostrador de servicio al cliente

Faltaba en el catálogo. Es `servicio_cliente`, prefijo `SAC`, 1.60 × 0.70 ×
1.10 m, y nace **no comercializable** —como las cajas— porque es operación de
la tienda y no espacio que se le venda a un proveedor; la bandera se puede
cambiar a mano si alguna sede decide alquilar ese frente.

Es más alto que una caja (1.10 contra 0.90) porque se atiende de pie y de
frente, no de costado con una cinta, y lleva un tramo bajo accesible en un
tercio del frente. Eso último no es adorno: es lo que lo distingue de una caja
al mirar el plano.

El cartel se monta sobre parantes que salen del propio mostrador. Colgado del
techo quedaba flotando —en el 3D no se dibuja techo—, así que un cartel
suspendido se veía suelto en el aire.

---

## La tienda no se parecía a una tienda

Tres cosas que faltaban para que el 3D aguante una reunión con un proveedor.
Ninguna cambia lo que el sistema hace: cambian si le creés.

### Piso de baldosa

El piso era una lámina de un solo color. Al caminar no había contra qué medir
el paso, así que avanzar por la tienda se sentía como flotar: no se sabía si la
punta estaba a tres metros o a diez.

Ahora es una textura de baldosa de 60 cm con junta, dibujada en un canvas y
repetida **por metro real** —la baldosa mide lo mismo en una sede de 12 m que
en una de 40—. La imagen lleva dos baldosas por lado y no una: así las juntas
quedan por dentro del dibujo y no sobre el borde, que es donde el filtrado
bilineal deja costura al repetir; las líneas de los bordes van a media caña y
al repetirse se suman en una junta completa.

Lleva **anisotropía al máximo del equipo**. Sin eso, mirando el piso casi de
canto —que es todo el rato en primera persona— la retícula lejana se deshace
en moaré.

*(Desde 2026-10-09, tanda 2: el piso, sus bordes y los muros salen de `limites`, los
mismos de la caminata y de la cámara de venta, con la rotación de cada mueble. Antes era
una caja `f.x ± f.w/2` sin rotación y, con góndolas giradas, el piso quedaba corrido
hasta 1,35 m de la grilla. En el editor eso se ve: **el piso coincide con la grilla**.)*

### Muros, y sólo al caminar

Al caminar ya te frenaba `murosDeCaminata` en el perímetro, pero ese tope era
**invisible**: chocabas contra nada y te detenías. Eso no se lee como «llegué a
la pared», se lee como que el programa se trabó. El muro no agrega realismo:
hace honesto un límite que ya existía.

Van a 4,5 m —la altura de un supermercado de verdad—, con zócalo, y **sólo en
primera persona**: en la vista orbital, que es la que se usa para negociar,
taparían el plano.

Un detalle que sólo se vio mirando: quedaron **marrón sucio, más oscuros que el
piso**, al revés de cualquier tienda. La direccional principal cuelga a 40 m
casi a plomo, así que una cara vertical recibe N·L ≈ 0 y el muro se quedaba
sólo con el ambiente. Se levanta con `emissive` en el material del muro y no
tocando la luz de la escena, que ya está calibrada para los muebles. Medido
sobre la captura: muro (204, 200, 190) contra piso (205, 202, 195) — parejos,
que es como se ven de verdad.

**Techo no**, y es una decisión, no un olvido: taparía la única direccional
fuerte y habría que rehacer la iluminación entera; escondería el plano en la
vista orbital, obligando a mantener dos montajes de luz; y a 1,65 m de ojo con
fov 50° casi no entra en cuadro. *(Revisado el 2026-10-09 para la pantalla de
venta: un cielo raso a 3,2 m, de una sola cara, sin sombras ni luces, que el
editor no dibuja; ver «2026-10-09 (tanda 2): el ambiente». En el editor y al
caminar sigue sin techo.)*

### Una persona de 1,70 m

Es lo que vuelve legible la escala. Un render sin nada humano al lado se ve
como una maqueta: el proveedor no sabe si su exhibidor le llega al pecho o a la
rodilla, y «1,80 m de alto» escrito en una ficha no se lee igual que verlo.

Aparece al lado del **mueble elegido**, no siempre. Va al COSTADO y no adelante
a propósito: adelante taparía justo la cara que se está vendiendo. Y no es
chrome — sale en la captura para el proveedor, que es donde hace falta.

`lugarDeLaFigura` vive en `utils/planta.ts` y está probada, porque el caso que
importa no es el de la sede de demostración. Prueba derecha, después izquierda,
y si en ninguna hay lugar **devuelve `null` en vez de plantarla igual**: con
doce góndolas sueltas cualquier lado sirve, pero en una sede de ciento
veintiséis un costado da al pasillo y el otro a la góndola de al lado, y una
persona metida adentro de un estante no aclara la escala — la arruina. El test
es el mismo con el que se camina (`chocaEn` sobre `murosDeCaminata`, que ya
infla cada huella por `RADIO_PERSONA` y respeta la rotación), así que la figura
se para exactamente donde podría pararse alguien.

### Lo que queda sabido

El remate del muro se ve desde lejos: sin techo, a más de unos metros el ojo
pasa por encima de los 4,5 m y aparece el fondo del lienzo. Es una transición
suave y no se lee como agujero, pero está. Subir el muro no lo resuelve —a 12 m
de distancia el cuadro llega a 7 m de alto—; lo resuelve un techo, y el techo
cuesta la iluminación. *(En la pantalla de venta lo resolvió el cielo raso de la
tanda 2 sin costar la iluminación; al caminar sigue así.)*

---

## El conflicto no se podía resolver

El panel que ofrece «Usar la del servidor» / «Conservar la mía» se dibujaba
`position: absolute` dentro del `<header>`, y ese header lleva `overflow:
hidden` —está ahí para que la fila de pestañas no lo desborde en pantallas
angostas—. Resultado: del panel se veía **la tirita de arriba** y los dos
botones quedaban recortados fuera de la caja.

O sea que una sede en conflicto **no se podía resolver desde la interfaz**.
El indicador decía «Conflicto» para siempre, cada guardado seguía dando 409
(`pushSede` no reintenta una sede en conflicto sin `force`) y la única salida
era la consola del navegador. Le pasó a alguien con la única copia buena de
una sede encima.

Ahora el panel va por **portal a `document.body`**, `position: fixed`, anclado
al botón con `getBoundingClientRect` y reubicado en `resize` y `scroll`. Así
ningún contenedor lo puede recortar, sea cual sea el `overflow` de la cadena
de padres.

### Y dice los números

Elegir entre «la mía» y «la del servidor» a ciegas es lo que da miedo, y el
miedo es lo que deja una sede en conflicto durante días. El panel ahora
muestra **cuántos muebles hay de cada lado** —los locales salen del store, los
del servidor de `GET /layout/revisions`, que ya devolvía `count`— y una línea
que dice lo que el usuario necesita saber para animarse: *«Conservar la mía»
sube lo de esta computadora y pisa lo del servidor. No borra nada de acá.*

Es cierto y es la asimetría que importa: `resolveConflict(sede, "mine")` hace
un `pushSede` con `base_updated_at: null` y **no lee nada del servidor**;
`"server"` es el que descarta el trabajo local. `PUT /layout/{sede}` sólo
reemplaza el JSON de muebles de esa sede: espacios, contratos y montajes viven
en otras tablas y no los toca ninguna de las dos ramas.

---

## Los muebles se dibujaron a ciegas

El catálogo 3D se escribió a partir de la descripción de cada mueble, sin una
sola foto ni una referencia de otro programa. Eso dejó dos problemas de
distinta naturaleza, y el segundo es el que importaba.

### Ocho de los trece no se podían vestir

Probarle el producto del proveedor al mueble —la función por la que se cierra
un trato— **sólo funcionaba en cinco tipos**: góndola (doble y mural), punta,
robatope, vitrina y nevera de refrescos. Los otros ocho quedaban afuera, y no
por un olvido: el compositor sabía hacer una sola cosa, apilar filas de
facings sobre entrepaños. Una batea no tiene ninguna cara vertical que pintar.

Ahora hay **tres formas** de llevar producto, y cada tipo declara la suya en
`getPanelShelfSpan`:

| forma | qué es | quiénes |
|---|---|---|
| `estante` | filas de facings sobre entrepaños | góndola, punta, robatope, vitrina, nevera de refrescos, cruz, impulsador |
| `volcado` | producto a granel visto **desde arriba** | isla de piso, batea, isla fría, nevera de carnes, stand de frutas |
| `tira` | una columna de unidades colgadas | ristra |

`volcado` es la que faltaba, y es justo la mitad promocional del catálogo. Se
compone en el mismo canvas que las otras dos, tejiendo unidades de 13 cm con
las filas desfasadas y una rotación por celda —determinística, derivada de
`(fila, columna)`— para que se lea como un montón y no como una grilla.

### Ningún mueble inventa producto

La regla vieja era que cada malla traía su propio relleno: cajas de helado de
colores en la isla fría, un bloque verde en el stand de frutas, una losa roja
en la nevera de carnes, botellas rojas / naranjas / verdes / azules en la de
refrescos. Con el arte del proveedor cargado, **ese relleno se veía por los
huecos entre facings** y competía con la marca que acababa de pagar por estar
ahí.

Ahora el producto inventado se borró de todos, con una sola excepción
deliberada: la nevera de refrescos conserva botellas **mudas, de un solo tono
frío**, y sólo mientras el espacio esté sin vender. Una nevera vacía no se lee
como nevera; una nevera con seis colores de marcas que no existen le roba el
protagonismo a la que sí. **Y mientras se prueba un producto en ella tampoco**
(`conRelleno={!pinta && !enPrueba}`): la nevera probada muestra sólo lo probado.

Desde 2026-10-08 la regla «arte o relleno» vale por **(cara, entrepaño)** y no por
mueble entero: probando un producto en los entrepaños 2 y 3 de la cara B, el resto
de la cara B y toda la cara A siguen con su relleno por rubro de lo vendido
(`cubiertas`, en `muebles/frentes.ts`). Ningún mueble dibuja las dos cosas en el
mismo entrepaño.

### Mueble por mueble

- **Isla fría.** Era un cajón macizo con un vidrio azulado adentro fingiendo
  el pozo, así que el producto quedaba enterrado en geometría y no se veía.
  Ahora el hueco es geometría de verdad: cuatro paredes de 5,5 cm sobre un
  cuerpo más bajo, y el producto apoyado en el piso del pozo.
- **Stand de frutas.** Dieciocho tablas apiladas hasta un metro: una ruma de
  madera. Un stand de verdad es un mesón con un cajón **poco profundo** arriba,
  para que la fruta quede a la vista y al alcance de la mano. El producto va
  adentro del cajón, no al ras del borde —al ras se veía como una tapa impresa—.
- **Exhibidor cruz.** Dos paneles del fondo entero, en gris casi negro, que
  enmarcaban el producto como dos paredes. Ahora se para en cuatro postes de
  esquina con travesaños, en metal claro, y lleva fondo: sin fondo, detrás del
  producto quedaba un hueco negro.
- **Góndola.** Se paraba en dos patitas, con el pasillo visible por debajo, y
  llevaba una barra blanca suspendida por encima sin apoyarse en nada. Ahora
  tiene zócalo corrido de punta a punta y un remate al ras sobre los montantes.
- **Batea.** El volcado flotaba en el aire, en el medio de la jaula. Se le
  agregó el **fondo falso** que toda batea tiene, que es lo que sube el producto
  cerca del borde. De paso, el riel de arriba cerraba 4,5 cm por encima del
  montante: era un aro suelto.
- **Vitrina.** En gris pizarra se leía como un electrodoméstico negro y le
  robaba el contraste al producto. Acero claro, y la tira LED del techo —que era
  una losa del fondo entero tapando el estante de arriba— quedó donde va, pegada
  al frente.
- **Isla de piso.** Tres bandejas de 10 cm flotando una sobre otra. Ahora es
  cartón escalonado macizo, cada andén una caja de altura completa, con el
  producto volcado sobre cada uno.
- **Ristra.** Se leía como un panel. Ahora es lo que dice el nombre: una
  columna de unidades colgadas.
- **Nevera de carnes** e **isla fría**: el volcado se había puesto *debajo* de
  una superficie interior que ya existía, así que no aparecía nada. Va sobre el
  cuerpo, bajo el vidrio.
- **Robatope.** El indicador de estado se montaba al 90 % de la altura, encima
  del producto. El estado es del sistema y no tiene por qué taparle la cara al
  proveedor: va abajo, como en todos los demás.

### Cómo se comprobó

Sembrando **los catorce del catálogo** (los trece que se venden más el mural)
en una escena y mirándola dos veces: una con el mismo arte cargado en todos
—para ver que ninguno queda sin vestir—, y otra con los espacios vacíos, que es
el estado en el que están casi siempre. Las dos capturas están en la conversación.

### Lo que seguía debiendo — saldado para la góndola

El producto **se estiraba para llenar el hueco entre entrepaños**: el compositor
sabía cuántas filas caben pero no cuánto mide el empaque, así que una chocolatina
en una góndola de 38 cm de paso se dibujaba de 38 cm de alto.

Para la góndola ya no: `muebles/producto.ts` tiene los formatos de empaque a escala real
y `acomodar()` cuenta los frentes que entran de verdad. **Sigue debiéndolo el resto del
catálogo**, que se pinta con el compositor de arte.

---

## La góndola se construye con las piezas que tiene una de verdad

Todo el mobiliario 3D estaba hecho de `boxGeometry`. Mientras una pieza sea una caja no
hay labio, ni pliegue, ni gancho, ni ranura — y son esos cuatro detalles los que hacen que
el ojo lea «mueble de tienda» en vez de «primitiva de Three.js». No es un problema de
material ni de iluminación: **con una caja no hay nada que iluminar.**

### Dónde vive

`frontend/src/components/StoreEditor3D/muebles/`:

| archivo | qué es |
|---|---|
| `medidas.ts` | Las cotas de catálogo, en metros. Una sola fuente para todo el que necesite saber dónde cae un entrepaño. |
| `perfiles.ts` | Las secciones de lámina plegada como `Shape` extruido, cacheadas por firma. |
| `GondolaReal.tsx` | El ensamblaje del mueble. |
| `producto.ts` | Formatos de empaque y la cuenta de frentes. |
| `ProductoEnGondola.tsx` | El producto parado sobre los entrepaños. |

Y `/taller` (`pages/TallerMuebles.tsx`) es el banco de pruebas: un mueble solo, girable,
con luz neutra y nada alrededor. **Se construye ahí y después se enchufa**, porque el
editor son más de cinco mil líneas y cambiar geometría ahí adentro es cambiar a ciegas.

### Las siete cosas que hacen que se lea como una góndola

1. **Se arma por módulos** de ancho de catálogo, con un parante en cada junta. Un corrido
   de 5 m no es un mueble de 5 m: son cuatro módulos. Dos postes en las puntas y nada en
   el medio es lo que delata un corrido largo.
2. **Dos juegos de entrepaños independientes**, espalda con espalda, cada uno con su
   fondo. De perfil, una góndola doble modelada como una tabla profunda se lee como mesa.
3. **Paneles de fondo de listones sobre respaldo.** Es la superficie más grande del
   mueble; lisa, lo convierte en una pared blanca. La luz entre listones es la ranura de
   verdad y tira sombra propia.
4. **Perfil escalonado**: la bandeja de abajo es la más profunda y van achicándose.
5. **Entrepaños de lámina plegada**, con labio y gancho.
6. **Base retranqueada** con la muesca donde entran los pies, y **remate superior**.
7. **Parantes con la cara calada hacia el pasillo**, apoyados sobre la base.

**Ninguna cota se deriva del alto o del ancho del mueble.** Ése es el delator número uno
de un mueble inventado: un entrepaño cuyo espesor cambia si la góndola es más alta. Una
lámina mide lo que mide. El día que llegue el catálogo del proveedor real del cliente se
corrigen las cotas en `medidas.ts` y se corrige todo — **y ese catálogo sigue pendiente**:
las medidas de hoy son estándares de industria, un punto de partida honesto.

### Sistema de coordenadas

Toda pieza de una cara nace apoyada en `z = 0` y crece hacia **-Z**, que es el pasillo. La
cara de +Z es el mismo subárbol girado media vuelta. Mantener esa convención es lo que
permite montar entrepaño, panel, parante, porta-precios y remate sin corrimientos a mano.

### El producto: lo vendido, no lo decorativo

Lo que se para sobre los entrepaños es **lo que está vendido**. Los slots ocupados o
reservados se llenan; los libres quedan vacíos. Rellenar la góndola entera «para que se
vea linda» miente sobre la disponibilidad, que es el dato que este sistema tiene que dar.

No hay catálogo de SKUs y **no se inventa uno**: el sistema vende espacio, no productos.
De cada espacio sabe el proveedor, el valor, la vigencia y un rubro escrito a mano. Así
que lo que se dibuja es el **empaque del rubro a escala real** — y con eso la góndola
muestra los siete frentes de aceite que entran de verdad, que es justo la cuenta que
discute quien negocia.

Cuando el proveedor subió su arte, manda el arte: la lámina tapa esta capa, porque es
información real y el empaque por rubro es una aproximación.

### Los espacios internos ya se pueden marcar desde el 3D

`GondolaMesh` y `PuntaMesh` siempre supieron dibujar los paneles de slot, y **nunca se
dibujaron**: la escena llamaba a `FixtureMesh` sin `onSlotClick`, que es la condición que
los enciende. El panel lateral invitaba a hacer clic en un slot del panel frontal y ese
panel no existía en ninguna pantalla. Compilaba, y las pruebas del mesh pasaban.

Ahora se encienden **sobre el mueble seleccionado**, y sólo sobre ése: encendidos en toda
la planta, un local de cincuenta muebles queda cubierto de rectángulos de colores y no se
ve la tienda.

Desde 2026-10-08: **en Presentar no hay slots** (`conEspacios` termina en
`&& !presentationMode`: el estado de cada espacio no es asunto del proveedor que mira),
con un producto en prueba los paneles son **sólo un contorno de 1 px** (`ContornoDeSlot`;
el relleno, transparente, sube a 12 % al pasar el mouse y 22 % elegido, y sigue
recibiendo el clic) —desde 2026-10-09: el velo al 15 % teñía de verde el mueble y el
producto— y llevan `userData={CHROME}`, así que no salen en ninguna captura ni en la
lámina «Hoy / Con».

### Cómo se prueba

`npm run probar:muebles`. Afirma lo que tiene que **seguir** estando —los slots, su
geometría, el pintado de caras, la cuenta única de filas— y no lo que se agregó, porque el
modo de falla real ya ocurrió: un intento previo de hacer los muebles más reales (PR #62)
reescribió `GondolaMesh` entero y se llevó `statusColor`, `facePaint` y los cinco props de
slot. La forma mejoraba; el mueble dejaba de poder venderse.

Una parte de las pruebas **se ejecuta** en vez de leer el código: `producto.ts` y
`medidas.ts` son funciones puras, se compilan con esbuild y se corren. Hizo falta — tres
defectos pasaron por debajo de las pruebas de texto porque el código decía exactamente lo
que tenía que decir:

- «Aceites» caía en la fila de los cereales, porque «te» está adentro de «acei**te**s».
- Una góndola de 1,80 perdía su entrepaño más alto y una de 1,85 no: el último nivel cae
  justo en el límite y la comparación la decidía el último bit del flotante.
- `THREE.Color` no entiende `hsl(190 40% 50%)` —la sintaxis CSS moderna— y no falla: se
  queda en blanco.

### La punta de góndola

Es **el espacio más caro de un supermercado**: se ve de frente desde todo el pasillo
transversal y se negocia aparte del lineal. Lo que la distingue del corrido:

- **El copete**, que es lo que el proveedor compra. Va centrado en el fondo y apoyado
  sobre una tapa. Montado al filo de adelante se lee como un cartel suelto flotando por
  delante del mueble — se probó y se ve exactamente así.
- **Una sola cara vendible, y montada ATRÁS**: el cuerpo se cuelga contra el corrido y
  crece hacia el frente. Con el montaje de la góndola, el arte y el producto aparecen
  detrás del mueble.
- **La barra de luz** bajo el copete.

Todo lo demás es el mismo herraje del corrido, y por eso existe `piezas.tsx`: parante,
panel de fondo y juego de entrepaños son los MISMOS objetos físicos en los dos muebles.

Dos cosas cuidadas a propósito: **la franja de slots de la punta no es la misma cuenta
que la de la góndola** y así queda —unificarlas corre todos los espacios ya vendidos—, y
**el copete no se tiñe con el estado comercial**, porque es donde va la marca.

### Los muebles de frío

`NeveraReal` cubre dos muebles que se compran por separado:

- **`multideck`** — frente ABIERTO, con cortina de aire. Es el de bebidas y lácteos, y es
  lo que el catálogo declara para `nevera_refrescos` («vitrina multideck abierta»). Lo que
  lo delata es el par de bocas: impulsión bajo el copete y retorno al ras de la bandeja de
  abajo. **Cumplen el mismo papel que la puerta en una nevera cerrada** — sin ellas, el
  mueble se lee como una estantería pintada de oscuro, que es como se veía.
- **`puertas`** — cerrado con vidrio. Lo que se reconoce de una puerta no es el vidrio,
  que casi no se ve, sino el marco de aluminio. Un frente de más de 75 cm se parte en dos
  hojas: no la aguanta la bisagra y no abre en un pasillo.

Sus cotas también son de fabricación: el compresor mide lo que mide. Era `h * 0.14`, y con
eso un mueble alto salía con un zócalo de 28 cm.

**El relleno mudo se apaga cuando entra el arte del proveedor.** A diferencia de la
góndola —donde el hueco vacío ES el dato— la nevera se vende entera, no por pedazos, así
que mostrarla llena no esconde ninguna disponibilidad; mostrarla vacía sí miente.

### El defecto que compartía medio catálogo: estaban VACÍOS

El cajón de frutas tenía sus listones, la isla su guarda de acrílico, el mostrador su
vidrio curvo — y los tres se leían como maquetas. Un mostrador de carnes sin carne es un
mueble; con carne es una carnicería.

Hay dos maneras de llenar, y la diferencia no es de dibujo sino de negocio:

| | qué se vende | qué se dibuja |
|---|---|---|
| `ProductoEnMueble` | la góndola y la punta, **por espacios internos** | sólo los slots vendidos; el hueco vacío ES el dato |
| `ProductoEnRepisas` | el resto, **el mueble entero** | todas las repisas, con el rubro del contrato |
| `ProductoAGranel` | lo volcado: batea, cajón, isla, mostrador | montón desparejo, sembrado con el id del mueble |

Y **lo volcado está acostado.** Nadie tira cajas a un canasto y quedan paradas: con el
envase de pie, una capa de 19 cm llena el cajón entero y desde arriba se ve una tapa lisa.
Además, lo que se vende suelto no viene en envase — «Frutas» no casaba con ningún rubro y
caía en la caja por defecto, así que el cajón salía lleno de cajas de galletas.

El desorden del volcado sale de un generador **sembrado con el id del mueble**, no de
`Math.random`: al azar, la fruta se reacomoda sola cada vez que se mueve la cámara, el
plano titila entero y nadie puede señalar nada.

### La silueta del envase decide si se reconoce el producto

Todo el producto se dibujaba como una caja escalada. Con eso un lineal de gaseosas es una
pared de ladrillos y una nevera de bebidas se ve como un archivador. **La silueta es lo
primero que el ojo clasifica** — antes que el color y mucho antes que la etiqueta.

`Empaque.forma` traía el dato desde que se armó el catálogo de empaques y no se usaba.
Ahora `geometriaDeEmpaque` lo convierte en geometría: la botella es de revolución con
hombro y cuello, la lata un cilindro con sus cantos engargolados, la fruta un icosaedro
facetado (una esfera perfecta se lee como bola de billar) y la carne una bandeja con el
film abombado.

Dos trampas que costó ver:

- **Un envase acostado se GIRA, no se achata.** Una botella tumbada sigue teniendo
  cuello; dibujada de pie con 9 cm de alto sale un disco. `acostar` marca `acostado` y la
  geometría se encarga.
- **Una geometría del caché no se puede mover.** `geometriaCanasto` la comparten varios
  muebles: un `translate` sobre la copia cacheada se lo lleva puesto a todos. El casco sin
  cachear vive aparte, en `cascoDeTronco`.

### El mostrador de servicio y el mural de vegetales

Un mostrador de carnes no es un cajón con una placa de vidrio vertical encima: eso es una
vitrina cualquiera. Lo identifican el **vidrio curvo**, la **bandeja inclinada** —para que
lo de atrás se vea por encima de lo de adelante— y el **lado de servicio**, sin el cual el
mueble es simétrico y no se entiende de qué lado se despacha.

Con el vidrio curvo puesto **seguía sin parecerse**, y eso sólo se vio poniéndolo al lado
de la foto de uno real. Las tres diferencias volvían a ser de forma:

- **No apoya en el piso: cuelga sobre patas acampanadas**, troncos de cono que se abren
  hacia el suelo. Ese hueco por debajo es lo primero que se ve de lejos y es lo que separa
  un mostrador de servicio de una isla o de una batea, que sí apoyan. Como cajón hasta el
  piso se leía como un contenedor.
- **Es acero inoxidable claro, no negro.** Lo único oscuro son el marco del vidrio, la
  reja del compresor y el trasero de servicio. Ese contraste es la mitad de lo que el ojo
  reconoce; pintado todo de casi-negro no queda contraste ninguno.
- **El vidrio es una bóveda, no una visera.** Estaba montado en `zFrente - vuelo`: la
  curva entera por DELANTE del mueble, colgando en el aire, con el producto fuera de ella.
  Nace en el filo del frente y se tumba hacia atrás por encima de toda la cubeta.

Lo demás son los detalles que lo hacen leer como máquina y no como maqueta: el bocel de
acero corrido en el filo, las puntas redondeadas, los montantes negros que parten la
bóveda en paños, las tapas de vidrio de los extremos —sin ellas el vidrio son dos
costillas paradas en el aire— y el cajón del compresor con su reja bajo un extremo. Sus
cotas viven en `medidas.ts` (`MOSTRADOR`, `cotasDeMostrador`) y no en el componente,
porque quien vuelca el producto adentro necesita las mismas: **con dos cuentas la carne
flota sobre la cubeta o se hunde dentro de la carrocería.**

Y un error latente que salió de ahí: la firma del caché de `geometriaVidrioCurvo` no
incluía el espesor. Los montantes son ese mismo arco, angosto y grueso, así que el primero
en dibujarse se quedaba con la ranura del caché y el otro salía con el espesor ajeno.

El **mural de frutas y verduras** (`nevera_vegetales`) es un tipo nuevo del catálogo. Es
el mismo cuerpo que el multideck de bebidas con una diferencia que cambia todo: sus
niveles son **bandejas inclinadas con tope**, no entrepaños planos. Lo que se carga encima
es fruta suelta, que rueda y hay que verla desde arriba.

**Un tipo de mueble nuevo toca diez lugares**: el tipo, el prefijo de código, el catálogo
del editor 3D, el del plano 2D, el alto por defecto, el color, el minimapa, los nombres de
los informes, y el prefijo y el nombre en el backend. Si falta uno, el mueble se coloca y
después no tiene código, o no aparece en el plano. `probar:muebles` lo verifica.

### Y la bandeja gira sobre sí misma

Rotando el grupo desde el origen del mueble, una bandeja a 1,2 m de altura se corre treinta
centímetros en Z y sale por el costado de la carrocería. El giro va sobre el grupo ya
puesto en su altura. Es el mismo error que tuvo el producto del exhibidor de cruz.

### Hizo falta una foto, así que se buscó la ficha de todos

El mostrador de carnes sólo se arregló cuando hubo una foto de uno real
delante. Eso es un dato sobre el método, no sobre ese mueble: **lo que se
modela de memoria sale parecido a la idea que uno tiene del mueble, no al
mueble.** Así que se revisó el catálogo entero contra fichas de fabricante y
fotos de producto, y salieron tres defectos grandes, dos reglas falsas y un
error latente.

**La caja registradora tenía la pantalla flotando.** El poste medía
`posH * 0.75` y la pantalla se colocaba a `posH`: veinticinco centímetros de
aire entre las dos. Compilaba, y sólo se vio poniéndola en el taller. Le
faltaba además todo lo que hace que una caja se lea como una caja: la mesa no
es una tapa lisa sino una **cama hundida** rodeada de un bocel de goma; la
registradora se apoya en una **consola** y el poste nace de ahí; del lado del
cajero va el **sector de empaque** con su guarda; y del lado del cliente van
los **estantes de impulso** —chicles, pilas, revistas—, que son el espacio más
caro de la línea de cajas y son espacio VENDIBLE. Las tres alturas que
sostienen la pantalla salen ahora de **una sola cuenta encadenada**
(`yConsola` → `yPoste` → `yPantalla`): es lo único que garantiza que ninguna
pieza quede en el aire. El monitor del mostrador de servicio al cliente tenía
el mismo defecto y se arregló igual.

**La ristra era una tabla.** La ficha del fabricante da una tira de 3,8 cm de
ancho con doce ganchos y un cabezal porta-cartel. La nuestra ataba el ancho de
la tira al ancho del mueble —40 cm de huella daban 28 cm de tira— y encima
llevaba un panel translúcido detrás. **Un clip strip no tiene respaldo**:
cuelga suelto por delante de la mercadería y se ve la góndola a través de él.
El cabezal importa aparte: es lo que compra la marca.

**El stand de frutas era una mesa con cosas encima.** La ficha da bandejas
inclinadas y escalonadas con cajones de cosecha: la inclinación para mirar la
fruta desde arriba, el escalón para que la bandeja de atrás no quede tapada
—media cara vendible— y el cajón porque la fruta llega en cajón y se exhibe en
el cajón.

**Y la batea se veía vacía con producto adentro**, por dos cuentas encadenadas
y dos reglas falsas. Una botella de litro y medio mide 31 cm y el alto libre
daba 30,6: por cuatro milímetros se acostaba, y acostada mide 30 cm de largo,
así que en el fondo entraba una sola fila. Las cuentas: una batea de promoción
va **rebosada**, no enrasada, y su piso va **alto** —es un tacho poco hondo
sobre patas largas—. Las reglas:

- **lo que entra parado se para.** En la tienda, una batea de gaseosas tiene
  las botellas paradas; lo que se tira de costado es lo que no entra de pie; y
- **lo alto no se apila.** Una botella parada no va encima de otra. Apilando
  salía una torre en el medio del canasto que no existe en ninguna tienda.

De paso, un error latente: la firma del caché de `geometriaVidrioCurvo` no
incluía el espesor, y los montantes de la bóveda son ese mismo arco angosto y
grueso — el primero en dibujarse se quedaba con la ranura del caché.

**Los que se revisaron y quedaron como estaban**, porque coinciden con su
ficha: el robatope (la ficha de un exhibidor lateral de puntera da 35–45 cm de
ancho con estantes de poca profundidad y respaldo, que es lo que tiene), el
exhibidor cruz —«cruz» es de *cross-selling*, no de forma: un rack de cuatro
postes con respaldo de marca es exactamente eso—, el impulsador, la vitrina y
la isla fría. La única diferencia medida que quedó sin corregir es el **fondo
del robatope**: el catálogo dice 40 cm y la ficha del fabricante 25.

> El **exhibidor de piso** también salió de esa revisión como «correcto», y no
> lo era: se revisó sin buscarle ficha. Ver *Lo que se vio en pantalla y la
> ficha no decía*, más abajo.

### Lo que se vio en pantalla y la ficha no decía

La revisión contra fichas arregló medidas. Lo que no podía arreglar es lo que
sólo aparece **mirando el mueble dibujado con producto adentro**, que fue de
donde salió esta ronda entera: el cliente abrió el editor y los señaló uno por
uno.

**El robatope, el exhibidor cruz y el impulsador mostraban dos cosas a la vez.**
El arte del proveedor pintado encima y, debajo, el relleno genérico por rubro
con los estantes llenos. La regla ya existía —el arte del proveedor le gana a
la aproximación por rubro— y estos tres muebles no la aplicaban: el relleno se
dibujaba incondicionalmente. Ahora los tres calculan `pinta` y apagan el
relleno con `{!pinta && …}`, y hay una guarda **general** que recorre todos los
`*Mesh` del editor: ningún mueble puede dibujar las dos cosas. La guarda por
mueble se había escrito tres veces y tres muebles se habían quedado afuera.

**La fruta del stand se salía del cajón.** Se había achicado el cajón sin
achicar lo que se mete adentro: el relleno seguía usando el fondo completo de
la bandeja. Las dos cuentas viven ahora en `bandejasDeStand`, que es la misma
que dibuja el cajón.

**El mostrador de servicio al cliente no parecía uno.** Era una tapa lisa sobre
un cajón con un cartel colgado de dos postes. Lo que identifica un mostrador de
atención es el **escalón**: abajo el plano de trabajo del que atiende —que es
un escritorio y va bajo—, encima y volando hacia el cliente la repisa contra la
que el cliente apoya y firma, más un tramo accesible a 0,80 m para silla de
ruedas. Sin el escalón esto es un podio. Se había marcado «revisado, sin
cambios» sin haberle buscado ficha: el mismo atajo que la revisión anterior ya
había desmentido.

**El exhibidor de piso no es un mueble.** Fueron tres formas y las tres estaban
mal: una pirámide de cajones macizos que escondía el producto adentro de la
caja de arriba; después un exhibidor impreso con bandejas, cenefa y header; y
recién entonces, con una foto de una tarima de madera delante, lo que en
realidad es: una **estiba** plantada en el pasillo con la mercancía apilada
encima. Llega el camión, se baja la estiba entera y se planta — lo que se le
alquila a la marca es la POSICIÓN, no un herraje.

El dato estaba escrito en el catálogo desde el principio y no se había leído:
la huella del tipo es **1,20 × 0,80 m**, que es exactamente la medida de una
tarima estándar, y el alto de 1,40 es la tarima más la torre.

Y quedaba un defecto propio: la torre **flotaba**. Las capas se repartían en
pasos nominales de 30 cm y sobre cada una se paraba el empaque que entrara, así
que una caja de galletas de 19 cm dejaba 11 cm de aire y la torre salía en
pisos separados. Una estiba no tiene estantes: cada tendido se apoya sobre el
de abajo. El paso lo pone ahora el **empaque** —`cotasDeEstiba(w, d, h,
empaque.alto)`—, y la torre no sobresale del alto del espacio, que es el que
mira el chequeo de choques y el que se le cobra a la marca.

La prueba de este mueble **ejecuta** las cotas y le pregunta a `producto.ts`
qué empaque se pararía sobre cada tendido: si sobra aire, falla. Las siete
mutaciones que se le probaron —incluida la de volver al paso nominal— caen.

### Dos lecciones de método que costaron caro

**No se revierte con `git checkout --` un archivo con cambios sin commitear.**
Pasó dos veces en la misma sesión: al deshacer una mutación de prueba, el
archivo volvió a HEAD y se llevó puesto todo lo que no estaba commiteado. La
regla es commitear ANTES de mutar, y verificar que el árbol quede limpio
después de cada reversión.

**Una guarda que mira el nombre de una constante no es una guarda.** La prueba
de la batea verificaba que existiera `REBOSE`; una mutación que dejaba la
constante en su lugar y la sacaba de la fórmula pasaba en verde. Por eso las
cotas viven en `medidas.ts`: desde ahí la prueba puede **ejecutar la cuenta** y
afirmar lo que de verdad importa —que en una batea de tamaño de catálogo una
botella de litro y medio entra parada—, en vez de leer el código.

### `/taller` dibuja cualquier mueble del catálogo

`FixtureMesh` y `FIXTURE_DEFS` se exportan sólo para eso. Sin ello, mirarle la forma a un
mueble obliga a colocarlo en una sede y pelear con la cámara del editor — y la mitad de
los defectos de forma sólo se ven poniendo el ojo a la altura del producto. El taller
también toma un **rubro**, porque lo que se dibuja adentro depende del contrato.

Y se le saca una foto desde la línea de comandos con
**`frontend/scripts/taller/mirar-mueble.py`**, que levanta Chromium, entra al taller,
gira la cámara a tres cuartos —de frente casi todo parece una caja, y «el producto está
adentro del mueble» sólo se ve en tres cuartos— y guarda el PNG. Ese guion se escribió y
se perdió tres veces por vivir en `/tmp` de un contenedor que se recicla; por eso está en
el repo. El token de sesión no: se pasa por `TALLER_TOKEN`.

Desde el 2026-10-02 `/taller` es **sólo para administradores**: cualquier otra sesión
vuelve a `/`. Es una herramienta de diseño, no una pantalla del producto.

Desde el 2026-10-14 también dibuja cada **modelo** de la familia con su ficha estampada, y
«al lado» el de siempre, para compararlos: ver *Cotejo visual de los muebles de Colombia*.

Y desde más tarde ese mismo día tiene dos pestañas: **«Mirar»**, el banco de siempre (que
ahora lista también las fichas propias del supermercado en «modelo»), y **«Fichas»**, donde la
dueña arma las de sus muebles y las ve girar mientras escribe: ver *Fichas propias: la pantalla
(2026-10-14)*. `scripts/taller/mirar-mueble.py` sigue eligiendo el mueble por el segundo
`select` de «Mirar»: las pestañas son botones y no corrieron nada.

### Lo que falta

- **Reconstruidos de cero**: góndola (doble y mural), punta, nevera de refrescos y batea.
- **Reconstruido contra la foto de uno real**: el mostrador de carnes.
- **Ya estaban bien y se dejaron**: vitrina, checkout e isla fría — tenían forma correcta
  y lo que les faltaba era producto, que ahora tienen.
- **Corregidos después, al mirarlos en pantalla**: stand de frutas, mostrador de servicio
  al cliente y exhibidor de piso. Los tres habían pasado la revisión contra fichas.
- **Sólo se les agregó producto**: exhibidor cruz, impulsador y robatope. Su estructura
  sigue siendo de cajas, aunque razonable para muebles de ese tamaño.
- **La ristra dejó de llevar entrepaño.** Tenía una placa horizontal del ancho del mueble
  en cada gancho, y eso la convertía en una repisera angosta. Una ristra es una TIRA: el
  producto cuelga de una varilla por su troquel.
- **Sin tocar**: columna y zona libre, que son infraestructura y no se alquilan.
- **Las cotas del proveedor real del cliente**, que reemplazan las de `medidas.ts`.
- El producto no distingue forma: una botella se dibuja como caja. `Empaque.forma` ya
  lleva el dato («caja», «botella», «lata», «bolsa») y nadie lo usa todavía.

---

## Pendiente urgente: datos de TERRON

TERRON tenía datos reales y **quedó vacía en el servidor**, vaciada por el bug del layout
vacío antes de que se desplegara el arreglo.

Procedimiento de recuperación, en orden:

1. **No abrir la app** en ningún equipo que pueda conservar la copia: al arrancar adopta la
   del servidor y sobrescribe la local.
2. En cada equipo, entrar a `https://retail-espacios.onrender.com/api/health` — esa URL
   devuelve JSON y **no carga la aplicación**, así que no dispara sincronización. Abrir la
   consola (F12) y correr:

   ```js
   const s = JSON.parse(localStorage['retail-fixtures-v1']).state;
   Object.fromEntries(Object.entries(s.fixturesBySede).map(([k, v]) => [k, v.length]))
   ```

3. Si TERRON aparece con fixtures, copiar la copia completa con
   `copy(localStorage['retail-fixtures-v1'])` y reconstruir la sede desde ahí.
4. Si ningún navegador la conserva, la vía es un **backup de la base** en Render. El botón
   *Rollback* del servicio web **no sirve**: revierte el código, no los datos.

---

## Renovar

Dos cosas, y ninguna es un tablero de estados.

**El botón.** Renovar no es abrir un contrato en blanco sobre el mismo mueble: es el mismo
acuerdo otra vez, y lo único que suele cambiar es el precio. El botón llega prellenado con
el proveedor, la marca y el valor QUE SE ESTÁ PAGANDO —no la tarifa de lista, porque lo que
se renegocia es lo que se paga hoy— y con el periodo arrancando **el día después** de que
termina el que corre, por el mismo largo. El día después y no el mismo: los dos extremos
cuentan como ocupados, así que arrancar el mismo día se solaparía con un contrato vivo y la
propia validación del formulario lo marcaría no disponible.

Aparece cuando el contrato se cae dentro de 60 días o ya se cayó, en la ficha del espacio y
en el globito del plano. Antes de eso no hay nada que renovar y el botón sería una trampa.
Al lado queda «Contrato con otro proveedor», que es el otro camino y conviene que se lea
como tal en vez de tener que deducirlo.

La semilla entra en la `key` del formulario a propósito: los campos se siembran en el
`useState` inicial, así que sin remontar, tocar «Renovar» con un contrato a medio armar en
pantalla no haría nada visible.

**Los recordatorios.** Existían y corrían —cada 12 horas desde `main`, y de arranque— pero
con tres cosas mal, y las tres importaban:

1. **Los hitos eran 30/15/7/1.** Son 30/15/6: a una semana ya no hay margen para negociar y
   a un día el correo avisa de algo que ya pasó.
2. **Se comparaba por igualdad exacta.** Si el servicio estaba dormido justo el día 30, ese
   aviso no salía NUNCA. En Render un servicio sin tráfico se apaga y el día que despierta
   rara vez es exactamente un hito. Ahora se busca el hito más chico que todavía cubre los
   días que faltan: un contrato a 28 días recibe el aviso de «30» —tarde pero llega— y uno
   que aparece a 5 días recibe UNO solo, el de «6», y no los tres de golpe. La marca en
   `NotificationLog` lleva el hito y no los días, para que un aviso tardío no se repita
   todos los días hasta el vencimiento.
3. **Iban a `notify_emails`**, la lista global vieja, mientras los correos de contrato ya
   iban por la libreta de contactos por sede. Con la libreta cargada y esa lista vacía —la
   instalación normal hoy— **el recordatorio no le llegaba a nadie** y sólo dejaba una línea
   en el log. Ahora va por la misma libreta que todo lo demás. Sin contactos no se manda y
   **no se marca**: marcarlo daría por avisado algo que no salió.

Lo que se descartó: un tablero de «en negociación / renovado / no renueva» con valor
propuesto, totales partidos y plaquitas por renglón. Se construyó y se tiró. En una pantalla
que ya tiene el plano, la lista de lo que se cae y la tabla de espacios, era una cuarta capa
de información para sostener a mano un dato que el contrato nuevo ya deja escrito.

## Las fotos duran lo que dura el contrato

La dueña lo decidió el 2026-10-10: las fotos se guardan mientras dure el contrato; si se
renueva, el plazo se alarga; si termina y no hay renovación, se borran para liberar
espacio. Es lo que más pesa de cada base —una foto de montaje ronda los megas, se toma una
por reporte y la foto de «montado» es obligatoria— y en Render la base es lo que se paga.
Hasta acá nada se borraba nunca: la planometría y la foto eran «la prueba que responde un
reclamo meses después». Ahora esa prueba vive lo que vive la relación con el proveedor en
ese espacio, más cinco días.

La lógica es una sola, `backend/app/services/fotos_vencidas.py`, y la corren el ciclo de
mantenimiento (al arrancar y cada 12 horas, para todos los clientes activos) y el script de
consola `backend/scripts/fotos_vencidas.py`.

### Qué se borra y qué no

Se borra la **foto de un montaje** —la fila de `space_files` con el prefijo `montaje--`
que apunta un `mount_confirmations.file_id`— y la **planometría** del contrato
(`lease_files`, kind `planometria`). El montaje **queda**, con quién, cuándo, montado o no,
el motivo y la nota: pierde sólo la foto, igual que cuando un admin la borra a mano
(`routers/files.py::delete_file`). No se toca el contrato, la bitácora, los PDF, Excel y
CSV del espacio (son documentos), la cara designada del 3D (aunque tenga el prefijo:
`space_faces` manda), el arte del catálogo (`supplier_assets`, que es del proveedor y lo
reusa el 3D) ni el layout. Un archivo con el prefijo que ningún montaje apunta tampoco: el
prefijo solo no prueba nada, cualquier admin puede subir `montaje--x.jpg`.

### Qué es renovar

En el sistema no existe como entidad: es **otro contrato del mismo espacio con el mismo
proveedor**. El botón «Renovar» lo siembra arrancando el día después del fin, pero el botón
desaparece apenas vence el contrato (`/spaces/comercial` sólo informa vigentes y
próximos), así que la renovación tardía se carga a mano y suele dejar un hueco. Por eso:

* **La cadena tolera hasta 60 días sin contrato** (`HUECO_DE_RENOVACION`, los mismos 60
  con los que el tablero ofrece «Renovar»). Una renovación ya cargada que arranca el 15 en
  vez del 1 sigue siendo renovación: el pedido de la dueña era «si se renueva, se alarga»,
  no «si se renueva el día siguiente».
* **Mismo espacio** es el mismo `space_id`: la renumeración cambia el código en la misma
  fila, así que la regla no se entera. La cara B es otro espacio.
* **Mismo proveedor** se mira con generosidad, porque juntar de más sólo conserva más: el
  mismo `supplier_id`; o el mismo nombre sin tildes, mayúsculas, puntos, posesivo ni forma
  societaria («Nutresa S.A.S.» = «NUTRESA» = «Grupo Nutresa», «Kellogg's» = «KELLOGG»,
  «BIC» = «Bic»); o las palabras de un nombre contenidas en las del otro, **por corto que
  sea** («Alpina» y «Alpina Productos Alimenticios S.A. BIC», «3M» y «3M Colombia S.A.S.»,
  «P&G» y «P&G Colombia Ltda»); o el mismo correo; o la misma marca en el mismo espacio.
  Detalles que la revisión adversarial encontró separando renovaciones: el posesivo
  («'s», «’s», «´s») se quita antes de partir en palabras, o deja una «S» suelta. La forma
  societaria que ABRE el nombre es el nombre —salvo «Grupo» y «Cía.»—: «Bic Colombia» es
  «BIC COLOMBIA» y no «COLOMBIA» (que se juntaría con cualquier «… de Colombia»), y «BIC»
  solo sigue siendo «BIC» (antes daba vacío y se ignoraba). Si no queda nada («Grupo»,
  «Cía. S.A.S.»), cuenta el nombre entero: un nombre nunca se ignora. Y ya no hay mínimo
  de 4 letras para contener: «Sol» y «Sol de Oriente» quedan juntos, y eso sólo conserva
  más.
* **Un contrato cancelado cuenta hasta su fin ORIGINAL.** Cancelar sólo apaga
  `is_active`; no hay fecha de baja (la única huella es la línea `contrato.baja` de la
  bitácora, que se purga al año), y adivinarla borraría antes. `is_active` no se mira para
  nada: mandan las fechas, así que un cancelado y un vencido se tratan igual.

### Cuándo

Una cadena termina cuando su último eslabón termina sin renovación. Desde ese fin hay
**5 días de gracia** (`DIAS_DE_GRACIA`, la única constante que hay que tocar para cambiar
el plazo) y se borra en la primera pasada del sexto día, a la hora de Colombia. Un
contrato que vence el 2026-10-31 conserva todo del 1 al 5 de noviembre y se borra en la
primera pasada del 6; si el 4 se carga la renovación, la cadena sigue viva y el plazo pasa
a ser el fin del contrato nuevo más cinco. Cuando ese último eslabón termina, se van las
fotos y las planometrías **de toda la cadena**.

### De qué contrato es una foto

`mount_confirmations` no tiene columna de contrato (y no se agregan columnas), así que una
foto se ata al **espacio** (`space_files.space_id`) y a la hora en que la recibió el
servidor. Una cadena reclama las fotos de su espacio desde la medianoche de Colombia de la
víspera de su primer arranque **menos 5 días** —el tablero de Montajes deja reportar un
contrato «pendiente» antes de la víspera— hasta el último instante del quinto día después
de su fin. La víspera es `routers/montaje.py::_se_confirma_desde`, importada y no copiada
(`probar-montajes.mjs` lo vigila): qué reporte es de qué contrato es una regla sola.

**Una foto que reclama al menos una cadena se borra cuando todas las que la reclaman, de
cualquier proveedor, terminaron.** Eso cierra el caso que encontró el mapa del código:
Nutresa firma noviembre y se cancela en septiembre; Alpina firma de octubre a diciembre. La
foto de noviembre la reclaman las dos; Nutresa «termina» el 30 de noviembre, pero la foto
se queda hasta que termine Alpina. En un relevo al día siguiente (Nutresa hasta el 31 de
octubre, Alpina desde el 1.º), el 6 de noviembre se va lo de Nutresa anterior al 26 de
octubre; lo del 26 en adelante —el desmontaje, el montaje adelantado de Alpina— se queda
mientras viva Alpina.

**Una foto que no reclama ninguna cadena** —el reporte adelantado de un contrato
«pendiente» más allá de esos cinco días (el tablero los lista sin tope y `POST /mounts` no
mira la víspera), o uno hecho con el espacio libre— no es prueba de ningún contrato: el
tablero tampoco la cuenta. Hasta la revisión adversarial quedaba **para siempre**, que es
justo lo que la dueña quería liberar. Ahora se borra cuando terminaron **todas** las
cadenas del espacio —por si era del contrato que arranca después; las de antes ya
terminaron solas, porque su ventana se cerró antes de la foto— y la foto misma tiene más de
cinco días (a la fecha de Colombia de la foto: el mismo margen para cargar el contrato que
vendría). Ejemplo: Alpina hasta el 31 de octubre, Nutresa desde el 1.º de diciembre, y el
montaje de Nutresa reportado el 15 de noviembre: se queda mientras viva Nutresa y se va el
6 de enero. En un espacio sin ningún contrato no se toca.

### Ante la duda, no se borra

Lo que no cierra se conserva, y el plan lo cuenta por motivo (sale en el log y en el
ensayo): el espacio de una sede borrada (`archived_spaces`), un montaje archivado, un
`space_code` que no es el código del espacio de la foto, un montaje sin hora, un contrato
del espacio con fechas imposibles (bloquea el espacio entero), **un contrato que vive sólo
en el JSON del plano** (puede ser la renovación), la foto de un espacio sin contratos, la
foto huérfana de menos de cinco días (`huerfana_reciente`), una planometría cuyo contrato
no existe o de otro `kind`, y **una planometría subida después de que la cadena terminó**: el endpoint
acepta contratos vencidos, y quien la cargó tarde quería dejarla. Una fecha como
9999-12-31 (el «indefinido» de una planilla) hace que esa cadena no termine nunca, sin
trabar al resto.

**El contrato del plano** se lee de TODAS las caras que el JSON da por vendidas
(`importar_del_plano.contratos_en_el_plano`, sin los «Ocupado» puestos a mano), y no de lo
que `revisar` ofrece importar: ésa da uno por importado apenas el espacio tiene en la base
CUALQUIER contrato vivo o próximo, de quien sea, y la renovación de Alpina quedaba tapada
por un contrato de Nutresa que arrancaba en tres meses. Lo único que no bloquea es la copia
exacta de un contrato de la base —mismas fechas, el mismo proveedor—, que es lo que el
plano guardaba antes de *Una sola verdad para lo comercial*: no agrega nada a la cadena.
**El bloqueo dura mientras el contrato siga en el JSON**: se levanta al importarlo desde
Supervisar y también, sin importar nada, cuando alguien guarda el plano de esa sede
(`layout._sin_contrato` borra esos campos; eso ya pasaba y `importar_del_plano` lo
documenta). Que el guardado importe antes de descartar queda como pendiente.

### Desplegar no es borrar: el interruptor

Render despliega `main` solo y la pasada corre al arrancar, así que sin freno el merge
borraba en todos los clientes en ese mismo momento. Por eso **`LIMPIAR_FOTOS_VENCIDAS`
está apagado por defecto**: apagado, la pasada calcula y deja en el log qué borraría
(`Fotos vencidas, cliente galerias: se borrarían: N fotos, M planometrías, X MB ·
conservadas: … · ensayo: LIMPIAR_FOTOS_VENCIDAS apagado`) y no escribe nada. La línea sale
**en cada pasada y por cada cliente, también con cero**, y en **WARNING**: la app no
configura el logging y uvicorn deja el logger raíz en WARNING, así que un INFO —como era
al principio— no llegaba nunca al log de Render, y como sólo salía con algo para borrar,
que faltara se leía como «nada que borrar» justo antes de prender el interruptor. Con el
interruptor prendido sale igual, con «borradas:». Se prende
con `LIMPIAR_FOTOS_VENCIDAS=1` en el panel de Render (no está en `render.yaml`, a
propósito, igual que `LOGIN_LEGADO`). Antes de prenderlo:

1. **La política de datos.** La que aceptan todos los usuarios dice en §6 «Fotos de
   montaje y planometrías: no se borran al vencer el contrato» (las dos copias,
   `docs/legal/` y `frontend/src/legal/`, atadas a `VERSION_POLITICA = "2026-09-v2"`).
   Cambiarla —y decidir si sube la versión, que hace que el flujo de consentimiento se la
   vuelva a pedir a todos— es de la dueña y del abogado, no del código; por eso este
   cambio no la toca. Texto propuesto para §6: *«Fotos de montaje y planometrías: se
   conservan mientras dure el contrato y sus renovaciones (otro contrato del mismo
   proveedor sobre el mismo espacio que arranca a más tardar sesenta días después de que
   termina el anterior). Cinco días después de que termina el último sin renovación, se
   borran automáticamente. El registro del montaje (quién, cuándo, si quedó armado), el
   contrato y los documentos del espacio no se borran.»* Y en el primer renglón de §6
   («Datos de negocio (contratos, espacios, proveedores, montajes, planometrías)»), sacar
   «planometrías».
2. **La copia de seguridad** de cada supermercado, bajada desde Configuración: es la
   única marcha atrás.
3. **El ensayo**: restaurar esa copia en local (`scripts/restaurar_copia.py`) y correr
   `python scripts/fotos_vencidas.py --hoy <día del despliegue>`. Lista por espacio la
   cadena terminada, sus proveedores (ahí se ven los nombres que la regla juntó), las
   fechas y cuántas fotos y planometrías, y aparte **las planometrías en PDF**: el
   casillero acepta PDF, y si alguien adjuntó ahí el contrato firmado, se ve antes.

Con el interruptor apagado, además, una copia restaurada en local no se borra sola al
levantar la app, que es justo cuando se la está mirando.

El script **ensaya por defecto**; `--borrar` hace lo mismo que la pasada y exige el
interruptor prendido (si la pasada no tiene permiso, la consola tampoco). `--hoy` sólo vale
para ensayar, y el servicio se niega a borrar con un `hoy` futuro: con el reloj adelantado
daría por terminadas cadenas vigentes.

### Cómo se borra

Una transacción por cliente. Se leen sólo metadatos (ni un binario sale de la base para
decidir, que en la instancia de 512 MB importa). Para borrar, en tandas de 500: se toman
las filas con `SELECT … FOR UPDATE` (en Postgres; en SQLite no existe), se suelta el
montaje (`file_id = NULL`, antes del DELETE: la clave foránea no tiene regla de borrado y
Postgres no deja borrar el archivo con el montaje apuntándole), y `DELETE … RETURNING id,
size` en bloque. **Lo que se anota es lo que se borró de verdad**: si dos pasadas corren a
la vez —el hilo de arranque y la llamada de una prueba, o la instancia vieja y la nueva
durante un despliegue—, la segunda espera, no encuentra nada y no anota. Si se borró algo,
queda UNA línea en la bitácora, `archivo.vencido` («Fotos y planometrías vencidas,
borradas»), con autor «sistema · desconocida» y detalle `2 fotos de montaje · 1
planometría · 1,5 MB liberados para lo que se suba · contratos terminados hasta el
2026-10-04`, sin nombres de proveedor. No termina en `.baja` a propósito: es una tarea
esperada, y la pantalla pinta de rojo lo que termina así.

En `_run_lease_maintenance` la limpieza va después de vencimientos, recordatorios y purga,
**cada bloque con su try**: un correo caído no la frena, y una limpieza que falla (con su
rollback) no deja sin recordatorios a nadie. `sesion_de` entró al try: un cliente cuya base
ni abre no corta el recorrido.

### Lo que se va a ver, y lo que no

**El disco de Render no va a bajar de golpe.** Medido en un Postgres 16 descartable: el
`bytea` va a la tabla TOAST, el DELETE no la achica, el autovacuum la limpia en un minuto
y ese espacio lo reusa lo que se suba después. La base deja de crecer, pero
`pg_database_size` sólo baja por la cola del archivo. No se hace `VACUUM FULL` (bloquea la
tabla y la reescribe). Por eso la línea de la bitácora dice «liberados para lo que se
suba» y no «liberados».

En pantalla casi nada cambia, porque lo que se borra ya no se mostraba: la planometría de
un contrato terminado no sale en ninguna pantalla, la cámara de «No se pudo montar» ya
dependía de `file_id`, las listas de archivos muestran lo que hay y el 3D lee sólo
`space_faces`. Lo único que mentía era el enlace de montaje, que decía «La foto quedó
guardada como prueba» para un reporte cuya foto ya no está; ahora lo dice sólo con
`file_id`, y sin foto dice «Quedó registrado como montado. La foto ya no está guardada.»
**sin la causa**: un admin también puede borrar la foto con el contrato en curso para que
la repitan, y «se borra cuando el contrato termina» sería falso. El texto lo elige
`textoDelReporte` (`utils/montajeDelContrato.ts`), que `probar-montajes.mjs` prueba con y
sin foto (la regex sobre el fuente que había antes pasaba con la condición invertida).

### La primera pasada

Al prender el interruptor, la primera pasada (al reiniciar el servicio) borra en cada
cliente activo todo lo de las cadenas con fin hasta hoy − 6: los contratos de agosto y
septiembre que no se renovaron, sus planometrías (cada copia de un contrato por lote por
separado) y lo que haya de prueba con fechas pasadas. Las fotos y las planometrías existen
desde el 2026-08-29, así que el acumulado es de semanas. El número exacto sólo lo da el
ensayo contra una copia.

### Lo que se acepta, escrito

* **Una renovación cargada después del sexto día llega tarde**: las fotos ya no están, y
  es irreversible por diseño. Que se guarde justo entre la lectura y el commit de una
  pasada es una carrera que se acepta.
* **Restaurar una copia vieja** trae de vuelta lo borrado; la pasada siguiente lo vuelve a
  borrar si la cadena sigue terminada.
* **Los clientes archivados no se recorren** (`listar()` los deja afuera): sus fotos
  quedan hasta que se reactiven.
* **No hay freno por reclamo abierto.** Si un proveedor discute el último período, la foto
  se va igual a los cinco días. El freno que hay es global: apagar el interruptor. Uno por
  espacio (una clave en `app_config` con los códigos en disputa, y un botón) queda como
  pendiente si la dueña lo pide.
* **Se descartó** que la cadena viva reclame desde 30 días antes de su arranque (para
  cubrir un «no se pudo» reportado muy temprano por el tablero): con contratos mensuales
  seguidos, cada contrato retendría el último mes del anterior, y según la regla del propio
  sistema (`montajeDelContrato.ts`) un reporte de antes de la víspera no es del contrato que
  entra.

### Cómo se comprobó

`tests/test_fotos_vencidas.py`: la regla pura (la gracia con el ejemplo de la dueña, la
renovación contigua y con hueco, el proveedor escrito distinto —con los pares de la
revisión adversarial: «3M», «P&G», «Kellogg's», «Hershey's», «BIC»—, el correo y la marca,
el cancelado superpuesto, el relevo, el reporte adelantado, la foto huérfana y sus cinco
días, los bordes a medianoche de Colombia con la hora sin huso de SQLite, el contrato por
lote, cada motivo de duda, las fechas extremas), y contra la base: lo que se borra y lo que
no, el montaje que queda sin foto, la bitácora, la idempotencia, el ensayo que no escribe,
el interruptor, la fecha futura, el cancelado con fin futuro, la renovación tardía, el
contrato que vive en el plano (también con otro contrato futuro en la base, y la copia
exacta que no bloquea), la API después del borrado, el quinto y el sexto día de Colombia de
punta a punta con el reloj movido, la línea del ensayo en el log tal como queda bajo
uvicorn (su `LOGGING_CONFIG`, el raíz sin handlers), y el aislamiento entre clientes (la
limpieza que falla, los vencimientos que fallan —también con una falla de la BASE, un flush
que viola una restricción, que sin el rollback entre los dos bloques tumba la limpieza—, la
base rota). `tests/test_bulk_leases.py` prueba que la planilla reusa «BIC» para una fila
«Bic» y le manda la constancia. 17 mutaciones del servicio y del ciclo, todas
detectadas, restauradas con `cp`. `probar-montajes.mjs` vigila la víspera importada y el
texto del enlace (2 mutaciones más). La revisión adversarial sumó 19 mutaciones más
—11 del servicio (los nombres, el contrato del plano, las huérfanas), 2 de la planilla, 2
del log del ciclo, 1 del rollback entre bloques y 3 del texto del enlace—, todas detectadas
y restauradas con `cp`. Y contra un Postgres 16 descartable (apagado y borrado
al terminar): sin el UPDATE previo el DELETE da `ForeignKeyViolation`; con él, el escenario
completo pasa con la cara intacta, y dos pasadas a la vez sobre 40 espacios borran 80 fotos
entre las dos y dejan una sola línea.

---

## Backlog

0. **El plano es una COPIA, y puede mentir** — ✅ **CERRADO** (2026-09-15).
   Era el punto más viejo del backlog y el de más consecuencias: la
   disponibilidad que pintaba el mapa salía de los campos comerciales del JSON
   del layout, una copia que mantenía al día el navegador que vendía. Los dos
   caminos de la UI estaban parcheados; todo lo demás no —un contrato creado
   desde otra sesión, un arreglo a mano, un `PUT /layout` de otra pestaña que
   pisa el parche, o el más probable: un `confirmarLote` que salió bien y cuyo
   push del layout, con 1.200 ms de debounce, no llegó a salir—.

   Reproducido en su momento: contrato del 8 de septiembre al 8 de octubre en la
   base, y el plano pintando el mueble **libre todo el periodo**.

   La Fase 17 lo mitigó preguntándole a `/leases/bulk/validar`, pero el mapa
   seguía pintando con la copia. **Ya no hay copia**: lo comercial vive sólo en
   `spaces`/`space_leases` y el navegador lo fusiona al leer. Ver *Una sola
   verdad para lo comercial*. Con eso caen también las dos vías que quedaban
   anotadas —el debounce de 1200 ms y el `pushSede` que se salta una sede en
   conflicto—: las dos dejaban la base adelante del plano, y ahora no hay nada
   del plano que pueda quedar atrás.

   Lo que sigue valiendo del arreglo de la Fase 17: **el bloqueo del contrato no
   puede colgar del mapa**, ahora por otra razón — el mapa dice el HOY y el
   contrato es un RANGO. Un mueble libre hoy puede estar comprometido en
   diciembre. Por eso `/leases/bulk/validar` se queda.

1. **Histórico por espacio**. Es además prerrequisito de la tarifa de referencia: no hay
   tarifario público de exhibición en Colombia (los acuerdos son confidenciales), así que
   la única referencia calibrable es "a cuánto se cerró este mueble en esta sede antes".

Hecho en agosto 2026: tarifa de referencia por tipo y sede, disponibilidad por fechas,
calendario por temporada sobre el mapa, correos por rol y confirmación de montaje desde
el celular — ver "Qué está hecho". En septiembre: el botón de renovar y los recordatorios
de vencimiento arreglados — ver "Renovar".

No perseguir: pantallas digitales, sensores de impresiones, compra programática,
reconocimiento de imagen para auditar anaquel, y scorings de "tienda perfecta". Los tres
primeros porque el in-store retail media no llega al 1 % del gasto de retail media ni
siquiera para las cadenas grandes; el cuarto porque a tres tiendas gana un humano mirando;
el quinto porque mide la salud de la marca del proveedor, que no es trabajo del retailer.

### Sobre las cifras que solían estar acá

Este documento afirmaba que las puntas de góndola ocupan menos del 5 % del piso y mueven
el 30 % de las ventas de la categoría, con aumentos de 150–400 %. Se verificaron una por
una y **ninguna se sostiene**: el "30 %" se rastrea hasta un artículo de opinión que cita
un libro comercial sin metodología, el "5 % del piso" no aparece en ninguna fuente, y el
rango "150–400 %" sale de un blog de software que lo atribuye a *"industry data"*.

Lo que sí está medido (Nakamura et al., *Social Science & Medicine* 108, 2014, acceso
abierto): aislando la ubicación del descuento, el efecto de una punta va de **+23 % a
+114 %** según la categoría — y entre la mitad y dos tercios de la diferencia bruta que se
ve no es la ubicación sino el descuento y los facings extra que la acompañan. El gobierno
británico, con miles de millones de libras en juego, usó **55 %**.

Nada de esto cambia el backlog, que se justifica solo con inventario escaso y contratado.
Pero sirve en una negociación: si un proveedor llega con que la punta le multiplica las
ventas por cuatro, el número honesto es otro.

---

## La identidad, elegida en vez de heredada

Toda la paleta salía de los valores por defecto de Tailwind: `#7C3AED` era
`violet-500` sin tocar, los semánticos eran `green-700`, `amber-700` y
`red-700`, y el fondo `#F8F6F1` es el crema de la mitad de lo generado por IA.
La tipografía era **Geist**, que junto con Inter es la fuente por defecto de
los productos de IA de estos años. No estaba mal combinado: **no estaba
elegido**, y por eso se leía como plantilla.

Nada de lo nuevo salió de mi criterio. Cada valor tiene procedencia:

| Qué | De dónde |
|---|---|
| Tipografía **IBM Plex Sans / Mono** | `ui-ux-pro-max`, primer resultado de `--domain typography` para «professional data dense financial»: *financial, trustworthy, banking, enterprise* |
| Acento **`#00004D`** | Tema «Morgen Capital» de 21st.dev (`get_theme`, gratis) |
| Neutros fríos, acromáticos | Tema «PayMongo» de 21st.dev — su modo claro lleva croma 0 en todos los grises |
| Pastilla de estado con **fondo tintado + borde** | Componente «Leads Data Table» de 21st.dev (`get_component`) |

### Lo que enseñó el componente real

Mis propuestas anteriores eran **planas y tipográficas**; un tablero comercial
que se ve caro es **estratificado**. La diferencia concreta, sacada de leer el
código de un componente publicado:

- Cada estado lleva **terna**: tinta, fondo tintado y borde. No fondo solo.
- El borde es lo que le da canto a la pastilla y evita que se disuelva en la fila.

Eso destapó un defecto de información que llevaba tiempo ahí: `STATUS_META`
declaraba un campo `fill` que **no consumía nadie**, así que las ocho pastillas
de estado salían del mismo violeta y lo único que las distinguía era un punto
de 6 px. Un «Vencido» y un «Activo» se veían iguales de reojo — que es
exactamente como se mira una tabla de 126 filas.

### Detalles

- `tnum` y `font-variant-numeric: tabular-nums` van en el `body`, no sueltos:
  la mitad de lo que se lee acá son códigos, fechas y plata en columna, y con
  cifras proporcionales las columnas bailan al cambiar de valor.
- Las sombras pasaron de `rgba(31,27,18,…)` —marrón— a `rgba(11,18,32,…)`.
  Una sombra cálida bajo una superficie fría se ve sucia.
- El cajón oscuro también se enfrió, para que no convivan un gris cálido y uno
  frío en la misma pantalla.
- **La paleta del 3D no se tocó.** Los grises del acero, la madera del cajón y
  el piso de baldosa son mundo físico, no cromo: tienen que seguir
  pareciéndose a una tienda.
- **El semáforo conserva su significado.** Verde se puede vender, ámbar
  comprometido, rojo ocupado. Se recalibraron los valores para el papel frío;
  la convención no se movió.

---

## El sistema se llama RECABRA

Se llamaba **Galerías**, que es el nombre del cliente. Un sistema no puede
llevar el nombre de uno de sus clientes: el día que entre la segunda cadena,
el producto queda con la marca del competidor en la barra.

El nombre nuevo es **RECABRA**. Lo puso el dueño del producto. Queda dicho de
una vez lo único que hay que saber: la sílaba tónica es re-**CA**-bra, y
alguien va a hacer el chiste.

También se descartó **SIRESA** (*Sistema Retail Espacios Adicionales*), que era
la primera idea. La razón no fue de gusto: [Siesa](https://www.siesa.com/) es el
ERP líder de Colombia — 45 años, más de 10.000 clientes en Colombia, Perú,
Ecuador y México — y una cadena de supermercados colombiana probablemente ya lo
tiene instalado. Una letra de diferencia, mismo país, mismo comprador.

### Dónde estaba el nombre

Fue superficial, y conviene que siga así:

| Archivo | Qué |
|---|---|
| `frontend/index.html` | `<title>` — la pestaña |
| `frontend/src/pages/Dashboard.tsx` | la marca en la barra |
| `frontend/src/pages/Login.tsx` | la marca en el ingreso |
| `frontend/src/utils/planilla.ts` | nombre del Excel exportado |
| `backend/app/main.py` | título de la API y `/api/health` |
| `backend/app/services/mailer.py` | `MAIL_FROM_NAME` y el pie de los correos |
| `backend/app/routers/bulk_leases.py`, `notifications.py` | texto de los correos |

De paso salieron dos `#7C3AED` **hardcodeados** en plantillas de correo
(`bulk_leases.py`, `spaces.py`): el violeta viejo, que ya no existía en ningún
token. Quedaron en el acento nuevo. Los correos no pasan por Tailwind, así que
un cambio de paleta no los alcanza — cada vez que se toque la identidad hay que
revisarlos a mano.

### Lo que NO se tocó, a propósito

`backend/app/auth.py` tenía `"worker_password": "galerias"` como valor por
defecto, y `routers/auth.py` lo leía con `get_config(db, "worker_password",
"galerias")`. **Era la contraseña viva de los mercaderistas** si nadie la
cambió desde configuración, así que en el cambio de identidad no se tocó:
borrar ese default dejaba a la gente afuera de un día para otro.

*Actualización (fase 2 de seguridad, más abajo).* El default salió del código
—era la misma clave para todos los supermercados que instalen esto— pero la
contraseña **viva no cambió**: la que esté en la base sigue funcionando y se
convierte sola a Argon2 en el primer ingreso. Se cambia desde la pantalla de
configuración, no desde el código, y conviene hacerlo avisando.

---

## La línea visual: Empresarial

> **Arqueología (agosto 2026).** Esta sección y la que la precede cuentan de
> dónde salieron IBM Plex Sans, el acento azul y los neutros cálidos. **Ninguno
> de los tres sigue vigente**: el sistema actual es Chivo + Archivo Narrow sobre
> papel frío, y está descrito en «Paleta y tipografía» al principio de este
> documento. Se conserva porque explica el PORQUÉ de decisiones que todavía
> están en pie —dos radios y no seis, sin sombras ambientales, el acento en
> tinta para que el color quede sólo para el estado— y porque saber qué se
> probó y por qué se descartó vale más que el valor final. Ante cualquier
> contradicción, manda «Paleta y tipografía».


> **Esta sección quedó atrás.** Describe la dirección elegida en agosto de 2026,
> que es la que después recibió la devolución de que «se ve hecho con IA». La
> dirección vigente está más abajo, en «Rediseño de la pantalla principal»: la
> elegida es **q1 con injertos de q3**, maquetada en `docs/maquetas/`. Esta
> sección se reescribe cuando el rediseño baje al código; hasta entonces sigue
> describiendo lo que hay implementado hoy.

De seis líneas armadas en el prototipo, la elegida fue **Empresarial**.

| Token | Antes | Ahora |
|---|---|---|
| `--font-sans` | IBM Plex Sans | **Plus Jakarta Sans** |
| `--font-mono` | IBM Plex Mono | IBM Plex Mono *(sin cambio)* |
| `--accent` | `#00004D` navy | **`#0369A1`** azul de oficina |
| `--bg` | `#F2F4F7` | `#F8FAFC` |
| `--ink-1` | `#0B1220` | `#020617` |
| `--success` / `--warning` / `--danger` | `#0F7B4F` / `#9A6B0E` / `#C0392E` | `#15803D` / `#B45309` / `#DC2626` |
| Sombras | `rgba(11,18,32,…)` | `rgba(2,6,23,…)` |

**Una diferencia deliberada con el prototipo.** La línea Empresarial usaba
*una sola familia* — Plus Jakarta Sans también para el mono. Acá se mantuvo
IBM Plex Mono, porque `var(--font-mono)` está aplicado a los chips de código
(`ALF-GON-21`), a los ids de zona y a los inputs de tarifa, y ahí una retícula
fija sí paga. Además desde este contenedor no se puede verificar si Plus
Jakarta trae cifras tabulares, y si no las trae las columnas bailan — que es
justo lo que el `tnum` del `body` está ahí para evitar. Si se quiere una sola
familia, es cambiar un token.

**La marca en caps quiere tracking positivo.** `RECABRA` iba a heredar el
`letter-spacing: -0.015em` del nombre anterior, que está calculado para
minúsculas. En versales apretadas se lee como un error de impresión. Quedó en
`+0.055em` con peso 800.

---

## Fase 10 — El estilo de la landing adentro del sistema

**Decisión del dueño (2026-09-06).** «La landing quedó mejor que el diseño del
sistema; quiero aplicar el mismo estilo adentro.» Con tres respuestas: **claro
por defecto** (el oscuro a un clic), **amarillo solo en el botón principal** de
cada pantalla, y **arrancar por los tokens** (PR 1), después Vender con la
maqueta q1 (PR 2), después el resto (PR 3). Spec en
`features/diseno-interior/spec.md`; entregables en `outputs/` (tema.md con la
tabla token viejo → nuevo, frontend.md, auditor.md, verificacion.md y 61
capturas antes/después).

**Esto REVOCA la regla 4 del «Rediseño de la pantalla principal»** («nada de
ámbar, oro ni ocre, y nada de fondos oscuros»): el amarillo `--signal`
(`#FFD028`, botón `#F2B300` con borde `#A87C00`) entra acotado al botón
principal, uno por pantalla, y el oscuro entra como modo opcional que nunca es
el de arranque. Las otras tres reglas (la forma la manda el dato; pulcro;
cerrar trato y revisar cada uno en su modo) siguen vigentes y son el PR 2.

### PR 1 — un solo sistema de tokens (`frontend/src/tema.css`)

- **Tres capas**: primitivos de E (`--n-*`, `--p-*`, `--y-*`, `--st-*`),
  semánticos claro en `:root` y oscuro en `html[data-tema="oscuro"]`, y los
  DOS juegos de nombres (los viejos `--bg`, `--surface*`, `--line*`,
  `--ink-1..4`, `--accent*`, `--libre/--entra/--ocupado` + `-suave`/`-borde`/
  `-txt`, y los de E `--signal`, `--panel`, `--brd`, `--fg*`, `--t-*`, `--s*`,
  `--r-*`, `--sh-*`) apuntando al mismo valor. `index.css` quedó como capa 3
  (`.rotulo`, `.fig`, `.codigo`, `.btn-principal`, la regla del modal, los
  `--con-*` de la consola colgados del mismo interruptor).
- **Tailwind consume los tokens por canales** `rgb(var(--x-rgb) / <alpha-value>)`
  en vez de hex literales: la razón escrita en `tailwind.config.js`
  («`bg-accent/20` necesita un color legible») se respeta y sigue funcionando,
  y la consecuencia «si tocás uno, tocá los dos» se cae a propósito, porque un
  hex congelado no se entera del modo. `darkMode: ["selector",
  '[data-tema="oscuro"]']`. `probar:tema` compara config y tema.css token por
  token (por color resuelto) y falla si vuelve un hex ciego al modo.
- **Tipografía de E**: pilas de sistema (`--f-display` 800, `--f-text`,
  `--f-mono` con `tabular-nums`). Se fueron Chivo y Archivo Narrow y con ellas
  el `<link>` a Google Fonts: **cero orígenes externos en el dist**. Las dos
  razones escritas en `index.css` quedaron contestadas en `outputs/tema.md`
  §3: el total del contrato es una CIFRA y va en `.fig` (mono + tabular +
  700), no en un 900 de foundry; y la condensada hacía tres trabajos que ahora
  se reparten (cifras → mono; rótulos en versalita → texto 600, NO mono, que a
  9,5 px es ~18 % más ancho; códigos → mono con la columna en `ch`).
- **Toggle** sol/luna (`src/tema.tsx`): llave `recabra-tema`, claro por
  defecto, sin leer `prefers-color-scheme`, `useSyncExternalStore` sobre
  `html[data-tema]`. La consola de plataforma perdió su interruptor propio
  (`recabra-consola-tema` ya no existe: quien lo tenía abre en claro una vez).
- **Amarillo, uno por pantalla** (`.btn-principal`): Login (cuatro pasos
  excluyentes + el aviso de política), Vender «Guardar contrato y avisar»,
  Montaje «Confirmar», Reporte «Descargar JSON», Detalle «Reporte de
  transparencia», modales Carga masiva / Consentimiento / Catálogo de artes.
  Sin amarillo, con razón escrita: Supervisar (lectura), Montajes, Plataforma
  (los «Guardar» de fila siguen en `--con-accent`), Política, Configuración,
  Tarifas (no tiene Guardar: guarda con debounce). **Regla nueva**: con un
  modal abierto (`useModalAbierto()` → `html[data-modal-abierto]`), el botón
  principal de atrás pasa a tinta para que nunca haya dos amarillos.
  El «acceso anterior» del Login quedó en **tinta**: convive en la misma
  tarjeta con el ingreso por correo y el verificador midió los dos encendidos.
- **Barrido**: 259 clases literales de Tailwind fuera de la landing → 0, y
  cuatro copias a mano de la terna de estado (DashboardView, FloorPlan2D donde
  «ocupado» era violeta, `zones.ts`, y varios chips) → tokens. El editor 3D va
  en `[data-cajon-oscuro]`, que invierte los tokens adentro en vez de tocar
  sus ~35 `bg-accent`. **No tokenizar nunca**: los ~170 hex de materiales del
  editor 3D (son objetos físicos en una escena) ni `utils/propuesta.ts` (la
  lámina que se manda al proveedor es papel: blanca aunque el vendedor tenga
  el oscuro).
- **Contraste**: tres hex de tema.md corregidos con la medición (`--ink-3`
  claro `#54646E`, oscuro `#788A94`; `--signal-borde` `#A87C00`); `--ink-4`
  subió a `#68788A` / `#6E8190` porque SÍ se usa como texto («Administrador»,
  «sin tarifa», códigos a 10 px) y daba 3,6:1; `--brd-control` (sigue a
  `--ink-4`) para el borde de campos y selectores, que con `--line` daba
  1,35:1. Los `-borde` de estado NO dan contorno (1,3–1,8:1): el refuerzo del
  estado es la palabra al lado, que es regla dura; no el borde.

### El ingreso adentro de la landing

«Crear mi cuenta» y «Ya tengo cuenta» ya **no saltan a `/login`** (dueño,
2026-09-06: «la idea era poder ingresar ahí de una vez», y después: «¿tiene que
ser encima? ¿no hay manera de que convivan?»). Conviven: el formulario entra
**en la tarjeta del hero, al lado del plano, que sigue vivo** (se arrastra, se
acerca, se toca). La portada dispara `recabra:ingresar` (con `registro` o
`login`); `App.tsx` arma `components/IngresoPortada.tsx` y se lo pasa a
`<Landing ingreso={…}>`, que lo pone en lugar del texto del hero y sube la
página hasta ahí (el pedido puede venir del pie). Adentro va el `Login` de
siempre, perezoso, con `enHoja` (sin pantalla completa ni tarjeta) y
`modoInicial`. «← Volver a la portada» y Escape devuelven el texto.
Mientras está abierto, el `<html>` toma el tema de la landing (oscuro salvo
que la portada esté en claro) para que los tokens de :root del formulario
pinten a juego; al cerrar vuelve el del interior. El `href` a `/login` queda
de respaldo (clic con modificadores, sin JS), y `/login` sigue existiendo para
la invitación, los enlaces guardados y el 401.

**Frontera intacta:** la landing sigue sin importar sesión ni API (recibe el
formulario armado por `App.tsx` como `ReactNode`; no sabe qué es).
`test_landing_ataques.py` definía el «núcleo» de la landing como *todo archivo
nuevo de la rama bajo `frontend/src`* (muleta de la construcción de la Fase 9):
con la Fase 10 eso metía `tema.css` y el ingreso adentro del núcleo. Ahora el
núcleo es lo que se llama «landing» (`pages/Landing/`), que es lo que es.

**Gotchas del formulario adentro de `.lp`:** (1) los resets de la landing
(`.lp a`, `.lp button`) no entran en `.card--ingreso`, con `:not(:where(…))`
para no subir la especificidad (sin `:where` el reset le ganaba a `.lp .tool`
y a `.lp .btn` y les borraba el borde); (2) `.lp .rotulo` pasó a
`.lp .hud .rotulo`: le estaba aplicando el pill flotante del plano al
«Acceso anterior» del formulario; (3) con el ingreso abierto
(`.lp[data-ingreso="1"]`) el HUD del plano baja de z-index, porque en el
celular la tarjeta pasa por debajo y el HUD le robaba los toques.

### Gotchas de la Fase 10

- **La terna oscura de estados reprueba la banda de claridad de `dataviz`**
  (`validate_palette.js --mode dark` sale con exit 1 por luminosidad, no por
  separación). Se aceptó a propósito: son los hex de E validados en la landing
  y la separación entre pares pasa; el detalle está en el encabezado de
  `tema.css`.
- **La condensada vs la mono.** Los códigos `GON-140·A` pasan de 69 a 82 px.
  La columna de código de Supervisar pasó de `width: 56` (que ENVOLVÍA en dos
  renglones 3 de 9 filas: bug preexistente) a `min-width: 9ch`, y quedó en un
  renglón. Pero el **rótulo sobre el mueble del plano isométrico** se desborda
  7,6 px en los códigos de 7 caracteres (antes 0,8): no es recorte ni choca
  con otro rótulo, pero el margen se consumió. Es forma → PR 2.
- **El plano isométrico memoiza la escena** (`IsoMap`, `useMemo`) y pinta con
  `temaActual()` adentro: el tema tiene que ser dependencia o el sol/luna deja
  la terna vieja hasta recargar.
- **Sin navegador en el sandbox de los agentes**: el frontend no pudo mirar
  ninguna pantalla; el verificador sí (Chromium de Playwright preinstalado) y
  además tuvo que servir Chivo/Archivo Narrow por `page.route` para que el
  ANTES no midiera con la fuente de respaldo. Y las pilas de sistema resuelven
  a Liberation/DejaVu en Linux: en macOS la mono es más angosta, en Windows
  más ancha.

### Pendientes para el PR 2 (Vender) y el PR 3

**Cerrados por el PR 2** (Vender con la forma de D — más abajo):

- ~~Rótulo del mueble en el plano isométrico (desborde de 7,6 px)~~. El rótulo
  se rehizo entero: dos `<tspan>`, halo por `paint-order` (sin caja de ancho
  fijo, que era lo que desbordaba), cuerpo **constante en pantalla**
  (`--lbl` = 10,5 px ÷ escala) y un deschocador que calcula en vez de medir el
  DOM. Medido: **0 choques y 0 textos cortados** a 1× / 1,56× / 1,95× y en 27
  encuadres de rueda, en los dos modos. `EXH-CENTRAL` en el **FloorMap** sigue
  pendiente: ese es otro componente y no entra en Vender.
- ~~`DISPLAY_TOP` del plano: siete clases sobre cuatro colores validados~~.
  Resuelto por las dos puntas: **del plano se borró** (el mapa siempre tiene
  periodo, así que `topColorFor()` era código muerto y ahora pinta siempre la
  terna validada `RANGE_TOP`) y **de la tabla y el popover se quedó, pero sobre
  los cuatro colores validados**: se fueron los dos tintes al 60 % que nadie
  había validado. Cuatro de los siete estados comparten color y cada uno va con
  su palabra al lado, que es la regla del sistema. El porqué está escrito en
  `DashboardView.tsx`, sobre `ESTADO_CLARO`.
- ~~Escala tipográfica~~. Los ocho pasos `--t-*` pasaron a los valores de D
  (10 · 11,5 · 12,5 · 13,5 · 15 · 17,5 · 21 · 30). En Vender se renderizan
  **nueve cuerpos y ninguno más**: los ocho pasos más el rótulo constante del
  plano.
- ~~`StoreView.tsx` y `Legend.tsx`~~: borrados.

**Siguen abiertos:**

- `--s5/--s6` (24/32) vs Tailwind `p-5/p-6` (20/24): conviven a propósito.
  Vender ya no depende de eso —su composición es una rejilla propia— pero el
  desfase sigue.
- `EXH-CENTRAL` en el FloorMap se desborda de su caja en las dos versiones.
- El «Guardar» del plano en el Editor 3D quedó en tinta y el del modal de artes
  en amarillo: probablemente al revés; decisión del dueño.
- Paletas categóricas por TIPO de mueble (`FloorPlan2D`, `fixtureStore`,
  `zones.ts`): a ojo, sin validar; y el color de cada mueble queda GUARDADO en
  datos, así que moverlas toca datos.
- `--con-*` de la consola de plataforma reprueban contraste en los dos modos
  (`#8E979B` sobre blanco 2,98:1 ×33 nodos): preexistente, PR 3.
- **Las dos barras.** Vender tiene encima la barra de la aplicación (51 px,
  compartida con Montajes / Plano / Editor 3D) **y** la de la pantalla (40 px
  apretada). D tenía una sola —su rail ERA la barra—, así que la hoja del
  sistema arranca con ~43 px menos de alto que la que aprobó el dueño. Eso
  corre dos umbrales: la válvula de la ficha del contrato se abre en el tercer
  espacio a 1440×800 en vez del cuarto, y por debajo de 790 px de alto la
  pantalla rueda (en D era 760). Fusionar las dos barras es PR 3.

### PR 2 — Vender con la forma de D

La opción elegida por el dueño es **D · «La fusión»**
(`features/diseno-interior/outputs/vender/opciones/D-fusion/`), y el port está
en `features/diseno-interior/outputs/vender/port-frontend.md`: qué se portó tal
cual, qué se adaptó a los datos reales y las mediciones.

Lo que hay que saber para no deshacerlo sin querer:

- **La hoja.** `/` en modo Vender es una rejilla de cuatro paneles numerados
  (`01` plano · `02` escalera · `03` contrato · `04` tarifa) que llena la
  ventana, con un piso por fila (`--fila1` / `--fila2`), un apretón bajo 880 px
  de alto y scroll normal bajo 790. **No hay scroll de documento y no hay nada
  escondido adentro de un panel**; la única válvula declarada es la ficha del
  contrato, que rueda —con su barra a la vista— del cuarto espacio en adelante
  en 1440×900. Todo cuelga de `.vender` en `src/vender.css`: Supervisar,
  Montaje y el editor 3D no ven una sola de esas reglas.
- **El rótulo del plano no se mide con `getBoundingClientRect` en el mismo
  paso.** `acomodar()` es aritmética pura sobre un tamaño medido UNA vez
  (`calibrar()`, en el segundo cuadro y repetido hasta que dos pasadas
  coinciden) y sobre la cámara recién escrita. Si alguien lo «optimiza»
  midiendo el DOM ahí, vuelven los choques a 0,8× y a 2,4×. La cámara
  (`zoom`, `T`) tampoco es estado de React.
- **El resaltado es una sola función** (`destacar`), imperativa: apaga la sala
  al 20 % por CSS y enciende con `classList`. Con estado de React, pasar el
  mouse por una fila de la tarifa repintaría 106 prismas por cada píxel.
- **Los conteos se derivan.** La clave del plano, la columna «Libres · entran»
  y el pie de la tarifa son la misma cuenta mirada tres veces, y descuentan lo
  que ya entró al contrato. Ningún número escrito a mano.

## Ver el diseño desde Vender (2026-10-12)

El pedido de la dueña, después de ver el 3D realista: «para que sea realmente útil debe
estar la opción de ver el diseño desde el módulo de Vender cuando se toca la cara del
mueble a vender». Antes, para mostrarle al proveedor cómo queda su producto había que ir
a la pestaña Editor 3D, y **cambiar de pestaña desmonta Vender**: se perdía el contrato a
medio llenar. Ella le muestra la pantalla de SU PC al proveedor, en persona o por
videollamada.

**Cómo se usa.** La cabecera del panel «03 Contrato» trae, junto a «sin firmar», un
botón chico con un cubo y «Ver en 3D», en letra de texto sobre el gris del papel (`--bg`)
para que no se confunda con la píldora «SIN FIRMAR»; nunca amarillo. Aparece cuando se
toca la primera cara en el plano —con una sola cara, la ficha suma «Tocá Ver en 3D para
mostrarle cómo queda» hasta que se abre una vez— y abre **la última cara tocada** (las
demás, desde la chapa del visor). Si la última no se puede mostrar (tomada en estas
fechas, o la exhibición, que no tiene 3D), el botón dice cuál abre en su lugar («Ver
PUN-03 en 3D»); si no se puede mostrar ninguna, queda apagado (`aria-disabled`, para que
se vea el `title`) y el `title` dice por qué. Al tocarlo la pantalla pasa a pantalla completa y se abre el
visor **encima de la ficha**: la sala de venta de «Presentar» (cielo raso, luminarias,
baldosa), la cámara «De frente» a ESA cara a la altura de un comprador y la persona de
1,70 m al lado. Arriba a la izquierda la chapa («PUN-03 · Punta de góndola») con las
otras caras del contrato para saltar; arriba a la derecha «Volver al contrato». A la
derecha, el cajón «Productos de Alpina» (el nombre sale del campo Proveedor del
contrato), con un buscador si hay más de cuatro. Tocar un producto lo prueba en la cara
y se vuelve a encuadrar; debajo, «Cómo va» —el mismo panel del editor: toda la cara o por
entrepaño con los cm libres y «vendido» sin nombre, el surtido, acostada, el copete, las
rejillas de la nevera, las medidas y «Entran N por entrepaño»—. Abajo flota el HUD de
Presentar, que se esconde a los 2 s junto con el cursor: De frente · Tres cuartos · De
cerca (siempre, también sin producto) | Hoy · Con Alpina (con un producto a la vista) |
Producto | Pantalla completa (si se perdió). El primer Esc suelta la pantalla completa; el
segundo, o «Volver al contrato», cierra. La ficha queda exactamente como estaba y el foco
vuelve a «Ver en 3D». Debajo de «Cómo va», **«Para llevarse»**: «Bajar la propuesta» (la
lámina del editor) y «Usarla como planometría» (la deja adjunta en el contrato). Si el
contrato ya tiene una, lo dice antes de reemplazarla: «la lámina de PUN-03 con Alpina», o
«un archivo adjunto» sin nombrarlo (el nombre lo puso la dueña y puede ser de cualquiera).
Mientras se arma (unos segundos; con SwiftShader, veinte) la pantalla queda en el cuadro
de antes y el visor queda QUIETO: ni otra cara, ni otra toma, ni «Hoy», ni otro
producto, ni otro proveedor, ni el cajón, ni la órbita. «Volver al contrato» sí, y
descarta lo armado.

Sin proveedor escrito, el cajón pregunta «¿Con qué proveedor estás armando este
contrato?» y lo que se teclea queda en el campo Proveedor de la ficha; con el nombre
puesto, en vez de la pregunta (que es para la dueña y la lee el proveedor) va una línea:
«Proveedor: Alpina · cambiar». Si con ese nombre
no hay productos dice «No encontré productos a nombre de «X»» (no «X no tiene
productos»: ver abajo) y ofrece **«Subir un producto»** (nombre, rubro, foto y la ficha
con el alto obligatorio): queda a nombre del proveedor del contrato y probado en la cara.
Si el nombre no es de nadie, pregunta antes de darlo de alta. Mientras sube, «cambiar»
queda apagado; y lo que vuelve se compara con lo vigente: si el proveedor ya es otro no
entra, si la cara es otra va a la lista sin probarse.

**Por qué es un visor propio y no el editor montado encima** (las dos opciones se
midieron contra el código, ver la spec de la tanda):

- **El editor puede DESTRUIR datos, no sólo filtrarlos.** Su efecto de sincronización
  hace `commit(fixturesToStore(placedFixtures…))` en cuanto cambian sus muebles: con
  muebles saneados adentro, una sola puerta mal cerrada subía al servidor un plano sin
  proveedor, valor ni fechas. El visor no tiene ni `commit`, ni `fixturesToStore`: lo que
  no existe no se puede llamar.
- **El visor usa la MISMA `Scene`**, exportada, con la prop `soloVenta`. Son tres
  puertas y ni una más: (a) no pide `getFaceImages()` —las fotos de las caras son las
  marcas de los que ocupan los espacios—; (b) la órbita no lee ni escribe `camera3D`
  (`onReady={soloVenta ? undefined : handleOrbitReady}`): es la cámara guardada del Editor
  3D, y escribirla en cada paso del giro además redibujaba la hoja de Vender entera
  (`DashboardView` está suscripta al store completo); (c) no atiende `enfoque3D`. Todo lo
  demás del editor ya se apaga con las props que pasa el visor: `selectedId={null}` (sin
  caja, sin gizmo, sin paneles de slot), `fixtures={[]}` (sin insignias), `privadoPara`
  definido (sin grilla, con la sala y la luz de venta), `presentationMode` (sin arrastre).
  El editor no pasa `soloVenta`: para él no cambió nada.

**Lo que el proveedor no puede ver, y cómo se garantiza:**

- **Los muebles llegan sin un dato comercial**: `sinDatosComerciales` (en
  `muebles/privacidad.ts`, puro) es una LISTA de lo que pasa —geometría, código,
  etiqueta, color, estado— y deja en blanco proveedor, rubro, valor, fechas y
  observación del mueble y de cada repisa. Un campo comercial que alguien sume mañana al
  mueble no se cuela por omisión. Con el rubro vacío el relleno de los vecinos cae al
  genérico: no se ve ni la categoría del que hoy ocupa el espacio.
- **Los muebles del contrato llegan con la cara entera a la venta** (`sinRepisasVendidas`,
  puro, en `privacidad.ts`): sus espacios internos (`slots`, sólo del layout, sin
  contrato) pasan como libres. Vender —que mira contratos— ofrece la cara entera, y el
  visor la muestra así: ni relleno de «otros» en esas repisas, ni «vendido» en «Por
  entrepaño», ni una lámina con un entrepaño del proveedor en una cara llena de ajenos.
  Los vecinos quedan como están. A la dueña se le avisa en la fila.
- **Lo ajeno, en grises** (`RellenoNeutro`, en `luzDeVenta.ts`): el visor lo pone
  alrededor de la escena, ADENTRO del lienzo (otra raíz de React), y el relleno de lo
  vendido a otros usa la paleta `neutro` en vez de la del rubro. El único color de la
  pantalla es el del proveedor que mira. El editor no lo pone: Presentar sigue con su
  paleta por rubro.
- **El catálogo se pide por el NOMBRE del proveedor del contrato**:
  `GET /api/catalogo/?proveedor=`. El servidor lo resuelve con la regla de «Guardar
  contrato» (`bulk_leases.confirmar`: sin espacios de más, sin mayúsculas, y con dos que
  sólo difieren en mayúsculas gana el más viejo), cotejando **en Python** —el `lower()` de
  SQLite sólo baja ASCII—. Con el parámetro presente la respuesta es la de ese proveedor
  o una lista vacía, **nunca el catálogo entero** (también con `?proveedor=` vacío). Sin
  el parámetro, como siempre: el Editor 3D lo sigue usando.
- **«Subir un producto» va por nombre**: `POST /api/catalogo/` acepta `proveedor` en vez
  de `supplier_id`. Si el nombre no es de nadie contesta **409 `proveedor_nuevo`** y sólo
  lo da de alta con `crear_proveedor` (la confirmación de la dueña en el visor). Todo se
  valida ANTES de tocar al proveedor; el nuevo se crea en el MISMO commit que el arte
  (un alta rechazada no deja un proveedor suelto), y después «Guardar contrato» lo
  encuentra por nombre y no crea otro. No se recorta el nombre (el contrato busca el
  entero): más de 200 caracteres es un 422.
- **`privadoPara` es siempre un número o `null`**, nunca `undefined` (que es la pantalla
  de la dueña y deja pasar las pruebas de todos): el `supplier_id` de los artes que trajo
  el servidor, o nadie.
- **Las piezas del editor que se ven en Vender** —`PanelDePrueba`, `BloqueDeRejillas`,
  `HudQueSeEsconde` y `EditorDeFicha`— pasan por las guardas de Vender (`probar-vender`,
  `PIEZAS_DEL_VISOR`), y ahí también el campo `proveedor`: el nombre que se pinta sale del
  arte que se mira.

**La prueba es de la FICHA, no del layout** (`components/Contrato/sesionDeVenta.ts`): la
misma forma que la sesión del editor (`${fixtureId}|cara` y `ComoSePrueba`), pero vive en
la ficha del contrato, así que sobrevive a abrir y cerrar el visor —al reabrir el yogur
sigue en la punta— y se olvida con ella: al guardar el contrato (la ficha se va), al
cambiar de sede (se remonta), con «Empezar de nuevo» y **al cambiar el nombre del
proveedor** (otra forma de escribir el mismo no cuenta). No escribe el plano, el store ni
el servidor. **La lámina adjunta como planometría es de la prueba** (`sesion.lamina`: el
archivo y la cara): cuando la prueba se olvida, si la planometría de la ficha sigue siendo
esa lámina, sale del contrato (`ModoVender`, el efecto sobre `sesion.lamina`) y el campo
dice «La lámina del 3D se quitó: si la querés, armala de nuevo con «Ver en 3D»», sin
nombres y sin decir por qué (la ficha la mira el proveedor; ver «la tercera crítica»).
«Empezar de nuevo» la saca él mismo y sin aviso. Un archivo que subió la dueña no se
toca. Y entra sólo si es del proveedor que el contrato tiene AHORA: la lámina se arma en
segundo plano y la ficha la rechaza si en el medio cambió (`adjuntarLamina`). El visor dibuja sólo las pruebas de las caras que siguen en el contrato
(`pruebasDelContrato`).

**Lo que hace que no se pierda nada:**

- **Es una capa, no una pestaña**: un portal en `body` montado DESDE la ficha, que sigue
  montada debajo. Nunca usa `enfoque3D`, `setSede` ni `camera3D`.
- **`inert` en `#root`** mientras está abierto: sin eso el Tab caía en los campos del
  contrato, tapados, y se escribía en ellos sin verlos. Dos centinelas devuelven el foco
  al principio o al final del visor. `useModalAbierto()` y `data-capa-modal` apagan el
  amarillo de la ficha: con el visor abierto no hay ninguno (el visor no tiene
  `.btn-principal`; «Subir» va en tinta).
- **La pantalla completa se pide en el clic** y sobre `document.documentElement`: después
  del `import` el navegador ya no la da, y el visor todavía no existe en el primer clic.
  Se suelta en `cerrar3D` y no en el desmontaje del visor (StrictMode la soltaría al
  abrir). Si Ctrl+Tab a Meet la saca, el visor sigue tapando la app y el HUD la ofrece.
- **`LimiteDelVisor`** (el único límite de errores de la app fuera del editor): si el
  archivo del visor no baja —Render redesplegó y cambió el nombre, o se cortó la red— se
  dice «No se pudo abrir el 3D. El contrato sigue como estaba: guardalo y recargá la
  página para ver el 3D», y la ficha queda intacta. Sin él, `React.lazy` desmontaba la
  aplicación entera con el contrato adentro.

**Peso.** El visor se baja recién cuando se abre (`lazy(() => import("./VisorDeVenta"))`;
sin precarga al pasar el mouse). Entrar a Vender no baja three.js ni la escena: el archivo
de Vender creció 1,5 KB gzip (209 728 → 211 237 B con el gzip de Node), el CSS de entrada
0,25 KB; el visor son 4,8 KB + 1,4 KB de CSS más el editor y three, que bajan al abrirlo.
Dos cosas que costaron y conviene no repetir: `normalizarProveedor` vive en
`utils/proveedor.ts`, que no importa nada (importada de `privacidad.ts`, el paquete de
Vender arrastraba la privacidad, los habladores y las medidas: +6 KB); y los estilos del
visor van en `components/Contrato/visor.css`, que baja con él —en `vender.css` queda sólo
la capa, «Abriendo el 3D…» y el aviso de falla, que se ven justamente cuando el visor no
bajó—.

**Límites, escritos:**

- El 3D muestra el estado de HOY de los VECINOS (lo vendido y libre de hoy), no el del
  período que se está negociando. Los muebles del contrato van con la cara entera libre.
- Envases 3D sólo en góndola, punta, nevera de refrescos y robatope
  (`TIPOS_CON_PRUEBA_3D`); en isla, batea, cruz y los demás tipos el visor no prueba
  producto: muestra el lugar («De frente» y «Tres cuartos», sin «De cerca» ni lámina) y el
  cajón lo explica. La exhibición no tiene 3D (no entra al visor).
- «Por entrepaño» es visual: el contrato de Vender es por cara.
- Cambiar de pestaña en la barra sigue perdiendo el contrato (con el visor abierto la
  barra queda tapada e `inert`).
- El cotejo del nombre del proveedor no ignora tildes ni apóstrofes («Postobon» no es
  «Postobón»): es la regla del contrato (`bulk_leases`), y cambiarla en una sola punta
  partiría al proveedor en dos. El visor lo dice y pregunta antes de dar de alta.

**Cómo se comprueba.** `probar-vender` pasa de 12 a 20 pruebas estáticas: los archivos
de la lista existen (un renombre falla), el visor ni NOMBRA un campo comercial, Vender no
pide proveedores, catálogo entero ni fotos de caras, no escribe nada, la escena va en
modo venta con los muebles saneados, el 3D entra SÓLO por el `lazy` y adentro de
`Suspense` y `LimiteDelVisor`, sin amarillo propio y con `COMPONENTES_VENDER` cotejado
contra el JSX de todos los archivos. Con `PROBAR_VENDER_URL` suma 16 de navegador sobre
la app con WebGL (SwiftShader): nada del 3D antes de abrir y el archivo de Vender ≤ 3 KB
más que la base (`PROBAR_VENDER_PESO_BASE`), ni un proveedor ajeno con el producto y
«Cómo va» a la vista, a la red sólo lo del proveedor (listas con `proveedor=` y un único
`supplier_id`, imágenes sólo suyas), la cámara del editor y el plano intactos después de
girar, el amarillo apagado y el Tab adentro, volver con el botón y con Esc sin cambiar
una coma del contrato (filas, valores, correo, nota, planometría), la sesión que se
conserva al reabrir y se va al cambiar de proveedor, el archivo del visor cortado, cinco
aperturas sin perder el contexto de WebGL y el contraste en claro y en oscuro.
`probar-muebles` suma 3 (`sinDatosComerciales` y `pruebasDelContrato` ejecutadas, y las
tres puertas de `soloVenta` en el código de la escena). `test_catalogo.py` suma 13 (el
nombre con y sin mayúsculas, «POSTOBÓN», «NEVERAS DEL ÑUÑOA», `?proveedor=` vacío,
«BIC»/«Bic», el alta por nombre que reusa, crea o falla sin dejar nada, y la cruzada con
`/leases/bulk/confirmar`). Cada guarda nueva se rompió a propósito y cayó: el catálogo
entero en el visor, los muebles sin sanear, el `supplierName` que pasa, las fotos de las
caras y la órbita sin su puerta, el `import` estático, sin `LimiteDelVisor`, un
`btn-principal` en el visor, la sesión que no se vacía y el servidor que con
`?proveedor=` vacío devuelve todo.

### 2026-10-12 (noche): lo que vio la crítica

La revisión de la primera versión encontró que el botón rompía justo la pantalla que
mira el proveedor, y cuatro cosas medias. Lo que se cambió, y por qué:

- **Un solo «Ver en 3D», en la cabecera del panel 03, y no uno por fila.** El «3D» de la
  fila le comía ~50 px a la columna del tipo: en una góndola doble (con A/B) la
  descripción quedaba en 0 px, a 1366 la fila desbordaba la tarjeta (la × 7 px afuera) y
  el aviso de choque salía con una palabra por renglón (la fila de PUN-01 medía 255 px a
  1440 y empujaba Proveedor, fechas y «Guardar» fuera del panel). Ahora abre **la última
  cara tocada** —es lo que pidió la dueña: «cuando se toca la cara»— y las demás quedan
  en la chapa del visor. Las filas volvieron a la base: × y valor en la misma columna en
  todas, sin desborde a 1366, 1440 ni 1920. El botón lleva márgenes negativos para no
  sumarle alto a la cabecera (la ficha de tres espacios sigue cerrando con 12-13 px).
- **El choque va debajo de la fila, a todo el ancho** (`.eitem` es flex con `wrap` y
  `.aviso` ocupa el 100 %): la fila con choque mide 76 px a 1440 y 72 a 1366.
- **Las caras que chocan no van al visor** (`carasDelVisor` filtra
  `disponibilidad === "libre"` y sin `choqueServidor`): no se le muestra al proveedor un
  espacio que no se le puede vender, y «Ver en 3D» nunca abre una de ésas.
- **Las repisas vendidas aparte ya no se le dicen al proveedor.** Los `slots` del layout
  (la única fuente de esos espacios internos, sin contrato en la base) marcaban vendidos
  5 entrepaños de GON-02·B, y «Cómo va» decía «Esta cara tiene 5 entrepaños vendidos: la
  prueba los tapa» mientras el plano de Vender —que mira contratos— ofrecía la cara
  libre entera. `PanelDePrueba` recibe `paraElProveedor` en el visor: sin ese aviso, y la
  marca «vendido» de «Por entrepaño» en tinta y no en naranja. **A la dueña se le avisa
  en la fila**, debajo del código y sin que la fila crezca: «3 repisas vendidas», con el
  texto entero en el `title`. No bloquea el guardado: el servidor no las conoce. (El
  13-10 se fue más lejos: el visor ya no las dibuja ni las marca —`sinRepisasVendidas`— y
  la fila dice «3 internos vendidos»; ver «la segunda crítica».)
- **«Para llevarse», en el cajón del visor:** «Bajar la propuesta» arma la misma lámina
  del editor (`componerPropuesta`: «Hoy», «Con …» y «De cerca» desde las tomas de venta)
  con la escena ya privada; el pie va con el proveedor y el producto del arte, el mueble
  por su TIPO (no por su rótulo, texto libre) y **sin período ni valor**, que el visor no
  conoce y que todavía no están acordados. «Usarla como planometría» la pasa a JPG (la
  planometría viaja por correo y tiene tope de 10 MB) y la escribe en el campo de
  planometría de la FICHA (`setPlanometria`), que se abre para que se vea adjunta; se
  guarda con el contrato. Nunca toca el plano ni el servidor al armarla.
- **El proveedor mal escrito.** Con «Postobon» sin tilde el servidor no encuentra a
  «Postobón» (la regla del contrato sólo saca mayúsculas y espacios) y el cajón decía
  «Postobon todavía no tiene productos cargados» —falso— y ofrecía subir uno, que creaba
  un proveedor duplicado en plena reunión. Ahora dice «No encontré productos a nombre de
  «Postobon». Revisá cómo está escrito…», y `POST /catalogo/` por nombre contesta **409
  `proveedor_nuevo`** si el nombre no es de nadie: el visor pregunta («Es nuevo: darlo de
  alta» / «Revisar el nombre») y sólo con `crear_proveedor` lo da de alta. Ningún texto
  sugiere un nombre parecido: sería el nombre de otro. El cotejo sin tildes queda
  afuera a propósito: habría que cambiarlo a la vez en `bulk_leases`, y es otra decisión.
- **«De cerca» sin el cartel cortado.** El borde de arriba caía en la CENEFA (la franja
  de la marca que baja del copete hasta el último entrepaño cuando el hueco no sirve
  para producto): la toma sólo sabía del copete. `pisoDelCartelDePunta` (en
  `medidas.ts`, la misma cuenta que dibuja la cenefa, con `HUECO_SIN_PRODUCTO`) es ahora
  el piso del cartel. Y para todo mueble que no es angosto, el borde de arriba no pasa
  del entrepaño de arriba (`AIRE_SOBRE_EL_ENTREPANO`, 2 cm: su tabla y su labio, nada de
  su producto); por entrepaño se mira además 20 cm detrás de la cara
  (`FONDO_QUE_ASOMA`), sin bajar del techo del entrepaño elegido. La toma se BAJA entera
  (cámara y mira juntas), así que no cabecea: el picado sigue siendo de comprador. En
  GON-02·B por entrepaño la banda de relleno de arriba pasó de ~175 px a ~40.
- **Bajas:** el cajón se abre solo al saltar a una cara sin producto; la órbita no se
  mete en el mueble (65° a cada lado del frente, sin correr la mira, 0,6 a 7 m) y el
  doble clic vuelve a «De frente»; la × del cajón pasó a «Ocultar ›» (convivía con
  «× Volver al contrato»); el alta acomoda la ficha del envase al cajón (la foto arriba,
  el ancho a todo el ancho: ya no se cortan los placeholders); y la cuenta de «Cómo va»
  dice las unidades: «10 de frente × 3 a 4 de fondo por entrepaño · 4 entrepaños: 150
  unidades (40 frentes)» (el yogur en PUN-03; con todas las filas iguales, «= 40 por
  entrepaño»), con el fondo que ENTRA (`fondoTotal`) y no el que se dibuja (hasta tres).
  Antes decía «Entran 10 por entrepaño · 3 de fondo · 40 de frente», y se leían 10 y 40
  a la vez.

**Quedó sin hacer, escrito:** el relleno de los vecinos sigue con sus colores; la isla con
el producto como lámina embaldosada y el cabezote de la nevera con una imagen sintética
siguen como en el editor; la columna COL-01 se ve igual que en el editor. (El 13-10 se
resolvieron los vecinos —grises en el visor—, la isla —sin producto en el visor— y la
columna; el cabezote sigue igual. Ver abajo.)

**Peso.** Al entrar a Vender: el archivo de Vender 209 728 → 211 439 B gzip (+1,7 KB
contra la línea base de 6077160), el CSS de entrada +336 B, el pedazo compartido
`propuesta` (donde caen `frentes`/`medidas`) +125 B y el index +4 B: +2,2 KB en total,
bajo el tope de 3 KB. El visor, que baja al abrirlo: 6,8 KB + 1,6 KB de CSS.

**Cómo se comprobó.** `probar-vender` suma 3 estáticas (el botón en la cabecera y el
choque a todo el ancho, la lámina sin período ni valor y sólo a la planometría de la
ficha, el visor sin «la prueba los tapa» y con el alta confirmada y la órbita con
límites) y 4 de navegador (la fila en conflicto, las repisas vendidas en «Toda la cara»
y «Por entrepaño», la lámina bajada y adjunta sin escribir nada, el proveedor sin tilde
con la confirmación y sin proveedor nuevo): 23 estáticas y 54 con navegador, todas
verdes contra el servidor local. Las de navegador tocan las caras al revés, porque «Ver
en 3D» abre la última, y antes de contar los amarillos al cerrar esperan la transición
del botón (con SwiftShader el hilo principal está ocupado soltando la memoria de video). `probar-planta` suma 1 (el borde de arriba de «De
cerca» no pasa del entrepaño de arriba, sin cabecear) y cambia la del copete (el piso
del cartel es la cenefa); `probar-muebles`, las unidades con el fondo que entra;
`probar-contrato`, el choque a todo el ancho; `test_catalogo.py`, el 409. Doce
mutaciones, todas en rojo: el botón otra vez en la fila, las caras en conflicto al
visor, «la prueba los tapa» al proveedor, la lámina con período, el alta sin confirmar
(visor y servidor), la órbita sin límites, «De cerca» sin el aire, el cartel sin la
cenefa, el choque en la columna angosta, la lámina a otro lado que la ficha y la cuenta
sin el fondo.

### 2026-10-13: la segunda crítica

La segunda revisión encontró un defecto alto y cuatro medios. Lo que se cambió:

- **ALTA — la planometría de un proveedor quedaba en el contrato de otro.** Con Alpina se
  hacía «Usarla como planometría», se escribía «Postobón» y la prueba se iba, pero el
  contrato de Postobón seguía con `PRINCIPAL-GON-02-B_Alpina_antes-despues.jpg`: «Alpina»
  a la vista en la ficha y, al guardar, la lámina con «PROVEEDOR Alpina» y su producto por
  correo y como guía del mercaderista. Ahora la lámina adjunta es de la prueba
  (`sesion.lamina`, que `vaciar()` olvida al cambiar de proveedor y con «Empezar de
  nuevo»), y la ficha la saca del campo si sigue siendo ella, con un aviso. «Para
  llevarse» dice de quién es la planometría que ya está. (El aviso decía «era de otro
  proveedor»; el mismo día se le sacó el porqué: ver «la tercera crítica».)
- **MEDIA — el visor contradecía la venta con las repisas vendidas aparte.** Los
  espacios internos son del MUEBLE (las dos caras) y viven sólo en el layout; GON-02·B,
  libre en Vender, salía en «Hoy» con un 60 % de relleno ajeno, cinco «VENDIDO» en «Por
  entrepaño» (la fila decía 3) y la lámina con un entrepaño de Alpina en una cara llena
  de otros. Ahora los muebles del contrato llegan al visor con esos espacios libres
  (`sinRepisasVendidas`): la cara se ve entera a la venta. La fila de la dueña dice «3
  internos vendidos» (la palabra del editor y la misma cuenta), y el `title` aclara que
  son del mueble y valen para las dos caras, y que el 3D se la muestra libre.
- **MEDIA — la isla no se podía mostrar.** El producto iba como un cartel plano
  embaldosado, cinco veces su escala, cortado, y «Tres cuartos» dejaba ver que era una
  pared. En los tipos sin envases el visor ya no prueba producto: «De frente» y «Tres
  cuartos» del lugar, sin «De cerca» ni lámina, el cajón no se abre solo y explica «Isla:
  el producto va en cajas o exhibidores que arma el proveedor…». Las pruebas de esas
  caras tampoco se dibujan (`clavesDeCaras` filtra por `TIPOS_CON_PRUEBA_3D`).
- **MEDIA — GON-02·A salía cortada por los dos lados.** 3,6 m frente a un pasillo de 2 m:
  con el cajón abierto el lienzo es angosto (1080 × 900 a 1440; 1006 × 768 a 1366) y la
  cara pedía 88-93° de campo visual, con el tope en 70; además la corrida por la punta
  pegada (18 cm) sacaba el canto izquierdo. Ahora `FOV_MAXIMO_DE_FRENTE` es 95°, la
  corrida no va desde el fondo del pasillo (`alFondo`) y «Por entrepaño» también abre el
  campo (`fovParaLaCara` recibe la franja). Sólo se abre lo que hace falta: un grado
  menos y la cara no entra (lo prueba `probar-planta`). Es un gran angular de paso:
  cerrado el cajón, la misma cara entra con ~75°.
- **MEDIA — en el robatope se veía el vecino.** La punta pegada, vendida a otro, se
  llevaba el cuadro con sus bloques de colores, y en la lámina «Con Alpina» traía en
  primer plano la Avena probada en la isla. Ahora lo ajeno va en grises en todo el visor
  (`RellenoNeutro`, paleta `neutro`) y la lámina se arma con la prueba de SU cara sola
  (`soloLaCara`): «Hoy» y «Con …» difieren sólo en lo que se vende. El encuadre del
  robatope no se tocó (la persona da la escala de una bolsa de 23 cm).
- **Bajas:** «Ver en 3D» en letra de texto sobre `--bg` (se confundía con «SIN FIRMAR»)
  y la pista «Tocá Ver en 3D…» con la primera cara; el botón dice qué cara abre cuando la
  última está tomada, y queda apagado con su porqué si no hay ninguna; la confirmación
  de la lámina se trae a la vista (`scrollIntoView`) y el cuerpo del cajón deja 28 px
  abajo; el título de la lámina es «GON-02·A · Góndola, por cara» con «SEDE PRINCIPAL»
  debajo y el archivo `PRINCIPAL-GON-02-A_Alpina_…` (la A con su letra, como la B);
  mientras se arma la lámina la pantalla queda congelada en el cuadro de antes
  (`data-congelado`) y al terminar vuelve a la toma que había; con el proveedor puesto,
  el cajón dice «Proveedor: Alpina · cambiar» en vez de la pregunta; y la columna, en la
  pantalla de venta, va del piso al cielo raso con la luz de los muebles y sin capitel
  (era una «chimenea» marrón detrás de la isla).

**Quedó sin hacer:** el cabezote de la nevera sigue con el logo chico; una nevera libre
sale en «Hoy» con botellas genéricas y una punta libre vacía (la regla de «Hoy» en un
espacio libre no se unificó: es del editor); «De cerca» de la lámina no se centró en la
franja del producto; sigue habiendo una sola planometría por contrato (adjuntar la de
otra cara reemplaza la anterior, y el visor lo dice); «Por entrepaño» no vuelve a
encuadrar al elegirlo.

**Peso.** Al entrar a Vender, contra el build de 6077160 con el gzip de Node: el archivo
de Vender 209 728 → 211 937 B (+2,2 KB), el CSS de entrada +387 B, `propuesta` +149 B y
el index +3 B: +2,7 KB en total, bajo el tope de 3 KB. El visor: 7,5 KB + 1,7 KB de CSS.

**Cómo se comprobó.** `probar-vender` suma 2 estáticas (la lámina se va con el
proveedor; la cara entera, lo ajeno en grises, la isla sin producto y la lámina sólo con
su cara y el cuadro quieto) y 1 de navegador (adjuntar con Alpina, escribir Postobón: la
planometría queda vacía, la ficha no nombra a Alpina y dice que se quitó; volver a
Alpina no la trae), y la de las repisas exige cero «vendido» en el visor;
`COMPONENTES_VENDER` ahora también ve `<X.Provider>`. `probar-planta` suma 1 (GON-02·A
de punta a punta con el cajón abierto a 1366, 1440 y 1920, en «De frente», en la lámina
y por entrepaño, cada una con el campo mínimo para SU franja) y la de la góndola larga
exige el campo mínimo. `probar-muebles` suma 1 (`sinRepisasVendidas` ejecutada y la
paleta neutra). En total, 25 estáticas de Vender y 57 con navegador contra el servidor
local, todas verdes. Trece mutaciones, todas en rojo: la planometría que no sale al
cambiar de proveedor, `vaciar()` sin olvidar la lámina, los muebles del contrato sin
`sinRepisasVendidas`, `sinRepisasVendidas` que no libera, el relleno sin la paleta
neutra, el visor sin `RellenoNeutro`, pruebas y «De cerca» en la isla, la lámina con
las pruebas de otras caras, el tope otra vez en 70°, la corrida desde el fondo del
pasillo, por entrepaño con 50° y `fovParaLaCara` sin la franja.

### 2026-10-13 (tarde): la tercera crítica — lo que llega tarde

La tercera revisión se metió con el TIEMPO: todo lo que el visor hace en segundo plano
—pedir una lista, subir un producto, armar la lámina— terminaba cuando la dueña ya podía
haber cambiado el proveedor, la cara o cerrado el visor, y lo que llegaba pisaba lo
vigente. La regla que quedó: **lo que corre después de un `await` se compara con lo
VIGENTE, no con lo del render del clic** (la función que espera se armó en ese render y
tiene adentro el nombre, la cara y las funciones de ese momento). Un alto, tres medios y
tres bajos:

- **ALTA — «Subir un producto» terminaba con lo de antes.** Con la subida demorada 6 s
  (una foto pesada en Render): Alpina, «Subir», «cambiar» a Postobón mientras sube. Al
  terminar, `recargar` —del render viejo— volvía a pedir el catálogo de Alpina, y como era
  el último pedido el descarte de respuestas viejas lo daba por bueno: el cajón volvía a
  «Productos de Alpina», el kumis quedaba probado en la punta con el copete de Alpina y
  «Con Alpina» en el HUD, con «Proveedor: Postobón» escrito arriba. Ahora el nombre, la
  cara y si el visor sigue abierto se leen de refs (`nombreRef`, `claveRef`, `vivo`);
  `recargar` pide con el nombre de ahora; el alta devuelve a nombre de quién y para qué
  cara se subió, y `alSubir` decide: visor cerrado → no toca la ficha; otro proveedor →
  ni a la lista ni a la cara, sólo se pide la lista del nuevo; otra cara → a la lista,
  sin probarlo. Y mientras el producto va camino al servidor, «cambiar» y el campo del
  proveedor quedan apagados (`enviandoAlta`).
- **La lista sabe de quién es** (`catalogo = { de, lista }` y `artes` derivado: sólo si
  `de` es el proveedor de ahora). Vaciarla en el efecto del nombre no alcanzaba: el
  efecto corre DESPUÉS del render con el nombre nuevo, y en ese render la lista era la
  del anterior —un vigía con `MutationObserver` lo vio: «Productos de Alpina» con
  «Postobón» escrito—. Con la lista atada a su nombre no hay render que la muestre con
  otro, y una respuesta tardía para otro nombre no se ve aunque se colara. Otra forma de
  escribir el mismo («alpina ») ni vacía ni vuelve a pedir.
- **MEDIA — la lámina de un proveedor en el contrato de otro, otra vez.** «Usarla como
  planometría» armaba en segundo plano y adjuntaba al final sin mirar. Cambiar de
  proveedor en el medio adjuntaba la lámina de Alpina al contrato de Postobón —y la
  marcaba como de la prueba nueva, así que el visor decía «la lámina de PUN-03 con
  Postobón»—, salteando el arreglo de la segunda crítica. **MEDIA —** cerrar el visor en
  el medio la adjuntaba sola unos 25 s después, con «De cerca» en blanco (tomas de un
  lienzo que ya no existía), lista para salir por correo como guía del mercaderista.
  Ahora la lámina queda atada a lo que se mostraba al empezar: `vigencia` sube al cambiar
  de cara, de proveedor y al cerrar, y `armarLamina` la mira después de cada `await`
  (entre tomas, después de cada toma, del armado; y quien la usa, después del JPG). Si se
  movió, corta con `INTERRUMPIDA` y no adjunta ni baja nada; con el visor abierto dice
  «La lámina no se terminó: cambió lo que se estaba mostrando». Segunda defensa: la ficha
  recibe el proveedor con que se armó y la rechaza si el contrato ya es de otro
  (`adjuntarLamina` contra `proveedorVigente`, un ref).
- **El visor, quieto mientras se arma** (`armando`; era la baja del salto de cara): la
  chapa, el HUD entero, «Ocultar», «Subir un producto» y un `fieldset` con el proveedor,
  los productos y «Cómo va» quedan apagados, y una tapa sobre el lienzo frena la órbita.
  Antes, tocar otra cara a mitad dejaba el 3D en PUN-03 y la chapa en GON-02·B, y la
  confirmación no aparecía nunca. El `finally` repone la toma sólo si la cara es la misma.
  Cerrar sí se puede: descarta lo armado. Y al empezar una lámina se borra lo que dijo la
  anterior («La lámina se bajó» quedaba a la vista mientras se armaba la planometría).
- **MEDIA — las guardas no miraban el camino del cajón.** Todas cambiaban el proveedor
  en la ficha con el visor cerrado. Ahora `probar-vender` cambia DESDE el cajón, letra por
  letra; con la lista del anterior demorada 6 s; en medio de una subida demorada (el alta
  se va con «Ocultar», que es la puerta que queda abierta); a mitad de la lámina (por
  detrás: la ficha está `inert` y el cajón apagado, así que se escribe el campo desde
  afuera, como lo haría una puerta nueva); cierra a mitad de la lámina y espera 35 s; y
  hace «Empezar de nuevo» con la lámina adjunta. El vigía mira el cajón y el HUD en cada
  cambio del DOM, no cada tanto. En lo estático quedan fijos el vaciado de la lista, la
  lista atada a su nombre, el descarte de respuestas viejas, que `listarDelProveedor` le
  pida al servidor `params: { proveedor }` (y no filtre en el navegador), los refs, las
  dos defensas de la lámina y todo lo que se apaga mientras se arma.
- **Bajas:** el aviso «Se quitó la lámina del 3D: era de otro proveedor», en la ficha que
  mira el proveedor, le contaba que ese espacio se le estuvo ofreciendo a otro (y con
  sólo corregir cómo se escribe el mismo, era falso). Ahora dice «La lámina del 3D se
  quitó: si la querés, armala de nuevo con «Ver en 3D»», sin por qué. «Empezar de nuevo»
  saca la lámina él mismo y sin aviso (el efecto lo tomaba por un cambio de proveedor y
  dejaba el aviso en una ficha que empezaba de cero).

**Quedó sin hacer:** lo de la segunda crítica sigue igual (el cabezote de la nevera, la
nevera libre con botellas genéricas, «De cerca» de la lámina sin centrar en la franja,
una sola planometría por contrato, «Por entrepaño» sin reencuadrar). El aviso de la
lámina quitada queda hasta que se adjunta otra planometría.

**Peso.** Al entrar a Vender, contra el build de 6077160 con el gzip de Node: el archivo
de Vender 209 728 → 212 016 B (+2,2 KB), el CSS de entrada +387 B, `propuesta` +150 B y
el index +11 B: +2,8 KB en total, bajo el tope de 3 KB. El visor: 8,0 KB + 1,8 KB de CSS.

**Cómo se comprobó.** `probar-vender` suma 1 estática («lo que llega tarde no pisa lo
vigente») y endurece tres (la lámina con el proveedor, el `finally` que mira la cara, el
aviso sin «otro proveedor» y «Empezar de nuevo»), y 6 de navegador (las de arriba): 26
estáticas y 64 con navegador contra el servidor local, todas verdes. Veintiuna mutaciones
estáticas, todas en rojo (la de `vigente()` sin efecto salió verde la primera vez: se
fijó su definición). Y tres mutantes CONSTRUIDOS y servidos, para ver que la parte de
navegador también los agarra: la lista sin dueño ni vaciado más «Empezar de nuevo» con
aviso (caen «letra por letra», la subida y «Empezar de nuevo»); sin descartar respuestas
viejas más «cambiar» activo mientras sube (caen la respuesta tardía y la subida); la
lámina que nunca se da por interrumpida (cae «cerrar a mitad»). Cada defensa doble (la
lámina contra la ficha, la subida contra la lista atada a su nombre) se rompió sola en
lo estático: en el navegador la otra mitad la sostiene, que es la idea.

## Un solo catálogo de muebles (2026-10-13)

Cada tipo de mueble estaba escrito a mano en unas veintidós tablas —el catálogo del 3D y
el del 2D, los altos y colores con que nace, los prefijos, las tarifas, lo que no se
alquila, los nombres de los informes, las referencias del minimapa— y del lado del
servidor en sus copias. Ya no decían lo mismo: el mostrador de carnes nacía con 0,85 de
fondo en el plano y 0,90 en el 3D, el servicio al cliente dibujado en el plano nacía de
1,80 m y los informes decían «mueble», «metro» e «impulsadors». Sumar un mueble —lo que
hace falta para dibujar Cañaveral— era tocar diez lugares sin olvidarse de ninguno.

**Dónde vive.** En `muebles.json`, en dos copias idénticas byte a byte:
`frontend/src/catalogo/` y `backend/app/catalogo/`. Son dos porque la imagen de Docker
lleva `backend/` y `frontend/dist`, no una carpeta compartida. Se edita una y se copia
sobre la otra. Por tipo dice: prefijo, `alquilable` (`si` · `no_por_defecto` · `nunca`),
clave de tarifa, rótulo de los editores, nombre de informe (singular y plural),
categoría, grupo de la biblioteca del 2D, medidas, color (y `color2D` si el 2D nace con
otro), emoji, descripción, referencia del minimapa y banderas (`producto`, `prueba3D`,
`surtido`, `frio`, `formaCorrida`). La góndola tiene variantes (`double`/`wall`, con sus
caras); `gondola_doble` y `gondola_mural` son `alias` del 2D; `exhibicion` es `legado`.
Además están `tarifas` (clave y rótulo, en el orden de la pantalla) y `orden` (la paleta
del 3D, la biblioteca del 2D y las referencias del minimapa). Desde *Muebles de Colombia*,
también `modelos` (las fichas de muebles de verdad) y, en los tipos que tienen modelos,
`rango` (entre qué medidas tiene que estar uno) y `geometria` (qué puede fijar: los
entrepaños y el módulo de la góndola, las puertas de la nevera de puertas).

**Quién lo lee.**

- **El navegador**, por `catalogo/catalogo.ts`. De ahí salen, con el nombre y el orden de
  siempre, `FIXTURE_DEFS` y `TIPOS_CON_*` (`catalogo/editor3D.ts`; `/taller` elige por
  posición), `CATALOG`, `H_DEFAULTS`, `COLOR_DEFAULTS` y `CATALOGO_2D`
  (`catalogo/plano2D.ts`), `REFERENCIAS` (`catalogo/minimapa.ts`), `NUNCA_ALQUILABLE`,
  `NON_RENTABLE_BY_DEFAULT`, `RATE_TYPES`, `CATEGORIA_DE_TIPO` y `rateTypeOf`
  (`types/fixtures.ts`), `PREFIJO_POR_TIPO` (`utils/nomenclatura.ts`), `MUEBLES_FRIOS`,
  `FORMAN_CORRIDA` y los nombres de `plataforma/formato.ts`. Los editores no tienen tablas
  propias: el 2D convierte con `CATALOGO_2D` y el 3D con `CATALOGO_3D` (`FIXTURE_DEFS` y
  `defaultSlots`), y `probar-muebles.mjs` lo exige. Una copia vieja de los altos pegada en
  `FloorPlan2D` volvía a hacer nacer el servicio al cliente de 1,80 m sin que fallara nada.
- **El servidor**, por `app/services/catalogo_muebles.py`, que lee sólo lo que necesita:
  `PREFIJO_POR_TIPO` (la renumeración), `NUNCA_ALQUILABLE` y `REFERENCIAS`
  (`layout_lookup.py`) y la clave de tarifa (`bulk_leases.py`, `plataforma_metricas.py`),
  que desde *Muebles de Colombia* es la del mueble: `tarifa_del_mueble`, con la tarifa
  propia de su modelo (`TARIFA_POR_MODELO`) si la tiene.
- **Viaja sólo donde se usa.** No entra en lo primero que baja la landing: la fusión con
  la base (`utils/estadoComercial.ts`, que va de entrada) toma `carasDe` y `fullSpaceCode`
  de `types/espacio.ts`, que no importa nada; antes se las pedía a `types/fixtures.ts`, que
  arrastraba el catálogo entero. Tampoco entra en el worker del recorte (`MUEBLES_FRIOS`
  va marcado `@__PURE__`). `probar-catalogo.mjs` arma el grafo de `main.tsx` y del worker y
  falla si vuelve. El pedazo de entrada quedó en 341 kB (109 kB comprimido), por debajo de
  los 346 kB que pesaba antes del catálogo.

**Cómo se agrega un tipo.**

1. Una entrada en `tipos` de `frontend/src/catalogo/muebles.json`: un prefijo de tres
   letras que nadie use, `alquilable` y, si se vende, `tarifa` (con su fila en `tarifas`),
   `informe`, `informePlural` y `categoria`. El nombre de informe tiene que llevar a SU
   fila de Tarifas: la sesión le dice a la dueña «dejar la tarifa cargada en …» y ella la
   busca por esas palabras, así que la validación falla si aparece en el rótulo de la
   tarifa de otro tipo y no en el suyo.
2. Sumarlo a `orden.editor3D` y a `orden.plano2D` (y a `orden.minimapa` si es referencia).
3. Copiar el archivo sobre `backend/app/catalogo/muebles.json`.
4. Sumar la clave a `FixType` (`types/fixtures.ts`) y a `FixType2D`
   (`utils/convertirPlano.ts`): son tipos de TypeScript, no corren, y `probar-catalogo`
   exige que digan lo mismo que el archivo.
5. Dibujarlo: un `case` en `FixtureMesh` (`StoreEditor3D.tsx`) y, si hace falta, en el 2D.
   `probar-catalogo` falla si un tipo no tiene su `case` («cada tipo tiene quién lo dibuja
   en el 3D»): sin él caía en el `default` y se dibujaba como una estiba.
6. La referencia no lo compara: `probar-catalogo` y `test_catalogo_muebles.py` sacan de la
   captura de hoy lo que es de un tipo o una tarifa que `catalogo-antes.json` no conoce,
   tabla por tabla (`LO_NUEVO_POR_TABLA`; una tabla sin clasificar hace fallar la prueba),
   y comparan el resto. Que eso no se convierta en no mirar nada lo vigila «la comparación
   saca SÓLO lo nuevo»: un tipo inventado en todas las tablas no se ve, y un cambio de un
   tipo viejo —un prefijo, una bandera, una medida, una tarifa— sí.

**La referencia y los cambios intencionales.** `frontend/scripts/casos/catalogo-antes.json`
es lo que hacía el código antes del catálogo, capturado de `fafb301` por
`scripts/capturar-catalogo.mjs` y `backend/scripts/capturar_catalogo.py` sobre un plano
sintético con un mueble de cada tipo y los legados (una góndola sin `gondolaType`,
`gondola_doble`, `exhibicion`, una zona libre habilitada, una caja sin la bandera). Quedó
FIJA: escribirla pide `--reescribir` y sólo tiene sentido sobre el código de antes.
`probar-catalogo.mjs` y `tests/test_catalogo_muebles.py` corren la misma captura sobre el
código de hoy y la comparan entera; cada diferencia tiene que estar en su
`CAMBIOS_INTENCIONALES`, con su porqué y su valor de antes. Los que hay, todos para
muebles que se creen desde ahora o textos que no se guardan:

- el mostrador de carnes nace en el 2D con 0,90 de fondo (era 0,85; el 3D ya decía 0,90);
- el servicio al cliente nace en el 2D con 1,10 de alto y su color (no estaba en las
  tablas del 2D y caía en 1,80 y en el color de la góndola);
- se fue el color de `nevera_mural`, un tipo que no existe;
- los informes nombran «vitrina», «zona libre» e «impulsadores» (salían `mueble`, `metro`
  e «impulsadors»);
- la `isla` y la `cross` se llaman «Estiba (exhibición de piso)» y «Exhibidor cruz» en
  Tarifas, y «estiba» y «exhibidor cruz» en los informes (decían «Isla» y «Exhibición de
  piso»). Con sólo las tarifas renombradas, «exhibición de piso» era la cruz en los
  informes y la estiba en Tarifas; la demo de la landing usa los mismos nombres;
- del lado del servidor, uno de la revisión: `scripts/auditar_desfase.py` pregunta
  `es_comercializable`, como la aplicación, y ya no cuenta como ofrecida una caja de un
  plano viejo sin la bandera.

Además, las dos pruebas cargan los módulos con un catálogo adulterado y cada tabla tiene
que cambiar con él: una copia escrita a mano que hoy coincide con el archivo no pasa.

**Lo que el editor no conoce, se conserva.** Las conversiones entre el store y cada editor
viven en `utils/convertirPlano.ts`, y la vuelta parte del mueble guardado:
`{ ...guardado, ...loQueSabe }`. Antes armaban el mueble con una lista fija, y el 2D
borraba la vista 3D guardada para el proveedor y el montaje de la cara A al mover
cualquier cosa. Lo que el editor sabe manda, también cuando vale `undefined`.
`probar-plano.mjs` compara contra las funciones de antes y edita en cada editor todos los
campos que la vuelta escribe.

**Una sola regla de caras, la laxa.** `carasDe` (`types/espacio.ts`) y `caras_de`
(`layout_lookup.py`): `gondola` con `gondolaType` `"double"` o ausente, o el legado
`gondola_doble`, son dos caras; todo lo demás, una. Es lo que dibujan los dos editores y lo
que ya ofrecía Vender; con la estricta, la cara B de una góndola vieja se vendía sin que el
plano la pintara ni el guardarraíl la cuidara. En la revisión se sumaron la planilla y el
contrato suelto, que le recortaban el `-B` a cualquier mueble y vendían `PUN-01-B` (ver
*Reglas duras*).

Ningún código de espacio, prefijo, clave de tarifa ni plano guardado cambió, y no hay
migraciones ni columnas nuevas.

**Verificación (del catálogo único).** `tsc` limpio; `npm run probar` (29 guiones) y `npm run build` limpios
(35 pedazos; el catálogo, 8,7 kB, va en uno perezoso). pytest de los archivos que tocan
esto: caras, auditoría de desfase, catálogo, planilla, vendible, renumeración, contrato
sin mueble, nomenclatura de la planilla, correos de contrato, punta a punta, importación
del plano, estado comercial, métricas y detalle de la plataforma, enlace de montaje,
endurecimiento y bitácora: 322 verdes. Tres revisiones de la rama dejaron diez hallazgos
y quedaron cerrados con su prueba, rota a propósito antes del arreglo: los nombres de
informe de la estiba y la cruz; la planilla y el contrato suelto que vendían la cara B de
un mueble de una cara; el auditor de consola que contaba la caja de un plano viejo; la
bandera `rentable` que la vuelta de los editores podía perder sin que nada fallara (y con
ella cualquier campo: se mutaron los 27 que escriben las dos vueltas); las tablas del
servidor sin prueba contra el archivo; las tablas propias de los editores (los altos
viejos en el 2D, `slotsPorDefecto` vacío en el 3D); la guarda de las caras, que sólo veía
`=== "double"`, y el catálogo en el pedazo de entrada y en el worker.

## Muebles de Colombia (2026-10-13)

En corto, para quien retoma. El próximo cliente es un supermercado como Galerías o
Cañaveral (Cali) y no hay una sola foto propia de sus muebles: todo sale de fichas de
fabricantes encontradas en internet (la investigación «R3»). Lo que quedó, del 2026-10-13 al
2026-10-14 (el detalle, en las cuatro secciones que siguen):

- **Modelos con su fuente.** `modelos` en `muebles.json` (36: góndolas central y de pared
  por alto y módulo, puntas, estiba completa, media y cuarto, exhibidor de cartón, neveras
  de 1 a 4 puertas, puesto de impulso). Cada uno guarda sus medidas, una nota con palabras
  propias, la URL de la página y cuánto confiar (`ficha`, `catalogo` o `estimado`, que en
  pantalla lleva «≈»). **No se copia ninguna imagen de terceros**: sólo medidas, y la
  validación rechaza una fuente que sea una imagen o una clave `foto`. Colocar un modelo
  ESTAMPA su ficha en el mueble; cambiar la ficha después no mueve lo colocado.
- **Dos tipos nuevos.** La **nevera de puertas** (`NEV`) se vende ENTERA por ahora: sus
  puertas (`partes.puertas`) sólo dicen cómo se dibuja y dónde se para el producto de
  prueba (un vano por hoja). El **puesto de impulso** (`PIM`) es el mostrador de la
  promotora, con el arte impreso en el frente y sin producto inventado.
- **Tarifa por modelo.** La media estiba, el cuarto de estiba y el exhibidor de cartón se
  cobran con su propia tarifa: `rateTypeOf` (navegador) y `tarifa_del_mueble` (servidor)
  miran primero el modelo del mueble, sólo si es de su tipo, y si no la del tipo.
- **Alto, entrepaños y módulo editables, con aviso.** En el panel del 2D y del 3D (el mismo
  componente). Con una cara con contrato vivo o firmado, arte pintado o espacios internos
  vendidos, el cambio dice qué se mueve y espera «Cambiar igual»; con espacios internos
  vendidos no cambia la cantidad de entrepaños. Los entrepaños se cuentan como se escriben:
  los que llevan producto sobre la base.
- **Ausente no es null.** `PUT /layout` le rellena al mueble que ya estaba (mismo `id`,
  mismo tipo) la ficha que llega AUSENTE —así llega de una pestaña de antes— y la borra sólo
  con un `null`. El navegador de hoy dice `null` cuando vacía un campo y cuando deshace.
- **Lo que ve quien no ve plata.** El visor de Vender (`sinDatosComerciales`) y el enlace de
  la mercaderista (`_solo_geometria`) dejan pasar la ficha porque es geometría, por lista
  blanca y con su tipo: `modelo` si es texto, `entrepanos` y `modulo` si son números, y de
  `partes` sólo el número de puertas.

### Muebles de Colombia: modelos con su fuente (2026-10-13)

El próximo cliente es un supermercado como Galerías o Cañaveral (Cali), y no hay fotos
propias de sus muebles: todo sale de fichas de fabricantes encontradas en internet
(la investigación «R3»). Sobre el catálogo único se sumaron **modelos** —fichas de
muebles de verdad— y dos tipos nuevos. **Ninguna imagen de terceros entró al repo**: de
cada fuente se guardan las medidas, una nota con palabras propias, la URL de la página y
cuánto confiar (`ficha`: la página trae los datos explícitos; `catalogo`: salen del título
o de un listado; `estimado`: una deducción, que en pantalla lleva «≈»).

**Qué modelos hay** (`modelos` en `muebles.json`, 36):

- **Góndola central y de pared** de 1,50, 1,60, 1,80 y 2,00 de alto con módulos de 0,90,
  1,00 y 1,20 (24). Con ficha: GMC (la doble de 1,60 a 2,00 y la sencilla de 1,80 y 2,00,
  módulos de 0,90 y 1,00), Vialambre (central 2,00 × 1,00 × 1,00, cuatro entrepaños y la
  base) y Dispromem (pared de 2,00, módulo de 1,20, fondo 0,49). Vialambre 1,50 es de
  catálogo; las combinaciones que nadie publica van «estimado». El ancho del modelo es UN
  módulo: la góndola se estira en el plano y se parte en módulos de ese ancho.
- **Punta** de 0,70 × 0,37 de 1,30, 1,50 y 2,00 (Vialambre, Exhivicol): cierra una central
  de 0,70 de fondo.
- **Estiba completa, media y cuarto.** Se eligió UN sistema, el colombiano: la completa es
  la de la NTC 4680 (1,20 × 1,00), la media la que se vende acá (1,00 × 0,60) y el cuarto
  es la mitad de la media (0,60 × 0,50), «estimado» porque nadie lo publica. El cuarto
  europeo (0,60 × 0,40) es de otro sistema y no se mezcla. El alto de las tres es el de la
  torre de producto con que se exhiben: estimado.
- **Exhibidor de cartón de la marca** (0,60 × 0,40 × 1,70), sobre la familia del
  impulsador: «estimado» (se fabrican a medida; el rango sale de catálogos de la región).
- **Neveras de puertas**: de 1 y 2 puertas de Inducol y de 3 y 4 de Frigomaster, con ficha.
- **Puesto de impulso** de 0,80 × 0,40 con la superficie a 1,00 y la cenefa hasta 2,00
  (Grupo SRM, con ficha).

**Dos tipos nuevos** (completos en las dos copias del catálogo, con su dibujo, su nombre de
informe, su tarifa y su lugar en las paletas):

- **`nevera_puertas`** (prefijo `NEV`; la de bebidas abierta sigue siendo `BEB`): la nevera
  vertical cerrada. Se dibuja con `NeveraReal variante="puertas"`, que existía y ningún
  mueble usaba. Las puertas salen de `partes.puertas` del mueble y, si falta, de la cuenta
  de siempre (`puertasDe` / `puertasDeNevera`). Está entre los fríos y en la prueba 3D del
  producto, con las mismas rejillas automáticas y el mismo cabezote que la abierta
  (`esNeveraDeBebidas`), y el producto se para detrás del vidrio de cada hoja (un vano por
  puerta). **Se vende ENTERA**: la cantidad de puertas sólo sirve para dibujarla; vender
  por puerta espera a la dueña (ver *Lo que sigue de los muebles*). Tarifa «Nevera de
  puertas».
- **`puesto_impulso`** (prefijo `PIM`): el mostrador chico de la promotora, con la cenefa
  sobre dos mástiles y aire entre la tapa y el cartel (`muebles/PuestoImpulsoReal.tsx`,
  cotas en `PUESTO_IMPULSO` de `medidas.ts`). El arte del proveedor va impreso en el frente
  del mostrador; no lleva producto inventado. Tarifa «Puesto de impulso».

**Colocar un modelo ESTAMPA su ficha.** Las paletas del editor 3D (`PALETA_3D`) y del plano
2D (`MODELOS_2D`) listan cada familia con su **modelo base** —el de siempre, `base:<tipo>`
o `base:<alias>` en la góndola; colocarlo no escribe `modelo` y el mueble nace como antes—
y, plegados debajo, sus modelos, con «≈» los estimados. Al colocar uno, el mueble guarda
`w/d/h`, el color, `modelo` y su geometría (`entrepanos`, `modulo`, `partes`); el rótulo es
el de su tipo, el mismo que el 2D estampa en `label` al abrir el plano. El panel de los dos
editores nombra el modelo (y su fuente al pasar el mouse). Ningún editor vuelve a escribir
la ficha: `utils/convertirPlano.ts` la escribe sólo cuando el mueble NACE —sin guardado con
ese `id`: en el 3D de los campos del mueble nuevo, en el 2D de `nace`— y, con guardado,
manda lo guardado. Un duplicado del 2D nace con la ficha del original. Si mañana cambia
una ficha en `muebles.json`, lo ya colocado no se mueve (`probar-catalogo` lo comprueba con
un catálogo adulterado).

**La góndola se dibuja con su ficha.** `entrepanos` es lo que dice la ficha, por cara y sin
la base, y todos llevan producto: «cuatro entrepaños y la base» son la base y cuatro, y el
aire bajo el remate es la última fila (`nivelesDeFicha`, `filasDeProducto`). `modulo` parte
el corrido en módulos de ese ancho (`vanosDeCorrido(w, modulo)`). La misma geometría
(`geometriaDe(f)`) la usan el dibujo (`GondolaReal`), el relleno, el producto de prueba
(`ventaDeGondola`), la cámara de venta (`ventaDeTipo`) y la lámina (`getPanelShelfSpan`):
si una la usara y otra no, el producto quedaría parado entre dos entrepaños. Sin los
campos, la cuenta de siempre, idéntica. La punta no tiene entrepaños por ficha (sus modelos
traen sólo medidas), pero desde la noche del mismo día se dibuja con los que se le escriban
en el panel: ver *Lo que se puede editar y lo que no se puede perder*.

**La tarifa por modelo.** La media estiba (`estiba_media`), el cuarto (`estiba_cuarta`) y el
exhibidor de cartón (`exhibidor_carton`) se cobran aparte de su tipo: `rateTypeOf` mira
primero la tarifa del modelo del mueble —sólo si el modelo es de su tipo— y si no la del
tipo, como siempre; el servidor pregunta lo mismo (`tarifa_del_mueble` en
`services/catalogo_muebles.py`), y lo usan la referencia de la planilla (`bulk_leases.py`)
y el mapa de tipos de la plataforma (`plataforma_metricas._mapa_tipos_de_sede`, que alimenta
el spread y el detalle por cliente). Las cinco tarifas nuevas salen solas en Tarifas, con
su rótulo, y los informes las nombran («media estiba», «exhibidores de cartón»).

**Vender.** `sinDatosComerciales` deja pasar la ficha —es geometría: sin ella, el visor le
mostraría al proveedor otras puertas u otros entrepaños que los que se le venden—, y de
`partes` sólo el número de puertas. Ni plata ni datos de otro proveedor.

**Cómo se valida.** `probar-catalogo.mjs`: id único `base:…` que no pisa ningún base
implícito, tipo que existe, variante en la góndola, medidas dentro del `rango` de su familia,
sólo la geometría que su tipo admite (`geometria`) y dentro de su rango, tarifa propia con
su fila y sus nombres de informe (que tienen que llevar a SU fila), y la fuente con URL
https, nota, confiabilidad y nunca una imagen. Cada regla tiene su caso roto que tiene que
quejarse. `tests/test_modelos_de_muebles.py`: lo mismo de lo que lee el servidor, la tarifa
por modelo (unidad, planilla y plataforma), un mueble sin modelo que da lo de siempre, y
los prefijos `NEV` y `PIM` vendiéndose enteros y por una cara.

**Cómo se comprobó.** `tsc` limpio; `npm run probar`, 817 verdes; `npm run build` limpio
(el pedazo de entrada sigue en 340,7 kB; el del catálogo, perezoso, pasó de 8,7 a 26 kB por
las notas de los modelos); `import app.main` y pytest de catálogo, modelos, caras,
renumeración, corte del layout, planilla, vendible, métricas y detalle de la plataforma,
enlace de montaje y estado comercial: 225 verdes. 33 mutaciones —un tipo viejo que cambia
de medida o de prefijo, el filtro de lo nuevo que se come la punta, un modelo fuera de
rango, la validación sin el rango o sin la regla de imágenes, la paleta sin un modelo, los
editores que no estampan o que reescriben la ficha, `rateTypeOf` y `tarifa_del_mueble` sin
el modelo o sin mirar el tipo, la planilla y la plataforma con la tarifa del tipo, la
nevera sin las puertas de su ficha, la góndola o su lámina sin sus entrepaños, el índice de
modelos armado al cargar (se llevaba el catálogo al worker del recorte), el puesto sin su
`case`, el visor de Vender sin la ficha o con `partes` entero— y cada una hizo fallar su
guarda. Mirados en `/taller` con un servidor local: la nevera de puertas de 1,40 (dos
hojas) y de 2,07 (tres), y el puesto de impulso.

### Lo que se puede editar y lo que no se puede perder (2026-10-13)

Con los modelos (*Muebles de Colombia*) la góndola y la punta guardan su geometría:
entrepaños y módulo. Faltaba poder escribirla —en Cañaveral no todas las góndolas van a ser
las de la ficha— sin que eso moviera lo ya vendido, y sin que una pestaña abierta desde antes
la borrara al mover el mueble. La crítica del plan lo marcó como el hallazgo alto: «el
guardarraíl sólo compara códigos que desaparecen», y la regla de siempre es que el espacio
vendido no cambia de lugar.

**Los campos.** En el panel del plano 2D («Alto, entrepaños y módulo») y en el del Editor
3D, para la góndola y la punta: «Alto (m)», «Entrepaños» (por cara, sin la base) y «Módulo
(m)». Es UN componente, `components/GeometriaDelMueble.tsx`, con la cuenta en
`utils/geometriaDelMueble.ts` (puro). Vacío es la cuenta de siempre (`nivelesDeEntrepano` /
`nivelesDePunta` y `vanosDeCorrido` con 1,25), y el panel dice cuántos entrepaños y módulos
se dibujan hoy; si el mueble nació de una ficha, sus valores van de sugerencia. Los límites
son los del catálogo —`rango.h` y `geometria` del tipo; la punta ganó `geometria` en
`muebles.json`: entrepaños de 1 a 6 y módulo de 0,40 a 1,40— y nunca más entrepaños que los
que caben a 25 cm (`PASO_ENTRE_ENTREPANOS.minimo`): bajar el alto de una góndola con cinco
entrepaños guardados pide bajar primero los entrepaños. Toda ficha del catálogo pasa esa
validación (`probar-geometria`). Sólo un administrador los escribe (en el plano, en modo
edición); los demás ven los números.

**Se escribe en el store, no por la vuelta de un editor.** `conGeometria` escribe los tres
campos en ESE mueble del store (el resto conserva su identidad) y los dos editores se
resincronizan como con un deshacer; Ctrl+Z lo deshace. Vaciar un campo escribe `null`, no
borra la clave: es «borrado a propósito» hasta el próximo guardado (ver abajo). `fichaDe` y
`geometriaDe` tratan el `null` como ausente, así que a ningún dibujo le llega: un `null`
dibujado sería una góndola con un solo entrepaño.

**La punta, como la góndola.** Con `entrepanos` van la base y esos entrepaños, todos con
producto, y la última fila llega hasta el copete; `modulo` parte el frente en vanos. La
misma geometría la usan el dibujo (`PuntaReal`), el producto y el relleno
(`ventaDePunta`, `ProductoEnPunta`), los habladores (salen de la misma venta), la lámina
(`getPanelShelfSpan`) y la cámara de venta (`ventaDeTipo`, `pisoDelCartelDePunta`). Sin los
campos, idéntica a antes.

**Lo vendido no se mueve sin aviso.** Antes de escribir, `revisarCambioDeGeometria` mira:

- por cara, un **contrato vivo o firmado** para más adelante (la fusión con la base pinta
  «occupied» la cara con el que corre o, si no hay, con el próximo) y el **arte pintado**
  (la imagen designada de la cara, que se alinea a los entrepaños; se pregunta en el
  momento a `GET /spaces/face-images`). La planometría cuelga del contrato vigente o
  próximo, así que una cara con planometría ya cuenta por su contrato;
- del mueble, los **espacios internos vendidos** del Editor 3D (ocupados o reservados).

Con algo de eso, cambiar el alto, los entrepaños o el módulo muestra un aviso que dice qué
se mueve —«Cara A (contrato vivo o firmado): cambian las filas del arte de esta cara y el
producto se para en otros entrepaños», «… se reparten en otros módulos», «con otro alto
[los espacios internos] quedan en otro lugar del mueble»— y lo que se cambia («el alto, de
1,80 a 2,20 m (los entrepaños pasan de 5 a 6)»), y escribe sólo con «Cambiar igual»;
«Dejarlo como estaba» vuelve a lo guardado. Con espacios internos vendidos, la CANTIDAD de
entrepaños no cambia hasta liberarlos —tampoco la que arrastra el alto cuando no hay
entrepaños guardados—: cada uno cae sobre ciertos entrepaños (`entrepanosDelEspacio`) y con
otros pasaría a ser otra cosa. Si la consulta del arte falla, se avisa igual (ante la duda,
se pregunta). El aviso no nombra proveedor, marca, fechas ni plata: se lee con la pantalla
compartida. Sin nada vendido, se escribe sin preguntar.

**Una pestaña vieja no borra lo nuevo.** `PUT /api/layout/{sede}` (`_con_la_ficha_de_antes`
en `routers/layout.py`), antes de las guardas, para `CLAVES_DE_FICHA` (`modelo`, `partes`,
`entrepanos`, `modulo`):

- **ausente** en un mueble cuyo `id` ya estaba en el plano guardado: se rellena con lo
  guardado. Así llega de un editor de antes, que no conoce estas claves;
- **`null`**: lo borra (el navegador de hoy vació el campo a propósito), y el `null` no se
  guarda;
- un **valor** manda; un mueble **nuevo** (otro `id`, aunque se llame igual que uno borrado)
  no hereda nada; otra sede no presta la suya;
- un plano sin ninguna de estas claves se guarda **byte a byte** como antes.

Las dos listas de claves —`services/layout_lookup.py` y `utils/guardadoDelPlano.ts` (hasta
el 2026-10-14 estaba en `utils/convertirPlano.ts`, que la reexporta)— las compara una prueba. Es el mismo patrón que `_restore_missing_slot_prices`.

**El visor de Vender y la mercaderista ven el mueble real.** `sinDatosComerciales` ya dejaba
pasar la ficha (`modelo`, `entrepanos`, `modulo` y de `partes` sólo las puertas);
`_solo_geometria` de `routers/montaje.py` suma `modelo`, `entrepanos` y `modulo` —desde la
revisión del 2026-10-14, con su tipo: texto y números—, y de `partes` sólo sus números
conocidos (`PARTES_GEOMETRICAS`), copiados uno por uno: un objeto en la lista blanca se
llevaría lo que le escriban adentro mañana. `probar-vender` arma el mismo
plano por el camino del editor y por el del visor
(`sinRepisasVendidas(sinDatosComerciales(storeToFixtures(…)))`) y compara las filas y los
vanos que cada uno le pide a `ventaDeTipo`: una góndola con ficha (4 entrepaños, módulo de
1,00), una punta con 3 entrepaños y módulo de 0,45 y una nevera de 3 puertas de 2,30 de
frente —la cuenta de siempre le daría 4—; y que no pase ni una clave comercial, tampoco
colada en `partes`.

**Cómo se comprobó.** `tsc` limpio; `npm run probar`, 840 verdes (con `probar-geometria`,
nuevo: 20); `npm run build` limpio (el pedazo de entrada sigue en 340,7 kB);
`import app.main` y pytest de catálogo, modelos, caras, renumeración, corte y ficha del
layout (`test_layout_ficha.py`, nuevo), planilla, vendible, métricas y detalle de la
plataforma, enlace de montaje y estado comercial: 235 verdes. 35 mutaciones —la punta que
dibuja, vende, rellena, pone habladores, pinta la lámina o encuadra sin lo que guardó; el
`FixtureMesh` que le pasa la ficha cruda a la góndola; el bloqueo de los espacios internos
quitado o sin el alto que arrastra la cantidad; la cara B, el arte pintado, el contrato o
la consulta fallida que no cuentan; el aviso sin «cambian las filas del arte»; vaciar que
borra la clave; sin el paso mínimo; el componente que escribe sin revisar o con bloqueo; el
2D sin los campos; `fichaDe` que deja pasar el `null`; `sinDatosComerciales` sin el módulo,
sin las puertas o con `partes` entero; la punta sin sus límites en el catálogo; el
servidor que no rellena, guarda el `null`, rellena por código, se olvida del primer
guardado o pierde una clave; montaje sin los entrepaños, sin `partes` o con `partes`
entero— y cada una hizo fallar su guarda (una 36.ª, sumar `partes` a `_GEOMETRIA`, no
rompió nada: el filtro de `partes` igual manda). Mirado en el navegador contra un servidor
local descartable: en el plano 2D, la góndola con contrato pidió confirmar con el texto de
arriba y se cambió con «Cambiar igual»; la mural con un espacio interno vendido rechazó los
entrepaños; una punta libre cambió sin preguntar; vaciar el campo dejó al servidor sin la
clave. En el Editor 3D, la punta de 0,90 con módulo de 0,45 se dibujó en dos módulos, con
la base y 2, 3 y 4 entrepaños según el panel.

**Lo que queda.** El aviso vive en el navegador: un `PUT /layout` armado a mano podría
cambiar la geometría de una cara vendida sin preguntar (el servidor sólo cuida que no se
pierda). Las puertas de la nevera no se editan en el panel: sólo dibujan, y se editan cuando
se venda por puerta. Los modelos de la punta siguen sin entrepaños por ficha (la de 1,30
dice «tres y la base», pero su alto no trae copete y el nuestro sí). `/taller` no tiene los
campos: se miran en el editor.

### Cotejo visual de los muebles de Colombia (2026-10-14)

La lección escrita del repo es que no se modela de memoria y que «lo revisé» no es haberlo
revisado (`docs/engram/03-mobiliario-3d.md`). Los modelos nuevos se miraron uno por uno en
`/taller` contra las medidas y la descripción de su ficha (la investigación R3), en tres
cuartos y de frente, con producto y sin él. Las capturas son de trabajo y NO entran al
repo; lo que se vio queda acá.

**El taller mira el modelo, no la cuenta de siempre.** En una familia con modelos aparece
«modelo» (los de `PALETA_3D`, con «≈» los estimados). El mueble se arma con las medidas de
la ficha y con la ficha ESTAMPADA (`fichaDe`), como lo coloca la paleta, y los botones de
«dónde» y la toma de cerca salen de la misma geometría (`geometriaDe`). Antes el taller
dibujaba la cuenta de siempre: una nevera de 4 puertas se miraba con las puertas que salen
del ancho. «Al lado» dibuja SIN ficha el modelo base con sus medidas (lo que hoy coloca el
editor) o el mismo tipo con las medidas del modelo (lo que la ficha cambia, y nada más). La
toma fija se aleja también por el ancho —la nevera de 4 puertas salía cortada— y lo que
haga falta para que la esquina de abajo entre en el cuadro. Sin producto, la nevera se
dibuja sin su relleno mudo, para mirarle las rejillas y las puertas. En el contenedor de
esa sesión no estaba el Playwright de Python que usa `scripts/taller/mirar-mueble.py`: se
usó el de Node (`/opt/node22/lib/node_modules/playwright`) con los mismos pasos.

**Lo que se vio, contra la ficha:**

- **Neveras de 1 a 4 puertas.** Las puertas son las de la ficha, con hojas de 0,72, 0,72,
  0,69 y 0,68; el copete de 14 cm lleva el aviso luminoso (R3 estima el cabezote en 15 a
  25) y el zócalo de 17, su rejilla. El producto queda detrás del vidrio y adentro del
  gabinete. Se lee como nevera de puertas de supermercado. Quedan dos diferencias:
  - **Las repisas no son las de la ficha.** Las cuatro fichas dicen 4 por puerta y el
    dibujo pone 5 más el piso (6 filas de producto), porque las rejillas salen del alto
    (`nivelesDeNevera`, una cada ~30 cm) o se acomodan al producto en prueba. El plan
    preveía `repisasPorPuerta` y no se hizo. Llevarlo a la ficha toca la cuenta única de
    la nevera: dibujo, relleno, venta y rejillas automáticas.
  - **Las manijas.** Con 2 puertas se enfrentan en el medio; con 3 y 4 sólo se enfrenta la
    última pareja y las demás abren todas hacia el mismo lado. Ninguna ficha dice cómo
    van: queda así hasta tener una referencia.
- **Puesto de impulso.** 0,80 × 0,40, la tapa a 1,00 y la cenefa de 30 cm hasta los 2,00
  sobre dos mástiles en las esquinas de atrás, con aire entre la tapa y la cenefa: lo de la
  ficha de Grupo SRM. Nada flota. Con producto y sin él se ve igual, a propósito: no lleva
  producto inventado y sólo cambia la franja de estado.
- **Estiba completa, media y cuarto.** La tarima tiene la huella de cada ficha (1,20 ×
  1,00; 1,00 × 0,60; 0,60 × 0,50), con su hueco para la uña, y la torre se apoya en la
  cubierta sin aire entre tendidos. Queda abierto que **la torre no llega al fondo de la
  tarima**. El relleno de un mueble que se vende entero se apila hasta
  `PROFUNDIDAD_DE_MUEBLE_ENTERO` (5) unidades hacia atrás (`muebles/frentes.ts`), y con
  cajas de 7 cm eso cubre unos 40 cm. En la completa, de 1,00 de fondo, queda más de media
  tarima vacía detrás. Se ve en tres cuartos y, sobre todo, desde arriba, que es como más
  se mira el plano. Viene de antes: el exhibidor de piso de 0,80 ya lo tenía. No se tocó
  porque cambia cómo se dibuja cada estiba con contrato de los planos de hoy. (Arreglado
  esa misma tarde para la estiba colocada desde un modelo: ver *La revisión de la rama*.)
- **Exhibidor de cartón.** Mide 0,60 × 0,40 × 1,70, con cuatro bandejas y cabezote, como el
  valor sugerido. Se dibuja con la forma del impulsador, como pedía el plan, y **esa forma
  no se lee como un exhibidor de cartón**. Es una columna central con bandejas en voladizo,
  sin los costados ni el fondo de cartón que tiene uno de verdad. Además, la columna
  atraviesa el producto de cada bandeja: de frente se ve como un mordisco en el centro.
  Necesita un dibujo propio: dos costados, el fondo, cuatro bandejas y el cabezote de unos
  30 cm de R3. No es un arreglo chico. (Lo tiene desde esa misma tarde: ver *La revisión de
  la rama*.)
- **Góndola central de 2,00 con 4 entrepaños y módulo de 1,00**, al lado de la misma sin
  ficha. El modelo lleva la base y cuatro entrepaños con producto en las cinco filas, y el
  corrido de 3 m partido en tres módulos de 1,00. La cuenta de siempre da cinco entrepaños
  (en el de arriba no cabe producto) y dos módulos de 1,50. El modelo coincide con la
  ficha de Vialambre.

**Lo que se arregló.** Los tres arreglos son de `ImpulsadorMesh`, que dibuja el exhibidor de
cartón y también el impulsador de siempre:

- **Cada bandeja se inclina sobre sí misma.** El grupo giraba desde el origen del mueble y
  las bandejas se corrían hacia atrás el 3,5 % de su altura: 4 cm la de 1,12 m. El
  producto, que no gira, quedaba volando delante del filo y el porta-precios, enterrado en
  la primera fila. El mural de vegetales había tenido el mismo error.
- **La cara blanca del cartel va pegada al cartel.** Estaba en el filo del mueble, 13 cm
  por delante de la espina y sin nada que la sostuviera.
- **El cartel no pasa del alto del mueble.** Asomaba 5 cm por encima del alto declarado y
  de la tapa. Ahora ocupa los últimos 24 cm del alto y termina bajo la tapa.

Esto cambia el dibujo del impulsador en los planos de hoy, pero no su medida, su cara ni lo
que se vende: es la corrección de piezas que flotaban. Lo vigila la guarda «el impulsador
inclina cada bandeja sobre sí misma y su cartel no vuela» de `probar-muebles`. Otra guarda,
«/taller mira cada modelo con su ficha estampada», cuida lo del taller.

**Cómo se comprobó.** `tsc` limpio; `npm run probar`, 842 verdes; `npm run build` limpio,
con el pedazo de entrada en los mismos 340,7 kB; `import app.main` y el pytest de catálogo,
modelos, caras, renumeración, corte y ficha del layout, planilla, vendible, métricas y
detalle de la plataforma, enlace de montaje y estado comercial, todo verde. Hubo 11
mutaciones y cada una hizo fallar su guarda:

- la bandeja que vuelve a girar desde el origen, o que suma `sy` dos veces en la tabla o en
  el porta-precios;
- la cara del cartel de vuelta en el filo;
- el cartel centrado como antes, o con su alto entero;
- el taller sin la ficha, vendiendo con la cuenta de siempre, con ficha en el de al lado,
  encuadrando por el ancho sólo con otro al lado, o sin la lista de modelos.

Las capturas del impulsador y del exhibidor de cartón, antes y después, muestran las
bandejas debajo del producto y el cartel en su lugar.

### La revisión de la rama (2026-10-14)

Tres revisiones adversariales de la rama (lógica y planos viejos, reglas y privacidad, y 40
mutaciones contra las guardas) dejaron doce hallazgos. Los planos de antes —sin `modelo`,
entrepaños, módulo ni partes— dan lo mismo que antes en las 73.482 comparaciones de la
primera: lo que encontraron está en lo nuevo. Cada uno se reprodujo, se arregló con el
cambio mínimo y quedó con una prueba que falla sin el arreglo:

- **Deshacer el panel no se guardaba (alto).** «Entrepaños» o «Módulo» escritos sobre una
  góndola que no tenía la clave, y después Ctrl+Z: el store reponía el arreglo de antes,
  con la clave AUSENTE, y `PUT /layout` la rellenaba con lo deshecho. El editor dibujaba la
  cuenta de siempre y la base guardaba los entrepaños deshechos, que eran los que veían el
  visor de otro equipo, la mercaderista y el mismo editor al recargar. Ahora deshacer y
  rehacer pasan por `conFichaQuitada` (`utils/guardadoDelPlano.ts`): la clave que el plano
  repuesto no tiene y el de ahora sí vuelve en `null`. `probar-geometria` corre el store de
  verdad con la red cambiada por una que anota el cuerpo de cada `PUT`, y exige
  `"entrepanos":null` después del deshacer. En el mismo módulo quedaron `sinComercial` (lo
  que viaja en el `PUT`) y `CLAVES_DE_FICHA`; no importa nada, así que el store —que va en
  el pedazo de entrada— no arrastra el catálogo.
- **El panel contaba los entrepaños en otra unidad.** En la góndola sin entrepaños guardados
  el de arriba es techo, sin producto, y el panel lo contaba: la de 1,80 decía «auto (5)» y
  escribir 5 daba seis filas de producto, con otras alturas, sobre una cara vendida (y el
  aviso decía «de 5 a 5»). `geometriaALaVista` cuenta ahora los que llevan producto (las
  filas menos una, de `filasDeProducto`): esa góndola dice 4 «más uno de techo». La
  cantidad se compara en esa unidad, así que escribir el número sugerido reparte los
  entrepaños parejo —avisa, no bloquea— y el aviso lo dice así.
- **Un mueble de otro tipo con el mismo `id` heredaba la ficha.** `_con_la_ficha_de_antes`
  compara además el tipo de verdad (`tipo_base`: `gondola_mural` es `gondola`).
- **La mercaderista recibía la ficha sin tipar.** `modelo`, `entrepanos` y `modulo` estaban en
  la lista blanca de montaje y pasaban con lo que trajeran (un objeto con plata, un texto
  con un proveedor). Ahora se copian como en `sinDatosComerciales`: texto y números.
- **Las centrales estimadas de 1,50** decían tomar los entrepaños de la de alto parecido y
  tenían 3: tienen 4, los de Vialambre. `probar-catalogo` exige que los modelos de una
  familia y un alto tengan los mismos entrepaños (el módulo es el ancho, no cambia cuántos
  van). **La confiabilidad de más**: la nota de la Vialambre de 1,50 dice que su 1,00 es el
  0,97 redondeado al módulo, y la de las centrales de GMC que los entrepaños no son de la
  ficha de la doble sino de la sencilla —o de Vialambre e Industrias Cruz en la de 2,00—:
  son una estimación.
- **Los ids de los modelos sólo admiten sumar**: `frontend/scripts/casos/modelos-ids.json`.
- **Guardas sobre el código de verdad.** Varias probaban una copia de lo que hace el editor
  y no la línea que lo hace. Ahora fallan si: el Editor 3D o el plano 2D colocan sin
  estampar la ficha (`...fichaDe(placingDef)` en `newFix`, `nace` en `placeItem`, el
  `pendingModelo` del clic); el guardado saca los `null` (el cuerpo del `PUT`, ejecutado);
  alguien le pregunta la tarifa a `rateTypeOf` con un objeto armado o con `.type` en vez del
  mueble (se revisan todas las llamadas); la lámina de `GondolaMesh`, el producto de prueba
  de la nevera de puertas o cualquiera de las cinco ventas del editor dejan de usar la ficha.

**Lo que se vio en `/taller`, y se arregló sólo para lo colocado desde un modelo.** La torre
de la estiba se apila hasta el FONDO de la tarima (`hondo: "todo"` en `VendidoEntero`, que
pide `IslaMesh` cuando el mueble tiene `modelo`): la completa de 1,20 × 1,00 mostraba más de
media tarima vacía desde arriba; ahora la torre ocupa de 0,86 a 0,94 m de los 0,96 útiles
según el empaque (lo que sobra es menos de una caja), con 360 a 1.540 cajas. El
**exhibidor de cartón** tiene su dibujo (`ExhibidorCartonMesh`): dos costados y el fondo de
cartón, el zócalo cerrado con la franja de estado, bandejas planas de costado a costado con
el frente doblado y el cabezote al frente, sin la columna del impulsador que mordía el
producto al medio. Las bandejas, el cabezote (24 cm; R3 dice unos 30) y el arte salen de la
misma cuenta que el impulsador (`getPanelShelfSpan("impulsador")`), así que el arte del
proveedor cae igual sobre cada bandeja. Una estiba o un impulsador SIN modelo —todo lo de
los planos de hoy— se dibujan exactamente como antes; se miró la estiba de 1,20 × 0,80 de
siempre con las cinco filas. Las capturas, de trabajo, no entran al repo.

**Cómo se comprobó.** `tsc` limpio; `npm run probar`, 851 verdes (eran 842); `npm run build`
limpio, con el pedazo de entrada en 341,0 kB (el store ahora importa `guardadoDelPlano`, que
no arrastra nada); `import app.main` y pytest de catálogo, modelos, caras, renumeración,
corte y ficha del layout, planilla, vendible, métricas y detalle de la plataforma, enlace de
montaje y estado comercial: 240 verdes. 32 mutaciones, y cada una hizo fallar su guarda:
deshacer y rehacer sin el `null`, `conFichaQuitada` que no hace nada, el guardado que saca
los `null`; el panel que vuelve a contar el techo, que compara la cantidad por el campo o
que dice «de N a N»; el 3D y el 2D que colocan sin la ficha y el clic sin el modelo; el
contrato y el tablero que preguntan la tarifa con el tipo; la lámina de la góndola, la venta
de la nevera y tres ventas del editor sin la ficha; la estiba con modelo como siempre, la
de antes hasta el fondo, «hasta el fondo» ignorado o sin traducir; el cartón dibujado como
impulsador, con columna o con otra cuenta de bandejas; la central de 1,50 con 3; un id
renombrado (de los dos lados); el servidor sin mirar el tipo o sin los alias; y montaje sin
el tipo del modelo o de los entrepaños.

### Fichas propias del cliente (2026-10-14)

Lo que hay que saber de las fichas propias sin leer las cuatro secciones que siguen (el
servidor, la pantalla, el nombre propio y el recorrido), y lo que cambió en la revisión de la
rama. La meta es de la dueña: que cada supermercado arme sus muebles **sin pedirnos un cambio**.

- **La tabla y su clave.** `modelos_mueble`, en la base de CADA supermercado, de negocio
  (`TABLAS_DEL_CLIENTE`: viaja en el traspaso y en la copia de seguridad, sin archivos). Clave
  primaria entera que no se reutiliza; `clave` única, `^[a-z0-9-]{1,60}$`, que el plano guarda
  en el mueble como `modelo: "cli:<clave>"` y **no cambia nunca** —tampoco la familia ni la
  tarifa: el `PUT` las rechaza—, porque lo colocado busca su tarifa por ella. Casi todo va en
  `datos_json` (variante, medidas, entrepaños, módulo, puertas, tarifa, fuente): desplegada,
  esta tabla tampoco podrá ganar columnas.
- **Quién crea y quién ve.** Crea, cambia, retira y reactiva **administración**, en `/taller` →
  «Fichas» (la dueña entra con su cuenta de dueña, que es admin). La lee **cualquier sesión de
  ese supermercado** —el trabajador también, sin `creado_por`—: las paletas, el panel y la
  tarifa las necesitan. Otro supermercado no las ve (cada uno tiene su base), la consola de la
  plataforma sólo usa su tarifa (`tarifas_propias`), y en el navegador nunca se guardan en
  `localStorage`.
- **Una validación, la del catálogo.** `fichas` de `muebles.json` (las dos copias idénticas):
  `problemasDeLaFicha` en el navegador y `problemas_de_la_ficha` en el servidor dicen lo mismo,
  y corren los mismos 90 casos (`frontend/scripts/casos/fichas.json`). Familia con `rango`,
  medidas en rango, sólo la geometría de su familia, textos con largo máximo, la fuente con su
  confiabilidad (`ficha`/`catalogo`/`estimado`) y una URL o una nota. El formulario además
  marca los entrepaños que no caben a 25 cm, que el servidor no puede ver.
- **La tarifa.** Una ficha no lleva plata: lleva, si acaso, la clave de una fila de Tarifas que
  su familia ya tiene (media o cuarto de estiba, exhibidor de cartón). `rateTypeOf` ↔
  `tarifa_del_mueble`, con los 18 casos compartidos de `casos/tarifas.json`; la planilla y la
  consola leen las fichas UNA vez por pedido. Un `modelo` que no es texto da la tarifa del tipo
  en los dos lados.
- **Retirar no borra.** Es baja lógica: la ficha deja de ofrecerse en las paletas del plano y
  del Editor 3D, y lo colocado con ella sigue igual —tiene la ficha ESTAMPADA, con sus medidas,
  su geometría y su `modelo`—, se sigue cobrando con su tarifa y el panel la nombra «(retirada)».
  La clave de una retirada no se reutiliza. Reactivar la vuelve a ofrecer.
- **Sin foto.** La dueña no tiene fotos de sus muebles: no hay campo ni subida de imágenes. La
  fuente es la página de la ficha técnica, nunca una imagen (`fuenteQueEsImagen`), y sólo se
  muestra en un `title` al pasar el mouse, nunca como enlace.
- **Los nombres propios.** Cada supermercado le pone su nombre a cada familia («mamut», «tope de
  góndola») en Configuración → «Cómo se llaman los muebles acá». Se ven en el plano 2D, el
  Editor 3D, Vender (la lista, el visor y la lámina del proveedor), Supervisar, Estado por
  espacio, Montajes, Tarifas y el taller. **No** se ven en la consola de la plataforma ni en los
  informes de asesoría (comparan supermercados con el nombre de RECABRA), ni en el enlace de la
  mercaderista (no tiene sesión). Nada se guarda en el plano: el `label` del mueble sigue siendo
  el de RECABRA.

**La revisión de la rama (2026-10-14).** Tres revisiones —regresión y datos (con Postgres 16),
seguridad, y mutación de las guardas— y el recorrido de la dueña en el navegador. Lo que
encontraron y quedó arreglado, cada cosa con su guarda:

- **Vender arrancaba con la tarifa equivocada.** El precio inicial de cada espacio se escribía
  UNA vez; con las fichas propias depende de `GET /api/muebles/modelos`, que llega aparte, y una
  media estiba propia tocada antes quedaba en 3.000.000 (estiba entera) en vez de 900.000, que
  es lo que dan la planilla y la consola. Ahora **el campo sigue a la tarifa mientras nadie lo
  toque** (`utils/precioDeLista.ts`, `valoresDeLista`): lo tecleado —también borrarlo— y la
  semilla de una renovación no se pisan. Y si la lectura de las fichas falla (un 502), el store
  **reintenta solo**, a los 2, 4, 8… segundos hasta un minuto, mientras siga la sesión
  (`store/fichasPropias.ts`); antes sólo reintentaba al montar otra pantalla, y en Vender eso
  no pasa nunca.
- **Un `modelo` que no es texto dejaba la aplicación en blanco.** `PUT /layout` guarda el mueble
  como llega, y un `modelo: 5` escrito a mano por la API rompía `modeloPorId` (`startsWith`) en
  todas las pantallas del supermercado, trabajadores incluidos. Ahora lo que no es texto no es
  un modelo, como ya hacía el servidor; cuatro casos nuevos en `casos/tarifas.json`.
- **Un nombre propio viejo trababa la lista de sedes.** El lápiz de la biblioteca del 2D no
  tenía tope antes de c190158, y el validador nuevo rechazaba con 422 TODO el `PUT
  /layout/settings` —que es el mismo que guarda las sedes— si un nombre pasaba de 80 letras:
  ese supermercado no podía agregar, renombrar ni quitar una sede. Ahora **se recorta, nunca se
  rechaza** (`nombres_propios_recortados` en `schemas/layout.py`, al guardar y al leer): sin
  espacios a los costados (un nombre con un millón de espacios pesaba un mega en cada lectura),
  cortado a 80 letras, y sin lo que no puede ser un nombre (una clave de más de 60, más de 100).
- **Un número gigante daba 500.** Un entero de JSON de cientos de cifras no entra en un `float`
  y `math.isfinite` lanzaba `OverflowError`: ahora es un 422 por campo, como cualquier medida
  mala.
- **«Una ficha no lleva foto» se saltaba** con `foto.png#1`, `foto.jpg;v=1`, `foto.png%3Fv=1` o
  `foto.webp&w=800`. La expresión compartida mira ahora también `#`, `;`, `&` y `%` después de
  la extensión (`.png-ficha-tecnica/` sigue siendo una página); cinco casos nuevos.
- **Las guardas no miraban el cableado.** Once mutaciones pasaban la suite entera en verde. Ahora
  se prueban: el hook `useFichasPropias` (montar una pantalla las pide UNA vez por sesión, otra
  pantalla no, otro token u otro supermercado sí) y que quien está suscripto se entera al
  fijarlas y al olvidarlas (`probar-catalogo`, con un React de mentira); retirar y reactivar en
  el orden correcto, por `retirarOReactivarFicha` (`utils/formularioDeFicha.ts`, puro); que las
  paletas de los dos editores dibujen la familia ENTERA, sin filtro; que cada pedido de
  `api/muebles.ts` sea una ruta del servidor con su método (`test_fichas_propias.py`); que los
  nombres propios BAJEN del servidor al abrir la sesión sin pisar uno que se está guardando; y
  que cada `nombresPropios` de las pantallas del supermercado sea la lectura del store, no uno
  por archivo (`probar-nombres`).

Lo que se vio en el recorrido y no es de esto (el doble `PUT /layout/settings` de `StrictMode`
en desarrollo, el aviso de React al colocar en el 3D, el 403 de `/clientes/mi-suscripcion` para
un administrador que no es la dueña) está en *Fichas propias: el recorrido en el navegador*.

### Fichas propias: el servidor (2026-10-14)

La meta de la dueña: que cada supermercado —el próximo es uno como Galerías o Cañaveral—
arme sus muebles **sin pedirnos un cambio**. Los modelos de RECABRA viven en `muebles.json` y
cambian con un despliegue; los de cada supermercado viven en su base. Ella no tiene fotos de
sus muebles, así que la ficha es sólo familia, nombre, medidas, la geometría de su familia y
de dónde salió (URL, nota y confiabilidad `ficha`/`catalogo`/`estimado`). Este paso es el
servidor; la pantalla (el taller y las paletas) es el que sigue (*Dónde retomar*).

**La tabla.** `modelos_mueble` (`models/models.py`, `ModeloMueble`), en la base de CADA
supermercado y clasificada en `TABLAS_DEL_CLIENTE`: viaja en el traspaso y en la copia de
seguridad. `id` entero con `sqlite_autoincrement` (no se reutiliza); `clave` única,
`^[a-z0-9-]{1,60}$`, que es lo que guarda el plano como `cli:<clave>` y no cambia nunca —una
retirada conserva la suya: otra con la misma clave le cambiaría la tarifa a lo colocado—;
`tipo` (la familia, String y no `SAEnum`), `nombre`, `datos_json` (variante, `w`/`d`/`h`,
`entrepanos`, `modulo`, `partes.puertas`, tarifa, fuente), `retirado_en` (la baja lógica),
`creado_en`, `actualizado_en` y `creado_por`. Casi todo va en el JSON porque, desplegada, esta
tabla tampoco podrá ganar columnas. La clave primaria es el entero a propósito (la crítica del
plan): la copia de seguridad arma las rutas de los archivos con la clave primaria, y una ficha
no tiene archivos, así que sale sólo en `tablas/modelos_mueble.json`.

**Una validación, la del catálogo, en los dos lados.** Las reglas que antes estaban escritas
dentro de `probar-catalogo.mjs` —la confiabilidad, qué geometría puede fijar un modelo y dónde
vive, qué URL es una imagen— y las nuevas —la clave, los largos máximos (nombre 80, URL 500,
nota 600) y el prefijo `cli:`— viven ahora en `fichas` de `muebles.json`, que leen los dos
lados. `problemas_de_la_ficha` (`services/catalogo_muebles.py`) y `problemasDeLaFicha`
(`src/catalogo/fichas.ts`) dicen lo mismo: la familia existe y tiene `rango`; la variante si la
tiene (la góndola); las medidas dentro del `rango`; sólo la geometría de su `geometria`, en
rango y entera donde va; una tarifa propia sólo si es una de las de los modelos de su familia
(la media o el cuarto de estiba, el exhibidor de cartón: las que Tarifas ya ofrece); la fuente
con su confiabilidad y una URL http(s) que no sea una imagen, o una nota; ni foto ni nada que
no sea de la ficha. Los dos corren los 85 casos de `frontend/scripts/casos/fichas.json`
(`probar-fichas.mjs` y `tests/test_fichas_propias.py`), que comparan los CAMPOS con problemas,
y los 36 modelos del catálogo pasan la validación de una ficha propia. Lo que NO valida el
servidor: que los entrepaños quepan a 25 cm (`entrepanosQueEntran`, que depende de cotas del
dibujo en `medidas.ts`); eso lo tendrá que marcar el formulario del taller.

**La API** (`routers/muebles.py`, prefijo `/api/muebles`; `/api/catalogo` es el de las artes):
`GET /modelos` para cualquier sesión del supermercado (no lleva plata: la tarifa es la clave de
una fila, y quién la creó sólo lo ve administración), retiradas incluidas con `retirado: true`;
`POST /modelos` y `PUT /modelos/{clave}` sólo administración, con 422 en la forma de FastAPI
(`loc` por campo) y 409 si la clave ya existe, aunque esté retirada; `POST
/modelos/{clave}/retirar` y `/reactivar`. El `PUT` reemplaza la ficha entera y rechaza cambiar
la clave, la familia o la tarifa: lo colocado busca la tarifa por la clave y la compara con su
tipo. Alta, cambio (con qué grupos cambiaron: nombre, medidas, geometría, fuente), retiro y
reactivación van a la bitácora (`ficha_mueble.*`; retirar no termina en `.baja`: no borra).
Las salidas tienen la misma forma que un modelo de `muebles.json`, para que las paletas las
traten igual.

**La tarifa de una ficha.** `tarifa_del_mueble(fixture, propios)` resuelve también `cli:…`, con
la misma regla que los modelos base (sólo si la ficha es del tipo del mueble; un modelo del
catálogo no puede ser pisado por una ficha). `propios` lo arma `fichas_propias.tarifas_propias`
con UNA consulta —retiradas incluidas— y lo piden la planilla (`bulk_leases._revisar`, una vez
por planilla) y la consola (`plataforma_metricas._numeros_del_layout`, una vez por cliente: de
ahí salen las métricas, el spread y el detalle por cliente). Las pruebas cuentan las consultas.

**Lo que no cambió.** Ningún plano: un mueble colocado con una ficha la tiene estampada y no se
relee (cambiar o retirar la ficha no le toca nada; lo prueba `test_fichas_propias`). Ninguna
tabla vieja ganó columnas (`test_t22` verde), ningún código de espacio ni id de modelo base.
El pedazo de entrada del navegador es byte a byte el mismo: nadie importa todavía
`catalogo/fichas.ts` y Rollup deja afuera `fichas` del JSON.

**Cómo se comprobó.** `tsc` limpio; `npm run probar` (31 guiones, con `probar-fichas` nuevo)
y `npm run build` limpios; `import app.main` y pytest de fichas propias (18, nuevo), catálogo,
modelos, ficha y corte del layout, planilla, traspaso, copia de seguridad, bitácora,
métricas, spread y detalle de la plataforma y tendencia (t22): 253 verdes y el salto de
siempre. 37 mutaciones —el rango, la geometría, la clave con `match`, la URL de cualquier
esquema, la imagen, la tarifa de otra familia, la foto, las reglas copiadas a mano (de los dos
lados), el worker que crea, retira o ve el autor, la tarifa, la familia o la clave que se
editan, retirar que borra o no anota, la clave retirada reutilizada, la tarifa sin las fichas,
sin mirar el tipo o pisando al catálogo, la planilla y la consola que leen por fila o por
plano o no leen, las retiradas sin tarifa, la tabla sin clasificar o fuera de la copia, ids
reutilizados, las rutas fuera de orden, `in` en vez de `hasOwnProperty`, los largos en
unidades UTF-16 y `probar-catalogo` sin las reglas— y cada una hizo fallar su guarda.

### Fichas propias: la pantalla (2026-10-14)

El servidor de las fichas propias estaba (*Fichas propias: el servidor*); faltaba que la dueña
pudiera usarlo sin pedirnos nada. Ahora arma la ficha en el taller y la coloca desde las paletas
de los dos editores, como un modelo de RECABRA.

**Dónde viven en el navegador.** `catalogo/propias.ts` guarda la lista que manda `GET
/api/muebles/modelos` (retiradas incluidas) y no importa nada: es donde las busca
`modeloPorId` —y con él `rateTypeOf`, el nombre del panel y la sugerencia de «Alto»,
«Entrepaños» y «Módulo»—, primero el catálogo y después las propias, sólo con el prefijo `cli:`
(una ficha propia no puede hacerse pasar por un modelo de RECABRA). La llena
`store/fichasPropias.ts` UNA vez por sesión (`useFichasPropias()`, que además vuelve a dibujar a
quien la llama) y otra vez cuando el taller guarda, retira o reactiva una
(`recargarFichasPropias`). No se guarda en `localStorage`: un ingreso nuevo —o de otro
supermercado en la misma máquina— las olvida ANTES de leer las suyas, una respuesta de la
sesión anterior que llega tarde no las pisa, cerrar la sesión las olvida y, sin red, se queda
sin ellas (los muebles colocados se dibujan igual: tienen la ficha estampada) y reintenta en la
próxima pantalla. No viaja en lo que baja la landing: la piden el tablero, los editores y el
taller (`probar-catalogo` mira el grafo de `main.tsx`; el pedazo de entrada siguió en
352,43 kB). `api/muebles.ts` tiene los cinco pedidos.

**La pestaña «Fichas» de `/taller`** (`components/taller/PanelDeFichas.tsx`, sólo
administración, como el taller). A la izquierda el formulario y la lista; a la derecha el
mueble con ESA ficha, girando:

- **Familia**: las que admiten fichas (las que tienen `rango`), con la góndola dos veces
  —«Góndola Doble (central, dos caras)» y «Góndola Mural (de pared, una cara)»—, porque de la
  variante dependen las caras. **Nombre** y **clave** (sale del nombre sin tildes mientras no
  se la toque: «Góndola de pared 1,70» → `gondola-de-pared-1-70`; «es lo que guarda el plano:
  no cambia nunca»).
- **Medidas en centímetros**, como vienen en una ficha técnica, con el rango de la familia al
  lado de cada una («de 60 a 320 cm»); en la góndola el ancho es «Ancho de un módulo».
- **Cómo es por dentro**, sólo lo que su familia admite: puertas (la nevera de puertas),
  entrepaños por cara sin la base y módulo (la góndola y la punta). Vacío es la cuenta de
  siempre. El tope de entrepaños dice cuántos caben **con ese alto** a 25 cm.
- **Tarifa**: «La de su familia (…)» o una de las propias de la familia que ya existen (media
  y cuarto de estiba, exhibidor de cartón).
- **De dónde salió**: URL de la ficha técnica («la página, no una foto»), nota con sus
  palabras (con el contador de 600) y cuánto confiar, en palabras: «Ficha técnica: la página
  trae las medidas», «Catálogo: salen del título o de un listado», «Estimado: medido a ojo o
  deducido (lleva «≈»)». Sin foto ni subida de imágenes.
- **Guardar** pasa por `guardarFicha` (`utils/formularioDeFicha.ts`, puro): valida con
  `problemasDeLaFicha` —las mismas reglas que el servidor— más los entrepaños a 25 cm
  (`entrepanosQueEntran`, que el servidor no puede ver), dice cada problema debajo de su campo
  y en centímetros («el ancho (400 cm) está fuera del rango de su familia (60 a 320 cm)»), y
  **no llama a la API** si hay uno. Lo que diga el servidor vuelve igual, por campo: un 422 con
  sus palabras, un 409 debajo de la clave («Ya hay una ficha con la clave … (retirada). Las
  claves no se reutilizan…»), sin red «la ficha no se guardó». Al editar, la familia, la clave
  y la tarifa están quietas y dicen por qué.
- **La lista**: «Tus fichas» con Editar y Retirar (retirar pregunta y dice que lo colocado
  sigue igual), y las retiradas aparte, plegadas, con Reactivar.
- **El mueble que se ve** sale de `fichaParaDibujar` (lo escrito, metido en el rango para no
  dibujar una góndola de 30 m mientras se tipea) pasado por `defDeModelo` —la MISMA función
  con que se arma la entrada de la paleta— y dibujado con la ficha estampada (`delCatalogo`
  con `modelo`). La cámara arranca a tres cuartos encuadrando el mueble entero y «girar» lo
  hace dar vueltas. «Mirar» lista también las fichas propias en «modelo».

**Las paletas.** `paletaConPropias(propias)` (`catalogo/editor3D.ts`) y
`modelosDelPlanoConPropias(propias)` (`catalogo/plano2D.ts`) ponen cada ficha vigente debajo
de su familia —la central en `gondola_doble`, la de pared en `gondola_mural`—, DESPUÉS de los
modelos de RECABRA, con su nombre y «≈» si es estimada; las retiradas no aparecen. Sin fichas
propias devuelven `PALETA_3D` y `MODELOS_2D` mismas, y una familia sin propias es el mismo
objeto (el 3D compara la entrada elegida por identidad). Una ficha propia se coloca con el
rótulo y el emoji de su familia, el COLOR de su familia (no lleva color) y sus medidas y su
geometría: `defDeModelo` y `modeloDelPlano`, las mismas que arman los modelos del catálogo.
Colocarla estampa `modelo: "cli:<clave>"` por el camino de siempre (`fichaDe` en el 3D, `nace`
en el 2D). El panel de los dos editores nombra el modelo (`nombreDeModelo`, con «(retirada)»
si lo está) y la fuente al pasar el mouse (`textoDeFuente`: una ficha propia puede tener sólo
la URL o sólo la nota).

**La tarifa.** `rateTypeOf` no cambió: `tarifaDeModelo` busca por `modeloPorId`, que ahora
encuentra también las propias, con la misma regla que `tarifa_del_mueble` del servidor (sólo
si la ficha es del tipo del mueble; las retiradas siguen cobrando lo que cobraban). Los dos
lados corren los 14 casos de `frontend/scripts/casos/tarifas.json` (`probar-catalogo` y
`test_fichas_propias.py`, que las carga en la base y las lee con `tarifas_propias`, como la
planilla y la consola). Como las fichas llegan DESPUÉS del primer dibujo, el tablero
(`DashboardView`, `SpacesTable`), el contrato (`useContrato`) y Vender (`Ficha`) escuchan
`useFichasPropias()` y ponen `fichasPropias` en cada `useMemo`/`useCallback` que pregunta la
tarifa; sin eso la media estiba propia se mostraba y se comparaba como estiba entera hasta que
cambiara otra cosa.

**Cómo se comprobó.** `tsc` limpio; `npm run probar`: 31 guiones, 887 «ok» (eran 879), con
guardas nuevas en `probar-catalogo` —la paleta y la biblioteca con las propias, colocar estampa
`cli:` y cambiar o retirar la ficha no mueve lo colocado, los editores y el panel que las usan,
la tarifa con los casos compartidos, el cargador por sesión, los cálculos que vuelven a
preguntar la tarifa, el formulario que valida antes de mandar y las fichas fuera del pedazo de
entrada— y en `probar-muebles` («/taller «Fichas» dibuja la ficha que se escribe»); `npm run
build` limpio, entrada en 352,43 kB. pytest con la prueba nueva de la tarifa compartida.
Mirado en el navegador contra un servidor local descartable: con 400 cm de ancho el formulario
marcó el ancho, la fuente y la confiabilidad sin mandar nada; guardó la nevera Inducol de 2
puertas, una góndola de pared estimada y una media estiba que después se retiró; la clave
repetida dio el 409 debajo de la clave; la biblioteca del 2D y la paleta del 3D mostraron las
dos vigentes al final de su familia (la «Góndola Mural» con 13 modelos) y no la retirada; la
nevera colocada en el plano quedó con `modelo: "cli:nevera-inducol-2-puertas"` y el panel la
nombró con su URL. 33 mutaciones, cada una hizo fallar su guarda (ver el commit).

**Lo que queda.** Que la dueña haga el flujo ella misma (ya se recorrió en el navegador: ver
*Fichas propias: el recorrido en el navegador*), la revisión adversarial
de la rama. La tarifa propia de una ficha sólo puede ser una de las que ya tiene su familia
(decisión del paso del servidor, a confirmar con ella). Un mueble con `cli:` de una ficha que
esta sesión no pudo leer (sin red) se dibuja bien pero el panel no lo nombra y la tarifa es la
del tipo hasta que se lean (desde la revisión, el store reintenta solo y el precio de Vender se
corrige cuando llegan, si nadie lo tocó: ver *Fichas propias del cliente*).

### Cómo le dicen acá: el nombre propio de cada familia (2026-10-14)

Cada supermercado le dice distinto a sus muebles: lo que RECABRA llama «Estiba (exhibición de
piso)» en uno es el «mamut», la punta es el «tope de góndola», el impulsador es la «exhibición
especial». Para que cada uno use RECABRA sin pedirnos un cambio, sus pantallas tienen que hablar
como habla la tienda.

**Lo que había.** Las «etiquetas del catálogo» (`catalogLabels` en el store, `catalog_labels` de
`GET`/`PUT /api/layout/settings`, guardadas en `app_config` como `layout_catalog_labels`, en el
mismo valor que la lista de sedes) existían desde antes, pero sólo las aplicaba la biblioteca del
plano 2D, y se editaban con un lápiz que aparecía al pasar el mouse. En Vender, Supervisar, Estado
por espacio, el panel de los editores y la lámina seguía saliendo el nombre de RECABRA. Se
siguen guardando ahí (sin migración ni columnas: es un valor de `app_config`), por la clave de la
biblioteca del 2D: la góndola tiene dos, `gondola_doble` y `gondola_mural`, porque la central y
la de pared se llaman distinto.

**Dónde se edita.** Configuración (sólo administración) → «Cómo se llaman los muebles acá»: una
fila por familia de la biblioteca del 2D, con el emoji y el nombre de RECABRA a la izquierda y el
de la tienda a la derecha (el de RECABRA de muestra). Se guarda al salir del campo, con el mismo
debounce de la lista de sedes, sin botón, como Tarifas; Esc deshace lo escrito. Vacío, o igual
al de RECABRA, deja la familia sin nombre propio (`nombreParaGuardar`); se corta en 80 letras
—el largo del nombre de una ficha, `fichas.largoMaximo.nombre` de `muebles.json`—, contadas en
letras de verdad. El lápiz de la biblioteca del 2D sigue y guarda por el mismo camino (ahora
también deja vaciar). Lo cambia sólo administración (`setCatalogLabel` pregunta `canWrite`,
como el `PUT`). Si otra estación guardó la lista de sedes en el medio (409), la fusión ya no
resucita un nombre recién borrado (`_nombresQuitados`, que se olvida con los datos de otro
supermercado).

**Dónde se lee** (`catalogo/nombresPropios.ts`, puro salvo `rateTypeOf`):

- `conNombrePropio(f, nombres, deSiempre)`: el nombre del mueble, o el texto que esa pantalla
  mostraba antes, tal cual. Lo usan el encabezado del espacio en el plano de Sede y su panel de
  detalle, el cartel del mouse, «Para revisar» de Supervisar, la paleta, el panel, el cartel y
  «Colocando …» del Editor 3D, el panel del 2D, el aviso de lo que no se alquila en Vender,
  Montajes, la familia del formulario de fichas del taller («mamut — Estiba»), el aviso «ese
  nombre ya lo tiene otro mueble» de los dos editores y **la lámina del proveedor** («Mueble:
  …»), del Editor 3D.
- `tipoDelMueble(f, nombres)`: la columna «Tipo» —Estado por espacio, la lista de Vender, la
  chapa del visor de Vender y su lámina, «Cuándo se libera»—. Es `rateTypeLabel(rateTypeOf(f))`
  con el nombre propio encima, **salvo cuando el mueble tiene ficha con tarifa propia** (la media
  estiba, el cuarto, el exhibidor de cartón, de RECABRA o propias): ahí dice su tarifa, que dice
  más y es la fila de Tarifas que le pone precio. Pregunta la tarifa, así que los `useMemo` que
  la llaman dependen de `fichasPropias` (la guarda de `probar-catalogo` la cuenta como
  `rateTypeOf`) y de los nombres.
- `nombreDeTarifa(clave, nombres)`: las filas por tarifa —«Tarifa de referencia» de Vender y
  Tarifas—. Junta las familias de esa tarifa: la góndola son dos, y con sólo la central
  nombrada dice «góndola de centro · Góndola Mural», sin ponerle a la de pared un nombre que no
  es el suyo. Tarifas dice debajo «… en RECABRA», porque ése es el nombre por el que pregunta
  quien la ayuda desde la consola.
- La búsqueda del plano de Sede, de Estado por espacio y del 2D encuentra también por el
  nombre propio (y sigue encontrando por el de RECABRA).

**Dónde NO.** La consola de la plataforma y los informes de asesoría (`components/plataforma`,
`Plataforma`, `ReportePlataforma`, `DetalleCliente`, `InformeCliente`) comparan supermercados y
nombran con el catálogo (`nombresDeInforme`). Del lado del servidor, sólo `routers/layout.py`
lee la clave, y el detalle, el reporte y las métricas de un cliente con nombres propios no los
devuelven (`test_la_consola_no_usa_el_nombre_propio_del_supermercado`). Tampoco el enlace de la
mercaderista (`/?montar=…`): no tiene sesión ni lee la configuración, y sigue con el de RECABRA.

**Lo que no cambió.** Sin nombre propio, cada pantalla dice exactamente lo de antes: la guarda
lo comprueba para cada tipo, variante, alias y modelo del catálogo y para las fichas propias de
`casos/tarifas.json`. Nada se guarda en el plano: el `label` del mueble sigue siendo el rótulo de
RECABRA (el 2D lo estampa al abrir), y `FilesSection` crea la fila de `spaces` con él. El
servidor cuida el largo (80 letras, a lo sumo 100 nombres, claves de hasta 60) y no valida las
claves contra el catálogo: una clave vieja no puede trabar el guardado de la lista de sedes, que
viaja en el mismo pedido. Desde la revisión de la rama **recorta en vez de rechazar**, al guardar
y al leer: un nombre de más de 80 letras escrito con el lápiz de antes trababa ese guardado (ver
*Fichas propias del cliente*). El pedazo de entrada pasó de 352,43 a 352,53 kB (la fusión del 409 en
el store); el catálogo sigue afuera.

**Cómo se comprobó.** `tsc` limpio; `npm run probar`: 32 guiones (con `probar-nombres`, nuevo,
11 pruebas), 898 «ok» (eran 887); `npm run build` limpio. pytest de los nombres (5, nuevo),
catálogo, modelos, ficha y corte del layout, traspaso, copia de seguridad, borrado de sedes y
fichas propias: 101 verdes; planilla, métricas y detalle de la plataforma (con la prueba de la
consola) y tendencia: 146 verdes y el salto de siempre; t22 verde. En Chromium contra un
servidor local descartable: Configuración mostró las 21 familias; con «Congelador de puertas»,
«Tope de góndola» y «Mamut» el servidor los guardó, Estado por espacio dejó de decir «Nevera de
puertas», la biblioteca del 2D y la paleta del 3D dijeron los tres, y vaciar la punta la sacó
del servidor. 32 mutaciones —cada función, cada pantalla vuelta al nombre de RECABRA, una
dependencia quitada, la consola que importa el módulo, el store que lo importa, el 409 que
resucita, el trabajador que escribe, la sección quitada, el largo en UTF-16 de los dos lados,
el servidor sin topes, otro módulo que lee la clave y el detalle que la devuelve— y cada una
hizo fallar su guarda.

### Fichas propias: el recorrido en el navegador (2026-10-14)

Lo que hace la dueña, de punta a punta, en Chromium contra un servidor local descartable
(SQLite vacía, ingreso por clave sólo en esa máquina), con capturas fuera del repo:

1. **El taller.** «Fichas» → Nevera de puertas, «Nevera Inducol 2 puertas» (la clave sale sola:
   `nevera-inducol-2-puertas`), 144,5 × 74 × 210 cm, 2 puertas, la URL de la ficha de Inducol y
   «Ficha técnica». Ningún problema antes de guardar; el mueble de la derecha es una nevera de
   dos puertas con su cabezote y gira (dos fotos del lienzo a 3 s son distintas). Guardar hace
   UN `POST` y dice «Ya está en la paleta del plano y del Editor 3D, debajo de su familia».
2. **El plano.** La biblioteca muestra «5 modelos» en la nevera de puertas, la propia al final
   (1.445×0.74×2.1 m). Colocada, el panel dice «Nevera de Puertas · Nevera Inducol 2 puertas»
   con la fuente al pasar el mouse, y el servidor guarda `NEV-01` con
   `modelo: "cli:nevera-inducol-2-puertas"`, 1,445 × 0,74 × 2,10 y `partes.puertas: 2`.
3. **El Editor 3D.** La misma ficha en la paleta, colocada como `NEV-02`; vistas de frente, las
   dos neveras tienen dos puertas, repisas y cabezote (la cámara del editor arranca mirando el
   dorso, que es negro: no es un defecto de la ficha).
4. **El nombre propio.** «Enfriador vertical» para la nevera de puertas en Configuración: lo
   dicen la biblioteca y el panel del plano, la paleta del 3D, la Tarifa de referencia, la fila
   del contrato en Vender y la chapa del visor 3D («NEV-01 Enfriador vertical»), y Estado por
   espacio del trabajador.
5. **Venderla.** Postobón, $350.000 al mes: el contrato se guarda por la planilla
   (`/leases/bulk`) y Supervisar sólo pide lo de siempre (por vencer, sin montar); nada de
   «contrato sin mueble en el plano».
6. **Retirarla.** El taller pregunta y dice que lo colocado sigue igual. Después: la biblioteca
   y la paleta vuelven a 4 modelos, el panel de los dos editores dice «Nevera Inducol 2 puertas
   (retirada)», y `NEV-01`/`NEV-02` en el servidor son idénticos a antes de retirar (el
   contrato de `NEV-01` sigue).
7. **El trabajador.** `/taller` lo devuelve a `/`; crear, cambiar o reactivar una ficha con su
   sesión da 403 («Se requiere rol de administrador»), leerlas da 200 sin `creado_por`, y
   cambiar el nombre propio también da 403.

**Lo que se arregló al mirar.** El pie del panel del Editor 3D decía «1.4 × 0.7 × 2.1 m» para
la nevera de 144,5 × 74 cm (`toFixed(1)`), mientras la paleta y el panel del plano decían 1.445
y 0.74: ahora dice las medidas al milímetro, sin ceros de más. Y con todas las fichas retiradas,
«Tus fichas (0)» decía «Todavía no armaste ninguna»: ahora dice «Ninguna vigente: las retiradas
están acá abajo». Las dos con su guarda en `probar-muebles`.

**Ruido que se vio y no es de esto.** En desarrollo, el primer ingreso a una base vacía manda
dos `PUT /layout/settings` (el doble efecto de `StrictMode`) y uno vuelve con 409; la fusión lo
resuelve sola. Colocar en el 3D deja en la consola el aviso de React «Cannot update a component
while rendering a different component»: `u()` escribe en el store adentro del actualizador de
`setPlacedFixtures` (viene de #22). Una sesión de administración que no es la dueña recibe 403
de `/clientes/mi-suscripcion` en cada carga y Configuración muestra en rojo «Solo el owner del
cliente puede hacer esto» bajo Suscripción.

### Vender por partes (2026-10-14)

El resumen de todo lo que se hizo en cinco pasos y una revisión, para retomar sin leer las
seis secciones que siguen (P1 a P5 y *la revisión de la rama*, que tienen el detalle y el
porqué). Lo pidió la dueña: **vender por partes, y que quede configurado para los muebles
que cada supermercado arma con sus fichas propias** y para los modelos de RECABRA.

**Qué se vende por partes.**

| Mueble | Cómo se vende | La parte | Código |
|---|---|---|---|
| Nevera de puertas | entera o por puertas | `PU` | `NEV-03-PU2` |
| Góndola (central o de pared: el mural), nevera abierta (multideck), nevera de vegetales | entera o por tramos | `TR` | `GON-05-B-TR2` |
| Góndola y punta | enteras o por entrepaños | `EN` | `PUN-02-EN1` (la base) |
| Caja (checkout) | **nunca entera**: sus bahías de impulso, una por una | `BI` | `CAJ-04-BI1` |
| Columna | **nunca**: su forro | `FO` | `COL-07-FO` (sin número) |

**La regla: entera o por partes, nunca las dos.** Un mueble se divide de UNA sola forma
(`partes.division` es un solo valor: puertas, tramos o entrepaños, nunca tramos y entrepaños a
la vez). La cara entera SIEMPRE se puede vender; la cara entera y sus divisiones nunca en
fechas que se pisen; dos divisiones distintas, sí (dos puertas, dos tramos); dos de clases
distintas de la misma cara chocan (el tramo 2 y el entrepaño 3 comparten repisa); una pieza
sólo choca consigo misma. Lo decide `chocan` (`services/partes.py` ↔ `utils/partes.ts`, los
mismos casos en `frontend/scripts/casos/partes.json`), lo aplican los cuatro caminos que
escriben contratos (la planilla y Vender, el contrato suelto, la importación del plano) con
un candado por mueble, y compara CÓDIGOS: por eso un mueble que se vende por partes se guarda
con su código completo (*Reglas duras*).

**Los códigos y su numeración.** `SEDE-CODE[-B]-<TOKEN><n>`: la cara B antes que la parte
(`NAVE-GON-05-B-TR2`), la pieza sin cara (`NAVE-CAJ-04-BI1`), el forro sin número. **Una parte
es una fila más de `spaces` / `space_leases` con su código derivado**: sin migraciones, sin
columnas nuevas, sin tablas nuevas; la relación con su cara se deduce del código
(`partirCodigo` / `partir_codigo`). Los códigos existentes no cambiaron, y un mueble nuevo no
puede llamarse como una parte (409 `nombre_reservado`). La numeración:

- puertas y tramos, **de izquierda a derecha mirando el frente de ESA cara** (en la B, la
  izquierda es −X del mueble: `vanoDeParte` para el mueble, `vanoEnLaCara` para el dibujo de la
  cara, cuyo producto va girado media vuelta);
- entrepaños, **de abajo hacia arriba, y el `EN1` es la base**: con 4 entrepaños se venden 5;
- bahías, **de izquierda a derecha mirando la caja desde la fila** (desde el lado del cliente).

**Dónde se configura.** Tres niveles, y sólo el último cuenta para vender:

- la FAMILIA (`muebles.json`, las dos copias idénticas) dice qué formas admite y qué piezas
  lleva (`partes.divisiones`, `partes.piezas`; las clases en `partes.clases`);
- la FICHA dice cuál usa y en cuántas: **los modelos de RECABRA** (neveras de 2, 3 y 4 puertas
  por puertas; los 12 murales por tramos, uno por módulo; lo demás entero) y **las fichas
  propias del taller** («Fichas» → «Cómo se vende»: por puertas, tramos o entrepaños según la
  familia; las bahías de la caja; el forro de la columna), validadas con las mismas reglas en
  los dos lados (`casos/fichas.json`);
- el MUEBLE del plano la lleva estampada en `partes` al colocarse. **Sin `partes.division` (ni
  piezas) se vende y se ve exactamente como antes**, aunque su ficha diga partes: lo ya
  colocado no cambia solo. Se cambia en el panel «Cómo se vende» del plano 2D y del Editor 3D
  (`components/PartesDelMueble.tsx`, el mismo en los dos): elegir la forma, «Usar lo de la
  ficha», «Aplicar lo de su ficha a los N colocados con ella», «Aplicar a todas las cajas de
  la sede», «Fijar 4 tramos, uno por módulo».

**La tarifa, por clase de parte y por sede.** En Tarifas: «Puerta de nevera (cada una)»,
«Tramo (cada uno)», «Entrepaño (cada uno)», «Bahía de impulso de caja (cada una)», «Forro de
columna» (`parte_puerta`, `parte_tramo`, `parte_entrepano`, `parte_bahia`, `parte_forro`), con
el nombre propio de la familia cuando la clase es de una sola. **Vacía, se sugiere la de la
cara dividida por la cantidad de partes**, redondeada al peso con los medios hacia arriba en
los dos lados (`tarifaDeEspacio` ↔ `referencia_de_espacio`); una pieza no tiene respaldo (la
caja no tiene tarifa que dividir). Vender, Supervisar («bajo la tarifa», la franja) y la
planilla cobran la de ESA parte (`comercialDelEspacio`, `tarifaDeLaFila`).

**La guarda de `PUT /layout`.** Con una parte vendida (contrato vivo o firmado para más
adelante) no cambia la cantidad de partes ni la forma de dividir: **409 `partes_vendidas`** si
la parte seguiría existiendo en otro lugar («de 2 a 1 bahía de impulso», «de 5 a 6 entrepaños
(contando la base)») y **409 `contratos_vivos`** si dejaría de existir; el panel lo frena antes
y lo dice sin nombrar a nadie (`revisarCambioDePartes`). Con la cara vendida ENTERA, cambiar
las partes avisa con «Cambiar igual»; estirar el mueble no frena (las partes se estiran
parejo). Una pestaña vieja que no conoce `partes.division` no la borra
(`_con_la_ficha_de_antes`, clave por clave), y el candado del mueble va también acá.

**La convivencia con los espacios internos (los `slots` del Editor 3D).** Conviven: un espacio
interno cae en un tramo por el ancho y en un entrepaño por la regla del relleno
(`utils/slotsDeLasPartes.ts`); Vender avisa en el renglón de ESA parte («1 interno vendido en
esta parte») y la planilla en las filas de una parte. En un mueble que se vende por tramos o
entrepaños no se marca uno nuevo como vendido desde el panel del espacio interno (eso se vende
en Vender, con contrato): si no, la misma repisa se vendía dos veces sin que el servidor lo
viera.

**Lo que ve cada rol.**

- **La dueña, en Vender** (delante del proveedor): «Entera · PU1 · PU2…» en el renglón (la
  caja, «BI1 · BI2», sin «Entera»), el choque dicho sin nombres ni plata («Hay puertas vendidas
  en el periodo: se puede vender otra puerta, no la entera»; las FECHAS sí: son las que hay que
  mover), la tarifa de la parte, el visor 3D con la parte marcada y el producto sólo ahí
  (`marcasDelContrato`), y el plano «parcial» con «1 de 3 puertas vendida» o el día en que se
  libera la entera mirando sus partes (`comoSeLiberaLaCara`). **Vender es de cara al
  proveedor: nunca dice quién tiene otra parte, ni su canon, ni totales de la sede.**
- **La dueña, en Supervisar**: cada parte vendida es una fila (plata, vencimientos,
  proveedores, «bajo la tarifa», montaje); la ocupación sigue contando caras y dice aparte
  «Partes vendidas: x de y», «Bahías de impulso: x de y», «Forros»; «Sin alquilar» suma las
  partes libres a su tarifa; el detalle del mueble lista sus partes con Renovar, «Vender esta
  puerta» y Cancelar.
- **El trabajador**: las mismas filas sin plata (`negotiatedValue` en 0 desde
  `/spaces/comercial`).
- **La mercaderista** (el enlace del correo, sin sesión): «Puerta 2 de 3, contando de
  izquierda a derecha mirando el frente», su proveedor, sus fechas y dónde queda. **La plata
  no llega ni al trabajador ni a la mercaderista**, ni a su correo.
- **La consola de la plataforma**: las partes y las piezas son contratos sobre el plano (no
  «fuera»); el resumen por tipo las cuenta por clase sin la tarifa; la entera no «se libera»
  mientras corra una de sus partes; la ocupación es por cara.

**Dónde vive.** Servidor: `services/partes.py` (la forma), `services/layout_lookup.py` (la
compuerta, `contratos_que_chocan`, `forma_canonica`, las guardas del plano),
`services/candado.py`, `routers/bulk_leases.py`, `routers/spaces.py`,
`services/importar_del_plano.py`, `plataforma_detalle.py`. Navegador: `utils/partes.ts` (la
forma, la disponibilidad, la tarifa, lo que se marca y lo que se toca),
`utils/partesDelMueble.ts` y `components/PartesDelMueble.tsx` (el panel),
`utils/slotsDeLasPartes.ts`, `components/StoreEditor3D/muebles/contornos.ts` (los contornos y
el taller). **Cómo se prueba**: `npm run probar:partes` (62 pruebas) y, del lado del servidor,
`tests/test_partes.py`, `test_partes_venta.py`, `test_partes_tramos.py`,
`test_partes_piezas.py`, `test_partes_fichas.py`, `test_partes_consola.py`,
`test_layout_partes.py` y `test_partes_concurrencia.py`.

### Vender por partes: la nevera entera o por puertas (P1, 2026-10-14)

La dueña: **las marcas pagan la nevera entera o por puertas, nunca las dos en las mismas
fechas; dos puertas distintas, sí**, y la puerta se llama `NEV-03-PU2` (la 2 contando de
izquierda a derecha mirando el frente). Es el primer paso del plan de vender por partes; los
tramos del mural, la bahía de la caja y el forro de la columna usan la misma maquinaria.

**Una parte es un espacio más.** `NAVE-NEV-03-PU2` es una fila de `spaces` con su contrato en
`space_leases`, como cualquier cara: sin migraciones, sin columnas nuevas, sin tabla nueva. Lo
que la relaciona con su nevera es el código (*Reglas duras*). Los códigos de siempre no
cambiaron.

**Tres niveles de configuración** (`muebles.json`, las dos copias idénticas):

- la FAMILIA dice de qué formas se divide: `tipos.nevera_puertas.partes.divisiones =
  ["puertas"]`; las clases viven en `partes.clases` (`puertas`: token `PU`, eje `ancho`,
  campo `puertas`, mínimo 2, tarifa `parte_puerta`, nombres para la consola) y los tokens
  reservados en `partes.reservados`;
- el MODELO (de RECABRA o una ficha propia) dice cuál usa y en cuántas: los de 2, 3 y 4
  puertas traen `partes: { puertas: N, division: "puertas" }` (el de 1 no se divide). Una
  ficha propia puede pedir `division` sólo si su familia la admite, con `puertas` entero ≥ 2
  y dentro del rango (`problemas_de_la_ficha` y `fichas.ts`, con los casos de
  `casos/fichas.json`);
- el MUEBLE del plano lo lleva estampado en `partes`, y es lo único que cuenta. **Sin
  `partes.division` la nevera se vende entera**, aunque su ficha traiga las puertas: lo ya
  colocado no cambia solo. Se elige en el panel del plano 2D y del Editor 3D, «Cómo se vende»
  (`components/PartesDelMueble.tsx`, el mismo en los dos), que escribe `division` y la cuenta
  de puertas, y frena el cambio con una puerta vendida (`utils/partesDelMueble.ts`).

**Dónde se aplica la regla** (`chocan`; servidor `services/partes.py`, pantalla
`utils/partes.ts`):

- **la planilla y Vender** (`routers/bulk_leases.py`): la compuerta
  `motivo_para_no_vender_parte` (una puerta de una nevera que se vende entera, o la PU4 de una
  de 3, se rechaza diciendo qué hacer), el choque con la entera o las puertas en esas fechas, y
  dentro de la misma tanda. `confirmar` revisa, toma los candados de los muebles que toca y
  vuelve a revisar antes de escribir. La fila dice «Puerta 2 de 3, contando de izquierda a
  derecha mirando el frente» (`FilaOut.parte`) y la tarifa de referencia es la de la puerta;
- **el contrato suelto** (`routers/spaces.py`, `create_lease`): candado, compuerta con su
  motivo (`por_que_no_se_vende`) y choque con la entera o las puertas;
- **la importación del plano** (`services/importar_del_plano.py`): un contrato que vive en el
  JSON y choca con puertas vendidas queda «incompleto, revisalo a mano»;
- **el guardado del plano** (`routers/layout.py`): `contratos_vivos` si deja de ofrecer una
  puerta vendida, `partes_vendidas` si la cambia de lugar, `nombre_reservado` si un mueble
  nuevo se llama como una parte, y el candado de los muebles cuya forma de venderse cambia.

**Las pantallas.** Vender: tocar la nevera suma la ENTERA, como siempre; el renglón ofrece
«Entera · PU1 · PU2 · PU3» (prender una puerta apaga la entera y al revés, `alternarParte`), y
el choque dice «Ya está vendida entera en el periodo» o «Hay puertas vendidas: se puede vender
otra puerta, no la entera» — nunca de quién ni a cuánto. El plano pinta la nevera «parcial»
con una puerta vendida y «tomada» con todas (`disponibilidadDeCara`, que lee el mapa CRUDO de
la base: vender una puerta no cambia el mueble fusionado). El visor 3D sigue siendo por cara:
las puertas del contrato van con el marco en el amarillo de la venta y el producto en prueba
sólo detrás de ellas (`vanoDeParte`: la PU1 de la cara A es la hoja de dibujo `n − 1`, lo
comprueba `probar-partes` proyectando con la cámara de venta); el cabezote no lleva la marca
de quien compra una puerta. Supervisar: cada puerta vendida es una fila más de «Estado por
espacio» y de la plata, los vencimientos, los proveedores, «bajo la tarifa» y el montaje; la
ocupación sigue contando caras (una nevera con una puerta que corre está trabajando) y dice
«Puertas vendidas: x de y»; «Sin alquilar» suma las puertas libres a su tarifa; el detalle del
mueble lista sus puertas con Renovar, «Vender esta puerta» y Cancelar, una por una; «Cuándo se
libera» no cuenta libre un día con una puerta tomada. Montaje: el tablero y el enlace del
correo dicen cuál puerta, contada desde dónde. Correos: los tres llevan la puerta (el de
montaje en negrita), sin plata para quien no la ve. Tarifas: la fila «Puerta de nevera (cada
una)» dice que vacía se sugiere la del mueble ÷ puertas. La consola de la plataforma cuenta
las puertas como contratos sobre el plano (no «fuera del plano»), con su tipo en el resumen y
en el benchmark, sin publicar nunca la tarifa; el detalle lista las puertas debajo de su cara.
«Contrato sin mueble» y `auditar_desfase.py` conocen las puertas que se ofrecen; una puerta
vendida de una nevera que hoy se vende entera SÍ es un contrato sin mueble.

**Decisiones de este paso**, para confirmar con la dueña: la tarifa de la puerta (la de su
clase por sede o, vacía, la de la nevera ÷ puertas, redondeada al peso con los medios hacia
arriba en los dos lados); el área de la fila de una puerta es la huella de la nevera ÷ puertas;
una nevera de una puerta no se vende por puertas; y **las 4 repisas por puerta quedaron para
P2** (cambian cómo se ve lo ya vendido).

**Cómo se prueba.** `npm run probar:partes` (los casos compartidos, la proyección de las
puertas, `alternarParte`, la disponibilidad y un catálogo adulterado), `probar-catalogo`,
`probar-fichas` y las guardas de Vender, auditoría y muebles; del lado del servidor
`tests/test_partes.py` (los mismos casos; un plano sin `division` da exactamente los espacios
de antes), `test_partes_venta.py` (los cuatro caminos, correos, tarifa, renovar),
`test_layout_partes.py` (los tres 409 y la pestaña vieja) y `test_partes_concurrencia.py` (el
orden del candado siempre; la carrera de dos hilos con
`DATABASE_URL_PG_PRUEBA=postgresql://…`).

### Vender por partes: tramos y entrepaños (P2, 2026-10-14)

La dueña: el mural, la góndola, la nevera abierta (multideck) y la de vegetales se venden
**enteros o por tramos**; la góndola y la punta, **enteras o por entrepaños** («cada repisa con
proveedor y precio por entrepaño, pero siempre dejando la opción de vender toda la cara»). Y lo
que pidió para este paso: **que los muebles que cada supermercado arma con sus fichas propias
queden configurados para venderse por partes**. Es la maquinaria de P1 con dos clases más.

**Las clases nuevas** (`muebles.json`, las dos copias idénticas):

- `tramos`: token `TR`, a lo ancho (de izquierda a derecha mirando el frente de esa cara),
  contado por `partes.tramos`, mínimo 2, tarifa `parte_tramo` («Tramo (cada uno)»). Lo admiten
  `gondola` (central y de pared; `geometria.tramos` de 2 a 40), `nevera_refrescos` y
  `nevera_vegetales`. El panel deja hasta un tramo cada 60 cm (el mural de refrigerados de NAVE
  mide 26 m: 40 tramos).
- `entrepanos`: token `EN`, de abajo hacia arriba, contado por el `entrepanos` del MUEBLE (no de
  `partes`) **más la base** (`base: true`): con 4 entrepaños se venden 5, y **`EN1` es la base**
  (la bandeja que se apoya en el zócalo, que también lleva producto). Sin entrepaños guardados no
  hay cuenta: se vende entera, no se adivina por el alto. Lo admiten `gondola` y `punta`; tarifa
  `parte_entrepano` («Entrepaño (cada uno)»).
- Cada clase dice su `genero` para decirla bien («un tramo vendido», «una puerta vendida»).
- `fichas.geometria` suma `tramos` (entero, en `partes`), así que la mercaderista y el visor de
  Vender reciben los tramos tipados, como las puertas.
- `seCuentanEnElPlano` (por tipo): la ficha de una góndola es UN MÓDULO, así que su cantidad de
  tramos no va en la ficha (depende del largo del corrido). La ficha dice sólo «por tramos»; lo
  colocado se vende entero hasta fijarlos en el panel del plano (un tramo por módulo). Vender
  lo dice («fijalos en el plano») y la planilla también («no tiene fijado cuántos»).
- `nevera_refrescos` y `nevera_vegetales` ganan `rango`: admiten fichas propias.

**Una sola forma de dividir.** `partes.division` es un solo valor. Una góndola puede tener los
tramos dibujados y venderse por entrepaños: los tramos sólo dibujan. La compuerta lo dice: un
`TR2` de una góndola que se vende por entrepaños es «se vende por entrepaños: un mueble se divide
de una sola forma»; un `TR1` de una punta, «no se vende por tramos». Y `chocan` sigue frenando
un tramo y un entrepaño de la misma cara aunque los haya dejado una restauración.

**Cómo se dibuja.**

- Con `partes.tramos`, la góndola parte el corrido en ESOS tramos iguales, mande lo que mande el
  módulo (`vanosDeCorrido(w, modulo, tramos)`): un tramo es siempre un vano, y estirar el corrido
  estira los tramos sin cambiar cuál es cuál. El «Módulo» del panel queda quieto y dice el que
  sale del ancho. La nevera abierta y la de vegetales dibujan un montante entre tramo y tramo
  (`montantesDeTramos`) y venden un vano por tramo (`ventaDeNevera(…, tramos)`).
- Los entrepaños son las filas de siempre (`filasDeProducto`, `filasDePunta`).
- **El plano 2D** marca las juntas entre puertas o tramos (línea punteada a lo ancho) y un punto
  rojo en el frente de cada parte vendida (del mapa crudo de la base), sin nombres.
- **El visor de Vender**: un tramo es un vano del dibujo DE LA CARA (`vanoEnLaCara`, que es `n − k`
  en las dos caras porque el producto de la B se dibuja girado media vuelta; `vanoDeParte` sigue
  siendo la cuenta en el mueble, la del plano y los espacios internos). Un entrepaño es una fila
  (`filaDeEntrepano`, la base es la 0): el producto en prueba va sólo en esas filas. Cada parte
  vendida lleva su contorno en el amarillo de Vender (`muebles/contornos.ts`), fuera de la lámina.
  `probar-partes` proyecta con la cámara de venta de las dos caras de una góndola girada.

**El panel «Cómo se vende»** (`components/PartesDelMueble.tsx`, el mismo en el 2D y el 3D, y
ahora en todas las familias que se dividen): «Entera · Entera o por tramos · Entera o por
entrepaños». Elegir una forma escribe lo que se dibuja hoy (`cambioParaDividir`: los módulos del
corrido, un tramo cada 1,25 m en la nevera abierta, y los entrepaños dibujados si no estaban
guardados). Con una parte vendida de esa clase no cambia la forma ni la cantidad; con la cara
vendida entera, avisa; con espacios internos vendidos, avisa que pueden caer encima.

**Las fichas propias** (el taller, «Fichas»): la sección **«Cómo se vende»** ofrece las formas de
su familia, y «Tramos» para la nevera abierta y la de vegetales. Una ficha por entrepaños tiene
que decir sus entrepaños; una por tramos (que no sea góndola), cuántos. El servidor valida lo
mismo (`problemas_de_la_ficha`, los casos de `casos/fichas.json`) y guarda la forma
(`ficha_normalizada`). Colocada desde la paleta, la ficha se estampa con su forma y Vender la
ofrece por partes sin tocar el panel. **Lo ya colocado no cambia** si se edita la ficha. Los
modelos de RECABRA pueden llevar la forma (las neveras de 2, 3 y 4 puertas la traen desde P1);
los de góndola nacen enteros a propósito: lo decide la dueña (desde P4, los de pared —los
murales— nacen por tramos, uno por módulo; ver *Vender por partes: cómo se vende, desde la
ficha*).

**Los espacios internos del Editor 3D conviven** (`utils/slotsDeLasPartes.ts`): un espacio
interno cae en un tramo por el ancho (con la numeración de la cara) y en un entrepaño por la
regla del relleno (`entrepanosDelEspacio`). Vender avisa en el renglón de la parte los que caen
en ESA parte («1 interno vendido en esta parte»); la planilla avisa los del mueble en las filas
de una parte. Y en un mueble que se vende por tramos o entrepaños, el panel del espacio interno
**no deja marcar uno nuevo como Ocupado o Reservado** (eso se vende en Vender, con contrato: si
no, la misma repisa se vendía dos veces sin que el servidor lo viera); el que ya estaba se puede
liberar, y si pisa una parte con contrato lo dice.

**Lo demás es la maquinaria de P1, que ya era genérica**: Vender («Entera · TR1 · TR2…», el
choque dicho con el género de la clase, la tarifa de la parte), Supervisar (la fila de cada
parte, «Tramos vendidos: x de y» o «Partes vendidas» con varias clases, el detalle «Por tramos»
con «Vender este tramo»), los correos, la mercaderista («Entrepaño 1 de 5, contando de abajo
hacia arriba (el 1 es la base)»), el área de la fila (huella ÷ n para los tramos, 0 para un
entrepaño), la consola, la auditoría y el guardado del plano (`partes_vendidas` con
«de 5 a 6 entrepaños»). La hoja de ayuda de la planilla explica `-TR3`, `-EN1` y `-B-TR3`.

**Decisiones de este paso**, para confirmar con la dueña: la base es el `EN1` y se vende; «mural
refrigerado» es el multideck (`nevera_refrescos`); una sola tarifa de tramo para la góndola, el
multideck y vegetales (si la carga, pisa a los tres; vacía, cada uno se parte de la suya); los
modelos de góndola de RECABRA nacen enteros (desde P4, los de pared nacen por tramos); la
ocupación de Supervisar sigue contando caras.
**Riesgo**: un mueble de un plano viejo que ya se llamara `GON-01-TR2` se resuelve a sí mismo,
pero `chocan` lo lee como el tramo 2 de `GON-01`: antes de desplegar, correr
`scripts/auditar_desfase.py` sobre los planos de producción («código que se lee como una parte»).

**Cómo se prueba.** `npm run probar:partes` (los casos compartidos con tramos y entrepaños, la
proyección de los tramos de las dos caras con el producto de la B girado, los tramos que parten
el corrido, elegir la forma, los bloqueos, los espacios internos por parte, la disponibilidad, el
contorno del visor y el formulario del taller); `probar-catalogo` (el esquema de las clases nuevas
y su adulteración); del lado del servidor `tests/test_partes_tramos.py` (los caminos de venta con
tramos y entrepaños, la forma única, la tarifa, el área, el guardado del plano, la pestaña vieja,
los espacios internos, la mercaderista y la ficha propia configurada), `test_partes.py` y
`test_fichas_propias.py` con los casos compartidos.

### Vender por partes: las bahías de la caja y el forro de la columna (P3, 2026-10-14)

La dueña: **la caja nunca se vende entera; se venden sus bahías de impulso, una por una, con el
atajo de venderle la misma bahía de todas las cajas de la sede a una marca** (el contrato
multiespacio ya existía); **la columna nunca se vende; se vende su forro**. Y lo que pidió para
todo vender por partes: que quede configurable también en los muebles que cada supermercado
arma con sus fichas propias. Es la maquinaria de P1 y P2 con una clase nueva de parte: la
PIEZA.

**Dos clases nuevas** (`muebles.json`, las dos copias idénticas):

- `bahias`: token `BI`, `es: "pieza"`, a lo ancho y **mirando la caja desde la fila**
  (`mirando`, nuevo en las clases: la bahía 1 es la de la izquierda de quien hace la fila, que
  mira la caja desde el lado del cliente, −Z de la caja: la cuenta de la cara A), contada por
  `partes.bahias` (de 1 a 4: `geometria.bahias` de `checkout`), mínimo 1, tarifa `parte_bahia`
  («Bahía de impulso de caja (cada una)»).
- `forro`: token `FO`, `es: "pieza"`, `unico: true` (uno por columna, **sin número**:
  `COL-07-FO`), contado por un sí o no (`partes.forro`; `fichas.geometria.forro` es
  `booleano`, nuevo), tarifa `parte_forro` («Forro de columna»).
- Las familias dicen qué piezas llevan en `partes.piezas` (`checkout: ["bahias"]`, `columna:
  ["forro"]`); el esquema (`probar-catalogo`) exige que una pieza se cuente con un campo de la
  geometría de su familia o, la única, con un sí o no, y deja que la lleve un tipo que nunca se
  vende entero. **`checkout` y `columna` ganaron `rango`: admiten fichas propias** («Caja Ocaña
  1,80 con dos bahías», «Columna de 40 forrada»).
- Desde este paso `NAVE-CAJ-04-BI1` y `NAVE-CAJ-04-FO` se parten como la bahía 1 y el forro de
  `CAJ-04` (hasta P2 eran códigos de mueble: las clases no existían; lo dicen los casos
  compartidos). `CP`, `CN` y `ST` siguen reservados y sin clase.

**Una pieza no es una división** (`es_pieza` / `esPieza`):

- se ofrece **aunque el mueble no sea comercializable** (`piezas_de` / `piezasDe` no preguntan
  la bandera ni el tipo), siempre en la cara A, y `partes_de` / `partesDe` la suman al final de
  las divisiones. `espacios_de` / `espaciosDe` de una caja con dos bahías dan `[CAJ-04-BI1,
  CAJ-04-BI2]` y nunca `CAJ-04`;
- no choca con nada más que consigo misma (`chocan` ya lo decía): dos bahías de la misma caja
  conviven y la caja entera ni se vende;
- su tarifa es la de su clase por sede, **sin respaldo** (la caja no tiene tarifa que
  dividir): vacía, no hay referencia, y Tarifas lo dice debajo de la fila;
- no tiene huella propia (`area_m2` 0 en su fila de `spaces`) ni cuenta en la ocupación, de
  Supervisar ni de la consola.

**La compuerta** (`motivo_para_no_vender_parte`, los cuatro caminos): la caja entera con bahías
dice cuáles se venden (««CAJ-04» no se vende: se venden sus bahías de impulso (CAJ-04-BI1,
CAJ-04-BI2)», motivo nuevo `solo_sus_piezas`); sin bahías configuradas, la frase de siempre más
cómo configurarlas; una bahía de una caja sin bahías, de más (`BI3` en una de dos), de una
familia que no las lleva (`NEV-03-BI1`) o con la B (`CAJ-04-B-BI1`), rechazada diciendo por
qué. El contrato suelto dice «nunca se alquila» y, en la caja y la columna, cómo se venden sus
piezas (`como_se_venden_sus_piezas`).

**El guardado del plano**: con una bahía vendida no cambia la cantidad de bahías (`firma_de_partes`
cuenta las piezas: 409 `partes_vendidas`, «de 2 a 3 bahías de impulso»); sacarlas o sacar el
forro vendido es `contratos_vivos`; una pestaña vieja no las borra (`_con_la_ficha_de_antes`,
clave por clave adentro de `partes`). Estirar la caja no frena.

**Cómo se dibuja.** La caja con `partes.bahias` parte la mesa larga en ESOS nichos iguales, con
un montante entre nicho y nicho (`nichosDeImpulso` / `montantesDeImpulso` sobre
`mesaDeImpulso`, en `medidas.ts`: la misma cuenta para el 3D, el plano 2D y el contorno del
visor; `cotasDeCheckout` no cambió, la referencia del catálogo la compara tal cual). Sin el
campo, el dibujo de siempre: el montante al 10 %. La columna con `partes.forro` lleva una
envoltura de las cuatro caras del zócalo a dos metros (`FORRO`), con su marco arriba. El plano
2D marca los montantes de las bahías del lado de la fila y un punto rojo en cada bahía vendida,
y un anillo alrededor de la columna forrada (rojo si el forro está vendido).

**El panel «Cómo se vende»** (el mismo en el 2D y el 3D, fuera de lo comercial del panel: la caja
no es comercializable): la caja, «Bahías de impulso que se venden» (vacío o 0, ninguna) con la
lista «BI1 · libre · BI2 · vendida» y **«Aplicar a todas las cajas de la sede»** (`aplicarATodos`:
la misma cantidad en todas, salta las que tienen una bahía vendida y las nombra); la columna, «El
forro se vende». Con una pieza vendida no cambia la cantidad ni se saca (`revisarCambioDePartes`).
El texto del destino del mueble ya no dice sólo «no se alquila»: dice qué se vende de él
(`textoDeLoQueNuncaSeAlquila`).

**Vender**: tocar una caja suma **su primera bahía libre** en el periodo (tocarla de nuevo la
saca); el renglón ofrece «BI1 · BI2» **sin «Entera»**, y **«Sumar la BI1 de todas las cajas de
la sede (8)»** agrega un renglón por caja con esa bahía configurada: un contrato, una firma,
varios espacios. Tocar una columna forrada suma su forro. Una caja sin bahías explica cómo se
configuran. El visor 3D marca el nicho de la bahía (o el frente del forro) con el contorno de la
venta, sin producto. **Supervisar**: cada pieza vendida es una fila más (plata, vencimientos,
proveedores, montaje, renovar y cancelar desde el detalle de la caja), «Sin alquilar» suma las
piezas libres a su tarifa y la ocupación dice aparte «Bahías de impulso: 5 de 16» (no son
caras). **La mercaderista**: «Bahía de impulso 1 de 2, contando de izquierda a derecha mirando la
caja desde la fila»; «Forro de columna». **La consola**: las piezas cuentan canon, spread (contra
la tarifa de su clase, sin respaldo), proveedores y el resumen por tipo, y nunca ocupación; no
salen todavía como una lista propia en el detalle por cliente. La auditoría (la pantalla y
`auditar_desfase.py`) conoce las piezas que se ofrecen.

**Las fichas propias** (el taller, «Fichas»): la caja dice cuántas bahías de impulso vende (de 1
a 4) y la columna si vende el forro; las mismas reglas en los dos lados (`problemas_de_la_ficha`
y `fichas.ts`, los casos de `casos/fichas.json`: el forro es un sí o no, una caja no se divide,
una nevera no lleva bahías) y `ficha_normalizada` guarda las piezas. Colocada desde la paleta,
la caja ya vende sus bahías sin tocar el panel.

**Decisiones de este paso**, para confirmar con la dueña: de 1 a 4 bahías por caja (¿2 es lo
habitual?, ¿la caja de RECABRA tiene que nacer con ellas?); la bahía no tiene respaldo de tarifa
(la caja no tiene tarifa); el forro va del zócalo a dos metros en el dibujo; una pieza no tiene
huella propia.

**Cómo se prueba.** `npm run probar:partes` (sección «paso 3»: los casos compartidos con las
piezas, la bahía 1 a la izquierda de quien hace la fila con la caja girada, los nichos parejos y
el dibujo de siempre sin bahías, la disponibilidad, los bloqueos, «Aplicar a todas», el
contorno, el taller y el cableado de Vender, Supervisar y el montaje); `probar-catalogo` (el
esquema de las piezas y sus adulteraciones); `probar-auditoria` (la bahía vendida de una caja
configurada no es «contrato sin mueble»; la caja entera y la BI3 de una de dos, sí); del lado
del servidor `tests/test_partes_piezas.py`
(los caminos de venta, el multiespacio de ocho cajas, la caja de antes, el contrato suelto, la
tarifa, el guardado del plano, la pestaña vieja, la mercaderista, la consola, la auditoría, la
renumeración y la ficha propia), `test_partes.py` y `test_fichas_propias.py` con los casos
compartidos.

### Vender por partes: cómo se vende, desde la ficha (P4, 2026-10-14)

La dueña: «ahora que los clientes pueden armar sus propios muebles, necesito que quede
configurado el poder vender por partes dichos muebles». Los pasos 1 a 3 hicieron la maquinaria
(puertas, tramos, entrepaños, bahías, forro) y ya dejaban elegir la forma en la ficha propia
del taller; este paso cierra lo que faltaba para que la configuración VIAJE con la ficha: los
modelos de RECABRA la traen, las paletas la dicen, el taller la muestra numerada, y lo que ya
estaba colocado se pone al día desde su panel, nunca solo.

**Tres niveles, como siempre** (*Vender por partes: la nevera entera o por puertas*): la
FAMILIA dice qué formas admite, la FICHA (modelo de RECABRA o ficha propia) dice cuál usa y en
cuántas, y el MUEBLE del plano la lleva estampada y es lo único que cuenta para vender.

**Los modelos de RECABRA** (`muebles.json`, las dos copias idénticas): las neveras de 2, 3 y 4
puertas, por puertas (desde P1); **las 12 góndolas de pared, los murales, por tramos**
(`partes: { division: "tramos" }`, sin la cantidad: la ficha de una góndola es UN módulo y
cuántos tramos tiene depende del largo del corrido). Las centrales, las puntas (sus modelos no
traen entrepaños), la nevera de una puerta y lo demás, enteros: lo decide la dueña. Ningún id ni
tarifa cambió (`modelos-ids.json` verde).

**Lo ya colocado no cambia solo.** Un mueble colocado antes de que su ficha dijera cómo se vende
tiene estampado lo de entonces (el mural sin `partes`, la nevera con sus puertas y sin
`division`) y se sigue vendiendo entero: ni el navegador ni el servidor releen la ficha para
vender (el servidor ni la lee: `test_partes_fichas.py`). Lo que cambia es el PANEL «Cómo se
vende» del plano 2D y del Editor 3D (`components/PartesDelMueble.tsx`):

- **«Su ficha («Nevera de 3 puertas») dice: entera o por puertas (3). Hoy se vende distinto»**
  con **«Usar lo de la ficha»** (`loDeLaFicha`, en `utils/partesDelMueble.ts`): escribe la forma
  y, si la ficha la cuenta, la cantidad (las puertas, los tramos de una nevera abierta, las
  bahías, el forro); los tramos de una góndola, uno por módulo del corrido; los entrepaños, los
  del mueble o, si no tiene, los de la ficha. Pasa por las MISMAS revisiones que cualquier
  cambio del panel (`revisarCambioDePartes`): con una parte vendida no se mueve (bloqueo en
  pantalla y, si llega igual, 409 `partes_vendidas`); con la entera vendida y las hojas
  cambiando, avisa. Sólo aparece si se puede usar: un mural de un solo módulo no tiene tramos
  que vender, y decirlo en cada góndola corta del plano era ruido.
- **«Aplicar lo de su ficha a los N colocados con ella en la sede»** (`aplicarLoDeLaFicha`):
  en un solo cambio, salta los que tienen algo vendido que se movería o cambiaría cómo se ve
  (se cambian de a uno, desde su panel) y los que todavía no pueden (un solo módulo), y los
  nombra.
- **«Fijar 4 tramos, uno por módulo»**: el mural colocado desde el modelo de hoy llega «por
  tramos» sin la cantidad; el panel lo dice y la fija con un clic (lo que se dibuja). Con un
  solo módulo no hay tramos: «estirala en el plano a 2 módulos o más» (`cambioParaDividir`
  ya no parte un módulo en dos medios tramos, como hacía hasta P3).

**Las paletas** del plano 2D y del Editor 3D dicen al lado de las medidas de cada modelo cómo se
vende lo que se coloca desde él («por puertas», «por tramos», «2 bahías de impulso», «con
forro»: `comoSeVendeLaFicha` / `textoDeComoSeVende`, en `utils/partes.ts`, con las mismas
reglas que cuentan las partes de un mueble del plano), igual para las fichas propias. El
selector de modelos del taller también.

**El taller** («Fichas»): la sección «Cómo se vende» ya existía (P2 y P3, con la validación
compartida); ahora el mueble que gira a la derecha muestra cada parte con su contorno y el
número que va a tener en Vender («PU1», «TR2», «EN1 · base», «BI1», «FO»: `partesNumeradas` en
`muebles/contornos.ts`, las mismas cuentas que el visor de Vender; la cara B se numera igual y
lleva sólo el contorno), la nevera abierta dibuja sus tramos, y la lista de fichas dice cómo se
vende cada una (también las bahías y el forro). Una ficha guardada antes de vender por partes
(sólo puertas) se lee igual y se vende entera; al editarla se guarda la forma.

**El nombre propio llega a las partes** (`nombreDeTarifa`, `catalogo/nombresPropios.ts`): la
fila de Tarifas de una clase que es de UNA familia y la nombra («Puerta de nevera», «Bahía de
impulso de caja», «Forro de columna») dice el nombre propio de esa familia («Puerta de
Enfriador vertical (cada una)», con el de RECABRA debajo); el tramo y el entrepaño son de varias
familias y no nombran ninguna, así que no cambian. La consola y los informes siguen con el de
RECABRA.

**Lo que no cambió.** Ningún código de espacio, ningún plano, ninguna tabla ni columna: el
servidor no tuvo cambios de código (la validación de la ficha y `ficha_normalizada` ya
guardaban la forma y las piezas desde P2 y P3), sólo el catálogo y pruebas. El pedazo de
entrada sigue en 352,81 kB.

**Decisiones de este paso**, para confirmar con la dueña: los murales de RECABRA nacen por
tramos y los centrales enteros (¿por tramos, por entrepaños o enteros?); el aviso de la ficha
sólo aparece cuando se puede usar; «Aplicar a todos» no toca los que tienen algo vendido.

**Cómo se prueba.** `npm run probar:partes` (sección «paso 4»: los modelos de RECABRA y su
configuración, las paletas, lo colocado antes que se vende entero y lo que le ofrece el panel,
el mural de un solo módulo, las fichas propias de antes y de ahora, el bloqueo con una parte
vendida, «Aplicar a todos» y las partes numeradas del taller), `probar-nombres` (el nombre
propio en las filas de las partes), `probar-fichas` con ocho casos nuevos en
`casos/fichas.json` (una ficha de antes, editar una de antes para venderla por puertas, el
mural por tramos sin cantidad, cero puertas, una caja que además se divide, una punta con
entrepaños de más, la forma en mayúsculas, la nevera de vegetales por tramos); del lado del
servidor `tests/test_partes_fichas.py` (los modelos de RECABRA, lo colocado antes, el mural
sin fijar y fijado, la ficha propia de antes y editada, las fichas con partes y piezas, el
409 al usar la ficha con una puerta vendida y retirar la ficha sin tocar lo vendido) y
`test_fichas_propias.py` con los casos compartidos.

### Vender por partes: el recorrido en el navegador (P5, 2026-10-14)

Lo que hace la dueña con las cuatro partes de punta a punta, en Chromium contra un servidor
local descartable (SQLite vacía, ingreso por clave sólo en esa máquina, Vite), con capturas
fuera del repo:

1. **El taller.** «Nevera Inducol 3 puertas», 205 × 74 × 210 cm, 3 puertas, «Cómo se vende:
   Entero o por puertas». Ningún problema; el mueble que gira muestra PU1 · PU2 · PU3 de
   izquierda a derecha; guardar hace UN `POST` con `partes: {puertas: 3, division: "puertas"}`
   y la fila dice «3 puertas · por puertas».
2. **El plano.** La paleta la muestra «por puertas»; colocada (`NEV-01`), el panel ya dice
   «Entera o por puertas (3)» sin tocar nada. Una góndola doble «por entrepaños» (5 por cara,
   con la base), dos cajas con 2 bahías («Aplicar a todas las cajas de la sede») y una columna
   con su forro: el servidor guarda `partes` de cada una.
3. **Vender.** Tocar `NEV-01` ofrece «Entera · PU1 · PU2 · PU3»; la PU2 a Postobón por un mes
   ($350.000) guarda `SEDE 1-NEV-01-PU2`. La entera en esas fechas se rechaza en el renglón y
   en el servidor («la puerta 2 está vendida del … al …: la entera no; las otras puertas, sí»),
   sin nombrar a Postobón, y «Guardar» queda apagado. La PU3 a Coca-Cola, sí. La EN2 de la
   cara B de la góndola a Nutresa; «Sumar la BI1 de todas las cajas de la sede (2)» arma un
   contrato de Colombina con dos renglones; el forro de la columna a Alpina.
4. **La planilla.** `NEV-01-PU1` se carga («Nevera de Puertas · Puerta 1»); en la misma
   planilla la nevera entera no entra, por la fila de la PU1.
5. **Supervisar y Estado por espacio.** Cada parte es una fila con su proveedor, su montaje
   pendiente y su plata (sólo la dueña); la mercaderista ve las mismas filas sin plata. La
   ficha de la nevera dice «Entera, sin contrato: hay puertas vendidas · PU1 libre · PU2
   vendida · PU3 vendida»; la ocupación, «Partes vendidas: 4 de 13 · Bahías de impulso: 2 de 4
   · Forros: 1 de 1».
6. **El visor 3D de la puerta.** Sólo el marco de la puerta vendida, en amarillo, y el
   producto de prueba de Postobón sólo detrás de ella.
7. **Bajar a 2 puertas.** El panel lo frena antes («Con 3 puertas vendidas…») y el servidor
   contesta 409: `contratos_vivos` (la PU3 se iría del plano) y, al subir a 4, `partes_vendidas`;
   también con 3 entrepaños y con 1 bahía.
8. **El enlace de montaje de la PU2** (teléfono, sin sesión): «Puerta 2 de 3, contando de
   izquierda a derecha mirando el frente», Postobón, las fechas, dónde queda. Sin plata ni
   otros proveedores.

**Lo que se arregló al mirar** (con sus guardas en `probar-partes`, sección «lo que se vio en
el recorrido», y `probar-nombres`; 25 mutaciones, todas fallan):

- **«libre 14 oct» en una nevera con puertas vendidas.** El rótulo del plano (Vender y
  Supervisar), el cartel del mouse y la ficha de la lista de precios decían el primer día
  libre de la CARA, que es hoy: leía como que la nevera entera se libera hoy. Ahora una cara
  parcial por sus partes dice **«1 de 3 puertas vendida»** («1 de 5 entrepaños vendido»)
  (`partesVendidasDeLaCara`, `textoDePartesVendidas` en `utils/partes.ts`); con la entera
  tomada parte del periodo sigue la fecha. Es una cuenta, sin nombres ni plata.
- **El visor contaba la nevera entera.** Con la puerta 2 vendiéndose, «Cómo va» decía «24 de
  frente · 1296 unidades» con ocho botellas por entrepaño a la vista: el panel no sabía qué
  partes iban en el contrato. Ahora `PanelDePrueba` recibe los vanos y las filas del contrato
  y cuenta con la misma regla que el dibujo: «8 de frente × 9 de fondo · 432 unidades».
- **Estado por espacio cortaba el código**: «NEV-01·P…» tres veces. La columna se estira a lo
  que miden los códigos de las partes (sin partes, 104 px como siempre).
- **«1 contrato · 3 caras»** con dos contratos (y «2 contratos» con siete): contaba caras
  ocupadas. Ahora cuenta los contratos que corren o están firmados, uno por espacio; sin
  partes, la misma cuenta de antes.
- **Claves repetidas en «Para revisar»** (dos puertas de la misma nevera que vencen el mismo
  día): React avisaba y podía comerse una fila. Ahora la clave es la del espacio.
- **«checkout · Bahía de impulso 1 de 2»**: la caja y la columna no tienen tarifa y la fila de
  su pieza decía la clave interna. Ahora su nombre de RECABRA («Checkout / Caja», «Columna») o
  el propio; lo demás sin tarifa no cambia.
- **El panel del plano**: listaba «EN1 … EN5 · EN1 … EN5» en una góndola central (ahora
  «B·EN1» en la cara B), decía «Quedó igual en 1 cajas», «Con 3 puertas vendidas: la puerta
  vendida quedaría» y «Cómo se vende» dos veces seguidas en el 2D.

**Visto y no arreglado** (no es chico, o espera a la dueña):

- Tocar en Vender una nevera con puertas vendidas pone «Entera» en el contrato y el rechazo en
  rojo; la caja, en cambio, suma su primera bahía libre. Podría sumar la primera puerta libre:
  es decidir cómo arranca la venta, para la dueña.
- «+1 entran» en la lista de precios y el color «Se libera en el periodo» siguen contando por
  cara (ya anotado en P2): una nevera con una puerta vendida «entra» aunque la entera no.
- En el visor, las puertas que no se venden quedan con las rejillas vacías (anotado en P2).
- Los mensajes del 409 del servidor cuentan los entrepaños con la base («de 5 a 4
  entrepaños» cuando el campo dice 4 → 3) y dicen «1 bahías de impulso».
- El encabezado del enlace de montaje dice «NEV-01-PU2 PU2» (el nombre del espacio repite el
  sufijo).
- Ajeno a las partes: el primer ingreso a una base vacía manda dos `PUT /layout/settings`
  (el doble efecto de `StrictMode`) y esta vez el segundo volvió **500** (`UNIQUE constraint
  failed: app_config.key`: los dos llegan antes de que exista la revisión y los dos insertan;
  en el recorrido de las fichas había vuelto 409). Se resuelve solo al recargar; la carga
  por planilla dice «Los avisos salieron agrupados» aunque el correo no esté configurado.

### Vender por partes: la revisión de la rama (2026-10-14)

Tres revisiones sobre `fcaa5f9..8ed09fa` —regresión y plata, privacidad y seguridad, y las
guardas (24 mutaciones, 16 sobrevivían)— y los defectos del recorrido. **La venta aguantaba**:
ningún camino vendía dos veces lo mismo con los códigos que arma la planilla, dos tandas a la
vez quedan cubiertas por el candado, renumerar mudaba las puertas vendidas, y un plano sin
partes da lo mismo que antes. Lo que fallaba era cómo se informaba, más un agujero del
contrato suelto. Cada arreglo tiene su prueba, que falla sin él.

**El contrato suelto con un código escrito de otra forma** (media). `POST /spaces/{id}/leases`
aceptaba `NEV-03-PU2` sin la sede o `" NAVE-NEV-03-PU2"`: la compuerta resolvía el mueble igual,
pero la regla compara códigos y la nevera entera, escrita completa por la planilla, no lo veía.
La misma bahía se vendía dos veces, y `PUT /layout` con la PU1 sin sede bajaba a 2 puertas sin
409. Ahora: el contrato suelto exige la forma completa de lo que se vende por partes
(`forma_canonica`, 409 «Escribilo «NAVE-NEV-03-PU2», con la sede y sin espacios…»; un mueble
que se vende entero sigue como siempre), y lo que ya estaba escrito de otra forma cuenta igual
(`contratos_que_chocan` con `sede`, `partes_que_se_moverian` y
`contratos_que_quedarian_sin_mueble` por la forma completa). Ninguna pantalla usa este
endpoint: la planilla y Vender ya armaban el código canónico. Pruebas en `test_partes_venta.py`
(«exige el código completo», «un contrato viejo guardado sin la sede también cuenta»).

**La consola de la plataforma** (`plataforma_detalle.py`):

- **ofrecía una nevera que no se puede vender** (media): con la entera hasta el 15 y la puerta
  2 desde el 16, el detalle la daba por «se libera» el 15, la metía en oportunidades a $900.000
  y recomendaba ofrecerla. La cara está tomada hasta que se liberan ella y todas sus partes;
- **las bahías y los forros vendidos salían libres** (media) en el resumen por tipo (la caja no
  es un espacio y su bahía no colgaba de nada), sin su canon, y la cuenta «N contratos · M sobre
  el plano + K fuera» no cerraba. El resumen mira el contrato de cada parte por su código, y el
  detalle trae `piezas` (sólo si hay alguna, como `partes` en un espacio: las claves de siempre
  no cambian) que la consola cuenta y lista con los contratos (`contratosSobreElPlano`);
- **las puertas de una nevera vendida entera salían libres** (baja): ahora cuentan tomadas, sin
  canon propio; y el hallazgo «Lo que no se vende es sobre todo…» mira sólo los tipos de las
  caras (decía «X de los N espacios son puertas»).

Pruebas en `tests/test_partes_consola.py`, por las funciones y por el endpoint; y en
`probar-partes` («la consola cuenta los contratos de las bahías…»), la cuenta de la pantalla.

**El plano y la lista de precios decían «libre 21 oct»** (baja) con la entera vendida del 15 al
20 y la puerta 2 desde el 21: miraban sólo los días de la cara. Ahora el día y los días libres
son los de la ENTERA mirando lo que choca con ella (`diasLibresDeLaCara`,
`comoSeLiberaLaCara`), la misma cuenta que «Cuándo se libera»; si la entera no se libera en el
periodo, la cuenta de partes («1 de 3 puertas vendida»). Sin partes, el día de siempre.

**Lo que ninguna prueba cubría** (las mutaciones que sobrevivían), ahora con prueba:

- servidor: **renumerar** con una puerta y un tramo de la cara B vendidos (el espacio, su
  `svg_id` y la confirmación de montaje van con su mueble físico); la planilla con la entera
  ANTES que la puerta; el contrato suelto de una puerta, un tramo y un entrepaño con la cara
  vendida entera; y los espías del candado: el contrato suelto lo toma antes de la compuerta y
  de los choques, y la importación del plano mira, toma y vuelve a mirar
  (`test_partes_venta.py`, `test_partes_concurrencia.py`);
- navegador: lo que el visor le marca al proveedor (`marcasDelContrato`: el tramo de la B, el
  entrepaño, la bahía, proyectados con la cámara de venta), lo comercial del renglón de Vender
  (`comercialDelEspacio`, que arma el índice de partes del mismo mapa) y la tarifa de las filas
  de Supervisar (`tarifaDeLaFila`), tocar en Vender (`alTocarEnVender`: la caja nunca entera) y
  los interruptores del renglón (`interruptoresDeLaCara`), el punto rojo de la cara B en el
  plano 2D (`puntosDePartesVendidas`) y los números del taller en los tramos de la B. Eran
  cuentas sueltas en las pantallas con guardas de texto; ahora son funciones puras de
  `utils/partes.ts` probadas por lo que hacen, y las pantallas las llaman (una guarda corta
  vigila que lo sigan haciendo). `probar-catalogo` sabe que `tarifaDeLaFila` y
  `comercialDelEspacio` preguntan la tarifa (dependen de `fichasPropias`).

**Del recorrido**, además: el 409 del plano dice «de 2 a 1 bahía de impulso» (decía «1
bahías») y los entrepaños «(contando la base)»; el encabezado del enlace de montaje dice
«NEV-01 PU2» (decía «NEV-01-PU2 PU2»); y **dos `PUT /layout/settings` a la vez** al entrar a
una base vacía dan 409 `settings_conflict` y no 500 (`UNIQUE app_config.key`; ajeno a las
partes, `test_sede_delete.py`). Lo que es decisión de la dueña quedó en *Dónde retomar*.

**Un gotcha de las pruebas que costó caro**: una prueba que importa `app` SIN el fixture
`client` arma el motor con el `DATABASE_URL` por defecto, y las pruebas de punta a punta que
corren después en el mismo proceso escriben en `backend/retail_espacios.db` (la base local de
desarrollo, fuera del repo). Pasó con la primera versión de `test_partes_consola.py`: dejó un
cliente `partcli` en esa base y un `backend/recabra_partcli.db`. Las pruebas unitarias de ese
archivo piden `client` aunque no lo usen. Otros archivos tienen pruebas sin `client` que
importan `app` (`test_partes_piezas.py`, `test_partes.py`): el riesgo aparece cuando una de
ésas es la PRIMERA del proceso y después corre una de punta a punta (con `-k`, por ejemplo).
Esa base local quedó con esas filas: no se borraron desde la sesión.

## Participaciones de cara y zonas (2026-10-17)

Lo que pidió la dueña, en sus palabras: que el supermercado **negocie y registre el porcentaje
de un mueble que le toca a cada marca o proveedor** («Café A, 30 % de la GON-001, con sus
fechas y su precio»), y que el área comercial **distribuya ese porcentaje dibujando regiones
libres sobre el mueble** —verticales, varias chicas, diagonales, un polígono cualquiera—, sin
que el sistema imponga entrepaños ni franjas. El principio de todo el pedido es que **contratar
y dibujar son dos cosas distintas**: el 30 % es un compromiso comercial; la forma es una
decisión gráfica que no lo cambia. Y cuatro números que no se pueden confundir: contratado,
dibujado, pendiente de distribuir y disponible para vender, con la disponibilidad calculada
de las obligaciones vigentes y no de lo pintado. El pedido entero (21 secciones, casos A a I)
está copiado en el scratchpad de la sesión; acá queda lo que se construyó.

En la interfaz las regiones se llaman **zonas**: «sombra» ya era la sombra de luz del 3D.

Se hizo en `578058c..fc97dbc` (34 commits): siete pasos, cada uno con su verificación
independiente (mutaciones, fuzzers entre gemelos, carreras contra Postgres), la integración y
una revisión final con tres revisores y un recorrido en el navegador. Lo que la revisión final
encontró y se arregló después (`fc97dbc..6a27cc4`) va al final, en *Arreglos de la revisión
final*; lo de acá arriba ya describe el código con esos arreglos.

### Lo que se decidió (D1 a D22)

La dueña pidió no frenar en el diagnóstico; se cerraron las 22 preguntas abiertas con lo que
dice el pedido y lo que el repo ya hacía, y el diseño no las volvió a discutir:

- **D1 · La unidad** es el área frontal comercializable de la cara, en m². Los porcentajes se
  guardan en **puntos básicos enteros** (1 pb = 0,01 %; 10 000 = la cara entera), nunca en
  flotantes.
- **D2 · La superficie** sale del catálogo (dato compartido por los dos lados) más una función
  pura escrita en TS y en Python con casos compartidos: un rectángulo exterior menos
  exclusiones (zócalo, parantes, copete…). Las zonas se guardan normalizadas 0..1 en ese
  rectángulo; lo dibujado cuenta sólo dentro de lo que se vende (se recorta contra las
  exclusiones, no se rechaza por cruzar un parante); salir del rectángulo es un error.
- **D3 · «Marca»** es el proveedor (`Supplier`) más el texto `marca` del contrato. No hay
  entidad marca. Dos marcas del mismo proveedor en la misma cara son dos participaciones.
- **D4 · Por cara.** Cada cara tiene su propia capacidad; «la unidad de dos caras» no entra.
- **D5 · Una participación es una clase de división nueva** (`PC`), con código derivado y una
  fila propia de `spaces`; su contrato es un `space_leases` normal (ver *El modelo*).
- **D6 · Estados** de término y de distribución, con «para revisar» cuando el mueble cambió.
- **D7 · Permisos:** todo es de administración, como lo comercial de siempre. El trabajador no
  ve participaciones ni zonas en sus pantallas (por la API le llega el %, que no es plata: ver
  *Arreglos de la revisión final*).
- **D8 · Borrador contra confirmar:** el borrador se guarda con errores; confirmar es estricto.
  Se puede confirmar con lo dibujado por debajo de lo contratado (queda pendiente y sigue
  comprometido). No hay zona sin participación.
- **D9 · Sin capas:** dos participaciones distintas no se pisan si sus fechas se cruzan; las
  zonas de una misma participación que se pisan cuentan una vez.
- **D10 · Precio:** el valor es el que se teclea (`monthly_rent`, como siempre). La tarifa de la
  cara se muestra como referencia, sin prorratear. Nada del dibujo toca precio, % ni fechas.
- **D11 · Dónde se carga:** en el panel de Distribución del Editor 3D, con el MISMO alta de
  contrato que los otros caminos. Vender muestra la cara «por participación · queda X %» sin
  nombres ni montos ajenos y no la vende entera; la planilla rechaza los códigos `PC` y manda
  a Distribución; renovar se hace desde Distribución.
- **D12 · Delante del proveedor** (Presentar, lámina, visor de Vender, reunión): ninguna zona.
- **D13 · La mercaderista** lee «Participación n · X % de la cara A», sin dibujo.
- **D14 · Historial propio**, que distingue lo contractual, lo gráfico, el estado y los eventos
  de otros caminos, y **nunca se purga** (decisión escrita).
- **D15 · Capa «Distribución» en el Editor 3D:** el mueble se ve desnudo (sin paquetes, sin
  envases, sin foto) y con las zonas. Fuera del modo, todo como antes.
- **D16 · Cruz y zona libre** como están: de la cruz, su frente; de la zona libre (`metro`), la
  tapa vista desde arriba. El dibujo roto del metro bajo se arregló porque era chico (placa).
- **D17 · Aviso de cara inaccesible** (en «Revisar» del 2D y en el panel del 3D): sólo avisa.
- **D18 · Informes** en Supervisar con las mismas funciones puras del editor, más un resumen
  del servidor por sede, mueble, proveedor, día y período.
- **D19 · Una zona vale lo que vale su participación:** chocan sólo si se pisan Y sus fechas se
  cruzan; la de una participación vencida o cancelada no cuenta, no bloquea y se ve como
  historia.
- **D20 · Copiar distribuciones**, fuera de esta fase.
- **D21/D22 · No se toca ningún dato** de producción, y dos defectos previos (el renombre de
  sede que cierra contratos y el campo «Sede» del 3D) quedan como tareas aparte, sin agravarlos.

### El modelo: una participación es un espacio más

**El código.** `SEDE-COD[-B]-PC<n>`: `NAVE-GON-01-PC1`, `NAVE-GON-01-B-PC3`. `PC` es una clase
más de `partes.clases` en el catálogo (las dos copias), con `es: "participacion"` y sin
`campo` (el mueble no la cuenta: `cantidad_de` da `None`), reservada para los nombres
(`termina_reservado`, `nombres_reservados_nuevos`) y leída por `partirCodigo` / `partir_codigo`
con los casos de `casos/partes.json`. **El `n` lo pone el servidor** (`siguiente_numero`): el
mayor que existió en esa cara, mirando los términos y TODAS las filas `…-PC<n>` (también las
hechas a mano, la forma corta de esa sede y las archivadas `…-PC7#12`), más uno. **Nunca se
reutiliza**, porque el montaje atribuye reportes por código y fecha. `partir_codigo` reconoce
`PC1` a `PC99`: la centésima da 409 `cara_llena`.

**Una fila de `spaces` por participación y un contrato normal.** Ésa fue la razón de elegir
este modelo: montaje, fotos, planometría, correos, renumeración, «Estado por espacio»,
cancelar y vencer siguen funcionando sin generalizar «un contrato vivo por código». El alta
busca (o crea libre) la fila de la cara —a una que ya estaba sin `sede` le pone la del plano,
y nunca pisa una que ya tiene (`_fila_de_cara`)—, crea la de la participación y, si es un
contrato, escribe el lease con la misma función que la planilla: `services/alta_de_contrato.py`
(`proveedor_por_nombre`, `espacio_para`, `escribir_contrato`), que salió de
`bulk_leases.confirmar` como refactor puro, comparado byte a byte contra el código de antes
con 80 tandas al azar por semilla. La cara de un término la arma `cara_del_termino` con la
sede de su fila de cara; si está vacía, con la de la fila `…-PC<n>`, y si tampoco, con la del
prefijo del código (`_sede_por_prefijo`).

**Cuándo una cara se vende por participación** lo dice el mueble: `partes.division =
"participacion"`, su tipo tiene receta de superficie y es comercializable (`por_participacion`
de `layout_lookup.py` ↔ `porParticipacion` de `utils/partes.ts`). Es una sola forma de dividir,
como las demás, y **vale para las dos caras de una doble, cada una con su capacidad**.
`division_de` sigue dando `None` para ese mueble (una participación no es una división física)
y `firma_de_partes` no la cuenta: su forma física no cambia.

**Cuatro tablas nuevas** (`backend/app/models/participaciones.py`), en la base del
supermercado, creadas por `create_all()` (ninguna columna en tablas existentes: `test_t22`) y
clasificadas de negocio en `TABLAS_DEL_CLIENTE`, así que viajan en el traspaso y en la copia:

| Tabla | Qué guarda |
|---|---|
| `participaciones` | **Un término por fila** (una reserva provisional o un contrato): `space_id` (la fila `…-PC<n>`, que no cambia al renovar ni al renumerar: las zonas la nombran a ella), `cara_space_id`, `numero`, `estado` (`reserva`, `reserva_cancelada`, `contrato`), `puntos_basicos` (1 a 10 000). Una reserva guarda `supplier_id`, `marca`, `desde`, `hasta`, `caduca` y `notas`; **un contrato guarda sólo `lease_id`** (único) y deja todo eso en NULL. `renueva_a` (el término anterior, entero sin clave foránea), `baja_en`/`baja_por` (la cancelación, que separa «cancelado» de «vencido»), `version` optimista y quién/cuándo. |
| `distribuciones` | Una por cara (`UNIQUE cara_space_id`): `fixture_id` (el mueble del plano para el que se dibujó), `version`, `confirmada_en`/`_por`, `firma_confirmada`, `borrador_en`/`_por`. |
| `zonas` | Los polígonos: `distribucion_id`, `capa` (`borrador` o `confirmada`), `participacion_space_id` (ninguna zona sin participación), `vertices_json` (u,v cuantizados a 1e-6, antihorarios) y `orden`. |
| `historial_participaciones` | Lo que pasó: `en`, `actor` (el correo del token), `tipo` (`contractual`, `geometria`, `estado`, `evento`), `accion`, la cara, la participación, el término y la distribución, `detalle` (una frase sin montos) y `antes_json`/`despues_json` (con los vértices en las confirmaciones). |

Las reglas de forma son a propósito: sólo `Integer`, `String`, `Text`, `Date`,
`DateTime(timezone=True)` y `ForeignKey` (nada de `Enum`, `Boolean`, `Float` ni `Numeric`: la
copia serializa con `json.dumps` y el traspaso copia filas planas); `sqlite_autoincrement` en
las cuatro (el historial nombra ids, que no se reutilizan); y ninguna tabla se apunta a sí
misma, porque el traspaso copia sin `ORDER BY` y una renovación podía llegar antes que su
original.

### La cuenta: capacidad día por día y las cuatro magnitudes

**La regla de capacidad**: para cada día desde hoy, la suma de los pb que cuentan ese día no
pasa de 10 000. Cuentan los **contratos activos** que cubren el día, las **reservas
provisionales que se sostienen** (su `caduca` es hoy o después) y cubren el día, y **lo
físico** —la cara vendida entera o por partes, y los contratos `…-PC<n>` sin un término de
ESTA fila de cara (un script, un dato viejo, o el que la carrera entre borrar la sede y la
primera alta deja colgado de la fila archivada `…#id`)— como si fuera la cara entera
(`fisicos_de`, que lo decide con un join contra la fila de cara del término). Se mira día por
día y no sumando todo lo vivo: dos participaciones que no se cruzan en fechas pueden ocupar la
misma región, y sumarlas daría más de 100 %. Un intervalo que termina el 30 y otro que empieza el 1
no se suman (en el mismo día salen primero los que terminan). **Lo disponible en un período**
es 10 000 menos el pico de la suma diaria en `[max(desde, hoy), hasta]`: el pasado no se vende
ni se valida. **Lo dibujado no cambia lo disponible.** Las funciones son
`intervalos_que_cuentan`, `pico`, `disponible` y `revisar_capacidad` de
`services/reglas_participacion.py`, gemelas de `utils/participaciones.ts` (ver *Reglas duras*).

**Las cuatro magnitudes**, por participación (`juzgar` devuelve sus `cuentas`):

- **contratado**: el pb de sus términos vivos (I3 los obliga a ser iguales; si un dato viejo
  los trae distintos, se toma el menor y sale el aviso `TERMINOS_DESIGUALES`);
- **dibujado**: `redondear(10 000 · área(∪ zonas ∩ lo que se vende) / área que se vende)`
  (`dibujado_pb`), con la unión exacta, así que una zona encima de otra de la misma marca no
  suma dos veces;
- **pendiente de distribuir**: `max(0, contratado − dibujado)`. Sigue comprometido: no se le
  ofrece a nadie;
- y, por cara, **disponible para vender**: lo de arriba.

Un ejemplo, el del pedido y el caso A del recorrido. GON-01 cara A, con un contrato de Café A
al 30 % del 1 oct al 31 dic, con zonas por el 20 %, y una reserva provisional de Marca B al
25 % del 1 nov al 31 ene que caduca el 15 nov:

| | pb | se lee |
|---|---:|---|
| Café A contratado | 3 000 | «30 % contratado» |
| Café A dibujado | 2 000 | «20 % dibujado» |
| Café A pendiente | 1 000 | «falta 10 %» |
| Marca B contratado (reserva) | 2 500 | cuenta mientras no caduque |
| Disponible del 1 oct al 31 ene | 4 500 | «queda 45 %» (el pico es 55 %, en noviembre y diciembre) |

Una tercera marca al 50 % del 1 al 31 ene entra (en enero queda sólo la reserva: 25 %); la
misma del 1 dic al 31 ene no: «No entra: el 1 dic 2026 la cara A ya tiene 55 % comprometido;
queda 45 % y pediste 50 %.» (409 `capacidad_excedida`, con `disponible_pb` y `dia`). Si la
reserva de Marca B no se confirma, el 16 nov deja de contar sola, sin que nada la borre, y
queda 70 % de noviembre a diciembre. En el recorrido, el formulario de otra marca frenó 46 % y
55 % con la frase del servidor y dejó pasar 45 %.

### Los estados

**De un término** (`estado_visible`; lo derivado no se guarda):

- **Reserva provisional** (`reserva`): proveedor, marca, %, fechas y una caducidad con `hoy ≤
  caduca ≤ hasta`; sin valor mensual (422 si lo trae) y sin correos. **Cuenta para la capacidad
  mientras no caduque** —es lo que es reservar—, escrito como regla, sin interruptor.
- **Reserva caducada**: el día después de `caduca` deja de contar, sola. No se cancela: 409
  `reserva_caducada` («La reserva ya caducó el 20 oct 2026: no hace falta cancelarla; queda en
  el historial.»), así su historia sigue diciendo que caducó.
- **Reserva cancelada** (`reserva_cancelada`, guardada con `baja_en`).
- **Contrato**: tiene su lease, y de sus fechas e `is_active` salen **vigente**, **firmado**
  (empieza más adelante), **vencido** y **cancelado** (con `baja_en`, o el lease cerrado antes
  de vencer). Un contrato no caduca (422 si trae `caduca`).

Una reserva viva se cambia, se confirma como contrato (con el mismo alta: el valor se escribe
ahí) o se cancela. Un contrato se cancela desde su ficha y se renueva.

**De la distribución de una cara** (`estado_distribucion`): **sin distribuir** (nada, o lo que
hay se dibujó para otro mueble que tenía ese código), **borrador** (guardado en el servidor, no
oficial, con sus errores marcados), **confirmada** (oficial, validada estricto) y **para
revisar** (la confirmada, si cambió la firma de la cara desde que se confirmó); `sin_mueble`
si la cara no se vende por participación. Una confirmada con un borrador encima sigue
«confirmada»: el panel agrega «hay un borrador sin confirmar». **La firma** (`firma` /
`firmaDeCara`) es el tipo, mural o doble (de `caras_de`), ancho y alto en mm, los entrepaños
guardados y las exclusiones a 1e-4 (que llevan el módulo y los tramos); el fondo no entra,
porque no mueve nada del frente.

### Las invariantes de los términos (I1–I3) y renovar

Los términos de UNA participación (`revisar_terminos`, en este orden):

- **el estado**: se cambia o se confirma sólo una reserva viva; se renueva sólo el contrato
  vivo más nuevo (`no_renovable`, `no_editable`, `reserva_caducada`). Una reserva no se renueva:
  se confirma o se le cambian las fechas;
- **I2**: el mismo proveedor y la misma marca que TODOS los otros términos, también los ya
  terminados (más estricto que el diseño, a propósito: D3 y D19). Otro proveedor u otra marca
  es otra participación (`otro_proveedor`);
- **I3**: el mismo porcentaje que los otros vivos (`otro_porcentaje`). **Renovar con otro % es
  cargar una participación nueva**: en «Renovar», «Cambiar el porcentaje» la abre prellenada;
  conserva el color (la estampa es por proveedor) y puede usar la misma región desde que
  empieza (D19);
- **I1**: los vivos no se pisan en fechas (`termino_superpuesto`); al renovar, el nuevo empieza
  después de todos los vivos.

En un cambio, I2 e I3 se miran sólo si el cambio toca la marca o el porcentaje: un dato viejo
desparejo no frena correr una fecha. Dos renovaciones del mismo término: la segunda recibe
`no_renovable` («ya tiene un término más nuevo: renová ése»), no un choque de fechas.

### Borrador, confirmar y `rompe_distribucion`

**Guardar el borrador** (`guardar_borrador`, sin candado: no es oficial) acepta zonas con
solapes o excesos y los deja marcados. **Confirmar** (`confirmar_distribucion`) exige, contra
los términos frescos: zonas válidas y adentro; ninguna de una participación ajena
(`ZONA_AJENA`) o que ya no rige (`ZONA_DE_PARTICIPACION_TERMINADA`); ningún `EXCESO` (lo
dibujado no pasa lo contratado, con tolerancia 0: «Ajustar al contratado» deja su margen); y
ningún `SOLAPE` de más de 1 cm² entre participaciones cuyas fechas se cruzan. Con errores, las
zonas quedan como borrador y la respuesta es 409 `distribucion_invalida` (armada después del
commit: con `raise` se perdía el borrador). Con lo dibujado por debajo de lo contratado, se
confirma con el aviso `PENDIENTE`; una zona que cae entera sobre el zócalo o un parante es el
aviso `ZONA_SIN_SUPERFICIE_UTIL` (no suma). Una zona tiene un solo problema, y un aviso nunca
tapa un error. Topes de trabajo: 24 vértices por zona, 240 por cara y 60 zonas (422 y no se
guarda); 1 cm² es el área mínima de una zona, de un solape y de lo útil.

Al confirmar, la confirmada pasa a ser exactamente esas zonas y el historial guarda los
vértices de antes y de después («Ver cómo estaba» los vuelve a mostrar). Las zonas de una
participación que venció o se canceló se ven en gris en la confirmada **hasta la próxima
confirmación**, que las pasa al historial: no cuentan ni chocan con nadie (D19).

**`rompe_distribucion`** (§3.11 del diseño): un cambio de término —cambiar una reserva,
confirmarla o renovar— **no puede dejar rota la distribución confirmada**. Si con las fechas o
el porcentaje nuevos aparece un `SOLAPE` o un `EXCESO` que antes no estaba, el servidor
contesta 409 `rompe_distribucion` con la frase de qué rompe («Con ese porcentaje, la
participación 2 queda con 30 % dibujado y 25 % contratado: achicá sus zonas…»); lo que ya
estaba roto no frena. Sobre el borrador no frena: vuelve como `avisos_distribucion`. Así el %
nunca se acomoda al dibujo, y el dibujo tampoco tiene que acomodarse en silencio al %.

### La superficie comercializable, por tipo

Cada tipo que se vende por participación declara su receta en el catálogo
(`tipos[t].superficie = {orientacion, receta}`, las dos copias de `muebles.json`), y la cuenta
está escrita dos veces con los mismos casos: `frontend/src/utils/superficie.ts` ↔
`backend/app/services/superficie.py`, con `frontend/scripts/casos/superficies.json` (48 casos;
`probar-superficies.mjs` y `test_participaciones_geometria.py`). Una receta del catálogo sin su
cuenta no compila (`RECETAS` sale de un `Record`). Son siete:

| Tipo | Receta | Lo que no se vende | El plano de dibujo |
|---|---|---|---|
| Góndola (central o mural) | `gondola` | zócalo (12 cm), remate (10 cm) y los parantes de 5 cm, en cada unión de módulos (o tramos) y en las dos puntas | media espina + el fondo de la cara + 12 mm |
| Punta | `punta` | zócalo, copete desde `techoDeCara(h)` = máx(0,40, h − 0,36) y los parantes | d/2 + 14 mm |
| Robatope | `robatope` | la base hasta la primera repisa, el remate y los dos parantes | d/2 + 14 mm, **en el marco de sus repisas, inclinado** (−0,06 rad) |
| Ristra | `ristra` | base y cabezal (la tira mide de 7,6 a 13 cm de ancho) | 0,32·d (el gancho) + 12 mm |
| Cruz (`cross`) | `cross` | base, tapa y los dos postes | d/2 + 6 mm |
| Vitrina (`mueble`) | `vitrina` | zócalo, marco y los divisores de puertas de 60 cm | d/2 + 20 mm |
| Zona libre (`metro`) | `zona_libre` | nada: la tapa entera, **vista desde arriba** | 4 mm sobre la tapa, **sólo si se pisa** (h < 25 cm, `ALTURA_PISABLE`) |

Las cotas de la góndola, la punta y el robatope están **copiadas** de
`muebles/medidas.ts` y la prueba de Python compara la copia; las de la ristra, la cruz y la
vitrina están en `StoreEditor3D.tsx` y las amarra `probar-superficies` por texto. Lo que manda
la separación en cada tipo es lo más saliente del frente (el porta precios en la góndola, la
cenefa en la punta, la tira de estado en el robatope), medido: el plano va ≥ 6 mm por delante.
Las exclusiones pasan a u,v (en la cara B, en espejo), se recortan a [0,1] y se cuantizan a
1e-6. **Topes**: un mueble de más de 1 000 m o con más de 200 módulos o puertas
(`MEDIDA_MAXIMA`, `MAX_VANOS`) no tiene superficie (la API no acota `w` ni `modulo`, y con
`w = 1e308` la cuenta no terminaba); lo útil tiene que pasar de 1 cm².

### La geometría: franjas verticales, exacta y gemela

`frontend/src/utils/zonasGeometria.ts` ↔ `backend/app/services/zonas_geometria.py`, con
`frontend/scripts/casos/zonas.json` (incluye `exactos`, 25 casos que Python reproduce bit a bit,
el peor caso de 240 vértices y la sección `ajustar`). La unión, la intersección y el recorte
contra las exclusiones salen de un **barrido por franjas verticales** entre todas las x de
vértices y de cruces: dentro de una franja ningún borde se cruza con otro, así que el largo en
el punto medio por el ancho es la integral exacta. Los dos lados dan **el mismo número, bit a
bit** —el porcentaje que la dueña ve en el lienzo es el que el servidor acepta al confirmar, y
una zona al filo del redondeo no puede pasar en uno y rebotar en el otro—: bucles explícitos
con el mismo orden de suma (nada de `sum()`, `math.fsum` ni `reduce`: Python 3.12 cambia
`sum()` de flotantes, y una guarda en las dos suites lo busca), cuantización a 1e-6 escrita
igual, enteros para la simplicidad y la orientación, el mismo desempate al ordenar.

La validación de una zona (`validar_zona` / `validarZona`), en orden: `ZONA_MALFORMADA` (no es
una lista de pares de números finitos: 422, no se guarda), `ZONA_POCOS_VERTICES`,
`ZONA_DEMASIADOS_VERTICES` (24), `ZONA_FUERA` (sale de [0,1]²), `ZONA_SE_CRUZA` y
`ZONA_SIN_AREA` (menos de 1 cm²). Rapidez medida en CPython: 0,09–0,12 s el peor caso del
diseño y 0,44–0,50 s un zigzag armado para cruzarse; por eso **la geometría se mide antes del
candado**, y adentro sólo se juzga.

### u,v y cómo se proyecta en el 3D

**La convención**: u = 0 es el borde IZQUIERDO de quien mira la cara de frente; v = 0, abajo
(en la tapa de la zona libre, el borde delantero). El marco es el del `<group>` del mueble
(origen en el centro de la huella, en el piso, `y` arriba, el frente hacia −z, la cara B hacia
+z), y `utils/zonas3d.ts` tiene las fórmulas con su tabla (`transformDeCara`, `formaDeZona`,
`puntoDeLaCara`): la cara A va girada media vuelta en `[0, 0, −plano]`, la B en `[0, 0,
+plano]`, la tapa del metro acostada en `[0, plano, 0]`, y el robatope suma un grupo de afuera
con el giro de sus repisas. `probar-superficies` arma con three la misma jerarquía y compara.

`components/StoreEditor3D/muebles/ZonasDelMueble.tsx` dibuja las zonas **como hijas del grupo
del mueble** (se mueven con él), con la misma superficie que el lienzo (la del servidor) y la
misma fórmula:

- **el relleno son los trapecios de la unión ∩ lo que se vende** (`trapecios`): cada punto se
  pinta una vez y nada cae sobre zócalo, parantes o copete; lo que se ve pintado es lo que
  cuenta. Encima, la cinta del contorno dibujado: 1 cm (2 cm la elegida), discontinua la
  reserva, gris punteada la historia, punteada lo que no cuenta el día que se mira. Qué se
  rellena lo decide `comoSeDibuja`, la misma regla del lienzo: relleno sólo si cuenta ese día
  y tiene estampa; una zona de una participación que la cara no nombra (un dato roto que el
  servidor marca) va sin relleno y punteada, en los dos;
- **sin z-fighting contra el mueble**: el plano va ≥ 6 mm por delante de lo más saliente, el
  mueble está desnudo y los rellenos no escriben profundidad y llevan `polygonOffset`. **Ni
  entre cintas**: cada una tiene un nivel estable (`nivelDeCinta`: la historia abajo, cada
  participación por su `spaceId`, arriba la resaltada y encima la elegida) y cada nivel va
  0,2 mm más afuera (`separacionDeCinta`, hasta 3 mm); lo que separa es la posición, el
  `polygonOffset` escalonado es refuerzo;
- **no roban el clic**: `raycast` nulo en toda malla; la cara y el punto que se tocan salen de
  un rayo contra el plano de la cara (`corteConLaCara`, 2 cm de tolerancia en metros), y si la
  caja real de otro mueble corta el rayo antes (`rayoTapado`), el clic no elige nada;
- en una doble, la cara que no se edita va a media opacidad, cada cara lleva su letra «A»/«B»
  y la que tapa el mueble se esconde en cada cuadro (`letraTapada`, comparada con un rayo de
  three en más de 1 000 cámaras); el rótulo «n · %» va sobre la zona; a más de 40 m no se
  dibujan las zonas ni se montan las letras y los rótulos (`sigueLejos`, que vuelve a los
  39 m).

**Los colores** (`utils/coloresDeMarca.ts`): tres tonos validados (`--marca-1..3` en
`tema.css`, repetidos en el bloque oscuro) por tres texturas (lleno, rayado a 45° y a 135°) son
nueve estampas; la preferida es `supplierId mod 9`, así un proveedor se ve igual en todas las
caras, y si choca dentro de una cara se corre a la siguiente. **El color nunca va solo**: la
identidad la llevan la cinta en tono pleno, la textura y el número. Una participación nueva
nunca repinta a las anteriores.

### El modo Distribución del Editor 3D

**Entrar.** En el panel comercial del 3D, «Distribuir esta cara» (`data-distribuir`); desde
Supervisar, «Abrir en Distribución» o «Renovar» (`pedirEnfoque3D(…, { distribucion })`; lo
atendido vive en una variable de módulo, así un pedido no vuelve a entrar solo al remontar el
editor). El trabajador no entra al 3D. `entrar` guarda antes el plano pendiente
(`flushPending`) —si no, el servidor todavía ve la cara como se vendía antes y contesta 409— y
lee la cara. Una cara que todavía no se vende así se pasa con «Vender esta cara por
participación» del panel, o con «Cómo se vende → Por participación» (`PartesDelMueble`, el mismo
panel en el 2D y el 3D: `formasDeVenderDe`), que pasa por las mismas guardas: con
participaciones vivas no se sale de participación, con espacios internos vendidos y vigentes no
se entra (`revisarCambioDePartes`), y vendida entera sólo avisa. Lo que no se puede repartir lo
dice: sin receta, la zona libre alta, el mueble que no es comercializable.

**El mueble desnudo.** Un contexto (`muebles/desnudo.ts`) que leen `ProductoEnGondola`,
`ProductoEnPunta`, `ProductoAGranel` y `ProductoDePrueba`, que devuelven `null` después de todos
sus hooks: el mueble entra y sale del modo sin remontarse. Se cortan el gizmo, la caja de
selección y el arrastre del mueble, y la paleta se oculta. Fuera del modo, un mueble que no es
por participación da 0 píxeles de diferencia contra `578058c`.

**Lienzo y 3D, con la misma fuente.** A la izquierda el lienzo 2D
(`components/Distribucion/LienzoDeZonas.tsx`: un SVG en metros, el puntero por
`getScreenCTM().inverse()`, rueda no pasiva de 1× a 20× alrededor del cursor, paneo con espacio
+ arrastre o el botón del medio, «Encuadrar» con 0); a la derecha el 3D. Los dos dibujan
`edicion.zonas` del store con la superficie del servidor. **Se dibuja sólo en el lienzo**; en el
3D se elige la zona y la cara (un clic en la otra cara pasa a ella, y con cambios sin guardar
pregunta antes). Por debajo de 1440 px, «Ocultar 3D» le da todo el ancho al lienzo.

**Las herramientas** (el reductor puro `utils/edicionDeZonas.ts`): Seleccionar (V), Rectángulo
(R) y Polígono (P; cierra un clic en el primer punto o Enter, Retroceso saca el último, Esc
cancela). Mover la zona o un vértice, doble clic en un borde agrega un punto, manijas de escala
(Shift conserva la proporción), flechas de a 1 cm (10 cm con Shift), Supr borra la zona o el
vértice. El imán (G, prendido) pega a vértices y bordes de otras zonas y al borde de la cara;
el imán a entrepaños y parantes existe pero va apagado —el pedido no deja imponer las baldas— y
las guías se ven igual. Deshacer y rehacer, 100 pasos, y un arrastre entero es uno. En «Mirar»
nada edita. **«Ajustar al contratado»** achica las zonas de una participación hacia su punto
interior (no el centroide: en una L cae afuera), con búsqueda binaria, hasta quedar medio pb
lejos del filo del redondeo; si para no pisar a otra marca tendría que dejarla con menos de la
mitad de lo contratado (`MIN_FRACCION_SIN_PISAR`: una U con otra marca adentro del hueco),
prefiere dejar el solape a la vista, marcado.

**El panel** (`PanelDeDistribucion.tsx`): el título «Distribución · NAVE · GON-01 · cara A»
(`tituloDelPanel`: la paleta de la sede se oculta en el modo, y es lo único que dice qué sede
es; en dos renglones parejos, nunca cortado), cara A | B, Mirar | Editar, el estado, Salir; la
barra de capacidad apilada con «Comprometido X % · queda Y %» y un selector de período; «Ver al día»;
la leyenda (`LeyendaDeParticipaciones.tsx`), una fila por participación viva con «25 %
contratado · 24,1 % dibujado · falta 0,9 %» (o «sobra»), el estado comercial y la vigencia, y
arriba «Para vender: queda X %» —ahí están las cuatro magnitudes a la vista—; el menú de cada
una (Renovar, Confirmar, Cambiar y Cancelar reserva, Cancelar contrato, que es el `DELETE
/spaces/{id}/leases/{id}` de siempre, Ajustar al contratado); la historia con «Cargar de nuevo»;
los errores y avisos en vivo, que llevan a la zona; el historial plegado. En «Editar», la zona
elegida muestra su participación, proveedor y marca, %, m² y el estado del término. El
**formulario** (`FormularioDeParticipacion.tsx`, modal: alta, renovar, confirmar, cambiar,
cargar de nuevo) valida antes de mandar lo que el servidor rechazaría con 422, hace la vista
previa con `revisarCapacidad` y `revisarTerminos` —las mismas frases del servidor—, muestra la
tarifa de la cara como referencia y un 409 arriba sin cerrarse —y el store vuelve a leer la cara
y la ocupación en segundo plano (`releerTrasConflicto`): la vista previa y el panel dicen lo que
queda de verdad, con lo escrito intacto—; Esc con algo escrito pide confirmación. Antes de
confirmar, **el resumen de cambios** (`ResumenDeCambios.tsx`): por
participación, lo dibujado antes y después; los errores bloquean y ofrecen «Guardar como
borrador».

**El teclado, aislado.** `atajoDeDistribucion` escucha en captura en `window`: mientras dura el
modo, Supr, Retroceso, R, F, Esc y Ctrl/⌘+Z/Y **nunca le llegan al atajo global del editor**,
tenga el foco quien lo tenga (con el foco en un botón de un diálogo, Supr borraba del plano el
mueble que se distribuía). Las acciones se despachan sólo con el foco en el lienzo o en `body`
(donde queda después de tocar el 3D); desde el panel, sólo lo que no borra ni mueve
(`DESDE_EL_PANEL`); los campos y los diálogos se quedan con su Esc y su Enter. **Esc nunca saca
del modo**: se sale con «Salir». WASD no hace nada. Los diálogos llevan `role="dialog"` y
`aria-modal`.

**La cámara**: la mira no baja de y = 0 al panear (`frenarMira`) y una vista guardada muy baja
sube a la mira + 0,3 m (`sanearOrbita`); girar no dibuja (clic contra arrastre por 4 px de
`e.delta`). Al entrar o cambiar de cara se encuadra la cara **entera**, con el aspecto que
tiene el lienzo partido en ese momento (`encuadreDeLaCara`, `utils/encuadreDeDistribucion.ts`,
puro): de frente si entra (`vistaDeVenta`); si no —una góndola de 3 m frente a un pasillo de
2,5 m no entra en ≈ 560 px de ancho—, el tres cuartos de menor giro (30° a 70°, de a 5°) que
la abarca, lo más cerca posible, dentro del salón, fuera de los muebles y con la subida mínima
que aceptan los controles de la cámara; si ninguno la abarca, el que muestra más. Sólo cambia
«De frente» del editor sobre el mueble que se distribuye; las tomas de venta no.

**El guardado, sin perder nada en silencio** (`store/distribucionStore.ts`): el borrador se
autoguarda a los 20 s de quietud (`automatico: true`: sin historial ni bitácora); «Guardar
borrador» y el «Guardarlos como borrador» del diálogo anotan. Las escrituras van en fila
(`while (enCurso)`), o la sesión se daba a sí misma un `version_vieja`. Si otra sesión guardó en
el medio (409 `version_vieja`), se deja de autoguardar, sale la franja «Otra sesión cambió…» y
«Traer lo nuevo» combina por participación (`fusionarZonas`), con «Usar lo mío» para los
conflictos. Cambiar de cara o salir con cambios pregunta (guardar, descartar o seguir);
«Descartarlos» tira los cambios también en «Mirar» (`salir`/`cambiarCara` con
`{ descartar: true }` y `descartarEnCualquierModo`: el reductor no edita en «Mirar», y sin esto se guardaba
como borrador lo que se pidió tirar). Si el guardado falla al salir, la edición queda en
memoria y al volver se ofrece «Recuperar lo que no se guardó». Mientras el plano tiene cambios
sin guardar, el panel pasa solo a «Mirar». Nada de esto va a `localStorage`: los dos stores se
vacían al cambiar de sesión o de cliente. Lo único que sobrevive a un cierre de sesión (un 401,
que con el autoguardado frenado por un `version_vieja` se llevaba todo lo dibujado desde el
409) es lo no guardado, apartado en una variable del módulo (`reservaDeLaSesion`): vuelve como
«Recuperar lo que no se guardó» sólo si entra de nuevo la misma persona, en el mismo cliente y
como administradora; cualquier otra sesión lo tira sin mirarlo.

**Lo que se excluye.** Una sola condición decide si el modo se ve (`distribucionALaVista` en
`StoreEditor3D.tsx`, y `Scene` repite la defensa): la cara activa es de este cliente y esta
sede, el mueble está en el plano, y NO hay Presentar, ni `privadoPara`, ni visor de Vender
(`soloVenta`), ni primera persona, ni reunión (que incluye cualquier prueba de producto de la
sesión), ni un mueble colocándose. Dentro del modo, Presentar, 1ª persona y Propuesta (la
lámina) están deshabilitados («Salí de Distribución para presentar»); entrar a cualquiera de
ellos, o desmontar el editor, saca del modo a la fuerza. El visor de Vender nunca le pasa la
capa a la escena (`probar-vender`).

**Lo que cambia fuera del modo**, en un mueble por participación: el color de estado sale de
la ocupación (`estadoQueSeVe`: «Tomada», «Parcial», la palabra del plano 2D y Supervisar,
`PALABRA_POR_OCUPACION`; nunca «Disponible» en verde sobre lo contratado, y «Estado fixture» lo
dice con la nota del selector del plano, `notaDeEstadoPorOcupacion`; una cara que ya está
«Ocupado» por su propio contrato —vendida entera antes de pasar a participación— se queda
«Ocupado» y sin nota, como en el plano), los paneles
verdes de espacios internos libres no se dibujan y el panel no los
ofrece; el metro bajo es una placa; el aviso de cara inaccesible (`carasInaccesibles`,
medido con un rayo contra la caja del vecino) sale en el panel y en «Revisar» del 2D; y la
tarjeta CONTRATADO del panel dice «Por participación · comprometido 55 % · queda 45 %», una
línea por cara en una doble, con la ocupación anónima del día
(`lineasDeContratadoPorParticipacion`; en una reunión, sólo «queda 45 %»), nunca «Sin contrato
activo», y manda a Distribución en vez de a Sede → Vender. Se arregló de paso la selección de los espacios internos de la cara B (el
contorno se robaba el rayo).

**Un gotcha de los colores**: el editor es un cajón oscuro que redefine sólo los canales
`-rgb`; un `var(--surface)` resuelto en `:root` llega adentro con el valor del tema claro.
Adentro va `rgb(var(--x-rgb))`, y una guarda de `probar-distribucion` lo exige.

### La API `/api/participaciones`

`backend/app/routers/participaciones.py`, con la lógica en `services/participaciones.py` (sin
commit: el router anota la bitácora, hace commit y después arma la respuesta y encola los
correos). **Todas las rutas piden administrador, salvo `GET /ocupacion`**. Las literales van
antes que las paramétricas, y los GET reciben todo por query (un código con `#` no rompe la
URL y el barrido del token de montaje las cubre sin casos nuevos):

| # | Ruta | Qué hace |
|---|---|---|
| 1 | `GET /cara?sede=&espacio=` | Todo de una cara: superficie, firma, la distribución con sus dos capas, las participaciones con sus términos, la capacidad del período y la revisión. |
| 2 | `GET /resumen?sede=&dia=&desde=&hasta=&proveedor_id=&espacio=` | El informe de Supervisar (D18): los totales de UN día, la capacidad del período; por cara, estado, comprometido, pico, disponible, dibujado, pendiente, errores, avisos y `borrador_en`/`borrador_dia`; por proveedor; `sin_mueble` (caras con términos vivos que el plano ya no vende así) y `huerfanos` (contratos `…-PC<n>` sin término). Sin montos. |
| 3 | `GET /ocupacion?sede=` | **Cualquier sesión** (`require_auth`). Por cara, intervalos `{desde, hasta, pb}` y lo físico `{desde, hasta}`, sin nombres, montos ni números de participación. La leen Vender, Supervisar (y su globo), el plano 2D (el color y la ficha) y el 3D (el color y la tarjeta CONTRATADO). |
| 4 | `GET /historial?sede=&espacio=` o `?participacion_id=` | El historial: `entradas` (las filas) y `derivados` (los vencimientos y caducidades, sin fila, con `derivado: true` y `dia`). |
| 10 | `PUT /distribucion/borrador` | Guardar el borrador (con `automatico` para el autoguardado). |
| 11 | `POST /distribucion/confirmar` | Confirmar; con errores, 409 `distribucion_invalida` y queda como borrador. |
| 12 | `POST /distribucion/descartar` | Borrar el borrador; la confirmada queda. |
| 5 | `POST /` | Alta de una reserva provisional o de un contrato (participación nueva). |
| 6 | `PATCH /{id}` | Cambiar una reserva viva. |
| 7 | `POST /{id}/confirmar` | Reserva viva → contrato, con el mismo alta. |
| 8 | `POST /{id}/cancelar` | Cancelar una reserva viva (una caducada da 409 `reserva_caducada`; un contrato se cancela con el `DELETE` de siempre). |
| 9 | `POST /{id}/renovar` | Un término nuevo de la misma participación. |

Campos de más en el cuerpo son 422 (`extra="forbid"`: un cliente viejo que manda «proveedor»
al renovar no puede creer que lo cambió). Los errores llevan `{code, message}` (el 409
`distribucion_invalida` va dentro de `detail`, como un `HTTPException`, para que
`describeError` lea su `message`). Una escritura de término devuelve `{termino, cara}` (el
término y la cara leídos después del commit) y, salvo cancelar, `avisos` y
`avisos_distribucion`: `avisos` son los correos de contrato (los de la planilla, por
`bulk_leases._avisar`, con la parte «Participación 3 · 25 % de la cara A»); una reserva no
manda correos. El cliente del navegador es `frontend/src/api/participaciones.ts`, y la prueba
de orden de rutas compara lo que llama con las 12 que existen.

### Concurrencia

**El orden que no se negocia**, en todo camino que puede sobrevender una cara (alta, cambiar,
confirmar, cancelar y renovar un término, y confirmar la distribución):

    revisar → (medir) → tomar_candados([cara]) → db.expire_all() → revisar otra vez → escribir

- **El candado es el del mueble** (`services/candado.py`, `pg_advisory_xact_lock`), con la
  MISMA clave que la venta de la cara entera y de sus partes, el guardado del plano y la
  renumeración. Por eso todo camino arma el código completo de la cara con la sede del plano
  (`codigo_cara`): `GON-01` y `NAVE-GON-01` serían candados distintos. Y por lo mismo
  `forma_canonica` exige el código completo en el contrato suelto también para una cara que se
  vende por participación o que tuvo participaciones.
- **`db.expire_all()` justo después**: SQLAlchemy no refresca un objeto que la sesión ya tiene
  cuando se lo vuelve a consultar, y la primera revisión cargó los términos; sin esto, una
  reserva que otra sesión subió de 30 % a 70 % se seguiría leyendo en 30 %. **El alta conserva
  la lectura de antes del candado** a propósito: al principio sacar el `expire_all` no hacía
  fallar ninguna carrera, porque los términos de afuera no quedaban en ninguna variable y
  SQLAlchemy los volvía a cargar frescos. Andaba por suerte; ahora la protección depende del
  `expire_all` y la prueba lo nota si falta.
- Si con el candado la cara resulta otra (el plano cambió en el medio): 409 `plano_cambio`. Si
  cambió la distribución confirmada, se vuelve a medir adentro.
- **Versión optimista** en términos y distribuciones: `UPDATE … WHERE version = :leida`; 0
  filas → 409 `version_vieja`. En SQLite el candado no hace nada y esto es lo que queda.
- El borrador no toma candado (no es oficial); descartar compara la versión.

Lo probado: **cinco carreras contra un Postgres 16 descartable**
(`tests/test_participaciones_concurrencia.py`, sólo con `DATABASE_URL_PG_PRUEBA`; se saltean sin
él): dos altas de 60 % a la vez dejan una; una reserva que sube contra un alta no pasan las
dos; dos renovaciones del mismo contrato dejan una; y sacar la división en el plano contra un
alta, en los dos órdenes, deja la base coherente. Sin el `expire_all`, la de la reserva da 110 %
de la cara; sin el candado, fallan todas. En SQLite, espías que exigen el orden en los siete
caminos nuevos, en el guardado del plano, la renumeración, el contrato suelto, la planilla y la
importación.

### Cómo entra en los caminos de siempre

- **La compuerta** (`motivo_para_no_vender_parte`, la frase que usan la planilla y el contrato
  suelto): la cara entera de una cara por participación no se vende (`por_participacion`: «se
  vende por participación: cargá el porcentaje en el Editor 3D → Distribución (podés darle el
  100 %)»), ni una división física suya; una participación de una cara que NO se vende así no
  existe. `chocan` sabe que una participación choca con la cara entera y con una división
  física de su cara, no con otra participación (ésas las frena la capacidad) ni con una pieza.
- **La planilla y Vender** (`bulk_leases`): una fila `…-PC<n>` da «es una participación: se
  carga y se renueva en el Editor 3D → Distribución, no en la planilla». Además, como defensa
  en profundidad para una cara que dejó de venderse así con términos vivos,
  `bloqueo_por_participaciones` —preguntado sólo para las caras con términos, que averigua una
  consulta por tanda— y `expire_all` en `confirmar`.
- **El contrato suelto** (`create_lease`): `expire_all` después del candado, el mismo rechazo
  de un código `PC` y el mismo bloqueo. `PATCH /spaces/{id}/status` sobre una participación es
  409: «Reservado» a mano serían dos nociones de reserva sobre lo mismo.
- **La importación del plano** (`importar_del_plano.py`): la cara entera de un mueble por
  participación queda «Incompleta» aunque no tenga participaciones todavía, y un código del
  JSON que se lee como participación no se importa («…si es un mueble que se llama así,
  renombralo»).
- **El guardado del plano** (`PUT /layout`): toma el candado también cuando una cara entra o
  sale de «por participación» (sin cambiar lo ofrecido ni la firma de partes no tomaba ninguno)
  y hace `expire_all`. Tres guardas nuevas, con `{code, message, choques}` y en
  `RECHAZOS_CONOCIDOS` del navegador: **`participaciones_vivas`** (sacar de participación una
  cara con contratos o reservas vivas, por cualquier camino: la división, el tipo, no
  comercializable, borrar, renombrar sin la renumeración, doble → mural),
  **`slots_vendidos_en_participacion`** (pasar a participación con espacios internos vendidos
  y vigentes) y
  **`slots_en_participacion`** (vender un espacio interno en un mueble por participación: pasar
  a ocupado, o cambiarle a uno vendido el fin, el valor, el inicio o el proveedor; liberar
  sigue permitido). Un contrato `…-PC<n>` vivo cuya cara deja de venderse así lo frena
  `contratos_vivos`, porque `ofrece` ya sabe que una participación se ofrece si su cara se
  vende por participación. Y el guardado anota en el historial `distribucion.division` y
  `distribucion.para_revisar`.
- **La renumeración**: toma los candados de los códigos viejos y nuevos de cada mueble que se
  muda (`codigos_del_candado`), hace `expire_all` y **vuelve a calcular el plan**
  (`con_candados`): si no, un `…-PC2` creado en el medio quedaba con el nombre que se iba. Si
  con el candado el plano cambió: 409 `renumeracion_bloqueada`.
- **Borrar una sede** (`archive_sede_spaces`): toma los candados de las caras con términos
  (candado → `flush` → `expire_all`: en el otro orden se trababa con un guardado del plano de la
  misma sede, deadlock reproducido en Postgres), **cancela las reservas vivas** y da de baja
  los términos de los contratos que cierra (sin `baja_en` si ya habían vencido), con quién lo
  hizo en `baja_por` y el evento `sede.baja` en el historial. `GET /layout/{sede}/impact`
  cuenta `reservas_vivas`, el diálogo «Borrar sede» dice «N reservas provisionales de
  participación se cancelan» y la bitácora las cuenta. **El renombre de sede** (que en el
  navegador es borrar y crear) consulta antes el impacto y, con contratos o reservas vivas,
  abre `RenombrarSedeDialog` (`utils/impactoDeSede.ts`); la trampa del renombre (D21/D22) sigue
  sin arreglar, pero ya no es a ciegas.
- **Cancelar un contrato** (`DELETE /spaces/{id}/leases/{id}`): el gancho
  `al_cancelar_contrato` (`services/ciclo_participaciones.py`) le pone `baja_en` a su término y
  anota `contrato.cancelado`; si el lease ya había vencido por fecha, queda «vencido».
- **Borrar un proveedor** con reservas de participación, vivas o no, es 409 (antes era el 500
  de la clave foránea): son las únicas filas que guardan el proveedor fuera de un lease.
- **El montaje**: la mercaderista (`/montaje/mi-espacio`, el correo) lee «Participación 1 ·
  25 % de la cara A»; sin término, «Participación 4 de la cara A»; nunca el dibujo ni la plata
  (`_texto_de_participacion`, `routers/montaje.py`). La misma ruta le contesta a un trabajador
  (`require_montaje`), con el %: ver *Arreglos de la revisión final*. El tablero de Montajes
  del administrador (`MountView.tsx`) dice «Participación 3 · cara A», sin el %.
- **La consola de la plataforma**: la participación es un tipo propio, `participacion`
  («participación de cara», en `formato.ts`), que cuelga de su cara en `espacios[].partes` (la
  cara figura ocupada), fuera del benchmark, de los precios sugeridos, de «precio bajo» y del
  spread, y sigue contando en `contratos_sin_tarifa` porque no tiene tarifa propia.
  `referencia_de_espacio` de una participación es `None`: compararla con la tarifa de la cara
  la listaría «75 % por debajo».
- **La auditoría del desfase** (`utils/auditoriaDesfase.ts` y `scripts/auditar_desfase.py`)
  pregunta `ofrece`: una participación tiene mueble si su cara se vende por participación.

### Supervisar, Vender y el plano 2D

La ocupación anónima se lee sólo si la sede tiene alguna cara por participación, una vez por
sede, y otra vez cuando cambia el mapa de la base o vuelve una escritura de participaciones
(`store/ocupacionStore.ts`; cada pedido lleva un número que sólo crece, así una lectura vieja
no pisa a la nueva). De ahí sale `dispoPorParticipacion` (`dispo_por_participacion`, gemela):
**libre** si no hay nada comprometido en el período, **parcial** si sí y queda algo, **tomado**
si no queda nada.

- **Vender**: «Por participación · queda 40 %» o «tomada», sin un nombre. Una cara por
  participación no se vende desde Vender: tocarla no suma nada ni vacía el contrato armado, y
  su pastilla de la tarifa se ve deshabilitada (borde punteado, `not-allowed`, «por
  participación»). Lo que sí hace el toque es decirlo, en una caja con candado en la ficha
  del contrato (`textoAlTocarEnVender`): «Se vende por participación: queda 45 %. Las
  participaciones se cargan en el Editor 3D → Distribución.», con lo que queda en el período
  del plano —el número del rótulo—, haya o no espacios sumados; sin nombres, sin montos y sin
  botón a Distribución, porque del otro lado de la mesa puede estar otro proveedor. «Cuándo se
  libera» y los contadores miran la ocupación, y una cara que las reservas dejan sin lugar hoy
  sale de «Libres». Una cara parcial cuenta en la tarifa como «+N entran» y en la leyenda como
  «Vence dentro»: son los rótulos que ya tenía el ámbar, y no son exactos.
- **Supervisar, administración** (todo dentro de `isAdmin`; una guarda de `probar-comercial`
  lo vigila): «Para revisar» suma siete tarjetas (`utils/revisarParticipaciones.ts`, puro):
  *Contratado sin dibujar*, *Distribución con problemas*, *Distribución para revisar*,
  *Reservas por caducar* (7 días o menos), *Borradores sin confirmar* («de hace N días», por
  `borrador_dia`), *Participación sin mueble* (armada con la lista `sin_mueble`, nunca con la
  cuenta: una cuenta de toda cara con participaciones, también las canceladas, era una falsa
  alarma que no se iba nunca) y *Contrato de participación sin término*. La ficha de la cara
  (`ParticipacionesDeLaCara.tsx`) trae la barra de hoy, la lista, el estado de la distribución,
  «Abrir en Distribución» y «Renovar», y esconde «Negociar»; la tabla «Participaciones de cara»
  filtra por proveedor, día y período. **El globo** del mapa (`FixturePopover`) dice, con la
  ocupación de hoy (`useDispoDeHoy`, la de la pastilla, y `textoDeLoComprometido`): «Por
  participación · comprometido 55 % · queda 45 % — disponible para vender en el Editor 3D →
  Distribución.», con «disponible» sólo si queda algo, o «Se vende por participación.» si la
  ocupación todavía no llegó; no ofrece «Negociar este espacio» y suma «Abrir en
  Distribución». Muestra la cara A, como siempre.
- **Supervisar, trabajador**: sin bloques de participaciones, sin %, sin filas `PC`; la cara
  dice la palabra («Libre», «Por participación», «Tomada»: `palabraDeLaCara`), y el globo,
  «Por participación.» o «Por participación · tomada.», sin botones. Sus contadores
  de ocupación incluyen los contratos `PC`, para coincidir con los de administración. En el
  KPI «Ocupación», un contrato de participación hace trabajar a su cara como una puerta vendida
  a su nevera; una reserva, no.
- **El plano 2D**: cada mitad de la cara se pinta con la ocupación del día (`pintadoDe`): rojo
  lo tomado, ámbar lo parcial. «Cómo se vende» ofrece «Por participación». La ficha
  (`AssignmentPanel`) lee la misma cuenta (`dispoDeLaCara`): la pastilla y «Estado del
  espacio» dicen «Tomada» o «Parcial» en ese color (`rotuloPorOcupacion`) con la nota «lo dice
  la ocupación de hoy de sus participaciones» —el `status` de la base sigue «libre»—;
  «Contratado» dice lo comprometido y lo que queda de la cara activa, dónde se cargan y «Abrir
  en Distribución». «Sede → Vender» queda para lo que se vende entero o por partes.

Una cara por participación nunca tiene `supplierName` (un contrato `…-PC3` no la pinta: la
fusión busca por código exacto). Por eso el globo, la ficha del 2D, la tarjeta CONTRATADO del
3D y Vender leen la ocupación anónima y dicen dónde se cargan con la misma frase
(`DONDE_SE_CARGAN`, en `utils/partes.ts` con `textoDeLoComprometido`, `rotuloPorOcupacion` y
`textoAlTocarEnVender`): antes las tres primeras decían «Disponible» o «Sin contrato activo»
sobre un robatope tomado al 100 %, y tocarla en Vender no decía nada.

### El historial y la bitácora

**El historial** (`historial_participaciones`, `anotar_historial`) cuenta lo que pasó con una
cara y sus participaciones: lo contractual (`participacion.reserva`, `.contrato`, `.editada`,
`.confirmada`, `.renovada`, `reserva.cancelada`), lo gráfico (`distribucion.borrador` cuando se
guarda a mano, `.confirmada` con los vértices de antes y de después, `.descartada`), el estado
(`distribucion.division`, `.para_revisar`, `.otro_mueble`) y los eventos de otros caminos
(`contrato.cancelado`, `sede.baja`). Los vencimientos y las caducidades **no se escriben**: se
derivan de las fechas al leer (`participacion.vencida`, `reserva.caducada`, armadas por
`_derivado`) y llegan con `derivado: true`, `dia` (el día de Colombia en que pasó: el siguiente
al último día de vigencia) y `en`, la medianoche de ese día en Colombia escrita en UTC con el
formato de las entradas reales (`2026-10-18T05:00:00+00:00`), así ordenarlas por texto o por
instante da lo mismo. El panel (`lineasDelHistorial`) ordena por el instante y de una derivada
muestra sólo el día, leído como texto, nunca con `new Date("2026-10-18")`, que en Colombia es
el 17 a las 7 p. m.; una real lleva el día escrito igual y la hora: «18 oct 2026» contra «17 oct
2026, 03:24 p. m.». **Nunca lleva montos** (`anotar_historial` frena con `ValueError` una clave de plata, también anidada),
**nunca se purga** (≈ 10 KB por confirmación, con vértices) y **guarda para siempre el correo
de quien actuó**: una supresión por Ley 1581 se hace a mano.

**La bitácora** (`services/bitacora.py`) suma nueve acciones: `participacion.reserva`,
`.contrato`, `.confirmada`, `.renovada`, `.editada`, `reserva.baja`, `distribucion.borrador`,
`.confirmada` y `.descartada`. El autoguardado no anota nada; cancelar un contrato de
participación sigue anotando `contrato.baja`, por el camino de siempre.

### Lo que esta fase NO hace

Las limitaciones escritas del diseño (§15.2), con lo que quedó de verdad:

- **Tipos**: sólo los siete de la tabla tienen superficie; la zona libre, sólo la baja. La
  nevera de puertas, la isla, el exhibidor de cartón, la estiba y el resto no se venden por
  participación hasta tener su receta y sus casos.
- **La unidad de dos caras** (D4): vender «la góndola» al 30 % son dos participaciones.
- **Copiar distribuciones** (D20), ni de una cara a otra ni entre muebles.
- **Quién ve**: el proveedor no ve zonas ni participaciones; la mercaderista lee su texto, sin
  dibujo; el trabajador, en sus pantallas, ve los contratos `PC` sólo en Montajes y la palabra
  de la ocupación anónima. Por la API le llega el % (el texto de montaje, y la ocupación
  cruzada con `/spaces/comercial`), nunca la plata: decisión pendiente de la dueña (ver
  *Arreglos de la revisión final*).
- **El dibujo es sólo en el lienzo 2D**, sobre un plano frontal 6 a 25 mm por delante (en el
  robatope, inclinado; en el metro, sobre la tapa): una proyección, no un recorte del
  producto. En la punta, el copete se excluye desde `techoDeCara(h)` aunque el 3D baje el
  cartel cuando el hueco es chico (la diferencia, ≤ 12 cm, queda dibujable).
- **El estado de la cara no cambia** (D6): cambia el color con que se pinta.
- **La consola** cuenta la cara ocupada con cualquier participación vendida, sin ponderar por
  el porcentaje.
- **La bitácora de la planilla** sigue sin anotar `contrato.alta` (hueco conocido); el
  endpoint nuevo sí anota.
- **Cancelado contra vencido** se distingue por `baja_en`: un lease cerrado por un camino que
  no pase por los ganchos se ve «cancelado» si todavía no había vencido.
- **El renombre de sede** hereda su trampa (cancela las reservas y da de baja los contratos de
  participación de la sede) aunque ahora avisa antes; y el campo «Sede» del 3D (V16): un
  mueble cuyo `sede` no coincide con la del plano no muda la fila de la cara de sus
  participaciones al renumerar.
- **Las paredes** que no están dibujadas como mueble no cuentan para el aviso de cara
  inaccesible.
- **Una reserva no tiene tope de caducidad** más allá de `hasta` (un tope, p. ej. 30 días, es
  una decisión comercial que quedó propuesta).
- **Herramientas para después**: «Ajustar el borde a la vecina» (el imán cubre el caso común),
  dibujar en el 3D, copiar.
- **Preexistentes, sin agravar**: `PUT /layout` no valida `w` ni `modulo` (la superficie da
  `None` fuera de los topes, pero el 3D se puede colgar; validarlo podría rechazar planos que
  ya existen); dos filas de `spaces` que difieren sólo en mayúsculas hacen terminar la
  renumeración en un 500; `save_layout` compara `base_updated_at` antes del candado. Y chicos de
  esta fase: descartar sin borrador igual sube la versión; Esc con un modal abierto y el foco
  en `body` suelta el mueble seleccionado (cortarlo rompería los modales que escuchan en
  `window`); `loVendidoDe` busca la ocupación con la sede del mueble.

### Cómo se probó

- **`npm run probar`**: 1180 pruebas en 36 suites, 0 fallas, con los arreglos del recorrido
  final (en `6a27cc4` eran 1176, en `fc97dbc` 1154 y en `578058c`, 977).
  Tres suites nuevas: `probar-zonas` (38),
  `probar-superficies` (20) y `probar-distribucion` (68: los casos de las reglas, los stores
  con el `client.ts` real sobre un servidor de prueba, el oyente del teclado foco por foco, los
  colores, «Borrar sede», el historial con `TZ=America/Bogota`…), y
  pruebas sumadas a `probar-muebles` (el modo, el mueble desnudo, las guardas de la escena),
  `probar-vender`, `probar-comercial`, `probar-partes`, `probar-revision`, `probar-camara`,
  `probar-tema`, `probar-catalogo`, `probar-geometria`, `probar-auditoria` y `probar-sinmueble`.
- **pytest**: los cinco `tests/test_participaciones*.py` (el servicio y la API, la
  concurrencia, el ciclo de vida, las reglas y la geometría) dan 63 passed y 5 skipped (las
  carreras, sin `DATABASE_URL_PG_PRUEBA`). La suite entera, en tres tandas al cierre del paso
  4c: 1586 passed, 29 skipped, 0 failed. Contra Postgres 16 descartable,
  `test_participaciones_concurrencia` + `test_partes_concurrencia`: 16 passed. Además,
  pruebas sumadas a la copia, el traspaso, la bitácora, el borrado de sede, la consola, la
  auditoría del desfase, el catálogo y la venta por partes. Los arreglos de la revisión final
  sumaron cuatro a `test_participaciones.py` (27 passed en su verificación) y volvieron a correr
  `test_participaciones_concurrencia` + `test_partes_concurrencia` contra Postgres 16 (16
  passed); las cuentas de arriba son de antes.
- **Los gemelos**, con fuzzers TS contra Python: 12 000 casos de área e intersección, 48 000 de
  validación, 6 000 de medición y 48 000 de superficie y firma, sin una diferencia (la mayor
  contra shapely, 4,4e-16); y 4 × 1 500 escenarios de reglas, sin una diferencia. Cada paso
  corrió su tanda de mutaciones, y las que sobrevivían se cerraron con casos.
- **El recorrido A a I** en Chromium (sedes NAVE por participación y TERRON sin, con los siete
  tipos), sobre `d75f8ed`: A 12/12 (las cuatro magnitudes y el 45 %), B 15/15 (tres zonas sin
  doble conteo, que vuelven iguales al recargar), C 16/16 (vertical, horizontal, irregular,
  diagonal; el área por muestreo coincide), D 12/12 (el solape frena y queda de borrador), E
  11/11 (sobra 5 % → «Ajustar al contratado»; el % y el valor no cambian), F 11/11 (cada cara
  su capa, clic desde los dos lados, girar no dibuja), G (cancelar, caducar y vencer liberan y
  pasan a historia), H 16/16 (dos sesiones; dos altas de 60 % dejan una) e I (TERRON y GON-02
  dan 0 píxeles de diferencia contra `578058c`; el modo desnuda, aísla el teclado y no aparece
  delante de un proveedor). G e I encontraron defectos: ver abajo.

**Un gotcha de las pruebas**: en `probar-catalogo`, el contador de memos que preguntan la
tarifa se acumula entre archivos, así que una vez que alguno lo tuvo, **todo archivo que
mencione `rateTypeOf`, `tarifaDeEspacio` y compañía tiene que tener `const fichasPropias =
useFichasPropias()`**, aunque no tenga un memo propio. La regla de *Fichas propias* dice «todo
memo»; en la práctica es «todo archivo».

### Arreglos de la revisión final

La revisión final (integridad comercial, privacidad y reglas duras, escena y uso, y el
recorrido) se hizo sobre `d75f8ed`; la integración (`fc97dbc`) ya cerró lo que venía de los
pasos (el rótulo de la consola, «Borrar sede» y el renombre, la tarjeta *Participación sin
mueble*, los datos de la zona en «Editar», el Esc del formulario, la letra tapada). Lo que
quedaba abierto se arregló en `fc97dbc..6a27cc4`, en tres frentes separados y unidos al
final: el servidor (`813598c`, `8b7e289`), el Editor 3D (`4c106b0`, `13f084f`, `522b40c`) y
las pantallas (`cae6757`, `a0cc6dc`). Cada frente tuvo su verificación independiente, que
encontró y arregló lo suyo (el orden del historial en el servidor, el título cortado del
panel, el encuadre sin la prueba de sus giros, «Estado del espacio» sin fijar). Cada arreglo
tiene una prueba que falla contra el código de `fc97dbc`, y las mutaciones que sobrevivían se
cerraron con casos (quedan vivas una equivalente y una de una rama defensiva a la que no se
llega). Todo lo de abajo ya está escrito en las subsecciones de arriba; acá queda el porqué.

**Integridad (el servidor, `services/participaciones.py`).**

- **Una fila de cara sin `sede` ya no deja una participación sin confirmar, renovar ni
  cambiar.** Las filas de antes de la columna, las de `find-or-create` y las de un reporte de
  montaje no tienen sede, y el alta las reusa; después, `cara_del_termino` buscaba el mueble en
  el plano de una sede vacía y daba 404 «ya no está en el plano de .» con el mueble en su
  lugar. Ahora la sede sale de la fila de cara; si está vacía, de la fila `…-PC<n>` del
  término (`_crear_espacio_pc` la llena siempre con la del plano); y si tampoco, del prefijo
  del código (`_sede_por_prefijo`: la sede más larga que calce y cuyo plano tenga el mueble,
  porque `SAN` y `SAN-JOSE` empiezan igual). Y el alta le pone la sede del plano a una fila de
  cara que no la tiene (`_fila_de_cara`), sin pisar nunca una que ya está.
- **Una reserva caducada no se cancela.** Cancelarla la pasaba a `reserva_cancelada` con la
  fecha de hoy, y el historial dejaba de derivar «caducó»: se reescribía su historia. Ahora
  `revisar_alta` contesta 409 `reserva_caducada`, «La reserva ya caducó el 20 oct 2026: no hace
  falta cancelarla; queda en el historial.», con la fecha de `caduca` (como «caduca el …» de la
  leyenda), y no toca la fila. Una que caduca hoy todavía se cancela.
- **`fisicos_de` mira de qué fila de cara cuelga el término.** Contaba «con término» a todo
  lease `…-PC<n>` que tuviera uno, de cualquier cara. La carrera entre borrar la sede y la
  primera alta de la cara puede dejar el término colgado de la fila archivada `…#id`, y ese
  lease no lo contaba nadie: ni como físico ni como término de la cara nueva. Ahora un join
  contra la fila de cara del término, en la misma consulta, exige que sea ESTA fila; si no, el
  lease va como huérfano: cuenta como la cara entera (nunca sobreventa), sale en `huerfanos`
  de `/resumen` y en la ocupación, y Supervisar lo lista como *Contrato de participación sin
  término*.
- **El historial fecha bien lo derivado.** Un vencimiento o una caducidad no tienen fila (D6)
  y se arman al leer (`_derivado`). Su `en` era el día solo, y el navegador en Colombia lo
  leía como medianoche UTC: «17 oct, 7:00 p. m.», un día antes de cuando dejó de valer. Ahora
  traen `derivado: true`, `dia` y `en` como medianoche de ese día en Colombia escrita en UTC,
  con el formato de las entradas reales (`2026-10-18T05:00:00+00:00`). El arreglo había puesto
  `…T00:00:00-05:00`, y la verificación lo cambió: comparando textos, una entrada real de las
  10 p. m. del 17 (`2026-10-18T03:00…+00:00`) salía como más nueva que lo derivado del 18.

**Escena y uso (el Editor 3D y Distribución).**

- **«Descartarlos» descarta también en «Mirar».** La pregunta al salir o al cambiar de cara
  mandaba `descartarCambios` al reductor, que en «Mirar» no hace nada; la edición seguía
  `sucio` y salir la guardaba como borrador. Ahora `salir` y `cambiarCara` reciben
  `{ descartar: true }`, cortan el autoguardado y vuelven a lo último cargado o guardado con
  `descartarEnCualquierModo` (`edicionDeZonas.ts`), sin cambiar el modo.
- **Sin z-fighting entre cintas.** Dos zonas de participaciones distintas con un borde común
  (lo normal: el imán pega los bordes exactos) dejaban sus cintas coplanares, y el color que
  ganaba cambiaba a pedazos al girar 1°. Ahora cada cinta tiene un nivel estable
  (`nivelDeCinta`) y cada nivel va 0,2 mm más afuera (`separacionDeCinta`). Separa la posición
  y no el `polygonOffset`: medido en Chromium con las mismas geometrías, escalonar sólo el
  `polygonOffsetUnits` dejaba el 19 % de los píxeles del borde cambiando de color (contra el
  20 % de antes), y la separación, 0 %. En el navegador, sobre GON-04, las tomas con los dos
  colores mezclados pasaron de 65 de 126 a 0.
- **Un 401 después de un `version_vieja` ya no se lleva lo dibujado.** Con el autoguardado
  frenado por el 409, el token que vencía (dura 12 h) borraba todo lo hecho desde entonces, sin
  cota de tiempo. Ahora lo no guardado queda apartado en memoria (`reservaDeLaSesion`, en
  `distribucionStore.ts`, nunca en el navegador) y vuelve como «Recuperar lo que no se guardó»
  sólo para la misma persona, en el mismo cliente y como administradora.
- **Un clic sobre un vecino que tapa no toca la cara de atrás.** En Distribución los volúmenes
  de toque de los vecinos no reciben el rayo (si lo recibieran, se comerían el clic del mueble
  distribuido), así que nada tapaba: un clic sobre la góndola de delante elegía la cara de
  atrás, o cambiaba de cara. Ahora `corteConLaCara` da la distancia del corte y `rayoTapado`
  mira si la caja real de otro mueble (su huella girada, del piso a su alto, sin el margen de
  toque) corta el rayo antes; si lo corta, el clic no elige nada.
- **El encabezado dice la sede** (`tituloDelPanel`): con el modo encendido la paleta de la
  sede se oculta y, con dos sedes de la misma nomenclatura, nada en pantalla decía cuál era. La
  verificación encontró que en el panel de 320 px el título truncado se comía el código («…
  NAVE · GON-…»); ahora se parte en dos renglones parejos.
- **Lejos, ni letras ni rótulos.** Los `Html` son capas del DOM que no miran el `visible` del
  grupo, y seguían flotando más allá de los 40 m. Ahora no se montan (`sigueLejos`, con un
  metro de histéresis para no titilar en el borde) y el componente sólo se vuelve a dibujar al
  cruzarlo.
- **El 3D dibuja una zona como el lienzo** (`comoSeDibuja`): la de una participación que la
  cara no nombra se rellenaba en gris en el 3D y en el lienzo no.
- **El historial del panel** (`lineasDelHistorial`) ordena por el instante y no comparando
  textos, y de una derivada muestra el día leído como texto. Un servidor viejo, que manda `en`
  como día solo, se lee igual.
- **El encuadre al entrar abarca la cara entera** (`encuadreDeLaCara`). En el panel partido el
  3D tiene ≈ 560 px de ancho, y una góndola de 3 m frente a un pasillo de 2,5 m (GON-01·A)
  dejaba la zona de la participación 1 fuera de cuadro; alejarse no se puede y abrir el campo
  visual estira la cara, así que se gira. Medido con la cámara real, GON-01·A pasó de ocupar
  1,95 del cuadro (más de 1 es cortada) a 0,94, en tres cuartos.

**Lo que se lee de una cara por participación (las pantallas).** Una cara así nunca tiene
`supplierName`, y el globo de Supervisar, la ficha del plano 2D y la tarjeta CONTRATADO del 3D
decían «Disponible» o «Sin contrato activo — disponible para vender» sobre un robatope tomado
al 100 %; tocarla en Vender no decía nada (`textoAlTocarEnVender` estaba sin usar). Ahora las
cuatro leen la ocupación anónima: dicen cuánto queda (y, salvo Vender, cuánto está
comprometido), nunca «disponible» sobre lo que no tiene lugar, y que se carga en Distribución
(`textoDeLoComprometido`, `rotuloPorOcupacion`, `lineasDeContratadoPorParticipacion`,
`textoAlTocarEnVender`; ver *Supervisar, Vender y el plano 2D*). El trabajador lee la palabra,
sin %. En Vender no hay botón a Distribución: lo puede estar mirando un proveedor. La frase de
Vender se aparta de la de §9.9 del diseño, a propósito: dice dónde se carga.

**Lo que quedó abierto a propósito.**

- **El trabajador ve el % de una participación, y el % no es plata (D13). Lo tiene que
  confirmar la dueña.** La revisión de privacidad encontró dos caminos. `GET
  /montaje/mi-espacio?code=…-PC<n>` (`require_montaje`: administración, trabajador o token de
  montaje) le devuelve «Participación n · X % de la cara A». Y `GET /participaciones/ocupacion`
  (intervalos `{desde, hasta, pb}`, anónimos) cruzada por fechas con `GET /spaces/comercial`
  —que le da proveedor, marca y fechas de cada fila `…-PC<n>`, como de cualquier contrato— le
  arma quién tiene cuánto de cada cara. No se cambió nada, por tres razones. La regla dura es
  que la plata no viaja al trabajador, y ninguna de las dos rutas manda montos: valor mensual,
  nota y canon siguen redactados, y el historial frena las claves de plata. D13 pone el % en
  el texto de montaje porque es lo que necesita quien arma la cara, y el trabajador también
  arma y revisa montajes (`require_montaje` lo acepta a propósito). Y la ocupación necesita los
  pb para que «Libres» y el color del plano no le mientan. Lo que sigue cerrado: sus pantallas
  dicen la palabra («Por participación», «Tomada»), nunca el % ni la ficha; las rutas de
  `/api/participaciones` salvo `/ocupacion` le dan 403; y el proveedor no ve zonas ni
  participaciones (D12). Va contra la letra de D7 y de §15.2 del diseño («sin %»), y por eso es
  de ella. Si quiere el «sin %», sacarlo del texto de montaje es una línea en
  `_texto_de_participacion` (`routers/montaje.py`), pero sirve de poco mientras exista el cruce:
  cerrarlo pide redactar para el trabajador las filas `…-PC<n>` de `/spaces/comercial` o
  rediseñar la ocupación.
- **La carrera entre borrar la sede y la primera alta** sigue abierta: el archivo de la sede no
  toma el candado de las caras sin términos. Se eligió la mitad de `fisicos_de` y no la del
  candado: ya no puede vender de más, y lo que deja es un huérfano que Supervisar lista.
- **«Descartar mis cambios» no anda en «Mirar»**, como antes: el reductor no edita ahí. Lo que
  cambió es la respuesta a la pregunta al salir o cambiar de cara.
- **El encuadre** no mira si otro mueble tapa la vista (en el recorrido no pasó), y una cara de
  6 m o más frente a un pasillo de 2,5 m no entra entera desde ningún lado: queda la toma que
  muestra más (`entera: false`).
- **Chicos**: `HistorialOut` (`api/participaciones.ts`) no tiene `dia` ni `derivado` y el panel
  los lee con un tipo local; el globo de Supervisar muestra la cara A aunque se toque la
  B (ya era así: su cabecera es el código de la A); en la ficha 2D de administración «en el
  Editor 3D → Distribución» se lee dos veces.
- **Visto de paso, sin relación con esto y sin investigar**: al abrir el plano o el Editor 3D
  se reescriben las etiquetas del layout de la base («GON-01» pasa a «Góndola Doble»); pasa
  también en el código de antes.

**Lo que dejó el recorrido final** (arreglado después de `9e764ff`; pruebas en `probar-distribucion`
y `probar-muebles`, y en Chromium H.17–H.19 pasaron de FALLA a OK):

- **Tras el 409 de un alta, la otra sesión ya no lee «queda 100 %»**: todo 409 de una escritura de
  términos llama a `releerTrasConflicto`, que relee la cara y la ocupación sin cerrar el formulario
  ni tocar lo dibujado (sin adoptar una versión ajena de la distribución: el próximo guardado choca).
- **El Editor 3D dice «Tomada»/«Parcial» como el plano**, y «Estado fixture» lleva su nota
  (`PALABRA_POR_OCUPACION` y `notaDeEstadoPorOcupacion`, en `utils/partes.ts`). En la
  verificación salió un caso que el arreglo había abierto: la cara vendida entera antes de pasar
  a participación (`status` «occupied», un físico del 100 %) decía «Tomada» y, debajo de
  «Ocupado · Lo pone el contrato», «Se ve «Tomada»: lo dice la ocupación de hoy de sus
  participaciones», donde el plano dice «Ocupado» sin nota; ahora `estadoQueSeVe` la deja con su
  cartel (`probar-muebles`, y en Chromium con un ROB-02 así).
- **El historial escribe la fecha igual en todas** («17 oct 2026»); la hora, sólo en las reales.

## Participaciones de cara, fase 2 (2026-10-19)

Lo que quedó afuera de la fase 1 (*Lo que esta fase NO hace*, *Arreglos de la revisión final*)
más las cuatro decisiones de la dueña del 2026-10-18 (*Dónde retomar*). Se diseñó por frentes
(A–G), se implementó en seis ramas paralelas (I1–I6) y se probó **una sola vez con todo junto**
(tsc, `npm run probar`, build, pytest completo, carreras contra Postgres 16, recorrido en el
navegador y una revisión del diff entero por integridad y privacidad), con una sola corrección
de lo que falló. Sin tablas, columnas ni variables nuevas.

### Copiar zonas de otra cara (I1)

«Copiar zonas de otra cara…» en el panel de Distribución de la cara de DESTINO (pedido §17,
D20, Caso F). Se elige el origen (la otra cara del mueble viene elegida; también otro mueble u
otra sede), la capa y el espejo, y cada participación del origen va a una participación VIVA que
esta cara ya tiene (mismo proveedor y marca; desempate por el mismo %; o la que elija la
persona; «No copiar»). **Nunca se copia ni se prellena un término, una reserva ni un contrato**:
las zonas llegan como **borrador** y hay que confirmar, con el candado de siempre.

- `utils/copiaDeZonas.ts` (puro): lleva las zonas en u,v (escalan con la cara; espejo u → 1 − u),
  descarta con su motivo lo que no rige, lo que no tiene destino, lo de menos de 1 cm² y lo que
  cae entero sobre lo que no se vende (medido con la superficie del destino), y juzga el
  resultado con `revisarZonas`. Sin gemela en Python: el servidor no recalcula la copia, revisa
  el borrador como cualquier otro.
- `PUT /distribucion/borrador` acepta `origen` (estricto) y anota `distribucion.copiada` en el
  historial (de dónde vino, el mapa, lo que no se copió; sin montos ni vértices) y en la
  bitácora. La misma cara como origen → 422 `copia_de_la_misma_cara`.
- E5a (`HistorialOut.derivados` con `dia?`/`derivado?`), E6 (descartar sin borrador no sube la
  versión) y la frase de los tipos sin receta: «Este tipo de mueble todavía no se vende por
  participación.».

### Dibujar en el 3D y ajustar el borde (I2)

- **El trazo en curso** (rectángulo o polígono a medio dibujar) se ve en el 3D: una cinta
  discontinua en el tono de la participación activa (`trazoParaDibujar`, `ZonasDelMueble` con
  la prop `trazo`).
- **«Editar en el 3D»**: interruptor en la barra, apagado al entrar y deshabilitado en «Mirar» o
  con el plano sin guardar. Prendido, sobre la cara que se edita el botón izquierdo dibuja o
  mueve con las MISMAS acciones del reductor que el lienzo; el derecho gira. El control vive en
  el DOM (`conectarEdicionEnElMueble`, en captura), no en eventos de R3F: el volumen de toque
  tapa el plano y OrbitControls escucha antes. `Scene` no cambió.
- **«Ajustar el borde a la vecina»** (`ajustarBordeAVecina`): cierra el hueco entre la zona
  elegida y la de al lado, sin mover la vecina; un paso de deshacer.
- `imantarTraslado` y `TOQUE_PX` salieron del lienzo a `edicionDeZonas.ts`, para que el lienzo y
  el 3D peguen igual.

### Neveras por participación (I3)

La nevera de puertas (`nevera_puertas`) y la de bebidas abierta (`nevera_refrescos`) se venden
también por participación, sin dejar de venderse enteras o por puertas/tramos (nunca dos a la
vez). Recetas gemelas `nevera_puertas` y `nevera_abierta` en `superficie.ts`/`superficie.py`:
salen de `NEVERA` y `MONTANTE_DE_TRAMO` de `muebles/medidas.ts`, entran en el esquema u,v de
siempre (frente, v = 0 en el piso) y excluyen zócalo, marcos o costados, montantes y copete. El
plano de la nevera de puertas va a d/2 + 3 cm (manda la manija); el de la abierta, a d/2 + 2 cm
(la tira de estado). 19 casos nuevos en `casos/superficies.json`. Lo que sigue afuera, con su
razón: `FUERA_DE_LA_PARTICIPACION`.

### Vender, pantallas y encuadre (I4)

- **El ámbar de Vender, por su motivo** (`motivoDelParcial`, `contarElPeriodo`, `alCerrar`,
  `desgloseDelParcial` en `utils/partes.ts`): una cara parcial puede estarlo porque se libera en
  el periodo, porque tiene partes vendidas o porque se vende por participación con algo
  comprometido. La clave dice «Disponible en parte» (Vender) / «Vendido en parte» (Supervisar);
  la tarifa, «Libres · en parte»; «N al cerrar» ya no suma caras por participación, que nunca
  entran a un contrato de Vender. Se fueron «Se libera en el periodo», «Vence dentro» y «+N
  entran».
- **Encuadre de Distribución** (`utils/encuadreDeDistribucion.ts`): el tres cuartos sale
  centrado (`centrarLaMira`); `ocupa` y `entera` se cuentan después de centrar (la cara de 6 m
  frente a un pasillo de 2,5 m entra entera); una toma con una esquina tapada por otro mueble no
  cuenta como que entra (parámetro `cajas`).
- **D6, una sola regla**: el estado puesto a mano (Mantenimiento, Reservado) o la venta entera
  mandan; la ocupación sólo pinta y nombra una cara Disponible. En el plano 2D, Vender, el globo
  de Supervisar y el 3D. En el 3D, **cada cara por su propio estado** (la B por el de su
  `faceB`: `carasQuePintan`). Y la tarjeta CONTRATADO y el HUD de Presentar nunca dicen «queda
  X %» de una cara que no se ofrece: «Por participación · En mantenimiento: no se ofrece».
- La pestaña activa de la ficha 2D con los tokens del cajón oscuro; la línea corta en el
  isométrico (`textoCortoDeParticipacion`); el globo de Supervisar habla de la cara tocada; Esc
  con un diálogo modal abierto no suelta el mueble; `loVendidoDe` con la sede del plano.
- **G2b, lo suyo delante del proveedor**: ver la regla dura *Delante de un proveedor no se ve
  ninguna zona*. La tarjeta CONTRATADO dice «Por participación · Café A 30 % · queda 45 %»; el
  HUD de Presentar, lo mismo de la cara que se muestra.

### Sedes, plano y renumeración (I5)

- **Renombre real de sede**: ver la regla dura. Candados de los códigos viejos y nuevos y de
  los muebles del plano, relectura con `expire_all`; el plano se escribe con la escritura
  condicional. 409 `sede_existe`, `renombre_bloqueado` (un código destino tomado por otra sede,
  un `svg_id` tomado, dos filas con el mismo código en otras mayúsculas **y las dos con algo**,
  otro equipo que creó algo con el nombre nuevo en el medio) y `layout_conflict`, sin escribir
  nada. Una fila **vacía** que repite un código con otras mayúsculas se archiva (como en la
  renumeración) y se avisa. Un mueble del plano que guardó OTRA sede queda como está, código
  incluido (su código completo se arma con su sede). Bitácora `sede.renombrar`. En el
  navegador, `renameSede` es async: sube lo sucio, espera la respuesta y, si el servidor se
  niega, no cambia nada y muestra los motivos (`RenombreRechazadoDialog`).
- **«Borrar sede» no se lleva lo de otra sede con prefijo común** (borrar SAN archivaba
  SAN-JOSE-IMP-01): el prefijo cuenta sólo para filas sin `sede` y no si es el de una sede más
  larga; el código se compara con `upper()`. El archivo de la sede toma el candado de TODOS los
  muebles del plano (E1).
- **`PUT /layout`**: `medidas_imposibles` (409 con frases, sólo lo nuevo o cambiado) y
  **escritura condicional** (`UPDATE … WHERE updated_at = leído`): un guardado tardío ya no pisa
  una renumeración o un renombre. Los topes al dibujar (`MAX_VANOS_A_DIBUJAR`,
  `MAX_ENTREPANOS_A_DIBUJAR`) nunca se escriben de vuelta.
- **Renumeración**: dos filas con el mismo código en otras mayúsculas daban 500; ahora 409 con
  las dos nombradas, o se archiva la vacía. El find-or-create busca sin mayúsculas y devuelve el
  código canónico.
- **V16**: la «Sede» del panel 2D es de sólo lectura (la define el plano); un mueble viejo que
  guardó otra lo dice —sus espacios se siguen armando con esa sede— y quien administra puede
  pasarlo a la del plano con «Usar la sede del plano» (lo vendido con el código viejo no se muda
  solo; se avisa antes).
- **Un contrato que espera el candado mientras se renombra** no se guarda con el código viejo:
  `create_lease` relee el espacio después del candado y, si cambió de código, 409.

### Mercaderista, proveedor y reserva (I6)

- **G1**: la mercaderista ve su zona (regla dura). `DibujoDeMontaje` va tipado clave por clave
  como `_solo_geometria`. Sin distribución confirmada, la pantalla queda como antes.
- **El enlace de montaje sigue al contrato** cuando el espacio cambió de código (renumeración o
  renombre): las tres puertas (pantalla, planometría, reporte) pasan por `_resolver`; se sigue
  al contrato (`_contrato_mudado`) sólo si está activo, su fila no está archivada, la cara y la
  parte son las mismas y hay evidencia de que el código del enlace era de ESE espacio (nadie se
  llama así hoy, o el registro de la renumeración lo dice). Sin evidencia, 410 como antes. Los
  enlaces de antes del 2026-10-02 (sin contrato) siguen con el código del token.
- **G2**: guarda en `probar-vender`: lo que Vender dice de una participación no recibe proveedor
  ni nombre ni habla de formas, y ningún archivo de Vender importa la API o el store de las
  participaciones.
- **G3**: la caducidad de la reserva arranca vacía; sin elegirla, «Elegí hasta cuándo se
  sostiene la reserva.»; el campo ofrece de hoy al último día que reserva.

### Lo que arregló la corrección única

La ronda única dejó 1 falla de pytest (de 1637) y dos suites del navegador (`probar-vender`,
`probar-muebles`); la revisión del diff, siete hallazgos (ninguno alto); el recorrido en el
navegador (ocho flujos), tres: Presentar no mostraba el % del proveedor, la tarjeta CONTRATADO
ofrecía «queda 70 %» de una cara en Mantenimiento delante del proveedor, y en «Tu zona en la
cara A» la zona propia salía gris mientras el pie decía «lo gris es el resto». Todo se corrigió junto: la prueba de
`test_partes_venta` con el find-or-create canónico; dos guardas que medían el código por
posición; un falso positivo de `probar-vender` por un nombre (`porPc` → `deParticipacion`) que
metía código de Supervisar en la superficie de Vender; los contactos de aviso `by_sede` que el
renombre no mudaba; el `IntegrityError` del renombre que salía como 500; el contrato que
esperaba el candado durante un renombre; las filas vacías repetidas que frenaban el renombre; el
mueble de otra sede al que el renombre le reescribía el código; el D6 del 3D que miraba sólo la
cara A; el aviso de la sede ajena del 2D, que prometía lo que no pasaba; el aviso del renombre,
que prometía que todos los enlaces de montaje seguían andando; el % del proveedor en
Presentar; la cara en Mantenimiento delante del proveedor; y los colores de «Tu zona».

## Fase 11 — La Plataforma como espacio de análisis y asesoría

**El pedido del dueño (2026-09-07).** Al abrir el detalle de un cliente en
`/plataforma`: «un montón de información sin orden, súper largo, sin entender
qué era cada cosa». La consola tenía los datos y no tenía la historia. La
referencia pedida fue el **storytelling de científicos y analistas de datos**, y
el encargo se escribió sin ninguna referencia visual (`features/plataforma-asesoria/brief.md`),
para que los diseñadores no copiaran lo que ya había.

Tres direcciones a ciegas, medidas por un director de arte sin elegir
(`outputs/COMPARATIVA.md`): **A · El informe** (documento que se lee de arriba
abajo), **B · El tablero** (hoja sin scroll con capítulos navegables) y **C · La
conversación** (tarjetas de acción con evidencia desplegable). El dueño eligió
**A tal cual**, después de ver y descartar una fusión de A con la organización
de C: «no me gusta nada la vista dividida y la cantidad de letra grande con
negrilla». Esa frase es la regla de la fase: **no se agranda ni se engruesa
nada**, y no hay paneles que partan la pantalla.

### La decisión de fondo: la consola es un documento

Tres piezas navegables entre sí, cada una contestando una pregunta:

| Pieza | Ruta | Contesta |
|---|---|---|
| **La cartera** | `/plataforma` | ¿cómo va el negocio y a quién llamo primero? |
| **La sesión** | `/plataforma/clientes/:slug` | ¿qué le propongo a este cliente? |
| **El informe** | `/plataforma/clientes/:slug/informe` | ¿qué gano yo, gerente de supermercado? |

Cada bloque abre con su **frase-conclusión con cifra** y, debajo, **la ruta
exacta del JSON en monoespaciada** (`cartera.clientes[].metricas ·
tendencia_cliente.serie[2026-08]`). Eso último contesta solo la pregunta que el
dueño hace siempre: ¿de dónde sale este número? El detalle va plegado en
`<details>`, no en un panel aparte.

**Una sola acción principal por pantalla**, en amarillo, y es la que sigue en el
trabajo: en la cartera la llamada #1 de la cola, en la sesión «Armar el informe
para el cliente», en el informe «Imprimir o guardar en PDF».

### La forma de cada dato

El corazón del encargo era **qué gráfico le toca a cada dato**, no decorar. Los
diez dibujos viven en `frontend/src/components/plataforma/graficos.tsx` como SVG
dibujado a mano (cero librerías, cero recursos externos) y su tabla completa
está en `components/plataforma/README-graficos.md`. Los desvíos que se ganaron
el lugar:

- **La ocupación de la cartera es un medidor; la del cliente, unidades.** Para
  un cliente las 254 marcas *señalan un lugar al que ir*; para la cartera, 513
  marcas —3.000 con 30 clientes— no señalan nada.
- **La tendencia se dibuja en CONTEOS, no en porcentaje.** El denominador se
  mueve cuando entra o sale un cliente, y una línea de porcentaje dibuja un
  derrumbe que no ocurrió. Dos líneas de conteo en una sola escala, y la
  ocupación se lee como la brecha. El mes sin snapshot es un **hueco**, no una
  recta entre vecinos.
- **Las barras de sede miden espacios, no porcentaje**, y el «contra qué» es una
  **marca por barra**: dónde terminaría lo ocupado si esa sede estuviera en el
  promedio del cliente. Con barras de % dos sedes de tamaño muy distinto dibujan
  la misma barra y no son el mismo negocio.
- **El riel de vencimientos es de 60 días**, que es `DIAS_POR_VENCER` y lo que
  el backend mira. Uno de 90 deja un tercio vacío que se lee como «no hay
  vencimientos», y no es cierto: es que no se miran.
- **El valor en juego son tres cifras, no una**, y la suma no se muestra: sumar
  las recomendaciones cuenta dos veces los mismos espacios y mete adentro
  ingreso que ya entra.
- **El último mes de las barras divergentes se rotula con su SALDO**, con signo
  y con la palabra. Rotularlo con las entradas anunciaba «+$ 0,6 M» a diez
  píxeles de la anotación que decía, del mismo mes, «el peor saldo de la
  ventana: −$ 1,4 M». Lo fijan los casos 17 y 18 del banco de `probar:graficos`.

**Una escala por gráfico, nunca dos ejes.** Todo texto adentro de un SVG entre
10 y 30 px reales en pantalla: el contrato de tamaño (`viewBox` del tamaño de la
caja + `width:100% · min-width:W · height:H` + `xMinYMin meet`) fija el factor de
escala en 1, así que el cuerpo declarado es el cuerpo que se ve.

### Reglas de color que esta fase agrega

- **Los tres estados de espacio (`--libre / --entra / --ocupado`) sólo codifican
  estado de espacio.** Señal, estado de cuenta, prioridad y cobertura van en
  **chip gris con la palabra escrita**. Se escapó una vez y de la peor manera:
  `--entra-txt` **colapsa con `--entra` en el tema oscuro** (`tema.css`), así
  que un chip que en claro era ámbar oscuro en oscuro pasaba a ser exactamente
  el color del estado. Por eso `probar:plataforma` mide el color **computado en
  los dos temas**, no el token escrito.
- **`--ink-4` no se usa para texto sobre el papel**: 3,98:1. Va `--ink-3`.
- Un `.btn-principal` por pantalla y `var(--signal)` fuera de esa clase = 0.

### La frontera, que es lo que no puede fallar

La sesión y el informe abren el negocio de un cliente espacio por espacio, así
que la fase se auditó como frontera y no como pantalla:

- **La tarifa de referencia de un cliente NUNCA se pinta.** Sólo su relación
  (`spread_pct`) y el sí/no de `tarifa_configurada`. Se verifica sembrando una
  tarifa con un valor reconocible y buscándolo en `innerText`, en los textos de
  los SVG, en `title`/`aria-label`/`alt` y en el `outerHTML` entero con todos
  los `<details>` abiertos.
- **El informe no lleva nada interno**: ni cartera, ni señal, ni fantasma, ni
  adopción, ni benchmark de otros, ni nombres de otros clientes.
- **Todo es de sólo lectura** salvo el estado de cuenta y las supresiones, que
  siguen siendo operaciones y viven en su cajón.
- **Backend sin una sola línea de cambio**: `git diff origin/main -- backend`
  vacío es una afirmación de `probar:plataforma`. El reporte de transparencia se
  enlaza y no se rediseña.

### Dos cosas que costaron y conviene no repetir

- **El informe no heredaba el periodo.** Con la sesión en julio, «Armar el
  informe» pedía septiembre y titulaba septiembre: un documento impreso con un
  mes que el asesor no eligió, y nada en pantalla lo decía. Ahora **la URL es la
  fuente** (`?periodo=`) y las cuatro líneas que decían «el mes en curso todavía
  no terminó» salen del periodo que devolvió el backend, no de la fecha de hoy.
- **`<input type="month">` no sirve para esto.** Chromium lo pinta en el idioma
  del navegador («September 2026» en una pantalla íntegramente en español) y a
  390 px se corta. Va un `<select>` armado con los periodos que de verdad
  existen en la serie, en español, con los meses sin snapshot deshabilitados y
  rotulados «· sin dato».

### Cómo se prueba

`npm run probar:graficos` levanta su propio Vite sobre un banco de casos
(`frontend/pruebas/graficos.html`) y mide, en claro y oscuro y a dos anchos, que
ningún texto de un SVG baje de 10 px ni pase de 30, que ninguno se pise con
otro, que ninguno se salga de su caja, y las dos ramas del rótulo del último mes
de las divergentes. `npm run probar:plataforma` afirma la frontera: los campos
que no existen en `api/plataforma.ts` no se leen, los colores de estado no
codifican otra cosa, el informe hereda el periodo, hay un solo interruptor de
tema, cero código muerto en el área y el backend no cambió; con la app corriendo
(`PROBAR_PLATAFORMA_URL` y `PROBAR_PLATAFORMA_TOKEN`, receta en la cabecera del
archivo) agrega las afirmaciones sobre las tres pantallas de verdad.

**El que deja el Vite vivo rompe la corrida siguiente.** `probar:graficos`
prometía matar su servidor y no lo hacía: lanzaba `npx vite`, y matar al `npx`
deja al `vite` huérfano. Ahora se lanza el binario local en su propio grupo de
procesos y se mata el grupo entero, colgado de un `try/finally` más handlers de
señal. Con `--strictPort`, un puerto ocupado se dice en vez de colgarse.

## Herramientas de diseño en el repo

`.claude/skills/` trae **ui-ux-pro-max** (MIT, `nextlevelbuilder/ui-ux-pro-max-skill`),
instalada con `npx ui-ux-pro-max-cli` → `uipro init --ai claude`. Son siete
skills —`ui-ux-pro-max`, `design-system`, `ui-styling`, `brand`, `slides`,
`banner-design`, `design`— con un catálogo local que se consulta con Python 3
de la librería estándar: **79 estilos, 192 paletas de producto, 74 pares
tipográficos, 119 guías de UX, 105 iconos, 25 tipos de gráfico y 22 stacks**.

```bash
# Dirección visual completa para un producto
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<producto> <rubro> <claves>" --design-system -p "Galerías"
# Un solo tema
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "elegant serif" --domain typography
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "glassmorphism"  --domain style
```

Los scripts **no instalan nada y no hacen llamadas de red**: leen los CSV de
`data/`. Para actualizar, `uipro update`.

Está commiteada a propósito y no en `.gitignore`: el contenedor de una sesión
remota es efímero, así que si no vive en el repo hay que reinstalarla cada vez.

**Por qué está acá.** La paleta del sistema salía entera de los valores por
defecto de Tailwind —`#7C3AED` es `violet-500` sin tocar, los semánticos son
`green-700`, `amber-700` y `red-700`, el fondo es el crema de la mitad de lo
generado por IA—, y ese es el motivo de que se lea como plantilla. El catálogo
existe para que la dirección visual se elija de una lista razonada en vez de
inventarse. **La decisión de qué dirección tomar sigue sin estar tomada.**

---

## Rediseño de la pantalla principal

**Estado: elegida, sin implementar.** De cuatro finalistas quedó **q1**, con
injertos de q3. La maqueta vive en `docs/maquetas/elegida-vender.html`. Nada de
esto está en el código todavía.

Al presentar el sistema, la devolución fue que **«se ve muy obvio que es hecho
con IA»**. Lo que siguió fueron seis rondas y veinte maquetas. Vale la pena
dejar escrito qué falló, porque el camino explica las cuatro que quedaron.


**Conciliación al cierre (verificador de la ronda 2).** (1) A 390 px la
escalera tenía 10 choques de texto porque el `viewBox` seguía a la caja
angosta; ahora la caja mide 880 px (como D), se desliza dentro del panel y
arranca por los escalones: 0 choques a 390 y a 1440, sin desborde de la
página. (2) `probar:vender` aseveraba la escala tipográfica sobre TODO
`DashboardView.tsx`, incluidos los 69 literales de Supervisar (PR 3); ahora
asevera sólo sobre lo que pinta Vender. (3) Diferencias con D aceptadas a
propósito: el periodo vive en la barra de la pantalla (es el selector real,
no un rótulo); la acción secundaria es «Empezar de nuevo» (la app no tiene
«guardar como reserva»); la clave dice «Se libera en el periodo»; la ficha
suma «+ Correo, nota y planometría» (campos reales); la ubicación va en dos
renglones con puntos suspensivos (la ficha tiene que cerrar con tres espacios
y 12 px de aire). (3b) El dueño pidió de vuelta **las pastillas de código bajo cada tipo de la
tarifa** (el diseño anterior), con la tarifa abajo (panel 04) y conservando el
resaltado: la fila enciende los muebles del tipo, la pastilla enciende ESE
mueble, y el clic lo suma al contrato. Sólo mientras no hay contrato armado.
La tabla rueda por dentro con barra a la vista y el pie queda pegado abajo
(`position: sticky`). (4) Pendiente al PR 3: **las dos barras** (la de la app y la
de la pantalla) le quitan ~43 px de hoja respecto de D y corren el umbral de
rodar de 760 a 790 px de alto; fusionarlas devuelve el comportamiento exacto.
El plano no rotula ENTRADA/CAJAS (no existen en los datos).
### Lo que no funcionó

**Sacar los tells no alcanza.** La primera pasada quitó gradientes, sombras,
esquinas redondeadas y la paleta por defecto. El resultado fue rechazado: quitar
las señales deja una interfaz *neutra*, que es otro género reconocible. La
sustracción no produce una identidad.

**Partir de lo que ya existe ancla.** Cinco propuestas hechas sobre la base de
la que más gustaba dieron cinco rechazos: convergieron a variaciones en vez de
proponer. Diseñar a ciegas —sin ver el sistema actual ni ninguna propuesta
previa— es lo único que produjo un acierto.

**Imitar un género conocido da un resultado correcto y anónimo.** Se probaron
cinco variantes con la estética del software empresarial que corre adentro de
una bodega (SAP, Siesa, Oracle, WMS). Ninguna gustó, y además se salieron de los
datos reales: inventaron razones sociales formales con NIT porque los nombres
verdaderos —«brayan», «camilop»— no encajaban en la estética.

**Agregar texto que explique tampoco.** Una versión abría con un párrafo que
contaba el hallazgo en prosa. La respuesta fue: *«no me refiero a poner más
texto, me refiero a que la forma de presentar los datos sea la más óptima para
lo que están diseñados»*. Si hace falta una frase para explicar un gráfico, el
gráfico está mal elegido.

### Los criterios que quedaron

De rechazar dieciséis propuestas salieron cuatro reglas, en palabras del dueño
del producto: **un sistema pulcro, que cada cosa esté ahí por algo, que pueda
cerrar trato y revisar información todo a la mano.**

1. **La forma la manda el dato.** Una magnitud sola es una cifra, no un anillo
   de progreso. Unas partes de un total quieren verse sumar. Un ranking quiere
   estar ordenado. Unos hechos con fecha quieren un eje de tiempo, no una tabla
   ordenada por días. Una cantidad que hay que contar se cuenta mejor en
   unidades discretas que en un porcentaje. **Si dos elementos dicen el mismo
   dato, uno sobra.**
2. **Pulcro.** Recorrer la pantalla elemento por elemento preguntando «¿esto qué
   hace?». Lo que no contesta, se va.
3. **Cerrar trato y revisar, cada uno en su modo.** El formulario del contrato
   no puede ser un globo que aparece al hacer clic: si armar el contrato es la
   mitad del trabajo, la mitad del trabajo tiene lugar fijo.
4. **Nada de ámbar, oro ni ocre, y nada de fondos oscuros.** Descartados
   explícitamente.

### Las dos restricciones que aparecieron en el camino

**Vender la ve el proveedor.** Es la más importante y no estaba en ningún lado.
El administrador **gira el portátil y le muestra la pantalla al proveedor que
tiene enfrente**, así que Vender no es una pantalla interna: es material de
venta que un tercero lee.

Eso vuelve prohibido en Vender: el nombre de otro proveedor, lo que paga otro
proveedor, el ranking por canon, quién está por debajo de tarifa, el canon total
de la sede, la plata del periodo y cuántos contratos vencen. Sólo va
**disponibilidad, tiempo, el espacio en sí, el contrato de ESE proveedor y la
tarifa de referencia**, que es lista de precios y sí es pública.

Una propuesta anterior ponía, al lado del campo de precio, una barra comparando
el canon ofrecido contra el de los otros tres proveedores, con nombre y monto.
Es un gráfico excelente y es una fuga de información confidencial. Dos de los
cuatro finalistas lo auditan por `grep` sobre su HTML final.

**El plano isométrico va en los dos modos.** Es lo único que este sistema tiene
y una planilla no puede tener: el inventario tiene domicilio, y quien vende
señala el piso. En Vender es el catálogo que se le muestra al proveedor; en
Supervisar es el estado de la sala de un vistazo.

### El color se valida, no se elige a ojo

La combinación **verde + naranja falló** el validador de la guía de
visualización: se confunden con protanopía, que es el daltonismo más común, y en
esta pantalla eso separa «libre» de «ocupado» (ΔE 5,3, muy por debajo del piso).
Ninguno de los cuatro finalistas la usa. Todos llegaron a `ALL CHECKS PASS`
antes de entregar.

```bash
node /tmp/.../dataviz/scripts/validate_palette.js "#hex,#hex,#hex" --mode light
```

### Los cuatro finalistas

Los cuatro trabajaron a ciegas y comparten escuela —sistema de administración de
comercio, tomando su estructura y no su piel—, porque de dieciséis propuestas de
escuelas distintas ésa fue la elegida. Lo que varía es dónde gasta cada uno el
riesgo.

| | Dónde puso el esfuerzo | Lo que aporta que los otros no |
|---|---|---|
| **q1** | El plano isométrico | Las fechas de liberación sobre el propio mueble («libre 25 sep»). En Supervisar, el canon en barra con la tarifa como línea y en rosa lo que falta |
| **q2** | Vender como material comercial | Botones para calcar el periodo de una temporada; el aviso «Amor y Amistad cae adentro» como argumento de venta |
| **q3** | La densidad de Supervisar | La banda de liberación día a día, y **contratar varios espacios en un solo contrato** — un proveedor no negocia una punta suelta |
| **q4** | El estado y la tipografía | Trama en vez de más colores (se lee en blanco y negro); **el frente en metros**, que es lo que el proveedor compara; la tarifa sólo del espacio elegido |

Las ocho pantallas, sus notas de diseño, el brief, los criterios y el prompt
completo están en `docs/maquetas/`. Van con sus tipografías en disco porque el
navegador donde se hicieron no llega a Google Fonts.

### La elegida: q1, con injertos de q3

Ganó **q1** por el plano isométrico —que es la pieza que ninguna de las otras
mejoró— y por las fechas de liberación escritas sobre el propio mueble. De q3
se injertaron dos cosas: **contratar varios espacios en un solo contrato** (un
proveedor no negocia una punta suelta) y el bloque **«cuándo se libera cada
espacio»**, aunque no su forma.

**El calendario comercial de q2 se descartó después de probarlo.** La cuadrícula
del mes repetía lo que ya dicen la banda de temporada del gráfico y los sellos
del contrato («Cubre Amor y Amistad»), y no agregaba ninguna decisión.

**La forma del bloque de liberación se rehízo cinco veces**, y la discusión vale
la pena porque se repite cada vez que hay que graficar algo acá. Las cinco están
guardadas: `docs/maquetas/opciones-libera.html` compara cinco formas distintas y
`docs/maquetas/variantes-a.html` cuatro maneras de leer la que ganó.

- q3 lo dibujaba como **una barra por espacio** sobre un eje de fechas: barra
  azul hasta que se libera, verde después. Gastaba todo el ancho pintando lo
  *ocupado*, que es justo lo que no se vende, y dejaba la fecha —el dato— como
  una astilla contra el borde derecho.
- La segunda fue **área escalonada con los códigos flotando sobre los
  escalones**. La forma era correcta pero los chips se pisaban entre sí y contra
  el borde.
- La tercera movió los códigos a **una columna al costado**. Dejó de chocar,
  pero partió el bloque en dos piezas que hay que juntar con la vista.
- Se pusieron a competir **cinco formas distintas** —escalera, inventario por
  tipo, tira del mes, agenda sin gráfico, un punto por espacio—, cada una
  contestando una pregunta distinta. Ganó la escalera, que contesta «¿cuántos
  tengo si el cliente arranca el día X?».
- La que quedó es **A·4: escalera sobre el eje de fechas, a todo el ancho**.
  Cuatro decisiones que conviene no deshacer:
  - **Sin columna lateral.** A 1024 px quedan 66 px entre el 25 y el 27 de sep y
    un chip mide 56: los códigos caben debajo de su fecha sin pisarse. Eso es lo
    que permite dejar un solo bloque. **Si el panel se angosta, los chips
    vuelven a chocar y hay que reponer la columna.**
  - **Sin eje vertical.** El rango es 15 a 20; una escala completa sería adorno.
    Cada tramo va rotulado con su cifra, puesta al inicio de su meseta para que
    quede pegada a su escalón.
  - **Peine de días.** Un diente por día bajo el eje: los 25 días planos se leen
    como tiempo que pasa y no como espacio sobrante.
  - **El cursor escribe la lectura.** En la maqueta está parado en una fecha de
    ejemplo («si arranca el 26 de sep → 17 libres»); en el sistema sigue al
    mouse. Es lo que convierte el gráfico en una respuesta.

Se descartó a propósito la variante con **techo en 23** (los espacios
comercializables de la sede). Hace legible la proporción —15 de 23— pero
aplasta el escalón contra el borde superior, y el escalón es el dato que se
está negociando. Si alguna vez pesa más la proporción que el ritmo, ahí está.

Un detalle de color de esa variante que sirve de precedente: sus bandas son
**un solo tono con luminosidad descendente**, no tres colores. La versión con
gris para «tomados» daba ΔE 4.0 en deuteranopía contra el verde claro. La rampa
validada da ΔE 14.2 en protanopía y 18.4 en visión normal, y cada banda va
rotulada, así que la identidad nunca depende sólo del color.

### La paleta y la escala de letra

**Verde: se puede vender. Rojo: no.** El azul que marcaba «tomado» se fue: no
decía nada por sí solo y obligaba a mirar la leyenda. Los cuatro estados quedan
así, y valen tanto en el plano como en el gráfico y en las tablas:

| Estado | Color | Dónde |
|---|---|---|
| Libre todo el periodo | `#00786A` | plano, línea del gráfico, cifras |
| Se libera en el periodo | `#F08519` | plano, chips de códigos |
| Tomado todo el periodo | `#8E1226` | plano |
| Resto de la sala | `#D3D9DB` | plano |

**El rojo es oscuro a propósito.** Verde contra rojo es justo el par que se
colapsa en un daltónico, y lo único que los sigue separando es la luminosidad:
por eso el rojo va abajo en la escala. Validado con el script de dataviz sobre
**todos** los pares —peor caso ΔE 11.0 en deuteranopía y 16.8 en visión
normal—, y además cada estado va rotulado, así que la identidad nunca depende
sólo del color. Antes de mover cualquiera de estos cuatro, volver a correr el
validador; no alcanza con que «se vean distintos».

En el isométrico cada estado son tres caras —tapa más clara, cara derecha con
el color de identidad, cara izquierda más oscura—, no tres colores nuevos.

**El verde queda reservado para la disponibilidad.** «+ agregar otro espacio»
es una acción, no un estado, así que va en tinta.

**Siete tamaños de letra y ninguno más:** 9.5 (versalitas), 11 (notas y ejes),
12 (secundario), 13 (cuerpo), 14.5 (títulos, campos y botón), 17 (códigos de
espacio) y 27 (el total del contrato). Antes había diecisiete, que es lo que
hace que una pantalla se vea armada de a pedazos. El contraste lo dan la
familia, el peso y el color, no el tamaño: en el plano el código y su fecha de
liberación miden lo mismo y se distinguen por peso. Nada baja de 9.4 px reales
—los rótulos del plano estaban a 8.1 y 8.8—; `generadores/tamanos.mjs` lista
los tamaños tal como se renderizan y sirve para no dejar entrar un octavo.

**El aire muerto se convirtió en contenido.** El panel de Contrato tenía 90 px
en blanco entre los sellos y el botón; bajó de 640 a 550 y esos 90 se los quedó
la tarifa de referencia, que pasó de mostrar 4 tipos de espacio a los 7, con su
pie que amarra la tabla con el gráfico: 15 libres, +5 entran, 20 al cerrar.

El SVG lo genera `docs/maquetas/generadores/riel.py`. La maqueta se verifica por
código y no a ojo: un script mide cada panel y marca lo que se recorta, otro
busca choques y desbordes entre los textos del SVG, y un tercero hace las dos
cosas sobre páginas de varios paneles. Vale la pena mantener esa costumbre
cuando esto baje al código.

### Supervisar

Está en `docs/maquetas/elegida-supervisar.html`, **con la misma estructura que
la pantalla desplegada**: la franja de cifras arriba, el isométrico a la
izquierda con lo accionable a su derecha, y **«Estado por espacio» a todo el
ancho debajo del plano**. La pantalla es larga y hace scroll, igual que hoy.

- **NAVE** — canon vigente, sin alquilar, lo que vence en 30 días, ocupación y
  sin montar. Cinco cifras, ninguna oración.
- **Piso de NAVE** — el isométrico. Acá **no es un directorio**: la tabla de
  abajo ya lista los 23 códigos, así que el plano ubica y se queda con **un solo
  rótulo, el de la fila abierta**. A ese ancho los 23 rótulos además caían a
  6,4 px reales.
- **Para revisar** — la lista de tareas: lo que vence y lo que se está cobrando
  sin estar armado, una línea por cosa, clickeable.
- **Quién paga el canon** — se calcula agrupando la misma tabla, así que no
  puede contradecirla.
- **Estado por espacio** — el libro entero: las 23 caras con estado, montaje,
  desde, hasta, días y renta.

Hay solapamiento deliberado entre «Para revisar» y la tabla: la primera es la
tarea, la segunda el registro. Es la estructura que el sistema ya tiene y que
funciona.

**Los ocho contratos de la tabla suman exactamente $5.300.001**, que es el canon
que muestra el sistema. Eso confirma que la tabla está completa y corrigió una
derivación mía: lo que vence en 30 días es **$3.700.000, el 70%** del canon, no
el 77% que había deducido suponiendo cinco contratos.

#### Tres cosas que la tabla deja ver y que valen un arreglo

- **«comercializadora nutresa» y «nutresa» son dos proveedores distintos** en la
  base. Casi seguro el mismo, cargado dos veces: aparece con 15% y 2% por
  separado en vez de 17% junto, y el ranking de concentración miente.
- **Un contrato de doce meses por `$1`** (PUN-09 en el sistema desplegado).
- **Una exhibición de piso a `$100.000`** cuando la tarifa de referencia del
  tipo es `$900.000`: un 89% por debajo.

Los tres los cazaría un aviso de «por debajo de tarifa», que es barato porque la
tarifa de referencia por tipo ya existe.

**Lo que se deja de percibir tiene una regla, y ya estaba escrita en el
código.** `frontend/src/utils/parte.ts` la resolvió con pruebas, y la maqueta la
respeta: **no se pinta una pérdida que todavía no ocurrió**. Con el periodo por
delante la cifra honesta no es «perdimos X», es la **tasa**: `$8.730.000` al mes
a tarifa de referencia por las 15 caras libres, o sea **`$281.613` por día
vacío**. Recién cuando hay días transcurridos aparece lo que *ya no se
recupera*, que es la cuenta que `colaDelPeriodo()` hace y que hoy la pantalla
desplegada calcula y no muestra en ninguna parte.

Va al lado del canon vigente a propósito: `$5.300.001` cobrando contra
`$8.730.000` parado dice solo lo que hay que decir, sin una oración que lo
explique. Las caras sin tarifa quedarían fuera de la cuenta y declaradas —la
regla también es de `parte.ts`—; en NAVE los siete tipos tienen tarifa, así que
no hace falta.

El dato que la pantalla desplegada entierra: **$4.100.001, el 77% del canon,
vence antes del 28 de sep**. Hoy eso vive como un «5» dentro de un casillero.
(El 77% es derivado: los cuatro proveedores del listado de vencimientos son
todos menos COCA COLA.)

### La paleta de producción, y lo que queda abierto

**La paleta del mapa: arreglada.** El par que se caía no era verde contra ámbar
—ése pasa— sino **libre `#4CC38A` contra no comercializable `#94A3B8`**: ΔE 8.0
en el peor caso daltónico y 14.7 en visión normal, los dos bajo el piso. Y no es
un detalle al margen: el gris es la mayor parte del plano, así que «lo que puedo
vender» contra «lo que ni siquiera se alquila» es justo el par que hay que
distinguir de un vistazo.

La salida **no** fue tocar el verde. Bajarlo lo acercaba al rojo, que bajo
deuteranopía es el vecino peligroso —probado: con el verde en `#1E9E6A` el par
verde-rojo cae a ΔE 6.5—. Se aclaró el gris a **`#DCE2E8`**, que separa por
luminosidad, que es lo que sobrevive cuando el tono se colapsa. Con eso los
cuatro colores del mapa pasan la separación en **todos** los pares: peor caso
ΔE 9.6 daltónico y 19.5 en visión normal. De paso hace lo correcto de diseño:
la infraestructura se va al fondo y el color queda para lo que se vende.

Es un solo valor, `NON_RENTABLE_TOP` en `DashboardView.tsx`, y las caras y el
contorno salen de ahí por `darken()`, así que el prisma sigue leyéndose en tres
dimensiones. El antes y después, con la simulación de deuteranopía al lado, está
en `docs/maquetas/paleta-plano.html`. **Antes de mover cualquiera de los cuatro
hay que volver a correr el validador**; que «se vean distintos» no es evidencia.

**Naranja para lo parcialmente ocupado.** El ámbar `#F0B429` tiraba a amarillo y
se leía como «atención», que es otra cosa. Pasa a naranja `#F08519`, y con eso el
mapa dice una escala en vez de tres etiquetas sueltas: **verde se puede vender,
naranja a medias, rojo no**.

El cambio tiene un costo que conviene tener escrito. Naranja y rojo son vecinos
de tono, así que el par más apretado de la paleta se mudó ahí:

| Par | Con ámbar | Con naranja | Piso |
|---|---|---|---|
| parcial ↔ tomado · daltónico | ΔE 21.8 | **ΔE 13.8** | ≥ 8 |
| parcial ↔ tomado · visión normal | ΔE 27.5 | **ΔE 16.7** | ≥ 15 |
| parcial ↔ libre · daltónico | ΔE 9.6 | ΔE 10.8 | ≥ 8 |

Sigue pasando —y contra el verde incluso mejora— pero el margen contra el rojo
baja bastante. Es un intercambio deliberado: se gana que la escala se entienda
sin leyenda, se pierde holgura en un par que igual va rotulado en las dos
pantallas. **No se puede oscurecer más el naranja**: probado, `#D4700F` cae a
ΔE 6.6 contra el rojo de producción.

El mismo naranja sirve para las dos paletas —la de producción, con el rojo
claro, y la de las maquetas, con el rojo oscuro—, así que es un solo valor en
todo el sistema.

**Lo que queda abierto en la otra escala.** El mapa tiene dos lecturas: la del
periodo (libre/parcial/tomado, la que se arregló) y la de «qué pasa hoy»
—`DISPLAY_TOP`— que tiene siete clases: libre, contratado, activo, por vencer,
vencido, reservado y mantenimiento. Ahí hay dos problemas que **no** se arreglan
moviendo un color:

- **`free #4CC38A` contra `maintenance #A8A29E` da ΔE 3.6 en deuteranopía.** Un
  daltónico no distingue «lo puedo vender» de «está en mantenimiento», que es
  justo lo contrario. Probé mover el gris de mantenimiento a oscuro y choca con
  el rojo en protanopía; a claro y choca con el gris nuevo.
- **`committed #A78BFA` contra `active #8B5CF6` da ΔE 11.9 en visión normal.**
  Ese par es deliberado —el mismo violeta, un paso más claro— y va rotulado, así
  que es defendible; queda anotado, no roto.

Siete clases es el techo que aguanta el color solo. La salida no es otro tono:
es bajar el número de clases o agregar una segunda codificación —una trama en
las caras en mantenimiento, por ejemplo—. Es una decisión de producto, no un
ajuste de paleta, y por eso no se tocó.

> **Cerrado al bajar las maquetas.** La decisión de producto la tomaron las
> maquetas, y no fue ninguna de las dos: fue sacarle el trabajo al color.
> **«Hoy» pasó a ser un periodo de un día** (`hoyComoRango()` en
> `SeasonPicker`), así que las dos pantallas tienen siempre periodo puesto y el
> plano pinta SIEMPRE la escala de tres —libre, se libera, tomado—. La lectura
> de siete clases ya no llega al plano: el detalle por estado vive **escrito**
> en «Estado por espacio», donde cada fila lleva su palabra al lado del punto.
> `DISPLAY_TOP` queda como respaldo, repintado sobre la paleta nueva y sin el
> violeta que arrastraba del sistema anterior.

**«El parte» ya no existe.** Ese bloque —el que reemplazaba la barra segmentada
y los seis casilleros por una o dos oraciones— nunca llegó a producción, y al
bajar las maquetas se lo reemplazó antes de llegar: en Supervisar por la franja
de cinco cifras y en Vender por la escalera y el panel de tarifas. La razón está
en la respuesta del usuario al verlo: *«veo mucho texto; el que pone el canon
sabe lo que hace, no hay que estar diciéndole qué precio poner»*. Su maquinaria
—`utils/parte.ts`, `utils/redaccion.ts`, `components/Parte/`— tampoco está: vive
en la historia de la rama de diseño.

**Hecho:** las dos pantallas están en código, y «Paleta y tipografía» arriba
describe el sistema vigente. La sección «La línea visual» que sigue más abajo es
**arqueología**: cuenta de dónde salieron IBM Plex y los neutros cálidos, que ya
no son los del sistema. Ante cualquier contradicción manda «Paleta y tipografía».

---

## Seguridad: lo que dejó el vibecoding

La auditoría salió de una pregunta concreta —esto se le va a vender a varios
supermercados, con contratos y planos adentro— y de lo que se lee afuera sobre
código generado con IA: la [Cloud Security Alliance](https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-generated-code-vulnerability-surge-2026/)
mide 62% de aplicaciones con al menos una vulnerabilidad seria, y
[Georgia Tech](https://news.research.gatech.edu/2026/04/13/bad-vibes-ai-generated-code-vulnerable-researchers-warn)
encontró 86% de fallas de XSS en lo generado. Doce hallazgos, ordenados por lo
que costaría que pasen.

### Fase 1 — lo que no necesitaba que nadie decidiera

* **El IDOR de los archivos** (`routers/files.py`). Un `worker` autenticado
  podía listar y bajar **cualquier** adjunto por id: los contratos con las
  cifras del negocio incluidos. Ahora `list_space_files` **filtra** en vez de
  rechazar —así el panel del mercaderista sigue funcionando— y `download_file`
  contesta **404, no 403**: un 403 confirma que el archivo existe.
* **CVE-2024-53981** en `python-multipart` 0.0.9 → 0.0.20. Al parsear un
  multipart recorría byte a byte lo que viniera antes del primer delimitador y
  registraba cada uno; con `--workers 1` una sola petición tumba el servicio.
* **La cadena del `xlsx`** y las cabeceras de seguridad (CSP, `nosniff`,
  `frame-ancestors`, HSTS sólo bajo TLS) en `main.py`.

### Fase 2 — las contraseñas

Cuatro cosas, y las cuatro se probaron fallando contra el código anterior antes
de escribir el arreglo (`backend/tests/test_claves.py`, 19 pruebas).

**Estaban en texto plano.** `app_config` guardaba `admin_password` y
`worker_password` tal cual, y se comparaban con `==` —que además tarda distinto
según cuántos caracteres coincidan—. Un respaldo de la base las entregaba todas.
Ahora se guarda el hash **Argon2id** bajo una clave nueva.

> Se puede hacer **sin migración** porque `app_config` es clave/valor: una clave
> nueva es una fila nueva. `create_all` crea tablas que faltan pero nunca agrega
> columnas — la regla que sigue bloqueando el `tenant_id` de la fase 3.

**Migra sola.** En producción esas contraseñas están en claro desde hace meses.
Si el arreglo pidiera un paso manual, alguien se queda sin entrar el lunes:
`verificar_clave` acepta el texto heredado, escribe el hash y borra la fila en
claro **en el mismo movimiento**. Nadie hace nada, nadie queda afuera.

*Ahí aparecieron dos bugs que habrían tumbado el despliegue entero,* y los dos
son el mismo error de forma: una excepción que no era la que parecía.

1. `secrets.compare_digest` con cadenas **exige ASCII** y lanza `TypeError` con
   una tilde o una eñe. Una contraseña colombiana perfectamente normal
   —`señora-galerías`— no daba "clave incorrecta" sino un 500. Se compara en
   bytes.
2. `InvalidHashError` de Argon2 **no hereda de `Argon2Error`** sino de
   `ValueError`, así que el `except` obvio no lo atrapa. Un hash ilegible en la
   base —un respaldo a medias, alguien editando `app_config` a mano— convertía
   el login en un 500 para todo el mundo. Ahora es un 401 del rol afectado, con
   una línea de error en el log, y el otro rol sigue entrando.

**Las claves por defecto salieron del código.** `admin123` y `galerias` estaban
publicadas en el repositorio y eran las mismas para cada supermercado que
instalara esto. Una instalación nueva las toma de `ADMIN_PASSWORD` /
`WORKER_PASSWORD`, y si no están genera una al azar y la escribe en el log del
arranque. **La base manda:** si el rol ya tiene contraseña no se pisa aunque la
variable de entorno diga otra cosa, o cada reinicio revertiría lo que se cambió
desde la pantalla de configuración.

**El freno de intentos vivía en memoria** (`defaultdict` de `deque`). Se borraba
en cada despliegue, y Render reinicia el servicio gratuito cuando se queda
quieto: bastaba con esperar para tener los diez intentos otra vez. Ahora es una
tabla, `login_attempts`, y anota **sólo los fallos** —contar los aciertos
castigaba a quien entra y sale varias veces en la mañana, que es lo que hace un
administrador—. Un ingreso correcto borra la cuenta de esa IP.

**Y la IP tenía que ser la de verdad.** Detrás del proxy de Render todas las
peticiones llegan desde la misma dirección interna: el freno era decorativo. La
lista de `X-Forwarded-For` se lee **de derecha a izquierda** buscando la primera
pública, porque el principio de esa cabecera lo escribe el cliente y el final lo
escribe el proxy — leyéndola al derecho, cambiar la primera IP en cada intento
daba intentos infinitos. Si la conexión llega directa (el peer ya es público, no
hay proxy adelante) la cabecera se ignora entera.

**Cambiar la contraseña ahora echa a la gente.** Antes no: los JWT ya emitidos
valían hasta doce horas más, justo lo contrario de para qué se cambia una
contraseña. Cada rol lleva un contador de época en `app_config` y el token
guarda con cuál nació. Es **por rol** a propósito, y con una consecuencia de
pantalla: cuando el admin cambia su propia clave se cierra también su sesión, así
que la respuesta trae un token nuevo para no expulsarlo de la pantalla en la que
acaba de guardar.

**Los parámetros de Argon2 son los mínimos de OWASP** (19 MiB, dos pasadas, un
hilo), no los de la librería (64 MiB, cuatro hilos). El servicio corre en una
instancia de 512 MB: con los de fábrica, un puñado de intentos simultáneos
—exactamente lo que hace un ataque de fuerza bruta— se come la memoria de la
máquina. Defenderse de que adivinen la contraseña no puede costar el servidor.

### Fase 3 — lo que sí se podía hacer sin decidir nada

De la fase 3 quedaban dos hallazgos que no dependen de la decisión grande. Los
dos están hechos.

**El enlace de montaje salió de la barra de direcciones.** Viajaba como
`?t=<jwt>` y se quedaba ahí a propósito, para sobrevivir a una recarga; el costo
era que la credencial quedaba en el historial del navegador y en cualquier
captura de pantalla de la mercaderista. Ahora pasa a `sessionStorage` —que muere
al cerrar la pestaña, a diferencia del `localStorage` donde vive la sesión del
tablero— y la URL queda en `?montaje=1`.

Esa marca no es cosmética: sin ella, recargar y escribir la dirección pelada
serían indistinguibles, y el admin que abre el enlace en su computador quedaría
encerrado en la pantalla de montaje. Probado en navegador, con contrato real y
viewport de celular: llega, recarga, y `/` a secas vuelve al login.

*Lo que NO se tocó:* los 30 días de vigencia. Es una decisión de operación —el
correo sale al firmar y la exhibición se arma en los días siguientes—, no un
descuido. (Cambió el 2026-10-02: ahora se cuentan desde que arranca el contrato.
Ver *La mercaderista ya no entra con contraseña*.) Y el `Referrer-Policy` de la fase 1 ya evita que el token se filtre por
la cabecera `referer`.

**La bitácora.** No había ninguna: si faltaba un contrato o cambiaba un valor,
no había forma de saber quién ni cuándo. Tabla nueva `audit_log` —otra vez, sin
migración—, con lectura sólo para el administrador en Configuración.

Se anota **lo que cambia algo o abre una puerta**: contratos creados y
cancelados, documentos subidos, bajados y borrados, sedes eliminadas, cambios de
contraseña, ingresos y ingresos fallidos. Los listados y las consultas no —si
cada pantalla dejara línea, lo que importa se pierde en el ruido—, y de los
archivos sólo se anota la bajada de **documentos**: la foto del montaje se abre
decenas de veces por día.

Tres decisiones que valen más de lo que parecen:

* **`anotar` no hace commit.** Viaja en la transacción del endpoint, así que la
  línea y el cambio caen juntos o no cae ninguno. Una bitácora que dice que se
  canceló un contrato que sigue vivo manda a buscar donde no hay nada.
* **Nunca entra un secreto.** Ni la contraseña que se intentó —media bitácora
  serían claves casi correctas de gente que se equivocó una letra—, ni el valor
  del contrato, ni el contenido del archivo. La bitácora la lee más gente que la
  base.
* **El título se arma al leer,** desde un código estable (`contrato.alta`). Si se
  guardara la frase, cambiar la redacción reescribiría el pasado.

Se purga a los 365 días, en el ciclo de mantenimiento que ya corría cada 12
horas: en una base de plan gratuito no puede crecer sin techo, y guardar de más
es su propio riesgo.

Desde el 2026-10-02 se anota también **cada copia de seguridad que se baja**
(`copia.descarga`, con filas, archivos, tamaño y el correo de quien la bajó). Y el
filtro de la pantalla deja de ofrecer lo que ya no puede pasar —«Intento fallido» y
«Cambio de contraseña», que escribían las claves compartidas, y el barrido de
«Empezar de cero»— (`RETIRADAS`); las filas viejas se siguen leyendo con su título.

*Un bug encontrado al probarlo en pantalla:* SQLite guarda la fecha **sin huso**,
y el navegador lee eso como hora local. En Colombia son cinco horas: la bitácora
decía "recién" para algo de la madrugada. La hora sale marcada como UTC desde el
endpoint, que es donde se sabe qué es lo guardado.

### Lo que sigue pendiente, y por qué

* **Aislamiento entre supermercados (fase 3).** Es el hallazgo crítico que
  queda. `tenant_id` en las tablas que ya existen **necesita migraciones**, y la
  regla de este repo es que no hay. Hay que elegir: adoptar Alembic (base
  compartida con RLS) o una base por cliente. Es una decisión de producto, no
  técnica.
* **Cuentas de usuario.** La tabla `users` sí se puede crear sin migración, pero
  pasar de dos contraseñas compartidas a cuentas nominales es un cambio
  operativo para siete tiendas vivas: se coordina, no se despliega de sorpresa.
* **Pagos.** Sin pasarela, por decisión de la dueña (2026-10-13): el supermercado
  paga por transferencia y la operadora registra el pago en la consola (ver *Cobro de
  la suscripción (2026-10-13)*). Si algún día se integra una, la recomendada es
  **Wompi** —Stripe no abre cuentas a empresas colombianas—, y la decisión es de ella.
  Las llaves no viajan por chat: van en el panel de Render.
* **Dos avisos `moderate` de `react-router`** (open redirect). El arreglo es un
  salto de versión mayor; se dejó afuera a propósito de la fase 1.

Con eso, de los doce hallazgos quedan **dos**, y los dos son los que necesitan
una decisión: el aislamiento entre supermercados y las cuentas nominales. El
resto —el DoS, el IDOR, las contraseñas, las claves por defecto, el freno de
intentos, la revocación de sesiones, las cabeceras, el enlace en la URL y la
bitácora— está cerrado.

### Lo que hay que hacer a mano después de desplegar

**Cambiar la contraseña de administrador desde la pantalla de configuración.**
`admin123` está en el historial de git. La migración la mantiene funcionando
—por eso nadie queda afuera— pero mantenerla es dejar la puerta abierta.

---

## Un supermercado, una base

De los doce hallazgos de la auditoría quedaba el crítico: `sede` era un texto en
una tabla común, así que dos supermercados en esta base compartían tabla,
contraseña y archivos. Se eligió **una base de datos por cliente, todas dentro
de la misma instancia de Postgres.**

### Por qué ésa y no las otras dos

Se compararon tres. La [documentación de Render](https://render.com/docs/postgresql-creating-connecting)
dice que una instancia puede contener varias bases —`CREATE DATABASE`, y te
conectás con la misma URL cambiando el último componente—, y eso es lo que
rompió el empate:

| | Todo mezclado con `tenant_id` | **Una base por cliente** | Una instancia por cliente |
|---|---|---|---|
| Plata (5 clientes) | $44/mes | **$44/mes** | $120/mes |
| Trabajo | 2–3 semanas | **4–6 días** | 3–4 días + operación |
| Migraciones | Obligatorias (Alembic) | **Ninguna** | Ninguna |
| Aísla | Por política | **Por construcción** | Total |

**La razón que decidió es la tercera fila.** La regla de este repositorio es que
`create_all` crea tablas que faltan pero nunca agrega columnas. Meter
`tenant_id` en diez tablas con siete tiendas de datos vivos adentro pedía
adoptar Alembic; armar una base nueva y vacía no pide nada.

Y una cuarta, que no estaba en el análisis original: **esta opción deja abierta
la puerta a la de al lado.** Si mañana un cliente exige su propia instancia,
mudarlo es un `pg_dump` de su base. Sacarlo de una tabla compartida sería
extraer sus filas de diez tablas sin romper las llaves foráneas, con el sistema
andando.

### Lo que lo hizo barato

**Todos los routers pasan por `get_db`.** Ese es el único lugar donde se decide
contra qué base corre una consulta, así que separar clientes no obligó a tocar
los doce routers: se cambió el punto de entrada y de ahí en adelante nadie más
elige. Sólo tres lugares abrían sesión por fuera —el arranque, el ciclo de
mantenimiento y un ayudante de correo que resultó ser código muerto.

### El cliente va adentro del token

Sin esto la separación por base no serviría de nada. La firma de los JWT es
**una sola para todo el servicio**, así que un token de administrador de un
supermercado sería criptográficamente válido en el otro. Va adentro de lo
firmado (`create_token(role, epoca, cliente)`), y `cliente_del_pedido` verifica
la firma **antes** de mirar el nombre.

Un token sin cliente —los que ya estaban dando vueltas cuando se desplegó esto—
se resuelve con el único cliente que haya. Así nadie se queda afuera el día del
despliegue.

### Cómo entra la gente

*Histórico: desde la Fase 15 se entra con cuenta propia y el supermercado sale de la
membresía. El selector de la pantalla de ingreso se fue con el «Acceso anterior», y
`GET /api/auth/clientes` —que seguía siendo pública, sólo para nombrar el
supermercado al entrar— se fue el 2026-10-02: el nombre lo devuelve `/auth/oauth`.*

`GET /api/auth/clientes` devolvía la lista, y el selector aparecía en la pantalla
de ingreso **sólo cuando había más de un cliente**.

El supermercado se manda explícito y **nunca se deduce de la contraseña**. Si se
dedujera, habría que probar la clave contra la base de cada cliente —lento a
propósito, porque el hash lo es— y, peor, si dos clientes eligieran la misma
contraseña entraría al que se revise primero.

Un cliente que no existe contesta **lo mismo que una contraseña equivocada**: si
dijera «ese supermercado no existe», la pantalla de ingreso serviría para
averiguar quiénes son los clientes.

### Detalles que cuestan caro si se pasan por alto

* **La lista de clientes vive en la base por defecto.** `create_all` crea la
  tabla `clientes` dentro de la base de cada cliente también, donde queda vacía
  y no significa nada. Por eso se lee siempre con `sesion_registro()` y nunca
  con la sesión del cliente que está pidiendo.
* **Un cliente nuevo arranca vacío.** El arranque siembra los pasillos de
  GALERIAS cuando la base está en cero; dárselos a otro supermercado sería peor
  que dejarlo vacío. La siembra quedó acotada al cliente por defecto.
* **Las conexiones se reparten.** Postgres Basic admite 100 en total, así que
  cada cliente abre un grupo chico (2 fijas, 3 de desborde) en vez de las 15 de
  fábrica de SQLAlchemy. Con eso entran unos quince supermercados antes de subir
  de instancia.
* **La URL se parsea, no se corta.** `?sslmode=require` es lo normal en un
  Postgres administrado. Cortando por la última barra, el nombre de la base se
  llevaría el parámetro puesto y la conexión del cliente nuevo saldría sin TLS.

### Cómo se da de alta un supermercado

Desde la pantalla de ingreso: quien entra con su cuenta sin pertenecer a ningún
supermercado puede registrar uno nuevo (`POST /api/clientes/alta`, Fase 2) y nace su
dueño. A los demás los invita el dueño desde Configuración → Usuarios.

Hasta el 2026-10-02 había además un script de consola, `scripts/alta_cliente.py`, que
creaba la base y dos claves compartidas al azar que imprimía una sola vez. Se borró:
desde el 2026-10-01 esas claves no abren nada, y un supermercado dado de alta así
quedaba sin nadie que pudiera entrar.

### Si la base se muda de proveedor

El cliente por defecto es, **por definición**, la base a la que apunta
`DATABASE_URL`. Por eso el arranque corrige el nombre guardado cuando esa
variable cambia.

Sin eso, mudar la base rompía el sistema en la primera petición: la fila de
`clientes` seguiría diciendo el nombre viejo (`neondb`, por ejemplo), `motor_de`
no lo reconocería como el de siempre, y abriría un motor aparte contra una base
que en el destino no existe. Se encontró preparando justamente esa mudanza, y
está fijado en `test_si_la_base_se_muda_el_registro_la_sigue`.

### La copia de seguridad

**Desde el 2026-10-02 la baja el dueño, desde Configuración → «Copia de
seguridad».** Antes la bajaba `scripts/respaldo.py` por HTTPS, entrando con la clave
compartida de admin de cada supermercado; cuando esa clave se apagó (2026-10-01) el
script se quedó sin puerta, se caía y dejaba una carpeta vacía con la fecha. Se borró.

Render, en plan gratuito, no hace respaldos, así que esta copia es la única. Conviene
bajarla cada semana y guardarla fuera de RECABRA.

**Qué es** (`GET /api/clientes/mi-copia`, lógica en `app/services/copia.py`): un ZIP
con todo lo del supermercado.

* `tablas/<tabla>.json`: cada tabla de negocio, fila por fila y columna por columna,
  tal como está en la base. Son las de `TABLAS_DEL_CLIENTE` —la lista del traspaso—,
  así que una tabla nueva entra sola.
* `archivos/<tabla>/<id>-<nombre>`: documentos de contrato, fotos de montaje,
  planometrías y artes del catálogo. En el JSON, la columna `data` trae la ruta del
  archivo adentro del ZIP. El nombre se limpia: nada que al descomprimir salga de su
  carpeta.
* `personas.json`: quién tenía acceso y con qué rol (vive en el registro, no se
  restaura: es para volver a invitar).
* `MANIFIESTO.json` (de quién, cuándo —hora de Colombia—, cuántas filas y archivos)
  y `LEEME.txt`.

**Qué no trae, a propósito:** las claves compartidas de `app_config` —ya no abren
nada, y un hash en un archivo que anda por correos es material para adivinarlas— y
`login_attempts`, IPs de intentos de ingreso que no hacen falta para volver.

**La puerta:**

* **Sólo el dueño**, con el mismo `require_owner` de «Descargar mis datos»: la
  membresía `owner`, no el rol del token. La copia lleva la plata de los contratos y
  los contactos de los proveedores; a un admin invitado la pantalla ni se la muestra.
* **Tres por hora por persona** (429 después). Armarla lee la base entera. El freno
  vive en memoria: corre un solo proceso, y lo que protege es la máquina.
* **Cada descarga queda en la bitácora** (`copia.descarga`).
* **Sin caché** (`Cache-Control: no-store`) y con el nombre
  `recabra-copia-<slug>-<AAAA-MM-DD-HHMM>.zip`.
* **Con la cuenta suspendida no sale**, como ningún otro dato; para el derecho del
  titular está «Descargar mis datos», que sí sale. En sólo lectura, sí.
* **Memoria:** la instancia tiene 512 MB y un supermercado puede juntar cientos de
  fotos de hasta 10 MB. Los binarios se leen de a uno y el ZIP se arma en un archivo
  temporal que pasa a disco apenas crece.

**Volver.** `backend/scripts/restaurar_copia.py copia.zip [--cliente <slug>]`, desde
la consola del servicio en Render (que ya tiene `DATABASE_URL` y `JWT_SECRET`). Carga
la copia **sólo en una base sin datos de negocio** —se niega antes de escribir nada si
hay un espacio, un contrato o un plano—, en una sola transacción. La configuración
de la copia pisa a la que trae toda base nueva, los contadores de `id` de Postgres
quedan detrás del último, y se marca una generación nueva para que los navegadores
tiren los planos que tenían guardados. Ojo con la base de siempre: el arranque le
siembra pasillos de ejemplo si no tiene espacios, así que en una base nueva hay que
cargar la copia antes del primer arranque.

**Cómo se probó.** `tests/test_copia_de_seguridad.py` (12 pruebas, 11 mutaciones
detectadas): quién la baja, que trae cada tabla con sus archivos idénticos, que no
trae ninguna clave —busca `$argon2` en cada archivo del ZIP—, y **de ida y vuelta**:
copia un supermercado con un poco de todo, la carga en una base nueva y compara
tabla por tabla. Lo mismo contra Postgres 16 real (bytea, fechas con huso, el orden
de las claves foráneas, y un alta nueva después de cargar sin chocar ids), el script
de consola en sus cinco salidas, y en el navegador como dueña (baja el ZIP) y como
admin invitada (no ve la sección).

### Cómo se probó

`backend/tests/test_clientes.py`, 17 pruebas. Para verificar que no son
decorativas se rompió el aislamiento a propósito —haciendo que
`cliente_del_pedido` ignore el token— y **siete pruebas fallaron**, incluidas
las cuatro que verifican que los datos no se cruzan.

La más exigente siembra un contrato de verdad en el primer cliente —proveedor,
marca, fechas, el mueble en el plano— y después pide lo mismo con el enlace de
montaje del segundo. Si la separación fallara, ahí saldría «Alpina».

Y en navegador, con dos clientes vivos: el selector aparece, cada uno entra al
suyo, y por API el primero tiene 41 espacios y el segundo 0.

---

## El desfase entre el plano y la base

> **Esta sección es HISTORIA.** Describe el problema como se vivía cuando el
> plano guardaba lo comercial, y se conserva porque explica el porqué de todo lo
> que vino después. El diagnóstico de acá abajo —una regla que no existe, con
> tres puertas— es el que llevó a *Una sola verdad para lo comercial*, que lo
> elimina de raíz. **Lo único que sigue vivo de acá es el auditor**, porque lo
> que ya está desfasado en producción se guardó antes del corte.

El plano salía del **JSON del layout**, que era una copia que mantenía al día el
navegador que vendía. La **base** (`space_leases`) es la que manda: es la que
valida al guardar. Cuando las dos no coincidían, la pantalla y el servidor decían
cosas distintas y los dos tenían razón — por eso no se arreglaba mirando uno solo.

Se reportó así: *«no me deja alquilar la IMP-17 que está libre, el sistema la
toma como ocupada y no tiene ningún contrato»*.

**De dónde salía.** La carga por planilla acepta una columna «sede», así que UNA
planilla crea contratos en varias tiendas. El parche del mapa, en cambio, se
armaba con el código **corto** —`IMP-17`— y se aplicaba sobre los muebles de la
sede **abierta**. Como los códigos se repiten entre sedes (casi todas tienen un
`IMP-17`), una fila de NAVE cargada con CIUDAD JARDIN en pantalla hacía dos
daños de un golpe: pintaba vendido el `IMP-17` de CIUDAD JARDIN, que no se
vendió, y dejaba el de NAVE —el que sí se vendió— viéndose libre.

**La regla:** un mueble es único por **sede + código**. El código solo no lo es,
y usarlo solo era el bug. Sigue viva y con sus pruebas, ahora en
`utils/espaciosSinMueble.ts` — el parcheo desapareció con el corte, la regla no.

**Lo que no se puede pintar se dice.** Con una sola verdad ya no hay sede que
«poner al día»: el mapa comercial baja entero en cada sincronización y se funde
en todas las sedes cargadas. Lo que queda, y ninguna fusión arregla, es un
contrato sobre un espacio que **ningún plano dibuja**: ahí no hay nada que
pintar, y se nombra uno por uno. Un desfase callado es el que muerde meses
después.

**Y el desfase que ya existe se puede resolver.** El botón de cancelar colgaba
de `hasContract`, que sale del layout: en el caso que hay que resolver el layout
dice «libre», así que el botón desaparecía justo cuando hacía falta y
«cancelalo primero» señalaba algo imposible. Ahora `CancelarContrato` decide
solo —le pregunta a la base— y cuando encuentra un contrato que el plano no
tiene, lo **nombra** (proveedor y fechas) antes de ofrecer soltarlo.

Otras dos vías por las que el parche del layout puede no llegar, conocidas y no
cerradas: el guardado va con **1200 ms de debounce** (cerrar la pestaña justo
después de confirmar lo pierde) y `pushSede` **se salta** la escritura si esa
sede ya está en conflicto. Las dos dejan la base adelante del plano.

### La auditoría: las tres puertas del mismo agujero

Se ejercitó el sistema por su API —no se leyó el código— operación por
operación, comparando las dos verdades después de cada una. El resultado no son
bugs sueltos: es **una** regla que no existe, con tres puertas.

**El layout NUNCA escribe en la base.** No es un olvido: ese camino no existe.
`PUT /api/layout/{sede}` no toca `space_leases` ni una vez. Así que **toda
edición del plano que saca un espacio de circulación deja su contrato vivo**:

| Puerta | Qué queda |
|---|---|
| Borrar el mueble del plano | el contrato sigue vivo, atado a un código que el plano ya no ofrece |
| Góndola doble → simple | la cara B desaparece del plano y su contrato queda huérfano |
| Marcarlo «no comercializable» | sale de la venta y de la ocupación, y se sigue cobrando |

Y la consecuencia que lo vuelve visible: **recrear un mueble con el mismo código
hereda el contrato fantasma** y nace invendible, con el mensaje exacto del
reporte — «ya tiene un contrato del … Cancelalo primero».

**Las tres están cerradas hacia adelante.** El guardado del plano las frena con
un 409 `contratos_vivos` que nombra proveedor y fecha. Se frena en vez de
cancelar solo, que sigue siendo la regla: un contrato es plata y un compromiso
con un proveedor, y una edición del plano no puede cancelarlo en silencio. Se
comprueba en el guardado y no en cada botón de borrar porque es el único lugar
por el que pasan las tres puertas y los cuatro caminos —el panel del 2D, el del
3D, la tecla Supr y el borrado en lote—.

**Y lo que ya está desfasado se ve**: `backend/scripts/auditar_desfase.py` lista,
por sede, todo lo que la base tiene vendido y el plano no, y también la dirección
contraria. Sólo lee. Sigue haciendo falta porque el guardarraíl es de acá en
adelante: lo que ya está mal se guardó antes de que existiera.

**Dos cosas que la auditoría descartó**, y conviene que queden descartadas:

- **Renumerar NO produce desfase.** `services/renumeracion.py` actualiza
  `spaces.code`, `svg_id` y `mount_confirmations.space_code` en una sola
  transacción. Está bien resuelto.
- **El vencimiento automático tampoco.** `expire_leases` libera la base cada 12 h
  y el plano queda con `status: "occupied"`, pero todo lo que importa
  —disponibilidad, canon vigente, los KPI— se calcula por FECHAS
  (`contractPhase`), así que ese espacio cae en «Vencidos», que es donde tiene
  que estar. No infla la plata.

---

## Gotchas

**El tono neutro del producto de prueba depende de nombres internos de three.**
`muebles/etiqueta.ts` reemplaza en el shader del material estándar
`#include <tonemapping_fragment>` (por `NeutralToneMapping`, sólo en ese material) y
`#include <emissivemap_fragment>` (para teñir la emisión con el color de instancia, que
en el fragmento llega como `USE_COLOR`/`vColor`, no `USE_INSTANCING_COLOR`). Si three
renombra cualquiera de los dos, el parche deja de aplicarse **en silencio** y la marca
vuelve a salir con el ACES de la escena. `probar-muebles` lee los shaders de
`node_modules/three` y falla antes; al subir de versión de three, mirar esa prueba
primero.

**Un canvas 2D no devuelve el color de lo transparente.** Guarda el color
premultiplicado: `putImageData` con alfa 0 y después `getImageData` devuelve negro. Toda
textura opaca que se arme de un recorte sale del arreglo `rgba`, nunca de releer el
lienzo (ver *2026-10-08: el producto se ve de verdad*).

**Excel: DOS librerías, y cada una tiene su motivo.**

`xlsx` **LEE** —adjuntos y carga masiva— y ya está en **0.20.3 desde el CDN de SheetJS**,
no desde npm. Esto resolvió el problema que quedó anotado un tiempo: la versión de npm
(`0.18.5`) arrastra vulnerabilidades conocidas (prototype pollution, ReDoS) que SheetJS
sólo corrige en las versiones que publica fuera de npm. Por eso `package.json` apunta a
`https://cdn.sheetjs.com/xlsx-0.20.3/...` y no a un rango de versión: **cualquier cambio
que lo devuelva a npm reintroduce esas vulnerabilidades.**

`exceljs` **ESCRIBE** la plantilla de carga, y existe por una sola razón: SheetJS en su
versión community **no escribe estilos**. Sin él la plantilla sale en gris plano, sin
fondos, negritas ni bordes. La alternativa cómoda —`xlsx-js-style`, que es un fork con
estilos y hubiera sido un cambio de una línea— está pegada a SheetJS 0.18, o sea que
habría traído de vuelta justo lo que el cambio al CDN sacó.

Entra por `import()` perezoso y Vite le da su propio chunk (271 KB gzip): sólo se descarga
al pedir la plantilla, que es una acción de admin y poco frecuente. Mismo trato que
three.js en la landing. **No agregarlo al camino de lectura**: ahí no hace falta y el
arranque lo pagaría todo el mundo.


- `npm install` requiere `--legacy-peer-deps`.
- Las rutas de lista llevan barra final: `/api/spaces/`, `/api/layout/`.
- `JWT_SECRET` es una variable de entorno manual en Render, no viene del Blueprint.
- El login tiene rate limit: 10 intentos por IP cada 15 minutos, en memoria. Reiniciar el
  backend lo limpia (útil al automatizar pruebas).
- `/spaces/map`, `/dashboard/kpis` y `/dashboard/spaces` **existen pero no los llama
  nadie**: todo lo que se ve sale del JSON del layout, calculado en el navegador.
  `SpacePanel`, `StoreView` y `Legend` son componentes huérfanos. Antes de conectar esos
  endpoints hay que revisar que sus números coincidan con los del cliente.
- Quedan dos deudas que la revisión de fechas marcó como no urgentes: nada recalcula al
  **cruzar la medianoche** (una estación abierta todo el día queda anclada al día en que
  se montó la pantalla), y conviven **dos definiciones de "duración"** — el editor 3D y el
  correo de contrato nuevo cuentan exclusivo, así que un contrato del 1 al 24 de diciembre
  se anuncia como "23 días". Si se toca, hay que tocar los tres lugares juntos.
- `.github/workflows/deploy.yml` hace dos cosas distintas. En cada push y cada PR corre el
  **CI de verdad**: typecheck y build del frontend, `pytest` del backend. El **despliegue
  por SSH a un VPS** (no a Render) es opt-in: solo corre si la variable de repositorio
  `DEPLOY_TARGET` vale `vps`, junto con los secrets `VPS_HOST`, `VPS_USER` y `VPS_SSH_KEY`.
  Sin eso se salta, no falla — que es lo que hacía desde junio y tenía los checks en rojo
  permanente.
- `npm ci` a secas falla acá: hay que usar `--legacy-peer-deps`, igual que el Dockerfile.
  `@react-three/drei@10` pide `fiber@^9` y el editor 3D está escrito contra `fiber@8`.
- `nginx/retail.conf` es para el despliegue en VPS, no para Render. Si ese VPS se reactiva,
  hay que copiar el archivo al host a mano — el workflow no lo despliega.
- **`flex: "1 1 480px"` no quiere decir «480 px de ancho».** El `flex-basis` va sobre el
  EJE PRINCIPAL del padre: en una fila es ancho, en una columna es alto. La tarjeta del
  plano se comparte entre Vender y Supervisar, y cuando pasó a vivir dentro de la columna
  de Vender ese mismo valor se volvió un alto de 480 px sobre un dibujo que pide 850 —
  con `overflow: hidden` en la tarjeta, el plano salió a producción cortado 142 px abajo.
  Ahora el `flex` lo pasa quien la llama.
- **De píxeles a coordenadas de un SVG se pasa con `getScreenCTM()`, no con una
  regla de tres.** `(clientX - caja.left) / caja.width * ANCHO` supone que el
  viewBox llena la caja, y no la llena: el `preserveAspectRatio` por omisión es
  `xMidYMid meet`, que encaja por el lado corto y **centra** lo que sobra. El
  cursor de «cuándo se libera» caía corrido hasta 131 px en 1920 y perfecto en
  1440, porque a 1440 la caja y el viewBox tienen casi la misma proporción y no
  hay franjas. Cualquier lectura al pasar el mouse sobre un SVG va por la matriz.
- **El harness revisa a 1440×900 y a 1920×1080.** Una sola pantalla no alcanza,
  y ése es el motivo: el encaje de un SVG depende de la proporción de su caja, y
  la caja depende de la ventana. El bug del cursor daba verde en 1440 y rojo en
  1920. El alto importa por lo mismo desde que el tope del plano se mide en
  `vh`. Son las dos configuraciones reales: el portátil y el monitor.
- **Un mueble tiene UN nombre, y desde la fase 13 es UN SOLO CAMPO.**
  `rotulosDelPlano()` decide dónde se dibuja —adentro de la caja si entra, y si
  no en la pastilla de arriba, nunca las dos—. El plano 2D dibujaba `item.code`
  a secas adentro mientras la pastilla mostraba el nombre puesto a mano: dos
  nombres para el mismo mueble, uno encima del otro. Hoy renombrar escribe el
  `code`, que es el nombre y la llave a la vez.
- **Y si DOS muebles de la sede se dibujan con el mismo nombre, los dos lo
  muestran y los dos salen marcados.** `nombresChocados()` cuenta los nombres
  repetidos del plano y `rotulosDelPlano()` recibe esa cuenta: el gemelo sin
  nombre puesto a mano —que por la regla de arriba no llevaba pastilla— pasa a
  llevarla, y la marca «×2» va en rojo pegada al rótulo (en el mapa isométrico
  de Vender, en una tercera línea con el código real: «×2 · IMP-12»). Sin esto,
  de las dos cajas rotuladas «IMP-08» el plano dibujaba una sola y quien elegía
  no tenía cómo sospechar que había otra: es la doble venta de la fase 12 vista
  desde la pantalla donde se elige. El aviso **no se apaga** con el botón
  «Etiquetas» —una etiqueta se oculta, un aviso no— y no bloquea nada: los dos
  muebles existen, son distintos y contratar los dos es legítimo.
- **Las filas de «Para revisar» abren la ficha.** Llamaban a `selectFixture` sin
  punto de anclaje, y con eso no salía ninguno de los dos paneles: el globito
  del mapa necesita un ancla y la ficha necesita `detailFull`, que sólo lo
  prendía el globito. La fila pintaba el mueble en el plano y ahí terminaba
  todo — justo el renglón desde el que se sale a renovar.

---

## Cómo probar de verdad

Los tres bugs peores aparecieron levantando la aplicación y mirándola, no leyendo el
código. Vale la pena el rato que toma:

1. Sembrar datos realistas en una base SQLite local. *Una base local creada desde la
   rama del producto en 3D antes del 2026-10-09 tiene `supplier_asset_specs` sin
   `precio_publico`, y `create_all` no agrega columnas: `GET /api/catalogo/` se cae con
   «no such column». Se arregla una vez con `ALTER TABLE supplier_asset_specs ADD COLUMN
   precio_publico INTEGER` (sólo si falta). Producción no tiene la tabla: nace con la
   columna.*
2. Levantar backend (`:8000`) y Vite (`:5173`).
3. Conducir el navegador con Playwright y capturar. Chromium ya está instalado en
   `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.

**Lo que es geometría pura, probarlo aparte.** `npm run probar` corre las suites sin
navegador —36 suites y 1180 pruebas al 2026-10-17, de `probar-planta` a
`probar-distribucion`; la cadena está en `frontend/package.json`—: transpila el `.ts` con el
esbuild que ya trae vite y afirma en node. No hay runner de pruebas en el frontend y no valía
la pena montar uno para esto. Ahí se encontró que un paso largo saltaba por encima de un
mueble. Empezó con seis suites y 113 pruebas; cada fase suma la suya.

**Después del 3D, los locators de Playwright dejan de resolver** aunque el DOM esté intacto:
el lienzo redibuja sin parar y el framework nunca lo considera estable. `page.evaluate` sigue
funcionando — despachar el clic sobre el nodo real ejecuta el mismo handler de React.

Para la sincronización, la prueba que importa es la de **dos clientes**: sembrar el
servidor, simular dos estaciones y verificar que las altas *y las bajas* viajan en ambos
sentidos, que un conflicto no pisa el trabajo del otro, y que una respuesta vacía del
servidor no borra la copia local.

**Sembrar siempre dos sedes con la misma nomenclatura.** `PUN-01` existe en NAVE y en
TERRON, y con una sola sede sembrada todo lo que confunde el código corto con el completo
pasa las pruebas. Así se encontró que el enlace del correo de montaje apuntaba a un código
que la pantalla nunca iba a encontrar.

Lo del mercaderista se prueba en **viewport de celular** (390×844) y con el enlace del
correo, no navegando a mano: entrar por `/?montar=SEDE-CODE` es el camino real, y ahí
aparecieron el `Content-Type` que rompía la foto y el doble montaje de StrictMode que se
comía el enlace.
