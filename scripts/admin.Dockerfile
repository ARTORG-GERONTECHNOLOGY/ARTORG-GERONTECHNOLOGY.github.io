FROM node:24.22.1-bookworm-slim AS node-toolchain
FROM ruby:3.3.13-bookworm

COPY --from=node-toolchain /usr/local/bin/ /usr/local/bin/
COPY --from=node-toolchain /usr/local/lib/node_modules/ /usr/local/lib/node_modules/
RUN apt-get update \
    && apt-get install -y --no-install-recommends gh python3-venv socat \
    && npx --yes --package playwright@1.62.1 -- playwright install-deps chromium \
    && rm -rf /var/lib/apt/lists/* \
    && install -d -m 1777 /work

# npm's npx lock tracks filesystem metadata. Keep it off the host bind mount.
ENV HOME=/tmp \
    npm_config_cache=/tmp/ger-admin-npm \
    XDG_CACHE_HOME=/work/.local/admin-deps/cache \
    XDG_DATA_HOME=/work/.local/admin-deps/data

CMD ["bash", "-euo", "pipefail", "-c", "mkdir /work/site; tar -C /checkout --exclude=.git --exclude=node_modules --exclude=.bundle --exclude=./vendor --exclude=./_site --exclude=./_pages --exclude=.local --exclude='.env*' --exclude='*.pem' -cf - . | tar -C /work/site -xf -; socat TCP-LISTEN:4101,bind=0.0.0.0,reuseaddr,fork TCP:127.0.0.1:4100 & exec bash /work/site/scripts/start-admin.sh"]
