"use strict";

/* ================== 词库：从 lib/ 目录加载 ==================
   文件命名：lib/{书号}{单元}.json
     b1u1~b1u5 = 必修一 Unit 1~5
     b2u1~b2u5 = 必修二 Unit 1~5
     b3u1~b3u5 = 必修三 Unit 1~5
     b4u1~b4u5 = 选择性必修一 Unit 1~5
     b5u1~b5u5 = 选择性必修二 Unit 1~5
     b6u1~b6u5 = 选择性必修三 Unit 1~5
     b7u1~b7u5 = 选择性必修四 Unit 1~5
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
  { file:"b5u4", tag:"X2U4" }, { file:"b5u5", tag:"X2U5" },
  { file:"b6u1", tag:"X3U1" }, { file:"b6u2", tag:"X3U2" }, { file:"b6u3", tag:"X3U3" },
  { file:"b6u4", tag:"X3U4" }, { file:"b6u5", tag:"X3U5" },
  { file:"b7u1", tag:"X4U1" }, { file:"b7u2", tag:"X4U2" }, { file:"b7u3", tag:"X4U3" },
  { file:"b7u4", tag:"X4U4" }, { file:"b7u5", tag:"X4U5" }
];
const CUSTOM_LIB_KEY = "vpk_custom_libs";  /* 自定义词库持久化键 */

/* ================== 版本与更新提示 ==================
   每次发布更新时修改 APP_VERSION，并在 res/update.md 写明更新内容。
   已读版本号存 localStorage（UPDATE_READ_KEY），版本不同则弹窗提醒。 */
const APP_VERSION = "2.2";
const UPDATE_READ_KEY = "vpk_update_read";
const UPDATE_MD_URL = "res/update.md";

/* ================== 配对题干扰项的词块尾词库 ==================
   词块配对题（c2）从这些介词/副词里取干扰项。 */
const PAIR_POOL = ["of","to","for","with","from","into","on","about","as","in","against","by","up","out","over","at"];

/* 词块/单词索引（buildIndex 填充） */
let chunkIdxByEn = {};   // 词块英文 -> CHUNKS 下标
let wordByEn = {};        // 单词英文 -> LIB 词条

/* ================== 全局状态 ================== */
const $ = id => document.getElementById(id);
let S = {
  cls:"", p1:"红方选手", p2:"蓝方选手",
  units:[], useChunks:false, dur:60, wordsOnly:false, noRecord:false, rememberWrong:false,
  solo:false,   /* 本次PK为单人作答：两侧共用一个总分，另一侧只作补救通道 */
  questionTimeout:true, questionTimeoutDur:5, qTimer:null, mode:"mix",
  comboBonus:true, wrongPenalty:false,   /* 连击加分 / 答错扣分（擂台设置） */
  scoreMode:"open",        /* 计分模式：open 无限制 / knockout 淘汰制 / accumulate 累加制 */
  scoreCap:100,            /* 限分模式的满分（50 / 100 / 150） */
  endReason:"time",        /* 本局结束原因：time / knockout / accumulate，供结算文案区分 */
  ending:false, ended:false,   /* ending=已判定胜负、等结算；ended=本局已入账，防重复结算 */
  ending:false, ended:false,   /* ending=已判定胜负正在等结算；ended=本局已结算，防重复入账 */
  pool:[], qi:0, round:1, scores:[0,0], streak:[0,0], maxStreak:[0,0],
  right:[0,0], bad:[0,0],   /* 双方各自的答对 / 答错题数，仅用于结算页展示 */
  badStreak:[0,0],          /* 连续答错次数：答错扣分递增用，答对即清零 */
  asked:0,                  /* 本局出现过的题目总数（含超时跳过、双方都没答的） */
  done:0,                   /* 本局已判定过的题目数（有作答、非超时），供单人模式实时统计 */
  locked:[false,false], timer:null, left:0, pendingNext:false,
  wrongSet:new Set(), revival:false, basePoints:10, curQ:null, reviewList:[],
  trialChamp:""   /* 临时体验（无班级）时的擂主：只在本会话内继承，不写 localStorage */
};
let redName = "", blueName = "", champFixed = false, manualMode = false, drawnPool = [];
let pickSide = "red";       /* 选名弹窗当前选中方 */
let tempUnits = [];          /* 词库弹窗临时选择 */
let libOpenBooks = new Set();  /* 词库弹窗里已展开的册（b1~b7）；默认只展开有已选词库的册 */
let pendingClass = "";       /* 导入名单时暂存班级名 */
let pendingImportInEditor = false;  /* 导入是否从名单编辑器发起（决定导入后刷新范围） */

/* ================== 工具 ================== */
const shuffle = a => { a=a.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
const esc = s => s.replace(/&/g,"&amp;").replace(/</g,"&lt;");
/* 显示用名字：去掉 @ 前缀（内部标记，前端不可见） */
const dispName = n => n ? String(n).replace(/^@\s*/, "") : n;
