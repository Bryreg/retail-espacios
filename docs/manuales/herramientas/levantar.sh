#!/bin/sh
# Levanta la copia de prueba en MANUAL_PUERTO (8790 por defecto) con una base
# nueva y la siembra. Uso: PYTHON=<python con el backend> sh levantar.sh
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"
PUERTO="${MANUAL_PUERTO:-8790}"
PY="${PYTHON:-python3}"
pkill -f "uvicorn app.main:app --host 127.0.0.1 --port $PUERTO" 2>/dev/null || true
sleep 1
LOG="${MANUAL_TMP:-/tmp}/servidor-$PUERTO.log"
MANUAL_TMP="${MANUAL_TMP:-/tmp}/bd-$PUERTO" MANUAL_PUERTO="$PUERTO" PYTHON="$PY" \
  setsid nohup sh "$AQUI/servidor.sh" > "$LOG" 2>&1 < /dev/null &
for i in $(seq 1 40); do curl -sf "http://127.0.0.1:$PUERTO/api/health" >/dev/null && break; sleep 1; done
"$PY" "$AQUI/sembrar.py" "http://127.0.0.1:$PUERTO"
