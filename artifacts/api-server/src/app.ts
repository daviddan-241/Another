import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// Raised body limit so big session tokens + private keys don't 413 the request.
// Typical token is ~1.5 KB; bumping to 5 MB gives us plenty of headroom.
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

app.use("/api", router);

// __dirname is set by the build banner to the dist/ directory.
// From dist/ we go up two levels (api-server → artifacts → workspace root)
// then into pump-scanner/dist/public.
const frontendDist = path.resolve(__dirname, "../../pump-scanner/dist/public");

if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist, { maxAge: "1d", etag: true }));
  // Express 5 / path-to-regexp@8 requires a regex for catch-all SPA fallback
  app.get(/.*/, (_req: Request, res: Response) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
  logger.info({ frontendDist }, "Serving frontend static files");
} else {
  logger.warn({ frontendDist }, "Frontend dist not found — run: pnpm --filter @workspace/pump-scanner run build");
  app.get("/", (_req: Request, res: Response) => {
    res.status(503).send("Frontend not built. Run: pnpm --filter @workspace/pump-scanner run build");
  });
}

export default app;
