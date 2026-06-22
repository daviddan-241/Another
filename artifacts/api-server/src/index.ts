import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { initWebSocket, broadcastCoin, broadcastStreamEnded } from "./lib/websocket";
import { startScanner, onNewCoin, onNewCoinWs, onStreamEnded, type ScannedCoin } from "./lib/scanner";
import { sendCoinAlert } from "./lib/telegram";
import { initChatRooms } from "./lib/chatrooms";
import { startAutoChat } from "./lib/autoChat";

// Send every new coin to Telegram — Discord + Livestream alike.
// Dev wallet is included in every alert so the user can track devs non-stop.
function telegramAllCoins(coin: ScannedCoin): void {
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

onNewCoin(telegramAllCoins);
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
