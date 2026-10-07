# Operations

Cubench shares one Ubuntu 26.04 VPS with other applications.

| File | Purpose |
| --- | --- |
| `bootstrap-server.sh` | Once per VPS: install shared tools, Caddy, and UFW. |
| `bootstrap.sh` | Once for Cubench: install its user, service, site, and backups. |
| `release.sh` | Locally bump the Git tag, confirm, and push a release from master. |
| `deploy.sh` | Activate a tagged release and roll back failed health checks. |
| `backup.sh` | Create, verify, compress, and rotate SQLite backups. |
| `Caddyfile` | Cubench site fragment; routes its domain only. |
| `cubench.service` | Run the API as the isolated `cubench` user. |
| `cubench-backup.*` | Run database backups daily. |

Initial setup:

```bash
sudo ./bootstrap-server.sh 22
sudo ./bootstrap.sh cubench.hugorouillard.dev /path/to/deploy-key.pub
```

Future applications add their own user, directories, services, and file under
`/etc/caddy/sites/`. They share only Caddy and public ports 80/443.

Python and production dependencies are provisioned with `uv`. The systemd
service launches Uvicorn directly from the prepared release's virtualenv, so
restarts do not resolve dependencies or require network access.

## Release

Merge changes into `master`, then release from a clean checkout synchronized
with `origin/master`:

```bash
git switch master
git pull --ff-only
just release        # v0.1.3 -> v0.1.4
# just release minor  # v0.1.3 -> v0.2.0
# just release major  # v0.1.3 -> v1.0.0
```

The helper fetches origin's master and tags, finds the highest stable `vX.Y.Z`
tag (ignoring prereleases), shows commits since that tag, and asks for
confirmation before creating and pushing an annotated tag. Git tags are the
version source of truth; package versions are not changed. You can also run
`bash ops/release.sh [patch|minor|major]` directly.

During the 0.x phase, use patches for routine improvements and fixes, minors
for deliberate milestones, and choose 1.0 explicitly. Tags are immutable;
fix a failed release with a new patch version instead of moving an existing
tag. If a tag push fails, the helper keeps the local tag: inspect the remote
before retrying the push or deleting an unpushed local tag.

Local `just check` is optional before releasing: GitHub Actions validates the
tagged application before deploying. The helper prints the deployment workflow
link after pushing; a successful push does not mean deployment has finished.

## Test the release helper

These tests use disposable local Git repositories, without contacting GitHub
or deploying anything:

```bash
uv run --directory api python -m unittest discover -s ../ops/tests -v
```
