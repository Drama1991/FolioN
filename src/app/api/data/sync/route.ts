import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth/cookie";
import { listShelf, tags as neodbTags } from "@/lib/neodb/client";
import type { NeoDBShelfType } from "@/lib/neodb/types";

export const dynamic = "force-dynamic";

/** 轻量同步：让 NeoDB 缓存的 shelf tag 失效 + 探一下首页计数，确认 token 还活着。
 *  不拉全量。前端按返回的 stats 决定要不要触发更深刷新。 */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const t0 = Date.now();
  // 一刀切：所有 shelf 列表缓存失效，下次页面访问会重新拉
  revalidateTag(neodbTags.shelfAny(), { expire: 0 });
  revalidateTag(neodbTags.myReviews(), { expire: 0 });
  revalidateTag(neodbTags.myCollections(), { expire: 0 });

  const shelfTypes: NeoDBShelfType[] = ["wishlist", "progress", "complete", "dropped"];
  try {
    const counts = await Promise.all(
      shelfTypes.map(async (type) => {
        const p = await listShelf({ type, page: 1 });
        return [type, p.count ?? p.data.length] as const;
      }),
    );
    const stats = Object.fromEntries(counts) as Record<NeoDBShelfType, number>;
    const total = Object.values(stats).reduce((a, b) => a + b, 0);
    return NextResponse.json({
      ok: true,
      ts: Date.now(),
      durationMs: Date.now() - t0,
      stats,
      total,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        ts: Date.now(),
        durationMs: Date.now() - t0,
        error: e instanceof Error ? e.message : "sync_failed",
      },
      { status: 502 },
    );
  }
}
