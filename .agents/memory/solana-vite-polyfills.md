---
name: Solana wallet adapter in Vite
description: @solana/web3.js and wallet adapter packages need Node.js polyfills in Vite browser builds
---

`@solana/web3.js` and `@solana/wallet-adapter-*` import Node.js built-ins (buffer, crypto, stream, util) that Vite externalizes by default, causing runtime errors.

**Rule:** Add `vite-plugin-node-polyfills` as a devDependency and include it as the first plugin in vite.config.ts: `nodePolyfills({ include: ["buffer", "crypto", "stream", "util"] })`.

**Why:** Vite's browser build cannot use Node.js built-ins. The polyfill plugin injects browser-compatible shims so wallet adapter code runs without errors.

**How to apply:** Any Vite app using Solana wallet adapter needs this plugin. Install with `pnpm --filter @workspace/<pkg> add -D vite-plugin-node-polyfills`.
