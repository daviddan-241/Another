import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getLogs } from "../lib/logBuffer";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/logs", (req, res) => {
  const last = Math.min(Number(req.query.last ?? 100), 300);
  res.json({ logs: getLogs(last) });
});

export default router;
