# 技术方案评审：my-ai-infra SDD 工作台只读插件

> 评审对象：[design/TECH_DESIGN.md](../design/TECH_DESIGN.md)（含 [CODE_DESIGN.md](../design/CODE_DESIGN.md)） | 需求来源：[spec/PRD.md](../spec/PRD.md) | 评审日期：2026-11-19 | 评审人：xiaonan chen（主编排）

## 总体结论

**有条件通过**。方案与 PRD 的 FR/BR/NFR 对应完整，复用判断（ctx.fs / workingDirectory / defineTool / read 窗口范式）与仓库真实代码一致（已对照 `packages/fs/tool-fs/src/read.ts`、`packages/fs/tool-fs/src/session-cwd.ts`、`packages/session/working-directory/src/index.ts`、`packages/core/tools/src/schema.ts`、`packages/boot/app-boot/src/index.ts`）。发现 1 项 P1（实施前必须修正设计）与 3 项 P2；P1 修复并复评后即可进入实施。

## 关键发现

### P1-1：`exec.agent` 可能为 undefined，cwd 解析必须容忍非 Agent 调用

- **优先级**：P1（重要——错误会在 PTC/非 Agent 派发路径直接抛 TypeError）
- **证据**：`packages/fs/tool-fs/src/session-cwd.ts:21-25` 对 `exec.agent === undefined` 显式分支（返回 `{}`，让 fs provider 用默认目录）；docs/cookbook/adding-a-tool.md 记载 PTC 模式下工具经 `await tools.<name>(args)` 再入执行管线，该路径无会话 Agent。CODE_DESIGN §5 的 execute 骨架写死 `ctx.workingDirectory.ensure(exec.agent, …)` 并注释"agent 必在（模型调用）"，假设不成立。
- **触发条件**：插件经 PTC（run_code）或任何非 Agent 派发执行两工具之一。
- **影响**：`ensure(undefined)` 抛错 → 工具一律 isError，PTC 场景不可用。
- **动作**：照抄 session-cwd.ts 语义——`const cwd = exec.agent === undefined ? undefined : await ctx.workingDirectory.ensure(exec.agent, exec.signal)`，resolve options 仅在 cwd 存在时携带；设计文档 §2.1.2 与 CODE_DESIGN §5 同步修订。
- **状态**：✅ 已修复（见"复评记录 R1"）。

### P2-1：`parameters: {}` 空 schema 的 DSL 合法性待实现期验证

- **证据**：CODE_DESIGN §5 mai_features 使用无键 `parameters: {}`；`packages/core/tools/src/schema.ts` 未逐一核对空对象根的行为（"隐式参数根保持开放"）。
- **影响**：若 DSL 不接受空对象，注册期类型报错。
- **动作**：实现时验证；如不接受则按 defineTool 类型改用其推荐的无参表达（如省略键）。不阻塞设计。
- **状态**：留待 T2 实施验证。

### P2-2：AC-01 措辞含糊（"phase=review 或之后实际值如实呈现"）

- **证据**：spec/PRD.md AC-01 Then 句。
- **影响**：验收口径不唯一。
- **动作**：改为"如实呈现 BRIEF 当前 Phase 值"（AC 意图本就如此）。
- **状态**：✅ 已随 R1 一并修订 PRD AC-01。

### P2-3：逐 Feature 串行读取两文件的容量说明

- **证据**：TECH_DESIGN §3 风险表已列"每目录最多 2 次小文件读"。
- **影响**：数十个 Feature 时 mai_features 变慢（作业场景无感）。
- **动作**：维持现状，不并行化（减法：当前验收与作业规模不要求）。已在风险表记录，无需改设计。
- **状态**：接受现状。

## 减法检查（评审时推演）

- **删 mai_spec_read、只留 mai_features 返回路径**：模型可用内置 `read` 读文件，省一个工具；但丢失"产物类型→契约路径"的语义解析（FEATURE_LAYOUT.json 自定义路径项目会读错文件）与 BR-03 的语义错误输出。PRD FR-02 已确认保留，维持。
- **删 setup.mjs、README 手写绝对路径**：跨机器复制粘贴易错，脚本仅 10 行，保留成本低于出错成本，维持。
- **删 tests/parse.test.ts 进 repo vitest 的设想**：设计已排除（D6），维持独立 runner。
- **加插件 Config（可调上限）**：无当前需求（NFR-01 固定常数已覆盖），删除此可能性，不实现。

## 待验证事项（实施期）

| 事项 | 验证方式 | 关联 |
|---|---|---|
| tsx 对 plugins/ 目录 bare import 的 paths 解析 | AC-06 dump-config + headless 实跑 | D1 |
| enum 参数经 defineTool 校验 | T2 单测/实跑 | §2.1.3 |
| `--patch` 与 headless profile 组合 | AC-01/AC-03 headless 验收 | §5 T6 |

## 结论与下一步

P1 已修复（见下），P2-2 已修订，其余为实施期待验证项：**通过（R1 复评后）**，可进入实施（T1 起）。业务测试缺口：本次 AC 已覆盖两工具主路径与错误路径，测试计划阶段（my-create-test-plan）尚未执行，交编排者安排。

## 复评记录

### R1（2026-11-19）

- **范围**：P1-1、P2-2 修复核验。
- **动作**：TECH_DESIGN §2.1.2 数据流改为"cwd 仅在 exec.agent 存在时经 ensure 解析，否则 resolve 不携带 cwd（provider 默认目录）"；CODE_DESIGN §5 两处 execute 骨架同步为 `sessionCwd(exec)` 辅助并删除"agent 必在"注释；PRD AC-01 Then 句改为"如实呈现 BRIEF 当前 Phase 值"。
- **结论**：修复与 session-cwd.ts 语义一致，**复评通过**。
