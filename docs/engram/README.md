# Engram — observaciones pendientes de cargar

Estas notas están escritas **en el formato del store de Engram** (proyecto
`retail-espacios`, el mismo que exportó `docs/context/`), pero todavía **no
están en el store**: se escribieron desde una sesión remota, que no tiene el
servidor de Engram conectado. Quedan acá para que el conocimiento no dependa de
que alguien se acuerde.

**Qué hacer con esto:** desde la máquina local, con Engram disponible, cargar
cada archivo como una observación en su namespace y borrar el archivo de acá
—o, si preferís que el repo siga siendo la copia legible, dejarlo y anotar el
número de observación en el encabezado, como hace `docs/context/`.

| Doc | Namespace propuesto | Tema |
|---|---|---|
| [01-rediseno-pantalla-principal.md](01-rediseno-pantalla-principal.md) | `diseno/rediseno-2026-09` | Por qué el sistema «se veía hecho con IA», qué se probó, qué quedó |
| [02-gotchas-de-diseno.md](02-gotchas-de-diseno.md) | `tooling/gotchas-diseno` | Lo que salió mal armando las maquetas y cómo se resolvió |
| [03-mobiliario-3d.md](03-mobiliario-3d.md) | `mobiliario/catalogo-3d` | Cómo se reconstruyó el catálogo 3D: no modelar de memoria, guardas que ejecutan, el modelo de producto |

Diferencia con las otras dos carpetas de documentación:

- **`docs/ESTADO.md`** es el documento vivo: qué hay hoy y qué reglas rigen.
- **`docs/context/`** es un export histórico congelado al 2026-08-23.
- **`docs/engram/`** (esto) es la cola de entrada al store: lo aprendido después,
  todavía sin cargar.

Ante cualquier contradicción manda `docs/ESTADO.md` y el código.
