# El mobiliario 3D: cómo se construyó y qué enseñó

> Engram (pendiente de cargar) · `mobiliario/catalogo-3d` · sesiones del
> 2026-09-11 al 2026-09-13 · PRs #63 y #64 · complementa
> [ESTADO.md § El mobiliario 3D](../ESTADO.md)

El editor dibujaba diecinueve tipos de mueble hechos de `boxGeometry`. Quedaron
reconstruidos contra fichas de fabricante y fotos. Lo que sigue es lo que no
está en el código y cuesta volver a aprender.

## La regla que lo ordenó todo: no se modela de memoria

El mostrador de carnes sólo salió bien cuando hubo **una foto de uno real**
delante. El cliente lo dijo sin vueltas: *«¿viste que me tocó darte una foto
para que lo hicieras bien?»*. Lo que se modela de memoria sale parecido a la
idea que uno tiene del mueble, no al mueble.

Y la regla tiene una trampa: **decir «lo revisé» no es haberlo revisado**. Tres
muebles se marcaron «revisado, sin cambios» sin haberles buscado ficha, y los
tres estaban mal. El exhibidor de piso pasó por dos formas equivocadas más
—una pirámide de cajones, un mueble impreso con bandejas— antes de que una foto
de una tarima dijera lo que era: **una estiba**, con la mercancía apilada
encima. El dato estaba en el catálogo desde el principio: la huella del tipo es
1,20 × 0,80, que es una tarima estándar.

## Lo que las pruebas de texto NO atrapan

Cuatro guardas pasaron en verde **con el defecto instalado**:

1. La de la batea afirmaba que existiera la constante `REBOSE`. Una mutación
   que dejaba la constante y la sacaba de la fórmula pasaba.
2. La del botón de destino buscaba `NUNCA_ALQUILABLE.has(` en todo el archivo:
   seguía apareciendo un párrafo más abajo.
3. La de «el stand no se para sobre postes» buscaba las palabras «postes» y
   «parantes». Una mutación con postes de verdad, escritos con otro nombre,
   pasaba.
4. La de la semilla del volcado casaba `"isla"` por prefijo contra
   `${id}|isla_fria`.

**El arreglo no es escribir más afirmaciones de texto: es mover las cotas a
`medidas.ts` y EJECUTAR la cuenta.** Desde ahí la prueba puede afirmar lo que
de verdad importa —que en una batea de catálogo entra parada una botella de
litro y medio, que sobre cada tendido de la estiba no sobra aire— en vez de
leer el código. Esa conversión encontró un bug real que nadie había visto: la
espina del stand de frutas medía `0.8·h + 0.16` y sobresalía del alto declarado
del mueble en cualquier mueble de menos de 80 cm — y ese alto es el que mira el
chequeo de choques.

Regla operativa: **toda guarda nueva se prueba mutando el código**. Si la
mutación pasa en verde, la guarda no existe. Y las mutaciones se prueban con el
árbol limpio, porque se revierten con `git checkout --`.

## Dos lecciones de método que costaron trabajo real

- **`git checkout --` sobre un archivo con cambios sin commitear los borra.**
  Pasó dos veces en la misma sesión, al revertir mutaciones de prueba. La regla
  es **commitear ANTES de mutar** y verificar que `git status` quede limpio
  después de cada reversión.
- **La suite del backend corre en serie, y tarda.** ~19 minutos en CI. Dos
  `pytest` solapados producen fallas fantasma, incluida
  `sqlite3.OperationalError: attempt to write a readonly database`. Una sola
  suite por vez.
- **Un test que importa `app` a nivel de módulo rompe el aislamiento.** El
  import ocurre durante la colección, antes de que el fixture `client` ponga
  `DATABASE_URL`, así que `app.database` queda atado a la base por defecto para
  toda la sesión. Los imports van **adentro** de cada test.

## Cómo se mira un mueble sin ojos humanos

`scripts/taller/mirar-mueble.py` (en `frontend/`) levanta Chromium, entra a
`/taller` —el banco de pruebas que dibuja cualquier tipo del catálogo sin tener
que colocarlo en una sede—, gira la cámara a tres cuartos y guarda el PNG. **La
cámara de frente no sirve**: casi todo parece una caja; el defecto de «el
producto está adentro del mueble» sólo aparece en tres cuartos.

Se escribió y se perdió tres veces por vivir en `/tmp` de un contenedor que se
recicla. Ahora está en el repo. El token de sesión **no** está: se pasa por
`TALLER_TOKEN`.

## El modelo de producto, en una frase por concepto

- **Lo que está vendido se llena; lo libre queda vacío.** No es decoración:
  mirar el plano y ver dónde hay mercadería ES el estado comercial. Por eso no
  se rellena el mueble entero «para que se vea lindo» — una tienda pintada
  llena miente sobre lo único que este sistema tiene para decir.
- **El arte del proveedor le gana al relleno por rubro.** Se apaga con
  `{!pinta && …}`, y el arte se rebana POR FILA, nunca se cuelga de póster
  sobre todo el frente. La guarda que lo verifica es **general**: recorre todos
  los `*Mesh` del editor, porque la versión por mueble se escribió tres veces y
  tres muebles quedaron afuera igual.
- **Tres modos de producto**: por espacios internos (góndola y punta — el hueco
  vacío ES el dato), mueble entero (`ProductoEnRepisas`), y volcado
  (`ProductoAGranel`, sembrado con el id del mueble y nunca con `Math.random`,
  o el montón titila en cada render).
- **Lo que se vende suelto no tiene envase**, y lo volcado va ACOSTADO: con el
  envase de pie una sola capa llena el cajón y desde arriba se ve una tapa
  lisa.
- **Una sola cuenta por mueble.** La altura de los entrepaños estaba escrita
  dos veces —en la malla y en `getPanelShelfSpan`— con un comentario en cada una
  pidiendo mantenerlas iguales. No se mantuvieron. Hoy las dos preguntan a la
  misma función, y eso también se afirma en las pruebas.

## Qué es espacio vendible, y por qué la pregunta era del TIPO

La caja registradora y el mostrador de servicio al cliente **nunca** se
alquilan: son operación de la tienda. La regla vive en `NUNCA_ALQUILABLE`
(`frontend/src/types/fixtures.ts` y `backend/app/services/layout_lookup.py`,
con una prueba que compara los dos conjuntos).

Lo importante es el orden: **`isRentable` pregunta por el TIPO antes que por la
bandera.** La bandera `rentable` se estampa al crear el mueble, y ausente
significa alquilable — así que con la regla escrita sólo como bandera, cada
checkout de cada plano dibujado antes del cambio seguía siendo inventario
vendible y podía aceptar un contrato.
