#!/bin/bash
set -e
pnpm install --no-frozen-lockfile --ignore-scripts
pnpm --filter db push
