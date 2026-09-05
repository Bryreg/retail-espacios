# Fase 7 — Transparencia: el operador ve las cifras exactas y cada cliente puede auditar qué se tomó de él

## La decisión (del dueño de la plataforma, 2026-09-05)

Hasta hoy la consola del operador (`/plataforma`) aplicaba **supresión de celda
chica (K=3)**: con menos de 3 contratos activos, el ingreso, el canon promedio,
el top de proveedores y el spread de un cliente salían en `null`. La auditoría
integral mostró que la regla era porosa (el consolidado despejaba la celda
suprimida, `frontera-5`) y el dueño decidió **cambiar el trato** en vez de
parcharlo:

1. **El operador ve los agregados EXACTOS de todos los clientes, sin umbral.**
   Con un contrato activo, el ingreso del mes es ese contrato y así se muestra.
   K=3 desaparece de `/metricas`, `/tendencia` y del spread (por cliente y
   consolidado; el consolidado vuelve a sumar a TODOS los clientes legibles).
2. **A cambio, cada cliente puede generar un reporte de transparencia** —un
   reporte de auditoría— con cada dato que la plataforma tomó de él, cómo lo
   calculó, de dónde, para qué, y quién del operador lo consultó y cuándo. Es
   la justificación de la toma de datos, disponible a demanda para el dueño
   del supermercado y también para el operador (para entregarlo en una
   asesoría).
3. **Lo que NO cambia** (y es la razón por la que el trato sigue siendo
   defendible ante Ley 1581): el operador sigue viendo **agregados, nunca
   filas** (ningún contrato individual, ningún espacio, ninguna nota ni foto);
   **ningún correo, nombre ni id de usuario final**; el **nombre del proveedor
   sigue saneado** (correos y teléfonos enmascarados: es dato de un tercero
   que puede ser persona natural); fechas de acceso sin hora; solo lectura;
   bitácora en cada consulta. La tarifa de referencia sigue sin salir (solo el
   spread, ahora sin umbral).

## Parte A — Quitar K=3 (VINCULANTE)

- Eliminar `K_MINIMO_CONTRATOS`, `_suprimir_celda_chica` y toda llamada, en
  `plataforma_metricas.py` (por cliente, `consolidar_agregado`, `_consolidar`,
  `_spread`) y `plataforma_tendencia.py` (`publicar_fila`). El spread
  consolidado vuelve a sumar a todos los legibles con tarifa (la exclusión de
  suprimidos de Fase 6 deja de tener sentido). `spread_pct` es `null` SOLO
  cuando no hay tarifa configurada o no hay contratos con tarifa aplicable.
- `canon_promedio_mensual` con 0 contratos sigue `null` (no existe el
  promedio); con 1 o más, el número.
- Frontend: desaparece el estado `Suprimido ‹3` de la consola (tabla, tiles,
  gráfico de tendencia, spread). Cero contratos se muestra como `—`/`sin
  contratos`, no como supresión.
- **Tests**: los 8 archivos que afirman la supresión (73 menciones:
  `test_plataforma_metricas`, `test_metricas_conciliacion`,
  `test_plataforma_tendencia`, `test_tendencia_ataques`,
  `test_tendencia_conciliacion`, `test_asesoria_ataques`,
  `test_asesoria_contador`, `test_auditoria_frontera`) se REESCRIBEN para
  afirmar el comportamiento nuevo (con 1 contrato la cifra sale exacta; el
  consolidado suma a todos; `null` sólo por ausencia de dato). `test_f09`
  (frontera-5) se elimina: lo que documentaba es ahora el comportamiento
  decidido. Ningún test se borra "porque molesta": cada uno se convierte en
  su versión nueva o se explica en el entregable por qué ya no aplica.
- `docs/ESTADO.md`: la "enmienda de la regla dura del operador" (Fase 4) se
  reescribe: agregados exactos, sin umbral, con reporte de transparencia como
  contrapartida; la sección de auditoría marca `frontera-5` como resuelto por
  decisión de producto.

## Parte B — Reporte de transparencia (VINCULANTE)

**Contenido** (el Maestro fija el shape JSON exacto; idéntico en backend y
frontend):

1. **Identificación**: cliente (slug, nombre), generado_en, ventana
   (`desde`..`hasta`, por defecto los últimos 12 meses, máximo 24),
   versión de la política vigente y fecha de aceptación del dueño
   (`consentimientos`), base legal (referencia a §5.3).
2. **Qué datos toma la plataforma y para qué** — la lista TAXATIVA de
   agregados de `/metricas`, `/tendencia` y `/adopcion`: por cada uno,
   nombre, definición en palabras (fórmula), fuente (qué tablas de la base
   del cliente o del registro), finalidad (asesoría / salud de cartera /
   cobranza), y si sale saneado o sin hora. Es una lista estática en el
   código (`plataforma_reporte.py::CATALOGO`), no prosa suelta en el frontend.
3. **Los valores tomados**, mes a mes en la ventana: lo que hay en
   `snapshot_metricas` para ese cliente (crudos exactos: caras, ocupadas,
   contratos, canon total, usuarios, top de proveedores SANEADO), más el
   spread si hay tarifa. Sin filas de contratos.
4. **Quién lo consultó**: cada línea de `bitacora_plataforma` que alcanzó a
   este cliente en la ventana — `/metricas` y `/adopcion` (alcanzan a todos),
   `/tendencia` con `cliente=<este slug>` o `__consolidado__`, `/clientes`,
   `/supresiones` si el cliente tiene solicitudes, y el propio `reporte` —
   con fecha (sin hora), correo del operador, acción y período. Y un conteo
   total.
5. **Derechos**: cómo pedir el export completo (`/mi-export`), la supresión
   (`/solicitar-supresion`) y a quién escribir (lo que ya dice la política).

**Endpoints**:

- `GET /api/clientes/mi-reporte-plataforma?meses=N` — para el **dueño** del
  cliente (`require_owner`, como `/mi-export`), ruta literal en
  `routers/derechos.py`, exenta del interruptor de cobranza como los otros
  derechos (`_EXENTOS_POR_HABEAS_DATA`). Mismo freno que `/mi-export` contra
  el abuso (rate limit por usuario).
- `GET /api/plataforma/clientes/{slug}/reporte?meses=N` — para el
  **operador** (`require_operador`), declarada DESPUÉS de las literales, anota
  `accion="reporte"` con `periodo="<slug>:<desde>..<hasta>"` en la bitácora
  (el reporte también es un acceso).
- Los dos devuelven el MISMO JSON. Ninguno abre bases de otro cliente. Un
  slug ajeno para el dueño → 403/404 sin distinguir.

**Frontend**:

- En la app del cliente, donde ya viven los derechos (export / supresión):
  botón "Reporte de transparencia" que abre una **vista imprimible** (ruta
  propia, p. ej. `/reporte-plataforma`), pensada para "Imprimir → Guardar
  como PDF" del navegador: tipografía de documento, `@media print` sin
  cabecera de app, tablas por mes, la lista de accesos, pie con versión de
  política y fecha. Sin librerías nuevas. Botón "Descargar JSON".
- En `/plataforma`, en la fila de cada cliente, "Reporte" que abre la misma
  vista con el JSON del endpoint del operador.
- Claro y oscuro en pantalla; en impresión, siempre claro.

## Parte C — Política de datos y consentimiento (VINCULANTE)

- Reescribir §5.3 de `docs/legal/politica-datos.md` (y la copia byte-idéntica
  en `frontend/src/legal/`): el operador ve agregados exactos de todos los
  clientes sin umbral; qué sigue prohibido (filas, PII, nombres sin sanear);
  el reporte de transparencia como derecho del cliente y cómo pedirlo; la
  bitácora. Mantener los marcadores `[VALIDAR CON ABOGADO]` donde toque.
- **Subir `VERSION_POLITICA`**: es un cambio material del trato, así que el
  flujo existente de re-consentimiento (`consentimiento_requerido` al
  entrar, `/aceptar-politica`) tiene que dispararse para todos los usuarios
  con cuenta. Verificar que el frontend lo muestra y que el legado (claves
  compartidas) no se rompe.
- `/mi-export` incluye la versión aceptada; el reporte también.

## Guardrails

- SIN MIGRACIONES: el reporte se arma con lo que ya existe
  (`snapshot_metricas`, `bitacora_plataforma`, `consentimientos`,
  `estados_cliente`). Cero columnas nuevas. Cero tablas nuevas salvo que sea
  imprescindible (no debería).
- Frontera intacta: agregados, nunca filas; sin PII de usuarios finales;
  proveedor saneado; el dinero no viaja al worker; login legado, JWT y
  redacción por rol intocados.
- Verificación por agente SOLO sobre su territorio (REGLA_VERIFICACIÓN); la
  suite completa y el build los corre el Verificador una vez, en serie.

## Verificación (checklist del Verificador)

- [ ] Cliente con 1 contrato de 4.173.919: `/metricas` publica ingreso 4.173.919, canon promedio 4.173.919 y el proveedor (saneado); consolidado = Σ de todos los legibles.
- [ ] `/tendencia` de ese cliente publica el mes exacto; ninguna clave `null` por umbral.
- [ ] Spread con 1 contrato con tarifa: número, no `null`; consolidado suma a todos.
- [ ] `grep -rn "K_MINIMO\|_suprimir_celda_chica\|Suprimido" backend/app frontend/src` → vacío.
- [ ] Reporte del dueño: 200 con su token, 401 sin token, 403 con token de otro cliente y con token del operador SIN membresía (ese usa el endpoint del operador); contiene catálogo, valores por mes, accesos con correo del operador, versión de política; NINGÚN dato de otro cliente; proveedores saneados.
- [ ] Reporte del operador: 200, anota `accion="reporte"` en bitácora; el reporte siguiente del dueño lista ese acceso.
- [ ] `VERSION_POLITICA` subida: un usuario con consentimiento viejo recibe `consentimiento_requerido` al entrar y `/aceptar-politica` lo destraba; el login legado sigue igual.
- [ ] Política y copia byte-idénticas (test existente).
- [ ] Capturas: consola sin `Suprimido`, vista del reporte en pantalla (claro/oscuro) y en modo impresión.
- [ ] Suite completa verde dos veces en serie, `tsc` y `build` limpios.
