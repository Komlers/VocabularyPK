/* ================== 对战逻辑 ================== */
function startBattle(revival){
  S.revival = revival;
  S.basePoints = revival ? 5 : 10;
  if(revival){
    /* 加时赛：题池=本局错词/错块，按原题型重现 */
    const items = [...S.wrongSet].map(s=>{
      const p = s.split("|");
      return specFromWrong(p[0], p[1], p[2]);
    }).filter(Boolean);
    /* 错词在词库里已经找不到（比如换过词库）时不要开局，否则题池为空会直接崩 */
    if(!items.length){
      S.revival = false; S.basePoints = 10;
      dlgAlert("本题没有可以复现的错词，直接开下一局吧。", { type: "warning", title: "无法加时" });
      return;
    }
    S.reviewList = items.map(specEn);
    S.pool = shuffle(items);
    S.wrongSet = new Set();
    S.dur = 30;
  }else{
    S.wrongSet = new Set();
    buildPool();
  }
  S.qi = 0; S.round = 1; S.scores = [0,0]; S.streak = [0,0]; S.maxStreak = [0,0];
  S.right = [0,0]; S.bad = [0,0]; S.badStreak = [0,0];
  S.asked = 0; S.done = 0;
  S.left = S.dur; S.pendingNext = false;
  $("n1").textContent = dispName(S.p1); $("n2").textContent = dispName(S.p2);
  $("s1").textContent = "0"; $("s2").textContent = "0";
  $("st1").textContent = ""; $("st2").textContent = "";
  /* 单人作答：左边只显示名字，右边显示分数与实时统计，两卡等宽保证计时器居中 */
  const topbar = document.querySelector(".topbar");
  if(topbar) topbar.classList.toggle("solo", !!S.solo);
  syncMeter();
  syncSoloStats();
  show("battle");
  nextQuestion();
  clearInterval(S.timer);
  updateTimer();
  S.timer = setInterval(()=>{
    S.left--;
    updateTimer();
    if(S.left <= 0) endBattle();
  }, 1000);
}
function updateTimer(){
  const m = Math.floor(S.left/60), s = S.left%60;
  $("timer").textContent = m + ":" + (s<10?"0":"") + s;
  $("timer").classList.toggle("warn", S.left<=30);
}
function nextQuestion(){
  S.pendingNext = false;
  if(S.qi >= S.pool.length){
    /* 只有把题池里每一个词条都出过一遍之后才会重新洗牌开第二轮 */
    S.pool = shuffle(S.pool); S.qi = 0; S.round = (S.round || 1) + 1;
  }
  const spec = S.pool[S.qi++];
  S.asked++;   /* 本局出过的题数：只要题目出现过就计入，与是否作答、是否超时无关 */
  let q;
  if(spec.t === "w"){
    const en = spec.w[0], cn = spec.w[1];
    const dir = S.mode==="mix" ? (Math.random()<0.5?"e2c":"c2e") : S.mode;
    const others = wordDistract(spec, dir);
    const opts = dir==="e2c" ? shuffle([cn].concat(others)) : shuffle([en].concat(others));
    q = {kind:"w", en:en, cn:cn, ans: dir==="e2c"?cn:en,
         opts1:shuffle(opts), opts2:shuffle(opts),
         big: dir==="e2c"?en:cn, cls: dir==="e2c"?"":"cn", say: dir==="e2c"?en:"",
         tip: dir==="e2c" ? "🔊 单词 · 点击正确的中文意思（答对直接过）" : "🔊 单词 · 点击对应的英文单词（答对直接过）"};
  }else if(spec.t === "c1"){
    const c = CHUNKS[spec.i];
    const opts = shuffle([c[1]].concat(chunkDistractCn(spec.i)));
    q = {kind:"c1", en:c[0], cn:c[1], ans:c[1],
         opts1:shuffle(opts), opts2:shuffle(opts),
         big:c[0], cls:"chunk", say:c[0],
         tip:"🧩 词块选义 · 点击正确的中文意思"};
  }else if(spec.t === "c2"){
    const c = CHUNKS[spec.i];
    const opts = shuffle([c[4]].concat(pairDistract(spec.i)));
    q = {kind:"c2", en:c[0], cn:c[1], ans:c[4],
         opts1:shuffle(opts), opts2:shuffle(opts),
         big:c[3], cls:"sent", say:"",
         tip:"🧩 词块配对 · "+c[1]};
  }else{
    const c = CHUNKS[spec.i];
    const pieces = c[5].slice();
    const opts = shuffle(pieces.concat(orderDecoys(spec.i, 4 - pieces.length)));
    q = {kind:"c3", en:c[0], cn:c[1], ans:"", pieces:pieces, need:pieces.length,
         progress:[[],[]], opts1:opts, opts2:shuffle(opts),
         big:c[1], cls:"cn", say:"",
         tip:"🧩 词块重组 · 按正确顺序点击 "+pieces.length+" 个片段还原（含 1 个干扰片段）"};
  }
  S.curQ = q; S.locked = [false,false];
  const qw = $("qWord");
  qw.textContent = q.big;
  qw.className = q.cls || "";
  $("qTip").textContent = q.tip + (S.round > 1 ? "　⚠️ 已出完全部 " + S.pool.length + " 条，进入第 " + S.round + " 轮" : "");
  $("pg1").textContent = ""; $("pg2").textContent = "";
  if(q.say) speak(q.say);
  [1,2].forEach(k=>{
    const side = $("side"+k);
    side.classList.remove("locked");
    const list = k===1 ? q.opts1 : q.opts2;
    side.querySelectorAll(".opt").forEach((b,i)=>{
      b.textContent = list[i];
      b.className = "opt";
      b.disabled = false;
    });
  });
  startQuestionTimer();
}
/* ================== 单题超时检测（防拖延） ================== */
function clearQuestionTimer(){
  if(S.qTimer){ clearTimeout(S.qTimer); S.qTimer = null; }
}
function startQuestionTimer(){
  clearQuestionTimer();
  if(!S.questionTimeout) return;
  S.qTimer = setTimeout(questionTimeout, S.questionTimeoutDur * 1000);
}
/* 题目超时：双方均不计分，锁定双方并短暂提示后进入下一题 */
function questionTimeout(){
  if(S.pendingNext) return;
  S.qTimer = null;
  S.pendingNext = true;
  /* 锁定双方，禁止继续点击 */
  [1,2].forEach(k=>{
    S.locked[k-1] = true;
    $("side"+k).classList.add("locked");
  });
  fx("⏰ 超时", "#9a8c5b", 18);
  fx("⏰ 超时", "#9a8c5b", 82);
  beep(160, .25);
  setTimeout(()=>{ if(S.left > 0) nextQuestion(); }, 700);
}
function scheduleNext(delay){
  if(S.pendingNext) return;
  S.pendingNext = true;
  clearQuestionTimer();
  setTimeout(()=>{ if(S.left > 0) nextQuestion(); }, delay);
}
/* 计分：
   · 答对：「连击加分」开启时 +10，且每层连击再 +5（连击加成封顶 +20，即单题 10~30 分）；
           关闭时固定 +10。
   · 答错：「答错扣分」开启时扣分——连击加分开启时按连续答错 5 / 10 / 15 / 20 递增，
           未开启时固定 -5；扣到 0 为止不会出现负分。关闭则不扣分。
   · 加时赛（revival）是错词复盘，既不加连击奖励也不扣分。
   同时统计双方答对 / 答错题数，供结算页展示（超时未答不计入任一方）。 */
function score(k, ok){
  /* 一题只要有一次作答并判定（对或错）就计为「已答」，超时跳过的不算 */
  if(S.curQ && !S.curQ.scored){ S.curQ.scored = true; S.done++; }
  if(ok){
    S.right[k-1]++;
    S.streak[k-1]++;
    S.maxStreak[k-1] = Math.max(S.maxStreak[k-1], S.streak[k-1]);
    let pts = S.basePoints;
    if(S.comboBonus && !S.revival) pts += Math.min((S.streak[k-1]-1)*5, 20);
    if(S.solo){
      /* 单人作答：两侧共用一个总分，显示同步；连击仍各侧独立，故奖励只按答题的那一侧算 */
      S.badStreak = [0,0];
      const v = S.scores[0] + pts;
      S.scores = [v, v];
      $("s1").textContent = v; $("s2").textContent = v;
    }else{
      S.badStreak[k-1] = 0;               /* 答对即打断连续答错 */
      S.scores[k-1] += pts;
      $("s"+k).textContent = S.scores[k-1];
    }
    /* 单人模式分数只显示在右侧，飘字幅度也跟着走右侧 */
    fx("+" + pts, S.solo ? "#4a7fe0" : (k===1 ? "#e05555" : "#4a7fe0"), S.solo ? 82 : (k===1 ? 18 : 82));
    if(!S.revival && S.streak[k-1] >= 2)
      $("st"+k).textContent = "🔥 " + S.streak[k-1] + " 连击！";
    beep(880, .12);
  }else{
    S.bad[k-1]++;
    S.streak[k-1] = 0;
    $("st"+k).textContent = "";
    if(S.wrongPenalty && !S.revival){
      let pen;
      if(S.solo){
        /* 连续扣分在两侧之间同步：换边再错仍算同一次连错 */
        const n = Math.max(S.badStreak[0], S.badStreak[1]) + 1;
        S.badStreak = [n, n];
        pen = S.comboBonus ? Math.min(5 * n, 20) : 5;
      }else{
        S.badStreak[k-1]++;
        pen = S.comboBonus ? Math.min(5 * S.badStreak[k-1], 20) : 5;
      }
      const before = S.solo ? S.scores[0] : S.scores[k-1];
      const after = Math.max(0, before - pen);
      if(S.solo){
        S.scores = [after, after];
        $("s1").textContent = after; $("s2").textContent = after;
      }else{
        S.scores[k-1] = after;
        $("s"+k).textContent = after;
      }
      const lost = before - after;
      if(lost > 0) fx("-" + lost, "#79808f", S.solo ? 82 : (k===1 ? 18 : 82));
    }
    S.wrongSet.add(S.curQ.en + "|" + S.curQ.cn + "|" + S.curQ.kind);
    beep(220, .18);
  }
  syncMeter();
  syncSoloStats();
}
/* 双方各自的实时统计：对 / 错 / 总（总 = 本人实际作答过的题数） */
function syncMeter(){
  [1,2].forEach(k=>{
    const el = $("mt" + k);
    if(!el) return;
    const r = S.right[k-1], b = S.bad[k-1];
    el.innerHTML = "对 <b>" + r + "</b> · 错 <b>" + b + "</b> · 总 <b>" + (r + b) + "</b>";
  });
}
/* 单人作答：顶栏右侧实时统计——已答题数（有作答的）与两侧合并的正答 / 错答 */
function syncSoloStats(){
  if(!S.solo) return;
  const put = (id, v) => { const el = $(id); if(el) el.textContent = v; };
  put("soloDone", S.done || 0);
  put("soloRight", S.right[0] + S.right[1]);
  put("soloBad", S.bad[0] + S.bad[1]);
}
function answer(k, e){
  if(S.locked[k-1] || S.pendingNext) return;
  const btn = e.target;
  if(!btn.classList.contains("opt")) return;
  const q = S.curQ, sideEl = $("side"+k);
  /* 词块重组：按顺序点片段，点错即锁定 */
  if(q.kind === "c3"){
    const expect = q.pieces[q.progress[k-1].length];
    if(btn.textContent === expect){
      q.progress[k-1].push(btn.textContent);
      btn.classList.add("picked");
      btn.disabled = true;
      $("pg"+k).textContent = q.progress[k-1].join(" + ");
      if(q.progress[k-1].length === q.need){
        S.locked[k-1] = true;
        sideEl.classList.add("locked");
        $("pg"+k).textContent = "✔ " + q.en;
        score(k, true);
        scheduleNext(700);
      }
      return;
    }
    S.locked[k-1] = true;
    sideEl.classList.add("locked");
    btn.classList.add("bad");
    $("pg"+k).textContent = "✔ " + q.en;
    score(k, false);
    if(S.locked[0] && S.locked[1]) scheduleNext(700);
    return;
  }
  /* 单选类：单词 / 词块选义 / 词块配对 */
  S.locked[k-1] = true;
  sideEl.classList.add("locked");
  if(btn.textContent === q.ans){
    btn.classList.add("good");
    score(k, true);
    scheduleNext(600);
  }else{
    btn.classList.add("bad");
    score(k, false);
    if(S.locked[0] && S.locked[1]) scheduleNext(600);
  }
}

/* ================== 结算 ================== */
function endBattle(){
  clearInterval(S.timer);
  clearQuestionTimer();
  const [a,b] = S.scores;
  /* 临时赛（noRecord）不记录战绩、不统计错题、不更新擂主；
     临时体验（无班级，手输名字试玩）同样不落库，只在本次会话里保留比分与错词 */
  if(!S.revival && !S.noRecord && S.cls){
    const h = loadHis(S.cls);
    if(S.solo){
      /* 单人作答按「单人记录」保存：只有名字、总分与题量，不参与胜负统计与擂主 */
      h.matches.push({t:Date.now(), solo:1, p:S.p1, s:a, unit:S.units.join("+")});
    }else{
      h.matches.push({t:Date.now(), p1:S.p1, p2:S.p2, s1:a, s2:b, unit:S.units.join("+")});
      [S.p1, S.p2].forEach((n,i)=>{
        if(S.maxStreak[i] > (h.streaks[n]||0)) h.streaks[n] = S.maxStreak[i];
      });
    }
    saveHis(S.cls, h);
  }
  if(!S.noRecord && S.rememberWrong && S.cls){
    /* 错词账本更新（加时赛同样生效，仅在启用错词记忆时）：
       复现词答对即出本，再错次数+1；新错词计入 */
    const h = loadHis(S.cls);
    (S.reviewList||[]).forEach(word=>{
      const missed = [...S.wrongSet].some(x=>x.split("|")[0]===word);
      if(missed) h.wrongs[word] = (h.wrongs[word]||0) + 1;
      else delete h.wrongs[word];
    });
    S.wrongSet.forEach(x=>{
      const w = x.split("|")[0];
      if(!(w in h.wrongs)) h.wrongs[w] = 1;
    });
    saveHis(S.cls, h);
  }
  if(!S.revival && !S.noRecord && !S.solo){
    /* 守擂规则：
       1) 有胜负 → 败者成为下期擂主（红方）
       2) 平局 → 连击纪录低者做下期擂主
       3) 平局且连击纪录相同 → 更换擂主（蓝方做下期红方）
       4) 平局且双方全对（零错词）→ 清空擂主，下次重新抽取 */
    let champ, clearChamp = false;
    if(a !== b){
      champ = a>b ? S.p2 : S.p1;
    }else{
      const perfect = S.wrongSet.size === 0;
      if(perfect){
        champ = ""; clearChamp = true;
      }else if(S.maxStreak[0] !== S.maxStreak[1]){
        champ = S.maxStreak[0] < S.maxStreak[1] ? S.p1 : S.p2;
      }else{
        champ = S.p2;
      }
    }
    /* 有班级：写入本班本地记录；临时体验（无班级）：只在本会话继承擂主，不落库 */
    if(S.cls) saveChamp(S.cls, clearChamp ? "" : champ);
    else S.trialChamp = clearChamp ? "" : champ;
  }
  let title;
  if(S.solo){
    title = dispName(S.p1) + " 完成作答";
  }else if(a===b){
    title = S.wrongSet.size===0
      ? "双方全对平局！下期重新选擂主 🎉"
      : "平局！连击纪录低者守擂，纪录相同则更换擂主";
  }
  else title = dispName(a>b ? S.p1 : S.p2) + " 获胜！";
  if(S.solo) beep(660,.3);
  else if(a!==b) beep(660,.3); else beep(440,.3);
  show("result");
  $("winName").textContent = title;
  $("winName").style.color = (S.solo || a===b) ? "#3a4150" : (a>b ? "#e05555" : "#4a7fe0");
  /* 临时体验（无班级）不写战绩，结算页明确告知；单人作答同样不区分胜负 */
  const scopeTxt = S.revival ? "错词加时赛"
    : (S.solo
        ? ("单人作答" + (S.cls ? "" : " · 不记录战绩"))
        : (S.cls ? S.units.length + " 个词库" : "临时体验 · 不记录战绩"));
  /* 正答 / 错答：单人作答把两侧合并成一个人的成绩 */
  const accHtml = S.solo
    ? '<div class="accRow"><div class="acc red"><b>' + (S.right[0] + S.right[1]) + "/" + (S.bad[0] + S.bad[1]) + '</b><i>正答/错答</i></div></div>'
    : '<div class="accRow">'
      + '<div class="acc red"><b>' + S.right[0] + "/" + S.bad[0] + '</b><i>正答/错答</i></div>'
      + '<div class="acc blue"><b>' + S.right[1] + "/" + S.bad[1] + '</b><i>正答/错答</i></div>'
    + "</div>";
  const scoreHtml = S.solo
    ? '<span class="r">' + esc(dispName(S.p1)) + " " + a + "</span>"
    : '<span class="r">' + esc(dispName(S.p1)) + " " + a + "</span> : " + b + ' <span class="b">' + esc(dispName(S.p2)) + "</span>";
  $("finalScore").innerHTML = scoreHtml + accHtml
    + '<div class="mini" style="margin-top:8px">' + scopeTxt + " · " + (S.dur>=60 ? (S.dur/60)+" 分钟" : S.dur+" 秒")
    + " · 共答 " + S.asked + " 道题</div>";
  /* 单人作答没有“败者守擂/抽新蓝方”，按钮文案单独给 */
  $("againBtn").textContent = S.solo ? "下一局：同一位选手再战" : "下一局：败者守擂，抽新蓝方";
  const wc = $("wrongChips");
  wc.innerHTML = "";
  const ws = [...S.wrongSet].map(w=>w.split("|"));
  if(ws.length){
    ws.forEach(([en,cn])=>{
      const s = document.createElement("span");
      s.textContent = en + "  " + cn;
      wc.appendChild(s);
    });
    $("wrongBox").classList.remove("hidden");
    $("reviveBtn").classList.remove("hidden");
  }else{
    wc.innerHTML = '<span style="background:#e8f8ee;color:#1d7a3f">全对！零错词 🎉</span>';
    $("wrongBox").classList.remove("hidden");
    $("reviveBtn").classList.add("hidden");
  }
}

/* ================== 初始化 ==================
   分两阶段：
   ① 立即渲染不依赖词库的 UI（班级名单、擂主、战绩、配置），从 localStorage 读取，无网络延迟
   ② 异步并行加载词库 JSON，完成后补建索引、题池提示和词库按钮状态
   避免慢网络下词库 fetch 阻塞名单/擂主显示。 */
(async function init(){
  /* ① 先渲染本地数据（名单、擂主、战绩、配置） */
  autoSelectClass();
  restoreCfg();
  redName = loadChamp(S.cls);
  champFixed = !!redName;
  resetDrawn();
  refreshNameBoxes();
  renderHistory();
  updateLibBtn();
  show("setup");

  /* ② 异步加载词库，完成后补建索引、恢复配置（过滤已选词库）与题池提示 */
  try{ await loadWordBank(); }
  catch(err){
    dlgAlert(
      "<b>词库加载失败：" + err.message + "</b><br><br>" +
      "请确认本页面通过 http:// 或 https:// 访问；直接双击 index.html（file://）会被浏览器拦截本地 JSON 请求。",
      { type: "error", title: "❌ 加载失败", html: true, okText: "我知道了" });
    return;
  }
  buildIndex();
  restoreCfg();   /* 词库加载后重新过滤已选词库 tag，确保用户保存的选择正确恢复 */
  updateLibBtn();
  planInfo();
  /* 检查版本更新（异步，不阻塞主流程），未读版本则弹窗提醒 */
  checkUpdate();
})();
