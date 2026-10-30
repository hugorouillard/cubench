# Cubench

A web-based speedcubing timer inspired by [Monkeytype](https://monkeytype.com/).

Open the page, start practicing, and see your progress over time.
A clean interface, thoughtful defaults, and plenty to customize when you want to.

csTimer is powerful, but getting the experience I wanted meant too much manual
setup and management. Cubench is my attempt to build that experience into the
starting point.

**[Try Cubench](https://cubench.hugorouillard.dev/)**

## Practice

![Practice page with a scramble, timer, and solve history](docs/timer.png)

## Track Progress

![Account page with personal bests, practice activity, and progression over time](docs/account-preview.png)

## Development

Built with React, TypeScript, FastAPI, and SQLite.

With the [required tools](docs/development.md#requirements) installed:

```bash
git clone https://github.com/hugorouillard/cubench.git
cd cubench
cp .env.example .env
just install
just dev
```

See the [development guide](docs/development.md) for local accounts, tests,
formatting, and dependency management.
