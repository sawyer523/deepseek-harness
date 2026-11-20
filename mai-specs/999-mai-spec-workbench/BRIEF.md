# 999: my-ai-infra SDD 工作台只读插件

| 项 | 值 |
|---|---|
| Phase | done |
| Profile | standard |
| 优先级 | P1 |
| 负责人 | xiaonan chen |
| 目标日期 | 2026-11-19 |
| 涉及子系统 | plugins/mai-spec-workbench |

## 一句话描述

为 DSH 提供两个只读模型工具：mai_features 列出 mai-specs/ 下各 Feature 的阶段、产物状态与验收摘要，mai_spec_read 按 Feature 与产物类型读取规格文档，覆盖 Feature 导航、规格查看与验收结果展示

## 背景

课程作业要求用 my-ai-infra SDD 流程为 DSH 开发插件。DSH 会话中的模型目前只能用通用 read/glob 工具逐层翻找 mai-specs/ 目录，缺少对 SDD 工作区结构（NNN-slug Feature、BRIEF 的 Phase/Profile、产物默认路径、TEST_PLAN 执行结果表）的感知，Feature 导航与验收状态汇总需要多跳工具调用且易出错

## 关键决策

- 全阶段（PRD→设计→方案评审→测试计划→实现→代码评审→验收）standard 档位走完；两次评审各发现并修复 1 项 P1（非 Agent 派发的 cwd 解析、布局契约移动 brief）。
- out-of-tree 插件（官方 `--patch` 路径）而非 workspace 产品包：作业 fork 不触碰产品包门禁（i18n/Model Experience/constraints），加载经 `setup.mjs` 生成的本机绝对路径 overlay。
- 只读范围：不做流程阶段启动（`mai` CLI 调用）；验收摘要只报计数与缺省态，不输出整体通过结论（对齐 mai 阶段契约"必要项未验证不能给整体通过"）。
- 2026-11-19 验收通过（TC-01～TC-10 + 单测 28/28 + 类型检查），证据见 [test/evidence/](test/evidence/)；ROADMAP 已同步至已完成。

## 上下文索引

- [素材索引](context/_INDEX.md)
- [产品规格](spec/PRD.md)（standard，AC-01～AC-06；有效需求来源）
- [技术方案](design/TECH_DESIGN.md)（standard；[HTML 审阅版](design/TECH_DESIGN.html)；代码附录 [CODE_DESIGN.md](design/CODE_DESIGN.md)）
- [方案评审记录](review/design_review.md)（R1 复评通过，2026-11-19）
- [业务测试计划](test/TEST_PLAN.md)（TC-01～TC-10；独立子任务规划，执行结果待验收回填）
- [代码评审记录](review/code_review.md)（CR-P1-1 修复后 R1 复评通过，2026-11-19）
- 实现：仓库根 `plugins/mai-spec-workbench/`（[README](../../../plugins/mai-spec-workbench/README.md)）
