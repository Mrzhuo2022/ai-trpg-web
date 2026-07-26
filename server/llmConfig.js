import { SERVER_CONFIG } from "./config.js";

/**
 * Merges client-supplied llmConfig with server-side env credentials.
 * Server env (LLM_API_KEY / LLM_BASE_URL / LLM_MODEL) takes precedence for the
 * apiKey so keys never need to pass through the browser; baseUrl/model fall
 * back to env when the client omits them.
 */
export function resolveLLMConfig(clientConfig = {}, { requireModel = false } = {}) {
  let baseUrl = (clientConfig.baseUrl || SERVER_CONFIG.llmBaseUrl || "").trim();
  const model = (clientConfig.model || SERVER_CONFIG.llmModel || "").trim();
  const apiKey = (SERVER_CONFIG.llmApiKey || clientConfig.apiKey || "").trim();

  // 与 llmClient 保持一致的 baseUrl 归一化
  baseUrl = baseUrl.replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
  if (!baseUrl && apiKey.startsWith("sk-")) {
    baseUrl = "https://api.openai.com/v1";
  }

  if (!baseUrl) throw new Error("baseUrl 未配置：请在设置中填写或设置 LLM_BASE_URL 环境变量。");
  if (!apiKey) throw new Error("apiKey 未配置：请在设置中填写或设置 LLM_API_KEY 环境变量。");
  if (requireModel && !model) throw new Error("model 未配置：请在设置中填写或设置 LLM_MODEL 环境变量。");

  return { baseUrl, apiKey, model };
}
