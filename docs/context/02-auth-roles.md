# Auth por roles: JWT, claves compartidas y redacción server-side de precios

> Engram #333 · `auth/roles` · **snapshot histórico 2026-08-23 — el estado vigente está en [docs/ESTADO.md](../ESTADO.md)**

**Qué**: Login con clave compartida por rol — admin (edita todo, ve precios) y worker/trabajador (SOLO ve el Dashboard: negociar libres, controlar ocupados, geolocalizar productos; sin precios). Claves en tabla `app_config` (defaults `admin123`/`galerias` — se cambian desde el modal Configuración, engranaje admin). JWT HS256 (PyJWT) 12h, `app/auth.py`.

**Enforcement real (no solo UI)**: todas las rutas /api requieren token salvo /auth/login y /health; mutaciones requieren admin; los GET redactan precios server-side para worker (`monthly_rent: null` en spaces, `negotiatedValue` eliminado del JSON de layout incluyendo faceB y slots, revenue 0 en dashboard). Rate limit login: 10 intentos/15min por IP en memoria. `GET /api/files/{id}` acepta `?token=` (iframes no mandan headers).

**JWT_SECRET**: fail-fast en producción (RENDER env o DATABASE_URL postgres) si no está seteado; en Render se agregó MANUALMENTE en Environment (el `generateValue` de render.yaml no aplica porque el servicio no es Blueprint). Frontend: `authStore` zustand persist, interceptor Bearer en `api/client.ts`, 401 → logout → Login.

**Por qué**: auditoría 4R encontró que los precios se ocultaban solo en UI — un worker con curl veía todo. La redacción es del backend.
