import express from "express";
import { API_ROUTES } from "../shared/contracts.js";
import { registerDiagnosticsRoute } from "./routes/diagnostics.js";
import { registerGameRoutes } from "./routes/game.js";
import { registerModelsRoute } from "./routes/models.js";

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

  app.use((req, res) => {
    res.status(404).json({
      error: "Not Found",
      message: "This port is API-only. Use Vite frontend at 5173.",
      path: req.path
    });
  });

  return app;
}
