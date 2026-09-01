# Dashboard y editor 2D: diseño denso, búsqueda/filtros y guías inteligentes

> Engram #337 · `frontend/dashboard-2d` · **snapshot histórico 2026-08-23 — el estado vigente está en [docs/ESTADO.md](../ESTADO.md)**

**Dashboard** (DashboardView.tsx): mapa isométrico pseudo-3D como HÉROE (prismas extruidos por estado, nomenclatura flotante, clic → panel de detalle con contrato/archivos por cara). Debajo: tira compacta de KPIs (Espacios/Libres/Ocupados+%/Reserv-Mant condicional/Vencidos/Por vencer/Ingreso admin-only), panel "Atención" unificado (vencidos rojo, por vencer ámbar, sin contrato; vacío = una línea ✓), Top proveedores rankeado admin-only, tabla "Estado por espacio" densa (sticky header, chips de filtro + búsqueda, espacios libres con datos viejos = historial gris "venció hace Nd", no alarma). TODO el conteo pasa por `facesOf()` + `displayStatus()` por cara rentable (dobles ×2) — una sola fuente de verdad para KPIs, Atención, chips del mapa y tabla.

**Editor 2D** (FloorPlan2D.tsx): góndola doble partida por eje largo con clic por mitad y tabs Cara A/B en el panel; nomenclatura = pill flotante FUERA de la figura a tamaño constante de pantalla (toggle "Etiquetas"); barra flotante de búsqueda + chips de estado sobre el canvas (resalta matches con borde accent, atenúa el resto a 0.15, ambas caras); guías inteligentes tipo PowerPoint al arrastrar/redimensionar (líneas magenta #E11D8F punteadas cuando bordes o CENTROS se alinean, máx 4, derivadas en render sin setState extra) + snap magnético de centros agregado a snapToEdges.

**Buscador unificado**: `normalizeText` NFD sin tildes, matchea code/label/nomenclatura/supplierName/brandCategory en ambas caras — mismo criterio en mapa, plano y tabla.
