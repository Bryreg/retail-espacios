> **BORRADOR PARA REVISIÓN DE ABOGADO** — este documento no constituye asesoría legal.

# Política de Tratamiento de Datos Personales — RECABRA

**Versión: 2026-10-v3 · Vigencia: octubre 2026**

Esta política explica qué datos de personas maneja RECABRA, para qué los usa, con qué
permiso, quién responde por ellos y cómo puede cualquier persona pedir que se los
muestren, se los corrijan o se los borren.

Está escrita conforme a la **Ley 1581 de 2012** (régimen general de protección de datos
personales en Colombia) y al **Decreto 1377 de 2013**, que la reglamenta parcialmente y
hoy está compilado en el Decreto Único Reglamentario 1074 de 2015.

Está escrita en español corriente a propósito: la leen comerciantes, no abogados. Donde
la ley exige una fórmula precisa, el borrador la marca para que el abogado la ajuste.

**Antes de publicarla hay que completar los campos entre corchetes y hacerla revisar por
un abogado.** Mientras tenga corchetes sin llenar, no está lista para publicar.

---

## 1. Quién es el responsable del tratamiento

| | |
|---|---|
| **Razón social** | [COMPLETAR: razón social exacta como figura en el certificado de existencia y representación] |
| **NIT** | [COMPLETAR: NIT con dígito de verificación] |
| **Domicilio** | [COMPLETAR: dirección física, ciudad y país] |
| **Correo de contacto para protección de datos** | [COMPLETAR: correo, p. ej. datos@…] |
| **Teléfono** | [COMPLETAR: teléfono de atención] |
| **Nombre comercial de la plataforma** | RECABRA (gestión de espacios comerciales en supermercados) |
| **Dirección web donde se publica esta política** | [COMPLETAR: dirección web definitiva de `/politica-datos`] |

El área encargada de atender consultas, reclamos y solicitudes de los titulares es
[COMPLETAR: nombre del área o del responsable designado, p. ej. "Atención al Cliente" o
"Oficial de Protección de Datos"].

> **[VALIDAR CON ABOGADO]** Si la empresa que opera RECABRA está obligada a inscribir sus
> bases de datos en el **Registro Nacional de Bases de Datos (RNBD)** de la
> Superintendencia de Industria y Comercio, hay que decirlo aquí e indicar el número de
> radicado. Ver la guía operativa en `docs/legal/guia-rnbd.md`.

---

## 2. Qué datos tratamos y de quién

RECABRA no es una tienda al público: es una herramienta de trabajo que usan supermercados
para administrar los espacios que le alquilan a sus proveedores. Por eso los datos
personales que pasan por el sistema son, casi todos, **datos de trabajo de personas
adultas actuando en nombre de una empresa**, no datos de consumidores finales.

Aun así son datos personales, y esta política los cubre a todos.

### 2.1 Usuarios de la plataforma

Las personas que entran a RECABRA con una cuenta propia (dueños de supermercado,
administradores y mercaderistas):

- **Identificador de cuenta**: el `firebase_uid` que asigna el servicio de autenticación
  de Google. Es un código interno que identifica la cuenta.
- **Correo electrónico** y **nombre**, tal como vienen de la cuenta de Google o del
  registro por correo.
- **Fecha de creación de la cuenta** y **fecha del último ingreso**.
- **A qué supermercados pertenece y con qué rol** (dueño, administrador o mercaderista),
  y si esa pertenencia sigue activa.
- **Invitaciones**: cuando alguien invita a un colega, se guarda el correo del invitado,
  el rol que se le reservó, quién lo invitó y cuándo caduca la invitación. El correo de la
  invitación lleva un enlace de un solo uso que vence a los 7 días.
- **Constancia de aceptación de esta política**: la versión aceptada, la fecha, la
  dirección IP desde la que se aceptó y en qué momento se aceptó (al fundar el
  supermercado, al aceptar una invitación o al ingresar).
- **Constancia de aceptación de los Términos del servicio** (sólo la dueña de cada
  supermercado, y sólo cuando haya términos vigentes): la versión de los términos, la
  versión de esta política que regía en ese momento, el supermercado, la fecha, la
  dirección IP y si fue al fundar el supermercado o al ingresar.
- **Al fundar un supermercado**: el nombre y el código del supermercado, quién lo fundó y
  cuándo. Si llega cuando la plataforma ya recibió el máximo de altas del día, queda **en
  espera** con el correo de quien lo pidió, el nombre y el código, hasta que el operador lo
  atiende. En los dos casos el operador de la plataforma recibe un aviso por correo con el
  nombre, el código y el correo de quien funda.
- **Lo que hace cada persona dentro del sistema**: además de la bitácora (punto 2.5),
  varios registros del supermercado guardan **el correo (o el nombre) de quien los hizo**:
  quién creó o canceló una reserva, quién publicó o revisó un planograma, quién cargó un
  corte de ventas, quién verificó un montaje.
- **Sesiones cerradas**: cuando alguien toca «Salir», se guarda el identificador interno de
  esa sesión (no el correo ni la clave) hasta que vence, para que no se pueda volver a usar.

**Nota importante:** RECABRA **no almacena contraseñas de las cuentas individuales**. Esas
las guarda el servicio de autenticación de Google (Firebase Authentication); RECABRA solo
recibe y verifica un comprobante de identidad firmado. El método de ingreso antiguo, con
claves compartidas por rol, **está apagado**; sólo se prende en una emergencia, y si se
prende sus claves se guardan **cifradas de forma irreversible** (hash Argon2id): no se
pueden leer ni recuperar, solo comparar.

### 2.2 Personal de los supermercados clientes

Personas que trabajan en el supermercado y quedan registradas aunque no tengan cuenta:

- **Correos de aviso**: las direcciones del administrador de cada sede, del gerente
  operacional, del mercaderista y de quien recibe los avisos generales, que reciben los
  avisos automáticos cuando se firma o se edita un contrato, cuando algo vence y qué hay que
  montar. Se cargan a mano en la configuración del supermercado.
- **Responsables de montaje**: los correos a los que alguien del supermercado le manda la
  **guía de montaje** de un planograma. Se escriben al mandarla y no se guardan en una
  libreta: quedan sólo en la cola de correos (punto 2.5) hasta que se borran.
- **Reportes de montaje**: cuando alguien confirma que armó (o que no pudo armar) una
  exhibición, se guarda **quién lo reportó** —el nombre o el correo de su cuenta, o el
  **nombre que escribe** quien entra por el enlace del correo, que no tiene cuenta—, su rol,
  la fecha y hora que pone el servidor, el motivo si no se pudo, una nota libre y la foto si
  la sube. Lo mismo cuando avisa por el enlace de la guía que un planograma quedó montado, y
  cuando alguien del supermercado revisa ese montaje (quién revisó, la nota).
- **Enlaces sin contraseña**: el aviso de montaje y la guía llevan un enlace que abre sólo
  lo que hay que montar —sin precios ni proveedores— sin pedir contraseña. Vale lo que dura
  el trabajo (como mucho 400 días) y el supermercado lo puede cortar antes. Quien tenga el
  enlace ve el espacio, su sede y lo que hay que montar.

### 2.3 Contactos de proveedores

De las marcas y distribuidores que alquilan espacio:

- **Nombre de la empresa proveedora**, **nombre de la persona de contacto**, **teléfono**,
  **correo electrónico** y **notas** que escriba el comercial del supermercado.
- **El correo de la reserva**: cuando se le reserva un espacio a un proveedor, el correo al
  que se le avisa y las notas de la reserva.
- **Los avisos que se le mandan**: el correo de confirmación de un contrato (el espacio, las
  fechas, la marca y el valor pactado) va a la dirección del proveedor.
- **Las artes de sus productos** (imagen, nombre, medidas y precio de venta al público, si se
  carga) que el supermercado sube para probar la exhibición en 3D.

Cuando el proveedor es una persona natural (un comerciante independiente), esos datos son
todos datos personales suyos, incluido el valor del contrato.

### 2.4 Imágenes y archivos

- **Fotos de montaje** que sube el mercaderista desde el celular para probar que la
  exhibición quedó armada, y **fotos de cómo quedó una cara** que sube quien monta desde el
  enlace de la guía. Se toman en la sala de ventas de un supermercado en horario de
  operación: **pueden captar personas de forma incidental** — clientes que pasan,
  empleados de la tienda. No se toman para identificar a nadie y no se les aplica ningún
  tipo de reconocimiento facial ni análisis biométrico.
- **Planometrías** (la foto o el PDF que manda el proveedor con el diseño de la
  exhibición) y **artes de producto**.
- **Contratos escaneados** y otros documentos que se adjuntan al espacio. Pueden contener
  nombres, firmas y números de identificación de quienes los suscribieron.

Los archivos se guardan dentro de la base de datos del supermercado, no en un servicio de
almacenamiento aparte.

### 2.5 Datos técnicos de seguridad y de operación

- **Bitácora del supermercado**: cada acción que cambia algo o abre una puerta (guardar o
  cancelar un contrato, subir un documento, ingresar al sistema, invitar a alguien, cambiar
  una tarifa, guardar el plano) queda anotada con la fecha, el rol, **el correo de quien la
  hizo**, la dirección IP desde la que se hizo y una descripción corta («Alpina ·
  NAVE-PUN-01»). La lee la administración del supermercado.
- **Bitácora de la plataforma**: cada consulta o acción del **operador de la plataforma**
  queda anotada con su correo, qué hizo, sobre qué supermercado y período, y cuándo (ver el
  punto 5.3 d).
- **Direcciones IP de los frenos de seguridad**: los intentos fallidos de ingreso, de
  autenticación con cuenta y de creación de un supermercado nuevo se cuentan por dirección
  IP para frenar ataques de fuerza bruta. De esos intentos solo se guarda la IP y la hora
  —nunca el correo ni la clave que se probó—, y se borran solos (punto 6). Las descargas de
  datos se cuentan por cuenta, no por IP.
- **Registros técnicos del servidor**: el servicio de alojamiento (Render) guarda, por cada
  pedido, la dirección IP de conexión, la hora, la ruta pedida y si salió bien o mal, y los
  mensajes técnicos del sistema. RECABRA **no escribe en esos registros direcciones de correo
  ni los códigos de los enlaces sin contraseña**: un aviso dice «3 destinatarios
  (gmail.com)», no a quién, y la ruta de un enlace sale con su código tachado.
- **Errores**: si está activado el servicio de seguimiento de errores (Sentry), cuando algo
  falla se le manda el error técnico —qué parte del sistema, qué pasó—, **sin la dirección IP
  ni las cabeceras de quien pidió y sin ninguna dirección de correo**.
- **Cola de correos**: cada aviso que el sistema manda se anota antes de salir —los
  destinatarios, el asunto y el contenido— para volver a intentarlo si el proveedor de
  correo falla. Se borra solo (punto 6).
- **Motivo del estado de cuenta**: si un supermercado queda en mora o suspendido, el
  operador de la plataforma escribe un motivo en texto libre. Ese texto puede mencionar a
  personas (a quién se le facturó, con quién se habló).

### 2.6 Datos de facturación y cobro del supermercado

Para cobrarle la suscripción a cada supermercado cliente, RECABRA guarda:

- **Datos de facturación**: razón social, NIT, municipio y **correo de facturación**. Los
  carga RECABRA al registrar la suscripción, y la dueña del supermercado los puede
  corregir desde Configuración → Suscripción.
- **Lo pactado**: el valor de la suscripción, por supermercado o por sede, el plazo de
  pago y la referencia del contrato firmado o de los términos aceptados.
- **Cuentas de cobro y facturas**: período, número, CUFE si la hay, fechas de emisión y de
  vencimiento, valores, retenciones estimadas, y una copia del nombre y el NIT del
  supermercado al momento de emitirla.
- **Pagos**: fecha, valor recibido, retenciones practicadas por el supermercado, si llegó
  el certificado de retención, la **referencia bancaria** de la transferencia y quién de
  RECABRA lo registró.
- **Historial del estado de cuenta**: cada cambio (al día, pago pendiente, sólo lectura,
  suspendido), con el motivo, la fecha y quién lo hizo (una persona de RECABRA o el
  proceso automático).
- **Constancia de los avisos de cobro**: qué aviso se mandó, por qué cuenta de cobro,
  cuándo y a cuántos destinatarios. **No se guardan las direcciones** en esa constancia:
  salen, al momento de mandar, de las dueñas activas del supermercado y del correo de
  facturación.

Son, en su mayoría, datos de una empresa (persona jurídica), no de una persona. Son datos
personales el **correo de facturación** cuando identifica a una persona (por ejemplo, el
de un contador o una tesorera) y el **correo de la dueña** al que llegan los avisos.
**No hay pasarela de pagos ni se piden datos de tarjeta**: el pago es por transferencia y
RECABRA anota lo que vio entrar en su cuenta. RECABRA no emite facturas ante la DIAN:
registra el número (y el CUFE) de lo que se emitió por fuera.

> **[VALIDAR CON ABOGADO]** Si el NIT y la razón social de un supermercado que es persona
> natural (no una sociedad) deben tratarse como dato personal en esta sección.

### 2.7 Lo que queda guardado en el navegador

RECABRA no usa cookies de publicidad ni de análisis, ni herramientas de medición de
terceros. Para funcionar, el navegador de quien lo usa guarda algunas cosas **en ese
equipo** (almacenamiento local del navegador). Qué guarda, por qué y hasta cuándo está en
el punto 10.1; lo más importante: **el plano de las sedes, con el valor de las repisas
vendidas, queda guardado en el equipo aun después de «Salir»**.

### 2.8 Resumen

| Categoría | Ejemplos | De quién |
|---|---|---|
| Identificadores de cuenta | `firebase_uid`, correo, nombre, último ingreso | Usuarios de la plataforma |
| Pertenencia y permisos | Rol en cada supermercado, invitaciones, quién invitó | Usuarios de la plataforma |
| Constancias de consentimiento | Versión de la política aceptada, fecha, IP, momento; versión de los términos aceptada por la dueña | Usuarios de la plataforma |
| Altas de supermercados | Nombre y código del supermercado, quién lo fundó, correo de un alta en espera | Quien funda |
| Contactos de aviso | Correos por sede y por rol, responsables de montaje | Personal del supermercado |
| Reportes de montaje | Quién reportó (nombre escrito o de la cuenta), rol, fecha, motivo, nota, foto | Personal del supermercado y quien monta |
| Autoría de registros | Correo o nombre de quien creó, publicó, revisó o canceló algo | Usuarios de la plataforma |
| Contactos comerciales | Empresa, persona, teléfono, correo, notas, correo de la reserva | Contactos de proveedores |
| Imágenes | Fotos de montaje y de la guía, planometrías, artes, contratos escaneados | Personas captadas incidentalmente; firmantes |
| Bitácoras | Fecha, rol, correo del actor, IP, acción (del supermercado); correo del operador, acción, período (de la plataforma) | Usuarios de la plataforma y operador |
| Frenos de seguridad | IP y hora de intentos fallidos | Cualquiera que intente ingresar |
| Registros técnicos y errores | IP de conexión, hora, ruta (sin correos ni códigos de enlaces), errores sin IP ni correos | Cualquiera que use el servicio |
| Cola de correos | Destinatarios, asunto y contenido de cada aviso, hasta que se borra | Destinatarios de los avisos |
| Facturación y cobro | Razón social, NIT, municipio, correo de facturación, cuentas de cobro, pagos, referencias bancarias, retenciones | Supermercado cliente (y la persona dueña del correo de facturación) |
| En el navegador | Sesión, planos de las sedes con valores, preferencias, reporte de montaje sin enviar | Quien usa ese equipo |

**Datos sensibles.** RECABRA **no pide ni necesita** datos sensibles en el sentido del
artículo 5 de la Ley 1581 (salud, origen étnico, orientación política, religión,
biometría, vida sexual). Si alguna foto de montaje llegara a captar información de esa
naturaleza, es por accidente y no se trata con ninguna finalidad: la vía para pedir que se
retire está en la sección 7.

**Menores de edad.** RECABRA es una herramienta de trabajo y no está dirigida a menores.
No se recolectan datos de menores a sabiendas. Si se detecta que un dato de un menor entró
al sistema, se retira. [VALIDAR CON ABOGADO: si el abogado considera que la aparición
incidental de menores en fotos de sala de ventas requiere un tratamiento específico bajo
el artículo 7 de la Ley 1581 y el artículo 12 del Decreto 1377, ajustar esta sección.]

---

## 3. Para qué usamos los datos

### 3.1 Usuarios de la plataforma

- Crear y sostener la cuenta, y verificar quién es quien entra.
- Decidir a qué supermercado y con qué permisos entra cada persona.
- Enviar invitaciones y avisos operativos del servicio.
- Dejar constancia de que se aceptó esta política, con qué versión y cuándo, y de que la
  dueña aceptó los Términos del servicio.
- Avisarle al operador de la plataforma cada supermercado que se funda, para detectar altas
  abusivas, y atender las que llegan con el tope del día.
- Facturar y administrar el estado de cuenta del supermercado.
- Atender consultas, reclamos y solicitudes de derechos.

### 3.2 Personal del supermercado

- Avisar por correo cuando se firma un contrato, cuando algo está por vencer y qué hay que
  montar.
- Dejar constancia de quién confirmó un montaje y cuándo, que es lo que responde un
  reclamo de un proveedor meses después.
- Mandarle a quien monta la guía de montaje o el aviso con su enlace sin contraseña, sin
  precios ni proveedores.

### 3.3 Contactos de proveedores

- Administrar el contrato de alquiler del espacio: quién es la contraparte, a quién
  llamar, a dónde mandar la confirmación.
- Enviar al proveedor la constancia de lo que contrató, y avisarle de una reserva.
- Probar en 3D cómo se vería su producto en el espacio (las artes que carga el supermercado).

### 3.4 Imágenes y archivos

- Probar cómo quedó armada la exhibición y compararla con lo acordado.
- Conservar la prueba documental del acuerdo.

### 3.5 Bitácora y frenos de seguridad

- Saber quién hizo qué cuando falta un contrato o cambia un valor.
- Frenar intentos de acceso no autorizado (fuerza bruta) y detectar abuso.
- Investigar y reportar incidentes de seguridad.
- Diagnosticar fallas del servicio (registros técnicos y errores) y volver a mandar un aviso
  que no salió (cola de correos).
- Recuperar el servicio si se pierde la base de datos (respaldos cifrados, punto 6).

### 3.6 Operación del servicio y asesoría comercial al supermercado

Con los datos de negocio de cada supermercado cliente —no con los datos personales de su
gente— RECABRA opera y mejora el servicio que vende. Las finalidades de esa lectura, que el
punto 5.3 describe en detalle y que el reporte de transparencia declara dato por dato, son:

- **Asesoría comercial**: proponerle a cada supermercado qué espacio le conviene vender, a
  qué precio y a qué proveedor ofrecérselo, a partir de sus propios espacios, contratos y
  proveedores.
- **Salud de la cartera**: entender la ocupación, el ingreso contratado y el rendimiento de
  cada cliente para sostener el servicio.
- **Cobranza y administración de la cuenta**: el estado comercial, el uso de la cuenta y la
  facturación.
- **Mejora del servicio y de la plataforma**: entender cómo se usa el producto y qué le
  falta para funcionar mejor, sin identificar a ninguna persona.

### 3.7 Cobro del servicio

- Registrar lo que se pactó con cada supermercado y las cuentas de cobro o facturas que se
  le emiten.
- Registrar los pagos por transferencia y las retenciones, y conciliarlos con lo cobrado.
- **Avisar por correo** a la dueña del supermercado y al correo de facturación: que una
  cuenta de cobro está por vencer, que venció, que lleva días vencida, el **aviso formal**
  de que la cuenta va a pasar a sólo lectura (con la fecha), que pasó a sólo lectura, y la
  constancia de que se recibió un pago.
- **Restringir la cuenta a sólo lectura** cuando una cuenta de cobro lleva 30 días
  vencida, como dicen los términos del servicio, y levantar la restricción cuando se
  registra el pago. La restricción no borra ningún dato.
- Mostrarle a la dueña del supermercado, dentro de RECABRA, lo que debe y cómo pagarlo.

**Quién ve qué.** Los montos y las cuentas de cobro los ven sólo RECABRA (la operadora de
la plataforma) y la dueña del supermercado. El resto de su gente ve el estado de la cuenta
—al día, pago pendiente, sólo lectura, suspendida— y nada más: ni montos ni el motivo.

> **[VALIDAR CON ABOGADO]** Base de legalidad de esta finalidad: ¿alcanza con la ejecución
> del contrato con el supermercado (y el interés legítimo de cobrar lo debido), o hace
> falta una autorización expresa de la persona cuyo correo es el de facturación, que puede
> no ser usuaria de RECABRA y no haber aceptado esta política?

### 3.8 Lo que no hacemos

**Lo que NO hacemos con estos datos:** no se venden, no se alquilan y no se entregan a
terceros con fines publicitarios. No se usan para elaborar perfiles comerciales de
personas ni para tomar decisiones automatizadas que produzcan efectos jurídicos sobre
alguien. No se hace publicidad basada en ellos.

---

## 4. Con qué permiso los tratamos (base de legalidad)

### 4.1 Autorización previa, expresa e informada

La regla general de la Ley 1581 es que el tratamiento requiere la **autorización previa,
expresa e informada** del titular. En RECABRA esa autorización se pide y **queda
registrada** en tres momentos:

1. **Al fundar un supermercado** en la plataforma: sin aceptar esta política no se crea la
   cuenta del cliente.
2. **Al aceptar una invitación** para sumarse a un supermercado: sin aceptar esta política
   no se crea la membresía.
3. **Al ingresar**, para quienes ya tenían cuenta antes de que esta política existiera, y
   para quienes aceptaron una versión anterior a la vigente: se les pide una vez y queda
   registrada. No se les bloquea el acceso todos los días.

**Cada versión se acepta por separado.** La constancia guarda la versión concreta que se
aceptó, así que cuando se publica una versión nueva —como la 2026-09-v2, que cambió lo que
ve el operador de la plataforma (punto 5.3), o esta 2026-10-v3, que suma los proveedores de
tecnología, los plazos de conservación, el cobro y los derechos persona por persona— la
aceptación anterior deja de estar vigente y el sistema **vuelve a pedir la aceptación** en
el siguiente ingreso, sin borrar ni reescribir la constancia vieja. Las aceptaciones anteriores se conservan tal como quedaron: son la
prueba de qué texto aceptó cada persona y cuándo.

De cada aceptación se guarda **la versión de la política aceptada, la fecha y hora, la
dirección IP y en cuál de los tres momentos ocurrió**. Esa constancia es la prueba de la
autorización, tal como pide el artículo 7 del Decreto 1377 de 2013.

**Los Términos del servicio** son el contrato con el supermercado y los acepta su dueña:
cuando estén vigentes, al fundar el supermercado (junto con esta política) y, para un
supermercado que ya existía, en el siguiente ingreso de la dueña. Se guardan **la versión de
los términos, la versión de esta política que regía, el supermercado, la fecha, la IP y el
momento**. Mientras los términos no estén publicados, no se pide nada más que esta política.

### 4.2 Datos de terceros que carga el supermercado

Los correos del personal y los contactos de proveedores **los carga el supermercado**, no
la persona titular. En esos casos:

- El **supermercado** es quien debe haber obtenido la autorización de esas personas, o
  contar con otra base legal para tratarlas. Ver la sección 5.
- RECABRA trata esos datos **por cuenta del supermercado**, siguiendo sus instrucciones.

### 4.3 Interés legítimo en seguridad

El registro de direcciones IP en la bitácora y en los frenos de fuerza bruta responde al
deber legal de **conservar la información bajo las condiciones de seguridad necesarias
para impedir su adulteración, pérdida, consulta, uso o acceso no autorizado o fraudulento**
(artículo 17, literal d, de la Ley 1581). Sin esa anotación no se puede saber quién hizo
qué ni frenar un ataque.

> **[VALIDAR CON ABOGADO]** La Ley 1581 no tiene una figura de "interés legítimo" idéntica
> a la del reglamento europeo. El fundamento correcto en Colombia para tratar estos datos
> sin autorización adicional es el **deber de seguridad** del artículo 17 y las medidas
> del artículo 4, literal g. El abogado debe confirmar la redacción de esta sección y si
> conviene incluir estos usos dentro de la autorización que se pide en el alta.

---

## 5. Rol dual: quién responde por qué datos

Esta es la sección que más importa entender, y la que más se malinterpreta.

**RECABRA cumple dos papeles distintos al mismo tiempo**, y la ley les asigna
obligaciones diferentes (artículo 3, literales e y d, de la Ley 1581):

### 5.1 RECABRA como RESPONSABLE

Sobre los datos de **las personas que usan la plataforma** — quienes crean una cuenta,
fundan un supermercado o aceptan una invitación —, RECABRA es **responsable del
tratamiento**: decide para qué se usan esos datos, pide la autorización, publica esta
política y atiende directamente los derechos de esas personas.

Esto cubre: cuentas, correos, identificadores, membresías, invitaciones, constancias de
consentimiento, bitácora de acceso y frenos de seguridad de la plataforma.

### 5.2 El supermercado cliente como RESPONSABLE y RECABRA como ENCARGADO

Sobre los datos de **la gente del supermercado y de sus proveedores** —los correos del
administrador de sede, del gerente y del mercaderista; los contactos de las marcas; las
fotos de montaje; los contratos escaneados—, **el supermercado cliente es el responsable
del tratamiento** y **RECABRA es el encargado**.

Qué significa en la práctica:

| | El supermercado (responsable) | RECABRA (encargado) |
|---|---|---|
| Decide qué datos se cargan y para qué | Sí | No |
| Debe tener la autorización de esas personas | Sí | No |
| Debe tener su propia política de tratamiento | Sí | — |
| Guarda y procesa los datos | — | Sí, por cuenta del supermercado |
| Atiende primero un derecho de esas personas | Sí | Da soporte y ejecuta |
| Responde ante la SIC por esos datos | Sí, como responsable | Sí, por sus deberes de encargado |

**Consecuencia concreta:** si un proveedor o un empleado del supermercado quiere que le
borren o le corrijan sus datos, el camino natural es **hablar con el supermercado**, que
es quien decide. RECABRA ejecuta lo que el supermercado instruya y, si la solicitud le
llega directamente, la traslada al supermercado y le avisa a la persona a quién se la
trasladó (artículo 18, literal e, de la Ley 1581).

**Los datos de un supermercado nunca se mezclan con los de otro.** Cada cliente tiene su
propia base de datos separada; ser operador de la plataforma no abre la base de negocio de
ningún cliente. La única excepción son las métricas agregadas de operación descritas en el
punto 5.3, que por construcción no llevan datos personales.

> **[COMPLETAR]** Esta relación debe quedar además en un **contrato de transmisión de
> datos personales** o en una cláusula del contrato de servicio con cada supermercado
> (artículo 25 del Decreto 1377 de 2013), que fije la finalidad, las obligaciones del
> encargado y el deber de seguridad. Hoy no existe ese documento firmado.

### 5.3 El operador de la plataforma y las métricas agregadas del negocio

> **[VALIDAR CON ABOGADO]**

RECABRA opera una consola propia (`/plataforma`) para quien administra el servicio como
negocio. Desde esa consola, el **operador de la plataforma** ve **agregados exactos** del
negocio de cada supermercado cliente, **sin umbral** mínimo de contratos, y a cambio cada
supermercado cliente puede pedir cuando quiera un **reporte de transparencia** con cada
dato que la plataforma tomó de él, cómo lo calculó, para qué, y quién del operador lo
consultó y cuándo. Las dos mitades son un solo trato y hay que leerlas juntas.

**Qué cambió respecto de la versión anterior.** La versión 2026-09-v1 de esta política
aplicaba un **umbral de 3 contratos**: los promedios y sumas de canon, el top de
proveedores y la relación con la tarifa de referencia de un supermercado sólo se mostraban
cuando agrupaban al menos tres contratos activos del período, y por debajo de eso el dato
se omitía. Esta versión **retira ese umbral de 3 contratos**: la cifra sale exacta aunque
el supermercado tenga un solo contrato activo. La razón del cambio es que el umbral daba
una protección aparente —el total consolidado de todos los clientes permitía despejar por
diferencia la celda omitida— y, en su lugar, se le da al cliente algo que sí se puede
verificar: la trazabilidad completa de lo que se tomó de él y de quién lo miró.

**Ampliación de esta misma versión, antes de su despliegue.** El párrafo anterior describe
un cambio de **precisión**: las mismas cifras de siempre, ahora exactas. Lo que se agrega
acá es un cambio de **alcance**: además de los agregados, el operador pasa a ver el
**detalle de espacios y contratos** de cada cliente —espacio por espacio, con el contrato
vigente de cada uno— para poder prestarle el servicio de asesoría comercial descrito en el
punto (a). La versión 2026-09-v2 **todavía no se había publicado ni desplegado** cuando se
tomó esta decisión, así que la ampliación se escribe **dentro de la misma versión** y no
en una nueva: el titular lee y consiente el trato completo —agregados exactos sin umbral y
detalle de espacios y contratos, siempre de sólo lectura y siempre con bitácora— **una
sola vez**, en un único acto de aceptación, en lugar de aceptar dos veces en pocos días
dos mitades de un mismo cambio. Todo lo que el punto (b) enumera como prohibido lo sigue
siendo, sin excepción.

**a) Qué ve el operador.** De **todos** los supermercados clientes, uno por uno y también
sumado, y siempre en forma de agregados exactos, sin umbral:

- conteos: sedes con plano y espacios comercializables;
- el porcentaje de **ocupación** del período;
- el **canon promedio mensual** de los contratos activos (sin dato sólo cuando no hay
  ningún contrato activo: no existe el promedio) y el **ingreso contratado del mes**, que
  es la suma del canon de esos contratos;
- un **top de proveedores** por **nombre comercial del proveedor —depurado de datos de
  contacto: los correos y teléfonos que pudieran aparecer se enmascaran antes de
  mostrarse— y conteo de contratos activos**;
- la cantidad de **usuarios con cuenta** (personas con membresía activa) y la **fecha del
  último acceso** de cualquiera de ellas —la fecha, no quién entró—;
- el **estado de cuenta** comercial del cliente (activo, en gracia, sólo lectura o
  suspendido);
- las cifras mensuales de las que salen las anteriores, guardadas mes a mes: cuántos
  contratos activos hubo en el período, cuántas caras quedaron ocupadas y el canon total
  del mes, con la fecha en que se tomó esa foto;
- la **relación** porcentual entre el canon que el supermercado efectivamente cobra y su
  propia **tarifa de referencia**, junto con si configuró o no una tarifa (sí/no) y el
  conteo de contratos del período a los que no les aplica ninguna;
- la **lectura de adopción**: cuántas cuentas con **membresía** activa tiene el
  supermercado, cuántas de esas cuentas entraron en los últimos **30 días**, cuántos días
  pasaron desde el último acceso de cualquiera de ellas, si tiene contratos vigentes
  (sí/no), el **mes de alta** (mes y año, sin día) y una **clasificación** derivada de
  todo lo anterior, calculada por el sistema —nueva, activa, sin uso con contratos
  (*fantasma*), sin uso sin contratos (*dormida*) o sin cuentas—, agrupada además por mes
  de alta. Entre paréntesis van las etiquetas exactas que devuelve el sistema y que el
  cliente también ve en su reporte.

La **tarifa de referencia** del supermercado —cuánto dice él que vale cada espacio— es
información comercial suya y **nunca se muestra al operador**, ni por sede, ni en promedio,
ni sumada: lo único que cruza es la relación porcentual descrita arriba, que ahora también
sale sin umbral.

**El detalle de espacios y contratos, para el servicio de asesoría comercial.** Además de
esos agregados, y **de un cliente por vez**, el operador ve el **detalle de espacios y
contratos** de ese supermercado. Existe para una finalidad concreta y declarada: la
**asesoría comercial** que RECABRA le presta a cada cliente —decirle qué espacio le
conviene vender, a qué precio y a qué proveedor ofrecérselo— y la **mejora del servicio y
de la plataforma**. Lo que ve, taxativamente:

- por cada **espacio comercializable** del plano: su **código** y su **tipo** (góndola,
  punta de góndola, nevera y demás), la sede y la zona en que está y su área si está
  cargada, y si en el **período** consultado está **ocupado o libre** —o si *se libera*
  dentro de ese período, porque el contrato que lo ocupa vence antes de que termine—;
- del **contrato vigente** de ese espacio, cuando lo hay: el proveedor por su **nombre
  comercial**, depurado de datos de contacto —los correos y teléfonos que pudieran
  aparecer incrustados se enmascaran antes de mostrarse, igual que en el top de
  proveedores—, la **marca** que se exhibe, el **canon mensual** pactado y las **fechas de
  inicio y de fin**;
- el **resumen por tipo de espacio**: cuántos hay, cuántos ocupados y cuántos libres, y el
  canon promedio, mínimo y máximo de los contratos vigentes de ese tipo en ese cliente,
  junto con **si el cliente tiene una tarifa de referencia configurada para ese tipo
  (sí/no, nunca el valor de la tarifa)**;
- los **proveedores de ese cliente**: por cada uno, con el nombre comercial depurado,
  cuántos espacios ocupa, de qué tipos y en qué sedes, qué canon paga en total y en
  promedio, qué parte de los contratos vigentes del cliente representa, desde cuándo está y si tiene
  contratos que vencen en los próximos sesenta días;
- los **movimientos de los últimos doce meses**, mes a mes: qué contratos empezaron y
  cuáles terminaron o se cancelaron, con el proveedor, el espacio, el canon y la fecha;
- las **oportunidades** que se derivan de lo anterior: por cada espacio libre o que se
  libera, un **precio sugerido** calculado a partir de lo que **ese mismo cliente** cobra
  por los espacios de ese tipo o, si no cobra ninguno de ese tipo, a partir del promedio
  de toda la plataforma para ese tipo —que viaja como **un solo número**, sin desglose,
  sin sedes y sin el nombre de ningún otro supermercado—, y hasta tres **proveedores
  candidatos**, que son siempre proveedores **de ese mismo cliente**, con el canon que ya
  pagan;
- y las **recomendaciones** que el sistema arma con esos mismos datos, en orden de
  prioridad y con el canon mensual que está en juego: un espacio libre para vender, un
  contrato por vencer para renovar o reasignar, un tipo de espacio cuyo canon quedó por
  debajo del promedio del propio cliente, un proveedor que concentra buena parte de los
  espacios ocupados, una sede con la ocupación muy por debajo del resto, los tipos de
  espacio sin tarifa configurada o —si el cliente todavía no tiene ningún contrato— por
  dónde arrancar. La explicación que acompaña a cada recomendación **la redacta el
  sistema** a partir de esos mismos datos: es texto generado, no una nota de nadie, y no
  contiene ningún dato de contacto ni ninguna persona.

Este detalle abre **una sola base de cliente por consulta**, es de **sólo lectura** —el
operador no puede crear, modificar ni borrar nada del negocio de un cliente desde su
consola— y **queda anotado en la bitácora** con el correo del operador, el día, el cliente
y el período consultados, de modo que el propio cliente lo ve después en su reporte de
transparencia.

**b) Qué sigue estando prohibido.** Ni el cambio de precisión —cifras exactas, sin
umbral— ni la ampliación de alcance —el detalle de espacios y contratos— tocan esta lista,
que es la que hace que el trato siga siendo defendible. El operador **no ve, ni puede
ver**:

- los **datos de contacto de un proveedor**: el nombre de la persona de contacto, su
  teléfono y su correo, ni las **notas** internas que el supermercado escribe sobre él;
- las **notas** de un espacio ni las de un contrato —el texto libre que escribe la gente
  del supermercado—;
- las **fotos** de montaje ni ningún otro archivo o documento adjunto a un espacio o a un
  contrato;
- **ningún correo, nombre ni identificador de un usuario** del supermercado ni de sus
  proveedores, ni la **fecha de acceso de una persona en particular** —salvo lo que necesita
  para administrar la cuenta del cliente, que no es un dato de negocio: el correo de quien
  funda un supermercado (el aviso del alta y las altas en espera), el de la dueña que pide la
  supresión de su cliente y el correo de facturación—;
- el **nombre de un proveedor sin sanear** (los correos y teléfonos incrustados se
  enmascaran antes de cualquier lectura del operador, en el detalle igual que en los
  agregados);
- la **tarifa de referencia** en sí misma: sólo si está configurada (sí/no) y la relación
  porcentual con el canon efectivamente cobrado;
- **ningún dato de otro cliente dentro del detalle de uno**: el promedio de toda la
  plataforma que sostiene un precio sugerido es **un solo número por tipo de espacio**,
  sin desglose, sin sedes y sin el nombre de ningún otro supermercado;
- **nada en modo escritura**: el acceso del operador a los datos de negocio de un cliente
  es de **sólo lectura**, en el detalle igual que en los agregados.

**La única excepción: atender el derecho de una persona.** Cuando una persona concreta pide
conocer o suprimir sus datos (sección 7) —o el supermercado, como responsable, instruye que
se atienda al contacto de uno de sus proveedores—, el operador puede **buscar a esa persona**
por su correo, su teléfono o el proveedor del que es contacto, **en todas las bases**, y
exportar lo que hay de ella o **anonimizarla**. Es lo único que el operador puede escribir en
la base de un supermercado, y sólo para eso: queda una **constancia** (sin el correo de la
persona: una huella que no se puede leer), una línea en la **bitácora de la plataforma** con
el supermercado tocado —que el supermercado ve en su reporte de transparencia— y otra en la
**bitácora del supermercado**.

**c) El reporte de transparencia, como derecho del cliente.** Cualquier supermercado
cliente puede generar, cuando quiera, un **reporte de transparencia** de su propia cuenta.
El reporte contiene:

- el **catálogo** completo de los datos que la plataforma toma de él: por cada uno, su
  nombre, la definición en palabras (la fórmula), la fuente (de qué tabla sale), la
  finalidad —**asesoría**, **salud de la cartera**, **cobranza** o **mejora del servicio y
  de la plataforma**— y si sale saneado o sin hora. El catálogo del reporte etiqueta cada
  dato con una de las tres primeras finalidades, que son las que el sistema conoce como
  etiqueta; las entradas del **detalle de espacios y contratos** van etiquetadas como
  *asesoría*, que es su finalidad principal, y sirven además a la mejora del servicio y de
  la plataforma descrita en el punto 3.6;
- los **valores tomados mes a mes** dentro de una ventana de hasta 24 meses: los mismos
  agregados exactos que ve el operador, referidos sólo a ese cliente, junto con las cifras
  mensuales guardadas de las que salen (contratos activos, caras ocupadas, canon total,
  usuarios con cuenta y el top de proveedores saneado) y la fecha de cada captura;
- los **accesos del operador** que alcanzaron a ese cliente en la ventana —incluidas las
  consultas del **detalle de espacios y contratos** de ese cliente—: por cada uno, la
  **fecha sin hora**, el **correo del operador** que consultó, la acción y el período, más
  el conteo total;
- la **versión de la política** vigente, la versión que aceptó el dueño y el día en que la
  aceptó, y la referencia a esta sección 5.3 como base de la lectura.

Se pide de dos maneras, y las dos devuelven exactamente el mismo contenido: el **dueño**
del supermercado lo genera desde su propia sesión —`GET /api/clientes/mi-reporte-plataforma`,
con las mismas garantías que el export de la sección 7: sólo el dueño, sólo su cliente, con
un límite de pedidos por hora—, o se lo pide al operador, que puede entregárselo en una
asesoría. El reporte es **informativo**: no borra, no corrige y no cambia ningún dato; para
eso están los derechos de la sección 7.

**d) La bitácora.** Cada consulta del operador queda anotada —con el **correo del
operador**, el momento y el período consultado— en la **bitácora** de la plataforma: las
métricas, la tendencia histórica, la lectura de adopción, el listado de clientes, el panel
de solicitudes de supresión, el **detalle de espacios y contratos** de un cliente, el
propio reporte de transparencia y la atención de los **derechos de una persona** (exportar
o anonimizar, con el supermercado tocado). Esa bitácora es lo que
alimenta la lista de accesos del reporte: por eso el cliente puede comprobar, y no
solamente creer, quién miró sus cifras y cuándo.

Esto no cambia el reparto de responsabilidades del punto 5.2: el supermercado sigue siendo
el responsable del tratamiento de los datos de su gente y de sus proveedores, y RECABRA
sigue siendo el encargado. Lo que describe este punto es una capacidad interna de operación
del negocio —entender cuánto se usa el servicio y en qué estado está cada cartera, no
acceder a los datos personales que el supermercado trata—.

> **[VALIDAR CON ABOGADO] — sobre el cambio de esta versión.** A diferencia de lo decidido
> en las versiones anteriores de este punto 5.3, acá **sí se subió `VERSION_POLITICA`** —a
> `2026-09-v2`, en el encabezado de este documento y en la constante del backend a la vez—
> porque quitar el umbral es un **cambio material** de lo que se le informó al titular, y
> se disparó el **re-consentimiento** automático del punto 4.1 para toda la base de
> usuarios. Lo que el abogado tiene que validar es, puntualmente:
>
> 1. Si un **agregado construido sobre un solo contrato** —que en los hechos equivale al
>    canon de ese contrato puntual, aunque no se muestre ninguna fila ni ninguna persona—,
>    visible para el operador pero acompañado de la trazabilidad completa del reporte de
>    transparencia (catálogo, valores y accesos con fecha y correo del operador), es
>    compatible con la finalidad informada al titular y con el contrato de encargo que
>    exige el punto 5.2. Si la conclusión fuera que no lo es, el camino es restringir la
>    lectura del operador, no ampliar el reporte.
> 2. Si la **relación** entre el canon cobrado y la **tarifa de referencia**, ahora también
>    sin umbral, debe tratarse como **información comercial reservada del supermercado
>    cliente** —no es un dato personal, pero sí un dato de negocio de un tercero— y, por lo
>    tanto, si conviene cubrir expresamente su tratamiento en el contrato de servicio del
>    punto 5.2.
>
> Sigue abierta, además, la pregunta que el contador del equipo dejó marcada: el **nombre
> comercial** de un proveedor puede, en algunos casos, coincidir con el nombre de una
> persona natural (un proveedor unipersonal que factura a su propio nombre) aun después del
> saneo de correos y teléfonos. Que el abogado evalúe si ese escenario —un nombre comercial
> que ES también el nombre de una persona determinable— cae bajo el artículo 3 de la Ley
> 1581 y qué tratamiento adicional corresponde; el retiro del umbral de 3 contratos vuelve
> esa pregunta más urgente, porque ya no hay ninguna agrupación mínima que sirva de
> disociación. Y sigue abierta la de la **fecha del último acceso** —y la de los días sin
> acceso— de un supermercado que tiene **una sola cuenta activa**: si deja de ser un dato
> de la organización y pasa a ser un dato de esa persona determinable. El mismo
> interrogante alcanza al **día en que se aceptó esta política**, que el reporte muestra sin
> decir quién la aceptó: en un supermercado con un solo dueño, esa fecha es atribuible a esa
> persona.

> **[VALIDAR CON ABOGADO] — sobre el detalle de espacios y contratos.** La ampliación
> descrita en el punto (a) es un cambio de **alcance**, no de precisión, y plantea dos
> preguntas propias que las anteriores no cubren:
>
> 1. El **canon y las fechas de un contrato individual**, junto al **nombre comercial** del
>    proveedor, son a la vez información comercial del supermercado cliente e información
>    de un **tercero que puede ser una persona natural** (un proveedor unipersonal que
>    factura a su propio nombre). Que el abogado confirme si el **contrato de encargo** del
>    punto 5.2 y la finalidad de **asesoría comercial** informada en esta política alcanzan
>    para que el operador lea ese dato contrato por contrato —y no sólo agregado—, o si
>    hace falta una autorización o una cláusula adicional del supermercado cliente, y qué
>    tratamiento corresponde cuando el nombre comercial coincide con el de una persona
>    determinable. Si la conclusión fuera que no alcanza, el camino es **restringir la
>    lectura del operador**, no ampliar el reporte.
> 2. El **precio sugerido calculado sobre el promedio de toda la plataforma** usa datos de
>    negocio de **otros clientes** en beneficio de uno. Viaja como **un solo número por
>    tipo de espacio**, sin desglose, sin sedes y sin nombres, de modo que ningún cliente
>    puede identificar a otro; aun así, es un uso cruzado. Que el abogado confirme si ese
>    uso queda cubierto por el contrato de servicio del punto 5.2 —como estadística
>    agregada del servicio— o si hay que informarlo y pactarlo expresamente con cada
>    supermercado, y si la disociación por promedio es suficiente cuando la plataforma
>    tiene pocos clientes con espacios de ese tipo.

> **[VALIDAR CON ABOGADO]** Confirmar que estos agregados —conteos, porcentajes, promedios
> y sumas de canon ya sin umbral, nombre comercial de un proveedor junto a un conteo de
> contratos, una fecha de último acceso sin identidad y la lectura de adopción con su
> clasificación— no constituyen, ni siquiera combinados entre sí, un dato personal en el
> sentido del artículo 3 de la Ley 1581 (vinculable a una persona natural determinada o
> determinable), y que el reporte de transparencia del punto (c) es una medida adecuada de
> información al titular en los términos del artículo 8, literal b, de esa ley.

---

## 6. Cuánto tiempo conservamos los datos

La ley exige que los datos se conserven solo mientras sean necesarios para la finalidad
que los justifica (artículo 4, literales c y d, de la Ley 1581; artículo 11 del
Decreto 1377).

**Dos reglas que no cambian con los plazos de abajo:**

- **Los datos de negocio NO se borran por el estado de cuenta del supermercado.** Si un
  cliente entra en mora, queda en solo lectura o queda suspendido, se le corta el acceso,
  nunca la información: apagar el servicio no puede significar destruir la prueba de lo
  que se contrató.
- **Lo que se borra por plazo lo borra el sistema solo**, en su mantenimiento (varias veces
  al día). Cada plazo marcado «se borra solo» está programado así; los que dicen
  [COMPLETAR: confirmar plazo] son una propuesta que el abogado tiene que confirmar, y se
  cambian sin tocar el sistema.

| Qué | Cuánto se guarda | Cómo se borra |
|---|---|---|
| Contratos, espacios, proveedores y planos | Mientras dure la relación con el supermercado y después lo que exijan las obligaciones comerciales, contables y tributarias. [COMPLETAR: confirmar plazo después de terminada la relación] | Al terminar el servicio, cuando el supermercado lo pide (sección 7.1 b) |
| Fotos de montaje y planometrías | Mientras dure el contrato y sus renovaciones, y **5 días** después de que termina sin renovarse | Se borran solas cuando el supermercado tiene activada la limpieza de fotos vencidas; si no, se conservan hasta que el supermercado las borra. Una foto que no está atada a ningún contrato que haya terminado se conserva. [COMPLETAR: confirmar plazo] |
| Fotos de la guía de montaje, contratos escaneados y demás documentos | Mientras dure la relación con el supermercado | A mano, o al terminar el servicio |
| Reportes de montaje (quién, cuándo, montado o no) | Mientras dure la relación con el supermercado: son la prueba ante un reclamo del proveedor. [COMPLETAR: confirmar plazo] | Al terminar el servicio |
| Bitácora del supermercado | **365 días** [COMPLETAR: confirmar plazo] | Se borra sola |
| Bitácora de la plataforma (accesos del operador) | **25 meses**: uno más que la ventana de 24 meses del reporte de transparencia, para que el reporte esté siempre completo [COMPLETAR: confirmar plazo] | Se borra sola |
| Intentos fallidos de ingreso, de cuenta y de alta (IP y hora) | **1 día** (el freno mira los últimos 15 minutos) | Se borran solos |
| Sesiones cerradas con «Salir» y enlaces cortados | Hasta que vence la sesión o el enlace: después ya no abren nada | Se borran solas |
| Altas de supermercado en espera | **90 días** si nadie las atendió [COMPLETAR: confirmar plazo] | Se borran solas |
| Cola de correos | Lo enviado, **30 días**; lo que no se pudo enviar, **90 días** [COMPLETAR: confirmar plazo] | Se borran solos |
| Invitaciones | Hasta que se usan o caducan (7 días); una usada queda como constancia de quién invitó a quién | — |
| Cuentas de usuario | Mientras la persona conserve al menos una membresía activa. Desactivar la membresía corta el acceso de inmediato. Sin ninguna membresía activa, se propone conservarla hasta dos años después del último ingreso [COMPLETAR: confirmar plazo] | Hoy no se borra sola: se anonimiza cuando la persona lo pide (sección 7) |
| Constancias de aceptación de la política y de los términos | Mientras se traten los datos de la persona y después el tiempo de prescripción de las acciones que la constancia sirve para defender [COMPLETAR: confirmar plazo] | No se borran con la supresión: quedan sin el correo de la persona |
| Cuentas de cobro, facturas, pagos y el historial del estado de cuenta | **[VALIDAR CON ABOGADO: diez (10) años]** desde [VALIDAR CON ABOGADO: la fecha del último asiento, documento o comprobante], como soporte contable y tributario, también después de que el supermercado deja de ser cliente | — |
| Datos de facturación de la suscripción | Mientras dure la suscripción | Al borrar el supermercado |
| Métricas mensuales del operador (sin datos de personas; el nombre del proveedor, saneado) | La ventana del reporte más un año (36 meses); el total de la plataforma, que no lleva ningún dato de un cliente ni de una persona, sin plazo | Se borran solas |
| Respaldos cifrados de toda la plataforma | **14 días** cada copia | Se borran solos (GitHub y el depósito de respaldos) |
| Registros técnicos del servidor | Lo que guarde el plan de Render. [COMPLETAR: plazo del plan contratado] | Los borra Render |
| Errores enviados a Sentry (si está activado) | Lo que guarde el plan de Sentry. [COMPLETAR: plazo del plan contratado] | Los borra Sentry |
| Lo que guarda el navegador | Hasta que quien usa el equipo lo borra (punto 10.1) | En el equipo |

> **[COMPLETAR]** Escribir junto a cada plazo su sustento (obligación contable, tributaria o
> probatoria). **[VALIDAR CON ABOGADO]** La referencia habitual para la facturación es el artículo 28 de la Ley 962
> de 2005, que modificó el artículo 60 del Código de Comercio (diez años), y para los
> soportes tributarios el artículo 632 del Estatuto Tributario y el artículo 46 de la Ley
> 962 de 2005. Un plazo indefinido no cumple la ley.

**Una supresión y los respaldos.** Cuando se anonimiza a una persona (sección 7), sus datos
siguen en los respaldos cifrados hasta que esos respaldos vencen (14 días). Si en ese plazo
hubiera que restaurar un respaldo, la supresión se vuelve a aplicar antes de volver a
atender.

---

## 7. Derechos del titular y cómo se ejercen

Toda persona cuyos datos estén en RECABRA tiene, por el artículo 8 de la Ley 1581, derecho
a:

| Derecho | Qué significa |
|---|---|
| **Conocer** | Saber qué datos suyos hay, de forma gratuita |
| **Actualizar** | Que se pongan al día los datos que cambiaron |
| **Rectificar** | Que se corrijan los datos parciales, inexactos, incompletos o engañosos |
| **Suprimir** | Pedir que se borren, cuando no haya un deber legal o contractual de conservarlos |
| **Revocar la autorización** | Retirar el permiso que dio en su momento |
| **Ser informado** | Saber cómo se están usando sus datos |
| **Presentar quejas ante la SIC** | Acudir a la Superintendencia de Industria y Comercio cuando se incumple la ley |

### 7.1 Cómo se ejercen dentro del sistema

RECABRA tiene estas vías construidas en el producto, además del canal de correo:

**a) Descargar los datos del supermercado — `GET /api/clientes/mi-export`**

El **dueño** del supermercado (rol *owner*) puede descargar en cualquier momento un
archivo JSON con los datos de negocio de su cliente: espacios, contratos, proveedores y
planos. Es la forma más directa de ejercer el derecho a **conocer** y de llevarse la
información.

Restricciones, por diseño:

- **Solo el dueño.** Un administrador que no sea el fundador, un mercaderista o el ingreso
  con las claves compartidas antiguas reciben un rechazo. El permiso se verifica contra la
  membresía real, no contra el rol que viaja en la sesión.
- **La descarga NO incluye la bitácora completa**, porque contiene direcciones IP y
  acciones de otras personas: entregarle a un cliente los datos de terceros sería crear un
  problema nuevo para resolver uno viejo.
- **La descarga NO incluye claves ni sus versiones cifradas**, ni las tablas de intentos
  fallidos, ni el estado de cuenta.
- Hay un límite de descargas por hora, para que la función no se convierta en un canal de
  extracción masiva.

**b) Solicitar la supresión — `POST /api/clientes/solicitar-supresion`**

El dueño del supermercado puede **solicitar** que se supriman los datos de su cliente. La
solicitud queda registrada con quién la hizo, cuándo y por qué motivo, y aparece en el
panel del operador de la plataforma.

**Nada se borra de forma automática.** La solicitud la atiende **una persona**, que
verifica que no exista un deber legal o contractual de conservar la información antes de
ejecutarla, y deja anotado qué se hizo. Un borrado automático de una base de contratos es
irreversible y no admite el juicio que la ley exige.

**c) Reporte de transparencia — `GET /api/clientes/mi-reporte-plataforma`**

El **dueño** del supermercado puede generar, cuando quiera, el reporte de transparencia
descrito en el punto 5.3: el catálogo de los datos que la plataforma toma de su cuenta —con
la definición, la fuente y la finalidad de cada uno—, los valores mes a mes de la ventana
que pida (hasta 24 meses), la lista de los accesos del operador que alcanzaron a su cuenta
—con la fecha, sin hora, y el correo del operador que consultó— y la versión de la política
que aceptó. Es la forma de ejercer el derecho a **ser informado** sobre la lectura agregada
que hace el operador de la plataforma.

Las mismas restricciones que el export: **sólo el dueño**, verificado contra la membresía
real y no contra el rol de la sesión; sólo su propio supermercado; y un límite de pedidos
por hora. El reporte **no borra ni modifica nada** —es informativo—, y también se lo puede
pedir al operador, que lo entrega con idéntico contenido.

**d) Descargar mis datos — `GET /api/auth/mis-datos`**

**Cualquier persona con cuenta propia** —dueña, administración o mercaderista— puede bajar,
desde el menú de su cuenta, un archivo con **sus** datos: su cuenta (correo, nombre, fechas,
membresías), las constancias de lo que aceptó, y lo que la menciona en los supermercados
donde tiene acceso hoy (dónde aparece su correo o su nombre y las acciones suyas que anotó la
bitácora: cuándo, qué y desde qué IP). Lo que es de otras personas —el contenido de un aviso
que también le llegó a otros, el detalle de la bitácora— se cuenta, no se copia; y a quien es
mercaderista no se le muestra ningún texto que lleve montos. Tiene el mismo límite de
descargas por hora que el export del supermercado, y deja una línea en la bitácora.

**e) Una persona concreta, atendida por RECABRA**

Quien no tiene cuenta —el contacto de un proveedor, alguien a quien le llegan los avisos,
quien dejó de trabajar en el supermercado— o quien prefiere escribir, lo pide por el canal
de la sección 8. El operador de la plataforma la busca por su correo, su teléfono o el
proveedor del que es contacto, en **todas** las bases de RECABRA, y:

- para una **consulta**, le entrega un archivo con todo lo que hay de ella;
- para una **supresión**, la **anonimiza**: donde estaba su correo, su teléfono o su nombre
  queda «titular-suprimido-…», su cuenta deja de poder entrar, el contacto del proveedor
  pierde nombre, teléfono y correo, y se borra lo que no es constancia de nada (invitaciones
  sin usar, altas en espera, su dirección en los avisos todavía sin mandar). **Lo que la ley
  obliga a conservar no se borra, se anonimiza**: los contratos (el nombre de la empresa
  proveedora queda, porque es la contraparte), la bitácora, la facturación y las
  constancias de autorización.

Cada atención deja una constancia —sin el correo de la persona—, una línea en la bitácora de
la plataforma y otra en la de cada supermercado tocado (punto 5.3). Se responde en los
plazos de la sección 8: diez días hábiles una consulta y quince un reclamo.

Fuera del sistema quedan, y así se le informa a la persona: su cuenta en Google/Firebase
(RECABRA la borra en la consola de Firebase cuando pide la supresión), los respaldos
cifrados (vencen solos a los 30 días), los registros técnicos del servidor y los correos que
ya se le entregaron a otros.

Ni el export, ni la solicitud de supresión, ni este reporte, ni la descarga de los datos de
cada persona se cortan por el estado comercial de la cuenta: el cobro no puede bloquear el
ejercicio de los derechos.

### 7.2 Quién puede pedir qué

- **Usuarios de la plataforma** (dueños, administradores, mercaderistas): ejercen sus
  derechos directamente ante RECABRA, por el canal de la sección 8.
- **Personal del supermercado y contactos de proveedores**: el responsable es el
  supermercado (ver sección 5). Pueden dirigirse al supermercado o a RECABRA; si escriben a
  RECABRA, se traslada la solicitud al supermercado y se les informa a quién se trasladó.
  Cuando el supermercado lo instruye —o no contesta dentro del plazo—, RECABRA la ejecuta
  con la vía e) del punto 7.1. [VALIDAR CON ABOGADO: si RECABRA, como encargada, puede
  ejecutar la supresión sin la instrucción del supermercado cuando éste no contesta.]
- **Personas que aparecen incidentalmente en una foto de montaje**: pueden pedir por el
  canal de la sección 8 que la imagen se retire, indicando el supermercado, la sede y la
  fecha aproximada.

### 7.3 Revocar la autorización

Se puede revocar en cualquier momento por el canal de la sección 8. Hay que tener en
cuenta que **revocar la autorización sobre los datos de la cuenta implica no poder seguir
usando la plataforma**, porque sin identificación no hay forma de dar acceso ni de
distinguir permisos. La revocación no alcanza a los datos que exista obligación legal o
contractual de conservar.

---

## 8. Consultas, reclamos y plazos

### 8.1 Canal de atención

| | |
|---|---|
| **Correo** | [COMPLETAR: correo de atención al titular] |
| **Dirección física** | [COMPLETAR: dirección para radicar por escrito] |
| **Teléfono** | [COMPLETAR] |
| **Horario de atención** | [COMPLETAR] |

Para identificar a quien pide, se solicita el correo con el que usa la plataforma y, si la
solicitud es de un tercero, el documento que acredite la representación.

### 8.2 Consultas (artículo 14 de la Ley 1581)

Una **consulta** es pedir que le informen qué datos suyos hay.

- Se responde en **máximo diez (10) días hábiles** contados desde el día siguiente a la
  fecha de recibo.
- Si no es posible responder en ese plazo, se le informa al interesado los motivos y la
  fecha en que se atenderá, que **no puede superar los cinco (5) días hábiles siguientes**
  al vencimiento del primer plazo.

### 8.3 Reclamos (artículo 15 de la Ley 1581)

Un **reclamo** es pedir que corrijan, actualicen o supriman un dato, o denunciar un
presunto incumplimiento.

- El reclamo debe traer la identificación del titular, la descripción de los hechos, la
  dirección de contacto y los documentos que se quieran hacer valer.
- Si el reclamo está incompleto, se le pide al interesado que lo complete dentro de los
  **cinco (5) días** siguientes. Si pasan **dos (2) meses** sin respuesta, se entiende que
  desistió.
- Mientras el reclamo esté en trámite, el dato queda marcado con la leyenda **"reclamo en
  trámite"** y el motivo, hasta que se decida.
- Se resuelve en **máximo quince (15) días hábiles** contados desde el día siguiente a la
  fecha de recibo.
- Si no es posible resolver en ese plazo, se le informan los motivos y la fecha en que se
  atenderá, que **no puede superar los ocho (8) días hábiles siguientes** al vencimiento
  del primer plazo.

### 8.4 Queja ante la Superintendencia de Industria y Comercio

El titular puede presentar queja ante la **Delegatura para la Protección de Datos
Personales de la Superintendencia de Industria y Comercio (SIC)**, que es la autoridad
colombiana en la materia.

Por el **artículo 16 de la Ley 1581**, esa queja procede **solo después de haber agotado
el trámite de consulta o reclamo** ante el responsable o el encargado. Es decir: primero
hay que escribirle a RECABRA (o al supermercado, según corresponda) y esperar la
respuesta.

Canales de la SIC: [COMPLETAR: sitio web y canal de radicación vigentes de la SIC al
momento de publicar. VALIDAR CON ABOGADO que la dirección y el procedimiento sean los
actuales.]

---

## 9. A quién le entregamos datos (transmisiones y transferencias)

RECABRA **no vende ni cede datos personales**. Sí se apoya en proveedores de tecnología
que, para prestar el servicio, procesan datos por cuenta de RECABRA. En el lenguaje de la
Ley 1581 esto es una **transmisión** a un **encargado**, no una transferencia a otro
responsable.

### 9.1 Suboperadores

| Proveedor | Para qué | Qué datos ve | Dónde |
|---|---|---|---|
| **Google — Firebase Authentication** | Verificar la identidad de quien entra (ingreso con Google o con correo y contraseña) | Correo, nombre, identificador de cuenta, contraseña de la cuenta (que RECABRA nunca ve), y la dirección IP y el navegador de quien inicia sesión | Infraestructura de Google [VALIDAR CON ABOGADO: región concreta según la configuración del proyecto de Firebase] |
| **Render** | Alojar la aplicación, las bases de datos (con los archivos y las fotos) y los registros técnicos | Todo lo que la aplicación almacena, y la IP y la ruta de cada pedido | Estados Unidos [COMPLETAR: región del servicio en Render] |
| **Proveedor de correo saliente: Brevo o SendGrid**, según cuál se configure [COMPLETAR: cuál se usa] | Enviar los avisos automáticos, las invitaciones y las guías de montaje | Las direcciones de los destinatarios y el **contenido entero** de cada aviso: datos del contrato, la constancia de un pago o una cuenta de cobro, y los **enlaces sin contraseña** (invitación, aviso de montaje, guía), que abren lo que el correo describe | [COMPLETAR: país del proveedor elegido] |
| **GitHub (Microsoft) — GitHub Actions** | Hacer el respaldo nocturno de todas las bases y guardarlo 14 días | Una copia **cifrada** de todas las bases; GitHub no tiene la clave para abrirla | Estados Unidos |
| **Depósito de respaldos (Cloudflare R2 o Amazon S3)**, si se configura | Guardar una segunda copia del respaldo cifrado, 14 días | La misma copia cifrada, sin la clave | [COMPLETAR: proveedor y región, si se usa] |
| **Sentry**, si se activa | Avisar de errores del sistema | El error técnico, sin la IP ni las cabeceras de quien pidió y sin direcciones de correo | [COMPLETAR: región del proyecto en Sentry, si se usa] |

RECABRA no usa servicios de publicidad, de análisis de uso ni fuentes tipográficas de
terceros: el navegador sólo se conecta con RECABRA y, para iniciar sesión, con Google.

### 9.2 Transmisión internacional

La aplicación, la base de datos y los respaldos están alojados en **Estados Unidos**, la
autenticación la presta **Google**, y los avisos salen por el proveedor de correo de la
tabla de arriba. Esto implica que los datos salen de Colombia.

El artículo 26 de la Ley 1581 prohíbe la transferencia a países que no ofrezcan un nivel
adecuado de protección, con excepciones; y el artículo 25 del Decreto 1377 aclara que
**las transmisiones a un encargado no requieren autorización adicional del titular cuando
existe un contrato de transmisión** que fije la finalidad, el alcance y las obligaciones
de seguridad del encargado.

> **[VALIDAR CON ABOGADO]** Dos puntos concretos:
>
> 1. Si Estados Unidos figura o no en el listado de países con nivel adecuado de
>    protección que mantiene la SIC, y qué versión de ese listado está vigente. Este dato
>    ha cambiado con el tiempo y no debe darse por sabido.
> 2. Si los términos contractuales estándar de Google Cloud/Firebase, de Render, de
>    GitHub, del proveedor de correo y, si se usan, del depósito de respaldos y de Sentry
>    satisfacen el requisito de "contrato de transmisión" del artículo 25 del Decreto 1377,
>    o si hay que suscribir un anexo de tratamiento de datos con cada uno.
>
> Si ninguna de las dos vías aplica, la alternativa es incluir la autorización expresa del
> titular para la transmisión internacional en el texto que se acepta al alta.

### 9.3 Otras entregas

Se pueden entregar datos a autoridades judiciales o administrativas cuando lo exija una
orden legítima, y a asesores profesionales sujetos a deber de confidencialidad.

---

## 10. Seguridad de la información

Medidas que hoy están implementadas:

- **Cada supermercado tiene su propia base de datos**, separada de la de los demás.
- **Las contraseñas nunca se guardan en texto legible.** Las de las cuentas individuales
  las custodia Google; las claves compartidas del método antiguo —apagado— se guardarían
  con hash Argon2id, que es irreversible.
- **Los precios y valores de contrato no llegan al rol de mercaderista**: el servidor los
  borra de la respuesta antes de enviarla, no la pantalla.
- **Frenos de fuerza bruta** por dirección IP en el ingreso, en la autenticación por cuenta
  y en la creación de supermercados nuevos, y un tope diario de altas.
- **«Salir» cierra la sesión en el servidor**: aunque alguien haya copiado esa sesión, deja
  de servir. Un enlace de montaje o de guía se puede cortar antes de que venza.
- **La sesión no viaja en las direcciones**: las imágenes y documentos se abren con un
  permiso aparte que dura 15 minutos.
- **La consola del operador** puede exigir verificación en dos pasos.
- **Bitácora** de todo lo que cambia algo o abre una puerta, y de cada consulta del
  operador.
- **Los registros técnicos no llevan direcciones de correo ni los códigos de los enlaces.**
- **Respaldo nocturno cifrado** de todas las bases, guardado 14 días.
- **Desactivar una membresía corta el acceso de esa persona en el pedido siguiente.**
- Cabeceras de seguridad del navegador y política de contenido en todas las respuestas.
- Revisión automática de vulnerabilidades en las dependencias del proyecto.

Ninguna medida elimina el riesgo por completo. Si ocurre un incidente que comprometa datos
personales, RECABRA lo informará a la Superintendencia de Industria y Comercio conforme al
**artículo 17, literal n, de la Ley 1581** —que obliga a informar a la autoridad cuando se
presenten violaciones a los códigos de seguridad y existan riesgos en la administración de
la información de los titulares— y a los titulares y clientes afectados.
[COMPLETAR: plazo interno de reporte y responsable de hacerlo.]

### 10.1 Lo que guarda el navegador

RECABRA no pone cookies. Lo que sigue lo guarda el navegador de quien lo usa, **en ese
equipo**, y no sale de ahí salvo para hablar con RECABRA:

| Qué | Para qué | Hasta cuándo |
|---|---|---|
| **La sesión** (el permiso firmado de la sesión, el correo, el nombre, el supermercado y el rol) | No tener que volver a entrar al recargar la página | Hasta «Salir» (la sesión deja de servir a las 12 horas) |
| **Los planos de las sedes**, con los nombres que el supermercado les puso, las cámaras del 2D y del 3D y **el valor de las repisas vendidas desde el 3D** | Que el plano abra al instante y siga mostrándose sin conexión | **Queda después de «Salir»**; se reemplaza al entrar a otro supermercado en el mismo equipo |
| La sesión de Google/Firebase | Renovar el inicio de sesión sin pedir la contraseña | Hasta «Salir» |
| El enlace de montaje o de la guía con el que se entró | Seguir en el mismo trabajo al recargar | Hasta cerrar la pestaña |
| Un **reporte de montaje que no se pudo enviar** (con su foto, la nota y el nombre escrito) | Mandarlo solo cuando vuelve la señal | Hasta que llega al servidor |
| Preferencias: tema claro u oscuro, la última pestaña y el último supermercado elegido, avisos que alguien cerró | Que la pantalla quede como la persona la dejó | Hasta que se borran los datos del navegador |

**Decisión tomada y riesgo aceptado:** los planos con el valor de las repisas quedan en el
equipo después de «Salir» para que el plano abra al instante. Quien usa RECABRA en un
**equipo compartido** debe borrar los datos de navegación al terminar; la responsabilidad
sobre ese equipo es de quien lo usa, y así lo dicen los Términos del servicio.

> **[VALIDAR CON ABOGADO]** Si este aviso alcanza como información al titular sobre el
> almacenamiento en su equipo, o si hace falta mostrarlo en la pantalla de ingreso.

---

## 11. Vigencia y versionado

- **Versión de esta política: 2026-10-v3.**
- **Vigencia: desde octubre de 2026** y hasta que se publique una versión nueva.
- El tratamiento de los datos se mantiene mientras dure la relación con cada titular y
  durante los plazos de conservación de la sección 6.

Cada versión de esta política tiene un identificador propio, y el sistema **guarda qué
versión aceptó cada persona y cuándo**. Cuando se publique una versión nueva que cambie de
forma sustancial las finalidades o el tratamiento, se comunicará a los titulares y, cuando
la ley lo exija, se pedirá una nueva aceptación.

### Historial de versiones

| Versión | Qué cambió |
|---|---|
| **2026-09-v1** | Primera versión: rol dual, consentimiento registrado por versión, derechos del titular dentro del producto, y las métricas agregadas del operador sujetas a un umbral de 3 contratos. |
| **2026-09-v2** | El operador ve agregados exactos sin umbral; reporte de transparencia como derecho del cliente. Cambio material: dispara el re-consentimiento del punto 4.1. Antes de su despliegue, esta misma versión se amplió con el detalle de espacios y contratos (ver la fila siguiente). |
| ↳ 2026-09-v2, ampliación previa al despliegue (2026-09-05) | El operador pasa a ver, además de los agregados, el **detalle de espacios y contratos** de cada cliente para la asesoría comercial (punto 5.3 (a)), con la finalidad nueva de **mejora del servicio y de la plataforma** (punto 3.6), anotado en la bitácora y declarado en el reporte de transparencia. **No se creó una versión nueva**: la 2026-09-v2 todavía no se había publicado ni desplegado, y el titular consiente el trato completo en un solo acto de aceptación. |
| **2026-10-v3** | Revisión contra el producto (2026-10-30): todos los proveedores de tecnología (correo, respaldos en GitHub y en un depósito, Sentry) y lo que ve cada uno (9.1); lo que guarda el navegador, incluido el plano con valores después de «Salir» (2.7 y 10.1); las bitácoras, los registros técnicos, los errores y la cola de correos (2.5); la autoría de los registros, las altas en espera y la aceptación de los Términos del servicio (2.1 y 4.1); el cobro de la suscripción (2.6 y 3.7); los plazos de conservación por categoría, con lo que se borra solo (6); los derechos persona por persona: «Descargar mis datos» y la atención del operador que exporta o anonimiza (5.3 y 7.1 d y e). Cambio material: dispara el re-consentimiento del punto 4.1. |

> Nota técnica para quien mantiene el sistema: el identificador `2026-10-v3` es el mismo
> valor de la constante `VERSION_POLITICA` del backend (`app/models/consentimiento.py`). Si
> se publica una versión nueva de este documento hay que cambiar los dos a la vez, o las
> constancias de consentimiento apuntarán a un texto que ya no existe. Subir la constante no
> reescribe las filas viejas: quien aceptó la versión anterior queda sin fila para la nueva
> y el flujo del punto 4.1 se la vuelve a pedir, sin ningún backfill.

---

> **BORRADOR PARA REVISIÓN DE ABOGADO** — este documento no constituye asesoría legal.
> Antes de publicarlo hay que completar todos los campos marcados con **[COMPLETAR]** y
> resolver los puntos marcados con **[VALIDAR CON ABOGADO]**.
