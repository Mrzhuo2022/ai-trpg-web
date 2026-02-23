export const API_ROUTES: {
  readonly models: "/api/models";
  readonly diagnosticsRecent: "/api/diagnostics/recent";
  readonly gameStartStream: "/api/game/start-stream";
  readonly gameActStream: "/api/game/act-stream";
};

export const SSE_EVENTS: {
  readonly status: "status";
  readonly token: "token";
  readonly meta: "meta";
  readonly session: "session";
  readonly error: "error";
  readonly done: "done";
};

export interface ModelsRequestBody {
  llmConfig: {
    baseUrl: string;
    apiKey: string;
  };
}

export interface StartRequestBody {
  llmConfig: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
  gmPrompt: string;
  ruleset: string;
  worldName: string;
  worldbook: string;
  scenarioScript: string;
  characterName: string;
  characterProfile: string;
  worldSeed: string;
}

export interface ActRequestBody {
  sessionId: string;
  action: string;
}

export interface DiagnosticsQuery {
  limit: number;
  status: "" | "ok" | "error";
}

export interface StatusPayload {
  phase: string;
  message: string;
  elapsedMs?: number;
  traceId: string;
}

export interface TokenPayload {
  token: string;
}

export interface MetaPayload {
  options: string[];
  check: string;
  status: string;
  ended: boolean;
}

export interface SessionPayload {
  sessionId: string;
  traceId: string;
}

export interface ErrorPayload {
  message: string;
  traceId: string;
}

export interface DonePayload {
  ok: boolean;
}

export function isKnownSSEEvent(event: unknown): boolean;
export function parseModelsRequestBody(body: unknown): ModelsRequestBody;
export function parseStartRequestBody(body: unknown): StartRequestBody;
export function parseActRequestBody(body: unknown): ActRequestBody;
export function parseDiagnosticsQuery(query: unknown): DiagnosticsQuery;
export function normalizeStatusPayload(payload: unknown): StatusPayload;
export function normalizeTokenPayload(payload: unknown): TokenPayload;
export function normalizeSessionPayload(payload: unknown): SessionPayload;
export function normalizeErrorPayload(payload: unknown): ErrorPayload;
export function normalizeDonePayload(payload: unknown): DonePayload;
export function normalizeMetaPayload(payload: unknown): MetaPayload;
export function normalizeSSEPayload(event: string, payload: unknown): unknown;
