> **BORRADOR PARA REVISIÓN DE ABOGADO — NO PUBLICADO.** Este documento no constituye
> asesoría legal y no reemplaza a la política vigente. Es la propuesta de lo que habría que
> agregar a `docs/legal/politica-datos.md` (versión publicada **2026-09-v2**) por el cobro
> de la suscripción. La política publicada, la página `/politica-datos` y la constante
> `VERSION_POLITICA` del backend **no se tocaron**.

# Política de datos — qué cambia por el cobro de la suscripción

**Borrador del 2026-10-13 · para la versión que siga a la 2026-09-v2**

## Por qué hace falta

Desde el 2026-10-13 RECABRA registra lo que le cobra a cada supermercado: la suscripción
pactada, las cuentas de cobro o facturas que se emiten **fuera** del sistema, los pagos
que entran por transferencia y los avisos de cobro que se mandan por correo. Una parte de
esos datos son datos personales —el correo de facturación puede ser el de una persona, y
los avisos van al correo de la dueña del supermercado—, y la finalidad «cobro del
servicio» no está declarada con ese detalle en la versión 2026-09-v2.

La política vigente ya dice, en el punto 3.1, «Facturar y administrar el estado de cuenta
del supermercado». Este borrador lo desarrolla. **Hasta que el abogado lo revise y se
publique una versión nueva, no se prende la cobranza automática** (`COBRANZA_AUTOMATICA`
sigue apagada: sólo ensaya).

Lo que NO cambia y conviene que el abogado vea igual:

- **No hay pasarela de pagos ni se piden datos de tarjeta.** El pago es por
  transferencia bancaria; RECABRA anota lo que vio entrar en su cuenta.
- **RECABRA no emite facturas ante la DIAN.** Registra el número (y el CUFE, si la factura
  es electrónica) de lo que se emitió por fuera.
- **Los datos de negocio no se borran por falta de pago** (punto 6 vigente). Eso sigue.

---

## 1. Texto propuesto para agregar en «2. Qué datos tratamos y de quién»

### 2.7 Datos de facturación y cobro del supermercado (NUEVO)

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

> **[VALIDAR CON ABOGADO]** Si el NIT y la razón social de un supermercado que es persona
> natural (no una sociedad) deben tratarse como dato personal en esta sección.

Agregar al cuadro del punto 2.6:

| Categoría | Ejemplos | De quién |
|---|---|---|
| Facturación y cobro | Razón social, NIT, municipio, correo de facturación, cuentas de cobro, pagos, referencias bancarias, retenciones | Supermercado cliente (y la persona dueña del correo de facturación) |

---

## 2. Texto propuesto para agregar en «3. Para qué usamos los datos»

### 3.7 Cobro del servicio (NUEVO)

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
la plataforma) y la dueña del supermercado. El resto de su gente (administradores que no
son dueños, trabajadores, mercaderistas) ve el estado de la cuenta —al día, pago
pendiente, sólo lectura, suspendida— y nada más: ni montos ni el motivo. El correo de
facturación recibe los avisos con montos en un envío propio, sin ver las direcciones de
las dueñas; si el correo de facturación es el de alguien del equipo del supermercado que
no es dueño, no se le mandan.

> **[VALIDAR CON ABOGADO]** Base de legalidad de esta finalidad: ¿alcanza con la ejecución
> del contrato con el supermercado (y el interés legítimo de cobrar lo debido), o hace
> falta una autorización expresa de la persona cuyo correo es el de facturación, que puede
> no ser usuaria de RECABRA y no haber aceptado esta política? Si hace falta, proponer el
> texto que la dueña confirma al cargar ese correo.

---

## 3. Texto propuesto para agregar en «6. Cuánto tiempo conservamos los datos»

- **Cuentas de cobro, facturas, pagos y el historial del estado de cuenta atado a una
  suscripción:** se conservan **[VALIDAR CON ABOGADO: diez (10) años]** contados desde
  [VALIDAR CON ABOGADO: la fecha del último asiento, documento o comprobante], como
  soporte contable y tributario, **también después de que el supermercado deja de ser
  cliente y se borra su base**. Quedan atados a un número interno de suscripción que no se
  vuelve a usar: si otro supermercado se registra después con el mismo código, no los
  hereda ni los ve.

  > **[VALIDAR CON ABOGADO]** El sustento del plazo. La referencia habitual es el
  > artículo 28 de la Ley 962 de 2005, que modificó el artículo 60 del Código de Comercio
  > (conservación de libros y papeles del comerciante por diez años), y las normas
  > tributarias sobre conservación de soportes (artículo 632 del Estatuto Tributario y
  > artículo 46 de la Ley 962 de 2005). Confirmar cuál aplica a una **cuenta de cobro de
  > persona natural** frente a una **factura electrónica**, y si el plazo corre igual para
  > las referencias bancarias de los pagos.

- **Datos de facturación de la suscripción** (razón social, NIT, correo de facturación,
  municipio): mientras dure la suscripción. Al borrar el cliente se borra la suscripción;
  la copia del nombre y el NIT que quedó en cada cuenta de cobro se conserva con ella.
- **Constancia de los avisos de cobro:** con la cuenta de cobro a la que pertenecen, como
  prueba de que se avisó antes de restringir la cuenta.

---

## 4. Texto propuesto para «9.1 Suboperadores»

El proveedor de correo saliente (hoy un **[COMPLETAR]** en la tabla vigente) pasa a ver,
además, el **contenido de los avisos de cobro**: el nombre del supermercado, el número de
la cuenta de cobro, los valores, el vencimiento y los datos para transferir de RECABRA.

> **[VALIDAR CON ABOGADO]** Si el contrato de transmisión con ese proveedor cubre datos
> económicos de terceros (los supermercados), además de las direcciones de correo.

---

## 5. Lo que cambia en «11. Vigencia y versionado»

Fila nueva para el historial (con el identificador que se decida, por ejemplo
`2026-10-v3`):

| Versión | Qué cambió |
|---|---|
| **[COMPLETAR: 2026-10-v3]** | Cobro de la suscripción: datos de facturación y cobro (2.7), finalidad «cobro del servicio» con los avisos por correo y la restricción a sólo lectura (3.7), conservación contable de cuentas de cobro y pagos (6), y el contenido de los avisos en el proveedor de correo (9.1). |

> **Nota técnica para quien publique:** publicar esta versión es cambiar a la vez el texto
> de `docs/legal/politica-datos.md`, la página `/politica-datos` y la constante
> `VERSION_POLITICA` de `backend/app/models/consentimiento.py`. Subir la constante hace
> que el sistema le vuelva a pedir la aceptación a todos (punto 4.1 vigente). **Nada de
> eso se hizo en este borrador.**

> **[VALIDAR CON ABOGADO]** Si este cambio es «sustancial» en los términos del artículo 5
> del Decreto 1377 de 2013 (compilado en el 1074 de 2015) y exige una nueva autorización,
> o basta con comunicarlo.

---

> **BORRADOR PARA REVISIÓN DE ABOGADO — NO PUBLICADO.** Antes de usarlo hay que resolver los
> puntos marcados con **[VALIDAR CON ABOGADO]** y completar los **[COMPLETAR]**.
