from __future__ import annotations

import os

import uvicorn


def run() -> None:
    """Entry point for `uv run --package dejavu-tacos-backend server`."""
    reload = os.environ.get("DEJAVU_RELOAD", "1") == "1"
    uvicorn.run(
        "dejavu_tacos.api.routes:app",
        host="0.0.0.0",
        port=8000,
        reload=reload,
    )


if __name__ == "__main__":
    run()
