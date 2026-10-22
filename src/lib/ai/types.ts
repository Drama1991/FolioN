/** AI 提供方与对话相关的通用类型。三个 provider 共用这套接口。 */

export type AIRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: AIRole;
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  /** 覆盖 provider 默认 model；不传则用 config 里的默认值 */
  model?: string;
  temperature?: number;
}

/** Provider 必须实现的最小接口。流式：异步迭代 yield 增量文本。 */
export interface AIProvider {
  readonly name: ProviderKind;
  /** 流式聊天。yield 出 delta 字符串；调用方负责拼接和 UI 增量渲染。 */
  chatStream(req: ChatRequest): AsyncIterable<string>;
}

export type ProviderKind = "aggregator" | "openai" | "gemini";

export interface ProviderCreds {
  /** 仅 aggregator 用；OpenAI 直连写死 https://api.openai.com/v1；Gemini 用 google 官方域 */
  baseUrl?: string;
  apiKey: string;
  model: string;
}

export interface AIConfig {
  provider: ProviderKind;
  aggregator: ProviderCreds;
  openai: ProviderCreds;
  gemini: ProviderCreds;
  /** Per-provider models shown in the AI panel picker. The configured default is always included. */
  pinnedModels: Record<ProviderKind, string[]>;
  search: SearchConfig;
}

// ─── 联网搜索 ───────────────────────────────────────────────────────

export type SearchProviderKind = "brave";

export interface SearchConfig {
  provider: SearchProviderKind;
  brave: { apiKey: string };
}

/** 注入到 LLM 的搜索结果项；也是返回前端 sources chips 的数据结构 */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  /** 用于前端取 favicon */
  domain: string;
}

export interface SearchProvider {
  readonly name: SearchProviderKind;
  search(query: string, opts?: { count?: number; signal?: AbortSignal }): Promise<SearchResult[]>;
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: "aggregator",
  aggregator: { baseUrl: "", apiKey: "", model: "" },
  openai: { baseUrl: "https://api.openai.com/v1", apiKey: "", model: "gpt-4o-mini" },
  gemini: { baseUrl: "https://generativelanguage.googleapis.com", apiKey: "", model: "gemini-2.0-flash" },
  pinnedModels: {
    aggregator: [],
    openai: ["gpt-4o-mini"],
    gemini: ["gemini-2.0-flash"],
  },
  search: { provider: "brave", brave: { apiKey: "" } },
};
