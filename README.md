# RECABRA (retail-espacios)

Gestión de espacios comerciales en supermercados: el plano de la sala, lo que
se vende de cada mueble (entero, por partes o por porcentaje de cara), los
contratos con los proveedores y el montaje. Deploy:
retail-espacios.onrender.com (Render, auto-deploy desde `main`).

- **Reglas del proyecto y cómo trabajar:** `CLAUDE.md`.
- **Estado vivo** (reglas duras, arquitectura, setup local, estado por área):
  `docs/ESTADO.md`. Ante cualquier contradicción, manda ESTADO.md y el código.
- **Verificación mínima:** `cd frontend && npx tsc --noEmit` ·
  `cd backend && python -c "import app.main"` · `npm install` requiere
  `--legacy-peer-deps` · las guardas del navegador: `cd frontend && npm run probar`.

---

## Rediseño: vender más y más fácil (en curso, 2026-10-19)

> **Para retomar en otra sesión, este es el punto de partida.** Todo lo que
> sigue está acordado con el dueño del producto; lo que no está acá, se le
> pregunta. Todavía **no hay código** de este rediseño.

### El objetivo, en palabras del dueño

> «La idea final es que todas las nuevas herramientas que hemos agregado le
> sirvan al dueño para poder **VENDER más y más fácil**. Por ejemplo que pueda
> vender los porcentajes de góndola desde VENDER, que pueda vender las puntas,
> que sea más fácil realizar los contratos. Y que los íconos y el diseño sean
> super accurate y estéticos para que el cliente tenga una experiencia
> **premium, minimalista y limpia pero sin sacar información**.»

Y antes: «reorganizar el diseño visual y las herramientas del sistema para que
fuese más estético y funcional […] que visualmente para el usuario sea más fácil
entender el sistema y a su vez sea más estético».

### Decisiones tomadas (2026-10-19)

| Tema | Decisión |
|---|---|
| Alcance | **Tres pantallas: Vender, Supervisar y Plano (editor 2D)**, más la barra de arriba que comparten. Montajes, Editor 3D y ajustes, después, con el mismo estilo. |
| Orden | **Vender primero** (es donde se vende). Después Supervisar y Plano, con lo aprendido. |
| Choques con lo ya decidido | **Manda lo ya decidido**: se copia el diseño de las maquetas, pero se conservan las palabras y las reglas actuales donde chocan (ver «Lo que se respeta»). |
| Íconos | **Sí, en el encabezado de cada tarjeta y de cada cifra**, como en las maquetas. Un solo juego (lucide-react, ya está en el proyecto), mismo grosor y tamaño, cada ícono elegido para lo que representa. |
| Puntas de góndola | Hoy cuesta **todo**: venderlas por entrepaño, venderlas por porcentaje, encontrarlas y tocarlas en el plano, y el precio. Las cuatro cosas entran. |
| Vender un % desde Vender | **Las dos opciones**: «Guardar contrato» (principal) y «Reservar hasta…» (secundario) con la fecha que elija quien vende. |
| Cómo se trabaja | Con **puntos de control**: nada se programa sin que el dueño apruebe el paso anterior (ver «Cómo avanzar»). |

### Las maquetas del dueño

Son tres imágenes hechas con IA a partir de capturas de su sistema en
producción (sede POBLADO, 131 muebles, nombres reales de proveedores). **No
están en el repo** porque llevan datos reales de clientes (las capturas con
datos reales no entran al repo): las tiene el dueño. Si hacen falta, pedíselas.
Son una **dirección visual**, no una especificación: tienen erratas («IUN-12-3»)
y palabras viejas. Lo que muestran:

**Común a las tres.** Fondo papel claro y **tarjetas blancas separadas**, borde
suave, radio grande, mucho aire, **un ícono de línea en cada encabezado**.
- *Barra de la app:* RECABRA · Sede / Montajes / Plano / Editor 3D (la activa
  subrayada) · a la derecha «Sincronizado» con punto verde, el cliente, ajustes
  y el avatar (en el Plano: campana, «Brayan Moreno · Dueño»).
- *Barra de la sede en tres piezas:* [ícono de ubicación · POBLADO ▾ ·
  «7 de 7 · 131 muebles»] · [Vender | Supervisar con contador en pastilla roja,
  la activa subrayada] · [ícono de calendario · «18 oct – 17 nov 2026» ▾]; a la
  derecha la fecha larga y los botones Planilla / Tarifas / Actualizar con ícono.

**Vender.**
- *Piso de POBLADO* (ícono de ubicación, «131 muebles»): el isométrico grande
  con la clave del periodo (Libre todo el periodo 36 · Se libera en el periodo 1
  · Tomado 30 · Resto de la sala 0 · En el contrato 0), botones + / − y
  «Centrar», y la pista con ícono de mouse («Arrastrá para girar · Clic derecho
  para mover · Rueda para acercar»).
- *Contrato* (ícono de documento, pastilla «SIN FIRMAR»): «Elegí el primer
  espacio tocándolo en el plano»; Proveedor (desplegable «Alpina, Nutresa…») y
  Marca (opcional); Desde / Hasta con ícono de calendario; «31 días · 0
  espacios» y «+ Correo, nota y planometría»; «TOTAL DEL CONTRATO»; la pastilla
  de temporada «CUBRE HALLOWEEN»; «Guardar contrato y avisar» (ancho, deshabilitado
  hasta que hay espacios) y «Empezar de nuevo».
- *Cuándo se libera cada espacio* (ícono de reloj): eje de tiempo con la
  temporada como banda (HALLOWEEN), la línea de libres (36 → 37), el marcador
  del día en que se libera algo (2 nov · CRS-01) y «Si arrancás el 2 de nov →
  37 libres».
- *Tarifa de referencia* (ícono de etiqueta, «AL MES»): por tipo de espacio,
  «LIBRES · ENTRAN», la tarifa, y **pastillas con los códigos** de los libres;
  pie «67 espacios comercializables · 36 +1 · 37 al cerrar».

**Supervisar.**
- *Cinco tarjetas de cifras con ícono:* Canon vigente · Sin alquilar (con «al
  mes a tarifa · 36 caras» y «$… por día vacío») · Vence en 30 días (en rojo) ·
  Ocupación (46 %, «31 de 67 caras», barra) · Sin montar.
- *Piso:* como en Vender, con buscador («Filtrar»), la clave de Supervisar y
  **chinchetas sobre los rótulos** del plano.
- *Para revisar* (contador en pastilla): secciones con su total («POR VENCER EN
  30 DÍAS $333.333»), filas con pastilla de días («14d»), y «BAJO TARIFA DE
  REFERENCIA» con pastillas verdes «-100 %», proveedor y «$1 · ref $800 k».
- *Estado por espacio:* buscador, pestañas segmentadas con la activa oscura
  (Todas 67 · Por vencer 1 · Libres 36), el **estado como pastilla** («Por
  vencer» roja, «Activo» verde), el montaje con punto («● Montado»), y **una
  flecha al final de cada fila**.
- *Quién paga el canon:* desplegables de orden («Ordenado por monto») y de
  unidad («al mes»).

**Plano (editor 2D).**
- *Barra lateral «Catálogo»* («Clic para colocar»): familias plegables
  (Góndolas, Displays, Muebles, Refrigeración), cada modelo con ícono, medidas y
  cantidad de modelos («8.9 × 1.8 m · 12 modelos»).
- *Barra de herramientas:* sede, «7 de 7 · 131 muebles», Deshacer, Rehacer,
  Rotar, Eliminar (rojo), Guardado (verde) y los atajos a la derecha.
- *Lienzo:* buscador «Buscar espacio, categoría o proveedor…» y filtros en
  chips (Todos · Libres · Ocupados · Por vencer · Vencidos), + / − / Centrar,
  la grilla.
- *Panel «Mueble seleccionado»* por secciones con ícono: código con lápiz,
  nombre, pastilla «Disponible»; Destino del mueble como **dos tarjetas**
  (Comercializable / No comercializable); Estado del espacio; Sede; Nombre;
  Contratado («Sin contrato activo»); Dimensiones (Ancho / Prof.); Cómo se vende
  como **dos tarjetas** (Entera / Por participación); Observación con contador
  «0/500».
- *Barra inferior:* Vista previa, «131 fixtures», Sede, Atajos, Revisar,
  Renumerar, Etiquetas, Sincronizado, zoom «68 %», pantalla completa.

### Lo que ya se descartó: el PR #83

Un intento hecho con ChatGPT (PR #83, rama `design/ui-ux-apple-clean-2026-10`,
borrador) agregaba **sólo una capa de CSS** (`dashboard-ux.css`) con muchos
`!important`. El dueño lo descartó: **«los resultados eran exactamente
iguales»**. Se midió lado a lado con datos de prueba y además rompía cosas:
- achicaba el plano de Supervisar un tercio (pisaba la regla de que el plano
  mide lo mismo en Vender y en Supervisar: `--alto-plano` en `vender.css`) y le
  quitaba 10 de sus 26 rótulos;
- la tabla dejaba de rodar por dentro: perdía los títulos fijos y dejaba un
  hueco de 1.200 px en blanco al lado;
- la pestaña activa perdía su marca y la barra cambiaba de forma entre modos;
- una docena de reglas no hacían nada (el estilo en línea de React les gana) y
  3 selectores no coincidían con nada;
- el CI pasaba igual: las guardas leen el código, no la pantalla.

**La lección:** el cambio tiene que ser **en los componentes** (markup y estilo
juntos), no una capa encima; y cada pantalla se verifica **con capturas** al
lado de la maqueta, no sólo con las guardas. El PR #83 queda para cerrar.

### Lo que se respeta (las maquetas no lo derogan)

- **Vender la ve el proveedor.** El administrador gira el portátil y se la
  muestra. Nunca: nombres de otros proveedores, lo que paga otro, rankings por
  canon, quién está bajo tarifa, el canon de la sede. Sólo disponibilidad,
  tiempo, el espacio, el contrato de ESE proveedor y la tarifa de referencia.
  `frontend/scripts/probar-vender.mjs` arma la superficie de Vender y lo fija.
- **Delante del proveedor, de una cara por participación:** su % y lo que queda;
  **nunca formas** (ni las suyas), ni nombres ni % de otros. Las zonas (dónde va
  la marca en la cara) se dibujan en Editor 3D → Distribución, sin el proveedor
  delante.
- **Las palabras de la fase 2 de participaciones:** «Disponible en parte»
  (Vender) y «Vendido en parte» (Supervisar), no «Se libera en el periodo» ni
  «Vence dentro» cuando la cara está parcial por participación o por partes.
- **La «Sede» del panel del Plano es de sólo lectura** (la define el plano; un
  mueble con otra sede se desconectaba de sus participaciones).
- **El tema oscuro existe** aunque las maquetas sean claras: se diseña también.
- **El amarillo** (`--signal`) va **sólo en el botón principal** de cada
  pantalla (Fase 10 en ESTADO.md). Claro por defecto.
- **Los criterios del dueño** de «Rediseño de la pantalla principal»
  (ESTADO.md): la forma la manda el dato; pulcro (cada cosa está ahí por algo);
  cerrar trato y revisar, cada uno en su modo; el color se valida (verde y
  naranja se confunden con daltonismo).
- **Voseo** en la interfaz; nunca la palabra «sombra».
- **Las guardas** (`frontend/scripts/probar-*.mjs`, ~36 suites) leen el código
  con expresiones regulares y fijan textos, props y estructura: un rediseño las
  va a romper. Cada una que se toque se reemplaza por otra **igual o más
  estricta**, nunca más débil.
- Sin migraciones: tablas nuevas sí, columnas nuevas en tablas existentes no.

### Primera entrega: Vender

**A. Diseño premium, limpio y sin sacar información.**
La barra de la app y la de la sede como en las maquetas (son compartidas:
Supervisar también las estrena). Tarjetas con ícono para el plano, el contrato,
«Cuándo se libera» y la tarifa. Todo lo que hoy se ve se sigue viendo; cambia
cómo se presenta.

**B. Todo se vende desde Vender, en el mismo contrato.**
- *Entero:* como hoy.
- *Por partes:* puertas, tramos y **entrepaños de punta** (`PUN-02-EN1`). Al
  tocar una punta, el contrato muestra sus repisas para elegir cuáles van, con
  las ocupadas marcadas. (Verificar primero qué de esto ya hace Vender hoy: la
  venta por partes existe desde la fase P.)
- *Por porcentaje (nuevo en Vender):* góndolas **y puntas** que se venden por
  participación. Se toca la cara en el plano y aparece cuánto queda libre en las
  fechas del contrato; se elige el % con botones rápidos (10 · 25 · 50 · «todo
  lo que queda»); el precio sale de la tarifa por ese % (editable); se suma al
  contrato como una línea («GON-02 · cara A · 30 %»). Al guardar se crean juntos
  los contratos enteros y los términos de participación
  (`POST /api/participaciones/` con `sede, espacio, tipo, proveedor, marca,
  puntos_basicos, desde, hasta` y `valor_mensual` o `caduca`). Si alguien tomó
  ese % mientras tanto (409 de capacidad), se dice claro qué pasó y qué queda.
- *Firmar o reservar:* «Guardar contrato» (principal) o «Reservar hasta…»
  (secundario, reserva provisional con la caducidad que elija quien vende; sin
  valor por defecto).

**C. Las puntas, fáciles de encontrar:** más área para tocarlas en el plano; se
resaltan al pasar por «Punta de góndola» en la tarifa; sus pastillas de código
siguen sumándolas al contrato con un clic.

**D. El precio sale solo y se puede editar:** entero = la tarifa; entrepaño = la
tarifa repartida entre las repisas; porcentaje = la tarifa por ese %.
*Pregunta abierta al dueño:* si tiene otra regla de precio para entrepaños o
porcentajes.

**E. Contrato más fácil:** proveedor con buscador; fechas con atajos (1 mes,
3 meses, la temporada); el total siempre a la vista; «Renovar» desde Supervisar
abre Vender con el contrato armado.

### Cómo avanzar (con un punto de control en cada paso)

1. **Hoja de íconos y piezas** (sin agentes): tarjeta con encabezado e ícono,
   pastilla, control segmentado, botones, campos con ícono, cifra, y el ícono
   elegido para cada cosa de las tres pantallas, en claro y oscuro, con los
   tokens de `frontend/src/tema.css`. Se publica como página para que el dueño
   la apruebe. **← acá se retoma.**
2. **El flujo de venta en dibujos:** cómo se vende un % y cómo se vende una
   punta por entrepaño, paso a paso, para validarlo antes de programar.
3. **Implementación de Vender:** plan consolidado (agentes que leen el código
   y mapean cada elemento), implementación completa, **una sola ronda de
   pruebas** (tsc, `npm run probar`, build, pytest si se toca el servidor,
   capturas antes/después a 1440, 1100 y 390 px en claro y oscuro **al lado de
   la maqueta**, revisión de privacidad) y **una sola corrección** (así lo pidió
   el dueño: no hacer nada dos veces). Un PR que no se fusiona sin su OK.
4. Después, **Supervisar** y **Plano** con lo aprendido.

### Dónde está cada cosa en el código

- Barra de la app: `frontend/src/pages/Dashboard.tsx` (`Topbar`, `QuienSoy`);
  `frontend/src/components/SyncStatus/`.
- Pantalla de sede (barra de la sede, Supervisar, la tarifa de referencia):
  `frontend/src/pages/DashboardView.tsx` (≈6.000 líneas: `Card`/`CardHeader`,
  `SpacesTable`, `FixtureDetailCard`, «Tarifa de referencia» ~l. 5225).
- Vender: `frontend/src/components/Contrato/ModoVender.tsx`, `Contrato.tsx`,
  `VisorDeVenta.tsx`; «Cuándo se libera»: `frontend/src/components/Libera/`;
  estilos: `frontend/src/vender.css` (incluye la hoja compartida y
  `--alto-plano`).
- Tokens y temas: `frontend/src/tema.css` (claro en `:root`, oscuro en
  `html[data-tema="oscuro"]`; radios `--r-*`, escala `--t-*`, la regla de uso de
  `--libre/--entra/--ocupado`); `frontend/src/index.css`.
- Partes (códigos `-PU`, `-TR`, `-EN`, `-BI`, `-FO`): `frontend/src/utils/partes.ts`.
- Participaciones: `backend/app/routers/participaciones.py` (alta en
  `POST /api/participaciones/`), `frontend/src/api/participaciones.ts`,
  `frontend/src/utils/participaciones.ts` (gemela de `reglas_participacion.py`).
- Plano 2D: `frontend/src/components/FloorPlan2D/FloorPlan2D.tsx`
  (`AssignmentPanel`); catálogo: `frontend/src/catalogo/muebles.json`.
- Maquetas anteriores (septiembre, datos inventados): `docs/maquetas/`
  (`elegida-vender.html` es la base del Vender actual).

### Cómo verlo con datos de prueba

Backend con una base SQLite descartable y una tienda sembrada por la API:
`cd backend && DATABASE_URL=sqlite:////dev/shm/x/base.db JWT_SECRET=dev
LOGIN_LEGADO=1 ADMIN_PASSWORD=admin123 WORKER_PASSWORD=galerias python -m
uvicorn app.main:app --port 8200`; login con `POST /api/auth/login
{"password": "admin123", "cliente": "galerias"}`; sembrar con `PUT
/api/layout/{sede}` (muebles del catálogo, sin superponerse), contratos y
`POST /api/participaciones/`. Vite con proxy `/api` → 8200. Capturas con
Playwright (Chromium en `/opt/pw-browsers`, con `--use-angle=swiftshader` para el
3D) inyectando la sesión en `localStorage["retail-auth-v1"]`. Nombres de
proveedores siempre inventados.
