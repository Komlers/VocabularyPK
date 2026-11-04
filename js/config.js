"use strict";

/* ================== 词库：从 lib/ 目录加载 ==================
   文件命名：lib/{书号}{单元}.json
     b1u1~b1u5 = 必修一 Unit 1~5
     b2u1~b2u5 = 必修二 Unit 1~5
     b3u1~b3u5 = 必修三 Unit 1~5
     b4u1~b4u5 = 选择性必修一 Unit 1~5
     b5u1~b5u5 = 选择性必修二 Unit 1~5
   词库随仓库维护，部署后由浏览器 fetch 读取；
   直接双击 index.html（file://）会被浏览器拦截本地 JSON 请求，请用 http:// 访问。 */
let LIB = [];      // [英文, 中文, 单元标签]
let CHUNKS = [];   // 词块表 [英文,中文,家族,题干,答案,重组片段,词库tag]（下标6为内部标记）
let LIB_INFO = {}; // tag -> { name, file } 词库展示名
const WORD_BANK_FILES = [
  { file:"b1u1", tag:"B1U1" }, { file:"b1u2", tag:"B1U2" }, { file:"b1u3", tag:"B1U3" },
  { file:"b1u4", tag:"B1U4" }, { file:"b1u5", tag:"B1U5" },
  { file:"b2u1", tag:"B2U1" }, { file:"b2u2", tag:"B2U2" }, { file:"b2u3", tag:"B2U3" },
  { file:"b2u4", tag:"B2U4" }, { file:"b2u5", tag:"B2U5" },
  { file:"b3u1", tag:"B3U1" }, { file:"b3u2", tag:"B3U2" }, { file:"b3u3", tag:"B3U3" },
  { file:"b3u4", tag:"B3U4" }, { file:"b3u5", tag:"B3U5" },
  { file:"b4u1", tag:"U1" }, { file:"b4u2", tag:"U2" }, { file:"b4u3", tag:"U3" },
  { file:"b4u4", tag:"U4" }, { file:"b4u5", tag:"U5" },
  { file:"b5u1", tag:"X2U1" }, { file:"b5u2", tag:"X2U2" }, { file:"b5u3", tag:"X2U3" },
  { file:"b5u4", tag:"X2U4" }, { file:"b5u5", tag:"X2U5" }
];
const CUSTOM_LIB_KEY = "vpk_custom_libs";  /* 自定义词库持久化键 */

/* ================== 版本与更新提示 ==================
   每次发布更新时修改 APP_VERSION，并在 res/update.md 写明更新内容。
   已读版本号存 localStorage（UPDATE_READ_KEY），版本不同则弹窗提醒。 */
const APP_VERSION = "2.1";
const UPDATE_READ_KEY = "vpk_update_read";
const UPDATE_MD_URL = "res/update.md";

/* ================== 题量方案（按挑战时长自动配比） ==================
   w=单词题，c1=词块选义，c2=词块配对，c3=词块重组
   ⚠️ PLAN 只决定「开场前 N 题的配比」，**不再是题池总上限**。
   题池 = 当前检查范围内的**全部可用词条**（每个单词/词块各出一次），
   开场题按 PLAN 配比排在前面，其余全部续在题池尾部 → 任意时长都不会循环重复同一批词汇。 */
const PLAN = {
  120:{w:5,  c1:4,  c2:2, c3:1},
  180:{w:7,  c1:6,  c2:3, c3:2},
  240:{w:10, c1:8,  c2:4, c3:3},
  300:{w:13, c1:10, c2:5, c3:4}
};
const PAIR_POOL = ["of","to","for","with","from","into","on","about","as","in","against","by","up","out","over","at"];

/* 词块/单词索引（buildIndex 填充） */
let chunkIdxByEn = {};   // 词块英文 -> CHUNKS 下标
let wordByEn = {};        // 单词英文 -> LIB 词条

/* ================== 全局状态 ================== */
const $ = id => document.getElementById(id);
let S = {
  cls:"", p1:"红方选手", p2:"蓝方选手",
  units:[], useChunks:false, dur:60, wordsOnly:false, noRecord:false, rememberWrong:false,
  questionTimeout:true, questionTimeoutDur:5, qTimer:null, mode:"mix",
  pool:[], qi:0, round:1, scores:[0,0], streak:[0,0], maxStreak:[0,0],
  right:[0,0], bad:[0,0],   /* 双方各自的答对 / 答错题数，仅用于结算页展示 */
  locked:[false,false], timer:null, left:0, pendingNext:false,
  wrongSet:new Set(), revival:false, basePoints:10, curQ:null, reviewList:[],
  trialChamp:""   /* 临时体验（无班级）时的擂主：只在本会话内继承，不写 localStorage */
};
let redName = "", blueName = "", champFixed = false, manualMode = false, drawnPool = [];
let pickSide = "red";       /* 选名弹窗当前选中方 */
let tempUnits = [];          /* 词库弹窗临时选择 */
let pendingClass = "";       /* 导入名单时暂存班级名 */
let pendingImportInEditor = false;  /* 导入是否从名单编辑器发起（决定导入后刷新范围） */

/* ================== 工具 ================== */
const shuffle = a => { a=a.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
const esc = s => s.replace(/&/g,"&amp;").replace(/</g,"&lt;");
/* 显示用名字：去掉 @ 前缀（内部标记，前端不可见） */
const dispName = n => n ? String(n).replace(/^@\s*/, "") : n;
