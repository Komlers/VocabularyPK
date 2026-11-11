/* ================== 老内核兼容检测 ==================
   ① flex gap：Chromium < 84、Safari < 14.1 不支持，用 margin 兜底（见 style.css 末尾）；
   ② :focus-visible：Chromium < 86 不支持，用 :focus 兜底。
   不用 @supports 判断 gap —— 该属性在 grid 上早已支持，老内核会误判为「支持」。 */
(function detectLegacyCSS(){
  try{
    const box = document.createElement("div");
    box.style.cssText = "position:absolute;left:-9999px;top:0;display:flex;gap:5px;visibility:hidden";
    const a = document.createElement("i"), b = document.createElement("i");
    a.style.cssText = b.style.cssText = "width:1px;height:1px;flex:none";
    box.appendChild(a); box.appendChild(b);
    document.body.appendChild(box);
    const gapOk = Math.round(b.getBoundingClientRect().left - a.getBoundingClientRect().left) === 6;
    document.body.removeChild(box);
    if(!gapOk) document.documentElement.classList.add("no-flex-gap");
  }catch(e){}
  try{
    if(!(window.CSS && CSS.supports && CSS.supports("selector(:focus-visible)")))
      document.documentElement.classList.add("no-focus-visible");
  }catch(e){ document.documentElement.classList.add("no-focus-visible"); }
})();

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

/* ================== 渲染动画开关 ==================
   「擂台设置 → 渲染动画效果」默认开启。关闭后给 <html> 加 .no-anim，
   由 style.css 末尾统一取消动画与过渡，页面切换也不再等出场动画，
   老旧笔记本 / 投屏一体机这类低性能设备能明显跟手。
   开关属于设备偏好，存 vpk_ui（跟设备走），不随班级变化。
   系统开了「减少动态效果」时同样按关闭处理，只影响效果、不改用户的勾选。 */
let reduceMotion = false;
try{
  reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}catch(e){}

/* 是否播放动画：用户没关，且系统没要求减少动态 */
function animOn(){
  return S.anim !== false && !reduceMotion;
}
/* 把当前设置落到 DOM 与设置面板上；改开关时调用即可立即生效 */
function applyAnimUI(){
  try{ document.documentElement.classList.toggle("no-anim", !animOn()); }catch(e){}
  const chk = $("animChk");
  if(chk) chk.checked = S.anim !== false;   /* 复选框只反映用户设置，不反映系统偏好 */
}
/* 启动即应用：脚本在 body 末尾，早于首帧渲染，避免先播一次入场动画再被关掉 */
(function initAnim(){
  try{ if(loadUI().anim === false) S.anim = false; }catch(e){}
  applyAnimUI();
})();

/* ================== 角按钮显隐（安装 / 终止） ==================
   左上角：主界面显示「安装」（浏览器允许安装时），比赛中换成「终止」；
   右上角的全屏按钮三种界面都在，不参与切换。
   inBattle 由 show() 直接传入，避免旧页面淡出期间状态滞后 160ms。 */
function syncCornerBtns(inBattle){
  if(inBattle === undefined) inBattle = !$("battle").classList.contains("hidden");
  const install = $("installBtn");
  if(install) install.classList.toggle("hidden", inBattle || install.dataset.ready !== "1");
  const abort = $("abortBtn");
  if(abort) abort.classList.toggle("hidden", !inBattle);
}

/* ================== 页面切换 ================== */
/* 入场：新页面靠 .screen:not(.hidden) 的 screenIn 淡入。
   出场：旧页面加 .leaving 变成 fixed 并淡出，动画结束后才真正 hidden；
        关闭渲染动画时直接切换，不留任何延时。 */
const SCREENS = ["setup","battle","result"];
const SCREEN_LEAVE_MS = 160;
const screenLeaveTimers = {};
function show(id){
  SCREENS.forEach(x=>{
    const el = $(x);
    if(!el) return;
    if(x === id){
      if(screenLeaveTimers[x]){ clearTimeout(screenLeaveTimers[x]); screenLeaveTimers[x] = null; }
      el.classList.remove("leaving");
      el.style.top = "";
      el.style.bottom = "";
      el.classList.remove("hidden");
      return;
    }
    if(el.classList.contains("hidden")) return;
    if(!animOn()){ el.classList.add("hidden"); return; }
    /* 先读滚动位置：加了 .leaving 之后页面高度骤减，滚动会被立刻夹到 0 */
    const y = window.pageYOffset || document.documentElement.scrollTop || 0;
    el.classList.add("leaving");
    /* 页面切出后变成 fixed，若用户已经向下滚动过，用负 top 把旧页面钉在原来的
       位置，淡出过程中就不会突然跳到页首 */
    if(y){ el.style.top = (-y) + "px"; el.style.bottom = "auto"; }
    if(screenLeaveTimers[x]) clearTimeout(screenLeaveTimers[x]);
    screenLeaveTimers[x] = setTimeout(()=>{
      el.classList.remove("leaving");
      el.style.top = "";
      el.style.bottom = "";
      el.classList.add("hidden");
      screenLeaveTimers[x] = null;
    }, SCREEN_LEAVE_MS);
  });
  /* 角按钮跟着目标页面走：比赛中才有「终止」，回到主页才恢复「安装」 */
  syncCornerBtns(id === "battle");
}

/* ================== 轻量 Markdown 转 HTML ==================
   够渲染 res/ 里的说明文档，覆盖 CommonMark / GFM 的常用语法，零依赖：
     · 块级：ATX / Setext 标题、围栏代码（``` 与 ~~~）、水平线、引用（可嵌套）、
             有序 / 无序列表（可嵌套、支持任务清单）、GFM 表格（可对齐、可省首尾竖线）、段落
     · 行内：反斜杠转义、行内代码（多反引号）、图片、链接、自动链接、
             粗体 / 斜体 / 粗斜体 / 删除线
   安全：正文先整体 HTML 转义再拼标签，源码里的尖括号不会变成真标签；代码只转义不解析。
   兼容：段落内的单个换行按 <br> 处理（CommonMark 默认是空格），沿用旧文档的排版习惯。 */
function mdToHtml(md){
  const escHtml = s => String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  /* 行内代码、转义字符、链接地址先换成占位符，避免被后面的强调 / 链接规则
     二次解析（比如地址里的 _ 被当成斜体）。占位符用不可见的 \x7f 包裹。 */
  const stash = [];
  const keep = html => "\x7f" + (stash.push(html) - 1) + "\x7f";

  /* 链接与图片：带协议的只放行 http(s) / mailto / tel，其余（相对路径、锚点、
     根路径）一律放行；javascript:、data: 这类危险协议落到 # */
  const safeUrl = u => {
    const t = String(u).trim();
    if(/^[a-z][a-z0-9+.\-]*:/i.test(t)) return /^(https?|mailto|tel):/i.test(t) ? t : "#";
    return t.charAt(0) === "\\" ? "#" : t;
  };
  const NEWTAB = ' target="_blank" rel="noopener noreferrer"';

  /* ---------- 行内 ---------- */
  function inline(text){
    let s = escHtml(text);
    /* 反斜杠转义：\* \_ \` 等原样输出，放在最前，避免被后面的规则吃掉 */
    s = s.replace(/\\([\\`*_{}\[\]()#+\-.!>~|"'])/g, (m, c) => keep(c));
    /* 行内代码：`x` 与 ``x`y``；内容在上面已整体转义，这里直接包 <code> */
    s = s.replace(/(`+)([\s\S]*?)\1(?!`)/g, (m, fence, code) => keep("<code>" + code + "</code>"));
    /* 图片：![替代文字](地址 "标题") */
    s = s.replace(/!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+["']([^"']*)["'])?\s*\)/g,
      (m, alt, src, title) => '<img src="' + keep(safeUrl(src)) + '" alt="' + alt + '"'
        + (title ? ' title="' + title + '"' : "") + ">");
    /* 链接：[文字](地址 "标题")；地址进占位符，里面的 * _ 不会被当成强调 */
    s = s.replace(/\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+["']([^"']*)["'])?\s*\)/g,
      (m, txt, url, title) => '<a href="' + keep(safeUrl(url)) + '"'
        + (title ? ' title="' + title + '"' : "") + NEWTAB + ">" + txt + "</a>");
    /* 自动链接：<https://…> 与裸链接（末尾标点留在链接外） */
    s = s.replace(/&lt;((?:https?:\/\/|mailto:)[^\s&]+)&gt;/g,
      (m, url) => '<a href="' + keep(url) + '"' + NEWTAB + ">" + url + "</a>");
    s = s.replace(/(^|[\s(（])(https?:\/\/[^\s<>"'）】]+)/g, (m, pre, url) => {
      const tail = (url.match(/[.,;:!?。，；：！？、]+$/) || [""])[0];
      const href = tail ? url.slice(0, url.length - tail.length) : url;
      if(!href) return m;
      return pre + '<a href="' + keep(href) + '"' + NEWTAB + ">" + href + "</a>" + tail;
    });
    /* 删除线 */
    s = s.replace(/~~([^\s~](?:[\s\S]*?[^\s~])?)~~/g, "<del>$1</del>");
    /* 粗斜体 → 粗体 → 斜体，顺序不能反（否则 ***x*** 会先被当成斜体） */
    s = s.replace(/\*\*\*([^\s*](?:[\s\S]*?[^\s*])?)\*\*\*/g, "<strong><em>$1</em></strong>");
    s = s.replace(/(^|[^\w])___([^\s_](?:[\s\S]*?[^\s_])?)___(?!\w)/g, "$1<strong><em>$2</em></strong>");
    s = s.replace(/\*\*([^\s*](?:[\s\S]*?[^\s*])?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^\w])__([^\s_](?:[\s\S]*?[^\s_])?)__(?!\w)/g, "$1<strong>$2</strong>");
    s = s.replace(/\*([^\s*](?:[^*]*?[^\s*])?)\*/g, "<em>$1</em>");
    s = s.replace(/(^|[^\w])_([^\s_](?:[^_]*?[^\s_])?)_(?!\w)/g, "$1<em>$2</em>");
    return s;
  }

  /* ---------- 块级 ---------- */
  const RE_ATX    = /^ {0,3}(#{1,6})\s+(.*)$/;
  const RE_FENCE  = /^ {0,3}(`{3,}|~{3,})\s*(\S*)\s*$/;
  const RE_HR     = /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;
  const RE_QUOTE  = /^ {0,3}> ?/;
  const RE_ITEM   = /^(\s*)([-*+]|\d{1,9}[.)])\s+([\s\S]*)$/;
  const RE_SETEXT = /^ {0,3}(=+|-+)\s*$/;
  const RE_TASK   = /^\[([ xX])\]\s+([\s\S]*)$/;

  const indentOf = l => (l.match(/^[ \t]*/) || [""])[0].length;
  /* 表格：表头行含竖线、下一行是分隔行，且两行列数一致 */
  const isTableSep = l => l.indexOf("-") >= 0 && /^ {0,3}\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(l);
  function splitRow(l){
    const s = l.trim().replace(/^\|/, "").replace(/\|$/, "");
    const cells = [];
    let cur = "";
    for(let k = 0; k < s.length; k++){
      const ch = s.charAt(k);
      if(ch === "\\" && s.charAt(k + 1) === "|"){ cur += "|"; k++; continue; }
      if(ch === "|"){ cells.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  }
  const alignAttr = c => /^:.*:$/.test(c) ? ' style="text-align:center"'
                         : /:$/.test(c) ? ' style="text-align:right"' : "";
  const isTableStart = (l, next) =>
    l.indexOf("|") >= 0 && next !== undefined && isTableSep(next) &&
    splitRow(next).length === splitRow(l).length;
  /* 这一行是否开启一个新块（段落遇到它就得收尾） */
  const startsBlock = (l, next) =>
    RE_ATX.test(l) || RE_HR.test(l) || RE_QUOTE.test(l) || RE_FENCE.test(l) ||
    RE_ITEM.test(l) || isTableStart(l, next);

  /* 列表：按缩进收集每一项的内容，再递归解析，天然支持嵌套与项内代码块 */
  function listBlock(lines, start){
    const first = lines[start].match(RE_ITEM);
    const ordered = /\d/.test(first[2].charAt(0));
    const baseIndent = first[1].length;
    const startNo = ordered ? (parseInt(first[2], 10) || 1) : 1;
    const items = [];
    let loose = false, i = start, endList = false;
    while(i < lines.length && !endList){
      const m = lines[i].match(RE_ITEM);
      if(!m || m[1].length !== baseIndent || /\d/.test(m[2].charAt(0)) !== ordered) break;
      const contentAt = m[1].length + m[2].length + 1;   /* 标记后的内容起点 */
      const item = [m[3]];
      i++;
      while(i < lines.length){
        const L = lines[i];
        if(!L.trim()){
          /* 空行：看它后面那行属于本项、还是同一层的下一项 */
          let j = i;
          while(j < lines.length && !lines[j].trim()) j++;
          if(j >= lines.length){ endList = true; break; }
          const nx = lines[j].match(RE_ITEM);
          if(indentOf(lines[j]) > baseIndent){ item.push(""); i++; continue; }
          if(nx && nx[1].length === baseIndent && /\d/.test(nx[2].charAt(0)) === ordered){
            loose = true;          /* 项与项之间空行 → 松散列表 */
            i = j;
            break;
          }
          endList = true;
          break;
        }
        if(indentOf(L) > baseIndent){
          /* 去掉与标记等宽的缩进，更深的部分留给递归（嵌套列表靠它） */
          item.push(L.slice(Math.min(contentAt, indentOf(L))));
          i++;
          continue;
        }
        break;
      }
      items.push(item);
    }
    const tag = ordered ? "ol" : "ul";
    /* 松散列表项内保留 <p>，紧凑列表去掉首个段落的外壳，和浏览器默认排版一致 */
    if(items.some(it => it.indexOf("") >= 0)) loose = true;
    let out = "<" + tag + (ordered && startNo !== 1 ? ' start="' + startNo + '"' : "") + ">";
    items.forEach(item => {
      let check = "";
      const tm = item[0].match(RE_TASK);
      if(tm){ check = tm[1] === " " ? "☐" : "☑"; item[0] = tm[2]; }
      let inner = blocks(item);
      if(!loose) inner = inner.replace(/^<p>([\s\S]*?)<\/p>/, "$1");
      out += "<li" + (check ? ' class="mdTask"' : "") + ">"
           + (check ? '<span class="mdCheck">' + check + "</span>" : "") + inner + "</li>";
    });
    return { html: out + "</" + tag + ">", next: i };
  }

  function blocks(lines){
    let html = "", i = 0;
    while(i < lines.length){
      const line = lines[i];
      if(!line.trim()){ i++; continue; }

      /* 围栏代码块：内容原样保留，只转义 HTML */
      let m = line.match(RE_FENCE);
      if(m){
        const fence = m[1].charAt(0), len = m[1].length;
        const closeRe = new RegExp("^ {0,3}" + fence + "{" + len + ",}\\s*$");
        const buf = [];
        i++;
        while(i < lines.length && !closeRe.test(lines[i])){ buf.push(lines[i]); i++; }
        if(i < lines.length) i++;
        html += "<pre><code>" + escHtml(buf.join("\n")) + "</code></pre>";
        continue;
      }

      /* ATX 标题：结尾那串 # 是装饰，去掉 */
      m = line.match(RE_ATX);
      if(m){
        const lv = m[1].length;
        html += "<h" + lv + ">" + inline(m[2].replace(/\s+#+\s*$/, "").trim()) + "</h" + lv + ">";
        i++;
        continue;
      }

      /* 引用：连续 > 行（中间夹的 > 空行也算），内容递归解析；
         只有 > 没有内容的空引用不输出，免得留一条空色条 */
      if(RE_QUOTE.test(line)){
        const buf = [];
        while(i < lines.length){
          if(RE_QUOTE.test(lines[i])){ buf.push(lines[i].replace(RE_QUOTE, "")); i++; }
          else if(!lines[i].trim() && i + 1 < lines.length && RE_QUOTE.test(lines[i + 1])){ buf.push(""); i++; }
          else break;
        }
        const inner = blocks(buf);
        if(inner) html += "<blockquote>" + inner + "</blockquote>";
        continue;
      }

      /* 列表 */
      if(RE_ITEM.test(line)){
        const r = listBlock(lines, i);
        html += r.html;
        i = r.next;
        continue;
      }

      /* 表格 */
      if(isTableStart(line, lines[i + 1])){
        const headers = splitRow(line), seps = splitRow(lines[i + 1]);
        i += 2;
        let t = "<table><thead><tr>";
        headers.forEach((h, idx) => { t += "<th" + alignAttr(seps[idx]) + ">" + inline(h) + "</th>"; });
        t += "</tr></thead><tbody>";
        while(i < lines.length && lines[i].trim() && lines[i].indexOf("|") >= 0){
          const cells = splitRow(lines[i]);
          t += "<tr>";
          headers.forEach((h, idx) => {
            t += "<td" + alignAttr(seps[idx]) + ">" + inline(cells[idx] === undefined ? "" : cells[idx]) + "</td>";
          });
          t += "</tr>";
          i++;
        }
        html += t + "</tbody></table>";
        continue;
      }

      /* Setext 标题：本行是文字、下一行是 === 或 --- */
      if(i + 1 < lines.length && RE_SETEXT.test(lines[i + 1]) && !startsBlock(line, lines[i + 2])){
        const lv = lines[i + 1].trim().charAt(0) === "=" ? 1 : 2;
        html += "<h" + lv + ">" + inline(line.trim()) + "</h" + lv + ">";
        i += 2;
        continue;
      }

      /* 水平线 */
      if(RE_HR.test(line)){ html += "<hr>"; i++; continue; }

      /* 段落：连续普通行，行间保留换行 */
      const para = [];
      while(i < lines.length && lines[i].trim() && !startsBlock(lines[i], lines[i + 1])
            && !(i + 1 < lines.length && RE_SETEXT.test(lines[i + 1]))){
        para.push(lines[i]);
        i++;
      }
      if(!para.length){ para.push(line); i++; }
      html += "<p>" + para.map(inline).join("<br>") + "</p>";
    }
    return html;
  }

  const out = blocks(String(md).replace(/\r\n?/g, "\n").split("\n"));
  /* 最后统一还原占位符（链接地址、行内代码、转义字符） */
  return out.replace(/\x7f(\d+)\x7f/g, (m, n) => stash[n] === undefined ? "" : stash[n]);
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
      if(m.solo) return;                       /* 单人记录不参与胜负统计 */
      if(m.s1 > m.s2) wins[m.p1] = (wins[m.p1]||0)+1;
      else if(m.s2 > m.s1) wins[m.p2] = (wins[m.p2]||0)+1;
    });
    const winTop = Object.entries(wins).sort((a,b)=>b[1]-a[1])[0];
    const stTop = Object.entries(h.streaks||{}).sort((a,b)=>b[1]-a[1])[0];
    const soloCount = h.matches.filter(m=>m.solo).length;
    let html = '<div class="row">'
      + '<div class="stat">总场次 <b>' + h.matches.length + '</b></div>';
    if(winTop) html += '<div class="stat">胜场王 <b>' + esc(dispName(winTop[0])) + ' ' + winTop[1] + '胜</b></div>';
    if(stTop) html += '<div class="stat">连击纪录 <b>' + esc(dispName(stTop[0])) + ' x' + stTop[1] + '</b></div>';
    if(soloCount) html += '<div class="stat">单人作答 <b>' + soloCount + ' 场</b></div>';
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
      const hm = pad2(d.getHours()) + ":" + pad2(d.getMinutes());
      /* 限分模式的历史记录带一枚模式标签，旧记录没有该字段则不显示 */
      const modeTag = m.mode === "knockout" ? '<i class="tagMode">淘汰制 ' + (m.cap || 100) + '</i>'
                    : m.mode === "accumulate" ? '<i class="tagMode">累加制 ' + (m.cap || 100) + '</i>' : "";
      if(m.solo){
        /* 单人记录：只有名字、得分与题量 */
        list += '<div class="recentItem"><span>' + esc(dispName(m.p)) + ' <i class="tagSolo">单人</i>'
          + '</span><span class="mini">' + modeTag + m.unit + " · " + m.s + " 分 · " + hm + '</span></div>';
        return;
      }
      const res = m.s1===m.s2 ? "平局" : (m.s1>m.s2 ? esc(dispName(m.p1))+" 胜" : esc(dispName(m.p2))+" 胜");
      list += '<div class="recentItem"><span>' + esc(dispName(m.p1)) + ' ' + m.s1 + ' : ' + m.s2 + ' ' + esc(dispName(m.p2))
        + '</span><span class="mini">' + modeTag + m.unit + " · " + res + " · " + hm + '</span></div>';
    });
    html += '<div id="recentList">' + list + "</div>";
    body.innerHTML = html;
    clearBtn.classList.remove("hidden");
  }
  /* 未开启「错词优先复现」时不显示待复现错词（即使历史上有 wrongs 数据） */
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
    $("rosterInfo").textContent = "💡 还没有班级名单：可直接在下方输入两位选手名字体验一局，或点「✏️ 名单编辑器」新建班级后导入 TXT。";
    return;
  }
  const roster = rosters()[S.cls] || [];
  $("rosterInfo").textContent = roster.length
    ? "✅ 名单已载入：" + S.cls + " · 共 " + roster.length + " 人"
    : "⚠ 「" + S.cls + "」名单为空：可在「✏️ 名单编辑器」里导入 TXT 或逐个添加，也可直接输入名字（这局的战绩会记到本班）。";
}

/* ================== 抽人 ================== */
function resetDrawn(){ drawnPool = shuffle(rosters()[S.cls] || []); }
function takeName(exclude){
  if(!rosters()[S.cls] || !rosters()[S.cls].length) return "";
  if(!drawnPool.length) resetDrawn();
  /* 以 @ 开头的名字不计入随机抽取（仅手动输入/选择可用） */
  const isGhost = n => n.replace(/^\s+/, "").startsWith("@");
  let idx = drawnPool.findIndex(n => n !== exclude && !isGhost(n));
  if(idx < 0){ resetDrawn(); idx = drawnPool.findIndex(n => n !== exclude && !isGhost(n)); }
  if(idx < 0) return "";
  return drawnPool.splice(idx, 1)[0];
}
/* 手输名字解析：若名单中存在 @前缀 的对应名字（@张三 / @ 张三），则返回带@的原始名；
   否则返回用户输入本身。显示层统一用 dispName 去掉@，内部存储与抽人逻辑保留@标记。 */
function resolveGhostName(input){
  if(!input) return "";
  if(input.replace(/^\s+/, "").startsWith("@")) return input;
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
    grid.innerHTML = '<div class="pickEmpty">当前班级还没有名单，请在「✏️ 名单编辑器」里导入 TXT 或添加名字</div>';
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
        "确定删除自定义词库「" + ((LIB_INFO[tag] && LIB_INFO[tag].name) || tag) + "」吗？此操作不可恢复。",
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

/* 词库 tag 属于哪一册（b1~b7）；自定义词库返回空串 */
function bookOfTag(tag){
  const f = WORD_BANK_FILES.find(x => x.tag === tag);
  const m = f && /^(b[1-7])u/.exec(f.file);
  return m ? m[1] : "";
}

/* 内置词库的全部 tag */
function builtinTags(){
  return WORD_BANK_FILES.filter(x => x.file !== "custom").map(x => x.tag);
}
/* 批量选中 / 取消：一次改完再重绘，避免连点多次 */
function setLibUnits(tags, on){
  if(on) tags.forEach(t => { if(!tempUnits.includes(t)) tempUnits.push(t); });
  else tempUnits = tempUnits.filter(t => !tags.includes(t));
  renderLibChips();
}

function renderLibChips(){
  /* ===== 内置词库：按册分组，每册可折叠（默认收起，已选词库所在册展开） ===== */
  const groupsBox = $("builtinGroups");
  const panel = $("builtinPanel");
  const keepScroll = panel ? panel.scrollTop : 0;
  groupsBox.innerHTML = "";
  const builtin = WORD_BANK_FILES.filter(x => x.file !== "custom");
  BOOK_ORDER.forEach(bk => {
    const items = builtin.filter(x => x.file.startsWith(bk));
    if(!items.length) return;
    const group = document.createElement("div");
    group.className = "libGroup" + (libOpenBooks.has(bk) ? "" : " collapsed");
    group.dataset.book = bk;

    const tags = items.map(x => x.tag);
    const picked = items.filter(x => tempUnits.includes(x.tag)).length;

    /* 标题条：左侧是可点击的折叠开关，右侧是本册的全选 / 清空 */
    const head = document.createElement("div");
    head.className = "libGroupHead";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "libGroupTitle";
    toggle.innerHTML = '<span class="libGTName">' + BOOK_NAMES[bk] + '</span>'
      + '<span class="libGTMeta">' + (picked ? "已选 " + picked + " 个" : "共 " + items.length + " 个单元") + '</span>'
      + '<span class="libGTArrow" aria-hidden="true"></span>';
    toggle.addEventListener("click", ()=>{
      const collapsed = group.classList.toggle("collapsed");
      if(collapsed) libOpenBooks.delete(bk);
      else{
        libOpenBooks.add(bk);
        /* 展开靠下的册时，把它带进可视区，免得只看到半截内容 */
        group.scrollIntoView({block:"nearest", behavior:"smooth"});
      }
    });
    head.appendChild(toggle);

    const acts = document.createElement("span");
    acts.className = "libGTActs";
    const mkAct = (label, fn) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "libAct";
      btn.textContent = label;
      btn.addEventListener("click", fn);
      return btn;
    };
    acts.appendChild(mkAct("全选", ()=>{
      libOpenBooks.add(bk);          /* 选完顺手展开，让用户看到结果 */
      setLibUnits(tags, true);
      const g = groupsBox.querySelector('.libGroup[data-book="' + bk + '"]');
      if(g) g.scrollIntoView({block:"nearest", behavior:"smooth"});
    }));
    acts.appendChild(mkAct("清空", ()=> setLibUnits(tags, false)));
    head.appendChild(acts);
    group.appendChild(head);

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
  if(panel) panel.scrollTop = keepScroll;
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
  S.wordsOnly = true;      /* 新用户默认只出单词题，词块需自行开启 */
  S.rememberWrong = false;
  S.questionTimeout = true;
  S.questionTimeoutDur = 5;
  S.comboBonus = true;
  S.wrongPenalty = false;
  S.scoreMode = "open";
  S.scoreCap = 100;
  try{
    const c = JSON.parse(localStorage.getItem("vpk_cfg_" + S.cls));
    if(c){
      if(Array.isArray(c.units) && c.units.length) S.units = c.units.filter(t => LIB_INFO[t]);
      if(c.dur) S.dur = c.dur;
      if(c.wordsOnly !== undefined) S.wordsOnly = !!c.wordsOnly;
      if(c.rememberWrong !== undefined) S.rememberWrong = !!c.rememberWrong;
      if(c.questionTimeout !== undefined) S.questionTimeout = !!c.questionTimeout;
      if(c.questionTimeoutDur) S.questionTimeoutDur = c.questionTimeoutDur;
      if(c.comboBonus !== undefined) S.comboBonus = !!c.comboBonus;
      if(c.wrongPenalty !== undefined) S.wrongPenalty = !!c.wrongPenalty;
      /* 计分模式与满分只接受白名单值，避免旧数据或手改配置把界面带崩 */
      if(["open","knockout","accumulate"].includes(c.scoreMode)) S.scoreMode = c.scoreMode;
      if([50,100,150].includes(c.scoreCap)) S.scoreCap = c.scoreCap;
    }
  }catch(e){}
  /* 首次使用不默认勾选任何词库，由用户手动选择；
     含词块的词库会自动启用词块题型，勾选「只加载纯单词」时强制关闭 */
  syncUseChunks();
  $("wordsOnlyChk").checked = S.wordsOnly;
  $("rememberWrongChk").checked = S.rememberWrong;
  $("questionTimeoutChk").checked = S.questionTimeout;
  $("comboBonusChk").checked = S.comboBonus;
  $("wrongPenaltyChk").checked = S.wrongPenalty;
  renderQuestionTimeoutUI();
  renderScoreModeUI();
  renderSettingStatus();
  /* 临时赛 / 单人作答 / 渲染动画：沿用上次退出前的勾选，改动即落盘（不分班级） */
  const ui = loadUI();
  S.noRecord = !!ui.noRecord;
  $("noRecordChk").checked = S.noRecord;
  S.solo = !!ui.solo;
  $("soloChk").checked = S.solo;
  S.anim = ui.anim !== false;
  applyAnimUI();
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
/* 计分模式说明：无限制沿用连击算法，另两种的加减分是定死的 */
function scoreModeHintText(){
  if(S.scoreMode === "knockout")
    return "开局满分，答对 +5、答错 -10；先归零者输，时间到分少者输。";
  if(S.scoreMode === "accumulate")
    return "0 分起，答对 +5、答错 -10；先到满分者赢，时间到分多者赢。";
  return "答对 +10，连击最高 +30；答错是否扣分见下方开关。";
}
/* 计分模式 UI：三选一按钮、满分档位、连击 / 扣分开关的可用性 */
function renderScoreModeUI(){
  const row = $("scoreModeRow");
  if(!row) return;
  row.querySelectorAll(".scoreModeOpt").forEach(b=>{
    b.classList.toggle("active", b.dataset.mode === S.scoreMode);
  });
  const limited = S.scoreMode !== "open";
  const capRow = $("capRow");
  if(capRow){
    capRow.classList.toggle("hidden", !limited);
    capRow.querySelectorAll(".capOpt").forEach(b=>{
      b.classList.toggle("active", parseInt(b.dataset.cap) === S.scoreCap);
    });
  }
  const hint = $("scoreModeHint");
  if(hint) hint.textContent = scoreModeHintText();
  /* 限分模式的加减分是定死的：连击加分 / 答错扣分整项隐藏，避免误以为可调 */
  ["comboBonusChk", "wrongPenaltyChk"].forEach(id=>{
    const el = $(id);
    if(!el) return;
    const box = el.closest(".setItem");
    if(box) box.classList.toggle("hidden", limited);
  });
}
/* 主页「当前擂台设置」状态行：错词复现 / 是否只加载纯单词 / 单题超时 */
function renderSettingStatus(){
  const box = $("setStatusLine");
  if(!box) return;
  const parts = [];
  if(S.scoreMode === "open"){
    parts.push(S.comboBonus ? "连击加分" : "连击不加分",
               S.wrongPenalty ? "答错扣分" : "答错不扣分");
  }else{
    parts.push(S.scoreMode === "knockout" ? "淘汰制 " + S.scoreCap + " 分" : "累加制 " + S.scoreCap + " 分",
               "答对 +5 / 答错 -10");
  }
  parts.push(
    S.rememberWrong ? "错词优先复现" : "错词不复现",
    S.wordsOnly ? "只加载纯单词" : "加载完整词库",
    S.questionTimeout ? "单题超时：" + S.questionTimeoutDur + "s" : "单题不限时"
  );
  box.innerHTML = parts.map(t => '<span>' + esc(t) + '</span>')
                       .join('<span class="setSep">|</span>');
}
/* 题池提示：随选词库与时长实时更新 */
/* 题池提示：时长 · 词库数 · 词条量（只做概览，不再推算本局题数） */
function planInfo(){
  const mins = (S.dur/60).toFixed(1).replace(/\.0$/, "");
  const rg = poolRange();
  /* 计分模式已在绿色状态行显示，这里只讲时长与词库，避免重复 */
  let s = mins + "分钟 | " + (S.units.length ? S.units.length + "个词库" : "未选择词库");
  if(rg.words) s += " | " + rg.words + "个单词";
  if(rg.chunks) s += " & " + rg.chunks + "个词块";
  $("planInfo").textContent = s;
}
/* 没有指定班级时，自动选 LocalStorage 里第一个班级 */
function autoSelectClass(){
  if(S.cls && rosters()[S.cls]) return;
  /* 优先回到上次退出前选中的班级，其次才退到第一个班级 */
  const last = loadUI().cls;
  if(last && rosters()[last]){ S.cls = last; return; }
  S.cls = Object.keys(rosters())[0] || "";
  saveUI({cls:S.cls});
}
