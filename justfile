set dotenv-load := true

default:
    @just --list

# Install backend and frontend dependencies.
install:
    uv sync --directory api
    pnpm --dir web install --frozen-lockfile

# Run the FastAPI development server.
api:
    uv run --directory api fastapi dev src/cubench_api/main.py

# Run the Vite development server.
web:
    pnpm --dir web run dev

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
    pnpm --dir web run dev &
    web_pid=$!

    wait -n "$api_pid" "$web_pid"

# Tag and push the next release (patch by default; also accepts minor or major).
[positional-arguments]
release bump="patch":
    bash ops/release.sh "$1"

# Format frontend code, organize imports, and apply safe lint fixes.
format:
    pnpm --dir web run format

# Check frontend formatting, imports, and lint rules without changing files.
lint:
    pnpm --dir web run lint

# Run all backend tests.
test-api:
    uv run --directory api pytest

# Run all frontend tests.
test-web:
    pnpm --dir web test

# Run all backend and frontend tests.
test: test-api test-web

# Run all checks: backend tests, frontend tests, Biome, and build.
check: test-api
    pnpm --dir web run check
