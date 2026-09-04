> **BORRADOR PARA REVISIÓN DE ABOGADO** — este documento no constituye asesoría legal.

# Guía operativa: Registro Nacional de Bases de Datos (RNBD)

**Redactada en septiembre de 2026.** Acompaña a la Política de Tratamiento de Datos
Personales (`docs/legal/politica-datos.md`, versión `2026-09-v1`), pero es un documento
aparte: esta guía es interna y operativa, la política es pública.

Esta guía es para el dueño del negocio, no para un abogado. Contesta cuatro preguntas:

1. ¿Qué es el RNBD y por qué existe?
2. ¿RECABRA está obligada a registrarse hoy?
3. Si lo está, ¿qué bases declara y cómo?
4. ¿Qué hay que cumplir igual, aunque no toque registrar?

Al final hay una **tabla de decisión** para llevar a la reunión con el abogado.

**Nada de lo que sigue reemplaza el concepto de un abogado.** El punto 2 depende de una
cifra contable —los activos totales de la empresa— que esta guía no conoce.

---

## 1. Qué es el RNBD

El **Registro Nacional de Bases de Datos** es un directorio público que administra la
**Superintendencia de Industria y Comercio (SIC)**. Quien está obligado le declara a la
SIC qué bases de datos con información de personas tiene, qué datos guarda en cada una,
para qué las usa y cómo las protege.

- Lo crea el **artículo 25 de la Ley 1581 de 2012**.
- Lo reglamenta el **Decreto 886 de 2014** (hoy compilado en el Decreto Único
  Reglamentario 1074 de 2015).
- El **Decreto 090 de 2018** redujo el universo de obligados: antes tenía que registrarse
  prácticamente cualquiera; desde entonces, no.

**No es un permiso ni una licencia.** No hay que esperar aprobación de nadie para operar.
Es una declaración: se llena, se radica, y a partir de ahí hay que mantenerla al día.

Es gratuito y se hace en línea.

---

## 2. ¿RECABRA está obligada a registrarse?

### 2.1 Quiénes están obligados hoy

Según el **Decreto 090 de 2018**, deben registrar sus bases de datos en el RNBD:

1. **Las sociedades y entidades sin ánimo de lucro cuyos activos totales superen las
   100.000 UVT.**
2. **Las personas jurídicas de naturaleza pública** (entidades del Estado), sin importar
   sus activos.

Y **quedan por fuera**:

- Las **personas naturales** (un comerciante que factura a nombre propio, sin sociedad).
- Las sociedades y entidades sin ánimo de lucro catalogadas como **microempresa y pequeña
  empresa**.
- Las sociedades cuyos **activos totales no superen las 100.000 UVT**.

> **[VALIDAR CON ABOGADO — cifra crítica]** El umbral que define quién está obligado es de
> **100.000 UVT de activos totales**. La cifra de **610.000 UVT** que circula en algunos
> resúmenes **no es el umbral de la obligación**: fue el corte que usó el Decreto 090 de
> 2018 para escalonar los **plazos de la primera inscripción** (las de más de 610.000 UVT
> tenían plazo hasta el 30 de septiembre de 2018; las de entre 100.000 y 610.000 UVT hasta
> el 30 de noviembre de 2018). Confundir las dos cifras lleva a concluir que no hay
> obligación cuando sí la hay. El abogado debe confirmar el umbral vigente al momento de
> decidir, porque estas normas se han modificado antes.

### 2.2 Cómo se hace la cuenta

La UVT (Unidad de Valor Tributario) la fija la DIAN **cada año**. Para saber si se supera
el umbral hay que hacer una multiplicación, no una estimación:

```
Umbral en pesos = 100.000 × (valor de la UVT del año en curso)
```

Y después comparar contra los **activos totales** de la empresa según el balance del
cierre del año anterior — **activos totales, no ingresos ni patrimonio**.

> **[COMPLETAR]** Llenar esta tabla con las cifras reales antes de la reunión con el
> abogado:
>
> | Dato | Valor | Dónde sale |
> |---|---|---|
> | Valor de la UVT del año en curso | [COMPLETAR] | Resolución anual de la DIAN |
> | Umbral en pesos (100.000 × UVT) | [COMPLETAR] | Multiplicación |
> | Activos totales de la empresa | [COMPLETAR] | Estado de situación financiera del cierre anterior |
> | ¿Los activos superan el umbral? | [COMPLETAR: SÍ / NO] | Comparación |
> | Tamaño de empresa (micro/pequeña/mediana/grande) | [COMPLETAR] | Clasificación vigente por ingresos |
> | Naturaleza jurídica | [COMPLETAR: sociedad privada / ESAL / persona natural / entidad pública] | Cámara de Comercio |

### 2.3 La lectura probable, y por qué hay que confirmarla igual

RECABRA es un producto en etapa temprana que hoy atiende un puñado de supermercados. Si la
empresa que lo opera es una sociedad privada pequeña, con activos totales muy por debajo
del umbral y clasificada como micro o pequeña empresa, **lo más probable es que hoy NO
esté obligada a inscribirse en el RNBD**.

Tres advertencias que van juntas con esa conclusión:

1. **No estar obligado a registrar no exime de casi nada más.** Todo el capítulo 4 de esta
   guía aplica igual. La inscripción es un trámite; el deber de proteger los datos es
   permanente.
2. **La condición se revisa cada año.** El umbral se mueve con la UVT y los activos se
   mueven con el negocio. Si entra capital, si se compra infraestructura o si la empresa
   crece, se cruza el umbral sin que nadie avise.
3. **Los clientes pueden preguntar igual.** Un supermercado con área jurídica va a pedir en
   la negociación qué está registrado y qué no. Tener la respuesta por escrito, con la
   cuenta hecha, vale más que la respuesta en sí.

---

## 3. Qué bases habría que declarar, si aplica

Si la conclusión del punto 2 es que **sí** hay obligación, el RNBD se llena **base por
base**. Del inventario real del sistema salen dos tipos de base.

### 3.1 Base 1 — "Usuarios de la plataforma RECABRA"

Es la base del registro de la plataforma: identidad de quienes tienen cuenta. Aquí RECABRA
es **responsable del tratamiento**.

| Campo del formulario | Qué escribir |
|---|---|
| **Nombre de la base** | Usuarios y cuentas de la plataforma RECABRA |
| **Responsable** | [COMPLETAR: razón social y NIT] |
| **Encargado** | Google LLC (autenticación) y Render (alojamiento) — ver punto 3.4 |
| **Canal de atención al titular** | [COMPLETAR: correo y dirección] |
| **Forma de tratamiento** | Automatizada |
| **Categorías de titulares** | Clientes / usuarios de un servicio |
| **Datos que contiene** | Identificador de cuenta (`firebase_uid`), correo electrónico, nombre, fecha de creación, fecha del último ingreso, rol y pertenencia a cada supermercado, invitaciones enviadas y recibidas, constancia de aceptación de la política (versión, fecha, IP), dirección IP y hora de intentos de ingreso fallidos, bitácora de acciones (fecha, rol, correo, IP, acción) |
| **Datos sensibles** | Ninguno |
| **Datos de menores** | No |
| **Finalidades** | Autenticación y control de acceso, gestión de permisos por supermercado, envío de avisos operativos, constancia de consentimiento, facturación y estado de cuenta, seguridad de la información y atención de derechos |
| **Política de tratamiento** | [COMPLETAR: URL pública de `/politica-datos`] |
| **Medidas de seguridad** | Autenticación delegada en Firebase, claves con hash Argon2id, separación de bases por cliente, frenos de fuerza bruta por IP, bitácora, cabeceras de seguridad, revisión automática de dependencias |

### 3.2 Base 2 (y siguientes) — "Datos de negocio del cliente [nombre del supermercado]"

**Una base por cada supermercado cliente.** No es una decisión de forma: el sistema
efectivamente crea una base de datos separada por cliente, y en estas bases **el
responsable es el supermercado y RECABRA es el encargado**.

| Campo del formulario | Qué escribir |
|---|---|
| **Nombre de la base** | Gestión de espacios comerciales — [nombre del supermercado] |
| **Responsable** | [COMPLETAR: razón social y NIT del supermercado] |
| **Encargado** | [COMPLETAR: razón social y NIT de la empresa que opera RECABRA] |
| **Forma de tratamiento** | Automatizada |
| **Categorías de titulares** | Proveedores y contratistas; empleados del responsable |
| **Datos que contiene** | Nombre de la empresa proveedora, nombre de la persona de contacto, teléfono, correo, notas comerciales; valor, marca y fechas de cada contrato; correos de aviso del administrador de sede, del gerente operacional y del mercaderista; reportes de montaje (nombre escrito por quien reporta, rol, fecha y hora, motivo, nota); fotografías de montaje tomadas en sala de ventas, que pueden captar personas de forma incidental; planometrías y artes enviados por el proveedor; contratos escaneados, que pueden contener nombres, firmas y números de identificación; bitácora de acciones (fecha, rol, correo, IP, acción); dirección IP y hora de intentos de ingreso fallidos |
| **Datos sensibles** | No se recolectan a propósito. Declarar la posibilidad de captación incidental de imagen en las fotos de sala de ventas. [VALIDAR CON ABOGADO: si la SIC exige declarar la imagen como dato sensible en este supuesto] |
| **Datos de menores** | No a propósito; posible captación incidental en fotografías de sala de ventas |
| **Finalidades** | Administrar los contratos de alquiler de espacios comerciales; enviar avisos de contratación, vencimiento y montaje; conservar la prueba documental de lo acordado y de lo efectivamente montado; auditoría y seguridad |
| **Política de tratamiento** | La del supermercado, no la de RECABRA |

> **Quién registra estas bases.** Como el responsable es el supermercado, **el registro le
> corresponde al supermercado**, si él está obligado. RECABRA, como encargado, no registra
> bases ajenas: lo que sí debe hacer es entregarle a cada cliente esta descripción para que
> pueda llenar su propio formulario. **[VALIDAR CON ABOGADO]** — es la duda más frecuente
> del RNBD y conviene dejarla resuelta por escrito.

### 3.3 Lo que NO va al RNBD

- Datos que no identifican a nadie: geometría del plano, códigos de espacio, tarifas de
  referencia, configuración de temporadas.
- Contadores de intentos fallidos si se declaran dentro de la base a la que pertenecen (no
  son una base aparte).

### 3.4 Encargados que hay que nombrar

| Proveedor | Papel | Dónde procesa |
|---|---|---|
| Google LLC (Firebase Authentication) | Verifica la identidad de quien ingresa | [VALIDAR CON ABOGADO: región del proyecto de Firebase] |
| Render | Aloja la aplicación y la base de datos | Estados Unidos |
| [COMPLETAR: proveedor de correo saliente] | Envía los avisos automáticos | [COMPLETAR] |

---

## 4. Pasos concretos y plazos

### 4.1 Antes de tocar el portal

1. **Hacer la cuenta del punto 2.2** y dejarla por escrito, con fecha. Si da que no hay
   obligación, ese papel es la constancia de que se evaluó.
2. **Publicar la política de tratamiento** en una URL pública y estable. El formulario del
   RNBD la pide.
3. **Tener listo el canal de atención al titular** (correo y dirección física).
4. **Tener el inventario de bases** del punto 3, con sus categorías de datos y finalidades.
5. **Tener a mano el RUT y el certificado de existencia y representación legal.**

### 4.2 En el portal de la SIC

> **[VALIDAR CON ABOGADO / VERIFICAR EN EL SITIO]** Los nombres de los menús y la ruta
> exacta del portal de la SIC cambian con las actualizaciones de la plataforma. Los pasos
> de abajo describen el flujo, no las etiquetas literales de los botones. Verificar en
> `sic.gov.co`, sección **Registro Nacional de Bases de Datos**, antes de empezar.

1. **Crear el usuario** del representante legal en el Sistema Integral de Información de la
   SIC (SIIS). Llega una confirmación por correo.
2. **Registrar al responsable**: razón social, NIT, domicilio, representante legal, canal de
   atención al titular.
3. **Inscribir cada base**, una por una, con: nombre, forma de tratamiento, categorías de
   titulares, datos que contiene, si hay datos sensibles o de menores, finalidades,
   encargados, medidas de seguridad y URL de la política.
4. **Radicar** y guardar el comprobante. **Imprimirlo y archivarlo**: es la prueba de que
   se cumplió, y el número de radicado es lo que va a pedir el área jurídica de un cliente.

### 4.3 Después: mantenerlo vivo

Inscribir no es el final. Quien está registrado tiene tres obligaciones periódicas:

| Obligación | Cuándo | Nota |
|---|---|---|
| **Actualización anual** de la información de las bases | Entre el **2 de enero y el 31 de marzo** de cada año | Aunque no haya cambiado nada, hay que entrar y confirmarlo |
| **Reporte de reclamos de habeas data** | Dos veces al año, aproximadamente en **febrero** y en **agosto** | Se reporta **aunque no haya habido ningún reclamo**. [VALIDAR CON ABOGADO: las fechas límite exactas del año en curso] |
| **Reporte de incidentes de seguridad** | Dentro de los **15 días hábiles** siguientes a que ocurra o se conozca | Cualquier hecho que afecte la confidencialidad, la integridad o la disponibilidad de datos personales |
| **Novedades sustanciales** (base nueva, base que se elimina, cambio de finalidad, cambio de encargado) | Al ocurrir | No esperar a la ventana anual |

### 4.4 Qué pasa si no se cumple

El **artículo 23 de la Ley 1581** permite a la SIC imponer multas de **hasta 2.000
salarios mínimos mensuales legales vigentes**, suspender las actividades relacionadas con
el tratamiento **hasta por seis meses**, y en los casos más graves ordenar el cierre
temporal o definitivo de las operaciones que involucren tratamiento de datos sensibles.
[VALIDAR CON ABOGADO: rangos y criterios de graduación vigentes.]

---

## 5. Lo que hay que cumplir IGUAL, aunque no toque registrar

Esta es la parte que más se pasa por alto. **El RNBD es un trámite; el régimen de
protección de datos aplica a todo el que trate datos personales**, con o sin registro.

Aunque RECABRA no esté obligada a inscribirse, sigue obligada a:

1. **Tener y publicar una política de tratamiento de datos** con el contenido que exige el
   artículo 13 del Decreto 1377 de 2013: identidad del responsable, tratamiento y
   finalidades, derechos del titular, canal de atención, fecha de entrada en vigencia y
   periodo de vigencia. → Está en `docs/legal/politica-datos.md`, publicada en
   `/politica-datos`.
2. **Pedir autorización previa, expresa e informada** antes de tratar datos personales, y
   **poder probar que se pidió**. → El sistema guarda la versión aceptada, la fecha y la IP
   de cada aceptación.
3. **Entregar el aviso de privacidad** cuando la política completa no esté disponible en el
   momento de recolectar el dato.
4. **Atender consultas en 10 días hábiles y reclamos en 15 días hábiles**, con las
   prórrogas que permiten los artículos 14 y 15 de la Ley 1581. → Procedimiento en la
   sección 8 de la política.
5. **Permitir ejercer los derechos**: conocer, actualizar, rectificar, suprimir y revocar.
   → El sistema tiene el export del dueño y la solicitud de supresión atendida a mano.
6. **Adoptar medidas de seguridad** que impidan adulteración, pérdida, consulta o acceso no
   autorizado (artículo 17, literal d).
7. **Informar a la SIC los incidentes de seguridad** que pongan en riesgo la información de
   los titulares (artículo 17, literal n). **Esta obligación no depende de estar inscrito en
   el RNBD.** Quien está inscrito lo reporta por el RNBD; quien no lo está, lo reporta por
   el canal general de la SIC. [VALIDAR CON ABOGADO: canal y formato para un no inscrito.]
8. **Firmar un contrato de transmisión de datos** con cada encargado y con cada
   supermercado cliente (artículo 25 del Decreto 1377). → **Hoy no existe. Es la brecha
   más concreta de esta lista.**
9. **Designar a la persona o área** que atiende la protección de datos.
10. **Revisar la política cada año** y versionarla.

---

## 6. Tabla de decisión

Para llevar a la reunión con el abogado. Se llena de arriba hacia abajo y se para en el
primer "sí".

| # | Pregunta | Respuesta | Si la respuesta es SÍ |
|---|---|---|---|
| 1 | ¿La empresa que opera RECABRA es una **persona jurídica de naturaleza pública**? | [COMPLETAR] | **Registrar.** Sin umbral de activos |
| 2 | ¿Es **persona natural** (no hay sociedad)? | [COMPLETAR] | **No registrar.** Ir al punto 5 de esta guía |
| 3 | ¿Está catalogada como **microempresa o pequeña empresa**? | [COMPLETAR] | **No registrar** — la SIC señaló al expedirse el Decreto 090 de 2018 que micro y pequeñas empresas quedan fuera. Hacer igual la cuenta de la pregunta 4 para dejarla documentada |
| 4 | ¿Los **activos totales superan 100.000 UVT**? | [COMPLETAR] | **Registrar** dentro del plazo |
| 5 | Si ninguna de las anteriores dio "registrar" | — | **No registrar hoy**, dejar constancia escrita de la evaluación y **repetir la cuenta cada año** |

Y en los dos escenarios, sin excepción:

| Obligación | ¿Aplica si NO se registra? | Estado hoy |
|---|---|---|
| Política publicada | Sí | Borrador listo, falta completar campos y revisión de abogado |
| Consentimiento registrado | Sí | Implementado (versión, fecha, IP, origen) |
| Atención de derechos en 10/15 días hábiles | Sí | Procedimiento escrito; falta asignar responsable |
| Export y solicitud de supresión | Sí | Implementado (dueño del supermercado) |
| Medidas de seguridad | Sí | Implementadas y documentadas |
| Reporte de incidentes a la SIC | Sí | Falta definir plazo interno y responsable |
| Contrato de transmisión con clientes y proveedores | Sí | **No existe — brecha abierta** |
| Inscripción y actualización anual en el RNBD | No | Depende de la tabla de decisión |

---

## 7. Qué hay que resolver antes de la reunión con el abogado

1. Los **activos totales** de la empresa y el **valor de la UVT** del año en curso.
2. La **naturaleza jurídica y el tamaño** de la empresa (Cámara de Comercio).
3. Los **datos de identificación** para la política: razón social, NIT, domicilio, correo,
   teléfono.
4. Quién va a ser el **responsable interno** de atender consultas y reclamos.
5. Los **plazos de conservación** por categoría de dato, con su sustento.
6. Si los **términos de Google/Firebase y de Render** sirven como contrato de transmisión o
   si hay que firmar un anexo.
7. El **modelo de contrato de transmisión** con los supermercados clientes.
8. Si **Estados Unidos** figura hoy en el listado de países con nivel adecuado de
   protección que mantiene la SIC.

---

> **BORRADOR PARA REVISIÓN DE ABOGADO** — este documento no constituye asesoría legal.
> Las cifras, plazos y nombres de trámites deben verificarse contra las normas y el portal
> de la SIC vigentes al momento de usarlos.
