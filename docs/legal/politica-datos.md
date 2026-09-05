> **BORRADOR PARA REVISIÓN DE ABOGADO** — este documento no constituye asesoría legal.

# Política de Tratamiento de Datos Personales — RECABRA

**Versión: 2026-09-v1 · Vigencia: septiembre 2026**

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
  el rol que se le reservó, quién lo invitó y cuándo caduca la invitación.
- **Constancia de aceptación de esta política**: la versión aceptada, la fecha, la
  dirección IP desde la que se aceptó y en qué momento se aceptó (al fundar el
  supermercado, al aceptar una invitación o al ingresar).

**Nota importante:** RECABRA **no almacena contraseñas de las cuentas individuales**. Esas
las guarda el servicio de autenticación de Google (Firebase Authentication); RECABRA solo
recibe y verifica un comprobante de identidad firmado. Las claves compartidas por rol del
método de ingreso antiguo sí se guardan en el sistema, pero **cifradas de forma
irreversible** (hash Argon2id): no se pueden leer ni recuperar, solo comparar.

### 2.2 Personal de los supermercados clientes

Personas que trabajan en el supermercado y quedan registradas aunque no tengan cuenta:

- **Correos de aviso**: las direcciones del administrador de cada sede, del gerente
  operacional y del mercaderista, que reciben los avisos automáticos cuando se firma un
  contrato o cuando algo vence. Se cargan a mano en la configuración del supermercado.
- **Reportes de montaje**: cuando alguien confirma que armó (o que no pudo armar) una
  exhibición, se guarda el **nombre que esa persona escribe**, su rol, la fecha y hora que
  pone el servidor, el motivo si no se pudo, y una nota libre.

### 2.3 Contactos de proveedores

De las marcas y distribuidores que alquilan espacio:

- **Nombre de la empresa proveedora**, **nombre de la persona de contacto**, **teléfono**,
  **correo electrónico** y **notas** que escriba el comercial del supermercado.

Cuando el proveedor es una persona natural (un comerciante independiente), esos datos son
todos datos personales suyos, incluido el valor del contrato.

### 2.4 Imágenes y archivos

- **Fotos de montaje** que sube el mercaderista desde el celular para probar que la
  exhibición quedó armada. Se toman en la sala de ventas de un supermercado en horario de
  operación: **pueden captar personas de forma incidental** — clientes que pasan,
  empleados de la tienda. No se toman para identificar a nadie y no se les aplica ningún
  tipo de reconocimiento facial ni análisis biométrico.
- **Planometrías** (la foto o el PDF que manda el proveedor con el diseño de la
  exhibición) y **artes de producto**.
- **Contratos escaneados** y otros documentos que se adjuntan al espacio. Pueden contener
  nombres, firmas y números de identificación de quienes los suscribieron.

### 2.5 Datos técnicos de seguridad

- **Direcciones IP en la bitácora**: cada acción que cambia algo o abre una puerta
  (guardar o cancelar un contrato, subir un documento, ingresar al sistema, cambiar una
  clave) queda anotada con la fecha, el rol, el correo de quien la hizo y la dirección IP
  desde la que se hizo.
- **Direcciones IP de los frenos de seguridad**: los intentos fallidos de ingreso, de
  autenticación con cuenta y de creación de un supermercado nuevo se cuentan por dirección
  IP para frenar ataques de fuerza bruta. De esos intentos solo se guarda la IP y la hora
  —nunca el correo ni la clave que se probó—, y se borran solos con el tiempo.
- **Motivo del estado de cuenta**: si un supermercado queda en mora o suspendido, el
  operador de la plataforma escribe un motivo en texto libre. Ese texto puede mencionar a
  personas (a quién se le facturó, con quién se habló).

### 2.6 Resumen

| Categoría | Ejemplos | De quién |
|---|---|---|
| Identificadores de cuenta | `firebase_uid`, correo, nombre, último ingreso | Usuarios de la plataforma |
| Pertenencia y permisos | Rol en cada supermercado, invitaciones, quién invitó | Usuarios de la plataforma |
| Constancia de consentimiento | Versión aceptada, fecha, IP, momento | Usuarios de la plataforma |
| Contactos de aviso | Correos por sede y por rol | Personal del supermercado |
| Reportes de montaje | Nombre escrito, rol, fecha, motivo, nota, foto | Personal del supermercado |
| Contactos comerciales | Empresa, persona, teléfono, correo, notas | Contactos de proveedores |
| Imágenes | Fotos de montaje, planometrías, artes, contratos escaneados | Personas captadas incidentalmente; firmantes |
| Bitácora | Fecha, rol, correo del actor, IP, acción | Usuarios de la plataforma |
| Frenos de seguridad | IP y hora de intentos fallidos | Cualquiera que intente ingresar |

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
- Dejar constancia de que se aceptó esta política, con qué versión y cuándo.
- Facturar y administrar el estado de cuenta del supermercado.
- Atender consultas, reclamos y solicitudes de derechos.

### 3.2 Personal del supermercado

- Avisar por correo cuando se firma un contrato, cuando algo está por vencer y qué hay que
  montar.
- Dejar constancia de quién confirmó un montaje y cuándo, que es lo que responde un
  reclamo de un proveedor meses después.

### 3.3 Contactos de proveedores

- Administrar el contrato de alquiler del espacio: quién es la contraparte, a quién
  llamar, a dónde mandar la confirmación.
- Enviar al proveedor la constancia de lo que contrató.

### 3.4 Imágenes y archivos

- Probar cómo quedó armada la exhibición y compararla con lo acordado.
- Conservar la prueba documental del acuerdo.

### 3.5 Bitácora y frenos de seguridad

- Saber quién hizo qué cuando falta un contrato o cambia un valor.
- Frenar intentos de acceso no autorizado (fuerza bruta) y detectar abuso.
- Investigar y reportar incidentes de seguridad.

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
3. **Al ingresar**, para quienes ya tenían cuenta antes de que esta política existiera: se
   les pide una vez y queda registrada. No se les bloquea el acceso todos los días.

De cada aceptación se guarda **la versión de la política aceptada, la fecha y hora, la
dirección IP y en cuál de los tres momentos ocurrió**. Esa constancia es la prueba de la
autorización, tal como pide el artículo 7 del Decreto 1377 de 2013.

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
negocio. Desde esa consola, el **operador de la plataforma** ve **métricas agregadas** del
negocio de cada supermercado cliente: conteos (sedes con plano, espacios comercializables),
porcentajes de ocupación, promedios y sumas de canon, un top de proveedores por **nombre
comercial del proveedor —depurado de datos de contacto: los correos y teléfonos que
pudieran aparecer se enmascaran antes de mostrarse— y conteo de contratos activos**, la
cantidad de usuarios con cuenta y la fecha del último acceso —la fecha, no quién entró—.

Estas métricas son **solo lectura** y **solo agregadas**: el operador nunca ve una fila
individual de negocio (un contrato, un espacio, un proveedor con sus datos de contacto) ni
un dato de una persona identificada del supermercado o de sus proveedores. El sistema
construye estos números por consulta agregada, no exponiendo listas de filas: la respuesta
que arma la consola no puede contener una fila de negocio. Cada consulta de métricas queda
anotada —con el correo del operador, el momento y el período consultado— en la bitácora de
la plataforma, igual que cualquier otro acceso.

Los promedios y sumas de canon, y el listado de top de proveedores, de un supermercado
cliente **solo se muestran cuando agrupan al menos 3 contratos activos del período**; por
debajo de ese umbral el dato se omite. La razón de esta regla es que un agregado construido
sobre uno o dos contratos deja de ser un agregado en los hechos: equivaldría, en la
práctica, al canon de un contrato puntual e identificable. El umbral existe precisamente
para que eso no pase.

> **[VALIDAR CON ABOGADO]**

Desde la misma consola, y con el mismo alcance —solo lectura, solo agregados, con
constancia en la bitácora—, el operador ve además dos lecturas incorporadas después:

**La relación entre el canon cobrado y la tarifa de referencia del supermercado.** El
supermercado cliente puede configurar, dentro de su propio sistema, una **tarifa de
referencia** por tipo de espacio y por sede: cuánto dice que vale cada espacio. Ese valor
es información comercial del supermercado y **nunca se muestra al operador**, ni por sede
ni en promedio ni sumada. Lo único que cruza es la **relación porcentual** entre lo que el
supermercado efectivamente cobra por sus contratos activos del período y lo que esas
mismas posiciones valdrían según su propia tarifa —un porcentaje con signo, ponderado
sobre el conjunto de contratos, nunca un promedio de promedios—, junto con **si el
supermercado configuró o no una tarifa de referencia** (sí/no) y un **conteo de contratos
del período a los que no les aplica ninguna tarifa**. Esta relación está sujeta al **mismo
umbral de 3 contratos** descrito arriba: por debajo de tres contratos con tarifa aplicable
el porcentaje se omite, porque con uno o dos el porcentaje y el canon promedio que ya se
publica permitirían despejar la tarifa individual, que es justamente lo que no puede
salir.

**La lectura de adopción del servicio.** Para entender qué supermercados están usando el
servicio y cuáles dejaron de entrar —el antecedente típico de una baja—, el operador ve,
**por supermercado**: cuántas cuentas con membresía activa tiene, cuántas de esas cuentas
entraron en los últimos 30 días, **cuántos días pasaron desde el último acceso de
cualquiera de sus cuentas** —un número de días, no quién entró ni cuándo entró cada
persona—, si el supermercado tiene contratos vigentes en el período (sí/no), el **mes de
alta** del supermercado (mes y año, sin día) y una **clasificación derivada** de todo lo
anterior, calculada por el sistema: nueva, activa, sin uso con contratos, sin uso sin
contratos, o sin cuentas. Estos datos se agrupan además por mes de alta, con el porcentaje
de supermercados de cada grupo que registró algún acceso en los últimos 30 días. **Ninguna
de estas cifras identifica a una persona**: no se muestran correos, nombres, identificadores
ni fechas de acceso de ninguna cuenta en particular, sólo conteos y cantidades de días
referidos al supermercado como organización. Cada consulta de adopción queda anotada —con
el correo del operador, el momento y el período— en la bitácora de la plataforma, igual que
las consultas de métricas.

Esto no cambia el reparto de responsabilidades del punto 5.2: el supermercado sigue siendo
el responsable del tratamiento de los datos de su gente y de sus proveedores, y RECABRA
sigue siendo el encargado. Lo que describe este punto es una capacidad interna de operación
del negocio —entender cuánto se usa el servicio, no acceder a los datos personales que el
supermercado trata—.

> **[VALIDAR CON ABOGADO]** Confirmar que estos agregados —conteos, porcentajes, promedios
> y sumas de canon ya sujetos al umbral de 3 contratos, nombre comercial de un proveedor
> junto a un conteo de contratos, y una fecha de último acceso sin identidad— no
> constituyen, ni siquiera combinados entre sí, un dato personal en el sentido del
> artículo 3 de la Ley 1581 (vinculable a una persona natural determinada o determinable).
> Si el abogado concluye que sí lo son, o que de todas formas amerita una nueva aceptación
> de los titulares, el camino previsto es subir `VERSION_POLITICA` (la constante del
> backend y el encabezado de este documento a la vez) y disparar el flujo de
> re-consentimiento automático que ya existe (punto 4.1) para toda la base de usuarios.
> Mientras tanto, la decisión de NO subir la versión —y su justificación— queda
> documentada en `docs/ESTADO.md`.
>
> Pregunta abierta que el contador del equipo dejó marcada y que el abogado debe evaluar
> puntualmente: el **nombre comercial** de un proveedor puede, en algunos casos, coincidir
> con el nombre de una persona natural (un proveedor unipersonal que factura a su propio
> nombre, por ejemplo) aun cuando el dato ya pasó por el saneo de correos y teléfonos
> descrito arriba. Que el abogado evalúe si ese escenario —un nombre comercial que ES
> también el nombre de una persona determinable— cae bajo el artículo 3 de la Ley 1581 y,
> si es así, qué tratamiento adicional corresponde (¿excluir del top a los proveedores sin
> razón social distinguible de una persona natural? ¿es la regla de los 3 contratos
> suficiente disociación?).
>
> **[VALIDAR CON ABOGADO] — sobre las dos lecturas incorporadas después** (la relación
> canon/tarifa de referencia y la lectura de adopción): la decisión tomada fue **NO subir
> `VERSION_POLITICA`**, con la misma justificación que se usó para los agregados
> anteriores de este punto 5.3. El motivo: la relación canon/tarifa queda bajo el **mismo
> umbral de 3 contratos** que ya rige para el canon, y la lectura de adopción es un
> conjunto de conteos y de cantidades de días referidos al supermercado **como
> organización** —cuántas cuentas, cuántas entraron, cuántos días desde el último acceso de
> cualquiera de ellas—, sin correos, nombres, identificadores ni fechas de acceso
> individuales, de modo que no se incorpora ningún dato personal nuevo ni se amplía la
> finalidad ya informada. Que el abogado confirme ese criterio y, en particular, dos
> puntos: (i) si la **cantidad de días desde el último acceso** de un supermercado que
> tiene **una sola cuenta activa** deja de ser un dato de la organización y pasa a ser un
> dato de esa persona determinable —el mismo interrogante que ya plantea la "fecha del
> último acceso" descrita más arriba—; y (ii) si el porcentaje canon/tarifa, aun bajo el
> umbral de 3, puede considerarse información comercial reservada del supermercado cliente
> cuyo tratamiento convenga cubrir expresamente en el contrato de servicio del punto 5.2
> —no es un dato personal, pero sí un dato de negocio de un tercero—. Si la conclusión
> fuera que corresponde una nueva aceptación de los titulares, el camino previsto es el
> mismo: subir `VERSION_POLITICA` y disparar el re-consentimiento del punto 4.1.

---

## 6. Cuánto tiempo conservamos los datos

La ley exige que los datos se conserven solo mientras sean necesarios para la finalidad
que los justifica (artículo 4, literales c y d, de la Ley 1581; artículo 11 del
Decreto 1377).

Criterios que aplica RECABRA hoy:

- **Datos de negocio (contratos, espacios, proveedores, montajes, planometrías):** se
  conservan mientras dure la relación con el supermercado y después por el tiempo que
  exijan las obligaciones comerciales, contables y tributarias.
  **Los datos de negocio NO se borran por el estado de cuenta del supermercado.** Si un
  cliente entra en mora, queda en solo lectura o queda suspendido, se le corta el acceso,
  nunca la información: apagar el servicio no puede significar destruir la prueba de lo
  que se contrató.
- **Fotos de montaje y planometrías:** no se borran al vencer el contrato. Son la prueba
  de lo que se acordó armar y de lo que efectivamente se armó, y sirven cuando un
  proveedor reclama meses después.
- **Bitácora:** se conserva mientras siga siendo útil para auditoría y para investigar
  incidentes. [COMPLETAR: plazo concreto que fije el negocio, p. ej. 2 años.]
- **Frenos de fuerza bruta (IP y hora de intentos fallidos):** se descartan solos pasada
  la ventana de tiempo del freno; son de vida muy corta.
- **Cuentas de usuario:** mientras la persona conserve al menos una membresía activa.
  Desactivar la membresía corta el acceso de inmediato.
- **Invitaciones:** hasta que se usan o caducan.

> **[COMPLETAR]** Fijar y escribir aquí los plazos concretos de conservación por
> categoría, con el sustento (obligación contable, tributaria o probatoria) de cada uno. Un
> plazo indefinido no cumple la ley.

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

RECABRA tiene dos vías construidas en el producto, además del canal de correo:

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

### 7.2 Quién puede pedir qué

- **Usuarios de la plataforma** (dueños, administradores, mercaderistas): ejercen sus
  derechos directamente ante RECABRA, por el canal de la sección 8.
- **Personal del supermercado y contactos de proveedores**: el responsable es el
  supermercado (ver sección 5). Pueden dirigirse al supermercado o a RECABRA; si escriben a
  RECABRA, se traslada la solicitud al supermercado y se les informa a quién se trasladó.
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
| **Google — Firebase Authentication** | Verificar la identidad de quien entra (ingreso con Google o con correo y contraseña) | Correo, nombre, identificador de cuenta, contraseña de la cuenta (que RECABRA nunca ve) | Infraestructura de Google [VALIDAR CON ABOGADO: región concreta según la configuración del proyecto de Firebase] |
| **Render** | Alojar la aplicación y la base de datos | Todo lo que la aplicación almacena | Estados Unidos |
| **[COMPLETAR: proveedor de correo saliente]** | Enviar los avisos automáticos | Correos de destinatarios y contenido del aviso | [COMPLETAR] |

### 9.2 Transmisión internacional

La aplicación y la base de datos están alojadas en **Estados Unidos**, y la autenticación
la presta **Google**. Esto implica que los datos salen de Colombia.

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
> 2. Si los términos contractuales estándar de Google Cloud/Firebase y de Render
>    satisfacen el requisito de "contrato de transmisión" del artículo 25 del Decreto 1377,
>    o si hay que suscribir un anexo de tratamiento de datos.
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
  las custodia Google; las claves compartidas del método antiguo se guardan con hash
  Argon2id, que es irreversible.
- **Los precios y valores de contrato no llegan al rol de mercaderista**: el servidor los
  borra de la respuesta antes de enviarla, no la pantalla.
- **Frenos de fuerza bruta** por dirección IP en el ingreso, en la autenticación por cuenta
  y en la creación de supermercados nuevos.
- **Bitácora** de todo lo que cambia algo o abre una puerta.
- **Desactivar una membresía corta el acceso de esa persona en el pedido siguiente.**
- Cabeceras de seguridad del navegador y política de contenido en todas las respuestas.
- Revisión automática de vulnerabilidades en las dependencias del proyecto.

Ninguna medida elimina el riesgo por completo. Si ocurre un incidente que comprometa datos
personales, RECABRA lo informará a la Superintendencia de Industria y Comercio conforme al
**artículo 17, literal n, de la Ley 1581** —que obliga a informar a la autoridad cuando se
presenten violaciones a los códigos de seguridad y existan riesgos en la administración de
la información de los titulares— y a los titulares y clientes afectados.
[COMPLETAR: plazo interno de reporte y responsable de hacerlo.]

---

## 11. Vigencia y versionado

- **Versión de esta política: 2026-09-v1.**
- **Vigencia: desde septiembre de 2026** y hasta que se publique una versión nueva.
- El tratamiento de los datos se mantiene mientras dure la relación con cada titular y
  durante los plazos de conservación de la sección 6.

Cada versión de esta política tiene un identificador propio, y el sistema **guarda qué
versión aceptó cada persona y cuándo**. Cuando se publique una versión nueva que cambie de
forma sustancial las finalidades o el tratamiento, se comunicará a los titulares y, cuando
la ley lo exija, se pedirá una nueva aceptación.

> Nota técnica para quien mantiene el sistema: el identificador `2026-09-v1` es el mismo
> valor de la constante `VERSION_POLITICA` del backend. Si se publica una versión nueva de
> este documento hay que cambiar los dos a la vez, o las constancias de consentimiento
> apuntarán a un texto que ya no existe.

---

> **BORRADOR PARA REVISIÓN DE ABOGADO** — este documento no constituye asesoría legal.
> Antes de publicarlo hay que completar todos los campos marcados con **[COMPLETAR]** y
> resolver los puntos marcados con **[VALIDAR CON ABOGADO]**.
