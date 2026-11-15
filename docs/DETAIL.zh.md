# 越南语技术写作标准（TVKT-100）

本 bundle 为 profile 中的每个 agent 施加一套受控的越南语技术写作标准，并增加一个用于撰写与审校越南语文档的 agent 模式。

## 它改变了什么

**所有模式。** 在 `10150` 位置插入名为 `tvkt-vi:language-contract` 的系统提示段：位于工具说明之后、部署 persona 后缀之前。它要求保留技术标识原文、区分四级规范用语、禁用机翻腔，并要求给未经核实的内容加标签。完全替换 persona 的自定义模式同样会收到这段内容。

**按需加载的规则。** `tvkt-vi` 技能承载 30 条写作规则、70 个术语与 linter 用法。该技能通过 skill provider 注册，正文在每次加载时重新读取，因此修改磁盘上的技能会在下次加载生效，无需重启。

**`tvkt-vi` 模式。** 其 preset 由 `standard` 工具集加 `tool-executor-ptc` 组成，并配以定义草稿、审阅（只报告，不改文件）与重写（先出 diff，批准后应用）三种纪律的 persona。

## 磁盘上的文件

| 路径 | 用途 |
|---|---|
| `skills/tvkt-vi/SKILL.md` | 规则摘要、三种模式、输出契约 |
| `skills/tvkt-vi/references/` | 术语表、对话场景补充 |
| `skills/tvkt-vi/scripts/lint-text.py` | 从标准输入检查一段文字 |
| `vendor/tvkt/` | TVKT-100 v1.0 linter 及其配置 |
| `scripts/check-drift.mjs` | 将 preset 与已安装的 `standard`、`ptc` 对比 |

## 安装后如何验证

在会话中执行 `/skill tvkt-vi`，其基准目录应指向 `node_modules/dsh-tvkt-vi/skills/tvkt-vi`。若指向 `~/.dsh/skills/tvkt-vi`，说明有手工拷贝的技能遮蔽了 bundle 的 provider，应删除该副本。

## 限制

linter 只覆盖 30 条规则中的 7 条，其余需要人工阅读。它按空格计数「tiếng」，复合词会被算作多个单位，因此 30/40 单位阈值只是建议。通过检查并不证明文档在技术上正确。

preset 组成必须跟随已安装 DSH 的 `standard` preset。升级 DSH 后应运行 `check-drift.mjs`；某一行指向被移除的模块会使整个 preset 加载失败。
