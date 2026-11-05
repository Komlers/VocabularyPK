/* ==================================================================
 * 名单编辑器（内置）
 * 独立文件：负责班级的新建/重命名/删除，以及名单内名字的
 * 增删改、搜索、批量添加。数据写入 localStorage（vpk_rosters），
 * 每次改动后同步刷新主界面的班级 chips、名字框与抽取池。
 * ================================================================== */
(function () {
  "use strict";

  /* 单个名字合法字符（与 storage.js 的 parseRosterText 保持一致，允许 @ 幽灵标记） */
  const NAME_RE = /^[一-龥 a-zA-Z0-9·.\-@]+$/;

  /* 编辑器内部状态：当前编辑班级、搜索关键词 */
  let edCls = "";
  let edKeyword = "";

  /* 当前编辑班级的名单（数组引用，操作后写回） */
  function curRoster() {
    return rosters()[edCls] || [];
  }

  /* 保存名单对象，并刷新主界面相关 UI。
     注意：必须传入修改后的同一个对象 rs——rosters() 每次都重新
     JSON.parse 得到新对象，若在 commit 内重新读取会丢失本次修改。 */
  function commit(rs) {
    saveRosters(rs);
    /* 若编辑的是当前选中班级，刷新抽取池、名字框、战绩渲染 */
    if (S.cls === edCls) {
      resetDrawn();
      refreshNameBoxes();
    }
    renderChips();
  }

  /* ================= 打开 / 关闭 ================= */
  function openEditor() {
    const rs = rosters();
    /* 默认选中当前主界面班级，否则取第一个班级 */
    if (S.cls && rs[S.cls]) edCls = S.cls;
    else edCls = Object.keys(rs)[0] || "";
    edKeyword = "";
    $("edSearch").value = "";
    $("edAddInput").value = "";
    $("edBatchText").value = "";
    $("edBatchArea").classList.add("hidden");
    renderEdAll();
    $("editorModal").classList.remove("hidden");
  }
  function closeEditor() {
    $("editorModal").classList.add("hidden");
    /* 关闭后确保主界面配置/战绩一致 */
    if (S.cls) {
      restoreCfg();
      renderHistory();
      refreshNameBoxes();
    }
  }

  /* 一次性渲染编辑器全部区域 */
  function renderEdAll() {
    renderEdClassSelect();
    renderEdNameList();
    updateEdStat();
  }

  /* ================= 班级下拉 ================= */
  function renderEdClassSelect() {
    const sel = $("edClassSelect");
    const rs = rosters();
    const list = Object.keys(rs);
    if (!edCls || !rs[edCls]) edCls = list[0] || "";
    sel.innerHTML = "";
    list.forEach(cls => {
      const opt = document.createElement("option");
      opt.value = cls;
      opt.textContent = cls + "（" + (rs[cls] || []).length + "人）";
      if (cls === edCls) opt.selected = true;
      sel.appendChild(opt);
    });
    /* 无班级时禁用操作按钮 */
    const empty = !edCls;
    $("edRenameClass").disabled = empty;
    $("edDelClass").disabled = empty;
    $("edSearch").disabled = empty;
    $("edAddInput").disabled = empty;
    $("edAddBtn").disabled = empty;
    $("edBatchBtn").disabled = empty;
  }

  /* ================= 新建班级 ================= */
  async function newClass() {
    const val = await dlgPrompt({
      title: "➕ 新建班级",
      message: "班级名称用于分开保存名单、战绩和擂主。",
      placeholder: "例如：高一3班",
      validate: v => {
        const cls = v.trim();
        if (!cls) return "班级名称不能为空。";
        if (rosters()[cls] !== undefined) return "已存在同名班级「" + cls + "」。";
        return "";
      }
    });
    if (val === null) return;
    const cls = val.trim();
    const rs = rosters();
    rs[cls] = [];
    saveRosters(rs);
    edCls = cls;
    renderEdAll();
    renderChips();
    $("edAddInput").focus();
  }

  /* ================= 重命名班级 ================= */
  async function renameClass() {
    if (!edCls) return;
    const oldName = edCls;
    const val = await dlgPrompt({
      title: "重命名班级",
      message: "将班级「" + oldName + "」重命名，名单、战绩、擂主会一并迁移。",
      value: oldName,
      validate: v => {
        const to = v.trim();
        if (!to) return "班级名称不能为空。";
        if (to !== oldName && rosters()[to] !== undefined) return "已存在同名班级「" + to + "」。";
        return "";
      }
    });
    if (val === null) return;
    const to = val.trim();
    if (!to || to === oldName) return;
    const rs = rosters();
    /* 迁移名单 */
    rs[to] = rs[oldName];
    delete rs[oldName];
    /* 迁移战绩、擂主、配置（读取旧键，写入新键） */
    try {
      const oldHis = localStorage.getItem(hisKey(oldName));
      const oldChamp = localStorage.getItem(champKey(oldName));
      const oldCfg = localStorage.getItem("vpk_cfg_" + oldName);
      localStorage.removeItem(hisKey(oldName));
      localStorage.removeItem(champKey(oldName));
      localStorage.removeItem("vpk_cfg_" + oldName);
      if (oldHis !== null) localStorage.setItem(hisKey(to), oldHis);
      if (oldChamp !== null) localStorage.setItem(champKey(to), oldChamp);
      if (oldCfg !== null) localStorage.setItem("vpk_cfg_" + to, oldCfg);
    } catch (e) {}
    if (S.cls === oldName) { S.cls = to; saveUI({cls:to}); }
    saveRosters(rs);
    edCls = to;
    renderEdAll();
    renderChips();
  }

  /* ================= 删除班级 ================= */
  async function deleteClass() {
    if (!edCls) return;
    const ok = await dlgConfirm(
      "确定删除班级「" + edCls + "」？其名单、对战历史、擂主和配置都会一并清除，且不可恢复。",
      { title: "删除班级", type: "error", okText: "确认删除", cancelText: "保留" });
    if (!ok) return;
    const rs = rosters();
    delete rs[edCls];
    saveRosters(rs);
    try {
      localStorage.removeItem(hisKey(edCls));
      localStorage.removeItem(champKey(edCls));
      localStorage.removeItem("vpk_cfg_" + edCls);
    } catch (e) {}
    if (S.cls === edCls) {
      S.cls = "";
      redName = "";
      blueName = "";
      champFixed = false;
    }
    edCls = Object.keys(rs)[0] || "";
    renderEdAll();
    /* 主界面重新自动选择班级并刷新 */
    autoSelectClass();
    saveUI({cls:S.cls});
    resetDrawn();
    refreshNameBoxes();
    restoreCfg();
    renderHistory();
    /* 删到没有班级了：主界面切回临时体验的手输形态 */
    if (!S.cls) enterManualMode();
  }

  /* ================= 名字列表渲染 ================= */
  function renderEdNameList() {
    const box = $("edNameList");
    box.innerHTML = "";
    if (!edCls) {
      box.innerHTML = '<div class="edEmpty">暂无班级，请先「新建班级」。</div>';
      return;
    }
    const roster = curRoster();
    const kw = edKeyword.trim();
    /* 过滤：按显示名（去 @）匹配，同时保留真实索引 */
    let shown = roster.map((n, i) => ({ n, i }));
    if (kw) shown = shown.filter(o => dispName(o.n).includes(kw));
    if (!shown.length) {
      box.innerHTML = '<div class="edEmpty">' + (kw ? "没有匹配「" + esc(kw) + "」的名字。" : "该班级名单为空，在下方添加名字。") + "</div>";
      return;
    }
    shown.forEach(({ n, i }) => {
      const row = document.createElement("div");
      row.className = "edNameRow";
      const nm = document.createElement("span");
      nm.className = "edNameText";
      nm.textContent = dispName(n);
      /* 幽灵名字给出低调标记（仅本机编辑器可见，不对外提示） */
      if (/^@/.test(n)) nm.classList.add("ghost");
      const btns = document.createElement("span");
      btns.className = "edNameBtns";
      const edit = document.createElement("button");
      edit.className = "edMiniBtn";
      edit.textContent = "改名";
      edit.addEventListener("click", () => editName(i));
      const del = document.createElement("button");
      del.className = "edMiniBtn danger";
      del.textContent = "删除";
      del.addEventListener("click", () => removeName(i));
      btns.appendChild(edit);
      btns.appendChild(del);
      row.appendChild(nm);
      row.appendChild(btns);
      box.appendChild(row);
    });
  }

  /* ================= 添加单个名字 ================= */
  function addName() {
    if (!edCls) return;
    const raw = $("edAddInput").value.trim();
    if (!raw) return;
    if (!NAME_RE.test(raw)) {
      dlgAlert("名字含非法字符，仅支持中文、英文、数字及 · . - @ 等。",
        { type: "error", title: "无法添加" });
      return;
    }
    const rs = rosters();
    const roster = rs[edCls];
    if (roster.includes(raw)) {
      dlgAlert("名单中已存在「" + dispName(raw) + "」。",
        { type: "warning", title: "名字重复" });
      $("edAddInput").value = "";
      return;
    }
    roster.push(raw);
    commit(rs);
    renderEdNameList();
    updateEdStat();
    renderEdClassSelect();
    $("edAddInput").value = "";
    $("edAddInput").focus();
  }

  /* ================= 改名 ================= */
  async function editName(i) {
    const rs = rosters();
    const roster = rs[edCls];
    const old = roster[i];
    const val = await dlgPrompt({
      title: "修改名字",
      message: "原名字：" + dispName(old),
      value: old,
      maxlength: 8,
      validate: v => {
        const nv = v.trim();
        if (!nv) return "名字不能为空。";
        if (!NAME_RE.test(nv)) return "名字含非法字符，仅支持中文、英文、数字及 · . - @ 等。";
        if (nv !== old && roster.includes(nv)) return "名单中已存在「" + dispName(nv) + "」。";
        return "";
      }
    });
    if (val === null) return;
    const nv = val.trim();
    if (!nv || nv === old) return;
    roster[i] = nv;
    commit(rs);
    renderEdNameList();
    updateEdStat();
    renderEdClassSelect();
  }

  /* ================= 删除名字 ================= */
  async function removeName(i) {
    const rs = rosters();
    const roster = rs[edCls];
    const target = roster[i];
    const ok = await dlgConfirm(
      "从「" + edCls + "」名单中删除「" + dispName(target) + "」？",
      { type: "error", title: "删除名字", okText: "确认删除", cancelText: "保留" });
    if (!ok) return;
    roster.splice(i, 1);
    commit(rs);
    renderEdNameList();
    updateEdStat();
    renderEdClassSelect();
  }

  /* ================= 批量添加 ================= */
  function toggleBatch() {
    const area = $("edBatchArea");
    area.classList.toggle("hidden");
    if (!area.classList.contains("hidden")) $("edBatchText").focus();
  }
  function batchAdd() {
    if (!edCls) return;
    const text = $("edBatchText").value;
    if (!text.trim()) return;
    const { names, stat } = parseRosterText(text);
    const rs = rosters();
    const roster = rs[edCls];
    let added = 0;
    names.forEach(n => {
      if (!roster.includes(n)) { roster.push(n); added++; }
    });
    commit(rs);
    renderEdNameList();
    updateEdStat();
    renderEdClassSelect();
    $("edBatchText").value = "";
    $("edBatchArea").classList.add("hidden");
    const skipped = stat.empty + stat.comment + stat.invalid + stat.dup;
    dlgAlert("新增 " + added + " 人，跳过 " + skipped +
      " 行（重复/空行/注释/非法）。当前共 " + roster.length + " 人。",
      { type: "success", title: "批量添加完成" });
  }

  /* ================= 统计 ================= */
  function updateEdStat() {
    if (!edCls) { $("edStat").textContent = ""; return; }
    const roster = curRoster();
    const ghost = roster.filter(n => /^@/.test(n)).length;
    $("edStat").textContent = "「" + edCls + "」共 " + roster.length +
      " 人";
  }

  /* ================= 事件绑定 ================= */
  /* 暴露刷新函数：供 events.js 在编辑器内导入名单后刷新编辑器 UI */
  window.refreshEditor = function () {
    renderEdClassSelect();
    renderEdNameList();
    updateEdStat();
  };

  $("openEditorBtn").addEventListener("click", openEditor);
  $("edClose").addEventListener("click", closeEditor);
  $("editorModal").addEventListener("click", e => {
    if (e.target.classList.contains("modalMask")) closeEditor();
  });

  $("edClassSelect").addEventListener("change", e => {
    edCls = e.target.value;
    edKeyword = "";
    $("edSearch").value = "";
    renderEdNameList();
    updateEdStat();
  });
  $("edNewClass").addEventListener("click", newClass);
  $("edRenameClass").addEventListener("click", renameClass);
  $("edDelClass").addEventListener("click", deleteClass);

  $("edSearch").addEventListener("input", e => {
    edKeyword = e.target.value;
    renderEdNameList();
  });

  $("edAddBtn").addEventListener("click", addName);
  $("edAddInput").addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); addName(); }
  });

  $("edBatchBtn").addEventListener("click", toggleBatch);
  $("edBatchCancel").addEventListener("click", () => {
    $("edBatchArea").classList.add("hidden");
  });
  $("edBatchConfirm").addEventListener("click", batchAdd);
})();
