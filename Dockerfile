FROM node:20-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/pump-scanner/package.json ./artifacts/pump-scanner/

RUN ls packages 2>/dev/null && cp -r packages /app/packages || true
COPY packages ./packages

RUN pnpm install --no-frozen-lockfile

COPY . .

RUN node artifacts/api-server/build.mjs && \
    pnpm --filter @workspace/pump-scanner run build

FROM node:20-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/pump-scanner/package.json ./artifacts/pump-scanner/
COPY packages ./packages

RUN pnpm install --no-frozen-lockfile --prod

COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=builder /app/artifacts/pump-scanner/dist ./artifacts/pump-scanner/dist

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
