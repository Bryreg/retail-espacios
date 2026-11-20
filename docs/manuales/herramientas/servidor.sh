#!/bin/sh
# El backend REAL de RECABRA sobre una base nueva y descartable, sirviendo el
# frontend ya construido (`cd frontend && npx vite build`): la copia de la app
# de la que salen las capturas de los manuales. Nunca toca backend/retail_espacios.db.
#
# Uso: PYTHON=/ruta/al/python/con/el/backend [MANUAL_PUERTO=8790] sh servidor.sh
#      → http://127.0.0.1:$MANUAL_PUERTO
set -e
PUERTO="${MANUAL_PUERTO:-8790}"
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/../../.." && pwd)"
BASE="${MANUAL_TMP:-$(mktemp -d)}"
mkdir -p "$BASE"
rm -f "$BASE/manual.db"
cd "$RAIZ/backend"
# Correo "configurado" contra un puerto cerrado (SMTP_PORT=9): el servidor arma
# los correos de verdad —quedan en la cola, con su enlace firmado— y no sale ninguno.
ENV=test LOGIN_LEGADO=1 \
  DATABASE_URL="sqlite:///$BASE/manual.db" \
  JWT_SECRET="manual-solo-para-la-base-descartable-de-las-capturas-xxxxxxxxxxxx" \
  ADMIN_PASSWORD=admin-manual WORKER_PASSWORD=trabajador-manual \
  EMAIL_PROVIDER=smtp SMTP_HOST=127.0.0.1 SMTP_PORT=9 SMTP_USER=avisos@supermercado.example SMTP_PASSWORD=nada \
  EMAIL_API_KEY= SENTRY_DSN= LOG_FORMAT=texto \
  APP_URL="http://127.0.0.1:$PUERTO" \
  exec "${PYTHON:-python3}" -m uvicorn app.main:app --host 127.0.0.1 --port "$PUERTO"
