/**
 * The `mai_spec_read` tool: read one SDD spec artifact of one Feature through
 * its semantic address (feature id + artifact kind), with a bounded line
 * window mirroring the built-in `read` tool.
 * @module mai-spec-workbench/tool-spec-read
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-fs'
import { defineTool, ToolArgsError } from '@deepseek-ai/dsh-tools'
import { ARTIFACT_IDS, artifactPaths } from './mai-layout.ts'
import type { ArtifactId } from './mai-layout.ts'
import { FEATURE_DIR_PATTERN, matchFeatureDir, MAX_WINDOW_LINES, windowLines } from './parse-specs.ts'
import type { LineWindow } from './parse-specs.ts'
import { MaiWorkbenchError } from './errors.ts'
import {
  readLayoutContract,
  readWorkspaceFile,
  resolveWorkspacePath,
  resolveWorkspaceRoot,
  workspaceFileExists,
} from './workspace.ts'

/** Canonical `mai_spec_read` value. */
interface SpecReadValue extends LineWindow {
  /** Display path of the read artifact. */
  path: string
}

/** Validated `mai_spec_read` arguments after defaulting. */
interface SpecReadInput {
  feature: string
  artifact: ArtifactId
  offset: number
  limit: number
}

/**
 * Register the `mai_spec_read` tool.
 * @param ctx - plugin context; the registration is an effect of this scope.
 */
export function applySpecReadTool(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'mai_spec_read',
    description:
      'Read one my-ai-infra SDD spec artifact of one feature: brief, prd, design, test-plan, '
      + 'design-review, or code-review. Accepts an optional 1-based line window like the read tool.',
    parameters: {
      feature: {
        type: 'string',
        required: true,
        description: 'Feature reference: the three-digit id (e.g. "999") or directory name (e.g. "999-my-feature").',
      },
      artifact: {
        type: 'string',
        required: true,
        enum: [...ARTIFACT_IDS],
        description: 'Which spec artifact to read.',
      },
      offset: { type: 'number', description: '1-based first line to return. Defaults to 1.' },
      limit: { type: 'number', description: `Maximum lines to return, at most ${MAX_WINDOW_LINES}. Defaults to ${MAX_WINDOW_LINES}.` },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true, description: 'Display path of the read artifact.' },
          offset: { type: 'integer', required: true, description: '1-based first returned line.' },
          lines: {
            type: 'array',
            required: true,
            description: 'Returned lines in file order.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                number: { type: 'integer', required: true, description: '1-based file line number.' },
                text: { type: 'string', required: true, description: 'Line text (long lines truncated).' },
              },
            },
          },
          totalLines: { type: 'integer', required: true, description: 'Total line count of the artifact.' },
        },
      },
      render: (args, value) => [{ type: 'text', text: renderWindow(parseSpecReadArgs(args), value) }],
      presentationMeta: (_args, value) => value,
    },
    presentCall: args => ({
      card: 'generic',
      title: `Read SDD spec ${args.feature}/${args.artifact}`,
      kind: 'read',
    }),
    isConcurrencySafe: () => true,
    async execute(args, exec): Promise<SpecReadValue> {
      const input = parseSpecReadArgs(args)
      const root = await resolveWorkspaceRoot(ctx, exec)
      const layout = await readLayoutContract(ctx, exec)
      const paths = artifactPaths(layout)

      const names = (await ctx.fs.listDir(root, exec.signal))
        .filter(entry => entry.type === 'directory' && FEATURE_DIR_PATTERN.test(entry.name))
        .map(entry => entry.name)
        .sort()
      const dir = matchFeatureDir(names, input.feature)
      if (dir === undefined) {
        throw new MaiWorkbenchError(
          'featureNotFound',
          `feature "${input.feature}" not found; available: ${names.length > 0 ? names.join(', ') : '(none)'}`,
        )
      }

      const relative = `${dir}/${paths[input.artifact]}`
      if (!await workspaceFileExists(ctx, exec, relative)) {
        const present: ArtifactId[] = []
        for (const id of ARTIFACT_IDS) {
          if (await workspaceFileExists(ctx, exec, `${dir}/${paths[id]}`)) present.push(id)
        }
        throw new MaiWorkbenchError(
          'artifactNotFound',
          `artifact "${input.artifact}" of "${dir}" not found; present artifacts: ${present.length > 0 ? present.join(', ') : '(none)'}`,
        )
      }
      const text = await readWorkspaceFile(ctx, exec, relative)
      if (text === undefined) {
        throw new MaiWorkbenchError('artifactNotFound', `artifact "${input.artifact}" of "${dir}" disappeared while reading`)
      }

      const target = await resolveWorkspacePath(ctx, exec, relative)
      const window = windowLines(text, input.offset, input.limit)
      return { path: ctx.fs.processPath(target), ...window }
    },
  }))
}

/**
 * Validate value constraints the schema DSL cannot express and apply defaults
 * (mirrors the built-in read tool's arg handling).
 * @param args - schema-validated raw tool arguments.
 * @returns the validated input with defaulted offset/limit.
 * @throws ToolArgsError on an empty feature string or non-positive/non-integer
 * window values, or a limit above {@link MAX_WINDOW_LINES}.
 */
function parseSpecReadArgs(args: { feature: string; artifact: ArtifactId; offset?: number; limit?: number }): SpecReadInput {
  if (args.feature.trim() === '') throw new ToolArgsError(['feature must be a non-empty string'])
  const offset = args.offset === undefined ? 1 : positiveInteger(args.offset, 'offset')
  const limit = args.limit === undefined ? MAX_WINDOW_LINES : positiveInteger(args.limit, 'limit')
  if (limit > MAX_WINDOW_LINES) throw new ToolArgsError([`limit must be less than or equal to ${MAX_WINDOW_LINES}`])
  return { feature: args.feature.trim(), artifact: args.artifact, offset, limit }
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    throw new ToolArgsError([`${name} must be a positive integer`])
  }
  return value
}

/**
 * Render the window with the built-in read tool's envelope, plus a continuation
 * note when the file continues past the returned window.
 * @param input - validated tool input.
 * @param value - the canonical tool value.
 * @returns the model-facing text block.
 */
function renderWindow(input: SpecReadInput, value: SpecReadValue): string {
  const endLine = value.lines.at(-1)?.number ?? Math.max(0, value.offset - 1)
  const truncated = value.lines.length < input.limit && endLine < value.totalLines
  const note = truncated
    ? `<note>File has ${value.totalLines - endLine} more lines after this window; pass offset ${endLine + 1} to continue</note>\n`
    : ''
  return `${note}<path>${value.path}</path>\n<type>file</type>\n<content>\n${value.lines.map(line => `${line.number}\t${line.text}`).join('\n')}\n</content>`
}
