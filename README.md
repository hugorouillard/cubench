# Cube Timer

A focused, keyboard-first 3x3 speedcubing timer. The local MVP uses a React
frontend, a FastAPI backend, and a SQLite database.

## Features

- Random-state 3x3 scrambles from `cubing.js`
- Spacebar hold, release, and stop timing
- Named practice sessions and persistent solve history
- `+2`, `DNF`, and solve deletion
- Mean, best single, `ao5`, and `ao12` statistics
- Daily progress chart and personal-best timeline
- Complete JSON data export

## Requirements

- Node.js 22 or newer
- Python 3.12 or newer
- [uv](https://docs.astral.sh/uv/)
- [just](https://just.systems/)

## Run locally

Install dependencies and run the complete stack:

```bash
just install
just dev
```

Alternatively, start each process separately. Start the API in one terminal:

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

Hold the spacebar until the timer turns green, release it to start, and press
space again to stop. FastAPI creates the SQLite database automatically at
`api/data/cube_timer.db` the first time it starts.

FastAPI also provides interactive API documentation at
http://localhost:8000/docs.

## How the pieces connect

- React draws the interface and measures each solve in the browser.
- React sends completed solves to URLs beginning with `/api`.
- FastAPI validates those requests and reads or writes the data.
- SQLite stores the data in a single local file.

The timer does not wait for FastAPI while it is running, so saving data cannot
affect timing accuracy.

## Checks

```bash
cd api && uv run pytest
cd web && npm run lint && npm run test && npm run build
```
