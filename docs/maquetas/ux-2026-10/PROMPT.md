# Encargo: rediseño de la experiencia de RECABRA

> Prompt maestro para implementar el rediseño de la experiencia, en cualquier
> sesión y fase. El objetivo es **más amigable para quien lo usa, sin perder
> ninguna función**. Los dibujos que lo acompañan están en esta carpeta
> (`docs/maquetas/ux-2026-10/`).

---

## 1. Antes de tocar nada, leé

1. `CLAUDE.md` (raíz del repo).
2. `docs/ESTADO.md`. **Manda sobre este prompt** en reglas, arquitectura y
   estado. Si algo de acá lo contradice, gana ESTADO.md; avisá la contradicción.
3. `docs/maquetas/ux-2026-10/README.md`: las ideas y las decisiones abiertas.
4. `docs/maquetas/ux-2026-10/pantallas.md`: **la especificación**. Cada
   pantalla viene con su imagen, su propósito, su estado (nueva · cambia ·
   existe) y la lista de funciones con casillas.
5. `docs/maquetas/ux-2026-10/tableros/README.md`: los 64 dibujos. Las páginas
   vigentes son «Todas las funciones, sin agobiar», «Disponibilidad», «El
   recorrido completo», «Flujos completos», «El tablero» e «Indicadores
   combinado». «Etapa A» y «La experiencia completa» son históricas.
6. `docs/maquetas/ux-2026-10/generadores/mapa.py`: **dónde queda cada una de
   las 187 funciones de hoy**, con su capa y su número de inventario.

---

## 2. Qué es RECABRA y para quién

RECABRA gestiona los espacios comerciales de un supermercado: góndolas,
puntas, neveras, exhibidores y sus caras, entrepaños y participaciones. El
supermercado alquila esos espacios a proveedores. El sistema arma el plano de
cada sede, vende los espacios por fechas y controla que lo vendido y lo
planificado quede montado en la tienda como se pidió.

Quiénes lo usan:

| Rol | Qué hace en el sistema |
|---|---|
| Dueño | Todo lo del administrador, más la cuenta, la facturación y los permisos. |
| Administrador | Arma el plano, vende, configura tarifas, revisa indicadores y verifica montajes. |
| Trabajador (comercial) | Vende y consulta disponibilidad. **No ve importes en Indicadores.** |
| Responsable de montaje | Recibe el aviso en el teléfono, sin contraseña y sin montos. Registra el montaje con foto. |
| Proveedor | No entra al sistema. Ve la propuesta en 3D en la reunión, **sin precios ni tarifas ajenas**. |
| Operador de plataforma | Su consola queda como está. |

---

## 3. El objetivo, en concreto

**Quien entra por primera vez entiende dónde está cada cosa, y quien lo usa
todos los días hace lo frecuente en pocos pasos. Ninguna de las 187 funciones
de hoy desaparece ni queda escondida.**

### «Más amigable» quiere decir

- **Una sola navegación de un nivel.** Cuatro módulos (Contratos ·
  Indicadores · Montajes · Plano de la sede) en una barra común. Reemplazan las
  pestañas Sede, Montajes, Plano y Editor 3D, y los modos Vender y Supervisar.
- **Lo urgente, aparte.** Una bandeja de Pendientes en la barra, con contador,
  que se abre encima de cualquier módulo. Reemplaza «Para revisar» dentro de
  Supervisar. Cada pendiente trae su acción.
- **Una sola ficha del espacio**, igual en los cuatro módulos. Reemplaza el
  globo, la ficha de Supervisar y el panel del Plano.
- **Vender empieza por las fechas.** «¿Para qué fechas?» primero. El plano, la
  lista y la línea de tiempo responden qué está disponible, hasta cuándo está
  ocupado cada espacio y desde cuándo se libera. Después se contrata en 4
  pasos.
- **Una acción principal por pantalla**, en amarillo. Las demás tienen nombre
  escrito: nunca un ícono solo.
- **Ayuda en el lugar.** Un «?» en cada pantalla y en cada cifra, con la
  definición del glosario o del diccionario de métricas.
- **El teléfono es de primera.** Quien monta trabaja ahí. Contratos,
  Indicadores y la ficha tienen su versión de teléfono.

### «Sin perder funciones» quiere decir

Cada función vive en una de cinco **capas** (`mapa.py`):

| Capa | Dónde queda | Criterio |
|---|---|---|
| V | A la vista en la barra o en el módulo | Lo que se usa todos los días |
| F | En la ficha o en el paso, al tocar algo, **a la vista sin desplegar** | Lo que aplica a ese espacio o mueble |
| M | Un clic más: «Más» del módulo o plegado en la ficha | **Sólo lo raro o lo peligroso** (cancelar, limpiar todo, atajos, historial) |
| A | Ajustes, agrupado por tema | Configuración que se hace al empezar o cuando algo cambia |
| P | Pantalla propia, sin cambios | Plataforma, enlaces públicos |

Además:

- **El buscador (Ctrl K) atraviesa todas las capas.** Encuentra funciones por
  nombre y sinónimos («planilla» encuentra «Cargar contratos desde planilla»),
  espacios por código y términos del glosario.
- **Fijar en la barra.** Cada persona sube hasta 3 funciones de «Más» a su
  propia barra. No cambia lo que ven los demás.
- **Nada se borra ni cambia de comportamiento sin decirlo.** Si una función
  cambia de lugar, su lógica queda igual. El rediseño es de presentación y
  flujo: los cálculos (`fisicos_de`, `revisar_capacidad`,
  `auditoriaDesfase.ts`, etc.) no se tocan salvo que la fase lo diga.
- **Prueba al cerrar cada fase:** cada número de inventario que la fase toca
  se puede alcanzar desde la pantalla nueva, en la capa que dice `mapa.py`.
  Dejá esa lista en el PR.

---

## 4. La estructura nueva

```
Barra común: RECABRA · Contratos · Indicadores · Montajes · Plano de la sede
             · Buscar (Ctrl K) · Sede ▾ (o «Todas las sedes») · Pendientes (n) · ⚙ Ajustes · cuenta
                │
                ├─ Contratos ......... ¿Para qué fechas? · Línea de tiempo · Nuevo contrato (4 pasos)
                │                      · Editar/renovar · Cargar planilla · Ver en 3D con el proveedor
                ├─ Indicadores ....... Resumen (panel rápido) · Tabla de contratos · Quién paga el canon
                │                      · Participaciones de cara · Todas las sedes · Detalle · Diccionario
                ├─ Montajes .......... Lista (contratos + planogramas) · Aviso y registro en el teléfono
                │                      · Guía por enlace · Verificar contrato · Verificar planograma · No realizado
                └─ Plano de la sede .. Contorno · Plano 2D | 3D · Ficha del mueble · Distribución
                                       · Planograma: planificar, publicar, versiones, guía
Comunes a los cuatro: Ficha del espacio · Bandeja de Pendientes · Ayuda «?» · Fijar en la barra
Entrada: Crear cuenta · Registrar supermercado · Invitación · Configuración inicial (6 pasos, nueva)
Ajustes: Comercial · Sede y plano · Avisos · Equipo · Cuenta
```

Las funciones de cada pantalla están en `pantallas.md`. **Ésa es la lista que
se implementa, casilla por casilla.**

---

## 5. Los flujos que tienen que quedar simples

Cada uno está dibujado paso a paso en la página «Flujos completos» o «El
recorrido completo» de `tableros/`.

1. **Cliente nuevo.** Configuración inicial en 6 pasos con avance «N de 6»:
   sedes, plano, tarifas, responsables por sede, equipo y primer contrato (o
   planilla). Se puede ocultar y volver desde Ajustes.
2. **Armar el plano.** Primero el contorno del salón (ancho, largo, lado y
   distancia de la entrada). Después los muebles, con validación a la vista:
   códigos repetidos, superpuestos, pasillos angostos.
3. **Vender por fechas.** Fechas y atajos (1, 3 o 6 meses, temporadas). El
   plano se colorea: disponible, parcialmente contratado, contratado,
   reservado. Se elige uno o varios espacios y se pasa por qué se contrata,
   proveedor y vigencia, canon y confirmación. Al final aparecen el contrato
   guardado y lo que pasa ahora.
   - Qué se contrata depende de cómo se configuró el mueble:
     - **entero**;
     - **por partes** (entrepaños desde la base EN1, tramos, puertas);
     - **por participación** («queda 20 % de la cara A», sin nombrar a otros
       proveedores).
4. **Seguir vendiendo el mismo mueble.** La ficha y la línea de tiempo dicen
   desde cuándo vuelve a estar disponible. Tocar un hueco precarga esas fechas.
5. **Planograma de un mueble que no se vende.** Planificar la cara con
   destinos, revisar, publicar una versión y mandar la guía de montaje. No
   tiene contratos, proveedor ni precio.
6. **Montaje y verificación.** El responsable abre el aviso en el teléfono y
   registra con foto, o marca «No realizado» con motivo. El administrador
   verifica: coincide o no coincide.
   - **La verificación del montaje de un contrato es nueva.** Hoy sólo se
     verifican planogramas.
7. **El tablero diario.** Indicadores → Resumen dice cómo va la sede y qué
   hacer hoy, en una pantalla sin desplazarse.

---

## 6. Indicadores: cómo se entrega la información

El diseño es «Indicadores combinado»:

- **Resumen** es un panel rápido de 7 tarjetas:
  - canon mensual contratado;
  - ocupación;
  - canon ÷ tarifa;
  - para hacer hoy;
  - vence en 90 días;
  - montajes del mes;
  - disponibles hoy.
- Cada tarjeta lleva a su detalle. Las pestañas de detalle son Tabla de
  contratos, Quién paga el canon y Participaciones de cara. Todas las sedes se
  elige en el selector de sede.

Reglas de visualización (no negociables):

- **Un eje por gráfico.**
- **Estado siempre con ícono y texto** («Bajo la meta de 90 %»), nunca sólo
  color.
- **Importes completos:** «$ 9.939.500», nunca «9,9 M».
- Paleta validada:

  | Uso | Color |
  |---|---|
  | Acento | `#2a78d6` |
  | Riesgo | `#eb6834` |
  | Gris de lo secundario | `#b9b7af` |
  | Azules ordinales | `#86b6ef` · `#5598e7` · `#2a78d6` · `#1c5cab` |
  | Estado bien | `#0ca30c` |
  | Estado atención | `#fab219` |
  | Estado crítico | `#d03b3b` |

- Cada cifra tiene su entrada en el **diccionario de métricas**: fórmula,
  período, comparación, umbral y datos de origen.
- **El trabajador ve una versión sin importes.**
- **Limitación conocida:** las tarifas no tienen historia. Una comparación
  contra «la tarifa de entonces» no se puede calcular; no la inventes.

---

## 7. Lenguaje

- **Técnico y preciso, sin margen de mala interpretación.** Un término, un
  significado, en todo el sistema y en el glosario. Ejemplos: «canon mensual»,
  no «precio»; «reserva provisional», no «apartado».
- **Voseo en la interfaz:** «Elegí las fechas», «Tocá un espacio».
- **Fechas** en `dd/mm/aaaa`; **importes completos** en pesos.
- Los textos dicen qué pasó y qué sigue («Contrato guardado. Aviso de montaje
  enviado a Luis Pérez»), no «¡Éxito!».

---

## 8. Reglas duras

Romperlas rompe producción o la confianza del cliente. Las completas están en
`docs/ESTADO.md` → «Reglas duras».

1. **Sin migraciones.** `create_all()` crea tablas nuevas pero no agrega
   columnas. Lo nuevo va en **tablas nuevas**, en `app_config` o en el JSON del
   layout, según corresponda.
   - Propuesta (confirmala leyendo ESTADO.md):
     - el contorno y la entrada son geometría → JSON del layout;
     - las metas por sede → `app_config`;
     - la verificación del montaje de un contrato → tabla nueva.
2. **Una sola verdad.** El plano guarda lo que el mueble ES; la base guarda lo
   que se le VENDIÓ. El rediseño no mueve datos comerciales al layout.
3. **Amarillo sólo en la acción principal** de cada pantalla.
4. **Privacidad del proveedor.** Lo que ve el proveedor (3D, propuesta, correo)
   no muestra tarifas, precios ni nombres de otros proveedores. Lo que recibe
   el montaje no lleva montos.
5. **Sin datos ficticios en el producto.** Los dibujos usan datos de ejemplo;
   la aplicación muestra sólo datos reales o un estado vacío honesto.
6. **Los códigos de espacio no cambian** (`SEDE-CODE[-B][-PARTE<n>]`).
7. **Permisos en el servidor.** Ocultar un botón no alcanza: lo que es sólo de
   administrador o de dueño se valida en la API.
8. **No borres ni reorganices** archivos fuera de tu fase.

---

## 9. Cómo se trabaja cada fase

Una fase = una rama nueva desde `main` = un PR.

1. **Dibujo primero.** Si la fase no está dibujada o el dibujo quedó viejo,
   dibujala y esperá la aprobación del dueño antes de implementar.
2. **Implementar** contra `pantallas.md`, casilla por casilla.
3. **Una ronda de prueba con capturas:** 1440 px en tema claro y oscuro, y
   390 px (teléfono). Cubrí cada flujo de la fase, con datos de una base de
   prueba.
4. **Una corrección** con lo que mostró la ronda.
5. **Actualizar `docs/ESTADO.md`** si cambió una regla, un flujo o la
   arquitectura.
6. **Abrir el PR y no mergearlo.** Se mergea sólo con el OK del dueño.

Verificación mínima antes de cada push:

```bash
cd frontend && npx tsc --noEmit
cd backend && python -c "import app.main"
# npm install requiere --legacy-peer-deps
```

Más las pruebas del backend que toque la fase.

### Orden propuesto (a confirmar)

| Fase | Qué | Por qué en ese lugar |
|---|---|---|
| 1 | Barra común, buscador, bandeja de Pendientes y ficha del espacio unificada | Son los cimientos: todo lo demás cuelga de ahí |
| 2 | Contratos con fechas: ¿para qué fechas?, línea de tiempo y los 4 pasos | Es lo que hace vender más |
| 3 | Indicadores combinado y diccionario de métricas | El tablero diario del administrador |
| 4 | Montajes en una lista y verificación del montaje de contrato | Cierra el ciclo vender → montar → verificar |
| 5 | Plano de la sede: contorno, 2D \| 3D en un módulo, ficha del mueble en 4 pestañas, entrada al planograma | Ordena lo que hoy está en Plano y Editor 3D |
| 6 | Ajustes por tema, configuración inicial y metas por sede | Lo que se usa al empezar o cuando algo cambia |

La propuesta del README es empezar por Contratos con fechas junto con el
Resumen de Indicadores. Si se elige eso, la fase 1 entra mínima, sólo la barra
y la ficha que esas pantallas necesitan.

---

## 10. Decisiones abiertas: preguntá, no supongas

- ¿Se aprueba Indicadores combinado tal como está dibujado?
- Metas: 90 % de ocupación y 95 % de canon ÷ tarifa (ámbar por debajo; rojo
  bajo 80 % y 85 %), ¿o una meta por sede?
- Nombres del menú: Contratos · Indicadores · Montajes · Plano de la sede. ¿Se
  conserva la palabra «Vender»?
- Importes completos, sin abreviar «M».
- Por dónde empezar.
- Una persona nueva que pruebe la primera etapa.

---

## 11. Cuándo una fase está terminada

- [ ] Cada casilla de `pantallas.md` de esa fase está implementada o marcada
      como pendiente, con el motivo.
- [ ] Cada función del inventario que la fase mueve es alcanzable en su capa,
      y el buscador la encuentra.
- [ ] Ninguna función de hoy dejó de existir; si cambió de lugar, el PR dice
      de dónde a dónde.
- [ ] Las reglas duras se cumplen, y no hay columnas nuevas en tablas que ya
      existían.
- [ ] Se hicieron las capturas de 1440 claro y oscuro y de 390, y la
      corrección única.
- [ ] `docs/ESTADO.md` está al día.
- [ ] El PR está abierto, sin mergear, con la lista de funciones movidas y las
      capturas.
