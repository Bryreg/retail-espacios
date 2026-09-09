# Arreglos del port de la Plataforma — las tres pantallas

Rama `claude/fase-11-plataforma` en `/tmp/retail-espacios-test`. Responde punto por punto
al informe del verificador (`port-verificacion.md`). Todo lo que sigue está **medido**
contra un backend propio sembrado, no razonado.

**Cómo se midió.** Backend en `:8055` sobre `/tmp/fix-p/base/verif.db`, sembrado con el
mismo `seed_verif.py` del verificador (5 clientes, `mercafresco` con los tres estados de
espacio, tarifa secreta 987654, 12 meses de tendencia con el más viejo sin snapshot).
Vite dev en `:5231` con `VITE_API_TARGET=http://127.0.0.1:8055`. Playwright con
`executablePath /opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Guiones en
`/tmp/fix-p/{medir,nav,chico,imprimir,detalles}.mjs`, salida cruda en
`/tmp/fix-p/medidas.json`. Capturas nuevas en `capturas/port-fix-*`.

---

## 0 · Puertas

| Puerta | Resultado |
| --- | --- |
| `npx tsc --noEmit` | **limpio**, salida vacía, exit 0 |
| `npm run probar:plataforma` (con navegador, `URL=:5231`, `API=:8055`) | **`frontera: sin fallas`** |
| `npm run probar:tema` | **exit 0** · 24 pruebas |
| `git diff --stat origin/main -- backend` | **vacío** |
| `git status --porcelain frontend/scripts/` | sin cambios míos (los 3 archivos siguen siendo `??` del otro equipo) |

`npm run build` y la suite del backend **no se corrieron**, por regla del encargo.

Al empezar, `probar:plataforma` traía **una falla heredada** que no es de este encargo y
que igual quedó cerrada, porque vive en mis archivos: el guion (reescrito por el equipo de
scripts) ahora exige **cero exports sin importador en `src/components/plataforma/`** y
había 29. Los 11 de `consola.tsx` son el punto (7); los otros 18 son de `cartera-datos.ts`,
`graficos.tsx`, `sesion-datos.ts` y `sesion-piezas.tsx`, y se resolvieron **quitándoles el
`export`** (se usan adentro de su propio archivo; no se borró ni una línea de lógica). Hoy:
`ok los 93 exports de src/components/plataforma/ (8 archivos) tienen al menos un importador`.

---

## 1 · El informe no tomaba el periodo — **arreglado, ciclo completo medido**

`InformeCliente.tsx` y `DetalleCliente.tsx` leen el periodo de la **URL**
(`useSearchParams`), no de un `useState` clavado. La cartera lo pasa al abrir una sesión y
la sesión lo pasa al armar el informe. El `?periodo=` se valida contra `^\d{4}-(0[1-9]|1[0-2])$`:
lo que no tiene forma de periodo cae en el mes en curso en vez de irse a un 422 sin explicación.

**El ciclo, con la cartera puesta en julio de 2026** (una sola pasada de navegador, clics
reales, `medir.mjs`):

| Paso | Medido |
| --- | --- |
| cartera → `julio de 2026` | `GET /api/plataforma/metricas?periodo=2026-07` · el chip «mes en curso · parcial» desaparece (0 en pantalla) |
| clic en «Abrir la sesión» de MercaFresco | URL `…/clientes/mercafresco?periodo=2026-07` · `GET …/detalle?periodo=2026-07` · titular **«MercaFresco — julio de 2026»** · cred «Periodo 2026-07-01 a 2026-07-31» |
| clic en «Armar el informe para el cliente» | URL `…/informe?periodo=2026-07` · `GET …/detalle?periodo=2026-07` · membrete **«Periodo julio de 2026 · 2026-07-01 a 2026-07-31»** |
| índice lateral → sub-entrada «MercaFresco» | URL `…/clientes/mercafresco?periodo=2026-07` · titular «MercaFresco — julio de 2026» |
| `…/informe` **pegada a pelo, sin periodo** | `GET …/detalle?periodo=2026-09` · membrete «Periodo **septiembre de 2026** · 2026-09-01 a 2026-09-30» · pie «El periodo septiembre de 2026 termina el 2026-09-30: las cifras del mes son parciales y pueden subir.» |
| `…/informe?periodo=hola` | `GET …/detalle?periodo=2026-09` — cae en el mes en curso, no rompe |

Un efecto del arreglo que había que atender para no cambiar una mentira por otra: el
informe **puede ahora mostrar un mes cerrado**, y decía igual «el mes en curso todavía no
terminó». Esa línea (y su gemela del pie, y las dos de la sesión) salen ahora del periodo
que **el backend devolvió**:

* informe de julio → «Generado el 2026-09-08 — **el periodo ya cerró**» + pie «El mes ya cerró».
* informe de septiembre → «Generado el 2026-09-08 — **el mes en curso todavía no terminó**».

El guion lo confirma por su lado: `ok el informe toma el periodo de quien lo abre` ·
`ok las 1 navegaciones al informe llevan el periodo elegido` ·
`ok el informe heredó el periodo 2026-08` · `ok el renglón del periodo del informe dice el mes heredado`.

---

## 2 · Residuo de frases · **7 → 0**, en las cinco vistas y en los dos temas

Las cinco que eran residuo de verdad llevan ahora su frase-conclusión **calculada del
dato**, del mismo tamaño que las demás (`.plat-frase.chica`; no se agrandó ni se engrosó
nada):

| # | Dónde | Qué dice ahora, con la base sembrada |
| --- | --- | --- |
| 1 | `Plataforma.tsx` · `TablaComposicion` | «Los dos meses cuentan los mismos 5 clientes: la corrección es de $ 0 y el delta de arriba (+$ 3.620.000) se lee directo, sin columna del medio.» (con composición distinta escribe qué cliente salió, cuánto aportaba y de cuánto a cuánto baja el mes anterior) |
| 2 | `Plataforma.tsx` · `LineaIngreso` de la cartera | «En plata, de oct a sep la cartera pasó de … a … (…), con el techo de la ventana en … Es el mismo eje de meses de arriba y otra unidad: por eso va en su propio panel y no en un segundo eje.» |
| 3 | `Plataforma.tsx` · `TablaCohortes` | «De N clientes dados de alta en M cohortes, X de Y entraron dentro de los 30 días (Z %). Con cohortes de uno o dos, el conteo manda y el porcentaje va al lado con su n.» |
| 4 | `DetalleCliente.tsx` · `LineaIngreso` de la sesión | igual que 2, en la voz del cliente |
| 5 | `DetalleCliente.tsx` · `BarrasDivergentes` | «En 12 meses entraron N contratos por $ … y salieron M por $ …: el saldo de la ventana es −$ … al mes, y el peor mes fue … con −$ …» |

Todas las ramas de esas cinco funciones —incluidas las de «no hay con qué»— llevan al
menos una cifra, para que la regla no dependa del dato que toque.

Las dos que eran **tablas equivalentes fuera de su figura** entraron adentro. Para eso
`Figura` (en `graficos.tsx`) recibió una segunda puerta, `tablaNodo` + `resumenTabla`: la
figura arma su tabla sola cuando las columnas son suyas, y acepta una ya armada cuando las
columnas y la voz son de quien llama. Así se conservaron **exactamente** las dos tablas que
había (la del riel con su fila de total, la del dumbbell en la voz del cliente — «Tipo de
espacio / Lo que usted cobra / El promedio de la plataforma / Diferencia») en vez de
sustituirlas por las genéricas.

Medición (regla del verificador: cada `<figure>` y cada `<table>` que no viva dentro de un
`<details>` necesita un `.plat-frase` **con cifra** entre él y la diana anterior; todos los
`<details>` abiertos antes de medir):

| Vista | dianas | tablas equivalentes | frases | **residuo** |
| --- | --- | --- | --- | --- |
| cartera | 7 | 4 | 8 | **0** |
| sesión (julio) | 7 | 7 | 9 | **0** |
| sesión (septiembre, con el riel) | 8 | 8 | 10 | **0** |
| informe (julio) | 2 | 2 | 3 | **0** |
| informe (septiembre) | 2 | 2 | 4 | **0** |

Idéntico en claro y en oscuro. El guion lo mide con su propia implementación y coincide:
`«cartera» residuo = 0 (8 dianas)` · `«sesión» residuo = 0 (17 dianas)` ·
`«informe» residuo = 0 (2 dianas)` + `ok todo details.plat-tabla-eq vive dentro de su <figure>`
en cartera e informe.

En la sesión el guion deja un **aviso** (no falla): quedan 4 `details.plat-tabla-eq` fuera
de una figura —la tabla de los 12 meses, la de los 3 tipos de espacio y las dos de
prioridad media/baja—. No están exentos y se les exigió su cifra como diana: **la tienen**.
No se movieron porque el encargo nombró dos, y esas dos son las que estaban.

---

## 3 · El chip «mes en curso · parcial» — **tinta neutra en los dos temas**

`plataforma.css` ya no lo pinta con `--entra-txt` / `--entra-suave` / `--entra-borde`, que
en oscuro colapsan contra `--entra` (`tema.css:639` define `--entra-txt-rgb: var(--entra-rgb)`).
Ahora usa `--ink-2` / `--surface-2` / `--line-strong`, como los demás chips; la palabra
sigue escrita entera.

| Tema | color computado | fondo | coincidencias con `--libre/--entra/--ocupado` |
| --- | --- | --- | --- |
| claro | `rgb(74, 91, 101)` | `rgb(247, 248, 245)` | **0** |
| oscuro | `rgb(157, 174, 182)` | `rgb(16, 24, 32)` | **0** |

Barriendo **todos** los `.plat-chip` de las tres pantallas, claro y oscuro: 0 tocan la
terna. El guion coincide en sus seis pasadas
(`ok «cartera/sesión/informe» claro|oscuro — ningún chip … pintado con la terna de estado`).

---

## 4 · El selector de periodo — **`<select>` de A, en español, sin cortarse**

Los dos `<input type="month">` volvieron a ser `<select>`, con los periodos que existen
(la serie de doce del propio endpoint, el más nuevo arriba). El mes **sin snapshot** se
ofrece igual, deshabilitado y con la palabra escrita; el periodo puesto nunca se
deshabilita, porque se puede llegar a él por la URL.

Opciones medidas en la cartera:

```
septiembre de 2026 · agosto de 2026 · julio de 2026 · … · noviembre de 2025
octubre de 2025 · sin dato        ← disabled=true (el mes sin snapshot del seed)
```

| Ancho | control | rótulo puesto | ¿se corta? | scroll horizontal |
| --- | --- | --- | --- | --- |
| 320 | `select`, 236 px (necesita 173) | «septiembre de 2026» | **no** | 320 = 320 |
| 360 | `select`, 236 px | «septiembre de 2026» | **no** | 360 = 360 |
| 390 | `select`, 236 px | «septiembre de 2026» | **no** | 390 = 390 |
| 600 | `select`, 236 px | «septiembre de 2026» | **no** | 600 = 600 |

En la barra angosta el control toma el ancho de su rótulo más largo en vez de encogerse y
elidirlo (`flex: 0 0 auto`), y el grupo envuelve antes de empujar el documento. El guion:
`ok ninguna de las 3 pantallas usa <input type="month">`.

---

## 5 · Un solo interruptor de tema — **el de `src/tema.tsx`, en las tres**

La sesión y el informe dejaron de importar el `TemaToggle` de `components/plataforma/consola.tsx`
y usan el compartido. Medido en las tres pantallas y en los dos temas: **1 interruptor
visible por pantalla**, siempre con el mismo `aria-label` (`Cambiar a modo oscuro` /
`Cambiar a modo claro`) y el mismo dibujo (`border: 0px none`; el de la consola tenía borde).

Con eso, el `TemaToggle` de `consola.tsx` y sus tres alias (`ConsolaTema`, `temaInicial`,
`guardarTema`) se quedaron **sin un solo importador**, así que se borraron también: dejar
el segundo botón vivo en el árbol es exactamente cómo se volvieron a separar las pantallas
la vez pasada. Es lo único que borré fuera de la lista de once del encargo, y lo digo acá
para que se vea. `ReportePlataforma.tsx` sigue intacto (`git diff` vacío): sólo usaba
`EstadoVacio`, `EstadoError` e `IMPRESION_CLARA_VARS`, que quedaron.

---

## 6 · Reconciliación con A

| Desvío | Estado | Medido |
| --- | --- | --- |
| **D1** el informe sin índice | **recuperado** | `<nav class="plat-indice">` con `En esta pieza` y 4 entradas: `El titular · 1 · Dónde está su negocio · 2 · Qué encontramos · 3 · Qué le proponemos`. Vive en el mismo `.plat-shell` que las otras dos piezas; en `@media print` desaparece (0 controles visibles en papel) |
| **D3** el cajón «Estados de cuenta» cerrado | **abre solo** | al cargar la cartera: `Estados de cuenta · 5 clientes → open=true`; `Solicitudes de supresión → open=false`. Es el único `<details>` abierto de la cartera, como en A |
| **D5** marcadores `1,2,3` vs `H1,H2` | **iguales** | sesión `H1 H2 H3 H4 H5` · informe `H1 H2 H3`. Antes el informe numeraba `1 2 3` |
| **D9** el índice de la cartera sin sub-entradas | **recuperadas** | bajo «1.3 · La cola de llamadas», los 5 clientes en el orden de la cola (`La Esquina · Zafiro Nocturno · MercaFresco · Galerías · Don Pepe`). Cada una es un enlace de verdad (`/plataforma/clientes/<slug>?periodo=…`) y lleva el periodo puesto; el que no se deja leer apunta a `#c-operativo`. A ≤ 1080 px se esconden, como en A |
| **D4** la tabla de oportunidades mudada | **devuelta al capítulo 4, plegada** | «Los datos detrás» tiene otra vez **cinco** cajones: `Espacios · Contratos · Proveedores · Oportunidades (24 espacios en 4 grupos de sede × tipo) · Movimientos`, todos cerrados por defecto. «Qué proponemos» conserva los grupos y la escalera (`precio · a quién · dónde`, con los códigos por sede) y ya no repite la tabla completa |
| **D2** «Tres páginas A4 verticales» | **se queda** | es la verdad medida: el informe de septiembre imprime en **3 páginas A4** con **0 controles** en `media:print` (el de julio, con menos hallazgos, en 2) |

---

## 7 · Limpieza en `consola.tsx`

* **12 `fontSize` literales → 0.** Ocho se fueron con el código muerto; los cuatro que
  quedaban pasaron a la escala: `13 → var(--t-xs)` (12,5), `11 → var(--t-2xs)` (11,5),
  `12 → var(--t-2xs)` ×2. Regla usada: paso más cercano, y **hacia abajo** cuando había
  empate — nada creció.
* **11 exports sin importador, borrados** (comprobado con `grep -rn` sobre todo `src/`
  antes de tocar): `KpiTile`, `TonoBarra`, `EstadoBarra`, `Barras`, `BarraFila`,
  `etiquetaEstado`, `EstadoPill`, `SinDato`, `TablaScroll`, `TablaHeadCelda`, `TablaHead`,
  más los ayudantes que sólo ellos usaban (`GRID_BARRA`, `pistaColor`, `rellenoColor`,
  `tonoEstado`) y el import de `EstadoCuenta` que quedó huérfano. El archivo pasó de 438 a
  163 líneas.
* Y los cuatro del tema, por lo dicho en el punto 5.

---

## 8 · Lo que no se movió, y se comprobó que sigue en pie

* **Las adaptaciones al dato que el verificador dio por buenas**: el titular con las cifras
  reales, el orden de los hallazgos por peso, los hallazgos que el dato no sostiene y no
  aparecen, y el `sin valor estimado` del camino de `null`. Ninguna se tocó.
* **0 errores de consola y 0 excepciones** en las 10 pasadas de medición (5 vistas × 2
  temas) y en las del guion.
* **1 `.btn-principal` visible** por pantalla, en los dos temas, en las cinco vistas.
* **0 scroll horizontal** a 1440, 1366 y 390 en las tres pantallas; y a 1366 el ancho útil
  del informe volvió a dar los 940 px que piden los dibujos (desbordamiento interno de las
  figuras: **0 px**, contra 2 px con la caja anterior).
* **0 `input/select/textarea` en el informe** — el periodo se hereda, no se elige ahí.
* La tarifa 987654 sigue sin aparecer, el informe sigue sin jerga ni nombres ajenos, la
  bitácora sigue anotando, el contraste sigue en 0 textos bajo su piso WCAG en claro y en
  oscuro (todo esto, medido por `probar:plataforma`).

## 9 · Lo que queda anotado y no se arregló

1. **`BarrasDivergentes` etiqueta el mes en curso con las entradas y un `+` forzado**
   (`graficos.tsx`). Es el punto 6 del verificador, heredado de A, y el encargo no lo pidió.
   La frase-conclusión nueva de ese gráfico ahora dice el saldo de la ventana con su signo,
   así que la cifra honesta está escrita al lado — pero la etiqueta del último punto sigue
   siendo la de A.
2. **Cuatro `details.plat-tabla-eq` fuera de su figura en la sesión** (12 meses, 3 tipos,
   prioridad media, prioridad baja). No son residuo —tienen su cifra—, pero el guion los
   avisa. Las dos de prioridad no son tabla equivalente de ningún dibujo; las otras dos son
   el mismo patrón que se arregló en el riel y se podrían mudar en un PR siguiente.
3. **`probar:graficos` deja su Vite del 5211 vivo** (punto 7 del verificador). Es de
   `frontend/scripts/`, que no toco.
4. El texto de un `<th>` dentro de un `.plat-tabla-eq` no entra en `document.body.innerText`
   de Chromium aunque el `<details>` esté abierto y la tabla esté pintada. Es **anterior** a
   este encargo y afecta igual a las 19 tablas equivalentes del área (se comprobó con la
   tabla de sedes del informe, que ya estaba así). No cambia nada de lo que se ve; sí hace
   que un test que sólo lea `innerText` no alcance esas tablas.
