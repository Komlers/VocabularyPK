/* ================== 词库加载 ================== */
/* 给词块补上所属词库 tag（存于第 7 位），便于按当前选中词库过滤词块题池 */
function tagChunks(list, tag){
  return list.map(c => [c[0], c[1], c[2], c[3], c[4], c[5], tag]);
}
async function loadWordBank(){
  /* 并行加载所有词库 JSON，避免串行请求在慢网络下累积延迟 */
  await Promise.all(WORD_BANK_FILES.map(async ({file, tag}) => {
    const res = await fetch("lib/" + file + ".json", {cache:"no-cache"});
    if(!res.ok) throw new Error("lib/" + file + ".json 加载失败（HTTP " + res.status + "）");
    const data = await res.json();
    LIB_INFO[tag] = { name: data.name || file, label: data.label || "", title: data.title || data.name || "", file };
    (data.words || []).forEach(w => LIB.push([w[0], w[1], tag]));
    if(data.chunks) CHUNKS = CHUNKS.concat(tagChunks(data.chunks, tag));
  }));
  loadCustomLibs();
}

/* ================== 自定义词库（本地导入，持久化到 localStorage） ==================
   存储格式：{ "C1": {name, words:[[en,cn]], chunks:[]}, "C2": {...} }
   自定义词库 tag 以 "C" 开头，file 标记为 "custom" 便于 UI 区分。 */

/* 校验单词条目：必须是 [英文, 中文] 两个非空字符串。
   不校验的话，缺中文的条目会让那道题答案变成 undefined、永远答不对。
   数字、null、对象一律算格式错误（想要「9」请写成字符串 "9"）。 */
function cleanLibWords(list){
  const out = [], seen = new Set();
  let bad = 0;
  const str = x => typeof x === "string" ? x.trim() : "";
  (Array.isArray(list) ? list : []).forEach(w => {
    const en = Array.isArray(w) ? str(w[0]) : "";
    const cn = Array.isArray(w) ? str(w[1]) : "";
    if(!en || !cn){ bad++; return; }
    if(seen.has(en)) return;          /* 同一词重复出现只留一条，不算格式错误 */
    seen.add(en);
    out.push([en, cn]);
  });
  return { words: out, bad };
}
/* 校验词块条目：[英文, 中文, 家族, 题干, 答案, 重组片段?]。
   前五项必须是非空字符串；片段可省（没有就只出选义 / 配对）。
   片段不足两段时按「没有」处理，避免出现点一下就完成的假重组题。 */
function cleanLibChunks(list){
  const out = [];
  let bad = 0;
  (Array.isArray(list) ? list : []).forEach(c => {
    if(!Array.isArray(c) || c.length < 5){ bad++; return; }
    if(c.slice(0, 5).some(x => typeof x !== "string")){ bad++; return; }
    const head = c.slice(0, 5).map(x => x.trim());
    if(head.some(x => !x)){ bad++; return; }
    const raw = Array.isArray(c[5]) ? c[5].filter(x => typeof x === "string").map(x => x.trim()).filter(Boolean) : [];
    out.push([head[0], head[1], head[2], head[3], head[4], raw.length > 1 ? raw : null]);
  });
  return { chunks: out, bad };
}

function loadCustomLibs(){
  let data = {};
  try{ data = JSON.parse(localStorage.getItem(CUSTOM_LIB_KEY)) || {}; }catch(e){}
  for(const tag in data){
    const d = data[tag];
    if(!d || !Array.isArray(d.words)) continue;
    /* 旧版本可能存进过不合规的词条，这里同样过一遍，坏数据不进内存 */
    const w = cleanLibWords(d.words);
    if(!w.words.length) continue;
    const c = cleanLibChunks(d.chunks);
    LIB_INFO[tag] = { name: d.name || tag, file: "custom" };
    if(!WORD_BANK_FILES.find(x => x.tag === tag)){
      WORD_BANK_FILES.push({ file: "custom", tag });
    }
    w.words.forEach(x => LIB.push([x[0], x[1], tag]));
    if(c.chunks.length) CHUNKS = CHUNKS.concat(tagChunks(c.chunks, tag));
  }
}
/* 生成下一个可用的自定义 tag（C1, C2, ... 跳过已占用） */
function nextCustomTag(){
  const used = new Set(WORD_BANK_FILES.map(x => x.tag));
  let i = 1;
  while(used.has("C" + i)) i++;
  return "C" + i;
}
/* 导入自定义词库：解析 JSON → 校验 → 存 localStorage → 合并到内存 → 返回 tag */
function importCustomLib(jsonText){
  let data;
  try{ data = JSON.parse(jsonText); }catch(e){ throw new Error("JSON 解析失败：" + e.message); }
  if(!data || !Array.isArray(data.words) || !data.words.length){
    throw new Error("词库格式不正确：需要 { name, words:[[英文,中文],...] }");
  }
  const w = cleanLibWords(data.words);
  const c = cleanLibChunks(data.chunks);
  if(!w.words.length){
    throw new Error("词库里没有有效词条：每条需要 [英文, 中文] 两个非空字符串（这份文件 " + data.words.length + " 条都不合规）");
  }
  const tag = nextCustomTag();
  const name = data.name || ("自定义词库 " + tag);
  const entry = { name, words: w.words, chunks: c.chunks };
  /* 持久化：写不进去就别往内存里加，否则刷新后词库就没了 */
  let all = {};
  try{ all = JSON.parse(localStorage.getItem(CUSTOM_LIB_KEY)) || {}; }catch(e){}
  all[tag] = entry;
  try{ localStorage.setItem(CUSTOM_LIB_KEY, JSON.stringify(all)); }
  catch(e){ throw new Error("写入本地存储失败（可能是空间已满），词库没有保存。可先到「数据管理」导出备份再清理旧数据。"); }
  /* 合并到内存 */
  LIB_INFO[tag] = { name, file: "custom" };
  WORD_BANK_FILES.push({ file: "custom", tag });
  entry.words.forEach(x => LIB.push([x[0], x[1], tag]));
  if(entry.chunks.length) CHUNKS = CHUNKS.concat(tagChunks(entry.chunks, tag));
  return { tag, name, count: entry.words.length, chunks: entry.chunks.length, skipped: w.bad + c.bad };
}
/* 删除自定义词库：从 localStorage、内存数组、索引中清除 */
function deleteCustomLib(tag){
  /* 从持久化存储移除 */
  let all = {};
  try{ all = JSON.parse(localStorage.getItem(CUSTOM_LIB_KEY)) || {}; }catch(e){}
  delete all[tag];
  lsSet(CUSTOM_LIB_KEY, all);
  /* 从 WORD_BANK_FILES 移除 */
  const idx = WORD_BANK_FILES.findIndex(x => x.tag === tag);
  if(idx >= 0) WORD_BANK_FILES.splice(idx, 1);
  /* 从 LIB_INFO 移除 */
  delete LIB_INFO[tag];
  /* 从 LIB 中移除该 tag 的单词 */
  for(let i = LIB.length - 1; i >= 0; i--){
    if(LIB[i][2] === tag) LIB.splice(i, 1);
  }
  /* 从 CHUNKS 中移除该 tag 的词块（词块第 7 位记录了所属词库） */
  for(let i = CHUNKS.length - 1; i >= 0; i--){
    if(CHUNKS[i][6] === tag) CHUNKS.splice(i, 1);
  }
  buildIndex();
  /* 若这个词库正被选中，一并从已选列表里摘掉并落盘：
     否则主页仍显示「已选 N 个词库」，开局时题池却是空的 */
  if(S.units.indexOf(tag) >= 0){
    S.units = S.units.filter(t => t !== tag);
    syncUseChunks();
    saveCfg();
    if(typeof updateLibBtn === "function") updateLibBtn();
    if(typeof planInfo === "function") planInfo();
  }
}

/* ================== 索引 ================== */
function buildIndex(){
  for(const k in chunkIdxByEn) delete chunkIdxByEn[k];
  for(const k in wordByEn) delete wordByEn[k];
  CHUNKS.forEach((c,i)=>chunkIdxByEn[c[0]]=i);
  LIB.forEach(w=>wordByEn[w[0]]=w);
}

/* ================== 词块范围（按选中词库过滤） ==================
   词块在第 7 位（下标 6）记录所属词库 tag，题池、干扰项、词块英文去重
   都只在当前选中词库范围内取，避免选必修 1 却抽到选必 2 的词块。 */
function chunkIdxInScope(){
  if(!S.units.length) return [];
  const out = [];
  CHUNKS.forEach((c,i)=>{ if(S.units.includes(c[6])) out.push(i); });
  return out;
}
/* 当前范围内词块的英文集合：用于避免词块与同名单词重复出题 */
function chunkEnsInScope(){
  const s = new Set();
  CHUNKS.forEach(c=>{ if(S.units.includes(c[6])) s.add(c[0]); });
  return s;
}
/* 当前选中词库是否含词块（决定是否加入词块题型） */
function hasChunksInScope(){
  return S.units.some(t => CHUNKS.some(c => c[6] === t));
}
/* 统一维护 S.useChunks：只加载纯单词时强制关闭；否则按所选词库是否含词块决定 */
function syncUseChunks(){
  S.useChunks = !S.wordsOnly && hasChunksInScope();
}
/* 干扰项候选：优先当前选中词库；范围内词块过少时退回全部词块，保证能凑满选项 */
function chunkCand(i){
  let list = chunkIdxInScope();
  if(list.length < 4) list = CHUNKS.map((c,j)=>j);
  if(i !== undefined && !list.includes(i)) list.push(i);
  return list;
}

function specEn(spec){ return spec.t==="w" ? spec.w[0] : CHUNKS[spec.i][0]; }
/* 由"英文/题型"还原题目规格：词块优先，其次单词；kind 为空时用于跨课复现解析 */
function specFromWrong(en, cn, kind){
  const ci = chunkIdxByEn[en];
  if(ci !== undefined){
    const t = (kind==="c2" || kind==="c3") ? kind : "c1";
    return {t:t, i:ci};
  }
  if(wordByEn[en]) return {t:"w", w:wordByEn[en]};
  return null;
}
/* 上节课错的词与词块：按错误次数取前 8 优先复现；
   未开启「错词优先复现」时返回空，每次完全用当前词库出题。
   注意：这只影响出题，错词本（vpk_wrongbook_*）始终照常收录。 */
function reviewSpecs(cls){
  if(!S.rememberWrong) return [];
  const h = loadHis(cls);
  return Object.entries(h.wrongs||{}).sort((a,b)=>b[1]-a[1]).slice(0,8)
    .map(e=>specFromWrong(e[0],"","")).filter(Boolean);
}

/* ================== 干扰项生成 ================== */
/* 词块选义干扰项：同家族优先 */
/* 词块选义干扰项：同家族优先；按中文去重，且必须与正确答案不同。
   不同词块可能同义（be proud of / be proud about、跨册重复的 be known as 等），
   若不过滤会出现两个一模一样的选项，甚至干扰项与正确答案同义。 */
function chunkDistractCn(i){
  const fam = CHUNKS[i][2], ans = CHUNKS[i][1];
  const same = [], rest = [];
  chunkCand(i).forEach(j=>{ if(j===i) return; (CHUNKS[j][2]===fam?same:rest).push(j); });
  const out = [];
  const push = v => { if(v && v !== ans && !out.includes(v) && out.length < 3) out.push(v); };
  shuffle(same).forEach(j=>push(CHUNKS[j][1]));
  shuffle(rest).forEach(j=>push(CHUNKS[j][1]));
  /* 范围内同义项过多导致凑不满时，从全部词块补足，保证始终有 3 个干扰项 */
  if(out.length < 3) shuffle(CHUNKS).forEach(c=>push(c[1]));
  return out;
}
/* 配对题干扰项：介词类取介词池，其余取同家族其他答案（保证 3 个互不相同且≠答案） */
function pairDistract(i){
  const key = CHUNKS[i][4], fam = CHUNKS[i][2];
  const cand = chunkCand(i);
  const out = [];
  const push = v => { if(v && v!==key && !out.includes(v) && out.length<3) out.push(v); };
  if(fam !== "prep"){
    cand.forEach(j=>{ if(j!==i && CHUNKS[j][2]===fam) push(CHUNKS[j][4]); });
  }
  shuffle(PAIR_POOL).forEach(push);
  cand.forEach(j=>push(CHUNKS[j][4]));
  while(out.length<3) out.push("—");
  return shuffle(out);
}
/* 重组题干扰片段 */
function orderDecoys(i, n){
  const out = [], own = CHUNKS[i][5];
  const pool = shuffle(chunkCand(i).filter(j=>j!==i && CHUNKS[j][5]));
  for(const j of pool){
    if(out.length>=n) break;
    const p = shuffle(CHUNKS[j][5])[0];
    if(!out.includes(p) && !own.includes(p)) out.push(p);
  }
  while(out.length<n) out.push("……");
  return out;
}
/* 词块题型分配：给一批词块下标排出 c1 选义 / c2 配对 / c3 重组的题型。
   名额约 c3 25%、c2 35%、其余 c1；先满足最难凑的重组题（只分给带片段 c[5] 的词块），
   再给带配对题干 c[3] 的分 c2，剩下的都出选义。
   旧逻辑是「先判 c[3] 再判 c[5]」，而带重组片段的词块几乎都有配对题干，
   结果 c3 永远轮不到，整池只剩 buildPool 末尾强行改的那一道。 */
function chunkKindsFor(idxs){
  const n = idxs.length;
  const kinds = new Array(n).fill("");
  const fill = (kind, need, ok) => {
    let got = 0;
    for(let k = 0; k < n && got < need; k++){
      if(kinds[k] || !ok(CHUNKS[idxs[k]])) continue;
      kinds[k] = kind; got++;
    }
  };
  fill("c3", Math.round(n * 0.25), c => !!c[5]);
  fill("c2", Math.round(n * 0.35), c => !!c[3]);
  return kinds.map(k => k || "c1");
}
/* 单词题干扰项：同单元优先 → 全书兜底；保证 3 个干扰项互不相同且 != 答案 */
function wordDistract(spec, dir){
  const en = spec.w[0], cn = spec.w[1];
  const key = dir === "e2c" ? 1 : 0;
  const out = [], seen = new Set([dir === "e2c" ? cn : en]);
  const pool = libFiltered().concat(LIB);
  for(const w of shuffle(pool)){
    if(w[0] === en) continue;
    const v = w[key];
    if(!v || seen.has(v)) continue;
    seen.add(v); out.push(v);
    if(out.length >= 3) break;
  }
  return out;
}

/* ================== 题源与配比 ================== */
/* 单词候选题源（词块与单词撞名时，该词条只出词块题） */
function wordSource(){
  const list = libFiltered();
  if(!S.useChunks) return list;
  const ens = chunkEnsInScope();
  return list.filter(w=>!ens.has(w[0]));
}
/* 题池规模（与 buildPool 口径一致） */
function poolRange(){
  const words = libFiltered();
  const ens = S.useChunks ? chunkEnsInScope() : null;
  return { words:(ens ? words.filter(w=>!ens.has(w[0])) : words).length,
           chunks:(S.useChunks ? chunkIdxInScope().length : 0) };
}
/* 按当前选词库过滤 */
function libFiltered(){
  if(!S.units.length) return [];
  return LIB.filter(w => S.units.includes(w[2]));
}

/* ================== 组卷 ================== */
/* 单词与词块按数量比例均匀穿插：两边内部顺序仍是随机的，
   这样既不会连着出好几道同一类题，也不需要按时间来推算配比 */
function interleaveSpecs(a, b){
  if(!b.length) return a.slice();
  if(!a.length) return b.slice();
  const out = [];
  let i = 0, j = 0;
  while(i < a.length || j < b.length){
    /* b 的已用比例落后于 a 时插一道词块，保证词块被均匀摊开 */
    if(j < b.length && (i >= a.length || (j + 1) * a.length <= (i + 1) * b.length)) out.push(b[j++]);
    else out.push(a[i++]);
  }
  return out;
}

/* 题池 = 选中词库的全部词条；单词与词块均匀穿插，错词优先注入 */
function buildPool(){
  const used = new Set();                       // 键=en：同一词条本局只出一道题（不分题型）
  const words = [], chunks = [];
  const mk = (arr, s) => { const e = specEn(s); if(used.has(e)) return; used.add(e); arr.push(s); };
  shuffle(wordSource()).forEach(w => mk(words, {t:"w", w:w}));
  if(S.useChunks){
    const idxs = shuffle(chunkIdxInScope());
    const kinds = chunkKindsFor(idxs);
    idxs.forEach((i, k) => mk(chunks, {t:kinds[k], i:i}));
    /* 兜底：整池没有重组题，但存在带片段的词块，就借一道改成 c3 */
    if(!chunks.some(s => s.t === "c3")){
      const s = chunks.find(s => CHUNKS[s.i][5]);
      if(s) s.t = "c3";
    }
  }
  const pool = interleaveSpecs(words, chunks);
  const rv = reviewSpecs(S.cls);
  S.reviewList = rv.map(specEn);
  const rvKeys = new Set(S.reviewList);
  S.pool = rv.concat(pool.filter(s => !rvKeys.has(specEn(s))));
}
