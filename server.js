import { createApp } from "./server/app.js";
import { SERVER_CONFIG } from "./server/config.js";
import { createDiagnosticsStore } from "./server/stores/diagnosticStore.js";
import { createSessionStore } from "./server/stores/sessionStore.js";

const sessionStore = createSessionStore({
  sessionTtlMs: SERVER_CONFIG.sessionTtlMs,
  maxSessions: SERVER_CONFIG.maxSessions,
  maxSessionMessages: SERVER_CONFIG.maxSessionMessages,
  sessionSweepIntervalMs: SERVER_CONFIG.sessionSweepIntervalMs
});

const diagnosticsStore = createDiagnosticsStore({
  maxDiagnostics: SERVER_CONFIG.maxDiagnostics
});

const app = createApp({ sessionStore, diagnosticsStore });

app.listen(SERVER_CONFIG.port, SERVER_CONFIG.host, () => {
  console.log(`AI TRPG server running at http://${SERVER_CONFIG.host}:${SERVER_CONFIG.port}`);
});
