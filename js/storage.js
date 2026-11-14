/* ================== 班级名单（通用：从 LocalStorage 读取，首次使用请导入 TXT） ==================
   TXT 格式：一行一个名字。导入时自动：
     · 跳过空行
     · 跳过以 # 开头的注释行
     · 跳过含特殊字符的名字（仅保留中文 / 英文字母 / 数字 / 间隔号· / 句点. / 连字符-）
     · 按名字去重
   名单持久化在本机浏览器 LocalStorage，不上传服务器，可直接托管到互联网。 */
/* ================== 写入保护 ==================
   localStorage 有配额（多数浏览器约 5 MB），写满时 setItem 会抛错。
   以前这里静默 catch，用户改完名单、打完一局都以为存上了，刷新后才发现没了。
   现在统一走 lsSet：失败时提示一次，并指向页面底部的「数据管理」备份 / 清理。 */
let quotaWarned = false;
function lsSet(key, value){
  try{
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
    return true;
  }catch(e){
    if(!quotaWarned){
      quotaWarned = true;
      const name = (e && e.name) || "";
      const full = /quota/i.test(name) || /quota/i.test((e && e.message) || "");
      const msg = full
        ? "浏览器本地存储已满，这次改动没能保存。<br>请到页面底部的「数据管理」导出备份，再清空旧战绩 / 错词记录后重试。"
        : "本地存储写入失败（" + (name || "未知错误") + "），这次改动没能保存。";
      try{
        if(typeof dlgAlert === "function") dlgAlert(msg, { type:"error", title:"⚠ 数据未能保存", html:true });
        else console.warn("[vpk] 存储写入失败：", key, e);
      }catch(_){}
    }
    return false;
  }
}

const ROSTER_KEY = "vpk_rosters";
function loadRosters(){
  try{
    const o = JSON.parse(localStorage.getItem(ROSTER_KEY));
    /* 只接受「班级 -> 名单数组」的普通对象，防止历史脏数据把界面搞崩 */
    if(!o || typeof o !== "object" || Array.isArray(o)) return {};
    for(const k in o) if(!Array.isArray(o[k])) delete o[k];
    return o;
  }catch(e){ return {}; }
}
function saveRosters(o){ return lsSet(ROSTER_KEY, o); }
/* 实时访问当前 ROSTERS 对象（每次调用都从 LocalStorage 读，保证多班级切换后状态最新） */
function rosters(){ return loadRosters(); }

/* 当前班级是否有可抽取的名单；没有名单时即为「临时体验」（手输名字开一局，战绩不落库） */
function hasRoster(){
  const list = rosters()[S.cls] || [];
  return list.length > 0;
}

/* 名字合法字符：名单导入与手输名字共用同一条规则 */
const NAME_OK_RE = /^[一-龥 a-zA-Z0-9·.\-@]+$/;
function validName(n){ return NAME_OK_RE.test(String(n == null ? "" : n).trim()); }

/* 解析 TXT 文本，返回 { names, stat } */
function parseRosterText(text){
  const seen = new Set();
  const names = [];
  const stat = {empty:0, comment:0, invalid:0, dup:0};
  String(text).split(/\r?\n/).forEach(raw=>{
    const line = raw.trim();
    if(!line){ stat.empty++; return; }
    if(line.startsWith("#")){ stat.comment++; return; }
    if(!NAME_OK_RE.test(line)){ stat.invalid++; return; }
    if(seen.has(line)){ stat.dup++; return; }
    seen.add(line);
    names.push(line);
  });
  return {names, stat};
}

/* ================== 历史（按班级分开存） ==================
   班级名称为空 = 临时体验（尚未导入任何名单）：一律不读不写，
   避免在 localStorage 里留下 vpk_his_ / vpk_champ_ 这种无主键。 */
const hisKey = c => "vpk_his_" + c;
const champKey = c => "vpk_champ_" + c;   /* 擂主（上一局败者）名字：按班级分开存 */
/* 读取/写入本班擂主名字。名字为空则删除记录；下次打开自动回填，仍可随时手改。 */
function loadChamp(c){ if(!c) return ""; try{ return localStorage.getItem(champKey(c)) || ""; }catch(e){ return ""; } }
function saveChamp(c, name){
  if(!c) return;
  if(name) return lsSet(champKey(c), name);
  try{ localStorage.removeItem(champKey(c)); }catch(e){}
}
/* 历史记录：缺字段的老数据补齐成空值，避免旧版本 / 手工改坏的条目让战绩弹窗报错 */
function loadHis(c){
  const def = {matches:[], wrongs:{}, streaks:{}};
  if(!c) return def;
  try{
    const h = JSON.parse(localStorage.getItem(hisKey(c)));
    if(!h || typeof h !== "object" || Array.isArray(h)) return def;
    return {
      matches: Array.isArray(h.matches) ? h.matches : [],
      wrongs:  (h.wrongs  && typeof h.wrongs  === "object") ? h.wrongs  : {},
      streaks: (h.streaks && typeof h.streaks === "object") ? h.streaks : {}
    };
  }catch(e){ return def; }
}
function saveHis(c, h){ if(!c) return false; return lsSet(hisKey(c), h); }

/* ================== 错词记录本（按班级分开累计） ==================
   键：vpk_wrongbook_<班级>，和战绩 / 擂主 / 配置一样按班分开存。
   结构：{ 单元tag: { "英文|w": {en,cn,kind,n,last} } }
     · n     该词在这个班累计答错次数，答对不清零，便于看整学期的顽固错词
     · kind  w=单词，c=词块（同一个词与词块同名时分两条）
   与「待复现错词」（h.wrongs，答对即出本）是两套数据，互不影响。 */
const wrongbookKey = c => "vpk_wrongbook_" + c;
const WRONGBOOK_LEGACY_KEY = "vpk_wrongbook";   /* 早期版本用的全局键，启动时迁移一次 */

function loadWrongBook(cls){
  const c = cls === undefined ? S.cls : cls;
  if(!c) return {};
  try{
    const d = JSON.parse(localStorage.getItem(wrongbookKey(c)));
    if(!d || typeof d !== "object" || Array.isArray(d)) return {};
    const out = {};
    for(const tag in d){
      const bucket = d[tag];
      if(!bucket || typeof bucket !== "object" || Array.isArray(bucket)) continue;
      const clean = {};
      for(const key in bucket){
        const e = bucket[key];
        if(!e || typeof e !== "object") continue;
        const en = String(e.en || "").trim();
        if(!en) continue;
        clean[key] = {
          en,
          cn: String(e.cn || ""),
          kind: e.kind === "w" ? "w" : "c",
          n: Math.max(1, Math.min(99999, parseInt(e.n, 10) || 1)),
          last: Math.max(0, parseInt(e.last, 10) || 0)
        };
      }
      if(Object.keys(clean).length) out[tag] = clean;
    }
    return out;
  }catch(e){ return {}; }
}
function saveWrongBook(cls, d){
  const c = cls === undefined ? S.cls : cls;
  if(!c) return false;
  return lsSet(wrongbookKey(c), d);
}
function clearWrongBook(cls){
  const c = cls === undefined ? S.cls : cls;
  if(!c) return;
  try{ localStorage.removeItem(wrongbookKey(c)); }catch(e){}
}

/* 早期版本把错词记在全局键里，并用 c:{班级:次数} 记录分布。
   改成按班存放后，启动时按分布拆到各班的键里，搬完删掉旧键（只搬一次）。 */
function migrateWrongBook(){
  let raw = null;
  try{ raw = localStorage.getItem(WRONGBOOK_LEGACY_KEY); }catch(e){ return; }
  if(!raw) return;
  let d = null;
  try{ d = JSON.parse(raw); }catch(e){ d = null; }
  if(d && typeof d === "object" && !Array.isArray(d)){
    const touched = {};
    for(const tag in d){
      const bucket = d[tag];
      if(!bucket || typeof bucket !== "object" || Array.isArray(bucket)) continue;
      for(const key in bucket){
        const e = bucket[key];
        if(!e || typeof e !== "object" || !e.en) continue;
        const dist = (e.c && typeof e.c === "object" && !Array.isArray(e.c)) ? e.c : {};
        const last = Math.max(0, parseInt(e.last, 10) || 0);
        for(const cls in dist){
          const n = parseInt(dist[cls], 10);
          if(!cls || !(n > 0)) continue;
          if(!touched[cls]) touched[cls] = loadWrongBook(cls);
          const book = touched[cls];
          const b = book[tag] || (book[tag] = {});
          const cur = b[key];
          if(cur){
            cur.n += n;
            cur.last = Math.max(cur.last, last);
          }else{
            b[key] = {
              en: String(e.en),
              cn: String(e.cn || ""),
              kind: e.kind === "w" ? "w" : "c",
              n,
              last
            };
          }
        }
      }
    }
    for(const cls in touched) saveWrongBook(cls, touched[cls]);
  }
  try{ localStorage.removeItem(WRONGBOOK_LEGACY_KEY); }catch(e){}
}

/* ================== 界面记忆（上次选的班级 + 两个临时开关） ==================
   不分班级，改动即落盘，下次打开还原到上次退出时的状态：
     cls      上次选中的班级（空字符串 = 临时体验）
     noRecord 「临时赛」（不计入战绩）
     solo     「单人」作答 */
const UI_KEY = "vpk_ui";
function loadUI(){
  try{
    const o = JSON.parse(localStorage.getItem(UI_KEY));
    return (o && typeof o === "object" && !Array.isArray(o)) ? o : {};
  }catch(e){ return {}; }
}
function saveUI(patch){
  const d = loadUI();
  for(const k in patch) d[k] = patch[k];
  return lsSet(UI_KEY, d);
}

/* ================== 配置（词库选择 + 时长，按班级存） ==================
   临时体验（无班级）不落配置：下次打开仍是默认值，不会残留 vpk_cfg_ 空键。 */
function saveCfg(){
  if(!S.cls) return false;
  return lsSet("vpk_cfg_" + S.cls, {
    units: S.units, dur: S.dur, wordsOnly: S.wordsOnly, rememberWrong: S.rememberWrong,
    questionTimeout: S.questionTimeout, questionTimeoutDur: S.questionTimeoutDur,
    comboBonus: S.comboBonus, wrongPenalty: S.wrongPenalty,
    scoreMode: S.scoreMode, scoreCap: S.scoreCap
  });
}
