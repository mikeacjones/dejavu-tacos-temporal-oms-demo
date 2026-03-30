#!/bin/bash
set -e

# Déjà Vu Tacos — Demo Launcher
# Starts Temporal dev server, backend+worker, and frontend

PIDS=()

cleanup() {
    echo ""
    echo "Shutting down Déjà Vu Tacos demo..."
    for pid in "${PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null
    echo "Done."
    exit 0
}

trap cleanup SIGINT SIGTERM

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "======================================"
echo "  🌮 Déjà Vu Tacos Demo Launcher"
echo "======================================"
echo ""

# Check prerequisites
command -v temporal >/dev/null 2>&1 || { echo "Error: temporal CLI not found. Install with: brew install temporal"; exit 1; }
command -v uv >/dev/null 2>&1 || { echo "Error: uv not found. Install from: https://docs.astral.sh/uv/"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "Error: npm not found."; exit 1; }

# Install dependencies if needed
echo "Installing dependencies..."
uv sync --quiet 2>/dev/null || uv sync
(cd frontend && npm install --silent 2>/dev/null) || (cd frontend && npm install)

# Start Temporal dev server
echo "Starting Temporal dev server..."
temporal server start-dev --db-filename "$ROOT_DIR/temporal.db" --log-level warn &
PIDS+=($!)
sleep 2

# Start backend + worker (combined mode)
echo "Starting backend + Temporal worker..."
uv run --package dejavu-workflows demo &
PIDS+=($!)

# Wait for backend to be ready
echo "Waiting for backend to start..."
for i in $(seq 1 15); do
    if curl -s http://localhost:8000/api/health >/dev/null 2>&1; then
        echo "Backend ready!"
        break
    fi
    sleep 1
done

# Start frontend dev server
echo "Starting frontend..."
(cd frontend && npm run dev -- --open) &
PIDS+=($!)

echo ""
echo "======================================"
echo "  🌮 Déjà Vu Tacos is running!"
echo ""
echo "  App:        http://localhost:5173"
echo "  API:        http://localhost:8000"
echo "  Temporal:   http://localhost:8233"
echo ""
echo "  Press Ctrl+C to stop"
echo "======================================"

wait
