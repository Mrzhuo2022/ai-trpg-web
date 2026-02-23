import { SSE_EVENTS, isKnownSSEEvent, normalizeSSEPayload } from "../../shared/contracts.js";

export type StreamEventHandler = (event: string, payload: unknown) => void;

function handleSSEBlock(block: string, onEvent: StreamEventHandler) {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (!dataLines.length) return;

  let payload: unknown;
  try {
    payload = JSON.parse(dataLines.join("\n"));
  } catch {
    payload = { raw: dataLines.join("\n") };
  }

  if (!isKnownSSEEvent(event)) return;
  onEvent(event, normalizeSSEPayload(event, payload));
}

export async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // ignore parse errors
  }

  if (!res.ok) {
    const message =
      typeof json === "object" && json !== null && "error" in json
        ? String((json as { error: string }).error)
        : `HTTP ${res.status}`;
    throw new Error(message);
  }

  return json as T;
}

export async function streamPost(url: string, body: unknown, onEvent: StreamEventHandler) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    const raw = await res.text();
    if (raw) {
      try {
        const json = JSON.parse(raw) as { error?: string };
        msg = json?.error || raw || msg;
      } catch {
        msg = raw;
      }
    }
    throw new Error(msg);
  }

  if (!res.body) {
    throw new Error("连接成功，但浏览器未获取到流式响应。请刷新后重试。");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let gotDone = false;
  let gotToken = false;
  let gotCompletedStatus = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, "\n");

    let idx = buffer.indexOf("\n\n");
    while (idx !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      handleSSEBlock(block, (event, payload) => {
        if (event === SSE_EVENTS.done) gotDone = true;
        if (event === SSE_EVENTS.token) gotToken = true;
        if (
          event === SSE_EVENTS.status &&
          typeof payload === "object" &&
          payload !== null &&
          "phase" in payload &&
          (payload as { phase?: string }).phase === "completed"
        ) {
          gotCompletedStatus = true;
        }
        onEvent(event, payload);
      });
      idx = buffer.indexOf("\n\n");
    }
  }

  if (buffer.trim()) {
    handleSSEBlock(buffer.trim(), (event, payload) => {
      if (event === SSE_EVENTS.done) gotDone = true;
      if (event === SSE_EVENTS.token) gotToken = true;
      if (
        event === SSE_EVENTS.status &&
        typeof payload === "object" &&
        payload !== null &&
        "phase" in payload &&
        (payload as { phase?: string }).phase === "completed"
      ) {
        gotCompletedStatus = true;
      }
      onEvent(event, payload);
    });
  }

  if (!gotDone) {
    // Some providers/proxies close SSE without a final done frame.
    // If meaningful payload has been received, treat as successful completion.
    if (gotToken || gotCompletedStatus) {
      return;
    }
    throw new Error("连接中断：模型响应未完整结束。请检查网络或接口服务。");
  }
}
