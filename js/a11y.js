/* ================== 弹窗无障碍与键盘支持 ==================
   内容弹窗（设置 / 词库 / 战绩 / 数据…）此前只是普通 div：
   屏幕阅读器不知道这是对话框，键盘也只能靠 Tab 摸索、Esc 关不掉。
   这里统一补三件事，不必在十几处打开 / 关闭代码里各写一遍：

     1. 给 .modalBox 补 role="dialog" / aria-modal="true" / aria-label（取 h3 文字）；
     2. 打开时把焦点移进弹窗（记住来源元素），关闭时还回去；
     3. Esc 关闭最上层弹窗、Tab 在弹窗内循环。

   实现方式：MutationObserver 监听 .modal 上 .hidden 的增删——现有的打开 / 关闭
   代码一律不用改。关闭时优先点该弹窗的「关闭」按钮，走原有收尾逻辑
   （例如数据管理要清掉待导入状态），没有按钮时才直接加 .hidden。
   确认框 #dlgModal 有自己的 Esc / Enter / 焦点逻辑，这里完全不碰它；
   它开着时也不做 Tab 循环，否则会把焦点圈到底下的弹窗里。 */
(function initModalA11y(){
  /* 每个弹窗对应的关闭按钮：Esc 时点击它，保证走原有的关闭收尾 */
  const CLOSERS = {
    aboutModal:"aboutClose",
    customHelpModal:"customHelpClose",
    dataModal:"dataClose",
    durModal:"durCancel",
    editorModal:"edClose",
    hisModal:"hisClose",
    importHelpModal:"importHelpClose",
    libModal:"libCancel",
    pickModal:"pickCancel",
    renderModal:"renderClose",
    settingModal:"settingClose",
    tipsModal:"tipsClose",
    updateModal:"updateGotIt",
    wrongbookModal:"wbClose"
  };
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), '
    + 'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  const modals = Object.keys(CLOSERS)
    .map(id => document.getElementById(id))
    .filter(Boolean);
  if(!modals.length) return;

  const stack = [];               /* 当前打开的弹窗，末尾是「最上层」 */
  const restore = new Map();      /* 弹窗 -> 打开前聚焦的元素 */
  const visible = m => !m.classList.contains("hidden");
  const boxOf = m => m.querySelector(".modalBox") || m;
  const focusables = box => [...box.querySelectorAll(FOCUSABLE)]
    .filter(el => el.offsetWidth || el.offsetHeight || el === document.activeElement);
  const dlgOpen = () => {
    const d = document.getElementById("dlgModal");
    return !!d && visible(d);
  };

  /* 静态属性：角色、模态标记、可读标题 */
  modals.forEach(m => {
    const box = boxOf(m);
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    const h = box.querySelector("h3");
    let label = "";
    if(h){
      /* 标题里常有右侧的 .hint 小字（「只影响本机显示」之类），读屏没必要念出来 */
      const copy = h.cloneNode(true);
      copy.querySelectorAll(".hint").forEach(el => el.remove());
      label = copy.textContent.replace(/\s+/g, " ").trim();
    }
    if(label) box.setAttribute("aria-label", label);
    if(!box.hasAttribute("tabindex")) box.setAttribute("tabindex", "-1");
  });

  /* 把焦点送进弹窗。
     弹窗是淡入的：从 .hidden 出来的头 ~160ms 里，visibility 仍是 hidden
     （见 style.css 的 .modal.hidden 过渡），这时 focus() 会静默失败，
     所以在淡入结束前重试几次。用户中途自己点了别处就不再抢焦点。 */
  function focusInto(m, box, src){
    const tryOnce = () => {
      if(!visible(m)) return true;                       /* 已经关掉了 */
      if(box.contains(document.activeElement)) return true;
      const ae = document.activeElement;
      if(ae && ae !== src && ae !== document.body && ae !== document.documentElement) return true;
      const first = focusables(box)[0];
      try{ (first || box).focus({ preventScroll:true }); }
      catch(e){ try{ (first || box).focus(); }catch(_){} }
      return box.contains(document.activeElement);
    };
    if(tryOnce()) return;
    let n = 0;
    const retry = () => {
      if(tryOnce() || ++n > 6) return;
      setTimeout(retry, n < 2 ? 40 : 80);
    };
    requestAnimationFrame(retry);
  }

  function onOpen(m){
    if(stack.indexOf(m) >= 0) return;
    stack.push(m);
    restore.set(m, document.activeElement);
    const box = boxOf(m);
    const src = restore.get(m);
    focusInto(m, box, src);
  }
  function onClose(m){
    const i = stack.indexOf(m);
    if(i < 0) return;
    stack.splice(i, 1);
    const back = restore.get(m);
    restore.delete(m);
    if(back && back.focus && document.contains(back)){
      try{ back.focus({ preventScroll:true }); }
      catch(e){ try{ back.focus(); }catch(_){} }
    }
  }

  modals.forEach(m => {
    new MutationObserver(() => { visible(m) ? onOpen(m) : onClose(m); })
      .observe(m, { attributes:true, attributeFilter:["class"] });
    if(visible(m)) onOpen(m);
  });

  /* Esc：关掉最上层；Tab：在弹窗内首尾循环 */
  document.addEventListener("keydown", e => {
    if(e.key !== "Escape" && e.key !== "Tab") return;
    if(dlgOpen()) return;                       /* 确认框优先，交给 dialog.js */
    const top = stack[stack.length - 1];
    if(!top) return;

    if(e.key === "Escape"){
      e.preventDefault();
      const closer = document.getElementById(CLOSERS[top.id]);
      if(closer) closer.click();
      else top.classList.add("hidden");
      return;
    }

    /* Tab */
    const box = boxOf(top);
    const list = focusables(box);
    if(!list.length){ e.preventDefault(); box.focus(); return; }
    const cur = document.activeElement;
    const idx = list.indexOf(cur);
    if(e.shiftKey){
      if(idx <= 0){ e.preventDefault(); list[list.length - 1].focus(); }
    }else if(idx === -1 || idx === list.length - 1){
      e.preventDefault(); list[0].focus();
    }
  });
})();
