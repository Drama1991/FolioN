import Link from "next/link";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth/cookie";
import {
  getMe,
  listCollectionItems,
  listMyCollections,
  listMyReviews,
  listMyTags,
  shelfCount,
} from "@/lib/neodb/client";
import { reviewToUi } from "@/lib/neodb/mappers";
import { gradientFor } from "@/lib/format/cover-gradient";
import { ShareProfileButton } from "@/components/profile/ShareProfileButton";
import { ProfileOverflowMenu } from "@/components/profile/ProfileOverflowMenu";
import { ProfileAIButton } from "@/components/profile/ProfileAIButton";
import { ActivityHeatmap } from "@/components/profile/ActivityHeatmap";
import { pullYearMarks, summarizeYear } from "@/lib/profile/yearStats";

interface PageProps {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ year?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params;
  const session = await getSession();
  const isMe = handle === "me" || handle === session?.handle;
  let display = session?.handle || handle;
  let avatar: string | undefined;
  if (isMe) {
    try {
      const me = await getMe();
      display = me.display_name || me.username || display;
      avatar = me.avatar;
    } catch { /* fallback */ }
  }
  const title = `${display} · folion`;
  const description = `${display} 在 folion 的文化档案：看过、读过、听过、玩过的一切`;
  const images = avatar ? [{ url: avatar }] : undefined;
  return {
    title,
    description,
    openGraph: { title, description, type: "profile", images },
    twitter: { card: "summary", title, description, images: images?.map((i) => i.url) },
  };
}

function joinedLabel(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(+d)) return "";
  return `加入于 ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - +new Date(iso);
  const d = Math.floor(diff / 86400000);
  if (d < 1) return "今天";
  if (d < 7) return `${d}d`;
  if (d < 30) return `${Math.floor(d / 7)}w`;
  if (d < 365) return `${Math.floor(d / 30)}m`;
  return `${Math.floor(d / 365)}y`;
}

function collectionTotalCount(c: { item_count_by_category?: Record<string, number> }): number {
  if (!c.item_count_by_category) return 0;
  return Object.values(c.item_count_by_category).reduce((a, b) => a + b, 0);
}

export default async function ProfilePage({ params, searchParams }: PageProps) {
  const { handle } = await params;
  const sp = await searchParams;
  const session = await getSession();
  const isMe = handle === "me" || handle === session?.handle;

  const me = isMe ? await getMe().catch(() => null) : null;
  const display = me?.display_name || me?.username || session?.handle || handle;
  const acct = me?.acct || `${handle}@${session?.instance ?? "neodb.social"}`;
  const profileUrl = me?.url || `https://${session?.instance ?? "neodb.social"}/users/${handle}/`;

  const now = new Date();
  const currentYear = now.getFullYear();
  const yearStart = new Date(currentYear, 0, 1);

  // heatmap 年份：?year=YYYY，默认当年；只接受合理范围
  const requestedYear = (() => {
    const y = Number(sp.year);
    if (Number.isFinite(y) && y >= 2000 && y <= currentYear) return Math.floor(y);
    return currentYear;
  })();
  const sameYear = requestedYear === currentYear;
  const heatmapStart = new Date(requestedYear, 0, 1);
  const heatmapEnd = new Date(requestedYear + 1, 0, 1);

  // P2-7：用 Promise.allSettled —— callee 内部虽都有 catch 兜底，但明示更稳，
  // 后续谁不小心把 callee 改成 throw 也不会整页 5xx。
  const settledResults = await Promise.allSettled([
    shelfCount({ type: "complete", category: "movie" }),
    shelfCount({ type: "complete", category: "series" }),
    shelfCount({ type: "complete", category: "book" }),
    shelfCount({ type: "complete", category: "music" }),
    shelfCount({ type: "complete", category: "podcast" }),
    shelfCount({ type: "complete", category: "game" }),
    shelfCount({ type: "progress" }),
    shelfCount({ type: "wishlist" }),
    listMyCollections({ page: 1 }),
    listMyTags(),
    listMyReviews({ page: 1 }),
    isMe ? pullYearMarks(yearStart) : Promise.resolve([]),
    isMe && !sameYear ? pullYearMarks(heatmapStart, heatmapEnd) : Promise.resolve(null),
  ]);

  const pick = <T,>(idx: number, fallback: T): T => {
    const r = settledResults[idx];
    return r.status === "fulfilled" ? (r.value as T) : fallback;
  };
  const watchedMovie = pick<number>(0, 0);
  const watchedSeries = pick<number>(1, 0);
  const readBook = pick<number>(2, 0);
  const listenedMusic = pick<number>(3, 0);
  const listenedPodcast = pick<number>(4, 0);
  const playedGame = pick<number>(5, 0);
  const progressAll = pick<number>(6, 0);
  const wishlistAll = pick<number>(7, 0);
  const collectionsPaged = pick<Awaited<ReturnType<typeof listMyCollections>>>(8, { data: [] });
  const rawTags = pick<Awaited<ReturnType<typeof listMyTags>>>(9, []);
  const reviews = pick<Awaited<ReturnType<typeof listMyReviews>>>(10, { data: [], count: 0 });
  const yearMarks = pick<Awaited<ReturnType<typeof pullYearMarks>>>(11, []);
  const heatmapMarksOther = pick<Awaited<ReturnType<typeof pullYearMarks>> | null>(12, null);
  const heatmapMarks = heatmapMarksOther ?? yearMarks;

  const stats = [
    { label: "看过", num: watchedMovie + watchedSeries, sub: "电影 · 剧集", href: "/archive/movie" },
    { label: "读过", num: readBook, sub: "书籍", href: "/archive/book" },
    { label: "听过", num: listenedMusic + listenedPodcast, sub: "音乐 · 播客", href: "/archive/music" },
    { label: "玩过", num: playedGame, sub: "游戏", href: "/archive/game" },
    { label: "在看", num: progressAll, sub: "进行中", href: "/timeline" },
    { label: "想看", num: wishlistAll, sub: "待开始", href: "/wishlist" },
  ];

  // 合集封面：每个合集拉前 4 个 item 的封面（最多展示 6 个合集，控本）
  const collections = (collectionsPaged.data ?? []).slice(0, 6);
  const collectionWithCovers = await Promise.all(
    collections.map(async (c) => {
      const items = await listCollectionItems(c.uuid, { page: 1 });
      const covers = (items.data ?? []).slice(0, 5).map((ci) => ({
        cover: ci.item.cover_image_url ?? null,
        seed: ci.item.uuid,
      }));
      return { ...c, covers, total: collectionTotalCount(c) };
    }),
  );

  // 标签：按 title 排序，展示前 12 个 + 折叠
  const tagsSorted = [...rawTags].sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
  const tagsHead = tagsSorted.slice(0, 12);
  const tagsRest = tagsSorted.length - tagsHead.length;

  // P0 修复（2026-05-24）：NeoDB 偶发返回 review.item===null，reviewToUi 会 NPE → 整页 500。
  // 同 /profile/[handle]/reviews/page.tsx 的处理。
  const reviewUi = (reviews.data ?? [])
    .filter((r) => r && r.item)
    .slice(0, 4)
    .map(reviewToUi);
  const heroReview = reviewUi[0];
  const restReviews = reviewUi.slice(1);

  // 档案总览：用已拉到的数据聚合，零额外 fetch
  const lifetimeMarks =
    watchedMovie + watchedSeries + readBook + listenedMusic + listenedPodcast + progressAll + wishlistAll;
  const collectionsCount = collectionsPaged.count ?? collectionWithCovers.length;
  const reviewsCount = reviews.count ?? reviewUi.length;
  const tagsCount = rawTags.length;
  const yr = summarizeYear(yearMarks);

  return (
    <div className="profile-page">
      {/* ───── Hero ───── */}
      <div className="profile-hero" style={{
        display: "grid",
        gap: 20,
        alignItems: "flex-start",
        paddingBottom: 22,
        borderBottom: "0.5px solid var(--border)",
        marginBottom: 22,
      }}>
        <div style={{
          width: 88, height: 88, borderRadius: "50%",
          background: me?.avatar ? `center/cover url(${me.avatar})` : "#2C2C2A",
          color: "#D3D1C7", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 34, fontFamily: "var(--serif)", fontWeight: 500,
        }}>
          {!me?.avatar && display.slice(0, 1)}
        </div>
        <div style={{ paddingTop: 4, minWidth: 0 }}>
          <p style={{ fontFamily: "var(--serif)", fontSize: 30, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.05 }}>{display}</p>
          <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)", marginTop: 7 }}>
            @{acct}{me?.created_at ? ` · ${joinedLabel(me.created_at)}` : ""}
          </p>
          {me?.note && (
            <p style={{ fontFamily: "var(--serif)", fontSize: 13, color: "var(--text2)", marginTop: 10, lineHeight: 1.65, maxWidth: 500 }}>
              {me.note}
            </p>
          )}
        </div>
        {isMe && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {/* 桌面端：两个胶囊按钮（编辑外链 + 分享）。移动端 CSS 隐藏。 */}
            <div className="profile-actions-desktop">
              <ProfileAIButton />
              <a
                className="btn"
                href={profileUrl}
                target="_blank"
                rel="noreferrer noopener"
                title="NeoDB 暂不开放资料编辑 API · 跳转去 NeoDB"
              >
                在 NeoDB 编辑 ↗
              </a>
              <ShareProfileButton url={profileUrl} />
            </div>
            {/* 移动端：5 个等大图标方块（AI/通知/设置/分享/⋯）。
               原"在 NeoDB 编辑"和"登出"收进 ⋯ 溢出菜单，
               让 AI、站内高频入口（通知/设置）跟分享获得平等的一级视觉权重。
               桌面端走 AvatarMenu + .profile-actions-desktop，本行 CSS 隐藏。 */}
            <div className="profile-me-actions">
              <ProfileAIButton variant="mobile" />
              <Link href="/settings" aria-label="设置" className="profile-me-icon">
                <i className="ti ti-settings" aria-hidden />
              </Link>
              <Link href="/notifications" aria-label="通知" className="profile-me-icon">
                <i className="ti ti-bell" aria-hidden />
              </Link>
              <ShareProfileButton url={profileUrl} variant="icon" />
              <ProfileOverflowMenu profileUrl={profileUrl} />
            </div>
          </div>
        )}
      </div>

      {/* ───── Stats ───── */}
      <div className="profile-stats" style={{ display: "grid", gap: 8, marginBottom: 14 }}>
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="stat-cell">
            <p className="stat-lbl">{s.label}</p>
            <p className="stat-num">{s.num}</p>
            <p className="stat-sub">{s.sub}</p>
          </Link>
        ))}
      </div>

      {/* ───── 活动热力图（GitHub 风） ───── */}
      {isMe && (
        <ActivityHeatmap
          year={requestedYear}
          currentYear={currentYear}
          marks={heatmapMarks}
          handle={handle}
        />
      )}

      {/* ───── 年度回顾 黑卡 ───── */}
      {lifetimeMarks > 0 && (
        <div style={{
          background: "linear-gradient(135deg, #2C2C2A 0%, #1C1C1A 100%)",
          borderRadius: "var(--r)",
          padding: "22px 24px",
          color: "#F1EFE8",
          marginBottom: 24,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <p style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.12em", color: "var(--gold)" }}>
                {currentYear} 至今 · 年度回顾
              </p>
              <p style={{ fontFamily: "var(--serif)", fontSize: 24, marginTop: 8, fontWeight: 500, letterSpacing: "-0.01em" }}>
                {yr.total > 0
                  ? `今年完成 ${yr.total} 件作品${yr.briefMix ? `，${yr.briefMix}。` : "。"}`
                  : `今年还没有完成的记录，档案累计 ${lifetimeMarks} 件。`}
              </p>
            </div>
          </div>
          <div className="profile-year-grid" style={{ display: "grid", gap: 18 }}>
            <div>
              <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "#888780", textTransform: "uppercase", letterSpacing: "0.06em" }}>最爱创作者</p>
              <p style={{ fontFamily: "var(--serif)", fontSize: 14, color: "#F1EFE8", marginTop: 4, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {yr.topCreator?.name ?? "—"}
              </p>
              <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "#888780", marginTop: 2 }}>
                {yr.topCreator ? `${yr.topCreator.count} 件` : "本年无足够样本"}
              </p>
            </div>
            <div>
              <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "#888780", textTransform: "uppercase", letterSpacing: "0.06em" }}>最常类型</p>
              <p style={{ fontFamily: "var(--serif)", fontSize: 14, color: "#F1EFE8", marginTop: 4, fontWeight: 500 }}>
                {yr.total > 0 ? yr.topMediumLabel : "—"}
              </p>
              <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "#888780", marginTop: 2 }}>
                {yr.total > 0 ? `占 ${yr.topMediumPct}%` : "本年无样本"}
              </p>
            </div>
            <div>
              <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "#888780", textTransform: "uppercase", letterSpacing: "0.06em" }}>平均评分</p>
              <p style={{ fontFamily: "var(--serif)", fontSize: 14, color: "#F1EFE8", marginTop: 4, fontWeight: 500 }}>
                {yr.avgRating5 !== null ? `${yr.avgRating5} / 5` : "—"}
              </p>
              <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "#888780", marginTop: 2 }}>
                {yr.avgRating5 !== null ? `${yr.ratedCount} 件已评分` : "尚未打分"}
              </p>
            </div>
            <div>
              <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "#888780", textTransform: "uppercase", letterSpacing: "0.06em" }}>档案累计</p>
              <p style={{ fontFamily: "var(--serif)", fontSize: 14, color: "#F1EFE8", marginTop: 4, fontWeight: 500 }}>{lifetimeMarks} 件</p>
              <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "#888780", marginTop: 2 }}>
                合集 {collectionsCount} · 长评 {reviewsCount} · 标签 {tagsCount}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ───── Collections ───── */}
      {collectionWithCovers.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <span className="section-label">公开合集 · {collectionsPaged.count ?? collectionWithCovers.length}</span>
          </div>
          <div className="profile-collections" style={{ display: "grid", gap: 8 }}>
            {collectionWithCovers.map((c) => (
              <a key={c.uuid} href={c.url} target="_blank" rel="noreferrer noopener" className="collection">
                <p style={{ fontFamily: "var(--serif)", fontSize: 15, fontWeight: 500 }}>{c.title}</p>
                {c.brief && (
                  <p style={{ fontSize: 11, color: "var(--text2)", marginTop: 5, lineHeight: 1.55, fontFamily: "var(--serif)" }}>
                    {c.brief.slice(0, 60)}{c.brief.length > 60 ? "…" : ""}
                  </p>
                )}
                <div style={{ display: "flex", alignItems: "center", marginTop: 12, justifyContent: "space-between" }}>
                  <div className="cov-stack">
                    {c.covers.length > 0 ? c.covers.map((cv, i) => (
                      <div
                        key={i}
                        className={`cov ${!cv.cover ? gradientFor(cv.seed) : ""}`}
                        style={cv.cover ? { backgroundImage: `url(${cv.cover})` } : undefined}
                      />
                    )) : <div className="cov c1" />}
                  </div>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)" }}>
                    {c.total > 0 ? `${c.total} 项 · ` : ""}更新于 {timeAgo(c.created_time)}
                  </span>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ───── Tags ───── */}
      {tagsHead.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <span className="section-label">我的标签 · 按字母</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {tagsHead.map((t) => (
              <span key={t.uuid} className="tag-chip">{t.title}</span>
            ))}
            {tagsRest > 0 && <span className="tag-chip muted">+ {tagsRest} 个</span>}
          </div>
        </div>
      )}

      {/* ───── Featured Review + rest ───── */}
      {heroReview && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <span className="section-label">最近写的 · 长评</span>
            <Link href={`/profile/${handle}/reviews`} style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)", textDecoration: "none" }}>
              查看全部 →
            </Link>
          </div>

          <Link
            href={`/review/${heroReview.uuid}`}
            style={{
              display: "block",
              border: "0.5px solid var(--border)",
              borderRadius: "var(--r)",
              padding: "20px 22px",
              textDecoration: "none",
              color: "inherit",
              background: "var(--bg)",
            }}
          >
            <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {new Date(heroReview.createdAt).toLocaleDateString("zh-CN")} · {heroReview.itemTitle}
            </p>
            <p style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 500, letterSpacing: "-0.01em", marginTop: 8 }}>
              {heroReview.title}
            </p>
            <p style={{ fontFamily: "var(--serif)", fontSize: 13, lineHeight: 1.8, color: "var(--text2)", marginTop: 10 }}>
              {(heroReview.body || "").slice(0, 200)}{(heroReview.body || "").length > 200 ? "…" : ""}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14, fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)" }}>
              <span>{(heroReview.body || "").length} 字</span>
            </div>
          </Link>

          {restReviews.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", marginTop: 4 }}>
              {restReviews.map((rv) => (
                <Link
                  key={rv.uuid}
                  href={`/review/${rv.uuid}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    padding: "12px 4px",
                    borderBottom: "0.5px solid var(--border)",
                    textDecoration: "none",
                    color: "inherit",
                    gap: 16,
                  }}
                >
                  <span style={{ fontFamily: "var(--serif)", fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                    {rv.title}
                  </span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)", flexShrink: 0 }}>
                    {rv.itemTitle} · {new Date(rv.createdAt).toLocaleDateString("zh-CN")}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
