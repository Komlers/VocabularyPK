/* ================== 班级名单（通用：从 LocalStorage 读取，首次使用请导入 TXT） ==================
   TXT 格式：一行一个名字。导入时自动：
     · 跳过空行
     · 跳过以 # 开头的注释行
     · 跳过含特殊字符的名字（仅保留中文 / 英文字母 / 数字 / 间隔号· / 句点. / 连字符-）
     · 按名字去重
   名单持久化在本机浏览器 LocalStorage，不上传服务器，可直接托管到互联网。 */
const ROSTER_KEY = "vpk_rosters";
function loadRosters(){
  try{ return JSON.parse(localStorage.getItem(ROSTER_KEY)) || {}; }
  catch(e){ return {}; }
}
function saveRosters(o){
  try{ localStorage.setItem(ROSTER_KEY, JSON.stringify(o)); }catch(e){}
}
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
function saveChamp(c, name){ if(!c) return; try{ if(name) localStorage.setItem(champKey(c), name); else localStorage.removeItem(champKey(c)); }catch(e){} }
function loadHis(c){
  if(!c) return {matches:[],wrongs:{},streaks:{}};
  try{ return JSON.parse(localStorage.getItem(hisKey(c))) || {matches:[],wrongs:{},streaks:{}}; }
  catch(e){ return {matches:[],wrongs:{},streaks:{}}; }
}
function saveHis(c, h){ if(!c) return; try{ localStorage.setItem(hisKey(c), JSON.stringify(h)); }catch(e){} }
/* 待复现错词：按历史错误次数取前 8 */
function reviewWords(c){
  const h = loadHis(c);
  return Object.entries(h.wrongs||{}).sort((a,b)=>b[1]-a[1]).slice(0,8).map(e=>e[0]);
}

/* ================== 界面记忆（上次选的班级 + 两个临时开关） ==================
   不分班级，改动即落盘，下次打开还原到上次退出时的状态：
     cls      上次选中的班级（空字符串 = 临时体验）
     noRecord 「本次PK不计入战绩」
     solo     「本次PK为单人作答」 */
const UI_KEY = "vpk_ui";
function loadUI(){
  try{ return JSON.parse(localStorage.getItem(UI_KEY)) || {}; }
  catch(e){ return {}; }
}
function saveUI(patch){
  try{
    const d = loadUI();
    for(const k in patch) d[k] = patch[k];
    localStorage.setItem(UI_KEY, JSON.stringify(d));
  }catch(e){}
}

/* ================== 配置（词库选择 + 时长，按班级存） ==================
   临时体验（无班级）不落配置：下次打开仍是默认值，不会残留 vpk_cfg_ 空键。 */
function saveCfg(){
  if(!S.cls) return;
  try{
    localStorage.setItem("vpk_cfg_" + S.cls, JSON.stringify({
      units: S.units, dur: S.dur, wordsOnly: S.wordsOnly, rememberWrong: S.rememberWrong,
      questionTimeout: S.questionTimeout, questionTimeoutDur: S.questionTimeoutDur,
      comboBonus: S.comboBonus, wrongPenalty: S.wrongPenalty
    }));
  }catch(e){}
}
