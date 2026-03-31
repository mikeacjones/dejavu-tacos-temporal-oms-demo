#!/bin/bash
set -e

# Déjà Vu Tacos — Demo Launcher
# Usage: ./scripts/start.sh [language]
#   language: python (default), java, go, dotnet
#
# If tmux is installed, launches in a 4-pane layout.
# Otherwise, falls back to background processes.

LANG="${1:-python}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SESSION="dejavu-tacos"

# ── Prerequisites ──
command -v temporal >/dev/null 2>&1 || { echo "Error: temporal CLI not found. Install with: brew install temporal"; exit 1; }
command -v uv >/dev/null 2>&1 || { echo "Error: uv not found. Install from: https://docs.astral.sh/uv/"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "Error: npm not found."; exit 1; }

# ── Worker command by language ──
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

# ── Install deps ──
echo "Installing dependencies..."
cd "$ROOT_DIR"
uv sync --quiet 2>/dev/null || uv sync
(cd frontend && npm install --silent 2>/dev/null) || (cd frontend && npm install)

# ── Launch ──
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
  echo "  🌮 Déjà Vu Tacos Demo (tmux)"
  echo ""
  echo "  Worker:     $WORKER_LABEL"
  echo "  App:        http://localhost:5173"
  echo "  API:        http://localhost:8000"
  echo "  Temporal:   http://localhost:8233"
  echo ""
  echo "  Attaching tmux session..."
  echo "  Ctrl+B D to detach"
  echo "  Ctrl+C in worker pane to demo recovery"
  echo "======================================"

  tmux attach -t "$SESSION"

else
  # ━━━ fallback: background processes ━━━
  PIDS=()

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
  temporal server start-dev --db-filename "$ROOT_DIR/temporal.db" --log-level warn &
  PIDS+=($!)

  echo "Waiting for Temporal..."
  sleep 2

  echo "Starting backend..."
  uv run --package dejavu-tacos-backend server &
  PIDS+=($!)

  echo "Waiting for backend..."
  for i in $(seq 1 15); do
    if curl -s http://localhost:8000/api/health >/dev/null 2>&1; then
      echo "Backend ready!"
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
  echo "  🌮 Déjà Vu Tacos Demo"
  echo ""
  echo "  Worker:     $WORKER_LABEL"
  echo "  App:        http://localhost:5173"
  echo "  API:        http://localhost:8000"
  echo "  Temporal:   http://localhost:8233"
  echo ""
  echo "  Press Ctrl+C to stop all services"
  echo "  (install tmux for split-pane mode)"
  echo "======================================"

  wait
fi
