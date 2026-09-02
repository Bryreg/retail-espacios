# RECABRA — brief funcional

Vas a diseñar la pantalla principal de un sistema que ya existe y funciona en
producción, con siete tiendas usándolo todos los días. **No vas a ver cómo se
ve hoy, ni ninguna propuesta anterior, a propósito.** Diseñá desde el problema.

---

## El negocio

Una cadena de supermercados colombianos ("Galerías", 7 tiendas) **le alquila
espacio físico dentro de sus tiendas a los proveedores** para que exhiban sus
productos. Coca-Cola paga por tener una punta de góndola en la entrada durante
Amor y Amistad; Alpina paga por una exhibición de piso en lácteos; Nutresa
paga por media góndola en el pasillo de mecato.

No es un negocio de vender productos. Es un negocio de **alquilar metros de
estantería, por periodo, a un canon mensual.** Se parece más a alquilar
oficinas o vallas publicitarias que a un supermercado.

Tres hechos que definen todo:

1. **El inventario es físico y está en un lugar.** Cada espacio existe en un
   punto del piso de una tienda concreta. "La punta de góndola de la entrada"
   vale el triple que "la góndola del fondo del pasillo 7". El sistema tiene
   un plano de cada tienda, dibujado a escala, con cada mueble en su posición.

2. **El inventario se pudre.** Un espacio se alquila del 25 de agosto al 24 de
   septiembre. El día que la góndola pasó vacía no se vende nunca más, como
   una habitación de hotel o un asiento de avión.

3. **El año tiene picos.** El comercio colombiano se mueve por temporadas que
   todo el mundo nombra de memoria: Amor y Amistad (3.er sábado de septiembre),
   Halloween, Black Friday, Navidad, regreso a clases ("Escolar"), Semana
   Santa. Un espacio en Navidad vale mucho más que el mismo espacio en febrero.

---

## Quién lo usa

**El administrador comercial.** Una persona por cadena. Es quien vende los
espacios: negocia con el proveedor, fija el canon, arma el contrato. Abre esta
pantalla **cuarenta veces al día**, entre llamada y llamada. Vive en Excel el
resto del tiempo. No es un usuario técnico, pero conoce su piso de memoria:
sabe qué góndola es la buena.

**El mercaderista.** Varios por cadena. Es quien **arma físicamente la
exhibición** en la tienda: llega con el material del proveedor y lo monta en la
góndola. Su trabajo es confirmar con foto que quedó montado.

Regla dura: **el mercaderista NO puede ver ningún valor en pesos.** Ni el
canon, ni las tarifas, ni cuánto paga un proveedor. Nada. Y no se tacha ni se
pone "$—": la cifra sencillamente no existe en su vista.

---

## Los dos modos de la pantalla

Esta pantalla tiene **dos modos declarados**, y es una decisión de producto ya
tomada. El administrador comercial cambia entre los dos; el mercaderista no
vende, así que sólo ve el segundo.

### VENDER — y ojo, porque esta pantalla la ve el proveedor

**Cuando el administrador está vendiendo, gira el portátil y le muestra la
pantalla al proveedor que tiene enfrente.** Eso cambia todo: Vender no es una
pantalla interna, es material de venta que un tercero lee.

Por lo tanto, **está terminantemente prohibido que aparezca**:

- El nombre de cualquier otro proveedor.
- Lo que paga cualquier otro proveedor (el canon negociado ajeno es
  confidencial y mostrarlo rompe la relación comercial con los dos).
- El ranking de quién paga más.
- Quién está pagando por debajo de la tarifa.
- El canon total de la sede, ni cuánta plata entra.
- La plata del periodo: lo vendido, lo que queda por vender, lo que se evapora.
  Todo eso es información interna del negocio.
- Cuántos contratos vencen y de quién.

**Lo que SÍ va, y es lo único que va:**

- **Disponibilidad** — qué está libre y qué está ocupado. Que un espacio esté
  ocupado se puede decir; por quién, no.
- **Tiempo** — hasta cuándo está ocupado (sirve: "esa punta se libera el 24, te
  la puedo dar desde el 25"), el periodo que se está mirando, y las temporadas
  que vienen.
- **El espacio en sí** — dónde queda en la tienda, de qué tipo es, qué mide.
- **El contrato que se está armando con ESE proveedor** — su nombre, su marca,
  sus fechas, su canon.
- **La tarifa de referencia**, que es la lista de precios y sí es pública.

Pensala como lo que es: **la herramienta con la que se cierra una venta,
mirada por los dos lados del escritorio.** Tiene que dejar bien parada a la
cadena y tiene que ayudar al proveedor a decidir.

### SUPERVISAR — esta sí es interna

Acá va todo lo que Vender no puede mostrar: cuánto entra y de quién, qué está
ocupado y hasta cuándo, qué se vence y con cuánta plata, quién paga por debajo
de la tarifa, el ranking por canon, qué arrancó sin montar, cuánto queda por
vender y cuánto se evapora por día vacío. Renovar sale de acá, y renovar
también es vender.

**La vista del mercaderista es este mismo modo, sin un solo valor en pesos.**
No se tacha ni se pone "$—": la cifra sencillamente no existe para él.

### El plano isométrico va en las DOS

**El plano de la tienda es una vista isométrica** — la sala dibujada en
perspectiva, con los muebles como volúmenes y no como rectángulos vistos desde
arriba. Es así porque quien vende señala el piso: el proveedor tiene que
reconocer la tienda que conoce, ver dónde queda la punta que le están
ofreciendo respecto de la entrada y las cajas, y entender que una góndola es un
mueble con dos caras que se venden por separado.

Es **súper importante y va en los dos modos**, no en uno solo. En Vender es el
catálogo que se le muestra al proveedor; en Supervisar es el estado de la sala
de un vistazo. Puede cambiar de tamaño y de qué codifica entre un modo y otro,
pero no puede faltar en ninguno.

### La regla que vale para los dos

**Dentro de cada modo todo tiene que estar al alcance de la mano: sin scroll y
sin navegar a otra parte, en 1440×900.** Cambiar de modo sí es legítimo —son
dos trabajos en dos momentos distintos—; bajar la página para terminar lo que
ya estás haciendo, no.

Otras dos pantallas quedan fuera de este encargo: dibujar el plano de la
tienda, y verla en 3D.

## Los datos que existen

Todos se calculan hoy. No inventes métricas nuevas.

**De la sede** (el usuario cambia de sede con un selector):
- Espacios comercializables. Una góndola de dos caras son **dos** espacios: la
  cara A y la cara B se venden por separado, a proveedores distintos.
- Cuántos ocupados hoy, libres, contratados que aún no arrancan.
- El canon mensual corriendo hoy.
- Contratos vencidos y contratos que vencen dentro de 30 días, cada uno con su
  proveedor, código de espacio, fechas y días que faltan.
- Ranking de proveedores por canon mensual.
- Contratos por debajo de la tarifa de referencia, y cuánto.

**Del periodo elegido** (una temporada, o dos fechas a mano):
- Espacios libres TODO el periodo, libres SÓLO UNA PARTE, y tomados.
- Plata vendida en el periodo.
- Plata que queda por vender (lo libre, valorado a tarifa de referencia).
- **Plata que ya no se recupera**, porque esos días pasaron con el espacio
  vacío.
- Días del periodo, cuántos pasaron, cuántos faltan.

**Del plano:** cada mueble con su tipo (góndola, punta de góndola, exhibición
de piso, isla, nevera, canasta, frutas y verduras), su posición y su tamaño
reales; y el estado de cada espacio: libre, contratado, ocupado, vencido,
reservado, en mantenimiento, no comercializable.

**Del montaje:** qué exhibiciones arrancaron sin reporte y hace cuántos días;
cuáles se reportaron como "no se pudo montar".

---

## Datos reales para la maqueta

Usá estos. No inventes proveedores ni cambies los conteos: son de la tienda
NAVE, hoy 31 de agosto de 2026. Los nombres son como están en la base — hay
razones sociales y hay nombres de pila en minúscula, y así es la realidad.

Sede: **NAVE** · 23 espacios comercializables · 106 muebles · 7 sedes
Canon vigente: **$5.300.001** al mes, sobre 8 contratos
Ocupación: **8 de 23** · 15 libres · 0 contratados sin arrancar
Vencidos: **0** · Vencen en ≤30 días: **5**
Periodo en pantalla: **31 ago → 30 sep 2026**, 31 días, hoy es el **día 1**
En ese periodo: 15 libres todo el periodo · 5 libres parte · 3 tomados

Los 8 contratos corriendo:
| espacio | tipo | proveedor | canon/mes | vence |
|---|---|---|---|---|
| ISL-03 | Isla | COCA COLA | $1.200.000 | sigue después del periodo |
| PUN-04 | Punta de góndola | brayan | $1.000.000 | 24 sep |
| EXP-01 | Exhibición de piso | camilop | $1.000.000 | 28 sep |
| PUN-03 | Punta de góndola | comercializadora nutresa | $800.000 | 24 sep |
| PUN-17 | Punta de góndola | ALPINA | $700.000 | 26 sep |
| EXP-02 | Exhibición de piso | nutresa | $300.000 | 28 sep |
| BEB-01 | Nevera de bebidas | Postobón | $200.000 | sigue |
| GON-60·A | Góndola, cara A | Colanta | $100.001 | sigue |

Sin montar: **PUN-17** ALPINA, arrancó hace 5 días · **PUN-04** brayan, hace 4.

La plata del periodo:
```
Potencial del periodo ............... $14.234.060
Vendido ............................. $5.107.310   36%
Queda por vender .................... $9.126.750   64%
Ya no se recupera ................... $0
Se quema por cada día vacío ......... $294.411
Si al día 10 no se vendió nada ...... $2.649.699 que ya no vuelven
```
**Ojo: hoy es el día 1 de 31, así que lo perdido es CERO y esa es la verdad.**
No pintes una pérdida que no existe. Lo cierto y útil hoy es la tasa.

Códigos que existen en el plano de NAVE:
GON-60·A/B, GON-61·A/B, GON-67·A/B (góndolas, por cara) · PUN-03, PUN-04,
PUN-05, PUN-17 (puntas) · EXP-01, EXP-02 (exhibiciones de piso) · ISL-03 a
ISL-06 (islas) · FRU-01, FRU-04, FRU-05 (frutas y verduras) · BEB-01 a BEB-03
(neveras) · CAR-01 (carnes). Son 23.

Temporadas que vienen, contadas desde hoy:
Amor y Amistad 19 sep, faltan 19 d, dura 8 · Halloween 24 oct, 54 d, dura 9 ·
Black Friday 27 nov, 88 d, dura 7 · Navidad 1 dic, 92 d, dura 24 ·
Escolar 15 dic, 106 d, dura 36 · Semana Santa 21 mar, 202 d, dura 10

---

## Restricciones del producto

- **Español de Colombia, con voseo** ("tocá", "elegí", "cargá"). Ninguna
  palabra en inglés visible.
- Plata: **$5.300.001** — punto de miles, sin decimales, cifras tabulares.
- **1440×900 exactos, sin scroll.** Portátil de oficina. No hay uso móvil real.
- Es una herramienta de trabajo diario, no un sitio de marketing. No hay hero,
  no hay landing, no hay que convencer a nadie de nada.
- El plano es un dibujo interactivo: se toca un mueble y ahí mismo se llena el
  contrato. Es lo único que este sistema tiene y que una planilla no puede.
