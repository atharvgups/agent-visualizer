# Single-container production image: builds the web app and serves it from
# the API server on one port.
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN pnpm install --frozen-lockfile
COPY shared shared
COPY server server
COPY web web
RUN pnpm --filter web build

FROM node:22-slim
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production PORT=4400 DATA_DIR=/data/runs
COPY --from=build /app /app
EXPOSE 4400
# Persistence: mount a volume at /data (e.g. `railway volume add -m /data`,
# or `docker run -v agent-viz-data:/data`).
CMD ["pnpm", "--filter", "server", "start"]
