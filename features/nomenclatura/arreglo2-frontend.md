# Ronda 2, lado frontend: que la colisión se vea en el plano, y que el aviso de la planilla no se pueda saltear

**Fase 12 · RECABRA · 2026-09-08 · rama `claude/fase-12-nomenclatura` en `/tmp/re-nom`.**
Constructor de frontend, segunda ronda. Archivos tocados: `frontend/src/utils/nomenclatura.ts`,
`frontend/src/components/FloorPlan2D/FloorPlan2D.tsx`, `frontend/src/pages/DashboardView.tsx`,
`frontend/src/vender.css`, `frontend/src/components/CargaMasiva/CargaMasiva.tsx`,
`frontend/scripts/probar-nomenclatura.mjs` y un bullet de `docs/ESTADO.md`.
**Ni una línea de `backend/**`.** Sin librerías nuevas, sin campos nuevos en la API, sin
migraciones. Todo lo de abajo está medido **por la pantalla real** (backend propio en 8083,
vite en 5503, base de usar y tirar en `/tmp/nom-fe2/`, `TMPDIR` fuera del repo), con el plano
de CIUDAD JARDIN del diagnóstico y los dos contratos de la foto del dueño. Servidores
apagados y base borrada al terminar.

Cierra el **F5** de `arreglo-verificacion.md` (grave, seguía abierto) y el **F3** (cosmético),
y pone la pantalla del lado del aviso nuevo del backend (**F1**).

---

## 1. Qué se ve ahora que antes no se veía

| | Antes | Ahora |
|---|---|---|
| Plano 2D | De los dos muebles rotulados «IMP-08», **uno** dibujaba la pastilla y el otro sólo el emoji | **Los dos** dibujan su nombre, en rojo y con la marca **«IMP-08 ×2»** |
| Mapa de Vender | Dos cajas idénticas: `IMP-08 · libre 16 sep` y `IMP-08 · libre 16 sep` | Las mismas dos, cada una con una tercera línea roja: **`×2 · IMP-08`** y **`×2 · IMP-12`** |
| Panel del plano | El aviso ámbar salía sólo en el mueble **renombrado** | Sale en **los dos**: el que tiene el código pisado también se entera |
| Botón «Etiquetas» | — | Apaga las pastillas informativas; **el aviso no se apaga** |
| Planilla, fila con aviso | Fondo ámbar y el mensaje apretado en la última columna | Franja arriba, barra al costado y el aviso **entero, en su propio renglón** |
| Planilla, «Nombre dibujado» de una fila rechazada | «—» siempre | «—» sólo cuando de verdad no hay mueble resuelto (F3) |

Y lo que **no** cambió, a propósito: no se prohíbe nada. Los dos muebles existen, son
distintos y contratar los dos es legítimo — el plano avisa, no bloquea, y un plano que ya
está mal se sigue abriendo, moviendo y guardando (medido abajo).

## 2. `utils/nomenclatura.ts`: la geometría de nombres decide, el plano pinta

Tres piezas nuevas, todas probadas sin navegador:

- **`nombresChocados(items) → Map<nombre, cuántos>`** — los nombres **dibujados** que lleva
  más de un mueble, con la cuenta. `nombresRepetidos` ya contestaba «cuáles están
  repetidos» para listarlos en la revisión; esto contesta «este mueble que estoy por
  dibujar, ¿comparte su nombre?», que es la pregunta que el plano hace una vez por caja. Por
  eso es un mapa: se arma una vez por plano y se consulta N veces. **La cuenta y no un
  sí/no**, porque el aviso tiene que poder decir cuántos son.
- **`choqueDeRotulo(mueble, chocados) → ChoqueDeRotulo | null`** — `{ veces, marca: "×2",
  codigo, texto }`. `codigo` es el código real **cuando el nombre dibujado lo tapa** (null
  cuando el mueble ya se dibuja con su código: ahí no hay nada oculto que revelar), y
  `texto` es la frase para el `title`, sin ramas y siempre cierta: *«IMP-08» lo dibujan 2
  muebles de esta sede. Éste es el de código IMP-12: el nombre no los distingue, el código
  sí.*
- **`rotulosDelPlano(mueble, cabeAdentro, chocados?)`** — el tercer argumento es opcional y
  sin él se comporta exactamente como antes (ningún llamador viejo empieza a pintar rojo).
  Con él cambia **una sola** decisión: un mueble chico **sin** nombre puesto a mano, que por
  la regla vieja no llevaba pastilla, la lleva **si su nombre lo lleva otro**.

**Las dos reglas viejas siguen mandando, y hay pruebas que lo fijan:**

1. *El nombre aparece una vez.* La marca **no es un nombre**: es la cuenta. Si el nombre
   entra adentro de la caja, arriba sube sólo «×2».
2. *No se llena el plano de pastillas.* Se marcan sólo los que chocan — en el plano medido,
   8 muebles de 14; en un plano sano, cero.

```
npm run probar:nomenclatura     40 → 48 pruebas, todo en orden
```

Las ocho nuevas están bajo *«en el plano se tiene que VER que dos se llaman igual»*, y la
que importa se llama, con mayúsculas, `LOS DOS MUEBLES QUE SE LLAMAN IGUAL MUESTRAN SU
NOMBRE`.

## 3. El plano 2D

`FloorPlan2D` arma `chocados` una vez por plano (`useMemo` sobre `items`) y se lo pasa a
`rotulosDelPlano`. La pastilla, que ya existía, pasa a tener un segundo trabajo: cuando hay
choque va en rojo (`--danger` / `--danger-50`), con la marca pegada al nombre, y el nombre de
adentro de la caja también se lee en rojo — la caja de al lado dice exactamente lo mismo.

Volcado de los `<text>` del SVG, misma siembra, antes y después
(`capturas/arreglo2-2-plano.png`, `arreglo2-2b-plano-zoom.png`):

```
antes  (fix-C2-3-plano.png):  🏷️ 🏷️ IMP-17 🏷️ 🏷️ IMP-16 🏷️ IMP-08 🏷️ IMP-10 🏷️ IMP-12 🏷️ IMP-14 🏷️ 🏷️ 🏷️
ahora:                        🏷️ | IMP-08 ×2 | IMP-17 ×2 | IMP-10 ×2 | IMP-16 ×2 |
                              IMP-08 ×2 | IMP-10 ×2 | IMP-12 | IMP-14 | IMP-16 ×2 | IMP-17 ×2
```

Los cuatro nombres repetidos aparecen **dos veces cada uno**, los dos renombrados que no
chocan (`IMP-12`, `IMP-14`) conservan su pastilla neutra, y `IMP-07` —chico y sin nombre
puesto a mano— sigue mostrando sólo el emoji.

**El aviso no se apaga con «Etiquetas».** Medido por pantalla
(`capturas/arreglo2-6-sin-etiquetas.png`):

```
Etiquetas ENCENDIDAS: IMP-08 ×2 · IMP-17 ×2 · IMP-10 ×2 · IMP-16 ×2 · IMP-08 ×2 · IMP-10 ×2 · IMP-12 · IMP-14 · IMP-16 ×2 · IMP-17 ×2
Etiquetas APAGADAS:   IMP-08 ×2 · IMP-17 ×2 · IMP-10 ×2 · IMP-16 ×2 · IMP-08 ×2 · IMP-10 ×2 ·                    IMP-16 ×2 · IMP-17 ×2
```

Una etiqueta se puede ocultar; un aviso de que dos espacios se leen igual, no.

**El panel avisa de los dos lados.** `choqueGuardado` miraba `item.nomenclatura`, así que del
par sólo hablaba con el renombrado: el mueble cuyo código quedó pisado —el que de verdad se
llama IMP-08— abría el panel sin una palabra, y es justo el que se vende por error. Ahora se
pregunta por el nombre que se **ve**. Medido, tocando las dos pastillas
(`capturas/arreglo2-panel-victima.png`, `arreglo2-panel-renombrado.png`):

```
el verdadero IMP-08 (antes: nada)  → Ojo: «IMP-08» ya es el nombre del mueble IMP-12. …
el renombrado (code IMP-12)        → Ojo: «IMP-08» ya es el nombre del mueble IMP-08, que se
                                     dibuja con su código. …
```

**La regla que no se negocia, otra vez de punta a punta** (`capturas/arreglo2-3-plano-guardado.png`):
con los seis nombres en conflicto vivos se abrió el plano, se seleccionó un mueble, se
arrastró y se guardó. Estado **«Sincronizado»**, ningún cartel de error, y contra el
servidor (`GET /api/layout/CIUDAD JARDIN`): `IMP-08` pasó de `cz 8.2` a `6.7`, `updated_at`
nuevo y **las seis nomenclaturas enteras**
(`IMP-09:IMP-17, IMP-11:IMP-16, IMP-12:IMP-08, IMP-13:IMP-10, IMP-14:IMP-12, IMP-15:IMP-14`).

## 4. El mapa isométrico de Vender: donde se elige

El rótulo del mapa tenía dos líneas —el nombre y, si se libera adentro del periodo, cuándo—.
Los que chocan ganan una tercera, en el rojo del plano: **la cuenta y el código real**.

```
antes  (fix-C2-1-vender.png):  ["IMP-08 libre 16 sep", "IMP-08 libre 16 sep", …]
ahora  (arreglo2-1-vender.png): ["IMP-08 libre 16 sep ×2 · IMP-08",
                                 "IMP-08 libre 16 sep ×2 · IMP-12", …]
```

Ésa es la foto del dueño, con las dos cajas todavía rotuladas igual —tienen que estarlo, es
lo que dice el plano— **pero ya no confundibles**: cada una dice cuántas hay y cuál es. El
código no es un adorno: es lo que el contrato muestra cuando se toca una
(`capturas/arreglo2-4-vender-elegido.png`, el renglón **`IMP-12`**), así que el rótulo pasó a
hablar el mismo idioma que el paso siguiente.

Tres detalles que no son de estilo:

- **El que choca no cede.** El deschoque de rótulos ordena por `peso` y el que no encuentra
  lugar desaparece. Un rótulo repetido que cede deja la colisión invisible otra vez —de ahí
  venimos—, así que el choque entra con **peso 0**, por encima de «se libera», «libre» y
  «tomado». En el plano medido se dibujan los ocho.
- **Sin caja y sin cuerpo a mano.** La tercera línea es un `<tspan class="p-chq">` con su
  color en `vender.css`; hereda el cuerpo (`--lbl`, constante en pantalla) y el halo de
  `.p-cod`. Los dos guardarraíles de `probar:vender` sobre el rótulo siguen en verde.
- **Se puede medir sin leer píxeles:** el `<text>` del rótulo lleva `data-choque="×2 · IMP-12"`
  cuando choca, y nada cuando no.

`npm run probar:vender` — 12 pruebas, sin fallas: ni componentes nuevos en la rama de Vender,
ni `--signal` derramado, ni cuerpos de letra fuera de la escala, ni caja de ancho fijo en el
rótulo. Y tocando el rótulo del gemelo, el contrato queda con **IMP-12**: la caja de impacto
creció una línea y sigue eligiendo el mueble correcto.

## 5. La planilla: el aviso se lee entero y no se parece a una fila limpia

El backend, en paralelo, hace que la fila que resuelve al mueble pisado entre como **aviso**
con un mensaje que nombra al otro mueble. Del lado de la pantalla:

1. **Una franja arriba de la tabla** cuando hay avisos: *«1 fila entra igual, pero hay algo
   que mirar antes de guardar. Está en ámbar, con el aviso completo debajo del renglón: si no
   es lo que quisiste, desmarcála y arreglá la planilla.»* La categoría «entra, pero se mira»
   dependía de que alguien notara un fondo ámbar entre veinte renglones.
2. **El mensaje en su propio renglón, a todo el ancho**, con su triángulo y el color del
   estado. Metido en la última celda, un mensaje que nombra el otro mueble caía en seis
   líneas de columna angosta; ahora se lee como una frase.
3. **Barra de color al costado** de la fila (ámbar o roja). Una fila limpia no lleva barra.
4. **Las notas de trámite no se disfrazan de aviso.** «Proveedor nuevo: se va a crear.» es un
   mensaje de una fila `ok`: va en el mismo renglón nuevo pero **en gris y sin triángulo**.
   Si una nota se pinta igual que un aviso, en una planilla de temporada entera se aprende a
   saltear los dos — que es la regla que `docs/ESTADO.md` ya tenía escrita para el amarillo.

Medido (`capturas/arreglo2-p2-revision.png` y el recorte `arreglo2-p2b-planilla-zoom.png`):

```
0 listas · 1 con avisos · 2 no entran
⚠ 1 fila entra igual, pero hay algo que mirar antes de guardar. …

2  CIUDAD JARDIN-IMP-07   se dibuja con su código   COLGATE    …   No entra
   ⚠ «CIUDAD JARDIN-IMP-07» ya tiene un contrato del 2026-01-01 al 2026-09-15. …
3  CIUDAD JARDIN-IMP-08   —                         COLGATE    …   No entra
   ⚠ «IMP-08» es ambiguo en CIUDAD JARDIN. Escribí CIUDAD JARDIN-IMP-12 para el mueble que
     el plano dibuja «IMP-08», o CIUDAD JARDIN-IMP-08 para el que se dibuja con su propio código.
4  CIUDAD JARDIN-IMP-09   IMP-17                    POSTOBON   …   Revisar   ☑
   ⚠ Ojo: este contrato va al mueble CIUDAD JARDIN-IMP-09, que el plano dibuja «IMP-17». Ese
     nombre es el código de OTRO mueble de la sede: CIUDAD JARDIN-IMP-17. …
```

Contra una tanda limpia (`capturas/arreglo2-p4b-limpia-zoom.png`): sin franja, sin barras,
«Lista» en verde y la nota del proveedor nuevo en gris.

### F3, el «—» que escondía el mueble resuelto

`CargaMasiva.tsx` ponía «—» en la columna **Nombre dibujado** para todo `estado === "error"`,
con el comentario «si la fila no entró, no hay mueble resuelto». No es cierto cuando el
rechazo es por **choque de fechas**: ahí el mueble sí se resolvió, y es justo cuando querés
ver cuál era. La celda ahora pregunta si hay mueble del que hablar:

```ts
const resuelto = puede || Boolean(r.nombre) || Boolean(r.nombre_dibujado);
```

`nombre` es el **tipo** del mueble resuelto (`fixture.label`) y el servidor sólo lo llena
cuando resolvió contra el plano: no hay campo nuevo, es el dato que ya viajaba. En la
captura de arriba se ve el resultado: la fila 2 (rechazada por fechas) dice **«se dibuja con
su código»**, y la fila 3 (ambigua, sin mueble) sigue diciendo «—», que ahí es la verdad.

## 6. Cómo verificarlo

```bash
cd /tmp/re-nom/frontend
npx tsc --noEmit                 # exit 0
npm run probar:nomenclatura      # 48 pruebas
npm run probar:revision          # 31 pruebas (no se tocó revision.ts; se corre porque usa nomenclatura)
npm run probar:vender            # 12 pruebas
```

**No se corrió** `npm run build`, ni la suite del backend, ni `npm run probar` completo: los
corre el Verificador. Para reproducir lo del navegador (levanta backend 8083 y vite 5503, y
hay que apagarlos después — el arnés quedó en `/tmp/nom-fe2/`, fuera del repo):

```bash
/tmp/nom-fe2/run_back.sh &                                   # backend propio
cd /tmp/re-nom/backend && python3 /tmp/nom-fe2/seed.py       # plano de CIUDAD JARDIN
python3 /tmp/nom-fe2/seed_contrato.py                        # los dos contratos de la foto
/tmp/nom-fe2/run_vite.sh &
cd /tmp/nom-fe2 && node pw_caps.mjs arreglo2      # mapa de Vender + plano 2D
cd /tmp/nom-fe2 && node pw_panel2.mjs             # el panel, de los dos lados del choque
cd /tmp/nom-fe2 && node pw_etiquetas.mjs          # el aviso no se apaga
cd /tmp/nom-fe2 && node pw_mover.mjs              # el plano malo se mueve y se guarda
cd /tmp/nom-fe2 && node pw_vender.mjs             # tocar el rótulo del gemelo elige bien
cd /tmp/nom-fe2 && node pw_planilla.mjs /tmp/nom-fe2/p2.csv arreglo2-p2 solorevisar
```

## 7. Lo que esto NO cierra

1. **En Supervisar el mapa sólo rotula la cara abierta**, así que un choque de un mueble que
   no está seleccionado no se ve ahí. Es la decisión de esa pantalla —el plano es un
   ubicador, la tabla de abajo es el directorio y lista el código real—, y no se tocó.
2. **La cuenta incluye los muebles no comercializables.** `nombresChocados` mira el plano
   entero; el mapa de Vender no rotula lo que no se alquila, así que un choque contra una
   columna o un checkout diría «×2» con un solo rótulo a la vista. En el plano 2D los dos se
   ven. No apareció en el plano medido; queda dicho.
3. **La pastilla del plano 2D no se puede pasar el mouse por encima**: la capa del rótulo no
   cobra el puntero (si lo cobrara, una pastilla flotando sobre el vecino le robaría el
   clic). El `texto` del choque viaja igual en un `<title>` —texto accesible, no globito— y
   la frase entera se lee en el panel al tocar el mueble.
4. **Cuando muchos muebles chicos y pegados chocan, sus pastillas se tocan.** El plano 2D no
   tiene deschoque de rótulos como el mapa isométrico. Se nota en el plano medido, que es el
   peor caso posible (8 de 14 marcados); en un plano sano no hay ninguna.
5. **El editor 3D no se tocó.** Dibuja `nombreDeMueble` en sus paneles pero no es una
   pantalla donde se elija un mueble para venderlo, y —comprobado en la ronda 1— no escribe
   `nomenclatura`.
6. **`docs/ESTADO.md`:** agregué **un solo bullet**, el de la regla del rotulado del plano
   («Un mueble tiene UN nombre» → y qué pasa cuando dos se llaman igual). El párrafo de
   §«Carga masiva desde una planilla» → «Qué se rechaza y qué sólo se avisa» es del otro
   constructor, y no lo toqué para no chocar.
7. **F4 sigue vivo** (fuera de fase): un CSV con `01/10/2026` se lee 10 de enero
   (`utils/planilla.ts`, `XLSX.read(…, { cellDates: true })`). Lo reportaron la ronda 1 y el
   Verificador; sigue igual, y crea contratos en el mes equivocado cuando el día es ≤ 12.

---

## Índice de capturas nuevas

| Archivo | Qué muestra | Contra |
|---|---|---|
| `arreglo2-1-vender.png` · `arreglo2-1b-vender-zoom.png` | el mapa de Vender: las dos cajas «IMP-08», cada una con `×2 · IMP-08` / `×2 · IMP-12` | `fix-C2-1-vender.png` |
| `arreglo2-2-plano.png` · `arreglo2-2b-plano-zoom.png` | el plano 2D: los cuatro nombres repetidos, marcados en los ocho muebles | `fix-C2-3-plano.png`, `B-3-plano.png` |
| `arreglo2-3-plano-guardado.png` | el plano que ya está mal se mueve y se guarda: «Sincronizado», sin un cartel | `fix-F-3-guardado.png` |
| `arreglo2-4-vender-elegido.png` | tocando el rótulo del gemelo, el contrato queda con `IMP-12` | `fix-V-1-elegido.png` |
| `arreglo2-5-revisar.png` | «Revisar antes de negociar» y la reconciliación, sin regresión | `fix-F-1-revisar.png`, `fix-G-revisar.png` |
| `arreglo2-6-sin-etiquetas.png` | con «Etiquetas» apagadas quedan sólo los ocho avisos | — |
| `arreglo2-panel-victima.png` | el panel del mueble **pisado**, que antes no decía nada | — |
| `arreglo2-panel-renombrado.png` | el panel del renombrado: el ámbar de siempre, y se sigue pudiendo editar | `arreglo-5-panel-avisa-lo-viejo.png` |
| `arreglo2-p2-revision.png` · `arreglo2-p2b-planilla-zoom.png` | la planilla: franja, barras, aviso entero y el «se dibuja con su código» de F3 | `fix-E2-revision.png` |
| `arreglo2-p3-revision.png` | las dos caras del aviso del backend en la misma tanda (el pisado y el que pisa) | — |
| `arreglo2-p4-revision.png` · `arreglo2-p4b-limpia-zoom.png` | una tanda limpia: sin franja, sin barras, la nota en gris | — |
