# Cubench

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
space again to stop. FastAPI creates the versioned SQLite database at
`api/data/cubench.db` when it first starts.

Unversioned pre-release databases are intentionally not upgraded. Reset the
pre-release database to let FastAPI create the supported schema.

Set `CUBENCH_DB_PATH` to use another database. Production mode additionally
requires an absolute database path, `CUBENCH_COOKIE_SECURE=true`, and a
non-placeholder invite code.

The API exposes `/api/health/live` for liveness and `/api/health/ready` for
SQLite and schema readiness.

Run checks:

```bash
just check
```
