# Notas del capacitador · Manual del Dueño

Para quien da la capacitación a la persona que es **Dueño** (rol `owner`) de un supermercado en
RECABRA. El dueño es un administrador con más poderes; todo lo operativo (plano, contratos,
montajes, planogramas, tarifas, avisos) está en el manual del **Administrador** y conviene darlo
antes o junto con éste.

## Cómo se arma la copia de prueba de este manual

El ingreso por clave («login legado») entra como administrador **sin persona**, y las pantallas del
dueño (Suscripción, Copia, Tus datos, Reporte de transparencia) le contestan *«Solo el owner del
cliente puede hacer esto»*. Para mostrar la cuenta de una dueña de verdad:

- `duenio/levantar-duenio.sh` levanta la siembra de siempre y, sobre esa misma base,
  `duenio/servidor-duenio.py`: el mismo backend, pero el ingreso con Google/correo acepta tokens de
  prueba (`prueba:<correo>:<nombre>`, con `dependency_overrides` de FastAPI; no se toca el código
  de la app). También declara un operador de prueba (`operador@recabra.example`).
- `duenio/sembrar-duenio.py`, sólo por la API: la clave maestra invita a **Diana Prueba** como
  dueña de Galerías y ella acepta con su cuenta; invita a **Ana Prueba** (administradora), **Luis
  Prueba** y **Marta Prueba** (trabajadores; Marta queda desactivada) y deja pendiente a
  **pedro.nuevo@…**; da de alta un segundo supermercado, **«Supermercado Norte (prueba)»**, al que
  el operador le carga una suscripción de $ 450.000 al mes (retefuente 4 %, reteICA 0,966 %), una
  cuenta de cobro `PRUEBA-0001` y el estado *Pago pendiente*.
- Después de `levantar-duenio.sh`, el ingreso por clave ya **no** sirve (hay dos supermercados y
  pide elegir): para las capturas de los otros roles, volver a correr `herramientas/levantar.sh`.

## Todos los días / de vez en cuando

**Todos los días:** nada propio del dueño; trabaja como administrador.

**Cada vez que entra o sale alguien del equipo:** invitarlo con el rol justo (2.2) o desactivarlo el
mismo día (2.3).

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
- **Nunca invites como Dueño** a quien no responde por la cuenta (proveedores, temporales,
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
| Invitó con el rol equivocado | El rol en la lista no es el que quería | No hay botón para cambiar el rol: desactivarla y pedir a RECABRA el cambio (o invitar la cuenta correcta). |
| Desactivó a la persona equivocada | La fila dice *desactivado* | **Activar**: vuelve con el mismo rol. |
| Quiere desactivarse siendo la única dueña | *No se puede desactivar al último dueño activo de este cliente.* | Invitar antes a otra persona como Dueño. |
| Borró una sede por error | La sede está en la *Papelera* | **Restaurar** dentro de los 30 días (las reservas provisionales no vuelven). |
| Pidió la supresión por error | *Solicitud registrada* | Escribir enseguida a RECABRA: la ejecución es manual. |
| Ve *«Solo el owner del cliente puede hacer esto»* | En Suscripción o al bajar la copia | Entró con la clave de instalación o con una cuenta que no es dueña: entrar con su cuenta. |

## Ejercicios sugeridos

1. **Un administrador nuevo.** Invitá a `sofia.nueva@supermercado.example` como *Administrador*.
   Leé el mensaje verde y encontrá la invitación pendiente: ¿cuándo vence? (*vence en 7 d*).
2. **Alguien se fue.** Luis Prueba dejó la tienda: desactivalo. Leé lo que pregunta el navegador.
   Después reactivalo y explicá qué cambia (nada: vuelve con su rol).
3. **La cuenta del mes.** En «Supermercado Norte (prueba)», abrí Ajustes › Cuenta › Suscripción y
   contestá: ¿cuánto es lo pactado? ($ 450.000), ¿cuánto hay que transferir? ($ 427.653, neto de
   retenciones), ¿cuándo vence? y ¿qué estado tiene la cuenta? (*Pago pendiente*).
4. **La copia.** En Galerías, bajá la copia de seguridad y encontrá en la bitácora la línea que dejó
   (*Copia de seguridad descargada*).
5. **Una sede de prueba.** Creá la sede `NORTE`, eliminala (escribiendo el nombre) y restaurala
   desde la papelera. ¿Hasta qué fecha se podía restaurar?

## 10 preguntas de evaluación (con respuesta)

1. **¿Qué puede hacer el Dueño que no puede un Administrador?** — Invitar o desactivar a otro
   dueño, ver la suscripción y los datos de facturación, bajar la copia de seguridad, descargar los
   datos del supermercado, pedir la supresión, ver el reporte de transparencia, y entrar aunque la
   cuenta esté suspendida.
2. **Invitaste a alguien y dice que no puede entrar. ¿Qué es lo primero que revisás?** — Que haya
   entrado con el **mismo correo** de la invitación (y que la invitación no haya vencido: 7 días).
3. **¿Qué rol le das a la mercaderista que confirma montajes?** — *Trabajador* (ve Inicio,
   Indicadores y Montajes sin plata).
4. **¿Qué pasa cuando desactivás a alguien?** — Pierde el acceso enseguida; lo que hizo queda en el
   sistema y en la bitácora; se puede reactivar con *Activar*.
5. **¿Por qué conviene tener dos dueños?** — Porque no se puede desactivar al último dueño, y si el
   único pierde el acceso nadie maneja suscripción, copia ni datos.
6. **¿Qué trae la copia de seguridad y dónde la guardás?** — Todo el supermercado (planos, contratos
   con valores, proveedores con contactos, montajes con fotos, documentos, configuración). Fuera de
   RECABRA, en un lugar seguro, sin mandarla por correo.
7. **¿«Solicitar supresión» borra el supermercado al tocarlo?** — No: registra un pedido que revisa
   RECABRA y ejecuta a mano. Pero si se ejecuta, no tiene vuelta atrás.
8. **Aparece arriba «Pago pendiente». ¿Qué hacés y qué pasa si no se paga?** — Ajustes › Cuenta ›
   Suscripción para ver la cuenta de cobro y pedir los datos de transferencia. A los 30 días de
   vencida (y no antes de 10 días del aviso formal) la cuenta pasa a *sólo lectura*.
9. **¿Qué muestra el reporte de transparencia?** — Qué datos toma RECABRA del supermercado y para
   qué, los valores mes a mes, quién del operador los consultó, y tus derechos.
10. **Borraste una sede por error. ¿Se puede recuperar?** — Sí, desde *Papelera › Restaurar*,
    durante 30 días; vuelven el plano, los códigos y los contratos en fecha (no las reservas
    provisionales).

## Qué demostrar en vivo

- El menú de la cuenta: rol *Dueño*, *Descargar mis datos*, *Cerrar sesión*.
- Ajustes › Equipo: invitar (los tres roles en la lista), la invitación pendiente, desactivar y
  activar (con el aviso del navegador).
- Ajustes › Cuenta › Suscripción en el supermercado con cuenta de cobro, y la franja *Pago
  pendiente*; contrastar con Galerías («no tiene una suscripción registrada»).
- Bajar la copia de seguridad y verla en la bitácora.
- El reporte de transparencia (ventana de 12 meses, *Quién lo consultó*).
- Crear, eliminar y restaurar una sede.
- Para contrastar: entrar como *Administrador* (Ana) y mostrar que en Equipo no aparece la opción
  *Dueño* y que en Cuenta no está la suscripción.

## No se pudo capturar

- **La pantalla de ingreso con Google o correo**: en la copia de prueba no hay Firebase configurado
  y la pantalla dice *«El ingreso no está configurado en este servidor»*. Se explica con texto.
- **Aceptar una invitación** (la persona invitada entrando por el enlace) y **elegir entre dos
  supermercados al entrar**: dependen de esa misma pantalla de ingreso. En la copia de prueba se
  hacen por la API (`sembrar-duenio.py`), no en el navegador.
- **El correo de invitación**: la invitación sale directo (`send_mail_to_bg`) y no queda en la cola
  de correos de la copia de prueba, así que `correoReal()` no lo encuentra. Se describe con lo que
  arma el servidor (supermercado, rol, «Ingrese con», enlace que vence en 7 días).
- **Pagar** y ver una cuenta de cobro pagada: el pago lo registra el operador de RECABRA cuando lo
  ve en el banco; no hay botón de pago en la app.
- **Los estados *Sólo lectura* y *Suspendida*** con su pantalla: se muestra sólo *Pago pendiente*;
  los otros se explican en la tabla.
- **El archivo que baja «Descargar mis datos»** y el contenido del ZIP de la copia: son descargas,
  no pantallas.
- **Cambiar el rol de una persona**: la app no tiene esa función (ver *Posibles errores*).

## Posibles errores del sistema

1. **«Solo el owner del cliente puede hacer esto.»** — mensaje con la palabra en inglés *owner* (y
   *cliente* en vez de supermercado) en Ajustes › Cuenta › Suscripción, Copia y Tus datos, cuando
   entra alguien que no es dueño (o con la clave de instalación). Reproducir: entrar con el login
   legado y abrir Ajustes › Cuenta.
2. **Los administradores no-dueños ven «Tus datos» con botones que después fallan**: la sección
   «Tus datos» (descargar los datos del supermercado, supresión, reporte) se muestra a cualquier
   administrador y recién el servidor contesta con el error de arriba. La copia y la suscripción sí
   se esconden. Reproducir: entrar como Ana Prueba (administradora) › Ajustes › Cuenta.
3. **No hay forma de cambiar el rol de una persona**: el servidor sólo permite activar/desactivar
   (`PATCH /usuarios/{id}` con `activo`); invitarla de nuevo da 409 *«Esa persona ya es miembro de
   este cliente.»*. Para pasar a alguien de Trabajador a Administrador hace falta RECABRA.
4. **El selector de rol corta la palabra**: «Administrado» (sin la *r*) en Ajustes › Equipo, a
   1280 × 800 (el selector mide 120 px). Reproducir: elegir *Administrador* en Rol.
5. **La dueña ve «Desactivar» en su propia fila**: si la toca siendo la única dueña, recién ahí el
   servidor contesta que no se puede (409). Si hay otra dueña, se desactiva a sí misma y pierde el
   acceso en el acto, sin un aviso especial.
6. **El correo de invitación no pasa por la cola de correos** (sale directo, sin reintento): si el
   envío falla en ese momento, la invitación queda creada pero el correo no se reintenta.
   Reproducir: invitar con el correo cortado (copia de prueba) y buscar la invitación en
   `correos_pendientes`.
7. **Reporte de transparencia: la fecha de aceptación de la política sale un día antes** («versión
   aceptada 2026-10-v3 (19 de nov de 2026)» para una aceptación del 20 de noviembre por la tarde,
   hora de Colombia). Parece un corrimiento por zona horaria.
8. **Reporte de transparencia, «4. Tus derechos»** muestra direcciones técnicas
   (`GET /api/clientes/mi-export`, `POST /api/clientes/solicitar-supresion`…), que a un dueño no le
   dicen nada.
9. **En la bitácora y en el Inicio, lo que hace la dueña figura con el rol «admin»** (`admin ·
   127.0.0.1`), no «Dueño»: el rol del token de un dueño es *admin*. El correo sí la identifica.
10. **«Persona invitada · rol owner» sin correo** en la Actividad reciente cuando la invitación la
    hizo la clave de instalación (no hay persona que anotar).
