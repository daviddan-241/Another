import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { initWebSocket, broadcastCoin, broadcastStreamEnded } from "./lib/websocket";
import { startScanner, onNewCoin, onNewCoinWs, onStreamEnded, type ScannedCoin } from "./lib/scanner";
import { sendCoinAlert } from "./lib/telegram";
import { initChatRooms } from "./lib/chatrooms";
import { startAutoChat } from "./lib/autoChat";

// Telegram filter: ONLY alert on Discord coins. Never on livestream coins.
// Per user requirement: "only the discord coins get sent to my telegram, no live coin again"
function telegramDiscordOnly(coin: ScannedCoin): void {
  if (coin.hasLivestream) {
    logger.debug({ mint: coin.mint, name: coin.name }, "Skip Telegram (livestream coin)");
    return;
  }
  if (!coin.hasDiscord || !coin.discordUrl) {
    logger.debug({ mint: coin.mint, name: coin.name }, "Skip Telegram (no Discord link)");
    return;
  }
  void sendCoinAlert(coin);
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);

initWebSocket(server);
initChatRooms(server);

onNewCoin(telegramDiscordOnly);
onNewCoinWs(broadcastCoin);
onStreamEnded(broadcastStreamEnded);

// Start AutoChat module — picks up env config + listens to scanner.
// Will be a no-op if PRIVATE_KEY isn't set.
startAutoChat();

server.listen(port, "0.0.0.0", (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
  startScanner();
});
