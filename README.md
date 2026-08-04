# Cube Timer

A focused, keyboard-first 3x3 speedcubing timer. The local MVP uses a React
frontend, a FastAPI backend, and a SQLite database.

## Requirements

- Node.js 22 or newer
- Python 3.12 or newer
- [uv](https://docs.astral.sh/uv/)

## Run locally

Start the API in one terminal:

```bash
cd api
uv run fastapi dev src/cube_timer_api/main.py
```

Start the web app in another terminal:

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173. Vite forwards requests beginning with `/api` to
FastAPI at http://localhost:8000.

## Checks

```bash
cd api && uv run pytest
cd web && npm run lint && npm run build
```
