"use client";

import type { AIContextKey, AIContextInfo, ChatMsg } from "./ai-panel";

export interface AISession {
  id: string;
  contextKey: AIContextKey;
  /** "{medium}:{uuid}" — 用于精准匹配某条目的对话；home 对话为空 */
  contextItemKey?: string;
  contextTitle: string;
  contextSubtitle: string;
  item?: AIContextInfo["item"];
  /** Model selected for the next turn in this conversation. */
  model?: string;
  messages: ChatMsg[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "folio.ai.sessions.v1";
const MAX_SESSIONS = 200;

export function loadSessions(): AISession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return (arr as AISession[]).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function saveSessions(sessions: AISession[]) {
  if (typeof window === "undefined") return;
  const trimmed = sessions
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SESSIONS);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // 容量超限等情况静默丢弃
  }
}

export function upsertSession(session: AISession): void {
  const all = loadSessions();
  const idx = all.findIndex((s) => s.id === session.id);
  if (idx >= 0) all[idx] = session;
  else all.push(session);
  saveSessions(all);
}

export function deleteSession(id: string): void {
  saveSessions(loadSessions().filter((s) => s.id !== id));
}

export function buildItemKey(ctx: AIContextInfo): string | undefined {
  if (ctx.item?.uuid) return `${ctx.item.medium}:${ctx.item.uuid}`;
  return undefined;
}
