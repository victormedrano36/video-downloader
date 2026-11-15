FROM node:24-alpine AS build
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app

RUN apk add --no-cache git python3 alpine-sdk && corepack enable

# Keep the upstream code and dependency lockfile reproducible.
RUN git init . \
    && git remote add origin https://github.com/imputnet/cobalt.git \
    && git fetch --depth 1 origin a636575b09de1fc55d9b8cd98cac88f5f2f16b42 \
    && git checkout --detach FETCH_HEAD

COPY cobalt-youtube.patch /tmp/cobalt-youtube.patch
RUN git apply --check /tmp/cobalt-youtube.patch && git apply /tmp/cobalt-youtube.patch
RUN pnpm install --prod --frozen-lockfile --filter @imput/cobalt-api...

COPY test-streams.mjs /app/api/test-streams.mjs
RUN API_URL=http://127.0.0.1:9000 node --test api/test-streams.mjs
RUN pnpm deploy --filter=@imput/cobalt-api --prod /prod/api

FROM node:24-alpine AS api
WORKDIR /app
COPY --from=build --chown=node:node /prod/api /app
COPY --from=build --chown=node:node /app/.git /app/.git

# Native VISIONOS support in youtubei.js 18.1.0 fixes the rejected IOS URLs.
ENV CUSTOM_INNERTUBE_CLIENT=VISIONOS
USER node
EXPOSE 9000
CMD ["node", "src/cobalt.js"]
