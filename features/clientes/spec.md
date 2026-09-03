# Fase 2 — Clientes: alta self-service y estado de cuenta

## Objetivo

Que un supermercado nuevo pueda **crearse solo** (registrarse con Google/correo
y fundar su cliente, del que queda como owner), y que el operador de la
plataforma tenga un **interruptor de estado de cuenta** por cliente
(activo / gracia / solo_lectura / suspendido) para cortar o degradar el
servicio a mano — el riel del dinero es transferencia + cuenta de cobro por
ahora, así que el interruptor lo mueve una persona, no una pasarela. El día
que haya pasarela, su webhook moverá ESTE MISMO interruptor.

## Decisiones de diseño

1. **Alta self-service**: un usuario autenticado por Firebase SIN membresías
   puede fundar un cliente nuevo. Se apoya en `crear_cliente(slug, nombre)`
   que ya existe (`app/clientes.py`). El fundador nace con membresía `owner`.
   Límites duros: slug validado (mismo régimen que `crear_cliente`), slugs
   reservados (galerias, api, www, admin, plataforma…), máximo 2 clientes
   fundados por usuario, y el freno anti-abuso reutiliza el patrón de
   `intentos_oauth` (tabla propia, no contamina otros frenos).
2. **Estado de cuenta SIN tocar tablas existentes**: la tabla `clientes` ya
   existe en producción y la regla dura prohíbe agregarle columnas. El estado
   vive en una tabla NUEVA del registro: `estados_cliente` (slug PK, estado,
   motivo, cambiado_en, cambiado_por). **Fila ausente = activo** — los
   clientes existentes no necesitan backfill.
3. **Semántica de estados** (la aplica el middleware de resolución de cliente,
   un solo lugar):
   - `activo`: normal.
   - `gracia`: normal, pero las respuestas de login/refresh incluyen
     `aviso_cuenta` para que el frontend muestre el banner de pago pendiente.
   - `solo_lectura`: GET funciona; POST/PUT/PATCH/DELETE de negocio → 402 con
     mensaje claro ("cuenta en solo lectura por pago pendiente"). El login y
     la gestión de usuarios del owner siguen (para que pueda ver y pagar).
   - `suspendido`: todo 402 salvo login del owner (que recibe el motivo).
     Los datos NO se borran.
4. **Operador de plataforma**: los correos en la env `OPERADOR_EMAILS`
   (separados por coma) son operadores. Endpoints `/api/plataforma/clientes`
   (listar todos con su estado) y PATCH del estado (con motivo obligatorio).
   Solo cuentas nuevas (con `sub`) pueden ser operador — el login legado
   jamás. Un operador NO entra a los datos de negocio de un cliente por esto:
   el estado vive en el registro, no en la base del cliente.
5. **Frontend**: pantalla "Creá tu supermercado" (nombre → slug sugerido)
   para usuarios sin membresías; banner de gracia; pantalla de bloqueo para
   solo_lectura/suspendido con el motivo; panel mínimo del operador (lista +
   cambiar estado) visible solo si el backend dice que sos operador.

## Guardrails

- El cliente por defecto (galerias) y TODO cliente existente quedan `activo`
  sin ninguna acción (fila ausente = activo). Cero regresiones en la suite.
- La redacción de dinero por rol no cambia. El login legado no cambia.
- `expire_leases()` y demás escrituras internas del sistema NO deben romperse
  en solo_lectura: el bloqueo es a las mutaciones que llegan por HTTP de
  negocio, no a la mecánica interna de un GET permitido.
- El operador se identifica por email de cuenta verificada (sub), y la lista
  vive en env — no hay tabla de superadmins que alguien pueda escribir.

## Verificación

- [ ] Usuario nuevo sin invitación → funda su supermercado → entra como owner
- [ ] Slug reservado o duplicado → error claro, sin cliente a medias
- [ ] Tercer intento de fundar → rechazado (máx 2 por usuario)
- [ ] gracia: entra normal + `aviso_cuenta` presente
- [ ] solo_lectura: GET 200, POST de contrato 402 con mensaje
- [ ] suspendido: owner ve el motivo al entrar; worker no entra
- [ ] Cliente sin fila en estados_cliente se comporta exactamente como hoy
- [ ] No-operador llamando /api/plataforma/* → 403; legado → 403 siempre
- [ ] Suite completa verde + tsc limpio
