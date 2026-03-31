#!/bin/bash
set -e

# Déjà Vu Tacos — Demo Launcher (tmux)
# Usage: ./scripts/start.sh [language]
#   language: python (default), java, go, dotnet

LANG="${1:-python}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SESSION="dejavu-tacos"

# ── Prerequisites ──
command -v temporal >/dev/null 2>&1 || { echo "Error: temporal CLI not found. Install with: brew install temporal"; exit 1; }
command -v tmux >/dev/null 2>&1 || { echo "Error: tmux not found. Install with: brew install tmux"; exit 1; }
command -v uv >/dev/null 2>&1 || { echo "Error: uv not found. Install from: https://docs.astral.sh/uv/"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "Error: npm not found."; exit 1; }

# ── Kill existing session ──
tmux kill-session -t "$SESSION" 2>/dev/null || true

# ── Install deps ──
echo "Installing dependencies..."
cd "$ROOT_DIR"
uv sync --quiet 2>/dev/null || uv sync
(cd frontend && npm install --silent 2>/dev/null) || (cd frontend && npm install)

# ── Worker command by language ──
case "$LANG" in
  python)
    WORKER_CMD="cd $ROOT_DIR && DEJAVU_BACKEND_URL=http://localhost:8000 uv run --package dejavu-workflows worker"
    WORKER_LABEL="Worker (Python)"
    ;;
  java)
    WORKER_CMD="cd $ROOT_DIR/workflows/java && echo 'Java worker not yet implemented' && sleep infinity"
    WORKER_LABEL="Worker (Java)"
    ;;
  go)
    WORKER_CMD="cd $ROOT_DIR/workflows/go && echo 'Go worker not yet implemented' && sleep infinity"
    WORKER_LABEL="Worker (Go)"
    ;;
  dotnet)
    WORKER_CMD="cd $ROOT_DIR/workflows/dotnet && echo '.NET worker not yet implemented' && sleep infinity"
    WORKER_LABEL="Worker (.NET)"
    ;;
  *)
    echo "Unknown language: $LANG (supported: python, java, go, dotnet)"
    exit 1
    ;;
esac

# ── Create tmux session ──
# Layout:
#   ┌──────────────────────┬──────────────────────┐
#   │   Temporal Server    │   Backend (API)       │
#   ├──────────────────────┼──────────────────────┤
#   │   Worker ($LANG)     │   Frontend            │
#   └──────────────────────┴──────────────────────┘

tmux new-session -d -s "$SESSION" -n "demo" -x 200 -y 50

# Pane 0: Temporal Server
tmux send-keys -t "$SESSION" "cd $ROOT_DIR && echo '🌮 Temporal Server' && temporal server start-dev --db-filename $ROOT_DIR/temporal.db --log-level warn" Enter

# Split right: Pane 1: Backend
tmux split-window -h -t "$SESSION"
tmux send-keys -t "$SESSION" "cd $ROOT_DIR && sleep 2 && echo '🌮 Backend (API)' && uv run --package dejavu-tacos-backend server" Enter

# Split Pane 0 down: Pane 2: Worker
tmux select-pane -t "$SESSION:0.0"
tmux split-window -v -t "$SESSION"
tmux send-keys -t "$SESSION" "cd $ROOT_DIR && sleep 3 && echo '🌮 $WORKER_LABEL' && $WORKER_CMD" Enter

# Split Pane 1 down: Pane 3: Frontend
tmux select-pane -t "$SESSION:0.2"
tmux split-window -v -t "$SESSION"
tmux send-keys -t "$SESSION" "cd $ROOT_DIR/frontend && sleep 4 && echo '🌮 Frontend' && npm run dev -- --open" Enter

# Balance panes
tmux select-layout -t "$SESSION" tiled

echo ""
echo "======================================"
echo "  🌮 Déjà Vu Tacos Demo"
echo ""
echo "  Worker:     $WORKER_LABEL"
echo "  App:        http://localhost:5173"
echo "  API:        http://localhost:8000"
echo "  Temporal:   http://localhost:8233"
echo ""
echo "  Attaching tmux session..."
echo "  Tip: Ctrl+B then D to detach"
echo "  Tip: Kill worker pane to demo"
echo "        Temporal recovery"
echo "======================================"

tmux attach -t "$SESSION"
