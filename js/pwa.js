/* ==================================================================
 * PWA 安装引导（pwa.js）
 *
 * 职责：
 *   ① 注册 Service Worker，让 Edge / Chromium 判定本站「可安装」；
 *   ② 监听 beforeinstallprompt，拿到浏览器给的安装机会后才显示左上角
 *      「安装」按钮——浏览器不允许安装时不显示（已安装、非 HTTPS、
 *      浏览器不支持等情况都不显示，无需自行判断）；
 *   ③ 点击按钮触发浏览器原生安装弹窗；
 *   ④ 安装完成（appinstalled）或运行在独立窗口（standalone）时收起按钮。
 *
 * 说明：beforeinstallprompt 只有 Chromium 系（Edge / Chrome）支持；
 *       Safari / Firefox 不会派发，按钮保持隐藏。
 * ================================================================== */
(function () {
  "use strict";

  const btn = $("installBtn");
  if (!btn) return;

  let deferred = null;   /* 浏览器暂存的安装事件，只能触发一次 */

  /* 是否已经以「应用窗口」形式运行（已安装并打开） */
  function isStandalone() {
    try {
      return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)
          || (window.matchMedia && window.matchMedia("(display-mode: minimal-ui)").matches)
          || window.navigator.standalone === true;   /* iOS Safari */
    } catch (e) {
      return false;
    }
  }

  /* 只记住「浏览器允许安装」这件事；真正的显隐交给 ui.js 的 syncCornerBtns：
     比赛中左上角要让位给「终止」，回到主界面才显示「安装」。 */
  function setReady(on) {
    btn.dataset.ready = on ? "1" : "";
    if (typeof syncCornerBtns === "function") syncCornerBtns();
    /* 若此刻已在全屏状态，补上与「全屏/退出」按钮一致的变淡 */
    if (typeof syncFsBtn === "function") syncFsBtn();
  }

  /* 浏览器认为可安装时才会派发：此时才露出按钮 */
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();        /* 阻止旧版浏览器自动弹横幅，改由按钮触发 */
    deferred = e;
    if (!isStandalone()) setReady(true);
  });

  /* 安装成功后收起按钮，本次会话不再出现 */
  window.addEventListener("appinstalled", () => {
    deferred = null;
    setReady(false);
  });

  btn.addEventListener("click", async () => {
    if (!deferred) return;
    btn.disabled = true;
    try {
      deferred.prompt();
      const choice = await deferred.userChoice;
      deferred = null;
      /* 用户取消后浏览器会冷却一段时间不再派发事件，按钮先收起 */
      if (!choice || choice.outcome !== "accepted") setReady(false);
    } catch (e) {
      setReady(false);
    } finally {
      btn.disabled = false;
    }
  });

  /* 已在独立窗口中运行（例如从开始菜单打开已安装的应用）→ 直接不显示 */
  if (isStandalone()) setReady(false);

  /* 注册 Service Worker（安装条件之一，同时提供离线外壳） */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(() => {
        /* 注册失败（如本地 file:// 打开）不影响正常使用 */
      });
    });
  }
})();
