# Galerías — estado del proyecto

Documento de referencia para retomar el trabajo sin tener que reconstruir el contexto.
Última actualización: agosto 2026 (`main` en `c9edf93`).

Gestión de espacios comerciales en supermercados: se dibuja el plano de cada sede, se
marca qué muebles se pueden alquilar y se les asignan contratos de proveedores.

---

## Cómo corre

| | |
|---|---|
| **Producción** | [retail-espacios.onrender.com](https://retail-espacios.onrender.com) — Render, auto-deploy desde `main` |
| **Backend** | FastAPI + SQLAlchemy 2 + Postgres (`backend/`) |
| **Frontend** | React 18 + TS + Vite + Three.js (`@react-three/fiber@8`) + Tailwind + CSS vars (`frontend/`) |
| **Tipografía** | Geist / Geist Mono desde Google Fonts |
| **Roles** | `admin` y `worker` (JWT). Los precios se redactan server-side para worker, que además solo ve el Dashboard |

Sedes reales: **NAVE**, **POBLADO**, **ciudad jardin**. `TERRON`, `CENTRO`, `NORTE` y
`SUR` son las que la app trae por defecto.

### Levantar el entorno local

```bash
# backend
cd backend && DATABASE_URL="sqlite:///./dev.db" JWT_SECRET=dev uvicorn app.main:app --port 8000

# frontend
cd frontend && npm install --legacy-peer-deps && npm run dev
```

Para que dos máquinas compartan datos en desarrollo, creá `frontend/.env.local`:

```
VITE_API_TARGET=https://retail-espacios.onrender.com
```

Sin eso, cada máquina habla con su propio backend y su propia base — y ninguna
sincronización puede funcionar entre ellas.

---

## Reglas duras

Estas no son preferencias. Romperlas rompe producción.

**Sin migraciones.** El esquema se crea con `Base.metadata.create_all()`. Eso crea
*tablas* nuevas pero **no agrega columnas a tablas existentes**: una columna nueva en
`spaces` o `layout_snapshots` simplemente no existiría en la base ya desplegada. Cuando
hizo falta guardar algo nuevo, se usó la tabla `app_config` (clave/valor) o el propio
JSON del layout.

**Modelo de datos dual.** Los datos comerciales viven en dos lados a la vez:

- Denormalizados dentro de cada fixture, en el JSON por sede de `layout_snapshots`
  (tipo `UnifiedFixture` en `frontend/src/types/fixtures.ts`).
- Normalizados en `spaces` / `space_leases` / `suppliers`, pero **solo** cuando se pulsa
  "Guardar contrato".

El código de espacio es `"SEDE-CODE"` en mayúsculas. La cara B de una góndola doble usa
sufijo `-B`; los campos top-level del fixture son la Cara A y `fixture.faceB` es la B
(helper `isDoubleGondola`).

**El 3D pinta, no construye.** La foto del proveedor se aplica *como material* de la cara
del mesh, tileada como planograma y alineada a las tablas reales vía `getPanelShelfSpan`.
Nunca crear geometría nueva posicionada para esto: se intentó dos veces y falló las dos.

**Orden de rutas en FastAPI.** Las rutas literales van declaradas **antes** de las
paramétricas y del catch-all, o éste se las traga. Aplica en `layout.py`
(`/revisions`, `/settings`) y en `spaces.py` (`/face-images`).

**Los espejos comparan identidad, no booleanos.** El plano 2D y el editor 3D mantienen
una copia local del store. Los guards que evitan el eco comparan la *identidad del array*,
no una bandera: un booleano lo consume la pasada equivocada del ciclo de montaje, y eso
causó una pérdida de datos real (ver más abajo).

---

## Qué está hecho

### Sincronización entre computadores

El síntoma era "lo que hago acá no se ve allá". Eran varios defectos encadenados, todos
corregidos:

- `syncFromServer()` corría al cargar el módulo, **antes del login**: sin token daba 401,
  el interceptor borraba la sesión y nunca se reintentaba. Ahora arranca desde `App.tsx`
  con la sesión activa.
- El merge decidía por **cantidad** de fixtures, así que las eliminaciones nunca
  viajaban. Ahora manda la revisión (`updated_at`).
- Un único timer de guardado global para todas las sedes; ahora hay uno por sede.
- Sin revalidación tras la carga inicial. Hay polling de revisiones cada 20 s y refetch al
  recuperar el foco, al mostrar la pestaña y al reconectar.
- La lista de sedes y las etiquetas del catálogo vivían solo en `localStorage`. Ahora se
  comparten server-side y la lista visible es la **unión** de la configurada y de toda
  sede con snapshot, para que ninguna con datos quede oculta.
- Los fallos eran silenciosos mientras la UI decía "✓ Sincronizado". Hay un indicador real
  en el header y resolución explícita de conflictos.

Endpoints nuevos: `GET /layout/revisions` (polling barato), `GET/PUT /layout/settings`,
`DELETE /layout/{sede}`. El `PUT` acepta `base_updated_at` y responde 409 si otro equipo
guardó en el medio.

### Muebles comercializables

Campo opcional `rentable` en `UnifiedFixture`, con semántica retrocompatible: **ausente
significa comercializable**, solo un `false` explícito marca infraestructura (helper
`isRentable`). Columnas, cajas y zonas libres nacen como no comercializables.

Un mueble no comercializable no admite contrato (también bloqueado server-side con 409),
queda fuera de todas las métricas de disponibilidad y se dibuja en gris pizarra.

### Dashboard

KPIs arriba de todo, mapa isométrico y columna de "Atención" lado a lado, un solo buscador
para toda la página, y vista propia para el rol worker (arranca por espacios disponibles y
lo que vence, sin nada de dinero).

Al hacer clic en un mueble se abre un popover anclado a él; "Ver todo" pasa el detalle
completo a la columna derecha. Los campos vacíos no se dibujan.

### Paleta

Un solo lenguaje de color en Dashboard, plano 2D y editor 3D:

| Estado | Color |
|---|---|
| Libre | verde `#4CC38A` |
| Ocupado | violeta `#8B5CF6` |
| Reservado | ámbar `#F0B429` |
| No comercializable | pizarra `#94A3B8` |

El rojo queda reservado para lo que está mal (un contrato vencido).

### Bugs preexistentes corregidos

Los tres se encontraron levantando la app contra datos sembrados, no leyendo código:

- **El plano 2D subía un layout vacío** ~16 ms después de montar, antes de que llegara la
  respuesta del servidor. Desde un navegador con `localStorage` limpio, abrir la app
  **vaciaba la sede en el servidor**. Es la causa de fondo del problema de sincronización
  original: no es que los cambios no viajaran, es que el otro equipo los borraba al entrar.
- **El editor 3D borraba `faceB` y `nomenclatura`** de todos los fixtures con solo abrirse,
  y subía la pérdida.
- **El proxy de Vite quitaba el prefijo `/api`** que el backend sí monta, así que
  `npm run dev` nunca pudo hablar con un backend local.

---

## Pendiente urgente: datos de TERRON

TERRON tenía datos reales y **quedó vacía en el servidor**, vaciada por el bug del layout
vacío antes de que se desplegara el arreglo.

Procedimiento de recuperación, en orden:

1. **No abrir la app** en ningún equipo que pueda conservar la copia: al arrancar adopta la
   del servidor y sobrescribe la local.
2. En cada equipo, entrar a `https://retail-espacios.onrender.com/api/health` — esa URL
   devuelve JSON y **no carga la aplicación**, así que no dispara sincronización. Abrir la
   consola (F12) y correr:

   ```js
   const s = JSON.parse(localStorage['retail-fixtures-v1']).state;
   Object.fromEntries(Object.entries(s.fixturesBySede).map(([k, v]) => [k, v.length]))
   ```

3. Si TERRON aparece con fixtures, copiar la copia completa con
   `copy(localStorage['retail-fixtures-v1'])` y reconstruir la sede desde ahí.
4. Si ningún navegador la conserva, la vía es un **backup de la base** en Render. El botón
   *Rollback* del servicio web **no sirve**: revierte el código, no los datos.

---

## Backlog

Ordenado por impacto sobre esfuerzo. Fundamentado en cómo la industria gestiona estos
espacios: las puntas de góndola ocupan menos del 5 % del piso pero mueven cerca del 30 %
de las ventas de la categoría, con aumentos medidos de 150–400 % frente al anaquel normal.

1. **Tarifa de referencia** por tipo de mueble y sede. Hoy "valor negociado" es un campo
   libre sin referencia; si una punta rinde 3–4× más que una góndola, debería costar
   distinto y de forma consistente. Permite ver quién paga por debajo.
2. **$/m² por mueble** y ranking de rendimiento. Hoy solo se mide ingreso total. Los datos
   ya están (`area_m2` y el valor): falta la cuenta.
3. **Calendario de disponibilidad**. El backend ya rechaza solapamientos con 409, pero no
   se puede responder "¿qué tengo libre en noviembre?".
4. **Verificación de ejecución**: convertir las fotos por espacio en auditoría, con fecha,
   autor y estado montado/no montado. Una foto sin metadatos no es evidencia.
5. **Estado de renovación** (en negociación / renovado / no renueva) para que "por vencer"
   sea un embudo y no solo una alarma.
6. **Histórico por espacio**: los contratos viejos ya están en `space_leases`, la interfaz
   no los muestra.

No perseguir: pantallas digitales, sensores de impresiones y compra programática. Tienen
sentido con cientos de tiendas y un equipo comercial dedicado.

---

## Gotchas

- `npm install` requiere `--legacy-peer-deps`.
- Las rutas de lista llevan barra final: `/api/spaces/`, `/api/layout/`.
- `JWT_SECRET` es una variable de entorno manual en Render, no viene del Blueprint.
- El login tiene rate limit: 10 intentos por IP cada 15 minutos, en memoria. Reiniciar el
  backend lo limpia (útil al automatizar pruebas).
- `.github/workflows/deploy.yml` despliega **por SSH a un VPS, no a Render**, y falla desde
  junio con `Error: missing server host` (el secret `VPS_HOST` está vacío). Sale en rojo en
  cada merge sin afectar a Render. Queda decidir si borrarlo o restringirlo a
  `workflow_dispatch`.
- No hay CI en pull requests: el único workflow corre al pushear a `main`.
- `nginx/retail.conf` es para el despliegue en VPS, no para Render. Si ese VPS se reactiva,
  hay que copiar el archivo al host a mano — el workflow no lo despliega.

---

## Cómo probar de verdad

Los tres bugs peores aparecieron levantando la aplicación y mirándola, no leyendo el
código. Vale la pena el rato que toma:

1. Sembrar datos realistas en una base SQLite local.
2. Levantar backend (`:8000`) y Vite (`:5173`).
3. Conducir el navegador con Playwright y capturar. Chromium ya está instalado en
   `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.

Para la sincronización, la prueba que importa es la de **dos clientes**: sembrar el
servidor, simular dos estaciones y verificar que las altas *y las bajas* viajan en ambos
sentidos, que un conflicto no pisa el trabajo del otro, y que una respuesta vacía del
servidor no borra la copia local.
