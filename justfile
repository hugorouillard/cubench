set dotenv-load := true

default:
    @just --list

# Install backend and frontend dependencies.
install:
    uv sync --directory api
    cd web && npm install

# Run the FastAPI development server.
api:
    uv run --directory api fastapi dev src/cubench_api/main.py

# Run the Vite development server.
web:
    cd web && npm run dev

# Run the complete local development stack.
dev:
    #!/usr/bin/env bash
    set -euo pipefail

    api_pid=""
    web_pid=""

    cleanup() {
      if [[ -n "$api_pid" ]]; then kill "$api_pid" 2>/dev/null || true; fi
      if [[ -n "$web_pid" ]]; then kill "$web_pid" 2>/dev/null || true; fi
      wait 2>/dev/null || true
    }
    trap cleanup EXIT INT TERM

    uv run --directory api fastapi dev src/cubench_api/main.py &
    api_pid=$!
    (cd web && exec npm run dev) &
    web_pid=$!

    wait -n "$api_pid" "$web_pid"

# Tag and push the next release (patch by default; also accepts minor or major).
[positional-arguments]
release bump="patch":
    bash ops/release.sh "$1"

# Run all backend and frontend checks.
check:
    uv run --directory api pytest
    cd web && npm run lint && npm run test && npm run build
