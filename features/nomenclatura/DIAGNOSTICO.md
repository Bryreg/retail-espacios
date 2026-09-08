# La nomenclatura y el código: por qué un contrato cae en el mueble equivocado

**Fase 12 · RECABRA · 2026-09-08.** Diagnóstico, no arreglo: no se tocó una línea del
código de la app. Evidencia en `diag-repro.md`, `diag-censo.md` y `diag-riesgo.md`, con 23
capturas en `capturas/`. Todo se reprodujo con la app levantada y, donde se dice, **por la
pantalla real**, no por la API.

---

## 1. Qué pasó

Un mueble del plano tiene **dos nombres**: el **código**, que es la llave con la que se
guarda todo, y la **nomenclatura**, un texto libre que alguien escribe a mano y que
reemplaza al código **sólo en la pantalla**. En CIUDAD JARDIN se renumeró a mano una
corrida de impulsadores, y como se corrieron los números dentro de un conjunto cerrado,
**cada nombre nuevo es el código viejo de otro mueble**. Por eso el plano dibuja «IMP-08»
sobre el mueble cuyo código es IMP-12: es el mismo contrato, mostrado con el nombre puesto
a mano en una pantalla y con el código real en la otra, y el archivo adjunto lleva el
código porque es lo único que el sistema guarda. Las tres piezas de la captura son una sola
causa vista desde tres lugares.

## 2. La causa raíz

**El nombre que se lee y la llave que une son dos campos distintos, y nada obliga a que
coincidan ni impide que el nombre de un mueble sea el código de otro.**
`frontend/src/utils/nomenclatura.ts:150` (`nombreDeMueble` devuelve `nomenclatura || code`)
contra `backend/app/services/layout_lookup.py:59` (la planilla resuelve **sólo** contra
`code`), sin nada en el medio: `nombreRepetido` (`nomenclatura.ts:165`) compara nombres
contra nombres, nunca contra los códigos ajenos.

Descartadas: no es la carga masiva en sí (el mismo desvío se produce por la ficha del mapa,
que entra por el mismo endpoint), no es un problema de mayúsculas ni de ceros a la
izquierda, y no es que el contrato se haya duplicado (hay un solo contrato por fila; lo que
hay son dos nombres para el mismo mueble y dos muebles con el mismo nombre).

## 3. Qué tan grave es

**Se puede vender dos veces el mismo espacio, y está demostrado.** Con el contrato de CASA
LUKER ya puesto sobre el mueble que el plano dibuja «IMP-08», se subió por la pantalla de
Planilla una segunda fila «IMP-08 · COLGATE», con **las mismas fechas y el mismo monto**.
La revisión respondió «1 listas · 0 con avisos · 0 no entran» y la guardó sin una sola
advertencia. El mapa de Vender quedó dibujando **dos cajas con el rótulo idéntico
«IMP-08 · libre 16 sep»**, con dos proveedores distintos y el mismo periodo
(`capturas/B-1-vender.png`).

La protección de choque de fechas **existe y funciona**: en el escenario de control, con las
nomenclaturas vacías, la segunda venta se rechaza con «CIUDAD JARDIN-IMP-08 ya tiene un
contrato del 2026-01-01 al 2026-09-15». Lo que la esquiva es que el nombre que se lee y el
código que une sean dos cosas.

**En el plano 2D la colisión es invisible.** De los dos espacios vendidos a proveedores
distintos, uno dibuja la pastilla «IMP-08» y el otro **no dibuja ningún nombre**: sólo el
emoji, porque la pastilla está reservada para los muebles con nombre puesto a mano
(`nomenclatura.ts:196`). Quien mira el plano ve un solo IMP-08 y no tiene cómo sospechar
que hay otro.

**El paso de revisión de la planilla no puede mostrar el desvío.** `bulk_leases.py:203`
devuelve como nombre el `label` del mueble, que en los once impulsadores es el mismo texto
genérico «Impulsador Marca», y como código repite lo que la persona tecleó con la sede
antepuesta. Los dos campos son idénticos para el mueble correcto y para el equivocado. El
paso existe, según su propio comentario, «para que la revisión sea sobre lo resuelto y no
sobre lo que la persona cree que escribió», y hoy no lo consigue.

**«Revisar antes de negociar» declara limpio un plano con cuatro nombres repetidos.** Con
los dos contratos encima, el botón responde «El plano está limpio: sin códigos repetidos».
Es cierto y es inútil: `utils/revision.ts:16` ni siquiera recibe el campo `nomenclatura`, y
su único chequeo agrupa códigos contra códigos.

**Y hay un segundo agujero, independiente de la nomenclatura.** Si la columna Sede de la
planilla llega vacía, el código queda corto («IMP-08» en vez de «CIUDAD JARDIN-IMP-08»),
el servidor **igual encuentra el mueble** (`layout_lookup.py:59` compara también contra el
código corto) y crea **una segunda fila de espacio para el mismo mueble físico**, con su
propio contrato y ciega al choque del otro. Con la sede de otra tienda, el contrato se va a
ese otro supermercado sin un aviso. Esto no necesita ningún renombre: es una doble venta
literal. *No se pudo confirmar que la pantalla permita llegar con la sede vacía —hoy manda
siempre la sede activa—; la API lo acepta.*

**Lo que NO pasa,** para acotar el pánico: los contratos no se pierden ni se duplican solos,
la plata de cada contrato es correcta, y el choque de fechas sigue protegiendo cuando el
plano no tiene nombres puestos a mano. El daño es de **puntería**: el contrato cae en un
mueble que nadie acordó, y dos contratos pueden apuntar al mismo mueble físico.

## 4. El alcance del daño ya hecho

Tres consultas para correr sobre la base de producción (SQLite). La primera es la que
importa: dice cuántos muebles tienen hoy nombre distinto de su código.

```sql
-- 1) Muebles con nombre puesto a mano, y si ese nombre es el código de OTRO mueble.
WITH m AS (
  SELECT s.sede,
         json_extract(f.value, '$.code')         AS code,
         trim(json_extract(f.value, '$.nomenclatura')) AS nombre
  FROM layout_snapshots s, json_each(s.fixtures_json) f
)
SELECT a.sede, a.code AS codigo_real, a.nombre AS nombre_dibujado,
       CASE WHEN b.code IS NOT NULL THEN 'PISA EL CODIGO DE ' || b.code ELSE '' END AS choque
FROM m a
LEFT JOIN m b ON b.sede = a.sede AND upper(b.code) = upper(a.nombre) AND b.code <> a.code
WHERE a.nombre IS NOT NULL AND a.nombre <> '' AND upper(a.nombre) <> upper(a.code)
ORDER BY choque DESC, a.sede, a.code;

-- 2) Contratos vigentes cuyo mueble se dibuja con OTRO nombre: los sospechosos
--    de haber caído en el espacio equivocado.
WITH m AS (
  SELECT s.sede,
         upper(s.sede) || '-' || upper(json_extract(f.value, '$.code')) AS code_full,
         json_extract(f.value, '$.code') AS code,
         trim(json_extract(f.value, '$.nomenclatura')) AS nombre
  FROM layout_snapshots s, json_each(s.fixtures_json) f
)
SELECT sp.code AS espacio, m.nombre AS se_dibuja_como, su.name AS proveedor,
       l.start_date, l.end_date, l.monthly_rent
FROM space_leases l
JOIN spaces sp ON sp.id = l.space_id
JOIN suppliers su ON su.id = l.supplier_id
JOIN m ON upper(m.code_full) = upper(sp.code)
WHERE l.is_active = 1 AND date(l.end_date) >= date('now')
  AND m.nombre IS NOT NULL AND m.nombre <> '' AND upper(m.nombre) <> upper(m.code)
ORDER BY sp.code;

-- 3) El segundo agujero: dos filas de espacio para el mismo mueble físico
--    (una con la sede antepuesta y otra sin ella).
SELECT a.code AS espacio_largo, b.code AS espacio_corto
FROM spaces a JOIN spaces b
  ON upper(a.code) LIKE '%-' || upper(b.code)
 AND a.id <> b.id
ORDER BY a.code;
```

## 5. El arreglo

Va en dos partes, y la segunda no la resuelve ninguna de las primeras.

**Lo que hay que impedir hacia adelante.** Recomiendo estas cuatro, en este orden, porque
juntas cierran el caso sin tocar ninguna llave ni pedir migraciones:

1. **Que el eco de la revisión muestre lo que la persona reconoce.** Devolver, además del
   código, la nomenclatura del mueble resuelto, y mostrarla en la pantalla de revisión de
   la planilla. Es una línea de backend y una columna de frontend, y convierte un error
   invisible en algo que se ve antes de crear cuarenta contratos. Es lo más barato de todo
   el mapa.
2. **Que la planilla deje de ser texto libre.** La plantilla descargable se baja hoy con
   dos filas de ejemplo inventadas; debería bajarse **pre-llenada con los espacios reales
   de la sede** (código y nombre dibujado), y la columna Espacio pasar a ser una lista
   cerrada. Ataca la fuente, que es el tipeo.
3. **Que no se pueda crear un nombre que ya es el código de otro.** Hacer que la validación
   de nombre compare también contra los códigos ajenos, y que el campo «Nomenclatura» del
   panel lateral la llame: hoy escribe directo, sin ninguna comprobación, mientras el doble
   clic sobre la caja sí valida. Y que «Revisar antes de negociar» reciba el campo y liste
   los nombres repetidos, que hoy ni mira.
4. **Tapar el segundo agujero**, que no tiene nada que ver con lo anterior: rechazar la
   fila sin sede, o resolverla contra la sede del mueble encontrado, en vez de crear un
   espacio nuevo con el código corto.

**Lo que NO recomiendo, por ahora:** prohibir que la nomenclatura difiera del código, o
resolver la planilla también por nomenclatura. La primera obliga a renombrar la llave de
verdad, que arrastra el código del espacio, su identificador de dibujo, las confirmaciones
de montaje y el histórico de la plataforma, y hoy no existe ningún endpoint que haga eso;
además los seis muebles ya renombrados violarían la regla desde el primer arranque. La
segunda, sola, deja seis filas que no se pueden cargar y a la persona sin forma de decir
cuál quiso: en el plano medido **las seis nomenclaturas pisan el código de otro mueble**.
Las dos son caminos razonables más adelante, con un endpoint de renombre que arrastre todo;
no son el primer movimiento.

**Lo que hay que reparar de lo ya cargado.** Nada de lo anterior toca los contratos que ya
cayeron mal. Hace falta una reconciliación: cruzar cada contrato vigente con el nombre
dibujado de su mueble y listar los que no coinciden, para revisarlos uno por uno. La
consulta 2 de arriba es exactamente eso, y puede vivir como pantalla. Sin eso, el arreglo
tapa la fuga y deja adentro el agua que ya entró.

## 6. Lo que hay que probar para que no vuelva

| # | Escenario | Lo que fija |
|---|---|---|
| 1 | Mueble con código IMP-12 y nombre «IMP-08», existiendo otro con código IMP-08; fila de planilla «IMP-08» | La revisión muestra el nombre dibujado del mueble resuelto, y se ve que no es el que la persona quiso |
| 2 | Lo mismo, dos filas en dos cargas distintas, mismas fechas | La segunda no se crea, o se avisa que dos nombres iguales apuntan a muebles distintos |
| 3 | Escribir en «Nomenclatura» un texto que ya es el código de otro mueble de la sede | No se guarda, y se dice cuál es el otro |
| 4 | Plano con dos muebles que se dibujan con el mismo nombre | «Revisar antes de negociar» los lista en vez de decir que está limpio |
| 5 | Fila de planilla sin sede | No se crea un segundo espacio para el mismo mueble |
| 6 | Fila de planilla con la sede de otra tienda | Se avisa antes de crear |
| 7 | Plantilla descargada de una sede | Trae los espacios reales de esa sede, no filas de ejemplo |

---

## Tabla de hallazgos

| Gravedad | Hallazgo | Dónde |
|---|---|---|
| **Grave** | La doble venta se puede hacer y ninguna validación la frena: dos proveedores, mismo periodo, dos cajas que el plano rotula igual | `bulk_leases.py:271-289` |
| **Grave** | En el plano la colisión es invisible: de los dos muebles vendidos, uno lleva el nombre y el otro no dibuja ninguno | `nomenclatura.ts:196-205` |
| **Grave** | El eco de la revisión devuelve `label`, nunca la nomenclatura: el paso que existe para revisar no puede mostrar el desvío | `bulk_leases.py:203` |
| **Grave** | «Revisar antes de negociar» declara limpio un plano con cuatro nombres repetidos: la función no recibe el campo | `revision.ts:16-24`, `:160` |
| **Grave** | Sin sede, el código corto crea un segundo espacio para el mismo mueble físico, ciego al choque del otro | `bulk_leases.py:140-150`, `layout_lookup.py:59` |
| **Media** | El campo «Nomenclatura» del panel escribe sin ninguna comprobación; el guardarraíl sólo existe en el doble clic | `FloorPlan2D.tsx:3612-3620` contra `:1321` |
| **Media** | La sede de otra tienda en la planilla manda el contrato a ese supermercado sin aviso | `bulk_leases.py:140-150` |
| **Media** | `PUT /layout/{sede}` acepta la lista de muebles sin mirar: un guardarraíl que vive sólo en el navegador no es del sistema | `schemas/layout.py:7`, `layout.py:414-473` |
| **Menor** | La plantilla descargable trae dos filas de ejemplo con códigos que pueden no existir en esa sede | `utils/planilla.ts:241-262` |

**Lo que quedó sin confirmar:** si la pantalla permite llegar con la sede vacía (la API sí
lo acepta); y si en producción se emitieron alguna vez enlaces firmados de montaje, que es
lo que decidiría cuánto cuesta un renombre de verdad. El escéptico que iba a atacar estas
conclusiones no llegó a correr: se cortó por límite de sesión con la lectura hecha y la
reproducción propia sin empezar (`diag-refutacion.md`).
