# Data sintética sembrada en producción + backup de rollback

> Engram #338 · `testdata/seed` · **snapshot histórico 2026-08-23 — el estado vigente está en [docs/ESTADO.md](../ESTADO.md)**

**Qué**: el 2026-07-24 se sembró DATA SINTÉTICA de prueba en el deploy real a pedido del usuario: 4 sedes (TERRON/CENTRO/NORTE/POBLADO), 339 fixtures. 235 contratados cara A + 101 caras B, 43 libres (a propósito, para que el usuario los encuentre con el dashboard), 17 libres con historial viejo, 8 por vencer (5-28d), 5 vencidos, 59 leases reales, 20 proveedores (Postobón, Alpina, Frito-Lay, Nutresa, Colanta…), 40 PNGs de producto generados con PIL y subidos (face-images 1→41). random.seed(42).

**Cuidados tomados**: backup verbatim del layout PRE-seed + report.json con las listas de códigos (libres/por vencer/vencidos) en el scratchpad de la sesión local en la máquina Windows del usuario: `...\scratchpad\seed\backup_layouts_20260724_225550.json` y `seed\report.json`. notify_emails se vació durante el seeding y se restauró (estaba vacío).

**Implicación**: proveedores y contratos actuales del deploy son FICTICIOS — no tratar como datos del negocio. Para volver al estado real: PUT /api/layout/{sede} con el backup. Los contratos por vencer sembrados dispararán recordatorios legítimos cuando haya SMTP configurado.
