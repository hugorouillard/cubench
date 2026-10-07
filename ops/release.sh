#!/usr/bin/env bash
# Create and push the next release tag; GitHub Actions handles deployment.
set -euo pipefail

fail() {
  echo "release: $*" >&2
  exit 1
}

bump=${1:-patch}
if (( $# > 1 )) || [[ ! $bump =~ ^(patch|minor|major)$ ]]; then
  fail "usage: bash ops/release.sh [patch|minor|major]"
fi

check_worktree() {
  [[ $(git branch --show-current) == master ]] || fail "switch to master first"
  [[ -z $(git status --porcelain) ]] || fail "working tree must be clean (including untracked files)"
}

check_worktree
git fetch origin --tags '+refs/heads/master:refs/remotes/origin/master'
release_sha=$(git rev-parse HEAD)
[[ $release_sha == "$(git rev-parse refs/remotes/origin/master)" ]] \
  || fail "master must match origin/master; pull or push your changes first"

# Ignore prereleases and unrelated tags; Git's version sort handles v0.1.10.
latest=""
while IFS= read -r tag; do
  if [[ $tag =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
    latest=$tag
    major=${BASH_REMATCH[1]}
    minor=${BASH_REMATCH[2]}
    patch=${BASH_REMATCH[3]}
    break
  fi
done < <(git tag --list --sort=-version:refname)
[[ -n $latest ]] || fail "no stable vX.Y.Z tag found; create the initial release tag manually"
git merge-base --is-ancestor "$latest" "$release_sha" \
  || fail "latest release $latest is not in master's history"

case $bump in
  patch) patch=$((patch + 1)) ;;
  minor) minor=$((minor + 1)); patch=0 ;;
  major) major=$((major + 1)); minor=0; patch=0 ;;
esac
next="v$major.$minor.$patch"
git show-ref --verify --quiet "refs/tags/$next" && fail "tag $next already exists"

printf '\nChanges since %s:\n' "$latest"
git --no-pager log --oneline "$latest..$release_sha"
printf '\nRelease %s from master at %s? [y/N] ' "$next" "${release_sha:0:7}"
answer=""
if ! IFS= read -r answer || [[ ! $answer =~ ^[yY]([eE][sS])?$ ]]; then
  echo "Release cancelled; no tag created."
  exit 0
fi

# Do not silently tag different code if the checkout changed during confirmation.
check_worktree
[[ $(git rev-parse HEAD) == "$release_sha" ]] || fail "HEAD changed; run release again"
git tag -a "$next" "$release_sha" -m "Cubench $next"
if ! git push origin "refs/tags/$next:refs/tags/$next"; then
  fail "push failed; local tag $next was kept. Inspect the remote before retrying or deleting it."
fi
printf '\nPushed %s. GitHub Actions will validate and deploy the release.\n' "$next"

# Support the usual GitHub HTTPS and SSH remote formats without requiring gh.
remote=$(git remote get-url --push origin)
case $remote in
  git@github.com:*) repository=${remote#git@github.com:} ;;
  https://github.com/*) repository=${remote#https://github.com/} ;;
  ssh://git@github.com/*) repository=${remote#ssh://git@github.com/} ;;
  *) exit 0 ;;
esac
printf 'Deployment: https://github.com/%s/actions/workflows/deploy.yml\n' "${repository%.git}"
