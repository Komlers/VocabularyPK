#!/usr/bin/env node
/* ==================================================================
 * bilibili 分支专用：把 Service Worker 与 PWA 相关的东西全部去掉。
 *
 * 为什么：B站 Toy 把作品放在 www.bilibili.com/toy/<slug>/ 子路径下，
 * SW 一旦装好就会从第二次打开起接管该作用域的同源请求，平台一换部署
 * 路径就白屏 / 成片 404（详见 res/intro.md「Service Worker 策略」）。
 * 这个分支只投 Toy，不提供「安装为桌面应用 / 断网可用」，所以整块删掉。
 *
 * 用法（每次把 main merge 进 bilibili 之后跑一次，然后提交）：
 *     node tools/strip-pwa.js
 *
 * 脚本是幂等的：已经删掉的条目会提示 skip，反复跑不会改坏东西。
 * 只动 index.html / js/ui.js / js/events.js / style.css 四个文件，
 * 以及删除 sw.js、js/pwa.js、manifest.webmanifest。
 * ================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");

const DELETE_FILES = ["sw.js", "js/pwa.js", "manifest.webmanifest"];

/* 每条：文件 → 正则 → 替换 → 说明。from 必须带 g 标志时自行写 flags。 */
const EDITS = [
  {
    file: "index.html",
    re: /<!-- =+ 安装为桌面应用[^\n]*-->\s*\n<button id="installBtn"[\s\S]*?<\/button>\s*\n\s*\n/,
    to: "",
    label: "移除「安装」按钮与它的注释"
  },
  {
    file: "index.html",
    re: /^<meta name="apple-mobile-web-app-capable"[^\n]*\n/gm,
    to: "",
    label: "移除 apple-mobile-web-app-capable"
  },
  {
    file: "index.html",
    re: /^<meta name="apple-mobile-web-app-status-bar-style"[^\n]*\n/gm,
    to: "",
    label: "移除 apple-mobile-web-app-status-bar-style"
  },
  {
    file: "index.html",
    re: /^<meta name="apple-mobile-web-app-title"[^\n]*\n/gm,
    to: "",
    label: "移除 apple-mobile-web-app-title"
  },
  {
    file: "index.html",
    re: /^<link rel="manifest"[^\n]*\n/gm,
    to: "",
    label: "移除 manifest 引用"
  },
  {
    file: "index.html",
    re: /^<link rel="apple-touch-icon"[^\n]*\n/gm,
    to: "",
    label: "移除 apple-touch-icon"
  },
  {
    file: "index.html",
    re: /^<script src="js\/pwa\.js\?v=\d+"><\/script>\n/gm,
    to: "",
    label: "移除 pwa.js 脚本引用"
  },
  {
    file: "js/ui.js",
    re: /  const install = \$\("installBtn"\);\n  if\(install\) install\.classList\.toggle\("hidden", inBattle \|\| install\.dataset\.ready !== "1"\);\n/,
    to: "",
    label: "ui.js：syncCornerBtns 去掉安装按钮分支"
  },
  {
    file: "js/ui.js",
    re: /\/\* =+ 角按钮显隐（安装 \/ 终止） =+\n   左上角：主界面显示「安装」（浏览器允许安装时），比赛中换成「终止」；\n   右上角的全屏按钮三种界面都在，不参与切换。/,
    to: "/* ================== 角按钮显隐（终止） ==================\n   左上角：只在比赛中显示「终止」；右上角的全屏按钮三种界面都在，不参与切换。",
    label: "ui.js：更新角按钮注释"
  },
  {
    file: "js/events.js",
    re: /  \/\* 安装 \/ 终止按钮与全屏按钮同步：全屏时一起变淡，窗口模式时都是实心 \*\/\n  \[\$\("installBtn"\), \$\("abortBtn"\)\]\.forEach\(b=>\{ if\(b\) b\.classList\.toggle\("on", on\); \}\);/,
    to: "  /* 终止按钮与全屏按钮同步：全屏时一起变淡，窗口模式时都是实心 */\n  const abortBtn = $(\"abortBtn\");\n  if(abortBtn) abortBtn.classList.toggle(\"on\", on);",
    label: "events.js：syncFsBtn 只同步终止按钮"
  },
  {
    file: "style.css",
    re: /\/\* =+ 角按钮：安装 \/ 终止 \/ 全屏 =+ \*\//,
    to: "/* ============ 角按钮：终止 / 全屏 ============ */",
    label: "style.css：更新角按钮注释"
  },
  {
    file: "style.css",
    re: /  #fsBtn,#installBtn,#abortBtn\{/,
    to: "  #fsBtn,#abortBtn{",
    label: "style.css：角按钮基础规则去掉 #installBtn"
  },
  {
    file: "style.css",
    re: /  \/\* 安装按钮固定在左上角，与右上角全屏按钮左右对称；\n     不透明度跟随全屏状态，与「全屏\/退出」按钮完全一致 \*\/\n  #fsBtn\{right:18px;\}\n  #installBtn,#abortBtn\{left:18px;\}\n  #installBtn:disabled\{cursor:default;\}\n  #fsBtn:hover,#installBtn:hover\{/,
    to: "  /* 终止按钮固定在左上角，与右上角全屏按钮左右对称；\n     不透明度跟随全屏状态，与「全屏/退出」按钮完全一致 */\n  #fsBtn{right:18px;}\n  #abortBtn{left:18px;}\n  #fsBtn:hover{",
    label: "style.css：定位与悬停规则去掉 #installBtn"
  },
  {
    file: "style.css",
    re: /  #fsBtn:active,#installBtn:active,#abortBtn:active\{/,
    to: "  #fsBtn:active,#abortBtn:active{",
    label: "style.css：按下态去掉 #installBtn"
  },
  {
    file: "style.css",
    re: /  #fsBtn svg,#installBtn svg,#abortBtn svg\{/,
    to: "  #fsBtn svg,#abortBtn svg{",
    label: "style.css：图标尺寸去掉 #installBtn"
  },
  {
    file: "style.css",
    re: /  \/\* 安装 \/ 终止按钮与全屏按钮同步变淡，保证三者在对战时观感一致 \*\/\n  #installBtn\.on,#abortBtn\.on\{/,
    to: "  /* 终止按钮与全屏按钮同步变淡，保证两者在对战时观感一致 */\n  #abortBtn.on{",
    label: "style.css：变淡规则去掉 #installBtn"
  },
  {
    file: "style.css",
    re: /html\.no-flex-gap #fsBtn > \* \+ \*, html\.no-flex-gap #installBtn > \* \+ \*,\nhtml\.no-flex-gap #abortBtn > \* \+ \*/,
    to: "html.no-flex-gap #fsBtn > * + *, html.no-flex-gap #abortBtn > * + *",
    label: "style.css：老内核间距回退去掉 #installBtn"
  },
  {
    file: "style.css",
    re: /左右留出角按钮（终止 \/ 安装 与 全屏）的宽度/,
    to: "左右留出角按钮（终止与全屏）的宽度",
    label: "style.css：更新 #battle 注释"
  },
  /* ---- 应用内文档：Toy 版没有「安装」，别让用户照着找不到按钮 ---- */
  {
    file: "res/about.md",
    re: /^## 安装为桌面应用\n[\s\S]*?(?=^## )/m,
    to: "",
    label: "about.md：移除「安装为桌面应用」一节"
  },
  {
    file: "res/tips.md",
    re: /^## 十、安装为桌面应用\n[\s\S]*?(?=^## 十一、)/m,
    to: "",
    label: "tips.md：移除「十、安装为桌面应用」一节"
  },
  {
    file: "res/tips.md",
    re: /（主界面的「安装」按钮此时让位给它）/g,
    to: "",
    label: "tips.md：终止说明去掉「安装按钮让位」的括注"
  },
  {
    file: "res/tips.md",
    re: /^## 十一、本地保存$/m,
    to: "## 十、本地保存",
    label: "tips.md：十一 → 十（本地保存）"
  },
  {
    file: "res/tips.md",
    re: /^## 十二、渲染设置$/m,
    to: "## 十一、渲染设置",
    label: "tips.md：十二 → 十一（渲染设置）"
  },
  {
    file: "res/tips.md",
    re: /^## 十三、快捷键$/m,
    to: "## 十二、快捷键",
    label: "tips.md：十三 → 十二（快捷键）"
  }
];

function read(rel) {
  /* 统一按 LF 处理：仓库里存的就是 LF，工作区可能被 autocrlf 换成 CRLF，
     不归一化的话带 ^...\n$ 的正则会漏匹配（两套换行都试一遍太啰嗦）。 */
  return fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
}
function write(rel, text) {
  fs.writeFileSync(path.join(ROOT, rel), text);
}

let changed = 0, skipped = 0;
for (const ed of EDITS) {
  const src = read(ed.file);
  if (!ed.re.test(src)) {
    console.log("  skip  " + ed.file + " · " + ed.label);
    skipped++;
    continue;
  }
  const out = src.replace(ed.re, ed.to);
  write(ed.file, out);
  console.log("  done  " + ed.file + " · " + ed.label);
  changed++;
}

for (const rel of DELETE_FILES) {
  const abs = path.join(ROOT, rel);
  if (fs.existsSync(abs)) {
    fs.unlinkSync(abs);
    console.log("  del   " + rel);
    changed++;
  } else {
    console.log("  skip  " + rel + "（已不存在）");
    skipped++;
  }
}

/* 收尾自检：这四个文件里不该再有 PWA / SW 的痕迹 */
const LEFTOVER = /installBtn|installLabel|pwa\.js|serviceWorker|manifest\.webmanifest|apple-touch-icon|apple-mobile-web-app/;
const CHECK = ["index.html", "js/ui.js", "js/events.js", "style.css"];
let dirty = false;
for (const rel of CHECK) {
  const hit = read(rel).split(/\r?\n/).filter(l => LEFTOVER.test(l));
  if (hit.length) {
    dirty = true;
    console.log("\n! " + rel + " 仍有残留：");
    hit.forEach(l => console.log("    " + l.trim()));
  }
}

console.log("\n完成：改动 " + changed + " 项，跳过 " + skipped + " 项。");
if (dirty) {
  console.log("仍有残留，请手查上面列出的行。");
  process.exitCode = 1;
} else {
  console.log("已无 SW / PWA 残留。commit 一下即可。");
}
