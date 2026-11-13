/* ==================================================================
 * 通用网页内弹窗（dialog.js）
 * 替代浏览器原生 alert / confirm / prompt，统一视觉与交互。
 * 暴露三个全局函数：
 *   dlgAlert(message, opts)  -> Promise<void>      单按钮提示
 *   dlgConfirm(message, opts)-> Promise<boolean>   确定=true / 取消=false
 *   dlgPrompt(opts)          -> Promise<string|null> 确定返回输入值，取消返回 null
 * opts 可含：type(info|success|warning|error)、title、okText、cancelText、
 *            html、placeholder、value、maxlength、validate
 * ================================================================== */
(function () {
  "use strict";

  const ICONS = { info: "ℹ️", success: "✅", warning: "⚠️", error: "❌" };
  const DEFAULT_TITLE = { info: "提示", success: "成功", warning: "请注意", error: "出错了" };

  function showDialog(cfg) {
    return new Promise(resolve => {
      const modal = $("dlgModal");
      const input = $("dlgInput");
      const errBox = $("dlgError");
      const cancelBtn = $("dlgCancel");
      const okBtn = $("dlgOk");
      const type = cfg.type || "info";

      /* 标题与图标 */
      $("dlgTitle").textContent = cfg.title || DEFAULT_TITLE[type] || "提示";
      $("dlgIcon").textContent = ICONS[type] || ICONS.info;
      $("dlgIcon").className = "dlgIcon " + type;

      /* 消息内容（html=true 时按 HTML 渲染，否则纯文本） */
      const msgBox = $("dlgMsg");
      if (cfg.message !== undefined && cfg.message !== "") {
        if (cfg.html) msgBox.innerHTML = cfg.message;
        else msgBox.textContent = cfg.message;
        msgBox.style.display = "";
      } else {
        msgBox.textContent = "";
        msgBox.style.display = "none";
      }

      /* 输入框（prompt 模式） */
      if (cfg.input) {
        input.classList.remove("hidden");
        input.value = cfg.value || "";
        input.placeholder = cfg.placeholder || "";
        input.maxLength = cfg.maxlength || 20;
      } else {
        input.classList.add("hidden");
      }
      errBox.textContent = "";
      errBox.classList.add("hidden");

      /* 按钮：error 类型或显式 danger 时用红色确定键（破坏性操作） */
      okBtn.textContent = cfg.okText || "确 定";
      okBtn.className = "dlgBtn " + ((type === "error" || cfg.danger) ? "danger" : "primary");
      if (cfg.cancel === false) {
        cancelBtn.classList.add("hidden");
      } else {
        cancelBtn.classList.remove("hidden");
        cancelBtn.textContent = cfg.cancelText || "取 消";
      }

      modal.classList.remove("hidden");
      setTimeout(() => {
        if (cfg.input) { input.focus(); input.select(); }
        else okBtn.focus();
      }, 60);

      function finish(v) {
        modal.classList.add("hidden");
        okBtn.removeEventListener("click", onOk);
        cancelBtn.removeEventListener("click", onCancel);
        input.removeEventListener("keydown", onKey);
        document.removeEventListener("keydown", onDocKey);
        resolve(v);
      }
      /* 没有输入框时（alert / confirm）键盘焦点在按钮上，Esc 也需要能关掉：
         输入框自己已经处理了 Esc 并 preventDefault，这里跳过，避免触发两次 */
      function onDocKey(e) {
        if (e.key !== "Escape" || e.defaultPrevented) return;
        e.preventDefault();
        if (cfg.cancel === false) finish(false);
        else onCancel();
      }
      document.addEventListener("keydown", onDocKey);
      function onOk() {
        if (cfg.input) {
          const v = input.value;
          if (cfg.validate) {
            const err = cfg.validate(v);
            if (err) {
              errBox.textContent = err;
              errBox.classList.remove("hidden");
              input.focus();
              return;
            }
          }
          finish(v);
        } else {
          finish(true);
        }
      }
      function onCancel() { finish(cfg.input ? null : false); }
      function onKey(e) {
        if (e.key === "Enter") { e.preventDefault(); onOk(); }
        else if (e.key === "Escape" && cfg.cancel !== false) { e.preventDefault(); onCancel(); }
      }
      okBtn.addEventListener("click", onOk);
      cancelBtn.addEventListener("click", onCancel);
      input.addEventListener("keydown", onKey);
    });
  }

  /* 单按钮提示 */
  window.dlgAlert = function (message, opts) {
    return showDialog(Object.assign({ type: "info", cancel: false, okText: "我知道了" },
      opts || {}, { message }));
  };

  /* 确认对话框：确定 true / 取消 false */
  window.dlgConfirm = function (message, opts) {
    return showDialog(Object.assign({ type: "warning", okText: "确 定", cancelText: "取 消" },
      opts || {}, { message }));
  };

  /* 输入对话框：确定返回字符串，取消返回 null */
  window.dlgPrompt = function (opts) {
    return showDialog(Object.assign({ type: "info", input: true, okText: "确 定", cancelText: "取 消" },
      opts || {}));
  };
})();
