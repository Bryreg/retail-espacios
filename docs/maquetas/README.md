# Maquetas de la pantalla principal

Ocho maquetas estáticas —cuatro diseñadores × dos modos— hechas en septiembre de
2026, cuando la devolución al presentar el sistema fue que *«se ve muy obvio que
es hecho con IA»*.

**No son código de la aplicación.** Son HTML autocontenido para mirar y decidir.
Abrilas con doble clic; las tipografías van en `fuentes/` y cargan desde disco
(el navegador del contenedor donde se hicieron no llega a Google Fonts).

| | Vender | Supervisar | dónde puso el esfuerzo |
|---|---|---|---|
| q1 | [html](q1-vender.html) · [png](q1-vender.png) | [html](q1-supervisar.html) · [png](q1-supervisar.png) | El plano isométrico |
| q2 | [html](q2-vender.html) · [png](q2-vender.png) | [html](q2-supervisar.html) · [png](q2-supervisar.png) | Vender como material comercial |
| q3 | [html](q3-vender.html) · [png](q3-vender.png) | [html](q3-supervisar.html) · [png](q3-supervisar.png) | La densidad de Supervisar |
| q4 | [html](q4-vender.html) · [png](q4-vender.png) | [html](q4-supervisar.html) · [png](q4-supervisar.png) | El estado y la tipografía |

## De dónde salieron

`PROMPT.md` es el encargo completo y `BRIEF.md` el brief funcional. Los cuatro
diseñaron **a ciegas**: no vieron el sistema actual ni ninguna propuesta previa.
Los cuatro comparten escuela (Polaris de Shopify adaptado), porque de dieciséis
propuestas de escuelas distintas ésa fue la que el cliente eligió; lo que varía
entre ellos es dónde gastan el riesgo.

`CRITERIOS.md` recoge lo que el cliente pidió con sus palabras después de
rechazar dieciséis intentos.

## Las dos restricciones que definen todo

1. **Vender la ve el proveedor.** El administrador gira el portátil y le muestra
   la pantalla al proveedor que tiene enfrente. Por eso ahí no puede aparecer el
   nombre de otro proveedor, lo que paga, el ranking por canon, quién está bajo
   tarifa, el canon de la sede ni la plata del periodo. Sólo disponibilidad,
   tiempo, el espacio, el contrato de ESE proveedor, y la tarifa de referencia
   (que es lista de precios y sí es pública). q3 y q4 lo auditaron por `grep`
   sobre su HTML final.

2. **El plano isométrico va en las dos.** Es lo único que este sistema tiene y
   una planilla no puede tener: el inventario tiene domicilio.

Los cuatro corrieron el validador de color de la guía de visualización. El verde
con naranja **falló** en una ronda anterior —se confunden con protanopía, que es
el daltonismo más común, y acá eso separa «libre» de «ocupado»—, así que ninguno
lo usa.

## Datos

Son los reales de la sede NAVE al 31 de agosto de 2026: 23 espacios sobre 106
muebles, $5.300.001 de canon vigente, 8 contratos, 5 venciendo entre el 24 y el
28 de septiembre. Los nombres van como están en la base, con razones sociales y
nombres de pila en minúscula.
