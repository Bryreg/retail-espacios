# Fase 4 — Consola de Plataforma: ruta propia y métricas del negocio

## Objetivo

Que el dueño del SaaS opere y ENTIENDA su negocio desde una superficie propia:
la ruta `/plataforma` (fuera del diseño de cualquier cliente) con el
interruptor de estados que ya existe MÁS un panel de métricas: uso, % de
ocupación, canon promedio, proveedores frecuentes — por supermercado y
consolidado.

## Decisión arquitectónica (enmienda de regla dura)

La regla de Fase 2 "ser operador NO abre la base de negocio de ningún
cliente" se ENMIENDA así, y `docs/ESTADO.md` debe reflejarlo:

> El operador accede a datos de negocio de los clientes SOLO a través de los
> endpoints de métricas agregadas definidos en esta spec: solo lectura, solo
> agregados (nunca filas individuales), y cada consulta queda anotada en la
> bitácora del registro con el email del operador. Ningún otro endpoint de
> plataforma abre una base de cliente.

**Qué agregados SÍ** (taxativo): nº de sedes con plano, nº de espacios
comercializables, % de ocupación del período (espacios con contrato activo /
comercializables), canon promedio mensual de contratos activos, ingreso
contratado del mes (suma), top 5 proveedores por nº de contratos activos
(nombre + conteo), nº de usuarios con cuenta y fecha del último acceso (la
fecha, no quién), estado de cuenta actual.

**Qué NUNCA**: valores de contratos individuales, filas de leases/spaces,
correos o nombres de usuarios finales de los clientes, notas, fotos,
bitácoras de los clientes. El endpoint construye los agregados por
consulta SQL/ORM y el JSON de respuesta no puede contener listas de filas de
negocio — solo números y el top de proveedores (nombre + conteo).

**Pendiente legal que esta fase CREA**: la Política de Tratamiento de Datos
debe declarar que el operador de la plataforma ve métricas agregadas del
negocio de cada cliente. Agregar el punto al borrador con marca
`[VALIDAR CON ABOGADO]` — no es opcional.

## Alcance

### 1. Ruta propia `/plataforma` (SPA)
- Página completa, NO modal, fuera del layout de cliente (sin Topbar de sede).
- Tras el login con Google: un operador SIN membresías aterriza acá directo
  (hoy le ofrece "fundá tu supermercado" — mal); un operador con membresías
  ve el botón del Topbar que ahora NAVEGA a `/plataforma`.
- El modal actual desaparece; su contenido (estados + supresiones) se muda a
  la ruta.
- Guard de frontend: si `/plataforma/soy` dice que no sos operador, la ruta
  redirige al login/dashboard — y el backend igual responde 403 (la SPA no es
  la frontera).

### 2. Panel de control con métricas
- `GET /api/plataforma/metricas` → consolidado + lista por cliente con los
  agregados taxativos de arriba. Parámetro de período (mes actual por
  defecto). Cache de 5 min en memoria del registro (recorrer N bases por
  pedido no escala sin techo).
- UI: tarjetas de resumen consolidado (clientes activos, ocupación media,
  canon promedio, ingreso contratado total) + tabla por supermercado con sus
  métricas + el estado de cuenta y el botón Cambiar existentes + sección de
  supresiones. Gráficos sobrios con los tokens del design system del repo;
  sin librerías nuevas de charts salvo justificación (SVG/CSS propio primero).
- Cada consulta de métricas anota en la bitácora del REGISTRO: quién (email
  del operador), cuándo, qué período.

### 3. Guardrails
- SIN MIGRACIONES: nada de columnas nuevas; si hace falta persistir algo,
  tabla nueva del registro.
- Las bases de cliente se abren READ-ONLY y en secuencia; un cliente cuya
  base falle no tumba el panel (su fila sale con error marcado, el resto
  sigue) — patrón de _run_lease_maintenance.
- El login legado, la redacción por rol dentro de cada cliente y el JWT no
  cambian. Los endpoints nuevos usan require_operador existente.
- Un cliente suspendido TAMBIÉN aparece en métricas (el operador necesita
  ver el negocio completo).
- FastAPI: rutas literales antes de paramétricas.

## Verificación
- [ ] Operador sin membresías: login con Google → aterriza en /plataforma (no en "fundá tu supermercado")
- [ ] Operador con membresías: botón del Topbar navega a la ruta; el modal ya no existe
- [ ] No-operador que teclea /plataforma: redirect en SPA y 403 en API
- [ ] Métricas correctas contra datos sembrados conocidos (ocupación, canon promedio, top proveedores verificados a mano)
- [ ] El JSON de métricas NO contiene filas de negocio ni correos de usuarios finales (inspección del JSON real)
- [ ] Cada consulta de métricas deja línea en la bitácora del registro con el email del operador
- [ ] Cliente con base rota → su fila marca error, el resto del panel funciona
- [ ] Política de datos: punto nuevo con [VALIDAR CON ABOGADO]
- [ ] ESTADO.md refleja la enmienda de la regla
- [ ] Suite completa verde DOS veces + tsc limpio
