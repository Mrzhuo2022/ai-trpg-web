import { createApp } from "./server/app.js";
import { SERVER_CONFIG } from "./server/config.js";
import { createDiagnosticsStore } from "./server/stores/diagnosticStore.js";
import { createSessionStore } from "./server/stores/sessionStore.js";

const sessionStore = createSessionStore({
  sessionTtlMs: SERVER_CONFIG.sessionTtlMs,
  maxSessions: SERVER_CONFIG.maxSessions,
  maxSessionMessages: SERVER_CONFIG.maxSessionMessages,
  sessionSweepIntervalMs: SERVER_CONFIG.sessionSweepIntervalMs,
  initialLuckPoints: SERVER_CONFIG.initialLuckPoints
});

const diagnosticsStore = createDiagnosticsStore({
  maxDiagnostics: SERVER_CONFIG.maxDiagnostics
});

const app = createApp({ sessionStore, diagnosticsStore });

const startServer = (port) => {
  const server = app.listen(port, SERVER_CONFIG.host)
    .on("listening", () => {
      const { port: actualPort } = server.address();
      console.log(`AI TRPG server running at http://${SERVER_CONFIG.host === "0.0.0.0" ? "localhost" : SERVER_CONFIG.host}:${actualPort}`);
    })
    .on("error", (err) => {
      if ((err.code === "EADDRINUSE" || err.code === "EACCES") && port < 65535) {
        const nextPort = port === 0 ? 0 : port + 1;
        if (nextPort !== 0 && nextPort < SERVER_CONFIG.port + 1000) {
          console.log(`Port ${port} is unavailable, trying ${nextPort}...`);
          startServer(nextPort);
        } else if (port !== 0) {
          console.log(`Could not find a free port near ${SERVER_CONFIG.port}, trying random available port...`);
          startServer(0);
        } else {
          console.error("Failed to start server:", err);
        }
      } else {
        console.error("Failed to start server:", err);
      }
    });
};

startServer(SERVER_CONFIG.port);
