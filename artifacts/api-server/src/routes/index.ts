import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pumpfunRouter from "./pumpfun";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pumpfunRouter);

export default router;
