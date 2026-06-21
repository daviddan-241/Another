import { Router } from "express";
import axios from "axios";
import { registerChatId, unregisterChatId, getRegisteredChatIds } from "../lib/telegram";

const router = Router();

const BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();

// POST /api/telegram/register  { chatId }
// Called by the frontend when the user saves their Telegram chat ID.
// Adds the chat ID to the server-side alert list so new coin alerts fire to it.
router.post("/telegram/register", (req, res) => {
  const { chatId } = req.body as { chatId?: string };
  if (!chatId?.trim()) return res.status(400).json({ error: "chatId required" });
  registerChatId(chatId.trim());
  return res.json({ ok: true, registered: getRegisteredChatIds().length });
});

// DELETE /api/telegram/register/:chatId
router.delete("/telegram/register/:chatId", (req, res) => {
  const chatId = decodeURIComponent(req.params.chatId ?? "").trim();
  unregisterChatId(chatId);
  return res.json({ ok: true });
});

// POST /api/telegram/notify  { chatId, text }
router.post("/telegram/notify", async (req, res) => {
  const { chatId, text } = req.body as { chatId?: string; text?: string };
  if (!chatId || !text) return res.status(400).json({ error: "chatId and text are required" });
  if (!BOT_TOKEN)       return res.status(503).json({ error: "Telegram bot not configured — set TELEGRAM_BOT_TOKEN in Secrets" });

  try {
    await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      { chat_id: chatId.trim(), text, parse_mode: "HTML", disable_web_page_preview: true },
      { timeout: 8000 },
    );
    return res.json({ success: true });
  } catch (err) {
    const axErr = err as { response?: { data?: unknown }; message?: string };
    const detail = axErr.response?.data ?? axErr.message ?? "Unknown error";
    req.log.warn({ chatId, detail }, "Telegram notify failed");
    return res.json({ success: false, error: String(detail).slice(0, 200) });
  }
});

// GET /api/telegram/test/:chatId
// Sends a test message and also registers the chat ID for coin alerts
router.get("/telegram/test/:chatId", async (req, res) => {
  const chatId = decodeURIComponent(req.params.chatId ?? "").trim();
  if (!BOT_TOKEN) return res.json({ ok: false, error: "Bot not configured — set TELEGRAM_BOT_TOKEN in Secrets" });
  try {
    await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        chat_id: chatId,
        text: "✅ <b>PumpRadar connected!</b>\nYou'll receive alerts here ONLY for new coins that ship with a real Discord invite (under $5K MC, any platform). Livestream-only coins will NOT be sent.",
        parse_mode: "HTML",
      },
      { timeout: 8000 },
    );
    // Auto-register so coin alerts start flowing immediately after test succeeds
    registerChatId(chatId);
    return res.json({ ok: true });
  } catch (err) {
    const axErr = err as { response?: { data?: unknown }; message?: string };
    return res.json({ ok: false, error: String(axErr.response?.data ?? axErr.message).slice(0, 200) });
  }
});

export default router;
