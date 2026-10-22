import { createHash } from "node:crypto";
import { getApp, setApp, type AppRecord } from "@/lib/auth/apps-cache";

const SCOPES = "read write";
const CLIENT_NAME = "folion";
const WEBSITE = "https://github.com/Drama1991/FolioN";

export interface RegisteredApp extends AppRecord {
  instance: string;
}

export function normalizeInstance(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^https?:\/\//i, "");
  s = s.replace(/\/+$/, "");
  return s.toLowerCase();
}

export function instanceBaseUrl(instance: string): string {
  return `https://${instance}`;
}

/** PKCE S256：把 verifier 哈希成 challenge。verifier 仍存在 httpOnly cookie 中。 */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest().toString("base64url");
}

/**
 * 同一进程内对同一 instance 的并发 register 去重。
 * 解决 P0-5 中"首启双登录会重复注册并互相覆盖"。
 * 注意：跨进程 / 多实例部署仍需把 apps-cache 换成 KV 实现（见 apps-cache.ts 顶注释）。
 */
const inflightRegister = new Map<string, Promise<RegisteredApp>>();

export async function registerApp(instance: string, redirectUri: string): Promise<RegisteredApp> {
  const existing = await getApp(instance);
  if (existing) return { ...existing, instance };

  const ongoing = inflightRegister.get(instance);
  if (ongoing) return ongoing;

  const p = (async (): Promise<RegisteredApp> => {
    try {
      // 双检：等到队列里的时候，前序调用可能已经写入
      const cached = await getApp(instance);
      if (cached) return { ...cached, instance };

      const body = new URLSearchParams({
        client_name: CLIENT_NAME,
        redirect_uris: redirectUri,
        scopes: SCOPES,
        website: WEBSITE,
      });

      const res = await fetch(`${instanceBaseUrl(instance)}/api/v1/apps`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`registerApp failed (${res.status}): ${text}`);
      }

      const json = (await res.json()) as { client_id: string; client_secret: string; id?: string };
      const record: AppRecord = {
        client_id: json.client_id,
        client_secret: json.client_secret,
        id: json.id,
      };
      await setApp(instance, record);
      return { ...record, instance };
    } finally {
      inflightRegister.delete(instance);
    }
  })();

  inflightRegister.set(instance, p);
  return p;
}

export function buildAuthorizeUrl(opts: {
  instance: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    scope: SCOPES,
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
  });
  return `${instanceBaseUrl(opts.instance)}/oauth/authorize?${params.toString()}`;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  created_at?: number;
}

export async function exchangeCode(opts: {
  instance: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri,
    code: opts.code,
    scope: SCOPES,
    code_verifier: opts.codeVerifier,
  });

  const res = await fetch(`${instanceBaseUrl(opts.instance)}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`exchangeCode failed (${res.status}): ${text}`);
  }

  return (await res.json()) as TokenResponse;
}

export interface NeoDBAccount {
  id: string;
  username: string;
  acct: string;
  display_name?: string;
  avatar?: string;
  url?: string;
}

export async function fetchAccount(instance: string, accessToken: string): Promise<NeoDBAccount> {
  const res = await fetch(`${instanceBaseUrl(instance)}/api/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`fetchAccount failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as Partial<NeoDBAccount> & { url?: string };
  return {
    id: json.id ?? json.username ?? "unknown",
    username: json.username ?? "unknown",
    acct: json.acct ?? `${json.username ?? "unknown"}@${instance}`,
    display_name: json.display_name,
    avatar: json.avatar,
    url: json.url,
  };
}
