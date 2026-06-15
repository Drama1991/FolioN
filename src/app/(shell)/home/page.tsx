import { getSession } from "@/lib/auth/cookie";
import { listMyNotes, listShelf } from "@/lib/neodb/client";
import { markToTimelineEntry } from "@/lib/neodb/mappers";
import { formatProgress } from "@/lib/format/progress";
import { HomeHero } from "@/components/home/HomeHero";
import { BentoTop } from "@/components/home/BentoTop";
import { ActivityStrip } from "@/components/home/ActivityStrip";
import { CategoryCells } from "@/components/home/CategoryCells";
import { ALL_UI_MEDIUMS } from "@/lib/neodb/mediumMap";

export default async function HomePage() {
  const session = await getSession();
  const display = session?.display || session?.handle || "你";

  // 并行拉四个 shelf 的最新一页；首页"最近动态"要包含所有标记动作（在看/看过/想看/弃）
  const SHELF_TYPES = ["progress", "complete", "wishlist", "dropped"] as const;
  const shelfLists = await Promise.all(
    SHELF_TYPES.map((type) =>
      listShelf({ type, page: 1 }).catch(() => ({ data: [] as never[] })),
    ),
  );
  const [progressList] = shelfLists;

  // 跨 shelf 按 created_time 倒序的全量 mark；featured / continueWatching / recentMarks 都从这里派生
  const allMarks = shelfLists
    .flatMap((p) => p.data ?? [])
    .sort((a, b) => +new Date(b.created_time) - +new Date(a.created_time));
  const progressMarks = progressList.data ?? [];
  const isProgressMode = progressMarks.length > 0;

  // 最近 5 条 mark：跨所有 shelf type
  const recentMarks = allMarks.slice(0, 5).map(markToTimelineEntry);

  // 每个分类封面墙：拉该分类「已完成」最近 3 个，与点进去的 archive 默认视图（complete + 按时间）一致。
  // 不能复用上面 4 个 shelf 的合并结果——complete 第一页混合所有分类，音乐/播客这类少量分类会被电影剧集挤出窗口。
  const completeByMedium = await Promise.all(
    ALL_UI_MEDIUMS.map((m) =>
      listShelf({ type: "complete", category: m, page: 1 }).catch(() => ({ data: [] as never[] })),
    ),
  );
  const categoryCells = ALL_UI_MEDIUMS.map((m, i) => ({
    medium: m,
    covers: (completeByMedium[i].data ?? []).slice(0, 3).map((mark) => ({
      src: mark.item.cover_image_url,
      uuid: mark.item.uuid,
    })),
  }));

  // featured：progress 模式取最新在看；否则 fallback 到最新一条任意 mark
  const featured = isProgressMode ? progressMarks[0] : allMarks[0];
  const featuredUi = featured ? markToTimelineEntry(featured) : null;

  // 仅对 progress 项查 progress label（fallback 模式下省一次 notes fetch）
  if (featuredUi && featuredUi.status === "progress") {
    const notes = await listMyNotes(featuredUi.uuid).catch(() => ({ data: [] }));
    const latest = notes.data
      .filter((n) => n.progress_type && n.progress_value)
      .sort((a, b) => +new Date(b.created_time) - +new Date(a.created_time))[0];
    featuredUi.progressLabel = formatProgress(latest, featuredUi.medium);
  }

  // 右栏：progress 模式取 progress 第 2-3 条；fallback 模式取 allMarks 第 2-3 条
  const continueItems = isProgressMode ? progressMarks.slice(1, 3) : allMarks.slice(1, 3);
  const continueWatching = continueItems.map(markToTimelineEntry);

  return (
    <div style={{ padding: "28px 24px 24px" }}>
      <HomeHero display={display} />
      <BentoTop
        featured={featuredUi}
        continueWatching={continueWatching}
        continuePanelTitle={isProgressMode ? "继续看" : "最近记录"}
        continuePanelHref={isProgressMode ? "/timeline?status=progress" : "/timeline"}
      />
      <ActivityStrip recent={recentMarks} />
      <CategoryCells cells={categoryCells} />
    </div>
  );
}
