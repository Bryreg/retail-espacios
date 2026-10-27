# Versión final del rediseño · relacional y verificable

Dibujo **aprobado por el dueño el 26/10/2026**. **No es código de la app.** Junta lo mejor de cada
versión que se dibujó ese día y, a diferencia de las anteriores, no tiene ni un dato
inventado: todo sale de una base de la app y se comprueba contra esa base.

## Qué se queda de cada versión

| De la versión | Qué se queda |
|---|---|
| Capas y 4 módulos | Contratos · Indicadores · Montajes · Plano de la sede, barra común, bandeja de Pendientes, ficha única del espacio, Ajustes por tema |
| Disponibilidad | Primero las fechas: el plano y la lista dicen qué está libre, hasta cuándo y desde cuándo |
| Indicadores combinado | Resumen rápido + tabla de contratos + participaciones + todas las sedes + detalle + diccionario de métricas |
| «Como la foto» | Azul como acción principal, tarjetas blancas, menú lateral, plano aireado (pasillos anchos, muebles finos) |
| Responsive | Un solo diseño que escala con la pantalla (`recabra.css`); teléfono y tableta vertical se reacomodan |

## Qué hay acá

| Carpeta | Qué es |
|---|---|
| [`prototipo/`](prototipo/) | 96 páginas HTML enlazadas. Abrí `prototipo/inicio.html` en el navegador y navegá: cada código lleva a su ficha, cada contrato a su página, cada pendiente a la pantalla que lo resuelve. |
| [`tableros/`](tableros/) | Las imágenes de la página «Versión final (para aprobar)» del lienzo (FV0–FV10). |
| [`scripts/`](scripts/) | Cómo se armó y cómo se verifica, para repetirlo. |

## Cómo se arma (y por qué es relacional)

1. **Base nueva, sólo por la API real** — `scripts/sembrar.py` carga una base vacía usando
   los mismos endpoints que la app: `PUT /api/layout/CENTRO` (16 muebles), `PUT
   /api/layout/rates`, `POST /api/contratos/vender` (20 contratos enteros, por entrepaño, por
   participación y por % de ventas, y 2 reservas), planogramas (`/api/planogramas/…`),
   planometrías (`/api/leases/{id}/planometria`) y reportes de montaje
   (`/api/montaje/reportar`). Nada se escribe en la base a mano. El servidor
   rechazó el primer intento de planograma por la geometría: también validó los datos.
2. **Modelo con procedencia** — `scripts/modelo.py` hace 49 pedidos a la API y calcula
   cada cifra con su fórmula escrita al lado. La cuenta de meses es la de la app
   (`backend/app/services/meses.py`), importada, no copiada. Sale `prototipo/modelo.json`.
3. **Pantallas** — `scripts/final.py` + `final2.py` dibujan las 96 páginas SÓLO desde el modelo:
   - `data-v="clave"` en cada cifra (su fórmula está en `diccionario.html`);
   - `data-campo="tabla:id:campo"` en cada dato de una fila (`lease:2:proveedor`…);
   - `data-ref="CÓDIGO"` en cada espacio, siempre enlazado a su ficha;
   - `data-sec` con la sección del inventario (`../pantallas.md`) que dibuja.
4. **Verificación por otro camino** — `scripts/verificar.py` lee la base con **SQL** y rehace
   cada cuenta con sus propias reglas; `dom.mjs` lee lo que el navegador muestra.

## El plano 2D, con más espacio (pedido del 26/10)

El editor donde se arma el supermercado pasó a ser una mesa de trabajo:

- el menú se vuelve un riel angosto y la cabecera ocupa una sola línea;
- el catálogo es una tira de muebles para arrastrar;
- las herramientas, el zoom, la validación y la leyenda flotan sobre el plano;
- las propiedades aparecen al elegir un mueble;
- hay pantalla completa (`plano2d-completa.html`).

Lo medido es el % de la pantalla que ocupa el plano:

| Pantalla | Antes | Mueble elegido | Sin elegir | Pantalla completa |
|---|---|---|---|---|
| 1366 × 768 | 29 % | 57 % | 73 % | 84 % |
| 1440 × 900 | 30 % | 59 % | 74 % | 85 % |
| 1920 × 1080 | 34 % | 61 % | 76 % | 86 % |
| 1024 × 768 | 30 % | 49 % | 66 % | 81 % |
| 390 × 844 | 40 % | 62 % | 62 % | 73 % |

En la tableta vertical (768 × 1024) el plano ocupa más (55 % → 64 %), pero su rótulo más chico
quedó en 7,2 px (antes 8 px). En la app, los rótulos tienen que contra-escalar con el zoom.

## Resultado de la verificación (`prototipo/verificacion.json`, `tamanos.json`)

| Comprobación | Resultado |
|---|---|
| Cifras del dibujo contra SQL | 43 de 43 |
| Datos de filas (contratos, reservas, montajes, tarifas, bitácora) contra SQL | 504 de 504 |
| Enlaces a páginas que no existen | 0 |
| Fichas con su espacio | 26 de 26 |
| Filas de la bandeja de Pendientes contra lo que explica la base | 26 = 26 |
| Secciones del inventario con pantalla | 47 de 47 (296 funciones en esas secciones) |
| Prueba de tamaños: 96 páginas × 12 tamaños (320 × 568 a 2560 × 1440) | 1152 combinaciones: 0 scroll horizontal, 0 textos que se pisan, 0 controles < 40 px, 0 ventanas que no caben, 0 errores; letra mínima 12 px |

**Lo que no está verificado (dicho sin maquillar):**

- La cobertura de funciones es **por sección**: cada una de las 296 funciones no tiene
  todavía su propio marcador en la pantalla.
- Los rótulos dentro de los dibujos (plano 2D, 3D, caras) bajan de 10 px en 177
  combinaciones de las 1152, casi todas en teléfono y en el editor. Pasa porque el dibujo
  entero se achica. En la app, esos rótulos tienen que contra-escalar con el zoom.
- Sólo se probó en Chromium.
- Es el dibujo: la app hay que medirla otra vez al implementar.

## Hallazgos en la app de hoy (para corregir al implementar)

- `GET /api/dashboard/kpis`: `monthly_revenue` suma el **total** de cada contrato, no el
  mes. Da $ 44.670.000 contra los $ 6.370.000 de canon real del mes. Además cuenta los 41
  espacios del mapa viejo.
- `GET /api/participaciones/cara`: `valor_mensual` trae el total del contrato (720.000 en
  una participación de 120.000 al mes).
- `GET /api/bitacora/acciones`: las acciones de planogramas no tienen título legible.
  Devuelve la clave cruda; el dibujo usa un título nuevo, marcado con `data-titulo-nuevo`.
- No hay endpoint con el historial de contratos terminados. «Libre desde» y el canon de
  meses pasados sólo salen por SQL.
- La verificación del montaje de un contrato no guarda quién verificó ni cuándo. Es nueva
  en el diseño; los planogramas sí lo tienen.

## Cómo se repite

```bash
sh scripts/servidor.sh                       # backend real en :8744 sobre una base nueva
python3 scripts/sembrar.py http://127.0.0.1:8744
python3 scripts/modelo.py http://127.0.0.1:8744 prototipo/modelo.json
python3 scripts/final.py prototipo/modelo.json prototipo   # necesita ../generadores (foto.py y su cadena)
node scripts/dom.mjs $PWD/prototipo && python3 scripts/verificar.py bd-final.db prototipo
```

Los scripts tienen rutas absolutas de la sesión en la que se hicieron (la carpeta de
trabajo y el `venv` del backend). Hay que cambiarlas antes de correrlos en otra máquina.
