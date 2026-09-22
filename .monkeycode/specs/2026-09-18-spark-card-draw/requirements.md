# Requirements Document

## Introduction

在首页「脑洞开新书」弹窗内引入「脑洞二次抽卡」：作者先写一句脑洞或创意，再由模型基于这句话派生三张不同走向的开书方案卡，横向对比后三选一。作者选中的方案会覆盖「脑洞与细节」输入框，方案标签并入类型偏好，最终走既有 `POST /api/projects/spark` 开书流程。

本特性的核心价值：把「从零想一个完整脑洞」降为「写一句、看三个走向、选一个开书」，并保证三张方案都围绕作者自己的创意展开。

## Glossary

- **Channel（频道）**：方案面向的读者向分类，取值 `male`（男频）、`female`（女频）、`common`（通用）。
- **Seed（脑洞种子）**：作者在「脑洞与细节」框内写下的一句脑洞或创意，是模型派生方案的唯一依据。
- **Spark Card（脑洞卡）**：一张完整开书方案，含一句核、核心冲突、金手指或身份抓手、2-4 条细节种子与类型标签。
- **Deck（示例卡库）**：内置离线卡片集合，仅作为模型提示词中的 few-shot 示例，不再直接展示给作者。
- **Spark Modal（脑洞弹窗）**：首页「脑洞开新书」的交互面板。
- **Idea Field（脑洞框）**：弹窗内标题为「脑洞与细节（选填）」的多行输入框。

## Requirements

### Requirement 1

**User Story:** AS 作者, I want 写一句脑洞后让模型给出三个不同走向的开书方案, so that 我能在自己的创意上快速挑一个能直接开的点子

#### Acceptance Criteria

1. WHEN 作者在 Spark Modal 点击「抽三个脑洞」且 Seed 非空, THE System SHALL 调用模型接口，一次返回恰好三张 Spark Card。
2. WHEN 模型返回结果, THE System SHALL 横向并列展示三张完整方案卡。
3. WHEN 作者点击某张方案卡, THE System SHALL 将其标记为当前选中项。
4. WHEN 作者点击「用这张」, THE System SHALL 把当前选中方案写入 Idea Field 并保留作者继续编辑的能力。
5. WHEN Seed 为空, THE System SHALL 拒绝发起抽卡并提示作者先写一句脑洞或创意。
6. WHEN 抽卡结果已显示, THE System SHALL 提供「换一批」重新派生三张方案。
7. THE System SHALL 要求三张方案分属三个不同题材，且在世界观、金手指类型与冲突层级上明显分岔。
8. THE System SHALL 引导模型优先输出高概念、强反差、规则型设定与跨题材混搭，并让三张方案合计覆盖尽量多的题材与元素。

### Requirement 2

**User Story:** AS 作者, I want 按男频或女频抽卡, so that 抽到的点子符合目标读者的期待

#### Acceptance Criteria

1. THE System SHALL 在 Spark Modal 提供「男频」「女频」「通用」三个频道选项。
2. WHEN 作者选择某个频道并抽卡, THE System SHALL 要求模型按该频道及其对应通用取向派生方案。
3. WHILE Spark Modal 处于打开状态, THE System SHALL 记住作者最近一次选择的频道。
4. WHEN Spark Modal 重新打开, THE System SHALL 将频道重置为「通用」。

### Requirement 3

**User Story:** AS 作者, I want 抽到可直接开书的方案而不是空泛标题, so that 我能立刻判断要不要用

#### Acceptance Criteria

1. 每张 Spark Card SHALL 包含一句核（25-60 字，结尾带反转或悬念）、核心冲突、金手指或身份抓手、2 至 4 条细节种子、1 至 3 个题材标签，以及一份按偏好维度的建议 `picks`。
2. `picks` SHALL 覆盖类型、感情线、爽点、主角设定、主角、视角、调性、结局、篇幅、节奏、平台这些维度中的若干项；可多选维度每维 1 至 3 个，单选维度每维 1 个；取值必须来自该维度的候选清单。
3. WHEN 作者抽卡成功、切换选中方案或点击「用这张」, THE System SHALL 把该方案全部标签并入 genres，并把 `picks` 按维度并入偏好（可多选维度每维最多 3 个、单选维度不覆盖作者既有选择）。
4. WHEN 作者点击「用这张」, THE System SHALL 写入纯中文可读短句，不含字段名、占位符或 JSON 结构。
5. WHEN 作者点击「用这张」, THE System SHALL 覆盖 Idea Field 的既有内容，并用换行分段。
6. WHEN 作者点击「用这张」, THE System SHALL 将该方案的类型标签并入 genres 偏好，去重且保留作者既有选择。
7. IF 模型返回的条目缺少必要字段, THEN THE System SHALL 丢弃该条目，只保留合法方案。
8. IF `picks` 里出现不在候选清单内的维度或取值, THEN THE System SHALL 丢弃这些维度与取值。

### Requirement 4

**User Story:** AS 维护者, I want 示例卡库与代码分离, so that 调整提示词示例时不用改程序

#### Acceptance Criteria

1. THE Deck SHALL 以离线数据文件（JSON）维护，并按 Channel 分组，仅用于构造模型提示词中的 few-shot 示例。
2. WHEN 示例卡库加载失败, THE System SHALL 继续构造提示词（不带示例），不阻塞抽卡。
3. WHEN 向 Deck 新增或删除卡片, THE System SHALL 不要求改动模型调用与渲染逻辑。

### Requirement 5

**User Story:** AS 作者, I want 抽卡不干扰我已做的选择, so that 我可以先填偏好再抽卡

#### Acceptance Criteria

1. WHEN 抽卡返回方案, THE System SHALL 自动把默认选中方案的全部标签并入 genres 偏好（只增不减），不修改其他偏好维度。
2. WHEN 作者切换选中方案, THE System SHALL 自动把新选中方案的全部标签并入 genres 偏好（只增不减），不取消已并入的标签。
3. WHILE 抽卡请求进行中, THE System SHALL 禁用「抽三个脑洞」「换一批」「用这张」「按偏好开书」与频道切换。
4. IF 模型没有返回可用方案, THEN THE System SHALL 显示可读错误提示，并保持弹窗可继续编辑与开书。

### Requirement 6

**User Story:** AS 作者, I want 直接点方案上的标签就能自动勾选或取消类型偏好, so that 我不必手动去下面的偏好板里找

#### Acceptance Criteria

1. WHEN 作者点击某张方案卡, THE System SHALL 将其标记为当前选中项，并把该方案全部标签并入 genres 偏好。
2. WHEN 作者点击方案卡上的某个标签, THE System SHALL 立即把该标签并入或移出 genres 偏好（已选中则取消、未选中则加入）。
3. WHEN 作者点击「采纳标签」, THE System SHALL 把当前选中方案的全部标签并入 genres 偏好（只增不减）。
4. WHEN 作者点击「用这张」, THE System SHALL 覆盖 Idea Field 并并入该方案全部标签。
5. WHEN 作者点击「用这张并开书」, THE System SHALL 同时完成「用这张」并立即发起开书，使用刚采纳的方案内容与偏好，不等待界面状态回写。
6. WHEN 抽卡请求进行中或开书进行中, THE System SHALL 禁用「采纳标签」「用这张」「用这张并开书」。
7. THE System SHALL 按标签去空白后比较，避免同一标签因空格差异被重复计入或显示为未选中。

### Requirement 7

**User Story:** AS 作者, I want 每个可多选维度最多选 3 个, so that 偏好既够宽又不失控

#### Acceptance Criteria

1. THE System SHALL 允许每个可多选维度（类型、感情线、爽点、主角设定、平台）选择 1 至 3 个选项。
2. WHEN 某个可多选维度已选满 3 个, THE System SHALL 禁用其余未选选项，直到作者取消其中一个。
3. THE System SHALL 保持单选维度（主角、视角、调性、结局、篇幅、节奏）同一时间只能选 1 个。
4. WHEN 并入标签或 `picks` 导致某可多选维度超过 3 个, THE System SHALL 只保留前 3 个。
