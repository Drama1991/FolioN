"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Stars } from "@/components/shared/Stars";
import { relativeTime } from "@/lib/format/dates";
import type { UiCommunityComment, UiCommunityReview } from "@/lib/neodb/ui-types";
import { USER_MESSAGE } from "@/lib/user-message";

interface Props {
  uuid: string;
  initialComments: UiCommunityComment[];
  initialCommentPages: number;
  commentCount: number;
  initialReviews: UiCommunityReview[];
  initialReviewPages: number;
  reviewCount: number;
  /** 当前 session 绑定的 NeoDB 实例 host；用于判断 reviewUrl 是否同站可以内部路由 */
  homeInstance: string | null;
}

/** 同站 review URL 提取 uuid → 内部 /review/{uuid} 可达；联邦或解析失败返回 null。 */
function localReviewUuid(reviewUrl: string | undefined, homeInstance: string | null): string | null {
  if (!reviewUrl || !homeInstance) return null;
  try {
    const u = new URL(reviewUrl);
    if (u.hostname !== homeInstance) return null;
    const m = u.pathname.match(/^\/review\/([^/]+)\/?$/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

export function CommunityPosts({
  uuid,
  initialComments,
  initialCommentPages,
  commentCount,
  initialReviews,
  initialReviewPages,
  reviewCount,
  homeInstance,
}: Props) {
  const hasComments = initialComments.length > 0;
  const hasReviews = initialReviews.length > 0;
  const [activeTab, setActiveTab] = useState<"comment" | "review">(hasComments ? "comment" : "review");

  if (!hasComments && !hasReviews) return null;

  const tabs = [
    hasComments ? { id: "comment" as const, label: "短评", count: commentCount } : null,
    hasReviews ? { id: "review" as const, label: "长评", count: reviewCount } : null,
  ].filter((tab): tab is { id: "comment" | "review"; label: string; count: number } => tab !== null);

  return (
    <div style={{ border: "0.5px solid var(--border)", borderRadius: "var(--r)", overflow: "hidden" }}>
      <div
        style={{
          padding: "11px 16px",
          borderBottom: "0.5px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
        }}
      >
        <span className="section-label">社区讨论</span>
        {tabs.length > 1 ? (
          <div role="tablist" aria-label="社区讨论类型" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {tabs.map((tab) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`community-${uuid}-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    border: 0,
                    borderRadius: 999,
                    padding: "4px 8px",
                    background: selected ? "var(--bg2)" : "transparent",
                    color: selected ? "var(--text)" : "var(--text3)",
                    fontFamily: "var(--mono)",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  {tab.label} {tab.count}
                </button>
              );
            })}
          </div>
        ) : (
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)" }}>
            {tabs[0].count} 条{tabs[0].label}
          </span>
        )}
      </div>

      {hasComments && (
        <div id={`community-${uuid}-comment`} role="tabpanel" hidden={activeTab !== "comment"}>
          <CommentsCard
            uuid={uuid}
            initial={initialComments}
            initialPages={initialCommentPages}
            total={commentCount}
          />
        </div>
      )}
      {hasReviews && (
        <div id={`community-${uuid}-review`} role="tabpanel" hidden={activeTab !== "review"}>
          <ReviewsCard
            uuid={uuid}
            initial={initialReviews}
            initialPages={initialReviewPages}
            total={reviewCount}
            homeInstance={homeInstance}
          />
        </div>
      )}
    </div>
  );
}

function CommentsCard({
  uuid,
  initial,
  initialPages,
  total,
}: {
  uuid: string;
  initial: UiCommunityComment[];
  initialPages: number;
  total: number;
}) {
  const [list, setList] = useState<UiCommunityComment[]>(initial);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(initialPages);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadMore = useCallback(async () => {
    if (loading || page >= pages) return;
    setLoading(true);
    setErr(null);
    try {
      const nextPage = page + 1;
      const res = await fetch(`/api/proxy/item-posts/${uuid}?type=comment&page=${nextPage}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: UiCommunityComment[]; pages: number };
      setList((prev) => dedupe([...prev, ...json.data]));
      setPage(nextPage);
      setPages(json.pages);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "load_failed");
    } finally {
      setLoading(false);
    }
  }, [uuid, page, pages, loading]);

  return (
    <>
      {list.map((c, i) => (
        <CommentRow key={c.id} c={c} isLast={i === list.length - 1 && page >= pages} />
      ))}
      <LoadMoreFooter
        canLoad={page < pages}
        loading={loading}
        err={err}
        onClick={loadMore}
        shown={list.length}
        total={total}
      />
    </>
  );
}

function ReviewsCard({
  uuid,
  initial,
  initialPages,
  total,
  homeInstance,
}: {
  uuid: string;
  initial: UiCommunityReview[];
  initialPages: number;
  total: number;
  homeInstance: string | null;
}) {
  const [list, setList] = useState<UiCommunityReview[]>(initial);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(initialPages);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadMore = useCallback(async () => {
    if (loading || page >= pages) return;
    setLoading(true);
    setErr(null);
    try {
      const nextPage = page + 1;
      const res = await fetch(`/api/proxy/item-posts/${uuid}?type=review&page=${nextPage}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: UiCommunityReview[]; pages: number };
      setList((prev) => dedupe([...prev, ...json.data]));
      setPage(nextPage);
      setPages(json.pages);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "load_failed");
    } finally {
      setLoading(false);
    }
  }, [uuid, page, pages, loading]);

  return (
    <>
      {list.map((r, i) => (
        <ReviewRow key={r.id} r={r} isLast={i === list.length - 1 && page >= pages} homeInstance={homeInstance} />
      ))}
      <LoadMoreFooter
        canLoad={page < pages}
        loading={loading}
        err={err}
        onClick={loadMore}
        shown={list.length}
        total={total}
      />
    </>
  );
}

function dedupe<T extends { id: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of arr) {
    if (seen.has(x.id)) continue;
    seen.add(x.id);
    out.push(x);
  }
  return out;
}

function LoadMoreFooter({
  canLoad,
  loading,
  err,
  onClick,
  shown,
  total,
}: {
  canLoad: boolean;
  loading: boolean;
  err: string | null;
  onClick: () => void;
  shown: number;
  total: number;
}) {
  if (!canLoad && !err) {
    // 全部加载完时不渲染脚注
    return null;
  }
  return (
    <div
      style={{
        borderTop: "0.5px solid var(--border)",
        padding: "10px 16px",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 10,
      }}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={loading || !canLoad}
        style={{
          background: "none",
          border: "none",
          color: loading ? "var(--text3)" : "var(--text2)",
          fontSize: 12,
          fontFamily: "inherit",
          cursor: loading || !canLoad ? "default" : "pointer",
          padding: "4px 10px",
          textDecoration: loading || !canLoad ? "none" : "underline",
          textUnderlineOffset: 3,
        }}
      >
        {loading ? "加载中…" : `加载更多 (剩余 ${Math.max(0, total - shown)} 条)`}
      </button>
      {err ? (
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)" }}>
          {USER_MESSAGE.LOAD_MORE_FAILED}
        </span>
      ) : null}
    </div>
  );
}

function Avatar({ src, name }: { src: string; name: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      width={28}
      height={28}
      style={{
        width: 28,
        height: 28,
        borderRadius: 999,
        objectFit: "cover",
        flexShrink: 0,
        background: "var(--bg2)",
      }}
    />
  );
}

function AuthorLine({
  author,
  createdAt,
  rating,
}: {
  author: UiCommunityComment["author"];
  createdAt: string;
  rating?: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
      <Avatar src={author.avatar} name={author.displayName} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--text)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {author.displayName}
        </p>
        <p
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            color: "var(--text3)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          @{author.handle}
        </p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {rating ? <Stars value={rating} size={11} /> : null}
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)" }}>
          {relativeTime(createdAt)}
        </span>
      </div>
    </div>
  );
}

function CommentRow({ c, isLast }: { c: UiCommunityComment; isLast: boolean }) {
  return (
    <div
      style={{
        padding: "12px 16px",
        borderBottom: isLast ? undefined : "0.5px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <AuthorLine author={c.author} createdAt={c.createdAt} rating={c.rating} />
      <p
        style={{
          fontFamily: "var(--serif)",
          fontSize: 13,
          lineHeight: 1.65,
          color: "var(--text)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {c.text}
      </p>
    </div>
  );
}

function ReviewRow({ r, isLast, homeInstance }: { r: UiCommunityReview; isLast: boolean; homeInstance: string | null }) {
  const body = (
    <>
      <AuthorLine author={r.author} createdAt={r.createdAt} rating={r.rating} />
      <p style={{ fontFamily: "var(--serif)", fontSize: 15, fontWeight: 500, lineHeight: 1.3, color: "var(--text)" }}>
        {r.title}
      </p>
      {r.excerpt && (
        <p
          style={{
            fontFamily: "var(--serif)",
            fontSize: 12.5,
            lineHeight: 1.6,
            color: "var(--text2)",
            wordBreak: "break-word",
          }}
        >
          {r.excerpt}
        </p>
      )}
    </>
  );

  const wrapStyle: React.CSSProperties = {
    padding: "12px 16px",
    borderBottom: isLast ? undefined : "0.5px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    textDecoration: "none",
    color: "inherit",
  };

  // 同站 → 内部全文阅读；联邦/解析失败 → 外链
  const localUuid = localReviewUuid(r.reviewUrl, homeInstance);
  if (localUuid) {
    return (
      <Link href={`/review/${localUuid}`} style={wrapStyle} title="阅读全文">
        {body}
      </Link>
    );
  }
  if (r.reviewUrl) {
    return (
      <a href={r.reviewUrl} target="_blank" rel="noreferrer noopener" style={wrapStyle} title="在 NeoDB 阅读全文">
        {body}
      </a>
    );
  }
  return <div style={wrapStyle}>{body}</div>;
}
