import { SSE_EVENTS } from "../../shared/contracts.js";
import { streamPost } from "./api";
import type { StreamMetaView } from "../types";

type StatusEventPayload = { phase?: string; elapsedMs?: number; message?: string; traceId?: string };
type TokenEventPayload = { token?: string };
type SessionEventPayload = { sessionId?: string };
type ErrorEventPayload = { message?: string; traceId?: string };
type MetaEventPayload = {
  options?: unknown;
  check?: unknown;
  status?: unknown;
  ended?: unknown;
  // 结构化判定字段
  roll?: unknown;
  modifier?: unknown;
  attribute?: unknown;
  attributeLabel?: unknown;
  attributeAbbr?: unknown;
  total?: unknown;
  dc?: unknown;
  success?: unknown;
  quality?: unknown;
  category?: unknown;
  categoryLabel?: unknown;
  difficulty?: unknown;
  label?: unknown;
  rolling?: unknown;
  isReroll?: unknown;
  consumedLuck?: unknown;
  canReroll?: unknown;
  regenerated?: unknown;
  luckPoints?: unknown;
  maxLuckPoints?: unknown;
  pressure?: unknown;
  // 代码化伤害与状态
  damage?: unknown;
  stateAfter?: unknown;
  characterState?: unknown;
};
export type { StreamMetaView } from "../types";

function embedMetaMarker(payload: MetaEventPayload): string {
  const options = Array.isArray(payload.options)
    ? payload.options
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .slice(0, 5)
    : [];
  const meta = {
    options,
    check: typeof payload.check === "string" ? payload.check.trim() : "",
    status: typeof payload.status === "string" ? payload.status.trim() : "",
    ended: Boolean(payload.ended)
  };
  return `\n\n<GM_META>${JSON.stringify(meta)}</GM_META>`;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function asBool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}
function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export interface StreamInteractionDeps {
  addMessage: (sessionId: string, role: "assistant", content: string) => string;
  appendToMessage: (sessionId: string, messageId: string, chunk: string) => void;
  persistSessionsNow: () => void;
  setStatus: (text: string, type?: "idle" | "pending" | "ok" | "error") => void;
  stopWaitingTicker: () => void;
  markSessionEnded?: (sessionId: string) => void;
}

export interface StreamInteractionParams {
  sessionId: string;
  endpoint: string;
  body: Record<string, unknown>;
  successLabel: string;
  modelLabel?: string;
  onSession?: (backendSessionId: string) => void;
  onMeta?: (meta: StreamMetaView) => void;
}

export async function runStreamInteraction(params: StreamInteractionParams, deps: StreamInteractionDeps) {
  const { sessionId, endpoint, body, successLabel, modelLabel, onSession, onMeta } = params;
  const { addMessage, appendToMessage, persistSessionsNow, setStatus, stopWaitingTicker, markSessionEnded } = deps;
  const messageId = addMessage(sessionId, "assistant", "");

  try {
    await streamPost(endpoint, body, (event, rawPayload) => {
      if (event === SSE_EVENTS.status) {
        const payload = rawPayload as StatusEventPayload;
        const traceSuffix = payload.traceId ? ` · #${payload.traceId}` : "";
        if (payload.phase === "connected") {
          stopWaitingTicker();
        }
        if (payload.phase === "completed") {
          const ms = typeof payload.elapsedMs === "number" ? payload.elapsedMs : null;
          const suffix = ms ? `（${ms}ms）` : "";
          setStatus(`${successLabel}${modelLabel ? `（${modelLabel}${suffix ? ` · ${ms}ms` : ""}）` : suffix}${traceSuffix}`, "ok");
          return;
        }
        setStatus(`${String(payload.message || "处理中...")}${traceSuffix}`, "pending");
        return;
      }

      if (event === SSE_EVENTS.token) {
        const payload = rawPayload as TokenEventPayload;
        const token = String(payload.token || "");
        // Direct append - no character queue for simplicity and correctness
        appendToMessage(sessionId, messageId, token);
        return;
      }

      if (event === SSE_EVENTS.session && onSession) {
        const payload = rawPayload as SessionEventPayload;
        onSession(String(payload.sessionId || ""));
        return;
      }

      if (event === SSE_EVENTS.meta) {
        const payload = rawPayload as MetaEventPayload;
        const ended = Boolean(payload.ended);
        const pressureRaw = payload.pressure;
        const pressure = pressureRaw && typeof pressureRaw === "object" && typeof (pressureRaw as { level?: unknown }).level === "number"
          ? (pressureRaw as { level: number; hint: string })
          : undefined;
        onMeta?.({
          check: typeof payload.check === "string" ? payload.check.trim() : "",
          status: typeof payload.status === "string" ? payload.status.trim() : "",
          ended,
          roll: asNumber(payload.roll),
          modifier: asNumber(payload.modifier),
          attribute: asString(payload.attribute),
          attributeLabel: asString(payload.attributeLabel),
          attributeAbbr: asString(payload.attributeAbbr),
          total: asNumber(payload.total),
          dc: asNumber(payload.dc),
          success: asBool(payload.success),
          quality: asString(payload.quality) as StreamMetaView["quality"],
          category: asString(payload.category),
          categoryLabel: asString(payload.categoryLabel),
          difficulty: asString(payload.difficulty),
          label: asString(payload.label),
          rolling: asBool(payload.rolling),
          isReroll: asBool(payload.isReroll),
          consumedLuck: asBool(payload.consumedLuck),
          canReroll: asBool(payload.canReroll),
          regenerated: asBool(payload.regenerated),
          luckPoints: asNumber(payload.luckPoints),
          maxLuckPoints: asNumber(payload.maxLuckPoints),
          pressure,
          damage: payload.damage && typeof payload.damage === "object"
            ? (payload.damage as StreamMetaView["damage"])
            : undefined,
          stateAfter: payload.stateAfter && typeof payload.stateAfter === "object"
            ? (payload.stateAfter as StreamMetaView["stateAfter"])
            : undefined,
          characterState: payload.characterState && typeof payload.characterState === "object"
            ? (payload.characterState as StreamMetaView["characterState"])
            : undefined
        });

        // Mark session as ended if the meta says so
        if (ended && markSessionEnded) {
          markSessionEnded(sessionId);
        }

        const markerOnly = embedMetaMarker(payload);
        // Meta markers appended directly - no queue
        appendToMessage(sessionId, messageId, markerOnly);
        return;
      }

      if (event === SSE_EVENTS.error) {
        const payload = rawPayload as ErrorEventPayload;
        const traceText = payload.traceId ? `（trace: ${payload.traceId}）` : "";
        throw new Error(`${String(payload.message || "请求失败")}${traceText}`);
      }
    });
    persistSessionsNow();
    return { ok: true as const };
  } catch (error) {
    persistSessionsNow();
    return { ok: false as const, error: String((error as Error).message || error) };
  }
}
