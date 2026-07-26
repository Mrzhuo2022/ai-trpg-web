import { API_ROUTES, parseModelsRequestBody } from "../../shared/contracts.js";
import { assertSafeBaseUrl } from "../urlGuard.js";
import { resolveLLMConfig } from "../llmConfig.js";

export function registerModelsRoute(app) {
  app.post(API_ROUTES.models, async (req, res) => {
    let endpoint = "";
    try {
      const { llmConfig } = parseModelsRequestBody(req.body);
      const resolved = resolveLLMConfig(llmConfig);
      await assertSafeBaseUrl(resolved.baseUrl);

      endpoint = `${resolved.baseUrl}/models`;

      const modelRes = await fetch(endpoint, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "Authorization": `Bearer ${resolved.apiKey}`
        },
        signal: AbortSignal.timeout(30000)
      });

      if (!modelRes.ok) {
        // 不回显上游响应体，避免信息泄露（SSRF 回显面）
        throw new Error(`拉取模型列表失败 (${modelRes.status})，请检查 baseUrl 与 apiKey。`);
      }

      const json = await modelRes.json();
      
      // 更加健壮的列表提取逻辑
      let rawList = [];
      if (Array.isArray(json)) {
        rawList = json;
      } else if (json && typeof json === "object") {
        if (Array.isArray(json.data)) {
          rawList = json.data;
        } else if (Array.isArray(json.models)) {
          rawList = json.models;
        } else if (Array.isArray(json.data?.models)) {
          rawList = json.data.models;
        }
      }
      
      const list = rawList
        .map((item) => {
          if (typeof item === "string") return item;
          if (typeof item === "object" && item !== null) {
            return item.id || item.name || item.model || item.model_id;
          }
          return null;
        })
        .filter((id) => typeof id === "string" && id.length > 0)
        .sort((a, b) => a.localeCompare(b));

      const uniqueList = Array.from(new Set(list));
      res.json({ models: uniqueList });
    } catch (error) {
      console.error(`[Models API Error] ${endpoint}:`, error);
      res.status(400).json({ error: String(error?.message || error) });
    }
  });
}
