# Requirements Document

## Introduction

AI 小说工坊是一套面向作者的协作写作系统。作者创建一部小说工程后，系统通过可插拔的写作 Skill 编排大模型，完成世界观设定、人物小传、全书大纲、分章细纲、正文生成、续写与审稿。Skill 以独立说明书存在，系统按任务加载对应 Skill，作者也可新增自定义 Skill。

## Glossary

- **系统**: AI 小说工坊 Web 应用，包含写作工作台、Skill 编排引擎与大模型调用层。
- **作者**: 使用系统进行小说创作的用户。
- **小说工程**: 一部小说的完整工作区，包含元信息、世界观、人物、大纲、章节正文与生成日志。
- **Skill**: 一份写作能力说明书，定义适用场景、输入、输出结构、提示词约束与执行步骤。
- **内置 Skill**: 系统预置的写作 Skill，覆盖策划、人物、世界观、分章、正文、续写、润色与审稿。
- **自定义 Skill**: 作者自行编写并保存的 Skill。
- **工作台**: 作者编辑小说工程、触发 Skill、阅读流式正文的主界面。
- **大模型接口**: 作者自行配置的 OpenAI 兼容 Chat Completions 接口。
- **流式输出**: 大模型按 token 增量返回文本，工作台实时追加展示。
- **一致性审稿**: 对照已保存的世界观、人物与大纲，检查正文冲突并给出修订建议。

## Requirements

### Requirement 1: 小说工程管理

**User Story:** AS 作者, I want 创建、打开、重命名并归档多部小说工程, so that 每部作品拥有独立的设定与正文。

#### Acceptance Criteria

1. WHEN 作者提交包含标题的新建表单, THE 系统 SHALL 创建一部小说工程并写入唯一工程标识、标题、创建时间与默认空设定。
2. WHEN 作者打开已有小说工程, THE 系统 SHALL 加载该工程的元信息、世界观、人物、大纲、章节列表与最近一次生成日志。
3. WHEN 作者修改工程标题或简介并保存, THE 系统 SHALL 在 1 秒内将变更持久化到该工程存储。
4. IF 作者请求删除小说工程, THE 系统 SHALL 先展示确认对话框，并在作者确认后将该工程标记为已归档且从工作台列表中移除。

### Requirement 2: Skill 说明书与加载

**User Story:** AS 作者, I want 系统按任务加载对应写作 Skill, so that 大模型按统一规范完成策划、写作与审稿。

#### Acceptance Criteria

1. THE 系统 SHALL 提供至少 8 个内置 Skill：开书策划、世界观构建、人物小传、全书大纲、分章细纲、章节正文、续写推进、文风润色、一致性审稿。
2. WHEN 作者选择一个 Skill 并执行, THE 系统 SHALL 读取该 Skill 的说明书全文，连同当前小说工程上下文一并注入大模型请求。
3. THE 系统 SHALL 以 Markdown 文件保存每个 Skill，文件包含名称、适用场景、输入字段、输出结构、约束规则与执行步骤。
4. WHEN 作者打开 Skill 面板, THE 系统 SHALL 列出全部内置 Skill 与自定义 Skill 的名称、适用场景与最近使用时间。

### Requirement 3: 自定义 Skill

**User Story:** AS 作者, I want 编写并启用自己的写作 Skill, so that 系统能按个人流程生成特定类型的文本。

#### Acceptance Criteria

1. WHEN 作者提交包含名称与说明书正文的自定义 Skill, THE 系统 SHALL 将该 Skill 持久化并立即加入可执行列表。
2. WHEN 作者编辑已有自定义 Skill 并保存, THE 系统 SHALL 在下一次执行时使用更新后的说明书。
3. IF 自定义 Skill 缺少名称或说明书正文, THE 系统 SHALL 拒绝保存并提示作者补全必填项。
4. WHILE 自定义 Skill 处于停用状态, THE 系统 SHALL 仅在 Skill 管理页展示该 Skill，并把它排除出工作台可执行列表。

### Requirement 4: 开书策划与设定沉淀

**User Story:** AS 作者, I want 用策划类 Skill 生成并保存题材、世界观、人物与大纲, so that 后续正文有稳定依据。

#### Acceptance Criteria

1. WHEN 作者执行开书策划 Skill 并提供题材、类型、篇幅与核心冲突, THE 系统 SHALL 流式生成一页立项说明，包含一句话卖点、读者画像、叙事调性与禁区。
2. WHEN 作者执行世界观构建 Skill, THE 系统 SHALL 生成可编辑的设定条目，覆盖时代背景、力量/规则体系、地理势力与关键物件，并在作者确认后写入小说工程。
3. WHEN 作者执行人物小传 Skill, THE 系统 SHALL 为每位指定角色生成姓名、身份、欲望、秘密、说话风格与人物关系，并在作者确认后写入人物库。
4. WHEN 作者执行全书大纲 Skill, THE 系统 SHALL 生成三幕或等价结构的卷纲，包含主线、支线与每卷高潮，并在作者确认后写入工程大纲。

### Requirement 5: 分章与正文生成

**User Story:** AS 作者, I want 按章生成细纲与正文, so that 我能以章节为单位推进小说。

#### Acceptance Criteria

1. WHEN 作者执行分章细纲 Skill, THE 系统 SHALL 依据已保存大纲生成章节列表，每章包含标题、目标、冲突、出场人物与章末钩子。
2. WHEN 作者对某一章执行章节正文 Skill, THE 系统 SHALL 读取该章细纲、相关人物、世界观与上一章结尾，流式生成该章正文。
3. WHILE 正文正在流式生成, THE 系统 SHALL 在工作台实时追加文本，并提供停止生成操作。
4. WHEN 作者点击保存章节, THE 系统 SHALL 将当前编辑器中的正文、字数与更新时间写入该章节记录。

### Requirement 6: 续写、润色与审稿

**User Story:** AS 作者, I want 对已有正文做续写、润色和一致性审稿, so that 长篇写作能保持文风与设定稳定。

#### Acceptance Criteria

1. WHEN 作者在光标位置执行续写推进 Skill, THE 系统 SHALL 以光标前文本、本章细纲与人物说话风格为上下文，从光标处流式续写。
2. WHEN 作者选中一段正文并执行文风润色 Skill, THE 系统 SHALL 仅改写选区，保持情节事实不变，并提供原文/润色稿对照。
3. WHEN 作者执行一致性审稿 Skill, THE 系统 SHALL 对照已保存的世界观、人物小传与大纲，输出问题列表，每条包含位置、冲突说明与修订建议。
4. IF 小说工程缺少大纲或人物库, THE 系统 SHALL 仍允许执行审稿，并在结果中标注缺失的对照资料名称。

### Requirement 7: 写作工作台

**User Story:** AS 作者, I want 在同一页面查看设定、章节目录、正文编辑器与 Skill 面板, so that 我能边写边调模型。

#### Acceptance Criteria

1. THE 系统 SHALL 提供三栏工作台：左侧为小说与章节目录，中间为正文编辑器，右侧为 Skill 面板与生成日志。
2. THE 系统 SHALL 在正文编辑器中展示当前章节标题、正文字数与最近保存时间。
3. WHEN 作者在目录中选中另一章节, THE 系统 SHALL 把中间编辑器切换为该章节正文，并保留未保存前提示。
4. THE 系统 SHALL 在视口宽度小于 768 像素时改为单栏叠加布局，通过标签切换目录、编辑器与 Skill 面板。

### Requirement 8: 大模型配置与调用

**User Story:** AS 作者, I want 自行配置 OpenAI 兼容接口, so that 系统使用我指定的模型写小说。

#### Acceptance Criteria

1. THE 系统 SHALL 从作者提供的环境变量或设置页读取 `USER_LLM_API_KEY`、`USER_LLM_BASE_URL` 与 `USER_LLM_MODEL`。
2. WHEN 作者在设置页保存接口配置, THE 系统 SHALL 将配置写入服务端本地配置文件，并对 API Key 做掩码展示。
3. WHEN 执行任一 Skill 时接口密钥缺失, THE 系统 SHALL 中止调用并引导作者打开展开设置页补全三项配置。
4. WHEN 大模型在 30 秒内未返回首个 token, THE 系统 SHALL 向作者展示超时提示，并保留已输入的 Skill 参数。

### Requirement 9: 生成过程可观察

**User Story:** AS 作者, I want 看到本次调用加载了哪些 Skill 与上下文, so that 我能判断结果为何偏离预期。

#### Acceptance Criteria

1. WHEN Skill 开始执行, THE 系统 SHALL 在生成日志中记录 Skill 名称、章节标识、上下文摘要与开始时间。
2. WHEN Skill 执行结束, THE 系统 SHALL 记录结束时间、输出字数与成功或失败状态。
3. IF 大模型返回错误, THE 系统 SHALL 在日志中保存错误类型与可展示的错误信息，并保持编辑器内容不变。

### Requirement 10: 数据持久化

**User Story:** AS 作者, I want 刷新页面后仍能看到小说工程, so that 创作进度不会丢失。

#### Acceptance Criteria

1. THE 系统 SHALL 将小说工程、Skill 定义与接口配置持久化到工作区本地存储。
2. WHEN 作者保存章节或设定, THE 系统 SHALL 在 1 秒内完成写入并更新“已保存”状态。
3. WHEN 系统启动, THE 系统 SHALL 自动加载最近一次打开的小说工程；若不存在，则展示空状态与新建入口。

## Default Decisions

以下默认决策已写入本需求，待作者确认后进入技术设计：

1. 形态：前后端分离的 Web 应用，前端工作台 + 后端 Skill 编排与大模型代理。
2. 模型：作者自备 OpenAI 兼容接口，系统不内置平台大模型密钥。
3. 协作：单作者本地工坊，同一浏览器会话操作一部或多部小说。
4. 生成节奏：以章节为最小生成单位，支持停写、改写、续写。
5. Skill：内置 9 个写作 Skill，同时支持自定义 Skill。
