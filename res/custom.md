# 如何制作自定义词库

自定义词库是一个 **UTF-8 编码的 JSON 文件**，导入后保存在本机浏览器。完整模板见项目 `template/template.json`，详细字段说明见 `template/template.md`。

---

## 一、最省事：让 AI 帮你生成（推荐）

不用手写 JSON，把素材和模板一起交给 AI（豆包、DeepSeek、ChatGPT 等）：

1. **准备单词素材**（任选一种）：用手机拍照 / 扫描纸质单词表；从课件 PPT / Word / Excel 里复制单词和释义；或直接输入单元单词。
2. **附上模板**：把本项目 [template.md](https://pk.danevan.top/template/template.md) 和 [template.json](https://pk.danevan.top/template/template.json) 的内容也一并发给 AI。
3. **下达指令**：让 AI 按模板格式整理（可参考下面的示例指令），只输出 JSON。
4. **保存导入**：把 AI 生成的结果保存为 `.json` 文件，核对后点「📥 导入本地词库」。

点击下载：[template.md](https://pk.danevan.top/template/template.md)、[template.json](https://pk.danevan.top/template/template.json)，如果没有下载而是打开了文件，就右键→另存为/保存。

**示例指令：**

（上传 `template.md` 和 `template.json` 以及 单词卷/PPT课件等）

请按这个模板的格式，把我提供的这些单词整理成词库，words 里放单词；如果有词组等就放到 chunks（词块）。输出为 JSON。

【提示：AI 生成后最好快速核对一遍中文释义和 JSON 语法（可让 AI 再自检一次）。】

---

## 二、文件整体结构

```json
{
  "name": "我的词库名称",
  "title": "我的词库名称",
  "words": [
    ["abandon", "抛弃；放弃"],
    ["ability", "能力；才能"]
  ],
  "chunks": [
    ["a sense of security", "安全感", "coll", "a sense of ____", "security", ["a sense", "of", "security"]]
  ]
}
```

- `words`（单词表）**必填**，`chunks`（词块表）**可省略或留空数组**；
- `title` 为预留字段，值与 `name` 相同即可。

---

## 三、words（单词表）

每个单词是 **2 元素数组**：`[英文单词, 中文释义]`

- 多个释义用分号 `；` 分隔，如 `["switch", "开关；转换；改变"]`；
- 英文统一小写（专有名词除外）。

---

## 四、chunks（词块表）

每个词块是 **6 元素数组**：

```
[英文词块, 中文释义, 家族类型, 配对题干, 答案, 重组片段]
```

| 位置 | 字段 | 说明 |
|------|------|------|
| 0 | 英文词块 | 词块原文，如 `persuade sb. of sth.` |
| 1 | 中文释义 | 词块的中文意思 |
| 2 | 家族类型 | 只能填 `prep`（介词搭配）/ `phr`（动词短语）/ `coll`（固定搭配） |
| 3 | 配对题干 | 挖空处用 `____` 表示，如 `persuade sb. ____ sth.` |
| 4 | 答案 | 配对题要填的词，如 `of` |
| 5 | 重组片段 | 数组（建议拆成 3 段）或 `null`（不出重组题） |

填了配对题干才会出「词块配对」题，提供了重组片段才会出「词块重组」题，否则只出「词块选义」。

---

## 五、注意事项

- **JSON 语法**：逗号、括号、引号要完整，最后一个元素后不要多写逗号；
- **字段必须是非空字符串**：`["apple"]`（缺中文）、`[123, "数字"]`（用了数字）这类条目导入时会被跳过，导入成功的提示里会写明跳过了几条；
- **去重**：同一词库内不要重复添加相同的单词或词块；
- 短语若同时出现在 words 和 chunks 中，系统只按词块出题；
- 勾选「只加载纯单词」后，即使词库含 chunks 也只出单词题；
- 自定义词库存在浏览器中，**清除浏览器数据会丢失**，请保留原始 JSON 备份。
