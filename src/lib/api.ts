import { SSE_EVENTS, isKnownSSEEvent, normalizeSSEPayload } from "../../shared/contracts.js";

export type StreamEventHandler = (event: string, payload: unknown) => void;

interface StreamError extends Error {
  isNetworkError?: boolean;
  isTimeout?: boolean;
  statusCode?: number;
}

function createStreamError(message: string, options?: Partial<StreamError>): StreamError {
  const error = new Error(message) as StreamError;
  Object.assign(error, options);
  return error;
}

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
  let res: Response;

  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (err) {
    const error = err as Error;
    if (error.name === "TypeError" && error.message.includes("fetch")) {
      throw createStreamError(
        "无法连接到后端服务，请检查后端是否已启动 (Port 3157)。",
        { isNetworkError: true }
      );
    }
    throw error;
  }

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
    throw createStreamError(message, { statusCode: res.status });
  }

  return json as T;
}

export async function streamPost(
  url: string,
  body: unknown,
  onEvent: StreamEventHandler,
  options?: { retries?: number; retryDelay?: number }
) {
  const retries = options?.retries ?? 2;
  const retryDelay = options?.retryDelay ?? 1000;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // Wait before retry with exponential backoff
      const delay = Math.min(retryDelay * Math.pow(2, attempt - 1), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    try {
      return await streamPostAttempt(url, body, onEvent);
    } catch (err) {
      lastError = err as Error;
      const error = err as StreamError;

      // Don't retry if it's a client error (4xx)
      if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
        throw error;
      }
    }
  }

  // All retries exhausted
  throw lastError;
}

async function streamPostAttempt(url: string, body: unknown, onEvent: StreamEventHandler) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (err) {
    const error = err as Error;
    if (error.name === "TypeError" && error.message.includes("fetch")) {
      throw createStreamError(
        "无法连接到后端服务，请检查后端是否已启动 (Port 3157)。",
        { isNetworkError: true }
      );
    }
    throw error;
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    const raw = await res.text();
    if (raw) {
      try {
        const json = JSON.parse(raw) as { error?: string; message?: string };
        msg = json?.error || json?.message || raw || msg;
      } catch {
        msg = raw;
      }
    }
    throw createStreamError(msg, { statusCode: res.status });
  }

  if (!res.body) {
    throw createStreamError("连接成功，但浏览器未获取到流式响应。请刷新后重试。");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let gotDone = false;
  let gotToken = false;
  let gotCompletedStatus = false;

  try {
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
      throw createStreamError("连接中断：模型响应未完整结束。请检查网络或接口服务。");
    }
  } finally {
    // Ensure reader is properly closed
    try {
      reader.cancel();
    } catch {
      // Ignore cancellation errors
    }
  }
}
