import { SSE_EVENTS } from "../shared/contracts.js";

export function initSSE(res) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
}

export function sendSSE(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  res.flush?.();
}

export function sendStatus(res, payload) {
  sendSSE(res, SSE_EVENTS.status, payload);
}

export function sendToken(res, token) {
  sendSSE(res, SSE_EVENTS.token, { token });
}

export function sendMeta(res, meta) {
  sendSSE(res, SSE_EVENTS.meta, meta);
}

export function sendSession(res, payload) {
  sendSSE(res, SSE_EVENTS.session, payload);
}

export function sendError(res, payload) {
  sendSSE(res, SSE_EVENTS.error, payload);
}

export function sendDone(res, ok) {
  sendSSE(res, SSE_EVENTS.done, { ok: Boolean(ok) });
}
