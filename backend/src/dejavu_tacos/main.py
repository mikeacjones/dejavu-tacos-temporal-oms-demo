from __future__ import annotations

import uvicorn


def run() -> None:
    """Entry point for `uv run --package dejavu-tacos-backend server`."""
    uvicorn.run(
        "dejavu_tacos.api.routes:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )


if __name__ == "__main__":
    run()
