# ENTREGA — Pase de diseño de la consola `/plataforma` (Fase 4b)

Cierre del pase de diseño sobre la consola de plataforma de RECABRA. Dos fases
encadenadas: **A (Diseñador BI)** fijó el sistema visual y las primitivas; **B
(Analista de presentación)** puso el encuadre de negocio encima. Ningún cambio
de backend, de fórmulas, de endpoints, de K=3, de bitácora ni de login/JWT. Todo
el trabajo vive en `frontend/src/**`.

**Estado de verificación:** `npx tsc --noEmit` limpio · `npm run build` limpio
(único warning de chunk >500kB, pre-existente de Three.js) · `import app.main`
del backend OK · backend intacto por construcción (el working tree del pase solo
toca `index.css` y `Plataforma.tsx`, más archivos nuevos untracked). Capturas
claro y oscuro (1440×1055) generadas y verificadas. **Sin commit ni push.**

---

## 1. Qué cambió en la presentación y por qué

### Identidad visual propia de la consola (Fase A)
La consola dejó de heredar el look de la vista de sede (tinta sobre papel
blanco) y ganó una identidad de **back-office / BI**: ground más profundo para
que los paneles floten como instrumentos, un **acento de operación azul-pizarra**
(`--con-accent`) que no es ninguno de los tres estados, y **tema claro/oscuro
parejo** con toggle en el encabezado. El tema se persiste bajo
`recabra-consola-tema` (es preferencia de UI, no dato de cliente ni métrica, así
que no roza el guardrail de localStorage).

### Jerarquía: un número que manda
El **Ingreso contratado del mes** consolidado pasó a ser KPI *hero* (27px, peso
900, primero, con borde-acento): es el número por el que el dueño abre la
consola. Los otros tres KPIs (clientes activos, ocupación media, canon promedio)
lo sostienen a 17px. Un solo nivel de énfasis por tarjeta.

### El error de color, corregido
La consola pintaba la **ocupación con el verde de estado** (`--libre`). Eso es
usar un color de estado para una magnitud. Ahora:
- **Ocupación y cualquier %** = magnitud secuencial, un solo matiz azul, la
  longitud codifica el valor (`--con-mag-*`).
- **Conteos** (proveedores) = magnitud en grafito, para separar de un vistazo
  "cuántos contratos" de "qué %".
- **Estado de cuenta** = la terna reservada (activo neutro / ámbar / rojo),
  siempre **punto + palabra**: el color acompaña, nunca es la única señal.

### K=3 vs. sin-dato vs. 0 real: los tres distinguibles a la vista
- **0 real** → `0`/`0%` en tinta plena.
- **K=3 suprimido** → ícono `EyeOff` + `‹3` + tooltip de la regla; barra con
  rayado diagonal.
- **Sin dato** → guion `—` apagado + tooltip; fila sin barra con leyenda.

### Primitivas reutilizables (Fase A)
Se extrajo un archivo nuevo `components/plataforma/consola.tsx` con primitivas
presentacionales limpias: `Panel`, `KpiTile` (normal/hero), `Barras`+`BarraFila`
(eje desde cero, tono magnitud/conteo, estado normal/suprimido/sindato),
`EstadoPill`, `Suprimido`, `SinDato`, `EstadoVacio`, `EstadoError`, la tabla de
densidad (`TablaScroll`/`TablaHead`/`Fila`) y `TemaToggle`. `Plataforma.tsx` se
reescribió para consumirlas — comportamiento de negocio idéntico. Estados
completos por primitiva: hover, foco de teclado visible, vacío, error, claro +
oscuro. Íconos por SVG (lucide-react, ya bundleado), cero emojis, cero CDNs:
carga bajo la CSP de Fase 3.

### Encuadre de negocio (Fase B)
El Analista puso la lectura encima de las primitivas, tocando **solo**
`Plataforma.tsx`:
- **Ocupación por cliente reordenada de menor a mayor** — "el que necesita
  asesoría primero" abre el gráfico, no cierra. Además, los clientes con
  ocupación `null` **ya no se ocultan**: aparecen como barra "sin dato" al final,
  porque un cliente sin contratos activos es el caso más urgente, no el que hay
  que esconder.
- **Top proveedores** con subtítulo que calcula y nombra la concentración real
  ("{líder} concentra X% de los contratos entre los 5 principales"). Se nombra
  explícito "entre los 5 principales" porque el JSON solo trae el top-5: un "% de
  la cartera completa" sería dato inventado.
- **Contexto honesto en los KPIs**: "Clientes activos" muestra el total del
  registro (cuánto libro está fuera de servicio); "Ocupación media" ancla el %
  a la escala absoluta (N espacios en M sedes) — un 44% sobre 12 espacios y sobre
  400 son negocios distintos. Estos usan campos del JSON que estaban sin
  superficie (`sedes_con_plano`, `espacios_comercializables`, `clientes_total`),
  sin inventar métricas.
- **Tooltips de contenido** por barra y `usuarios_con_cuenta` sumado al tooltip
  de "Últ. acceso" (adopción real), sin ensanchar una tabla que debe seguir
  legible con 30 filas.

Todo lo agregado respeta la comparabilidad estricta: mismo redondeo
(`toFixed(1)`), misma fuente monoespaciada, cero colores nuevos (solo tokens
`--con-*` ya definidos).

---

## 2. ROADMAP DE ASESORÍAS (consolidado)

Qué vistas se pueden dar hoy con el endpoint actual y cuáles necesitan trabajo de
backend, cada una con su valor para el producto de consultoría.

### Se puede dar HOY (con `/plataforma/metricas` tal como está)

| Vista | Estado | Valor para la consultoría |
|---|---|---|
| **Ranking "a quién llamar primero"** (ocupación ascendente + sin-dato visible) | ✅ Entregado | Vista de apertura de cualquier sesión de asesoría. Convierte el panel de "mirar números" a "decidir con quién hablar hoy". |
| **Riesgo de concentración de proveedores** (top-5, con % del líder) | ✅ Entregado | Habilita la recomendación "diversificá tus contratos con {proveedor}" sin depender de un dato nuevo. |
| **Salud de cartera** (activos vs. total del registro) | ✅ Entregado | Cuantifica cuánto negocio está fuera de servicio ahora mismo. Abre la conversación de reactivación. |
| **Cohortes de adopción** (`usuarios_con_cuenta` + `ultimo_acceso` por cliente, en panel propio) | ⏳ Computable hoy, aún NO como panel dedicado | Detecta cuentas "fantasma": cliente comercialmente activo pero nadie entra a mirar la plataforma — el disparador clásico de una cancelación silenciosa. Buen candidato para la próxima iteración de este mismo pase (los campos ya están; solo faltó por prudencia de densidad). |
| **Conteo real de espacios ocupados por cliente** (campo `espacios_ocupados` explícito en backend) | ⏳ Trivial de agregar | Valor bajo pero real: hoy el % y el total ya comunican la magnitud; el entero ahorra una cuenta mental. Prioridad baja. |

### Necesita BACKEND

| Vista | Qué falta | Valor / prioridad |
|---|---|---|
| **Tendencia temporal** (histórico mes a mes) | El endpoint es una **foto** del mes; el sistema no persiste snapshots. Requiere una tabla nueva del registro poblada al calcular las métricas (sin migración, patrón Fase 3). | **El más alto de todo el roadmap.** "¿Estamos mejorando o empeorando?" es la primera pregunta de cualquier cliente que paga asesoría recurrente, y hoy la consola no la puede contestar (compara contra nada). |
| **Spread canon cobrado vs. tarifa de referencia** (oportunidad de precio) | `canon_promedio_mensual` está; la tarifa de referencia (`/layout/rates`, admin-only, por-cliente) no está en el agregado. Cruzarlas exige una **decisión de producto y privacidad**, no solo un cambio de endpoint. | **Muy alto.** La recomendación de asesoría más directa y vendible ("estás cobrando X% por debajo de tu tarifa de referencia"), pero el trabajo previo de privacidad pesa más que el técnico. |
| **Concentración de proveedores sobre la cartera completa** (índice HHI real, no solo top-5) | Necesita el total de contratos activos y el conteo de proveedores distintos, que el endpoint no expone. | Medio-alto para el pitch de "gestión de riesgo", pero el top-5 actual ya cubre el caso más común (identificar al dominante). No urgente. |
| **Ocupación desglosada por sede dentro de un cliente** | `sedes_con_plano` es hoy solo un conteo; no hay ocupación sede-a-sede. | Medio. Útil para clientes multi-sede ("¿cuál sede está floja?"), pero es un refinamiento sobre una vista que ya existe. |
| **Benchmark contra clientes similares** (ocupación/canon vs. pares por tamaño o categoría) | Necesita segmentación que no está en el JSON, más una definición de negocio de qué hace comparables a dos clientes. | Alto a mediano plazo (el pitch "así te comparás con tus pares" vende asesorías solo), pero es el de mayor esfuerzo combinado (backend + producto). Última prioridad. |

---

## 3. Archivos del pase

- `frontend/src/index.css` — tokens `--con-*` (ambos temas) + clases utilitarias.
- `frontend/src/components/plataforma/consola.tsx` — **nuevo**, primitivas.
- `frontend/src/pages/Plataforma.tsx` — reescrito (A) + encuadre de negocio (B).
- `features/plataforma/outputs/diseno/disenador-bi.md` — notas Fase A.
- `features/plataforma/outputs/diseno/analista-presentacion.md` — notas Fase B.

Backend: **sin tocar**. Fórmulas, supresión K=3 (`K_MINIMO_CONTRATOS=3`) y saneo
de proveedores intactos.
