import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// P1-11：基础 security headers + 宽松 CSP。
// CSP 妥协：layout.tsx 用 dangerouslySetInnerHTML 注入 FOUC boot script，
// 全站充斥 inline style，HMR 需 unsafe-eval——所以 script/style 都开 'unsafe-inline'。
// 即便如此，明确白名单 img/connect/font/script 来源仍能阻断常见反射型 XSS payload。
// jsdelivr 仅作为 <link rel=stylesheet> 加载 Tabler icons，不进 script-src。
// worker-src 'self' 让 Serwist 注册的 /sw.js 可加载。
const isDev = process.env.NODE_ENV !== "production";

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
  "font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  // HSTS 仅在生产生效（dev 走 http 会被浏览器拒绝）
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  // 不配 images.remotePatterns：next/image 在 Cover 组件里走 unoptimized，
  // 不经 Next image loader，无需远端 host 白名单也就没有任意源代理 SSRF 面。
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

// Serwist 仅生产生效；dev 模式禁用，避免 SW 缓存干扰热更新和登录态调试。
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: isDev,
  cacheOnNavigation: true,
  reloadOnOnline: true,
});

export default withSerwist(nextConfig);
