# Verificación del port de la Plataforma (Fase 11, opción A) — 2ª pasada

Rama `claude/fase-11-plataforma` en `/tmp/retail-espacios-test`, contra `origin/main`
(`c172ae7`). Esta corrida re-mide las **siete fallas** que la 1ª pasada dejó anotadas,
después de que los equipos de pantallas y de scripts dijeran haberlas arreglado.
Nada se arregló acá: esto es lo que se midió.

**Veredicto: seis de las siete fallas están cerradas y medidas. Una sigue viva
(`BarrasDivergentes` etiqueta el mes en curso con «+$ 0,6 M» al lado de «el peor saldo:
−$ 1,4 M»).** Todo lo que ya pasaba en la 1ª pasada sigue pasando.

---

## 0 · Puertas duras

| Puerta | Resultado |
| --- | --- |
| `npx tsc --noEmit` | **limpio**, salida vacía, exit 0 |
| `npm run build` | **exit 0**, `✓ built in 9.93s` (los mismos avisos de tamaño de chunk preexistentes: `Dashboard` 1.059 kB, `three.module` 732 kB) |
| `npm run probar` (los 11) | **exit 0**; `probar:plataforma` cierra con «frontera: sin fallas» |
| `pytest -q -p no:warnings` (UNA corrida, `TMPDIR=/tmp/pt-verif-p2`, `rm -f *.db` antes) | **exit 0** · 990 puntos, 7 `x`, 3 `s`, **0 `F`, 0 `E`** |
| `git diff --stat origin/main -- backend` | **vacío** · `git status --porcelain backend` también vacío |
| `git diff --stat origin/main -- frontend/src/pages/ReportePlataforma.tsx` | **vacío** — el reporte de transparencia no se tocó |

Procesos al arrancar: ninguno (`ps` sólo devolvió el shell del entorno; ningún puerto en
escucha). **Después de `npm run probar`: ningún proceso vivo** — sólo cuatro zombis
`[chrome] <defunct>` reparentados a init, que se van solos. Ningún `vite`, ningún
`uvicorn`, ningún `node` colgado. Ningún `*.db` quedó en el árbol del repositorio.

Contradicción del encargo, dicha para que quede escrita: la cabecera dice «sos el ÚNICO
que corre suite y build» y numera `npm run build` y `pytest` como pasos 1 y 2; el pie
(REGLA DE VERIFICACIÓN, el bloque compartido con los agentes que arreglan) dice «NUNCA la
suite completa del backend ni `npm run build`». Se siguió la cabecera, que es la
instrucción específica de esta ronda y la que este informe necesita para poder afirmar
`build_ok` y `suite_ok`. La suite del backend se corrió **una sola vez**.

---

## 1 · Cómo se midió

* **Backend propio sembrado** en `127.0.0.1:8056`, corriendo desde `/tmp/verif-p2/base`
  con `DATABASE_URL=sqlite:///./verif.db` — la base **fuera del repositorio**. Sirve el
  `dist` recién construido desde `backend/app/main.py:389`, así que la página y `/api`
  comparten origen y no hizo falta ni vite ni proxy. Ningún puerto del otro equipo
  (`/tmp/re-nom`) se tocó.
* **La MISMA siembra de la 1ª pasada**, byte a byte: `/tmp/verif-p/seed_verif.py`.
  * operador `operador@ejemplo.com` (token JWT en `localStorage`);
  * **5 clientes**: `mercafresco` (2 sedes NAVE/SUR, 8 proveedores, 33 espacios
    comercializables en los tres estados, 11 contratos —10 sobre el plano + 1 fuera—,
    2 por vencer dentro de 60 días); `donpepe` (nuevo); `zafironoct` (**ilegible**: su
    `recabra_zafironoct.db` se corrompe con el servidor ya arriba); `laesquina` (sin
    tarifa, suspendido); `galerias` (sin plano);
  * **tarifa de referencia de `mercafresco` = 987654**;
  * **12 meses de tendencia** (2025-10 → 2026-09) con **11 snapshots**: `2025-10` queda
    **sin snapshot** (el hueco «sin dato») y `2026-09` es el **mes en curso parcial**;
  * una **solicitud de supresión pendiente** (`mercafresco`), agregada al registro para
    poder atenderla.
* Playwright con `executablePath /opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
  18 pasadas de medición (3 pantallas × 2 temas × 3 anchos) + las corridas de flujo,
  interactivas, de impresión y de captura. El oscuro se puso con el **toggle real** y se
  verificó `document.documentElement.dataset.tema === "oscuro"` antes de medir.

**El «antes» de esta pasada son los números de la 1ª**, no un worktree: los arreglos
llegaron sin commit (el árbol tiene los cambios sin versionar), así que no hay ningún
estado «antes» recuperable sin destruir el trabajo. Cada medición de abajo cita el número
viejo al lado del nuevo.

**Capturas nuevas** en `features/plataforma-asesoria/outputs/capturas/`:
`port2-{cartera,sesion,informe}-{claro,oscuro}-{1440,1366,390}-{viewport,completa}.png`
(36) + `port2-informe-sep-A4.pdf` + `port2-informe-julio-A4.pdf` +
`port2-sesion-divergentes-claro-1440.png` (el recorte de la falla que sigue viva).
Mediciones crudas en `/tmp/verif-p2/{medidas2,flujo,desvios,interactivo,bitacora,imprimir,residuo3}.json`.

---

## 2 · Las siete fallas, una por una

### 2.1 · Falla 1 — el informe no tomaba el periodo → **ARREGLADA**

Cadena completa, medida en una sola corrida (`/tmp/verif-p2/flujo.json`):

| Paso | Antes (1ª pasada) | Ahora |
| --- | --- | --- |
| cartera puesta en **julio de 2026** | recalculaba | recalcula: `GET /api/plataforma/metricas?periodo=2026-07` |
| enlace del cliente en la cola | `/plataforma/clientes/mercafresco` | **`/plataforma/clientes/mercafresco?periodo=2026-07`** |
| sesión abierta desde la cola | mes en curso | `#plat-periodo` = `2026-07`, titular «MercaFresco — **julio de 2026**», `GET …/detalle?periodo=2026-07` |
| «Armar el informe para el cliente» | `GET …/detalle?**periodo=2026-09**`, titulaba septiembre | URL `…/informe?periodo=2026-07`, `GET …/detalle?**periodo=2026-07**`, «Periodo **julio de 2026** · 2026-07-01 a 2026-07-31» |

Y los bordes:

* `…/informe` **sin** `?periodo=` → `detalle?periodo=2026-09`, «Periodo septiembre de 2026»
  y el pie dice «**el mes en curso todavía no terminó**».
* `?periodo=no-es-un-mes`, `?periodo=hola`, `?periodo=2026-13` → caen en el mes en curso.
  Respuestas HTTP **200**, ningún 422, ningún error en consola.
* `?periodo=2025-10` (el mes **sin snapshot**) → se acepta y se ofrece **habilitado** en el
  selector: «el periodo puesto nunca se deshabilita» se cumple.

**1-bis (el ajuste que el arreglo exigía), verificado**: las cuatro líneas de cierre ya
salen del periodo devuelto por el backend, no del reloj.

| Pantalla · periodo | Línea |
| --- | --- |
| informe · 2026-07 | «Generado el 2026-09-08 — **el periodo ya cerró**» |
| informe · 2026-09 | «Generado el 2026-09-08 — **el mes en curso todavía no terminó**» |
| sesión · 2026-07 | «2026-07 (2026-07-01 a 2026-07-31) — **el periodo ya cerró**» |
| sesión · 2026-09 | sin la línea de cierre (mes en curso; el chip «MES EN CURSO · PARCIAL» lo dice) |

### 2.2 · Falla 2 — residuo de frases-conclusión = 7 → **ARREGLADA (con una anotación)**

Medido en las tres pantallas, en el estado de arranque y con **todos** los `<details>`
abiertos (`/tmp/verif-p2/residuo3.json`).

| Pantalla | dianas | tablas equivalentes exentas | **residuo (regla del guion)** | residuo (lectura estricta `.plat-frase`) |
| --- | --- | --- | --- | --- |
| cartera | 8 | 4 | **0** | 1 |
| sesión | 8 (13 con todo abierto) | 8 | **0** | 0 (4 con todo abierto) |
| informe | 2 | 2 | **0** | 0 |

* Con la regla que el guion `probar:plataforma [18]` fija —el último texto con cifra antes
  de la diana, fuera de toda diana— el residuo es **0 en las tres pantallas y en los dos
  estados**. Los siete de la 1ª pasada están cerrados: las cinco figuras que no tenían
  frase propia (`TablaComposicion`, las dos `LineaIngreso`, `TablaCohortes`,
  `BarrasDivergentes`) la tienen, y las dos tablas equivalentes que colgaban fuera de su
  `<figure>` (el riel de vencimientos y el dumbbell del informe) están adentro, en
  `<details class="plat-tabla-eq">`.
* **La anotación**: con la lectura estricta de la 1ª pasada —que exigía un `.plat-frase`
  con cifra, no cualquier texto— queda **1** en la cartera, y es consecuencia del arreglo
  D3. La tabla de «Estados de cuenta» ahora arranca **abierta**, así que pasó a ser una
  diana pintada; su cifra («**5 clientes**») vive en el `<summary>` del cajón, no en un
  `.plat-frase`. Es una tabla operativa, no una figura de análisis, y lleva su conteo a la
  vista: se anota, no se cuenta como falla.
* El propio guion imprime el aviso que confirma la misma lectura: «sesión: 4
  `details.plat-tabla-eq` fuera de una `<figure>` — NO están exentos, se les exigió su
  cifra como diana», y la pasan.

### 2.3 · Falla 3 — el chip «mes en curso · parcial» con color de estado en oscuro → **ARREGLADA**

Barrido de `color`, `backgroundColor`, los bordes y `fill` de **todos** los `.plat-chip`
contra los valores resueltos de `--libre` / `--entra` / `--ocupado`:

| | 1440 claro | 1440 oscuro | 1366 claro | 1366 oscuro | 390 claro | 390 oscuro |
| --- | --- | --- | --- | --- | --- | --- |
| cartera (6 chips) | 0 | **0** | 0 | **0** | 0 | **0** |
| sesión (4 chips) | 0 | 0 | 0 | 0 | 0 | 0 |
| informe (0 chips) | 0 | 0 | 0 | 0 | 0 | 0 |

El chip que fallaba: en oscuro va ahora `color: rgb(157,174,182)` sobre `rgb(16,24,32)`
con borde `rgb(62,67,71)` — tinta neutra; en claro, `rgb(74,91,101)` sobre
`rgb(247,248,245)`. La palabra sigue escrita entera («MES EN CURSO · PARCIAL»).
Antes: **1 coincidencia en oscuro**, `color === var(--entra)`.

### 2.4 · Falla 4 — el selector de periodo en inglés y cortado a 390 → **ARREGLADA**

* **`<input type="month">` = 0** en las tres pantallas, en los seis contextos medidos.
* El control es un `<select id="plat-periodo">` con **12 opciones**, el más nuevo arriba y
  rótulo en español: `septiembre de 2026`, `agosto de 2026`, … , `octubre de 2025 · sin
  dato` (**deshabilitada**, es el mes sin snapshot). El periodo puesto nunca se
  deshabilita (§2.1).
* **A 390 px no se corta**: ancho medido 236 px con `scrollWidth` 234 — el rótulo entra
  entero. Verificado también a ojo en `port2-cartera-claro-390-viewport.png`.
* Scroll horizontal a 390 sigue en 0 en las tres pantallas y en los dos temas.

### 2.5 · Falla 5 — los desvíos contra la opción A → **ARREGLADOS los cinco del encargo**

| Desvío | Antes | Ahora |
| --- | --- | --- |
| **D1** índice del informe | no existía | `EN ESTA PIEZA / El titular / 1 · Dónde está su negocio / 2 · Qué encontramos / 3 · Qué le proponemos`, y en `media:print` **no se ve** |
| **D3** «Estados de cuenta» | `<details>` cerrado | **`open=true`**, y es el **único** `<details>` abierto de la cartera (los otros cinco arrancan cerrados) |
| **D5** marca de hallazgos | informe `1…3`, sesión `H1…` | **informe `H1 H2 H3`, sesión `H1…H5`**, los dos con `class="h-id"`; las recomendaciones van `1 2 3` con `class="r-n"` en las dos pantallas |
| **D9** sub-entradas del índice de la cartera | no existían | 5 sub-entradas `a.sub` en el orden de la cola: `Zafiro Nocturno → #c-operativo` (el ilegible) y `La Esquina / MercaFresco / Galerías / Don Pepe → /plataforma/clientes/<slug>?periodo=2026-07`, **con el periodo puesto**. A 390 px están escondidas |
| **D4** tabla de oportunidades | abierta dentro de «Qué proponemos», y el cap. 4 con 4 tablas | el capítulo 4 «Los datos detrás» tiene sus **cinco cajones plegados**: Espacios (33 de 33) · Contratos (11 · 10 sobre el plano + 1 fuera) · Proveedores (8 de 8) · **Oportunidades** (24 espacios en 4 grupos) · Movimientos (16 de 16 en 12 meses). «Qué proponemos» conserva la escalera y los grupos y ya no repite la tabla |

**D2** («Tres páginas A4 verticales» en vez de «Una hoja A4 vertical» de A) se dejó a
propósito. Queda una consecuencia nueva del arreglo 1, medida: el informe del **mes en
curso** imprime en **3 páginas** (`port2-informe-sep-A4.pdf`) y el de **julio** imprime en
**2** (`port2-informe-julio-A4.pdf`) — la bajada afirma «tres» en los dos casos. Es
anotación, no falla: la bajada ya era un desvío declarado y aceptado.

**D8** (rótulos acortados respecto de A: «la marca: la sede al 30,3 % de su promedio»,
«ago comparable», columnas `OCUPADO / SE LIBERA / LIBRE`) **sigue igual** — no estaba en
la lista de esta ronda, se deja anotado.

**D7** (dos interruptores de tema) entra por §2.6.

### 2.6 · Un solo interruptor de tema → **ARREGLADO**

`button[aria-label*="Cambiar a"]` = **1 en cada una de las tres pantallas**, en los seis
contextos, y con el mismo texto: `Cambiar a modo oscuro` / `Cambiar a modo claro`. Antes
la cartera usaba el de `src/tema.tsx` («modo») y la sesión y el informe el de
`components/plataforma/consola.tsx` («tema»).
El segundo botón ya no está en el árbol: `TemaToggle`, `ConsolaTema`, `temaInicial` y
`guardarTema` sólo existen hoy en `frontend/src/tema.tsx`; `consola.tsx` pasó de 438 a
**163 líneas** y sus 4 `fontSize` restantes salen todos de la escala (`var(--t-xs)`,
`var(--t-2xs)`), con lo que también se cayó el aviso de los 12 literales.

### 2.7 · Falla 6 — el rótulo del último punto de `BarrasDivergentes` → **SIGUE VIVA**

`frontend/src/components/plataforma/graficos.tsx:2006` conserva, sin un solo cambio:

```tsx
{"+" + platM(ent(ultimo))}
```

es decir, **sólo las entradas** del mes en curso, con un `+` forzado. Con la base sembrada
(septiembre: 1 entrada de $ 600.000 contra 1 salida de $ 2.000.000, saldo neto
**−$ 1.400.000**) la figura de la sesión sigue mostrando las dos cifras del mismo mes a
diez píxeles una de otra, medidas sobre el texto SVG:

* la anotación: «sep · el peor saldo de la ventana: **−$ 1,4 M** (1 salida contra 1 entrada)»;
* la etiqueta en negrita sobre el último punto: «**+$ 0,6 M**».

Recorte de la figura como prueba:
`features/plataforma-asesoria/outputs/capturas/port2-sesion-divergentes-claro-1440.png`.
Era el punto 6 de los siete de la 1ª pasada; los equipos que arreglaron trabajaron sobre
otra numeración de siete puntos (la suya termina en los `fontSize` y los exports de
`consola.tsx`) y **éste quedó afuera**. No lo tapa ninguna puerta: `probar:plataforma` no
tiene una prueba para él.

### 2.8 · Falla 7 — `probar:graficos` dejaba su Vite vivo → **ARREGLADA**

Dos corridas seguidas de `npm run probar:graficos` en la misma máquina:

| Corrida | exit | afirmaciones `✓` | procesos `vite` vivos después |
| --- | --- | --- | --- |
| 1ª | **0** | 28 | **0** |
| 2ª | **0** | 28 | **0** |

La segunda corrida levanta su propio Vite y mide de verdad (28 afirmaciones, las mismas
4 pasadas sobre el banco de pruebas), no al huérfano de la primera. En la corrida completa
de `npm run probar` tampoco quedó nada: el puerto 5211 quedó libre.

---

## 3 · Lo que ya pasaba y sigue pasando

Las 18 pasadas (3 pantallas × 2 temas × 1440/1366/390) dan lo mismo o mejor que la 1ª:

| Medición | Resultado |
| --- | --- |
| Scroll horizontal (`scrollWidth === clientWidth`) | **0 desbordes** en 1440, 1366 y **390**, claro y oscuro, en las tres pantallas |
| `.btn-principal` por pantalla | **1 · 1 · 1** («Revisar la conexión» · «Armar el informe para el cliente» · «Imprimir o guardar en PDF») |
| `var(--signal)` fuera de `.btn-principal` | **0** en las 18 pasadas (barrido de `color`, `backgroundColor`, los 4 bordes, `fill`, `stroke`, `outlineColor` de todo elemento visible) |
| Textos SVG | cartera 78 (10,0–13,5 px) · sesión 123 (10,0–12,5) · informe 24 (10,5–12,5); **0 por debajo de 10 px, 0 por encima de 30, 0 pares pisados** |
| Contraste WCAG | cartera 440 textos (peor 5,39 claro / 4,99 oscuro) · sesión 1.337 (4,95 / 4,99) · informe 146 (5,39 / 5,30) — **0 por debajo del umbral** |
| Frontera · tarifa | **987654** (y `987.654`, `987 654`) = **0 ocurrencias** en las tres pantallas, en los dos temas, sobre `innerText` + textos SVG + `title/aria-label/alt` + **el `outerHTML` entero**, con todos los `<details>` abiertos |
| Frontera · informe | 0 ocurrencias de «cartera», «señal», «fantasma», «adopción», «benchmark», «spread», «estado de cuenta», «prioridad»; 0 nombres de otros clientes (`Zafiro`, `zafironoct`, `Don Pepe`, `donpepe`, `La Esquina`, `laesquina`, `galerias`, `Galerías`). Verificado también en el informe de **julio** |
| Frontera · PII de proveedor | 0 ocurrencias de la nota interna, el contacto, el teléfono y el correo sembrados; el nombre sale saneado: «Nutresa [correo oculto] [teléfono oculto]» |
| Estado de cuenta | «Cambiar» → sin motivo el formulario responde «**El motivo es obligatorio.**»; con `gracia` + motivo aparece el `confirm()` del navegador y la fila queda «Don Pepe · donpepe · **en gracia** · VERIFICACION-PORT2-11 factura 0002 · 2026-09-08 · operador@ejemplo.com». **Idéntica tras recargar desde cero** |
| Supresiones | la pendiente se atendió (nota obligatoria + `confirm()`); la fila pasó a «**atendida** · operador@ejemplo.com · 2026-09-08» y el cajón a «0 pendientes de 1». **Sobrevive a la recarga** |
| Bitácora | abrir la sesión: `detalle +1`, `metricas +1`, `tendencia +1`. Abrir el informe: `detalle +1`, `tendencia +1`, `metricas +0`. Abrir la cartera: `detalle +0`. **Una línea `accion=detalle` por consulta, ni una de más** |
| Informe imprimible | mes en curso: **3 páginas A4**; en pantalla 3 controles («Volver a la sesión», «Imprimir o guardar en PDF», el toggle); con `emulateMedia({media:'print'})` **0 controles visibles** y el índice oculto |
| Consola | **0 `pageerror` y 0 `console.error`** en las 18 pasadas de medición, en las 18 de captura, en la corrida de flujo, en la interactiva y en la de impresión |

Y la corrida del guion con navegador contra este mismo backend
(`PROBAR_PLATAFORMA_URL/API=:8056`): **exit 0, 79 afirmaciones en verde, «frontera: sin
fallas»**.

---

## 4 · Resumen

**Cerradas y medidas (6 de 7):**

1. el informe toma el periodo, y lo toma de la URL en toda la cadena cartera → sesión →
   informe, con los bordes (sin periodo, periodo inválido, mes sin snapshot) resueltos sin
   422; y las cuatro líneas de cierre ya dependen del periodo;
2. residuo de frases-conclusión **0** en las tres pantallas (queda anotada la tabla
   operativa de «Estados de cuenta», que el arreglo D3 dejó a la vista y que lleva su
   cifra en el `<summary>`);
3. **0** chips con color de estado, en claro y en oscuro;
4. el selector volvió al `<select>`, en español, con el mes sin dato rotulado y
   deshabilitado, y no se corta a 390;
5. los cinco desvíos contra A que pedía el encargo (índice del informe, estados de cuenta
   abierto, `H1/H2/H3` iguales en las dos pantallas, sub-entradas del índice con el
   periodo, oportunidades plegada en el capítulo 4 con sus cinco tablas) más el
   interruptor de tema único;
7. `probar:graficos` no deja procesos: dos corridas seguidas, exit 0 las dos, cero `vite`
   vivos.

**Abierta (1 de 7):**

6. **`BarrasDivergentes` sigue anunciando «+$ 0,6 M» sobre el último punto de un mes cuyo
   saldo es −$ 1,4 M** (`frontend/src/components/plataforma/graficos.tsx:2006`, el
   `{"+" + platM(ent(ultimo))}` intacto). Es la única de las siete que no se tocó, y no la
   cubre ninguna prueba.

**Anotaciones que no son fallas:**

* la bajada del informe dice «Tres páginas A4 verticales» siempre, pero un periodo cerrado
  imprime en **2** (julio) y el mes en curso en **3** — efecto nuevo del arreglo 1 sobre el
  desvío D2, que se había decidido dejar como estaba;
* **D8** (rótulos acortados respecto de A) sigue igual; no estaba en el encargo de esta ronda;
* la tabla de «Estados de cuenta» quedó visible de arranque y su cifra vive en el
  `<summary>`, no en un `.plat-frase` (§2.2).

**Limpieza**: el backend `:8056` muerto por PID exacto, la base sembrada borrada, ningún
`*.db` en el repositorio, ningún proceso `uvicorn` / `vite` / `pytest` / `chrome` vivo,
`/tmp/re-nom` sin tocar. En el árbol de trabajo esta pasada sólo deja las 39 capturas
`port2-*` y este archivo. **Sin commit ni push.**
