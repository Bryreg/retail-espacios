#!/bin/sh
# La copia de prueba del manual del DUEÑO: la siembra de siempre
# (`herramientas/levantar.sh`) y, sobre esa misma base, `servidor-duenio.py`
# (tokens de prueba) + `sembrar-duenio.py` (la dueña, su equipo y un segundo
# supermercado con suscripción).
#   MANUAL_TMP=<carpeta> MANUAL_PUERTO=8793 PYTHON=<python con el backend> sh levantar-duenio.sh
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"
PUERTO="${MANUAL_PUERTO:-8790}"
PY="${PYTHON:-python3}"
pkill -f "servidor-duenio.py" 2>/dev/null || true
sh "$AQUI/../herramientas/levantar.sh"
pkill -f "uvicorn app.main:app --host 127.0.0.1 --port $PUERTO" 2>/dev/null || true
sleep 1
MANUAL_TMP="${MANUAL_TMP:-/tmp}" MANUAL_PUERTO="$PUERTO" setsid nohup "$PY" "$AQUI/servidor-duenio.py" \
  > "${MANUAL_TMP:-/tmp}/servidor-duenio-$PUERTO.log" 2>&1 < /dev/null &
for i in $(seq 1 40); do curl -sf "http://127.0.0.1:$PUERTO/api/health" >/dev/null && break; sleep 1; done
"$PY" "$AQUI/sembrar-duenio.py" "http://127.0.0.1:$PUERTO" "${MANUAL_TMP:-/tmp}/bd-$PUERTO/manual.db"
