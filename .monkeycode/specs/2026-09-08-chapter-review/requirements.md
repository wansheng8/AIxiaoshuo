# Requirements Document

## Introduction

墨枢制作台的「审稿」按番茄网文章节审稿标尺判断本章能不能过：追读欲、黄金三章、钩子、爽点、人设、合规。本地先扫字数和空比喻，再交给模型出可执行改稿清单。做不到的平台后台数据不编。

## Glossary

- **过稿判断**: 过 / 改后过 / 不过。看读者会不会点下一章。
- **黄金三章**: 第1至第3章。要立住人设、核心冲突、金手指兑现和章末钩子。
- **本地审稿标尺**: 后端根据本章正文算出的字数、段长、空比喻、空描写、章首章末摘录，写入模型上下文。
- **审稿报告**: 按固定 Markdown 小节输出的审稿结果，落在当前章上。

## Requirements

### Requirement 1

**User Story:** AS 作者, I want 点「审稿」就按番茄标尺审当前章, so that 我知道这章过不过、改哪里。

#### Acceptance Criteria

1. WHEN 作者在写字台点击「审稿」且本章有正文, THE 墨枢 SHALL 调用内置 Skill `review`，按过稿判断、黄金三章、钩子、爽点、人设、节奏排版、合规、改稿清单、可留处输出。
2. WHEN 本章正文为空, THE 墨枢 SHALL 不调用模型，并提示先写一段再审。
3. WHEN 组装审稿上下文, THE 墨枢 SHALL 附上本地审稿标尺，且模型不得编造完读率、推流或平台后台数据。
4. WHEN 给出过稿判断, THE 墨枢 SHALL 以追读欲为第一标准。

### Requirement 2

**User Story:** AS 作者, I want 审稿结果按卡片展示并记住上次结论, so that 我扫一眼就知道改什么。

#### Acceptance Criteria

1. WHEN 审稿流结束且文本含「### 过稿判断」, THE 制作台 SHALL 把各节拆成卡片，并标过 / 改后过 / 不过。
2. WHEN 审稿成功, THE 墨枢 SHALL 把报告、结论和时间写入当前章，下次打开该章仍能看到上次结论。
3. WHILE 审稿正在生成, THE 制作台 SHALL 以原文流式展示。

### Requirement 3

**User Story:** AS 作者, I want 改稿意见对着原文位置说, so that 我能直接改。

#### Acceptance Criteria

1. WHEN 输出改稿清单, THE 审稿 SHALL 每条包含位置、问题和最小改法，最多 5 条。
2. IF 本地标尺命中空比喻、空描写或超 90 字段, THEN 改稿清单 SHALL 优先覆盖这些命中。
3. WHEN 本章为第1至第3章, THE 审稿 SHALL 单独评估黄金三章是否立住人设、冲突、金手指和钩子。
