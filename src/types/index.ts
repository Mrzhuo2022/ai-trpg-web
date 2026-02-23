export type ChatRole = "assistant" | "user" | "system" | "error";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
}

export interface Session {
  localId: string;
  backendSessionId: string;
  sourcePresetId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface Preset {
  id: string;
  name: string;
  updatedAt: number;
  data: LorePayload;
}

export interface LorePayload {
  worldName: string;
  ruleset: string;
  characterName: string;
  characterProfile: string;
  worldbook: string;
  scenarioScript: string;
  gmPrompt: string;
}

export interface Settings {
  baseUrl: string;
  apiKey: string;
  model: string;
  ruleset: string;
  worldName: string;
  characterName: string;
  characterProfile: string;
  worldbook: string;
  scenarioScript: string;
  gmPrompt: string;
}

export interface AppStatus {
  text: string;
  type: "idle" | "pending" | "ok" | "error";
}

export interface StreamMetaView {
  check: string;
  status: string;
  ended: boolean;
}
