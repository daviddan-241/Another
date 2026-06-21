import { Router } from "express";
import { startScanner, stopScanner, isRunning, clearAll } from "../lib/scanner";

const router = Router();

router.get("/scanner/status", (_req, res) => {
  const running = isRunning();
  res.json({ running, message: running ? "Scanner is running" : "Scanner is stopped" });
});

router.post("/scanner/start", (_req, res) => {
  startScanner();
  res.json({ running: true, message: "Scanner started" });
});

router.post("/scanner/stop", (_req, res) => {
  stopScanner();
  res.json({ running: false, message: "Scanner stopped" });
});

// Hard reset: stop, wipe in-memory cache + stats, restart.
// Use after deploying changes so old state is purged.
router.post("/scanner/restart", (_req, res) => {
  stopScanner();
  clearAll();
  startScanner();
  res.json({ running: true, message: "Scanner restarted from a clean state" });
});

export default router;
