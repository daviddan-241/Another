import { Router } from "express";
import axios from "axios";
import { getCoins, getStats } from "../lib/scanner";

const router = Router();

const PUMP_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://pump.fun",
  Referer: "https://pump.fun/",
};

router.get("/coins", (req, res) => {
  const type = req.query.type as string | undefined;
  const limit = Number(req.query.limit ?? 50);
  const coins = getCoins(type, limit);
  res.json({ coins, total: coins.length });
});

router.get("/coins/stats", (_req, res) => {
  res.json(getStats());
});

// Real-time coin detail from pump.fun — market cap, reply count, live status, holders
router.get("/coins/:mint", async (req, res) => {
  const { mint } = req.params;
  try {
    const r = await axios.get(`https://frontend-api-v3.pump.fun/coins/${mint}`, {
      headers: PUMP_HEADERS,
      timeout: 8000,
    });
    return res.json(r.data);
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status ?? 502;
    return res.status(status).json({ error: "Could not fetch coin detail" });
  }
});

export default router;
