# Fase 4b — Consola de Plataforma: diseño de consultoría y presentación

## Contexto y objetivo

La consola `/plataforma` ya funciona (métricas correctas, K=3, red team pasado).
Este pase la eleva a **grado consultoría**: el operador no solo mira el negocio
de cada supermercado cliente, sino que la presentación debe **sostener una
asesoría** — que un número lleve a una recomendación. Es la base de un producto
de valor agregado ("asesorías") que RECABRA puede vender a sus clientes.

NO se tocan fórmulas, agregación ni la frontera de privacidad (K=3, saneo,
solo-agregados, bitácora) — eso quedó verificado por el contador y el red team.
Este pase es **diseño + presentación de datos**, más un **roadmap** honesto de
qué métricas de asesoría se pueden recopilar hoy y cuáles necesitan backend.

## Alcance

### 1. Sistema visual propio de back-office (Diseñador)
- Identidad coherente con RECABRA pero con carácter de **consola de operación /
  BI**, distinta de la vista de sede del cliente. Usa las skills de diseño del
  repo (`design-system` con sus 3 capas de tokens, `brand`, `ui-styling`,
  `ui-ux-pro-max`) y los tokens/CSS vars existentes — cero colores hardcodeados.
- Jerarquía: el número por el que el dueño abre la consola, grande y primero.
- Estados completos: hover, focus, vacío, error, y **claro + oscuro** parejos.
- Densidad de tablero: legible con 1 cliente y con 30.

### 2. Presentación de datos grado asesoría (Analista — agente-datos)
- Cada métrica presentada según la forma que le corresponde (barras=comparación
  con eje desde cero, tile=KPI que decide, tabla=lookup exacto). Nada de tortas.
- **Contexto que habilita la recomendación**: donde el dato lo permita, mostrar
  no solo el valor sino su lectura — p. ej. ocupación por cliente ordenada de
  menor a mayor (el que necesita asesoría primero), el spread entre canon
  cobrado y tarifa de referencia (oportunidad de precio), concentración de
  proveedores (riesgo). SIN inventar datos ni violar K=3.
- Comparabilidad estricta (mismos redondeos, escalas, decimales). Vacíos
  honestos ("sin contratos" ≠ "$0"). Color con significado, accesibilidad de
  dicromacia ya auditada del repo, nunca color como única señal.
- Hover/tooltip en los gráficos (una consola HTML es interactiva).

### 3. Roadmap de asesoría (Analista, en su output — NO es código)
Lista priorizada de vistas de asesoría con su factibilidad:
- **Computable HOY** con el endpoint actual (marcar cuáles y cómo presentarlas).
- **Necesita backend** (marcar y por qué): p. ej. **tendencia temporal** —
  el endpoint es una foto del mes actual, el sistema NO guarda snapshots
  históricos; una serie de tiempo necesitaría persistir métricas por mes
  (tabla nueva del registro, sin migración). Estimar el gancho de valor de
  cada una para el producto "asesorías".

## Guardrails
- NO tocar `plataforma_metricas.py` (fórmulas), la supresión K=3, el saneo de
  proveedores, ni la bitácora. Si una métrica parece mal, se reporta, no se
  "arregla" en la vista.
- Territorio: `frontend/src/**` (Plataforma.tsx, componentes, tokens si hace
  falta un token nuevo semántico). El backend NO se toca en este pase salvo
  que el roadmap justifique un agregado ya computable y trivial — y en ese
  caso, con test.
- SIN librería de charts: SVG/CSS propio con los tokens del repo.
- tsc + vite build limpios; la consola carga con la CSP de Fase 3 (Firebase).
- El login legado, la redacción por rol y el JWT no cambian.

## Verificación
- [ ] Captura de la consola en CLARO y en OSCURO, revisadas
- [ ] Cada gráfico responde una pregunta de negocio nombrada (lista en el output)
- [ ] Ocupación como magnitud (secuencial), estados en la paleta de estado
- [ ] K=3 y "sin datos" distinguibles a la vista
- [ ] Roadmap de asesoría entregado con factibilidad y valor
- [ ] tsc + build limpios; suite backend sigue verde (no se tocó)
