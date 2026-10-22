"use client";

import { useEffect } from "react";
import { create } from "zustand";
import type { UiMedium } from "@/lib/format/verbs";
import {
  loadSessions,
  upsertSession,
  type AISession,
  buildItemKey,
} from "./ai-sessions";
import { USER_MESSAGE } from "@/lib/user-message";

export type AIContextKey = "home" | UiMedium;

/**
 * 当 key === UiMedium 时（即从条目详情进入），应附带 item 元信息——
 * 服务端的 system prompt 直接消费它，不再二次 fetch。
 */
export interface AIContextInfo {
  key: AIContextKey;
  title: string;
  subtitle: string;
  item?: {
    uuid: string;
    medium: UiMedium;
    title: string;
    year?: string | number;
    creator?: string;
    brief?: string;
  };
}

export interface SourceLink {
  title: string;
  url: string;
  domain: string;
}

export interface ChatMsg {
  role: "ai" | "user";
  text: string;
  /** The model that produced this assistant message. */
  model?: string;
  /** 联网搜索注入的来源链接，仅 AI 消息可能携带 */
  sources?: SourceLink[];
}

interface AIPanelState {
  open: boolean;
  context: AIContextInfo;
  history: ChatMsg[];
  typing: boolean;
  sessionId: string | null;
  selectedModel: string | null;
  defaultModel: string | null;
  pinnedModels: string[];
  modelPreferencesLoaded: boolean;
  /** 触发点视口坐标（DraggableWindow 用来做展开动画与首次定位） */
  origin: { x: number; y: number } | null;
  /** 联网搜索开关（sticky：用户切换后保持） */
  webSearch: boolean;
  setOpen: (
    open: boolean,
    ctx?: AIContextInfo | "home" | UiMedium,
    origin?: { x: number; y: number } | null,
  ) => void;
  setWebSearch: (on: boolean) => void;
  setModelPreferences: (defaultModel: string, pinnedModels: string[]) => void;
  setSelectedModel: (model: string) => void;
  send: (text: string) => Promise<void>;
  newChat: () => void;
  loadSession: (s: AISession) => void;
  reset: () => void;
}

function defaultCtx(): AIContextInfo {
  return { key: "home", title: "今晚看什么？", subtitle: "上下文：你的档案 + 想看列表" };
}

function welcomeFor(ctx: AIContextInfo): string {
  if (ctx.key === "home") return "嗨。根据你的记录和想看清单，我来帮你选今晚看什么。";
  if (ctx.item) return `关于《${ctx.item.title}》，你想聊什么？`;
  return "你想聊什么？";
}

function snapshotSession(
  id: string,
  ctx: AIContextInfo,
  history: ChatMsg[],
  createdAt: number,
  model: string | null,
): AISession {
  return {
    id,
    contextKey: ctx.key,
    contextItemKey: buildItemKey(ctx),
    contextTitle: ctx.title,
    contextSubtitle: ctx.subtitle,
    item: ctx.item,
    model: model ?? undefined,
    messages: history,
    createdAt,
    updatedAt: Date.now(),
  };
}

/** 第一条 user 消息后才有意义；只有欢迎语的空对话不写入历史。 */
function hasUserMessage(history: ChatMsg[]): boolean {
  return history.some((m) => m.role === "user");
}

// 用于 send() 跨 await 后判断 sessionId 是否被 newChat 抢占
const sessionMeta = new Map<string, number>(); // id -> createdAt

export const useAIPanel = create<AIPanelState>((set, get) => ({
  open: false,
  context: defaultCtx(),
  history: [],
  typing: false,
  sessionId: null,
  selectedModel: null,
  defaultModel: null,
  pinnedModels: [],
  modelPreferencesLoaded: false,
  origin: null,
  webSearch: false,

  setWebSearch: (on) => set({ webSearch: on }),

  setModelPreferences: (defaultModel, pinnedModels) => {
    const normalizedDefault = defaultModel.trim();
    const normalizedPins = [...new Set(pinnedModels.map((model) => model.trim()).filter(Boolean))];
    const current = get();
    const hasActiveConversation = !!current.sessionId && hasUserMessage(current.history);
    const selectedModel = hasActiveConversation && current.selectedModel && normalizedPins.includes(current.selectedModel)
      ? current.selectedModel
      : normalizedDefault || normalizedPins[0] || null;
    set({
      defaultModel: normalizedDefault || null,
      pinnedModels: normalizedPins,
      modelPreferencesLoaded: true,
      selectedModel,
    });
    const latest = get();
    if (latest.sessionId && hasUserMessage(latest.history)) {
      const createdAt = sessionMeta.get(latest.sessionId) ?? Date.now();
      upsertSession(snapshotSession(
        latest.sessionId,
        latest.context,
        latest.history,
        createdAt,
        selectedModel,
      ));
    }
  },

  setSelectedModel: (model) => {
    const current = get();
    if (!current.pinnedModels.includes(model)) return;
    set({ selectedModel: model });
    const latest = get();
    if (latest.sessionId && hasUserMessage(latest.history)) {
      const createdAt = sessionMeta.get(latest.sessionId) ?? Date.now();
      upsertSession(snapshotSession(
        latest.sessionId,
        latest.context,
        latest.history,
        createdAt,
        model,
      ));
    }
  },

  setOpen: (open, ctx, origin) => {
    if (!open) {
      set({ open: false, origin: null });
      return;
    }
    let nextCtx: AIContextInfo;
    if (!ctx) {
      nextCtx = defaultCtx();
    } else if (typeof ctx === "string") {
      if (ctx === "home") nextCtx = defaultCtx();
      else nextCtx = { key: ctx, title: "AI 聊聊", subtitle: `上下文：${ctx}` };
    } else {
      nextCtx = ctx;
    }

    // A 选项：同一 itemKey（或 home 上下文）打开时恢复最近一次会话；找不到才走欢迎语
    const itemKey = buildItemKey(nextCtx);
    const all = loadSessions(); // 已按 updatedAt desc 排序
    let restored: AISession | undefined;
    if (itemKey) {
      restored = all.find((s) => s.contextItemKey === itemKey);
    } else if (nextCtx.key === "home") {
      restored = all.find((s) => s.contextKey === "home" && !s.contextItemKey);
    }

    if (restored) {
      sessionMeta.set(restored.id, restored.createdAt);
      set({
        open: true,
        context: {
          key: restored.contextKey,
          title: restored.contextTitle,
          subtitle: restored.contextSubtitle,
          item: restored.item,
        },
        history: restored.messages,
        sessionId: restored.id,
        selectedModel: restored.model?.trim() || get().defaultModel,
        typing: false,
        origin: origin ?? null,
      });
    } else {
      set({
        open: true,
        context: nextCtx,
        history: [{ role: "ai", text: welcomeFor(nextCtx) }],
        sessionId: null,
        selectedModel: get().defaultModel,
        typing: false,
        origin: origin ?? null,
      });
    }
  },

  send: async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const ctx = get().context;
    const model = get().selectedModel ?? get().defaultModel;

    // 先把用户消息塞进 history，typing=true 让面板出现"打字中"三点动画。
    // 不预插空 AI 槽位——首个 chunk 到达时再创建 AI 消息，避免出现空气泡。
    set((s) => ({
      history: [...s.history, { role: "user", text: trimmed }],
      typing: true,
    }));

    // 确保有 sessionId 并立即写一次（避免发完就关导致用户消息丢失）
    let sid = get().sessionId;
    let createdAt: number;
    if (!sid) {
      sid = (typeof crypto !== "undefined" && "randomUUID" in crypto)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      createdAt = Date.now();
      sessionMeta.set(sid, createdAt);
      set({ sessionId: sid });
    } else {
      createdAt = sessionMeta.get(sid) ?? Date.now();
    }
    upsertSession(snapshotSession(sid, ctx, get().history, createdAt, model));
    const capturedSid = sid;

    const historyForRequest = get()
      .history.slice(0, -1) // 去掉刚才追加的 user
      .filter((m) => m.text.length > 0);

    const webSearch = get().webSearch;
    const ctxPart =
      ctx.key === "home" || !ctx.item
        ? { kind: "home" as const }
        : { kind: "item" as const, item: ctx.item };
    const body = {
      history: historyForRequest.map(({ role, text }) => ({ role, text })),
      user: trimmed,
      context: ctxPart,
      webSearch,
      model: model ?? undefined,
    };

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        if (j?.error !== "not_configured") {
          console.error("[ai-chat] request failed", { status: res.status, body: j });
        }
        const msg =
          j?.error === "not_configured"
            ? USER_MESSAGE.AI_CONFIG_MISSING
            : USER_MESSAGE.AI_REQUEST_FAILED;
        if (get().sessionId === capturedSid) {
          pushOrAppendAi(set, msg, model ?? undefined);
          set({ typing: false });
        }
        return;
      }

      const decoder = new TextDecoder();
      const reader = res.body.getReader();

      // SSE 行级 parser：按 `\n\n` 切事件块，每块内 `event:` 与 `data:` 行各一。
      // sources / delta / done / error 四种事件；其它静默丢弃。
      let buf = "";
      let sourcesAttached = false;

      const handleEvent = (event: string, raw: string) => {
        let data: unknown;
        try {
          data = JSON.parse(raw);
        } catch {
          return;
        }
        if (event === "delta" && typeof data === "string" && data) {
          pushOrAppendAi(set, data, model ?? undefined);
          return;
        }
        if (event === "sources" && !sourcesAttached) {
          const sources = (data as { sources?: SourceLink[] }).sources ?? [];
          if (sources.length > 0) {
            set((s) => ({
              history: [...s.history, { role: "ai" as const, text: "", model: model ?? undefined, sources }],
            }));
            sourcesAttached = true;
          }
          return;
        }
        if (event === "error") {
          console.error("[ai-chat] stream error event", data);
          pushOrAppendAi(set, `\n\n${USER_MESSAGE.AI_STREAM_BROKEN}`, model ?? undefined);
        }
        // "done" 由 reader 自然结束触发，这里不必特殊处理
      };

      const drain = () => {
        // 取出 buf 中所有完整事件块（以 \n\n 结尾），剩下不完整的留作下一轮
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          let event = "message";
          const dataLines: string[] = [];
          for (const line of block.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
            // 忽略 id: / retry: / 空行
          }
          if (dataLines.length === 0) continue;
          handleEvent(event, dataLines.join("\n"));
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (get().sessionId !== capturedSid) {
          // 用户已经点了「新建对话」或加载了别的 session，丢弃剩余流
          await reader.cancel().catch(() => undefined);
          break;
        }
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        buf += chunk;
        drain();
      }
      // flush 末尾可能没有 \n\n 结尾的最后一块（防御）
      if (buf.trim()) {
        buf += "\n\n";
        drain();
      }
    } catch (e) {
      console.error("[ai-chat] network error", e);
      if (get().sessionId === capturedSid) {
        pushOrAppendAi(set, `\n\n${USER_MESSAGE.NETWORK_HICCUP}`, model ?? undefined);
      }
    } finally {
      // 持久化最终结果——若 sessionId 已被 newChat/loadSession 抢占则跳过
      if (get().sessionId === capturedSid) {
        set({ typing: false });
        upsertSession(snapshotSession(capturedSid, get().context, get().history, createdAt, model));
      }
    }
  },

  newChat: () => {
    // 当前对话若有用户消息则归档（snapshot 已经在 send() 时持续写入，这里再补一次终态）
    const { sessionId, context, history, defaultModel } = get();
    if (sessionId && hasUserMessage(history)) {
      const createdAt = sessionMeta.get(sessionId) ?? Date.now();
      upsertSession(snapshotSession(sessionId, context, history, createdAt, get().selectedModel));
    }
    set({
      history: [{ role: "ai", text: welcomeFor(context) }],
      sessionId: null,
      selectedModel: defaultModel,
      typing: false,
    });
  },

  loadSession: (s) => {
    // 先把当前对话归档（如果有内容）
    const cur = get();
    if (cur.sessionId && hasUserMessage(cur.history)) {
      const createdAt = sessionMeta.get(cur.sessionId) ?? Date.now();
      upsertSession(snapshotSession(cur.sessionId, cur.context, cur.history, createdAt, cur.selectedModel));
    }
    sessionMeta.set(s.id, s.createdAt);
    const savedModel = s.model?.trim();
    const selectedModel = cur.modelPreferencesLoaded
      ? savedModel && cur.pinnedModels.includes(savedModel)
        ? savedModel
        : cur.defaultModel ?? cur.pinnedModels[0] ?? null
      : savedModel || cur.defaultModel;
    set({
      context: {
        key: s.contextKey,
        title: s.contextTitle,
        subtitle: s.contextSubtitle,
        item: s.item,
      },
      history: s.messages,
      sessionId: s.id,
      selectedModel,
      typing: false,
    });
  },

  reset: () => set({ history: [], typing: false, sessionId: null, selectedModel: get().defaultModel }),
}));

/** 末尾若已是 AI 消息则追加；否则新插一条。供流式累加和单条错误提示共用。 */
function pushOrAppendAi(
  set: (partial: Partial<AIPanelState> | ((s: AIPanelState) => Partial<AIPanelState>)) => void,
  text: string,
  model?: string,
) {
  set((s) => {
    const last = s.history[s.history.length - 1];
    if (last && last.role === "ai") {
      // 保留 sources 等其他字段（spread last 而不是只塞 text）
      return { history: [...s.history.slice(0, -1), { ...last, text: last.text + text }] };
    }
    return { history: [...s.history, { role: "ai" as const, text, model }] };
  });
}

/** detail 页用：从 UiItem 构造一个带 item 元信息的上下文。 */
export function detailContext(
  medium: UiMedium,
  uuid: string,
  title: string,
  year?: string | number,
  creator?: string,
  brief?: string,
): AIContextInfo {
  return {
    key: medium,
    title: aiBtnLabel(medium),
    subtitle: `上下文：${title}${year ? ` (${year})` : ""}`,
    item: { uuid, medium, title, year, creator, brief },
  };
}

function aiBtnLabel(medium: UiMedium): string {
  if (medium === "book") return "AI 解读";
  return "AI 聊聊";
}

/** 当前上下文下已存的对话（供 AIHistoryDrawer 读取）。 */
export function listSessionsForCurrentContext(ctx: AIContextInfo): AISession[] {
  const all = loadSessions();
  if (ctx.key === "home") {
    return all.filter((s) => s.contextKey === "home");
  }
  const itemKey = buildItemKey(ctx);
  if (itemKey) {
    return all.filter((s) => s.contextItemKey === itemKey);
  }
  return all.filter((s) => s.contextKey === ctx.key && !s.contextItemKey);
}

export function useEscapeToCloseAIPanel() {
  const setOpen = useAIPanel((s) => s.setOpen);
  const open = useAIPanel((s) => s.open);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, setOpen]);
}
