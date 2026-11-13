/* ================== 本地数据管理 ==================
   把散落在 localStorage 里的 vpk_* 键收成一份 JSON 备份，支持导出、导入（合并 / 覆盖），
   以及按班级、按类别单独清理。全程只在本机读写，不联网、不上传。

   ── 涉及的存储键（与 storage.js 保持一致）──
     vpk_rosters           班级名单 { 班级: [名字…] }
     vpk_his_<班级>        战绩 { matches, wrongs, streaks }
     vpk_champ_<班级>      擂主名字（纯字符串）
     vpk_wrongbook_<班级>  错词记录 { 单元tag: { 词条key: {en,cn,kind,n,last} } }
     vpk_cfg_<班级>        该班选的词库 / 时长 / 擂台设置
     vpk_ui                个性化设置 + 上次选中的班级
     vpk_custom_libs       自定义词库 { C1: {name,words,chunks} }
   vpk_update_read（已读版本号）不进备份，导入时也不会被覆盖。 */

/* 可勾选的六个部分。history 导出时连带 vpk_champ_（擂主），因为两者是一局比赛的产物 */
const DATA_PARTS = [
  { id:"rosters",   name:"班级名单" },
  { id:"history",   name:"战绩与擂主" },
  { id:"wrongbook", name:"错词记录" },
  { id:"cfg",       name:"词库与规则" },
  { id:"ui",        name:"个性化设置" },
  { id:"custom",    name:"自定义词库" }
];
const DATA_CLS_PREFIX = ["vpk_his_", "vpk_champ_", "vpk_wrongbook_", "vpk_cfg_"];

let dataPending = null;      /* 刚读取、还没决定合并还是覆盖的备份 */

/* ================== 小工具 ================== */
/* 属性 / HTML 文本转义（esc 只处理 &<，这里要放进属性与整段 HTML，多转义 >"） */
const dEsc = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* 前缀匹配的键名（返回去掉前缀的部分，例如班级名） */
function dataKeys(prefix){
  const out = [];
  try{
    for(let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if(k && k.indexOf(prefix) === 0) out.push(k.slice(prefix.length));
    }
  }catch(e){}
  return out;
}
/* 读 JSON，坏数据退化成默认值 */
function dataGet(key, def){
  try{
    const raw = localStorage.getItem(key);
    if(raw == null) return def;
    const v = JSON.parse(raw);
    return v == null ? def : v;
  }catch(e){ return def; }
}
/* 写 localStorage：对象自动序列化，字符串按原样存（擂主就是纯字符串）。
   返回 false 表示写失败（多半是空间不够），调用方需要提示用户。 */
function dataWrite(key, val){
  try{
    localStorage.setItem(key, typeof val === "string" ? val : JSON.stringify(val));
    return true;
  }catch(e){ return false; }
}
/* 占用体积（UTF-8 字节）：只统计本应用的 vpk_ 键 */
function dataStoreBytes(){
  let n = 0;
  try{
    for(let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if(!k || k.indexOf("vpk_") !== 0) continue;
      const v = localStorage.getItem(k) || "";
      n += dataBytes(k) + dataBytes(v);
    }
  }catch(e){}
  return n;
}
function dataBytes(str){
  try{ return new Blob([str]).size; }catch(e){ return str.length * 2; }
}
function dataSize(n){
  if(n < 1024) return n + " B";
  if(n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB";
  return (n / 1024 / 1024).toFixed(1) + " MB";
}
function dataStamp(){
  const d = new Date();
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate())
    + "_" + pad2(d.getHours()) + pad2(d.getMinutes());
}
function dataTimeText(iso){
  const d = new Date(iso);
  if(isNaN(d.getTime())) return "未知";
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate())
    + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
}
/* 文件名里不能出现的字符换成下划线 */
function dataSafeName(s){
  return String(s || "").replace(/[\\/:*?"<>|\s　]+/g, "_").replace(/^_+|_+$/g, "") || "数据";
}

/* ================== 盘点 ================== */
/* 所有「有数据」的班级：名单里有，或任一按班存储的键存在 */
function dataAllClasses(){
  const set = new Set(Object.keys(loadRosters()));
  DATA_CLS_PREFIX.forEach(p => dataKeys(p).forEach(c => { if(c) set.add(c); }));
  return [...set].sort((a, b) => a.localeCompare(b, "zh"));
}
function dataWrongCount(wb){
  let n = 0;
  for(const tag in wb) n += Object.keys(wb[tag] || {}).length;
  return n;
}
function dataInventory(){
  const rosters = loadRosters();
  const classes = dataAllClasses();
  const per = {};
  let names = 0, matches = 0, wrongs = 0;
  classes.forEach(c => {
    const h = loadHis(c), wb = loadWrongBook(c);
    const item = { names:(rosters[c] || []).length, matches:h.matches.length,
                   wrongs:dataWrongCount(wb), champ:loadChamp(c) };
    per[c] = item;
    names += item.names; matches += item.matches; wrongs += item.wrongs;
  });
  const custom = dataGet(CUSTOM_LIB_KEY, {});
  let libs = 0, libWords = 0;
  for(const tag in custom){
    libs++;
    libWords += Array.isArray(custom[tag] && custom[tag].words) ? custom[tag].words.length : 0;
  }
  return { classes, per, names, matches, wrongs, libs, libWords,
           bytes:dataStoreBytes(), ui:loadUI() };
}

/* ================== 导出 ================== */
/* 按选中的部分收集数据；onlyCls 有值时只收这一个班（用于单个班级单独导出） */
function dataSnapshot(parts, onlyCls){
  const want = new Set(parts);
  const rosters = loadRosters();
  const classes = onlyCls ? [onlyCls] : dataAllClasses();
  const out = {};

  if(want.has("rosters")){
    const o = {};
    classes.forEach(c => { if(Array.isArray(rosters[c]) && rosters[c].length) o[c] = rosters[c].slice(); });
    out.rosters = o;
  }
  if(want.has("history")){
    const h = {}, ch = {};
    classes.forEach(c => {
      h[c] = loadHis(c);
      const champ = loadChamp(c);
      if(champ) ch[c] = champ;
    });
    out.history = h;
    out.champ = ch;
  }
  if(want.has("wrongbook")){
    const o = {};
    classes.forEach(c => { o[c] = loadWrongBook(c); });
    out.wrongbook = o;
  }
  if(want.has("cfg")){
    const o = {};
    classes.forEach(c => { const v = dataGet("vpk_cfg_" + c, null); if(v) o[c] = v; });
    out.cfg = o;
  }
  if(want.has("ui")) out.ui = loadUI();
  if(want.has("custom")) out.custom = dataGet(CUSTOM_LIB_KEY, {});

  return {
    app: "vpk",
    kind: onlyCls ? "class" : "backup",
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    cls: onlyCls || "",
    partIds: [...want],
    parts: out
  };
}
function dataDownload(bk, fileName){
  const txt = JSON.stringify(bk, null, 1);
  const blob = new Blob([txt], { type:"application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

/* ================== 导入 ================== */
/* 校验文件外形：认准 app === "vpk"，其它 JSON 一律拒绝，避免把词库文件当备份吃进去 */
function dataParse(text){
  let d;
  try{ d = JSON.parse(text); }catch(e){ throw new Error("文件不是有效的 JSON，可能选错了文件。"); }
  if(!d || typeof d !== "object" || Array.isArray(d)) throw new Error("文件内容不是备份格式。");
  if(d.app !== "vpk" || !d.parts || typeof d.parts !== "object" || Array.isArray(d.parts))
    throw new Error("这不是「词汇擂台」导出的备份文件。");
  return d;
}
/* 备份摘要：给用户确认「这份文件里到底有什么」 */
function dataSummaryOf(bk){
  const p = bk.parts || {};
  const clsSet = new Set();
  Object.keys(p.rosters || {}).forEach(c => clsSet.add(c));
  Object.keys(p.history || {}).forEach(c => clsSet.add(c));
  Object.keys(p.wrongbook || {}).forEach(c => clsSet.add(c));
  Object.keys(p.cfg || {}).forEach(c => clsSet.add(c));
  let names = 0, matches = 0, wrongs = 0, libs = 0;
  for(const c in (p.rosters || {})) names += (p.rosters[c] || []).length;
  for(const c in (p.history || {})) matches += ((p.history[c] || {}).matches || []).length;
  for(const c in (p.wrongbook || {})) wrongs += dataWrongCount(p.wrongbook[c] || {});
  for(const tag in (p.custom || {})) libs++;
  const list = [];
  if(clsSet.size) list.push("班级 " + clsSet.size + " 个（名单 " + names + " 人）");
  if(matches) list.push("战绩 " + matches + " 场");
  if(wrongs) list.push("错词 " + wrongs + " 条");
  if(Object.keys(p.cfg || {}).length) list.push("班级配置 " + Object.keys(p.cfg).length + " 份");
  if(p.ui) list.push("个性化设置");
  if(libs) list.push("自定义词库 " + libs + " 个");
  return { text: list.join(" · ") || "（文件里没有可导入的内容）", classes: [...clsSet], names, matches, wrongs, libs };
}

/* 合并：本机已有的留着，只补缺的部分 */
function dataMerge(bk){
  const p = bk.parts || {};
  let fail = 0;
  const stat = { rosters:0, matches:0, wrongs:0, cfg:0, libs:0 };

  if(p.rosters){
    const rs = loadRosters();
    for(const c in p.rosters){
      if(!c) continue;
      const add = (p.rosters[c] || []).filter(n => typeof n === "string" && n.trim());
      const cur = Array.isArray(rs[c]) ? rs[c] : [];
      const seen = new Set(cur);
      let added = 0;
      add.forEach(n => { if(!seen.has(n)){ seen.add(n); cur.push(n); added++; } });
      rs[c] = cur;
      stat.rosters += added;
    }
    if(!dataWrite(ROSTER_KEY, rs)) fail++;
  }

  if(p.history){
    for(const c in p.history){
      if(!c) continue;
      const inc = p.history[c] || {};
      const cur = loadHis(c);
      const seen = new Set(cur.matches.map(dataMatchKey));
      (inc.matches || []).forEach(m => {
        const k = dataMatchKey(m);
        if(seen.has(k)) return;
        seen.add(k);
        cur.matches.push(m);
        stat.matches++;
      });
      cur.matches.sort((a, b) => (a.t || 0) - (b.t || 0));
      for(const k in (inc.wrongs || {})){
        cur.wrongs[k] = Math.max(cur.wrongs[k] || 0, parseInt(inc.wrongs[k], 10) || 0);
      }
      for(const k in (inc.streaks || {})){
        cur.streaks[k] = Math.max(cur.streaks[k] || 0, parseInt(inc.streaks[k], 10) || 0);
      }
      if(!dataWrite(hisKey(c), cur)) fail++;
    }
    /* 擂主：本机没有才补，避免把当前擂主冲掉 */
    for(const c in (p.champ || {})){
      if(c && !loadChamp(c) && p.champ[c]) if(!dataWrite(champKey(c), String(p.champ[c]))) fail++;
    }
  }

  if(p.wrongbook){
    for(const c in p.wrongbook){
      if(!c) continue;
      const cur = loadWrongBook(c);
      const inc = p.wrongbook[c] || {};
      for(const tag in inc){
        const bucket = cur[tag] || (cur[tag] = {});
        for(const key in inc[tag]){
          const e = inc[tag][key];
          if(!e || !e.en) continue;
          const n = Math.max(1, Math.min(99999, parseInt(e.n, 10) || 1));
          const last = Math.max(0, parseInt(e.last, 10) || 0);
          const old = bucket[key];
          if(old){
            /* 次数取两边较大的：同一份备份导两次也不会翻倍 */
            old.n = Math.max(old.n, n);
            old.last = Math.max(old.last, last);
          }else{
            bucket[key] = { en:String(e.en), cn:String(e.cn || ""), kind:e.kind === "w" ? "w" : "c", n, last };
            stat.wrongs++;
          }
        }
      }
      if(!dataWrite(wrongbookKey(c), cur)) fail++;
    }
  }

  if(p.cfg){
    /* 配置只补本机没有的班，已有的保留本机设置 */
    for(const c in p.cfg){
      if(!c || localStorage.getItem("vpk_cfg_" + c)) continue;
      if(dataWrite("vpk_cfg_" + c, p.cfg[c])) stat.cfg++;
      else fail++;
    }
  }

  if(p.ui){
    const cur = loadUI();
    let changed = false;
    for(const k in p.ui){
      if(!(k in cur)){ cur[k] = p.ui[k]; changed = true; }
    }
    if(changed && !dataWrite(UI_KEY, cur)) fail++;
  }

  if(p.custom){
    const cur = dataGet(CUSTOM_LIB_KEY, {});
    for(const tag in p.custom){
      const lib = p.custom[tag];
      if(!lib || !Array.isArray(lib.words)) continue;
      if(cur[tag]){
        /* 同一个 tag 且内容一致 → 跳过；不同则换个新 tag 并存，别覆盖用户的词库 */
        if(JSON.stringify(cur[tag]) === JSON.stringify(lib)) continue;
        let i = 1;
        while(cur["C" + i]) i++;
        cur["C" + i] = lib;
        stat.libs++;
        continue;
      }
      cur[tag] = lib;
      stat.libs++;
    }
    if(!dataWrite(CUSTOM_LIB_KEY, cur)) fail++;
  }
  return { fail, stat };
}
function dataMatchKey(m){
  if(!m || typeof m !== "object") return "?";
  return [m.t, m.p1 || m.p || "", m.p2 || "", m.s1 != null ? m.s1 : "", m.s2 != null ? m.s2 : m.s != null ? m.s : ""].join("|");
}

/* 清空某一类数据（全部班级）。keepCls 时保留该班的（目前未用，留给后续扩展） */
function dataClearPart(id){
  if(id === "history"){
    dataKeys("vpk_his_").forEach(c => { try{ localStorage.removeItem(hisKey(c)); }catch(e){} });
    dataKeys("vpk_champ_").forEach(c => { try{ localStorage.removeItem(champKey(c)); }catch(e){} });
  }else if(id === "wrongbook"){
    dataKeys("vpk_wrongbook_").forEach(c => { try{ localStorage.removeItem(wrongbookKey(c)); }catch(e){} });
  }else if(id === "custom"){
    try{ localStorage.removeItem(CUSTOM_LIB_KEY); }catch(e){}
  }else if(id === "ui"){
    try{ localStorage.removeItem(UI_KEY); }catch(e){}
  }else if(id === "cfg"){
    dataKeys("vpk_cfg_").forEach(c => { try{ localStorage.removeItem("vpk_cfg_" + c); }catch(e){} });
  }else if(id === "rosters"){
    try{ localStorage.removeItem(ROSTER_KEY); }catch(e){}
  }
}

/* 覆盖导入：先清掉同类数据，再把文件里的写进去 */
function dataReplace(bk){
  const p = bk.parts || {};
  let fail = 0;

  if(p.rosters){
    dataClearPart("rosters");
    const rs = {};
    for(const c in p.rosters){
      if(!c) continue;
      const list = (p.rosters[c] || []).filter(n => typeof n === "string" && n.trim());
      if(list.length) rs[c] = list;
    }
    if(!dataWrite(ROSTER_KEY, rs)) fail++;
  }
  if(p.history){
    dataClearPart("history");
    for(const c in p.history){
      if(!c) continue;
      const h = p.history[c] || {};
      if(!dataWrite(hisKey(c), {
        matches:Array.isArray(h.matches) ? h.matches : [],
        wrongs:(h.wrongs && typeof h.wrongs === "object") ? h.wrongs : {},
        streaks:(h.streaks && typeof h.streaks === "object") ? h.streaks : {}
      })) fail++;
    }
    for(const c in (p.champ || {})){
      if(c && p.champ[c]) if(!dataWrite(champKey(c), String(p.champ[c]))) fail++;
    }
  }
  if(p.wrongbook){
    dataClearPart("wrongbook");
    for(const c in p.wrongbook){
      if(!c) continue;
      if(!dataWrite(wrongbookKey(c), p.wrongbook[c] || {})) fail++;
    }
  }
  if(p.cfg){
    dataClearPart("cfg");
    for(const c in p.cfg){
      if(c && p.cfg[c]) if(!dataWrite("vpk_cfg_" + c, p.cfg[c])) fail++;
    }
  }
  if(p.ui){
    dataClearPart("ui");
    if(!dataWrite(UI_KEY, p.ui)) fail++;
  }
  if(p.custom){
    dataClearPart("custom");
    if(!dataWrite(CUSTOM_LIB_KEY, p.custom)) fail++;
  }
  return { fail };
}

/* ================== 界面 ================== */
function dataPartChecks(){
  return [...document.querySelectorAll("#dataParts input:checked")].map(x => x.dataset.part);
}
function renderDataModal(){
  const inv = dataInventory();
  const sum = $("dataSum");
  if(sum){
    const bits = [
      "班级 <b>" + inv.classes.length + "</b> 个",
      "名单 <b>" + inv.names + "</b> 人",
      "战绩 <b>" + inv.matches + "</b> 场",
      "错词 <b>" + inv.wrongs + "</b> 条",
      "自定义词库 <b>" + inv.libs + "</b>"
    ];
    sum.innerHTML = bits.join('<span class="dataDot">·</span>')
      + '<span class="dataDot">·</span>'
      + '<span class="dataSize">共 ' + dataSize(inv.bytes) + "</span>";
  }

  const partsBox = $("dataParts");
  if(partsBox){
    partsBox.innerHTML = "";
    DATA_PARTS.forEach(p => {
      const lab = document.createElement("label");
      lab.className = "dataPart";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = true;
      cb.dataset.part = p.id;
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(p.name));
      partsBox.appendChild(lab);
    });
  }

  const list = $("dataClsList");
  if(list){
    list.innerHTML = "";
    if(!inv.classes.length){
      list.innerHTML = '<div class="dataEmpty">还没有任何班级数据。</div>';
    }else{
      inv.classes.forEach(c => {
        const it = inv.per[c] || {};
        const row = document.createElement("div");
        row.className = "dataCls";
        const meta = [];
        if(it.names) meta.push("名单 " + it.names + " 人");
        if(it.matches) meta.push("战绩 " + it.matches + " 场");
        if(it.wrongs) meta.push("错词 " + it.wrongs + " 条");
        if(it.champ) meta.push("擂主 " + dispName(it.champ));
        row.innerHTML = '<span class="dataClsName">' + dEsc(c) + "</span>"
          + '<span class="dataClsMeta">' + dEsc(meta.join(" · ") || "只有空记录") + "</span>"
          + '<span class="dataClsActs">'
          + '<button class="dataMini" data-exp="' + dEsc(c) + '">导出</button>'
          + '<button class="dataMini danger" data-del="' + dEsc(c) + '">删除</button>'
          + "</span>";
        list.appendChild(row);
      });
    }
  }
  /* 每次重绘都把待确认的导入状态清掉 */
  dataResetImport();
}
function dataResetImport(){
  dataPending = null;
  const box = $("dataPreview"), row = $("dataImportRow"), file = $("dataFile");
  if(box){ box.classList.add("hidden"); box.innerHTML = ""; }
  if(row) row.classList.add("hidden");
  if(file) file.value = "";
}
function dataOpen(){
  renderDataModal();
  $("dataModal").classList.remove("hidden");
}
function dataReload(msg){
  dlgAlert(msg, { type:"success", title:"完成", html:true })
    .then(() => location.reload());
}

/* ================== 事件 ==================
   入口在页脚版权上方的那行文字链接里（更新说明 · 数据管理 · 使用说明） */
$("footData").addEventListener("click", dataOpen);
$("dataClose").addEventListener("click", () => $("dataModal").classList.add("hidden"));
$("dataModal").addEventListener("click", e => {
  if(e.target.classList.contains("modalMask")) $("dataModal").classList.add("hidden");
});

/* 导出所选 */
$("dataExportBtn").addEventListener("click", () => {
  const parts = dataPartChecks();
  if(!parts.length){
    dlgAlert("请至少勾选一项要导出的内容。", { type:"warning", title:"没有选中内容" });
    return;
  }
  const bk = dataSnapshot(parts, "");
  dataDownload(bk, "词汇擂台数据_" + dataStamp() + ".json");
});

/* 选文件 → 预览 */
$("dataPickBtn").addEventListener("click", () => $("dataFile").click());
$("dataFile").addEventListener("change", e => {
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let bk;
    try{ bk = dataParse(reader.result); }
    catch(err){
      dataResetImport();
      dlgAlert(err.message, { type:"error", title:"无法读取" });
      return;
    }
    dataPending = bk;
    const s = dataSummaryOf(bk);
    const box = $("dataPreview");
    box.innerHTML = '<div class="dataPrevHead">'
      + (bk.kind === "class" ? "单个班级的数据" : "完整备份")
      + " · 导出于 " + dEsc(dataTimeText(bk.exportedAt)) + "</div>"
      + '<div class="dataPrevBody">' + dEsc(s.text) + "</div>"
      + '<div class="dataPrevFile">文件：' + dEsc(file.name) + "（" + dataSize(file.size) + "）</div>";
    box.classList.remove("hidden");
    $("dataImportRow").classList.remove("hidden");
  };
  reader.onerror = () => {
    dataResetImport();
    dlgAlert("读取文件失败，请重试。", { type:"error", title:"读取失败" });
  };
  reader.readAsText(file, "UTF-8");
});
$("dataCancelBtn").addEventListener("click", dataResetImport);

/* 合并导入 */
$("dataMergeBtn").addEventListener("click", async () => {
  if(!dataPending) return;
  const s = dataSummaryOf(dataPending);
  const ok = await dlgConfirm(
    "把这份备份<b>合并</b>到本机：已有的数据保留，只补缺少的部分（名单取并集、战绩按时间点去重、错词次数取较大值）。<br><br>"
      + dEsc(s.text),
    { type:"info", title:"合并导入", okText:"合并", cancelText:"取消", html:true });
  if(!ok) return;
  const r = dataMerge(dataPending);
  if(r.fail){
    dlgAlert("部分数据没能写入，可能是浏览器存储空间不足。可以删掉一些旧战绩后重试。",
      { type:"error", title:"写入失败" });
    return;
  }
  const bits = [];
  if(r.stat.rosters) bits.push("新增名单 " + r.stat.rosters + " 人");
  if(r.stat.matches) bits.push("新增战绩 " + r.stat.matches + " 场");
  if(r.stat.wrongs) bits.push("新增错词 " + r.stat.wrongs + " 条");
  if(r.stat.cfg) bits.push("补充班级配置 " + r.stat.cfg + " 份");
  if(r.stat.libs) bits.push("新增自定义词库 " + r.stat.libs + " 个");
  dataReload("已合并：" + (bits.length ? bits.join("，") : "没有需要补充的内容（本机都是最新的）"));
});

/* 覆盖导入 */
$("dataReplaceBtn").addEventListener("click", async () => {
  if(!dataPending) return;
  const s = dataSummaryOf(dataPending);
  const ok = await dlgConfirm(
    "用这份备份<b>覆盖</b>本机的同类数据：文件里有的类别会被整体替换，本机多出来的记录会丢失，无法恢复。<br><br>"
      + dEsc(s.text) + "<br><br>建议先去「导出所选数据」备份一份当前数据。",
    { type:"error", danger:true, title:"覆盖本机数据", okText:"确认覆盖", cancelText:"取消", html:true });
  if(!ok) return;
  const r = dataReplace(dataPending);
  if(r.fail){
    dlgAlert("部分数据没能写入，可能是浏览器存储空间不足。", { type:"error", title:"写入失败" });
    return;
  }
  dataReload("已按备份覆盖本机同类数据。");
});

/* 班级行：单独导出 / 删除 */
$("dataClsList").addEventListener("click", async e => {
  const exp = e.target.closest("[data-exp]");
  const del = e.target.closest("[data-del]");
  if(exp){
    const cls = exp.dataset.exp;
    const parts = DATA_PARTS.map(p => p.id);
    const bk = dataSnapshot(parts, cls);
    dataDownload(bk, "词汇擂台_" + dataSafeName(cls) + "_" + dataStamp() + ".json");
    return;
  }
  if(del){
    const cls = del.dataset.del;
    const it = dataInventory().per[cls] || {};
    const detail = [];
    if(it.names) detail.push("名单 " + it.names + " 人");
    if(it.matches) detail.push("战绩 " + it.matches + " 场");
    if(it.wrongs) detail.push("错词 " + it.wrongs + " 条");
    const ok = await dlgConfirm(
      "确定删除班级「" + cls + "」的全部数据？" + (detail.length ? "<br>" + detail.join(" · ") : "")
        + "<br><br>名单、战绩、擂主、错词记录、该班配置都会清除，不可恢复。",
      { type:"error", danger:true, title:"删除班级数据", okText:"确认删除", cancelText:"取消", html:true });
    if(!ok) return;
    const rs = loadRosters();
    delete rs[cls];
    dataWrite(ROSTER_KEY, rs);
    [hisKey(cls), champKey(cls), wrongbookKey(cls), "vpk_cfg_" + cls].forEach(k => {
      try{ localStorage.removeItem(k); }catch(err){}
    });
    if(S.cls === cls) saveUI({ cls:"" });
    dlgAlert("已删除「" + dEsc(cls) + "」的全部数据。", { type:"success", title:"已删除", html:true })
      .then(() => location.reload());
    dataResetImport();
  }
});

/* 分类清理 */
document.querySelectorAll("#dataModal [data-clear]").forEach(btn => {
  btn.addEventListener("click", async () => {
    const id = btn.dataset.clear;
    const ok = await dlgConfirm(
      "确定" + btn.textContent.trim() + "？<br>只影响这一类数据，名单与其它记录保留；删除后不可恢复。",
      { type:"error", danger:true, title:btn.textContent.trim(), okText:"确认清理", cancelText:"取消", html:true });
    if(!ok) return;
    dataClearPart(id);
    dataReload("已" + btn.textContent.trim() + "。");
  });
});
