# Deployment

Cubench runs on one Ubuntu 24.04 VPS. Caddy serves the static frontend and
proxies `/api/*` to one Uvicorn process. SQLite data and backups live outside
immutable application releases.

## Before Provisioning

Create an Ubuntu 24.04 VPS, note its IP address and SSH port, and point the
domain's `A` record at that address. Add an `AAAA` record only when IPv6 is
configured on the VPS.

Generate a dedicated, unencrypted deployment key locally. It is used only by
GitHub Actions to log in as the restricted `cubench` user.

```bash
ssh-keygen -t ed25519 -N '' -C github-actions-cubench -f ~/.ssh/cubench-deploy
```

Set these shell variables for the remaining examples:

```bash
export DOMAIN=cubench.example.com
export VPS=ubuntu@203.0.113.10
export VPS_IP=203.0.113.10
export SSH_PORT=22
```

## Provision The VPS

Upload the operational files and deployment public key, then run the bootstrap
script. Supplying the correct SSH port matters because the script enables the
firewall.

```bash
scp -P "$SSH_PORT" -r ops "$VPS:/tmp/cubench-ops"
scp -P "$SSH_PORT" ~/.ssh/cubench-deploy.pub "$VPS:/tmp/cubench-deploy.pub"
ssh -p "$SSH_PORT" "$VPS" \
  "sudo /tmp/cubench-ops/bootstrap.sh '$DOMAIN' /tmp/cubench-deploy.pub '$SSH_PORT'"
```

The script installs Caddy, Python 3.12, `uv`, SQLite, and UFW. It creates the
`cubench` account, production directories, a random invite code, systemd units,
and a Caddy site. It also permits only SSH, HTTP, and HTTPS through UFW.

Verify deployment-key access before configuring GitHub:

```bash
ssh -i ~/.ssh/cubench-deploy -p "$SSH_PORT" "cubench@$VPS_IP" true
```

## Configure GitHub

Create a GitHub environment named `production`. Add these environment secrets:

| Name | Value |
| --- | --- |
| `DEPLOY_HOST` | VPS IP address |
| `DEPLOY_USER` | `cubench` |
| `DEPLOY_SSH_KEY` | Contents of `~/.ssh/cubench-deploy` |
| `DEPLOY_KNOWN_HOSTS` | Verified `ssh-keyscan` output for the VPS |

Add `DEPLOY_PORT` as an environment variable. It defaults to `22` when absent.

Get the server's Ed25519 fingerprint over the existing administrator session:

```bash
ssh -p "$SSH_PORT" "$VPS" \
  'sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub'
```

Generate the known-hosts value for that same IP address locally and verify its
fingerprint matches before saving it in GitHub:

```bash
ssh-keyscan -p "$SSH_PORT" -t ed25519 -H "$VPS_IP" > /tmp/cubench-known-hosts
ssh-keygen -lf /tmp/cubench-known-hosts
```

Enable the VPS provider's automatic backups. The local SQLite backups protect
against application mistakes; a provider backup also protects against losing
the entire VPS.

## Release

Merge changes into `master`, then tag that exact commit. Tags are immutable;
fix a failed release with a new patch version instead of moving an existing
tag.

```bash
git switch master
git pull --ff-only
just check
git tag -a v0.1.0 -m "Cubench v0.1.0"
git push origin v0.1.0
```

The deployment workflow verifies that the tag is on `master`, reruns all
checks, builds the frontend, uploads one release archive, creates a database
backup, switches the `current` symlink, and checks readiness. A failed
readiness check restores the previous release automatically.

The first release creates a fresh schema-version-1 database. Never copy the
development `.env`, `api/data`, `.venv`, `node_modules`, or `web/dist` to the
VPS.

After deployment, open `https://DOMAIN` and verify registration, login, solve
creation, persistence after reload, logout, and login again. Read the generated
invite code with:

```bash
ssh -p "$SSH_PORT" "$VPS" \
  "sudo grep '^CUBENCH_INVITE_CODE=' /etc/cubench/cubench.env"
```

## Routine Operations

Check application health and logs:

```bash
curl --fail "https://$DOMAIN/api/health/ready"
ssh -p "$SSH_PORT" "$VPS" 'sudo systemctl status cubench caddy'
ssh -p "$SSH_PORT" "$VPS" 'sudo journalctl -u cubench -n 100 --no-pager'
```

Run and inspect backups:

```bash
ssh -p "$SSH_PORT" "$VPS" 'sudo systemctl start cubench-backup.service'
ssh -p "$SSH_PORT" "$VPS" 'sudo systemctl status cubench-backup.timer'
ssh -p "$SSH_PORT" "$VPS" 'sudo ls -lh /var/backups/cubench'
```

Daily backups use SQLite's online backup command, pass an integrity check, are
compressed, and are retained for at least 14 days.

## Restore A Backup

Log in to the VPS as its administrator and choose a backup. Stop the API before
replacing the database so no writes can race with the restore.

```bash
export BACKUP=/var/backups/cubench/cubench-20260912T120000.000000000Z.db.gz
sudo env BACKUP="$BACKUP" bash <<'SCRIPT'
set -euo pipefail
restore=/var/lib/cubench/cubench.restore.db
trap 'rm -f "$restore"; systemctl start cubench.service' EXIT

gzip -cd "$BACKUP" > "$restore"
[[ $(sqlite3 "$restore" 'PRAGMA integrity_check;') == ok ]]
[[ $(sqlite3 "$restore" 'PRAGMA user_version;') == 1 ]]
systemctl stop cubench.service
rm -f /var/lib/cubench/cubench.db-wal /var/lib/cubench/cubench.db-shm
chown cubench:cubench "$restore"
chmod 600 "$restore"
mv "$restore" /var/lib/cubench/cubench.db
systemctl start cubench.service
curl --fail --retry 20 --retry-delay 1 --retry-connrefused \
  http://127.0.0.1:8000/api/health/ready
trap - EXIT
SCRIPT
```

## Manual Rollback

Automatic rollback covers startup failures. To roll back a healthy but faulty
release, choose an earlier SHA from `/opt/cubench/releases`, then atomically
replace the current symlink:

```bash
export RELEASE_SHA=0123456789abcdef0123456789abcdef01234567
ssh -p "$SSH_PORT" "$VPS" "sudo -u cubench ln -sfn \
  /opt/cubench/releases/$RELEASE_SHA /opt/cubench/current.next"
ssh -p "$SSH_PORT" "$VPS" \
  'sudo -u cubench mv -Tf /opt/cubench/current.next /opt/cubench/current'
ssh -p "$SSH_PORT" "$VPS" 'sudo systemctl restart cubench.service'
curl --fail "https://$DOMAIN/api/health/ready"
```

This is safe while releases use the same database schema. Add an explicit
migration and rollback policy before changing `CURRENT_SCHEMA_VERSION`.
