# Archivos por espacio y visor: almacenamiento en Postgres, whitelist, face-images

> Engram #336 · `files/storage` · **snapshot histórico 2026-08-23 — el estado vigente está en [docs/ESTADO.md](../ESTADO.md)**

**Qué**: PDF/Excel/CSV/imágenes (jpg/jpeg/png/webp) por espacio, tabla `space_files` con LargeBinary EN Postgres (el disco de Render es efímero — jamás filesystem). Max 10MB, subida admin-only, lectura cualquier rol. Content-Type SIEMPRE derivado de la extensión, nunca del cliente (fix anti stored-XSS de la auditoría). Listados con defer(data) para no cargar blobs.

**Endpoints**: POST/GET `/api/spaces/{space_id}/files`, GET/DELETE `/api/files/{file_id}` (GET acepta `?token=` para iframes), `GET /api/spaces/by-code/{code}`, `GET /api/spaces/face-images` (última imagen por espacio, declarado en spaces.py ANTES del catch-all `/{space_id}` — nunca registrarlo después o lo traga la ruta paramétrica).

**Frontend**: sección Archivos en el panel del espacio (2D, por cara activa: worker solo lista vía by-code, nunca find-or-create), FileViewerModal (PDF iframe, xlsx vía SheetJS `xlsx` dep, CSV tabla, imágenes img con key={file.id}). Flujo de venta: proveedor manda foto del producto → se sube al espacio → viste la góndola en 3D y se ve desde el dashboard.

**Gotcha API**: los endpoints de lista requieren trailing slash (`/api/spaces/`, `/api/suppliers/`) — sin ella el catch-all de la SPA devuelve 404 HTML.
