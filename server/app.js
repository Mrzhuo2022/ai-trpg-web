import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { API_ROUTES } from "../shared/contracts.js";
import { registerDiagnosticsRoute } from "./routes/diagnostics.js";
import { registerGameRoutes } from "./routes/game.js";
import { registerModelsRoute } from "./routes/models.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = path.resolve(__dirname, "..", "dist");

export function createApp({ sessionStore, diagnosticsStore }) {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  registerModelsRoute(app);
  registerDiagnosticsRoute(app, diagnosticsStore);
  registerGameRoutes(app, { sessionStore, diagnosticsStore });

  app.get("/healthz", (req, res) => {
    res.json({
      ok: true,
      service: "ai-trpg-api",
      routes: [
        API_ROUTES.models,
        API_ROUTES.diagnosticsRecent,
        API_ROUTES.gameStartStream,
        API_ROUTES.gameActStream
      ]
    });
  });

  // 生产模式：若已构建前端（dist/ 存在），由后端托管静态资源，
  // 这样只需启动后端单进程即可访问完整应用。
  const hasStaticBuild = fs.existsSync(path.join(STATIC_DIR, "index.html"));
  if (hasStaticBuild) {
    app.use(express.static(STATIC_DIR));
    // SPA fallback：非 /api 的 GET 请求统一回退到 index.html
    app.get(/^\/(?!api).*/, (req, res, next) => {
      const indexFile = path.join(STATIC_DIR, "index.html");
      res.sendFile(indexFile, (err) => {
        if (err) next(err);
      });
    });
    console.log(`[static] 托管前端构建：${STATIC_DIR}`);
  } else {
    console.log("[static] 未发现 dist/，仅运行 API 服务（前端请用 vite 开发端口 5173）");
  }

  app.use((req, res) => {
    res.status(404).json({
      error: "Not Found",
      message: "This port is API-only. Use Vite frontend at 5173.",
      path: req.path
    });
  });

  return app;
}
