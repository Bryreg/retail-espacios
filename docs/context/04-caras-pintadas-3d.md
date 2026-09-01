# Caras pintadas 3D: la solución tras 3 intentos y el gotcha de sub-paneles

> Engram #335 · `3d/face-painting` (decisión) · **snapshot histórico 2026-08-23 — el estado vigente está en [docs/ESTADO.md](../ESTADO.md)**

**Qué**: en StoreEditor3D los productos NO son geometría posicionada — se pintan COMO MATERIAL de la cara del mesh existente (array de 6 materiales en BoxGeometry: front = -Z índice 5 = Cara A, +Z índice 4 = Cara B en dobles). Prioridad de textura: foto del proveedor (subida en Archivos del espacio, resuelta vía `GET /spaces/face-images` + `fileUrl` con ?token=) > patrón canvas de categoría (keywords ES: papas→snacks, bebida→bebidas, etc.) > color plano.

**Por qué así**: DOS intentos previos con geometría posicionada fallaron con el mismo síntoma (productos flotando/desbordando): InstancedMesh de productos 3D y luego strip planes por repisa. Lección: cualquier geometría nueva debe replicar la matemática de colocación y siempre se desalinea; pintado sobre el mesh existente hereda todo transform — imposible que flote.

**Planograma**: la foto se tilea una FILA POR HUECO DE REPISA (no póster estirado), columnas según aspect real del producto, bottom-anchored sobre cada tabla, compuesto en canvas offscreen. **Gotcha clave**: 4 de 5 tipos pintables pintan SUB-panel (punta sin cabezal, mueble sin zócalo, nevera sin compresor) — `getPanelShelfSpan(type,w,h)` espeja la matemática de tablas de cada mesh (comentarios "keep in sync" en cada mesh). Caches GPU acotadas (MAX_PHOTO_TEX=64, LRU con dispose). Es LA herramienta de venta: mostrar al proveedor su marca en su góndola.
