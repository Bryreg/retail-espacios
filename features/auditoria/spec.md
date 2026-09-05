# Auditoría integral — RECABRA tras las Fases 1–6

## Objetivo

Una auditoría adversarial del sistema COMPLETO tal como está en `main` después
de las Fases 1–6 y los fixes #41–#46, con foco en lo que cambió recientemente
pero sin dar por buena ninguna parte vieja. No es una fase de producto: no
agrega funcionalidad. Produce **hallazgos verificados** (con reproducción) y
**arregla los confirmados de severidad alta o crítica** en la misma rama, con
test de regresión.

Pedido literal del usuario: "auditoría sobre los últimos cambios, ingresos al
sistema, login, ataques de ciberseguridad, base de datos, bugs, etc. Lo que
consideres".

## Dimensiones (el Maestro arma el equipo a partir de esto; puede fundir o
partir dimensiones, y agregar una que falte)

1. **Ingreso al sistema / login.** Firebase ID token (JWKS de Google, RS256
   forzado, `leeway`, audiencia, `iss`, `sub`, email verificado), el JWT
   propio (`{role, epoca, cliente, sub, email, exp}`; firma, expiración,
   épocas por rol, revocación por membresía), el login legado por clave
   compartida (fuerza bruta, rate limit por IP, `IntentoOauth`/`IntentoAlta`),
   invitaciones (token firmado, expiración, reuso), selección de cliente con
   varias membresías, cierre de sesión, y cómo el frontend guarda la sesión
   (`retail-auth-v1` en localStorage: qué hay ahí y qué pasa con XSS).
2. **Aislamiento multi-tenant y base de datos.** "Un supermercado, una base":
   `cliente_del_pedido`, `sesion_de`, `unico()` como fallback, `_aplicar_estado`,
   exenciones (`_EXENTOS_*`, `_es_path_de_plataforma`), rutas de archivos
   (`files.py`, `sede_archive.py`) y cualquier camino por el que un token de un
   cliente lea o escriba la base de otro. Integridad: `create_all()` sin
   migraciones (columnas nuevas que NO existen en producción), índices únicos,
   escrituras concurrentes (409 / UNIQUE), tamaño y crecimiento (`audit_log`,
   `bitacora_plataforma`, `snapshot_metricas`, `intentos_*` — ¿se purgan?),
   `app_config` como KV, SQLite en Render (disco efímero, backups,
   `PRAGMA`s, WAL, locks bajo el hilo de mantenimiento).
3. **Frontera del operador (`/plataforma`).** `require_operador`,
   `OPERADOR_EMAILS`, token de consola (`cliente="plataforma"`), la lista
   taxativa de agregados, K=3, saneo de proveedores, spread (Fase 6),
   adopción (Fase 6), tendencia (Fase 5), bitácora, caché compartido entre
   operadores, PATCH de estado de cuenta (motivos, `_aviso_sin_motivo`),
   supresiones y export de habeas data.
4. **OWASP / hardening.** CSP y cabeceras (Fase 3), CORS, HSTS detrás del
   proxy de Render, cookies/tokens, inyección (SQLAlchemy raw, `json.loads`
   de entrada de usuario, nombres de archivo, `sede` en rutas de disco),
   SSRF/redirecciones en enlaces de montaje y correo, límites de tamaño de
   carga (planos JSON, fotos de montaje), `npm audit` / `pip-audit`,
   secretos en el repo o en el build (`VITE_*` es público por diseño — pero
   ¿hay algo que NO debería serlo?), Dockerfile y `render.yaml`.
5. **Bugs en los últimos cambios.** Revisión adversarial del diff de las
   Fases 4–6 y de #41–#46: `plataforma_metricas.py`, `plataforma_tendencia.py`,
   `plataforma_adopcion.py`, `main.py` (lifespan, hilo de mantenimiento,
   `_mantenimiento_en_vuelo`), `fixtureStore.ts` (`scopeToCliente`, `DEFAULT_SEDES`),
   `Dashboard.tsx`/`DashboardView.tsx`, la consola BI. Carreras, caché
   obsoleto, `None` vs 0, fechas/zonas horarias (UTC vs Colombia), redondeos
   de dinero, estados de UI imposibles, errores silenciados con `except
   Exception`.
6. **Compliance y privacidad.** Ley 1581: política y su copia byte-idéntica,
   consentimiento (versión, re-aceptación), habeas data (export completo,
   supresión, plazos), datos de terceros (proveedores, contactos en
   `Supplier.name`), retención de logs, correos transaccionales (qué datos
   viajan a Brevo/SendGrid), y que ESTADO.md diga la verdad sobre todo esto.

## Reglas de la auditoría (vinculantes)

- **Cada hallazgo se demuestra**: un test que lo reproduce (`xfail(strict=True)`
  afirmando el comportamiento seguro, estilo `test_*_ataques.py`), o una
  sonda con salida literal. Sin reproducción no es hallazgo, es opinión —
  va en una sección aparte "sospechas sin confirmar".
- **Severidad** con criterio: *crítica* = acceso o datos de otro cliente /
  bypass de auth / RCE; *alta* = fuga de PII o dinero fuera de rol, DoS
  trivial, corrupción de datos; *media* = defensa en profundidad rota,
  bug funcional con impacto; *baja* = higiene.
- **Arreglos**: los confirmados alta/crítica se arreglan en esta rama (los
  builders que el Maestro asigne), con el `xfail` convertido en test verde;
  media/baja quedan documentados con propuesta. Un arreglo NUNCA relaja la
  frontera ni desactiva un test.
- **Territorios**: cada auditor escribe en SU archivo de test
  (`tests/test_auditoria_<dimension>.py`) y su entregable; los builders de
  arreglo tocan solo los archivos que el Maestro les asigne. SIN MIGRACIONES.
- **Verificación por agente**: SOLO sus archivos de test + typecheck, con
  `TMPDIR` propio. La suite completa y el build los corre el Verificador,
  una sola vez, en serie, al final (REGLA_VERIFICACIÓN).
- No se ejecutan ataques contra producción (`retail-espacios.onrender.com`):
  todo contra el árbol local con `TestClient` o un server local.

## Entregables

- `features/auditoria/outputs/<agente>.md` por agente y `ENTREGA.md` del
  Maestro con: tabla de hallazgos (id, severidad, dimensión, estado:
  arreglado / documentado / sospecha), reproducción, arreglo, y un veredicto
  honesto de postura de seguridad.
- Sección "Auditoría integral (post Fase 6)" para `docs/ESTADO.md`: qué se
  auditó, qué se arregló, qué queda abierto y por qué.
- Suite completa verde dos veces en serie, `tsc` y `build` limpios.
