# Notas del manual del Trabajador (rol `worker`)

Insumo para la hoja de bolsillo, los ejercicios, la evaluación y la guía del capacitador.
Todo lo de acá se verificó en la copia de prueba (siembra de `herramientas/sembrar.py`,
computador 1280 × 800), el 20/11/2026, y se volvió a verificar contra la app de después del PR #121 el mismo día
y contra la de después de los PRs #122 y #123 (capturas rehechas el 20/11/2026, hora de Colombia).

## Todos los días

1. Entrar con **tu** cuenta (la de la invitación): portada › «Ya tengo cuenta».
2. Mirar el **Inicio**: las cuatro tarjetas y «Pendientes de hoy».
3. Abrir **Montajes** › filtro «Sin montar».
4. Por cada exhibición armada: «Registrar montaje» › «Lo monté» › foto › «Confirmar» › esperar «Listo: <espacio> quedó reportado como montado.» arriba de la lista.
5. Si no se pudo: «No pude» › motivo › nota › «Confirmar».
6. Revisar si hay «Verificado: no coincide» y corregirlo.
7. Cerrar sesión si el computador es compartido.

## Nunca hagas

- Registrar «Lo monté» sin haberlo armado, o con una foto de otro día o de otro espacio.
- Entrar con la cuenta de otra persona o prestar la tuya.
- Usar «Crear mi cuenta» o «Registrar un supermercado nuevo» (crea otro supermercado vacío).
- Sacar la exhibición de otro proveedor de un espacio ocupado: se reporta «No pude» › «El espacio está ocupado por otra cosa».
- Borrar los datos del navegador o cambiar de equipo con un reporte «Sin conexión» guardado.
- Pedirle al proveedor o a la tienda datos de plata: el trabajador no maneja montos.

## Errores típicos y cómo corregirlos

| Error | Cómo se ve | Cómo se corrige |
|---|---|---|
| Confirmar sin foto | En rojo: «Falta la foto. Es la prueba de que la exhibición quedó armada.» | Elegir la foto y volver a «Confirmar» (no se mandó nada). |
| Foto equivocada antes de confirmar | La foto se ve en el formulario | La × sobre la foto o «Cambiar por otra de la galería». |
| Foto equivocada después de confirmar | El espacio ya está «Montado, sin verificar» | «Ver registro y foto» › «Registrar de nuevo». Vale el último; el anterior no se borra. |
| Registró el espacio equivocado | Aparece «Montado, sin verificar» en un espacio que no armó | No se puede borrar desde la cuenta del trabajador: avisar a quien administra, con el código. |
| Entró con otra cuenta (la personal) | «La cuenta … no tiene acceso a ningún supermercado.» | «Ingresar con otra cuenta» y entrar con la de la invitación. |
| Cambió de sede sin querer | Ve espacios de otra tienda | Elegir la sede propia en el selector de arriba a la izquierda. |
| Cerró el formulario antes del «Listo» | El espacio sigue «Sin montar» | Hasta ver «Listo: … quedó reportado …» no llegó. Registrarlo de nuevo. |
| Quiso avisar «Quedó montada» de un planograma | «Ver la guía» sólo deja leer e imprimir | Lo avisa quien tiene el enlace de la guía (correo); si no, avisar a quien administra. |
| Se cortó internet al confirmar | «Sin conexión: tu reporte quedó guardado en este equipo.»; la barra pasa sola a «Sin conexión» | Esperar o «Reintentar ahora». Si cerró la página, reabrir el espacio en el mismo equipo («Registrar montaje», o «Ver registro» › «Registrar el montaje de nuevo»): arriba de todo, «Tenés un reporte sin mandar» › «Mandar ahora» (captura `39b-reporte-sin-mandar`). |

## Ejercicios sugeridos

Correr `levantar.sh` antes (siembra nueva). Datos de la siembra; la fecha «hoy» es la del día.

1. **Montaje del día (Lo monté).** Espacio `PUN-03-EN1` (Entrepaño 1 de 6 de la punta PUN-03), Café Montaña · Café Montaña Tostado, arranca hoy. Hacer: Montajes › «Sin montar» › «Registrar montaje» › mirar «ASÍ DEBE QUEDAR» y «DÓNDE QUEDA» › «Lo monté» › foto (cualquier JPG) › «Confirmar». Resultado: arriba de la lista sale «Listo: PUN-03-EN1 quedó reportado como montado.»; desaparece de «Sin montar» (el contador baja de 5 a 4) y queda «Montado, sin verificar».
2. **No se pudo.** Espacio `GON-02-PC1` (Participación 1 · cara A), Aseo Total · Aseo Total Hogar (no tiene planometría: no aparece «ASÍ DEBE QUEDAR»). Hacer: «Registrar montaje» › «No pude» › «No llegó el producto» › nota «El producto llega el lunes» › «Confirmar». Resultado: «Listo: GON-02-PC1 quedó reportado como no montado, con el motivo.» y «No realizado» con «No llegó el producto» debajo. Después: «Ver registro» › «Registrar el montaje de nuevo» y registrarlo «Lo monté».
3. **Corregir un «no coincide».** Espacio `PUN-06`, Bebidas del Valle · Agua del Valle, «Verificado: no coincide». Hacer: «Ver registro y foto», leer «Falta el cabezote con el logo arriba de la punta.», «Registrar de nuevo» con foto nueva. Resultado: vuelve a «Montado, sin verificar».
4. **Sin conexión.** Espacio `PUN-03-EN2`, Bebidas del Valle (por % de ventas; no tiene planometría). Hacer: abrir el formulario, «Lo monté», foto, desconectar el wifi, «Confirmar». Resultado: «Sin conexión: tu reporte quedó guardado en este equipo.» y la barra pasa sola a «Sin conexión»; al reconectar (o «Reintentar ahora») sale «Listo: PUN-03-EN2 quedó reportado como montado.».
5. **Consulta (Indicadores).** ¿Qué proveedores tuvo `PUN-08` y cuál se canceló? Indicadores › Historial › Espacio `PUN-08`. Resultado: 3 contratos: Limpio Hogar (Cancelado, «no llegó a correr», «Duró —»), Café Montaña y Galletas Sol (Terminado). «Exportar a Excel» baja `historial-contratos-CENTRO-<fecha>.xlsx` sin montos. Variante: ¿qué contrato vence en 30 días? Inicio › «Por vencer (30 días)» › `PUN-01`, Limpio Hogar, vence el 30/11. Otra: Buscar (Ctrl K) › `PUN-07` › Enter abre su ficha en Indicadores › Plano.

«Ver todos (6)» en la ficha de `PUN-07` sólo aparece si antes se corrió `trabajador/capturas.cjs` (agrega cuatro contratos viejos a PUN-07). Con la siembra sola, PUN-07 tiene 2 anteriores y el botón no sale (aparece desde 6).

## 10 preguntas de evaluación con respuesta

1. **¿Qué tres opciones tiene el menú del trabajador?** Inicio, Indicadores y Montajes.
2. **¿Se puede registrar «Lo monté» sin foto?** No: sale «Falta la foto. Es la prueba de que la exhibición quedó armada.» y no se manda nada.
3. **¿Qué estado queda después de registrar «Lo monté»?** «Montado, sin verificar», hasta que administración lo verifique.
4. **¿Quién verifica si la foto coincide con la planometría?** Quien administra la sede. El trabajador sólo ve el resultado.
5. **Un montaje dice «Verificado: no coincide». ¿Qué hacés?** «Ver registro y foto», leer lo que hay que arreglar, arreglarlo y «Registrar de nuevo» con foto nueva.
6. **No llegó el producto. ¿Qué reportás?** «No pude» › «No llegó el producto», con una nota. Queda «No realizado».
7. **Confirmaste y sale «Sin conexión: tu reporte quedó guardado en este equipo.». ¿Se perdió el reporte?** No: quedó guardado en ese equipo y se manda solo al volver internet (o con «Reintentar ahora»). No hay que borrar los datos del navegador ni cambiar de equipo.
8. **¿Dónde ves qué proveedores tuvo un espacio?** En la ficha del espacio («Contratos anteriores», «Ver todos (N)») o en Indicadores › Historial.
9. **¿Podés renovar un contrato que vence o ver cuánto paga el proveedor?** No. Eso es de administración: avisale a quien administra la sede.
10. **Te llegó la invitación y entraste con tu correo personal: dice que no tenés acceso. ¿Qué hacés?** «Ingresar con otra cuenta» y entrar con la cuenta a la que llegó la invitación (vence a los 7 días).

## Qué demostrar en vivo

- La portada › «Ya tengo cuenta» y la hoja de ingreso (en producción, con una cuenta de prueba real).
- La barra: sede, Buscar (Ctrl K) con «historial» y con «PUN-07» (abre la ficha), el «?», el estado «Sincronizado», Pendientes y el menú de la cuenta («Tema claro u oscuro»).
- Inicio: tocar «Ver montajes» y «Ver cuáles son», y volver con «Volver al Inicio». Mostrar el «Avisale a quien administra» de «Por vencer».
- Montajes completo: filtros, «Registrar montaje», la planometría en grande, «Lo monté» sin foto (el error) y con foto; el «Listo: … quedó reportado como montado.» y cómo el espacio pasa a «Montado, sin verificar». «Ver la guía» de un planograma.
- «No pude» con motivo, y «Registrar el montaje de nuevo» desde «Ver registro».
- «Ver registro y foto» de uno «no coincide».
- Desconectar el wifi al confirmar («Sin conexión», también en la barra) y reconectar.
- Indicadores › Contratos › tocar una fila › ficha; Historial con filtro y «Exportar a Excel».

## No se pudo capturar

- **Completar el ingreso (Google / correo y contraseña).** La copia de prueba no tiene Firebase configurado («El ingreso no está configurado en este servidor…»). Para `02-hoja-ingreso` y `03-invitacion`, el guion le hace creer a la pantalla que el ingreso está configurado (reescribe al vuelo el chunk `Login-*.js` del navegador, sin tocar el código; la letra con que se exporta la bandera cambia con cada build, así que el guion la busca por el nombre local `he`): se ve el formulario real, pero no funciona. No capturado: completar el ingreso, «Crear una cuenta», «Olvidé mi contraseña», el aviso «no tiene acceso a ningún supermercado» (el texto se verificó en `pages/Login.tsx`).
- **El correo de invitación.** La invitación se crea de verdad (la pantalla «Invitación a Galerías», ya en voseo, sí se capturó), pero ese correo sale por `send_mail_to_bg` y no queda en la cola `correos_pendientes` (verificado otra vez después de #121), así que `correoReal()` no lo encuentra.
- **Sesión vencida.** Con un token inválido la app vuelve al ingreso; en la copia muestra el aviso de «no configurado», así que no se capturó.
- **Cambiar de sede.** La siembra tiene una sola sede (CENTRO): el selector no tiene otra opción.
- **Pestaña «Hoy» de Pendientes con algo adentro.** Para el trabajador sale vacía con la siembra (la reserva que caduca hoy no le aparece).
- ~~**«Tenés un reporte sin mandar» / «Mandar ahora» / «Descartar»** desde la cuenta.~~ Ahora se captura (`39b-reporte-sin-mandar`, manual 5.3 paso 4): `GON-02-PC1` › «Registrar el montaje de nuevo» › «Lo monté» + foto › sin conexión › «Confirmar» › cerrar la página › volver a abrirlo. El guion después toca «Descartar» (vuelve el formulario vacío) para no cambiar lo que muestran las capturas de Indicadores.
- **Tomar la foto con la cámara.** En computador «Tomar foto» abre el selector de archivos; la captura carga la foto con el selector.
- ~~Montajes de planogramas.~~ Ahora se capturan: `28-planograma` («Ver la guía») y `29-guia` (la guía de sólo lectura).

## Posibles errores del sistema

1. ~~**«Registrar montaje» rompía la pantalla de Montajes.**~~ **Arreglado en #121** (`MountView.tsx`): el formulario abre bien desde Montajes, para trabajador y administración.
2. ~~**El trabajador no ve los montajes de planogramas.**~~ **Arreglado en #121**: Montajes le lista las caras GON-12/GON-13 con «Ver la guía» (sólo lectura: no tiene «¿Cómo quedó?»; avisar que quedó montada sigue siendo del enlace de la guía).
3. ~~**Buscar promete espacios que no encuentra.**~~ **Arreglado en #121**: «PUN-07» da «ESPACIOS · PUN-07 · disponible → Ver la ficha» y Enter abre la ficha en Indicadores › Plano.
4. ~~**Sin mensaje de confirmación al registrar desde la app.**~~ **Arreglado en #121**: arriba de la lista sale «Listo: PUN-03-EN1 quedó reportado como montado.» / «Listo: GON-02-PC1 quedó reportado como no montado, con el motivo.».
5. ~~**«Sin señal: … en este teléfono.»** en el computador, y la barra seguía en «Sincronizado».~~ **Arreglado en #121**: «Sin conexión: tu reporte quedó guardado en este equipo.» y la barra pasa sola a «Sin conexión».
6. ~~**Contadores de montajes — arreglado en #121 para administración, NO para el trabajador.**~~ **Arreglado en #123** (verificado con la siembra nueva: Inicio «Montajes por resolver 7 · 5 sin montar · 2 no realizados» = Montajes «Sin montar 5», «No realizado 2»; el manual 3.1 ya no tiene la caja de la diferencia). Antes, con la siembra nueva, el Inicio del trabajador decía «Montajes por resolver 4 · 3 sin montar · 1 no realizado», mientras Montajes dice «5 por montar», «Sin montar 5», «No realizado 2». La diferencia son los 3 planogramas (GON-12 A y B sin montar, GON-13 A no se pudo): el Inicio los cuenta con `usePlanogramasPorRevisar`, que llama a `GET /api/planogramas/supervision` **sin** `todas=1`, y esa lista («Para revisar») le sigue llegando vacía al trabajador. Con la cuenta de administración el Inicio dice «7 · 5 sin montar · 2 no realizados», igual que Montajes. El resto ya coincide: Indicadores › Contratos «Sin montar 2» = las dos filas con Montaje «Sin montar»; el Mapa cuenta caras («Caras con montaje pendiente»).
7. ~~**«Ver los 1».**~~ **Arreglado en #121**: «Ver el pendiente» en el Inicio, «Ver 1 en Pendientes ›» en el Mapa y en Análisis.
8. ~~**El número rojo de «Pendientes» desaparece en Montajes.**~~ **Arreglado en #121**: en `/montajes` dice «Pendientes 1».
9. ~~**Análisis › «Capacidad por vender»: caras con participaciones dicen «Sin contrato hoy.»**~~ **Arreglado en #121**: GON-01·A, GON-03·A y NEV-01 dicen sus proveedores y «Vendida en parte: queda lugar.»; ya no trae consejos de negociación.
10. ~~**Ficha de una punta vendida por entrepaños decía «Disponible para vender».**~~ **Arreglado en #121**: PUN-02 dice «Vendido en parte · De 5 entrepaños, 2 con contrato: quedan 3 libres para vender. La cara entera no tiene contrato.» (captura `45b-ficha-en-parte`).
11. ~~**Historial con la sede adelante y «Duró 3 meses» de un cancelado que no corrió.**~~ **Arreglado en #121**: «PUN-08» y «Duró —». El filtro desde la ficha dice «Espacio: PUN-07».
12. ~~**La invitación habla de «usted».**~~ **Arreglado en #121**: «Rol: trabajador. Entrá con la cuenta …».
13. ~~**«Tema claro u oscuro» no es un botón.**~~ **Arreglado en #121**: toda la fila es el control.
14. **«Tu nombre» en el formulario de la app.** Sigue apareciendo en la copia de prueba (la sesión de prueba no tiene correo); con una cuenta real no lo debería pedir. Confirmar en producción.
15. **Indicadores abre la última pestaña usada** (sigue pasando, verificado: después de Historial, volver a Indicadores abre Historial). Puede desorientar; el manual lo dice.
16. ~~**«Reclamale el material al proveedor…» se le dice al trabajador.**~~ **Arreglado en #123**: «Avisale a quien administra la sede que falta el material del proveedor y, cuando llegue, registrá el montaje de nuevo.» («… falta el producto …» con «No llegó el producto»); manual 5.2 y captura `35-no-realizado` rehechos. Antes decía «Reclamale el material al proveedor y, cuando llegue, registrá el montaje de nuevo.» también con la cuenta del trabajador.

## Pantallas fuera de alcance que aparecen

- ~~Indicadores › Mapa de oportunidades y Análisis: botones «Gestionar renovación», «Renovar»…~~ **Arreglado en #121**: con la cuenta del trabajador dicen lo que hacen («Ver la ficha», «Ver el plano», «Ver los contratos por vencer») y donde administración actúa dice «Avisale a quien administra».
- ~~Inicio: «Por vencer (30 días) · Requieren acción».~~ **Arreglado en #121**: dice «Avisale a quien administra».
- ~~**Ayuda (?) del Inicio:** definía «Canon».~~ **Arreglado en #123**: define Ocupación, Reserva provisional y Sede (captura `07-ayuda`, manual 2.2). **Sigue** la frase de arriba: «Lo de hoy en la sede: lo que vence, lo que se monta, las reservas que caducan y, para administración, las cifras del mes.» (verificado). Menor: no da cifras, sólo las nombra.
- **Buscar (Ctrl K) con la cuenta del trabajador — sigue nombrando el canon** (verificado): «canon» o «indicadores» dan «Resumen de Indicadores · Indicadores · Ocupación, canon y montajes contra la meta.» «tarifa» ya no encuentra nada. Menor, pero es el mismo concepto que se sacó de la ayuda.
- **Ayuda · Indicadores con la cuenta del trabajador** (verificado): la descripción nueva está («Cómo va la sede contra su meta: ocupación, lo que vence y los montajes. Cada cifra tiene su «?» con la fórmula.») y los términos no hablan de plata, pero el renglón siguiente dice «Las pestañas abren el plano, la tabla, quién paga, todas las sedes, el detalle y el diccionario.»: «quién paga» y «todas las sedes» no son pestañas que el trabajador tenga (las suyas: Mapa de oportunidades, Análisis, Plano, Contratos, Historial, Diccionario). El manual no cita esa ayuda.
- **El reporte sin mandar no se ve en la lista** (verificado, cosmético): con un reporte guardado en el equipo, la fila de Montajes sigue diciendo «Sin montar» / «No realizado» sin ninguna marca; «Tenés un reporte sin mandar» aparece recién al abrir el formulario. El manual (5.3) dice cómo llegar.
- **Indicadores › Mapa:** la tarjeta «Ingreso contratado · 13 caras» aparece al pasar el mouse por un indicador (caras, sin plata).
- **Pendientes › «Corregir»:** diferencias entre la base y el plano; las resuelve administración.
- **Portada pública:** el plano de ejemplo muestra precios inventados («$ 1.150.000 al mes»). Es la portada, no la tienda, pero conviene aclararlo (el manual lo dice en 1.2).
- No aparecen montos en ninguna pantalla del trabajador; el CSV de Contratos (`contratos-CENTRO.csv`: Espacio, Proveedor, Marca, Estado, Desde, Hasta) y el Excel del Historial (Espacio, Proveedor, Marca, Desde, Hasta, Meses, Estado, Detalle) no traen plata (no se volvieron a bajar en esta pasada).
