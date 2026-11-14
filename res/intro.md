# 深入说明（实现与开发）

面向想改代码、二次部署或排查问题的人。只想拿来上课的话，看 [README](../README.md) 与 [使用说明](tips.md) 就够了。

- 浏览器与内核要求：[require.md](require.md)
- 词库格式：[custom.md](custom.md)、[template/template.md](../template/template.md)
- 名单导入：[import.md](import.md)

---

## 一、技术栈与架构

- **原生 HTML5 / CSS3 / JavaScript**，无框架、无构建、无依赖，源码即产物。
- 单页应用：三块 `.screen`（主页 `setup` / 对战 `battle` / 结算 `result`）靠 class 切换，所有弹窗结构都写在 `index.html` 里。
- 全局状态集中在 `S`（`js/config.js`），各模块以全局函数协作，事件统一在 `js/events.js` 绑定。
- 词库与帮助文档用 `fetch` 加载（`lib/*.json`、`res/*.md`），Markdown 由 `ui.js` 里的 `mdToHtml()` 在本地转换成 HTML。
- PWA：`manifest.webmanifest` + `sw.js`，支持安装为桌面应用与断网打开。

---

## 二、目录结构

```
vcpk/
├── index.html            # 主页面（含全部弹窗结构）
├── 404.html              # 404 页面（样式按当前站点根目录解析）
├── style.css             # 全局样式（含老内核回退段）
├── manifest.webmanifest  # PWA 清单
├── sw.js                 # Service Worker（安装条件 + 离线外壳）
├── favicon.ico
├── sample.txt            # 名单示例
├── icons/                # PWA 图标（96 / 128 / 192 / 256 / 512）
├── js/
│   ├── config.js         # 全局配置、词库注册、状态 S、字体与计分常量
│   ├── storage.js        # localStorage 读写（含写入保护）、名单解析
│   ├── wordbank.js       # 词库加载/校验、题池构建、干扰项、错词复现
│   ├── ui.js             # 页面渲染、Markdown 转换、配置恢复、词库选择
│   ├── dialog.js         # 网页内 alert / confirm / prompt
│   ├── editor.js         # 名单编辑器
│   ├── game.js           # 对战流程、计时、计分、结算、导出结算页
│   ├── wrongbook.js      # 错词记录本（累计、分组、导出 HTML）
│   ├── data.js           # 数据管理（备份导出 / 导入、按班级与类别清理）
│   ├── events.js         # 事件绑定、全屏、离开保护
│   ├── a11y.js           # 弹窗无障碍：role/aria、焦点进出、Esc、Tab 循环
│   └── pwa.js            # 安装引导（注册 SW、安装按钮显隐）
├── lib/                  # 内置词库（36 个 JSON，见第六节）
├── res/                  # 在线文档（弹窗内加载）
│   ├── update.md         # 当前版本更新说明
│   ├── tips.md           # 使用说明
│   ├── intro.md          # 本文
│   ├── require.md        # 浏览器 / 系统需求
│   ├── import.md         # 名单添加帮助
│   └── custom.md         # 自定义词库制作帮助
├── old/                  # 历史版本更新说明（v2.0 ~ v2.2）
└── template/
    ├── template.json     # 自定义词库模板
    └── template.md       # 词库字段说明
```

---

## 三、脚本加载顺序与全局状态

脚本按依赖顺序串行加载（`index.html` 末尾）：

| 顺序 | 文件 | 主要职责 |
|---|---|---|
| 1 | `config.js` | 常量、`S`、词库清单、字体与计分选项 |
| 2 | `storage.js` | localStorage 读写、`lsSet()` 写入保护、名单解析 |
| 3 | `wordbank.js` | 加载 / 校验词库、建索引、题池、干扰项 |
| 4 | `ui.js` | 渲染、页面切换、Markdown、配置恢复、字号与动画 |
| 5 | `dialog.js` | 通用弹窗 |
| 6 | `editor.js` | 名单编辑器 |
| 7 | `game.js` | 对战与结算 |
| 8 | `wrongbook.js` | 错词记录本 |
| 9 | `data.js` | 数据管理 |
| 10 | `events.js` | 事件绑定 |
| 11 | `a11y.js` | 弹窗无障碍（只依赖 DOM，放在事件之后） |
| 12 | `pwa.js` | Service Worker 与安装按钮 |

约定：

- 后加载的脚本可以直接调用先加载的函数；反向调用只发生在运行时（例如 `wordbank.js` 里删词库时调用 `ui.js` 的 `updateLibBtn()`，带 `typeof` 守卫）。
- **新增脚本要同时改两处**：`index.html` 的 `<script src>` 与 `sw.js` 的 `SHELL` 清单，否则断网时缺文件。
- 全局状态都在 `S` 里（含 `pool` / `qi` / `scores` / `left` 等对战中间态），不要在模块里另存副本。

---

## 四、出题算法

### 题池构建 `buildPool()`

1. **取词**：`wordSource()` 按 `S.units` 过滤 `LIB`；`chunkIdxInScope()` 按词块第 7 位的 tag 过滤 `CHUNKS`。
2. **去重**：以英文为键，一个词条一局只出一道题。启用词块时，`wordSource()` 会先滤掉与词块同名的单词，因此同名只出词块题；勾了「只加载纯单词」时反过来只出单词题。
3. **题型分配**：词块按下面的比例分到 c1 / c2 / c3。
4. **穿插**：`interleaveSpecs()` 按单词与词块的数量比例均匀交错，避免连续七八道同类题。
5. **错词优先**：`reviewSpecs()` 取到的复现题插在题池最前面。
6. **洗牌**：题池出完一轮后重新 `shuffle`，`S.round` 加一，不中途重复。

### 词块三题型分配 `chunkKindsFor()`

| 题型 | 名额 | 前提 |
|---|---|---|
| c3 词块重组 | 约 25% | 词块带重组片段 `c[5]`（至少 2 段） |
| c2 词块配对 | 约 35% | 词块带配对题干 `c[3]` |
| c1 词块选义 | 其余 | 无 |

先满足 c3（只分给带片段的词块），再分 c2，剩下都给 c1。若整池凑不出一道 c3，会从带片段的词块里临时借一道，保证每局至少出现一次重组题。

### 干扰项

| 题型 | 策略 |
|---|---|
| 单词选义 / 选词 | 同单元优先，不够时全书兜底；3 个干扰项互不相同且不等于答案 |
| 词块选义 | 同家族优先（`prep` / `phr` / `coll`），不够时放宽 |
| 词块配对 | 从 `PAIR_POOL`（常用介词 / 副词）里取，排除与答案重复的项 |
| 词块重组 | 优先取同家族词块的片段，保证不与答案自身片段重合 |

### 错词复现 `reviewSpecs()`

- 只在开启「错词优先复现」且已选词库时生效。
- 数据源是战绩里的 `wrongs`（按班级存），按出错次数降序，**只保留当前所选词库范围内的**词条，最多 8 个。
- 复现题答对即从名单移除，再错则次数 +1（在 `endBattle()` 里维护）。
- 另一份「错词记录本」（`vpk_wrongbook_<班级>`）与这个开关无关，每局正常对局都会收录。

### 题目方向

`S.mode` 为 `mix`（默认，随机英译中 / 中译英）、`e2c`、`c2e`。单词题会朗读英文（可在渲染设置里关掉）。

---

## 五、计分与结算

### 三种模式

| 模式 | 初始分 | 答对 | 答错 | 结束条件 |
|---|---|---|---|---|
| 无限制 `open`（默认） | 0 | `basePoints`（10）+ 连击加成 | 默认不扣；可开启按连错扣 5→20 | 时间到比总分 |
| 淘汰制 `knockout` | 满分（50/100/150） | +5，不超过满分 | -10，不低于 0 | 一方归零即输；时间到分少者输 |
| 累加制 `accumulate` | 0 | +5，不超过满分 | -10，不低于 0 | 一方到满分即赢；时间到分多者赢 |

淘汰制与累加制的加减分固定，`连击加分` / `答错扣分` 两个开关在这两种模式下隐藏。

### 无限制模式的细节

- 答对基础分 10；每多一层连击 +5，**单题最多 +20**（即 10 → 15 → 20 → 25 → 30）。
- `连击加分` 关闭时每题固定 10 分。
- `答错扣分` 开启后按连续答错扣 5 → 10 → 15 → 20；`连击加分` 关闭时每次固定 -5；最低扣到 0。
- 连击在三种情况下清零：自己答错、对方先答对同一题、整题超时。
- 单人模式下只有一条作答线，连续答错计数直接累加。

### 加时赛（错词复盘）

- 时长固定 30 秒，**不改写班级配置的限时**（`S.durMatch` 只影响本局）。
- 题池只取本局错词 / 错块；答对 +5、不扣分、不加连击奖励，也不触发限分模式的胜负判定。
- 不写战绩、不更新擂主、不重复收录错词；结束后仍可正常返回主页。

### 结束与守擂

- 时间到、一方归零（淘汰制）、一方达标（累加制）都会走 `endBattle()`。
- 守擂规则：有胜负 → 败者为下期擂主；平局 → 连击纪录低者守擂；平局且连击相同 → 换人；平局且双方全对 → 清空擂主。
- 临时赛（`S.noRecord`）、临时体验（无班级）、单人局都不更新擂主。

### 战绩字段

| 字段 | 含义 |
|---|---|
| `t` | 时间戳（`Date.now()`） |
| `p1` / `p2` / `s1` / `s2` | 双人局双方与比分 |
| `p` / `s` | 单人局选手与得分（`solo:1`） |
| `q` | 本局出过的题数 |
| `unit` | 本局词库 tag，多选时用 `+` 连接 |
| `mode` / `cap` | 限分模式的模式与满分（无限制不写） |

连击纪录存在 `h.streaks[名字]`，待复现错词存在 `h.wrongs[英文]`。

---

## 六、词库数据

### 内置词库覆盖

共 **36 个**，文件名规则 `lib/b{册}u{单元}.json`：

| 册 | 文件 | 单元主题 |
|---|---|---|
| 必修1 | `b1u0` ~ `b1u5` | Welcome Unit、Teenage Life、Travelling Around、Sports and Fitness、Natural Disasters、Languages Around the World |
| 必修2 | `b2u1` ~ `b2u5` | Cultural Heritage、Wildlife Protection、The Internet、History and Traditions、Music |
| 必修3 | `b3u1` ~ `b3u5` | Festivals and Celebrations、Morals and Virtues、Diverse Cultures、Space Exploration、The Value of Money |
| 选必1 | `b4u1` ~ `b4u5` | People of Achievement、Looking into the Future、Fascinating Parks、Body Language、Working the Land |
| 选必2 | `b5u1` ~ `b5u5` | Science and Scientists、Bridging Cultures、Food and Culture、Journey Across a Vast Land、First Aid |
| 选必3 | `b6u1` ~ `b6u5` | Art、Healthy Lifestyle、Environmental Protection、Adversity and Courage、Poems |
| 选必4 | `b7u1` ~ `b7u5` | Science Fiction、Iconic Attractions、Sea Exploration、Sharing、Launching Your Career |

### 文件结构

```json
{
  "name": "Unit 1 Teenage Life",
  "label": "必修1 U1",
  "words": [["teenage", "青少年的"]],
  "chunks": [["be worried about", "担心", "prep", "be worried ____", "about", ["be", "worried", "about"]]]
}
```

字段级说明见 [template/template.md](../template/template.md)。

### 内部表示

- `LIB`：`[英文, 中文, 词库 tag]`
- `CHUNKS`：`[英文, 中文, 家族, 配对题干, 答案, 重组片段, 词库 tag]`，**第 7 位（下标 6）是内部标记**，只在内存里存在，JSON 文件里是 6 项。
- `LIB_INFO`：`tag -> { name, label, title, file }`
- `WORD_BANK_FILES`：`{ file, tag }` 列表，决定词库顺序与分组。

tag 规则（历史原因，不完全统一）：

| 册 | tag |
|---|---|
| 必修1 ~ 必修3 | `B1U0` ~ `B3U5` |
| 选必1 | `U1` ~ `U5` |
| 选必2 ~ 选必4 | `X2U1` ~ `X4U5` |
| 自定义词库 | `C1`、`C2`…（运行时按空位分配） |

新增内置词库时：放 JSON 到 `lib/`，在 `WORD_BANK_FILES` 里登记，注意 tag 不要与现有重复，并更新本文与 README 的词库数量。

### 自定义词库的导入校验

`importCustomLib()` 会先清洗再入库（`cleanLibWords()` / `cleanLibChunks()`）：

- 单词必须是 `[非空字符串, 非空字符串]`，数字、`null`、缺字段一律跳过；重复单词静默去掉。
- 词块前五项必须是字符串，重组片段不足 2 段按「没有片段」处理。
- 全部不合规时直接报错；部分不合规时导入成功提示里会写明跳过几条。
- 已存在 localStorage 里的旧数据在 `loadCustomLibs()` 时也会过一遍，坏词条不进内存。

---

## 七、本地存储

### 键名

| 键 | 内容 |
|---|---|
| `vpk_rosters` | `{ 班级: [名字...] }` |
| `vpk_his_<班级>` | 战绩：`{ matches, streaks, wrongs }` |
| `vpk_champ_<班级>` | 当前擂主名字 |
| `vpk_wrongbook_<班级>` | 错词记录本：`{ 单元tag: { 词条键: {en,cn,kind,n,last} } }` |
| `vpk_cfg_<班级>` | 班级配置：词库、时长、计分模式、超时等 |
| `vpk_ui` | 设备级偏好：班级、临时赛、双人 / 单人、字体、动画档、音效等 |
| `vpk_custom_libs` | 自定义词库 `{ C1: { name, words, chunks } }` |
| `vpk_update_read` | 已读的版本号（不在备份范围内） |

错词本的「词条键」是 `英文 + "|" + 类型`（`w` 单词 / `c` 词块），同名单词与词块会分成两条。

无班级时（临时体验）不写 `vpk_his_` / `vpk_champ_` / `vpk_cfg_`，避免留下无主键。

### 写入保护

所有写入都走 `storage.js` 的 `lsSet()`：捕获 `QuotaExceededError` 后弹「⚠ 数据未能保存」，提示先导出备份再清理旧数据，每个会话只提示一次。导入自定义词库时若写不进去，会直接报错且不注册到内存。

### 备份文件

```json
{
  "app": "vpk",
  "kind": "backup | class",
  "version": "2.3",
  "exportedAt": "2026-11-14T05:00:00.000Z",
  "cls": "",
  "partIds": ["rosters", "history", "wrongbook", "cfg", "ui", "custom"],
  "parts": { "rosters": {}, "history": {}, "champ": {}, "wrongbook": {}, "cfg": {}, "ui": {}, "custom": {} }
}
```

- 导入时认 `app === "vpk"` 且有 `parts`，其它 JSON 直接拒绝。
- **合并**：名单取并集；战绩按 `t + 双方 + 比分` 去重后按时间排序；`wrongs` / `streaks` 取较大值；擂主仅在本机为空时补；配置只补缺的班；`ui` 只补缺的键；同 tag 的自定义词库内容不同则另起 `C<n>`。
- **覆盖**：只替换文件里出现的类别，未勾选的类别保持本机原样（避免误删）。

### 旧数据迁移

早期版本把错词记在全局键 `vpk_wrongbook` 并用 `c:{班级:次数}` 记分布，`migrateWrongBook()` 会在启动时按分布拆到各班的键里，搬完删掉旧键，只执行一次。

---

## 八、部署与缓存

### 静态托管

无构建步骤，任意静态平台都可以：Cloudflare Pages / Vercel / GitHub Pages / 自己的 Nginx。构建命令留空、输出目录填根目录即可。

注意 `file://` 下浏览器禁止读取本地 JSON，必须通过 HTTP(S) 访问；Service Worker 与安装能力还要求安全上下文（`https://` 或 `localhost`）。

### Service Worker 策略

- 安装时逐个预缓存页面外壳（HTML / CSS / 12 个 JS / 图标 / 帮助文档），单个文件失败不影响整体安装。
- 运行时**网络优先**：同源 GET 先请求网络，成功就更新缓存；失败时回退缓存，导航请求再退到 `index.html`。
- 导航请求带 `cache: "no-cache"` 强制向服务器校验，避免 CDN 缓存 HTML 导致脚本版本不更新。
- `activate` 时删除旧版本缓存。

### 版本号与发版清单

脚本通过 `?v=23` 控制浏览器缓存，**只有发版时才一起改**：

1. `js/config.js` 的 `APP_VERSION`
2. `index.html` 里 12 个 `<script src="...?v=N">`
3. `res/update.md` 写新版本说明（旧说明移到 `old/`）
4. 需要时同步 `res/require.md` 开头提到的版本号

改了 JS 但没改 `?v=` 时，在线用户可能仍拿到旧脚本（HTML / CSS 还有 CDN 缓存）。本地调试可把浏览器缓存关掉。

---

## 九、兼容性

最低内核、推荐内核、逐项回退方案见 [require.md](require.md)。代码里只有两处集中处理：

- `js/ui.js` 顶部的 `detectLegacyCSS()`：实测 flex `gap` 与 `:focus-visible`，给 `<html>` 加 `.no-flex-gap` / `.no-focus-visible`。
- `style.css` 末尾的「老旧内核回退」段：用相邻兄弟 `margin` 还原间距。

改这两处后要同步更新 `require.md` 的表格。

---

## 十、无障碍与键盘

`js/a11y.js` 统一处理（用 `MutationObserver` 监听 `.hidden` 的增删，现有打开 / 关闭代码不用改）：

- 给 14 个内容弹窗补 `role="dialog"`、`aria-modal="true"`，`aria-label` 取标题文字（忽略右侧的 `.hint` 小字）。
- 打开时把焦点送进弹窗、关闭时还给原来的元素；**页面加载后用户尚未操作就自动弹出的**（更新说明）只聚焦面板本身，避免按钮上出现一圈看着像被选中的焦点环。
- `Esc` 关闭最上层弹窗（点击它自己的关闭按钮，走原有收尾逻辑）；`Tab` / `Shift+Tab` 在弹窗内首尾循环。
- 确认框 `#dlgModal` 有自己的 Esc / Enter / 焦点逻辑，`a11y.js` 不去抢；已处理过的按键（`defaultPrevented`）会跳过，避免一次 Esc 关掉两层。

---

## 十一、性能

本机（Chrome，2026 年台式机）实测：

| 场景 | 耗时 |
|---|---|
| 全库 2703 条题池构建（含干扰项索引） | 约 3 ms |
| 单题生成（含干扰项与洗牌） | < 1 ms |
| 打开 2000 场战绩（约 300 KB） | 约 50 ms |

所以没有做虚拟列表或分页；如果战绩积累到几万场，再考虑给战绩弹窗加窗口化。

---

## 十二、已知取舍

- **单场战绩导出不含错词明细**：错词是按班级累计存的，单场没有独立错词表；需要明细请看错词记录本。
- **覆盖导入只替换文件里出现的类别**：没勾选的类别保持原样，避免一次误操作清空其它数据。
- **错词复现只取当前词库**：换册后不会被旧册错词占掉开场几题，旧记录仍留在错词记录本里。
- **临时赛不写任何记录**：连同擂主一起跳过，适合演示。
- **不设后端**：所有数据在本机，换电脑靠「数据管理」导出 / 导入。
