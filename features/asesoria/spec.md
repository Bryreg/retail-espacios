# Fase 6 — Asesoría: oportunidad de precio y cohortes de adopción

## Objetivo

Cerrar el roadmap de asesoría de la consola `/plataforma` (definido por el
analista en `features/plataforma/outputs/diseno/analista-presentacion.md`,
sección "Necesita backend"): las dos lecturas que faltan para que una sesión de
asesoría tenga algo concreto que recomendar.

1. **Oportunidad de precio (spread canon vs tarifa de referencia).** "Estás
   cobrando X % por debajo de tu propia tarifa de referencia" — la
   recomendación más directa y vendible. Hoy `canon_promedio_mensual` existe
   en el agregado pero la tarifa de referencia (`/api/layout/rates`,
   admin-only, por cliente) no se cruza con nada.
2. **Cohortes de adopción.** Detectar cuentas "fantasma": clientes con
   contratos activos donde nadie entra a mirar la plataforma — el disparador
   clásico de una cancelación silenciosa. Los campos ya existen en el registro
   (`usuarios`, `membresias`, `fundaciones`, `estados_cliente`); falta el
   panel y la clasificación.

## Decisión de privacidad (VINCULANTE — la que quedó pendiente en Fase 4)

La tarifa de referencia es un dato de estrategia comercial del supermercado.
**Nunca sale de la base del cliente hacia el operador, ni en promedio ni por
sede.** Lo único que cruza la frontera es la RELACIÓN entre lo que cobra y lo
que dice que vale:

- `spread_pct` = `(Σ canon de contratos activos / Σ tarifa aplicable a cada
  uno de esos contratos − 1) × 100`, por cliente y período. Negativo = cobra
  por debajo de su tarifa. La tarifa aplicable a un contrato es la de su sede
  (`by_sede[sede]`) o la `default` si la sede no tiene propia; un contrato
  cuyo espacio no tiene tarifa aplicable (ni por sede ni default) **no entra
  en la cuenta** y se reporta como `contratos_sin_tarifa` (conteo).
- Se aplica la **misma supresión K=3** que al canon (`_suprimir_celda_chica`):
  con menos de 3 contratos con tarifa aplicable el spread es `null`. Motivo:
  con 1 o 2 contratos el spread y el canon promedio (que sí se publica) dejan
  despejar la tarifa.
- El consolidado publica el spread **ponderado** (Σ canon / Σ tarifa sobre
  todos los clientes legibles con tarifa), nunca el promedio de spreads.
- Un cliente sin tarifa de referencia configurada devuelve `spread_pct: null`
  y `tarifa_configurada: false` — es el estado más común al principio y la
  consola lo tiene que decir sin inventar un número.
- Ni la tarifa, ni `Σ tarifa`, ni ningún valor absoluto derivado de ella
  aparece en el JSON. Lista taxativa de campos nuevos en `/metricas` por
  cliente: `spread_pct`, `tarifa_configurada`, `contratos_sin_tarifa`.
  Consolidado: `spread_pct`, `clientes_con_tarifa`.
- El histórico del spread queda **fuera de alcance** de esta fase (la tabla
  `snapshot_metricas` no puede ganar columnas — SIN MIGRACIONES — y una tabla
  nueva sólo para esto no se justifica hasta ver que se usa). Pendiente
  documentado.

## Cohortes de adopción (VINCULANTE)

Todo sale del **registro** (`usuarios`, `membresias`, `fundaciones`,
`clientes`, `estados_cliente`) más `contratos_activos` que ya calcula
`plataforma_metricas`. **Ninguna base de cliente se abre** para esto salvo lo
que `calcular()` ya abre. Ningún correo, nombre ni id de usuario sale al JSON;
las fechas van sin hora (regla de Fase 4).

- **Cohorte** = mes de alta del cliente (`YYYY-MM`). Fuente: `Fundacion.creado_en`
  del cliente si existe (alta self-service de Fase 2); si no, `ClienteRow`
  (leé el modelo: si no tiene fecha de creación, la cohorte es `null` y el
  cliente se reporta como `"sin fecha de alta"` — no se inventa).
- Por cliente: `cohorte`, `usuarios_con_cuenta` (membresías activas),
  `usuarios_activos_30d` (con `ultimo_login` en los últimos 30 días),
  `dias_sin_acceso` (desde el último acceso de cualquier usuario del
  cliente; `null` si nunca entró nadie), `estado` (de `estados_cliente`, fila
  ausente = activo), y la **clasificación**:
  - `nueva`: alta hace menos de 30 días.
  - `activa`: algún usuario entró en los últimos 30 días.
  - `fantasma`: tiene contratos activos este período y **ningún** acceso en 30+
    días (o nunca). Es la señal que la asesoría busca.
  - `dormida`: sin contratos activos y sin acceso en 30+ días.
  - `sin_cuentas`: cero membresías activas (cliente legado que sigue con
    claves compartidas — el login viejo no deja `ultimo_login`).
- Agregado por cohorte: clientes en la cohorte, cuántos `activa`/`fantasma`/
  `dormida`/`sin_cuentas`/`nueva`, y **retención**: % de la cohorte con algún
  acceso en los últimos 30 días.
- Endpoint: `GET /api/plataforma/adopcion` (`require_operador`, ruta
  **literal** declarada antes de las paramétricas, bitácora
  `accion="adopcion"`, `periodo=<YYYY-MM actual>`). Responde
  `{ periodo, generado_en, cohortes: [...], clientes: [...] }` — el shape
  exacto lo fija el Maestro, idéntico en backend y frontend.
- La clasificación se calcula **una sola vez en el backend**; el frontend no
  re-deriva estados a partir de fechas.

## Frontend (consola `/plataforma`)

- **Oportunidad de precio**: en la tabla por cliente una columna "vs tarifa"
  con el spread (formato `−12,4 %` / `+3,1 %`), `Suprimido` (‹3) cuando
  `null` por K=3, "sin tarifa" cuando `tarifa_configurada=false`. Un KPI o
  tile en el hero con el spread consolidado y su lectura ("la cartera cobra
  X % por debajo de sus tarifas de referencia"). Sin gráfico nuevo: es una
  cifra con signo, no una distribución.
- **Adopción**: panel propio "Adopción" debajo de "Tendencia" con (a) la
  tabla de cohortes (mes de alta, clientes, retención 30d, desglose por
  clasificación con `EstadoPill`/badges de la consola) y (b) la lista de
  clientes `fantasma` primero — es "a quién llamar hoy". Reusar las
  primitivas de `components/plataforma/consola.tsx` y los tokens `--con-*`;
  claro y oscuro; estado vacío honesto cuando no hay cohortes.
- Sin librerías nuevas. Bajo la CSP de Fase 3. `tsc --noEmit` y `npm run build`
  limpios.

## Guardrails (no negociables)

- SIN MIGRACIONES: cero columnas nuevas en tablas existentes. Tablas nuevas
  sólo si son imprescindibles (esta fase no debería necesitar ninguna).
- Frontera del operador intacta: solo lectura, solo agregados, bitácora,
  nunca filas de negocio ni datos de usuarios finales. Login legado, JWT y
  redacción por rol intocados. El dinero no viaja al worker.
- Reusar `plataforma_metricas` (`_suprimir_celda_chica`, `_contratos_activos`,
  `_usuarios_del_cliente`, `consolidar_*`): cero fórmulas duplicadas. El
  spread se calcula dentro de `_metricas_de_un_cliente` (ya tiene la sesión
  del cliente abierta y los contratos en la mano) leyendo
  `reference_rates_raw(db)` de `routers/layout.py`.
- Consolidado ponderado (Σ/Σ), nunca promedio de promedios.
- `docs/legal/politica-datos.md` §5.3 y su copia en `frontend/src/legal/`
  (byte-idénticas, test-enforced): si el JSON del operador gana campos,
  declararlos ahí en los mismos términos que los de Fase 4.
- Verificación por agente: **SOLO los tests de tu territorio** (ver
  REGLA_VERIFICACIÓN del orquestador). La suite completa la corre el
  Verificador, una vez terminado el equipo, dos veces en serie.

## Verificación (checklist del Verificador)

- [ ] Cliente con tarifa default 1.000.000 y 3 contratos a 900.000 → `spread_pct = -10.0`; con 2 contratos → `null` (K=3); sin tarifa → `null` + `tarifa_configurada=false`.
- [ ] Contrato en sede con tarifa propia usa la de la sede; contrato sin tarifa aplicable cuenta en `contratos_sin_tarifa` y no en el spread.
- [ ] Consolidado = Σ canon / Σ tarifa de los clientes legibles con tarifa (verificado a mano contra el promedio de spreads, que debe diferir).
- [ ] Ningún valor absoluto de tarifa en el JSON (grep del cuerpo por los montos sembrados).
- [ ] Adopción: cliente con contratos y sin acceso en 45 días → `fantasma`; con acceso hace 3 días → `activa`; alta hace 10 días → `nueva`; sin membresías → `sin_cuentas`. Cohortes agrupan por mes de alta; retención 30d correcta.
- [ ] `/adopcion`: operador 200 con bitácora; dueño de cliente 403; sin token 401; ningún correo/nombre/id de usuario en el cuerpo.
- [ ] Política de datos §5.3 declara los campos nuevos; copia byte-idéntica.
- [ ] Capturas claro/oscuro de la columna "vs tarifa", el tile de spread y el panel Adopción.
- [ ] Suite completa verde dos veces en serie, `tsc` y `build` limpios, sin regresiones de Fases 1–5.
