# Fase 3 — Compliance: Ley 1581, consentimiento y hardening OWASP

## Objetivo

Que RECABRA pueda venderse a supermercados cumpliendo la normativa colombiana
de protección de datos (Ley 1581/2012 + Decreto 1377/2013, habeas data) y con
un baseline técnico OWASP defendible — sin frenar el producto.

## Alcance (4 bloques)

### 1. Política de Tratamiento de Datos + consentimiento
- **Documento de Política de Tratamiento de Datos Personales** (markdown en
  `docs/legal/politica-datos.md` y página pública en el frontend):
  responsable, datos que se tratan (cuentas, contratos, proveedores, fotos de
  montaje, bitácora), finalidades, derechos del titular (conocer, actualizar,
  rectificar, suprimir, revocar), canales de contacto, vigencia y versión.
  **BORRADOR PARA REVISIÓN DE ABOGADO** — el documento lo dice explícito en
  su encabezado; el sistema no da asesoría legal.
- **Consentimiento con registro**: al fundar un cliente (alta self-service) y
  al aceptar una invitación se exige aceptar la política; queda constancia en
  tabla NUEVA `consentimientos` del registro (usuario_id, versión, fecha, IP).
  Sin aceptación no hay alta ni membresía nueva. Los usuarios existentes NO se
  bloquean: se les pide al próximo login (una vez, no un muro cada día).

### 2. Derechos del titular (habeas data mínimo viable)
- **Export**: el owner descarga los datos de su cliente (JSON: spaces, leases,
  suppliers, layout) — `GET /api/clientes/mi-export`, owner-only, con freno.
- **Supresión**: el owner puede SOLICITAR la supresión de su cliente; queda
  registrada (tabla `solicitudes_supresion`) y visible para el operador de
  plataforma, que la ejecuta manualmente. Nada se borra automático.
- Bitácora: las acciones del operador (cambiar estado, ver solicitudes)
  quedan anotadas; el rechazo de login por suspensión también (pendiente de
  Fase 2).

### 3. Hardening OWASP
- **Headers de seguridad** en middleware: X-Content-Type-Options,
  X-Frame-Options/frame-ancestors, Referrer-Policy, Permissions-Policy, y
  HSTS solo cuando el pedido llegó por HTTPS. CSP para el frontend servido —
  conservadora, sin romper Three.js/Firebase (connect-src a googleapis).
- **Cerrar el hallazgo abierto de la auditoría de vitrinas**: el contrato
  escaneado como IMAGEN es descargable por worker (el filtro es por
  content-type, no por rol) — pasar a filtro por rol.
- **CI de dependencias**: GitHub Actions con pip-audit + npm audit
  (`--omit=dev`, fallar solo en high/critical para no llorar lobo).
- Revisión puntual: tamaño máximo de uploads, y que ningún endpoint nuevo de
  las Fases 1-2 quede fuera del freno por IP.

### 4. Guía RNBD (documento para el humano, no código)
- `docs/legal/guia-rnbd.md`: cuándo aplica el Registro Nacional de Bases de
  Datos ante la SIC (umbrales por activos), qué bases declarar (registro +
  una por cliente), pasos y plazos. Es una guía operativa para el dueño del
  negocio, con la advertencia de validar con abogado.

## Guardrails

- SIN MIGRACIONES: `consentimientos` y `solicitudes_supresion` son tablas
  NUEVAS del registro. Nada de columnas en tablas existentes.
- El login legado no cambia (el consentimiento aplica a cuentas nuevas y al
  alta; el legado se apaga por cliente en su momento, no acá).
- La redacción de dinero por rol no cambia. El JWT no cambia de forma.
- El export del owner NO incluye la bitácora completa (contiene IPs de
  terceros) ni los hashes de claves; sí sus datos de negocio.
- CSP: primero medir qué carga el frontend real (fonts.googleapis,
  gstatic, identitytoolkit/securetoken) — una CSP que rompe el login es peor
  que ninguna. Si hay inline styles de Three.js/React que la CSP estricta
  rompe, documentar la concesión elegida.

## Verificación

- [ ] Alta sin aceptar política → 422 con mensaje; con aceptación → queda fila en consentimientos con versión e IP
- [ ] Login de usuario existente sin consentimiento → respuesta trae pedir_consentimiento una vez; aceptar lo registra
- [ ] Export owner-only: worker/admin-no-owner → 403; owner → JSON completo de SU cliente
- [ ] Solicitud de supresión visible para el operador; nada se borra solo
- [ ] Headers presentes en TODAS las respuestas (incluidos errores); HSTS solo por HTTPS
- [ ] La imagen del contrato ya NO baja con token de worker
- [ ] El frontend real carga completo con la CSP puesta (login Firebase incluido)
- [ ] CI de dependencias corre en PRs
- [ ] Suite completa verde DOS veces + tsc limpio
