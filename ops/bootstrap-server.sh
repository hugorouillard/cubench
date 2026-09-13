#!/usr/bin/env bash
# Configure shared prerequisites on a fresh Ubuntu 26.04 VPS.
set -euo pipefail

if [[ $EUID -ne 0 || $# -gt 1 ]]; then
  echo "usage: sudo ./bootstrap-server.sh [ssh-port]" >&2
  exit 2
fi

ssh_port=${1:-22}
# shellcheck source=/etc/os-release
source /etc/os-release
if [[ $ID != "ubuntu" || $VERSION_ID != "26.04" ]]; then
  echo "bootstrap requires Ubuntu 26.04" >&2
  exit 1
fi
if [[ ! $ssh_port =~ ^[0-9]+$ ]] || (( ssh_port < 1 || ssh_port > 65535 )); then
  echo "invalid SSH port" >&2
  exit 2
fi

apt-get update
apt-get install -y caddy curl iproute2 openssl sqlite3 sudo ufw
if ! command -v uv >/dev/null; then
  uv_version=0.11.6
  case $(uname -m) in
    x86_64)
      uv_target=x86_64-unknown-linux-gnu
      uv_checksum=0c6bab77a67a445dc849ed5e8ee8d3cb333b6e2eba863643ce1e228075f27943
      ;;
    aarch64)
      uv_target=aarch64-unknown-linux-gnu
      uv_checksum=d5be4bf7015ea000378cb3c3aba53ba81a8673458ace9c7fa25a0be005b74802
      ;;
    *)
      echo "unsupported CPU architecture" >&2
      exit 1
      ;;
  esac
  uv_temp=$(mktemp -d)
  uv_archive="$uv_temp/uv.tar.gz"
  curl -fLsS "https://github.com/astral-sh/uv/releases/download/$uv_version/uv-$uv_target.tar.gz" -o "$uv_archive"
  printf '%s  %s\n' "$uv_checksum" "$uv_archive" | sha256sum --check
  tar -xzf "$uv_archive" -C "$uv_temp"
  install -m 755 "$uv_temp/uv-$uv_target/uv" /usr/local/bin/uv
  rm -rf "$uv_temp"
fi

install -d -m 755 /etc/caddy/sites
printf '%s\n' 'import sites/*.caddy' > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl enable caddy.service
systemctl restart caddy.service

if ! systemctl is-active --quiet ssh.service \
  && ! systemctl is-active --quiet ssh.socket; then
  echo "SSH is not active; refusing to enable UFW" >&2
  exit 1
fi
mapfile -t ssh_ports < <(/usr/sbin/sshd -T | awk '$1 == "port" { print $2 }')
if [[ ! " ${ssh_ports[*]} " == *" $ssh_port "* ]]; then
  echo "sshd is not configured for port $ssh_port; refusing to enable UFW" >&2
  exit 1
fi
if [[ -z $(ss -H -ltn "sport = :$ssh_port") ]]; then
  echo "nothing is listening on SSH port $ssh_port; refusing to enable UFW" >&2
  exit 1
fi
ufw allow "$ssh_port/tcp"
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "Shared VPS prerequisites are ready."
