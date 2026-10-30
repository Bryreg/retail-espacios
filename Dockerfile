# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Build del frontend (React + Vite)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS frontend-build

WORKDIR /app/frontend

COPY frontend/package*.json ./
# `npm ci` y no `npm install` (auditoría P2-9): instala EXACTAMENTE el
# package-lock.json, igual que CI, y falla si el lock no coincide con
# package.json. Con `install`, cada build podía resolver otro árbol.
# --legacy-peer-deps: drei@10 pide fiber@^9 y el editor 3D está en fiber@8.
RUN npm ci --legacy-peer-deps

COPY frontend/ ./

# Config PÚBLICA de Firebase para el build de Vite: las VITE_* se hornean en
# el bundle, así que tienen que existir cuando corre `npm run build`. Render
# pasa sus variables de entorno como build-args al build de Docker, pero
# Docker solo entrega las que el Dockerfile declara con ARG — sin este bloque,
# Vite construye sin Firebase y la pantalla de ingreso queda sin puerta: el
# acceso por clave compartida está apagado desde 2026-10-01.
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID

RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Runtime — backend Python + frontend compilado
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# `pg_dump` y `gnupg`: el respaldo nocturno se toma desde adentro del servicio,
# porque la base no acepta conexiones de afuera (`services/respaldo_interno.py`,
# `POST /api/interno/respaldo`). pg_dump tiene que ser de la versión mayor del
# servidor o MÁS NUEVA, y no sabemos cuál corre Render: por eso el cliente sale
# del repositorio oficial de PostgreSQL (`postgresql-client` = la última mayor),
# no del de Debian, que puede quedar atrás de una base recién creada.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates gnupg postgresql-common \
    && (/usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y \
        || echo "Sin el repositorio de PostgreSQL: queda el cliente de Debian") \
    && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/

# Frontend compilado (main.py lo busca en /app/frontend/dist)
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Directorio de datos (se sobreescribirá con volumen en producción)
RUN mkdir -p ./backend/data

WORKDIR /app/backend

EXPOSE 8000

# Liveness: `/api/health` no toca la base (reiniciar el contenedor no arregla
# una base caída). La readiness —`SELECT 1` en el registro— es
# `/api/health/ready`, y es la que mira Render (`healthCheckPath` en render.yaml).
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/api/health || exit 1

CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1
