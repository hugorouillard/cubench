#!/usr/bin/env bash
# Install one immutable release and roll back if it does not become ready.
set -euo pipefail
umask 022

readonly app_dir=/opt/cubench
readonly current="$app_dir/current"
export UV_PYTHON_DOWNLOADS=never
export UV_PYTHON_INSTALL_DIR="$app_dir/python"

wait_until_ready() {
  # Allow systemd and Uvicorn time to start before testing readiness.
  for _ in {1..20}; do
    if curl --fail --silent http://127.0.0.1:8000/api/health/ready >/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

if [[ $(id -un) != "cubench" || $# -ne 2 ]]; then
  echo "usage: cubench-deploy <40-character-git-sha> <release-archive>" >&2
  exit 2
fi

sha=$1
archive=$2
if [[ ! $sha =~ ^[0-9a-f]{40}$ || ! -f $archive ]]; then
  echo "invalid release SHA or archive" >&2
  exit 2
fi

exec 9>"$app_dir/deploy.lock"
flock -n 9 || { echo "another deployment is running" >&2; exit 1; }

release="$app_dir/releases/$sha"
staging="$release.tmp.$$"
next="$app_dir/current.next"
prepared="$release/.prepared"
previous=$(readlink -e "$current" || true)
trap 'rm -rf "$staging" "$archive" "$next"' EXIT

/usr/local/bin/cubench-backup
if [[ ! -f $prepared ]]; then
  rm -rf "$release"
  mkdir "$staging"
  tar -xzf "$archive" -C "$staging"
  [[ -f "$staging/api/pyproject.toml" && -f "$staging/web/dist/index.html" ]]
  mv "$staging" "$release"
  uv sync --directory "$release/api" --frozen --no-dev --python 3.12
  touch "$prepared"
fi

ln -sfn "$release" "$next"
mv -Tf "$next" "$current"
sudo /usr/bin/systemctl restart cubench.service

if wait_until_ready; then
  echo "deployed $sha"
  exit 0
fi

if [[ -n $previous ]]; then
  ln -sfn "$previous" "$next"
  mv -Tf "$next" "$current"
  sudo /usr/bin/systemctl restart cubench.service
  if wait_until_ready; then
    echo "release failed its readiness check; restored the previous release" >&2
  else
    echo "release and rollback both failed their readiness checks" >&2
  fi
else
  echo "first release failed its readiness check" >&2
fi
exit 1
