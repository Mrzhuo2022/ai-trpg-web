import crypto from "crypto";

function sanitizeBaseUrl(value) {
  if (!value || typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return raw.slice(0, 120);
  }
}

export function createDiagnosticsStore({ maxDiagnostics }) {
  const diagnostics = [];

  function push(entry) {
    diagnostics.unshift(entry);
    if (diagnostics.length > maxDiagnostics) {
      diagnostics.length = maxDiagnostics;
    }
  }

  function record({
    traceId,
    route,
    status,
    phase = "",
    elapsedMs = 0,
    model = "",
    baseUrl = "",
    message = "",
    timeline = []
  }) {
    push({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      traceId: traceId || "",
      route: route || "",
      status: status === "ok" ? "ok" : "error",
      phase,
      elapsedMs: Number.isFinite(elapsedMs) ? Math.max(0, Math.floor(elapsedMs)) : 0,
      model: model || "",
      baseUrl: sanitizeBaseUrl(baseUrl),
      message: String(message || ""),
      timeline: Array.isArray(timeline)
        ? timeline
            .filter((item) => item && typeof item === "object")
            .map((item) => ({
              phase: String(item.phase || ""),
              atMs: Number.isFinite(item.atMs) ? Math.max(0, Math.floor(item.atMs)) : 0
            }))
        : []
    });
  }

  function list({ limit, status }) {
    return diagnostics.filter((item) => (status ? item.status === status : true)).slice(0, limit);
  }

  function total() {
    return diagnostics.length;
  }

  return {
    record,
    list,
    total
  };
}
