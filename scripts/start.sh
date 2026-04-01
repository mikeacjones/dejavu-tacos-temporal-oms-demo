#!/bin/bash
set -e

# Déjà Vu Tacos — Demo Launcher
# Usage: ./scripts/start.sh [language]
#   language: python (default), java, go, dotnet
#
# Prefers Docker for backend/worker/frontend.
# Falls back to running everything locally if Docker isn't available.
# Temporal CLI dev server always runs on the host.

LANG="${1:-python}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MISSING=()

# ── Check Temporal CLI (always required) ──
command -v temporal >/dev/null 2>&1 || MISSING+=("temporal CLI  — brew install temporal")

# ── Determine mode ──
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  MODE="docker"
else
  command -v uv >/dev/null 2>&1 || MISSING+=("uv           — https://docs.astral.sh/uv/")
  command -v npm >/dev/null 2>&1 || MISSING+=("node/npm     — https://nodejs.org/")
  MODE="local"
fi

# ── Bail if anything is missing ──
if [ ${#MISSING[@]} -gt 0 ]; then
  echo "Missing required tools:"
  echo ""
  for m in "${MISSING[@]}"; do
    echo "  ✗ $m"
  done
  echo ""
  echo "Install the above and try again."
  exit 1
fi

# ── Worker command by language (local mode only) ──
case "$LANG" in
  python)
    WORKER_CMD="DEJAVU_BACKEND_URL=http://localhost:8000 uv run --package dejavu-workflows worker"
    WORKER_LABEL="Python"
    ;;
  java)
    WORKER_CMD="echo 'Java worker not yet implemented' && sleep infinity"
    WORKER_LABEL="Java"
    ;;
  go)
    WORKER_CMD="cd $ROOT_DIR/workflows/go && DEJAVU_BACKEND_URL=http://localhost:8000 go run ./cmd/worker/"
    WORKER_LABEL="Go"
    ;;
  dotnet)
    WORKER_CMD="echo '.NET worker not yet implemented' && sleep infinity"
    WORKER_LABEL=".NET"
    ;;
  *)
    echo "Unknown language: $LANG (supported: python, java, go, dotnet)"
    exit 1
    ;;
esac

cd "$ROOT_DIR"
PIDS=()

cleanup() {
  echo ""
  echo "Shutting down..."
  if [ "$MODE" = "docker" ]; then
    docker compose down 2>/dev/null || true
  fi
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null
  echo "Done."
  exit 0
}
trap cleanup SIGINT SIGTERM

echo "======================================"
echo "  🌮 Déjà Vu Tacos Demo Launcher"
echo "======================================"
echo ""

# ── Start Temporal dev server (always on host) ──
echo "Starting Temporal dev server..."
temporal server start-dev --db-filename "$ROOT_DIR/temporal.db" --log-level warn &
PIDS+=($!)

echo "Waiting for Temporal..."
for i in $(seq 1 15); do
  if temporal operator namespace describe default >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# ═══════════════════════════════════════════
if [ "$MODE" = "docker" ]; then
# ═══════════════════════════════════════════

  # Stop the default Python worker if using a different language
  DOCKER_PROFILE=""
  WORKER_SERVICE="worker-python"
  if [ "$LANG" != "python" ]; then
    DOCKER_PROFILE="--profile $LANG"
    WORKER_SERVICE="worker-$LANG"
  fi

  echo "Starting Docker containers ($WORKER_LABEL worker)..."
  DEJAVU_WORKER_LANGUAGE="$LANG" docker compose $DOCKER_PROFILE up --build -d
  # If using a non-default worker, stop the default Python one
  if [ "$LANG" != "python" ]; then
    docker compose stop worker-python 2>/dev/null || true
  fi

  echo ""
  echo "======================================"
  echo "  🌮 Déjà Vu Tacos is running!"
  echo ""
  echo "  Worker:     $WORKER_LABEL"
  echo "  App:        http://localhost:5173"
  echo "  API:        http://localhost:8000"
  echo "  Temporal:   http://localhost:8233"
  echo ""
  echo "  Ctrl+C to stop everything"
  echo ""
  echo "  docker compose logs -f $WORKER_SERVICE"
  echo "  docker compose restart $WORKER_SERVICE"
  echo "======================================"

  # Wait quietly
  while true; do sleep 1; done

# ═══════════════════════════════════════════
else
# ═══════════════════════════════════════════

  echo "Installing dependencies..."
  uv sync --quiet 2>/dev/null || uv sync
  (cd frontend && npm install --silent 2>/dev/null) || (cd frontend && npm install)

  echo "Starting backend..."
  DEJAVU_WORKER_LANGUAGE="$LANG" uv run --package dejavu-tacos-backend server &
  PIDS+=($!)

  echo "Waiting for backend..."
  for i in $(seq 1 15); do
    if curl -s http://localhost:8000/api/health >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  echo "Starting worker ($WORKER_LABEL)..."
  bash -c "cd $ROOT_DIR && $WORKER_CMD" &
  PIDS+=($!)

  echo "Starting frontend..."
  (cd "$ROOT_DIR/frontend" && npm run dev -- --open) &
  PIDS+=($!)

  echo ""
  echo "======================================"
  echo "  🌮 Déjà Vu Tacos is running!"
  echo ""
  echo "  Worker:     $WORKER_LABEL"
  echo "  App:        http://localhost:5173"
  echo "  API:        http://localhost:8000"
  echo "  Temporal:   http://localhost:8233"
  echo ""
  echo "  Ctrl+C to stop all services"
  echo "======================================"

  wait
fi
