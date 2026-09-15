# RECABRA (retail-espacios)

Gestión de espacios comerciales en supermercados. Deploy: retail-espacios.onrender.com (Render, auto-deploy desde `main`).

**ANTES de trabajar, leé `docs/ESTADO.md`** — es el documento VIVO del proyecto: reglas duras vigentes, arquitectura actual, setup local y estado por área. Las sesiones lo mantienen actualizado con cada cambio grande; si tu cambio altera una regla o un flujo descrito ahí, actualizalo en el mismo PR.

`docs/context/` es un **snapshot histórico** (2026-08-23, previo al rename a RECABRA y a los PRs #5–#29): conserva el PORQUÉ de las decisiones tempranas (modelo dual, pintado de caras 3D, auditorías de seguridad) — útil como arqueología, no como estado actual. Ante cualquier contradicción, manda `docs/ESTADO.md` y el código.

`docs/engram/` es la **cola de entrada al store de Engram**: lo aprendido después de ese snapshot y todavía sin cargar (el rediseño de la pantalla principal, los gotchas de las sesiones de diseño). Se carga desde la máquina local, que es la que tiene Engram conectado.

Si algo «está libre y el sistema dice que está ocupado»: hay un contrato vivo
sobre un espacio que ningún plano dibuja. **Se ve en la pantalla**, en
Supervisar → «Para revisar» → *Contrato sin mueble en el plano*: sale el
espacio, el proveedor y hasta cuándo va, y se resuelve ahí. La cuenta la hace
`utils/auditoriaDesfase.ts` con los datos que el navegador ya bajó.
`backend/scripts/auditar_desfase.py` hace lo mismo contra la base y además ve la
dirección contraria, pero necesita consola en el servidor (plan pago de Render).

Verificación mínima: `cd frontend && npx tsc --noEmit` · `cd backend && python -c "import app.main"` · `npm install` requiere `--legacy-peer-deps`.
