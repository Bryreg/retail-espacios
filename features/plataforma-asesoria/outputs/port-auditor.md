# Fase 11 · Auditoría de frontera y de forma del port de A

**Entregable:** `frontend/scripts/probar-plataforma.mjs` (1.117 líneas, `npm run probar:plataforma`,
agregado a la cadena `probar`) y `frontend/scripts/sembrar-plataforma.py` (188 líneas, la base con
la que corre la parte de navegador). Sin commit ni push.

**Resultado de la última corrida completa, con backend propio sembrado y las tres pantallas
abiertas de verdad: 58 afirmaciones en verde, 0 fallas.** `npx tsc --noEmit` limpio.

---

## 0. Qué se auditó, y contra qué

La consola del operador es la única pantalla del producto que abre las bases de **todos** los
clientes a la vez. Eso la vuelve la superficie con más para perder: la tarifa de referencia de un
supermercado, el correo de un proveedor, el nombre de otro cliente adentro de un informe que el
gerente se lleva impreso. Ninguna de esas fronteras se ve mirando la pantalla —— se ven cuando ya
se filtraron.

La vara son dos documentos, y ninguno es una opinión: el **brief §4** (la frontera dura) y la
**opción A tal cual la eligió el dueño**, con los tres ajustes que la comparativa marca como REGLA
rota y no como gusto —— (a) los chips de señal / estado de cuenta / prioridad en tinta gris, (b) el
rótulo de la rejilla de doce meses con su cifra, (c) `--ink-4` fuera del texto.

---

## 1. El test: diecisiete guardarraíles, en dos mitades

### Mitad estática (sin navegador, sin servidor, sin backend —— corre en `npm run probar`)

| # | Qué afirma | Resultado |
|---|---|---|
| 1 | **Frontera de campos.** Todo acceso `snake_case` en los 11 archivos del área resuelve contra los shapes de `api/plataforma.ts` (171 campos + los literales de sus uniones), `api/derechos.ts` y lo que el área declara. Más 11 campos **prohibidos por nombre**: `tarifa*` (el valor de la tarifa de referencia), `correo`/`telefono`/`phone`/`contact_name`/`notes` (PII de proveedor), `ocupadas`/`contratos_activos` a secas (crudos del reporte que **no** están en `PuntoTendencia`). Ninguna prop `tarifa…` viaja entre componentes. | 0 accesos fuera del contrato · 0 prohibidos |
| 2 | **El informe no sabe de la cartera.** `InformeCliente.tsx` no importa ninguno de los 11 nombres de cartera (`getMetricasPlataforma`, `getAdopcion`, `getClientesPlataforma` y sus tipos), no lee ninguno de los 8 campos que son sólo del operador (`spread_pct`, `tarifa_configurada`, `clasificacion`, `estado_cuenta`…), y ninguna de sus cadenas de prosa usa jerga. | limpio |
| 3 | **Un amarillo por pantalla.** Exactamente 3 `.btn-principal` en el área, uno por pantalla; **cero** `var(--signal)` fuera de esa clase, en TSX y en la hoja. | 3 · 0 |
| 4 | **La letra sale de la escala.** Cero `font-size` literales en px en los 11 archivos nuevos; los 5 cuerpos de los SVG (tabla `VOZ` + literales) entre 10 y 30 px; ningún `<text>` en `--ink-4`. | limpio tras 1 arreglo (§3.1) |
| 5 | **Los tres estados sólo codifican estado de espacio.** Los 13 consumos de `--libre/--entra/--ocupado` van con la palabra del estado al lado; ninguno cerca de prioridad, señal, clasificación ni estado de cuenta; ningún selector de chip los pinta. | 13 legítimos · 1 excepción declarada |
| 6 | **El backend no cambió** (`git diff origin/main -- backend` vacío). | vacío |
| 7 | **`ReportePlataforma.tsx` no cambió**, y sigue enlazado desde la cartera y la sesión. | sin cambios · enlazado |

### Mitad de navegador (opt-in por variables, como `probar:vender`)

Backend propio en 8043 sobre `frontera.db`, servidor de dev en 5213 apuntado a él, Chromium de
`/opt/pw-browsers/chromium-1194`. **La tarifa de referencia sembrada es `987654`**: un valor de seis
cifras que no puede salir de ninguna otra cuenta del sistema, así que si aparece se ve a simple vista.

| # | Qué afirma | Resultado |
|---|---|---|
| 8 | **La tarifa no aparece.** Cinco caras del número (crudo, con puntos, con comas, con espacio fino) buscadas en el `innerText`, en los `<text>`/`<title>` de los SVG, en los `aria-label`, en los `title` **y en el cuerpo de toda respuesta de la API**, en las tres pantallas, con todos los `<details>` abiertos. Y el otro lado: la **relación** (quién cobra por debajo) sí se publica —— un test que sólo prohíbe deja pasar la pantalla que borró el dato. | 0 apariciones |
| 9 | **El proveedor va saneado.** Correo, teléfono, contacto y nota interna sembrados en la base del cliente no llegan a ninguna pantalla. El caso duro está sembrado a propósito: un proveedor con el correo y el teléfono **metidos en el nombre**, que llega como `Nutresa [correo oculto] [teléfono oculto]` y el frontend pinta tal cual. | 0 fugas |
| 10 | **El informe está limpio.** Ninguna de 12 palabras internas (cartera, señal, fantasma, adopción, spread, benchmark, dormida, solo lectura, suspendido, gracia…), ninguna mención de prioridad, ni un `input`/`select`/`textarea`, y **ningún nombre ni slug de otro cliente** —— la lista de «otros» se le pide al registro en vivo, no a una variable de entorno que se queda vieja. | limpio |
| 11 | **El detalle deja rastro.** Después de abrirlo, `bitacora_plataforma` tiene su línea `accion="detalle"`, leída por el mismo endpoint que ve el cliente. Y el reporte de transparencia tampoco trae la tarifa. | 50 líneas · sin fuga |
| 12 | **El informe no abre una consulta nueva.** Endpoints normalizados: la sesión toca `/detalle` · `/metricas` · `/tendencia`; el informe, `/detalle` · `/tendencia`. Subconjunto estricto, y cero `/metricas`, `/adopcion` o `/clientes`. | 2 de 3 |
| 13 | **Un `.btn-principal` visible por pantalla**, claro y oscuro —— y se verifica que la temperatura pedida **se aplicó** (fondo `#EFF1ED` / `#04070A`): medir el oscuro sobre una pantalla clara daría verde y sería falso. | 6/6 |
| 14 | **Contraste WCAG** de todo texto con color y fondo opacos, con el piso por cuerpo y peso (4,5:1, o 3:1 con ≥ 24 px / ≥ 18,66 px en negrita). | 0 por debajo, en 6 pasadas |
| 15 | **Ningún rótulo de señal / estado de cuenta / prioridad pintado con color de estado**, medido sobre el color **computado** —— que es por donde se cuela un `style=` en línea que el grep no ve. | 0 en las 3 |
| 16 | **El informe se imprime**: 3 páginas A4 (la referencia de A) y **cero** controles a la vista en `media:print`. | 3 páginas · 0 controles |
| 17 | **Escritorio primero**: cero scroll horizontal en 1440×900 y en 1366×768. | 0 |

### Lo que el test hace para no mentir

- **Quita los comentarios antes de buscar.** Este repo documenta a propósito lo que el código *no*
  hace («la tarifa de referencia NUNCA viaja acá»). Fallar por la documentación que el propio PR
  pide escribir sería el peor test posible.
- **Falla si no encuentra sus anclajes.** Si `api/plataforma.ts` no da al menos 80 campos, si la
  escala `--t-*` no da 6 pasos, si la hoja no da 40 bloques, si la tabla `VOZ` no existe, si el
  recorrido de `src/` lee menos de 20 archivos, si una pantalla renderiza menos de 400 caracteres:
  **asserta y muere**. Un test que no puede afirmar nada no pasa.
- **Se probó que puede fallar.** Se inyectaron siete violaciones (un chip de prioridad en rojo, un
  `d.tarifa`, un `fontSize: 12.5`, un `background: var(--signal)`, un `import { getAdopcion }` en el
  informe, una cadena con jerga, un selector `.plat-chip--prioridad-alta` con `--ocupado-suave`) y
  **las siete dispararon**. Los archivos se restauraron; el árbol quedó idéntico.
- **Declara su límite.** La parte estática lee texto, no un AST: no sabe de qué *tipo* es el objeto
  del que se lee un campo —— eso lo prueba `npx tsc --noEmit`, que corre en la misma cadena. Lo que
  agrega es lo que tsc no ve: un campo declarado en el área y leído en el área compila perfecto y
  puede ser igual una invención. Por eso **imprime** la lista de los que no vienen del contrato
  (hoy: `atendido_en`, `atendido_por`, `cliente_slug`, `cobra_debajo`, `creado_en`), que son pocos y
  se leen de un vistazo. Un nombre nuevo ahí es una revisión.
- **Separa tres cosas que se suelen meter en la misma bolsa**: una excepción de la app (falla), una
  respuesta de la API en error (falla, con su código), y el ruido del navegador (`/favicon.ico` 404
  en el servidor de dev, que no es de nadie: se reporta y no falla).

---

## 2. Las dos excepciones declaradas, para que el dueño las vea

El test no las esconde: las imprime en cada corrida, en un renglón cada una, para que se puedan
discutir y para que borrarlas sea tocar un solo lugar.

### 2.1 · `email`, en dos lugares y sólo en dos

`email` **no** es un prohibido a secas, porque hay dos sitios donde es el dato y no una fuga:

- `Plataforma.tsx` escribe el correo del **propio operador** en la barra —— su propia sesión, la
  misma que ya está en el JWT;
- `cartera-operativo.tsx` lista el correo del **titular que pidió la supresión**: el pedido *es* el
  correo, y sin él no se puede atender. Viene de `api/derechos.ts`, no de `/plataforma/*`.

Cualquier tercer uso falla. Un correo en esta área que no sea uno de esos dos sólo puede venir de la
base de un cliente.

### 2.2 · `.plat-chip--parcial`, el único ámbar que sobrevivió — **decisión del dueño**

El ajuste (a) está aplicado: los chips de señal, estado de cuenta y prioridad van en tinta gris con
su palabra, y lo verifiqué de las dos formas (selectores de la hoja + color computado en pantalla).
**Queda un solo chip con color de estado en toda el área**: «mes en curso · parcial», en el ámbar de
`--entra` (`#F9F1E2` de fondo, `#8A5A06` de letra).

El argumento a favor, que es el que dejó escrito el agente de gráficos: no es señal, ni estado de
cuenta, ni prioridad —— las tres familias que el dueño nombró —— sino honestidad del dato, y no
comparte figura con ningún estado de espacio (la rejilla de doce meses no dibuja libre/ocupado).

El argumento en contra: es ámbar codificando algo que no es «se libera», y `anti-patterns.md` corta
ahí sin preguntar de qué familia es.

**No lo cambié** —— es una decisión de forma, no una regla rota, y el dueño eligió A tal cual. Lo dejo
señalado, con la corrida imprimiéndolo cada vez. Si se decide que también va en gris, es un renglón
de `plataforma.css` (`.plat-chip--parcial`) y un renglón del test.

---

## 3. Lo que encontré, y qué hice con cada cosa

### 3.1 · ARREGLADO · `font-size: 9px` en la hoja del área (archivo del agente de gráficos)

`plataforma.css:327` y `:487` —— el triángulo `▸` de los dos `<summary>` (`.plat-tabla-eq` y
`.plat-cajon`) —— declaraban `font-size: 9px`: fuera de la escala `--t-*` y por debajo del piso de
10 px que el propio `probar:graficos` le exige a los dibujos. Cambiados a `var(--t-3xs)` (10 px),
que es el paso que les corresponde. Es un cambio de dos caracteres por línea y no mueve la
composición.

**Es un archivo del agente de gráficos y lo anoto acá como me pidieron.** Su `probar:graficos` no lo
veía porque sólo mira `fontSize` en TSX, no `font-size` en la hoja.

### 3.2 · ARREGLADO · `probar:graficos` no estaba en la cadena `probar`

El script existía, pasaba, y `npm run probar` no lo corría. Lo agregué a la cadena junto con
`probar:plataforma`. Verificado: pasa en ~40 s (levanta su propio Vite en 5211 y lo mata).
`probar:plataforma` no levanta nada: su mitad de navegador es opt-in por variables, igual que
`probar:vender`, así que la cadena sigue sin necesitar servidor ni base sembrada.

### 3.3 · REPORTADO, no tocado · `consola.tsx` es el legado que arrastra la tipografía vieja

`src/components/plataforma/consola.tsx` conserva **12 `fontSize` literales** (13, 12, 11, 27, 11.5,
10.5, 9.5 px) que no salen de la escala, y **11 de sus 20 exports no los importa nadie**:

> `KpiTile` · `TonoBarra` · `EstadoBarra` · `Barras` · `BarraFila` · `etiquetaEstado` · `EstadoPill`
> · `SinDato` · `TablaScroll` · `TablaHeadCelda` · `TablaHead`

(y `Panel` y `Fila` sólo «viven» porque su nombre aparece en otros archivos como identificador
local; el test es conservador y no los cuenta como muertos.)

Lo único vivo son `temaInicial` / `guardarTema` / `TemaToggle` / `ConsolaTema` —— que usan las dos
pantallas nuevas —— y `EstadoVacio` / `EstadoError` / `IMPRESION_CLARA_VARS`, que usa
`ReportePlataforma.tsx`, **que esta fase no puede tocar**. Por eso no lo limpié: borrar los once
exports muertos es un PR de una línea de riesgo y cero de diseño, pero es de otro PR.

El test lo imprime como aviso, con la lista completa, en cada corrida. No falla por eso: la regla de
la escala se le exige a los 11 archivos **nuevos** del área, que están limpios.

### 3.4 · REPORTADO · tres roces de copia en la sesión (lane del constructor de sesión/informe)

Ninguno es frontera; los anoto porque un asesor los lee en voz alta delante de un cliente.

1. **`otros 1 proveedores`** (énfasis de proveedores, H2). Con `n = 1` la concordancia se rompe:
   debería decir «otro proveedor» o «1 proveedor más».
2. **`Ver las 1 de prioridad baja`** (capítulo 3). Mismo problema: «la de prioridad baja».
3. **La cabecera de los candidatos se contradice con sus propias fichas.** Dice *«Proveedores que ya
   tienen este tipo de espacio acá:»* y abajo lista fichas marcadas *«aún sin este tipo»*. El shape
   distingue las dos cosas (`OportunidadCandidato.mismo_tipo`) y la ficha ya lo dibuja bien; lo que
   está mal es la cabecera, que afirma de todos lo que vale para algunos. La frase correcta es
   «Proveedores de este cliente», y el badge sigue diciendo cuál ya tiene el tipo.

---

## 4. Lo que verifiqué de la referencia A, más allá del test

Con la sesión y el informe abiertos sobre datos reales, confirmé que las piezas que el dueño nombró
están y hacen lo que decían:

- **la escalera de las góndolas en cuatro escalones** —— frase con sus lugares y su precio → `precio`
  (con el promedio de la plataforma y cuánto valdrían al benchmark) → `a quién` (fichas de candidato,
  **con el proveedor concentrado último y con «ojo: ya tiene el 44,4 % de los contratos» pegado al
  nombre**) → `dónde` (códigos plegados por sede, que no se abren solos);
- **la marca de referencia por barra** en las sedes («la marca: la sede al 27,3 % del cliente»), con
  el largo en espacios y no en porcentaje;
- **el riel de 60 días** con hoy, el fin del periodo y sus dos tramos rotulados con conteo y plata;
- **el dumbbell** contra el benchmark, ordenado por brecha, con las dos cifras al lado;
- **el spread en un eje con el cero dibujado** en la cartera, y los sin tarifa contados aparte;
- **las tres cifras del valor en juego**, con el aviso de «el total que no existe» explicando por qué
  no se suman;
- **el rótulo de la rejilla de doce meses lleva su cifra** —— ajuste (b) aplicado: «De ago a sep la
  ocupación subió 10,8 pts, de 21,6 % a 32,4 %»;
- **la ruta del JSON en monoespaciada** bajo cada bloque (`detalle.resumen_por_tipo[] ·
  detalle.espacios[].estado · detalle.oportunidades[]`), que es lo que contesta sola la pregunta 2
  del dueño;
- **la sesión parcial para el cliente sin detalle**: `galerias` (sin plano ni contratos) no dibuja
  capítulos vacíos —— dice «Este cliente todavía no tiene un plano cargado: cero espacios
  comercializables en cero sedes. Sin plano no hay ocupación, ni oportunidades, ni precio sugerido»
  y lo que corresponde («no es un análisis, es una operación»). Sin errores de consola;
- **el informe del cliente en 3 páginas A4**, sin un control en papel, sin una palabra interna y sin
  el nombre de nadie más;
- **`--ink-4` sólo como trazo**: sus dos apariciones en el área son `stroke` de un `<line>`.

---

## 5. Cómo se corre la mitad de navegador

```bash
# 1 · sembrar (la receta y el porqué de cada dato, en el propio archivo)
cd backend && SP=/tmp/sp PYTHONPATH=$PWD python3 ../frontend/scripts/sembrar-plataforma.py

# 2 · backend propio, en su puerto y sobre esa base
cd backend && DATABASE_URL="sqlite:///./frontera.db" JWT_SECRET=dev-frontera \
  ADMIN_PASSWORD=admin123 WORKER_PASSWORD=galerias \
  OPERADOR_EMAILS=brayanmoreno098@gmail.com PYTHONPATH=$PWD \
  python3 -m uvicorn app.main:app --port 8043

# 3 · servidor de dev apuntado a ese backend
cd frontend && VITE_API_TARGET=http://127.0.0.1:8043 npx vite --port 5213

# 4 · el test
PROBAR_PLATAFORMA_URL=http://127.0.0.1:5213 \
PROBAR_PLATAFORMA_API=http://127.0.0.1:8043 \
PROBAR_PLATAFORMA_TOKEN=$(cat /tmp/sp/token-frontera.txt) \
PROBAR_PLATAFORMA_TARIFA=987654 npm run probar:plataforma
```

`sembrar-plataforma.py` **no toca el backend**: lo importa, y escribe sólo en su propia
`frontera.db` (que está en `.gitignore`). Planta la tarifa reconocible, un segundo cliente de nombre
inconfundible, proveedores con correo/teléfono/contacto/nota interna (uno con el correo y el
teléfono **metidos en el nombre**, el caso duro del saneador), un contrato que vence dentro del
periodo, uno que arranca, una salida del mes pasado y espacios libres de sobra: sin eso, media
pantalla no se dibuja y el grep no puede afirmar nada sobre lo que no se pintó.

Sin las variables, la mitad de navegador **se salta y lo dice**. Los puertos usados fueron 8043 y
5213; los procesos y las bases de prueba quedaron eliminados.

---

## 6. Archivos que toqué

| Archivo | Qué |
|---|---|
| `frontend/scripts/probar-plataforma.mjs` | **nuevo** —— el test, 1.117 líneas |
| `frontend/scripts/sembrar-plataforma.py` | **nuevo** —— la siembra de la mitad de navegador, 188 líneas |
| `frontend/package.json` | `probar:plataforma` + agregados `probar:graficos` y `probar:plataforma` a la cadena `probar` |
| `frontend/src/plataforma.css` | dos caracteres: `font-size: 9px` → `var(--t-3xs)` en los dos `summary::before` (§3.1, archivo del agente de gráficos) |

Nada más. No toqué `Plataforma.tsx`, `DetalleCliente.tsx`, `InformeCliente.tsx`, `graficos.tsx`,
`formato.ts`, `consola.tsx`, `ReportePlataforma.tsx` ni el backend. Sin commit ni push.

---

## 7. Lo que este test **no** cubre, dicho por si acaso

- **Un cliente con la base rota** (`error != null`, `metricas: null`). La cartera lo maneja —— tiene
  su fila «Revisar la conexión» —— pero sembrar una base ilegible sin tocar el backend no salió
  limpio, así que ese camino quedó sin medición automática. Es el hueco consciente de esta
  auditoría.
- **El selector de periodo contra un mes sin snapshot.** Se probó el mes en curso; el mes vacío
  (`sin_dato: true`) lo cubre `probar:graficos` a nivel de dibujo, no a nivel de pantalla.
- **El celular.** El brief lo pide «razonable, no perfecto» y no lo medí: 1440 y 1366 sí.
- **Si el dato es el correcto.** Este test afirma que un número no se filtra, no que esté bien
  calculado. Lo segundo lo sostienen los tests del backend y `tsc`.
