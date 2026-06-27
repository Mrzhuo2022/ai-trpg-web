export function envPositiveInt(name, fallback) {
  const raw = process.env[name];
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

export const SERVER_CONFIG = Object.freeze({
  port: process.env.PORT || 3157,
  host: (process.env.HOST || "127.0.0.1").trim() || "127.0.0.1",
  sessionTtlMs: Math.max(5 * 60 * 1000, envPositiveInt("SESSION_TTL_MS", 6 * 60 * 60 * 1000)),
  maxSessions: Math.max(10, envPositiveInt("MAX_SESSIONS", 200)),
  sessionSweepIntervalMs: Math.max(10 * 1000, envPositiveInt("SESSION_SWEEP_INTERVAL_MS", 60 * 1000)),
  maxSessionMessages: Math.max(8, envPositiveInt("MAX_SESSION_MESSAGES", 42)),
  maxDiagnostics: Math.max(20, envPositiveInt("MAX_DIAGNOSTICS", 300)),
  defaultMaxTokens: Math.max(256, envPositiveInt("DEFAULT_MAX_TOKENS", 1000)),
  initialLuckPoints: Math.max(0, envPositiveInt("INITIAL_LUCK_POINTS", 3))
});
