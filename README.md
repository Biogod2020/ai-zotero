# AI Zotero · Research Studio

**本地优先的 Zotero AI 工作台：收录一次，持续检索。**

自带 OpenAI-compatible 接口、可选向量检索、多模态文献助手、谨慎的整理中心，以及围绕研究兴趣更新的文献雷达。无需部署额外后端，无 npm 运行依赖。

> **0.1.0 Preview，不是已认证的稳定版。** 核心/模拟 Zotero 适配测试及真实界面浏览器测试已运行；尚未在真实 Zotero 桌面与实际 AI 服务上做端到端验证。清单以 Zotero 7–10 为兼容目标，不等于所有版本已经实测。先备份数据目录，用少量测试文献试用，再启用自动整理。**不要首次运行就对唯一正式库批量合并/转换附件。**

## 下载与安装

仓库 `dist/ai-zotero-0.1.0.xpi` 是安装包。点击文件页面的 **Download raw file** 下载，不要下载 HTML 页面。也可从 Actions 的 `ai-zotero-preview` 构建产物获取。

1. Zotero → 工具 → 插件（Add-ons）→ 齿轮菜单 → Install Add-on From File，选择 `.xpi`。
2. 工具 → **AI Zotero · Research Studio**；快捷键 `Cmd/Ctrl + Alt + K`。条目右键也有入口。
3. 在工作台设置中填写实际服务的 **API Base URL、模型名和 API Key**，明确允许发送所需材料，再测试连接。

例：`http://127.0.0.1:8000/v1`、`http://localhost:11434/v1`、`https://provider.example/proxy/v1`。支持任意端口、完整 `/chat/completions` 地址、空密钥本地服务和独立的 embedding 端点。除本机 HTTP 外，远程 HTTP 必须另行确认。模型名不预设、不推测；服务必须实现相应 Chat Completions / embeddings 协议。

**首次建议：** 等本地索引完成，选 20 篇 →「AI 索引选中」→ 检查摘要/标签 →「分组预览」。确认有效后可点「AI 索引全库」，再按需开启「自动 AI 索引」「自动分组」。每日请求额度到顶会暂停付费处理并在后续日期续跑。

## 实现了什么

| 模块 | 当前实现 | 默认 API 成本 |
|---|---|---|
| 本地检索 | 增量索引题录、摘要和 Zotero 可提取文本；加权 BM25、中英领域别名、year/tag/topic 过滤、结果片段 | 0 |
| 一次性 AI 索引 | 中文摘要、问题/方法/局限、任务/数据集/标签、双语别名、研究方向建议；按内容/模型/端点/兴趣缓存 | 新分析通常 1 次 Chat |
| 可选语义检索 | 文献向量预计算、BM25+向量 RRF；模型/端点隔离；最近 200 个查询缓存 | 每篇首次 1 次 embedding；新语义查询 1 次 |
| 去重中心 | DOI、PMID、arXiv、规范化/近似标题自动识别；冲突证据与主记录选择 | 0 |
| 自动分组 | `AI Zotero/<研究方向>` 集合和 `AI/` 标签；仅添加，不移除人工标签/分类 | 应用已缓存建议不再调用 AI |
| 附件管理 | 缺失附件检测、统一命名预览、无覆盖改名、外链附件复制入 Zotero 管理存储、路径清单 CSV | 0 |
| 研究助手 | 选中文献优先的本地 RAG；最多 6 篇证据、可点开的 `[P1]` 引用；上传/粘贴/拖入图片 | 每次发送通常 1 次 Chat |
| 文献雷达 | arXiv + Europe PMC 检索；兴趣/已有文献/关注种子相似度与时效排序；来源状态、缓存和题录导入 | 获取及本地排序无需 LLM |
| 重点解释 | 对单篇雷达结果解释可参考之处、重合与差异，按上下文缓存 | 首次通常 1 次 Chat |
| AI 前端 | 独立现代工作台、可折叠助手、浅/深色主题、可设置启动自动打开 | 0 |

**不会偷偷在输入搜索词时调用模型。** 只有显式点击「语义检索」才可能对新查询调用 embedding；普通本地检索不需要联网。

## 文件与去重：安全边界

- 使用 Zotero 原生数据/附件 API，**不直接写 `zotero.sqlite`**。
- 只处理个人库；首版不写共享群组库。
- 不自动删除文献、不自动合并、不按模糊标题强制去重。同 DOI 且类型一致、PMID 无冲突的条目也必须明确选择主记录并确认后才调用原生合并；其他候选只提示核对。
- 标签/集合为增量写入，保留人工整理；可撤销最近一次可逆操作。撤销后自动整理会跳过该条目，避免立即重新添加。
- 整理后目标又被修改时，撤销会拒绝覆盖；不能把有限的操作日志当成整库备份。
- 文件名包含年份、第一作者、标题与附件 key，保留扩展名。批量改名只处理选中计划，不覆盖已有文件；计划过期会拒绝执行。
- **外链转管理存储**用 Zotero 原生转换接口，磁盘原文件保留，但旧的外链附件条目会被替换，附件 key 可能变化。转换与合并**不支持插件内撤销**；操作前备份，后核对批注与引用。
- 本插件采用 Zotero 管理存储作为统一底座，不把所有 PDF 擅自搬到一个大文件夹，也不会扫描整理你的整个磁盘。

## 个性化文献雷达

预置可编辑的四组兴趣：生物医学视觉/生成模型、空间组学/科学智能体、多智能体推理/Agent RL、医疗机器人/VLM/VLA。`keywords` 用于本地匹配，`arxiv`/`epmc` 分别使用来源检索语法。可将库内关键论文设为「关注种子」。

默认关闭；开启后默认每 24 小时更新，最短可设 1 小时，**仅 Zotero 运行时执行**。关机后不会后台推送邮件；重开后补查，增量窗口带两天重叠，最长补查 90 天。arXiv 请求间隔至少 3.1 秒；Europe PMC 使用首次索引日期减少遗漏迟收录论文的风险。

每来源每次最多 1–10 页，每页 100 篇，缓存最多 2,000 篇。命中超过分页上限会显示「未完整覆盖」，不推进该来源成功时间，需缩窄查询或提高上限。来源失败保留旧结果，并显示错误与最后获取时间。模型请求额度不控制这些公共来源 HTTP 请求。

排名是透明的关键词/TF-IDF 相似度/时效启发式，**不是“与我相关的概率”，也不是自动证实的创新性判断**。高度相近的工作标记为待核对。LLM 解释只看题录与摘要，不能代替阅读全文。导入雷达论文只创建题录，不绕过版权下载 PDF。

## 隐私、缓存与限制

默认不发送任何 AI 请求；需分别同意 AI 服务与公开雷达检索。密钥存入 Zotero/Mozilla 登录管理器，按规范化端点隔离，不写明文配置、日志、CSV、仓库或 HTML。

索引存于 `<Zotero 数据目录>/ai-zotero/`：`records/<itemID>.json`、原子写入的 `state.json` 及备份。包含可提取正文片段、AI 结果、向量、兴趣、用量与操作日志，**是敏感的本地文件**，不等于加密存储，也不保证通过 Zotero Sync 同步。卸载不删除缓存或密钥，删除密钥请使用工作台设置。

- AI 索引只发送有界文本：默认最多 18,000 字符，可配置；不等于整篇论文已阅读。每篇本地缓存最多 60,000 字符，BM25 每字段索引最多 18,000 字符。扫描 PDF 不自动 OCR。
- 多模态目前是助手显式上传 PNG/JPEG/WebP（最多两张、每张 8 MB），需要支持图像的模型；**不自动渲染每篇 PDF 的所有图页，也没有后台视觉索引**。
- Chat 使用非流式响应，显示等待状态。没有隐藏的 agent 执行权限；模型只返回文本，不执行库操作、系统命令或远程网页脚本。
- 429/5xx 最多重试两次；失败重试算入每日请求额度。额度是**次数**，不是美元或 token 预算。
- AI 输出不可信，只是建议。所有显示使用 DOM 文本节点，外部链接只允许 http(s)，AI 密钥请求不跟随重定向。
- 独立 AI 工作台不替换 Zotero 的数据库、阅读器或整个原生窗口。大规模真实文献库的长期稳定性与 macOS/Windows/Linux 原生行为仍需实测。

## 开发与验证

运行依赖为零。开发/构建需要 Node >=20 与 Python 3：

```bash
npm test
npm run build
npm run preview
npm run benchmark
# 可选，需 playwright Python 包和 Chromium：
python3 tests/ui_smoke.py
```

`addon/content/core.js` 为可独立测试算法；`service.js` 注入 Zotero/存储/网络适配；`ui.js` 为真实工作台界面；`demo/bridge.js` 仅用于虚构数据的离线预览，不打入 XPI。

详见 [docs/TESTING.md](docs/TESTING.md) 与 [SECURITY.md](SECURITY.md)。MIT License。

## 接口依据

- [Zotero plugin development](https://www.zotero.org/support/dev/client_coding/plugin_development)
- [Zotero JavaScript API](https://www.zotero.org/support/dev/client_coding/javascript_api)
- [Zotero 10 developer migration](https://www.zotero.org/support/dev/zotero_10_for_developers)
- [arXiv API manual](https://info.arxiv.org/help/api/user-manual.html)
- [Europe PMC RESTful services](https://europepmc.org/RestfulWebService)
- [OpenAI images and vision](https://developers.openai.com/api/docs/guides/images-vision)
