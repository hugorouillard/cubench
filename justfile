default:
    @just --list

# Install backend and frontend dependencies.
install:
    cd api && uv sync
    cd web && npm install

# Run the FastAPI development server.
api:
    cd api && uv run fastapi dev src/cubench_api/main.py

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

    (cd api && exec uv run fastapi dev src/cubench_api/main.py) &
    api_pid=$!
    (cd web && exec npm run dev) &
    web_pid=$!

    wait -n "$api_pid" "$web_pid"

# Run all backend and frontend checks.
check:
    cd api && uv run pytest
    cd web && npm run lint && npm run test && npm run build
