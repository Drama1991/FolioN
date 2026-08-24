"use client";

import { useAIPanel } from "@/lib/store/ai-panel";

interface ProfileAIButtonProps {
  variant?: "desktop" | "mobile";
}

/** Open the global AI conversation from the profile header. */
export function ProfileAIButton({ variant = "desktop" }: ProfileAIButtonProps) {
  const setOpen = useAIPanel((s) => s.setOpen);

  return (
    <button
      type="button"
      className={variant === "mobile" ? "profile-me-icon profile-ai-icon" : "profile-ai-button"}
      onClick={(e) => setOpen(true, "home", { x: e.clientX, y: e.clientY })}
      aria-label="AI 助手"
      title="全局询问"
    >
      <i className="ti ti-sparkles" aria-hidden />
      {variant === "desktop" && <span>AI 助手</span>}
    </button>
  );
}
