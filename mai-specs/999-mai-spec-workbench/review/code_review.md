# 代码评审：my-ai-infra SDD 工作台只读插件

> 评审对象：工作区未提交变更（基线 HEAD `ca33fd6843`，clean） | 范围：`plugins/mai-spec-workbench/`（新增 8 文件）、`.gitignore`（追加忽略）、SDD 产物 `mai-specs/` | 评审日期：2026-11-19 | 评审人：xiaonan chen（主编排）

## 总体结论

**有条件合并（条件已当场闭环）**。发现 1 项 P1（契约违规，已修复并复验）与 2 项 P2（口径同步，已同步）；修复后单元测试 28/28 通过、`tsc -b` 无错误、无 key 验证链（setup → dump-config 组合树 → tsx 模块导入形态）全部通过。真实模型会话验收（TC-02～TC-10）尚未执行，属测试计划既定安排，不构成本评审阻断项。

## 范围与证据

- 比较基线：`git rev-parse HEAD` = ca33fd6843（工作区起点 clean）；`git status --porcelain`：`.gitignore` 修改，`.my-ai-infra.json`、`mai-specs/`、`plugins/` 未跟踪。
- 契约来源：[PRD](../spec/PRD.md)（FR/BR/NFR/AC/COPY）+ [技术方案](../design/TECH_DESIGN.md)/[CODE_DESIGN](../design/CODE_DESIGN.md)（R1 复评通过版）。
- 已执行验证（命令、退出码、观察）：
  1. `node --import tsx/esm --test plugins/mai-spec-workbench/tests/parse.test.ts` → exit 0，28/28 通过（含修复后新增用例）。
  2. `node_modules/.bin/tsc -b plugins/mai-spec-workbench/tsconfig.json` → exit 0。
  3. `node plugins/mai-spec-workbench/setup.mjs` → 生成绝对路径 overlay；`git check-ignore` 命中；重跑幂等。
  4. `pnpm dsh --profile web --dump-config --patch plugins/mai-spec-workbench/cordis.yml` → exit 0，组合树含 `mai-spec-workbench` 插件行（TC-01 通过，待回填）。
  5. `node --import tsx/esm -e "import('<plugin>/src/index.ts')"` → 具名导出 `apply/inject/name`，函数插件形态正确（无 default 导出，符合 packages/AGENTS.md 插件导出规则）。
- 检查限制：真实模型会话路径（含 PTC/非 Agent 派发、`exec.signal` 取消）未执行，静态核对见下；`tsc -b` 会构建被引用的 workspace 项目（已有构建缓存，未产生仓库内新文件，`git status` 复核）。

## 关键发现

### CR-P1-1：布局契约可移动 `brief`，违反"BRIEF.md 恒定"设计决策

- **优先级**：P1（契约违规；已修复）
- **位置**：`plugins/mai-spec-workbench/src/mai-layout.ts` `loadLayoutJson`（修复前行号 ~60，artifacts 循环）
- **机制**：`loadLayoutJson` 接受任意已知 id（含 `brief`）的自定义路径，`artifactPaths` 随即覆盖 brief 映射；而设计（TECH_DESIGN §2.3.2 / CODE_DESIGN §2）明确"`brief` 恒为 BRIEF.md，布局契约不可移动"。触发条件：项目 `FEATURE_LAYOUT.json` 登记 `{"id":"brief","path":"docs/brief.md"}`。影响：`mai_features` 的 brief 存在性判定与 `mai_spec_read` 的 brief 读取指向错误文件，且无任何报错。
- **证据**：修复前代码审查 + 新增单测 `fails loud on brief override`（修复前该输入被接受）。
- **修复**：`loadLayoutJson` 对 `brief` 登记抛 `MAI_LAYOUT_INVALID`（"the contract cannot move brief"）；新增单测。复验：28/28 通过。
- **状态**：✅ 已修复并复验。

### CR-P2-1：COPY-03 文案 `<feature>` 占位符口径不一致

- **优先级**：P2（文档口径；已同步）
- **位置**：`tool-spec-read.ts` 错误消息使用实际匹配的目录名（`999-mai-spec-workbench`），PRD/TEST_PLAN 原表述暗示回显输入（`999`）。
- **动作**：以实现为准（目录名信息更完整、无歧义），PRD COPY-03 变量说明与 TC-06 预期已同步为"实际匹配到的 Feature 目录名"。
- **状态**：✅ 已同步。

### CR-P2-2：表格单元格内转义竖线（`\|`）会错位计数

- **优先级**：P2（接受现状，记录边界）
- **机制**：`splitTableRow` 按裸 `|` 切分；Markdown 转义竖线会被切开，导致结果列取值错位。触发条件：TEST_PLAN 执行结果表单元格内容本身含 `\|`。影响：该行计入"其他"并出现在 warning 中（诚实降级，不静默丢数）。当前模板与实际数据不含该形态。
- **动作**：不改（解析器保持极简；降级路径已有 warning 呈现）。后续如真实数据出现，再按需支持转义。
- **状态**：接受现状（BR-4 宽容语义已覆盖降级）。

## 对照契约的覆盖核对（摘要）

- FR-01/BR-04：单 Feature 宽容（BRIEF 缺失 → unknown + warning，不中断列表）✓；`_templates` 等非 `NNN-slug` 目录被 `FEATURE_DIR_PATTERN` 过滤 ✓。
- FR-02/NFR-01：offset/limit 默认 1/2000、上限校验（ToolArgsError）、单行 2000 字符截断加 `…`、越界空窗口带真实 totalLines ✓（单测覆盖）。
- BR-01：两工具只调用 resolve/stat/listDir/readText；无任何写 API ✓（静态核对 + TC-09 将做前后对照）。
- BR-02：契约损坏/version/未知 id/重复 id/绝对路径/brief 移动全部 fail-loud（10+ 种无效输入单测）✓；未登记产物沿用默认路径 ✓。
- BR-03/COPY-01～03：三个错误路径消息与 PRD 逐字一致（口径统一后）✓。
- NFR-02（signal）：全部 `ctx.fs` 调用透传 `exec.signal`（静态核对各调用点）；运行中取消未实测，测试计划待确认 #2 已登记由实现层保证 + 评审核验——本评审核验通过（`workspace.ts` 与两工具 execute 的每个 fs 调用均携带 `exec.signal`）。
- 评审 P1-1（设计评审遗留）：`sessionResolveOptions` 与 `dsh-tool-fs/src/session-cwd.ts` 语义一致（agent 缺省 → 无 cwd）✓；`parameters: {}` 空 schema 合法性已由 DSL 源码（`compilePropertyMap` 空对象 → 空 properties）与 dump-config 注册路径双重确认 ✓。

## 待验证事项（交验收阶段，测试计划已排期）

| 事项 | 完成条件 |
|---|---|
| TC-02/04/05/06/10：真实模型会话（headless，仓库根） | TEST_PLAN 执行结果表回填证据 |
| TC-03/07/08：Web 会话临时工作区（含 COPY-01 与布局覆盖/损坏活样例） | 同上（TC-07 的非仓库根 headless 已证实不可行，走 Web 兜底） |
| TC-09：只读前后对照 | `git status --porcelain` 前后一致留档 |

## 其他建议（非阻断）

- `mai_spec_read` 对同一产物路径 resolve 三次（exists/read/processPath）。正确性无虞；如后续 cares 可在 workspace.ts 合并 stat+read。当前规模不值得改。

## 复评记录

### R1（2026-11-19）

- CR-P1-1 修复核验：`loadLayoutJson` 拒绝 brief 登记（错误消息含 "contract cannot move"），单测 `fails loud on brief override` 通过；CR-P2-1 文档同步完成。**复评通过**，条件闭环，可进入验收执行。
