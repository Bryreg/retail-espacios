# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Build del frontend (React + Vite)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS frontend-build

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install --legacy-peer-deps

COPY frontend/ ./

# Config PÚBLICA de Firebase para el build de Vite: las VITE_* se hornean en
# el bundle, así que tienen que existir cuando corre `npm run build`. Render
# pasa sus variables de entorno como build-args al build de Docker, pero
# Docker solo entrega las que el Dockerfile declara con ARG — sin este bloque,
# Vite construye sin Firebase y el login degrada al legado en producción.
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

RUN apt-get update && apt-get install -y --no-install-recommends curl \
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

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/api/health || exit 1

CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1
