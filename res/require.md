# 浏览器与系统需求

适用于 **词汇擂台 PK v2.1**。本文的版本号均指浏览器**内核**版本，不是软件版本号。

## 一、结论

| 浏览器内核 | 能跑（最低） | 推荐（视觉完整） | 大致时间点 |
|---|---|---|---|
| Chromium（Chrome / Edge / 其它 Chromium 内核浏览器） | 80 | 93 | 2020-02 / 2021-08 |
| Gecko（Firefox） | 74 | 92 | 2020-03 / 2021-09 |
| WebKit（Safari · macOS） | 13.1 | 15.4 | 2020-03 / 2022-03 |
| WebKit（Safari · iOS / iPadOS） | 13.4 | 15.4 | 2020-03 / 2022-03 |

低于「能跑」版本时页面会直接白屏或功能缺失；介于两档之间时可以正常使用，只是间距、遮罩、勾选框配色等细节与设计稿有出入。

## 二、门槛是怎么来的

### 硬门槛：可选链 `?.`

`js/ui.js` 中使用了 `LIB_INFO[tag]?.name`。这是 ES2020 语法，老引擎遇到会抛语法错误，导致整个 `ui.js` 不执行、页面失去交互。这一个语法就决定了上表第一列的版本：

| 语法 / API | Chrome | Firefox | Safari | iOS |
|---|---|---|---|---|
| 可选链 `?.` | 80 | 74 | 13.1 | 13.4 |
| `String.trimStart` | 66 | 61 | 12 | 12 |
| `async / await` | 55 | 52 | 10.1 | 10.3 |
| `fetch` / `Promise` / `Object.entries` | 42 / 32 / 54 | 39 / 29 / 47 | 10.1 / 8 / 10.1 | 10.3 / 8 / 10.3 |

### 推荐档：三个 CSS 属性

不影响「能不能玩」，只影响「好不好看」：

| 特性 | 用途 | Chrome | Firefox | Safari |
|---|---|---|---|---|
| `accent-color` | 勾选框着色 | 93 | 92 | 15.4 |
| `inset` | 弹窗遮罩铺满屏幕 | 87 | 66 | 14.1（iOS 14.5） |
| flex `gap` | 按钮、卡片的间距 | 84 | 63 | 14.1（iOS 14.5） |

### 纯装饰项

| 特性 | 用途 | 缺失时的表现 |
|---|---|---|
| `backdrop-filter`（Firefox 103；Safari 长期需 `-webkit-` 前缀，桌面 27 / iOS 18 才支持无前缀） | 弹窗背后的毛玻璃模糊 | 遮罩仍然变暗，只是不模糊 |
| `scrollbar-width`（Chrome 121、Safari 26.2） | 隐藏弹窗内滚动条 | 会出现一条细滚动条 |
| `zoom`（Firefox 126） | 4K / 高 DPI 下整体缩放 | 4K 屏上元素偏大，不影响操作 |

## 三、各系统要求

### Windows

- 推荐 **Windows 10 / 11** 搭配最新版 Edge 或 Chrome。
- Windows 7 / 8.1 只能用 Edge 109 或 Chrome 109（两者均是该系统的最后支持版本）。版本号高于推荐档，可以正常使用，但微软与谷歌都已停止安全更新，教室环境不建议继续使用。

### macOS

- **macOS 12 Monterey 及以上**：自带 Safari 15.4，开箱即满足推荐档。
- **macOS 10.15 Catalina / 11 Big Sur**：可在「系统偏好设置 → 软件更新 → 更多信息」中单独更新 Safari 15.4，同样达到推荐档。
- **macOS 10.14 Mojave 及更早**：Safari 最高停在 14.x，只能勉强满足最低档，建议改用 Chrome 或 Edge。

### Android

- **Android 7.0 及以上**搭配 Chrome 93+。
- Android 的 WebView 可独立升级，设备只要能把 Chrome 更新到 93 即可使用。
- Android 5 / 6 的老设备即使能装旧版浏览器，内核也偏低，建议更换设备或改用电脑。

### iOS / iPadOS

- **iOS / iPadOS 15.4 及以上**（iPhone 6s 及之后机型均可升级到 15）。
- 13.4 – 15.3 能运行，但弹窗遮罩、按钮间距等细节会有瑕疵。

### Linux

- 与同版本 Chrome / Firefox 表现一致，按第一节的 Chromium / Gecko 版本对照即可。

## 四、需要浏览器能力支持的功能

| 功能 | 前置条件 | 不满足时 |
|---|---|---|
| 安装为桌面应用 | Chromium 内核（Edge / Chrome）+ HTTPS | 左上角「安装」按钮不显示；iOS 需手动「分享 → 添加到主屏幕」 |
| 离线打开 | 支持 Service Worker（Chrome 45 / FF 44 / Safari 11.1 起）+ HTTPS | 断网后无法打开页面 |
| 自动全屏 | 桌面浏览器均支持；iOS Safari 需 16.4+ 且为部分实现 | 「全屏」按钮自动隐藏，不影响答题 |
| 单词朗读 | 系统已安装英语语音包 | 无声音，答题不受影响 |
| 音效 | `AudioContext` | 无提示音，答题不受影响 |

> Service Worker 与安装能力都要求安全上下文：`https://` 或本机 `localhost`。用 `file://` 双击打开时词库无法加载（浏览器禁止本地 fetch），必须通过 HTTP 访问。

## 五、如何确认本机版本

| 浏览器 | 查看方式 |
|---|---|
| Chrome / Edge | 地址栏输入 `chrome://version` 或 `edge://version`，看第一行版本号 |
| Firefox | 菜单 → 帮助 → 关于 Firefox，或地址栏 `about:support` |
| Safari（macOS） | 菜单栏 Safari → 关于 Safari |
| Safari（iOS） | 设置 → 通用 → 关于本机 → 软件版本 |

## 六、这份数据的来源

版本号通过 caniuse-lite 与 MDN browser-compat-data 的特性支持数据逐项核对，对照的是 v2.1 代码中实际出现的语法与属性（不是通用最佳实践清单）。新增浏览器特性时，请同步更新本文。
