#!/bin/sh
# Backend real de la app sobre una base nueva, sólo para la versión final del dibujo.
cd /home/user/retail-espacios/backend
LOGIN_LEGADO=1 DATABASE_URL=sqlite:////tmp/claude-0/-home-user-retail-espacios/7442c445-f376-5dad-8c63-d4539f4e40c0/scratchpad/final/bd-final.db ADMIN_PASSWORD=admin123 WORKER_PASSWORD=galerias setsid nohup /tmp/claude-0/-home-user-retail-espacios/7442c445-f376-5dad-8c63-d4539f4e40c0/scratchpad/venv/bin/uvicorn app.main:app --port 8744 > /tmp/claude-0/-home-user-retail-espacios/7442c445-f376-5dad-8c63-d4539f4e40c0/scratchpad/final/backend.log 2>&1 < /dev/null &
echo $! > /tmp/claude-0/-home-user-retail-espacios/7442c445-f376-5dad-8c63-d4539f4e40c0/scratchpad/final/back.pid
