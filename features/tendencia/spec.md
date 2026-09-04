# Fase 5 — Tendencia temporal: histórico de métricas para asesoría

## Objetivo

Que la consola /plataforma pueda contestar "¿estamos mejorando o empeorando?"
— la primera pregunta de una asesoría recurrente y hoy imposible: el endpoint
de métricas es una foto del mes elegido, el sistema no guarda historia. Esta
fase persiste un snapshot mensual del agregado por cliente y consolidado, y
expone una serie de tiempo para graficar la evolución.

## Decisiones de diseño

1. **Tabla NUEVA del registro (sin migración)**: `snapshot_metricas`
   (cliente_slug, periodo "YYYY-MM", y los agregados CRUDOS del período —
   contratos_activos, espacios_comercializables, ocupadas, canon_total,
   usuarios, y un JSON con el top de proveedores—, capturado_en;
   UNIQUE(cliente_slug, periodo)). Guarda CRUDOS, no los públicos: la
   supresión K=3 y el saneo se aplican AL LEER, igual que en el endpoint
   actual — así la regla de privacidad vive en un solo lugar y el histórico
   nunca queda "congelado" con una supresión vieja.
2. **Poblado híbrido, sin job nuevo**:
   - **Write-through**: cada vez que se computa `getMetricasPlataforma(periodo)`,
     se hace upsert del snapshot de ese período por cliente. El mes en curso se
     actualiza en cada vista (converge al valor final al cerrar el mes); un mes
     pasado se congela la primera vez que alguien lo mira.
   - **Cierre automático**: el ciclo de mantenimiento existente
     (`_run_lease_maintenance`, cada 12 h) snapshotea el MES YA CERRADO si aún
     no tiene fila — así la serie no depende de que alguien haya abierto la
     consola ese mes. Reusa el cálculo de `plataforma_metricas`, no lo duplica.
   - El snapshot es idempotente y read-only sobre las bases de cliente (mismo
     patrón tolerante a fallos: una base rota no frena el resto).
3. **Endpoint NUEVO**: `GET /api/plataforma/tendencia?cliente=<slug|__consolidado__>&meses=N`
   (default 12, máx 24) → serie de los últimos N meses con los agregados
   PÚBLICOS por mes (K=3 y saneo aplicados por mes). require_operador,
   anotado en la bitácora del registro. Ruta LITERAL antes de las paramétricas.
   El consolidado se calcula ponderado (Σ/Σ), nunca promedio de promedios.
4. **Frontend**: gráfico de LÍNEA (tendencia = cambio en el tiempo, la forma
   correcta) en la consola — ocupación e ingreso a lo largo de los meses, para
   el consolidado y por cliente (selector). Reusa las primitivas y tokens
   --con-* de la consola BI; SIN librería de charts (SVG propio). Marca visible
   del mes en curso como "parcial". Con < 2 meses de historia, estado vacío
   honesto ("hace falta más de un mes para ver tendencia"), no una línea de un
   punto.
5. **Valor de asesoría**: donde el dato lo permita, la lectura accionable —
   p. ej. "ocupación bajó 3 meses seguidos" o "el ingreso del consolidado
   creció X% vs el mes anterior". El analista (agente-datos) define qué
   deltas mostrar sin inventar (sin comparar contra meses que no existen).

## Guardrails
- SIN MIGRACIONES: solo la tabla nueva del registro. Cero columnas en tablas
  existentes.
- NO duplicar las fórmulas de `plataforma_metricas.py`: el snapshot y la
  tendencia reusan su cálculo. La supresión K=3 y el saneo se aplican AL LEER.
- Frontera del operador intacta: tendencia es solo-lectura, agregada, con
  bitácora; nunca filas de negocio ni datos de usuarios finales.
- El login legado, la redacción por rol y el JWT no cambian.
- Rutas literales antes de paramétricas. Tolerancia a fallos por cliente.
- SIN librería de charts. Claro + oscuro. Bajo la CSP de Fase 3.

## Verificación
- [ ] Tres meses sembrados por cliente → la tendencia devuelve la serie correcta, ponderada en el consolidado
- [ ] El mes en curso se marca parcial; con 1 solo mes, estado vacío honesto
- [ ] K=3 y saneo aplicados por mes en la serie (histórico de un cliente con 2 contratos: ingreso suprimido ese mes)
- [ ] Write-through: abrir métricas de un período deja/actualiza su snapshot
- [ ] Cierre automático: el mes cerrado se snapshotea sin abrir la consola
- [ ] Endpoint operator-only (no-operador 403, legado 403) + bitácora
- [ ] Gráfico de línea en claro y oscuro, captura revisada
- [ ] Suite completa verde DOS veces + tsc/build limpios
