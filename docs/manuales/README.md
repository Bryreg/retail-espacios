# Kit de capacitación de RECABRA

Un kit por rol, hecho sobre la app de verdad (una copia local con datos de prueba), con una captura
real por paso y el botón marcado. Los PDF están en [`pdf/`](pdf/).

| Rol | Quién es | Manual | Bolsillo | Ejercicios y evaluación | Capacitador |
|---|---|---|---|---|---|
| Quien monta | Mercaderista o persona del proveedor que arma en la tienda. Sin cuenta: entra por el enlace del correo, en el celular. | `RECABRA-Manual-Quien-monta.pdf` | ✓ | ✓ | ✓ |
| Trabajador | Personal de la tienda con cuenta (rol `worker`). Nunca ve plata. | `RECABRA-Manual-Trabajador.pdf` | ✓ | ✓ | ✓ |
| Administrador | Quien vende y lleva la sede (rol `admin`). | `RECABRA-Manual-Administrador.pdf` | ✓ | ✓ | ✓ |
| Dueño | El administrador que además maneja el equipo y la cuenta (rol `owner`). | `RECABRA-Manual-Duenio.pdf` | ✓ | ✓ | ✓ |

No incluye la consola de **Plataforma** (operadores de RECABRA): no es un rol del supermercado.

Cómo se regenera cuando cambia la app: [`herramientas/COMO-SE-HACE.md`](herramientas/COMO-SE-HACE.md).

---

## El pedido, con los espacios llenos

Así quedó el croquis del pedido. Lo que estaba entre corchetes lo decidí yo; cambiarlo es cambiar
`version.json`, los textos de un rol o el estilo, y volver a generar.

**Para qué es**
- Objetivo: que cada rol pueda hacer sus tareas de todos los días **solo, sin ayuda**, después de la capacitación.
- Se usa para: capacitación presencial (45 min quien monta, 90 min trabajador, dos sesiones de 2 h administrador, 60 min dueño), autoestudio y consulta diaria (la hoja de bolsillo).
- Fecha de entrega: 20 de noviembre de 2026 (versión 1.0). Prioridad: lo de todos los días primero; después, lo que pasa de vez en cuando.

**Quién lo usa**
- Quien monta: oficio de tienda, poca experiencia con sistemas; lo lee en el celular o impreso, en el puesto.
- Trabajador: usa el computador de la tienda y el celular; lectura corta, en el puesto.
- Administrador y dueño: computador, lectura completa y consulta.
- Quién capacita: un supervisor o quien administra la sede (guía del capacitador incluida).

**Alcance**
- Cada manual incluye sólo lo que hace ese rol. Lo que resuelve otra persona: «Avisale a quien administra la sede», «Avisale al dueño de la cuenta» o «escribile a soporte de RECABRA».
- Fuera de alcance en todos: la consola de Plataforma. Fuera del manual del trabajador: vender, el plano editable, Ajustes y cualquier monto. Fuera del de quien monta: todo lo que pide cuenta.

**Qué se entrega (por rol)**
- a) Manual paso a paso, PDF A4 a color, organizado por frecuencia (todos los días → cuando pasa → de vez en cuando).
- b) Hoja de bolsillo de una página: lo de todos los días y lo que nunca se hace.
- c) Ejercicios de práctica con datos de prueba (3 a 5 casos de la sede de prueba «CENTRO»).
- d) Evaluación de 10 preguntas o tareas; las respuestas están en la guía del capacitador.
- e) Guía del capacitador: preparación, orden de la sesión, qué demostrar en vivo, errores típicos.

**Cómo está escrito**
- Español con **voseo**, como la app («Tocá», «Elegí»), frases cortas, cero tecnicismos.
- Una acción por paso, con su captura y el botón o campo marcado en naranja y numerado.
- Los textos de la pantalla se citan tal cual (entre comillas latinas, o como botón).
- Donde cambia entre equipos se marca *Computador* / *Celular*.
- Cada proceso dice cuándo se hace, qué pasa si te equivocás, qué no se puede deshacer y a quién avisar.
- Capítulo de problemas frecuentes en cada manual.
- Datos de prueba inventados: proveedores (Galletas Sol, Café Montaña…), personas («Ana Prueba», «Luis Prueba») y correos `@….example`. Nada de datos personales reales.
- Largo: quien monta ~20 páginas, trabajador ~30, administrador ~70, dueño ~20.

**Contexto usado**
- Capturas: copia local de la app (backend real + base nueva) sembrada por la API (`herramientas/sembrar.py`), con fechas relativas al día de la captura. Los correos que se muestran son los que arma el servidor de verdad (quedan en su cola; no sale ninguno).
- Documentos: `docs/ESTADO.md`, el inventario de pantallas `docs/maquetas/ux-2026-10/pantallas.md` y el código.
- Cambios recientes que quedan explicados: Indicadores › Historial (contratos cerrados, con Excel) y «Ver todos (N)» en la ficha; el reporte de montaje guardado sin señal; la verificación del montaje («Hay que corregir el montaje»).

**Antes de entregar**
- Cada proceso se recorrió en la app; lo que no se pudo capturar y lo que parece un error del sistema está en el informe de entrega (y en las `notas.md` de cada rol).
- Portada con fecha y versión (`herramientas/version.json`).
- Cómo actualizarlo: `herramientas/COMO-SE-HACE.md`.
