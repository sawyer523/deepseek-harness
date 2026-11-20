# 代码设计附录：my-ai-infra SDD 工作台只读插件

[返回技术方案](TECH_DESIGN.md)

> 以下均为设计示意（签名、关键分支与不变量），不是已实现或已测试的证据；实现于 `plugins/mai-spec-workbench/`，验证状态以 [技术方案](TECH_DESIGN.md) §5 任务与 [TEST_PLAN](../test/TEST_PLAN.md) 执行结果为准。沿用 DSH 工具插件语言与抽象（`defineTool`/`ctx.fs`/`ctx.workingDirectory`，参考 `packages/fs/tool-fs/src/read.ts`）。

## 1. 纯解析模块 src/parse-specs.ts（D2）

```ts
/** Feature 目录名判定：NNN-slug（三位编号 + 连字符 + slug）。 */
export const FEATURE_DIR_PATTERN = /^\d{3}-/

/** BRIEF 表格与标题解析结果；字段缺失保持 undefined，由工具层落 unknown 并记 warning。 */
export interface FeatureBrief {
  id?: string
  title?: string
  phase?: string
  profile?: string
  priority?: string
}

/**
 * 解析 BRIEF.md。标题行 `# {id}: {title}`；两列表格行 `| key | value |` 取
 * Phase / Profile / 优先级 三个已知键（其余行忽略）。不抛错：格式异常时返回
 * 可用字段的子集（BR-04 单点宽容）。
 */
export function parseBrief(text: string): FeatureBrief

/** 验收摘要（D4：只计数，不下整体结论）。 */
export type AcceptanceSummary =
  | { status: 'counted'; counts: Record<string, number> }   // 键含 通过/失败/未执行/受阻/待核验，未知值并入 '其他'
  | { status: 'no-results' }                                  // 有 TEST_PLAN 但执行结果节无数据行
// 'no-test-plan' 态由工具层在 TEST_PLAN 产物缺失时直接构造，不经本函数

/**
 * 解析 TEST_PLAN.md 的 `## 执行结果` 节：取节内第一个表格，按表头含「结果」
 * 的列计数。节缺失、无表格或仅表头 → { status: 'no-results' }。未知结果值
 * 计入 counts['其他']，并把去重后的原始值放进第二个返回值供 warning 使用。
 */
export function parseAcceptanceResults(text: string): { summary: AcceptanceSummary; unknownValues: string[] }

/** 行窗口（NFR-01：limit ≤ 2000 行；单行 > 2000 字符截断加 '…'）。 */
export interface SpecWindow {
  path: string
  offset: number
  lines: { number: number; text: string }[]
  totalLines: number
}

/** 窗口化：offset 1-based；offset 超出文件末尾返回空窗口（totalLines 如实）。 */
export function windowLines(text: string, offset: number, limit: number): Pick<SpecWindow, 'offset' | 'lines' | 'totalLines'>
```

**审查问题**：`parseBrief` 对表格的键匹配是否区分大小写（决策：精确匹配模板键名 `Phase`/`Profile`/`优先级`，不做模糊——模板是工具同源产物）；`parseAcceptanceResults` 表头列定位按「结果」精确等值（模板列名 `结果`），跨列容错不做。

## 2. 产物契约 src/mai-layout.ts（D3）

```ts
export type ArtifactId = 'brief' | 'prd' | 'design' | 'test-plan' | 'design-review' | 'code-review'

/** 内置默认路径（FEATURE_LAYOUT.json 缺失时使用；brief 恒定，不受契约影响）。 */
export const DEFAULT_ARTIFACT_PATHS: Record<ArtifactId, string> = {
  brief: 'BRIEF.md',
  prd: 'spec/PRD.md',
  design: 'design/TECH_DESIGN.md',
  'test-plan': 'test/TEST_PLAN.md',
  'design-review': 'review/design_review.md',
  'code-review': 'review/code_review.md',
}

/** FEATURE_LAYOUT.json 契约（与 my-ai-infra 0.0.15 schema 对齐：version 1）。 */
export interface FeatureLayout {
  version: 1
  artifacts: { id: string; path: string; skill?: string }[]
}

/**
 * 解析契约文本。不合法（JSON 损坏 / version !== 1 / artifacts 缺失或含未知
 * id / path 非相对路径）→ 抛 MaiWorkbenchError(MAI_LAYOUT_INVALID)（BR-02
 * fail-loud，绝不静默回退默认）。未知 id 之外的额外字段忽略（向前兼容）。
 */
export function loadLayoutJson(text: string): FeatureLayout

/** 有效契约 → id→path 完整映射（契约未登记的 id 沿用默认路径，brief 恒默认）。 */
export function artifactPaths(layout: FeatureLayout | undefined): Record<ArtifactId, string>
```

**审查问题**：契约未登记某 id 时沿用默认（部分自定义布局合法——my-create-feature 仅在显式修改产物路径时复制契约），还是要求全量登记（决策：沿用默认，与 mai README“存在本目录的 FEATURE_LAYOUT.json 时优先读取它，按 artifacts 中本阶段登记的路径”一致）。

## 3. 错误模型 src/errors.ts

```ts
import { HarnessError } from '@deepseek-ai/dsh-error'

/** 本插件预期失败的稳定 code 集合（BR-03；错误文案见 PRD COPY-01～03 与布局错误）。 */
export const MAI_ERROR_CODES = {
  notFound: 'MAI_SPECS_NOT_FOUND',        // mai-specs/ 缺失（COPY-01）
  featureNotFound: 'MAI_FEATURE_NOT_FOUND', // Feature 不匹配（COPY-02，附候选）
  artifactNotFound: 'MAI_ARTIFACT_NOT_FOUND', // 产物缺失（COPY-03，附已有产物）
  layoutInvalid: 'MAI_LAYOUT_INVALID',     // FEATURE_LAYOUT.json 损坏（D3）
} as const

export class MaiWorkbenchError extends HarnessError {
  constructor(code: MaiErrorCode, message: string) { super(message, code) }
}
```

FsError 等底层错误不包装、原样上抛（保留 provider 的 code 与路径信息）。

## 4. 目录与产物定位（tool-spec-read.ts 内部）

```ts
/** 匹配规则：目录名全等，或输入为纯三位编号且目录名以 `${输入}-` 开头；编号由
 *  init-feature 脚本全局唯一分配，纯编号匹配必唯一。无匹配/多匹配（理论上不可能）
 *  → MAI_FEATURE_NOT_FOUND 并按目录名升序列出候选（COPY-02）。 */
export function matchFeatureDir(names: readonly string[], input: string): string | undefined
```

`mai_features` 扫描侧同用 `FEATURE_DIR_PATTERN` 过滤并按目录名升序输出。

## 5. 工具定义 src/index.ts（骨架）

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'mai-spec-workbench'
export const inject = ['tools', 'fs', 'workingDirectory']

/** 会话 cwd 解析（对齐 tool-fs 的 session-cwd.ts 语义；评审 P1-1 修复）：
 *  exec.agent 存在 → workingDirectory.ensure；否则不携带 cwd（provider 默认目录）。 */
async function sessionResolveOptions(exec: ToolExecution): Promise<{ cwd?: string; signal?: AbortSignal }> {
  const cwd = exec.agent === undefined
    ? undefined
    : await ctx.workingDirectory.ensure(exec.agent, exec.signal)
  return { ...cwd !== undefined ? { cwd } : {}, signal: exec.signal }
}

export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'mai_features',
    description: 'List my-ai-infra SDD features in this session workspace: id, title, phase, profile, priority, which spec artifacts exist, and acceptance-result counts from each TEST_PLAN.',
    parameters: {},  // 无参数（空 schema 合法性为评审 P2-1，实现期验证）
    output: {
      schema: { /* root: string; features: FeatureSummary[]（objects with string fields, artifacts as six booleans, acceptance discriminated by status） */ },
      render: (_args, value) => [{ type: 'text', text: renderFeatures(value) }],
    },
    presentCall: () => ({ card: 'generic', title: 'List SDD features', kind: 'read' }),
    async execute(_args, exec) {
      const root = await ctx.fs.resolve('mai-specs', await sessionResolveOptions(exec))
      const rootInfo = await ctx.fs.stat(root, exec.signal)
      if (rootInfo === undefined) throw new MaiWorkbenchError('notFound', `no mai-specs/ directory under "${root.displayPath}"; run "mai init" first`) // COPY-01（文案随实际解析路径）
      const layout = await readLayoutIfPresent(ctx, root, exec.signal)       // D3：存在即解析，损坏即抛
      const features: FeatureSummary[] = []
      for (const entry of await ctx.fs.listDir(root, exec.signal)) {
        if (entry.type !== 'directory' || !FEATURE_DIR_PATTERN.test(entry.name)) continue
        features.push(await summarizeFeature(ctx, root, entry, artifactPaths(layout), exec.signal))
      }
      features.sort((a, b) => a.id.localeCompare(b.id))
      return { root: ctx.fs.processPath(root), features }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'mai_spec_read',
    description: 'Read one my-ai-infra SDD spec artifact (brief, prd, design, test-plan, design-review, code-review) of a feature by its id, with an optional line window.',
    parameters: {
      feature: { type: 'string', required: true, description: 'Feature id (e.g. "999") or directory name (e.g. "999-mai-spec-workbench").' },
      artifact: { type: 'string', required: true, enum: ['brief', 'prd', 'design', 'test-plan', 'design-review', 'code-review'], description: 'Which spec artifact to read.' },
      offset: { type: 'number', description: '1-based first line to return. Defaults to 1.' },
      limit: { type: 'number', description: 'Maximum lines to return, at most 2000. Defaults to 2000.' },
    },
    output: { schema: { /* SpecWindow 形状 */ }, render: (_args, value) => [{ type: 'text', text: renderWindow(value) }] },
    presentCall: (args) => ({ card: 'generic', title: `Read SDD ${args.feature}/${args.artifact}`, kind: 'read' }),
    async execute(args, exec) {
      const input = validateReadArgs(args) // ToolArgsError：feature 非空、offset/limit 正整数、limit ≤ 2000
      // …定位 mai-specs、匹配目录（§4）、契约解析产物路径、stat 缺失 → COPY-03、readText → windowLines
      return { path: ctx.fs.processPath(target), ...window }
    },
  }))
}
```

**不变量**：两个 execute 均只调用 `ctx.fs` 的 resolve/stat/listDir/readText（只读，BR-01）；所有调用透传 `exec.signal`（NFR-02）；canonical 返回值形状与 output.schema 一致（registry 校验）。

**审查问题**：
1. `summarizeFeature` 中 BRIEF 缺失时是否仍计入列表（决策：计入，全部 unknown + warning"brief missing"——目录名符合 NNN-slug 即视为 Feature，BR-04）。
2. `renderFeatures` 的输出密度（决策：每 Feature 一行摘要 + 验收计数，六产物以存在列表呈现；面向模型的紧凑格式，非人排版）。

## 6. setup.mjs（BR-05）

```js
// 无依赖 Node 脚本：定位自身目录 → 写 cordis.yml（幂等，覆盖式）→ 打印加载命令。
const dir = dirname(fileURLToPath(import.meta.url))
const entry = resolve(dir, 'src/index.ts')
writeFileSync(join(dir, 'cordis.yml'),
  `- insert:\n    - id: mai-spec-workbench\n      name: '${entry}'\n`)
```
