#!/usr/bin/env bash
# Install one immutable release and roll back if it does not become ready.
set -euo pipefail
umask 022

readonly app_dir=/opt/cubench
readonly current="$app_dir/current"

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
previous=$(readlink -f "$current" || true)
trap 'rm -rf "$staging" "$archive" "$next"' EXIT

/usr/local/bin/cubench-backup
if [[ ! -d $release ]]; then
  mkdir "$staging"
  tar -xzf "$archive" -C "$staging"
  [[ -f "$staging/api/pyproject.toml" && -f "$staging/web/dist/index.html" ]]
  uv sync --directory "$staging/api" --frozen --no-dev --python 3.12
  mv "$staging" "$release"
fi

ln -sfn "$release" "$next"
mv -Tf "$next" "$current"
sudo /usr/bin/systemctl restart cubench.service

for _ in {1..20}; do
  if curl --fail --silent http://127.0.0.1:8000/api/health/ready >/dev/null; then
    echo "deployed $sha"
    exit 0
  fi
  sleep 1
done

if [[ -n $previous ]]; then
  ln -sfn "$previous" "$next"
  mv -Tf "$next" "$current"
  sudo /usr/bin/systemctl restart cubench.service
  echo "release failed its readiness check; restored the previous release" >&2
else
  echo "first release failed its readiness check" >&2
fi
exit 1
