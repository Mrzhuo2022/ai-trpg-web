function normalizeTextValue(value) {
  if (!value) return "";
  if (typeof value === "string") return value;

  if (Array.isArray(value)) {
    return value.map((item) => normalizeTextValue(item)).join("");
  }

  if (typeof value === "object") {
    if (typeof value.text === "string") return value.text;
    if (typeof value.content === "string") return value.content;
    if (typeof value.delta === "string") return value.delta;
    if (typeof value.value === "string") return value.value;
    if (typeof value.reasoning_content === "string") return value.reasoning_content;
    if (typeof value.output_text === "string") return value.output_text;
    if (value.content) return normalizeTextValue(value.content);
    if (value.delta) return normalizeTextValue(value.delta);
    if (value.output_text) return normalizeTextValue(value.output_text);
  }

  return "";
}

function extractResponseText(json) {
  return (
    normalizeTextValue(json?.choices?.[0]?.message?.content) ||
    normalizeTextValue(json?.choices?.[0]?.text) ||
    normalizeTextValue(json?.output_text) ||
    normalizeTextValue(json?.output?.[0]?.content) ||
    ""
  );
}

function extractStreamDeltaText(json) {
  return (
    normalizeTextValue(json?.choices?.[0]?.delta?.content) ||
    normalizeTextValue(json?.choices?.[0]?.delta?.text) ||
    normalizeTextValue(json?.choices?.[0]?.delta?.output_text) ||
    normalizeTextValue(json?.choices?.[0]?.delta?.reasoning_content) ||
    normalizeTextValue(json?.choices?.[0]?.message?.content) ||
    ""
  );
}

export async function callLLMStream({ baseUrl, apiKey, model, messages, onStatus, onToken }) {
  const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutMs = 120000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  onStatus?.("request_sent");

  const baseRequest = {
    model,
    temperature: 0.85,
    messages
  };

  const doFetch = (stream) =>
    fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        ...baseRequest,
        stream
      }),
      signal: controller.signal
    });

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const fetchWithRetry = async (stream, retries = 1) => {
    let lastErr = null;
    for (let i = 0; i <= retries; i += 1) {
      try {
        return await doFetch(stream);
      } catch (err) {
        lastErr = err;
        if (i < retries) {
          await wait(220 * (i + 1));
        }
      }
    }

    const causeCode = lastErr?.cause?.code ? ` code=${lastErr.cause.code}` : "";
    const causeMsg = lastErr?.cause?.message ? ` cause=${lastErr.cause.message}` : "";
    throw new Error(
      `LLM 网络请求失败（${stream ? "stream" : "fallback"}）: ${String(lastErr?.message || lastErr)}${causeCode}${causeMsg} endpoint=${endpoint}`
    );
  };

  let res = await fetchWithRetry(true, 1);

  try {
    if (!res.ok) {
      const streamErrText = await res.text();

      const fallback = await fetchWithRetry(false, 1);
      if (!fallback.ok) {
        const fallbackText = await fallback.text();
        throw new Error(
          `LLM API 错误（stream与fallback均失败）stream(${res.status}): ${streamErrText.slice(0, 220)} | fallback(${fallback.status}): ${fallbackText.slice(0, 220)}`
        );
      }
      res = fallback;
    }

    const contentType = (res.headers.get("content-type") || "").toLowerCase();

    if (contentType.includes("application/json")) {
      onStatus?.("connected");
      const json = await res.json();
      const content = extractResponseText(json);
      if (!content) {
        throw new Error("LLM 返回内容为空，请检查模型与接口兼容性。");
      }
      onToken?.(content);
      onStatus?.("completed", Date.now() - startedAt);
      return content;
    }

    if (!res.body) {
      const fallback = await fetchWithRetry(false, 1);
      if (!fallback.ok) {
        const fallbackText = await fallback.text();
        throw new Error(`模型连接成功但流不可读，fallback 失败 (${fallback.status}): ${fallbackText.slice(0, 300)}`);
      }
      const json = await fallback.json();
      const content = extractResponseText(json);
      if (!content) {
        throw new Error("模型返回非流式响应，但内容为空。请检查模型兼容性。");
      }
      onStatus?.("connected");
      onToken?.(content);
      onStatus?.("completed", Date.now() - startedAt);
      return content;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    let hasFirstToken = false;

    const processSSELine = (line) => {
      if (!line.startsWith("data:")) return null;
      const data = line.slice(5).trim();

      if (data === "[DONE]") {
        onStatus?.("completed", Date.now() - startedAt);
        return "__DONE__";
      }

      try {
        const json = JSON.parse(data);
        const delta = extractStreamDeltaText(json);
        if (delta) {
          if (!hasFirstToken) {
            onStatus?.("connected");
            hasFirstToken = true;
          }
          fullContent += delta;
          onToken?.(delta);
        }

        const finishReason = json?.choices?.[0]?.finish_reason;
        if (finishReason && finishReason !== "stop") {
          onStatus?.("completed", Date.now() - startedAt);
        }
      } catch {
        // Ignore unparsable SSE lines.
      }

      return null;
    };

    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");

      let lineEnd = buffer.indexOf("\n");
      while (lineEnd !== -1) {
        const line = buffer.slice(0, lineEnd).trim();
        buffer = buffer.slice(lineEnd + 1);

        const doneFlag = processSSELine(line);
        if (doneFlag === "__DONE__") return fullContent;
        lineEnd = buffer.indexOf("\n");
      }
    }

    if (buffer.trim()) {
      for (const tailLine of buffer.split("\n")) {
        const doneFlag = processSSELine(tailLine.trim());
        if (doneFlag === "__DONE__") return fullContent;
      }
    }

    if (!fullContent) {
      const fallback = await fetchWithRetry(false, 1);
      if (!fallback.ok) {
        const fallbackText = await fallback.text();
        throw new Error(`连接中断且 fallback 失败 (${fallback.status}): ${fallbackText.slice(0, 300)}`);
      }
      const json = await fallback.json();
      const content = extractResponseText(json);
      if (!content) {
        throw new Error("连接中断：未收到有效内容。请检查网络或模型服务状态。");
      }
      onStatus?.("connected");
      onToken?.(content);
      onStatus?.("completed", Date.now() - startedAt);
      return content;
    }

    onStatus?.("completed", Date.now() - startedAt);
    return fullContent;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`LLM 请求超时（${timeoutMs / 1000}s），请检查网络连接或模型服务状态。`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
