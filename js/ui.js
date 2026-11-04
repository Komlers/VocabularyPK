/* ================== 音效与特效 ================== */
function speak(txt){
  try{
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(txt);
    u.lang = "en-US"; u.rate = 0.85;
    speechSynthesis.speak(u);
  }catch(e){}
}
function beep(freq, dur){
  try{
    const ctx = beep.ctx || (beep.ctx = new (window.AudioContext||window.webkitAudioContext)());
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq; o.type = "sine";
    g.gain.setValueAtTime(0.12, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur);
  }catch(e){}
}
function fx(txt, color, xPct){
  const d = document.createElement("div");
  d.className = "fx"; d.textContent = txt;
  d.style.color = color;
  d.style.left = xPct + "%"; d.style.top = "34%";
  document.body.appendChild(d);
  setTimeout(()=>d.remove(), 1000);
}

/* ================== 页面切换 ================== */
function show(id){
  ["setup","battle","result"].forEach(x=>$(x).classList.toggle("hidden", x!==id));
}

/* ================== 轻量 Markdown 转 HTML ==================
   支持：标题(#~######)、无序/有序列表、粗体、行内代码、水平分隔线、段落 */
function mdToHtml(md){
  const escHtml = s => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const codes = [];
  const inline = s => {
    s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return "C"+(codes.length-1)+""; });
    s = escHtml(s);
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    /* 超链接 [文字](URL)：仅允许常见安全协议与相对路径，新窗口打开 */
    s = s.replace(/\[([^\]]*)\]\(([^()\s]+)\)/g, (_, text, url) => {
      const safe = /^(https?:|mailto:|tel:|\/|#|\.\/|\.\.\/|res\/|template\/|lib\/|js\/)/i.test(url);
      return '<a href="'+(safe?url:"#")+'" target="_blank" rel="noopener noreferrer">'+text+'</a>';
    });
    s = s.replace(/C(\d+)/g, (_, i) => "<code>"+escHtml(codes[i])+"</code>");
    return s;
  };
  const lines = String(md).replace(/\r\n/g,"\n").split("\n");
  let html = "", i = 0;
  const isHeading = l => /^#{1,6}\s/.test(l);
  const isHr = l => /^---+\s*$/.test(l);
  const isUl = l => /^\s*[-*]\s+/.test(l);
  const isOl = l => /^\s*\d+\.\s+/.test(l);
  /* 表格：当前行是 |...| 且下一行是分隔行（只含 空格/冒号/竖线/连字符 且含连字符） */
  const isTableRow = l => /^\s*\|.*\|\s*$/.test(l);
  const isTableSep  = l => /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && /-/.test(l);
  const splitTableRow = l => l.trim().replace(/^\|/,"").replace(/\|\s*$/,"")
                                   .split("|").map(c=>c.trim());
  const alignAttr = a => a==="center" ? ' style="text-align:center"'
                          : a==="right" ? ' style="text-align:right"' : "";
  while(i < lines.length){
    const line = lines[i];
    /* 围栏代码块：从 ``` 开始到下一个 ``` 结束，内容原样保留（仅转义 HTML） */
    if(/^```/.test(line)){
      i++;
      const buf = [];
      while(i < lines.length && !/^```/.test(lines[i])){ buf.push(lines[i]); i++; }
      if(i < lines.length) i++; /* 跳过结束的 ``` */
      html += "<pre><code>"+escHtml(buf.join("\n"))+"</code></pre>";
      continue;
    }
    if(!line.trim()){ i++; continue; }
    let m = line.match(/^(#{1,6})\s+(.*)$/);
    if(m){ const n=m[1].length; html += "<h"+n+">"+inline(m[2])+"</h"+n+">"; i++; continue; }
    if(isHr(line)){ html += "<hr>"; i++; continue; }
    /* 表格：表头行 + 分隔行 + 若干数据行 */
    if(isTableRow(line) && i+1 < lines.length && isTableSep(lines[i+1])){
      const headers = splitTableRow(line);
      const aligns = splitTableRow(lines[i+1]).map(c=>
        /^:.*:$/.test(c) ? "center" : /:$/.test(c) ? "right" : "left");
      i += 2;
      let t = "<table><thead><tr>";
      headers.forEach((h,idx)=>{ t += "<th"+alignAttr(aligns[idx])+">"+inline(h)+"</th>"; });
      t += "</tr></thead><tbody>";
      while(i < lines.length && isTableRow(lines[i])){
        t += "<tr>";
        splitTableRow(lines[i]).forEach((c,idx)=>{
          t += "<td"+alignAttr(aligns[idx])+">"+inline(c)+"</td>";
        });
        t += "</tr>"; i++;
      }
      t += "</tbody></table>";
      html += t; continue;
    }
    if(isUl(line)){
      html += "<ul>";
      while(i < lines.length && isUl(lines[i])){
        html += "<li>"+inline(lines[i].replace(/^\s*[-*]\s+/, ""))+"</li>"; i++;
      }
      html += "</ul>"; continue;
    }
    if(isOl(line)){
      html += "<ol>";
      while(i < lines.length && isOl(lines[i])){
        html += "<li>"+inline(lines[i].replace(/^\s*\d+\.\s+/, ""))+"</li>"; i++;
      }
      html += "</ol>"; continue;
    }
    /* 段落：合并连续普通行 */
    const para = [];
    while(i < lines.length && lines[i].trim() && !isHeading(lines[i]) && !isHr(lines[i])
          && !isUl(lines[i]) && !isOl(lines[i])){ para.push(lines[i]); i++; }
    html += "<p>"+inline(para.join("<br>"))+"</p>";
  }
  return html;
}

/* ================== 更新提示 ==================
   拉取 update.md 转 HTML 并显示更新弹窗（自动检查与手动入口共用） */
async function showUpdateModal(){
  try{
    const res = await fetch(UPDATE_MD_URL, {cache:"no-cache"});
    if(!res.ok) throw new Error("update.md missing");
    const md = await res.text();
    $("updateVer").textContent = APP_VERSION;
    $("updateContent").innerHTML = mdToHtml(md);
    $("updateModal").classList.remove("hidden");
  }catch(e){
    dlgAlert("更新内容加载失败：" + e.message, { type: "error", title: "出错了" });
  }
}
/* 已读版本号 !== 当前版本号时，自动弹出更新提示 */
async function checkUpdate(){
  let readVer = "";
  try{ readVer = localStorage.getItem(UPDATE_READ_KEY) || ""; }catch(e){}
  if(readVer === APP_VERSION) return;
  showUpdateModal();
}

/* ================== 班级与战绩渲染 ================== */
/* 班级选择：根据 LocalStorage 中的名单动态渲染 chips */
function renderChips(){
  const box = $("classChips");
  const rs = rosters();
  const names = Object.keys(rs);
  box.innerHTML = "";
  names.forEach(cls=>{
    const chip = document.createElement("div");
    chip.className = "chip" + (cls === S.cls ? " on" : "");
    chip.dataset.cls = cls;
    const cnt = document.createElement("span");
    cnt.className = "cnt";
    cnt.textContent = (rs[cls]||[]).length + " 人";
    const del = document.createElement("span");
    del.className = "clsDel";
    del.textContent = "×";
    del.title = "删除该班名单";
    chip.appendChild(document.createTextNode(cls));
    chip.appendChild(cnt);
    chip.appendChild(del);
    box.appendChild(chip);
  });
  const tip = $("noRosterTip");
  if(tip) tip.style.display = names.length ? "none" : "";
  /* 已有名单后，主页面不再显示导入按钮，导入功能移至名单编辑器内 */
  const ib = $("importRosterBtn");
  if(ib){
    ib.textContent = "📥 导入班级名单（TXT）";
    ib.style.display = names.length ? "none" : "";
  }
  const row = document.querySelector(".classRow");
  if(row) row.classList.toggle("has-roster", names.length > 0);
}
/* 战绩列表的日期标题：今天 / 昨天 / 11月2日 周日（跨年带年份） */
function dayLabel(d){
  const now = new Date();
  const dayStart = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((dayStart(now) - dayStart(d)) / 86400000);
  if(diff === 0) return "今天";
  if(diff === 1) return "昨天";
  const md = (d.getMonth()+1) + "月" + d.getDate() + "日";
  const w = "日一二三四五六"[d.getDay()];
  const date = d.getFullYear() === now.getFullYear() ? md : d.getFullYear() + "年" + md;
  return date + " 周" + w;
}
function renderHistory(){
  const h = loadHis(S.cls);
  const t = $("hisTitle"); if(t) t.textContent = S.cls ? ("📊 " + S.cls + " 战绩") : "📊 战绩";
  renderChips();
  const body = $("hisBody"), clearBtn = $("clearBtn");
  if(!h.matches.length){
    body.innerHTML = "暂无记录";
    clearBtn.classList.add("hidden");
  }else{
    const wins = {};
    h.matches.forEach(m => {
      if(m.s1 > m.s2) wins[m.p1] = (wins[m.p1]||0)+1;
      else if(m.s2 > m.s1) wins[m.p2] = (wins[m.p2]||0)+1;
    });
    const winTop = Object.entries(wins).sort((a,b)=>b[1]-a[1])[0];
    const stTop = Object.entries(h.streaks||{}).sort((a,b)=>b[1]-a[1])[0];
    let html = '<div class="row">'
      + '<div class="stat">总场次 <b>' + h.matches.length + '</b></div>';
    if(winTop) html += '<div class="stat">胜场王 <b>' + esc(dispName(winTop[0])) + ' ' + winTop[1] + '胜</b></div>';
    if(stTop) html += '<div class="stat">连击纪录 <b>' + esc(dispName(stTop[0])) + ' x' + stTop[1] + '</b></div>';
    html += "</div>";
    /* 全部记录：按时间戳倒序（最新在前），再按日期分组，同一天折叠在一个日期标题下 */
    const all = h.matches.slice().sort((a, b) => b.t - a.t);
    const dayKey = d => d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
    const dayCount = {};
    all.forEach(m => { const k = dayKey(new Date(m.t)); dayCount[k] = (dayCount[k] || 0) + 1; });
    let lastDay = "", list = "";
    all.forEach(m => {
      const d = new Date(m.t), k = dayKey(d);
      if(k !== lastDay){
        lastDay = k;
        list += '<div class="dateHead">' + dayLabel(d) + ' <i>' + dayCount[k] + ' 场</i></div>';
      }
      const res = m.s1===m.s2 ? "平局" : (m.s1>m.s2 ? esc(dispName(m.p1))+" 胜" : esc(dispName(m.p2))+" 胜");
      const hm = String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0");
      list += '<div class="recentItem"><span>' + esc(dispName(m.p1)) + ' ' + m.s1 + ' : ' + m.s2 + ' ' + esc(dispName(m.p2))
        + '</span><span class="mini">' + m.unit + " · " + res + " · " + hm + '</span></div>';
    });
    html += '<div id="recentList">' + list + "</div>";
    body.innerHTML = html;
    clearBtn.classList.remove("hidden");
  }
  /* 错词记忆关闭时不显示待复现错词（即使历史上有 wrongs 数据） */
  const rw = S.rememberWrong ? reviewWords(S.cls).length : 0;
  let info = "";
  /* 临时体验（无班级）的擂主只在本会话内有效，不标注「本地记忆」 */
  if(redName) info += "擂主已就位：" + esc(dispName(redName)) + (champFixed && S.cls ? "（本地记忆）" : "") + "。";
  if(rw) info += "🔁 待复现 " + rw + " 个错词。";
  /* 临时体验没有「抽取」动作，底部状态行留空，避免与上方提示重复 */
  $("drawInfo").textContent = info || (S.cls
    ? "先抽擂主（红方），再抽挑战者（蓝方）。"
    : "");

  /* 名单载入状态：直观确认名单已导入、还剩多少人没抽 */
  if(!S.cls){
    $("rosterInfo").textContent = "💡 还没有班级名单：可直接在下方输入两位选手名字体验一局，或先导入 TXT 名单。";
    return;
  }
  const roster = rosters()[S.cls] || [];
  $("rosterInfo").textContent = roster.length
    ? "✅ 名单已载入：" + S.cls + " · 共 " + roster.length + " 人"
    : "⚠ 「" + S.cls + "」名单为空：可导入 TXT，也可直接输入名字（这局的战绩会记到本班）。";
}

/* ================== 抽人 ================== */
function resetDrawn(){ drawnPool = shuffle(rosters()[S.cls] || []); }
function takeName(exclude){
  if(!rosters()[S.cls] || !rosters()[S.cls].length) return "";
  if(!drawnPool.length) resetDrawn();
  /* 以 @ 开头的名字不计入随机抽取（仅手动输入/选择可用） */
  const isGhost = n => n.trimStart().startsWith("@");
  let idx = drawnPool.findIndex(n => n !== exclude && !isGhost(n));
  if(idx < 0){ resetDrawn(); idx = drawnPool.findIndex(n => n !== exclude && !isGhost(n)); }
  if(idx < 0) return "";
  return drawnPool.splice(idx, 1)[0];
}
/* 手输名字解析：若名单中存在 @前缀 的对应名字（@张三 / @ 张三），则返回带@的原始名；
   否则返回用户输入本身。显示层统一用 dispName 去掉@，内部存储与抽人逻辑保留@标记。 */
function resolveGhostName(input){
  if(!input) return "";
  if(input.trimStart().startsWith("@")) return input;
  const roster = rosters()[S.cls] || [];
  const match = roster.find(n => n.replace(/^@\s*/, "") === input);
  return match || input;
}
function animateDraw(boxId, finalName, done){
  const names = rosters()[S.cls] || ["?"];
  const box = $(boxId);
  const shell = box.parentElement;                 /* 抽取中给外框加虚线闪烁 */
  if(shell) shell.classList.add("drawing");
  let ticks = 0;
  const iv = setInterval(()=>{
    box.textContent = dispName(names[(Math.random()*names.length)|0]);
    if(++ticks > 15){
      clearInterval(iv);
      box.textContent = dispName(finalName) || "—";
      if(shell) shell.classList.remove("drawing");
      beep(880, .1);
      if(done) done();
    }
  }, 70);
}
function refreshNameBoxes(){
  $("redNameBox").textContent = dispName(redName) || "待抽取";
  $("blueNameBox").textContent = dispName(blueName) || "待抽取";
  const h = $("drawHint");
  if(h) h.textContent = hasRoster()
    ? "先抽擂主（红方），再抽挑战者（蓝方）"
    : "直接输入两个名字即可开始";
  /* 没有名单时「选择」无意义（选名列表为空），收起入口 */
  const pick = $("pickBtn");
  if(pick) pick.style.display = hasRoster() ? "" : "none";
  /* 手输框显示不带@的名字，内部 redName/blueName 可能存的是带@的幽灵名 */
  $("m1").value = dispName(redName);
  $("m2").value = dispName(blueName);
}
/* 临时体验：没有名单时直接展开手输区，免去用户去找「输入」小链接 */
function enterManualMode(focusId){
  manualMode = true;
  $("manualRow").classList.remove("hidden");
  $("manualBtn").textContent = "收起";
  if(focusId){
    const el = $(focusId);
    if(el){ el.focus(); el.select(); }
  }
}

/* ================== 选名弹窗 ================== */
function renderPickGrid(){
  const grid = $("pickGrid");
  const roster = rosters()[S.cls] || [];
  grid.innerHTML = "";
  if(!roster.length){
    grid.innerHTML = '<div class="pickEmpty">当前班级还没有名单，请先导入 TXT 名单</div>';
    return;
  }
  const cur = pickSide === "red" ? redName : blueName;
  roster.forEach(n=>{
    const el = document.createElement("div");
    el.className = "pickName" + (n === cur ? " cur" : "");
    el.textContent = dispName(n);
    el.addEventListener("click", ()=>{
      if(pickSide === "red"){ redName = n; champFixed = false; }
      else { blueName = n; }
      refreshNameBoxes(); renderHistory();
      $("pickModal").classList.add("hidden");
    });
    grid.appendChild(el);
  });
}

/* ================== 词库弹窗与限时 ================== */
/* 创建一个词库 chip（含选中状态和删除按钮） */
function createLibChip(tag, file, displayText){
  const chip = document.createElement("div");
  chip.className = "libChip" + (tempUnits.includes(tag) ? " on" : "");
  chip.dataset.tag = tag;
  chip.textContent = displayText || file;
  if(file === "custom"){
    chip.classList.add("customLib");
    const del = document.createElement("span");
    del.className = "libDel";
    del.textContent = "×";
    del.title = "删除此自定义词库";
    del.addEventListener("click", async e=>{
      e.stopPropagation();
      const ok = await dlgConfirm(
        "确定删除自定义词库「" + (LIB_INFO[tag]?.name || tag) + "」吗？此操作不可恢复。",
        { type: "error", title: "删除词库", okText: "确认删除", cancelText: "保留" });
      if(!ok) return;
      deleteCustomLib(tag);
      tempUnits = tempUnits.filter(t => t !== tag);
      renderLibChips();
    });
    chip.appendChild(del);
  }
  return chip;
}

function renderLibChips(){
  /* ===== 内置词库：按册分组 ===== */
  const groupsBox = $("builtinGroups");
  groupsBox.innerHTML = "";
  const bookNames = { b1:"必修1", b2:"必修2", b3:"必修3", b4:"选必1", b5:"选必2" };
  const builtin = WORD_BANK_FILES.filter(x => x.file !== "custom");
  ["b1","b2","b3","b4","b5"].forEach(bk => {
    const items = builtin.filter(x => x.file.startsWith(bk));
    if(!items.length) return;
    const group = document.createElement("div");
    group.className = "libGroup";
    const heading = document.createElement("div");
    heading.className = "libGroupTitle";
    heading.textContent = bookNames[bk];
    group.appendChild(heading);
    const chipsBox = document.createElement("div");
    chipsBox.className = "libChips";
    items.forEach(({file, tag}) => {
      const info = LIB_INFO[tag];
      const uNum = "U" + file.replace(/^b\d+u/, "");
      const text = info ? (uNum + " - " + info.name) : file;
      chipsBox.appendChild(createLibChip(tag, file, text));
    });
    group.appendChild(chipsBox);
    groupsBox.appendChild(group);
  });
  /* ===== 自定义词库 ===== */
  const customBox = $("customChips");
  customBox.innerHTML = "";
  const custom = WORD_BANK_FILES.filter(x => x.file === "custom");
  if(!custom.length){
    customBox.innerHTML = '<div style="color:#999;font-size:18px;padding:24px 0;text-align:center">暂无自定义词库，点击上方按钮导入</div>';
  }else{
    custom.forEach(({file, tag}) => {
      const info = LIB_INFO[tag];
      customBox.appendChild(createLibChip(tag, file, info ? info.name : tag));
    });
  }
  $("libHint").textContent = tempUnits.length === 0 ? "未选择词库（请至少选一个）"
    : (tempUnits.length === 1 ? "当前单词库" : "当前多词库（已选 " + tempUnits.length + " 个）");
}
function updateLibBtn(){
  const n = S.units.length;
  $("openLibModal").textContent = n ? "📚 已选 " + n + " 个词库" : "📚 选择词库";
}
/* 限时：格式化秒数为 m:ss */
function fmtDur(sec){
  const m = Math.floor(sec/60), s = sec%60;
  return m + ":" + (s<10?"0":"") + s;
}
/* 限时按钮文字 */
function updateDurBtn(){
  $("openDurModal").textContent = "⏱ 限时 " + fmtDur(S.dur);
}
/* 弹窗中间显示当前选择的限时 */
function renderDurPicker(val){
  $("durValue").textContent = fmtDur(val);
}

/* ================== 配置恢复 ================== */
function restoreCfg(){
  /* 先按当前班级重置，避免沿用上一个班级的词库/时长 */
  S.units = [];
  S.dur = 60;
  S.wordsOnly = false;
  S.rememberWrong = false;
  S.questionTimeout = true;
  S.questionTimeoutDur = 5;
  try{
    const c = JSON.parse(localStorage.getItem("vpk_cfg_" + S.cls));
    if(c){
      if(Array.isArray(c.units) && c.units.length) S.units = c.units.filter(t => LIB_INFO[t]);
      if(c.dur) S.dur = c.dur;
      if(c.wordsOnly !== undefined) S.wordsOnly = !!c.wordsOnly;
      if(c.rememberWrong !== undefined) S.rememberWrong = !!c.rememberWrong;
      if(c.questionTimeout !== undefined) S.questionTimeout = !!c.questionTimeout;
      if(c.questionTimeoutDur) S.questionTimeoutDur = c.questionTimeoutDur;
    }
  }catch(e){}
  /* 首次使用不默认勾选任何词库，由用户手动选择；
     含词块的词库会自动启用词块题型，勾选「只加载纯单词」时强制关闭 */
  syncUseChunks();
  $("wordsOnlyChk").checked = S.wordsOnly;
  $("rememberWrongChk").checked = S.rememberWrong;
  $("questionTimeoutChk").checked = S.questionTimeout;
  renderQuestionTimeoutUI();
  renderSettingStatus();
  /* 临时赛选项不持久化，每次恢复配置时重置 */
  S.noRecord = false;
  $("noRecordChk").checked = false;
  updateDurBtn();
  updateLibBtn();
}
/* 擂台超时检测 UI：更新 3s/5s/7s 按钮选中态，关闭开关时整行变灰 */
function renderQuestionTimeoutUI(){
  const row = $("qTimeoutRow");
  row.classList.toggle("disabled", !S.questionTimeout);
  row.querySelectorAll(".qTimeoutOpt").forEach(b=>{
    b.classList.toggle("active", parseInt(b.dataset.sec) === S.questionTimeoutDur);
  });
}
/* 主页「当前擂台设置」状态行：错词记忆 / 是否只加载纯单词 / 单题超时 */
function renderSettingStatus(){
  const box = $("setStatusLine");
  if(!box) return;
  const parts = [
    S.rememberWrong ? "错词将记忆" : "错词不记忆",
    S.wordsOnly ? "只加载纯单词" : "加载完整词库",
    S.questionTimeout ? "单题超时：" + S.questionTimeoutDur + "s" : "单题不限时"
  ];
  box.innerHTML = parts.map(t => '<span>' + esc(t) + '</span>')
                       .join('<span class="setSep">|</span>');
}
/* 题池提示：随选词库与时长实时更新 */
function planInfo(){
  const p = planFor(S.dur);
  const total = S.useChunks ? p.w + p.c1 + p.c2 + p.c3 : p.w;
  const mins = (S.dur/60).toFixed(1).replace(/\.0$/,"");
  const rg = poolRange();
  const poolN = rg.words + rg.chunks;
  const head = S.useChunks
    ? mins + " 分钟 | " + p.w + " 单词 + " + p.c1 + " 词块选义 + " + p.c2 + " 词块配对 + " + p.c3 + " 词块重组 ＝ " + total + " 题"
    : mins + " 分钟 | 纯单词 " + p.w + " 题";
  $("planInfo").textContent = head + "｜本题池 " + poolN + " 条（"
    + rg.words + " 单词" + (rg.chunks ? " + " + rg.chunks + " 词块" : "") + "）";
}
/* 没有指定班级时，自动选 LocalStorage 里第一个班级 */
function autoSelectClass(){
  if(S.cls && rosters()[S.cls]) return;
  const names = Object.keys(rosters());
  S.cls = names[0] || "";
}
