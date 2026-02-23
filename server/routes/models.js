import { API_ROUTES, parseModelsRequestBody } from "../../shared/contracts.js";

export function registerModelsRoute(app) {
  app.post(API_ROUTES.models, async (req, res) => {
    try {
      const { llmConfig } = parseModelsRequestBody(req.body);
      const endpoint = `${llmConfig.baseUrl.replace(/\/$/, "")}/models`;

      const modelRes = await fetch(endpoint, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${llmConfig.apiKey}`
        },
        signal: AbortSignal.timeout(30000)
      });

      if (!modelRes.ok) {
        const text = await modelRes.text();
        throw new Error(`拉取模型列表失败 (${modelRes.status}): ${text.slice(0, 300)}`);
      }

      const json = await modelRes.json();
      const list = Array.isArray(json?.data)
        ? json.data
            .map((item) => item?.id)
            .filter((id) => typeof id === "string" && id.length > 0)
            .sort((a, b) => a.localeCompare(b))
        : [];

      res.json({ models: list });
    } catch (error) {
      res.status(400).json({ error: String(error?.message || error) });
    }
  });
}
