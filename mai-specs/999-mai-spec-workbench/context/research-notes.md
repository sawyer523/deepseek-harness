# 调研笔记：DSH 插件机制与 mai-specs/ 工作区结构（2026-11-19）

来源：DSH 仓库源码与官方教程文档通读 + @easyuseai/my-ai-infra@0.0.15 npm 包内模板/skill 源码实证。

## 1. my-ai-infra SDD 工作区（mai-specs/）实证结构

来源：npm tarball 内 `templates/mai-specs/`、`assets/skills/my-create-feature/`（SKILL.md、template/、references/FEATURE_PROFILES.json、references/stage-contracts.md）。

- 根级文件：`README.md`（工作区规范说明）、`ROADMAP.md`（需求路线图，`规划中/进行中/已完成` 三节，每节表格列为 `需求|标题|规格|优先级|说明`）、`_templates/`（PRD/TECH_DESIGN/TEST_PLAN 骨架，含 simple/ 子目录）、可选 `FEATURE_LAYOUT.json`（自定义产物路径契约）。
- Feature 目录：`NNN-<slug>/`，编号由 my-create-feature 初始化脚本从 999 递减分配，跳过已占用编号。
- 初始文件：`BRIEF.md`、`context/_INDEX.md`（素材索引）。
- `BRIEF.md` 结构：一级标题 `# {FEATURE_ID}: {TITLE}`；表格行含 `Phase`（draft/ready/dev/review/done）、`Profile`（simple/standard）、`优先级`、`负责人`、`目标日期`、`涉及子系统`。
- 产物默认路径（FEATURE_LAYOUT.json 缺省时）：`spec/PRD.md`（prd）、`design/TECH_DESIGN.md`（design）、`test/TEST_PLAN.md`（test-plan）、`review/design_review.md`（design-review）、`review/code_review.md`（code-review）；目录按需创建。
- `TEST_PLAN.md` 内置 `## 执行结果` 表格，`结果` 列取值：`通过/失败/未执行/受阻/待核验`——验收状态摘要的数据源。
- Profile 注册表：`references/FEATURE_PROFILES.json`，default 为 standard。
- `mai` CLI：`init [--project] [--tools claudecode,...] [--yes] [--dry-run]`、`doctor`、`sync`、`catalog`、`web` 等；Node >= 22。

## 2. DSH 插件与工具机制

来源：`docs/user/develop/basic/index.md`、`docs/user/develop/basic/tool.md`、`docs/cookbook/adding-a-tool.md`、`packages/fs/tool-fs/src/read.ts`、`packages/fs/fs/src/{index,types}.ts`、`packages/session/working-directory/src/index.ts`、`packages/boot/app-boot/src/index.ts`、根 `tsconfig.base.json`。

- out-of-tree 插件（官方教程路径）：插件是导出 `name`/`inject`/`apply(ctx)` 的 TS 模块；通过 `--patch <overlay.yml>` 插入配置树，overlay 行 `- insert: - id: <id> name: '<绝对路径>/src/index.ts'`。overlay 内相对路径不可用（loader 相对 profile 目录解析，非 patch 文件目录），需 setup 脚本生成本机绝对路径。
- 源码启动 `pnpm dsh <profile>` = `node --import tsx/esm apps/cli/src/bin.ts`；bare import（`@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools` 等）经根 tsconfig.base.json 的 `paths` 解析到 `packages/*/src` 与 `vendor/`，out-of-tree 目录内的源码同样可用。
- 工具注册：`ctx.tools.register(defineTool({ name, description, parameters, output: { schema, render, presentationMeta? }, execute(args, exec), presentCall?, presentResult? }))`；`defineTool`/`ToolArgsError` 来自 `@deepseek-ai/dsh-tools`。execute 返回 canonical JSON（受 output.schema 校验），render 转模型可见文本；预期失败抛带稳定 code 的错误。
- 会话工作目录：`ctx.workingDirectory.ensure(exec.agent, exec.signal)` 返回会话 cwd（`@deepseek-ai/dsh-working-directory`）。
- 文件访问统一走 `ctx.fs`（`@deepseek-ai/dsh-fs`）：`resolve(path, {cwd, signal})` → FsTarget、`stat(target, signal)`、`listDir(target, signal)` → FsDirEntry[]（name/type/target）、`readText(target, signal)`、`processPath(target)`；FsError 带 `FS_NOT_FOUND` 等 code。经 provider 执行（本地/沙箱/SSH 一致）。
- 卡片：presentCall/presentResult 为纯函数，返回 generic/read/search/terminal/diff 等 card 意图；不实现则回退通用卡片。
- 已有会话内 cwd=启动目录（headless 一次跑）或用户在 Web 选择的工作区根。

## 3. 环境事实

- 仓库：`/Users/cxn/go/src/sawyer523/deepseek-harness`（fork，master 干净基线）；Node v24.21.0；corepack pnpm 11.28.5；`pnpm install` 已完成；`.env` 需用户写入 DEEPSEEK_API_KEY（真实模型验收用）。
- `mai init --tools claudecode --yes` 已完成：`.claude/skills -> ../.agents/skills` 软链，my-* skills 就位；`.gitignore` 已被 mai 追加其资产忽略块。
- 已知冲突：mai 的规则文件模型要求根 AGENTS.md/CLAUDE.md 软链到 gitignored `.agents/rules/`，与 DSH 仓库自身约定（AGENTS.md 为真实提交文件、CLAUDE.md→AGENTS.md）冲突；已恢复 DSH 原布局，`mai doctor` 会因此报 rules 条目，属预期偏差（README 说明）。
- 仓库门禁（entrypoints/vitest/constraints）扫描 `packages/**`、`apps/**`；根级 `plugins/` 目录不触发 workspace 约束。
