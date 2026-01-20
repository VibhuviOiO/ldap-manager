#!/bin/sh

echo "Starting LDAP Manager..."
echo "Context Path: ${CONTEXT_PATH:-/}"

# Start Vite in background, redirect output to stdout
cd /frontend && npm run dev -- --host 0.0.0.0 2>&1 | sed 's/^/[VITE] /' &

# Give Vite time to start
sleep 2

# Start FastAPI in foreground
cd /app && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
