#!/usr/bin/env bash
# Provision a fresh Ubuntu 24.04 VPS for Cubench.
set -euo pipefail

if [[ $EUID -ne 0 || $# -lt 2 || $# -gt 3 ]]; then
  echo "usage: sudo ./bootstrap.sh <domain> <deploy-public-key-file> [ssh-port]" >&2
  exit 2
fi

domain=$1
public_key=$2
ssh_port=${3:-22}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

# shellcheck source=/etc/os-release
source /etc/os-release
if [[ $ID != "ubuntu" || $VERSION_ID != "24.04" ]]; then
  echo "bootstrap requires Ubuntu 24.04" >&2
  exit 1
fi
if [[ ! $domain =~ ^[a-zA-Z0-9.-]+$ || ! $ssh_port =~ ^[0-9]+$ ]] \
  || (( ssh_port < 1 || ssh_port > 65535 )); then
  echo "invalid domain or SSH port" >&2
  exit 2
fi
[[ -f $public_key ]] || { echo "public key file not found" >&2; exit 2; }

apt-get update
apt-get install -y caddy curl openssl python3.12 sqlite3 sudo ufw
if ! command -v uv >/dev/null; then
  curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh
fi

id cubench >/dev/null 2>&1 || adduser --disabled-password --gecos "" cubench
install -d -m 700 -o cubench -g cubench /home/cubench/.ssh
install -m 600 -o cubench -g cubench "$public_key" /home/cubench/.ssh/authorized_keys
install -d -m 755 -o cubench -g cubench /opt/cubench /opt/cubench/releases
install -d -m 700 -o cubench -g cubench /var/lib/cubench /var/backups/cubench
install -d -m 755 /etc/cubench

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
printf '%s\n' "${caddyfile//__CUBENCH_DOMAIN__/$domain}" > /etc/caddy/Caddyfile
printf '%s\n' \
  'cubench ALL=(root) NOPASSWD: /usr/bin/systemctl restart cubench.service' \
  > /etc/sudoers.d/cubench
chmod 440 /etc/sudoers.d/cubench
visudo -cf /etc/sudoers.d/cubench
caddy validate --config /etc/caddy/Caddyfile

systemctl daemon-reload
systemctl enable cubench.service
systemctl enable caddy.service
systemctl restart caddy.service
systemctl enable --now cubench-backup.timer
ufw allow "$ssh_port/tcp"
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "VPS ready. The invite code is in /etc/cubench/cubench.env."
