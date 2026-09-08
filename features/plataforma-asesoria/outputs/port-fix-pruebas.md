# Los dos scripts de prueba, arreglados y endurecidos

Rama `claude/fase-11-plataforma` en `/tmp/retail-espacios-test`.
Archivos tocados: **`frontend/scripts/probar-graficos.mjs`** y
**`frontend/scripts/probar-plataforma.mjs`**. Nada más —— `frontend/src/**` es de
otro agente, `package.json` no hizo falta, el backend no se rozó.

Lo que sigue es, punto por punto, qué se arregló, **la salida antes y la salida
después**, y cómo se produjo cada una.

---

## 0 · Cómo se midió el «antes» y el «después»

Los dos servidores del auditor, en puertos exclusivos, muertos al terminar:

* backend propio en **`:8053`** sobre una base sembrada en `/tmp/aud-p/base`
  (`scripts/sembrar-plataforma.py`, corrido **fuera del repo** para no dejar una
  sola `*.db` en el árbol): operador de plataforma, `mercafresco` con detalle
  completo, `Zafiro Nocturno` y `Galerías` como clientes ajenos, tarifa de
  referencia **987654**, 12 meses de tendencia;
* Vite propio en **`:5212`** (árbol real), **`:5213`** (fixture ANTES) y
  **`:5214`** (regresión sintética). Playwright siempre con
  `executablePath /opt/pw-browsers/chromium-1194/chrome-linux/chrome`.

**El «antes» no se pudo tomar del árbol**: mientras esta auditoría corría, el
otro agente ya estaba arreglando `src/`. Así que el ANTES es un **fixture
reconstruido**: una copia del árbol tomada a las 16:18 UTC más la reinyección
—— línea por línea, contra el informe del verificador —— de las regresiones que
para entonces ya estaban corregidas:

| Regresión reinyectada | Contra qué renglón de `port-verificacion.md` |
| --- | --- |
| `<input type="month">` en la cartera y en la sesión | §3.2 D6 (`Plataforma.tsx:517-523`, `DetalleCliente.tsx:504-509`) |
| `.plat-chip--parcial { color: var(--entra-txt) }` | §2.7 (`plataforma.css:363` + `tema.css:639`) |
| `TemaToggle` de `consola.tsx` en la sesión | §3.2 D7 |
| `const [periodo] = useState(mesActual())` en el informe | §2.9 (`InformeCliente.tsx:144`) |
| las dos tablas equivalentes fuera de su `<figure>` | §2.8 casos 6 y 7 |
| los 11 exports muertos de `consola.tsx` | §0, avisos |

El fixture vive en `/tmp/aud-p/antes/frontend` (fuera del repo, con
`node_modules` enlazado). No queda nada de él en el árbol de trabajo.

---

## 1 · `probar-graficos.mjs` dejaba su Vite vivo

### El diagnóstico, que no era «se olvidó de matarlo»

La cabecera prometía «levanta su propio servidor de Vite en un puerto propio
(5211 por defecto) y lo mata al terminar». El código decía:

```js
const vite = spawn("npx", ["vite", "--port", String(PUERTO), …]);
const limpiar = () => { try { vite.kill("SIGTERM"); } catch {} … };
process.on("exit", limpiar);
```

Dos fallas, y las dos importan:

1. **`npx` es un proceso intermedio.** `vite.kill()` le manda SIGTERM a `npx`,
   no al `vite` que escucha en el 5211. `npx` se muere, el Vite queda huérfano
   (reparentado a pid 1) y sigue sirviendo.
2. **`process.on("exit")` no puede esperar.** Corre síncrono, en el último
   suspiro del proceso: aunque la señal llegara, no hay dónde `await`ear a que
   el hijo cierre.

Y una tercera, que es la que convierte el problema en algo peor que un proceso
colgado: **la corrida siguiente medía el Vite huérfano.** Con `--strictPort`, el
Vite nuevo no arranca («Port 5211 is already in use»), pero el `fetch` de la
espera activa igual responde 200 —— lo contesta el huérfano —— así que el test
seguía adelante, feliz, midiendo un servidor que él no controla y que sirve el
código que hubiera en disco cuando ese huérfano arrancó. Verde y falso.

### Reproducción de la falla, con el script original

```
### ps ANTES:
  (ninguno)
### corrida 1 del script ORIGINAL:
exit=0
  ✓ oscuro @1366×768 — 0 errores de consola

Todo en orden.
### ps DESPUES de la corrida 1 (original):
  497     1 node /tmp/retail-espacios-test/frontend/node_modules/.bin/vite --port 5211 --strictPort --host 127.0.0.1
  513   497 /tmp/retail-espacios-test/frontend/node_modules/@esbuild/linux-x64/bin/esbuild --service=0.21.5 --ping
```

`exit=0` y el Vite vivo, con **ppid 1**: huérfano. Y la segunda corrida, con el
5211 ya tomado:

```
### corrida 2 del script ORIGINAL, con el 5211 ya tomado por el huérfano:
exit=0
duró 4 s
  ✓ oscuro @1366×768 — 0 errores de consola

Todo en orden.
### ps:
  497     1 node …/vite --port 5211 --strictPort --host 127.0.0.1
```

Cuatro segundos: no levantó nada, midió al huérfano y dio verde.

### El arreglo

* **Binario local en su propio grupo de procesos.** `node_modules/.bin/vite`
  (no `npx`), con `detached: true`, y el kill va al **grupo**:
  `process.kill(-vite.pid, …)`. Se cae a `npx` si el binario no está, y el kill
  de grupo lo cubre igual.
* **`limpiar()` es `async` y espera de verdad**: SIGTERM al grupo → hasta 5 s
  esperando el `exit` → si no cerró, SIGKILL → y después **comprueba que el
  puerto volvió a estar libre**, y lo dice si no.
* **Cuatro puertas de salida, todas cerradas**: `try/finally` alrededor de todo
  el bloque de navegador (camino feliz **y** excepción), handlers de `SIGINT`,
  `SIGTERM` y `SIGHUP`, `uncaughtException` / `unhandledRejection`, y un
  `process.on("exit")` de último recurso con un SIGKILL síncrono al grupo.
* **El puerto se prueba ANTES de lanzar nada** (`net.createServer().listen`), y
  si está tomado el script sale diciendo quién lo tiene y cómo seguir, en vez de
  colgarse 60 s o medir al vecino.

### Demostración: dos corridas seguidas, `ps` antes y después

```
### ps ANTES:
  (ninguno)

### corrida 1 (arreglado):
exit=0
  ✓ oscuro @1366×768 — 0 errores de consola

Todo en orden.
### ps DESPUES de la corrida 1:
 972     1 [esbuild] <defunct>

### corrida 2 (arreglado, inmediatamente después):
exit=0
  ✓ oscuro @1366×768 — 0 errores de consola

Todo en orden.
### ps DESPUES de la corrida 2:
 1171     1 [esbuild] <defunct>
```

La segunda corrida arranca **su propio** Vite (no choca, no mide al de antes) y
también sale limpia. Lo único que queda cinco segundos es el zombi de `esbuild`,
que ya está muerto (`<defunct>`: no tiene puerto, no tiene memoria, sólo espera
que init lo coseche) y desaparece solo:

```
### 5 s después:
  (ninguno)
### puerto 5211:
(vacío = libre)
```

### Las otras tres puertas, una por una

**Puerto tomado —— lo dice en vez de colgarse** (1 s, no 60):

```
[navegador] el puerto 5211 ya está tomado: este test lo pide con `--strictPort` porque medir sobre otro puerto sería medir otra cosa.
            Quién lo tiene:  ss -lptn 'sport = :5211'   (o  lsof -ti :5211 )
            Si es un Vite huérfano de una corrida anterior:  kill $(lsof -ti :5211)
            O corré este test en otro puerto:  PROBAR_GRAFICOS_PUERTO=5212 npm run probar:graficos
duró 1 s
### ps:
  (ninguno)
```

**Excepción** (`PROBAR_GRAFICOS_CHROME=/bin/true`: existe, pasa el `existsSync`,
y revienta al lanzarse):

```
exit=1
[navegador] excepción: Error: browserType.launch: Target page, context or browser has been closed
### ps tras la excepción:
  (ninguno)
```

**Señal** (SIGINT en plena corrida, con el Vite arriba):

```
--- ps con el test corriendo (pid del test: 1671):
 1680  1671 node …/vite --port 5211 --strictPort --host 127.0.0.1
 1688  1680 …/esbuild --service=0.21.5 --ping
SIGINT enviado
exit=130
--- ps tras el SIGINT:
  (ninguno)
```

Y la corrida real por `npm`, sobre el árbol de trabajo:

```
$ PROBAR_GRAFICOS_PLAYWRIGHT=… npm run probar:graficos
exit=0
  ✓ oscuro @1366×768 — 0 errores de consola
Todo en orden.
### ps:  (ningún vite en 5211)
```

---

## 2 · `probar-plataforma.mjs`: cuatro regresiones que se escaparon, y ahora fallan

Las cuatro pruebas nuevas se corrieron **contra el fixture ANTES** (código con
la regresión) y **contra el árbol real** (código arreglado). Las dos salidas van
enteras.

### (a) Residuo de frases-conclusión = 0 —— prueba **18**

**La regla.** Ningún dibujo ni tabla aparece sin que, arriba, una frase con la
cifra ya diga qué hay que ver. Cómo se mide, sin depender de nombres de clase:

* **diana** = todo `<figure>` del área y toda `<table>` del área;
* **única exención**: la tabla equivalente de un dibujo, y tiene que estar
  **dentro** de su `<figure>`, en un `<details class="plat-tabla-eq">`. Si está
  afuera —— hermana de la figura —— no está exenta: es una tabla más y necesita
  su cifra. Es exactamente el caso del riel de vencimientos y del dumbbell del
  informe (§2.8, casos 6 y 7);
* para cada diana se busca hacia atrás, en orden de documento, el último texto
  **con al menos un dígito** que esté fuera de toda diana y después de la diana
  anterior;
* y tiene que estar **cerca**: «a menos de la distancia que use el resto». Las
  dianas que cumplen van de 8 a 119 px; el techo se puso en **220**, para que una
  frase a media pantalla no cuente como el pie de un dibujo que está más abajo.

**ANTES** (fixture, `:5213`):

```
       «cartera»: 8 dianas · 4 tablas equivalentes dentro de su figura · distancias 8, 13, 16, 37, 41, 70, 70, 71 px
  ok   «cartera» — residuo de frases-conclusión = 0: las 8 dianas tienen su cifra arriba
  ok   «cartera» — todo `details.plat-tabla-eq` vive dentro de su `<figure>` (la única exención)
       «sesión»: 18 dianas · 3 tablas equivalentes dentro de su figura · distancias 8, 12, 12, 12, 12, 13, 13, 13, 13, 16, 16, 16, 16, 16, 16, 70, 119 px
  FALLA «sesión» — residuo de frases-conclusión = 1 sobre 18 dianas
         TABLE sin ninguna cifra escrita antes — «Vence»
       aviso · «sesión»: 4 `details.plat-tabla-eq` fuera de una `<figure>` — NO están exentos, se les exigió su cifra como diana
       «informe»: 3 dianas · 1 tablas equivalentes dentro de su figura · distancias 16, 16 px
  FALLA «informe» — residuo de frases-conclusión = 1 sobre 3 dianas
         TABLE sin ninguna cifra escrita antes — «Tipo de espacio»
```

Las dos que caen son las dos tablas equivalentes que estaban **fuera** de su
figura: la del riel («Vence · Días · Código…») y la del dumbbell del informe
(«Tipo de espacio / Lo que usted cobra / …»).

**DESPUÉS** (árbol real, `:5212`):

```
       «cartera»: 8 dianas · 4 tablas equivalentes dentro de su figura · distancias 8, 13, 16, 37, 41, 70, 70, 71 px
  ok   «cartera» — residuo de frases-conclusión = 0: las 8 dianas tienen su cifra arriba
  ok   «cartera» — todo `details.plat-tabla-eq` vive dentro de su `<figure>` (la única exención)
       «sesión»: 17 dianas · 4 tablas equivalentes dentro de su figura · distancias 12, 12, 12, 12, 13, 13, 13, 13, 13, 16, 16, 16, 16, 16, 16, 70, 119 px
  ok   «sesión» — residuo de frases-conclusión = 0: las 17 dianas tienen su cifra arriba
       aviso · «sesión»: 4 `details.plat-tabla-eq` fuera de una `<figure>` — NO están exentos, se les exigió su cifra como diana: «Ver la tabla de los 12 mesesMesCom…» · «Ver la tabla de los 3 tipos de esp…» · «Ver las 2 de prioridad mediaAcción…» · «Ver las 1 de prioridad bajaAcciónE…»
       «informe»: 2 dianas · 2 tablas equivalentes dentro de su figura · distancias 16, 16 px
  ok   «informe» — residuo de frases-conclusión = 0: las 2 dianas tienen su cifra arriba
  ok   «informe» — todo `details.plat-tabla-eq` vive dentro de su `<figure>` (la única exención)
```

La sesión pasó de 18 dianas a 17 y el informe de 3 a 2: las dos tablas se
mudaron adentro de su figura y dejaron de ser dianas. Residuo 0 en las tres.

**Y que no vuelva.** Una regresión sintética sobre el código YA ARREGLADO ——
borrar una sola frase, la del panel de plata de la cartera
(`Plataforma.tsx:732`, `<p className="plat-frase chica">{fraseIngresoSerie(…)}</p>`)
—— corrida en `/tmp/aud-p/regres` sobre `:5214`:

```
exit=1
       «cartera»: 8 dianas · 4 tablas equivalentes dentro de su figura · distancias 8, 13, 37, 41, 70, 70, 71 px
  FALLA «cartera» — residuo de frases-conclusión = 1 sobre 8 dianas
         FIGURE sin ninguna cifra escrita antes — «Ingreso contratado del mes, mes a mes, en pesos0$ 25,0 M$ 50,0»
```

Ocho distancias pasaron a siete y la figura huérfana quedó nombrada. La puerta
cierra en los dos sentidos.

El `aviso` de los cuatro `plat-tabla-eq` fuera de figura **no es una falla** y es
a propósito: esos cuatro no están exentos, así que arriba se los contó como
diana y se les exigió su cifra como a cualquier tabla. Se nombran para que se vea
que la exención no se reparte sola.

---

### (b) Ningún chip usa la terna de estado —— en los **dos** temas —— prueba **15**

**Por qué se escapó.** La prueba existía y daba verde mientras la regla se
rompía. Dos agujeros:

1. **Corría en un solo tema.** El chip «MES EN CURSO · PARCIAL» salía gris en
   claro y ámbar en oscuro, y sólo se miraba el claro. La causa está en los
   tokens: `tema.css:639` define `--entra-txt-rgb: var(--entra-rgb)` en oscuro,
   así que **`--entra-txt` y `--entra` colapsan en el mismo color**. Un chip
   escrito con la variante «de texto» de un color de estado es, en oscuro, el
   color de estado.
2. **La lista de colores estaba escrita a mano**: doce cadenas `rgb(…)` copiadas
   de `tema.css`. Cambiar un token dejaba la prueba mirando un color que ya no
   existe —— verde y falso otra vez.

**El arreglo.** Los doce tokens (`--libre / --entra / --ocupado` × `""`,
`-suave`, `-borde`, `-txt`) se **resuelven en el `:root` vivo de la página** y los
normaliza el propio navegador; se mide en claro **y** en oscuro, comprobando
antes que el tema pedido se haya aplicado de verdad; se agregó «cobertura» y
«parcial» al vocabulario; y los `<text>` de los SVG quedan fuera del barrido ——
ahí el color **sí** codifica estado y la franja del mes parcial es una figura, no
un chip. Sin excepciones para chips: la terna codifica estado de espacio.

**ANTES** (con `color: var(--entra-txt)` en `.plat-chip--parcial`, exactamente
como lo midió el verificador):

```
       terna en claro: --libre rgb(0, 128, 90) · --libre-suave rgb(224, 240, 235) · --libre-borde rgb(158, 207, 192) · --libre-txt rgb(0, 107, 76) · --entra rgb(206, 138, 10) · --entra-suave rgb(249, 241, 226) · --entra-borde rgb(236, 211, 162) · --entra-txt rgb(138, 90, 6) · --ocupado rgb(216, 52, 46) · --ocupado-suave rgb(250, 231, 230) · --ocupado-borde rgb(240, 178, 176) · --ocupado-txt rgb(179, 39, 32)
  FALLA «cartera» claro — 1 rótulo(s) que no son estado de espacio, pintados con un color de la terna
         «mes en curso · parcial» color = rgb(138, 90, 6) = --entra-txt
  ok   «sesión» claro — ningún chip …
  ok   «informe» claro — ningún chip …
       terna en oscuro: --libre=--libre-txt rgb(0, 190, 134) · --libre-suave rgb(9, 45, 40) · --libre-borde rgb(6, 90, 69) · --entra=--entra-txt rgb(245, 165, 36) · --entra-suave rgb(48, 41, 24) · --entra-borde rgb(109, 79, 28) · --ocupado=--ocupado-txt rgb(244, 84, 78) · --ocupado-suave rgb(48, 28, 31) · --ocupado-borde rgb(109, 45, 46)
  FALLA «cartera» oscuro — 1 rótulo(s) que no son estado de espacio, pintados con un color de la terna
         «mes en curso · parcial» color = rgb(245, 165, 36) = --entra / --entra-txt
  ok   «sesión» oscuro — ningún chip …
  ok   «informe» oscuro — ningún chip …
```

El renglón `terna en oscuro` **imprime el colapso**: `--entra=--entra-txt`,
`--libre=--libre-txt`, `--ocupado=--ocupado-txt`. Ya no hay que ir a leer
`tema.css` para entender por qué el chip cambia de color al apagar la luz.

**DESPUÉS**:

```
       terna en claro: … (idéntica)
  ok   «cartera» claro — ningún chip de señal / estado de cuenta / prioridad / cobertura pintado con la terna de estado
  ok   «sesión» claro — ningún chip …
  ok   «informe» claro — ningún chip …
       terna en oscuro: --libre=--libre-txt rgb(0, 190, 134) · … · --entra=--entra-txt rgb(245, 165, 36) · … · --ocupado=--ocupado-txt rgb(244, 84, 78) · …
  ok   «cartera» oscuro — ningún chip de señal / estado de cuenta / prioridad / cobertura pintado con la terna de estado
  ok   «sesión» oscuro — ningún chip …
  ok   «informe» oscuro — ningún chip …
```

Seis afirmaciones donde había tres, y las tres nuevas son las del tema en el que
se escapó.

---

### (c) El informe hereda el periodo, y nadie usa `<input type="month">` —— pruebas **5b** y **19**

Dos mitades. La **estática** prohíbe la forma que garantiza la falla; la de
**navegador** mide el recorrido completo: se cambia el mes en la sesión, se
aprieta el botón de verdad, y se mira **qué pidió** el informe y **qué escribió
en la hoja**.

Lo estático son cuatro afirmaciones: ningún `<input type="month">` en las tres
pantallas (A usa un `<select>` de los periodos que existen —— el `input` lo pinta
Chromium en el idioma del navegador y a 390 px se corta); el informe no clava el
periodo en un `useState` sin fuente; la sesión se lo manda al navegar; y las tres
pantallas importan el mismo interruptor de tema (eso es (d), va abajo).

**ANTES**:

```
[5b] el control de periodo y el interruptor de tema
  FALLA 2 `<input type="month">` en el área
         cartera · src/pages/Plataforma.tsx:539  type="month"
         sesión · src/pages/DetalleCliente.tsx:566  type="month"
  FALLA el informe clava el periodo en un `useState(mesActual())` sin setter ni fuente: no puede heredar el mes que el asesor eligió
         src/pages/InformeCliente.tsx  ·  la sesión analiza julio y el informe imprime el mes en curso
  ok   las 1 navegaciones al informe llevan el periodo elegido
```

y, en pantalla:

```
  ok   la sesión aceptó el periodo 2026-08 (control `<input>`, mes en curso 2026-09)
  FALLA el informe NO heredó el periodo: la sesión estaba en 2026-08 y el informe pidió /api/plataforma/clientes/mercafresco/detalle?periodo=2026-09 · /api/plataforma/clientes/mercafresco/detalle?periodo=2026-09
         un gerente se lleva impreso un mes que el asesor no eligió, y la hoja no lo dice
  FALLA el renglón del periodo del informe no dice 2026-08 («agosto»)
         dice: «Periodo septiembre de 2026 · 2026-09-01 a 2026-09-30»
```

**DESPUÉS**:

```
[5b] el control de periodo y el interruptor de tema
  ok   ninguna de las 3 pantallas usa `<input type="month">` (A usa un `<select>` de los periodos que existen)
  ok   el informe toma el periodo de quien lo abre (lee la URL o el estado de navegación), no de un `useState` clavado
  ok   las 1 navegaciones al informe llevan el periodo elegido
```

```
  ok   la sesión aceptó el periodo 2026-08 (control `<select>`, mes en curso 2026-09)
  ok   el informe heredó el periodo 2026-08: pidió /api/plataforma/clientes/mercafresco/detalle?periodo=2026-08
  ok   el renglón del periodo del informe dice el mes heredado: «Periodo agosto de 2026 · 2026-08-01 a 2026-08-31»
```

Dos detalles del diseño de la prueba, porque los dos son maneras de dar verde
sin haber probado nada:

* **el periodo elegido nunca es el mes en curso.** Si lo fuera, el informe
  acertaría por casualidad. Se toma la primera opción del `<select>` distinta del
  mes actual (o el mes anterior, si el control es un `<input>`), y si no hay
  ninguna, la prueba **falla** diciendo que la base no tiene con qué probar.
* **no vale con que el nombre del mes aparezca en cualquier parte de la hoja.**
  En una pieza que compara contra el mes anterior, «agosto» sale escrito igual
  aunque el informe esté armado con septiembre —— la primera versión de esta
  prueba pasaba en el ANTES por eso. Ahora se lee el **renglón del periodo**, que
  es el que el gerente ve arriba, y si no existe, la fecha de arranque del rango
  (`2026-08-01`), que ningún otro capítulo escribe.

El control se maneja sin saber de qué tipo es (`<select>` → `selectOption`,
`<input>` → `fill`): la prueba afirma el comportamiento, no la etiqueta.

---

### (d) Un solo interruptor de tema, con un solo `aria-label` —— pruebas **5b** y **20**

Había dos, y pintaban lo mismo: el de `src/tema.tsx` («Cambiar a **modo**
oscuro») y el de `components/plataforma/consola.tsx` («Cambiar a **tema**
oscuro»). Mismo atributo, misma llave de `localStorage`, distinta forma y —— lo
que importa —— distinto anuncio: el mismo botón cambia de nombre según en qué
pantalla del área esté parado un lector de pantalla.

**ANTES**:

```
  FALLA 2 interruptores de tema distintos en la misma área
         cartera → ../tema
         sesión → ../components/plataforma/consola
         informe → ../components/plataforma/consola
  FALLA 4 redacciones distintas del `aria-label` del interruptor conviven en el área
         Cambiar a modo oscuro
         Cambiar a modo claro
         Cambiar a tema oscuro
         Cambiar a tema claro
```

```
  ok   «cartera» — exactamente 1 interruptor de tema visible
  ok   «sesión» — exactamente 1 interruptor de tema visible
  ok   «informe» — exactamente 1 interruptor de tema visible
  FALLA 3 `aria-label` distintos para el mismo interruptor, según la pantalla
         cartera: «Cambiar a modo oscuro»
         sesión: «Cambiar a tema claro»
         informe: «Cambiar a tema oscuro»
```

Nótese que «1 interruptor visible por pantalla» **pasa** en el ANTES: contar
botones no alcanza. Lo que delata las dos implementaciones es el nombre con que
cada una se anuncia, y por eso la afirmación fuerte es esa.

**DESPUÉS**:

```
  ok   las 3 pantallas usan el mismo interruptor de tema (`../tema`)
  ok   el interruptor del área tiene un solo `aria-label` por dirección: Cambiar a modo oscuro · Cambiar a modo claro
```

```
  ok   «cartera» — exactamente 1 interruptor de tema visible
  ok   «sesión» — exactamente 1 interruptor de tema visible
  ok   «informe» — exactamente 1 interruptor de tema visible
  ok   las 3 pantallas anuncian el interruptor con el mismo `aria-label`: «Cambiar a modo oscuro»
```

---

## 3 · Cero exports sin importador en `components/plataforma/`

Era un **aviso** («11 de 20 exports de `consola.tsx` sin un solo importador»), que
es una forma elegante de no arreglar nada. Ahora es una **puerta**, y ya no mira
sólo el legado: mira **todo `src/components/plataforma/`**. Cuenta como
importador cualquier **otro** archivo `.ts`/`.tsx` de `src/` que nombre el
símbolo; el propio archivo no cuenta.

**ANTES** (fixture, con `consola.tsx` intacto):

```
  FALLA 29 de 126 exports de src/components/plataforma/ no los importa NADIE
         src/components/plataforma/cartera-datos.ts: 4 de 17 sin importador — SENALES · ClaveSenal · PlataCola · ColumnaComposicion
         src/components/plataforma/consola.tsx: 11 de 20 sin importador — KpiTile · TonoBarra · EstadoBarra · Barras · BarraFila · etiquetaEstado · EstadoPill · SinDato · TablaScroll · TablaHeadCelda · TablaHead
         src/components/plataforma/graficos.tsx: 6 de 22 sin importador — anchoAprox · ColumnaTabla · TablaEquivalente · rotuloRejillaMeses · TonoUnidad · GrupoUnidades
         src/components/plataforma/sesion-datos.ts: 5 de 15 sin importador — GrupoOportunidad · agruparOportunidades · RepartoSede · repartoPorSede · ValorEnJuego
         src/components/plataforma/sesion-piezas.tsx: 3 de 27 sin importador — TonoChip · ChipPrioridad · Col
         Si el símbolo se usa sólo adentro de su archivo, sacale el `export`; si no se usa, borralo.
```

**PASO INTERMEDIO** (árbol real 16:35, con los 11 de `consola.tsx` ya borrados
por el otro agente pero el resto del directorio sin tocar). Vale la pena dejarlo
escrito, porque es el renglón que muestra que la regla no era sólo sobre el
legado:

```
  FALLA 18 de 111 exports de src/components/plataforma/ no los importa NADIE
         src/components/plataforma/cartera-datos.ts: 4 de 17 sin importador — SENALES · ClaveSenal · PlataCola · ColumnaComposicion
         src/components/plataforma/graficos.tsx: 6 de 22 sin importador — anchoAprox · ColumnaTabla · TablaEquivalente · rotuloRejillaMeses · TonoUnidad · GrupoUnidades
         src/components/plataforma/sesion-datos.ts: 5 de 15 sin importador — GrupoOportunidad · agruparOportunidades · RepartoSede · repartoPorSede · ValorEnJuego
         src/components/plataforma/sesion-piezas.tsx: 3 de 27 sin importador — TonoChip · ChipPrioridad · Col
```

Los 11 de `consola.tsx` eran código muerto de verdad. Los otros 18 **no** lo
eran —— cada uno se usa adentro de su propio archivo, verificado uno por uno ——
pero eran igual exports que nadie importaba, que es lo que la regla pide contar,
y el arreglo era quitar la palabra `export`. Se reportaron con archivo y línea; el
otro agente los sacó entre las 16:40 y las 16:42, mientras esto se escribía:

```
[16:40:55] exports sin importador: 14
[16:41:15] exports sin importador: 8
[16:41:36] exports sin importador: 8
[16:41:56] exports sin importador: 0
```

**DESPUÉS** (árbol real, corrida final):

```
  ok   los 93 exports de src/components/plataforma/ (8 archivos) tienen al menos un importador: cero código muerto
```

Y como efecto colateral se cayó también el aviso que arrastraba la fase: los
«12 `fontSize` literales del legado» ya no existen, porque el legado que los
llevaba encima era justamente lo que nadie importaba.

(`rotuloRejillaMeses` lo nombraba `README-graficos.md`; un documento no es un
importador y por eso nunca contó. La regla mira `.ts`/`.tsx` de `src/`.)

---

## 4 · Puertas que corrí, y el estado del árbol

Sólo lo mío, como se pidió: nada de la suite del backend, nada de `npm run
build`.

| Puerta | Resultado |
| --- | --- |
| `cd frontend && npx tsc --noEmit` | **limpio**, exit 0 |
| `npm run probar:graficos` | **exit 0** · «Todo en orden» · **0 procesos vivos al terminar**, puerto 5211 libre |
| `npm run probar:plataforma` (con navegador) | **exit 0** · **79 afirmaciones en verde, «frontera: sin fallas»** |
| `npm run probar:plataforma` (sin navegador, que es el camino de `npm run probar`) | **exit 0** · «frontera: sin fallas» · 8-20 se saltan y lo dicen |
| `git diff --stat origin/main -- backend` · `git status --porcelain backend` | **vacíos los dos** |

Los siete avisos que quedan en `probar:plataforma` son los declarados y no son
fallas: `cobra_debajo` (el único campo que el área declara ella misma), los dos
`email` con su razón escrita, la excepción `parcial`, el `/favicon.ico` del
servidor de dev, y los cuatro `plat-tabla-eq` fuera de figura que —— justamente
por estarlo —— se midieron como diana.

Servidores: backend `:8053`, Vite `:5212`, `:5213` y `:5214`, todos muertos al
terminar con patrones que apuntan al pid, no a un `pkill` que se lleve la propia
shell. Ninguna `*.db` quedó en el repositorio (la base sembrada vive en
`/tmp/aud-p/base`). Los fixtures viven fuera del árbol. Sin librerías nuevas:
`node:net` es del runtime, y Playwright es el que ya estaba.

Nada de `frontend/src/**` se tocó: los dos únicos archivos modificados por esta
auditoría son `frontend/scripts/probar-graficos.mjs` y
`frontend/scripts/probar-plataforma.mjs`. No hay commit ni push.

---

## 5 · Lo que queda dicho y no arreglado

1. **La excepción declarada `.plat-chip--parcial` de la parte estática (§5) ya no
   hace falta**: el chip se pinta en gris (`--ink-2` / `--surface-2` /
   `--line-strong`) en los dos temas. La declaración sigue en el test, en el
   bloque `EXCEPCIONES`, y hoy sólo cubre seis consumos de `--entra` que están en
   los **dibujos** (la franja del mes parcial), no en chips. Si el Gráfico
   confirma que la franja se queda, conviene renombrar la excepción para que diga
   «franja», no «chip» —— es una línea, y no la toqué porque el bloque describe
   una decisión de diseño que no es mía.
2. **`probar:graficos` sigue saltándose las partes 1-5 sin `playwright-core`
   alcanzable**, y eso está bien y lo dice; pero en esta máquina Playwright vive
   en el global de node (`/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.mjs`)
   y hay que pasarlo por `PROBAR_GRAFICOS_PLAYWRIGHT`. Sin esa variable,
   `npm run probar` da verde **sin haber abierto un navegador**. No es una
   regresión de esta fase y no cambié el comportamiento (declararlo obligatorio
   rompería `npm run probar` en máquinas sin Playwright), pero es la próxima
   forma de «verde y falso» que tiene este script.
