# 素材索引 — 999

| 文件 | 类型 | 来源与原名 | 关键内容摘要 | 收集日期 | 派生自 |
|---|---|---|---|---|---|
| [research-notes.md](./research-notes.md) | md | 开发前调研：DSH 仓库源码/官方教程通读 + my-ai-infra@0.0.15 包内模板与 skill 源码实证 | mai-specs/ 实证结构（Feature 目录、BRIEF 字段、产物默认路径、TEST_PLAN 执行结果表）、DSH out-of-tree 插件与工具注册机制（ctx.tools/ctx.fs/workingDirectory、--patch overlay、tsconfig paths）、环境事实与已知冲突 | 2026-11-19 | — |

## 关键发现

- mai-specs/ 的 Feature 目录为 NNN-slug，BRIEF.md 表格携带 Phase/Profile/优先级等状态，产物默认路径固定且可被项目级 FEATURE_LAYOUT.json 覆盖
- TEST_PLAN.md 的『执行结果』表（结果列：通过/失败/未执行/受阻/待核验）是验收状态摘要的可靠数据源
- DSH 官方支持 out-of-tree 插件经 --patch overlay 加载，源码启动下 bare 包名经根 tsconfig paths 解析，无需把插件注册为 workspace 包
- 工具经 ctx.fs provider 读写文件并用 ctx.workingDirectory.ensure(exec.agent) 取会话 cwd，天然兼容本地/沙箱/SSH 执行世界
- overlay 中插件路径必须绝对路径，跨机器不可移植，需要 setup 脚本按本机生成

## 开放问题

- mai_features 列表输出中验收摘要的粒度（仅计数还是含逐用例行）留待 PRD 确定
- mai_spec_read 是否需要 offset/limit 窗口参数（对齐内置 read 习惯）留待 PRD 确定
