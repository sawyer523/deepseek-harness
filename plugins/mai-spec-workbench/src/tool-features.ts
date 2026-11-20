/**
 * The `mai_features` tool: SDD Feature navigation. One call lists every
 * `NNN-slug` Feature under the session's `mai-specs/` workspace with its
 * BRIEF state, per-artifact existence, and acceptance-result counts.
 * @module mai-spec-workbench/tool-features
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-fs'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { ARTIFACT_IDS, artifactPaths } from './mai-layout.ts'
import type { ArtifactId } from './mai-layout.ts'
import { FEATURE_DIR_PATTERN, parseAcceptanceResults, parseBrief } from './parse-specs.ts'
import type { AcceptanceCount } from './parse-specs.ts'
import {
  readLayoutContract,
  readWorkspaceFile,
  resolveWorkspaceRoot,
  workspaceFileExists,
} from './workspace.ts'

/** Canonical summary of one Feature (the `features[]` item of the tool value). */
export interface FeatureSummary {
  /** Feature directory name (`NNN-slug`). */
  id: string
  /** BRIEF title, or the directory name when the brief is unparsed. */
  title: string
  /** BRIEF `Phase`, or `unknown` when missing/unparseable. */
  phase: string
  /** BRIEF `Profile`, or `unknown` when missing/unparseable. */
  profile: string
  /** BRIEF `优先级`, or `unknown` when missing/unparseable. */
  priority: string
  /** Existence of each artifact kind inside the Feature directory. */
  artifacts: Record<ArtifactId, boolean>
  /** Acceptance tally from TEST_PLAN's 执行结果 table, or its absence. */
  acceptance: { status: 'counted' | 'no-test-plan' | 'no-results'; counts?: AcceptanceCount[] }
  /** Honest notes about missing or unparsable inputs (BR-04). */
  warnings: string[]
}

/** Canonical `mai_features` value. */
export interface FeaturesValue {
  /** Display path of the resolved `mai-specs/` workspace. */
  root: string
  /** Feature summaries sorted by directory name. */
  features: FeatureSummary[]
}

/**
 * Register the `mai_features` tool.
 * @param ctx - plugin context; the registration is an effect of this scope.
 */
export function applyFeaturesTool(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'mai_features',
    description:
      'List my-ai-infra SDD features in this session workspace. Returns each feature\'s id, title, '
      + 'phase, profile, priority, which spec artifacts (brief, prd, design, test-plan, '
      + 'design-review, code-review) exist, and acceptance-result counts from its TEST_PLAN. '
      + 'Use mai_spec_read to read one artifact.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          root: { type: 'string', required: true, description: 'Display path of the mai-specs/ workspace.' },
          features: {
            type: 'array',
            required: true,
            description: 'Feature summaries sorted by directory name.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true, description: 'Feature directory name (NNN-slug).' },
                title: { type: 'string', required: true, description: 'BRIEF title or the directory name.' },
                phase: { type: 'string', required: true, description: 'BRIEF Phase or "unknown".' },
                profile: { type: 'string', required: true, description: 'BRIEF Profile or "unknown".' },
                priority: { type: 'string', required: true, description: 'BRIEF priority or "unknown".' },
                artifacts: {
                  type: 'object',
                  required: true,
                  additionalProperties: false,
                  description: 'Existence of each artifact kind.',
                  properties: {
                    brief: { type: 'boolean', required: true },
                    prd: { type: 'boolean', required: true },
                    design: { type: 'boolean', required: true },
                    'test-plan': { type: 'boolean', required: true },
                    'design-review': { type: 'boolean', required: true },
                    'code-review': { type: 'boolean', required: true },
                  },
                },
                acceptance: {
                  type: 'object',
                  required: true,
                  additionalProperties: false,
                  description: 'Acceptance tally or its absence; counts exist only when status is "counted".',
                  properties: {
                    status: {
                      type: 'string',
                      required: true,
                      enum: ['counted', 'no-test-plan', 'no-results'],
                      description: 'Whether results were counted, no TEST_PLAN exists, or it has no results yet.',
                    },
                    counts: {
                      type: 'array',
                      description: 'Result tallies (通过/失败/未执行/受阻/待核验/其他).',
                      items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                          result: { type: 'string', required: true },
                          count: { type: 'integer', required: true },
                        },
                      },
                    },
                  },
                },
                warnings: {
                  type: 'array',
                  required: true,
                  description: 'Honest notes about missing or unparsable inputs.',
                  items: { type: 'string' },
                },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderFeatures(value) }],
    },
    presentCall: () => ({ card: 'generic', title: 'List SDD features', kind: 'read' }),
    isConcurrencySafe: () => true,
    async execute(_args, exec): Promise<FeaturesValue> {
      const root = await resolveWorkspaceRoot(ctx, exec)
      const layout = await readLayoutContract(ctx, exec)
      const paths = artifactPaths(layout)
      const features: FeatureSummary[] = []
      for (const entry of await ctx.fs.listDir(root, exec.signal)) {
        if (entry.type !== 'directory' || !FEATURE_DIR_PATTERN.test(entry.name)) continue
        features.push(await summarizeFeature(ctx, exec, entry.name, paths))
      }
      features.sort((a, b) => a.id.localeCompare(b.id))
      return { root: ctx.fs.processPath(root), features }
    },
  }))
}

/**
 * Build one Feature summary: parse its BRIEF, stat each artifact, and tally
 * acceptance results. Failures degrade to warnings on the item (BR-04).
 * @param ctx - plugin context providing the filesystem service.
 * @param exec - the current tool execution.
 * @param name - Feature directory name.
 * @param paths - workspace-wide artifact path mapping.
 * @returns the summary with honest fallbacks for missing inputs.
 */
async function summarizeFeature(
  ctx: Context,
  exec: ToolRunContext,
  name: string,
  paths: Record<ArtifactId, string>,
): Promise<FeatureSummary> {
  const warnings: string[] = []
  const briefText = await readWorkspaceFile(ctx, exec, `${name}/${paths.brief}`)
  const brief = briefText === undefined ? {} : parseBrief(briefText)
  if (briefText === undefined) warnings.push('BRIEF.md missing')
  else if (brief.id === undefined || brief.phase === undefined) warnings.push('BRIEF.md heading or table unparsed')

  const artifacts = {} as Record<ArtifactId, boolean>
  for (const id of ARTIFACT_IDS) {
    artifacts[id] = id === 'brief'
      ? briefText !== undefined
      : await workspaceFileExists(ctx, exec, `${name}/${paths[id]}`)
  }

  let acceptance: FeatureSummary['acceptance']
  if (!artifacts['test-plan']) {
    acceptance = { status: 'no-test-plan' }
  } else {
    const planText = await readWorkspaceFile(ctx, exec, `${name}/${paths['test-plan']}`)
    const { summary, unknownValues } = parseAcceptanceResults(planText ?? '')
    if (unknownValues.length > 0) warnings.push(`unknown result values counted under 其他: ${unknownValues.join(', ')}`)
    acceptance = summary.status === 'counted' ? summary : { status: summary.status }
  }

  return {
    id: name,
    title: brief.title ?? name,
    phase: brief.phase ?? 'unknown',
    profile: brief.profile ?? 'unknown',
    priority: brief.priority ?? 'unknown',
    artifacts,
    acceptance,
    warnings,
  }
}

/**
 * Render the feature list as compact model-facing text.
 * @param value - the canonical tool value.
 * @returns one summary block per feature.
 */
function renderFeatures(value: FeaturesValue): string {
  if (value.features.length === 0) {
    return `no SDD features found under ${value.root}`
  }
  const lines = [`SDD features under ${value.root} (${value.features.length})`]
  for (const feature of value.features) {
    const present = ARTIFACT_IDS.filter(id => feature.artifacts[id])
    const acceptance = feature.acceptance.status === 'counted' && feature.acceptance.counts !== undefined
      ? `acceptance: ${feature.acceptance.counts.map(({ result, count }) => `${result} ${count}`).join(' / ')}`
      : `acceptance: ${feature.acceptance.status}`
    lines.push(
      `- ${feature.id} [Phase: ${feature.phase}, Profile: ${feature.profile}, ${feature.priority}] ${feature.title}`,
      `    artifacts: ${present.join(', ')}`,
      `    ${acceptance}`,
      ...feature.warnings.map(warning => `    warning: ${warning}`),
    )
  }
  return lines.join('\n')
}
