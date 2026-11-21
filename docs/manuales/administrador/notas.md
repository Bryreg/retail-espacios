# Notas para el capacitador · Administrador (mitad comercial)

Material de apoyo del manual del rol **Administrador** (`admin`), capítulos 1–6, 10 y 11
(los capítulos 7–9 —Plano de la sede, Planogramas y Ajustes— tienen sus propias notas en
`notas-plano.md`). Las capturas salen de `capturas.cjs` sobre la sede de prueba CENTRO
(`herramientas/sembrar.py`): fechas relativas a hoy, proveedores y personas inventados.

Actualizado el 20/11/2026 contra la app con los arreglos del PR #121 (*Arreglos del recorrido de
los manuales* en `docs/ESTADO.md`). El kit completo del rol: `manual.html`, `bolsillo.html`,
`practica.html` (5 casos y 10 preguntas) y `capacitador.html` (dos sesiones de 2 h, errores
típicos y respuestas).

## Todos los días

1. Entrar y leer **Pendientes** (se abre solo el primer ingreso del día si hay algo para hoy).
2. Grupo **Hoy**: reservas que caducan (Confirmar / Cancelar: la bandeja dice a quiénes salió el
   aviso), ventas por cargar de los contratos por % de las ventas, *Falta distribuir · ya corre*,
   *Falta planometría · ya corre*, montajes que no se pudieron hacer.
3. Grupo **30 días**: renovar lo que vence (copia los meses); preparar lo que arranca.
4. **Montajes** › *Montado, sin verificar*: comparar la foto con la planometría y verificar.
5. Una mirada al **Inicio** (cuatro tarjetas) o a **Indicadores › Mapa de oportunidades**.
6. Una vez por semana: **Pendientes › Corregir** (bajo tarifa, montajes sin reporte con «Ir a
   Montajes», contratos que no cuadran con el plano).

## Nunca hagas

- **Cancelar un contrato** sin confirmarlo con el área comercial: no se deshace.
- Escribir en **Al mes** un número que es el total del contrato (sale multiplicado por los meses).
- **Conservar la mía** en un conflicto de sincronización sin hablar con la otra persona.
- Cambiar las **Tarifas** de referencia por tu cuenta: cambian el precio con que arranca cada venta y
  los avisos de «bajo tarifa» de todos.
- Vender ni editar mientras la barra dice **Sin conexión**.
- Cargar por planilla entrepaños, porcentajes o contratos por % de las ventas.
- Compartir tu sesión o dejar el computador abierto.
- Reenviar el enlace del correo de montaje a otra persona que no sea quien monta.

## Errores típicos y cómo corregirlos

| Error | Cómo se nota | Cómo se corrige |
|---|---|---|
| Un total escrito en *Al mes* | El *Total del contrato* sale multiplicado (p. ej. $ 4.500.000 en vez de $ 1.500.000). | Antes de guardar: *Total* y el número. Si ya se guardó: ficha › **Editar contrato**. |
| Renovar dos veces | El contrato viejo sigue en *Por vencer en 30 días* con «Renovar» hasta su fecha. | Mirar la ficha: si ya hay contrato desde el día siguiente, no hace falta. Si se guardó dos veces, cancelar el que sobra. |
| Correo del proveedor mal escrito | El proveedor dice que no le llegó nada. | Editar contrato con el correo bueno: al guardar se reenvía. |
| Contrato guardado sin planometría | Montajes: *Sin montar · falta planometría*; Pendientes: *Falta planometría*. | Ficha › **Adjuntar la planometría**: el aviso sale solo. La renovación también pide la suya. |
| Porcentaje vendido sin distribuir | Pendientes › *Falta distribuir*; Montajes › *falta la zona*. | **Distribuir** la cara (capítulo 7). |
| Esperar que la reserva avise | «Todavía no es un contrato: no salió ningún correo.» | Es así: los avisos salen al confirmar. |
| Reserva olvidada | El día que caduca, la reserva se libera sola. | Volver a reservar o vender (3.8). |
| Verificar «Coincide» sin mirar | El proveedor reclama la exhibición. | Pedir a quien monta que registre otra vez y verificar «No coincide» con la nota. |
| Espacio tomado | «"PUN-06" está tomado del 1 ago al 31 ene 2027: ajustá las fechas.» | Cambiar fechas, otro espacio u otro entrepaño. |

## Ejercicios y evaluación

Están en `practica.html` (5 casos con la siembra: `PUN-07` entero a 3 meses, 25 % de `GON-04·B`,
reservar `PUN-08` / confirmar `PUN-09` / cancelar, renovar `PUN-01`, verificar `PUN-04` «No
coincide» y `PUN-05`) y las respuestas, en `capacitador.html`. Cada «Te salió bien si…» se
comprobó en la copia de prueba el 20/11/2026.

## Qué demostrar en vivo

- La barra: sede, **Ctrl K** («reno» apenas se abre), el menú **Más**, la **?**.
- Pendientes con sus tres grupos; «Ir a Montajes» marca la fila; «Viniste desde…» al abrirla desde el Plano.
- Una venta completa (caso 1): el precio arranca en *Al mes* con la tarifa y el total es tarifa × meses;
  después *Total* con un total acordado. La frase antes de guardar y el correo al proveedor.
- Entrepaños (`PUN-02`: la base cuenta) y porcentaje (`GON-04·B`) sin guardar.
- *Reservar hasta…*, la ficha «Reservado», que no está en Montajes, y Confirmar en Pendientes.
- La ficha: editar (diálogo de reenviar, «Volver a Indicadores»), renovar, planometría, cancelar hasta «Dejarlo así».
- Montajes: *No coincide* con nota, *Verificar el siguiente*, «Registrar montaje» y «Listo: …».
- Indicadores › Historial con el filtro *Cancelado* y *Exportar a Excel*.

## No se pudo capturar

- **El ingreso real con Google o con correo y contraseña.** La copia de prueba no tiene el ingreso
  configurado: la hoja dice «El ingreso no está configurado en este servidor. Escribinos para que lo
  revisemos.» Se capturó así y el manual lo aclara en una caja. «Olvidé mi contraseña» y la elección de
  supermercado no aparecen en la copia.
- **El conflicto de sincronización** («Cambios en conflicto»): sólo pasa con dos personas editando el
  plano de la misma sede a la vez. Los textos del manual salen de `SyncStatus.tsx`.
- **«Ver todos (N)»** de *Contratos anteriores*: ningún espacio de la siembra tiene más contratos
  cerrados de los que la ficha muestra (`PUN-08` tiene 3). El guion lo captura si aparece.
- **Correos que no llegan**: la copia nunca envía (los deja en la cola).
- **El aviso con «Deshacer»** al resolver un pendiente: no se vio en las capturas.
- **Confirmar o cancelar una reserva desde la ficha**: se comprobó en la copia (pasa a «Contratado» /
  «Libre»), sin captura; el manual muestra la confirmación desde Pendientes.
- **El panel del 3D con «Reservado»**: el clic dentro del 3D no es estable en el navegador
  automático; la leyenda del 3D sí dice «Reservado» (texto de la captura `17-3d`, capítulo 7).

## Posibles errores del sistema

Los de la versión anterior de estas notas, uno por uno:

1. **«Registrar montaje» rompía Montajes.** — **Arreglado en #121.** Montajes › `PUN-03-EN1` ›
   *Registrar montaje* › *Lo monté* con foto › *Confirmar*: vuelve a la lista con «Listo: PUN-03-EN1
   quedó reportado como montado.» (captura `99b-registrado`).
2. **La renovación terminaba un día después.** — **Arreglado en #121.** `PUN-01` (1 jun – 30 nov) ›
   Renovar: «del 1 dic 2026 al 31 may 2027», 182 días · 6 meses · $ 3.600.000. Después de alargarlo al
   31 dic: «del 1 ene 2027 al 31 jul 2027», 7 meses.
3. **El precio arrancaba en «Total» con la tarifa de UN mes.** — **Arreglado en #121.** `PUN-07` a 3
   meses: arranca en *Al mes*, «tarifa al mes × 3 meses = $ 1.800.000»; `GON-04·B` 25 %: $ 337.500.
4. **«Volver a Supervisar».** — **Arreglado en #121:** dice «Volver a Indicadores».
5. **La reserva decía «El contrato quedó guardado.»** — **Arreglado en #121:** «Todavía no es un
   contrato: no salió ningún correo. Los avisos salen cuando se confirma.»
6. **La ficha de una reserva no la dibujaba.** — **Arreglado en #121:** `PUN-09` dice «Reservado hasta
   el 20/11/2026, sin confirmar: del 01/12/2026 al 28/02/2027», con el tramo «Lácteos Andinos · reserva».
7. **Una reserva recibía aviso de montaje / salía en Montajes.** — **Arreglado en #121:** ni `PUN-09`
   ni `GON-02·B` (reservas vivas) aparecen en Montajes.
8. **«Montaje sin reporte» sólo ofrecía «Editar contrato».** — **Arreglado en #121:** tiene «Ir a
   Montajes», que abre Montajes con la fila marcada (captura `16b-ir-a-montajes`).
9. **Cuenta de entrepaños (4 dibujados, 5 en la venta).** — **No es un error:** la base cuenta (EN1 = la
   base), es la regla del catálogo. El manual lo explica en 3.5.
10. **La foto del montaje salía como archivo del contrato.** — **Arreglado en #121:** la ficha de
    `PUN-06` (montado, con foto) ya no tiene «Archivos del contrato»: la foto se ve en Montajes.
11. **El buscador se comía las primeras letras.** — **Arreglado en #121:** abriendo con el mouse o con
    Ctrl K y escribiendo enseguida «reno», queda «reno».
12. **Confirmar una reserva no mandaba correos.** — **Arreglado en #121 / no pasaba:** al confirmar
    `PUN-09` quedan en la cola «1 contrato nuevo — CENTRO» y «Confirmación de 1 espacio» a
    comercial@lacteosandinos.example, y la bandeja dice «PUN-09 pasó a contrato. Salió el aviso al área
    comercial y al proveedor. El de montaje sale cuando el espacio tenga su planometría.»

Nuevos (verificados el 20/11/2026):

13. **En Contratos, «Pendientes» no muestra el número rojo.** Entrando a `/contratos` (directo o desde el
    menú) y esperando 6 s, el botón dice sólo «Pendientes»; en Inicio, Indicadores, Montajes y el Plano
    dice «Pendientes 23» en el mismo momento. Por eso la captura de la barra (`03-barra`) se toma ahora en
    Indicadores, y el manual lo menciona en 10.3.
14. **Confirmar una reserva desde la ficha no dice nada.** Indicadores › Contratos › `PUN-08` (reservado)
    › *Confirmar*: la ficha pasa a «Contratado», pero no aparece ningún mensaje de a quiénes salió el aviso
    (sí salen los correos: «1 contrato nuevo — CENTRO» y «Confirmación de 1 espacio» en la cola). El
    mensaje sólo está en Pendientes.
15. **Después de renovar, el contrato viejo sigue en «Por vencer en 30 días» con «Renovar».** Pendientes ›
    30 días › `PUN-01` › Renovar › *Guardar contrato* («Contrato guardado», 1 dic – 31 may): al volver a
    abrir Pendientes, `PUN-01` sigue en *Por vencer en 30 días* con el botón *Renovar* (y el total del grupo
    no cambia). Invita a renovar dos veces. Además aparece *Falta planometría · PUN-01 · empieza el 1 dic*:
    la renovación no hereda la planometría (puede ser lo buscado; el manual lo avisa).
16. **(Herramientas, no la app) La siembra falla de noche.** Entre las 19:00 y las 24:00 de Colombia
    (00:00–05:00 UTC), `sembrar.py` cae al publicar el planograma de `GON-12` («'NoneType' object is not
    subscriptable»): toma `date.today()` del sistema (UTC, ya es mañana) y el servidor trabaja con el día
    de Colombia. Se corrió con `TZ=America/Bogota` delante de `levantar.sh` y de `node capturas.cjs`.
