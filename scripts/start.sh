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
SESSION="dejavu-tacos"
MISSING=()

# ── Check Temporal CLI (always required) ──
command -v temporal >/dev/null 2>&1 || MISSING+=("temporal CLI  — brew install temporal")

# ── Determine mode ──
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  MODE="docker"
else
  # Local mode — need uv + node
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
    WORKER_CMD="echo 'Go worker not yet implemented' && sleep infinity"
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

# ═══════════════════════════════════════════
#  Docker mode
# ═══════════════════════════════════════════
if [ "$MODE" = "docker" ]; then

  PIDS=()
  cleanup() {
    echo ""
    echo "Shutting down..."
    docker compose down 2>/dev/null || true
    for pid in "${PIDS[@]}"; do
      kill "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null
    echo "Done."
    exit 0
  }
  trap cleanup SIGINT SIGTERM

  echo "======================================"
  echo "  🌮 Déjà Vu Tacos (Docker mode)"
  echo "======================================"
  echo ""

  # Start Temporal dev server on host
  echo "Starting Temporal dev server..."
  temporal server start-dev --db-filename "$ROOT_DIR/temporal.db" --log-level warn &
  PIDS+=($!)

  # Wait for Temporal to be ready
  echo "Waiting for Temporal..."
  for i in $(seq 1 15); do
    if temporal operator namespace describe default >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  # Build and start containers
  echo "Starting Docker containers..."
  docker compose up --build -d

  echo ""
  echo "======================================"
  echo "  🌮 Déjà Vu Tacos is running!"
  echo ""
  echo "  App:        http://localhost:5173"
  echo "  API:        http://localhost:8000"
  echo "  Temporal:   http://localhost:8233"
  echo ""
  echo "  Ctrl+C to stop everything"
  echo ""
  echo "  Logs:  docker compose logs -f"
  echo "         docker compose logs -f worker-python"
  echo "  Recovery demo:"
  echo "         docker compose restart worker-python"
  echo "======================================"

  # Wait quietly — Ctrl+C triggers cleanup
  while true; do sleep 1; done

# ═══════════════════════════════════════════
#  Local mode (tmux or background processes)
# ═══════════════════════════════════════════
else

  # Install deps
  echo "Installing dependencies..."
  uv sync --quiet 2>/dev/null || uv sync
  (cd frontend && npm install --silent 2>/dev/null) || (cd frontend && npm install)

  if command -v tmux >/dev/null 2>&1; then
    # ━━━ tmux mode ━━━
    tmux kill-session -t "$SESSION" 2>/dev/null || true

    tmux new-session -d -s "$SESSION" -n "demo" -x 200 -y 50

    # Pane 0: Temporal Server
    tmux send-keys -t "$SESSION" "cd $ROOT_DIR && echo '🌮 Temporal Server' && temporal server start-dev --db-filename $ROOT_DIR/temporal.db --log-level warn" Enter

    # Split right: Pane 1: Backend
    tmux split-window -h -t "$SESSION"
    tmux send-keys -t "$SESSION" "cd $ROOT_DIR && sleep 2 && echo '🌮 Backend (API)' && uv run --package dejavu-tacos-backend server" Enter

    # Split Pane 0 down: Pane 2: Worker
    tmux select-pane -t "$SESSION:0.0"
    tmux split-window -v -t "$SESSION"
    tmux send-keys -t "$SESSION" "cd $ROOT_DIR && sleep 3 && echo '🌮 Worker ($WORKER_LABEL)' && $WORKER_CMD" Enter

    # Split Pane 1 down: Pane 3: Frontend
    tmux select-pane -t "$SESSION:0.2"
    tmux split-window -v -t "$SESSION"
    tmux send-keys -t "$SESSION" "cd $ROOT_DIR/frontend && sleep 4 && echo '🌮 Frontend' && npm run dev -- --open" Enter

    tmux select-layout -t "$SESSION" tiled

    echo ""
    echo "======================================"
    echo "  🌮 Déjà Vu Tacos (tmux mode)"
    echo ""
    echo "  Worker:     $WORKER_LABEL"
    echo "  App:        http://localhost:5173"
    echo "  API:        http://localhost:8000"
    echo "  Temporal:   http://localhost:8233"
    echo ""
    echo "  Ctrl+B D to detach"
    echo "  Ctrl+C in worker pane to demo recovery"
    echo "======================================"

    tmux attach -t "$SESSION"

  else
    # ━━━ background processes (logs to files) ━━━
    PIDS=()
    LOG_DIR="$ROOT_DIR/.logs"
    mkdir -p "$LOG_DIR"

    cleanup() {
      echo ""
      echo "Shutting down..."
      for pid in "${PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
      done
      wait 2>/dev/null
      echo "Done."
      exit 0
    }
    trap cleanup SIGINT SIGTERM

    echo "Starting Temporal dev server..."
    temporal server start-dev --db-filename "$ROOT_DIR/temporal.db" --log-level warn \
      > "$LOG_DIR/temporal.log" 2>&1 &
    PIDS+=($!)

    echo "Waiting for Temporal..."
    sleep 2

    echo "Starting backend..."
    uv run --package dejavu-tacos-backend server \
      > "$LOG_DIR/backend.log" 2>&1 &
    PIDS+=($!)

    echo "Waiting for backend..."
    for i in $(seq 1 15); do
      if curl -s http://localhost:8000/api/health >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done

    echo "Starting worker ($WORKER_LABEL)..."
    bash -c "cd $ROOT_DIR && $WORKER_CMD" \
      > "$LOG_DIR/worker.log" 2>&1 &
    PIDS+=($!)

    echo "Starting frontend..."
    (cd "$ROOT_DIR/frontend" && npm run dev -- --open) \
      > "$LOG_DIR/frontend.log" 2>&1 &
    PIDS+=($!)

    echo ""
    echo "======================================"
    echo "  🌮 Déjà Vu Tacos"
    echo ""
    echo "  Worker:     $WORKER_LABEL"
    echo "  App:        http://localhost:5173"
    echo "  API:        http://localhost:8000"
    echo "  Temporal:   http://localhost:8233"
    echo ""
    echo "  Ctrl+C to stop all services"
    echo ""
    echo "  Logs:  tail -f .logs/backend.log"
    echo "         tail -f .logs/worker.log"
    echo "         tail -f .logs/temporal.log"
    echo "         tail -f .logs/frontend.log"
    echo "======================================"

    # Wait quietly
    while true; do sleep 1; done
  fi
fi
