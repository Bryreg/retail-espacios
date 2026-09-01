# Arquitectura: stack y modelo de datos dual

> Engram #332 · `architecture/overview` · **snapshot histórico 2026-08-23 — el estado vigente está en [docs/ESTADO.md](../ESTADO.md)**

**Qué**: Sistema "Galerías" de gestión de espacios comerciales en supermercados. Repo github.com/Bryreg/retail-espacios, deploy Render (retail-espacios.onrender.com) auto-deploy desde main.

**Stack**: Backend FastAPI + SQLAlchemy 2 + Postgres (Render) / sqlite (dev). SIN migraciones — `Base.metadata.create_all`: solo tablas NUEVAS, jamás alterar existentes. Frontend React 18 + TS + Vite + Three.js (@react-three/fiber@8 + drei@10) + Tailwind + inline styles con CSS vars (tokens en `src/index.css`). Zustand persist (`fixtureStore`, `authStore`).

**Modelo de datos DUAL (crítico)**: los datos comerciales viven DENORMALIZADOS en cada fixture (JSON por sede en tabla `layout_snapshots`, tipo `UnifiedFixture` en `types/fixtures.ts`) Y ADEMÁS en tablas relacionales `spaces`/`space_leases`/`suppliers` cuando se pulsa "Guardar contrato" (find-or-create). El dashboard lee fixtures del store; los correos/archivos leen las tablas.

**Convención de códigos**: espacio backend = `SEDE-CODE` (editor 2D: sede cruda + "-" + code; editor 3D: sede ya incrustada en MAYÚSCULAS en fix.code). Cara B de góndola doble = código + "-B". Resolución SIEMPRE uppercase-normalizada con fallback (bug crítico corregido). Góndola doble: campos top-level = Cara A, `faceB: FaceData` = Cara B; helper compartido `isDoubleGondola()` en types (gondolaType undefined → double).

**UI en español neutro, código/comentarios en inglés.**
