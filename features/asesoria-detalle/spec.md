# Fase 8 — Detalle por cliente para asesoría: espacios, contratos, proveedores y oportunidades

## La decisión (del dueño de la plataforma, 2026-09-05, después de Fase 7)

"La plataforma aún no tiene toda la información disponible para hacer análisis:
no sé qué proveedor está en cada espacio adicional y a qué precio. Hay mucha
información sin mostrarse para ayudar a nuestros clientes."

El límite "el operador ve agregados, nunca filas" fue una decisión de diseño de
Fase 4, no una limitación técnica. Para el servicio de **asesoría comercial**
que RECABRA vende a sus clientes, el operador necesita ver el negocio de cada
supermercado **espacio por espacio**: qué proveedor ocupa cada uno, a qué canon,
desde y hasta cuándo, qué está libre y de qué tipo, y de ahí derivar
oportunidades concretas ("podrías ofrecerle a Alpina dos puntas más a unos
$900.000"). Esta fase abre esa vista, **solo lectura**, con bitácora, y la
declara en la política de datos y en el reporte de transparencia de Fase 7 —
todo en la misma versión de política (`2026-09-v2`, todavía no desplegada), así
los clientes consienten el trato completo una sola vez.

## Lo que se abre (VINCULANTE)

`GET /api/plataforma/clientes/{slug}/detalle?periodo=YYYY-MM` (`require_operador`;
por defecto el mes en curso, misma ventana que `/metricas`; anota
`accion="detalle"`, `periodo="<slug>:<YYYY-MM>"` en `bitacora_plataforma`).
Abre **una sola** base de cliente, solo `query`, y devuelve (el Maestro fija el
shape exacto, idéntico en backend y frontend):

1. **Espacios por sede**: para cada espacio comercializable del plano (cara
   `-B` incluida, con el mismo tipo que su góndola): código completo
   (`SEDE-CODE`), tipo (`_tipo_de_tarifa` del fixture), zona y área si
   existen, estado en el período (`ocupado` / `libre` / `se_libera` si el
   contrato vence dentro del período), y el contrato vigente si lo hay:
   **proveedor (nombre comercial)**, marca, canon mensual, inicio, fin.
   Un espacio con contrato que arranca dentro del período también cuenta.
2. **Resumen por tipo de espacio**: total, ocupados, libres, canon promedio,
   mínimo y máximo de los contratos vigentes de ese tipo en ese cliente,
   y si el cliente tiene tarifa configurada para ese tipo (sí/no — **nunca
   el valor de la tarifa**).
3. **Proveedores del cliente**: por proveedor, cuántos espacios ocupa, de qué
   tipos, en qué sedes, canon total y promedio, desde cuándo está (primer
   contrato), y si tiene contratos que vencen en los próximos 60 días.
4. **Movimientos** (últimos 12 meses, mes a mes): entradas (contratos que
   empezaron) y salidas (que terminaron o se cancelaron — usar
   `lease_cancellations` si existe en el modelo, si no, `end_date`), con
   proveedor, espacio y canon.
5. **Oportunidades**, ordenadas por valor estimado descendente: por cada
   espacio libre (o que se libera), el tipo, un **precio sugerido** = canon
   promedio que ESE cliente cobra por ese tipo (si no tiene ninguno, el
   promedio de la plataforma para ese tipo, marcado como `benchmark`), y hasta
   3 **proveedores candidatos** = proveedores de ese mismo cliente que ya
   ocupan espacios de ese tipo (o de otros tipos, en segundo lugar) y no
   ocupan este, ordenados por canon que ya pagan. El texto de la oportunidad
   se arma en el frontend a partir de los campos, no viaja como prosa.

## Lo que NO se abre (VINCULANTE — sigue prohibido)

- `Supplier.contact_name`, `phone`, `email`, `notes`; `Space.notes`;
  `SpaceLease.notes`; `SpaceFile` (fotos y documentos); fotos de montaje. El
  nombre del proveedor pasa por `sanear_nombre_proveedor` (correos y teléfonos
  incrustados enmascarados).
- Ningún correo, nombre ni id de **usuario** del supermercado.
- La **tarifa de referencia** (solo `tarifa_configurada` sí/no por tipo y el
  spread que ya existe).
- Nada de otro cliente dentro del detalle de uno: el benchmark de plataforma
  es un promedio de TODOS los clientes legibles por tipo, un número, sin
  desglose ni nombres.
- Nada de escritura: el endpoint solo lee. Login legado y trabajador → 403
  como todo `/plataforma`. `slug` inexistente → 404 con texto fijo.

## Frontend (VINCULANTE)

- Página `/plataforma/clientes/:slug` (operador), con enlace "Ver detalle"
  en cada fila de la tabla de clientes de `/plataforma`. Secciones, en este
  orden: **Oportunidades** primero (es "qué le propongo hoy"), luego
  **Espacios** (tabla filtrable por sede, tipo y estado, con buscador por
  código o proveedor), **Por tipo**, **Proveedores**, **Movimientos**.
  Selector de período como en la consola. Enlace al reporte de transparencia
  del cliente. Primitivas de `components/plataforma/consola.tsx`, tokens
  `--con-*`, claro y oscuro, sin librerías nuevas, bajo la CSP.
- Estado vacío honesto: cliente sin plano → "sin plano cargado"; base ilegible
  → el texto fijo de error.

## Política, reporte y ESTADO (VINCULANTE)

- `docs/legal/politica-datos.md` §5.3 (y la copia byte-idéntica): en (a)
  agregar el **detalle de espacios y contratos** con las mismas palabras de
  arriba (espacio, tipo, ocupado o libre, proveedor por nombre comercial
  depurado, canon, fechas, oportunidades derivadas); en (b) quitar "ningún
  contrato, ningún espacio" y dejar lo que sigue prohibido (datos de contacto,
  notas, fotos, usuarios, tarifa, escritura); en las **finalidades** agregar
  "mejora del servicio y de la plataforma" a asesoría / salud de cartera /
  cobranza. Misma `VERSION_POLITICA = "2026-09-v2"` (no se sube otra vez: la
  v2 aún no se desplegó). Mantener `[VALIDAR CON ABOGADO]`.
- `plataforma_reporte.py::CATALOGO`: entradas nuevas para el detalle
  (`endpoints: ["detalle"]`, `tratamiento: "exacto"` / `"saneado"` para el
  proveedor), y `accesos` del reporte incluye `accion="detalle"` del cliente.
- `docs/ESTADO.md`: la enmienda de la regla del operador pasa a "agregados
  exactos **y detalle de negocio** (espacios, contratos, proveedores), solo
  lectura, con bitácora y reporte de transparencia"; sección "Fase 8".

## Guardrails

- SIN MIGRACIONES. Frontera: solo lectura, bitácora, sin PII de usuarios ni
  contactos de proveedores, sin tarifa. Reusar `_numeros_del_layout` /
  `find_fixture_by_space_code` / `_tipo_de_tarifa` / `sanear_nombre_proveedor`
  / `fullSpaceCode`: cero fórmulas duplicadas.
- Verificación por agente SOLO sobre su territorio (REGLA_VERIFICACIÓN); la
  suite completa y el build los corre el Verificador una vez, en serie. Esta
  fase va encima de Fase 7 (misma rama): el Verificador verifica las dos.

## Verificación (checklist del Verificador)

- [ ] Cliente sembrado con 2 sedes, góndola doble (caras A/B), punta, nevera; 3 contratos (uno que vence dentro del período): `/detalle` lista cada espacio con su tipo, estado y contrato; canon y fechas exactos; proveedor por nombre.
- [ ] `grep` del JSON por el teléfono, correo, `contact_name` y `notes` sembrados en `Supplier`/`Space`/`SpaceLease` → vacío. Ningún correo de usuario. Ninguna clave con `tarifa` salvo `tarifa_configurada`.
- [ ] Resumen por tipo cuadra a mano (ocupados + libres = total; promedio/min/max).
- [ ] Oportunidades: espacio libre de tipo punta → precio sugerido = promedio de puntas del cliente; candidatos = proveedores del cliente que no ocupan ese espacio; cliente sin contratos de ese tipo → `benchmark`.
- [ ] 403 dueño de cliente, 403 legado, 401 sin token, 404 slug inexistente; bitácora `accion="detalle"`; el reporte de transparencia del dueño lista ese acceso y el catálogo tiene las entradas de detalle.
- [ ] Política y copia byte-idénticas, §5.3 (a)/(b)/finalidades como pide la spec, `VERSION_POLITICA` sigue `2026-09-v2`.
- [ ] Capturas de `/plataforma/clientes/:slug` (claro y oscuro) con oportunidades, tabla de espacios y proveedores.
- [ ] Suite completa (Fases 7 y 8) verde dos veces en serie; `tsc` y `build` limpios.
