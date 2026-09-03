# Fase 1 — Identidad: usuarios reales con Google/correo y roles por cliente

## Objetivo

Reemplazar las dos claves compartidas por rol (admin/worker) con **cuentas
individuales** — login con Google o correo/contraseña — y **membresías por
cliente** (supermercado), sin romper el login actual durante la transición.
Es el prerequisito de todo lo comercial: trazabilidad individual en el
`audit_log`, revocar acceso a UNA persona sin cambiar la clave de todos,
recuperación de clave, y la puerta de entrada al alta self-service (Fase 2).

## Decisiones de diseño

1. **Proveedor de identidad: Firebase Authentication** (plan gratuito).
   Da Google + correo/contraseña + verificación de email + reset + protección
   de fuerza bruta, sin construir nada de eso. El frontend usa el SDK JS; el
   backend solo **verifica el ID token** (JWKS de Google) — no corre SDK de
   Firebase.
2. **Usuarios y membresías viven en la base por defecto (el registro)**, junto
   a la tabla `clientes` — son identidad GLOBAL, cruzan clientes. Son tablas
   NUEVAS → `create_all()` las crea solo: **cero migraciones**, compatible con
   la regla dura del repo.
3. **El JWT propio no cambia de forma, solo gana `sub`.** El flujo emite el
   MISMO token que hoy (`{role, epoca, cliente, exp}`) más `sub` (id de
   usuario) y `email`. Todo el middleware, la redacción por rol y los routers
   existentes siguen funcionando sin tocarse.
4. **El login viejo no se rompe.** `POST /api/auth/login` (claves compartidas)
   queda como está, marcado deprecated. Se apaga POR CLIENTE (flag en
   `clientes`) cuando ese cliente ya tiene sus cuentas creadas.
5. **Roles por membresía:** `owner` (dueño del cliente: gestiona usuarios y
   facturación futura), `admin` y `worker` (los dos de siempre — para el
   middleware actual, owner se comporta como admin).

## Modelo (tablas nuevas en la base por defecto)

- `usuarios`: id, firebase_uid UNIQUE, email UNIQUE, nombre, creado_en,
  ultimo_login
- `membresias`: usuario_id, cliente_slug, rol ∈ {owner, admin, worker},
  activo, creado_en — UNIQUE(usuario_id, cliente_slug)
- `invitaciones`: email, cliente_slug, rol, token (firmado), expira_en,
  usada_en, invitado_por

## Flujos

**Login:** frontend → Firebase (Google o correo) → `POST /api/auth/oauth`
con el ID token → backend verifica firma/audiencia/expiración → busca usuario
por `firebase_uid` (lo crea si el email tiene invitación pendiente o ya es
usuario) → lista membresías activas → una sola: emite JWT propio; varias:
devuelve la lista y el front pide elegir cliente → JWT.

**Invitación:** owner/admin → `POST /api/usuarios/invitar` (email, rol) →
fila en `invitaciones` + correo con enlace (el sistema ya manda correo por
Brevo/SendGrid) → el invitado entra con Google/correo → al verificar el ID
token se consume la invitación y nace la membresía.

**Revocación individual:** desactivar la membresía → el middleware valida
membresía activa por request (una consulta al registro, cacheable) → esa
persona pierde acceso YA, sin tocar a nadie más. Las épocas actuales siguen
cubriendo el logout masivo por cambio de clave del login legado.

**Auditoría:** cuando el token trae `sub`, `AuditEntry` guarda además el
email del actor — "quién" deja de ser "admin" y pasa a ser una persona.

## Fuera de alcance (fases siguientes)

Alta self-service de supermercados (F2) · interruptor de estado de cuenta
(F2) · pasarela (F5+) · 2FA (Firebase lo trae, se enciende después) · Apple
login (solo si hay app iOS; requiere Apple Developer).

## Verificación

- [ ] Login con Google crea usuario y entra al cliente correcto
- [ ] Login con correo/contraseña + verificación de email funciona
- [ ] Invitar worker por email → entra con rol worker y NO ve dinero
- [ ] Desactivar membresía → el siguiente request de esa persona es 401
- [ ] El login viejo por clave compartida sigue funcionando intacto
- [ ] `audit_log` registra el email del actor en acciones con cuenta nueva
- [ ] Un token de un cliente no abre la base de otro (ya cubierto, re-testear)
- [ ] Suite completa verde + `tsc --noEmit` limpio
