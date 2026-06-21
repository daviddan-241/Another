import { Router, type IRouter } from "express";
import healthRouter from "./health";
import coinsRouter from "./coins";
import coinRouter from "./coin";
import scannerRouter from "./scanner";
import chatRouter from "./chat";
import devRouter from "./dev";
import portfolioRouter from "./portfolio";
import telegramRouter from "./telegram";
import configRouter from "./config";
import pushRouter from "./push";

const router: IRouter = Router();

router.use(healthRouter);
router.use(coinsRouter);
router.use(coinRouter);
router.use(scannerRouter);
router.use(chatRouter);
router.use(devRouter);
router.use(portfolioRouter);
router.use(telegramRouter);
router.use(configRouter);
router.use(pushRouter);

export default router;
