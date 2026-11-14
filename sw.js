/* ==================================================================
 * Service Worker（sw.js）
 * 作用：
 *   ① 满足 Edge / Chromium 的 PWA 安装条件（注册了带 fetch 处理器的 SW）；
 *   ② 断网或网络抖动时仍能打开页面外壳（教室网络不稳定的场景）。
 *
 * 缓存策略：
 *   · 同源 GET 一律「网络优先，失败回退缓存」。
 *     本站靠 index.html 里的 ?v= 手动控制脚本版本，若用缓存优先，
 *     新版本上线后老用户会长期拿到旧 JS；网络优先可保证在线时永远是最新的。
 *   · 首次安装时预缓存页面外壳（HTML / CSS / JS / 图标 / 帮助文档），
 *     词库 JSON 在首次加载时顺带进入缓存，无需单独列举。
 *   · 旧版本缓存在 activate 阶段清理。
 * ================================================================== */
const CACHE = "vpk-shell-v1";

const SHELL = [
  "./",
  "index.html",
  "style.css",
  "favicon.ico",
  "manifest.webmanifest",
  "js/config.js",
  "js/storage.js",
  "js/wordbank.js",
  "js/ui.js",
  "js/dialog.js",
  "js/editor.js",
  "js/game.js",
  "js/wrongbook.js",
  "js/data.js",
  "js/events.js",
  "js/a11y.js",
  "js/pwa.js",
  "icons/icon-96.png",
  "icons/icon-128.png",
  "icons/icon-192.png",
  "icons/icon-256.png",
  "icons/icon-512.png",
  "res/update.md",
  "res/about.md",
  "res/import.md",
  "res/custom.md",
  "res/tips.md"
];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    /* 逐个缓存并吞掉单个失败：避免某个文件 404 导致整个 SW 安装失败 */
    await Promise.all(SHELL.map(url =>
      cache.add(new Request(url, { cache: "reload" })).catch(() => {})
    ));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    /* 页面导航强制向服务器校验（CDN 默认缓存 HTML 数小时），
       保证改了 index.html 里的 ?v= 后用户能立刻拿到新版本 */
    const res = await fetch(req, req.mode === "navigate" ? { cache: "no-cache" } : undefined);
    /* 只缓存正常响应，避免把 404 / 登录页等错误结果固化下来 */
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    /* 离线时任意页面导航都回退到页面外壳 */
    if (req.mode === "navigate") {
      const shell = await cache.match("index.html", { ignoreSearch: true })
                 || await cache.match("./", { ignoreSearch: true });
      if (shell) return shell;
    }
    throw err;
  }
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   /* 跨域请求不接管 */
  e.respondWith(networkFirst(req));
});
