#!/usr/bin/env node
/**
 * Dev wrapper for Replit Expo apps.
 *
 * Replit health-checks /status on the assigned PORT before considering the
 * workflow "started". Metro takes 60-120s to actually bind its web port, so we
 * open a lightweight HTTP server on PORT immediately (returns /status = ok),
 * proxy all other traffic to Metro on PORT+1, and wait for Metro to be ready.
 */
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");

const PORT = parseInt(process.env["PORT"] ?? "26182", 10);
const METRO_PORT = PORT + 1; // Metro web on 26183
const projectRoot = path.resolve(__dirname, "..");

let metroReady = false;

// ── Lightweight status + proxy server on PORT ──────────────────────────────
function proxyToMetro(req, res) {
  const options = {
    hostname: "127.0.0.1",
    port: METRO_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `localhost:${METRO_PORT}` },
  };

  const proxy = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxy.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "starting", message: "Metro is loading — retry in a moment" }));
    }
  });

  req.pipe(proxy, { end: true });
}

const server = http.createServer((req, res) => {
  if (req.url === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", metro: metroReady ? "ready" : "starting" }));
    return;
  }
  proxyToMetro(req, res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[dev] Proxy server ready on port ${PORT}`);
  console.log(`[dev] Starting Metro on port ${METRO_PORT}...`);
  startMetro();
});

// ── Metro bundler on METRO_PORT ────────────────────────────────────────────
function startMetro() {
  const env = {
    ...process.env,
    EXPO_PACKAGER_PROXY_URL: `https://${process.env["REPLIT_EXPO_DEV_DOMAIN"] ?? ""}`,
    EXPO_PUBLIC_DOMAIN: process.env["REPLIT_DEV_DOMAIN"] ?? "",
    EXPO_PUBLIC_REPL_ID: process.env["REPL_ID"] ?? "",
    REACT_NATIVE_PACKAGER_HOSTNAME: process.env["REPLIT_DEV_DOMAIN"] ?? "",
  };

  const metro = spawn(
    "pnpm",
    ["exec", "expo", "start", "--localhost", "--port", String(METRO_PORT)],
    { cwd: projectRoot, env, stdio: "inherit" }
  );

  // Poll until Metro HTTP server actually accepts connections
  const poll = setInterval(() => {
    const req = http.get(
      { hostname: "127.0.0.1", port: METRO_PORT, path: "/status", timeout: 2000 },
      (res) => {
        res.resume();
        if (!metroReady) {
          metroReady = true;
          clearInterval(poll);
          console.log(`[dev] Metro is ready on port ${METRO_PORT}`);
        }
      }
    );
    req.on("error", () => {}); // not ready yet, keep polling
    req.end();
  }, 3000);

  metro.on("exit", (code) => {
    clearInterval(poll);
    server.close();
    process.exit(code ?? 0);
  });

  process.on("SIGTERM", () => metro.kill("SIGTERM"));
  process.on("SIGINT", () => metro.kill("SIGINT"));
}
