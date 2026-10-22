import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { DEFAULT_AI_CONFIG, type AIConfig, type ProviderKind, type SearchConfig, type SearchProviderKind } from "./types";

const AI_COOKIE_NAME = "folio_ai";
const TTL_SECONDS = 365 * 24 * 60 * 60;

function getSecret(): Uint8Array {
  const raw = process.env.FOLIO_JWT_SECRET;
  if (!raw || raw.length < 16) throw new Error("FOLIO_JWT_SECRET is missing or too short");
  return new TextEncoder().encode(raw);
}

/** 从 cookie 中读取配置；缺失或损坏时返回默认配置（空 key）。 */
export async function getAIConfig(): Promise<AIConfig> {
  const store = await cookies();
  const raw = store.get(AI_COOKIE_NAME)?.value;
  if (!raw) return DEFAULT_AI_CONFIG;
  try {
    const { payload } = await jwtVerify(raw, getSecret(), { algorithms: ["HS256"] });
    const data = (payload as { config?: unknown }).config;
    return mergeWithDefaults(data);
  } catch {
    return DEFAULT_AI_CONFIG;
  }
}

export async function setAIConfig(next: AIConfig): Promise<void> {
  const jwt = await new SignJWT({ config: next })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${365}d`)
    .sign(getSecret());
  const store = await cookies();
  store.set(AI_COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

/** 输出给前端时把 apiKey 掩码：sk-abcd...wxyz 这种 */
export function maskKey(k: string): string {
  if (!k) return "";
  if (k.length <= 10) return "•".repeat(k.length);
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

export function maskedConfig(cfg: AIConfig): AIConfig {
  return {
    provider: cfg.provider,
    aggregator: { ...cfg.aggregator, apiKey: maskKey(cfg.aggregator.apiKey) },
    openai: { ...cfg.openai, apiKey: maskKey(cfg.openai.apiKey) },
    gemini: { ...cfg.gemini, apiKey: maskKey(cfg.gemini.apiKey) },
    pinnedModels: {
      aggregator: [...cfg.pinnedModels.aggregator],
      openai: [...cfg.pinnedModels.openai],
      gemini: [...cfg.pinnedModels.gemini],
    },
    search: {
      provider: cfg.search.provider,
      brave: { apiKey: maskKey(cfg.search.brave.apiKey) },
    },
  };
}

/** POST 进来的 partial config 合并到当前存量。前端若把 apiKey 留空则保留旧 key（不擦除）。 */
export function mergeForUpdate(current: AIConfig, patch: Partial<AIConfig>): AIConfig {
  const aggregator = mergeCreds(current.aggregator, patch.aggregator);
  const openai = mergeCreds(current.openai, patch.openai);
  const gemini = mergeCreds(current.gemini, patch.gemini);
  const next: AIConfig = {
    provider: (patch.provider as ProviderKind) || current.provider,
    aggregator,
    openai,
    gemini,
    pinnedModels: {
      aggregator: withDefaultPinned(
        patch.pinnedModels?.aggregator ?? current.pinnedModels.aggregator,
        aggregator.model,
      ),
      openai: withDefaultPinned(
        patch.pinnedModels?.openai ?? current.pinnedModels.openai,
        openai.model,
      ),
      gemini: withDefaultPinned(
        patch.pinnedModels?.gemini ?? current.pinnedModels.gemini,
        gemini.model,
      ),
    },
    search: mergeSearch(current.search, patch.search),
  };
  return next;
}

function mergeCreds(cur: AIConfig["aggregator"], patch: Partial<AIConfig["aggregator"]> | undefined) {
  if (!patch) return cur;
  return {
    baseUrl: patch.baseUrl ?? cur.baseUrl,
    apiKey: patch.apiKey && patch.apiKey.length > 0 ? patch.apiKey : cur.apiKey,
    model: typeof patch.model === "string" ? patch.model.trim() : cur.model.trim(),
  };
}

function mergeSearch(cur: SearchConfig, patch: Partial<SearchConfig> | undefined): SearchConfig {
  if (!patch) return cur;
  return {
    provider: (patch.provider as SearchProviderKind) || cur.provider,
    brave: {
      apiKey:
        patch.brave?.apiKey && patch.brave.apiKey.length > 0
          ? patch.brave.apiKey
          : cur.brave.apiKey,
    },
  };
}

function mergeWithDefaults(data: unknown): AIConfig {
  if (!data || typeof data !== "object") return DEFAULT_AI_CONFIG;
  const d = data as Partial<AIConfig>;
  const aggregator = {
    ...DEFAULT_AI_CONFIG.aggregator,
    ...(d.aggregator || {}),
    model: normalizedModel(d.aggregator?.model, DEFAULT_AI_CONFIG.aggregator.model),
  };
  const openai = {
    ...DEFAULT_AI_CONFIG.openai,
    ...(d.openai || {}),
    model: normalizedModel(d.openai?.model, DEFAULT_AI_CONFIG.openai.model),
  };
  const gemini = {
    ...DEFAULT_AI_CONFIG.gemini,
    ...(d.gemini || {}),
    model: normalizedModel(d.gemini?.model, DEFAULT_AI_CONFIG.gemini.model),
  };
  return {
    provider: (d.provider as ProviderKind) || DEFAULT_AI_CONFIG.provider,
    aggregator,
    openai,
    gemini,
    pinnedModels: {
      aggregator: withDefaultPinned(d.pinnedModels?.aggregator, aggregator.model),
      openai: withDefaultPinned(d.pinnedModels?.openai, openai.model),
      gemini: withDefaultPinned(d.pinnedModels?.gemini, gemini.model),
    },
    search: {
      provider: (d.search?.provider as SearchProviderKind) || DEFAULT_AI_CONFIG.search.provider,
      brave: { ...DEFAULT_AI_CONFIG.search.brave, ...(d.search?.brave || {}) },
    },
  };
}

function normalizedModel(value: unknown, fallback: string): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function withDefaultPinned(value: unknown, defaultModel: string): string[] {
  const models = Array.isArray(value)
    ? value.filter((model): model is string => typeof model === "string")
      .map((model) => model.trim())
      .filter((model) => model.length > 0 && model.length <= 200 && !/[\u0000-\u001f]/.test(model))
    : [];
  const unique = [...new Set(models)];
  const normalizedDefault = defaultModel.trim();
  if (
    normalizedDefault &&
    normalizedDefault.length <= 200 &&
    !/[\u0000-\u001f]/.test(normalizedDefault) &&
    !unique.includes(normalizedDefault)
  ) {
    unique.unshift(normalizedDefault);
  }
  return unique;
}

/** 当前 provider 是否已经具备调用条件（key + model + 必要 baseUrl） */
export function isProviderReady(cfg: AIConfig): boolean {
  const c = cfg[cfg.provider];
  if (!c.apiKey || !c.model) return false;
  if (cfg.provider === "aggregator" && !c.baseUrl) return false;
  return true;
}
