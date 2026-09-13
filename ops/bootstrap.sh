#!/usr/bin/env bash
# Provision Cubench on a prepared shared VPS.
set -euo pipefail

if [[ $EUID -ne 0 || $# -ne 2 ]]; then
  echo "usage: sudo ./bootstrap.sh <domain> <deploy-public-key-file>" >&2
  exit 2
fi

domain=$1
public_key=$2
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

if [[ ! $domain =~ ^[a-zA-Z0-9.-]+$ ]]; then
  echo "invalid domain" >&2
  exit 2
fi
[[ -f $public_key ]] || { echo "public key file not found" >&2; exit 2; }
[[ -d /etc/caddy/sites ]] \
  || { echo "run bootstrap-server.sh first" >&2; exit 1; }

id cubench >/dev/null 2>&1 || adduser --disabled-password --gecos "" cubench
install -d -m 700 -o cubench -g cubench /home/cubench/.ssh
install -m 600 -o cubench -g cubench "$public_key" /home/cubench/.ssh/authorized_keys
install -d -m 755 -o cubench -g cubench \
  /opt/cubench /opt/cubench/python /opt/cubench/releases
install -d -m 700 -o cubench -g cubench /var/lib/cubench /var/backups/cubench
install -d -m 755 /etc/cubench
sudo -u cubench env UV_PYTHON_INSTALL_DIR=/opt/cubench/python \
  uv python install 3.12

if [[ ! -f /etc/cubench/cubench.env ]]; then
  invite_code=$(openssl rand -hex 32)
  install -m 600 /dev/null /etc/cubench/cubench.env
  printf '%s\n' \
    'CUBENCH_ENV=production' \
    'CUBENCH_DB_PATH=/var/lib/cubench/cubench.db' \
    "CUBENCH_INVITE_CODE=$invite_code" \
    'CUBENCH_COOKIE_SECURE=true' \
    > /etc/cubench/cubench.env
fi

install -m 755 "$script_dir/backup.sh" /usr/local/bin/cubench-backup
install -m 755 "$script_dir/deploy.sh" /usr/local/bin/cubench-deploy
install -m 644 "$script_dir/cubench.service" /etc/systemd/system/cubench.service
install -m 644 "$script_dir/cubench-backup.service" /etc/systemd/system/cubench-backup.service
install -m 644 "$script_dir/cubench-backup.timer" /etc/systemd/system/cubench-backup.timer

caddyfile=$(<"$script_dir/Caddyfile")
printf '%s\n' "${caddyfile//__CUBENCH_DOMAIN__/$domain}" \
  > /etc/caddy/sites/cubench.caddy
printf '%s\n' \
  'cubench ALL=(root) NOPASSWD: /usr/bin/systemctl restart cubench.service' \
  > /etc/sudoers.d/cubench
chmod 440 /etc/sudoers.d/cubench
visudo -cf /etc/sudoers.d/cubench
caddy validate --config /etc/caddy/Caddyfile

systemctl daemon-reload
systemctl enable cubench.service
systemctl reload caddy.service
systemctl enable --now cubench-backup.timer

echo "Cubench is ready for its first release."
