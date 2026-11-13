/* ================== 错词记录本 ==================
   按班级分开累计的错词台账：每场正常对局（单人 / 双人，不含临时赛与加时赛）结束后，
   把本局答错的单词与词块累加进当前班级（vpk_wrongbook_<班级>）。
   收录与擂台设置的「错词优先复现」开关无关——那个开关只管下一局插不插错词；
   想连错词本也不留痕，只能勾选主页的「本次PK不计入战绩」（临时赛）。
   与「待复现错词」（h.wrongs，按班级存、答对即出本）是两套数据。
   入口：主页「📕 错词记录」；支持按单元 / 按册 / 全部导出 HTML，供老师分析。 */

/* 转义：导出页面与 DOM 里都可能出现用户自定义词库的内容，引号一并处理 */
const wbEsc = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/* 把本局错词并入当前班级的台账：同单元同词条累计次数 */
function recordWrongBook(){
  if(!S.cls) return;                 /* 错词记录按班级分开，没有班级不落库 */
  const d = loadWrongBook(S.cls);
  const now = Date.now();
  let changed = false;
  S.wrongSet.forEach(raw=>{
    const p = String(raw).split("|");
    const en = (p[0] || "").trim();
    const cn = p[1] || "";
    const kind = p[2] === "w" ? "w" : "c";
    /* 第 4 段是题目所属单元；老格式没有时按词条反查 */
    let tag = p[3] || "";
    if(!tag){
      const ci = chunkIdxByEn[en];
      tag = ci !== undefined ? CHUNKS[ci][6] : (wordByEn[en] ? wordByEn[en][2] : "");
    }
    if(!en || !tag) return;
    const bucket = d[tag] || (d[tag] = {});
    const key = en + "|" + kind;
    const cur = bucket[key];
    if(cur){
      cur.n++;
      if(cn) cur.cn = cn;
      cur.last = now;
    }else{
      bucket[key] = { en, cn, kind, n:1, last:now };
    }
    changed = true;
  });
  if(changed) saveWrongBook(S.cls, d);
}

/* 单元显示名：优先「必修1 U1 · Teenage Life」，自定义词库直接用品名，
   词库已被删除时退回 tag */
function wbUnitName(tag){
  const info = LIB_INFO[tag];
  if(!info) return tag;
  if(!info.label) return info.name || tag;      /* 自定义词库没有「必修1 U1」这种编号 */
  return info.name ? info.label + "　" + info.name : info.label;
}

/* 汇总：按册 → 单元分组，组内按错误次数降序（次数相同按字母序） */
function wrongBookGroups(cls){
  const d = loadWrongBook(cls);
  const orderOf = tag => {
    const i = WORD_BANK_FILES.findIndex(x => x.tag === tag);
    return i < 0 ? 9999 : i;
  };
  const tags = Object.keys(d).sort((a,b)=>orderOf(a) - orderOf(b));
  const books = [], byBook = {};
  tags.forEach(tag=>{
    const items = Object.values(d[tag])
      .sort((a,b)=> b.n - a.n || a.en.localeCompare(b.en));
    if(!items.length) return;
    const sum = items.reduce((s,x)=>s + x.n, 0);
    const bk = bookOfTag(tag) || "custom";
    let book = byBook[bk];
    if(!book){
      book = byBook[bk] = { key:bk, name: BOOK_NAMES[bk] || "自定义词库", units:[], count:0, sum:0 };
      books.push(book);
    }
    book.units.push({ tag, name: wbUnitName(tag), items, count: items.length, sum });
    book.count += items.length;
    book.sum += sum;
  });
  /* 内置册按教材顺序，自定义词库排最后 */
  books.sort((a,b)=>{
    const ca = a.key === "custom" ? 1 : 0, cb = b.key === "custom" ? 1 : 0;
    if(ca !== cb) return ca - cb;
    return BOOK_ORDER.indexOf(a.key) - BOOK_ORDER.indexOf(b.key);
  });
  return books;
}

function wbTotals(books){
  return books.reduce((t,b)=>{
    t.count += b.count; t.sum += b.sum; t.units += b.units.length;
    return t;
  }, {count:0, sum:0, units:0});
}

function wbDay(ts){
  if(!ts) return "";
  const d = new Date(ts);
  return d.getFullYear() + "-" + pad2(d.getMonth()+1) + "-" + pad2(d.getDate());
}

/* ================== 弹窗渲染 ================== */
let wbCollapsed = new Set();     /* 收起的册（默认全展开，数据多时可折叠） */

function renderWrongBook(){
  const body = $("wbBody"), sum = $("wbSummary");
  const books = wrongBookGroups();
  const t = wbTotals(books);
  const hasData = t.count > 0;
  $("wbExportAll").disabled = !hasData;
  $("wbClear").disabled = !hasData;

  if(!S.cls){
    sum.textContent = "";
    body.innerHTML = '<div class="wbEmpty">错词记录按班级分开保存，现在还没有选中班级。<br>'
      + '<span class="mini">先在上方选择或新建一个班级，再开始比赛即可自动收录。</span></div>';
    return;
  }

  if(!hasData){
    sum.textContent = "";
    body.innerHTML = '<div class="wbEmpty">「' + wbEsc(S.cls) + '」还没有错词记录。<br>'
      + '打完一局单人 / 双人 PK 后，本局答错的单词与词块会自动收录到这里。<br>'
      + '<span class="mini">「不计入战绩」的临时赛与错词加时赛不计入。</span></div>';
    return;
  }

  sum.innerHTML = '<span class="wbCls">' + wbEsc(S.cls) + '</span>共 <b>' + t.count + '</b> 个错词 · 累计出错 <b>' + t.sum
    + '</b> 次 · 覆盖 <b>' + t.units + '</b> 个单元';

  body.innerHTML = books.map(book=>{
    const collapsed = wbCollapsed.has(book.key);
    const units = book.units.map(u=>{
      const chips = u.items.map(x=>
        '<span class="wbWord' + (x.kind === "w" ? "" : " wbWordChunk") + '">'
        + '<b>' + wbEsc(x.en) + '</b>'
        + (x.cn ? '<i>' + wbEsc(x.cn) + '</i>' : "")
        + '<em>×' + x.n + '</em></span>').join("");
      return '<div class="wbUnit">'
        + '<div class="wbUnitHead">'
        + '<span class="wbUnitName">' + wbEsc(u.name) + '</span>'
        + '<span class="wbUnitMeta">' + u.count + ' 个 · ' + u.sum + ' 次</span>'
        + '<button class="wbAct" data-wb-export="unit" data-tag="' + wbEsc(u.tag) + '">导出本单元</button>'
        + "</div>"
        + '<div class="wbWords">' + chips + "</div>"
        + "</div>";
    }).join("");
    return '<div class="wbBook' + (collapsed ? " collapsed" : "") + '" data-book="' + wbEsc(book.key) + '">'
      + '<div class="wbBookHead">'
      + '<button class="wbBookToggle" data-wb-book="' + wbEsc(book.key) + '">'
      + '<span class="wbBookName">' + wbEsc(book.name) + '</span>'
      + '<span class="wbBookMeta">' + book.count + ' 个错词 · ' + book.sum + ' 次</span>'
      + '<span class="libGTArrow" aria-hidden="true"></span>'
      + "</button>"
      + '<button class="wbAct" data-wb-export="book" data-book="' + wbEsc(book.key) + '">导出本册</button>'
      + "</div>"
      + '<div class="wbUnits">' + units + "</div>"
      + "</div>";
  }).join("");
}

/* ================== 导出 HTML ==================
   老师拿到后可直接双击打开、打印或发给学生；样式内联，不依赖 style.css。 */
const WB_HTML_CSS = [
":root{--red:#e05555;--red-d:#c0392b;--red-bg:#fdecea;--blue:#4a7fe0;--blue-d:#2c5cb8;",
"      --ink:#1f242e;--ink2:#3a4150;--muted:#79808f;--line:#e3e8f1;}",
"*{box-sizing:border-box;}",
"body{margin:0;padding:34px 5vw 48px;font-family:'PingFang SC','Microsoft YaHei','Noto Sans SC','Noto Sans CJK SC','MiSans','HarmonyOS Sans SC','HarmonyOS Sans',sans-serif;",
"     font-size:17px;line-height:1.55;color:var(--ink);background:#f4f6fb;}",
".sheet{max-width:1040px;margin:0 auto;}",
"h1{font-size:32px;margin:0 0 6px;}",
".meta{font-size:15px;color:var(--muted);margin-bottom:6px;}",
".meta b{color:var(--blue-d);}",
".sum{display:flex;gap:26px;flex-wrap:wrap;background:#fff;border:1px solid var(--line);",
"     border-radius:14px;padding:14px 20px;margin:18px 0 24px;box-shadow:0 2px 10px rgba(28,39,72,.05);}",
".sum div{display:flex;flex-direction:column;}",
".sum span{font-size:13px;color:var(--muted);letter-spacing:1px;}",
".sum b{font-size:26px;font-weight:800;color:var(--ink);font-variant-numeric:tabular-nums;}",
".unit{margin-bottom:26px;}",
".unit h2{font-size:20px;margin:0 0 10px;padding:8px 14px;border-left:5px solid var(--blue);",
"         border-radius:0 8px 8px 0;background:linear-gradient(90deg,#e8f0fe,transparent);}",
".unit h2 small{font-size:14px;font-weight:600;color:var(--muted);margin-left:10px;}",
"table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;}",
"th,td{padding:9px 12px;text-align:left;border-bottom:1px solid var(--line);font-size:16px;}",
"th{background:#eef2f9;color:var(--ink2);font-size:14px;letter-spacing:1px;white-space:nowrap;}",
"tr:last-child td{border-bottom:none;}",
"td.n{width:44px;color:var(--muted);font-variant-numeric:tabular-nums;}",
"td.en{font-weight:700;}",
"td.times{width:88px;color:var(--red-d);font-weight:800;font-variant-numeric:tabular-nums;}",
"td.kind{width:74px;color:var(--muted);}",
".chip{display:inline-block;font-size:13px;color:var(--blue-d);background:#e8f0fe;",
"      border-radius:8px;padding:1px 8px;}",
".foot{margin-top:30px;font-size:13px;color:var(--muted);text-align:center;letter-spacing:1px;}",
".empty{padding:40px;text-align:center;color:var(--muted);background:#fff;border-radius:14px;}",
"@media (max-width:760px){",
"  body{font-size:15px;padding:20px 14px 32px;}",
"  h1{font-size:24px;} .sum b{font-size:22px;}",
"  th,td{padding:7px 8px;font-size:14px;}",
"  td.kind,th.kind{display:none;}",
"}",
"@media print{",
"  body{background:#fff;padding:0;}",
"  .sum,table{box-shadow:none;}",
"  .unit{break-inside:avoid;}",
"}"
].join("\n");

/* 按范围取数据：全部 / 某一册 / 某一个单元 */
function wbScopeBooks(scope){
  const books = wrongBookGroups();
  if(scope.type === "all") return books;
  if(scope.type === "book") return books.filter(b => b.key === scope.book);
  return books.map(b => Object.assign({}, b, {
    units: b.units.filter(u => u.tag === scope.tag)
  })).filter(b => b.units.length);
}

function wbScopeTitle(scope, books){
  if(scope.type === "all") return "全部错词";
  if(scope.type === "book") return books[0] ? books[0].name : "本册错词";
  const u = books[0] && books[0].units[0];
  return u ? u.name : "本单元错词";
}

function wbBuildHtml(scope){
  const books = wbScopeBooks(scope);
  const t = wbTotals(books);
  const st = resultStamp();
  const title = wbScopeTitle(scope, books);
  const cls = S.cls || "未选班级";
  const sections = books.map(book=>{
    return book.units.map(u=>{
      const rows = u.items.map((x,i)=>{
        return "<tr>"
          + '<td class="n">' + (i+1) + "</td>"
          + '<td class="en">' + wbEsc(x.en) + "</td>"
          + "<td>" + wbEsc(x.cn || "—") + "</td>"
          + '<td class="kind">' + (x.kind === "w" ? "单词" : '<span class="chip">词块</span>') + "</td>"
          + '<td class="times">×' + x.n + "</td>"
          + "<td>" + wbDay(x.last) + "</td>"
          + "</tr>";
      }).join("");
      return '<section class="unit">'
        + "<h2>" + wbEsc(u.name)
        + "<small>本单元 " + u.count + " 个错词 · 共 " + u.sum + " 次</small></h2>"
        + "<table><thead><tr><th>#</th><th>词条</th><th>释义</th><th>类型</th>"
        + "<th>错误次数</th><th>最近出错</th></tr></thead>"
        + "<tbody>" + rows + "</tbody></table>"
        + "</section>";
    }).join("");
  }).join("");

  return [
    "<!DOCTYPE html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>错词记录 · " + wbEsc(title) + "</title>",
    "<style>",
    WB_HTML_CSS,
    "</style>",
    "</head>",
    "<body>",
    '<div class="sheet">',
    "<h1>📕 错词记录</h1>",
    '<div class="meta">班级：<b>' + wbEsc(cls) + "</b>　·　范围：<b>" + wbEsc(title)
      + "</b>　·　导出时间：" + st.day + " " + st.hm + "</div>",
    '<div class="sum">',
    "<div><span>错词数</span><b>" + t.count + "</b></div>",
    "<div><span>累计出错</span><b>" + t.sum + "</b></div>",
    "<div><span>涉及单元</span><b>" + t.units + "</b></div>",
    "</div>",
    sections || '<div class="empty">该范围内还没有错词记录。</div>',
    '<div class="foot">词汇擂台 PK · 错词记录　·　' + wbEsc(cls) + "　·　" + st.day + "</div>",
    "</div>",
    "</body>",
    "</html>"
  ].join("\n");
}

function wbFileName(scope, books){
  const st = resultStamp();
  const cls = (S.cls || "未选班级").replace(/[\\/:*?"<>|\s　]/g, "");
  let name = "错词记录_" + cls + "_";
  if(scope.type === "book") name += (books[0] ? books[0].name : "本册");
  else if(scope.type === "unit"){
    const u = books[0] && books[0].units[0];
    const info = u && LIB_INFO[u.tag];
    name += info && info.label ? info.label : (u ? u.tag : "本单元");
  }else name += "全部";
  name = name.replace(/[\\/:*?"<>|\s　]/g, "");
  return name + "_" + st.file + ".html";
}

function downloadHtmlFile(html, name){
  const blob = new Blob([html], {type:"text/html;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 15000);
}

/* 导出：scope = {type:"all"} / {type:"book", book:"b1"} / {type:"unit", tag:"B1U1"} */
function wbExport(scope){
  const books = wbScopeBooks(scope);
  const t = wbTotals(books);
  if(!t.count){
    dlgAlert("这个范围内还没有错词记录。", { type:"warning", title:"暂无数据" });
    return;
  }
  const name = wbFileName(scope, books);
  try{
    downloadHtmlFile(wbBuildHtml(scope), name);
    dlgAlert("已保存「" + wbEsc(name) + "」<br>双击就能用浏览器打开，也可以直接打印或发给学生。",
      { type:"success", title:"已导出", html:true });
  }catch(e){
    dlgAlert("导出失败：" + wbEsc(e.message), { type:"error", title:"导出失败" });
  }
}

/* 清空台账：二次确认，清完立即重绘 */
async function wbClearAll(){
  const books = wrongBookGroups();
  const t = wbTotals(books);
  if(!t.count) return;
  const ok = await dlgConfirm(
    "确定清空「<b>" + wbEsc(S.cls) + "</b>」的全部错词记录吗？<br>将删除 <b>" + t.count
    + "</b> 个错词、共 " + t.sum + " 次出错记录，其他班级不受影响，且无法恢复。"
    + "<br><span class='mini'>建议先导出 HTML 留存。</span>",
    { type:"warning", title:"清空错词记录", okText:"清空", cancelText:"取消", html:true }
  );
  if(!ok) return;
  clearWrongBook();
  wbCollapsed = new Set();
  renderWrongBook();
  dlgAlert("错词记录已清空。", { type:"success", title:"已清空" });
}
