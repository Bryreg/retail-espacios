# Cómo se hacen (y se actualizan) los manuales de RECABRA

Los manuales salen de la app DE VERDAD: una copia local con datos de prueba, recorrida con
Playwright, con una captura por paso y el botón marcado. Cuando cambie una pantalla, se vuelve a
correr el guion de capturas de ese rol y se regenera el PDF; el texto se toca sólo si cambió lo
que dice la pantalla.

## Las piezas

| Archivo | Qué hace |
|---|---|
| `herramientas/servidor.sh` | El backend real sobre una base SQLite nueva, sirviendo `frontend/dist`. Correo «configurado» contra un puerto cerrado: los correos se arman de verdad y quedan en la cola, no sale ninguno. |
| `herramientas/sembrar.py` | La sede de prueba «CENTRO», sembrada sólo por la API, con fechas relativas a HOY. |
| `herramientas/levantar.sh` | Levanta el servidor en `MANUAL_PUERTO` y lo siembra. Cada corrida de capturas arranca de una siembra nueva (las capturas registran montajes, venden, etc.). |
| `herramientas/comun.cjs` | `lanzar()`, `abrir(nav, "admin"\|"worker"\|null, { celular })`, `foto(page, carpeta, nombre, { marca, recorte, margen })`, `marcar()`, `enlaceDeMontaje()`, `correoReal(asunto, texto)` (un correo REAL de la cola), `DATOS` (lo que dejó la siembra). |
| `herramientas/estilo.css` | El estilo de impresión (A4, color). |
| `herramientas/pdf.cjs` | HTML → PDF, con índice numerado, fecha y versión (`version.json`). |
| `<rol>/capturas.cjs` | El recorrido de ese rol. Escribe `img/<rol>/*.jpg`. |
| `<rol>/manual.html`, `bolsillo.html`, `practica.html`, `capacitador.html` | Los cuatro documentos del kit. `manual.html` puede incluir capítulos: `<div data-incluir="cap-x.html"></div>`. |
| `<rol>/rol.json` | `{ "nombre": "Trabajador", "archivo": "Trabajador" }` |

## Paso a paso para regenerar

```sh
S=/una/carpeta/temporal
cd frontend && npx vite build && cd ..                      # la app que se captura
MANUAL_TMP=$S MANUAL_PUERTO=8790 PYTHON=<python con el backend> sh docs/manuales/herramientas/levantar.sh
MANUAL_TMP=$S MANUAL_PUERTO=8790 node docs/manuales/<rol>/capturas.cjs
node docs/manuales/herramientas/pdf.cjs <rol>               # → docs/manuales/pdf/
```

Cambiá `herramientas/version.json` (versión y fecha) antes de generar una entrega nueva.

## Cómo se escribe (reglas del kit)

- **Voseo**, como la app («Tocá», «Elegí»). Frases cortas, cero tecnicismos. **Una acción por paso.**
- **Una captura por paso**, con lo que hay que tocar marcado (`foto(..., { marca })`). Recortá
  (`recorte`) cuando la pantalla entera no deja ver el botón.
- Los textos de la pantalla se citan **tal cual**: `<span class="boton">Guardar contrato</span>`
  para botones, `<span class="texto-pantalla">Listo, quedó reportado</span> ` para mensajes y
  rótulos (pone las comillas solo).
- Cada proceso (`<h2 class="proceso">`) lleva: `<p class="cuando">` (cuándo se hace), los pasos
  (`<ol class="pasos">`; con capturas de celular, `<ol class="pasos rejilla">`, de a dos por fila) y,
  donde aplique, las cajas `caja error` (si te equivocás), `caja ojo` (no se puede deshacer),
  `caja avisale` (a quién avisar) y `caja truco`.
- Si cambia entre computador y celular, se dice con `<span class="equipo">Computador</span>` /
  `<span class="equipo">Celular</span>`.
- Sólo lo que hace ese rol. Lo que resuelve otra persona: «Avisale a …».
- Nada de datos personales reales: la siembra usa proveedores y personas inventados.
- Plata en cifras completas («$ 1.800.000»), nunca «M». El trabajador nunca ve plata.

## Las clases de `estilo.css`

`portada` (con `.marca-app`, `.tipo`, `h1`, `.para`, `img.foto-portada`, `dl.ficha`),
`nav.indice` (se llena solo), `section.capitulo > h1 > span.num`, `p.entrada`, `h2.proceso`
(+ `proceso-nuevo` para empezar en página nueva), `p.cuando`, `ol.pasos` / `ol.pasos.rejilla`,
`figure` (`.celu`, `.celu-chico`, `.dos`, `.mitad`), `.boton` (`.azul` = el botón principal),
`.texto-pantalla`, `.equipo`, `.caja` (`.error`, `.ojo`, `.avisale`, `.truco`), `.trio`, tablas.
Para el resto del kit: `.bolsillo` (`.columnas`, `h2.si/.no/.ayuda`), `.ejercicio` (`.datos`),
`ol.preguntas` (`.opciones`), `.respuesta`, `.casilla`, `.linea-respuesta`, `.tiempo`.
