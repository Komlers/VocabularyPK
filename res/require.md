# 浏览器与系统需求

适用于 **词汇擂台 PK v2.3**。本文的版本号均指浏览器**内核**版本，不是软件版本号。

## 一、结论

| 浏览器内核 | 能跑（最低） | 推荐（视觉完整） | 大致时间点 |
|---|---|---|---|
| Chromium（Chrome / Edge / 其它 Chromium 内核浏览器） | 57 | 84 | 2017-03 / 2020-07 |
| Gecko（Firefox） | 52 | 63 | 2017-03 / 2018-10 |
| WebKit（Safari · macOS） | 10.1 | 14.1 | 2017-03 / 2021-04 |
| WebKit（Safari · iOS / iPadOS） | 10.3 | 14.5 | 2017-03 / 2021-04 |

低于「能跑」版本时页面会直接白屏或功能缺失；介于两档之间时可以正常使用，只是间距、遮罩、勾选框配色等细节与设计稿略有出入（见第三节）。

## 二、门槛是怎么来的

### 硬门槛：`async / await` + CSS Grid

代码没有构建步骤，源码直接交给浏览器解析，所以最老的语法决定了「能不能跑」：

| 语法 / API | Chrome | Firefox | Safari | iOS | 用在哪 |
|---|---|---|---|---|---|
| `async / await` | 55 | 52 | 10.1 | 10.1 | 词库加载、弹窗、名单导入 |
| CSS Grid + `minmax()` | 57 | 52 | 10.1 | 10.1 | 词库芯片、选名网格 |
| `fetch` / `Promise` | 42 / 32 | 39 / 29 | 10.1 / 8 | 10.1 / 8 | 加载词库与文档 |
| `Object.entries` | 54 | 47 | 10.1 | 10.1 | 战绩统计 |
| `Element.closest` | 41 | 35 | 9.1 | 9.1 | 事件委托 |
| `Array.includes` | 47 | 43 | 9 | 9 | 选中判断 |

原先卡在 Chromium 80 的三处已经改掉，不再需要新语法：

| 改动 | 原要求 | 现在 |
|---|---|---|
| 可选链 `?.`（`LIB_INFO[tag]?.name`） | Chrome 80 / Safari 13.1 | 改为显式判空，ES5 写法 |
| `String.padStart` | Chrome 57 | 改为 `pad2()` 手动补零 |
| `String.trimStart` | Chrome 66 | 改为 `replace(/^\s+/, "")` |

### 推荐档：原生 flex `gap` 等

不影响「能不能玩」，只影响「和设计稿像不像」：

| 特性 | 用途 | Chrome | Firefox | Safari |
|---|---|---|---|---|
| flex `gap` | 按钮、卡片、选项的间距 | 84 | 63 | 14.1（iOS 14.5） |
| `inset` | 弹窗与遮罩铺满屏幕 | 87 | 66 | 14.1（iOS 14.5） |
| `max()` / `min()` | 顶栏左右安全边距 | 79 | 75 | 11.1 |
| `:focus-visible` | 键盘焦点框 | 86 | 85 | 15.4 |
| `accent-color` | 勾选框着色 | 93 | 92 | 15.4 |

## 三、已经做的兼容回退

低于推荐档时不会「坏掉」，而是走下面的兜底：

| 特性 | 缺失时 | 回退方式 | 生效位置 |
|---|---|---|---|
| flex `gap` | 元素互相贴住 | JS 实测后给 `<html>` 加 `.no-flex-gap`，用相邻兄弟 `margin` 还原主要间距 | `ui.js` 顶部检测 + `style.css` 末尾回退段 |
| `inset` | 弹窗位置错乱 | 同时写 `top/right/bottom/left`，老内核忽略 `inset` 仍有定位 | `.modal` / `.modalMask` |
| `max()` | 整条 `padding` 失效 | 先写一条普通 `padding:16px 4vw 6px`，再写 `max()` 版本 | `.topbar` |
| `place-items` | 数字/勾选不居中 | 改用 `display:flex` + `align-items/justify-content` | 步骤圆点、VS 徽标、词库勾选框 |
| grid `gap`（Chromium 57–65） | 芯片贴在一起 | 同时写旧名 `grid-gap` | `.libChips` / `.pickGrid` |
| `:focus-visible` | 没有键盘焦点框 | JS 检测 `CSS.supports("selector(:focus-visible)")`，加 `.no-focus-visible` 用 `:focus` 兜底 | 词库册标题、错词册标题、计分模式按钮 |
| `backdrop-filter` | 遮罩不模糊 | 补 `-webkit-backdrop-filter`（Safari 9+） | `.modalMask` |

> 检测 `gap` 没有用 `@supports (gap:1px)`：`gap` 作为 grid 属性在 Chromium 57 就能识别，老内核会把「支持 grid gap」误判成「支持 flex gap」，因此改为真实测量两个子元素的间距。

### 仍然只是「能用」的细节

| 特性 | 缺失时的表现 |
|---|---|
| `accent-color` | 勾选框回到系统默认蓝色，与主题色略有差别 |
| `scrollbar-width` | 弹窗内可能出现一条细滚动条 |
| `backdrop-filter`（Chrome < 76、Firefox < 103） | 遮罩仍然变暗，只是没有毛玻璃模糊 |
| `zoom`（Firefox < 126） | 4K / 300% 缩放下元素偏大，不影响操作 |
| `@media (min-resolution)`（Safari < 16） | 同上，4K 屏不自动缩小 |
| 横向 `gap` 回退 | 允许换行的容器只补了横向间距，换行后的行间距会略紧 |

## 四、各系统要求

### Windows

- 推荐 **Windows 10 / 11** 搭配最新版 Edge 或 Chrome。
- **Windows 7 / 8.1** 只能用 Edge 109 或 Chrome 109（两者均是该系统的最后支持版本），已高于推荐档，可以完整使用；但微软与谷歌都已停止安全更新，教室环境不建议继续使用。
- Windows 自带的 IE 11 无法运行（不支持 CSS 变量与 `fetch`），旧版 EdgeHTML 也未做适配，请改用 Chromium 内核浏览器。

### macOS

- **macOS 12 Monterey 及以上**：自带 Safari 15.4，开箱达到推荐档。
- **macOS 10.13 High Sierra ～ 11 Big Sur**：Safari 11～15，能正常运行，间距与勾选框细节可能略有差别；可单独更新 Safari 或改用 Chrome / Edge。
- **macOS 10.12 Sierra 及更早**：Safari 10.x 处于「能跑」档，可以正常答题，视觉效果会退化，建议改用 Chrome 或 Edge。

### Android

- **Android 7.0 及以上**搭配 Chrome 84+ 即可获得完整效果；Chrome 57～83 也能正常答题。
- Android 的 WebView 可独立升级，只要系统里的 Chrome 能更新到 57 以上即可使用。
- Android 5 / 6 的老设备即使能装旧版浏览器，内核也偏低，建议更换设备或改用电脑。

### iOS / iPadOS

- **iOS / iPadOS 14.5 及以上**：Safari 达到推荐档，效果完整。
- **iOS / iPadOS 10.3 ～ 14.4**：能正常运行与答题，弹窗遮罩、按钮间距、勾选框颜色等细节会有差异。
- iOS 上无法单独升级浏览器内核，Safari、Chrome、Edge 都受系统版本限制。

### Linux

- 与同版本 Chrome / Firefox 表现一致，按第一节的 Chromium / Gecko 版本对照即可。

## 五、需要浏览器能力支持的功能

| 功能 | 前置条件 | 不满足时 |
|---|---|---|
| 安装为桌面应用 | Chromium 内核（Edge / Chrome）+ HTTPS | 左上角「安装」按钮不显示；iOS 需手动「分享 → 添加到主屏幕」 |
| 离线打开 | 支持 Service Worker（Chrome 45 / FF 44 / Safari 11.1 起）+ HTTPS | 断网后无法打开页面 |
| 自动全屏 | 桌面浏览器均支持；iOS Safari 需 16.4+ 且为部分实现 | 「全屏」按钮自动隐藏，不影响答题 |
| 单词朗读 | 系统已安装英语语音包 | 无声音，答题不受影响 |
| 音效 | `AudioContext` | 无提示音，答题不受影响 |
| 保存作答结果为 HTML | `Blob` + `URL.createObjectURL` + `<a download>` | 无法导出，其余功能不受影响 |

> Service Worker 与安装能力都要求安全上下文：`https://` 或本机 `localhost`。用 `file://` 双击打开时词库无法加载（浏览器禁止本地 fetch），必须通过 HTTP 访问。

## 六、如何确认本机版本

| 浏览器 | 查看方式 |
|---|---|
| Chrome / Edge | 地址栏输入 `chrome://version` 或 `edge://version`，看第一行版本号 |
| Firefox | 菜单 → 帮助 → 关于 Firefox，或地址栏 `about:support` |
| Safari（macOS） | 菜单栏 Safari → 关于 Safari |
| Safari（iOS） | 设置 → 通用 → 关于本机 → 软件版本 |

## 七、这份数据的来源

版本号通过 caniuse-lite 与 MDN browser-compat-data 的特性支持数据逐项核对，对照的是当前代码中**实际出现**的语法与属性（不是通用最佳实践清单）。

维护约定：

- 新增浏览器特性时，请同步更新本文，并在第三节补上回退方案（如果做了）。
- 兼容回退集中在两处：`js/ui.js` 顶部的 `detectLegacyCSS()` 与 `style.css` 末尾的「老旧内核回退」段。删改这两处后，务必回来更新本文与「第三节」的表格。
- 回退只在老内核上命中（靠 `<html>` 上的类名区分），现代浏览器不会加载任何额外样式。
