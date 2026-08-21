# Cubebench

A focused, keyboard-first 3x3 speedcubing timer. The local MVP uses a React
frontend, a FastAPI backend, and a SQLite database.

## Features

- Solve timer, with `+2`, `DNF`, and solve deletion.
- Mean, best single, `ao5`, and `ao12` statistics
- Persistent solve history.
- Lifetime stats such as PBs, total solves, activity, etc.

## Requirements

- Node.js 22 or newer
- Python 3.12 or newer
- [uv](https://docs.astral.sh/uv/)
- [just](https://just.systems/)

## Development

Install dependencies and run the complete stack:

```bash
just install
just dev
```

Open http://localhost:5173. Vite forwards requests beginning with `/api` to
FastAPI at http://localhost:8000.

Hold the spacebar until the timer turns green, release it to start, and press
space again to stop. FastAPI creates the SQLite database automatically at
`api/data/cubebench.db` the first time it starts.

Run checks:

```bash
just check
```
