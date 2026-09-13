# Requirements Document

## Introduction

墨枢在生成、校对和改写时处理两件质量问题：错别字与情感不足。专有名词从角色卡和设定动态抽出；规则扫描零成本标记；模型校对和情感增强由作者主动触发。

## Glossary

- **专名表**: 当前书的人名、地名、术语、伏笔名，生成时动态插入提示词。
- **词库**: 按作品保存的「始终正确」词与「错→正」映射。
- **情感契约**: 主基调、强度 1-10、表达方式、展示而非告知。
- **问题标记**: 黄色为疑似错字，蓝色为情感平淡。

## Requirements

### Requirement 1

**User Story:** AS 作者, I want 生成时自动带上专名和文字规范, so that 模型少写错人名地名。

#### Acceptance Criteria

1. WHEN 系统组装生成上下文, THE 墨枢 SHALL 从人物卡、场景卡、道具卡、伏笔名和书名抽出至多 24 个专名。
2. WHEN 专名表非空, THE 墨枢 SHALL 把专名和全角标点规范写入核心设定。
3. WHILE 作者在词库中标记某词始终正确, THE 墨枢 SHALL 把该词列入专名表并在规则扫描中跳过。

### Requirement 2

**User Story:** AS 作者, I want 一键扫描本章错字和情感平淡段, so that 我能逐条接受或忽略。

#### Acceptance Criteria

1. WHEN 作者点击校对, THE 墨枢 SHALL 用本地词典和作品词库扫描当前正文并返回位置、原词、建议。
2. WHEN 扫描命中引号内的古语或词库保留词, THE 墨枢 SHALL 跳过该处。
3. WHEN 作者接受一条错字建议, THE 墨枢 SHALL 只替换该处原文并跳到下一条。
4. IF 本地扫描未调用大模型, THE 墨枢 SHALL 在 200ms 量级内返回结果。

### Requirement 3

**User Story:** AS 作者, I want 设定本章情感并在生成后增强平淡段落, so that 正文有可感知的情绪落地。

#### Acceptance Criteria

1. WHEN 作者设定主基调、强度和表达方式, THE 墨枢 SHALL 把情感指令写入下一次生成的核心设定。
2. WHEN 展示而非告知开启, THE 墨枢 SHALL 要求模型用动作、感官、环境或停顿表达情绪。
3. WHEN 作者对选区触发情感增强, THE 墨枢 SHALL 给出动作化、环境化、对话化三个版本供选择。
4. WHEN 大纲板展示某章, THE 墨枢 SHALL 显示该章情绪起点和终点，并允许当场改。
