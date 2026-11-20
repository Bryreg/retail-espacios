# Notas del manual del Trabajador (rol `worker`)

Insumo para la hoja de bolsillo, los ejercicios, la evaluación y la guía del capacitador.
Todo lo de acá se verificó en la copia de prueba (siembra de `herramientas/sembrar.py`,
computador 1280 × 800), el 20/11/2026.

## Todos los días

1. Entrar con **tu** cuenta (la de la invitación): portada › «Ya tengo cuenta».
2. Mirar el **Inicio**: las cuatro tarjetas y «Pendientes de hoy».
3. Abrir **Montajes** › filtro «Sin montar».
4. Por cada exhibición armada: «Registrar montaje» › «Lo monté» › foto › «Confirmar».
5. Si no se pudo: «No pude» › motivo › nota › «Confirmar».
6. Revisar si hay «Verificado: no coincide» y corregirlo.
7. Cerrar sesión si el computador es compartido.

## Nunca hagas

- Registrar «Lo monté» sin haberlo armado, o con una foto de otro día o de otro espacio.
- Entrar con la cuenta de otra persona o prestar la tuya.
- Usar «Crear mi cuenta» o «Registrar un supermercado nuevo» (crea otro supermercado vacío).
- Sacar la exhibición de otro proveedor de un espacio ocupado: se reporta «No pude» › «El espacio está ocupado por otra cosa».
- Borrar los datos del navegador o cambiar de equipo con un reporte «Sin señal» guardado.
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
| Buscó un código en «Buscar» | «No encontré nada con «PUN-07».» | Indicadores › Contratos › «Filtrar». |
| Quiso cambiar a tema oscuro tocando el texto | No pasa nada | Tocar la luna, a la derecha de «Tema claro u oscuro». |
| Se cortó internet al confirmar | «Sin señal: tu reporte quedó guardado en este teléfono.» | Esperar o «Reintentar ahora». Si cerró la página, reabrir el espacio: «Tenés un reporte sin mandar» › «Mandar ahora». |

## Ejercicios sugeridos

Correr `levantar.sh` antes (siembra nueva). Datos de la siembra; la fecha «hoy» es la del día.

1. **Montaje del día (Lo monté).** Espacio `PUN-03-EN1` (Entrepaño 1 de 6 de la punta PUN-03), Café Montaña · Café Montaña Tostado, arranca hoy. Hacer: Montajes › «Sin montar» › «Registrar montaje» › mirar «ASÍ DEBE QUEDAR» y «DÓNDE QUEDA» › «Lo monté» › foto (cualquier JPG) › «Confirmar». Resultado: desaparece de «Sin montar» y queda «Montado, sin verificar» (el contador de ese filtro sube de 2 a 3).
2. **No se pudo.** Espacio `GON-02-PC1` (Participación 1 · cara A), Aseo Total · Aseo Total Hogar (no tiene planometría: no aparece «ASÍ DEBE QUEDAR»). Hacer: «Registrar montaje» › «No pude» › «No llegó el producto» › nota «El producto llega el lunes» › «Confirmar». Resultado: «No realizado» con «No llegó el producto» debajo. Después: «Ver registro» › «Registrar el montaje de nuevo» y registrarlo «Lo monté».
3. **Corregir un «no coincide».** Espacio `PUN-06`, Bebidas del Valle · Agua del Valle, «Verificado: no coincide». Hacer: «Ver registro y foto», leer «Falta el cabezote con el logo arriba de la punta.», «Registrar de nuevo» con foto nueva. Resultado: vuelve a «Montado, sin verificar».
4. **Sin señal.** Espacio `PUN-03-EN2`, Bebidas del Valle (por % de ventas; no tiene planometría). Hacer: abrir el formulario, «Lo monté», foto, desconectar el wifi, «Confirmar». Resultado: «Sin señal: tu reporte quedó guardado en este teléfono.»; al reconectar (o «Reintentar ahora») queda «Montado, sin verificar». Arriba, tocando el estado, se ve «Sin conexión».
5. **Consulta (Indicadores).** ¿Qué proveedores tuvo `PUN-08` y cuál se canceló? Indicadores › Historial › Espacio `PUN-08`. Resultado: 3 contratos: Limpio Hogar (Cancelado, «no llegó a correr»), Café Montaña y Galletas Sol (Terminado). «Exportar a Excel» baja `historial-contratos-CENTRO-<fecha>.xlsx` sin montos. Variante: ¿qué contrato vence en 30 días? Inicio › «Por vencer (30 días)» › `PUN-01`, Limpio Hogar, vence el 30/11.

«Ver todos (6)» en la ficha de `PUN-07` sólo aparece si antes se corrió `trabajador/capturas.cjs` (agrega cuatro contratos viejos a PUN-07). Con la siembra sola, PUN-07 tiene 2 anteriores y el botón no sale (aparece desde 6).

## 10 preguntas de evaluación con respuesta

1. **¿Qué tres opciones tiene el menú del trabajador?** Inicio, Indicadores y Montajes.
2. **¿Se puede registrar «Lo monté» sin foto?** No: sale «Falta la foto. Es la prueba de que la exhibición quedó armada.» y no se manda nada.
3. **¿Qué estado queda después de registrar «Lo monté»?** «Montado, sin verificar», hasta que administración lo verifique.
4. **¿Quién verifica si la foto coincide con la planometría?** Quien administra la sede. El trabajador sólo ve el resultado.
5. **Un montaje dice «Verificado: no coincide». ¿Qué hacés?** «Ver registro y foto», leer lo que hay que arreglar, arreglarlo y «Registrar de nuevo» con foto nueva.
6. **No llegó el producto. ¿Qué reportás?** «No pude» › «No llegó el producto», con una nota. Queda «No realizado».
7. **Confirmaste y sale «Sin señal…». ¿Se perdió el reporte?** No: quedó guardado en ese equipo y se manda solo al volver internet (o con «Reintentar ahora»). No hay que borrar los datos del navegador ni cambiar de equipo.
8. **¿Dónde ves qué proveedores tuvo un espacio?** En la ficha del espacio («Contratos anteriores», «Ver todos (N)») o en Indicadores › Historial.
9. **¿Podés renovar un contrato que vence o ver cuánto paga el proveedor?** No. Eso es de administración: avisale a quien administra la sede.
10. **Te llegó la invitación y entraste con tu correo personal: dice que no tenés acceso. ¿Qué hacés?** «Ingresar con otra cuenta» y entrar con la cuenta a la que llegó la invitación (vence a los 7 días).

## Qué demostrar en vivo

- La portada › «Ya tengo cuenta» y la hoja de ingreso (en producción, con una cuenta de prueba real).
- La barra: sede, Buscar (Ctrl K) con «historial», el «?», el estado «Sincronizado», Pendientes y el menú de la cuenta (la luna).
- Inicio: tocar «Ver montajes» y «Ver cuáles son», y volver con «Volver al Inicio».
- Montajes completo: filtros, «Registrar montaje», la planometría en grande, «Lo monté» sin foto (el error) y con foto; ver cómo el espacio pasa a «Montado, sin verificar».
- «No pude» con motivo, y «Registrar el montaje de nuevo» desde «Ver registro».
- «Ver registro y foto» de uno «no coincide».
- Desconectar el wifi al confirmar (Sin señal) y reconectar.
- Indicadores › Contratos › tocar una fila › ficha; Historial con filtro y «Exportar a Excel».

## No se pudo capturar

- **Completar el ingreso (Google / correo y contraseña).** La copia de prueba no tiene Firebase configurado («El ingreso no está configurado en este servidor. Escríbanos para que lo revisemos.»). Para la captura `02-hoja-ingreso` y `03-invitacion`, el guion le hace creer a la pantalla que el ingreso está configurado (reescribe al vuelo el chunk `Login-*.js` del navegador, sin tocar el código): se ve el formulario real, pero no funciona. No capturado: completar el ingreso, «Crear una cuenta», «Olvidé mi contraseña», el aviso «no tiene acceso a ningún supermercado».
- **El correo de invitación.** La invitación se crea de verdad (`POST /api/usuarios/invitar`, la pantalla «Invitación a Galerías» con el rol y el correo enmascarado sí se capturó), pero ese correo sale por `send_mail_to_bg` y no queda en la cola `correos_pendientes`, así que `correoReal()` no lo encuentra.
- **Sesión vencida.** Con un token inválido la app vuelve al ingreso; en la copia muestra el aviso de «no configurado», así que no se capturó.
- **Cambiar de sede.** La siembra tiene una sola sede (CENTRO): el selector no tiene otra opción.
- **Pestaña «Hoy» de Pendientes con algo adentro.** Para el trabajador sale vacía con la siembra (la reserva que caduca hoy no le aparece).
- **«Tenés un reporte sin mandar» / «Mandar ahora» / «Descartar».** Verificado en la app (reporte sin señal y página cerrada), no capturado para no alargar el manual.
- **Tomar la foto con la cámara.** En computador «Tomar foto» abre el selector de archivos; la captura carga la foto con el selector.
- **Montajes de planogramas (góndolas de la casa GON-12/GON-13).** No le aparecen al trabajador (ver «Posibles errores del sistema»).

## Posibles errores del sistema

1. **«Registrar montaje» rompía la pantalla de Montajes — encontrado y arreglado durante la capacitación (pendiente de desplegar).** Montajes › «Registrar montaje» (o «Registrar el montaje de nuevo», o `/montajes?montar=CENTRO-PUN-03-EN1`) mostraba «Montajes no se pudo mostrar · Fue un error nuestro…» (React #300) para trabajador y administrador. Causa: en `pages/MountView.tsx` el `return` del formulario iba antes de un `useEffect`. Arreglado en el código y en `frontend/dist`; las capturas son del formulario ya funcionando.
2. **El trabajador no ve los montajes de planogramas.** Montajes dice «… · contratos y planogramas de CENTRO», pero `GET /api/planogramas/supervision?sede=CENTRO&todas=1` le devuelve `caras: []` al trabajador (al administrador, las 4 caras de GON-12 y GON-13). Reproducir: siembra nueva, entrar como trabajador › Montajes: no hay filas «Planograma».
3. **Buscar promete espacios que no encuentra.** El cuadro dice «Buscá una función, un espacio (PUN-07) o un término…», pero para el trabajador cualquier código da «No encontré nada con «PUN-07».» (`Buscador.tsx`: los espacios sólo se buscan si `esAdmin`).
4. **Sin mensaje de confirmación al registrar desde la app.** Después de «Confirmar» vuelve a la lista sin ningún «Listo» (por el enlace del correo sí sale «Listo, quedó reportado»). Sólo se nota porque el espacio deja de estar en «Sin montar».
5. **«Sin señal: tu reporte quedó guardado en este teléfono.»** sale igual en el computador. Y mientras el formulario dice «Sin señal», la barra sigue en «Sincronizado» hasta que se toca el estado (ahí pasa a «Sin conexión»).
6. **Contadores de montajes que no coinciden (misma siembra).** Inicio «Montajes por resolver 2»; Montajes «3 por montar» / «Sin montar 3» + «No realizado 1»; Indicadores › Mapa «Montajes pendientes 2 · 1 sin montar · 1 no realizado» y «Montajes del mes 0 de 1»; Indicadores › Contratos, filtro «Sin montar 1», aunque en la tabla «Todas» hay dos filas con Montaje «Sin montar» (PUN-03·EN1 y PUN-03·EN2). Son reglas distintas (30 días, una vez por cara, mes en curso), pero para el usuario parecen errores.
7. **«Ver los 1».** Inicio › «Pendientes de hoy · 0» con el enlace «Ver los 1»; Mapa de oportunidades: «Ver los 1 en Pendientes ›»; Análisis: «Ver las 1 en Pendientes ›».
8. **El número rojo de «Pendientes» desaparece en Montajes.** En Inicio e Indicadores dice «Pendientes 1»; en `/montajes` el botón sale sin número.
9. **Análisis › «Capacidad por vender»: caras con participaciones dicen «Sin contrato hoy.»** GON-01·A, GON-03·A y NEV-01 tienen participaciones vigentes (Lácteos Andinos, Snacks Norte, Aseo Total, Bebidas del Valle) y la fila dice «Clientes en el espacio —» y «Sin contrato hoy.».
10. **Ficha de una punta vendida por entrepaños.** PUN-02 (dos entrepaños con contrato) dice arriba «Disponible para vender · Este espacio no tiene contrato activo.»; recién abajo aclara «La cara entera no tiene contrato · 2 partes contratadas».
11. **Historial.** El espacio sale con la sede adelante («CENTRO-PUN-08») cuando en el resto de la app es «PUN-08». Un cancelado que «no llegó a correr» dice «Duró 3 meses».
12. **La invitación habla de «usted».** «Rol: trabajador. Ingrese con la cuenta …» (y los avisos de acceso) van en usted, mientras la app usa voseo.
13. **«Tema claro u oscuro» no es un botón.** Sólo la luna de la derecha cambia el tema; tocar el texto no hace nada y el menú queda abierto.
14. **«Tu nombre» en el formulario de la app.** En la copia de prueba lo pide porque la sesión de prueba no tiene correo; con una cuenta real no lo debería pedir (lo guarda el servidor). Confirmar en producción.
15. **Indicadores abre la última pestaña usada,** no «Mapa de oportunidades». Puede desorientar al volver.

## Pantallas fuera de alcance que aparecen

- **Indicadores › Mapa de oportunidades y Análisis:** botones «Gestionar renovación», «Renovar», «Gestionar renovaciones» y «Ver detalle»; para el trabajador sólo abren la ficha del espacio, pero el rótulo sugiere una acción de administración. «Capacidad por vender» trae consejos de negociación («Café Montaña renueva PUN-03·EN1 el 31 ene: incluir la ampliación en esa negociación.») y «Plano para contratar».
- **Inicio:** «Por vencer (30 días) · Requieren acción» — el trabajador no puede actuar.
- **Ayuda (?) del Inicio:** define «Canon» («Lo que paga el proveedor al mes…») y dice «para administración, las cifras del mes». El trabajador no ve montos, pero lee el concepto.
- **Diccionario:** varias fórmulas mencionan «su valor a tarifa al mes» / «lo que más paga» «para administración» (sin cifras).
- **Pendientes › «Corregir»:** diferencias entre la base y el plano; las resuelve administración.
- **Portada pública:** el plano de ejemplo muestra precios inventados («$ 1.150.000 al mes»). Es la portada, no la tienda, pero conviene aclararlo (el manual lo dice en 1.2).
- No aparecen montos en ninguna pantalla del trabajador; el CSV de Contratos (`contratos-CENTRO.csv`: Espacio, Proveedor, Marca, Estado, Desde, Hasta) y el Excel del Historial (Espacio, Proveedor, Marca, Desde, Hasta, Meses, Estado, Detalle) no traen plata.
