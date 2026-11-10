/* ================== 抽人 ==================
   没有名单（临时体验）时，点红蓝框直接展开手输区并聚焦对应输入框，
   而不是弹一句「名单人数不足」把路堵死。 */
$("redBox").addEventListener("click", ()=>{
  if(!hasRoster()){ enterManualMode("m1"); return; }
  const name = takeName(blueName);
  if(!name){ $("drawInfo").textContent = "名单人数不足，无法抽取红方（请先导入或在名单中增加学生）。"; return; }
  animateDraw("redNameBox", name, ()=>{ redName = name; champFixed = false; renderHistory(); });
});
$("blueBox").addEventListener("click", ()=>{
  if(!hasRoster()){ enterManualMode("m2"); return; }
  const name = takeName(redName);
  if(!name){ $("drawInfo").textContent = "名单人数不足，无法抽取蓝方（请先导入或在名单中增加学生）。"; return; }
  animateDraw("blueNameBox", name, ()=>{ blueName = name; renderHistory(); });
});
$("manualBtn").addEventListener("click", ()=>{
  manualMode = !manualMode;
  $("manualRow").classList.toggle("hidden", !manualMode);
  $("manualBtn").textContent = manualMode ? "收起" : "输入";
  refreshNameBoxes();   /* 打开手输时，把手输框预填为当前名字 */
});
$("m1").addEventListener("input", e=>{
  redName = resolveGhostName(e.target.value.trim());
  $("redNameBox").textContent = dispName(redName) || "待抽取";
  champFixed = false;
  renderHistory();
});
$("m2").addEventListener("input", e=>{
  blueName = resolveGhostName(e.target.value.trim());
  $("blueNameBox").textContent = dispName(blueName) || "待抽取";
  renderHistory();
});

/* ================== 选名弹窗 ================== */
$("pickBtn").addEventListener("click", ()=>{
  pickSide = "red";
  document.querySelectorAll(".pickTab").forEach(t=>{
    t.classList.toggle("on", t.dataset.side === "red");
    t.classList.toggle("red-on", t.dataset.side === "red");
    t.classList.remove("blue-on");
  });
  renderPickGrid();
  $("pickModal").classList.remove("hidden");
});
document.querySelectorAll(".pickTab").forEach(t=>{
  t.addEventListener("click", ()=>{
    pickSide = t.dataset.side;
    document.querySelectorAll(".pickTab").forEach(x=>{
      const on = x.dataset.side === pickSide;
      x.classList.toggle("on", on);
      x.classList.toggle("red-on", on && pickSide === "red");
      x.classList.toggle("blue-on", on && pickSide === "blue");
    });
    renderPickGrid();
  });
});
$("pickCancel").addEventListener("click", ()=>$("pickModal").classList.add("hidden"));
$("pickModal").addEventListener("click", e=>{
  if(e.target.classList.contains("modalMask")) $("pickModal").classList.add("hidden");
});

/* ================== 班级切换 / 删除 ================== */
$("classChips").addEventListener("click", async e=>{
  const chip = e.target.closest(".chip");
  if(!chip) return;
  const cls = chip.dataset.cls;
  if(e.target.closest(".clsDel")){
    const ok = await dlgConfirm(
      "确定删除班级「" + cls + "」的名单？其对战历史、擂主和配置也会一并清除。",
      { type: "error", title: "删除班级", okText: "确认删除", cancelText: "保留" });
    if(!ok) return;
    const rs = rosters();
    delete rs[cls];
    saveRosters(rs);
    try{
      localStorage.removeItem(hisKey(cls));
      localStorage.removeItem(champKey(cls));
      localStorage.removeItem("vpk_cfg_" + cls);
    }catch(err){}
    if(S.cls === cls){ S.cls = ""; redName = ""; blueName = ""; champFixed = false; }
    autoSelectClass();
    saveUI({cls:S.cls});
    resetDrawn(); refreshNameBoxes(); restoreCfg(); renderHistory();
    /* 删到没有班级了：直接进入临时体验的手输形态 */
    if(!S.cls) enterManualMode();
    return;
  }
  document.querySelectorAll("#classChips .chip").forEach(x=>x.classList.remove("on"));
  chip.classList.add("on");
  S.cls = cls;
  saveUI({cls:cls});   /* 记住这次选的班级，下次打开直接进来 */
  redName = ""; blueName = "";
  redName = loadChamp(S.cls);
  champFixed = !!redName;
  resetDrawn(); refreshNameBoxes(); restoreCfg(); renderHistory();
});

/* ================== 导入 TXT 名单 ================== */
$("importRosterBtn").addEventListener("click", async ()=>{
  const name = await dlgPrompt({
    title: "导入班级名单",
    message: "请输入要导入的班级名称：",
    placeholder: "例如：高一3班",
    validate: v => v.trim() ? "" : "班级名称不能为空。"
  });
  if(name === null) return;
  const cls = name.trim();
  if(!cls) return;
  pendingClass = cls;
  pendingImportInEditor = false;
  $("rosterFile").click();
});
$("rosterFile").addEventListener("change", e=>{
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  const cls = pendingClass; pendingClass = "";
  const inEditor = pendingImportInEditor; pendingImportInEditor = false;
  const reader = new FileReader();
  reader.onload = async ()=>{
    const {names, stat} = parseRosterText(reader.result);
    e.target.value = "";
    if(!names.length){
      dlgAlert("文件里没有解析出有效名字。请确认 TXT 是一行一个名字，且名字只含中文 / 字母 / 数字。",
        { type: "error", title: "导入失败" });
      return;
    }
    const existing = rosters();
    if(existing[cls]){
      const overwrite = await dlgConfirm(
        "班级「" + cls + "」已有名单（" + existing[cls].length + " 人），导入将覆盖旧名单，确定继续？",
        { type: "warning", title: "覆盖名单", okText: "覆盖导入", cancelText: "取消" });
      if(!overwrite) return;
    }
    existing[cls] = names;
    saveRosters(existing);
    const skip = [];
    if(stat.empty)   skip.push("空行 " + stat.empty);
    if(stat.comment) skip.push("注释行 " + stat.comment);
    if(stat.invalid)  skip.push("特殊字符行 " + stat.invalid);
    if(stat.dup)      skip.push("重复名 " + stat.dup);
    if(inEditor){
      /* 从名单编辑器内导入：不改变主页面当前班级/选手，只刷新编辑器与班级 chips */
      refreshEditor();
      renderChips();
    }else{
      /* 主页面首次导入：切换到该班级并刷新主界面 */
      S.cls = cls;
      saveUI({cls:cls});
      redName = ""; blueName = ""; champFixed = false;
      resetDrawn(); restoreCfg(); refreshNameBoxes(); renderHistory();
    }
    dlgAlert("已导入「" + esc(cls) + "」共 " + names.length + " 人。"
      + (skip.length ? "<br>跳过：" + skip.join("、") : ""),
      { type: "success", title: "导入成功", html: true });
  };
  reader.readAsText(file, "UTF-8");
});

/* 名单编辑器内的「📥 导入TXT」：导入到当前选中的班级 */
$("edImportBtn").addEventListener("click", ()=>{
  const cls = $("edClassSelect").value;
  if(!cls){
    dlgAlert("请先「新建班级」，再导入名单。", { type: "warning", title: "还没有班级" });
    return;
  }
  pendingClass = cls;
  pendingImportInEditor = true;
  $("rosterFile").click();
});

/* 「❓ 添加帮助」：从 res/import.md 加载并转 HTML 显示 */
$("edHelpBtn").addEventListener("click", async ()=>{
  try{
    const res = await fetch("res/import.md", {cache:"no-cache"});
    if(!res.ok) throw new Error("help file missing");
    const md = await res.text();
    $("importHelpContent").innerHTML = mdToHtml(md);
    $("importHelpModal").classList.remove("hidden");
  }catch(err){
    dlgAlert("帮助内容加载失败：" + err.message, { type: "error", title: "出错了" });
  }
});
$("importHelpClose").addEventListener("click", ()=>$("importHelpModal").classList.add("hidden"));
$("importHelpModal").addEventListener("click", e=>{
  if(e.target.classList.contains("modalMask")) $("importHelpModal").classList.add("hidden");
});

/* 自定义词库面板「如何制作自定义词库」：从 res/custom.md 加载并转 HTML */
$("customHelpBtn").addEventListener("click", async ()=>{
  try{
    const res = await fetch("res/custom.md", {cache:"no-cache"});
    if(!res.ok) throw new Error("custom.md missing");
    const md = await res.text();
    $("customHelpContent").innerHTML = mdToHtml(md);
    $("customHelpModal").classList.remove("hidden");
  }catch(err){
    dlgAlert("帮助内容加载失败：" + err.message, { type: "error", title: "出错了" });
  }
});
$("customHelpClose").addEventListener("click", ()=>$("customHelpModal").classList.add("hidden"));
$("customHelpModal").addEventListener("click", e=>{
  if(e.target.classList.contains("modalMask")) $("customHelpModal").classList.add("hidden");
});

$("clearBtn").addEventListener("click", async ()=>{
  const ok = await dlgConfirm(
    "确定清空 " + S.cls + " 的全部对战历史和擂主记录吗？此操作不可恢复。",
    { type: "error", title: "清空历史", okText: "确认清空", cancelText: "保留" });
  if(!ok) return;
  localStorage.removeItem(hisKey(S.cls));
  saveChamp(S.cls, "");
  redName = ""; blueName = ""; champFixed = false;
  refreshNameBoxes(); renderHistory();
});

/* ================== 词库弹窗 ================== */
$("openLibModal").addEventListener("click", ()=>{
  tempUnits = S.units.slice();
  /* 每次打开：只展开已选词库所在的册，其余收起 */
  libOpenBooks = new Set(tempUnits.map(bookOfTag).filter(Boolean));
  renderLibChips();
  /* 每次打开从顶部开始，否则会停在上次浏览的位置、连册标题都看不到 */
  const libPanel = $("builtinPanel");
  if(libPanel) libPanel.scrollTop = 0;
  /* 每次打开默认显示内置词库选项卡 */
  switchLibTab("builtin");
  $("libModal").classList.remove("hidden");
});
$("libCancel").addEventListener("click", ()=>$("libModal").classList.add("hidden"));
$("libModal").addEventListener("click", e=>{
  if(e.target.classList.contains("modalMask")) $("libModal").classList.add("hidden");
});
/* 全部内置单元：一键全选 / 清空（自定义词库不受影响，它在另一个页签） */
$("libSelectAll").addEventListener("click", ()=>setLibUnits(builtinTags(), true));
$("libSelectNone").addEventListener("click", ()=>setLibUnits(builtinTags(), false));

/* ================== 词库选项卡切换 ================== */
function switchLibTab(name){
  document.querySelectorAll(".libTab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  $("builtinPanel").classList.toggle("hidden", name !== "builtin");
  $("customPanel").classList.toggle("hidden", name !== "custom");
  /* 全选 / 清空只管内置单元，切到自定义页签时收起 */
  $("libBulkRow").classList.toggle("hidden", name !== "builtin");
}
document.querySelectorAll(".libTab").forEach(tab => {
  tab.addEventListener("click", () => switchLibTab(tab.dataset.tab));
});

/* chip 点击（事件委托到整个弹窗，覆盖内置和自定义两个面板） */
$("libModal").addEventListener("click", e=>{
  const chip = e.target.closest(".libChip");
  if(!chip) return;
  const tag = chip.dataset.tag;
  if(tempUnits.includes(tag)) tempUnits = tempUnits.filter(t => t !== tag);
  else tempUnits.push(tag);
  renderLibChips();
});

/* ================== 导入本地词库 ================== */
$("importLibBtn").addEventListener("click", ()=>$("libFile").click());
$("libFile").addEventListener("change", e=>{
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async ()=>{
    e.target.value = "";
    try{
      const r = importCustomLib(reader.result);
      tempUnits.push(r.tag);
      renderLibChips();
      await dlgAlert("已导入词库「" + esc(r.name) + "」：" + r.count + " 个单词"
        + (r.chunks ? " + " + r.chunks + " 个词块" : "") + "。<br>已自动选中，点确定后生效。",
        { type: "success", title: "✅ 词库导入成功", html: true });
    }catch(err){
      dlgAlert("导入失败：" + err.message,
        { type: "error", title: "❌ 词库导入失败" });
    }
  };
  reader.readAsText(file, "UTF-8");
});
$("libConfirm").addEventListener("click", async ()=>{
  if(!tempUnits.length){
    dlgAlert("请至少选择一个词库！", { type: "warning", title: "未选择词库" });
    return;
  }
  S.units = tempUnits;
  syncUseChunks();
  saveCfg();
  updateLibBtn();
  planInfo();
  $("libModal").classList.add("hidden");
});

/* ================== 只加载纯单词 ================== */
$("wordsOnlyChk").addEventListener("change", e=>{
  S.wordsOnly = e.target.checked;
  syncUseChunks();
  saveCfg();
  planInfo();
  renderSettingStatus();
});
/* 计分模式（无限制 / 淘汰制 / 累加制）与满分档位：
   两种限分模式的加减分固定，切换时把连击加分 / 答错扣分隐藏 */
$("scoreModeRow").addEventListener("click", e=>{
  const btn = e.target.closest(".scoreModeOpt");
  if(!btn || btn.dataset.mode === S.scoreMode) return;
  S.scoreMode = btn.dataset.mode;
  renderScoreModeUI();
  renderSettingStatus();
  planInfo();
  saveCfg();
});
$("capRow").addEventListener("click", e=>{
  const btn = e.target.closest(".capOpt");
  if(!btn) return;
  S.scoreCap = parseInt(btn.dataset.cap);
  renderScoreModeUI();
  renderSettingStatus();
  planInfo();
  saveCfg();
});
/* 连击加分 / 答错扣分：只影响计分，不改变题型与题池 */
$("comboBonusChk").addEventListener("change", e=>{
  S.comboBonus = e.target.checked;
  saveCfg();
  renderSettingStatus();
});
$("wrongPenaltyChk").addEventListener("change", e=>{
  S.wrongPenalty = e.target.checked;
  saveCfg();
  renderSettingStatus();
});

/* ================== 本次PK不计入战绩（临时赛） / 单人作答 ==================
   两项都随改随存，下次打开保持上次的选择 */
$("noRecordChk").addEventListener("change", e=>{
  S.noRecord = e.target.checked;
  saveUI({noRecord:S.noRecord});
});
/* 单人作答：一位选手即可开局，另一侧作为答错后的补救通道 */
$("soloChk").addEventListener("change", e=>{
  S.solo = e.target.checked;
  saveUI({solo:S.solo});
});

/* ================== 擂台设置弹窗 ================== */
$("settingBtn").addEventListener("click", ()=>$("settingModal").classList.remove("hidden"));
$("settingClose").addEventListener("click", ()=>$("settingModal").classList.add("hidden"));
$("settingModal").addEventListener("click", e=>{
  if(e.target.classList.contains("modalMask")) $("settingModal").classList.add("hidden");
});
$("rememberWrongChk").addEventListener("change", e=>{
  S.rememberWrong = e.target.checked;
  saveCfg();
  planInfo();
  renderSettingStatus();
});
/* 擂台超时检测开关 */
$("questionTimeoutChk").addEventListener("change", e=>{
  S.questionTimeout = e.target.checked;
  renderQuestionTimeoutUI();
  renderSettingStatus();
  saveCfg();
});
/* 每题限时 3s / 5s / 7s */
$("qTimeoutRow").addEventListener("click", e=>{
  const btn = e.target.closest(".qTimeoutOpt");
  if(!btn || !S.questionTimeout) return;
  S.questionTimeoutDur = parseInt(btn.dataset.sec);
  renderQuestionTimeoutUI();
  renderSettingStatus();
  saveCfg();
});

/* ================== 更新提示弹窗 ================== */
/* 「我知道了」：记录当前版本为已读，以后不再弹 */
$("updateGotIt").addEventListener("click", ()=>{
  try{ localStorage.setItem(UPDATE_READ_KEY, APP_VERSION); }catch(e){}
  $("updateModal").classList.add("hidden");
});
/* 「稍后处理」：不记录，下次进入仍弹出 */
$("updateLater").addEventListener("click", ()=>{
  $("updateModal").classList.add("hidden");
});
/* 「关于项目 → 数据只存本机 · 更新说明」：手动打开更新弹窗再次阅读 */
$("aboutUpdateBtn").addEventListener("click", ()=>showUpdateModal());

/* ================== 关于项目弹窗 ==================
   简介为静态内容；版本号取自 config.js 的 APP_VERSION，避免两处写死不一致 */
$("aboutBtn").addEventListener("click", ()=>{
  $("aboutVer").textContent = APP_VERSION;
  $("aboutModal").classList.remove("hidden");
});
$("aboutClose").addEventListener("click", ()=>$("aboutModal").classList.add("hidden"));
$("aboutModal").addEventListener("click", e=>{
  if(e.target.classList.contains("modalMask")) $("aboutModal").classList.add("hidden");
});

/* ================== 使用说明弹窗（内容从 res/tips.md 加载） ==================
   「关于项目」底部的「使用说明」按钮触发；弹窗叠在关于窗口之上，关闭后回到关于 */
$("aboutTipsBtn").addEventListener("click", async ()=>{
  try{
    const res = await fetch("res/tips.md", {cache:"no-cache"});
    if(!res.ok) throw new Error("tips.md missing");
    const md = await res.text();
    $("tipsContent").innerHTML = mdToHtml(md);
    $("tipsModal").classList.remove("hidden");
  }catch(err){
    dlgAlert("使用说明加载失败：" + err.message, { type: "error", title: "出错了" });
  }
});
$("tipsClose").addEventListener("click", ()=>$("tipsModal").classList.add("hidden"));
$("tipsModal").addEventListener("click", e=>{
  if(e.target.classList.contains("modalMask")) $("tipsModal").classList.add("hidden");
});

/* ================== 错词记录弹窗 ==================
   全库累计的错词台账：按册 / 单元展示，支持单单元、单册、全部导出 HTML。
   数据由结算时的 recordWrongBook() 写入，与班级无关。 */
$("wrongbookBtn").addEventListener("click", ()=>{
  wbCollapsed = new Set();
  renderWrongBook();
  $("wrongbookModal").classList.remove("hidden");
});
$("wbClose").addEventListener("click", ()=>$("wrongbookModal").classList.add("hidden"));
$("wrongbookModal").addEventListener("click", e=>{
  if(e.target.classList.contains("modalMask")) $("wrongbookModal").classList.add("hidden");
});
$("wbExportAll").addEventListener("click", ()=>wbExport({type:"all"}));
$("wbClear").addEventListener("click", ()=>wbClearAll());
/* 册的折叠与「导出本册 / 本单元」按钮都是动态生成的，统一在容器上委托 */
$("wbBody").addEventListener("click", e=>{
  const exp = e.target.closest("[data-wb-export]");
  if(exp){
    if(exp.dataset.wbExport === "book") wbExport({type:"book", book:exp.dataset.book});
    else wbExport({type:"unit", tag:exp.dataset.tag});
    return;
  }
  const toggle = e.target.closest("[data-wb-book]");
  if(toggle){
    const book = toggle.closest(".wbBook");
    const key = toggle.dataset.wbBook;
    const collapsed = book.classList.toggle("collapsed");
    if(collapsed) wbCollapsed.add(key); else wbCollapsed.delete(key);
  }
});

/* ================== 历史战绩弹窗 ================== */
$("hisBtn").addEventListener("click", ()=>{
  renderHistory();
  $("hisModal").classList.remove("hidden");
});
$("hisClose").addEventListener("click", ()=>$("hisModal").classList.add("hidden"));
$("hisModal").addEventListener("click", e=>{
  if(e.target.classList.contains("modalMask")) $("hisModal").classList.add("hidden");
});

/* ================== 开始 PK / 限时 ================== */
$("startBtn").addEventListener("click", async ()=>{
  /* 单人作答只要一位选手：两边都填则取红方；另一侧在比赛中作为补救通道 */
  const soloPlayer = redName || blueName;
  if(S.solo){
    if(!soloPlayer){
      dlgAlert(hasRoster() ? "请先抽取（或手输）一位选手！" : "请先输入选手名字。",
        { type: "warning", title: "选手未就位" });
      if(!hasRoster()) enterManualMode("m1");
      return;
    }
    if(!validName(soloPlayer)){
      dlgAlert("选手名字只能包含中文、英文字母、数字及 · . - 等符号。",
        { type: "warning", title: "名字无效" });
      return;
    }
  }else{
    if(!redName || !blueName){
      dlgAlert(hasRoster()
        ? "请先抽取（或手输）红蓝双方选手！"
        : "请先输入红蓝双方选手的名字。",
        { type: "warning", title: "选手未就位" });
      if(!hasRoster()) enterManualMode(redName ? "m2" : "m1");
      return;
    }
    /* 手输名字与名单共用一套字符规则，避免出现奇怪的符号进到战绩里 */
    if(!validName(redName) || !validName(blueName)){
      dlgAlert("选手名字只能包含中文、英文字母、数字及 · . - 等符号。",
        { type: "warning", title: "名字无效" });
      return;
    }
    if(dispName(redName) === dispName(blueName)){
      const same = await dlgConfirm(
        "红蓝双方名字相同（" + dispName(redName) + "），仍要开始吗？",
        { type: "warning", title: "名字重复", okText: "仍要开始", cancelText: "改一下" });
      if(!same) return;
    }
  }
  if(!S.units.length){
    dlgAlert("请先选择词库！", { type: "warning", title: "未选择词库" });
    return;
  }
  syncUseChunks();
  saveCfg();
  if(S.solo){ S.p1 = soloPlayer; S.p2 = ""; }
  else { S.p1 = redName; S.p2 = blueName; }
  /* 未全屏则自动进入全屏，保证对战体验 */
  if(!fsElement()){ toggleFullscreen(); }
  startBattle(false);
});
/* ================== 时长选择弹窗 ================== */
let tempDur = 60;
$("openDurModal").addEventListener("click", ()=>{
  tempDur = S.dur;
  renderDurPicker(tempDur);
  $("durModal").classList.remove("hidden");
});
$("durMinus").addEventListener("click", ()=>{
  if(tempDur > 30){ tempDur -= 30; renderDurPicker(tempDur); }
});
$("durPlus").addEventListener("click", ()=>{
  if(tempDur < 300){ tempDur += 30; renderDurPicker(tempDur); }
});
$("durConfirm").addEventListener("click", ()=>{
  S.dur = tempDur;
  updateDurBtn();
  planInfo();
  saveCfg();
  $("durModal").classList.add("hidden");
});
$("durCancel").addEventListener("click", ()=>$("durModal").classList.add("hidden"));
$("durModal").addEventListener("click", e=>{
  if(e.target.classList.contains("modalMask")) $("durModal").classList.add("hidden");
});

/* ================== 对战答题 ================== */
$("side1").addEventListener("click", e=>answer(1, e));
$("side2").addEventListener("click", e=>answer(2, e));

/* ================== 结算页按钮 ================== */
/* 「下一局」已并入「返回主页」：主页会按擂主规则回填红方，重开一局更快。
   这里只保留保存作答结果。 */
$("saveBtn").addEventListener("click", saveResult);
$("reviveBtn").addEventListener("click", ()=>startBattle(true));
$("homeBtn").addEventListener("click", ()=>{
  show("setup");
  if(S.solo){ redName = S.p1; blueName = ""; }
  else { redName = S.cls ? loadChamp(S.cls) : S.trialChamp; blueName = ""; }
  champFixed = !!redName;
  refreshNameBoxes(); renderHistory();
});

/* ================== 全屏 ==================
   按钮固定在右上角，三个界面都可点；F 键切换，Esc 由浏览器直接退出。
   兼容各种叫法（标准 / webkit / 旧版 ms）。 */
function fsElement(){
  return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
}
function fsSupported(){
  const e = document.documentElement;
  return !!(e.requestFullscreen || e.webkitRequestFullscreen || e.msRequestFullscreen);
}
function syncFsBtn(){
  const on = !!fsElement();
  $("fsBtn").classList.toggle("on", on);
  /* 安装按钮与全屏按钮同步：全屏（对战）时一起变淡，主页时都是实心 */
  const ib = $("installBtn");
  if(ib) ib.classList.toggle("on", on);
  $("fsLabel").textContent = on ? "退出" : "全屏";
}
function toggleFullscreen(){
  try{
    if(fsElement()){
      (document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen).call(document);
    }else{
      const e = document.documentElement;
      (e.requestFullscreen || e.webkitRequestFullscreen || e.msRequestFullscreen).call(e);
    }
  }catch(err){ /* 浏览器拒绝时静默忽略，不影响使用 */ }
}
$("fsBtn").addEventListener("click", toggleFullscreen);
["fullscreenchange","webkitfullscreenchange","MSFullscreenChange"].forEach(ev=>{
  document.addEventListener(ev, syncFsBtn);
});
document.addEventListener("keydown", e=>{
  if(e.key === "f" || e.key === "F"){
    const tag = (e.target && e.target.tagName || "").toLowerCase();
    if(tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable) return;
    e.preventDefault(); toggleFullscreen();
  }
});
syncFsBtn();
if(!fsSupported()){ $("fsBtn").style.display = "none"; }

/* ================== 临时体验 ==================
   一个班级都没有时（首次使用），直接展开手输区：
   红蓝框提示「点此输入」，用户不必先导入名单也能试打一局（该局不记录战绩）。 */
if(!S.cls) enterManualMode();

/* ================== 禁止右键菜单 ==================
   触屏大屏上学生长按容易触发 Windows 右键，弹出浏览器菜单影响答题。
   全局拦截 contextmenu，包括鼠标右键和触屏长按。 */
document.addEventListener("contextmenu", e => e.preventDefault());

/* ================== 对局中的离开保护 ==================
   比赛进行中（含错词加时赛）刷新、关闭标签页、返回上一页时，浏览器会弹
   「更改可能不会保存」的确认框，避免误触直接丢掉这一局的比分与作答记录。
   结算页 / 主页不再拦截；确认框文案由浏览器决定，returnValue 只用于触发它。 */
window.addEventListener("beforeunload", e=>{
  const b = $("battle");
  if(!b || b.classList.contains("hidden") || S.ended) return;
  e.preventDefault();
  e.returnValue = "本局 PK 尚未结束，离开会丢失当前比分与作答记录。";
  return e.returnValue;
});
