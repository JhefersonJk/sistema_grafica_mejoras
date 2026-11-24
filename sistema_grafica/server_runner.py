"""Arranque sin consola, con salida y errores en server.log."""

import os
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

import uvicorn


def main():
    base_dir = Path(__file__).resolve().parent
    os.chdir(base_dir)
    with (base_dir / "server.log").open("a", buffering=1, encoding="utf-8") as log:
        with redirect_stdout(log), redirect_stderr(log):
            print("Iniciando Sistema Gráfica Ali en modo discreto")
            uvicorn.run("main:app", host="0.0.0.0", port=8000, log_level="info")


if __name__ == "__main__":
    main()
