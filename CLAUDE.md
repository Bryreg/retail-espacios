# RECABRA (retail-espacios)

Gestión de espacios comerciales en supermercados. Deploy: retail-espacios.onrender.com (Render, auto-deploy desde `main`).

**ANTES de trabajar, leé `docs/ESTADO.md`** — es el documento VIVO del proyecto: reglas duras vigentes, arquitectura actual, setup local y estado por área. Las sesiones lo mantienen actualizado con cada cambio grande; si tu cambio altera una regla o un flujo descrito ahí, actualizalo en el mismo PR.

`docs/context/` es un **snapshot histórico** (2026-08-23, previo al rename a RECABRA y a los PRs #5–#29): conserva el PORQUÉ de las decisiones tempranas (modelo dual, pintado de caras 3D, auditorías de seguridad) — útil como arqueología, no como estado actual. Ante cualquier contradicción, manda `docs/ESTADO.md` y el código.

`docs/engram/` es la **cola de entrada al store de Engram**: lo aprendido después de ese snapshot y todavía sin cargar (el rediseño de la pantalla principal, los gotchas de las sesiones de diseño). Se carga desde la máquina local, que es la que tiene Engram conectado.

Si algo «está libre y el sistema dice que está ocupado»: hay un contrato vivo
sobre un espacio que ningún plano dibuja. **Se ve en la pantalla**, en la bandeja de
Pendientes (antes Supervisar → «Para revisar») → *Contrato sin mueble en el plano*: sale el
espacio, el proveedor y hasta cuándo va, y se resuelve ahí. La cuenta la hace
`utils/auditoriaDesfase.ts` con los datos que el navegador ya bajó.
La dirección contraria —un contrato que vive sólo en el JSON del layout— está en
la misma tarjeta, como *Contrato que sólo vive en el plano*, con el botón que lo
pasa a la base (`GET`/`POST /api/layout/importacion/…`, admin-only). Esa mitad
la calcula el servidor: la fusión la pisa antes de que el navegador la vea.
Los scripts de `backend/scripts/` hacen lo mismo por consola, que en Render es
plan pago; la lógica es la misma, en `app/services/importar_del_plano.py`.

Si una cara que se vende por participación dice «tomada» (o «queda 0 %») y no
se ve nada dibujado: lo ocupado lo deciden los términos vivos —contratos y
reservas provisionales sin caducar—, nunca el dibujo. Se ve en Plano de la sede › 3D
(antes Editor 3D) → «Distribuir esta cara» (la leyenda dice contratado, dibujado y lo que falta) o
en la ficha de la cara en Indicadores (antes Supervisar). Sin participaciones vivas, la ocupa una
venta entera o por partes, o un contrato `…-PC<n>` sin término, que cuenta como
la cara entera (Pendientes → *Contrato de participación sin término*). La cuenta: `fisicos_de` y `revisar_capacidad`, en `app/services/`.

Verificación mínima: `cd frontend && npx tsc --noEmit` · `cd backend && python -c "import app.main"` · `npm install` requiere `--legacy-peer-deps`.
