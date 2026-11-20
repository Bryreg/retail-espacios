# Notas del capacitador · Manual del Dueño

Para quien da la capacitación a la persona que es **Dueño** (rol `owner`) de un supermercado en
RECABRA. El dueño es un administrador con más poderes; todo lo operativo (plano, contratos,
montajes, planogramas, tarifas, avisos) está en el manual del **Administrador** y conviene darlo
antes o junto con éste.

## Cómo se arma la copia de prueba de este manual

El ingreso por clave («login legado») entra como administrador **sin persona**, y las pantallas del
dueño (Suscripción, Copia, Tus datos, Reporte de transparencia) le contestan *«Esto lo puede hacer
sólo el dueño del supermercado, con su cuenta.»*. Para mostrar la cuenta de una dueña de verdad:

- `duenio/levantar-duenio.sh` levanta la siembra de siempre y, sobre esa misma base,
  `duenio/servidor-duenio.py <puerto>`: el mismo backend, pero el ingreso con Google/correo acepta
  tokens de prueba (`prueba:<correo>:<nombre>`, con `dependency_overrides` de FastAPI; no se toca
  el código de la app). También declara un operador de prueba (`operador@recabra.example`) y guarda
  el **correo de invitación** —que sale directo, sin la cola— en
  `<MANUAL_TMP>/correos-directos-<puerto>/` para capturarlo (no sale ninguno).
- **Sólo apaga lo de su puerto** (`pkill -f "servidor-duenio.py <puerto>$"` y el uvicorn de ese
  puerto): puede haber copias de otros roles corriendo en otros puertos. Por eso el puerto va en la
  línea de comandos del servidor.
- `duenio/sembrar-duenio.py`, sólo por la API: la clave maestra invita a **Diana Prueba** como
  dueña de Galerías y ella acepta con su cuenta; invita a **Ana Prueba** (administradora), **Luis
  Prueba** y **Marta Prueba** (trabajadores; Marta queda desactivada) y deja pendiente a
  **pedro.nuevo@…**; da de alta un segundo supermercado, **«Supermercado Norte (prueba)»**, al que
  el operador le carga una suscripción de $ 450.000 al mes (retefuente 4 %, reteICA 0,966 %), una
  cuenta de cobro `PRUEBA-0001` y el estado *Pago pendiente*. Deja `.sesion-duenia-<puerto>.json`
  con los ingresos de Diana (en los dos supermercados), de Ana y de Luis. Desde el PR #121 el rol
  del token tiene que ser el de la membresía de hoy (`rol_de_token_para`): los ingresos se piden al
  final, después de todos los cambios de rol y de estado.
- **Sembrá de nuevo antes de cada corrida completa** de `capturas.cjs`: la corrida invita a Sofía,
  cambia el rol de Luis (y lo devuelve), lo desactiva y lo activa, pide una supresión y crea y borra
  la sede NORTE. La sesión de Luis que guardó la siembra deja de valer en cuanto la corrida le
  cambia el rol (es lo que se captura).
- Los textos que cita el manual quedan en `<MANUAL_TMP>/textos-duenio/` (innerText de cada pantalla
  y el texto de cada aviso del navegador).
- Después de `levantar-duenio.sh`, el ingreso por clave ya **no** sirve (hay dos supermercados y
  pide elegir): para las capturas de los otros roles, volver a correr `herramientas/levantar.sh`.

## Todos los días / de vez en cuando

**Todos los días:** nada propio del dueño; trabaja como administrador.

**Cada vez que entra, cambia de puesto o sale alguien del equipo:** invitarlo con el rol justo
(2.2), cambiarle el rol desde su fila (2.3) o desactivarlo el mismo día (2.4).

**Una vez al mes**
- Bajar la **copia de seguridad** y guardarla fuera de RECABRA (3.2).
- Mirar **Suscripción**: cuentas de cobro por pagar y datos de facturación (3.1).
- Repasar **Equipo**: que no haya nadie activo que ya no trabaja ahí; invitaciones vencidas.

**De vez en cuando**
- **Bitácora**, cuando hay que saber quién hizo algo (3.5).
- **Reporte de transparencia**, cuando lo pida auditoría o legal (3.4).
- **Sedes**: crear una cuando abre una tienda; eliminar sólo si cerró (4).

**Casi nunca:** descargar los datos del supermercado o **pedir la supresión** (3.3).

## Nunca hagas

- **Nunca compartas tu cuenta** ni la «clave de la tienda»: cada persona, su invitación.
- **Nunca invites de nuevo a quien ya está** para cambiarle el rol: se cambia en su fila.
- **Nunca invites como Dueño** (ni le des ese rol) a quien no responde por la cuenta (proveedores, temporales,
  practicantes). Con Trabajador o Administrador alcanza.
- **Nunca dejes un solo dueño**: si esa persona se va o pierde el acceso, nadie puede ver la
  suscripción ni hacer la copia. Tené dos.
- **Nunca mandes la copia de seguridad por correo** ni la dejes en un computador compartido: trae
  precios y contactos de todos los proveedores.
- **Nunca pidas la supresión «para probar»**: si RECABRA la ejecuta, no hay vuelta atrás.
- **Nunca elimines una sede con contratos vivos** sin hablarlo: los contratos se cierran y el
  tablero pierde sus cifras (se puede restaurar sólo durante 30 días).
- **Nunca respondas un correo que pida tu contraseña o una tarjeta**: RECABRA cobra por
  transferencia y muestra las cuentas en Ajustes › Cuenta.

## Errores típicos y cómo corregirlos

| Error | Cómo se ve | Cómo se corrige |
|---|---|---|
| Invitó con el correo mal escrito | La invitación queda pendiente y nadie entra | Invitar de nuevo con el correo bien; la mala vence sola a los 7 días. |
| La persona entró con otro correo | «No tiene acceso» o le ofrece crear un supermercado | Que cierre la sesión y entre con el correo de la invitación; que no cree nada. |
| Invitó con el rol equivocado | El rol en la lista no es el que quería | Si ya entró: cambiarle el rol en su fila (manual 2.3). Si no: dejar vencer la invitación e invitar de nuevo. |
| Invitó de nuevo a alguien que ya está | *Esa persona ya es miembro de este supermercado: cambiale el rol desde la lista.* | Cambiarle el rol en su fila, o *Activar* si está desactivada. |
| Le cambió el rol a un trabajador y «lo sacó» | Su RECABRA volvió a la portada | Normal entre Trabajador y Administrador: *Ya tengo cuenta* y entra con el rol nuevo. |
| Quiere cambiarse el rol o desactivarse | Su fila dice *vos* y no tiene botones | Lo hace otro dueño. Para dejar de ser dueño: primero darle el rol Dueño a otra persona. |
| Desactivó a la persona equivocada | La fila dice *desactivado* | **Activar**: vuelve con el mismo rol. |
| Borró una sede por error | La sede está en la *Papelera* | **Restaurar** dentro de los 30 días (las reservas provisionales no vuelven). |
| Pidió la supresión por error | *Solicitud registrada* | Escribir enseguida a RECABRA: la ejecución es manual. |
| Ve *«Esto lo puede hacer sólo el dueño del supermercado, con su cuenta.»* | En Suscripción o en Tus datos | Entró con la clave de instalación o con una sesión vieja: cerrar sesión y entrar con su cuenta. |

## Ejercicios, evaluación y guía

Los cinco casos y las diez preguntas están en `practica.html` (PDF *Ejercicios y evaluación*); las
respuestas, el orden de la sesión de 60 minutos y qué demostrar en vivo, en `capacitador.html`
(PDF *Guía del capacitador*). La hoja de una página: `bolsillo.html`.

## No se pudo capturar

- **La pantalla de ingreso con Google o correo**: en la copia de prueba no hay Firebase configurado.
  Se explica con texto. Al cambiarle el rol a Luis se captura lo que él ve (vuelve a la portada, con
  *Ya tengo cuenta*) y cómo queda al entrar de nuevo; ese nuevo ingreso se hace con el token de
  prueba (`/api/auth/oauth`), que es lo mismo que hace la pantalla.
- **Aceptar una invitación** (la persona invitada entrando por el enlace) y **elegir entre dos
  supermercados al entrar**: dependen de esa misma pantalla. En la copia se hacen por la API.
- **Los avisos del navegador** (las preguntas de *Desactivar*, del cambio de rol, de dar el rol
  Dueño y de la supresión): son ventanas del navegador, no de la página; Playwright no las
  fotografía. Su texto exacto se toma del aviso (`dialog.message()`) y va citado en el manual.
- **Los rechazos del servidor que la pantalla ya no deja provocar**: *No podés desactivarte ni
  cambiarte el rol a vos mismo…*, *Sólo un dueño puede dar el rol Dueño…* y *No se puede dejar al
  supermercado sin dueño…*. Con #121 la fila propia no tiene botones y a un administrador no se le
  ofrece *Dueño* ni se le dejan tocar las filas de dueños, así que no hay cómo verlos en la
  pantalla. El manual describe las reglas con palabras, sin citar esos textos.
- **Pagar** y ver una cuenta de cobro pagada: el pago lo registra el operador de RECABRA cuando lo
  ve en el banco; no hay botón de pago en la app.
- **Los estados *Sólo lectura* y *Suspendida*** con su pantalla: se muestra sólo *Pago pendiente*;
  los otros se explican en la tabla.
- **El archivo que baja «Descargar mis datos»** y el contenido del ZIP de la copia: son descargas,
  no pantallas.
- **Fechas dd/mm/aaaa en los correos del dueño**: el único correo del recorrido del dueño es la
  invitación, que no trae fechas (dice *El enlace vence en 7 días*). Las fechas de los correos de
  contratos están en el manual del Administrador.

## Posibles errores del sistema

Revisado contra la app construida desde `main` con el PR #121, en la copia de prueba (puerto 8786).

1. **«Solo el owner del cliente puede hacer esto.»** — **Arreglado en #121.** Ahora dice *«Esto lo
   puede hacer sólo el dueño del supermercado, con su cuenta.»* (verificado: sesión de Ana sin el
   rol en el supermercado, Ajustes › Cuenta › Suscripción y *Descargar los datos del supermercado*).
2. **Los administradores no-dueños ven «Tus datos» con botones que después fallan.** — **Arreglado
   en #121.** Ana (administradora) ve sólo *«Tus datos personales los bajás vos, desde el menú de tu
   cuenta…»*, sin botones (verificado, captura `41-ana-tus-datos`). Con una sesión vieja (sin rol)
   todavía ve los botones y el servidor contesta el 403 del punto 1: es lo previsto.
3. **No hay forma de cambiar el rol de una persona.** — **Arreglado en #121.** Cada fila tiene la
   lista del rol; reinvitar da *«Esa persona ya es miembro de este supermercado: cambiale el rol
   desde la lista.»* (verificado, capturas `08-…` y `05c-ya-es-miembro`).
4. **El selector de rol corta «Administrado».** — **Arreglado en #121** (verificado: el selector
   mide 122 px y el texto 122 px; se lee *Administrador*).
5. **La dueña ve «Desactivar» en su propia fila.** — **Arreglado en #121.** La fila propia dice
   *«Diana Prueba · vos»*, con el rol escrito, y no tiene botones (verificado, `03b-fila-propia`).
6. **El correo de invitación no pasa por la cola de correos** (sale directo con `send_mail_to_bg`,
   sin reintento). — **Sigue** (verificado: `routers/usuarios.py`, invitar). Si el envío falla en
   ese momento, la invitación queda creada y el correo no se reintenta. La copia del dueño lo
   intercepta sólo para la captura.
7. **Reporte de transparencia: la fecha de aceptación salía un día antes.** — **Arreglado en #121**
   (verificado: aceptación del 20/11/2026 a las 18:30, hora de Colombia → *«versión aceptada
   2026-10-v3 (20 de nov de 2026)»*; *«generado el 20 de nov de 2026»*).
8. **Reporte de transparencia, «4. Tus derechos», con direcciones técnicas.** — **Arreglado en
   #121.** Ahora dice dónde está cada cosa (*Ajustes › Cuenta › Tus datos › «Solicitar supresión»
   (sólo el dueño)*…) (verificado, `15c-tus-derechos`). La Política (§7) sigue nombrando rutas: es
   texto legal con versión, lo decide el dueño (ESTADO.md).
9. **En la bitácora, la dueña figuraba como «admin».** — **Arreglado en #121.** Dice *«Dueño ·
   127.0.0.1»*, y en el Inicio, *«rol Trabajador»* en vez de *«rol worker»* (verificado).
10. **«Persona invitada» sin correo de quien invitó** cuando invita la clave de instalación. —
    **Sigue, en parte** (verificado: ahora dice *«rol Dueño»* en palabras, pero sin correo). Sólo
    pasa con el acceso por clave (`LOGIN_LEGADO`), que en producción está apagado.

**Nuevos (vistos en este recorrido)**

11. **La bitácora no dice a QUIÉN se le cambió el rol ni a quién se desactivó.** *«Rol de una
    persona cambiado · Trabajador → Administrador · diana.duena@…»* y *«Persona activada o
    desactivada · desactivado · diana.duena@…»* dicen quién lo hizo, pero no a quién (el servidor
    guarda el id, `entidad_id`, y no lo muestra). Con varios cambios el mismo día no se sabe cuál
    fue cuál. Reproducir: Equipo › cambiar el rol de Luis › Cuenta › Bitácora › *Rol de una persona
    cambiado* (o el Inicio, *Actividad reciente*).
12. **Reporte de transparencia, «1. Qué datos toma la plataforma»**, todavía con palabras técnicas:
    columnas *Fuente* (`layout_snapshots`, `space_leases`, `membresias`…) y *Endpoints*
    (`metricas, tendencia`), el código del supermercado (*galerias*) debajo del título y un *«--»*
    en la definición de *Estado de cuenta*. Reproducir: Tus datos › *Reporte de transparencia*.
13. **Textos de «Tus datos» que hablan de «cliente» y «operador de la plataforma»**: el campo de la
    supresión dice *«Por qué querés que se suprima el cliente»* y la confirmación, *«…revisa el
    operador de la plataforma…»*; el resto de la pantalla dice *supermercado* y *RECABRA*.
14. **Fechas de Suscripción en otro formato**: *«1-dic-2026»*, *«20-nov-2026»* (con guiones),
    distinto del resto de la app (*20 nov*, *20/11/2026*). Menor.
