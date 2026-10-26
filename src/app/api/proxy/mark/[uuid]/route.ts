import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/cookie";
import { upsertMark, deleteMark, getMyMark, tags as cacheTags } from "@/lib/neodb/client";
import { neodbErrorResponse } from "@/lib/neodb/proxy-error";
import { ratingToNeoDB } from "@/components/shared/Stars";
import type { NeoDBShelfType, NeoDBVisibility } from "@/lib/neodb/types";
import { revalidateTag } from "next/cache";

interface MarkPayload {
  status: NeoDBShelfType;
  ratingUi?: number;     // UI 0-5
  comment?: string;
  visibility?: NeoDBVisibility;
  tags?: string[];
  createdTime?: string;
}

function invalidateAfterMark(uuid: string) {
  // 任何 shelf 列表/计数页都过期；该 item 的"我的标记"也过期
  revalidateTag(cacheTags.shelfAny(), { expire: 0 });
  revalidateTag(cacheTags.myMark(uuid), { expire: 0 });
}

export async function GET(_: NextRequest, ctx: { params: Promise<{ uuid: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { uuid } = await ctx.params;
  const mark = await getMyMark(uuid).catch(() => null);
  return NextResponse.json({ mark });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ uuid: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { uuid } = await ctx.params;
  const body = (await req.json().catch(() => null)) as MarkPayload | null;
  if (!body || !body.status) {
    return NextResponse.json({ error: "missing_status" }, { status: 400 });
  }

  const rating_grade = typeof body.ratingUi === "number" && body.ratingUi > 0 ? ratingToNeoDB(body.ratingUi) : 0;

  try {
    await upsertMark(uuid, {
      shelf_type: body.status,
      visibility: (body.visibility ?? 0) as NeoDBVisibility,
      rating_grade,
      comment_text: body.comment ?? "",
      tags: body.tags ?? [],
      ...(body.createdTime ? { created_time: body.createdTime } : {}),
    });
    invalidateAfterMark(uuid);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return neodbErrorResponse(err);
  }
}

export async function DELETE(_: NextRequest, ctx: { params: Promise<{ uuid: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { uuid } = await ctx.params;
  try {
    await deleteMark(uuid);
    invalidateAfterMark(uuid);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return neodbErrorResponse(err);
  }
}
