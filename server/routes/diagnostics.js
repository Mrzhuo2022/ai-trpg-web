import { API_ROUTES, parseDiagnosticsQuery } from "../../shared/contracts.js";

export function registerDiagnosticsRoute(app, diagnosticsStore) {
  app.get(API_ROUTES.diagnosticsRecent, (req, res) => {
    const { limit, status } = parseDiagnosticsQuery(req.query);
    const items = diagnosticsStore.list({ limit, status });
    res.json({
      items,
      total: diagnosticsStore.total()
    });
  });
}
