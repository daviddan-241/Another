#!/bin/bash
set -e
pnpm install --prefer-offline --no-frozen-lockfile --ignore-scripts
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/pump-scanner run build
