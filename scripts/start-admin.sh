#!/usr/bin/env bash
set -euo pipefail
set +x

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

for tool in ruby gem node npm python3; do
  command -v "$tool" >/dev/null || { printf 'Install %s before running this script.\n' "$tool" >&2; exit 1; }
done

umask 077
local_dir="$PWD/../.local"
private_dir="$local_dir/admin-private"
deps_dir="$local_dir/admin-deps"
mkdir -p "$deps_dir"

export NODE_ENV=development ADMIN_ALLOW_LOCAL_HTTP=1 ADMIN_ORIGIN=http://localhost:4100 ADMIN_PORT=4100
export ADMIN_ACCESS_FILE="$private_dir/access.json"
if [[ ! -r "$ADMIN_ACCESS_FILE" ]]; then
  printf 'Install the team access verifier at %s before starting the editor.\n' "$ADMIN_ACCESS_FILE" >&2
  exit 1
fi
if [[ "${ADMIN_GITHUB_AUTH_STDIN:-}" == 1 ]]; then
  IFS= read -r github_token
fi

# Keep the platform-specific Ruby lockfile and installed gems in local storage.
export GEM_HOME="$deps_dir/gems"
export PATH="$GEM_HOME/bin:$PATH"
export BUNDLE_GEMFILE="$deps_dir/Gemfile"
export BUNDLE_PATH="$GEM_HOME"
bundler_version=$(awk '/^BUNDLED WITH$/{getline; print $1}' Gemfile.lock)
if ! gem list --installed bundler --version "$bundler_version" >/dev/null; then
  gem install bundler --version "$bundler_version" --no-document
fi
bundle=(bundle "_${bundler_version}_")
if ! cmp -s Gemfile "$BUNDLE_GEMFILE" || ! cmp -s Gemfile.lock "$deps_dir/upstream.lock" || [[ ! -f "$deps_dir/Gemfile.lock" ]]; then
  cp Gemfile "$BUNDLE_GEMFILE"
  cp Gemfile.lock "$deps_dir/Gemfile.lock"
  BUNDLE_FROZEN=false "${bundle[@]}" lock --add-platform "$(ruby -e 'print Gem::Platform.local')"
  cp Gemfile.lock "$deps_dir/upstream.lock"
fi
export BUNDLE_FROZEN=true
"${bundle[@]}" check || "${bundle[@]}" install

pnpm_package=$(node -p 'require("./package.json").packageManager')
pnpm=(npx --yes --package "$pnpm_package" -- pnpm)
"${pnpm[@]}" install --frozen-lockfile --ignore-scripts
"${pnpm[@]}" exec playwright install chromium

python="$deps_dir/python/bin/python"
[[ -x "$python" ]] || python3 -m venv "$deps_dir/python"
"$python" -m pip install --disable-pip-version-check -r admin-service/requirements-media.txt
export ADMIN_PYTHON_EXECUTABLE="$python"

printf 'Open %s/admin/ and enter the team access code. Press Ctrl+C to stop.\n' "$ADMIN_ORIGIN"
if [[ "${ADMIN_GITHUB_AUTH_STDIN:-}" == 1 ]]; then
  exec node admin-service/start.mjs <<< "$github_token"
fi
exec node admin-service/start.mjs
