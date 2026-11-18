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

  /* ================== Service Worker ==================
     SW 只给「自己部署的站点」用：装成桌面应用、断网还能打开。
     放进别人的容器里就很危险 —— 典型是 B站 Toy：页面跑在
     www.bilibili.com/toy/<slug>/ 子路径下，第一次打开一切正常，
     SW 装好后从第二次开始接管该作用域下所有同源请求；平台一旦换部署路径、
     加签名参数或重新发布，缓存的旧壳就会把页面顶成白屏 / 成片 404。
     所以这种环境不但不注册，还要把以前装过的旧 SW 主动注销掉 ——
     否则用户得自己清站点数据才能恢复。
     判断只用「域名 + 路径」，不靠 UA：容器里的 UA 五花八门，路径更可靠。 */
  function swBlocked(){
    try{
      if(!/^https?:$/.test(location.protocol)) return true;        /* file:// 等 */
      if(/(^|\.)bilibili\.com$/i.test(location.hostname)) return true;
      if(/^\/toy\//i.test(location.pathname)) return true;         /* 平台换域名也认得出来 */
      return false;
    }catch(e){ return true; }
  }
  /* 注销旧 SW 并丢掉它留下的缓存（只清自己的前缀，别碰同一域名下别人的缓存） */
  function dropOldWorker(){
    try{
      if("serviceWorker" in navigator){
        navigator.serviceWorker.getRegistrations().then(list => {
          list.forEach(reg => { try{ reg.unregister(); }catch(e){} });
        }).catch(() => {});
      }
      if(window.caches && caches.keys){
        caches.keys().then(keys => {
          keys.filter(k => /^vpk-shell/.test(k)).forEach(k => {
            try{ caches.delete(k); }catch(e){}
          });
        }).catch(() => {});
      }
    }catch(e){}
  }

  if ("serviceWorker" in navigator) {
    if(swBlocked()){
      dropOldWorker();
    }else{
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(() => {
          /* 注册失败（如浏览器拒绝）不影响正常使用 */
        });
      });
    }
  }
})();
