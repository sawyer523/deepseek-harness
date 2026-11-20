# 业务测试计划：my-ai-infra SDD 工作台只读插件

[返回需求简报](../BRIEF.md)

> Feature：999 | Profile：standard | 模板：项目 `mai-specs/_templates/TEST_PLAN.tmpl.md` | 状态：只规划，未执行

## 范围与依据

- 有效需求来源（预期结果唯一依据）：[spec/PRD.md](../spec/PRD.md)，含 FR-01～FR-03、BR-01～BR-05、NFR-01/02、COPY-01～03、AC-01～AC-06。技术映射参考 [design/TECH_DESIGN.md](../design/TECH_DESIGN.md) 与 [design/CODE_DESIGN.md](../design/CODE_DESIGN.md)（设计示意，不构成预期来源）。
- 待验业务范围：`plugins/mai-spec-workbench` 只读插件的业务结果——两个模型工具（`mai_features`、`mai_spec_read`）在真实模型会话中的概览、读取、三种错误路径与缺省态，FEATURE_LAYOUT 契约覆盖，以及 setup/加载/幂等/不入库（AC-06）。实现细节（解析函数内部、schema 校验、signal 透传）不在本计划展开，见"已有测试覆盖"。
- 验证入口（本机执行事实）：
  - 无 key：`pnpm dsh --profile web --dump-config --patch plugins/mai-spec-workbench/cordis.yml`（组合配置树出现插件行）。
  - 真实会话：仓库根 `.env` 配 `DEEPSEEK_API_KEY` 后 `pnpm dsh --profile headless --patch plugins/mai-spec-workbench/cordis.yml "<自然语言任务>"`，cwd=仓库根。
  - Web UI：`pnpm dsh web --patch plugins/mai-spec-workbench/cordis.yml` 后在 http://127.0.0.1:3080 会话中使用；会话工作区按用例选择（仓库根或临时工作区）。
- 仓库真实样例数据（撰写时点）：`mai-specs/` 下仅 `999-mai-spec-workbench` 一个 `NNN-slug` Feature（`_templates/` 不满足命名，应被忽略）；无 `FEATURE_LAYOUT.json`（走默认产物路径分支）；Feature 999 现存产物 brief/prd/design/design-review，test-plan 即本文（执行结果未回填），code-review 缺失。
- 预期结果全部来自 PRD；实现现状不降低任何验收标准。

## 已有测试覆盖

开发侧覆盖由实施流程负责（[TECH_DESIGN](../design/TECH_DESIGN.md) §2.3.4 / §5 T4）：`plugins/mai-spec-workbench/tests/parse.test.ts`，入口 `node --import tsx/esm --test`（node:test + tsx，非 repo vitest；插件非 workspace 包，CI 不覆盖，T4 与本计划的真实链路证据是仅有的两级证据）。

| 需求 / 业务行为 | 已有测试或入口 | 覆盖范围及结果依据 | 仍需补验的部分 |
|---|---|---|---|
| FR-01/BR-04：BRIEF 解析（正常/缺字段/无标题） | T4 `tests/parse.test.ts`（parseBrief） | 计划内；尚无当前通过证据（实现未开始），以 T4 全绿为准 | 真实模型会话概览输出与真实 BRIEF 文件的对应（TC-02、TC-10） |
| FR-01/AC-02：验收结果表计数与两种缺省态 | T4（parseAcceptanceResults） | 同上 | 真实工作区数据下的缺省态呈现（TC-03） |
| FR-02/NFR-01：行窗口边界（offset 越界、limit 上限、超长行截断） | T4（windowLines） | 同上 | 真实会话读取的路径/行号/totalLines 与实际文件对照（TC-04） |
| BR-02/AC-05：FEATURE_LAYOUT 契约解析（覆盖/损坏/version 不符/未知 id） | T4（loadLayoutJson/artifactPaths，临时目录构造） | 同上 | 契约路径在真实会话工具输出中的生效与整体报错文案（TC-08） |
| FR-02：Feature 目录匹配（精确/纯编号前缀/无匹配） | T4（matchFeatureDir） | 同上 | 错误文案与候选列表的真实会话输出（TC-05） |
| NFR-02：exec.signal 取消透传 | 无 | T4 不含此项 | 开发测试缺口，交实施流程：实现层将 signal 传入全部 ctx.fs 调用并以代码评审/实现侧验证核验（见待确认 #2） |

## 待验业务用例

### TC-01：setup 生成 overlay、dump-config 组合加载与幂等

- 关联需求：AC-06、FR-03、BR-05
- 前提与数据：仓库根执行；`plugins/mai-spec-workbench/cordis.yml` 不存在（已生成则先删除，以近似"干净 checkout"前置）；无需 API key。
- 操作步骤：
  1. `node plugins/mai-spec-workbench/setup.mjs`
  2. `pnpm dsh --profile web --dump-config --patch plugins/mai-spec-workbench/cordis.yml`
  3. 重跑步骤 1，再次执行步骤 2
  4. `git status --porcelain`
- 预期结果：步骤 1 生成 `plugins/mai-spec-workbench/cordis.yml`，插件 `name` 为本机绝对路径（BR-05）；步骤 2 组合配置树中出现 `mai-spec-workbench` 插件行；重跑后文件内容不变、dump-config 仍只出现一个插件行（幂等，不重复插入）；步骤 4 中 `plugins/mai-spec-workbench/cordis.yml` 不出现在未跟踪列表（.gitignore 生效，不入版本库）。
- 验证方式与证据：命令输出与退出码留档；`git status --porcelain` 输出留档。
- 清理：保留 `cordis.yml`（本机后续用例依赖；已被忽略，不影响版本库）。

### TC-02：真实模型会话列出 Feature 概览

- 关联需求：AC-01、FR-01、BR-04
- 前提与数据：`.env` 已配 `DEEPSEEK_API_KEY`；TC-01 已完成；cwd=仓库根（仓库 `mai-specs/` 为真实样例）。
- 操作步骤：
  1. `pnpm dsh --profile headless --patch plugins/mai-spec-workbench/cordis.yml "列出本仓库所有 SDD Feature 的编号、标题、阶段、优先级和验收状态"`
- 预期结果：模型调用 `mai_features` 成功；输出包含 `999-mai-spec-workbench`，其标题、Phase（与执行时点 BRIEF.md 表格当前值一致，撰写时为 draft）、Profile（standard）、优先级（P1）如实呈现；六类产物存在标记与执行时点实际文件一致（撰写时：code-review 缺失、其余五类存在）；验收摘要如实（本计划执行结果回填前为 `no-results` 缺省态，回填后为实际计数）；列表不含 `_templates` 等非 `NNN-slug` 条目；不输出整体"通过/未通过"结论（PRD 待确认事项已决策）。
- 验证方式与证据：headless 会话完整输出留档（含被测版本/commit）；概览各字段与 `mai-specs/999-mai-spec-workbench/BRIEF.md` 实际内容人工对照。
- 清理：无副作用（只读，另见 TC-09）。

### TC-03：验收摘要两种缺省态

- 关联需求：AC-02、FR-01、BR-04
- 前提与数据：临时工作区（如 `/tmp/mai-tc03`）：`mai-specs/001-alpha/BRIEF.md`（无 `test/TEST_PLAN.md`）与 `mai-specs/002-beta/`（`BRIEF.md` + `test/TEST_PLAN.md`，含 `## 执行结果` 节但无数据行）；Web 会话以该临时工作区为工作区。
- 操作步骤：
  1. `pnpm dsh web --patch plugins/mai-spec-workbench/cordis.yml`，在 http://127.0.0.1:3080 新建会话，工作区选临时工作区根
  2. 会话中输入"列出这个工作区的 SDD Feature 和各自的验收状态"
- 预期结果：001 摘要为 `status: "no-test-plan"`，002 为 `status: "no-results"`，均不出现计数字段、不伪造计数；两 Feature 均在列表且按目录名升序（001 在前）。
- 验证方式与证据：Web 会话工具输出截图或导出记录；与临时工作区实际文件对照。
- 清理：删除临时工作区目录。

### TC-04：读取规格文档（默认行号窗口）

- 关联需求：AC-03、FR-02、NFR-01
- 前提与数据：同 TC-02（key、setup、cwd=仓库根）；Feature 999 的 PRD 存在。
- 操作步骤：
  1. `pnpm dsh --profile headless --patch plugins/mai-spec-workbench/cordis.yml "读取 Feature 999 的 PRD，列出它定义的全部验收标准编号"`
  2. `wc -l mai-specs/999-mai-spec-workbench/spec/PRD.md`
- 预期结果：模型以 `feature=999`（或目录名）、`artifact=prd`、默认 offset/limit 调用 `mai_spec_read` 成功；返回路径指向该 Feature 的 `spec/PRD.md`、行号窗口内容与文件实际行一致、`totalLines` 等于实际总行数、默认窗口 ≤2000 行一次读完；模型答复准确列出 AC-01～AC-06。
- 验证方式与证据：会话输出留档；`totalLines` 与 `wc -l` 结果对照；窗口首末行与文件首末行人工抽验。
- 清理：无。

### TC-05：错误路径——Feature 编号不存在（COPY-02）

- 关联需求：AC-04、BR-03、COPY-02
- 前提与数据：同 TC-02；使用一个不存在的编号（如 123）。
- 操作步骤：
  1. `pnpm dsh --profile headless --patch plugins/mai-spec-workbench/cordis.yml "读取 Feature 123 的 PRD"`
- 预期结果：`mai_spec_read` 返回 isError 工具结果（非静默空值），文案为 `feature "123" not found; available: <现有候选逗号分隔列表>`（候选按编号升序，本仓库当前即 `999-mai-spec-workbench`）。
- 验证方式与证据：会话输出留档；文案与 COPY-02 逐字对照（占位符按实际值替换）。
- 清理：无。

### TC-06：错误路径——产物缺失（COPY-03）

- 关联需求：AC-04、BR-03、COPY-03
- 前提与数据：同 TC-02；请求 Feature 999 当时确实缺失的产物（撰写时为 `code-review`，`review/code_review.md` 不存在）。若执行时六产物已齐备，改在 TC-03 同款临时工作区构造缺失产物的 Feature 验证。
- 操作步骤：
  1. `pnpm dsh --profile headless --patch plugins/mai-spec-workbench/cordis.yml "读取 Feature 999 的 code-review"`
- 预期结果：isError 工具结果，文案为 `artifact "code-review" of "999-mai-spec-workbench" not found; present artifacts: <该 Feature 实际存在的 artifact id 列表，按 brief, prd, design, test-plan, design-review, code-review 固定顺序>`（撰写时为 brief/prd/design/design-review/test-plan 中实际存在者；`<matched>` 为实际匹配目录名）。
- 验证方式与证据：会话输出留档；列表与该 Feature 目录实际文件对照；文案与 COPY-03 逐字对照。
- 清理：无。

### TC-07：错误路径——mai-specs 缺失（COPY-01）

- 关联需求：AC-04、BR-03、COPY-01
- 前提与数据：一个不含 `mai-specs/` 的空临时目录作为会话工作目录（headless 启动方式见待确认 #1，或用 Web 会话选该目录）。
- 操作步骤：
  1. 以该目录为会话工作目录发起任务"列出当前工作区的 SDD Feature"
- 预期结果：`mai_features` 返回 isError 工具结果，文案为 `no mai-specs/ workspace found at "<resolved>"; run "mai init" first`，`<resolved>` 为该会话下解析出的 mai-specs 显示路径（本地为 `<会话工作目录>/mai-specs` 绝对路径）；不是空列表或静默成功。（COPY-01 口径 2026-11-19 统一，见 PRD 变更。）
- 验证方式与证据：会话输出留档；文案与 COPY-01 逐字对照。
- 清理：删除临时目录。

### TC-08：FEATURE_LAYOUT.json 契约覆盖与损坏报错

- 关联需求：AC-05、BR-02
- 前提与数据：临时工作区：`mai-specs/FEATURE_LAYOUT.json`（version 1，`artifacts` 将 `prd` 登记到非默认路径如 `docs/product.md`）；`mai-specs/010-layout/BRIEF.md` 与 `mai-specs/010-layout/docs/product.md`（该路径文件存在），不创建 `spec/PRD.md`；Web 会话工作区选该临时工作区根。
- 操作步骤：
  1. 会话输入"列出这个工作区的 SDD Feature 及各产物状态"
  2. 会话输入"读取 Feature 010 的 prd"
  3. 将 `FEATURE_LAYOUT.json` 改为损坏 JSON，再次执行步骤 1
- 预期结果：步骤 1 中 010 的 prd 存在标记按契约路径判定（`docs/product.md` 存在即为 true，不受默认路径文件缺失影响）；步骤 2 返回 `docs/product.md` 的行号窗口内容；步骤 3 两工具整体报错且错误信息指明 `FEATURE_LAYOUT.json` 文件路径，不静默回退默认路径（BR-02 fail-loud）。
- 验证方式与证据：三次会话输出截图/导出；与临时工作区文件对照。损坏分支的完整矩阵（version 不符、未知 id 等）已由 T4 单测覆盖，此处只验真实链路一处活样例。
- 清理：删除临时工作区目录。

### TC-09：只读约束（伴随真实会话用例执行）

- 关联需求：BR-01、FR-01、FR-02
- 前提与数据：与 TC-02/TC-04/TC-10 同批执行；记录执行前 `git status --porcelain` 基线（含已有未跟踪项与实施产生的新文件）。
- 操作步骤：
  1. 真实会话用例执行前：`git status --porcelain`（仓库根）留档
  2. 执行 TC-02、TC-04、TC-10
  3. 再次 `git status --porcelain`；临时工作区用例（TC-03/07/08）后核对目录内文件清单未变
- 预期结果：两次 porcelain 输出一致（工具调用不产生任何新增/修改条目）；临时工作区文件清单与内容不变；全程无任何写、建、删。
- 验证方式与证据：前后 `git status --porcelain` 输出对照留档。
- 清理：无。

### TC-10：端到端用户旅程——一句话任务、两工具完成

- 关联需求：AC-01、AC-03、BF-01、PRD 成功指标（真实模型会话中两个工具各成功完成一次任务）
- 前提与数据：同 TC-02（key、setup、cwd=仓库根）。
- 操作步骤：
  1. 单个 headless 会话一句话："用 mai 工具先列出本仓库的 SDD Feature，然后读取 999 的 PRD，总结它的验收标准"
- 预期结果：同一会话内模型先调用 `mai_features` 成功、后调用 `mai_spec_read`（feature=999、artifact=prd）成功，两跳完成"概览 → 深入"；最终答复同时包含 Feature 清单要素（同 TC-02 预期）与 PRD 验收标准的准确总结（AC-01～AC-06）；不借助通用 read/glob 逐层翻找 mai-specs/ 完成任务。
- 验证方式与证据：完整会话记录留档（作业要求的验收证据）；与 TC-09 的只读对照一并留存。
- 清理：无。

## 待确认与补齐事项

1. **非仓库根 cwd 的 headless 启动方式（影响 TC-07）**：已验证不可行——tsx 的 tsconfig 发现以进程 cwd 为基准，从非仓库根目录按绝对路径启动 `node --import tsx <repo>/apps/cli/src/bin.ts` 时 `@deepseek-ai/*` 回退到 node 解析（构建产物），出现导出不符（如 `FiberState`）；源码启动契约要求 cwd=仓库根（headless 亦无 cwd 参数，会话目录恒为进程 cwd）。TC-07/TC-03/TC-08 按计划用 Web 会话选择临时工作区执行，验收标准不变。
2. **NFR-02（signal 取消）开发测试缺口**：T4 纯函数单测无法覆盖，业务层亦难以稳定触发中途取消；交实施流程在实现层保证 signal 透传全部 ctx.fs 调用，并以代码评审或实现侧验证核验，结果回填时在此引用证据。
3. **TC-06 数据时点依赖**：Feature 999 的产物集随 SDD 流程推进变化（如后续生成 code_review）；执行时选择当时确实缺失的产物，或用临时工作区构造，预期文案标准不变。
4. **TC-02/TC-04 预期中的动态值**：Phase 与验收摘要随 BRIEF/本计划执行结果的回填变化（回填后 999 由 `no-results` 变为实际计数）；执行时以当时文件实际状态判定"如实呈现"，缺省态判定标准本身不变。
5. **Web 用例的浏览器执行约定**：AI 浏览器代跑时按仓库约定使用 `--patch apps/web/tests/pin-browse-picker.overlay.yml` 的目录选择 overlay；人工执行不受影响。

## 执行结果

2026-11-19 执行（验收人：xiaonan chen / 主编排）。被测版本：仓库工作区，基线 commit `ca33fd6843` + 未提交变更（`plugins/mai-spec-workbench/` 全部实现与单测、`.gitignore` 追加、`mai-specs/` 过程产物与证据文件）；环境：macOS / Node v24.21.0 / pnpm 11.28.5 / my-ai-infra 0.0.15 / DEEPSEEK_API_KEY（.env）。真实会话模型走 DeepSeek 官方端点默认模型；TC-03/06/07/08 经 SDK 驱动（`tests/sdk-run.ts`，会话目录指向临时工作区，插件以源码启动加载）。证据文件位于本目录 `evidence/`（tc01～tc10 输出、TC-09 前后 porcelain、单测输出、被测 commit）。

| 用例 / 已有测试引用 | 结果 | 实际观察与证据 | 问题或复验事项 |
|---|---|---|---|
| TC-01 setup/dump-config/幂等/不入库 | 通过 | `setup.mjs` 生成本机绝对路径 overlay；`--dump-config` 组合树出现 `mai-spec-workbench` 插件行（evidence/tc01-dump-config.txt）；重跑幂等；`git check-ignore` 命中、porcelain 无该文件 | 无 |
| TC-02 真实会话 Feature 概览 | 通过 | headless 会话模型一句话调用 `mai_features`；999 的 Phase=draft/Profile=standard/P1、六产物齐全、验收 `no-results` 如实呈现；`_templates` 未出现；未输出整体通过结论（evidence/tc02-output.txt） | Phase/验收值随当时文件状态，如实呈现判定成立 |
| TC-03 验收缺省态 | 通过 | SDK 会话（/tmp 双 Feature 工作区）：001 `no-test-plan`、002 `no-results`，无伪造计数，按目录名升序（evidence/tc03-output.txt） | 无 |
| TC-04 读取规格文档 | 通过 | headless：`mai_spec_read` 返回 PRD 行号窗口与路径，模型准确列出 AC-01～AC-06 及关联需求；`wc -l`=172 ≤ 默认 2000 行一次读完（evidence/tc04-output.txt） | 无 |
| TC-05 Feature 不存在（COPY-02） | 通过 | isError；`feature "123" not found; available: 999-mai-spec-workbench` 逐字命中，候选升序（evidence/tc05-output.txt） | 无 |
| TC-06 产物缺失（COPY-03） | 通过 | SDK 会话（005-partial 仅 brief+prd）：`mai_spec_read{feature:005,artifact:code-review}` → isError `artifact "code-review" of "005-partial" not found; present artifacts: brief, prd` 逐字命中、固定顺序（evidence/tc06-output.txt） | 无 |
| TC-07 mai-specs 缺失（COPY-01） | 通过 | SDK 会话（空目录）：isError `no mai-specs/ workspace found at "/private/tmp/mai-tc07-empty/mai-specs"; run "mai init" first` 逐字命中（evidence/tc07-output.txt） | 无 |
| TC-08 FEATURE_LAYOUT 契约 | 通过 | 步骤 1/2：`mai_features` 按契约判 prd 存在、`mai_spec_read{010,prd}` 返回 `docs/product.md`（非默认 spec/PRD.md）；步骤 3 损坏 JSON → isError `mai-specs/FEATURE_LAYOUT.json is invalid (not valid JSON: …)` 指明文件、无静默回退（evidence/tc08-step12/3-output.txt） | 无 |
| TC-09 只读约束 | 通过 | 真实会话前后 `git status --porcelain` 完全一致（基线=执行后：`.gitignore` M + 三个未跟踪目录）；临时工作区仅证据用、用例后核对删除（evidence/tc09-baseline/postrun-porcelain.txt） | 无 |
| TC-10 端到端旅程 | 通过 | 单 headless 会话一句话：先 `mai_features`（概览）后 `mai_spec_read`（999 PRD），两跳完成并准确总结 AC，未用通用 read/glob 翻找 mai-specs（evidence/tc10-output.txt） | 无 |
| 开发测试（T4 单测） | 通过 | `node --import tsx/esm --test plugins/mai-spec-workbench/tests/parse.test.ts`：28/28 通过（evidence/unit-tests.txt） | 无 |
| 类型检查 | 通过 | `node_modules/.bin/tsc -b plugins/mai-spec-workbench/tsconfig.json` exit 0 | 无 |
| NFR-02 signal 透传 | 待核验 | 静态核验通过（代码评审 CR 报告：全部 ctx.fs 调用携带 exec.signal）；运行中取消未构造稳定复现 | 低风险残留；如需强证据可后续在 SDK 驱动中实现中途取消 |

**范围结论**：本次承诺的全部必要条件（TC-01～TC-10、T4 单测、类型检查）均有当前通过证据，Feature 999 验收通过；未降低任何验收口径。
