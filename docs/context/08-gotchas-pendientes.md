# Gotchas de tooling y pendientes del proyecto

> Engram #339 · `tooling/gotchas` · **snapshot histórico 2026-08-23 — el estado vigente está en [docs/ESTADO.md](../ESTADO.md)**

**Gotchas**:
- `npm install` requiere `--legacy-peer-deps` (conflicto preexistente drei@10 ↔ fiber@8; upgrade a fiber@9 diferido deliberadamente).
- `gentle-ai review start` FALLA en este repo en Windows: error "reparse point" (junctions de node_modules). Workaround usado: revisión 4R / lente único con agentes + refutador según el tier del diff.
- Engram: `.engram/config.json` requiere clave `project_name` (no `project`); en la máquina local el cwd Desktop tiene múltiples repos → pasar `project: "retail-espacios"` explícito o usar mem_session_start con directory.
- Rutas de lista FastAPI necesitan trailing slash o el catch-all SPA devuelve 404 HTML.
- render.yaml `generateValue` NO aplica (servicio creado manualmente, no Blueprint) — env vars se agregan a mano en el dashboard de Render.
- create_all no altera tablas existentes: cambios de esquema = solo tablas nuevas.

**Pendientes del usuario**: 1) setear SMTP_USER/SMTP_PASSWORD (app password Gmail) + notify_emails para activar correos; 2) cambiar claves default admin123/galerias desde Configuración; 3) considerar limpiar la data sintética con el backup cuando termine la prueba.

**Auditorías realizadas**: 4R completa al paquete de 8 features (7 hallazgos corregidos: JWT forjable, precios solo-UI, sendBeacon muerto, isDoubleGondola divergente, content-type spoofing, login sin rate limit, rotationSteps duplicado) + lentes de confiabilidad por cada work-unit posterior (face-images case-sensitivity crítico corregido, KPIs reserved/maintenance, etc.).
