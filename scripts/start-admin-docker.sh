#!/usr/bin/env bash
set -euo pipefail
set +x

repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
docker info >/dev/null 2>&1 || { printf 'Start Docker before running this script.\n' >&2; exit 1; }

umask 077
local_dir="$repo/../.local"
mkdir -p "$local_dir/admin-private" "$local_dir/admin-docker-deps"
if [[ ! -r "$local_dir/admin-private/access.json" ]]; then
  printf 'Copy the team access verifier to %s/admin-private/access.json before starting.\n' "$local_dir" >&2
  exit 1
fi

github_args=()
github_token=
image=ger-admin-local
case "${1:-}" in
  ''|--preview) ;;
  *) printf 'Usage: bash scripts/start-admin-docker.sh [--preview]\n' >&2; exit 1 ;;
esac
docker build -t "$image" - < "$repo/scripts/admin.Dockerfile"

case "${1:-}" in
  '')
    if command -v gh >/dev/null; then
      github_token=$(gh auth token --hostname github.com 2>/dev/null) || github_token=
    fi
    if [[ -z "$github_token" ]]; then
      github_token=$(printf 'protocol=https\nhost=github.com\npath=ARTORG-GERONTECHNOLOGY/ARTORG-GERONTECHNOLOGY.github.io.git\n\n' |
        GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never git -C "$repo" -c credential.interactive=false credential fill 2>/dev/null |
        sed -n 's/^password=//p') || github_token=
    fi
    if [[ -z "$github_token" ]]; then
      github_config="$local_dir/admin-github"
      mkdir -p "$github_config"
      github_cli=(--user "$(id -u):$(id -g)" -e GH_CONFIG_DIR=/github-config
        --mount "type=bind,src=$github_config,dst=/github-config")
      github_token=$(docker run --rm "${github_cli[@]}" "$image" gh auth token --hostname github.com 2>/dev/null) || github_token=
      if [[ -z "$github_token" ]]; then
        if [[ ! -t 0 ]]; then
          printf 'Start from an interactive terminal to sign in to GitHub, or use --preview for local drafts only.\n' >&2
          exit 1
        fi
        docker run --rm -it "${github_cli[@]}" "$image" gh auth login --hostname github.com --git-protocol https --web
        github_token=$(docker run --rm "${github_cli[@]}" "$image" gh auth token --hostname github.com)
      fi
    fi
    github_args=(-i -e ADMIN_GITHUB_AUTH_STDIN=1)
    ;;
  --preview) ;;
esac

exec docker run --rm --init --user "$(id -u):$(id -g)" \
  --publish 127.0.0.1:4100:4101 \
  --mount "type=bind,src=$repo,dst=/checkout,readonly" \
  --mount "type=bind,src=$local_dir/admin-private,dst=/work/.local/admin-private" \
  --mount "type=bind,src=$local_dir/admin-docker-deps,dst=/work/.local/admin-deps" \
  ${github_args[@]+"${github_args[@]}"} "$image" < <(printf '%s\n' "$github_token")
