export type ChatRole = "assistant" | "user" | "system" | "error";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
}

/** 判定质量等级（与后端 judgeEngine.evaluateCheckWithAction 对应） */
export type CheckQuality =
  | "crit_success"
  | "crit_fail"
  | "great_success"
  | "great_fail"
  | "success"
  | "fail";

/** D&D 5e 六维属性键 */
export type AttributeKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

export type Attributes = Record<AttributeKey, number>;

/** 单次掷骰记录（用于战绩面板与持久化） */
export interface RollRecord {
  id: string;
  roll: number;
  dc: number;
  success: boolean;
  quality: CheckQuality;
  category: string;
  categoryLabel?: string;
  attribute?: string | null;
  attributeLabel?: string | null;
  modifier?: number;
  total?: number;
  action: string;
  createdAt: number;
  isReroll?: boolean;
}

/** 检定造成的伤害/状态变化 */
export interface CheckDamage {
  hp: number;
  corruption: number;
  condition?: string | null;
  resources?: unknown[];
}

/** 角色状态（D&D 5e，跨回合持久化） */
export interface CharacterState {
  attributes: Attributes;
  hp: { current: number; max: number; temp: number };
  ac: number;
  resources: Array<{ id: string; name: string; qty: number; unit: string }>;
  corruption: { name: string; current: number; max: number; threshold: number };
  conditions: string[];
  level: number;
}

/** 局势压力等级（0=平稳 1=紧张 2=危急 3=绝境） */
export type PressureLevel = 0 | 1 | 2 | 3;

export interface Pressure {
  /** 压力等级，0-3 的整数；类型放宽为 number 以兼容跨前后端序列化与归一化 */
  level: number;
  hint: string;
}

export interface Session {
  localId: string;
  backendSessionId: string;
  sourcePresetId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  isEnded?: boolean; // True if the adventure has ended
  // 单人跑图运行时状态（跟随会话持久化）
  luckPoints?: number;
  maxLuckPoints?: number;
  rollHistory?: RollRecord[];
  pressure?: Pressure;
  characterState?: CharacterState | null;
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
  // D&D 5e 结构化角色属性（字符串存数字）
  attrStr?: string;
  attrDex?: string;
  attrCon?: string;
  attrInt?: string;
  attrWis?: string;
  attrCha?: string;
  baseHp?: string;
  baseAc?: string;
  corruptionName?: string;
  corruptionMax?: string;
  corruptionThreshold?: string;
  initialResources?: Array<{ name: string; qty: number; unit?: string }>;
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
  /** 每局初始运气点数（用于重投失败的判定） */
  initialLuckPoints: string;
  // D&D 5e 结构化角色属性（字符串存数字）
  attrStr: string;
  attrDex: string;
  attrCon: string;
  attrInt: string;
  attrWis: string;
  attrCha: string;
  baseHp: string;
  baseAc: string;
  corruptionName: string;
  corruptionMax: string;
  corruptionThreshold: string;
  initialResources: Array<{ name: string; qty: number; unit?: string }>;
}

export interface AppStatus {
  text: string;
  type: "idle" | "pending" | "ok" | "error";
}

/** 后端 SSE meta 事件透传到前端的视图（含结构化判定字段） */
export interface StreamMetaView {
  check: string;
  status: string;
  ended: boolean;
  // 结构化判定（后端 evaluateCheckWithAction）
  roll?: number;
  modifier?: number;
  attribute?: string | null;
  attributeLabel?: string | null;
  attributeAbbr?: string | null;
  total?: number;
  dc?: number;
  success?: boolean;
  quality?: CheckQuality;
  category?: string;
  categoryLabel?: string;
  difficulty?: string;
  label?: string;
  // 动画与交互标记
  rolling?: boolean;
  isReroll?: boolean;
  consumedLuck?: boolean;
  canReroll?: boolean;
  regenerated?: boolean;
  // 资源与压力
  luckPoints?: number;
  maxLuckPoints?: number;
  pressure?: Pressure;
  // 代码化伤害与状态变化
  damage?: CheckDamage;
  stateAfter?: {
    hp: { current: number; max: number; temp: number };
    ac: number;
    corruption: { name: string; current: number; max: number; threshold: number };
    conditions: string[];
  };
  characterState?: CharacterState;
}

