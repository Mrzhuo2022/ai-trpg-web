import { API_ROUTES, parseDiagnosticsQuery } from "../../shared/contracts.js";
import { SERVER_CONFIG } from "../config.js";

function isLoopbackRequest(req) {
  const addr = req.socket?.remoteAddress || "";
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

export function registerDiagnosticsRoute(app, diagnosticsStore) {
  app.get(API_ROUTES.diagnosticsRecent, (req, res) => {
    // 诊断信息含 baseUrl/模型名/错误详情：仅本机访问，或持有 ADMIN_TOKEN 时放行
    const token = SERVER_CONFIG.adminToken;
    const provided = String(req.headers["x-admin-token"] || "");
    const authorized = token ? provided === token : isLoopbackRequest(req);
    if (!authorized) {
      return res.status(403).json({ error: "诊断接口仅限本机访问或需要有效的 X-Admin-Token。" });
    }
    const { limit, status } = parseDiagnosticsQuery(req.query);
    const items = diagnosticsStore.list({ limit, status });
    res.json({
      items,
      total: diagnosticsStore.total()
    });
  });
}
