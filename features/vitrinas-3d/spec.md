# Vitrinas 3D con Tarifas Dinámicas

## Objetivo
Ampliar el editor 3D actual para mostrar tarifas de referencia y rentabilidad por temporada.

## Entregables
- **Frontend**: Mapa 3D + overlay de semáforo (disponible/contratado/vencido/se libera)
- **Backend**: GET /spaces/{code}/rates → tarifa referencia + occupancy
- **Contador**: Validar P&L por sede/temporada
- **Legal**: Auditoría de qué precios ve cada rol (admin vs worker)
- **Analytics**: Dashboard: ocupación real vs esperada

## Verificación
- [ ] Mapa sincroniza con BD en tiempo real
- [ ] Tarifas de referencia ocultas a worker
- [ ] P&L cuadra vs ingresos reales
- [ ] Ocupación por período reflejada en colores
