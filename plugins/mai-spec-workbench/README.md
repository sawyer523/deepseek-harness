# mai-spec-workbench —— my-ai-infra SDD 工作台只读插件

DeepSeek Harness（DSH）插件，为会话中的模型提供两个**只读**工具，直接感知
[my-ai-infra](https://github.com/shanggqm/my-ai-infra) SDD 工作区（`mai-specs/`）的结构：

| 工具 | 功能 |
|---|---|
| `mai_features` | **Feature 导航 + 验收结果展示**：一次调用列出工作区所有 Feature（`NNN-slug` 目录）的编号、标题、Phase、Profile、优先级、六类规格产物（brief/prd/design/test-plan/design-review/code-review）的存在状态，以及各自 `TEST_PLAN.md` 执行结果表的计数摘要（通过/失败/未执行/受阻/待核验；无计划或未回填时如实显示缺省态） |
| `mai_spec_read` | **规格文档查看**：按语义地址（Feature 编号或目录名 + 产物类型）读取规格文档，支持可选的 1-based 行窗口（`offset`/`limit`，默认最多 2000 行），遵循项目级 `FEATURE_LAYOUT.json` 产物路径契约 |

两个工具均经 DSH 的 `ctx.fs` 服务读取（本地/沙箱/SSH 执行世界一致）、从会话工作目录解析 `mai-specs/`，不写任何文件。本仓库自身的 `mai-specs/999-mai-spec-workbench/` 即该插件的 SDD 过程产物（自演示样例）。

## 环境

- **Node.js ≥ 24.9**（本插件在 Node 24 上开发验证；仓库根 `package.json` 要求）
- **pnpm 11.28.5**（仓库 `packageManager` 声明；未安装时 `corepack enable`）
- **DSH 源码仓库**：本插件目录必须位于 DSH 仓库 checkout 内（源码启动经根
  `tsconfig.base.json` 的 `paths` 解析 `@deepseek-ai/*` 导入）
- **my-ai-infra ≥ 0.0.15**（可选；仅当你要在自己的项目里 `mai init` 建立 SDD 工作区时需要。
  本仓库已初始化，无需重复执行）
- 真实模型会话需要 DeepSeek API Key（见下）

## 安装与配置

```sh
# 1) 安装依赖并构建（仓库根执行；首次约需数分钟）
pnpm install
pnpm run build

# 2) （可选）安装 my-ai-infra 并初始化 SDD 工作区（Node ≥ 22）
npm install --global @easyuseai/my-ai-infra
mai init --tools claudecode --yes   # 本仓库已完成，可跳过
mai doctor                          # 健康检查

# 3) 配置模型凭据：仓库根创建 .env（已被 .gitignore 忽略，不会提交）
echo 'DEEPSEEK_API_KEY=sk-你的key' > .env
# 使用非官方端点时再加：echo 'DEEPSEEK_BASE_URL=https://你的端点' >> .env

# 4) 生成本机加载 overlay（loader 要求绝对路径，脚本按本机生成；幂等）
node plugins/mai-spec-workbench/setup.mjs
```

`setup.mjs` 生成的 `cordis.yml` 是本机文件，已被 `.gitignore` 忽略。

## 启动

```sh
# Web UI（浏览器打开 http://127.0.0.1:3080；新建会话时工作区选本仓库根）
pnpm dsh web --patch plugins/mai-spec-workbench/cordis.yml

# 或一次性 headless 任务（会话工作目录 = 仓库根，恰好读到本仓库的 mai-specs/）
pnpm dsh --profile headless --patch plugins/mai-spec-workbench/cordis.yml \
  "用 mai 工具先列出本仓库的 SDD Feature，然后读取 999 的 PRD，总结它的验收标准"
```

在任意自己的项目里使用：把该项目的会话工作目录指到含有 `mai-specs/` 的项目根即可（Web
会话选择工作区，或从该项目目录启动 headless），无需改插件。

## 验证

```sh
# 1) 单元测试（纯解析函数：BRIEF/验收表解析、行窗口、布局契约、目录匹配）
node --import tsx/esm --test plugins/mai-spec-workbench/tests/parse.test.ts

# 2) 类型检查（按 workspace 包同款 project references）
node_modules/.bin/tsc -b plugins/mai-spec-workbench/tsconfig.json

# 3) 组合配置树出现插件行（无需 API key）
pnpm dsh --profile web --dump-config --patch plugins/mai-spec-workbench/cordis.yml | grep mai-spec-workbench

# 4) 真实模型会话（需 .env 里的 key）——见上面 headless 示例；
#    预期模型先调 mai_features（返回 999 的阶段/产物/验收摘要）再调 mai_spec_read
```

验收记录与证据见 `mai-specs/999-mai-spec-workbench/test/TEST_PLAN.md` 的"执行结果"表。

## 错误行为（fail loud，不静默）

- 会话工作目录没有 `mai-specs/`：`MAI_SPECS_NOT_FOUND`，提示先运行 `mai init`
- Feature 编号/目录名不匹配：`MAI_FEATURE_NOT_FOUND`，按编号序列出现有候选
- 请求的产物尚未生成：`MAI_ARTIFACT_NOT_FOUND`，列出该 Feature 实际存在的产物
- `mai-specs/FEATURE_LAYOUT.json` 存在但损坏：`MAI_LAYOUT_INVALID`，指明该文件，不回退默认路径

## SDD 过程产物

本插件按 my-ai-infra 的 SDD 流程开发，全部过程文档随仓库提交：

| 阶段 | 产物 |
|---|---|
| 需求 | [BRIEF.md](../../mai-specs/999-mai-spec-workbench/BRIEF.md) · [context/](../../mai-specs/999-mai-spec-workbench/context/)（调研素材） |
| 产品规格 | [spec/PRD.md](../../mai-specs/999-mai-spec-workbench/spec/PRD.md) |
| 技术方案 | [design/TECH_DESIGN.md](../../mai-specs/999-mai-spec-workbench/design/TECH_DESIGN.md) · [代码附录](../../mai-specs/999-mai-spec-workbench/design/CODE_DESIGN.md) · [HTML 审阅版](../../mai-specs/999-mai-spec-workbench/design/TECH_DESIGN.html) |
| 方案评审 | [review/design_review.md](../../mai-specs/999-mai-spec-workbench/review/design_review.md)（R1 复评通过） |
| 测试计划 | [test/TEST_PLAN.md](../../mai-specs/999-mai-spec-workbench/test/TEST_PLAN.md)（TC-01～TC-10） |
| 代码评审 | [review/code_review.md](../../mai-specs/999-mai-spec-workbench/review/code_review.md) |
| 验收 | TEST_PLAN.md 执行结果表 |

## 已知说明

- `mai doctor` 会报 `.agents/rules/` 相关条目：my-ai-infra 期望接管根
  `AGENTS.md`/`CLAUDE.md`（软链到其管理的目录），而 DSH 仓库约定这两个文件是仓库自有
  提交文件。本仓库保留 DSH 原布局，SDD 工作区（`mai-specs/`、skills）功能不受影响。
- 插件不在 pnpm workspace 内、不受仓库 CI 门禁覆盖；质量由上述单测与 TEST_PLAN 的
  真实会话验收保证（见 TEST_PLAN"已有测试覆盖"）。
