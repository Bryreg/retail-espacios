# Rediseño de la experiencia (UX) · octubre 2026

Dibujos para aprobar. **Nada de esto está implementado.** No es código de la
aplicación: son dibujos estáticos con datos de ejemplo (sede CENTRO,
Supermercado La Esquina, PUN-08) hechos en el lienzo de diseño «RECABRA · UX»
entre el 25 y el 26 de octubre de 2026.

## Qué mirar

| Archivo | Qué es |
|---|---|
| [`pantallas.md`](pantallas.md) | **El documento principal.** Todas las pantallas del sistema nuevo, cada una con su imagen, su propósito en una línea, su estado (nueva · cambia · existe) y la lista completa de funciones con casillas para marcar a medida que se implementan. Cubre las 187 funciones de hoy más las nuevas. |
| [`PROMPT.md`](PROMPT.md) | El prompt maestro para implementar el rediseño fase por fase: objetivo, capas, flujos, reglas duras, forma de trabajo y criterios de terminado. |
| [`tableros/`](tableros/README.md) | Los 64 tableros del lienzo, página por página: capas, disponibilidad, recorrido completo, flujos, tablero e Indicadores combinado. |
| [`generadores/`](generadores/) | Los scripts que generan los tableros (HTML estático) y el que los convierte en imagen. |

En `pantallas.md`, debajo de cada imagen, dice si es un **dibujo** (pantalla
nueva o que cambia) o una **captura del sistema actual** (pantalla que ya existe
y no se redibujó).

## Las ideas que ordenan todo

- **Cuatro módulos y una barra común:** Contratos · Indicadores · Montajes ·
  Plano de la sede. Ahí están el buscador (Ctrl K), el selector de sede, la
  bandeja de Pendientes y Ajustes. La ficha del espacio es la misma en los cuatro.
- **Todas las funciones activas, sin agobiar:** lo frecuente está a la vista o en
  la ficha. Lo raro o peligroso queda a un clic, en «Más». La configuración va en
  Ajustes. Ninguna de las 187 funciones de hoy desaparece (el mapa está en
  `tableros/`, página «Todas las funciones, sin agobiar»).
- **Vender más = disponibilidad primero:** se eligen las fechas, y el plano, la
  lista y la línea de tiempo dicen hasta cuándo está ocupado cada mueble y desde
  cuándo queda disponible. Después se contrata en cuatro pasos.
- **Indicadores:** un panel de información rápida como «Resumen». Detrás van
  pestañas de detalle: tabla de contratos, quién paga el canon, participaciones
  de cara y todas las sedes. Cada cifra tiene su definición en el diccionario de
  métricas.
- **Montajes:** contratos y planogramas en una sola lista. La verificación del
  montaje de un contrato es nueva; hoy sólo se verifican planogramas.

## Decisiones abiertas antes de implementar

- Aprobar el diseño combinado de Indicadores.
- Metas: 90 % de ocupación y 95 % de canon ÷ tarifa (ámbar por debajo; rojo bajo
  80 % y 85 %), ¿o por sede?
- Nombres del menú: Contratos · Indicadores · Montajes · Plano de la sede (y si
  «Vender» se conserva).
- Importes completos, sin abreviar «M».
- Por dónde empezar. La propuesta es Contratos con fechas, junto con el Resumen
  de Indicadores.
- Una persona nueva que pruebe la primera etapa.

## Cómo se regeneran los tableros

```bash
cd generadores
mkdir -p ../salida-html ../salida-png
python3 combinado.py ../salida-html      # encadena tableros → disponibilidad → recorrido → flujos → tablero → panel
node render-tableros.mjs ../salida-html ../salida-png   # necesita Playwright (importa chromium de ./comun.mjs)
```

Eso genera 53 de los 64 tableros. `comparar.py` además recibe la carpeta con
`Ficha.png` y `PanelR.png` ya dibujados. Las dos primeras páginas («Etapa A» y
«La experiencia completa») se escribieron a mano en el lienzo y no tienen
generador; sus imágenes están en `tableros/`. Los archivos `*_v1.py`, `base_v2.py`, `minimal.py` y
`oportunidades.py` son de iteraciones descartadas («Oportunidades» y el panel
minimalista T0 se rechazaron). Quedan como referencia.
