# Notas para el capacitador · Administrador (mitad comercial)

Material de apoyo del manual del rol **Administrador** (`admin`), capítulos 1–6, 10 y 11
(los capítulos 7–9 —Plano de la sede, Planogramas y Ajustes— tienen sus propias notas en
`notas-plano.md`). Las capturas salen de `capturas.cjs` sobre la sede de prueba CENTRO
(`herramientas/sembrar.py`): fechas relativas a hoy, proveedores y personas inventados.

Actualizado el 20/11/2026 (noche, hora de Colombia) contra la app con los arreglos de los PR #121 y
#123 (*Arreglos del recorrido de los manuales* y *Segunda tanda…* en `docs/ESTADO.md`). El kit completo del rol: `manual.html`, `bolsillo.html`,
`practica.html` (5 casos y 10 preguntas) y `capacitador.html` (dos sesiones de 2 h, errores
típicos y respuestas).

## Todos los días

1. Entrar y leer **Pendientes** (se abre solo el primer ingreso del día si hay algo para hoy).
2. Grupo **Hoy**: reservas que caducan (Confirmar / Cancelar: la bandeja dice a quiénes salió el
   aviso), ventas por cargar de los contratos por % de las ventas, *Falta distribuir · ya corre*,
   *Falta planometría · ya corre*, montajes que no se pudieron hacer.
3. Grupo **30 días**: renovar lo que vence (copia los meses y la planometría; renovado, sale de la
   lista); preparar lo que arranca.
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
| Renovar un porcentaje y esperar el aviso de montaje | *Contrato guardado* sin «Montaje» en los avisos; Pendientes › *Falta distribuir*. | Un porcentaje no hereda la planometría: **Distribuir** la cara (capítulo 7). |
| Correo del proveedor mal escrito | El proveedor dice que no le llegó nada. | Editar contrato con el correo bueno: al guardar se reenvía. |
| Contrato guardado sin planometría | Montajes: *Sin montar · falta planometría*; Pendientes: *Falta planometría*. | Ficha › **Adjuntar la planometría**: el aviso sale solo. La renovación de un espacio entero o de una parte se queda con la del contrato anterior (no hace falta cargarla otra vez). |
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
- *Reservar hasta…*, la ficha «Reservado», que no está en Montajes, y Confirmar en Pendientes. Desde la
  ficha, Confirmar y Cancelar dicen lo mismo arriba (capturas `77-reserva-confirmada-ficha` y
  `76-reserva-cancelada`).
- Renovar `PUN-01` y guardar: *Montaje* entre los avisos (heredó la planometría) y, al volver a
  Pendientes, `PUN-01` ya no está en *Por vencer en 30 días*; la ficha dice «Activo».
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

13. **En Contratos, «Pendientes» no muestra el número rojo.** — **Arreglado en #123.** En `/contratos`
    la pastilla dice «Pendientes 24», igual que en el Inicio. La captura de la barra (`03-barra`) se toma
    otra vez en Contratos y el manual ya no lo menciona en 10.3.
14. **Confirmar una reserva desde la ficha no dice nada.** — **Arreglado en #123.** La ficha muestra arriba
    el mismo mensaje que la bandeja: confirmar `PUN-08` dice «PUN-08 pasó a contrato. Salió el aviso al área
    comercial y al proveedor. El de montaje sale cuando el espacio tenga su planometría.»; cancelar dice «Se
    canceló la reserva de PUN-08: esas fechas quedan libres. No salió ningún correo.» (también en
    Pendientes). Capturas `77-reserva-confirmada-ficha` y `76-reserva-cancelada`; manual 2.4 y 3.8.
15. **Después de renovar, el contrato viejo sigue en «Por vencer en 30 días» y la renovación pide
    planometría.** — **Arreglado en #123.** Pendientes › 30 días › `PUN-01` › Renovar › *Guardar contrato*:
    «Salieron los avisos a: … Montaje montaje.centro@supermercado.example · sin valores»; al volver a
    Pendientes, `PUN-01` ya no está en *Por vencer en 30 días* (el grupo baja de $ 1.050.000 a $ 450.000)
    ni aparece *Falta planometría* de `PUN-01`; la ficha dice «Activo», con «Editar el próximo contrato» en
    vez de «Renovar con …». Un porcentaje (`GON-04·A·PC1`, Aseo Total) no hereda: el guardado dice «El
    aviso de montaje sale cuando la cara tenga su plano…». Manual 2.5 y 4.3 (capturas `69b-renovado`,
    `69c-ya-renovado`).
16. **(Herramientas, no la app) La siembra falla de noche.** Entre las 19:00 y las 24:00 de Colombia
    (00:00–05:00 UTC), `sembrar.py` cae al publicar el planograma de `GON-12` («'NoneType' object is not
    subscriptable»): toma `date.today()` del sistema (UTC, ya es mañana) y el servidor trabaja con el día
    de Colombia. **Arreglado:** `sembrar.py` y `sembrar-duenio.py` toman el día de Colombia
    (`ZoneInfo("America/Bogota")`). Por las dudas, los guiones se siguen corriendo con
    `TZ=America/Bogota` delante de `node capturas.cjs`.

Nuevos (verificados el 20/11/2026, noche, con #123):

17. **«Qué pasa ahora» después de una renovación que heredó la planometría.** El *Contrato guardado* de
    la renovación de `PUN-01` lista *Montaje* entre los avisos (el aviso salió), pero debajo sigue «La
    planometría se carga en Indicadores, en la ficha del espacio.» y, en *Qué pasa ahora*, «Aviso de
    montaje · Sale a quien monta cuando el espacio tenga su planometría (se carga en la ficha del
    espacio).», sin el tilde. `QuePasaAhora` de `ModoVender.tsx` tiene ese paso fijo (`hecho: false`) y la
    nota de la planometría no mira si el contrato ya la tiene. El manual (4.3) dice que no se le haga caso.
18. **Una reserva que corre antes de un contrato futuro no se ve en la ficha.** `PUN-08` con el contrato
    de la planilla (Café Montaña, 1 mar – 31 may 2027) y una reserva de Lácteos Andinos del 20 nov al 19
    feb (caduca el 28 nov): Indicadores › Contratos muestra sólo la fila de Café Montaña («Contratado») y
    la ficha dice «Contratado», «Disponible hoy» en *Los próximos 12 meses*, sin la reserva ni sus
    *Confirmar* / *Cancelar*. La reserva existe (`GET /api/reservas`) y se resuelve desde Pendientes el día
    que caduca. Por eso el guion confirma y cancela las reservas de la ficha antes del paso de la planilla.
19. **Confirmar una reserva desde la ficha no actualiza «Los próximos 12 meses».** Reserva de `PUN-08`
    (Lácteos Andinos, 20 nov – 19 feb) › ficha › *Confirmar*: arriba sale el mensaje y la ficha pasa a
    «Activo», pero *Los próximos 12 meses* sigue «Disponible hoy» con la barra vacía. Cerrando y volviendo
    a abrir la ficha dice «Ocupado hasta el 19/02/2027 · disponible desde el 20/02/2027». La captura
    `77-reserva-confirmada-ficha` se recorta antes de esa parte.
