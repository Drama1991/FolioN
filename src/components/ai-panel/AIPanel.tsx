"use client";

import { useEffect, useRef, useState } from "react";
import { useAIPanel, type SourceLink } from "@/lib/store/ai-panel";
import type { AIConfig } from "@/lib/ai/types";
import { suggs } from "@/lib/ai/replies";
import { AIHistoryDrawer } from "./AIHistory";
import { DraggableWindow } from "@/components/shared/DraggableWindow";

export function AIPanel() {
  const open = useAIPanel((s) => s.open);
  const context = useAIPanel((s) => s.context);
  const history = useAIPanel((s) => s.history);
  const typing = useAIPanel((s) => s.typing);
  const selectedModel = useAIPanel((s) => s.selectedModel);
  const defaultModel = useAIPanel((s) => s.defaultModel);
  const pinnedModels = useAIPanel((s) => s.pinnedModels);
  const origin = useAIPanel((s) => s.origin);
  const webSearch = useAIPanel((s) => s.webSearch);
  const setOpen = useAIPanel((s) => s.setOpen);
  const setWebSearch = useAIPanel((s) => s.setWebSearch);
  const send = useAIPanel((s) => s.send);
  const setSelectedModel = useAIPanel((s) => s.setSelectedModel);
  const setModelPreferences = useAIPanel((s) => s.setModelPreferences);
  const newChat = useAIPanel((s) => s.newChat);

  const [input, setInput] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [modelConfigLoading, setModelConfigLoading] = useState(false);
  const [modelConfigError, setModelConfigError] = useState<string | null>(null);
  const msgsRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const modelToggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || typing) setModelMenuOpen(false);
  }, [open, typing]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setModelConfigLoading(true);
    setModelConfigError(null);
    (async () => {
      try {
        const res = await fetch("/api/ai/config");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = (await res.json()) as { config: AIConfig };
        if (cancelled) return;
        const config = result.config;
        setModelPreferences(config[config.provider].model, config.pinnedModels[config.provider]);
      } catch (e) {
        if (!cancelled) setModelConfigError(e instanceof Error ? e.message : "load_failed");
      } finally {
        if (!cancelled) setModelConfigLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, setModelPreferences]);

  useEffect(() => {
    const onConfigUpdated = (event: Event) => {
      const config = (event as CustomEvent<AIConfig>).detail;
      if (!config) return;
      setModelPreferences(config[config.provider].model, config.pinnedModels[config.provider]);
    };
    window.addEventListener("folio:ai-config-updated", onConfigUpdated);
    return () => window.removeEventListener("folio:ai-config-updated", onConfigUpdated);
  }, [setModelPreferences]);

  useEffect(() => {
    if (!modelMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!modelPickerRef.current?.contains(e.target as Node)) setModelMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [modelMenuOpen]);

  useEffect(() => {
    if (!modelMenuOpen) return;
    modelMenuRef.current?.querySelector<HTMLButtonElement>('[data-model-option="true"][aria-pressed="true"]')?.focus();
  }, [modelMenuOpen]);

  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [history.length, typing]);

  // textarea 自适应高度：内容变化时重置后取 scrollHeight；空时回到单行
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [input]);

  if (!open) return null;

  const list = suggs[context.key] ?? suggs.home;

  function onModelMenuKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setModelMenuOpen(false);
      modelToggleRef.current?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    const options = [...(modelMenuRef.current?.querySelectorAll<HTMLButtonElement>('[data-model-option="true"]') ?? [])];
    if (options.length === 0) return;
    e.preventDefault();
    const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number;
    if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = options.length - 1;
    else if (currentIndex < 0) nextIndex = e.key === "ArrowDown" ? 0 : options.length - 1;
    else nextIndex = (currentIndex + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
    options[nextIndex].focus();
  }

  function onModelToggleKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setModelMenuOpen(true);
      return;
    }
    onModelMenuKeyDown(e);
  }

  const header = (
    <div style={{ padding: "12px 16px", borderBottom: "0.5px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <p style={{ fontFamily: "var(--serif)", fontSize: 14, fontWeight: 500 }}>{context.title}</p>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => newChat()} className="btn" style={{ fontSize: 11, padding: "4px 9px" }} aria-label="新建对话" title="新建对话">
            <i className="ti ti-plus" style={{ fontSize: 12 }} />
          </button>
          <button onClick={() => setHistoryOpen(true)} className="btn" style={{ fontSize: 11, padding: "4px 9px" }} aria-label="历史" title="历史">
            <i className="ti ti-history" style={{ fontSize: 12 }} />
          </button>
          <button onClick={() => setOpen(false)} className="btn" style={{ fontSize: 11, padding: "4px 9px" }} aria-label="关闭">×</button>
        </div>
      </div>
      <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)", marginTop: 4 }}>{context.subtitle}</p>
    </div>
  );

  return (
    <DraggableWindow
      origin={origin}
      storageKey="ai-panel"
      defaultSize={{ w: 380, h: 540 }}
      minSize={{ w: 320, h: 360 }}
      onClose={() => setOpen(false)}
      header={header}
    >
      <div
        ref={msgsRef}
        style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}
      >
        {history.map((m, i) => (
          <div
            key={i}
            className="fade-up"
            style={{
              alignSelf: m.role === "ai" ? "flex-start" : "flex-end",
              maxWidth: "85%",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {m.role === "ai" && m.model && (
              <span
                title={`使用模型：${m.model}`}
                style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text3)", paddingLeft: 2 }}
              >
                {m.model}
              </span>
            )}
            {m.text && (
              <div
                style={{
                  padding: "9px 13px", borderRadius: "var(--r2)", fontSize: 12, lineHeight: 1.65,
                  background: m.role === "ai" ? "var(--bg2)" : "linear-gradient(135deg, #E0B270 0%, #D38A30 50%, #A86515 100%)",
                  color: m.role === "ai" ? "var(--text)" : "#FFF6E6",
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                }}
              >
                {m.text}
              </div>
            )}
            {m.role === "ai" && m.sources && m.sources.length > 0 && (
              <SourceChips sources={m.sources} />
            )}
          </div>
        ))}
        {typing && (
          <div style={{ alignSelf: "flex-start", display: "flex", gap: 4, padding: "9px 13px" }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{
                width: 5, height: 5, borderRadius: "50%", background: "var(--text3)",
                animation: "pulse 1.2s infinite", animationDelay: `${i * 0.2}s`,
              }} />
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: "10px 14px", borderTop: "0.5px solid var(--border)" }}>
        <div style={{ display: "flex", gap: 5, marginBottom: 8, flexWrap: "wrap" }}>
          {list.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              style={{
                fontSize: 11, padding: "4px 10px", borderRadius: 999,
                border: "0.5px solid var(--border)", color: "var(--text2)",
                cursor: "pointer", background: "none", whiteSpace: "nowrap", fontFamily: "inherit",
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!input.trim()) return;
            send(input);
            setInput("");
          }}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            background: "var(--bg2)",
            border: `0.5px solid ${webSearch ? "var(--gold)" : "var(--border)"}`,
            borderRadius: "var(--r)",
            padding: "8px 10px 8px 12px",
            transition: "border-color .12s",
          }}
        >
          <textarea
            ref={taRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter 发送 / Shift+Enter 换行；IME 组合输入中的 Enter 不当作发送
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (input.trim()) {
                  send(input);
                  setInput("");
                }
              }
            }}
            placeholder={webSearch ? "联网搜索 + AI…" : "问点什么…"}
            style={{
              width: "100%", padding: "2px 0",
              border: "none", background: "transparent",
              fontSize: 13, outline: "none", fontFamily: "inherit",
              color: "var(--text)",
              resize: "none",
              lineHeight: 1.5,
              maxHeight: 160,
              overflowY: "auto",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              ref={modelPickerRef}
              onBlur={(e) => {
                const nextTarget = e.relatedTarget;
                if (!(nextTarget instanceof Node) || !e.currentTarget.contains(nextTarget)) setModelMenuOpen(false);
              }}
              style={{ position: "relative", minWidth: 0 }}
            >
              <button
                type="button"
                ref={modelToggleRef}
                className="ai-panel-model-toggle"
                onClick={() => setModelMenuOpen((value) => !value)}
                onKeyDown={onModelToggleKeyDown}
                disabled={typing}
                aria-label={`当前模型：${selectedModel ?? "未选择"}`}
                aria-haspopup="dialog"
                aria-expanded={modelMenuOpen}
                aria-controls="ai-panel-model-list"
                title={typing ? "回复生成中，暂不能切换模型" : selectedModel ?? "选择固定模型"}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  width: 156,
                  maxWidth: "min(48vw, 184px)",
                  minWidth: 96,
                  height: 28,
                  padding: "0 9px",
                  border: "0.5px solid var(--border)",
                  borderRadius: 999,
                  background: "var(--bg)",
                  color: "var(--text2)",
                  cursor: typing ? "default" : "pointer",
                  opacity: typing ? 0.6 : 1,
                  fontFamily: "inherit",
                  fontSize: 10,
                }}
              >
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--mono)" }}>
                  {selectedModel ?? (modelConfigLoading ? "读取中…" : "选择模型")}
                </span>
                <i className="ti ti-chevron-down" aria-hidden="true" style={{ fontSize: 11, flexShrink: 0 }} />
              </button>

              {modelMenuOpen && (
                <div
                  ref={modelMenuRef}
                  id="ai-panel-model-list"
                  role="dialog"
                  aria-label="选择固定模型"
                  onKeyDown={onModelMenuKeyDown}
                  style={{
                    position: "absolute",
                    left: 0,
                    bottom: "calc(100% + 8px)",
                    width: 258,
                    maxWidth: "min(82vw, 300px)",
                    maxHeight: 320,
                    padding: 6,
                    overflowY: "auto",
                    border: "0.5px solid var(--border)",
                    borderRadius: "var(--r)",
                    background: "var(--bg)",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
                    zIndex: 30,
                  }}
                >
                  <div style={{ padding: "7px 8px 8px", borderBottom: "0.5px solid var(--border)", marginBottom: 4 }}>
                    <p style={{ fontSize: 12, color: "var(--text)" }}>固定的模型</p>
                    <p style={{ fontSize: 10, color: "var(--text3)", marginTop: 2 }}>仅展示设置中固定的模型</p>
                  </div>
                  {modelConfigLoading && pinnedModels.length === 0 && (
                    <p role="status" style={{ padding: "10px 8px", fontSize: 11, color: "var(--text3)" }}>读取模型设置中…</p>
                  )}
                  {modelConfigError && (
                    <p role="alert" style={{ padding: "8px", fontSize: 11, color: "var(--danger)" }}>
                      模型设置读取失败。关闭后重新打开面板可重试。
                    </p>
                  )}
                  {!modelConfigLoading && !modelConfigError && pinnedModels.length === 0 && (
                    <div style={{ padding: "8px" }}>
                      <p style={{ fontSize: 11, color: "var(--text3)" }}>还没有固定模型。</p>
                      <a
                        href="/settings"
                        onClick={() => setOpen(false)}
                        style={{ display: "inline-block", marginTop: 6, fontSize: 11, color: "var(--text2)", textDecoration: "underline", textUnderlineOffset: 3 }}
                      >
                        前往 AI 设置
                      </a>
                    </div>
                  )}
                  {pinnedModels.length > 0 && (
                    <div>
                      {pinnedModels.map((model) => {
                        const isSelected = model === selectedModel;
                        const isDefault = model === defaultModel;
                        return (
                          <button
                            key={model}
                            type="button"
                            data-model-option="true"
                            aria-pressed={isSelected}
                            onClick={() => {
                              setSelectedModel(model);
                              setModelMenuOpen(false);
                              modelToggleRef.current?.focus();
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              width: "100%",
                              minHeight: 36,
                              padding: "6px 8px",
                              border: 0,
                              borderRadius: "var(--r2)",
                              background: isSelected ? "var(--bg2)" : "transparent",
                              color: "var(--text2)",
                              cursor: "pointer",
                              textAlign: "left",
                              fontFamily: "var(--mono)",
                              fontSize: 11,
                            }}
                          >
                            <span
                              style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                              title={model}
                            >
                              {model}
                            </span>
                            {isDefault && <span style={{ color: "var(--gold)", fontSize: 10, flexShrink: 0 }}>默认</span>}
                            {isSelected && <i className="ti ti-check" aria-hidden="true" style={{ color: "var(--gold)", fontSize: 13, flexShrink: 0 }} />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setWebSearch(!webSearch)}
              title={webSearch ? "联网搜索已开启 · 点击关闭" : "联网搜索（基于实时网页，需先在设置里填 Brave API key）"}
              aria-label={webSearch ? "关闭联网搜索" : "开启联网搜索"}
              aria-pressed={webSearch}
              className="ai-panel-web-toggle"
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 26, height: 26,
                border: "none",
                background: "transparent",
                color: webSearch ? "var(--gold)" : "var(--text2)",
                cursor: "pointer", fontFamily: "inherit", padding: 0,
                transition: "color .12s",
              }}
            >
              <i className="ti ti-world" style={{ fontSize: 16 }} />
            </button>
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="发送"
              className="ai-panel-send"
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 28, height: 28, borderRadius: 999,
                marginLeft: "auto",
                border: "none",
                background: input.trim() ? "var(--gold)" : "var(--border)",
                color: input.trim() ? "#1C1C1A" : "var(--text3)",
                cursor: input.trim() ? "pointer" : "default",
                transition: "background .12s, color .12s",
              }}
            >
              <i className="ti ti-arrow-up" style={{ fontSize: 14 }} />
            </button>
          </div>
        </form>
      </div>

      <AIHistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </DraggableWindow>
  );
}

function SourceChips({ sources }: { sources: SourceLink[] }) {
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
      {sources.map((s, i) => (
        <a
          key={i}
          href={s.url}
          target="_blank"
          rel="noreferrer noopener"
          title={s.title}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "3px 8px 3px 4px", borderRadius: 999,
            background: "var(--bg)", border: "0.5px solid var(--border)",
            color: "var(--text2)", textDecoration: "none",
            fontSize: 11, fontFamily: "var(--mono)",
            cursor: "pointer", maxWidth: 160,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          <img
            src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(s.domain)}&sz=32`}
            alt=""
            width={12}
            height={12}
            style={{ borderRadius: 2, flexShrink: 0 }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{`[${i + 1}] ${s.domain}`}</span>
        </a>
      ))}
    </div>
  );
}
