import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/cookie";
import { getAIConfig } from "@/lib/ai/config";
import type { ProviderKind } from "@/lib/ai/types";

interface Body {
  provider: ProviderKind;
  /** Optional unsaved values; omitted values fall back to the stored config. */
  baseUrl?: string;
  apiKey?: string;
}

interface OpenAIModelListItem {
  id?: string;
}

interface OpenAIModelListResp {
  data?: OpenAIModelListItem[];
}

interface GeminiModelListItem {
  name?: string;
  baseModelId?: string;
  supportedGenerationMethods?: string[];
}

interface GeminiModelListResp {
  models?: GeminiModelListItem[];
  nextPageToken?: string;
}

const MODEL_LIST_TIMEOUT_MS = 20_000;

/** Fetch models available to the configured provider. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || !isProviderKind(body.provider)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (
    (body.baseUrl !== undefined && typeof body.baseUrl !== "string") ||
    (body.apiKey !== undefined && typeof body.apiKey !== "string")
  ) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const cfg = await getAIConfig();
  const stored = cfg[body.provider];
  const baseUrl = body.baseUrl?.trim() || stored.baseUrl || "";
  const apiKey = body.apiKey?.trim() || stored.apiKey;
  if (!baseUrl) return NextResponse.json({ error: "missing_base_url" }, { status: 400 });
  if (!apiKey) return NextResponse.json({ error: "missing_api_key" }, { status: 400 });

  if (body.provider === "gemini") return listGeminiModels(baseUrl, apiKey);
  return listOpenAICompatibleModels(baseUrl, apiKey);
}

function isProviderKind(value: unknown): value is ProviderKind {
  return value === "aggregator" || value === "openai" || value === "gemini";
}

async function listOpenAICompatibleModels(baseUrl: string, apiKey: string) {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS),
    });
    if (!res.ok) return upstreamError(res);

    const json = (await res.json().catch(() => null)) as OpenAIModelListResp | null;
    const models = (json?.data ?? [])
      .map((item) => (typeof item?.id === "string" ? item.id.trim() : ""))
      .filter(Boolean);
    models.sort((a, b) => a.localeCompare(b));
    return NextResponse.json({ models: [...new Set(models)] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch_failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

async function listGeminiModels(baseUrl: string, apiKey: string) {
  const models = new Set<string>();
  let pageToken: string | undefined;
  let pageCount = 0;

  try {
    do {
      const url = new URL(`${baseUrl.replace(/\/+$/, "")}/v1beta/models`);
      url.searchParams.set("key", apiKey);
      url.searchParams.set("pageSize", "1000");
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const res = await fetch(url, { signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS) });
      if (!res.ok) return upstreamError(res);

      const json = (await res.json().catch(() => null)) as GeminiModelListResp | null;
      for (const model of json?.models ?? []) {
        if (!model.supportedGenerationMethods?.includes("generateContent")) continue;
        const id = model.name?.replace(/^models\//, "") || model.baseModelId;
        if (id) models.add(id);
      }
      pageToken = json?.nextPageToken;
      pageCount += 1;
    } while (pageToken && pageCount < 10);

    return NextResponse.json({ models: [...models].sort((a, b) => a.localeCompare(b)) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch_failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

async function upstreamError(res: Response) {
  const message = await res.text().catch(() => "");
  return NextResponse.json(
    { error: `upstream_${res.status}`, message: message.slice(0, 240) },
    { status: 502 },
  );
}
