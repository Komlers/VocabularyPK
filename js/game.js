/* ================== 对战逻辑 ================== */
/* 开局入场动效：红蓝卡片从两侧滑入，计时器 / 题目 / 选项依次浮起。
   只加一次性类并在动画结束后移除，不阻塞答题与倒计时。 */
let entranceTimer = null;
let qAnimTimer = null;
function playBattleEntrance(){
  const bt = $("battle");
  if(!bt) return;
  bt.classList.remove("starting");
  if(!animOn()) return;             /* 关闭渲染动画：不做入场，也不留收尾定时器 */
  void bt.offsetWidth;              /* 强制重排，连开两局也能重播 */
  bt.classList.add("starting");
  if(entranceTimer) clearTimeout(entranceTimer);
  entranceTimer = setTimeout(()=>{
    bt.classList.remove("starting");
    entranceTimer = null;
  }, 900);
}

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
  /* 淘汰制开局即满分（相当于血量），累加制与无限制都从 0 起 */
  const initScore = (!revival && S.scoreMode === "knockout") ? S.scoreCap : 0;
  S.qi = 0; S.round = 1; S.scores = [initScore, initScore]; S.streak = [0,0]; S.maxStreak = [0,0];
  S.right = [0,0]; S.bad = [0,0]; S.badStreak = [0,0];
  S.asked = 0; S.done = 0; S.endReason = "time"; S.ending = false; S.ended = false;
  S.left = S.dur; S.pendingNext = false;
  $("n1").textContent = dispName(S.p1); $("n2").textContent = dispName(S.p2);
  $("s1").textContent = initScore; $("s2").textContent = initScore;
  $("st1").textContent = ""; $("st2").textContent = "";
  /* 单人作答：左边只显示名字，右边显示分数与实时统计，两卡等宽保证计时器居中 */
  const topbar = document.querySelector(".topbar");
  if(topbar){
    topbar.classList.toggle("solo", !!S.solo);
    /* 限分模式的分数可能是三位数，顶栏比分降一档字号 */
    topbar.classList.toggle("cap3", !revival && S.scoreMode !== "open" && S.scoreCap >= 100);
  }
  syncStats();
  show("battle");
  playBattleEntrance();
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
  if(S.ending) return;          /* 限分模式已判定胜负，等结算，不再出题 */
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
    q = {kind:"w", tag:spec.w[2], en:en, cn:cn, ans: dir==="e2c"?cn:en,
         opts1:shuffle(opts), opts2:shuffle(opts),
         big: dir==="e2c"?en:cn, cls: dir==="e2c"?"":"cn", say: dir==="e2c"?en:"",
         tip: dir==="e2c" ? "🔊 单词 · 点击正确的中文意思（答对直接过）" : "🔊 单词 · 点击对应的英文单词（答对直接过）"};
  }else if(spec.t === "c1"){
    const c = CHUNKS[spec.i];
    const opts = shuffle([c[1]].concat(chunkDistractCn(spec.i)));
    q = {kind:"c1", tag:c[6], en:c[0], cn:c[1], ans:c[1],
         opts1:shuffle(opts), opts2:shuffle(opts),
         big:c[0], cls:"chunk", say:c[0],
         tip:"🧩 词块选义 · 点击正确的中文意思"};
  }else if(spec.t === "c2"){
    const c = CHUNKS[spec.i];
    const opts = shuffle([c[4]].concat(pairDistract(spec.i)));
    q = {kind:"c2", tag:c[6], en:c[0], cn:c[1], ans:c[4],
         opts1:shuffle(opts), opts2:shuffle(opts),
         big:c[3], cls:"sent", say:"",
         tip:"🧩 词块配对 · "+c[1]};
  }else{
    const c = CHUNKS[spec.i];
    const pieces = c[5].slice();
    const opts = shuffle(pieces.concat(orderDecoys(spec.i, 4 - pieces.length)));
    q = {kind:"c3", tag:c[6], en:c[0], cn:c[1], ans:"", pieces:pieces, need:pieces.length,
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
  /* 换题动效：题干与两侧选项轻微上浮，选项依次出现（重复换题也能重播）。
     动画结束即摘掉 qIn，否则它的优先级会盖住答对 / 答错的小动画。
     关闭渲染动画时整段跳过，连收尾定时器都不建。 */
  const fresh = ["qWord","side1","side2"].map(id=>$(id)).filter(Boolean);
  fresh.forEach(el=>el.classList.remove("qIn"));
  if(qAnimTimer){ clearTimeout(qAnimTimer); qAnimTimer = null; }
  if(animOn() && fresh.length){
    void fresh[0].offsetWidth;
    fresh.forEach(el=>el.classList.add("qIn"));
    qAnimTimer = setTimeout(()=>{
      fresh.forEach(el=>el.classList.remove("qIn"));
      qAnimTimer = null;
    }, 420);
  }
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
   · 无限制（open）——答对：「连击加分」开启时 +10，且每层连击再 +5（加成封顶 +20，单题 10~30）；
           答错：「答错扣分」开启时按连续答错 5 / 10 / 15 / 20 递增，未开启时固定 -5，扣到 0 为止。
   · 淘汰制 / 累加制（knockout / accumulate）——加减分固定：答对 +5、答错 -10，
           结果夹在 0 ~ 满分之间，与连击、扣分开关无关。
   · 加时赛（revival）是错词复盘，一律按无限制规则走，既不触发限分模式的胜负判定。
   同时统计双方答对 / 答错题数，供结算页展示（超时未答不计入任一方）。 */
function score(k, ok){
  /* 一题只要有一次作答并判定（对或错）就计为「已答」，超时跳过的不算 */
  if(S.curQ && !S.curQ.scored){ S.curQ.scored = true; S.done++; }
  const limited = !S.revival && S.scoreMode !== "open";
  if(ok){
    S.right[k-1]++;
    S.streak[k-1]++;
    S.maxStreak[k-1] = Math.max(S.maxStreak[k-1], S.streak[k-1]);
    let pts = S.basePoints;
    if(limited) pts = 5;
    else if(S.comboBonus && !S.revival) pts += Math.min((S.streak[k-1]-1)*5, 20);
    const before = S.solo ? S.scores[0] : S.scores[k-1];
    const after = limited ? Math.min(S.scoreCap, before + pts) : before + pts;
    if(S.solo){
      /* 单人作答：两侧共用一个总分，显示同步；连击仍各侧独立，故奖励只按答题的那一侧算 */
      S.badStreak = [0,0];
      S.scores = [after, after];
      $("s1").textContent = after; $("s2").textContent = after;
    }else{
      S.badStreak[k-1] = 0;               /* 答对即打断连续答错 */
      S.scores[k-1] = after;
      $("s"+k).textContent = after;
    }
    /* 单人模式分数只显示在右侧，飘字幅度也跟着走右侧；已到满分则提示「已满」 */
    const gain = after - before;
    const fxColor = S.solo ? "#4a7fe0" : (k===1 ? "#e05555" : "#4a7fe0");
    const fxPos = S.solo ? 82 : (k===1 ? 18 : 82);
    if(gain > 0) fx("+" + gain, fxColor, fxPos);
    else if(limited) fx("已满", "#9aa3b2", fxPos);
    if(!S.revival && !limited && S.streak[k-1] >= 2)
      $("st"+k).textContent = "🔥 " + S.streak[k-1] + " 连击！";
    beep(880, .12);
  }else{
    S.bad[k-1]++;
    S.streak[k-1] = 0;
    $("st"+k).textContent = "";
    if(limited || (S.wrongPenalty && !S.revival)){
      let pen;
      if(limited){
        pen = 10;
      }else if(S.solo){
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
    S.wrongSet.add(S.curQ.en + "|" + S.curQ.cn + "|" + S.curQ.kind + "|" + (S.curQ.tag || ""));
    beep(220, .18);
  }
  syncStats();
  if(limited) checkScoreEnd();
}
/* 限分模式的即时胜负：淘汰制有人扣到 0 判负，累加制有人到达满分判胜。
   判定后锁住双方、停掉计时，稍等一拍（让分数飘字播完）再进结算。 */
function checkScoreEnd(){
  if(S.pendingNext) return;
  const cap = S.scoreCap;
  const hit = S.scoreMode === "knockout"
    ? (S.solo ? S.scores[0] <= 0 : S.scores.some(v => v <= 0))
    : (S.solo ? S.scores[0] >= cap : S.scores.some(v => v >= cap));
  if(!hit) return;
  S.endReason = S.scoreMode;
  S.ending = true;
  S.pendingNext = true;
  clearQuestionTimer();
  [1,2].forEach(k=>{
    S.locked[k-1] = true;
    $("side"+k).classList.add("locked");
  });
  setTimeout(()=>{ if(S.pendingNext) endBattle(); }, 900);
}
/* 顶栏实时统计（每判定一题刷新一次）：
   双人 —— 各自「已答题数（= 正 + 错）」与正答 / 错答；
   单人 —— 右侧显示本回合已答题数（S.done）与两侧合并的正误，左侧卡片收起。 */
function syncStats(){
  const put = (id, v) => { const el = $(id); if(el) el.textContent = v; };
  if(S.solo){
    put("qd2", S.done || 0);
    put("qr2", S.right[0] + S.right[1]);
    put("qw2", S.bad[0] + S.bad[1]);
    return;
  }
  [1,2].forEach(k=>{
    put("qd" + k, S.right[k-1] + S.bad[k-1]);
    put("qr" + k, S.right[k-1]);
    put("qw" + k, S.bad[k-1]);
  });
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
  if(S.ended) return;
  S.ended = true;
  clearInterval(S.timer);
  clearQuestionTimer();
  const [a,b] = S.scores;
  /* 临时赛（noRecord）不记录战绩、不收录错词、不更新擂主；
     临时体验（无班级，手输名字试玩）同样不落库，只在本次会话里保留比分与错词 */
  if(!S.revival && !S.noRecord && S.cls){
    /* ① 错词记录本：每场正常对局（单人 / 双人）的错词都收录，与「错词优先复现」
         开关无关 —— 那个开关只决定下一局要不要插错词。加时赛不重复收录。 */
    recordWrongBook();
    /* ② 战绩与最高连击 */
    const h = loadHis(S.cls);
    /* 限分模式把模式与满分一并记下，战绩列表里可回看是哪一种玩法 */
    const modeInfo = S.scoreMode === "open" ? {} : { mode:S.scoreMode, cap:S.scoreCap };
    if(S.solo){
      /* 单人作答按「单人记录」保存：只有名字、总分与题量，不参与胜负统计与擂主 */
      h.matches.push(Object.assign({t:Date.now(), solo:1, p:S.p1, s:a, unit:S.units.join("+")}, modeInfo));
    }else{
      h.matches.push(Object.assign({t:Date.now(), p1:S.p1, p2:S.p2, s1:a, s2:b, unit:S.units.join("+")}, modeInfo));
      [S.p1, S.p2].forEach((n,i)=>{
        if(S.maxStreak[i] > (h.streaks[n]||0)) h.streaks[n] = S.maxStreak[i];
      });
    }
    saveHis(S.cls, h);
  }
  if(!S.noRecord && S.rememberWrong && S.cls){
    /* 待复现名单更新（加时赛同样生效，仅当开启「错词优先复现」时维护）：
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
    /* 单人：限分模式到点即结束，文案说明是「见底」还是「达标」 */
    if(S.endReason === "knockout") title = dispName(S.p1) + " 分数见底，作答结束";
    else if(S.endReason === "accumulate") title = dispName(S.p1) + " 达成 " + S.scoreCap + " 分！";
    else title = dispName(S.p1) + " 完成作答";
  }else if(S.endReason === "knockout"){
    const dead = a <= 0 ? S.p1 : S.p2;
    const win  = a <= 0 ? S.p2 : S.p1;
    title = dispName(dead) + " 被淘汰，" + dispName(win) + " 获胜！";
  }else if(S.endReason === "accumulate"){
    const win = a >= S.scoreCap ? S.p1 : S.p2;
    title = dispName(win) + " 率先拿到 " + S.scoreCap + " 分！";
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
  S.resultTitle = title;
  S.resultColor = (S.solo || a===b) ? "#3a4150" : (a>b ? "#e05555" : "#4a7fe0");
  $("winName").style.color = S.resultColor;
  /* 临时体验（无班级）不写战绩，结算页明确告知；单人作答同样不区分胜负 */
  const modeTag = S.revival ? ""
    : (S.scoreMode === "knockout" ? "淘汰制 " + S.scoreCap + " 分 · "
      : S.scoreMode === "accumulate" ? "累加制 " + S.scoreCap + " 分 · " : "");
  const scopeTxt = modeTag + (S.revival ? "错词加时赛"
    : (S.solo
        ? ("单人作答" + (S.cls ? "" : " · 不记录战绩"))
        : (S.cls ? S.units.length + " 个词库" : "临时体验 · 不记录战绩")));
  S.resultScope = scopeTxt;
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

/* ================== 保存作答结果（导出独立 HTML） ==================
   把结算页原样存成一份可离线打开的网页：奖杯、标题、比分、正误、题量、错词本都在；
   去掉「返回主页 / 加时赛 / 保存」这些在线交互按钮，只留信息。 */
function pad2(n){ n = String(n); return n.length < 2 ? "0" + n : n; }
function resultStamp(){
  const d = new Date();
  return {
    day: d.getFullYear() + "-" + pad2(d.getMonth()+1) + "-" + pad2(d.getDate()),
    hm: pad2(d.getHours()) + ":" + pad2(d.getMinutes()),
    file: "" + d.getFullYear() + pad2(d.getMonth()+1) + pad2(d.getDate())
      + "_" + pad2(d.getHours()) + pad2(d.getMinutes())
  };
}

/* 导出的网页自带样式，不依赖 style.css，双击就能看 */
const RESULT_HTML_CSS = [
":root{--red:#e05555;--red-d:#c0392b;--red-bg:#fdecea;--blue:#4a7fe0;--blue-d:#2c5cb8;",
"      --ink:#1f242e;--ink2:#3a4150;--muted:#79808f;--line:#e3e8f1;--ok:#27a457;--ok-bg:#e9f9ef;}",
"*{box-sizing:border-box;}",
"body{margin:0;min-height:100vh;font-family:'Microsoft YaHei','PingFang SC','Segoe UI',sans-serif;",
"     font-size:26px;line-height:1.42;color:var(--ink);background-color:#eef1f8;",
"     background-image:radial-gradient(1100px 620px at 50% -8%,#fff 0%,#eef1f8 58%,#e6ebf5 100%);}",
".wrap{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;",
"      padding:30px 6vw;text-align:center;}",
".crown{font-size:88px;line-height:1.1;}",
".win{font-size:58px;font-weight:800;margin:8px 0 6px;line-height:1.2;}",
".score{font-size:40px;color:var(--ink2);margin-bottom:6px;}",
".score .r{color:var(--red);font-weight:800;}",
".score .b{color:var(--blue);font-weight:800;}",
".accRow{display:flex;justify-content:center;gap:64px;margin-top:10px;}",
".acc{display:flex;flex-direction:column;align-items:center;line-height:1.15;}",
".acc b{font-size:30px;font-weight:800;font-variant-numeric:tabular-nums;}",
".acc.red b{color:var(--red);}",
".acc.blue b{color:var(--blue);}",
".acc i{font-style:normal;font-size:20px;color:var(--muted);letter-spacing:1px;margin-top:2px;}",
".mini{font-size:21px;color:var(--muted);margin-top:8px;}",
".wrongBox{background:#fff;border:1px solid var(--line);border-radius:18px;padding:20px 26px;",
"          max-width:900px;width:100%;box-shadow:0 3px 14px rgba(28,39,72,.06);margin-top:26px;}",
".wrongBox h4{font-size:28px;color:var(--red-d);margin:0 0 14px;}",
".chips{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;}",
".chips span{background:var(--red-bg);color:var(--red-d);border-radius:12px;padding:8px 18px;font-size:26px;}",
".chips span.ok{background:var(--ok-bg);color:#1d7a3f;}",
".foot{margin-top:26px;font-size:18px;color:var(--muted);letter-spacing:1px;}",
"@media (max-width:820px){",
"  .win{font-size:40px;} .score{font-size:30px;} .crown{font-size:64px;}",
"  .accRow{gap:40px;} .acc b{font-size:24px;} .acc i{font-size:15px;}",
"  .wrongBox h4{font-size:22px;} .chips span{font-size:22px;} .mini{font-size:18px;} .foot{font-size:15px;}",
"}",
"@media print{",
"  body{background:#fff;}",
"  .wrap{min-height:auto;padding:24px;}",
"  .wrongBox{box-shadow:none;}",
"}"
].join("\n");

function buildResultHtml(){
  const [a, b] = S.scores;
  const st = resultStamp();
  const dur = S.dur >= 60 ? (S.dur/60) + " 分钟" : S.dur + " 秒";
  const title = S.resultTitle || (dispName(S.p1) + " 完成作答");
  const color = S.resultColor || "#3a4150";
  const score = S.solo
    ? '<span class="r">' + esc(dispName(S.p1)) + " " + a + "</span>"
    : '<span class="r">' + esc(dispName(S.p1)) + " " + a + "</span> : " + b
      + ' <span class="b">' + esc(dispName(S.p2)) + "</span>";
  const acc = S.solo
    ? '<div class="accRow"><div class="acc red"><b>' + (S.right[0] + S.right[1]) + "/" + (S.bad[0] + S.bad[1])
      + '</b><i>正答/错答</i></div></div>'
    : '<div class="accRow">'
      + '<div class="acc red"><b>' + S.right[0] + "/" + S.bad[0] + '</b><i>正答/错答</i></div>'
      + '<div class="acc blue"><b>' + S.right[1] + "/" + S.bad[1] + '</b><i>正答/错答</i></div>'
      + "</div>";
  const wrongs = [...S.wrongSet].map(w => w.split("|"));
  const chips = wrongs.length
    ? wrongs.map(([en, cn]) => "<span>" + esc(en) + (cn ? "　" + esc(cn) : "") + "</span>").join("")
    : '<span class="ok">全对！零错词 🎉</span>';
  const cls = S.cls ? esc(S.cls) : "临时体验（未选班级）";
  return [
    "<!DOCTYPE html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>词汇擂台 PK · " + esc(title) + "</title>",
    "<style>",
    RESULT_HTML_CSS,
    "</style>",
    "</head>",
    "<body>",
    '<div class="wrap">',
    '<div class="crown">🏆</div>',
    '<div class="win" style="color:' + color + '">' + esc(title) + "</div>",
    '<div class="score">' + score + "</div>",
    acc,
    '<div class="mini">' + esc(S.resultScope || "")
      + " · " + dur + " · 共答 " + S.asked + " 道题</div>",
    '<div class="wrongBox">',
    "<h4>错词/错块本（本局错的单词与词块）</h4>",
    '<div class="chips">' + chips + "</div>",
    "</div>",
    '<div class="foot">' + cls + "　·　" + st.day + " " + st.hm + "　·　词汇擂台 PK</div>",
    "</div>",
    "</body>",
    "</html>"
  ].join("\n");
}

function resultFileName(){
  const cls = (S.cls || "临时体验").replace(/[\\/:*?"<>|\s]/g, "");
  return "词汇擂台_" + cls + "_" + resultStamp().file + ".html";
}

function saveResult(){
  const name = resultFileName();
  try{
    const blob = new Blob([buildResultHtml()], {type:"text/html;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 15000);
    dlgAlert("已保存「" + esc(name) + "」<br>双击就能用浏览器打开，也可以直接发给学生。",
      { type:"success", title:"已保存", html:true });
  }catch(e){
    dlgAlert("保存失败：" + e.message, { type:"error", title:"保存失败" });
  }
}

/* ================== 初始化 ==================
   分两阶段：
   ① 立即渲染不依赖词库的 UI（班级名单、擂主、战绩、配置），从 localStorage 读取，无网络延迟
   ② 异步并行加载词库 JSON，完成后补建索引、题池提示和词库按钮状态
   避免慢网络下词库 fetch 阻塞名单/擂主显示。 */
(async function init(){
  /* ⓪ 早期版本的全局错词本按班级拆开（只搬一次，无旧数据时直接跳过） */
  migrateWrongBook();
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
