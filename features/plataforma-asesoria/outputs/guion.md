# La Plataforma, contada — guion de la cartera y de una sesión de asesoría

**Fase 11 · RECABRA · analista de datos · 2026-09-07**
Compañero de `outputs/ejemplo.json`. Periodo `2026-09` (1 al 30 de septiembre),
**parcial**: el mes no terminó. Todas las cifras de este documento salen del
JSON y son verificables clave por clave; la referencia va entre paréntesis con
la ruta exacta.

Nombres inventados. Ningún supermercado ni proveedor corresponde a una empresa real.

---

## 0. Cómo se usa este documento

Tiene tres partes y se leen en este orden:

1. **§1–§2 · La historia.** Lo que el operador dice en voz alta: primero la
   cartera («a quién llamo»), después la sesión con un cliente («qué le
   propongo»), después qué de eso sobrevive en el informe que se le deja.
   Cada bloque abre con **su frase-conclusión**, en negrita, con su número y su
   referencia. Esa frase es el contrato con el diseño: **si el bloque dibujado
   no la deja leer en tres segundos, el bloque está mal.**
2. **§3 · El mapa de formas.** Dato por dato del inventario: qué pregunta
   contesta, qué trabajo hace, qué forma le toca, contra qué se mide, y por qué.
   Con los cinco lugares donde me aparto del punto de partida del brief §3b,
   cada uno con la medición que sostiene el desvío.
3. **§4–§6 · El color, las trampas y los riesgos.** El sistema de color con la
   corrida del validador pegada, las seis lecturas equivocadas que estos datos
   invitan a hacer, y lo que encontré leyendo el backend.

Convención de plata: pesos colombianos, punto de miles, sin decimales
(`$ 201.667.500`). En texto corrido se abrevia a millones con un decimal
(`$ 201,7 M`) **sólo después** de haber dicho la cifra exacta una vez.

**Alcance del JSON.** `/tendencia` es una llamada por cliente, así que el
ejemplo trae dos series: la del consolidado (`tendencia_cartera`) y la de
Mercamío (`tendencia_cliente`). La historia de los otros cuatro clientes
legibles no está mes a mes: lo que se afirme sobre ellos en el tiempo sale del
consolidado y se dice como lectura, no como dato publicado.

---

## 1. La cartera — «¿cómo va el negocio y a quién llamo primero?»

### 1.1 · El titular

> **La cartera factura $ 382.107.500 este mes sobre 513 espacios en 15 sedes,
> al 47,4 % de ocupación. Contra agosto parece perder $ 45,3 millones y 1,8
> puntos, y no perdió nada: Mercado El Guadual no se dejó leer y salió de las
> dos puntas de la cuenta. A igual composición, agosto fueron $ 375.100.000 y
> 47,4 %: el ingreso subió 1,9 % y la ocupación quedó plana.**
> *(`cartera.consolidado`; `tendencia_cartera.serie[2026-08]` y `[2026-09]`.)*

Esta es la frase más importante del documento y es la razón de ser del capítulo.
El número crudo dice «cayó». El número honesto dice «no pasó nada». Un titular
que no haga esa corrección está mintiendo con datos correctos.

La corrección se calcula así, y se muestra:

| | agosto (publicado) | agosto sin Guadual | septiembre |
|---|---|---|---|
| clientes en la cuenta | 6 | 5 | 5 (+1 sin dato) |
| espacios comercializables | 587 | 513 | 513 |
| ocupación | 49,2 % | 47,4 % | 47,4 % |
| ingreso contratado | $ 427.400.000 | $ 375.100.000 | $ 382.107.500 |

**Lo que la pantalla tiene que decir con esto:** el delta grande va contra la
columna del medio, no contra la primera. La primera se muestra igual, tachada o
en gris, con la palabra «composición distinta». Nunca se esconde: se explica.

*Cobertura, que va en la misma respiración:* 6 clientes en la cartera, **5
leídos y 1 con error** (`cartera.consolidado.clientes_total` = 6,
`clientes_con_error` = 1; `cartera.clientes[mercado-el-guadual].error` =
«No se pudo leer la base de este cliente.»). El consolidado es la suma de los 5.

*Un número que la cartera NO publica:* el conteo de contratos activos. El
consolidado da ingreso y canon promedio, no `contratos`. Se puede despejar
($ 382.107.500 ÷ $ 1.540.756 ≈ 248) pero eso es una inferencia, no un dato: si
se muestra, se muestra como «≈ 248 contratos (derivado)». Mejor: no se muestra.

### 1.2 · La tendencia de 12 meses, anotada

> **La ocupación de la cartera cayó de 63,8 % a 47,4 % en cuatro meses sin que
> se perdiera un solo contrato: entraron 142 espacios nuevos al denominador
> (108 caras del plano de TERRÓN en junio, 34 de Almacenes Caribe en agosto) y
> el ingreso subió $ 15,7 millones en el mismo tramo.**
> *(`tendencia_cartera.serie`, meses `2026-05` a `2026-08`:
> espacios 445 → 553 → 553 → 587; ocupación 63,8 → 50,6 → 51,4 → 49,2;
> ingreso $ 411.700.000 → $ 427.400.000.)*

Las tres anotaciones que van **escritas sobre la línea**, no en una leyenda:

| mes | qué pasó | efecto en el dibujo |
|---|---|---|
| **2025-10** | sin snapshot (la serie arranca en noviembre) | hueco, no una recta entre vecinos |
| **2026-06** | entró el plano de TERRÓN: +108 caras | el escalón del denominador; la ocupación cae 13,2 pts |
| **2026-08** | alta de Almacenes Caribe: +34 caras, 0 contratos | −2,2 pts, mismo mecanismo |
| **2026-09** | Guadual ilegible: el consolidado pierde 74 caras y 46 ocupados de un mes al otro | parcial, y composición distinta |

El mes en curso va marcado **parcial** (`serie[11].parcial = true`) y el mes sin
dato va marcado **sin dato** (`serie[0].sin_dato = true`). Un punto ausente que
se dibuja como recta entre sus vecinos miente con más convicción que un hueco.

### 1.3 · La cola de llamadas

> **De 6 clientes, 4 necesitan una llamada esta semana: uno no se deja leer, uno
> tiene $ 48.360.000 al mes contratados y nadie entra hace 130 días, uno cobra
> 17,4 % por debajo de su propia tarifa sobre $ 109.520.000, y dos no tienen
> tarifa cargada, así que de ellos no se puede decir si cobran bien.**
> *(`cartera.clientes[]`, `adopcion.clientes[]`,
> `_derivado_frontend.cartera.orden_por_necesidad_de_asesoria`.)*

La regla de orden, escrita en la pantalla porque si no es magia: **primero lo
que no se puede ver, después la plata que se puede ir este mes, después la plata
que no está entrando.**

| # | cliente | señal | la razón, en una línea | plata |
|---|---|---|---|---|
| 1 | **Mercado El Guadual** | sin dato | Base ilegible este periodo; suspendido desde el 20-ago. No hay cifra que mirar. | — |
| 2 | **Tiendas La Vereda** | fantasma | 39 contratos activos y 130 días sin que nadie entre; cuenta en gracia. | $ 48.360.000/mes en riesgo · 12,7 % de la cartera |
| 3 | **Superandes** | cobra por debajo | Spread −17,4 % sobre 74 contratos: cobra 17,4 % menos que su propia tarifa. | ≈ $ 23.100.000/mes sin cobrar |
| 4 | **Mercamío** | ocupación baja | 42,9 % sobre 254 espacios; 99 de los 145 libres están en una sola sede. | $ 172.872.500/mes sin vender |
| 5 | **Provisiones del Tolima** | sin tarifa | 33,8 %, la ocupación más baja; 24 de 24 contratos sin tarifa aplicable. | spread: **sin referencia** |
| 6 | **Almacenes Caribe** | nueva | Alta hace 12 días, 34 espacios cargados, cero contratos. | $ 55.420.000/mes al benchmark |

*Cómo salen los dos números derivados de la tabla, para que se puedan auditar:*

- **La Vereda, 12,7 %** = 48.360.000 ÷ 382.107.500.
- **Superandes, ≈ $ 23,1 M** = 109.520.000 ÷ 0,826 − 109.520.000. Es una
  aproximación y se rotula como tal: el spread se calcula sobre los 72 contratos
  que tienen tarifa aplicable, no sobre los 74 (`contratos_sin_tarifa` = 2), y la
  tarifa misma **nunca** cruza la frontera.

**Mercamío tiene el número más grande de la tabla y va cuarto. A propósito.**
Sus $ 172,9 millones no se van a ninguna parte esta semana; los $ 48,4 millones
de La Vereda sí. Si el dueño prefiere la otra lectura, la lista se ordena por
plata con un clic y Mercamío sube al primer puesto — pero el orden por defecto
es riesgo, y la regla se lee arriba de la lista.

### 1.4 · La adopción, dentro de la misma lista

> **Dos de los seis clientes no entraron a la plataforma en el último mes, y son
> los dos que se dieron de alta en febrero de 2025: la cohorte 2025-02 tiene
> retención a 30 días de 0 % sobre 2 clientes.**
> *(`adopcion.cohortes[cohorte=2025-02]`: `clientes` 2, `retencion_30d_pct` 0,0,
> `fantasma` 1, `sin_cuentas` 1.)*

Conteo por clase, en unidades, con la palabra al lado (`adopcion.clientes[]`):
**activa 2 · fantasma 1 · dormida 1 · sin cuentas 1 · nueva 1.**

La adopción **no es un panel aparte**: es la columna «señal» y la columna «días
sin acceso» de la lista de arriba. Un cliente fantasma no es una estadística, es
una llamada.

La tabla de cohortes son cinco filas y se muestra como tabla, sin gráfico. Y
lleva su advertencia: **con 1 o 2 clientes por cohorte, «0 % de retención» y
«100 % de retención» son la misma información que «0 de 2» y «1 de 1»**. Se
publican los conteos; el porcentaje va en gris al lado, no como titular.

### 1.5 · Lo operativo, fuera de la historia

Estados de cuenta y solicitudes de supresión existen y tienen su lugar, pero no
son análisis: son operaciones. Van en un cajón aparte con su propio conteo
(`estados_de_cuenta.clientes[]`, `supresiones.solicitudes[]` — 1 pendiente,
1 atendida). Lo único que sube a la historia es el **chip de estado** en la fila
del cliente, con la palabra: *activo · gracia · solo lectura · suspendido*.

---

## 2. La sesión de asesoría — Mercamío, septiembre 2026

Cliente grande: 7 sedes, 254 espacios, 111 contratos, 25 proveedores.
Todo lo de este capítulo sale de `detalle_cliente`.

### Capítulo 1 · Dónde está

> **Mercamío factura $ 201.667.500 este mes con 111 contratos sobre 254 espacios
> en 7 sedes: 42,9 % de ocupación, 4,5 puntos por debajo de la cartera (47,4 %)
> y 0,4 puntos por debajo de agosto (43,3 %). Los 148 espacios que puede vender
> hoy —145 libres y 3 que se liberan este mes— valen $ 166.957.500 mensuales al
> precio que él mismo cobra por cada tipo.**
> *(`cartera.clientes[mercamio].metricas`; `tendencia_cliente.serie[2026-08]`;
> `_derivado_frontend.mercamio.oportunidad_nueva_partes.espacios_libres`.)*

Los cuatro números de arriba, cada uno **contra algo**:

| dato | valor | contra qué | lectura |
|---|---|---|---|
| Ingreso contratado del mes | **$ 201.667.500** | agosto $ 198.400.000 | +$ 3.267.500 · **+1,6 %** — y el mes es parcial |
| Ocupación | **42,9 %** (109 de 254) | cartera 47,4 % · agosto 43,3 % | −4,5 pts · −0,4 pts |
| Canon promedio | **$ 1.816.824** | cartera $ 1.540.756 | +17,9 % — vende espacio más caro que el promedio |
| Espacios en oferta | **148** de 254 | 106 con contrato hasta después de septiembre | 58 % del inventario está sin vender |

**La tendencia del cliente, con sus dos anotaciones**
(`tendencia_cliente.serie`):

> **De mayo a junio la ocupación de Mercamío cayó 35,1 puntos, de 76,0 % a
> 40,9 %, y no perdió una sola cara: cargó el plano de TERRÓN y su inventario
> pasó de 146 a 254 espacios. Lo que sí perdió ese mes fueron $ 7.200.000
> mensuales: Higiénicos Zafra canceló 6 contratos en mayo.**
> *(`tendencia_cliente.serie[2026-05..06]`: espacios 146 → 254, ocupación
> 76,0 → 40,9, ingreso $ 193.400.000 → $ 186.200.000;
> `detalle_cliente.movimientos[mes=2026-05].salidas`, 6 con
> `motivo: "cancelacion"` y `proveedor: "Higiénicos Zafra"`.)*

Estas dos cosas pasaron el mismo mes y **no tienen nada que ver entre sí**. Si
el gráfico las junta en una sola caída, inventa una causa. Van anotadas por
separado, cada una sobre su propia serie: el escalón del inventario sobre la
línea de espacios, la cancelación sobre la de ingreso.

### Capítulo 2 · Qué encontramos

Seis hallazgos, en orden de lo que pesa. Cada uno es **una línea de evidencia y
un número**; el detalle se abre si se pide.

**H1 — Todo lo vacío está en un solo lugar.**
> **TERRÓN tiene 99 de los 145 espacios libres del cliente (68 %) y está al
> 8,3 % de ocupación, 34,6 puntos por debajo del promedio de Mercamío. Vender
> sólo ahí vale $ 82.960.000 al mes.**
> *(`recomendaciones[id="sede_subutilizada:TERRON"]`: `ocupacion_pct` 8,3,
> `ocupacion_promedio_cliente_pct` 42,9, `libres` 99,
> `valor_estimado_mensual` 82.960.000.)*

Contra qué: el promedio del propio cliente. Las otras seis sedes van de 50,0 %
(NAVE) a 79,4 % (CENTENARIO) — `sedes[]`. TERRÓN no es «una sede floja», es
**una sede que todavía no se vendió**: se cargó su plano en junio.

**H2 — Un proveedor es la mitad del negocio.**
> **Gaseosas Volcán tiene 46 de los 111 contratos (41,4 %) y $ 110.567.500 de
> los $ 201.667.500 de ingreso: 54,8 %. Cinco de sus contratos vencen en los
> próximos 60 días.**
> *(`recomendaciones[id="concentracion_proveedor:Gaseosas Volcán S.A."]`;
> `proveedores[0]`: `participacion_pct` 41,4, `canon_total` 110.567.500,
> `contratos_por_vencer_60d` 5, `desde` 2023-02-01.)*

Contra qué: el umbral de concentración del sistema, 40 % (media) y 60 % (alta).
Está 1,4 puntos encima del primero. **La participación se cuenta en contratos
(41,4 %) y el peso en plata es otro número (54,8 %)**: son dos cosas y hay que
decir las dos, porque Volcán ocupa espacios caros.

**H3 — El inventario es góndola, y la góndola no se está vendiendo.**
> **154 de los 254 espacios son caras de góndola (61 %) y 113 de ellas están
> libres: son el 78 % de todo lo vacío. Además se cobran a $ 827.500, 9,1 % por
> debajo del promedio de la plataforma para ese tipo ($ 910.000).**
> *(`resumen_por_tipo[tipo=gondola]`: total 154, libres 113, canon_promedio
> 827.500; `benchmark_plataforma.gondola` 910.000.)*

**H4 — Nueve contratos se caen antes de noviembre.**
> **Nueve contratos vencen dentro de 60 días por $ 19.742.500 mensuales: el
> 9,8 % del ingreso. Tres de ellos se caen dentro de septiembre —el 18, el 25 y
> el 30— por $ 6.385.000, y ya cambiaron de estado a «se libera».**
> *(`recomendaciones[tipo="contrato_por_vencer"]`, 9 items;
> `_derivado_frontend.mercamio.ingreso_en_riesgo_60d` 19.742.500;
> `espacios[].estado = "se_libera"` en VILLA-PUN-01, CENTENARIO-NEV-01,
> NAVE-CRZ-01.)*

Contra qué: hoy (2026-09-07) y el fin del periodo (2026-09-30). El corte del mes
importa porque **cambia el estado del espacio**, no sólo la fecha.

**H5 — Cobra por debajo del mercado en tres tipos y por encima en dos.**
> **Contra el promedio de la plataforma, Mercamío cobra −15,5 % en exhibición de
> piso, −11,6 % en nevera de bebidas y −9,1 % en góndola; y +5,7 % en punta y
> +5,2 % en isla. La brecha total del lado negativo no se puede sumar en plata
> sin decidir a cuántos contratos se le aplicaría.**
> *(`_derivado_frontend.mercamio.canon_vs_benchmark_por_tipo`, calculado sobre
> `resumen_por_tipo[].canon_promedio` y `benchmark_plataforma`.)*

**H6 — Hay una medición que no se puede hacer.**
> **Robatope y batea no tienen tarifa de referencia cargada: 7 de los 111
> contratos quedan fuera del cálculo del spread (−6,8 %), y de batea no hay ni
> un contrato, así que su precio sugerido sale del benchmark, no del cliente.**
> *(`resumen_por_tipo[].tarifa_configurada` = false en batea y robatope;
> `cartera.clientes[mercamio].metricas.contratos_sin_tarifa` = 7 y
> `spread_pct` = −6,8; `recomendaciones[id="espacio_libre:batea"].datos.origen_precio`
> = `"benchmark"`.)*

**El hallazgo que ninguna recomendación dice sola, y que hay que mostrar:**
la recomendación de las 113 góndolas propone ofrecérselas a **Gaseosas Volcán**
como primer candidato; la de concentración dice que Volcán **ya pesa 41,4 %**.
Las dos son correctas y se contradicen. La pantalla tiene que ponerlas a la
vista una al lado de la otra: *«ofrecer las 113 a Volcán subiría su
participación del 41,4 % al 71 % (159 de 224 contratos)»* — y ofrecer el segundo candidato (Café Tinajo) como la salida.

### Capítulo 3 · Qué proponemos

25 recomendaciones: **6 altas, 9 medias, 10 bajas**
(`_derivado_frontend.mercamio.recomendaciones_por_prioridad`). Cada una es una
acción con un valor, no una descripción. Las seis altas, en orden:

| # | acción | evidencia en una línea | vale |
|---|---|---|---|
| 1 | **Ofrecer 113 caras de góndola** a Café Tinajo y Cervecería Bordón (Volcán, tercero: ver H2) a **$ 827.500** c/u | 96 en TERRÓN · 12 en NAVE · 5 en VILLA; precio = promedio que este cliente ya cobra | **$ 93.507.500/mes** |
| 2 | **Concentrar la venta en TERRÓN**: 99 espacios libres, 8,3 % de ocupación | 34,6 pts bajo el promedio del cliente | **$ 82.960.000/mes** *(subconjunto de #1 y #3 — ver abajo)* |
| 3 | **Ofrecer 11 puntas de góndola en oferta** a **$ 3.150.000** c/u | 10 libres (2 CENTENARIO · 2 PALMAR · 2 NAVE · 2 BOSQUE · 1 ARRAYÁN · 1 VILLA) + VILLA-PUN-01, que se libera el 18-sep | **$ 34.650.000/mes** |
| 4 | **Renovar o reasignar VILLA-PUN-01** (Lácteos Bellavista) antes del 18-sep | vence en 17 días | **$ 2.800.000/mes** |
| 5 | **Renovar CENTENARIO-NEV-01** (Gaseosas Volcán) antes del 25-sep | vence en 24 días | **$ 2.085.000/mes** |
| 6 | **Renovar NAVE-CRZ-01** (Gaseosas Volcán) antes del 30-sep | vence en 29 días | **$ 1.500.000/mes** |

Las medias, resumidas: diversificar contra Volcán ($ 110.567.500 expuestos),
5 islas ($ 13.200.000), 8 exhibiciones de piso ($ 11.360.000) y los 6 contratos
que vencen en octubre ($ 13.357.500). Las bajas: 5 neveras ($ 9.900.000), subir
canon en las próximas renovaciones ($ 5.915.000 en seis tipos), 4 robatopes
($ 2.240.000), 2 bateas ($ 2.100.000) y cargar tarifas de robatope y batea
($ 0 — no hay plata, hay una medición que falta).

**El total, que es donde casi todo el mundo se equivoca:**

> **Sumar las 25 recomendaciones da $ 386.142.500, y ese número no existe.
> Cuenta dos veces los mismos espacios (TERRÓN está adentro de «góndolas
> libres») y suma como oportunidad plata que ya está entrando (la concentración
> de Volcán). Lo que hay de verdad son tres números distintos:**
>
> - **$ 172.872.500/mes de oportunidad nueva** = $ 166.957.500 de espacio sin
>   vender + $ 5.915.000 de canon por debajo del propio promedio. **Es el 85,7 %
>   de lo que Mercamío factura hoy.**
> - **$ 19.742.500/mes de ingreso en riesgo** a 60 días (9 contratos).
> - **$ 110.567.500/mes de ingreso expuesto a un solo proveedor** (54,8 %).
>
> *(`_derivado_frontend.mercamio`: `valor_en_juego_bruto`,
> `oportunidad_nueva`, `ingreso_en_riesgo_60d`,
> `ingreso_expuesto_a_un_proveedor`.)*

Estos tres números **no se suman entre sí**: uno es plata que podría entrar, otro
plata que podría salir, y el tercero plata que ya entra pero de una sola mano.
Van como tres cifras rotuladas, nunca como un total.

### Capítulo 4 · Los datos detrás

Plegado por defecto. Cinco tablas, cada una con su conteo en el encabezado, y
cada cifra de arriba tiene que poder aterrizar acá:

| tabla | filas | de dónde | qué trae |
|---|---|---|---|
| Espacios | **254** | `detalle_cliente.espacios[]` | código, código corto, cara, sede, tipo, zona, área m², estado, y el contrato si lo hay |
| Contratos | **111** | `espacios[].contrato` + los 2 de `contratos_fuera_del_plano` | proveedor, marca, canon, inicio, fin, días para vencer, si arranca en el periodo |
| Proveedores | **25** | `proveedores[]` | espacios, tipos, sedes, canon total y promedio, participación %, desde cuándo, cuántos vencen a 60 días |
| Movimientos | **12 meses** | `movimientos[]` | entradas y salidas por mes, con motivo (vencimiento / cancelación) |
| Oportunidades | **148** | `oportunidades[]` | espacio libre o que se libera, precio sugerido, origen del precio, hasta 3 candidatos |

**Dos filas que hay que contar y no esconder:** hay **2 contratos sobre códigos
que no están en el plano** (`contratos_fuera_del_plano` = 2:
`PALMAR-VIT-03` y `CENTENARIO-EXH-07`, tipo `fuera_del_plano`). Suman
$ 4.250.000 al ingreso y **no suman a la ocupación**, porque no hay cara que
ocupar. Si esa línea no está escrita, los dos números no cierran y nadie sabe
por qué.

### Capítulo 5 · De dónde sale

Una franja al pie, siempre visible, con seis datos y un enlace:

- **Periodo:** 2026-09 (2026-09-01 a 2026-09-30) — **mes en curso, parcial.**
- **Generado:** 2026-09-07T14:22:41Z (`detalle_cliente.generado_en`).
- **Cobertura del benchmark:** promedio de la plataforma por tipo, sobre los
  clientes legibles del periodo — **5 de 6** (`cartera.consolidado`).
- **Sin dato:** batea no tiene contratos → su precio sugerido viene del
  benchmark; robatope y batea no tienen tarifa cargada → **sin spread**.
- **Lo que no se muestra nunca:** la tarifa de referencia del cliente. Sólo su
  relación (`spread_pct`) y si existe (`tarifa_configurada`).
- **Esta consulta queda anotada** en la bitácora, y el cliente la puede ver.
- **→ Reporte de transparencia** (`GET /api/plataforma/clientes/mercamio/reporte`).

### 2.bis · El cliente nuevo — Almacenes Caribe

El séptimo tipo de recomendación, `arranque`, **no puede convivir con los otros
seis**: el backend la genera sólo cuando el cliente no tiene ni un contrato
(`_armar_recomendaciones`: `if not del_periodo: return _rec_arranque(...)`). Por
eso va en su propio detalle (`detalle_cliente_nuevo`).

> **Almacenes Caribe se dio de alta hace 12 días, ya cargó el plano de su única
> sede con 34 espacios comercializables y no tiene ni un contrato: al promedio
> de la plataforma esos 34 espacios valen $ 55.420.000 al mes.**
> *(`detalle_cliente_nuevo.recomendaciones[0]`: `tipo` `"arranque"`,
> `prioridad` `"alta"`, `valor_estimado_mensual` 55.420.000,
> `datos.espacios_por_tipo`: cross 2 · gondola 18 · isla 3 · nevera_refrescos 4
> · punta 6 · stand_frutas 1.)*

Acá **todo** sale del benchmark (`origen_precio: "benchmark"` en las 34
oportunidades) y **no hay candidatos**: `candidatos: []`, porque el cliente no
tiene todavía un solo proveedor a quien parecerse. Eso se dice con esas palabras
—«todavía no hay a quién ofrecérselo desde adentro»— y **no se rellena** con
proveedores de otros clientes: eso cruzaría la frontera.

---

## 2.ter · El informe para el cliente

La misma historia, capítulos 1 → 3, **sin el capítulo 4 y sin nada de la
cartera**. Tres cambios obligatorios, no cosméticos:

1. **Fuera la comparación contra la cartera.** «4,5 puntos por debajo de la
   cartera» es un número del operador: sale de `/metricas`, no del detalle del
   cliente, y le cuenta al gerente cómo les va a los otros supermercados. En el
   informe, ese «contra qué» se reemplaza por **el benchmark de la plataforma
   por tipo**, que sí está en su propio detalle y es un promedio anónimo.
2. **Fuera la palabra «fantasma», «gracia» y el orden de la cola.** El estado de
   cuenta y la clasificación de adopción son juicios internos.
3. **El titular cambia de dueño.** El del operador es «a quién llamo». El del
   cliente es **«qué gano»**:
   > **Mercamío tiene 148 espacios sin vender de 254 y $ 166.957.500 mensuales
   > sobre la mesa: el 83 % de lo que factura hoy. Dos de cada tres de esos
   > espacios están en Mercamío Terrón.**

   *(166.957.500 ÷ 201.667.500 = 82,8 %; 99 ÷ 148 = 66,9 %.)*

Lleva el nombre del cliente, el periodo, la fecha de generación y a RECABRA.
Se imprime en A4 vertical y se lee sin pasar el mouse por encima de nada: **todo
lo que un tooltip diría, en el informe está escrito.**

---

## 2.quater · El ejemplo del brief: cómo se cuentan «113 góndolas libres»

Esto es lo que **no** puede pasar, tal cual sale hoy del backend
(`recomendaciones[id="espacio_libre:gondola"].explicacion`):

> «113 espacio(s) de tipo gondola libre(s) (NAVE-GON-02, NAVE-GON-02-B,
> NAVE-GON-03, NAVE-GON-03-B, … 109 códigos más …): ofrecerlos a Gaseosas
> Volcán S.A., Café Tinajo, Cervecería Bordón a unos $ 827.500 mensuales cada
> uno (promedio que ya cobra este cliente).»

El dato completo está y no se entiende nada. **El texto de `explicacion` no se
imprime nunca.** Se usan los campos de `datos`, que traen lo mismo estructurado.

Se cuenta en **cuatro escalones**, y sólo el primero está a la vista:

**Escalón 1 — la frase (siempre visible, una línea):**

> **113 caras de góndola libres — 96 en TERRÓN, 12 en NAVE, 5 en VILLA —
> valen $ 93.507.500 al mes a $ 827.500 cada una.**

Tres números, tres lugares, un precio. Nada más. *(De
`datos.libres` = 113, `datos.precio_sugerido` = 827.500,
`valor_estimado_mensual` = 93.507.500, y el reparto por sede de
`_derivado_frontend.mercamio.libres_por_tipo_y_sede.gondola`.)*

**Escalón 2 — el precio, contra algo (misma tarjeta, línea gris):**

> Precio = el promedio que Mercamío ya cobra por cara de góndola
> (`origen_precio: "cliente"`). El promedio de la plataforma es $ 910.000:
> **está cobrando 9,1 % menos que el mercado.** Si cobrara al benchmark, las
> mismas 113 caras valdrían $ 102.830.000.

**Escalón 3 — a quién (misma tarjeta, tres nombres, un clic):**

> Candidatos, todos con góndola ya contratada acá: **Café Tinajo**
> ($ 2.376.875 de canon promedio hoy), **Cervecería Bordón** ($ 2.074.375),
> **Gaseosas Volcán** ($ 2.403.641 — *ojo: ya tiene el 41,4 % del cliente*).
> *(`datos.candidatos[]`, con `mismo_tipo: true` en los tres.)*

**Escalón 4 — los 113 códigos (sólo si se piden):**
tres grupos plegados, uno por sede, y **el plano de la sede como ancla**: al
abrir «TERRÓN · 96» se enciende el plano de TERRÓN con las 96 caras en verde
`libre` y el resto en gris. La lista de códigos existe, es filtrable, se puede
copiar, y **nunca se abre sola.**

La misma mecánica sirve para las otras seis recomendaciones de espacio libre y
para las 148 oportunidades: **la unidad que se muestra no es el espacio, es el
grupo (sede × tipo).** 148 filas se vuelven ~20 grupos, y el operador llega a
cualquiera de las 148 en dos clics.

---

## 3. El mapa de formas

**La pregunta se contesta por escrito antes de dibujar.** Para cada dato del
inventario del brief §4: qué pregunta contesta, qué trabajo hace el dato, qué
forma le corresponde a ese trabajo, contra qué se mide.

Leyenda de la columna «decisión»: **=** coincido con el punto de partida del
brief §3b · **Δ** me aparto, con el motivo medido.

### 3.1 · Cifras y proporciones

| Dato | Pregunta | Trabajo del dato | Forma que le toca | Contra qué | |
|---|---|---|---|---|---|
| **Ingreso contratado del mes** (cliente o cartera) | ¿cuánto entra? | magnitud sola | **Cifra grande** (una por pantalla), con la variación al lado: flecha + número absoluto + %. Cifras proporcionales, no tabulares. Nunca un anillo ni una barra de una sola barra. | mes anterior **comparable** | **Δ** |
| **Ocupación %** (cliente) | ¿qué tan lleno está? | parte de un total | **Cifra + gráfico de unidades**: una marca por espacio, agrupadas por sede, ocupados/se libera/libres. Los 254 espacios de Mercamío caben; a 300 también. | mes anterior · cartera | **=** |
| **Ocupación %** (cartera) | ¿qué tan llena está la cartera? | ratio contra un límite | **Cifra + medidor** (pista del mismo tono, marca de referencia en el mes anterior comparable). No unidades: 513 marcas no señalan nada. | mes anterior comparable | **Δ** |
| **Ocupación por sede** | ¿qué sede rinde y cuál no? | ranking de partes | **Barras ordenadas, la peor arriba**, largo = espacios de la sede, relleno = ocupados, cifra y % al final. Una sola escala: espacios. | la media del cliente, como línea vertical | **Δ** |
| **Valor en juego total** | ¿cuánto vale hacer esto? | magnitud compuesta | **Tres cifras rotuladas**, no una: oportunidad nueva / ingreso en riesgo / ingreso expuesto. Cada una con sus partes. La suma de las tres no se muestra. | ingreso contratado del mes | **Δ** |

**Δ Ocupación de cartera — por qué medidor y no unidades.** El brief pide
unidades que suman. Para un cliente es exactamente lo correcto: 254 marcas
*señalan un lugar*, y el operador ve el bloque vacío de TERRÓN de un vistazo. En
la cartera, 513 marcas (o 3.000 con 30 clientes) no señalan nada: no hay un
espacio al que ir. `choosing-a-form.md` es explícito: *«a single ratio against a
limit → meter»*. La forma sigue al trabajo, y el trabajo cambia con el nivel.

**Δ Ocupación por sede — por qué el largo es espacios y no el porcentaje.**
Con barras de %, ARRAYÁN (66,7 % = 8 de 12) y VILLA (66,7 % = 16 de 24) dibujan
la misma barra, y no son el mismo negocio. Con el largo en espacios, TERRÓN es
una barra nueve veces más larga que ARRAYÁN y casi vacía: **es el dibujo del
hallazgo**. Y cumple la regla del propio brief: «lo que hay que contar se cuenta
en unidades, no en porcentaje».

**Δ Valor en juego — por qué tres cifras y no una.** Medido:
`Σ recomendaciones[].valor_estimado_mensual` = **$ 386.142.500**, contra un
ingreso de $ 201.667.500. El 1,9× no es una oportunidad, es un error de suma:
`sede_subutilizada:TERRON` ($ 82.960.000) son los mismos espacios que
`espacio_libre:gondola` + `espacio_libre:cross` + `espacio_libre:batea`, y
`concentracion_proveedor` ($ 110.567.500) es ingreso que **ya entra**. Un
titular con ese total se cae en la primera pregunta del dueño.

### 3.2 · El tiempo

| Dato | Pregunta | Trabajo del dato | Forma que le toca | Contra qué | |
|---|---|---|---|---|---|
| **Tendencia 12 meses — ocupación** | ¿hacia dónde va? | cambio en el tiempo con **denominador móvil** | **Dos líneas de conteo en la misma escala**: espacios comercializables (tenue, con escalones) y ocupados (fuerte). La ocupación se lee como la brecha; el % va rotulado sólo en el punto actual y el anterior. | su propio pasado | **Δ** |
| **Tendencia 12 meses — ingreso** | ¿hacia dónde va la plata? | cambio en el tiempo | **Línea** en su propio panel, misma rejilla de meses, mes parcial marcado, movimientos anotados sobre la línea. | su propio pasado | **=** |
| **Movimientos (entradas / salidas)** | ¿qué se ganó y qué se perdió? | flujo con signo en el tiempo | **Barras divergentes** sobre el eje de meses, entradas arriba y salidas abajo, **rotuladas en plata con signo**, y la línea de saldo neto encima. Una sola escala de pesos. | el saldo | **=** |
| **Contratos por vencer** | ¿qué se cae y cuándo? | hechos con fecha | **Lista ordenada por fecha** con un riel de **60 días** arriba (no 90: el backend no mira más allá — `DIAS_POR_VENCER = 60`), con hoy marcado y el corte de fin de mes marcado. Cada fila: proveedor · código · tipo · plata · días. | hoy · fin del periodo | **Δ** |
| **Último acceso / días sin acceso** | ¿hace cuánto que no entran? | hecho con fecha | **Número de días + la fecha**, en la fila del cliente. Nunca un gráfico. `null` = «nunca entró», no «0 días». | 30 días (el umbral del sistema) | *(agregado)* |
| **Cohortes de adopción** | ¿los nuevos se quedan? | retención en el tiempo | **Tabla**, 5 filas. Conteos primero, porcentaje en gris. Con n ≤ 2 el % se rotula «n = 2». | — | **=** |

**Δ Tendencia de ocupación — por qué dos líneas de conteo.** Este es el desvío
que más me importa. El denominador de esta serie **se mueve tres veces en cuatro
meses**: 445 → 553 (junio, TERRÓN) → 587 (agosto, Caribe) → 513 (septiembre,
Guadual ilegible). Una línea de porcentaje sobre eso dibuja un derrumbe de
16,4 puntos que no ocurrió, y ninguna anotación arregla un eje que miente. Con
dos líneas de conteo en una sola escala de espacios, el escalón está **en el
dato** y no hace falta explicarlo: es exactamente lo que pide la regla 4 del
brief («anotar sobre el dato»), llevada un paso más lejos —el dato se dibuja de
modo que no necesite la anotación—. Y respeta la regla dura de una sola escala
por gráfico: nunca dos ejes (`anti-patterns.md`, primer punto: los dos ejes
inventan una correlación que no está).

**Δ Contratos por vencer — 60 días, no 90.** El brief pide 90. `DIAS_POR_VENCER`
es 60 y `contratos_por_vencer_60d` está en el JSON de proveedores. Dibujar un
riel de 90 días con datos de 60 crea un tercio de riel vacío que se lee como
«no hay vencimientos en octubre-noviembre», y no es cierto: es que no se miran.

### 3.3 · Las comparaciones

| Dato | Pregunta | Trabajo del dato | Forma que le toca | Contra qué | |
|---|---|---|---|---|---|
| **Canon promedio por tipo vs benchmark** | ¿cobra bien? | comparación contra referencia, por tipo | **Dumbbell**: un punto el cliente, otro el benchmark, la barra entre ellos, la brecha escrita en % al final. **Ordenado por brecha**, el más negativo arriba. El tipo sin contratos no dibuja punto: dice «sin contratos de este tipo». | benchmark de la plataforma | **Δ** (orden y nulos) |
| **Spread % (cartera)** | ¿quién cobra por debajo de lo que dice que vale? | comparación contra referencia, por cliente | **Puntos sobre un eje con el cero marcado**, negativo a la izquierda, nombre al lado. Debajo, contada y aparte: la fila **«2 clientes sin tarifa configurada — sin referencia»**. | cero | **Δ** (los nulos, contados) |
| **Proveedores: participación %** | ¿de quién depende? | partes de un total, ranking | **Barras horizontales ordenadas**: las 5 primeras con nombre, el resto plegado en **una** barra «otros 20 · 38 contratos · 34,2 %». Umbral de 40 % como línea vertical rotulada. | umbral de concentración | **Δ** |
| **Espacios por estado** | ¿cuánto hay para vender? | conteo | **Unidades discretas**, una marca por espacio, agrupadas por sede y por tipo, con la **palabra** al lado del color. El «se libera» lleva su fecha. | — | **=** |
| **Recomendaciones** | ¿qué hago primero? | ranking por valor y prioridad | **Lista ordenada**: acción · evidencia en una línea · valor. La prioridad es palabra **y** orden **y** peso tipográfico; nunca sólo color. | los tres totales de §2 cap. 3 | **=** |
| **Oportunidades** | ¿a quién le ofrezco qué? | asignación | **Tabla agrupada por sede × tipo** (148 filas → ~20 grupos): cuántos, precio sugerido, **de dónde sale el precio**, hasta 3 candidatos por nombre. El plano de la sede se enciende al abrir un grupo. | precio sugerido y su origen | **Δ** (el grupo es la fila) |
| **Adopción (clases)** | ¿quién no usa lo que paga? | clasificación con conteo | **Conteo por clase en unidades** dentro del encabezado de la cartera, y la clase como **columna «señal»** de cada fila. No es un panel. | — | **=** |

**Δ Proveedores — por qué no 25 barras.** `choosing-a-form.md`: más de ~7 clases
con significado → tabla. `anti-patterns.md`: más de ~7 clases de color → tabla.
Y la pregunta («¿de quién depende?») tiene **una** respuesta: Volcán, 41,4 %. Lo
correcto es **énfasis**: Volcán en la tinta de dato, los cuatro siguientes en el
paso tenue de la misma rampa, los 20 restantes en un solo bloque gris. Las 25
filas viven en la tabla del capítulo 4.

**Aviso de frontera sobre esa barra:** en la **cartera** sólo hay
`top_proveedores` (5) y **no** el total de contratos por cliente, así que la
barra «otros» **no se puede calcular ahí**. Sólo en el detalle. En la cartera,
el top 5 se muestra como cinco conteos con la palabra «top 5», sin porcentaje y
sin «otros»: un porcentaje sin denominador publicado es un número inventado.

**Δ Nulos, en las dos comparaciones.** `spread_pct` es `null` en 2 de 6
clientes y `canon_promedio` es `null` en batea. Un `null` **no es un cero** y no
se dibuja en el eje: se cuenta aparte, con la razón. Es la regla 7 del brief y es
la que más fácil se rompe.

### 3.4 · Lo que no es un gráfico

| Dato | Pregunta | Trabajo | Forma |
|---|---|---|---|
| Estado de cuenta (activo/gracia/solo lectura/suspendido) | ¿puede operar? | clasificación operativa | **Chip con la palabra** en la fila. Sin color propio si no hay acción asociada. |
| Cobertura (`clientes_incluidos`, `clientes_con_error`, `de_cache`, `parcial`, `sin_dato`) | ¿de cuánto sale esto? | metadato | **Una línea de pie**, contada: «5 de 6 clientes · mes parcial · generado 14:22 UTC». |
| `contratos_fuera_del_plano` | ¿por qué no cierran ocupación e ingreso? | conteo excepcional | **Una línea contada** al pie de la tabla de espacios. Nunca una categoría más del gráfico de estados. |
| Zona y área m² del espacio | ¿dónde está y cuánto mide? | atributos | **Columnas de la tabla** y etiqueta en el plano. Jamás un gráfico. |
| Marca del contrato | ¿de qué marca es? | identidad | Texto en la fila, bajo el nombre del proveedor. |
| `benchmark_plataforma` | ¿cuánto cobra el mercado? | referencia | **Nunca solo.** Siempre como la línea o el punto de referencia de otro dato. Un benchmark suelto no responde ninguna pregunta. |
| Reporte de transparencia | ¿qué le mostramos? | documento | **Un enlace** en el capítulo 5. No se rediseña. |

### 3.5 · Reglas duras que atraviesan todo el mapa

1. **Una sola escala por gráfico.** Nunca dos ejes. Si hacen falta dos unidades,
   son dos paneles con la misma rejilla de tiempo.
2. **Ningún gráfico sin la frase de arriba** que diga qué se ve, con su número.
3. **Cada gráfico con su tabla equivalente**, alcanzable sin hover.
4. **El tooltip nunca es el único camino a un valor**: lo que muestra al pasar
   el mouse está también en una etiqueta directa o en la tabla.
5. **Etiquetar selectivamente**: el extremo, el punto actual, el que cuenta la
   historia. Un número sobre cada punto es ruido.
6. **Los filtros van en una fila arriba de todo lo que alcanzan** (periodo,
   sede, tipo, estado, prioridad), nunca dentro de una tarjeta ni por gráfico.
   El periodo manda sobre las tres piezas a la vez.
7. **El color nunca lleva un dato solo**: la palabra siempre está.

---

## 4. El color

### 4.1 · La decisión

**RECABRA tiene UN sistema de color categórico y UNA tinta de dato. No hay
paleta de series.** Esta es la decisión fuerte de este documento y se sostiene
con una medición, no con gusto.

| rol | claro | oscuro | dónde | token |
|---|---|---|---|---|
| espacio **libre** | `#00805A` | `#00BE86` | plano, unidades, chips | `--libre` / `--st-libre` |
| espacio **se libera** en el periodo | `#CE8A0A` | `#F5A524` | ídem | `--entra` / `--st-libera` |
| espacio **ocupado** | `#D8342E` | `#F4544E` | ídem | `--ocupado` / `--st-tomado` |
| **no se alquila / sin dato** | `#AAB3BE` | `#33414F` | ídem | `--resto` / `--st-resto` |
| **tinta de dato** (toda magnitud que no es estado) | `#2E63C8` | `#4C89E8` | líneas, barras, puntos, dumbbells | **nuevo** — `--dato` |
| **tinta de dato, paso tenue** (contexto, «el resto», la pista del medidor) | `#8FB3E8` | `#2F5EA6` | ídem | **nuevo** — `--dato-tenue` |
| **acción principal** | `#FFD028` sobre tinta (claro: relleno `--signal`, texto `--signal-ink` `#8A6100`) | `#FFD028` | **un solo botón por pantalla** | `--signal` / `--y-500` |

Para escribir texto de estado se usan siempre las variantes `-txt`
(`--libre-txt` `#006B4C`, `--entra-txt` `#8A5A06`, `--ocupado-txt` `#B32720`),
nunca el relleno: la regla ya está escrita en `tema.css` y esta propuesta no la
toca.

### 4.2 · Por qué NO hay un par divergente de dos tonos

Los movimientos (entradas/salidas) y el spread (por encima/por debajo del cero)
piden, según `choosing-a-form.md`, un par divergente cálido↔frío. **No queda
lugar en el espacio de color**: verde, ámbar y rojo ya están tomados por los
estados del espacio, y el amarillo por la acción. Probé el candidato más obvio
—azul `#2E63C8` ↔ magenta `#C2487F`, que **pasa todos los gates entre ellos
dos**— contra la terna de estados, y colisiona:

```
$ node validate_palette.js "#00805A,#CE8A0A,#D8342E,#2E63C8,#C2487F" --mode light --surface "#FFFFFF" --pairs all
  [FAIL] Normal-vision floor    worst all-pairs #C2487F↔#D8342E ΔE 10.7 (normal) — below 15
$ node validate_palette.js "#00BE86,#F5A524,#F4544E,#4C89E8,#D75C93" --mode dark --surface "#0B1116" --pairs all
  [FAIL] Normal-vision floor    worst all-pairs #D75C93↔#F4544E ΔE 10.4 (normal) — below 15
```

Un magenta a ΔE 10,7 del rojo `ocupado` **se lee como «ocupado»** en la pantalla
de al lado. Y `anti-patterns.md` prohíbe explícitamente usar un color de estado
para una serie que no es estado — que es lo que pasaría al revés si reusara el
rojo para «salidas».

**Entonces la polaridad no la lleva el tono, la lleva la posición.** Entradas
arriba del cero, salidas abajo, la línea del cero fuerte, el signo escrito en la
etiqueta (`+$ 14.200.000` / `−$ 9.600.000`), y las dos ramas en **la misma rampa
de la tinta de dato** (arriba el paso fuerte, abajo el tenue). Validado como
rampa ordinal de dos pasos, en los dos modos:

```
$ node validate_palette.js "#8FB3E8,#2E63C8" --mode light --surface "#FFFFFF" --ordinal
  [PASS] Lightness monotone · [PASS] Adjacent ΔL · [PASS] Light-end contrast 2.15:1 · [PASS] Single hue (4°)
  → ALL CHECKS PASS                                                          exit=0
$ node validate_palette.js "#2F5EA6,#4C89E8" --mode dark --surface "#0B1116" --ordinal
  [PASS] Lightness monotone · [PASS] Adjacent ΔL · [PASS] Light-end contrast 2.96:1 · [PASS] Single hue (0°)
  → ALL CHECKS PASS                                                          exit=0
```

Perder un tono cuesta menos que ganar una ambigüedad. La dirección arriba/abajo
sobre una línea de cero es un canal más fuerte que el tono, y no se puede
confundir con nada.

### 4.3 · El validador, corrida completa

Comando y salida literal. Superficies: tarjeta clara `#FFFFFF`, papel claro
`#EFF1ED`, panel oscuro `#0B1116`, sala oscura `#04070A`.

**(a) Los tres estados del espacio — modo claro, sobre la tarjeta.**

```
$ node validate_palette.js "#00805A,#CE8A0A,#D8342E" --mode light --surface "#FFFFFF" --pairs all

Palette (light, surface #FFFFFF, categorical): 3 slots
  [PASS] Lightness band         all 3 inside L 0.43–0.77
  [PASS] Chroma floor           all 3 >= 0.1
  [PASS] CVD separation         worst all-pairs #D8342E↔#00805A ΔE 9.2 (protan) · tritan 14.4
  [PASS] Normal-vision floor    worst all-pairs #D8342E↔#CE8A0A ΔE 17.9 (normal)
  [WARN] Contrast vs surface    below 3:1 — relief required (visible labels or table view): [["#CE8A0A",2.89]]

  → ALL CHECKS PASS
exit=0
```

**(b) Los tres estados — modo claro, sobre el papel `#EFF1ED`.**

```
$ node validate_palette.js "#00805A,#CE8A0A,#D8342E" --mode light --surface "#EFF1ED" --pairs all

  [PASS] Lightness band · [PASS] Chroma floor
  [PASS] CVD separation         worst all-pairs #D8342E↔#00805A ΔE 9.2 (protan) · tritan 14.4
  [PASS] Normal-vision floor    worst all-pairs #D8342E↔#CE8A0A ΔE 17.9 (normal)
  [WARN] Contrast vs surface    below 3:1 — relief required: [["#CE8A0A",2.54]]

  → ALL CHECKS PASS
exit=0
```

El `WARN` del ámbar está **cubierto de antemano**: cada estado va siempre con su
palabra y cada relleno lleva su `-borde` (`--entra-borde` `#ECD3A2`). Es la regla
que ya está escrita en `tema.css` y este documento no la afloja.

**(c) Los tres estados — modo oscuro, sobre el panel. Reprueba, y está bien.**

```
$ node validate_palette.js "#00BE86,#F5A524,#F4544E" --mode dark --surface "#0B1116" --pairs all

Palette (dark, surface #0B1116, categorical): 3 slots
  [FAIL] Lightness band         outside band: [["#00BE86",0.709],["#F5A524",0.782]]
  [PASS] Chroma floor           all 3 >= 0.1
  [WARN] CVD separation         worst all-pairs #F4544E↔#00BE86 ΔE 7.5 (deutan) · tritan 16.5
  [PASS] Normal-vision floor    worst all-pairs #F4544E↔#F5A524 ΔE 18.7 (normal)
  [PASS] Contrast vs surface    all 3 >= 3:1

  → FAILED — fix the marked checks
exit=1
```

**Desviación conocida y documentada, no un hallazgo nuevo.** `tema.css`
(líneas 55-72) explica por qué y qué la compensa: bajar la claridad para entrar
en la banda hunde el par ámbar↔rojo a ΔE 3,5 en deuteranopía, por debajo del
piso duro de 15. Las dos compensaciones son regla: **(1)** cada estado va con su
palabra; **(2)** todo relleno de estado lleva su `-borde`. No propongo cambiar
los hex: propongo respetar las dos compensaciones sin excepción.

**(d) La tinta de dato no impersona ningún estado.** Ésta es la corrida que
justifica el color nuevo: se agrega `#2E63C8` a la terna y **no empeora ni un
solo par**.

```
$ node validate_palette.js "#00805A,#CE8A0A,#D8342E,#2E63C8" --mode light --surface "#FFFFFF" --pairs all

Palette (light, surface #FFFFFF, categorical): 4 slots
  [PASS] Lightness band         all 4 inside L 0.43–0.77
  [PASS] Chroma floor           all 4 >= 0.1
  [PASS] CVD separation         worst all-pairs #D8342E↔#00805A ΔE 9.2 (protan) · tritan 4.3
  [PASS] Normal-vision floor    worst all-pairs #D8342E↔#CE8A0A ΔE 17.9 (normal)
  [WARN] Contrast vs surface    below 3:1 — relief required: [["#CE8A0A",2.89]]

  → ALL CHECKS PASS
exit=0
```

```
$ node validate_palette.js "#00BE86,#F5A524,#F4544E,#4C89E8" --mode dark --surface "#0B1116" --pairs all

  [FAIL] Lightness band         outside band: [["#00BE86",0.709],["#F5A524",0.782]]
  [PASS] Chroma floor           all 4 >= 0.1
  [WARN] CVD separation         worst all-pairs #F4544E↔#00BE86 ΔE 7.5 (deutan) · tritan 9.2
  [PASS] Normal-vision floor    worst all-pairs #F4544E↔#F5A524 ΔE 18.7 (normal)
  [PASS] Contrast vs surface    all 4 >= 3:1

  → FAILED — fix the marked checks
exit=1
```

Los dos peores pares siguen siendo exactamente los mismos que sin el azul
(rojo↔verde y rojo↔ámbar), con los mismos ΔE. El `exit=1` del modo oscuro es la
desviación heredada de (c), **no** algo que introduzca la tinta de dato.

**(e) La tinta de dato sola, en las cuatro superficies.**

```
$ node validate_palette.js "#2E63C8" --mode light --surface "#FFFFFF"
  [PASS] Lightness band (L 0.43–0.77) · [PASS] Chroma floor · [PASS] Contrast vs surface >= 3:1   → ALL CHECKS PASS  exit=0
$ node validate_palette.js "#2E63C8" --mode light --surface "#EFF1ED"
  [PASS] Lightness band · [PASS] Chroma floor · [PASS] Contrast vs surface >= 3:1                 → ALL CHECKS PASS  exit=0
$ node validate_palette.js "#4C89E8" --mode dark  --surface "#0B1116"
  [PASS] Lightness band (L 0.48–0.67) · [PASS] Chroma floor · [PASS] Contrast vs surface >= 3:1   → ALL CHECKS PASS  exit=0
$ node validate_palette.js "#4C89E8" --mode dark  --surface "#04070A"
  [PASS] Lightness band (L 0.48–0.67) · [PASS] Chroma floor · [PASS] Contrast vs surface >= 3:1   → ALL CHECKS PASS  exit=0
```

**(f) El gris de «no se alquila / sin dato» — reprueba a propósito.**

```
$ node validate_palette.js "#AAB3BE" --mode light --surface "#FFFFFF"
  [PASS] Lightness band
  [FAIL] Chroma floor           below floor (reads gray): [["#AAB3BE",0.019]]
  [WARN] Contrast vs surface    below 3:1: [["#AAB3BE",2.12]]
  → FAILED
exit=1
```

**Se lee gris, que es exactamente su trabajo.** No entra en la corrida
categórica y no debe entrar: se verifica con contraste WCAG contra la
superficie, no con el gate de croma. Mismo razonamiento que ya está escrito en
`tema.css` para `--resto`.

### 4.4 · Marcas, según `marks-and-anatomy.md`

- Barras ≤ **24 px** de grosor, extremo del dato redondeado 4 px, base recta.
  Nunca llenan la banda: el aire que sobra es parte del dibujo.
- Líneas **2 px**, uniones y extremos redondeados. Marcador de extremo ≥ 8 px.
- Rellenos de área al **10 %** del tono. Nunca un bloque saturado grande.
- Rejilla y ejes: **1 px sólido**, un paso del color de la superficie
  (`--line-soft` / `--line`). **Nunca punteados.**
- **2 px de aire del color de la superficie** entre marcas que se tocan, y
  **anillo de 2 px** del color de la superficie en los puntos que se cruzan.
  Nunca un borde alrededor de la marca para separarla.
- La cifra grande usa `--f-mono` con `tabular-nums` **sólo en columnas**; suelta
  (la cifra grande de una tarjeta) va con figuras proporcionales.
- **El texto nunca lleva el color del dato.** La identidad la da la marca de
  color al lado (un punto, un trazo corto), y el texto va con `--ink-1/2/3`.
- Objetivo de hover ≥ **24 px**, incluyendo el aire de 2 px. En la tabla de 254
  espacios, la fila entera es el objetivo.

---

## 5. Las seis trampas de estos datos

Cada una es una lectura equivocada que estos números invitan a hacer, con la
frase que la desarma. Van todas escritas en la pantalla, no en un pie de página.

1. **«La ocupación de la cartera cayó de 63,8 % a 47,4 %.»**
   No cayó: el denominador creció 142 espacios en tres meses y después perdió
   74. → *Se dibujan los conteos, no el porcentaje* (§3.2).
2. **«La cartera perdió $ 45,3 millones en septiembre.»**
   No perdió: Guadual no se dejó leer. A igual composición ganó $ 7.007.500
   (+1,9 %). → *El delta va contra el mes comparable, y el crudo se muestra
   tachado al lado.*
3. **«Mercamío tiene $ 386 millones en juego.»**
   No: son $ 172.872.500 de oportunidad nueva, $ 19.742.500 en riesgo y
   $ 110.567.500 expuestos a un proveedor. La suma cuenta dos veces (§2 cap. 3).
4. **«Superandes cobra 17,4 % por debajo: hay $ 23,1 millones ahí.»**
   Aproximado: el spread se calcula sobre 72 de 74 contratos y **la tarifa nunca
   sale de la base del cliente**. Se rotula «aprox.» o no se pone.
5. **«La cohorte 2025-02 tiene 0 % de retención.»**
   Son 2 clientes. El conteo manda; el porcentaje va en gris con su `n`.
6. **«Ofrezcámosle las 113 góndolas a Volcán, que es el que más compra.»**
   Volcán ya tiene el 41,4 %. Las dos recomendaciones se muestran juntas o el
   asesor va a hacer exactamente lo que el sistema le acaba de desaconsejar.

---

## 6. Lo que encontré leyendo el backend (para el equipo, no para el diseño)

1. **`valor_en_juego` y el conteo por prioridad NO existen en el endpoint.** El
   brief §4 los da por hechos. `armar_detalle` devuelve `recomendaciones[]` y
   nada más. Hoy los calcula el frontend; van en `_derivado_frontend` del JSON,
   marcados. **Y la suma cruda no debe publicarse** (§2 cap. 3).
2. **`precio_bajo_tarifa` no compara contra el benchmark.** El brief §4 dice
   «por tipo, contra el benchmark»; `_rec_precio_bajo` compara contra el
   **promedio del propio cliente para ese tipo** — dispersión interna, no
   posición de mercado. Por eso su valor es chico ($ 5.915.000 en seis tipos).
   La comparación contra el benchmark existe, pero es un derivado del frontend
   (`resumen_por_tipo[].canon_promedio` vs `benchmark_plataforma[tipo]`) y da
   otra historia: −15,5 % en cross, −11,6 % en nevera, −9,1 % en góndola. **Son
   dos hallazgos distintos y hay que nombrarlos distinto**, o el asesor va a
   creer que ya cubrió el segundo cuando leyó el primero.
3. **La ocupación de la cartera no está en el detalle del cliente.** El «contra
   la cartera» del capítulo 1 sale de `/metricas`, no de
   `/clientes/{slug}/detalle`. La sesión necesita las dos llamadas, y **el
   informe para el cliente no puede usar ese número** (le contaría cómo les va a
   los otros supermercados).
4. **`arranque` excluye a las otras seis recomendaciones**, por construcción. Un
   diseño que muestre «7 tipos de recomendación» en una leyenda va a mostrar seis
   vacías. Son dos estados de pantalla distintos.
5. **`espacio_libre` incluye los que se liberan.** Agrupa por `estado != ocupado`,
   así que «113 góndolas libres» y «11 puntas libres» no son lo mismo: las puntas
   son 10 libres + 1 que se libera el 18-sep. **La palabra correcta es «en
   oferta», no «libres»**, y la fecha del que se libera tiene que verse.
6. **La cartera no publica el total de contratos por cliente.** Sin denominador,
   `top_proveedores` no da participación. En la cartera son cinco conteos; el
   porcentaje sólo existe en el detalle.
7. **El texto de `explicacion` no es para imprimir.** Trae los 113 códigos en un
   párrafo — es literalmente el ejemplo que el dueño puso como lo que no puede
   pasar. Todos los campos que hacen falta están en `datos`.
