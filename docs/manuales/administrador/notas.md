# Notas para el capacitador · Administrador (mitad comercial)

Material de apoyo del manual del rol **Administrador** (`admin`), capítulos 1–6, 10 y 11
(los capítulos 7–9 —Plano de la sede, Planogramas y Ajustes— tienen sus propias notas).
Las capturas salen de `capturas.cjs` sobre la sede de prueba CENTRO (`herramientas/sembrar.py`):
fechas relativas a hoy, proveedores y personas inventados.

## Todos los días

1. Entrar y leer **Pendientes** (se abre solo el primer ingreso del día si hay algo para hoy).
2. Grupo **Hoy**: reservas que caducan (Confirmar / Cancelar), ventas por cargar de los contratos
   por % de las ventas, falta planometría, montajes que no se pudieron hacer.
3. Grupo **30 días**: renovar lo que vence; preparar lo que arranca (planometría, distribución).
4. **Montajes** › *Montado, sin verificar*: comparar la foto con la planometría y verificar.
5. Una mirada al **Inicio** (cuatro tarjetas) o a **Indicadores › Mapa de oportunidades**.
6. Una vez por semana: **Pendientes › Corregir** (bajo tarifa, montajes sin reporte, contratos
   que no cuadran con el plano).

## Nunca hagas

- **Cancelar un contrato** sin confirmarlo con el área comercial: no se deshace.
- Guardar un contrato de varios meses con el precio en **Total** cuando el número es mensual.
- **Conservar la mía** en un conflicto de sincronización sin hablar con la otra persona: pisa el plano del servidor.
- Cambiar las **Tarifas** de referencia por tu cuenta: cambian los indicadores y los avisos de «bajo tarifa» de todos.
- Vender ni editar mientras la barra dice **Sin conexión**.
- Cargar por planilla entrepaños, porcentajes o contratos por % de las ventas (la planilla es sólo para enteros).
- Compartir tu sesión o dejar el computador abierto: cerrá sesión en equipos compartidos.
- Reenviar el enlace del correo de montaje a otra persona que no sea quien monta.

## Errores típicos y cómo corregirlos

| Error | Cómo se nota | Cómo se corrige |
|---|---|---|
| Precio en *Total* en vez de *Al mes* | El *Total del contrato* es el de un solo mes (p. ej. $ 600.000 por 92 días). | Ficha › **Editar contrato** › *Al mes* › **Guardar cambios y reenviar**. |
| Renovación que termina un día tarde | La frase dice «del 1 dic 2026 al 1 jun 2027». | Antes de guardar, corregir el *Hasta* al último día del mes. Si ya se guardó: Editar contrato. |
| Correo del proveedor mal escrito | El proveedor dice que no le llegó nada. | Editar contrato con el correo bueno: al guardar se reenvía. |
| Contrato guardado sin planometría | Montajes dice *Sin montar · falta planometría*; quien monta no recibió nada. | Ficha › **Adjuntar la planometría**: el aviso sale solo. |
| Porcentaje vendido sin distribuir | Pendientes › *Falta distribuir*; Montajes › *falta la zona*. | **Distribuir** la cara (capítulo 7). |
| Reserva olvidada | El día que caduca, la reserva se libera sola. | Volver a reservar o vender (3.8). |
| Verificar «Coincide» sin mirar | El proveedor reclama la exhibición. | Verificar de nuevo no existe: pedir a quien monta que registre otra vez (*Registrar de nuevo*) y verificar «No coincide». |
| Espacio tomado | «"PUN-06" está tomado del … al …: ajustá las fechas.» | Cambiar fechas, otro espacio u otro entrepaño. |

## Ejercicios sugeridos (con la siembra de prueba)

Antes de cada grupo: `levantar.sh` (base nueva). Fechas: «mes 0» es el mes en curso.

1. **Vender una punta libre.** Espacio `PUN-08` (libre, con historial). Proveedor *Café Montaña*
   (`ventas@cafemontana.example`), marca *Café Montaña Tostado*, del 1 del mes que viene, **3 meses**,
   **$ 580.000 al mes**. Hacer: 3.1 → 3.3. Resultado: *Contrato guardado*, total **$ 1.740.000**,
   avisos a Comercial y al proveedor; *Qué pasa ahora* dice que el aviso de montaje espera la planometría.
2. **Renovar lo que vence.** `PUN-01` (*Limpio Hogar*, vence a fin de este mes, $ 600.000 al mes).
   Hacer: Pendientes › 30 días › **Renovar**, 6 meses. Resultado: contrato nuevo desde el 1 del mes que viene;
   el alumno tiene que notar y corregir el *Hasta* (sale un día después del fin de mes).
3. **Reserva que caduca hoy.** `PUN-09` (*Lácteos Andinos*, reserva de 3 meses que caduca hoy).
   Hacer: Pendientes › Hoy › **Confirmar**. Resultado: sale de la lista; en Inicio, *Contratos activos* suma uno
   («y 1 firmado que todavía no empieza»). Variante: **Cancelar** y ver `PUN-09` libre en Contratos.
4. **Verificar montajes.** `PUN-04` y `PUN-05` (montados, sin verificar). Hacer: Montajes › *Montado, sin
   verificar* › `PUN-04` **No coincide** con la nota «Falta el cabezote con el logo arriba de la punta.» y la
   casilla de reenviar marcada; después **Verificar el siguiente** › `PUN-05` **Coincide**. Resultado:
   «Quedó verificado: no coincide. El aviso de montaje salió de nuevo…»; los dos pasan a *Verificado*.
5. **Un porcentaje y la planometría.** Vender **25 %** de `GON-04·B` a *Snacks Norte*, 3 meses, al mes
   (tarifa $ 450.000 → $ 112.500 al mes, total $ 337.500). Después cargar la planometría de `PUN-07`
   (si se vendió en el ejercicio de la clase) o de `PUN-03-EN2` (Montajes › *falta planometría*).
   Resultado: «Salió el aviso de montaje a montaje.centro@supermercado.example.»

## 10 preguntas de evaluación (con respuesta)

1. ¿Qué tenés que elegir primero para vender un espacio? — **Las fechas** (*¿Para qué fechas?*); después el espacio en el plano.
2. En el plano de la venta, ¿qué quiere decir un espacio ámbar? — **Disponible en parte**: libre en algunas fechas, algunos entrepaños o un porcentaje.
3. Un contrato de 3 meses a $ 600.000 mensuales: ¿qué tenés que tocar en *El precio es*? — **Al mes**; el total queda en $ 1.800.000.
4. Guardaste un contrato y a quien monta no le llegó nada. ¿Por qué? — Falta la **planometría** (o la distribución, si es un porcentaje): el aviso de montaje sale cuando se carga.
5. ¿Dónde se carga la planometría? — En la **ficha del espacio** (Indicadores › Contratos › la fila), *Adjuntar la planometría*.
6. Una reserva caduca hoy y el proveedor firmó. ¿Qué hacés? — Pendientes › Hoy › **Confirmar** (o *Confirmar* en la ficha).
7. ¿Se puede deshacer *Cancelar el contrato*? — **No.** Queda en el Historial como *Cancelado*; hay que volver a venderlo.
8. Al verificar un montaje que no coincide, ¿qué tenés que escribir y qué casilla dejar marcada? — *Qué hay que corregir* y **Mandar el aviso de montaje de nuevo a quien monta**.
9. ¿Dónde buscás un contrato que terminó el año pasado y cómo lo pasás a Excel? — **Indicadores › Historial**, filtros, **Exportar a Excel**.
10. La barra dice *Sin conexión*. ¿Qué hacés? — Revisar internet, no vender ni editar, y tocar *Sin conexión* cuando vuelva hasta que diga *Sincronizado*.

## Qué demostrar en vivo

- La barra: sede, **Ctrl K** con «planilla» y «reno», el menú **Más** con el alfiler, la **?**.
- Pendientes con sus tres grupos y cómo una fila se señala en el plano de Indicadores al pasar el mouse.
- Una venta completa de punta a punta (ejercicio 1), leyendo la frase antes de guardar, y el correo que le llega al proveedor.
- La trampa *Total / Al mes*: elegir 3 meses, tocar un espacio y mostrar el total antes y después de *Al mes*.
- Entrepaños (`PUN-02`) y porcentaje (`GON-04·B`) sin guardar, para ver las diferencias.
- *Reservar hasta…* y luego Confirmar en Pendientes.
- La ficha: editar (y el diálogo de reenviar), renovar, adjuntar planometría y ver el correo de montaje.
- Montajes: la comparación lado a lado, *No coincide* con nota, *Verificar el siguiente*.
- Indicadores › Historial con el filtro *Cancelado* y *Exportar a Excel*.

## No se pudo capturar

- **El ingreso real con Google o con correo y contraseña.** La copia de prueba no tiene el ingreso configurado:
  la hoja dice «El ingreso no está configurado en este servidor. Escríbanos para que lo revisemos.» Se capturó así
  y el manual lo aclara en una caja. «Olvidé mi contraseña» y la elección de supermercado no aparecen en la copia.
- **El conflicto de sincronización** («Cambios en conflicto», *Usar la del servidor* / *Conservar la mía*): sólo pasa
  con dos personas editando el plano de la misma sede a la vez; no se provocó. Los textos del manual salen del
  código (`frontend/src/components/SyncStatus/SyncStatus.tsx`).
- **«Ver todos (N)»** de *Contratos anteriores*: aparece sólo si un espacio tiene más contratos cerrados de los que la
  ficha muestra (3). Ningún espacio de la siembra los tiene (`PUN-08` tiene exactamente 3). El guion lo captura solo
  si aparece (`74-ver-todos-historial`).
- **Correos que no llegan** (al proveedor o a quien monta): la copia nunca envía correos (los deja en la cola), así
  que no se puede mostrar el rebote. El manual da la revisión (correo bien escrito, planometría, Ajustes › Avisos).
- **El aviso con «Deshacer»** al resolver un pendiente: no se vio en las capturas (la pantalla ya había vuelto a la lista).
- **Verificar el montaje de un planograma** (*Ver la guía y revisar*): lo cubre el capítulo 8.
- **Cancelar una reserva** se muestra sólo como botón (la reserva de la siembra se confirma en 2.4).

## Posibles errores del sistema

1. **(Corregido durante la captura) «Registrar montaje» rompía Montajes.** En Montajes, *Registrar montaje* (p. ej. en
   `PUN-03-EN1` o `PUN-09`) mostraba «Montajes no se pudo mostrar» (React error #300: menos hooks que en el render
   anterior; en `pages/MountView.tsx` había un `return` del formulario antes de un `useEffect`). El coordinador
   reconstruyó `frontend/dist` con el arreglo y las capturas de 6.4 ya muestran el formulario funcionando.
2. **La renovación termina un día después.** Ficha de `PUN-01` (1 jun – 30 nov) › *Renovar con Limpio Hogar*: arma
   «del 1 dic 2026 al **1 jun 2027**» (183 días, «6,03 meses»), en vez de 31 may. Tras editar `PUN-01` hasta el 31 dic,
   la renovación sale «del 1 ene 2027 al **2 ago 2027**» (214 días, «7,07 meses»). Parece que copia la duración en días.
   Lo mismo desde Pendientes › 30 días › *Renovar*.
3. **El precio arranca en «Total» con la tarifa de UN mes.** Contratos › *3 meses* › tocar `PUN-06` o `PUN-02`: el
   precio queda en *Total* = $ 600.000 para 92 días («92 días · 3 meses · $ 600.000»). Con `GON-04·B` 25 %:
   «$ 112.500 en total» por 3 meses. Si nadie toca *Al mes*, el contrato se guarda por un mes de tarifa (sub-cobro).
4. **Texto viejo «Volver a Supervisar».** Después de *Editar contrato* › *Guardar y reenviar*, la pantalla de
   *Cambios guardados* tiene el botón «Volver a Supervisar» (el módulo hoy se llama Indicadores).
5. **La reserva dice «El contrato quedó guardado.»** Contratos › `GON-04·B` 25 % › *Reservar hasta…* › *Reservar hasta
   el …*: la pantalla *Reservado hasta el …* dice además «El contrato quedó guardado.», aunque todavía no es un contrato.
6. **La ficha de una reserva no dibuja la reserva.** Indicadores › Contratos › `PUN-09` (reservado, 1 dic – 28 feb):
   «Los próximos 12 meses · **Disponible hoy**» con la barra entera libre; no se ve el tramo reservado.
7. **Una reserva recibe aviso de montaje.** En Montajes, `PUN-09` (reserva provisional, aún no confirmada) figura
   «Sin montar · aviso enviado». La siembra le cargó planometría y salió el correo de montaje para algo que todavía no
   es un contrato. A confirmar si es lo buscado.
8. **«Montaje sin reporte» ofrece «Editar contrato».** Pendientes › Corregir › *Montaje sin reporte* (`PUN-03·EN2`,
   `GON-02·A·PC1`): el único botón es *Editar contrato*, que no resuelve un montaje sin reporte (se esperaría ir a Montajes).
9. **Cuenta de entrepaños.** La siembra dibuja `PUN-02` con 4 entrepaños y `PUN-03` con 5; la app dice
   «2 de 5 entrepaños vendidos» / «Entrepaño 2 de 5» y «2 de 6», y ofrece `EN5 · arriba` en `PUN-02`. Puede que el
   campo cuente divisiones y no estantes; a confirmar con quien dibuja el plano.
10. **La foto del montaje aparece como archivo del contrato.** Ficha de `PUN-01` › *ARCHIVOS DEL CONTRATO*:
    «montaje--CENTRO-PUN-01--montaje.jpg». Puede confundir (no es un documento del contrato).
11. **El buscador se come las primeras letras.** Abrir *Buscar* y escribir enseguida «reno»: quedó «no». Al abrir
    con el mouse el campo tarda en tomar el foco; con Ctrl K o esperando un instante no pasa.
12. **Confirmar una reserva no manda ningún correo.** Pendientes › Hoy › *Reservas que caducan hoy* › `PUN-09` ›
    *Confirmar*: la reserva pasa a contrato, pero en la cola de correos no aparece ni la *Confirmación* al proveedor
    (*Lácteos Andinos*) ni el *contrato nuevo* al área comercial (sí salen al vender, al editar y al verificar
    «No coincide»). Reservar tampoco manda nada (eso parece buscado). El manual le pide al administrador avisarle al
    proveedor a mano.
