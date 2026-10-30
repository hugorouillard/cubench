# Development

[Back to the README](../README.md)

Run the commands below from the repository root unless noted otherwise.

## Requirements

- Node.js 24 or newer
- [pnpm](https://pnpm.io/installation) (version pinned in `web/package.json`)
- Python 3.12 or newer
- [uv](https://docs.astral.sh/uv/)
- [just](https://just.systems/)

## Local setup

```bash
git clone https://github.com/hugorouillard/cubench.git
cd cubench
cp .env.example .env
just install
just dev
```

In `.env`, replace `CUBENCH_INVITE_CODE` with a code of your choosing to enable
local registration. Enter that same code in the app's **create account** form.

For testing with a real account, development mode automatically creates one
with the **same sample solve history as the preview**. Run the app and sign in
at `/login` with username `cubench_dev` and password `dev-password`.

## Useful commands

```bash
just install   # install deps
just dev       # start dev instance
just test      # run all backend and frontend tests
just format    # format frontend code, organize imports, and apply safe lint fixes
just lint      # check frontend formatting, imports, and lint rules
just check     # run all tests, Biome checks, and production build
```

## Formatting and linting

Frontend formatting and linting use Biome's defaults in `web/biome.json`.
The sole rule exception allows intentional ARIA groups without requiring form
fieldsets. CI and deployment run the same read-only Biome checks through
`just check`'s frontend equivalent. Run `just format` before committing; for
editor integration, use the Biome extension with the project's local version.

## Tests

Before running browser tests for the first time, install Playwright's Chromium
browser and system dependencies (repeat after a Playwright upgrade):

```bash
pnpm --dir web exec playwright install --with-deps chromium
```

`just test` and `just check` cover the whole project. Their pnpm equivalents,
`pnpm --dir web test` and `pnpm --dir web run check`, cover only the frontend.
Both test commands include unit tests, timezone variations, and Playwright E2E tests.

For targeted runs:

```bash
just test-api                              # backend tests
just test-web                              # all frontend tests
pnpm --dir web run test:unit                # all unit tests, including timezone variations
pnpm --dir web run test:unit:default        # unit tests in the default timezone only
pnpm --dir web run test:unit:timezones       # timezone-sensitive unit tests in New York and Auckland
pnpm --dir web run test:e2e                 # browser tests only
```

## Dependencies

`just install` uses the committed pnpm lockfile without updating it. To change
frontend dependencies, use `pnpm --dir web add` or `pnpm --dir web remove` and
commit both `web/package.json` and `web/pnpm-lock.yaml`.
